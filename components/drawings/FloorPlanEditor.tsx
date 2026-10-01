"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Box,
  DoorOpen,
  Hand,
  Loader2,
  Maximize,
  MousePointer2,
  Move,
  PanelTop,
  Redo2,
  Ruler,
  Save,
  Shapes,
  SquareDashed,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { patchDrawing, savePlanSetVariants, saveHouseModelRequest } from "@/lib/drawings/api";
import { composeHouseModel, LEVEL_LABEL, variantFor, type FloorVariant, type LevelId, type PlanSelection } from "@/lib/models/planSet";
import { countUnverified, deleteElement, dist, scaleFloor } from "@/lib/editor/editorOps";
import type { ProjectBundle } from "@/lib/data/repository";
import type { Drawing, DrawingCalibration } from "@/lib/models/drawing";
import { finalizeHouseModel } from "@/lib/models/finalize";
import { sortedFloors, type HouseModel, type Point2D } from "@/lib/models/house";
import { fileUrl } from "@/lib/storage/urls";
import { cn } from "@/lib/utils";
import { DEFAULT_CALIBRATION, useEditorStore, type EditorTool } from "@/stores/editorStore";
import { CalibrationDialog } from "./editor/CalibrationDialog";
import { EditorCanvas } from "./editor/EditorCanvas";
import { InterpretationPanel } from "./editor/InterpretationPanel";
import { PropertiesPanel } from "./editor/PropertiesPanel";

const TOOLS: { id: EditorTool; label: string; key: string; icon: LucideIcon; hint: string }[] = [
  { id: "select", label: "Select", key: "V", icon: MousePointer2, hint: "Click to select · drag walls, corners and openings · drag empty space to pan" },
  { id: "pan", label: "Pan", key: "H", icon: Hand, hint: "Drag to pan · scroll to zoom (or hold Space with any tool)" },
  { id: "wall", label: "Wall", key: "W", icon: PanelTop, hint: "Click to start, click to add corners · click the first point or double-click / Esc to finish · Shift disables snapping" },
  { id: "door", label: "Door", key: "D", icon: DoorOpen, hint: "Click on a wall to add a door" },
  { id: "window", label: "Window", key: "N", icon: SquareDashed, hint: "Click on a wall to add a window" },
  { id: "room", label: "Room", key: "R", icon: Shapes, hint: "Click room corners (snaps to wall corners) · click the first point or press Enter to close" },
  { id: "calibrate", label: "Scale", key: "C", icon: Ruler, hint: "Click two points of a known dimension (e.g. a dimension string), then enter its real length" },
  { id: "align", label: "Align", key: "A", icon: Move, hint: "Click a point on the drawing, then the matching point on the geometry / floor-below ghost" },
];

function calibrationFor(d: Drawing | undefined): DrawingCalibration {
  if (!d) return DEFAULT_CALIBRATION;
  if (d.calibration) return d.calibration;
  return { ...DEFAULT_CALIBRATION, metresPerPixel: d.interpretation?.scale?.metresPerPixel ?? DEFAULT_CALIBRATION.metresPerPixel };
}

interface Props {
  bundle: ProjectBundle;
  drawings: Drawing[];
  initialFloorId?: string;
  initialDrawingId?: string;
  /** Drawing-set projects: which elevation / layouts to edit. */
  planSelection?: PlanSelection;
}

/** Prefix for synthetic "drawings" that show drawing-set sheets under their floor. */
const SHEET = "sheet:";

