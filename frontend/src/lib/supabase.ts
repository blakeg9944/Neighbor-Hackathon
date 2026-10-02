import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when frontend/.env has no Supabase keys; the app then fakes a signed-in user (see lib/auth.tsx). */
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Placeholders keep createClient from throwing when unconfigured; the client is never used in that case.
// persistSession + autoRefreshToken (defaults) keep users signed in across visits (DESIGN_SPEC §8.4).
export const supabase = createClient(
  SUPABASE_URL || "http://localhost:54321",
  SUPABASE_ANON_KEY || "unconfigured",
);

/** `next` is a path like "/generate?url=..." to return to after Google redirects back. */
export const signInWithGoogle = (next = "/") =>
  supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + next },
  });

export const signInWithPassword = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUpWithPassword = (email: string, password: string) =>
  supabase.auth.signUp({ email, password });

export const signOut = () => supabase.auth.signOut();

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(typeof detail === "string" ? detail : (detailMessage(detail) ?? `Request failed (${status})`));
  }

  /** Machine-readable code from `{"detail": {"code": "..."}}`, e.g. FETCH_FAILED, EMPTY_BANK. */
  get code(): string | undefined {
    return isObj(this.detail) && typeof this.detail.code === "string" ? this.detail.code : undefined;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const detailMessage = (d: unknown) => (isObj(d) && typeof d.message === "string" ? d.message : undefined);

/** fetch() against the FastAPI backend with the user's Supabase JWT attached. */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "Not signed in");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail: unknown = await res.text();
    try {
      detail = JSON.parse(detail as string).detail ?? detail;
    } catch {
      /* plain-text error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}
