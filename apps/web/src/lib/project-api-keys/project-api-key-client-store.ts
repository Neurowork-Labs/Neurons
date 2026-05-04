/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

const PROJECT_API_KEY_CLIENT_STORE_PREFIX = 'neurons:project-api-key:';

function keyForProject(projectId: string): string {
  return `${PROJECT_API_KEY_CLIENT_STORE_PREFIX}${String(projectId ?? '').trim()}`;
}

export function storeProjectApiKeyPlaintextForCopy(projectId: string, plaintextKey: string): void {
  if (typeof window === 'undefined') return;
  const pid = String(projectId ?? '').trim();
  const key = String(plaintextKey ?? '').trim();
  if (!pid || !key) return;
  window.localStorage.setItem(keyForProject(pid), key);
}

export function readProjectApiKeyPlaintextForCopy(projectId: string): string | null {
  if (typeof window === 'undefined') return null;
  const pid = String(projectId ?? '').trim();
  if (!pid) return null;
  const value = window.localStorage.getItem(keyForProject(pid));
  return value && value.trim() ? value.trim() : null;
}
