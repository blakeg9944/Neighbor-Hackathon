import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Button, ErrorBanner, Logo, Spinner, Wordmark } from "../components/ui";
import { useAuth } from "../lib/auth";
import { signInWithGoogle } from "../lib/supabase";

export default function Login() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const rawNext = params.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/"; // no open redirects
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to={next} replace />;

  // Google is the only sign-in method. On success the browser leaves for Google and comes back to `next`.
  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    const { error } = await signInWithGoogle(next);
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  };

  return (
    <div className="hatched flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm border border-line bg-bg">
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <Logo className="h-11 w-11" />
          <Wordmark className="text-[26px]" />
        </div>
        <div className="flex flex-col gap-5 p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">Sign in</h1>
            <p className="mt-1 text-ink2">Tailor your resume to any job in seconds.</p>
          </div>
          <Button className="w-full" disabled={busy} onClick={onGoogle}>
            {busy ? <Spinner /> : <GoogleIcon />} Continue with Google
          </Button>
          <ErrorBanner error={error} />
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
