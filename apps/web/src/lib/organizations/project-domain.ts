/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

/**
 * Hostname-style domain for `public.projects.domain` (no scheme, path, or port).
 * Examples: example.com, sub.example.co.uk, app.example.io
 */
export function isValidProjectDomain(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return false;
  if (s === 'localhost') return true;
  if (s.length > 253) return false;
  if (
    s.includes('://') ||
    s.includes('/') ||
    s.includes(' ') ||
    s.includes(':') ||
    s.includes('@') ||
    s.includes('?') ||
    s.includes('#') ||
    s.includes('[') ||
    s.includes(']')
  ) {
    return false;
  }
  if (s.startsWith('.') || s.endsWith('.') || s.includes('..')) return false;

  const labels = s.split('.');
  if (labels.length < 2) return false;

  const tld = labels[labels.length - 1];
  if (tld.length < 2 || tld.length > 63 || !/^[a-z]+$/.test(tld)) return false;

  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return false;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) return false;
  }

  return true;
}

export function normalizeProjectDomain(raw: string): string {
  return raw.trim().toLowerCase();
}
