import { create } from "zustand";
import type { DrawingCalibration } from "@/lib/models/drawing";
import type { Floor, HouseModel, Point2D } from "@/lib/models/house";

export type EditorTool = "select" | "pan" | "wall" | "door" | "window" | "room" | "calibrate" | "align";
export type SelectionKind = "wall" | "door" | "window" | "room";
export interface Selection {
  kind: SelectionKind;
  id: string;
}

interface Snapshot {
  floorId: string;
  floor: Floor;
  calibration: DrawingCalibration;
}

export const DEFAULT_CALIBRATION: DrawingCalibration = { metresPerPixel: 0.01, originPx: { x: 0, y: 0 }, calibrated: false };

interface EditorState {
  model: HouseModel;
  floorId: string;
  drawingId: string | null;
  calibration: DrawingCalibration;
  tool: EditorTool;
  wallKind: "exterior" | "interior";
  selection: Selection | null;
  /** In-progress clicks for multi-click tools (wall chain, room polygon, calibrate, align). */
  draft: Point2D[];
  underlayOpacity: number;
  showUnderlay: boolean;
  showGhost: boolean;
  dirty: boolean;
  past: Snapshot[];
  future: Snapshot[];

  init: (model: HouseModel, floorId: string, drawingId: string | null, calibration: DrawingCalibration) => void;
  floor: () => Floor;
  setTool: (tool: EditorTool) => void;
  setWallKind: (k: "exterior" | "interior") => void;
  select: (s: Selection | null) => void;
  setDraft: (d: Point2D[]) => void;
  setFloorId: (id: string) => void;
  setDrawing: (id: string | null, calibration: DrawingCalibration) => void;
  setUnderlay: (p: Partial<Pick<EditorState, "underlayOpacity" | "showUnderlay" | "showGhost">>) => void;
  /** Record current state in history, then apply a change. */
  commit: (fn: (floor: Floor) => Floor, calibration?: DrawingCalibration) => void;
  /** Apply a change without recording (live drag); call checkpoint() first. */
  live: (fn: (floor: Floor) => Floor) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: (model: HouseModel) => void;
}

const LIMIT = 100;

export const useEditorStore = create<EditorState>((set, get) => {
  const snapshot = (): Snapshot => {
    const s = get();
    return { floorId: s.floorId, floor: s.floor(), calibration: s.calibration };
  };
  const replaceFloor = (model: HouseModel, floorId: string, floor: Floor): HouseModel => ({ ...model, floors: model.floors.map((f) => (f.id === floorId ? floor : f)) });

  return {
    model: { id: "", projectId: "", name: "", floors: [], exterior: { roofs: [] }, provenance: { source: "manual-trace", confidence: 0, notes: [] } },
    floorId: "",
    drawingId: null,
    calibration: DEFAULT_CALIBRATION,
    tool: "select",
    wallKind: "exterior",
    selection: null,
    draft: [],
    underlayOpacity: 0.55,
    showUnderlay: true,
    showGhost: true,
    dirty: false,
    past: [],
    future: [],

    init: (model, floorId, drawingId, calibration) => set({ model, floorId, drawingId, calibration, tool: "select", selection: null, draft: [], dirty: false, past: [], future: [] }),
    floor: () => {
      const s = get();
      return s.model.floors.find((f) => f.id === s.floorId) ?? s.model.floors[0];
    },
    setTool: (tool) => set({ tool, draft: [], selection: tool === "select" ? get().selection : null }),
    setWallKind: (wallKind) => set({ wallKind }),
    select: (selection) => set({ selection }),
    setDraft: (draft) => set({ draft }),
    setFloorId: (floorId) => set({ floorId, selection: null, draft: [] }),
    setDrawing: (drawingId, calibration) => set({ drawingId, calibration, draft: [] }),
    setUnderlay: (p) => set(p),
    commit: (fn, calibration) => {
      const s = get();
      const snap = snapshot();
      set({
        model: replaceFloor(s.model, s.floorId, fn(s.floor())),
        calibration: calibration ?? s.calibration,
        past: [...s.past, snap].slice(-LIMIT),
        future: [],
        dirty: true,
      });
    },
    checkpoint: () => set((s) => ({ past: [...s.past, snapshot()].slice(-LIMIT), future: [] })),
    live: (fn) => set((s) => ({ model: replaceFloor(s.model, s.floorId, fn(s.floor())), dirty: true })),
    undo: () => {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      const current: Snapshot = { floorId: prev.floorId, floor: s.model.floors.find((f) => f.id === prev.floorId)!, calibration: s.calibration };
      set({ model: replaceFloor(s.model, prev.floorId, prev.floor), floorId: prev.floorId, calibration: prev.calibration, past: s.past.slice(0, -1), future: [current, ...s.future], selection: null, dirty: true });
    },
    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      const current: Snapshot = { floorId: next.floorId, floor: s.model.floors.find((f) => f.id === next.floorId)!, calibration: s.calibration };
      set({ model: replaceFloor(s.model, next.floorId, next.floor), floorId: next.floorId, calibration: next.calibration, past: [...s.past, current], future: s.future.slice(1), selection: null, dirty: true });
    },
    markSaved: (model) => set({ model, dirty: false }),
  };
});

export function useEditorFloor(): Floor {
  return useEditorStore((s) => s.model.floors.find((f) => f.id === s.floorId) ?? s.model.floors[0]);
}
