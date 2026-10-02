import { useEffect, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from "react";
import { CATEGORY_LABELS, CATEGORY_ORDER, type Category } from "../lib/types";

// Shared building blocks for the hybrid design (design/mockups/6-hybrid.html):
// square corners, hairline borders, Geist + Geist Mono, color tokens from index.css.

type Variant = "primary" | "solid" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "border-accent bg-accent text-on-accent hover:border-solid hover:bg-solid hover:text-on-solid",
  solid: "border-solid bg-solid text-on-solid hover:opacity-90",
  secondary: "border-line2 bg-bg text-ink hover:bg-hover",
  ghost: "border-transparent text-ink2 hover:bg-hover hover:text-ink",
  danger: "border-danger bg-danger text-white hover:opacity-90",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex h-[34px] items-center justify-center gap-2 border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function MonoLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`label-mono ${className}`}>{children}</span>;
}

/** Full-width band header used above each list group: "EDUCATION · 1". */
export function GroupHeader({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-line bg-panel px-5 py-2 lg:px-7">
      <MonoLabel>{children}</MonoLabel>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

/** Top-of-page section with a bottom hairline. */
export function Band({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`border-b border-line px-5 py-7 lg:px-7 ${className}`}>{children}</section>;
}

export function PageTitle({ kicker, title, sub }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      {kicker && <MonoLabel className="mb-1.5 block">{kicker}</MonoLabel>}
      <h1 className="text-[30px] leading-tight font-semibold tracking-[-0.025em]">{title}</h1>
      {sub && <p className="mt-1.5 max-w-2xl text-ink2">{sub}</p>}
    </div>
  );
}

/** "URL | input | Make a Resume →" joined control. */
export function UrlForm({
  initial = "",
  disabled = false,
  onSubmit,
}: {
  initial?: string;
  disabled?: boolean;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState(initial);
  useEffect(() => setUrl(initial), [initial]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) onSubmit(url.trim());
  };
  return (
    <form onSubmit={submit} className="mt-5 flex max-w-3xl border border-line2 bg-bg">
      <span className="label-mono grid place-items-center border-r border-line px-3">URL</span>
      <input
        type="url"
        required
        value={url}
        disabled={disabled}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://boards.greenhouse.io/company/jobs/123"
        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 outline-none placeholder:text-muted disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled}
        className="border-l border-accent bg-accent px-4 font-medium whitespace-nowrap text-on-accent transition-colors hover:border-solid hover:bg-solid hover:text-on-solid disabled:opacity-50"
      >
        Make a Resume →
      </button>
    </form>
  );
}

export function CategorySelect({
  value,
  onChange,
  className = "",
}: {
  value: Category;
  onChange: (c: Category) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Category)}
      className={`border border-line bg-bg px-1.5 py-1 text-xs text-ink2 outline-none focus:border-accent ${className}`}
    >
      {CATEGORY_ORDER.map((c) => (
        <option key={c} value={c}>
          {CATEGORY_LABELS[c]}
        </option>
      ))}
    </select>
  );
}

/** Renders tile text per DESIGN_SPEC §4.2: first line is the heading, "• " lines are bullets. */
export function TileText({ text }: { text: string }) {
  const [heading, ...rest] = text.split("\n");
  return (
    <div className="min-w-0">
      <div className="font-medium">{heading}</div>
      {rest.length > 0 && (
        <div className="mt-0.5 text-[13px] text-ink2">
          {rest.map((line, i) =>
            line.startsWith("•") ? (
              <div key={i} className="flex gap-2">
                <span className="text-muted">–</span>
                <span>{line.replace(/^•\s*/, "")}</span>
              </div>
            ) : (
              <div key={i}>{line}</div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Inline editor for an entry's text. Ctrl/Cmd+Enter saves, Esc cancels. */
export function TileEditor({
  initial,
  onSave,
  onCancel,
  saveLabel = "Save",
  note,
}: {
  initial: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  saveLabel?: string;
  note?: ReactNode;
}) {
  const [text, setText] = useState(initial);
  const lines = Math.min(Math.max(text.split("\n").length + 1, 3), 12);
  const save = () => text.trim() && onSave(text.trim());
  return (
    <div className="flex min-w-0 flex-col gap-2" onPointerDown={(e) => e.stopPropagation()}>
      <textarea
        autoFocus
        value={text}
        rows={lines}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation(); // keep Space/Enter away from drag-and-drop keyboard handling
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
        }}
        className="w-full resize-y border border-accent bg-bg px-3 py-2 outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={save} disabled={!text.trim()}>
          {saveLabel}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
        <span className="text-xs text-muted">
          {note ?? "First line is the heading; start lines with “• ” for bullets."} Ctrl+Enter to save.
        </span>
      </div>
    </div>
  );
}

/** The trimdcv mark. Transparent PNG; in dark mode it sits on white so the dark tie stays visible. */
export function Logo({ className = "h-10 w-10" }: { className?: string }) {
  return <img src="/logo.png" alt="" className={`flex-none p-px dark:bg-white ${className}`} />;
}

/** Wordmark: "trimd" in Geist (ink) + "cv" in Geist Mono (logo blue). Size it with a text-* class. */
export function Wordmark({ className = "text-[22px]" }: { className?: string }) {
  return (
    <span className={`leading-none tracking-[-0.03em] whitespace-nowrap ${className}`} aria-label="trimdcv">
      <span className="font-sans font-semibold text-ink">trimd</span>
      <span className="font-mono font-medium text-brand">cv</span>
    </span>
  );
}

/** Square icon button for row actions (×). */
export function IconButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`grid h-[26px] w-[26px] flex-none place-items-center border border-transparent text-muted hover:border-line2 hover:text-ink ${className}`}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden border border-line2 bg-bg shadow-2xl ${wide ? "max-w-4xl" : "max-w-2xl"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-14 flex-none items-center justify-between border-b border-line px-5">
          <div className="min-w-0 truncate font-medium">{title}</div>
          <IconButton onClick={onClose} title="Close">
            ✕
          </IconButton>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>;
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "2026-10-02 11:00" for mono table cells. */
export const formatStamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
