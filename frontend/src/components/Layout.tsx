import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { USE_MOCKS } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePanel } from "../lib/theme";
import { IconButton, MonoLabel } from "./ui";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▦", end: true },
  { to: "/bank", label: "Resume Bank", icon: "☰", end: false },
  { to: "/opportunities", label: "Job Opportunities", icon: "◎", end: false },
];

const titleFor = (path: string) =>
  path === "/" ? "Dashboard"
  : path.startsWith("/bank") ? "Resume Bank"
  : path.startsWith("/opportunities") ? "Job Opportunities"
  : path.startsWith("/generate") ? "New Resume"
  : path.includes("/review") ? "Review"
  : "";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 border-l-2 px-2.5 py-[7px] ${
    isActive ? "border-accent bg-raise font-medium text-ink" : "border-transparent text-ink2 hover:bg-hover hover:text-ink"
  }`;

export default function Layout() {
  const { user, signOut } = useAuth();
  const [panelOpen, setPanelOpen] = usePanel();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const panelAllowed = pathname !== "/"; // no right-hand panel on the home page
  const showPanel = panelAllowed && panelOpen;
  const initials = (user?.name ?? user?.email ?? "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen">
      {/* ---------- sidebar ---------- */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-none flex-col border-r border-line bg-side lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-4 font-semibold">
          <span className="grid h-6 w-6 place-items-center bg-solid font-mono text-xs font-medium text-on-solid">R</span>
          Resume Adapter
        </div>
        <div className="border-b border-line p-3">
          <button
            onClick={() => navigate("/generate")}
            className="flex w-full items-center justify-between bg-solid px-3 py-2.5 font-medium text-on-solid hover:opacity-90"
          >
            ＋ New resume
          </button>
        </div>
        <nav className="flex flex-col border-b border-line p-3">
          <MonoLabel className="px-1 pb-1.5">Workspace</MonoLabel>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={navClass}>
              <span className="w-4 text-center text-muted">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line px-4 py-3">
          {USE_MOCKS && <MonoLabel className="mb-2 block !text-accent">● Mock data</MonoLabel>}
          <div className="flex items-center gap-2.5">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-7 w-7 border border-line" />
            ) : (
              <span className="grid h-7 w-7 place-items-center border border-accent-line bg-accent-bg font-mono text-[11px] text-accent">
                {initials}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate">{user?.name ?? "Signed in"}</div>
              <div className="truncate text-xs text-muted">{user?.email}</div>
            </div>
          </div>
          <button onClick={signOut} className="mt-2 text-xs text-muted hover:text-ink">
            Sign out
          </button>
        </div>
      </aside>

      {/* ---------- main, framed by hatched gutters ---------- */}
      <main className="hatched min-w-0 flex-1 px-0 lg:px-5">
        <div className="min-h-screen border-x border-line bg-bg">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-line bg-bg px-5 lg:px-6">
            <span className="font-medium">{titleFor(pathname)}</span>
            <nav className="ml-3 flex gap-1 lg:hidden">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `px-2 py-1 text-sm ${isActive ? "text-accent" : "text-ink2"}`}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              {panelAllowed && <button
                onClick={() => setPanelOpen(!panelOpen)}
                className={`hidden h-8 items-center gap-1.5 border px-2.5 lg:flex ${
                  panelOpen ? "border-accent-line bg-accent-bg text-accent" : "border-line text-ink2 hover:border-line2 hover:text-ink"
                }`}
                title="Toggle side panel"
              >
                ◨ <MonoLabel className="!text-inherit">Panel</MonoLabel>
              </button>}
            </div>
          </header>
          <Outlet />
        </div>
      </main>

      {/* ---------- optional right panel (contents TBD) ---------- */}
      {showPanel && (
        <aside className="sticky top-0 hidden h-screen w-80 flex-none flex-col border-l border-line bg-panel lg:flex">
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <MonoLabel>Panel</MonoLabel>
            <IconButton onClick={() => setPanelOpen(false)} title="Close panel">
              ✕
            </IconButton>
          </div>
          <div className="m-4 border border-dashed border-line2 p-4 text-[13px] text-muted">
            <MonoLabel>Content TBD</MonoLabel>
            <p className="mt-2">Optional side panel. What goes here will be decided later.</p>
          </div>
        </aside>
      )}
    </div>
  );
}
