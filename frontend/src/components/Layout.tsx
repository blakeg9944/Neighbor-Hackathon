import { NavLink, Outlet } from "react-router-dom";
import { USE_MOCKS } from "../lib/api";
import { useAuth } from "../lib/auth";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

export default function Layout() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <NavLink to="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <img src="/icon48.png" alt="" className="h-7 w-7 [image-rendering:pixelated]" />
            Resume Adapter
          </NavLink>
          <nav className="flex gap-1">
            <NavLink to="/" end className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/bank" className={linkClass}>
              Resume Bank
            </NavLink>
            <NavLink to="/generate" className={linkClass}>
              New Resume
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {USE_MOCKS && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Mock data
              </span>
            )}
            {user?.avatarUrl && <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />}
            <span className="hidden text-sm text-slate-600 sm:inline">{user?.name ?? user?.email}</span>
            <button onClick={signOut} className="text-sm text-slate-500 hover:text-slate-900">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
