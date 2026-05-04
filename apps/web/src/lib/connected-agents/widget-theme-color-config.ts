/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

export const DEFAULT_WIDGET_THEME_COLOR = '#065F46';

const HEX_3_RE = /^#([0-9a-fA-F]{3})$/;
const HEX_6_RE = /^#([0-9a-fA-F]{6})$/;

function expandHex3(value: string): string {
  const m = value.match(HEX_3_RE);
  if (!m?.[1]) return value;
  const [r, g, b] = m[1].split('');
  return `#${r}${r}${g}${g}${b}${b}`;
}

export function normalizeWidgetThemeColor(raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  if (!HEX_3_RE.test(v) && !HEX_6_RE.test(v)) return null;
  const normalized = HEX_3_RE.test(v) ? expandHex3(v) : v;
  return normalized.toUpperCase();
}

export function ensureWidgetThemeColor(raw: unknown): string {
  return normalizeWidgetThemeColor(raw) ?? DEFAULT_WIDGET_THEME_COLOR;
}

export function validateWidgetThemeColor(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; message: string } {
  if (raw == null) return { ok: true, value: null };
  const rawString = String(raw).trim();
  if (!rawString) return { ok: true, value: null };
  const normalized = normalizeWidgetThemeColor(rawString);
  if (!normalized) {
    return {
      ok: false,
      message: 'Widget theme color must be a valid hex color (#RGB or #RRGGBB).',
    };
  }
  return { ok: true, value: normalized };
}
