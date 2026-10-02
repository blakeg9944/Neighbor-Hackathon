import { useEffect, useState } from "react";

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

/** Optional right-hand panel (contents TBD). Closed by default. */
export function usePanel() {
  const [open, setOpen] = useState(() => read(PANEL_KEY) === "1");
  useEffect(() => write(PANEL_KEY, open ? "1" : "0"), [open]);
  return [open, setOpen] as const;
}
