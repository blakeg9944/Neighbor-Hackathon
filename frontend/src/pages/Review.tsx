import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PdfModal, { pdfFilename } from "../components/PdfModal";
import { Band, Button, ErrorBanner, errorMessage, GroupHeader, IconButton, MonoLabel, PageTitle, Spinner, TileText } from "../components/ui";
import { Api } from "../lib/api";
import {
  CATEGORY_LABELS, CATEGORY_ORDER, toLayout,
  type Category, type GeneratedPdf, type JobDetail, type Tile,
} from "../lib/types";

type ContainerId = Category | "unused";
type Containers = Record<ContainerId, Tile[]>;

export default function Review() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [containers, setContainers] = useState<Containers | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [repicking, setRepicking] = useState(false);
  const [pdf, setPdf] = useState<GeneratedPdf | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Api.getJob(id!)
      .then((j) => {
        setJob(j);
        setContainers({ ...j.layout.sections, unused: j.layout.unused });
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // lets the X button receive clicks
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const tilesById = useMemo(
    () => new Map(containers ? Object.values(containers).flat().map((t) => [t.id, t]) : []),
    [containers],
  );

  if (error && !job) return <ErrorBanner error={error} />;
  if (!job || !containers)
    return (
      <div className="flex justify-center py-20 text-muted">
        <Spinner className="h-5 w-5" />
      </div>
    );

  const findContainer = (itemId: string): ContainerId | undefined => {
    if (itemId in containers) return itemId as ContainerId;
    return (Object.keys(containers) as ContainerId[]).find((c) => containers[c].some((t) => t.id === itemId));
  };

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));

  // Moving between containers happens during drag so the drop target previews the row.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findContainer(String(active.id));
    const to = findContainer(String(over.id));
    if (!from || !to || from === to) return;
    setContainers((prev) => {
      if (!prev) return prev;
      const moving = prev[from].find((t) => t.id === active.id);
      if (!moving) return prev;
      const overIndex = prev[to].findIndex((t) => t.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : prev[to].length;
      return {
        ...prev,
        [from]: prev[from].filter((t) => t.id !== active.id),
        [to]: [...prev[to].slice(0, insertAt), moving, ...prev[to].slice(insertAt)],
      };
    });
    setDirty(true);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const from = findContainer(String(active.id));
    const to = findContainer(String(over.id));
    if (!from || from !== to) return;
    const oldIndex = containers[from].findIndex((t) => t.id === active.id);
    const newIndex = containers[to].findIndex((t) => t.id === over.id);
    if (newIndex >= 0 && oldIndex !== newIndex) {
      setContainers({ ...containers, [from]: arrayMove(containers[from], oldIndex, newIndex) });
      setDirty(true);
    }
  };

  /** Review-page X: remove from this resume only (moves to Unused); the bank is untouched. */
  const moveToUnused = (tileId: string) => {
    const from = findContainer(tileId);
    if (!from || from === "unused") return;
    const tile = containers[from].find((t) => t.id === tileId)!;
    setContainers({ ...containers, [from]: containers[from].filter((t) => t.id !== tileId), unused: [tile, ...containers.unused] });
    setDirty(true);
  };

  const currentLayout = () => {
    const { unused, ...sections } = containers;
    return toLayout({ sections, unused });
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

  /** Re-run the AI tile selection against the current bank (e.g. after re-uploading a resume). */
  const repick = async () => {
    setRepicking(true);
    setError(null);
    try {
      const j = await Api.autoselect(job.id);
      setJob(j);
      setContainers({ ...j.layout.sections, unused: j.layout.unused });
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
      setPdf(await Api.generatePdf(job.id, currentLayout()));
      setDirty(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGenerating(false);
    }
  };

  const activeTile = activeId ? tilesById.get(activeId) : undefined;
  const usedCount = CATEGORY_ORDER.reduce((n, c) => n + containers[c].length, 0);
  // Running row numbers across all sections (01, 02, ...) in resume order.
  const numberOf = new Map(CATEGORY_ORDER.flatMap((c) => containers[c]).map((t, i) => [t.id, i + 1]));

  return (
    <div>
      <Band className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          kicker={
            <>
              <Link to="/" className="hover:text-ink">
                Dashboard
              </Link>{" "}
              / Review{job.company ? ` · ${job.company}` : ""}
            </>
          }
          title={job.title ?? "Tailored resume"}
          sub={
            <>
              {job.company && <>{job.company} · </>}
              <a href={job.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                job posting ↗
              </a>{" "}
              · drag rows to reorder or move them between sections
            </>
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <MonoLabel className="mr-1">{dirty ? "Unsaved" : "Saved"}</MonoLabel>
          <Button
            onClick={repick}
            disabled={repicking}
            title="Pick entries again from your current resume bank (replaces this layout)"
          >
            {repicking && <Spinner />} Re-pick
          </Button>
          <Button onClick={save} disabled={!dirty || saving}>
            {saving && <Spinner />} Save
          </Button>
          <Button variant="primary" onClick={generate} disabled={generating || usedCount === 0}>
            {generating && <Spinner />} Generate PDF
          </Button>
        </div>
      </Band>
      <ErrorBanner error={error} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid items-start lg:grid-cols-[1fr_300px]">
          <div className="border-line lg:border-r">
            {CATEGORY_ORDER.map((c) => (
              <Section
                key={c}
                id={c}
                title={`${CATEGORY_LABELS[c]} · ${containers[c].length}`}
                tiles={containers[c]}
                numberOf={numberOf}
                onRemove={moveToUnused}
              />
            ))}
          </div>
          <div className="lg:sticky lg:top-14 lg:max-h-[calc(100vh-3.5rem)] lg:overflow-y-auto">
            <Section id="unused" title={`Unused · ${containers.unused.length}`} tiles={containers.unused} unused />
          </div>
        </div>
        <DragOverlay>{activeTile ? <Row tile={activeTile} overlay /> : null}</DragOverlay>
      </DndContext>

      <PdfModal pdf={pdf} filename={pdfFilename(job.title, job.company)} onClose={() => setPdf(null)} />
    </div>
  );
}

function Section({
  id,
  title,
  tiles,
  numberOf,
  onRemove,
  unused = false,
}: {
  id: ContainerId;
  title: string;
  tiles: Tile[];
  numberOf?: Map<string, number>;
  onRemove?: (id: string) => void;
  unused?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section>
      <GroupHeader>{title}</GroupHeader>
      <SortableContext items={tiles.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`min-h-12 ${isOver ? "bg-accent-bg" : ""}`}>
          {tiles.map((t) => (
            <SortableRow key={t.id} tile={t} number={numberOf?.get(t.id)} onRemove={onRemove} unused={unused} />
          ))}
          {tiles.length === 0 && (
            <div className="mx-5 my-3 border border-dashed border-line2 py-2.5 text-center text-muted lg:mx-6">
              <MonoLabel>Drop entries here</MonoLabel>
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableRow(props: { tile: Tile; number?: number; onRemove?: (id: string) => void; unused?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.tile.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-30" : ""}
      {...attributes}
      {...listeners}
    >
      <Row {...props} />
    </div>
  );
}

function Row({
  tile,
  number,
  onRemove,
  unused,
  overlay,
}: {
  tile: Tile;
  number?: number;
  onRemove?: (id: string) => void;
  unused?: boolean;
  overlay?: boolean;
}) {
  return (
    <div
      className={`group flex cursor-grab items-start gap-3 border-b border-line px-5 py-3 active:cursor-grabbing lg:px-6 ${
        overlay ? "border border-accent bg-bg shadow-xl" : "bg-bg hover:bg-hover"
      }`}
    >
      <span className="pt-px text-line2 select-none group-hover:text-muted">⠿</span>
      {number !== undefined && (
        <span className="w-5 flex-none pt-0.5 font-mono text-[11px] text-muted">{String(number).padStart(2, "0")}</span>
      )}
      <div className="min-w-0 flex-1">
        <TileText text={tile.text} />
        {unused && <MonoLabel className="mt-1 block">{CATEGORY_LABELS[tile.category]}</MonoLabel>}
      </div>
      {onRemove && (
        <IconButton
          onClick={() => onRemove(tile.id)}
          onPointerDown={(e) => e.stopPropagation()}
          title="Remove from this resume (moves to Unused)"
        >
          ✕
        </IconButton>
      )}
    </div>
  );
}
