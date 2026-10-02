import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
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
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
const MAX_LABEL = 40; // matches backend/app/services/layout.py
import { CATEGORY_LABELS, type Category, type Overrides, type Tile } from "../../lib/types";
import { IconButton, MonoLabel, TileEditor, TileText } from "../ui";

export type ContainerId = Category | "unused";
export type Containers = Record<ContainerId, Tile[]>;

export interface Editing {
  overrides: Overrides;
  editingId: string | null;
  onEdit: (id: string) => void;
  onSave: (tile: Tile, text: string) => void;
  onCancel: () => void;
  onRevert: (id: string) => void;
}

// Sections and rows share one DndContext. Section drag ids are prefixed so the two never mix.
const SECTION = "section:";
const sectionId = (c: Category) => SECTION + c;
const isSectionId = (id: unknown) => String(id).startsWith(SECTION);
const sectionOf = (id: unknown) => String(id).slice(SECTION.length) as Category;

/** A dragged section only collides with other sections; a dragged row only with rows/containers. */
const collision: CollisionDetection = (args) => {
  const draggingSection = isSectionId(args.active.id);
  return closestCorners({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => isSectionId(c.id) === draggingSection),
  });
};

/** DOM id for a row, used to scroll to entries matched by a job requirement. */
export const rowDomId = (tileId: string) => `row-${tileId}`;

