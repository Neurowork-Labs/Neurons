/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

export const THEME_STORAGE_KEY = 'neurons-theme';

export type ThemePreference = 'light' | 'dark' | 'system';

export function parseThemePreference(value: string | null): ThemePreference | null {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return null;
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): 'light' | 'dark' {
  if (preference === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return preference;
}

export function readStoredThemePreference(): ThemePreference | null {
  if (typeof window === 'undefined') return null;
  return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function writeStoredThemePreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
}

/** Toggle `dark` on `<html>` for Tailwind `dark:` variant (see globals.css). */
export function applyThemePreferenceToDocument(
  preference: ThemePreference,
  prefersDark: boolean,
): void {
  if (typeof document === 'undefined') return;
  const effective = resolveEffectiveTheme(preference, prefersDark);
  document.documentElement.classList.toggle('dark', effective === 'dark');
}
