import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { signOut as supabaseSignOut, supabase, supabaseConfigured } from "./supabase";

interface AuthUser {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}
interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const FAKE_USER: AuthUser = { email: "demo@example.com", name: "Demo User (no Supabase keys)", avatarUrl: null };

const AuthContext = createContext<AuthState>({ user: null, loading: true, signOut: async () => {} });

const toUser = (s: Session | null): AuthUser | null =>
  s
    ? {
        email: s.user.email ?? null,
        name: s.user.user_metadata?.full_name ?? s.user.user_metadata?.name ?? null,
        avatarUrl: s.user.user_metadata?.avatar_url ?? null,
      }
    : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(supabaseConfigured ? null : FAKE_USER);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;
    // Session is restored from localStorage and auto-refreshed by supabase-js.
    supabase.auth.getSession().then(({ data }) => {
      setUser(toUser(data.session));
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(toUser(session)));
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (supabaseConfigured) await supabaseSignOut();
    setUser(supabaseConfigured ? null : FAKE_USER);
  };

  return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Redirects to /login?next=<current path+query> when signed out, so ?url= from the extension survives login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}
