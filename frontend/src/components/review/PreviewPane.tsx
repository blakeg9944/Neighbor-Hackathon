import { useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { contactParts, sectionEntries, toBlock, type Block, type Entry, type Seg } from "../../lib/preview";
import { DEFAULT_TEMPLATE, FIT, TEMPLATE_IDS, TEMPLATES, type TemplateConfig } from "../../lib/templates";
import { CATEGORY_LABELS, type Category, type Overrides, type Profile, type TemplateId, type Tile } from "../../lib/types";
import { MonoLabel } from "../ui";
import { PaneHeader } from "./EditorPane";

// US Letter at 96 px/in. Margins come from the template (shared/resume_templates.json).
const PAGE_W = 816;
const PAGE_H = 1056;
const PX_PER_IN = 96;

type FitStatus = { f: number; h: number; status: "fit" | "short" | "overflow" };

/** `n` points scaled by the fit factor (the --f CSS variable set during auto-fit). */
const pt = (n: number) => `calc(var(--f) * ${n}pt)`;

/**
 * Right pane: an instant HTML look-alike of the generated PDF. Same fonts, sizes, layout and auto-fit
 * limits as backend/app/services/pdf.py: text and spacing scale between fit.min and fit.max so the
 * resume fills one page; warnings show when it's still too long or rather short. The paper is always
 * white with black text, like the real PDF, regardless of the app's light/dark theme.
 */
export default function PreviewPane({
  profile,
  order,
  sections,
  overrides,
  labels,
  template,
  onTemplate,
  highlight,
}: {
  profile: Profile | null;
  order: Category[];
  sections: Record<Category, Tile[]>;
  overrides: Overrides;
  labels: Partial<Record<Category, string>>;
  template: TemplateId;
  onTemplate: (t: TemplateId) => void;
  highlight: Set<string>;
}) {
  const t: TemplateConfig = TEMPLATES[template] ?? TEMPLATES[DEFAULT_TEMPLATE];
  const marginX = t.margins.x * PX_PER_IN;
  const marginY = t.margins.y * PX_PER_IN;
  const contentH = PAGE_H - 2 * marginY; // printable height of one page

  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [fit, setFit] = useState<FitStatus>({ f: 1, h: 0, status: "fit" });
  const [fontsTick, refit] = useReducer((n: number) => n + 1, 0);

  // Zoom the paper to the pane width.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = Math.max(0.2, Math.min(1.25, (wrap.clientWidth - 32) / PAGE_W));
        // Ignore sub-pixel changes so a resize can't feed back into another resize.
        setScale((prev) => (Math.abs(prev - next) * PAGE_W < 1 ? prev : next));
      });
    });
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  // Web fonts change text metrics once they load, so fit again then.
  useEffect(() => {
    document.fonts?.ready.then(refit);
    document.fonts?.addEventListener?.("loadingdone", refit);
    return () => document.fonts?.removeEventListener?.("loadingdone", refit);
  }, []);

  // Auto-fit (mirror of pdf.py render_resume): the largest scale in [min, max] that fits on one page.
  // Measured synchronously before paint by setting --f directly on the content element.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = (f: number) => {
      el.style.setProperty("--f", String(f));
      return el.offsetHeight;
    };
    let next: FitStatus;
    const hMax = measure(FIT.max);
    if (hMax <= contentH) {
      next = { f: FIT.max, h: hMax, status: hMax / contentH < FIT.short_below ? "short" : "fit" };
    } else {
      const hMin = measure(FIT.min);
      if (hMin > contentH) {
        next = { f: FIT.min, h: hMin, status: "overflow" };
      } else {
        let lo = FIT.min;
        let hi = FIT.max;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          if (measure(mid) <= contentH) lo = mid;
          else hi = mid;
        }
        next = { f: lo, h: measure(lo), status: "fit" };
      }
    }
    el.style.setProperty("--f", String(next.f));
    setFit((prev) => (prev.f === next.f && prev.h === next.h && prev.status === next.status ? prev : next));
  });

  const paperH = Math.max(PAGE_H, fit.h + 2 * marginY);
  const contact = profile ? contactParts(profile) : [];

  const status =
    fit.h === 0 ? null : fit.status === "overflow" ? (
      <span title="Too long even at the smallest text size: remove or shorten an entry">
        <MonoLabel className="!text-danger">{(fit.h / contentH).toFixed(1)} pages · too long</MonoLabel>
      </span>
    ) : fit.status === "short" ? (
      <span title="Even at the largest text size the page isn't full: consider adding an entry from Unused">
        <MonoLabel className="!text-accent">Short · fills {Math.round((fit.h / contentH) * 100)}%</MonoLabel>
      </span>
    ) : (
      <span title="Text and spacing were scaled to fill one page">
        <MonoLabel className="!text-ok">1 page · text {Math.round(fit.f * 100)}%</MonoLabel>
      </span>
    );

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel" data-fonts={fontsTick}>
      <PaneHeader title="Preview" right={status} />
      <div className="flex flex-none items-center gap-3 border-b border-line bg-bg px-4 py-2">
        <MonoLabel>Template</MonoLabel>
        <div className="flex border border-line" role="group" aria-label="Resume template">
          {TEMPLATE_IDS.map((id) => (
            <button
              key={id}
              onClick={() => onTemplate(id)}
              aria-pressed={template === id}
              className={`h-7 border-r border-line px-3 text-[13px] last:border-r-0 ${
                template === id ? "bg-accent-bg font-medium text-accent" : "text-ink2 hover:bg-hover hover:text-ink"
              }`}
              style={{ fontFamily: TEMPLATES[id].css_font }}
            >
              {TEMPLATES[id].label}
            </button>
          ))}
        </div>
      </div>
      {/* Always reserve the scrollbar's space: otherwise a scrollbar appearing shrinks the width, which shrinks the
          paper, which removes the scrollbar... and the preview flickers forever at some window sizes. */}
      <div ref={wrapRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-4 [scrollbar-gutter:stable]">
        <div className="mx-auto shadow-lg" style={{ width: PAGE_W * scale, height: paperH * scale }}>
          <div
            style={{
              width: PAGE_W,
              height: paperH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              position: "relative",
              background: "#ffffff",
              color: "#000000",
              fontFamily: t.css_font,
              padding: `${marginY}px ${marginX}px`,
            }}
          >
            <div ref={contentRef} style={{ fontSize: pt(t.base_size), lineHeight: pt(t.leading) }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: pt(t.name.size),
                  lineHeight: pt(t.name.size * 1.2),
                  textAlign: t.name.align,
                  color: t.name.color,
                }}
              >
                {profile?.full_name || "Your Name"}
              </div>
              {contact.length > 0 && (
                <div
                  style={{
                    fontSize: pt(t.contact.size),
                    lineHeight: pt(t.contact.size * 1.3),
                    textAlign: t.contact.align,
                    marginBottom: pt(t.contact.space_after),
                  }}
                >
                  {contact.join("  ·  ")}
                </div>
              )}
              {order.map((c) => {
                const entries = sectionEntries(c, sections[c], overrides).filter(
                  (e) => e.kind === "structured" || e.text.trim(),
                );
                if (!entries.length) return null;
                return (
                  <div key={c}>
                    <SectionHeading text={labels[c] || CATEGORY_LABELS[c]} t={t} />
                    {entries.map((e, i) => (
                      <div
                        key={i}
                        style={{
                          marginTop: i ? pt(t.entry_gap) : 0,
                          background: e.tileIds.some((id) => highlight.has(id)) ? "rgba(5, 130, 202, 0.14)" : undefined,
                          outline: e.tileIds.some((id) => highlight.has(id)) ? "1.5px solid rgba(5, 130, 202, 0.55)" : undefined,
                        }}
                      >
                        <EntryView entry={e} category={c} t={t} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            {fit.status === "overflow" && (
              <>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: marginY + contentH,
                    bottom: 0,
                    background: "rgba(220, 38, 38, 0.06)",
                    pointerEvents: "none",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: marginY + contentH,
                    borderTop: "2px dashed #dc2626",
                    pointerEvents: "none",
                  }}
                >
                  <span style={{ position: "absolute", right: 8, top: 4, font: "600 11px Helvetica, Arial, sans-serif", color: "#dc2626" }}>
                    Page 1 ends here; anything below spills onto page 2
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ text, t }: { text: string; t: TemplateConfig }) {
  const s = t.section;
  return (
    <div
      style={{
        fontWeight: 700,
        fontSize: pt(s.size),
        lineHeight: pt(s.size * 1.15),
        letterSpacing: pt(s.tracking),
        textTransform: s.caps ? "uppercase" : undefined,
        color: s.color,
        marginTop: pt(s.space_before),
        paddingBottom: "2pt",
        borderBottom: s.rule ? `${s.rule}pt solid ${s.color}` : undefined,
        marginBottom: pt(s.space_after),
      }}
    >
      {text}
    </div>
  );
}

function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) => {
        const style: CSSProperties = { fontWeight: s.b ? 700 : undefined, fontStyle: s.i ? "italic" : undefined };
        return (
          <span key={i} style={style}>
            {s.text}
          </span>
        );
      })}
    </>
  );
}

