/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { ConnectionOptions, RowDataPacket } from 'mysql2/promise';
import mysql from 'mysql2/promise';

export type MysqlSslMode =
  | 'disable'
  | 'preferred'
  | 'required'
  | 'verify_ca'
  | 'verify_identity';

export type MysqlConnectionParams = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  sslMode: MysqlSslMode;
  sslCaPem?: string | null;
};

export type MysqlSchemaSnapshot = {
  dialect: 'mysql';
  database: string;
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      dataType: string;
      columnType: string | null;
      nullable: boolean;
      columnKey: string | null;
    }>;
    foreignKeys: Array<{
      column: string;
      referencedTable: string;
      referencedColumn: string;
      constraintName: string | null;
    }>;
  }>;
  fetchedAt: string;
};

function buildSslOption(
  mode: MysqlSslMode,
  sslCaPem: string | null | undefined,
): ConnectionOptions['ssl'] {
  if (mode === 'disable') {
    return undefined;
  }
  if (mode === 'preferred') {
    return { rejectUnauthorized: false };
  }
  if (mode === 'required') {
    return { rejectUnauthorized: false };
  }
  const ca = sslCaPem?.trim();
  if (!ca) {
    throw new Error('SSL/TLS mode requires a CA certificate (paste the PEM in the SSL CA field).');
  }
  return {
    ca,
    rejectUnauthorized: mode === 'verify_identity',
  };
}

/**
 * Turns low-level mysql2 errors into messages that explain common infra issues.
 * Connections run on the host running Next.js (e.g. your laptop in dev), not on the DB server.
 */
export function formatMysqlConnectionError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const code =
    typeof e === 'object' && e !== null && 'code' in e
      ? String((e as { code?: string }).code ?? '')
      : '';

  if (code === 'ECONNREFUSED' || raw.includes('ECONNREFUSED')) {
    return (
      `${raw} — Nothing accepted the TCP connection. Often: (1) port 3306 is blocked by a firewall or cloud "Trusted Sources" (allow your current public IP, or the IP of the server running Neurons); ` +
      `(2) MySQL bind-address is 127.0.0.1 only (remote clients cannot connect); (3) mysqld is not running. ` +
      `Note: this app connects from the machine running Next.js (e.g. your dev PC), not from your PHP app on the same host as MySQL.`
    );
  }
  if (code === 'ETIMEDOUT' || raw.includes('ETIMEDOUT')) {
    return `${raw} — Timed out. Check host/port, security groups, and that outbound 3306 is allowed.`;
  }
  if (raw.includes('Access denied') || raw.includes('ER_ACCESS_DENIED_ERROR')) {
    return `${raw} — Check username, password, and that the MySQL user is allowed to connect from your client host (GRANT ... IDENTIFIED ... @'%' or your IP).`;
  }
  return raw;
}

export async function testMysqlConnection(params: MysqlConnectionParams): Promise<void> {
  const conn = await mysql.createConnection({
    host: params.host,
    port: params.port,
    user: params.user,
    password: params.password,
    database: params.database,
    connectTimeout: 15000,
    ssl: buildSslOption(params.sslMode, params.sslCaPem),
  });
  await conn.ping();
  await conn.end();
}

export type MysqlServerProduct = 'mysql' | 'mariadb' | 'unknown';

export type MysqlServerInfo = {
  version: string;
  versionComment: string;
  product: MysqlServerProduct;
};

export async function probeMysqlServerInfo(params: MysqlConnectionParams): Promise<MysqlServerInfo> {
  const conn = await mysql.createConnection({
    host: params.host,
    port: params.port,
    user: params.user,
    password: params.password,
    database: params.database,
    connectTimeout: 15000,
    ssl: buildSslOption(params.sslMode, params.sslCaPem),
  });

  try {
    type Row = RowDataPacket & { version?: string | null; versionComment?: string | null };
    const [rows] = await conn.query<Row[]>(
      `SELECT
        VERSION() AS version,
        COALESCE(@@version_comment, '') AS versionComment`,
    );
    const r = (rows ?? [])[0] ?? {};
    const version = String(r.version ?? '').trim();
    const versionComment = String(r.versionComment ?? '').trim();

    const raw = `${version} ${versionComment}`.trim();
    const product: MysqlServerProduct = /mariadb/i.test(raw) ? 'mariadb' : version ? 'mysql' : 'unknown';

    return { version, versionComment, product };
  } finally {
    await conn.end();
  }
}

export async function introspectMysqlSchema(params: MysqlConnectionParams): Promise<MysqlSchemaSnapshot> {
  const conn = await mysql.createConnection({
    host: params.host,
    port: params.port,
    user: params.user,
    password: params.password,
    database: params.database,
    connectTimeout: 15000,
    ssl: buildSslOption(params.sslMode, params.sslCaPem),
  });

  type ColRow = RowDataPacket & {
    TABLE_NAME: string;
    COLUMN_NAME: string;
    DATA_TYPE: string;
    IS_NULLABLE: string;
    COLUMN_KEY: string;
    COLUMN_TYPE: string;
  };

  type FkRow = RowDataPacket & {
    TABLE_NAME: string;
    COLUMN_NAME: string;
    REFERENCED_TABLE_NAME: string | null;
    REFERENCED_COLUMN_NAME: string | null;
    CONSTRAINT_NAME: string | null;
    ORDINAL_POSITION: number;
  };

  try {
    const [rows] = await conn.query<ColRow[]>(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [params.database],
    );

    const byTable = new Map<
      string,
      {
        columns: Array<{
          name: string;
          dataType: string;
          columnType: string | null;
          nullable: boolean;
          columnKey: string | null;
        }>;
        foreignKeys: Array<{
          column: string;
          referencedTable: string;
          referencedColumn: string;
          constraintName: string | null;
        }>;
      }
    >();

    for (const r of rows) {
      const t = r.TABLE_NAME;
      if (!byTable.has(t)) byTable.set(t, { columns: [], foreignKeys: [] });
      byTable.get(t)!.columns.push({
        name: r.COLUMN_NAME,
        dataType: r.DATA_TYPE,
        columnType: r.COLUMN_TYPE ?? null,
        nullable: r.IS_NULLABLE === 'YES',
        columnKey: r.COLUMN_KEY || null,
      });
    }

    // Foreign key introspection (for join planning).
    // Uses KEY_COLUMN_USAGE; for composite keys this includes multiple rows.
    const [fkRows] = await conn.query<FkRow[]>(
      `SELECT
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME,
        CONSTRAINT_NAME,
        ORDINAL_POSITION
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
        AND REFERENCED_COLUMN_NAME IS NOT NULL
      ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
      [params.database],
    );

    for (const r of fkRows) {
      const t = r.TABLE_NAME;
      if (!byTable.has(t)) byTable.set(t, { columns: [], foreignKeys: [] });
      byTable.get(t)!.foreignKeys.push({
        column: r.COLUMN_NAME,
        referencedTable: r.REFERENCED_TABLE_NAME ? String(r.REFERENCED_TABLE_NAME) : '',
        referencedColumn: r.REFERENCED_COLUMN_NAME ? String(r.REFERENCED_COLUMN_NAME) : '',
        constraintName: r.CONSTRAINT_NAME ? String(r.CONSTRAINT_NAME) : null,
      });
    }

    const tables = [...byTable.entries()].map(([name, snap]) => ({
      name,
      columns: snap.columns,
      foreignKeys: snap.foreignKeys,
    }));

    return {
      dialect: 'mysql',
      database: params.database,
      tables,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    await conn.end();
  }
}
