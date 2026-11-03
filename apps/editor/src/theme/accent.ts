import { useSyncExternalStore, type CSSProperties } from 'react';

/**
 * The accent colours one can pick in Settings ▸ Appearance: each a strong
 * shade for filled buttons and a soft one for selections, rings and links on
 * a dark board. Blue is the app's own and the default.
 */
export const ACCENTS = {
  blue: { strong: '#135dfc', soft: '#4d84fd' },
  violet: { strong: '#7c3aed', soft: '#a78bfa' },
  green: { strong: '#16a34a', soft: '#4ade80' },
  orange: { strong: '#ea580c', soft: '#fb923c' },
  pink: { strong: '#db2777', soft: '#f472b6' },
  slate: { strong: '#475569', soft: '#94a3b8' },
} as const;

export type AccentId = keyof typeof ACCENTS;

export const ACCENT_IDS = Object.keys(ACCENTS) as AccentId[];

export const ACCENT_STORAGE_KEY = 'cf:accent';
export const REDUCE_MOTION_STORAGE_KEY = 'cf:reduce-motion';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice lasts until the tab closes.
  }
}

let accent: AccentId = ((): AccentId => {
  const stored = read(ACCENT_STORAGE_KEY);
  return stored && stored in ACCENTS ? (stored as AccentId) : 'blue';
})();

let reduceMotion = read(REDUCE_MOTION_STORAGE_KEY) === 'true';

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACCENT_STORAGE_KEY && event.newValue && event.newValue in ACCENTS) {
      accent = event.newValue as AccentId;
      listener();
    }
    if (event.key === REDUCE_MOTION_STORAGE_KEY) {
      reduceMotion = event.newValue === 'true';
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export const currentAccent = (): AccentId => accent;

export function setAccent(next: AccentId): void {
  accent = next;
  write(ACCENT_STORAGE_KEY, next);
  notify();
}

/** The accent picked in this browser, following changes made in any tab. */
export function useAccent(): AccentId {
  return useSyncExternalStore(subscribe, currentAccent, () => 'blue');
}

export function setReduceMotion(next: boolean): void {
  reduceMotion = next;
  write(REDUCE_MOTION_STORAGE_KEY, String(next));
  notify();
}

/** Whether sheets and pages appear without sliding, as chosen in Settings. */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => reduceMotion,
    () => false,
  );
}

/** A colour at `alpha`, from its #rrggbb form. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * The editor's theme tokens for an accent: set on the editor's root, they
 * colour the buttons, the selected tool, focus rings and the sidebar's own
 * primary. Blue gives back exactly what theme.css declares.
 */
export function accentThemeVars(id: AccentId, dark: boolean): CSSProperties {
  const { strong, soft } = ACCENTS[id];
  return {
    '--color-primary': strong,
    '--color-surface-primary-container': strong,
    '--color-brand-active': dark ? soft : strong,
    '--color-ring': dark ? soft : strong,
    '--focus-highlight-color': soft,
    '--sidebar-primary': strong,
    '--sidebar-ring': soft,
    '--cf-accent': strong,
    '--cf-accent-soft': soft,
  } as CSSProperties;
}

/** The colour the board draws a selection in, for the accent picked. */
export function selectionColorFor(id: AccentId): string {
  return ACCENTS[id].soft;
}
