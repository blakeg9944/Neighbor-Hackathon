import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { Link, useParams } from "react-router-dom";
import PdfModal, { pdfFilename } from "../components/PdfModal";
import EditorPane, { rowDomId, type Containers, type Editing } from "../components/review/EditorPane";
import JobPointsPane from "../components/review/JobPointsPane";
import PreviewPane from "../components/review/PreviewPane";
import { Button, ErrorBanner, errorMessage, formatStamp, MonoLabel, Spinner } from "../components/ui";
import { Api } from "../lib/api";
import { safeStorage, usePref } from "../lib/storage";
import {
  CATEGORY_ORDER, normalizeOrder, toLayout,
  type Category, type GeneratedPdf, type JobDetail, type Matches, type Overrides, type Profile, type TemplateId,
  type Tile,
} from "../lib/types";
import { DEFAULT_TEMPLATE, TEMPLATES } from "../lib/templates";

// The three side-by-side panes. Users toggle which are open and drag the separators to resize them;
// both choices are remembered per browser.
const PANES = [
  { id: "points", label: "Job points", base: 24, min: "14" },
  { id: "editor", label: "Editor", base: 42, min: "24" },
  { id: "preview", label: "Preview", base: 34, min: "18" },
] as const;
type PaneId = (typeof PANES)[number]["id"];

