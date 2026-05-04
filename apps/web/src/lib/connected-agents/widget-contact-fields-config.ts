/*
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

export const WIDGET_CONTACT_FIELD_KEYS = ['name', 'email', 'phone', 'location'] as const;
export type WidgetContactFieldKey = (typeof WIDGET_CONTACT_FIELD_KEYS)[number];

export const WIDGET_CONTACT_FIELD_OPTIONS: Array<{ value: WidgetContactFieldKey; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'location', label: 'Location' },
];

const WIDGET_CONTACT_FIELD_SET = new Set<string>(WIDGET_CONTACT_FIELD_KEYS);

export function isWidgetContactFieldKey(value: string): value is WidgetContactFieldKey {
  return WIDGET_CONTACT_FIELD_SET.has(value);
}

/**
 * Normalizes any raw JSON-ish value to a deduplicated array of allowed field keys.
 */
export function normalizeWidgetRequiredContactFields(raw: unknown): WidgetContactFieldKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<WidgetContactFieldKey>();
  const out: WidgetContactFieldKey[] = [];
  for (const item of raw) {
    const key = String(item ?? '').trim().toLowerCase();
    if (!isWidgetContactFieldKey(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function validateWidgetRequiredContactFields(raw: unknown): {
  ok: true;
  value: WidgetContactFieldKey[];
} | {
  ok: false;
  message: string;
} {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, message: 'Required contact fields must be an array.' };
  }
  const uniqueValid = new Set<string>();
  for (const item of raw) {
    const key = String(item ?? '').trim().toLowerCase();
    if (!isWidgetContactFieldKey(key)) {
      return { ok: false, message: `Invalid contact field: "${key}".` };
    }
    if (uniqueValid.has(key)) {
      return { ok: false, message: `Duplicate contact field: "${key}".` };
    }
    uniqueValid.add(key);
  }
  const normalized = normalizeWidgetRequiredContactFields(raw);
  return { ok: true, value: normalized };
}

export function widgetRequiredContactFieldsEqual(
  a: WidgetContactFieldKey[],
  b: WidgetContactFieldKey[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** True when `metadata.location` has finite latitude/longitude (GPS from widget). */
export function hasWidgetContactLocationMetadata(metadata: unknown): boolean {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const loc = (metadata as Record<string, unknown>).location;
  if (loc == null || typeof loc !== 'object' || Array.isArray(loc)) return false;
  const lat = Number((loc as Record<string, unknown>).latitude);
  const lng = Number((loc as Record<string, unknown>).longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

/**
 * True when the widget already asked the visitor for location permission.
 * The visitor may have allowed (coords present) or denied (location: null) —
 * either outcome satisfies the "location" requirement.
 */
export function wasLocationPermissionRequested(metadata: unknown): boolean {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>).location_permission_requested === true;
}
