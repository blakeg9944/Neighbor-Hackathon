// Runs only on the website's own origins (localhost:5173 + trimdcv.com, see manifest.json). Copies the Supabase session that
// supabase-js already writes to this origin's localStorage into chrome.storage.local, so the
// popup can call the backend on its own when the active tab is a job application page
// (DESIGN_SPEC §9.1 auto-apply) without the extension ever needing its own login.
// No UI, no effect on any other page.

function findSupabaseSession() {
  // If a stale session from a previously-configured Supabase project is still sitting in
  // localStorage under a different "sb-<ref>-auth-token" key, prefer whichever matching key
  // has the latest expires_at -- that's reliably the most recently issued (current) login.
  let best = null;
  for (const key of Object.keys(localStorage)) {
    if (!/^sb-.*-auth-token$/.test(key)) continue;
    try {
      const session = JSON.parse(localStorage.getItem(key));
      if (session && session.access_token && (!best || (session.expires_at || 0) > (best.expires_at || 0))) {
        best = { access_token: session.access_token, expires_at: session.expires_at || null };
      }
    } catch {
      // not a JSON session blob, ignore
    }
  }
  return best;
}

function syncToken() {
  const session = findSupabaseSession();
  if (session) chrome.storage.local.set(session);
}

syncToken();
setInterval(syncToken, 30000);