export default function Review() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [containers, setContainers] = useState<Containers | null>(null);
  const [order, setOrder] = useState<Category[]>(CATEGORY_ORDER);
  // Per-resume text edits (tile id -> text). Saved with this resume's layout; Your Resume is untouched.
  const [overrides, setOverrides] = useState<Overrides>({});
  const [matches, setMatches] = useState<Matches>({});
  const [template, setTemplate] = useState<TemplateId>(DEFAULT_TEMPLATE);
  const [labels, setLabels] = useState<Partial<Record<Category, string>>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [trayOpen, setTrayOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [repicking, setRepicking] = useState(false);
  const [viewing, setViewing] = useState<GeneratedPdf | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [panes, setPanes] = usePref<Record<PaneId, boolean>>("ra-review-panes", {
    points: true,
    editor: true,
    preview: true,
  });
  const visible = PANES.filter((p) => panes[p.id]);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "ra-review-pane-sizes",
    panelIds: visible.map((p) => p.id),
    storage: safeStorage,
  });

  const applyJob = (j: JobDetail) => {
    setJob(j);
    setContainers({ ...j.layout.sections, unused: j.layout.unused });
    setOverrides(j.layout.overrides ?? {});
    setOrder(normalizeOrder(j.layout.order));
    setMatches(j.layout.matches ?? {});
    setTemplate(j.layout.template && j.layout.template in TEMPLATES ? j.layout.template : DEFAULT_TEMPLATE);
    setLabels(j.layout.labels ?? {});
  };

  useEffect(() => {
    Api.getJob(id!).then(applyJob).catch((e) => setError(errorMessage(e)));
    Api.getMe().then(setProfile).catch(() => {}); // resume header in the preview; optional
  }, [id]);

  const placed = useMemo(
    () => new Set(containers ? CATEGORY_ORDER.flatMap((c) => containers[c].map((t) => t.id)) : []),
    [containers],
  );
  const unusedIds = useMemo(() => new Set(containers?.unused.map((t) => t.id) ?? []), [containers]);

  if (error && !job) return <ErrorBanner error={error} />;
  if (!job || !containers)
    return (
      <div className="flex justify-center py-20 text-muted">
        <Spinner className="h-5 w-5" />
      </div>
    );

  const markDirty = () => setDirty(true);

  const currentLayout = () => {
    const { unused, ...sections } = containers;
    return toLayout({ sections, unused, overrides, order, matches, template, labels });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await Api.saveLayout(job.id, currentLayout());
      setDirty(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  /** Re-run the AI selection against Your Resume (also extracts requirements for older jobs). */
  const repick = async () => {
    setRepicking(true);
    setError(null);
    try {
      applyJob(await Api.autoselect(job.id));
      setEditingId(null);
      setDirty(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRepicking(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const pdf = await Api.generatePdf(job.id, currentLayout());
      setJob({ ...job, pdfs: [pdf, ...job.pdfs] });
      setViewing(pdf);
      setDirty(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGenerating(false);
    }
  };

  const editing: Editing = {
    overrides,
    editingId,
    onEdit: setEditingId,
    onSave: (tile: Tile, text: string) => {
      setEditingId(null);
      setOverrides((o) => {
        const next = { ...o };
        if (text === tile.text) delete next[tile.id]; // same as Your Resume: no override needed
        else next[tile.id] = text;
        return next;
      });
      markDirty();
    },
    onCancel: () => setEditingId(null),
    onRevert: (tileId: string) => {
      setOverrides((o) => {
        const next = { ...o };
        delete next[tileId];
        return next;
      });
      markDirty();
    },
  };

  /** Click on a job point: open the tray if needed and scroll the first matching entry into view. */
  const jumpTo = (ids: string[]) => {
    if (ids.some((i) => unusedIds.has(i))) setTrayOpen(true);
    if (!panes.editor) setPanes({ ...panes, editor: true });
    requestAnimationFrame(() =>
      document.getElementById(rowDomId(ids[0]))?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  };

  const togglePane = (p: PaneId) => {
    const next = { ...panes, [p]: !panes[p] };
    if (Object.values(next).some(Boolean)) setPanes(next); // keep at least one pane open
  };

  const sum = visible.reduce((n, p) => n + p.base, 0);

  const paneContent = (p: PaneId) =>
    p === "points" ? (
      <JobPointsPane
        job={job}
        matches={matches}
        placed={placed}
        unusedIds={unusedIds}
        onHover={(ids) => setHighlight(new Set(ids ?? []))}
        onJump={jumpTo}
        onAnalyze={repick}
        analyzing={repicking}
      />
    ) : p === "editor" ? (
      <EditorPane
        containers={containers}
        setContainers={setContainers}
        order={order}
        setOrder={setOrder}
        editing={editing}
        highlight={highlight}
        trayOpen={trayOpen}
        setTrayOpen={setTrayOpen}
        unusedPlacement={visible.length === 3 ? "tray" : "column"} // the column only fits when a pane is hidden
        labels={labels}
        onRename={(c, label) => {
          setLabels((prev) => {
            const next = { ...prev };
            if (label) next[c] = label;
            else delete next[c];
            return next;
          });
          markDirty();
        }}
        onDirty={markDirty}
      />
    ) : (
      <PreviewPane
        profile={profile}
        order={order}
        sections={containers}
        overrides={overrides}
        labels={labels}
        template={template}
        onTemplate={(t) => {
          if (t !== template) {
            setTemplate(t);
            markDirty();
          }
        }}
        highlight={highlight}
      />
    );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* ---------- header ---------- */}
      <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3">
        <div className="min-w-0 flex-1">
          <MonoLabel className="block">
            <Link to="/" className="hover:text-ink">
              Dashboard
            </Link>{" "}
            / Resume editor
          </MonoLabel>
          <div className="truncate text-lg font-semibold tracking-[-0.01em]">
            {job.title ?? "Tailored resume"}
            {job.company && <span className="font-normal text-ink2"> · {job.company}</span>}
          </div>
        </div>
        <div className="flex border border-line" role="group" aria-label="Show panes">
          {PANES.map((p) => (
            <button
              key={p.id}
              onClick={() => togglePane(p.id)}
              aria-pressed={panes[p.id]}
              title={`${panes[p.id] ? "Hide" : "Show"} ${p.label}`}
              className={`h-8 border-r border-line px-3 last:border-r-0 ${
                panes[p.id] ? "bg-accent-bg text-accent" : "text-muted hover:bg-hover hover:text-ink"
              }`}
            >
              <MonoLabel className="!text-inherit">{p.label}</MonoLabel>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonoLabel className="mr-1">{dirty ? "Unsaved" : "Saved"}</MonoLabel>
          <Button onClick={repick} disabled={repicking} title="Pick entries again from Your Resume (replaces this layout)">
            {repicking && <Spinner />} Re-pick
          </Button>
          <Button onClick={save} disabled={!dirty || saving}>
            {saving && <Spinner />} Save
          </Button>
          <PdfMenu pdfs={job.pdfs} onView={setViewing} filename={pdfFilename(job.title, job.company)} />
          <Button variant="primary" onClick={generate} disabled={generating || placed.size === 0}>
            {generating && <Spinner />} Generate PDF
          </Button>
        </div>
      </div>
      <ErrorBanner error={error} />

      {/* ---------- panes ---------- */}
      <Group
        key={visible.map((p) => p.id).join("-")} // remount (restoring that combination's sizes) when panes toggle
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="min-h-0 flex-1"
      >
        {visible.map((p, i) => (
          <Fragment key={p.id}>
            {i > 0 && (
              <Separator className="w-1 bg-line transition-colors hover:bg-accent-line focus-visible:bg-accent focus-visible:outline-none" />
            )}
            <Panel id={p.id} defaultSize={`${(p.base / sum) * 100}`} minSize={p.min} className="h-full">
              {paneContent(p.id)}
            </Panel>
          </Fragment>
        ))}
      </Group>

      <PdfModal pdf={viewing} filename={pdfFilename(job.title, job.company)} onClose={() => setViewing(null)} />
    </div>
  );
}

/** "PDFs · n ▾" dropdown with every generated PDF for this job, newest first. */
function PdfMenu({
  pdfs,
  onView,
  filename,
}: {
  pdfs: GeneratedPdf[];
  onView: (pdf: GeneratedPdf) => void;
  filename: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button onClick={() => setOpen((o) => !o)} disabled={!pdfs.length} aria-expanded={open}>
        PDFs · {pdfs.length} ▾
      </Button>
      {open && (
        <div className="absolute top-full right-0 z-40 mt-1 w-80 border border-line2 bg-bg shadow-xl">
          <div className="border-b border-line bg-panel px-3 py-2">
            <MonoLabel>Generated PDFs · newest first</MonoLabel>
          </div>
          {pdfs.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 last:border-b-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">{formatStamp(p.created_at)}</span>
                {i === 0 && (
                  <span className="label-mono border border-accent-line bg-accent-bg px-1.5 !text-accent">Latest</span>
                )}
              </div>
              <div className="flex gap-3 text-[13px]">
                <button
                  onClick={() => {
                    setOpen(false);
                    onView(p);
                  }}
                  className="text-accent hover:underline"
                >
                  View
                </button>
                <a href={p.url} download={filename} className="text-accent hover:underline">
                  Download ↓
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
