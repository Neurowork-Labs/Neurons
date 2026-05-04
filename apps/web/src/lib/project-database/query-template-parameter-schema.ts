/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

export const QUERY_TEMPLATE_PARAMETER_TYPES = [
  'int2',
  'int4',
  'int8',
  'float4',
  'float8',
  'numeric',
  'json',
  'jsonb',
  'text',
  'varchar',
  'uuid',
  'date',
  'time',
  'timetz',
  'timestamp',
  'timestamptz',
  'bool',
  'bytes',
] as const;

export type QueryTemplateParameterType = (typeof QUERY_TEMPLATE_PARAMETER_TYPES)[number];

export type QueryTemplateParameterRow = {
  name: string;
  type: QueryTemplateParameterType;
  required: boolean;
  nullable: boolean;
  defaultValueText: string;
  enumValuesText: string;
  description: string;
};

const PARAM_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PARAM_TYPE_SET = new Set<string>(QUERY_TEMPLATE_PARAMETER_TYPES);
const MAX_LIMIT_PARAMETER_VALUE = 50;

function normalizeName(name: string): string {
  return String(name ?? '').trim();
}

function normalizeType(value: unknown): QueryTemplateParameterType {
  const raw = String(value ?? '').trim().toLowerCase();
  if (PARAM_TYPE_SET.has(raw)) return raw as QueryTemplateParameterType;

  // Backward compatibility for previously saved generic types.
  if (raw === 'string') return 'text';
  if (raw === 'number') return 'numeric';
  if (raw === 'integer') return 'int4';
  if (raw === 'boolean') return 'bool';
  return 'int2';
}

function parseDefaultValue(
  row: QueryTemplateParameterRow,
): { ok: true; value?: unknown } | { ok: false; message: string } {
  const raw = String(row.defaultValueText ?? '').trim();
  if (!raw) return { ok: true };

  if (row.nullable && raw.toLowerCase() === 'null') {
    return { ok: true, value: null };
  }

  if (row.type === 'bool') {
    const low = raw.toLowerCase();
    if (low === 'true') return { ok: true, value: true };
    if (low === 'false') return { ok: true, value: false };
    return { ok: false, message: `Default value for "${row.name}" must be true or false.` };
  }

  if (row.type === 'int2' || row.type === 'int4' || row.type === 'int8') {
    const n = Number(raw);
    if (!Number.isInteger(n)) {
      return { ok: false, message: `Default value for "${row.name}" must be an integer.` };
    }
    return { ok: true, value: n };
  }

  if (row.type === 'float4' || row.type === 'float8' || row.type === 'numeric') {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return { ok: false, message: `Default value for "${row.name}" must be a number.` };
    }
    return { ok: true, value: n };
  }

  if (row.type === 'json' || row.type === 'jsonb') {
    try {
      return { ok: true, value: JSON.parse(raw) as unknown };
    } catch {
      return { ok: false, message: `Default value for "${row.name}" must be valid JSON.` };
    }
  }

  return { ok: true, value: raw };
}

function parseEnumValues(
  row: QueryTemplateParameterRow,
): { ok: true; values: unknown[] } | { ok: false; message: string } {
  const raw = String(row.enumValuesText ?? '').trim();
  if (!raw) return { ok: true, values: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return { ok: false, message: `Enum for "${row.name}" must be a JSON array.` };
    }
    return { ok: true, values: parsed };
  } catch {
    return { ok: false, message: `Enum for "${row.name}" must be valid JSON array.` };
  }
}

function makeDefaultRow(name: string): QueryTemplateParameterRow {
  return {
    name: normalizeName(name),
    type: 'int2',
    required: false,
    nullable: true,
    defaultValueText: '',
    enumValuesText: '',
    description: '',
  };
}

function sanitizeRows(rows: QueryTemplateParameterRow[]): QueryTemplateParameterRow[] {
  const out: QueryTemplateParameterRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = normalizeName(row.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      type: normalizeType(row.type),
      required: Boolean(row.required),
      nullable: Boolean(row.nullable),
      defaultValueText: String(row.defaultValueText ?? ''),
      enumValuesText: String(row.enumValuesText ?? ''),
      description: String(row.description ?? '').trim(),
    });
  }
  return out;
}

export function detectSqlParameterNames(sqlText: string): string[] {
  const sql = String(sqlText ?? '');
  const found: string[] = [];
  const seen = new Set<string>();
  const re = /(^|[^:]):([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null = re.exec(sql);
  while (m) {
    const name = String(m[2] ?? '').trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      found.push(name);
    }
    m = re.exec(sql);
  }
  return found;
}

export function detectMongoTemplateParameterNames(queryBodyText: string): string[] {
  const text = String(queryBodyText ?? '');
  const found: string[] = [];
  const seen = new Set<string>();
  const re = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
  let m: RegExpExecArray | null = re.exec(text);
  while (m) {
    const name = String(m[1] ?? '').trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      found.push(name);
    }
    m = re.exec(text);
  }
  return found;
}

export function detectTemplateParameterNames(
  dialect: 'sql' | 'mongo_json',
  sqlText: string,
  queryBodyText: string,
): string[] {
  return dialect === 'mongo_json'
    ? detectMongoTemplateParameterNames(queryBodyText)
    : detectSqlParameterNames(sqlText);
}

