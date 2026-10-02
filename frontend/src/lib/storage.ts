import { useEffect, useState } from "react";

// Per-browser UI preferences. Storage can be unavailable (private mode, blocked site data), so every
// access is guarded and the app falls back to defaults.

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preference just won't persist */
  }
}

/** Storage adapter for react-resizable-panels' useDefaultLayout. */
export const safeStorage = {
  getItem: (key: string) => readPref(key),
  setItem: (key: string, value: string) => writePref(key, value),
};

/** JSON preference with a default, persisted on every change. */
export function usePref<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    const raw = readPref(key);
    if (raw === null) return fallback;
    try {
      return { ...fallback, ...JSON.parse(raw) } as T;
    } catch {
      return fallback;
    }
  });
  useEffect(() => writePref(key, JSON.stringify(value)), [key, value]);
  return [value, setValue] as const;
}
