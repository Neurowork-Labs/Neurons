/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { MongoClient } from 'mongodb';

export type MongoConnectionParams = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  sslMode: 'disable' | 'required' | 'verify_ca' | 'verify_identity';
  sslCaPem?: string | null;
  useSrv?: boolean;
};

type FieldInfo = {
  path: string;
  types: string[];
};

export type MongoSchemaSnapshot = {
  dialect: 'mongodb';
  database: string;
  collections: Array<{
    name: string;
    estimatedDocumentCount: number | null;
    indexes: Array<{ name: string; key: Record<string, number | string>; unique: boolean }>;
    validator: Record<string, unknown> | null;
    fields: FieldInfo[];
  }>;
  fetchedAt: string;
};

function escapeMongoUriPart(v: string): string {
  return encodeURIComponent(v);
}

function shouldUseSrv(params: MongoConnectionParams): boolean {
  if (params.useSrv === true) return true;
  const host = params.host.trim().toLowerCase();
  return host.endsWith('.mongodb.net') && !host.includes(':');
}

function buildMongoUri(params: MongoConnectionParams): string {
  const auth = `${escapeMongoUriPart(params.user)}:${escapeMongoUriPart(params.password)}@`;
  const dbPath = `/${escapeMongoUriPart(params.database)}`;
  if (shouldUseSrv(params)) {
    return `mongodb+srv://${auth}${params.host}${dbPath}`;
  }
  return `mongodb://${auth}${params.host}:${params.port}${dbPath}`;
}

function buildRedactedMongoUri(params: MongoConnectionParams): string {
  const user = escapeMongoUriPart(params.user);
  const dbPath = `/${escapeMongoUriPart(params.database)}`;
  if (shouldUseSrv(params)) {
    return `mongodb+srv://${user}:***@${params.host}${dbPath}`;
  }
  return `mongodb://${user}:***@${params.host}:${params.port}${dbPath}`;
}

function buildMongoClient(params: MongoConnectionParams, timeoutMs: number): MongoClient {
  const uri = buildMongoUri(params);
  console.info('[mongodb-introspect] creating mongo client from credentials', {
    host: params.host,
    port: params.port,
    database: params.database,
    username: params.user,
    sslMode: params.sslMode,
    useSrv: shouldUseSrv(params),
    uri: buildRedactedMongoUri(params),
  });
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: timeoutMs,
    tls: params.sslMode !== 'disable',
    tlsAllowInvalidCertificates: params.sslMode === 'required',
    tlsAllowInvalidHostnames: params.sslMode === 'required',
    ca: params.sslCaPem?.trim() ? [params.sslCaPem.trim()] : undefined,
  });
  return client;
}

function bsonValueType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  if (typeof v === 'object') return 'object';
  return typeof v;
}

function collectFieldTypes(input: unknown, prefix: string, out: Map<string, Set<string>>) {
  const key = prefix || '$root';
  const type = bsonValueType(input);
  if (!out.has(key)) out.set(key, new Set<string>());
  out.get(key)!.add(type);

  if (Array.isArray(input)) {
    for (const item of input) {
      collectFieldTypes(item, `${key}[]`, out);
    }
    return;
  }

  if (input && typeof input === 'object' && !(input instanceof Date)) {
    const obj = input as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      collectFieldTypes(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
}

function normalizeFieldTypes(fieldTypes: Map<string, Set<string>>): FieldInfo[] {
  return [...fieldTypes.entries()]
    .map(([path, types]) => ({ path, types: [...types.values()].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function formatMongoConnectionError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/ECONNREFUSED/i.test(raw)) {
    return `${raw} — Nothing accepted the TCP connection. Check host/port, firewall/trusted sources, and MongoDB bindIp settings.`;
  }
  if (/ETIMEDOUT|timed out/i.test(raw)) {
    return `${raw} — Timed out. Check host/port, security groups, and outbound access.`;
  }
  if (/Authentication failed|auth failed/i.test(raw)) {
    return `${raw} — Check username/password and authSource permissions for this database user.`;
  }
  return raw;
}

export async function testMongoConnection(params: MongoConnectionParams): Promise<void> {
  const client = buildMongoClient(params, 15000);
  try {
    await client.connect();
    await client.db(params.database).command({ ping: 1 });
  } finally {
    await client.close();
  }
}

export async function introspectMongoSchema(params: MongoConnectionParams): Promise<MongoSchemaSnapshot> {
  const client = buildMongoClient(params, 20000);
  try {
    await client.connect();
    const db = client.db(params.database);
    const collectionsMeta = await db.listCollections({}, { nameOnly: false }).toArray();

    const collections: MongoSchemaSnapshot['collections'] = [];
    for (const meta of collectionsMeta) {
      const name = String(meta.name ?? '').trim();
      if (!name) continue;

      const coll = db.collection(name);
      const [count, indexes, docs] = await Promise.all([
        coll.estimatedDocumentCount().catch(() => null),
        coll.indexes().catch(() => [] as Array<Record<string, unknown>>),
        coll
          .aggregate([{ $sample: { size: 50 } }], { allowDiskUse: false })
          .toArray()
          .catch(async () => coll.find({}, { limit: 50 }).toArray()),
      ]);

      const fieldTypes = new Map<string, Set<string>>();
      for (const doc of docs as Array<Record<string, unknown>>) {
        collectFieldTypes(doc, '', fieldTypes);
      }

      const idx = (indexes as Array<Record<string, unknown>>).map((x) => ({
        name: String(x.name ?? ''),
        key: (x.key as Record<string, number | string>) ?? {},
        unique: Boolean(x.unique),
      }));

      collections.push({
        name,
        estimatedDocumentCount: typeof count === 'number' ? count : null,
        indexes: idx,
        validator:
          meta.options && typeof meta.options === 'object' && 'validator' in meta.options
            ? ((meta.options as { validator?: Record<string, unknown> }).validator ?? null)
            : null,
        fields: normalizeFieldTypes(fieldTypes),
      });
    }

    collections.sort((a, b) => a.name.localeCompare(b.name));

    return {
      dialect: 'mongodb',
      database: params.database,
      collections,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    await client.close();
  }
}