export function syncParameterRowsWithDetectedNames(
  rows: QueryTemplateParameterRow[],
  detectedNames: string[],
): QueryTemplateParameterRow[] {
  const base = sanitizeRows(rows);
  const byKey = new Map<string, QueryTemplateParameterRow>();
  for (const row of base) byKey.set(row.name.toLowerCase(), row);

  const next: QueryTemplateParameterRow[] = [];
  const used = new Set<string>();
  for (const name of detectedNames) {
    const key = String(name ?? '').trim().toLowerCase();
    if (!key || used.has(key)) continue;
    used.add(key);
    const existing = byKey.get(key);
    next.push(existing ?? makeDefaultRow(name));
  }

  // keep existing rows that are not currently detected (non-destructive editing)
  for (const row of base) {
    const key = row.name.toLowerCase();
    if (!used.has(key)) next.push(row);
  }
  return next;
}

export function parameterRowsFromSchema(schema: Record<string, unknown> | null | undefined): QueryTemplateParameterRow[] {
  if (!schema || typeof schema !== 'object') return [];
  const raw = (schema as { parameters?: unknown }).parameters;
  if (!Array.isArray(raw)) return [];
  const rows: QueryTemplateParameterRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    rows.push({
      name: String(obj.name ?? '').trim(),
      type: normalizeType(obj.type),
      required: Boolean(obj.required),
      nullable: obj.nullable == null ? true : Boolean(obj.nullable),
      defaultValueText:
        obj.default == null
          ? ''
          : typeof obj.default === 'object'
            ? JSON.stringify(obj.default)
            : String(obj.default),
      enumValuesText: Array.isArray(obj.enum) ? JSON.stringify(obj.enum) : '',
      description: String(obj.description ?? '').trim(),
    });
  }
  return sanitizeRows(rows);
}

export function validateParameterRows(rows: QueryTemplateParameterRow[]): string | null {
  const clean = sanitizeRows(rows);
  const seen = new Set<string>();
  for (const row of clean) {
    if (!PARAM_NAME_RE.test(row.name)) {
      return `Invalid parameter name "${row.name}". Use letters, numbers, and underscores only.`;
    }
    const key = row.name.toLowerCase();
    if (seen.has(key)) return `Duplicate parameter "${row.name}" is not allowed.`;
    seen.add(key);
    if (!row.nullable && String(row.defaultValueText ?? '').trim().toLowerCase() === 'null') {
      return `Parameter "${row.name}" is non-nullable, so default cannot be null.`;
    }
    const enumRes = parseEnumValues(row);
    if (!enumRes.ok) return enumRes.message;
    if (enumRes.values.length > 0) {
      const hasDup = new Set(enumRes.values.map((v) => JSON.stringify(v))).size !== enumRes.values.length;
      if (hasDup) return `Enum for "${row.name}" must not contain duplicate values.`;
    }
    const parsed = parseDefaultValue(row);
    if (!parsed.ok) return parsed.message;
    if (row.name.toLowerCase() === 'limit') {
      const rawDefault = String(row.defaultValueText ?? '').trim();
      if (!rawDefault) {
        return `Default for "limit" is required and must be between 1 and ${MAX_LIMIT_PARAMETER_VALUE}.`;
      }
      if (rawDefault.toLowerCase() === 'null') {
        return `Default for "limit" cannot be null. Use a value between 1 and ${MAX_LIMIT_PARAMETER_VALUE}.`;
      }
      const n = Number(rawDefault);
      if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT_PARAMETER_VALUE) {
        return `Default for "limit" must be an integer between 1 and ${MAX_LIMIT_PARAMETER_VALUE}.`;
      }
    }
    if (enumRes.ok && enumRes.values.length > 0) {
      if (parsed.value === undefined) {
        return `Default for "${row.name}" is required when enum is provided.`;
      }
      const defaultKey = JSON.stringify(parsed.value);
      const enumKeys = new Set(enumRes.values.map((v) => JSON.stringify(v)));
      if (!enumKeys.has(defaultKey)) {
        return `Default for "${row.name}" must be one of enum values.`;
      }
    }
  }
  return null;
}

export function parameterSchemaFromRows(rows: QueryTemplateParameterRow[]): Record<string, unknown> | null {
  const clean = sanitizeRows(rows);
  if (clean.length === 0) return null;
  const parameters = clean.map((row) => {
    const parsed = parseDefaultValue(row);
    const enumRes = parseEnumValues(row);
    const out: Record<string, unknown> = {
      name: row.name,
      type: row.type,
      required: row.required,
      nullable: row.nullable,
    };
    if (row.description) out.description = row.description;
    if (enumRes.ok && enumRes.values.length > 0) out.enum = enumRes.values;
    if (parsed.ok && parsed.value !== undefined) out.default = parsed.value;
    return out;
  });
  return {
    version: 1,
    parameters,
  };
}

export function parameterRowsEqual(a: QueryTemplateParameterRow[], b: QueryTemplateParameterRow[]): boolean {
  const x = sanitizeRows(a);
  const y = sanitizeRows(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i += 1) {
    if (
      x[i].name !== y[i].name ||
      x[i].type !== y[i].type ||
      x[i].required !== y[i].required ||
      x[i].nullable !== y[i].nullable ||
      x[i].defaultValueText !== y[i].defaultValueText ||
      x[i].enumValuesText !== y[i].enumValuesText ||
      x[i].description !== y[i].description
    ) {
      return false;
    }
  }
  return true;
}