function Bullet({ text, t }: { text: string; t: TemplateConfig }) {
  return (
    <div style={{ position: "relative", paddingLeft: pt(t.bullet_indent) }}>
      <span style={{ position: "absolute", left: pt(t.bullet_indent * 0.3) }}>•</span>
      {text}
    </div>
  );
}

function EntryView({ entry, category, t }: { entry: Entry; category: Category; t: TemplateConfig }) {
  if (entry.kind === "structured") {
    return (
      <div>
        {entry.rows.map(([left, right], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <Segs segs={left} />
            </div>
            {right.length > 0 && (
              <div style={{ textAlign: "right", whiteSpace: "nowrap", flexShrink: 0, maxWidth: "45%" }}>
                <Segs segs={right} />
              </div>
            )}
          </div>
        ))}
        {entry.bullets.map((b, i) => (
          <Bullet key={i} text={b} t={t} />
        ))}
      </div>
    );
  }
  const block = toBlock(entry.text, category);
  return block ? <BlockView block={block} t={t} /> : null;
}

function BlockView({ block, t }: { block: Block; t: TemplateConfig }) {
  if (block.kind === "labeled")
    return (
      <div>
        <b>{block.label}:</b> {block.rest}
      </div>
    );
  if (block.kind === "body") return <div>{block.text}</div>;
  return (
    <div>
      <div style={{ fontWeight: 700 }}>{block.heading}</div>
      {block.lines.map((l, i) => (l.bullet ? <Bullet key={i} text={l.text} t={t} /> : <div key={i}>{l.text}</div>))}
    </div>
  );
}
