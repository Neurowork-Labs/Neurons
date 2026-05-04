/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

/** Hostname from Origin header (e.g. https://example.com → example.com). */
export function originHostname(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function stripWww(host: string): string {
  const h = host.trim().toLowerCase();
  return h.startsWith('www.') ? h.slice(4) : h;
}

export function hostsMatch(projectDomain: string | null, requestHost: string | null): boolean {
  if (!projectDomain || !requestHost) return false;
  return stripWww(projectDomain) === stripWww(requestHost);
}
