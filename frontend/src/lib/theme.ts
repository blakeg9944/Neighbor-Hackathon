import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "ra-theme"; // also read by the pre-paint script in index.html
const PANEL_KEY = "ra-panel";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: preference just won't persist */
  }
}

/** Light by default; dark is opt-in and remembered per browser. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (read(THEME_KEY) === "dark" ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    write(THEME_KEY, theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))] as const;
}

/** Optional right-hand panel (contents TBD). Closed by default. */
export function usePanel() {
  const [open, setOpen] = useState(() => read(PANEL_KEY) === "1");
  useEffect(() => write(PANEL_KEY, open ? "1" : "0"), [open]);
  return [open, setOpen] as const;
}
