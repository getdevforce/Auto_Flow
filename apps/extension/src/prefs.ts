export type Theme = 'system' | 'light' | 'dark';
export type Density = 'comfortable' | 'compact';

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage can be blocked; the preference then applies for this session only */ } };

export const getTheme = (): Theme => read('theme', 'system') as Theme;
export const getDensity = (): Density => read('density', 'comfortable') as Density;

/** Applies to the document root. 'system' removes the override so prefers-color-scheme decides. */
export function applyTheme(t: Theme) {
  write('theme', t);
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
export function applyDensity(d: Density) {
  write('density', d);
  document.documentElement.setAttribute('data-density', d);
}
export const applyStoredPrefs = () => { applyTheme(getTheme()); applyDensity(getDensity()); };
