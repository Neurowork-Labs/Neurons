/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

/** Builds an absolute URL for opening a stored hostname-style domain in a new tab. */
export function projectDomainToOpenUrl(domain: string): string {
  const t = domain.trim();
  if (!t) return '#';
  const lower = t.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return t;
  }
  return `https://${t}`;
}
