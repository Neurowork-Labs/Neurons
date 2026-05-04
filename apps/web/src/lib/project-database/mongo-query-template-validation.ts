/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

/** Minimal Mongo template document stored in query_body (JSON object). */
export type MongoQueryTemplateBody = {
  collection: string;
  operation: 'find' | 'aggregate';
  filter?: Record<string, unknown>;
  pipeline?: unknown[];
  options?: Record<string, unknown>;
};

/** Recursively sort object keys so semantically identical documents compare equal regardless of key order. */
function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key]);
  }
  return sorted;
}

/** Normalize for duplicate comparison (stable across key order and JSON.parse round-trips). */
export function canonicalMongoQueryBodyString(body: Record<string, unknown>): string {
  try {
    return JSON.stringify(sortKeysDeep(body));
  } catch {
    return JSON.stringify(body);
  }
}

/**
 * Validates mongo_json template body. Returns error message or null if OK.
 */
export function validateMongoQueryTemplateBody(body: unknown): string | null {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return 'Query document must be a JSON object.';
  }
  const o = body as Record<string, unknown>;
  const collection = String(o.collection ?? '').trim();
  if (!collection) return 'Query document must include a non-empty "collection" string.';
  const op = String(o.operation ?? '').trim().toLowerCase();
  if (op !== 'find' && op !== 'aggregate') {
    return 'Query document "operation" must be "find" or "aggregate".';
  }
  if (op === 'find') {
    if (o.filter != null && typeof o.filter !== 'object') {
      return 'Query document "filter" must be an object when provided.';
    }
  }
  if (op === 'aggregate') {
    if (!Array.isArray(o.pipeline)) {
      return 'Query document "pipeline" must be an array for aggregate operation.';
    }
  }
  if (o.options != null && typeof o.options !== 'object') {
    return 'Query document "options" must be an object when provided.';
  }
  return null;
}

/** Parse user-edited JSON text into an object for API / validation. */
export function parseMongoQueryBodyText(
  text: string,
): { ok: true; body: Record<string, unknown> } | { ok: false; message: string } {
  const t = String(text ?? '').trim();
  if (!t) return { ok: false, message: 'Query document (JSON) is required.' };
  try {
    const parsed = JSON.parse(t) as unknown;
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, message: 'Query document must be a JSON object.' };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, message: 'Invalid JSON. Check syntax and try again.' };
  }
}
