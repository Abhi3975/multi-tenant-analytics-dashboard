"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  METRIC_NAMES,
  WIDGET_TYPES,
  type MetricName,
  type Widget,
  type WidgetPosition,
  type WidgetType,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { WidgetView } from "@/components/dashboard/widget-view";
import {
  addWidget,
  removeWidget,
  updateWidgetConfig,
  updateWidgetPosition,
} from "./actions";

const COLS = 12;
const ROW_H = 90; // px per grid row
const GAP = 8; // px

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function GridEditor({
  dashboardId,
  teamId,
  canEdit,
  initialWidgets,
}: {
  dashboardId: string;
  teamId: string;
  canEdit: boolean;
  initialWidgets: Widget[];
}) {
  const [widgets, setWidgets] = useState<Widget[]>(initialWidgets);
  const [colWidth, setColWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const persistTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Widget the local user is actively dragging/resizing — ignore remote updates
  // for it so a collaborator's echo doesn't yank it out from under the pointer.
  const activeIdRef = useRef<string | null>(null);
  const setActive = useCallback((id: string | null) => {
    activeIdRef.current = id;
  }, []);

  // Measure a single column's width so pixel drags map to grid units.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setColWidth((w - (COLS - 1) * GAP) / COLS);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Realtime co-editing: apply widget inserts/updates/deletes from collaborators.
  // RLS on `widgets` means we only receive changes for dashboards we can see.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`widgets:${dashboardId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "widgets",
          filter: `dashboard_id=eq.${dashboardId}`,
        },
        (payload) => {
          setWidgets((prev) => {
            if (payload.eventType === "INSERT") {
              const w = payload.new as Widget;
              return prev.some((x) => x.id === w.id)
                ? prev.map((x) => (x.id === w.id ? w : x))
                : [...prev, w];
            }
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string }).id;
              return prev.filter((x) => x.id !== oldId);
            }
            // UPDATE
            const w = payload.new as Widget;
            if (activeIdRef.current === w.id) return prev;
            return prev.map((x) => (x.id === w.id ? w : x));
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dashboardId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const colStep = colWidth + GAP;
  const rowStep = ROW_H + GAP;

  const persistPosition = useCallback(
    (id: string, position: WidgetPosition) => {
      clearTimeout(persistTimers.current[id]);
      persistTimers.current[id] = setTimeout(() => {
        updateWidgetPosition(id, position).catch((e) => console.error(e));
      }, 400);
    },
    []
  );

  const setPosition = useCallback(
    (id: string, next: WidgetPosition) => {
      setWidgets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, position: next } : w))
      );
      persistPosition(id, next);
    },
    [persistPosition]
  );

  function onDragEnd(event: DragEndEvent) {
    activeIdRef.current = null;
    if (!canEdit || colStep <= 0) return;
    const id = String(event.active.id);
    const w = widgets.find((x) => x.id === id);
    if (!w) return;
    const dCols = Math.round(event.delta.x / colStep);
    const dRows = Math.round(event.delta.y / rowStep);
    if (dCols === 0 && dRows === 0) return;
    const p = w.position;
    setPosition(id, {
      ...p,
      x: clamp(p.x + dCols, 0, COLS - p.w),
      y: Math.max(0, p.y + dRows),
    });
  }

  function resize(id: string, w: number, h: number) {
    const widget = widgets.find((x) => x.id === id);
    if (!widget) return;
    const p = widget.position;
    setPosition(id, {
      ...p,
      w: clamp(w, 1, COLS - p.x),
      h: Math.max(1, h),
    });
  }

  async function onAdd(type: WidgetType, metric: MetricName) {
    const maxY = widgets.reduce(
      (m, w) => Math.max(m, w.position.y + w.position.h),
      0
    );
    const position: WidgetPosition = {
      x: 0,
      y: maxY,
      w: type === "stat" ? 3 : 6,
      h: type === "stat" ? 2 : 3,
    };
    const created = await addWidget({ dashboardId, type, metric, position });
    setWidgets((prev) => [...prev, created]);
  }

  async function onRemove(id: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    await removeWidget(id).catch((e) => console.error(e));
  }

  async function onChangeMetric(id: string, metric: MetricName) {
    setWidgets((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, config: { ...w.config, metric } } : w
      )
    );
    await updateWidgetConfig(id, { metric }).catch((e) => console.error(e));
  }

  return (
    <div className="space-y-4">
      {canEdit && <AddWidgetBar onAdd={onAdd} />}

      <DndContext
        sensors={sensors}
        onDragStart={(e) => {
          activeIdRef.current = String(e.active.id);
        }}
        onDragEnd={onDragEnd}
      >
        <div
          ref={containerRef}
          className="relative grid w-full"
          style={{
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            gridAutoRows: `${ROW_H}px`,
            gap: `${GAP}px`,
          }}
        >
          {widgets.length === 0 && (
            <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
              {canEdit
                ? "Add a widget to start building this dashboard."
                : "This dashboard has no widgets yet."}
            </p>
          )}
          {widgets.map((w) => (
            <WidgetTile
              key={w.id}
              widget={w}
              teamId={teamId}
              canEdit={canEdit}
              colStep={colStep}
              rowStep={rowStep}
              onResize={resize}
              onRemove={onRemove}
              onChangeMetric={onChangeMetric}
              setActive={setActive}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function WidgetTile({
  widget,
  teamId,
  canEdit,
  colStep,
  rowStep,
  onResize,
  onRemove,
  onChangeMetric,
  setActive,
}: {
  widget: Widget;
  teamId: string;
  canEdit: boolean;
  colStep: number;
  rowStep: number;
  onResize: (id: string, w: number, h: number) => void;
  onRemove: (id: string) => void;
  onChangeMetric: (id: string, metric: MetricName) => void;
  setActive: (id: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: widget.id, disabled: !canEdit });
  const p = widget.position;

  // Pointer-based resize (bottom-right handle). Not dnd-kit, so it never
  // conflicts with dragging.
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = p.w;
    const startH = p.h;
    setActive(widget.id);
    function move(ev: PointerEvent) {
      const dCols = Math.round((ev.clientX - startX) / colStep);
      const dRows = Math.round((ev.clientY - startY) / rowStep);
      onResize(widget.id, startW + dCols, startH + dRows);
    }
    function up() {
      setActive(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const title = widget.config.title ?? widget.config.metric.replace("_", " ");

  return (
    <div
      ref={setNodeRef}
      className="relative flex flex-col rounded-xl border bg-card text-card-foreground shadow"
      style={{
        gridColumn: `${p.x + 1} / span ${p.w}`,
        gridRow: `${p.y + 1} / span ${p.h}`,
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.85 : 1,
      }}
    >
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        {canEdit && (
          <button
            className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            aria-label="Drag widget"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <span className="flex-1 truncate text-xs font-medium capitalize">
          {title}
        </span>
        {canEdit ? (
          <>
            <select
              value={widget.config.metric}
              onChange={(e) =>
                onChangeMetric(widget.id, e.target.value as MetricName)
              }
              className="rounded border bg-transparent px-1 py-0.5 text-xs"
              aria-label="Metric"
            >
              {METRIC_NAMES.map((m) => (
                <option key={m} value={m}>
                  {m.replace("_", " ")}
                </option>
              ))}
            </select>
            <button
              onClick={() => onRemove(widget.id)}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remove widget"
            >
              <X className="size-4" />
            </button>
          </>
        ) : (
          <span className="text-[10px] uppercase text-muted-foreground">
            {widget.type.replace("_", " ")}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 p-2">
        <WidgetView teamId={teamId} type={widget.type} config={widget.config} />
      </div>

      {canEdit && (
        <div
          onPointerDown={startResize}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize touch-none"
          aria-label="Resize widget"
          style={{
            background:
              "linear-gradient(135deg, transparent 50%, hsl(var(--border)) 50%)",
          }}
        />
      )}
    </div>
  );
}

function AddWidgetBar({
  onAdd,
}: {
  onAdd: (type: WidgetType, metric: MetricName) => void;
}) {
  const [type, setType] = useState<WidgetType>("line_chart");
  const [metric, setMetric] = useState<MetricName>("revenue");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2">
      <span className="px-1 text-xs font-medium text-muted-foreground">
        Add widget
      </span>
      <select
        value={type}
        onChange={(e) => setType(e.target.value as WidgetType)}
        className="h-8 rounded-md border bg-background px-2 text-sm"
        aria-label="Widget type"
      >
        {WIDGET_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <select
        value={metric}
        onChange={(e) => setMetric(e.target.value as MetricName)}
        className="h-8 rounded-md border bg-background px-2 text-sm capitalize"
        aria-label="Metric"
      >
        {METRIC_NAMES.map((m) => (
          <option key={m} value={m}>
            {m.replace("_", " ")}
          </option>
        ))}
      </select>
      <Button size="sm" onClick={() => onAdd(type, metric)}>
        <Plus className="mr-1" /> Add
      </Button>
    </div>
  );
}