export function FloorPlanEditor({ bundle, drawings: uploaded, planSelection, initialFloorId, initialDrawingId }: Props) {
  const router = useRouter();
  const { project, planSet } = bundle;
  const projectId = project.id;

  // Drawing-set projects: edit the composed home for one elevation, each floor
  // over its own (already scaled + aligned) sheet.
  const planContext = useMemo(() => {
    if (!planSet || !planSelection) return null;
    const house = composeHouseModel(planSet, planSelection, { id: bundle.house.id, projectId: projectId, name: bundle.house.name });
    const variantByFloor: Record<string, FloorVariant> = {};
    for (const f of house.floors) {
      const v = variantFor(planSet, planSelection.elevationId, f.id as LevelId, planSelection.options[f.id as LevelId] ?? null);
      if (v) variantByFloor[f.id] = v;
    }
    const sheets: Drawing[] = Object.entries(variantByFloor).map(([floorId, v]) => ({
      id: `${SHEET}${v.id}`,
      projectId: projectId,
      fileName: `Sheet ${v.page} · ${LEVEL_LABEL[v.levelId]}${v.optionId ? ` · ${planSet.options.find((o) => o.id === v.optionId)?.name ?? ""}` : ""}`,
      contentType: "image/png",
      sizeBytes: 0,
      category: "floor-plan",
      floorId,
      storageKey: v.sheet.rasterKey,
      rasterKey: v.sheet.rasterKey,
      rasterWidth: v.sheet.width,
      rasterHeight: v.sheet.height,
      uploadStatus: "uploaded",
      processingStatus: v.reviewed ? "reviewed" : "needs-review",
      calibration: { metresPerPixel: v.sheet.metresPerPixel, originPx: v.sheet.originPx, calibrated: true },
      createdAt: "",
      updatedAt: "",
    }));
    return { house, variantByFloor, sheets };
  }, [planSet, planSelection, bundle.house, projectId]);

  const sourceHouse = planContext?.house ?? bundle.house;
  const initialDrawings = useMemo(() => [...(planContext?.sheets ?? []), ...uploaded], [planContext, uploaded]);
  const [drawings, setDrawings] = useState(initialDrawings);
  const [fitNonce, setFitNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [calib, setCalib] = useState<{ a: Point2D; b: Point2D } | null>(null);

  const model = useEditorStore((s) => s.model);
  const floorId = useEditorStore((s) => s.floorId);
  const drawingId = useEditorStore((s) => s.drawingId);
  const tool = useEditorStore((s) => s.tool);
  const wallKind = useEditorStore((s) => s.wallKind);
  const dirty = useEditorStore((s) => s.dirty);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const calibration = useEditorStore((s) => s.calibration);
  const selection = useEditorStore((s) => s.selection);
  const underlayOpacity = useEditorStore((s) => s.underlayOpacity);
  const showUnderlay = useEditorStore((s) => s.showUnderlay);
  const showGhost = useEditorStore((s) => s.showGhost);
  const store = useEditorStore.getState;

  // Initialise once per page load.
  useEffect(() => {
    const floors = sortedFloors(sourceHouse);
    const first = initialFloorId && floors.some((f) => f.id === initialFloorId) ? initialFloorId : (floors.find((f) => !f.belowGrade) ?? floors[0])?.id;
    const d = initialDrawings.find((x) => x.id === initialDrawingId) ?? initialDrawings.find((x) => x.floorId === first);
    // The canvas mounts (and fits itself) once the store has a floor.
    useEditorStore.getState().init(structuredClone(sourceHouse), first ?? "", d?.id ?? null, calibrationFor(d));
  }, [sourceHouse, initialDrawings, initialFloorId, initialDrawingId]);

  const floors = useMemo(() => sortedFloors(model), [model]);
  const floor = floors.find((f) => f.id === floorId);
  const ghost = useMemo(() => {
    const i = floors.findIndex((f) => f.id === floorId);
    return i > 0 ? floors[i - 1] : (floors[i + 1] ?? null);
  }, [floors, floorId]);
  const drawing = drawings.find((d) => d.id === drawingId);
  const planDrawings = drawings.filter((d) => d.category === "floor-plan");
  const underlay = drawing?.rasterKey && drawing.rasterWidth && drawing.rasterHeight ? { url: fileUrl(drawing.rasterKey), width: drawing.rasterWidth, height: drawing.rasterHeight } : null;
  const unverified = floors.reduce((n, f) => n + countUnverified(f), 0);

  const persistCalibration = useCallback((id: string | null, c: DrawingCalibration) => {
    const d = drawings.find((x) => x.id === id);
    // Drawing-set sheets store their mapping on the plan set (saved with the floors).
    if (!d || d.id.startsWith(SHEET) || JSON.stringify(d.calibration) === JSON.stringify(c)) return;
    void patchDrawing(d.id, { calibration: c })
      .then((u) => setDrawings((list) => list.map((x) => (x.id === u.id ? u : x))))
      .catch(() => undefined);
  }, [drawings]);

  const switchDrawing = (id: string | null) => {
    persistCalibration(drawingId, calibration);
    const d = drawings.find((x) => x.id === id);
    store().setDrawing(d?.id ?? null, calibrationFor(d));
    setFitNonce((n) => n + 1);
  };

  const switchFloor = (id: string) => {
    store().setFloorId(id);
    const assigned = drawings.find((d) => d.floorId === id && d.category === "floor-plan");
    if (assigned && assigned.id !== drawingId) switchDrawing(assigned.id);
    else setFitNonce((n) => n + 1);
  };

  const save = useCallback(
    async (thenView: boolean) => {
      const s = store();
      const tracedFloors = s.model.floors.filter((f) => f.walls.length);
      if (!tracedFloors.length) return void toast.error("Nothing to save yet", { description: "Trace at least one wall first." });
      const usesDrawing = !!s.drawingId;
      if (!planSet && usesDrawing && !s.calibration.calibrated && !window.confirm("This drawing's scale hasn't been calibrated, so dimensions may be wrong.\n\nSave anyway? (Use the Scale tool to calibrate.)")) return;
      setSaving(true);
      try {
        if (planSet && planContext) {
          // Write reviewed floors back into the drawing set; the server recomposes the home.
          const sheet = s.drawingId?.startsWith(SHEET) ? s.drawingId.slice(SHEET.length) : null;
          await savePlanSetVariants(
            project.id,
            planSet.id,
            s.model.floors
              .filter((f) => planContext.variantByFloor[f.id])
              .map((f) => {
                const v = planContext.variantByFloor[f.id];
                const current = v.id === sheet;
                return { variantId: v.id, floor: f, ...(current ? { sheetOrigin: s.calibration.originPx, metresPerPixel: s.calibration.metresPerPixel } : {}) };
              }),
          );
          useEditorStore.getState().markSaved(s.model);
          const pending = s.model.floors.reduce((n, f) => n + countUnverified(f), 0);
          toast.success("Floor plans saved", { description: pending ? `${pending} element(s) still marked unreviewed.` : "All floors on this elevation are reviewed." });
          if (thenView) router.push(`/projects/${project.slug}`);
          else router.refresh();
          return;
        }
        const { model: finalized, notes } = finalizeHouseModel(s.model);
        const pending = finalized.floors.reduce((n, f) => n + countUnverified(f), 0);
        const provNotes = [...notes];
        let confidence = 0.85;
        if (pending) {
          provNotes.unshift(`${pending} element(s) imported by a drawing interpreter have not been reviewed.`);
          confidence -= 0.3;
        }
        if (usesDrawing && !s.calibration.calibrated) {
          provNotes.unshift("Drawing scale was not calibrated — dimensions are estimates.");
          confidence -= 0.35;
        }
        if (!usesDrawing) provNotes.push("Edited without a drawing underlay.");
        const out: HouseModel = { ...finalized, provenance: { source: pending ? "interpreted" : "manual-trace", confidence: Math.max(0.1, Math.round(confidence * 100) / 100), notes: provNotes } };
        const floorPending = countUnverified(out.floors.find((f) => f.id === s.floorId) ?? out.floors[0]);
        await saveHouseModelRequest(project.id, out, floorPending === 0 && s.drawingId ? s.drawingId : undefined);
        persistCalibration(s.drawingId, s.calibration);
        useEditorStore.getState().markSaved(out);
        toast.success("Model saved", { description: notes[0] ?? "3D model will regenerate from the traced geometry." });
        if (thenView) router.push(`/projects/${project.slug}`);
        else router.refresh();
      } catch (e) {
        toast.error("Save failed", { description: e instanceof Error ? e.message : undefined });
      } finally {
        setSaving(false);
      }
    },
    [project, router, store, persistCalibration, planSet, planContext],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable || t.closest("[role=dialog]") || t.closest("[role=listbox]")) return;
      const s = store();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save(false);
        return;
      }
      if (mod) return;
      if (e.key === "Escape") {
        if (s.draft.length) s.setDraft([]);
        else if (s.selection) s.select(null);
        else s.setTool("select");
        return;
      }
      if (e.key === "Enter" && s.tool === "room" && s.draft.length >= 3) {
        const pts = s.draft;
        s.commit((f) => ({ ...f, rooms: [...f.rooms, { id: `r-${Date.now().toString(36)}`, name: `Room ${f.rooms.length + 1}`, polygon: pts, finish: "main" }] }));
        s.setDraft([]);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && s.selection) {
        e.preventDefault();
        const sel = s.selection;
        s.commit((f) => deleteElement(f, sel.kind, sel.id));
        s.select(null);
        return;
      }
      if (e.key.toLowerCase() === "f") return setFitNonce((n) => n + 1);
      const t2 = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (t2) s.setTool(t2.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, store]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const onAlign = (from: Point2D, to: Point2D) => {
    const c = store().calibration;
    const m = c.metresPerPixel;
    const next: DrawingCalibration = { ...c, originPx: { x: c.originPx.x + (from.x - to.x) / m, y: c.originPx.y + (from.y - to.y) / m } };
    store().commit((f) => f, next);
    toast.success("Drawing aligned");
  };

  if (!floor) return <div className="p-10 text-sm text-muted-foreground">Loading editor…</div>;
  const activeTool = TOOLS.find((t) => t.id === tool)!;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/projects/${project.slug}?tab=drawings`}>
            <ArrowLeft /> Studio
          </Link>
        </Button>
        <span className="h-6 w-px bg-border" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">Floor plan editor</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {project.name} · {project.modelName}
          </div>
        </div>
        {planSet && planSelection && (
          <Select
            value={planSelection.elevationId}
            onValueChange={(v) => {
              if (dirty && !window.confirm("Discard unsaved changes on this elevation?")) return;
              router.push(`/projects/${project.slug}/trace?elevation=${encodeURIComponent(v)}`);
            }}
          >
            <SelectTrigger size="sm" className="ml-3 h-8 w-auto text-xs" aria-label="Elevation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {planSet.elevations.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="ml-4 flex rounded-lg bg-muted p-0.5">
          {[...floors].reverse().map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => switchFloor(f.id)}
              className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", f.id === floorId ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {f.name}
              {countUnverified(f) > 0 && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500 align-middle" />}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[11px] text-muted-foreground">Unsaved changes</span>}
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
          <Button size="sm" onClick={() => save(true)} disabled={saving}>
            <Box /> Save &amp; view 3D
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: drawing + interpretation */}
        <aside className="w-72 shrink-0 border-r">
          <ScrollArea className="h-full">
            <div className="space-y-5 p-4">
              <section className="space-y-2">
                <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Reference drawing</h3>
                <Select value={drawingId ?? "none"} onValueChange={(v) => switchDrawing(v === "none" ? null : v)}>
                  <SelectTrigger size="sm" className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No drawing</SelectItem>
                    {planDrawings.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.fileName}
                        {d.floorId ? ` · ${floors.find((f) => f.id === d.floorId)?.name ?? ""}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!planDrawings.length && (
                  <p className="text-[11px] text-muted-foreground">
                    No floor plans uploaded.{" "}
                    <Link className="underline" href={`/projects/${project.slug}?tab=drawings`}>
                      Upload drawings
                    </Link>{" "}
                    or trace freehand.
                  </p>
                )}
                {drawing && (
                  <>
                    <div className="flex items-center gap-2">
                      <Label className="w-16 text-xs text-muted-foreground">Opacity</Label>
                      <Slider value={[underlayOpacity * 100]} min={5} max={100} onValueChange={([v]) => store().setUnderlay({ underlayOpacity: v / 100 })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="show-ul" className="text-xs">
                        Show drawing
                      </Label>
                      <Switch id="show-ul" checked={showUnderlay} onCheckedChange={(v) => store().setUnderlay({ showUnderlay: v })} />
                    </div>
                    <div className={cn("rounded-lg border p-2.5 text-xs", calibration.calibrated ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
                      <div className="font-medium">{calibration.calibrated ? "Scale calibrated" : "Scale not calibrated"}</div>
                      <div className="mt-0.5 text-[10px]">
                        1 px = {(calibration.metresPerPixel * 1000).toFixed(1)} mm{!calibration.calibrated && " (estimate)"}
                      </div>
                      <Button size="xs" variant="outline" className="mt-1.5 w-full bg-white" onClick={() => store().setTool("calibrate")}>
                        <Ruler /> {calibration.calibrated ? "Re-calibrate" : "Calibrate scale"}
                      </Button>
                    </div>
                  </>
                )}
                {ghost && (
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-ghost" className="text-xs">
                      Show {ghost.name.toLowerCase()} outline
                    </Label>
                    <Switch id="show-ghost" checked={showGhost} onCheckedChange={(v) => store().setUnderlay({ showGhost: v })} />
                  </div>
                )}
              </section>

              {drawing && !drawing.id.startsWith(SHEET) && (
                <section className="space-y-2">
                  <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Automatic extraction</h3>
                  <InterpretationPanel drawing={drawing} onDrawingUpdated={(d) => setDrawings((list) => list.map((x) => (x.id === d.id ? d : x)))} />
                </section>
              )}

              {unverified > 0 && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                  {unverified} element{unverified > 1 ? "s" : ""} awaiting review
                </Badge>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Canvas */}
        <main className="relative min-w-0 flex-1">
          <EditorCanvas underlay={underlay} ghost={ghost} fitNonce={fitNonce} onCalibrate={(a, b) => setCalib({ a, b })} onAlign={onAlign} />
          <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2">
            <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border bg-background/95 p-1 shadow-lg ring-1 ring-black/5 backdrop-blur">
              {TOOLS.map((t) => (
                <Tooltip key={t.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={t.label}
                      onClick={() => store().setTool(t.id)}
                      className={cn("flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors", tool === t.id ? "bg-primary text-primary-foreground" : "text-foreground/75 hover:bg-muted")}
                    >
                      <t.icon className="size-4" />
                      <span className="hidden xl:inline">{t.label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t.label} <kbd className="ml-1 rounded bg-white/20 px-1">{t.key}</kbd>
                  </TooltipContent>
                </Tooltip>
              ))}
              {tool === "wall" && (
                <div className="ml-1 flex rounded-lg bg-muted p-0.5 text-[11px]">
                  {(["exterior", "interior"] as const).map((k) => (
                    <button key={k} type="button" onClick={() => store().setWallKind(k)} className={cn("rounded-md px-2 py-1 capitalize", wallKind === k ? "bg-background shadow-sm" : "text-muted-foreground")}>
                      {k}
                    </button>
                  ))}
                </div>
              )}
              <span className="mx-1 h-6 w-px bg-border" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="Undo" disabled={!canUndo} onClick={() => store().undo()} className="flex size-9 items-center justify-center rounded-lg text-foreground/75 hover:bg-muted disabled:opacity-30">
                    <Undo2 className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="Redo" disabled={!canRedo} onClick={() => store().redo()} className="flex size-9 items-center justify-center rounded-lg text-foreground/75 hover:bg-muted disabled:opacity-30">
                    <Redo2 className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="Fit to view" onClick={() => setFitNonce((n) => n + 1)} className="flex size-9 items-center justify-center rounded-lg text-foreground/75 hover:bg-muted">
                    <Maximize className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Fit (F)</TooltipContent>
              </Tooltip>
            </div>
            <div className="rounded-full bg-background/90 px-3 py-1 text-[11px] text-foreground/70 shadow-sm ring-1 ring-black/5">{activeTool.hint}</div>
          </div>
        </main>

        {/* Right: properties */}
        <aside className="w-72 shrink-0 border-l">
          <ScrollArea className="h-full">
            <div className="p-4">
              <PropertiesPanel key={selection ? `${selection.kind}:${selection.id}` : `floor:${floorId}`} />
            </div>
          </ScrollArea>
        </aside>
      </div>

      {calib && (
        <CalibrationDialog
          open
          measured={dist(calib.a, calib.b)}
          hasGeometry={floor.walls.length > 0}
          defaultRescale={!calibration.calibrated && floor.walls.length > 0 && model.provenance.source !== "demo-seed"}
          onCancel={() => setCalib(null)}
          onConfirm={(real, rescale) => {
            const k = real / dist(calib.a, calib.b);
            const c = store().calibration;
            store().commit((f) => (rescale ? scaleFloor(f, k) : f), { ...c, metresPerPixel: c.metresPerPixel * k, calibrated: true });
            setCalib(null);
            store().setTool("select");
            setFitNonce((n) => n + 1);
            toast.success("Scale calibrated", { description: `1 px = ${(c.metresPerPixel * k * 1000).toFixed(1)} mm` });
          }}
        />
      )}
    </div>
  );
}
