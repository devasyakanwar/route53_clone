import { applyDensity, applyMode, Density, Mode } from '@cloudscape-design/global-styles';

export type VisualMode = 'light' | 'dark' | 'system';
export const THEME_KEY = 'r53.visual-mode';

export function readVisualMode(): VisualMode {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyVisualMode(mode: VisualMode): void {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  applyMode(dark ? Mode.Dark : Mode.Light);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function saveVisualMode(mode: VisualMode): void {
  try {
    window.localStorage.setItem(THEME_KEY, mode);
  } catch {
    // ignore
  }
  applyVisualMode(mode);
}

export { applyDensity, Density };

/** Inline script for <head> that applies dark mode before first paint (avoids a flash of light content). */
export const themeBootScript = `(function(){try{var m=localStorage.getItem('${THEME_KEY}');var d=m==='dark'||(m!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.style.colorScheme='dark';document.addEventListener('DOMContentLoaded',function(){document.body.classList.add('awsui-dark-mode');});}}catch(e){}})();`;