export default function EditorPane({
  containers,
  setContainers,
  order,
  setOrder,
  editing,
  highlight,
  trayOpen,
  setTrayOpen,
  unusedPlacement,
  labels,
  onRename,
  onDirty,
}: {
  containers: Containers;
  setContainers: Dispatch<SetStateAction<Containers | null>>;
  order: Category[];
  setOrder: (o: Category[]) => void;
  editing: Editing;
  highlight: Set<string>;
  trayOpen: boolean;
  setTrayOpen: (open: boolean) => void;
  /** "column": Unused sits to the right of the sections (room to spare); "tray": collapsible strip at the bottom. */
  unusedPlacement: "tray" | "column";
  /** Per-resume section names; missing = the default category label. */
  labels: Partial<Record<Category, string>>;
  onRename: (category: Category, label: string | null) => void;
  onDirty: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<Category | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // lets row buttons receive clicks
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const tilesById = useMemo(() => new Map(Object.values(containers).flat().map((t) => [t.id, t])), [containers]);
  // Running row numbers across all sections (01, 02, ...) in resume order.
  const numberOf = new Map(order.flatMap((c) => containers[c]).map((t, i) => [t.id, i + 1]));

  const findContainer = (itemId: string): ContainerId | undefined => {
    if (itemId in containers) return itemId as ContainerId;
    return (Object.keys(containers) as ContainerId[]).find((c) => containers[c].some((t) => t.id === itemId));
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    if (isSectionId(active.id)) setActiveSection(sectionOf(active.id));
    else setActiveId(String(active.id));
  };

  // Moving between containers happens during the drag so the target previews the row.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || isSectionId(active.id)) return;
    const from = findContainer(String(active.id));
    const to = findContainer(String(over.id));
    if (!from || !to || from === to) return;
    if (to === "unused" && unusedPlacement === "tray" && !trayOpen) setTrayOpen(true);
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
    onDirty();
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    setActiveSection(null);
    if (!over) return;
    if (isSectionId(active.id)) {
      const from = order.indexOf(sectionOf(active.id));
      const to = order.indexOf(sectionOf(over.id));
      if (from >= 0 && to >= 0 && from !== to) {
        setOrder(arrayMove(order, from, to));
        onDirty();
      }
      return;
    }
    const from = findContainer(String(active.id));
    const to = findContainer(String(over.id));
    if (!from || from !== to) return;
    const oldIndex = containers[from].findIndex((t) => t.id === active.id);
    const newIndex = containers[to].findIndex((t) => t.id === over.id);
    if (newIndex >= 0 && oldIndex !== newIndex) {
      setContainers({ ...containers, [from]: arrayMove(containers[from], oldIndex, newIndex) });
      onDirty();
    }
  };

  /** Review-page X: remove from this resume only (moves to Unused); Your Resume is untouched. */
  const moveToUnused = (tileId: string) => {
    const from = findContainer(tileId);
    if (!from || from === "unused") return;
    const tile = containers[from].find((t) => t.id === tileId)!;
    setContainers({ ...containers, [from]: containers[from].filter((t) => t.id !== tileId), unused: [tile, ...containers.unused] });
    onDirty();
  };

  const activeTile = activeId ? tilesById.get(activeId) : undefined;
  const used = order.reduce((n, c) => n + containers[c].length, 0);

  const sections = (
    <SortableContext items={order.map(sectionId)} strategy={verticalListSortingStrategy}>
      {order.map((c) => (
        <SortableSection
          key={c}
          category={c}
          collapsed={activeSection !== null}
          name={labels[c] || CATEGORY_LABELS[c]}
          onRename={(label) => onRename(c, label)}
          tiles={containers[c]}
          numberOf={numberOf}
          onRemove={moveToUnused}
          editing={editing}
          highlight={highlight}
        />
      ))}
    </SortableContext>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} // sections collapse while one is dragged
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setActiveSection(null);
      }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <PaneHeader title="Editor" right={<span className="text-xs text-muted">{used} entries · drag ⠿ to reorder</span>} />
        {unusedPlacement === "column" ? (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(220px,32%)]">
            <div className="min-h-0 overflow-y-auto">{sections}</div>
            <UnusedColumn tiles={containers.unused} editing={editing} highlight={highlight} />
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">{sections}</div>
            <UnusedTray tiles={containers.unused} open={trayOpen} setOpen={setTrayOpen} editing={editing} highlight={highlight} />
          </>
        )}
      </div>
      <DragOverlay>
        {activeSection ? (
          <SectionHeader
            name={labels[activeSection] || CATEGORY_LABELS[activeSection]}
            count={containers[activeSection].length}
            overlay
          />
        ) : activeTile ? (
          <Row tile={activeTile} text={editing.overrides[activeTile.id]} overlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Thin title bar shared by the three editor-page panes. */
export function PaneHeader({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-10 flex-none items-center gap-3 border-b border-line bg-bg px-4">
      <MonoLabel className="!text-ink2">{title}</MonoLabel>
      {right && <div className="ml-auto flex min-w-0 items-center gap-2">{right}</div>}
    </div>
  );
}

interface SectionProps {
  name: string;
  tiles: Tile[];
  numberOf?: Map<string, number>;
  onRemove?: (id: string) => void;
  editing: Editing;
  highlight: Set<string>;
}

/** A resume section the user can drag (by its header handle) to change the section order. */
function SortableSection({
  category,
  collapsed,
  onRename,
  ...props
}: SectionProps & { category: Category; collapsed: boolean; onRename: (label: string | null) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: sectionId(category),
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "opacity-30" : ""}
    >
      <Section
        {...props}
        id={category}
        collapsed={collapsed}
        defaultName={CATEGORY_LABELS[category]}
        onRename={onRename}
        handle={
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            title="Drag to reorder this section"
            className="cursor-grab px-0.5 text-muted hover:text-ink active:cursor-grabbing"
          >
            ⠿
          </button>
        }
      />
    </div>
  );
}

function SectionHeader({
  name,
  count,
  handle,
  overlay,
  defaultName,
  onRename,
}: {
  name: string;
  count: number;
  handle?: ReactNode;
  overlay?: boolean;
  defaultName?: string;
  onRename?: (label: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const renamed = defaultName !== undefined && name !== defaultName;
  const commit = () => {
    setEditing(false);
    const next = draft.trim().slice(0, MAX_LABEL);
    onRename?.(!next || next === defaultName ? null : next); // empty or default = back to the default name
  };
  return (
    <div
      className={`group/sec flex items-center gap-3 border-b border-line bg-panel px-4 py-2 ${overlay ? "border border-accent shadow-xl" : ""}`}
    >
      {overlay ? <span className="px-0.5 text-muted">⠿</span> : handle}
      {editing ? (
        <input
          autoFocus
          value={draft}
          maxLength={MAX_LABEL}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation(); // keep keys away from drag-and-drop
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder={defaultName}
          aria-label="Section name for this resume"
          className="min-w-0 flex-1 border border-accent bg-bg px-2 py-0.5 font-mono text-[11px] tracking-[0.07em] uppercase outline-none"
        />
      ) : (
        <MonoLabel className={renamed ? "!text-ink2" : ""}>
          {name} · {count}
        </MonoLabel>
      )}
      {onRename && !editing && (
        <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover/sec:opacity-100 focus-within:opacity-100">
          {renamed && (
            <button
              onClick={() => onRename(null)}
              title={`Reset to "${defaultName}"`}
              className="px-1 text-xs text-muted hover:text-ink"
            >
              ↺
            </button>
          )}
          <button
            onClick={() => {
              setDraft(name);
              setEditing(true);
            }}
            title="Rename this section (this resume only)"
            className="px-1 text-xs text-muted hover:text-ink"
          >
            ✎
          </button>
        </span>
      )}
    </div>
  );
}

function Section({
  id,
  name,
  tiles,
  numberOf,
  onRemove,
  editing,
  highlight,
  handle,
  collapsed = false,
  defaultName,
  onRename,
}: SectionProps & {
  id: ContainerId;
  handle?: ReactNode;
  collapsed?: boolean;
  defaultName?: string;
  onRename?: (label: string | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section>
      <SectionHeader name={name} count={tiles.length} handle={handle} defaultName={defaultName} onRename={onRename} />
      {!collapsed && (
        <SortableContext items={tiles.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div ref={setNodeRef} className={`min-h-12 ${isOver ? "bg-accent-bg" : ""}`}>
            {tiles.map((t) => (
              <SortableRow
                key={t.id}
                tile={t}
                number={numberOf?.get(t.id)}
                onRemove={onRemove}
                editing={editing}
                highlighted={highlight.has(t.id)}
              />
            ))}
            {tiles.length === 0 && (
              <div className="mx-4 my-3 border border-dashed border-line2 py-2.5 text-center text-muted">
                <MonoLabel>Drop entries here</MonoLabel>
              </div>
            )}
          </div>
        </SortableContext>
      )}
    </section>
  );
}

/** Unused entries in a collapsible tray pinned to the bottom of the editor. Drop rows here to remove them. */
function UnusedTray({
  tiles,
  open,
  setOpen,
  editing,
  highlight,
}: {
  tiles: Tile[];
  open: boolean;
  setOpen: (open: boolean) => void;
  editing: Editing;
  highlight: Set<string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "unused" });
  const highlighted = tiles.filter((t) => highlight.has(t.id)).length;
  return (
    <div ref={setNodeRef} className={`flex-none border-t-2 border-line2 ${isOver ? "bg-accent-bg" : "bg-panel"}`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
        <span className="w-3 text-muted">{open ? "▾" : "▴"}</span>
        <MonoLabel>Unused · {tiles.length}</MonoLabel>
        {highlighted > 0 && <MonoLabel className="!text-accent">{highlighted} highlighted</MonoLabel>}
        <span className="ml-auto truncate text-xs text-muted">Drag entries here to leave them off this resume</span>
      </button>
      {open && (
        <div className="max-h-[38vh] overflow-y-auto border-t border-line bg-bg">
          <SortableContext items={tiles.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tiles.map((t) => (
              <SortableRow key={t.id} tile={t} unused editing={editing} highlighted={highlight.has(t.id)} />
            ))}
          </SortableContext>
          {tiles.length === 0 && <div className="px-4 py-3 text-muted">Every entry is on this resume.</div>}
        </div>
      )}
    </div>
  );
}

/** Unused entries as a full-height column to the right of the sections (used when the editor has room). */
function UnusedColumn({ tiles, editing, highlight }: { tiles: Tile[]; editing: Editing; highlight: Set<string> }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unused" });
  return (
    <div ref={setNodeRef} className={`flex min-h-0 flex-col border-l border-line ${isOver ? "bg-accent-bg" : "bg-panel"}`}>
      <div className="flex flex-none items-center gap-3 border-b border-line px-4 py-2">
        <MonoLabel>Unused · {tiles.length}</MonoLabel>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SortableContext items={tiles.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tiles.map((t) => (
            <SortableRow key={t.id} tile={t} unused editing={editing} highlighted={highlight.has(t.id)} />
          ))}
        </SortableContext>
        {tiles.length === 0 && (
          <div className="mx-4 my-3 border border-dashed border-line2 py-2.5 text-center text-muted">
            <MonoLabel>Drop entries here</MonoLabel>
          </div>
        )}
      </div>
    </div>
  );
}

function SortableRow({
  tile,
  number,
  onRemove,
  unused,
  editing,
  highlighted,
}: {
  tile: Tile;
  number?: number;
  onRemove?: (id: string) => void;
  unused?: boolean;
  editing: Editing;
  highlighted: boolean;
}) {
  const isEditing = editing.editingId === tile.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tile.id,
    disabled: isEditing, // typing or selecting text must not start a drag
  });
  const override = editing.overrides[tile.id];
  return (
    <div
      ref={setNodeRef}
      id={rowDomId(tile.id)}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-30" : ""}
      // While editing, drop the drag role/handlers so the textarea isn't nested in a disabled "button".
      {...(isEditing ? {} : { ...attributes, ...listeners })}
    >
      {isEditing ? (
        <div className="flex items-start gap-3 border-b border-line bg-hover px-4 py-3">
          <span className="w-4 flex-none" />
          <div className="min-w-0 flex-1">
            <TileEditor
              initial={override ?? tile.text}
              onSave={(text) => editing.onSave(tile, text)}
              onCancel={editing.onCancel}
              saveLabel="Apply to this resume"
              note="Only changes this tailored resume; the entry in Your Resume stays the same."
            />
          </div>
        </div>
      ) : (
        <Row
          tile={tile}
          text={override}
          number={number}
          onRemove={onRemove}
          unused={unused}
          highlighted={highlighted}
          onEdit={() => editing.onEdit(tile.id)}
          onRevert={override !== undefined ? () => editing.onRevert(tile.id) : undefined}
        />
      )}
    </div>
  );
}

function Row({
  tile,
  text,
  number,
  onRemove,
  onEdit,
  onRevert,
  unused,
  highlighted,
  overlay,
}: {
  tile: Tile;
  text?: string; // per-resume override, if any
  number?: number;
  onRemove?: (id: string) => void;
  onEdit?: () => void;
  onRevert?: () => void;
  unused?: boolean;
  highlighted?: boolean;
  overlay?: boolean;
}) {
  const stop = (e: React.PointerEvent) => e.stopPropagation(); // row buttons must not start a drag
  return (
    <div
      className={`group flex cursor-grab items-start gap-3 border-b border-line px-4 py-3 transition-colors active:cursor-grabbing ${
        overlay
          ? "border border-accent bg-bg shadow-xl"
          : highlighted
            ? "bg-accent-bg shadow-[inset_3px_0_0_var(--accent)]"
            : "bg-bg hover:bg-hover"
      }`}
    >
      <span className="pt-px text-line2 select-none group-hover:text-muted">⠿</span>
      {number !== undefined && (
        <span className="w-5 flex-none pt-0.5 font-mono text-[11px] text-muted">{String(number).padStart(2, "0")}</span>
      )}
      <div className="min-w-0 flex-1">
        <TileText text={text ?? tile.text} />
        <div className="flex flex-wrap items-center gap-x-3">
          {unused && <MonoLabel className="mt-1">{CATEGORY_LABELS[tile.category]}</MonoLabel>}
          {text !== undefined && (
            <span className="mt-1 flex items-center gap-2">
              <MonoLabel className="!text-accent">Edited for this resume</MonoLabel>
              {onRevert && (
                <button onPointerDown={stop} onClick={onRevert} className="text-xs text-muted underline hover:text-ink">
                  Revert to original
                </button>
              )}
            </span>
          )}
        </div>
      </div>
      {onEdit && (
        <IconButton onPointerDown={stop} onClick={onEdit} title="Edit for this resume only">
          ✎
        </IconButton>
      )}
      {onRemove && (
        <IconButton onPointerDown={stop} onClick={() => onRemove(tile.id)} title="Remove from this resume (moves to Unused)">
          ✕
        </IconButton>
      )}
    </div>
  );
}
