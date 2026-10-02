import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { USE_MOCKS } from "../lib/api";
import { useAuth } from "../lib/auth";
import { readPref, writePref } from "../lib/storage";
import { MonoLabel } from "./ui";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▦", end: true },
  { to: "/bank", label: "Your Resume", icon: "☰", end: false },
  { to: "/opportunities", label: "Job Opportunities", icon: "◎", end: false },
];

const titleFor = (path: string) =>
  path === "/" ? "Dashboard"
  : path.startsWith("/bank") ? "Your Resume"
  : path.startsWith("/opportunities") ? "Job Opportunities"
  : path.startsWith("/generate") ? "New Resume"
  : path.includes("/review") ? "Resume Editor"
  : "";

// The nav can collapse to an icon rail. The editor page starts collapsed (it needs the room for three
// panes); each context remembers the user's own choice.
const NAV_KEYS = { editor: "ra-nav-collapsed-editor", other: "ra-nav-collapsed" } as const;

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onEditor = pathname.includes("/review");
  const [collapsedPrefs, setCollapsedPrefs] = useState(() => ({
    editor: readPref(NAV_KEYS.editor) !== "0", // default: collapsed on the editor
    other: readPref(NAV_KEYS.other) === "1", // default: expanded elsewhere
  }));
  const ctx = onEditor ? "editor" : "other";
  const collapsed = collapsedPrefs[ctx];
  const toggle = () => {
    writePref(NAV_KEYS[ctx], collapsed ? "0" : "1");
    setCollapsedPrefs((p) => ({ ...p, [ctx]: !collapsed }));
  };

  const initials = (user?.name ?? user?.email ?? "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
  const avatar = user?.avatarUrl ? (
    <img src={user.avatarUrl} alt="" className="h-7 w-7 flex-none border border-line" />
  ) : (
    <span className="grid h-7 w-7 flex-none place-items-center border border-accent-line bg-accent-bg font-mono text-[11px] text-accent">
      {initials}
    </span>
  );

  return (
    <div className="flex min-h-screen">
      {/* ---------- sidebar (full or icon rail) ---------- */}
      <aside
        className={`sticky top-0 hidden h-screen flex-none flex-col border-r border-line bg-side lg:flex ${
          collapsed ? "w-14" : "w-60"
        }`}
      >
        <div className={`flex h-14 items-center border-b border-line font-semibold ${collapsed ? "justify-center" : "gap-2.5 px-4"}`}>
          <span className="grid h-6 w-6 flex-none place-items-center bg-solid font-mono text-xs font-medium text-on-solid">R</span>
          {!collapsed && (
            <>
              <span className="flex-1 truncate">Resume Adapter</span>
              <button onClick={toggle} title="Collapse sidebar" className="px-1 text-muted hover:text-ink">
                «
              </button>
            </>
          )}
        </div>
        <div className={`border-b border-line ${collapsed ? "p-2" : "p-3"}`}>
          <button
            onClick={() => navigate("/generate")}
            title="New resume"
            className={`flex w-full items-center bg-solid font-medium text-on-solid hover:opacity-90 ${
              collapsed ? "h-10 justify-center" : "justify-between px-3 py-2.5"
            }`}
          >
            {collapsed ? "＋" : "＋ New resume"}
          </button>
        </div>
        <nav className={`flex flex-col border-b border-line ${collapsed ? "items-center gap-1 py-2" : "p-3"}`}>
          {!collapsed && <MonoLabel className="px-1 pb-1.5">Workspace</MonoLabel>}
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={n.label}
              className={({ isActive }) =>
                collapsed
                  ? `grid h-10 w-10 place-items-center border ${
                      isActive ? "border-accent-line bg-raise text-accent" : "border-transparent text-ink2 hover:bg-hover hover:text-ink"
                    }`
                  : `flex items-center gap-2.5 border-l-2 px-2.5 py-[7px] ${
                      isActive ? "border-accent bg-raise font-medium text-ink" : "border-transparent text-ink2 hover:bg-hover hover:text-ink"
                    }`
              }
            >
              <span className={collapsed ? "" : "w-4 text-center text-muted"}>{n.icon}</span>
              {!collapsed && n.label}
            </NavLink>
          ))}
        </nav>
        {collapsed ? (
          <div className="mt-auto flex flex-col items-center gap-2 border-t border-line py-3">
            {USE_MOCKS && <span title="Mock data" className="h-1.5 w-1.5 rounded-full bg-accent" />}
            <span title={`${user?.name ?? ""} ${user?.email ?? ""}`.trim()}>{avatar}</span>
            <button onClick={signOut} title="Sign out" className="text-xs text-muted hover:text-ink">
              ⎋
            </button>
            <button onClick={toggle} title="Expand sidebar" className="px-1 text-muted hover:text-ink">
              »
            </button>
          </div>
        ) : (
          <div className="mt-auto border-t border-line px-4 py-3">
            {USE_MOCKS && <MonoLabel className="mb-2 block !text-accent">● Mock data</MonoLabel>}
            <div className="flex items-center gap-2.5">
              {avatar}
              <div className="min-w-0 flex-1">
                <div className="truncate">{user?.name ?? "Signed in"}</div>
                <div className="truncate text-xs text-muted">{user?.email}</div>
              </div>
            </div>
            <button onClick={signOut} className="mt-2 text-xs text-muted hover:text-ink">
              Sign out
            </button>
          </div>
        )}
      </aside>

      {/* ---------- main, framed by hatched gutters (full width on the editor) ---------- */}
      <main className={`hatched min-w-0 flex-1 px-0 ${onEditor ? "" : "lg:px-5"}`}>
        <div className={`min-h-screen bg-bg ${onEditor ? "" : "border-x border-line"}`}>
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-line bg-bg px-5 lg:px-6">
            <span className="font-medium">{titleFor(pathname)}</span>
            <nav className="ml-3 flex gap-1 lg:hidden">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `px-2 py-1 text-sm ${isActive ? "text-accent" : "text-ink2"}`}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </header>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
