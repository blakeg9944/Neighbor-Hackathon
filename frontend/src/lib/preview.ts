// Turns the editor state into the same entries the backend prints, so the live preview matches the PDF.
// Keep in sync with backend/app/services/layout.py `section_entries`, tile_data.py `pdf_lines`
// and pdf.py `entry_parts` / `_freeform`.
import type { Category, Overrides, Tile } from "./types";

export interface PreviewLine {
  text: string;
  tileIds: string[]; // tiles that produced this line (several for grouped skills/courses)
}

/** Text run inside a row: bold/italic/link like the PDF's mini-HTML. */
export interface Seg {
  text: string;
  b?: boolean;
  i?: boolean;
  href?: string;
}
export type Row = [Seg[], Seg[]]; // left, right-aligned

/** One printed entry. Structured tiles get rows with right-aligned dates; others are freeform text. */
export type Entry =
  | { kind: "structured"; rows: Row[]; bullets: string[]; tileIds: string[] }
  | { kind: "text"; text: string; tileIds: string[] };

/** Section tiles (in layout order) -> printed lines. Skills/courses with structured data are regrouped. */
export function pdfLines(category: Category, tiles: Tile[], overrides: Overrides): PreviewLine[] {
  const eff = applyOverrides(tiles, overrides);
  if (category !== "skills" && category !== "coursework") {
    return eff.map((t) => ({ text: t.text, tileIds: [t.id] }));
  }
  type Group = { label: string; names: string[]; tileIds: string[] };
  const out: (PreviewLine | Group)[] = [];
  const groups = new Map<string, Group>();
  for (const t of eff) {
    const data = t.data as { group?: string | null; name?: string | null } | null | undefined;
    if (!data) {
      out.push({ text: t.text, tileIds: [t.id] });
      continue;
    }
    const key = category === "skills" ? data.group || "" : "Relevant Coursework";
    let g = groups.get(key);
    if (!g) {
      g = { label: key, names: [], tileIds: [] };
      groups.set(key, g);
      out.push(g);
    }
    g.names.push(data.name || t.text);
    g.tileIds.push(t.id);
  }
  return out.map((x) =>
    "names" in x
      ? { text: x.label ? `${x.label}: ${x.names.join(", ")}` : x.names.join(", "), tileIds: x.tileIds }
      : x,
  );
}

/** A per-resume override replaces the text and makes the tile freeform for this resume. */
const applyOverrides = (tiles: Tile[], overrides: Overrides) =>
  tiles.map((t) => (overrides[t.id] !== undefined ? { ...t, text: overrides[t.id], data: null } : t));

/** Mirror of layout.py section_entries: what one section prints, entry by entry. */
export function sectionEntries(category: Category, tiles: Tile[], overrides: Overrides): Entry[] {
  if (category === "skills" || category === "coursework") {
    return pdfLines(category, tiles, overrides).map((l) => ({ kind: "text", text: l.text, tileIds: l.tileIds }));
  }
  return applyOverrides(tiles, overrides).map((t) => {
    if (!t.data) return { kind: "text", text: t.text, tileIds: [t.id] };
    const { rows, bullets } = entryParts(t.category, t.data as Record<string, unknown>);
    return { kind: "structured", rows, bullets, tileIds: [t.id] };
  });
}

const dash = (s?: string | null) => (s && s.trim() ? s.trim().replace(/\s*[-–—]\s*/g, " – ") : "");
const dates = (a?: string | null, b?: string | null) => [dash(a), dash(b)].filter(Boolean).join(" – ");
export const toUrl = (link: string) => (/^[a-z]+:/i.test(link) ? link : `https://${link}`);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);

/** Mirror of pdf.py entry_parts: structured data -> rows of (left, right) runs + bullets. */
export function entryParts(category: Category, d: Record<string, unknown>): { rows: Row[]; bullets: string[] } {
  const rows: Row[] = [];
  let bullets = list(d.bullets);
  const b = (t: string): Seg[] => (t ? [{ text: t, b: true }] : []);
  const i = (t: string): Seg[] => (t ? [{ text: t, i: true }] : []);
  const plain = (t: string): Seg[] => (t ? [{ text: t }] : []);
  if (category === "experience") {
    rows.push([b(str(d.title)), plain(dates(str(d.start_date), str(d.end_date)))]);
    if (str(d.organization) || str(d.location)) rows.push([i(str(d.organization)), i(str(d.location))]);
  } else if (category === "education") {
    let degree = [str(d.degree_type), str(d.degree)].filter(Boolean).join(" ");
    if (str(d.minor)) degree = degree ? `${degree}, Minor in ${str(d.minor)}` : `Minor in ${str(d.minor)}`;
    if (str(d.gpa)) degree = degree ? `${degree} · GPA ${str(d.gpa)}` : `GPA ${str(d.gpa)}`;
    rows.push([b(str(d.institution)), plain(dates(str(d.start_date), str(d.end_date)))]);
    if (degree || str(d.location)) rows.push([i(degree), i(str(d.location))]);
    bullets = list(d.details);
  } else if (category === "projects") {
    const tech = list(d.technologies);
    const left = [...b(str(d.name)), ...(tech.length ? [{ text: " · " }, { text: tech.join(", "), i: true }] : [])];
    rows.push([left, plain(dash(str(d.date)))]);
    if (str(d.link)) rows.push([[{ text: str(d.link), i: true, href: toUrl(str(d.link)) }], []]);
  } else {
    const left = [...b(str(d.title)), ...(str(d.organization) ? [{ text: `, ${str(d.organization)}` }] : [])];
    rows.push([left, plain(dash(str(d.date)))]);
  }
  return { rows, bullets };
}

export type Block =
  | { kind: "labeled"; label: string; rest: string } // "Languages: Python, SQL" -> bold label
  | { kind: "body"; text: string }
  | { kind: "entry"; heading: string; lines: { bullet: boolean; text: string }[] };

/** Freeform text -> how the PDF lays it out (mirror of pdf.py _freeform; §4.2 tile text convention). */
export function toBlock(text: string, category: Category): Block | null {
  const lines = text.trim().split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
  if (!lines.length) return null;
  const first = lines[0];
  const at = first.indexOf(": ");
  const label = at >= 0 ? first.slice(0, at) : "";
  const rest = at >= 0 ? first.slice(at + 2) : "";
  if (lines.length === 1 && at >= 0 && category === "coursework" && /cours/i.test(label)) return { kind: "body", text: rest };
  if (lines.length === 1 && at >= 0 && label.length <= 30) return { kind: "labeled", label, rest };
  if (lines.length === 1 && category === "skills") return { kind: "body", text: first };
  return {
    kind: "entry",
    heading: first.replace(/(?<=\w)\s+[-–—]\s+(?=\w)/g, " – "),
    lines: lines.slice(1).map((l) =>
      l.trimStart().startsWith("•") ? { bullet: true, text: l.trimStart().slice(1).trim() } : { bullet: false, text: l },
    ),
  };
}

/** Contact line pieces, in the PDF's order: email, phone, location, links (shown without https://www.). */
export function contactParts(p: { email?: string | null; phone?: string | null; location?: string | null; links?: string[] }) {
  return [
    p.email,
    p.phone,
    p.location,
    ...(p.links ?? []).filter(Boolean).map((l) => l.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")),
  ].filter((x): x is string => !!x);
}
