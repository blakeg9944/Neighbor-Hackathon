import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_ORDER, type Category } from "../lib/types";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
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
      className={`rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none ${className}`}
    >
      {CATEGORY_ORDER.map((c) => (
        <option key={c} value={c}>
          {CATEGORY_LABELS[c]}
        </option>
      ))}
    </select>
  );
}

/** Renders tile text per DESIGN_SPEC §4.2: bold first line, "• " lines as bullets. */
export function TileText({ text, compact = false }: { text: string; compact?: boolean }) {
  const [heading, ...rest] = text.split("\n");
  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <div className="font-semibold text-slate-900">{heading}</div>
      {rest.map((line, i) =>
        line.startsWith("•") ? (
          <div key={i} className="flex gap-1.5 pl-1 text-slate-600">
            <span>•</span>
            <span>{line.replace(/^•\s*/, "")}</span>
          </div>
        ) : (
          <div key={i} className="text-slate-600">
            {line}
          </div>
        ),
      )}
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl ${wide ? "max-w-4xl" : "max-w-2xl"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="font-semibold text-slate-900">{title}</div>
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-700">
            ×
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
