/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

export type ConnectDatabaseFormPayload = {
  databaseTypeId: string;
  databaseId: string;
  databaseIdentifier: string;
  displayName: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  sslMode: string;
  sslCaPem: string | null;
  mongoUseSrv: boolean;
  projectAgentIds: string[];
};

const MYSQL_SSL_MODES = ['disable', 'preferred', 'required', 'verify_ca', 'verify_identity'] as const;
const MONGO_SSL_MODES = ['disable', 'required', 'verify_ca', 'verify_identity'] as const;

export function parseMysqlPort(raw: string): number {
  const n = Number(String(raw ?? '').trim());
  if (!Number.isFinite(n) || n < 1 || n > 65535) return 3306;
  return Math.floor(n);
}

export function parseConnectPort(raw: string, databaseIdentifier: string): number {
  const n = Number(String(raw ?? '').trim());
  if (Number.isFinite(n) && n >= 1 && n <= 65535) return Math.floor(n);
  return databaseIdentifier === 'mongodb' ? 27017 : 3306;
}

export function validateConnectDatabaseForm(args: {
  databaseTypeId: string;
  databaseId: string;
  databaseIdentifier: string;
  displayName: string;
  host: string;
  portRaw: string;
  databaseName: string;
  username: string;
  password: string;
  sslMode: string;
  sslCaPem: string;
  mongoUseSrv?: boolean;
  projectAgentIds: string[];
  /** When false, connection fields are validated only (agent selection step comes next). */
  requireProjectAgents?: boolean;
}): { ok: true; payload: ConnectDatabaseFormPayload } | { ok: false; message: string } {
  const databaseTypeId = String(args.databaseTypeId ?? '').trim();
  const databaseId = String(args.databaseId ?? '').trim();
  const databaseIdentifier = String(args.databaseIdentifier ?? '').trim().toLowerCase();
  const displayName = String(args.displayName ?? '').trim();
  const host = String(args.host ?? '').trim();
  const databaseName = String(args.databaseName ?? '').trim();
  const username = String(args.username ?? '').trim();
  const password = String(args.password ?? '');
  const sslCaPem = String(args.sslCaPem ?? '').trim();

  if (!databaseTypeId) return { ok: false, message: 'Select a database type.' };
  if (!databaseId) return { ok: false, message: 'Select a database product.' };
  if (!databaseIdentifier) return { ok: false, message: 'Invalid database selection.' };
  if (!displayName) return { ok: false, message: 'Enter a display name.' };
  if (!host) return { ok: false, message: 'Enter a host.' };
  if (!databaseName) return { ok: false, message: 'Enter a database name.' };
  if (!username) return { ok: false, message: 'Enter a username.' };
  if (!password) return { ok: false, message: 'Enter a password.' };

  const sslMode = String(args.sslMode ?? 'required').trim();
  const mongoUseSrv = args.mongoUseSrv === true;
  if (databaseIdentifier === 'mongodb') {
    if (!MONGO_SSL_MODES.includes(sslMode as (typeof MONGO_SSL_MODES)[number])) {
      return { ok: false, message: 'Select a valid SSL/TLS mode.' };
    }
    if ((sslMode === 'verify_ca' || sslMode === 'verify_identity') && !sslCaPem) {
      return { ok: false, message: 'Paste the CA certificate (PEM) for this SSL mode.' };
    }
  } else {
    if (!MYSQL_SSL_MODES.includes(sslMode as (typeof MYSQL_SSL_MODES)[number])) {
      return { ok: false, message: 'Select a valid SSL/TLS mode.' };
    }
    if ((sslMode === 'verify_ca' || sslMode === 'verify_identity') && !sslCaPem) {
      return { ok: false, message: 'Paste the CA certificate (PEM) for this SSL mode.' };
    }
  }

  const projectAgentIds = [...new Set(args.projectAgentIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (args.requireProjectAgents !== false && projectAgentIds.length === 0) {
    return { ok: false, message: 'Select at least one connected agent.' };
  }

  return {
    ok: true,
    payload: {
      databaseTypeId,
      databaseId,
      databaseIdentifier,
      displayName,
      host,
      port: databaseIdentifier === 'mongodb' && mongoUseSrv ? 27017 : parseConnectPort(args.portRaw, databaseIdentifier),
      databaseName,
      username,
      password,
      sslMode,
      sslCaPem: sslCaPem || null,
      mongoUseSrv,
      projectAgentIds,
    },
  };
}
