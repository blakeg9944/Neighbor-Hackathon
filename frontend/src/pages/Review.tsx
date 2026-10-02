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
import { Button, CategoryBadge, ErrorBanner, errorMessage, Spinner, TileText } from "../components/ui";
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
      <div className="flex justify-center py-20 text-slate-400">
        <Spinner />
      </div>
    );

  const findContainer = (itemId: string): ContainerId | undefined => {
    if (itemId in containers) return itemId as ContainerId;
    return (Object.keys(containers) as ContainerId[]).find((c) => containers[c].some((t) => t.id === itemId));
  };

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));

  // Moving between containers happens during drag so the drop target previews the tile.
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/" className="text-xs text-slate-500 hover:text-slate-800">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">{job.title ?? "Tailored resume"}</h1>
          <div className="text-sm text-slate-500">
            {job.company} ·{" "}
            <a href={job.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
              job posting ↗
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <Button variant="secondary" onClick={save} disabled={!dirty || saving}>
            {saving ? <Spinner className="h-4 w-4" /> : null} Save
          </Button>
          <Button onClick={generate} disabled={generating || usedCount === 0}>
            {generating ? <Spinner className="h-4 w-4" /> : null} Generate PDF
          </Button>
        </div>
      </div>
      <ErrorBanner error={error} />
      <p className="text-sm text-slate-500">
        Drag tiles to reorder them or move them between sections. Drag from <b>Unused</b> to add, or click × to remove.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            {CATEGORY_ORDER.map((c) => (
              <Container key={c} id={c} title={CATEGORY_LABELS[c]} tiles={containers[c]} onRemove={moveToUnused} />
            ))}
          </div>
          <div className="lg:sticky lg:top-20">
            <Container
              id="unused"
              title={`Unused (${containers.unused.length})`}
              tiles={containers.unused}
              sidebar
            />
          </div>
        </div>
        <DragOverlay>{activeTile ? <TileCard tile={activeTile} overlay /> : null}</DragOverlay>
      </DndContext>

      <PdfModal pdf={pdf} filename={pdfFilename(job.title, job.company)} onClose={() => setPdf(null)} />
    </div>
  );
}

function Container({
  id,
  title,
  tiles,
  onRemove,
  sidebar = false,
}: {
  id: ContainerId;
  title: string;
  tiles: Tile[];
  onRemove?: (id: string) => void;
  sidebar?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      className={
        sidebar
          ? "flex max-h-[calc(100vh-7rem)] flex-col rounded-xl border border-slate-200 bg-slate-100 p-4"
          : ""
      }
    >
      <h2 className="mb-2 border-b border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-600">
        {title}
      </h2>
      <SortableContext items={tiles.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex min-h-14 flex-col gap-2 rounded-lg p-1 transition ${sidebar ? "overflow-y-auto" : ""} ${
            isOver ? "bg-indigo-50 ring-2 ring-indigo-200" : ""
          }`}
        >
          {tiles.map((t) => (
            <SortableTile key={t.id} tile={t} onRemove={onRemove} showCategory={sidebar} />
          ))}
          {tiles.length === 0 && (
            <div className="flex h-12 items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-400">
              Drop tiles here
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableTile({
  tile,
  onRemove,
  showCategory,
}: {
  tile: Tile;
  onRemove?: (id: string) => void;
  showCategory?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-40" : ""}
      {...attributes}
      {...listeners}
    >
      <TileCard tile={tile} onRemove={onRemove} showCategory={showCategory} />
    </div>
  );
}

function TileCard({
  tile,
  onRemove,
  showCategory,
  overlay,
}: {
  tile: Tile;
  onRemove?: (id: string) => void;
  showCategory?: boolean;
  overlay?: boolean;
}) {
  return (
    <div
      className={`flex cursor-grab items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 active:cursor-grabbing ${
        overlay ? "rotate-1 shadow-xl ring-2 ring-indigo-300" : "shadow-sm hover:border-slate-300"
      }`}
    >
      <span className="select-none pt-0.5 text-slate-300">⋮⋮</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <TileText text={tile.text} compact />
        {showCategory && (
          <div>
            <CategoryBadge category={tile.category} />
          </div>
        )}
      </div>
      {onRemove && (
        <button
          onClick={() => onRemove(tile.id)}
          onPointerDown={(e) => e.stopPropagation()}
          title="Remove from this resume"
          className="rounded px-1.5 text-lg leading-none text-slate-300 hover:bg-slate-100 hover:text-slate-700"
        >
          ×
        </button>
      )}
    </div>
  );
}
