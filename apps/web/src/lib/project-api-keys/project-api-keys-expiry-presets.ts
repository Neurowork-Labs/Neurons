/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

export type ApiKeyExpiryPreset = 'never' | '30d' | '90d' | '365d' | 'custom';

export function expiresAtIsoFromPreset(
  preset: ApiKeyExpiryPreset,
  customDateYmd: string | null,
): string | null {
  if (preset === 'never') return null;
  if (preset === 'custom') {
    const d = customDateYmd?.trim();
    if (!d) return null;
    return `${d}T23:59:59.999Z`;
  }
  const days = preset === '30d' ? 30 : preset === '90d' ? 90 : 365;
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + days);
  return end.toISOString();
}
