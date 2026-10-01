import { create } from "zustand";
import type { MaterialSlotId } from "@/lib/models/materials";

export type ViewMode = "house" | "community";
export type CameraView = "perspective" | "front" | "rear" | "left" | "right" | "top";

/** Special isolation target for the roof level. */
export const ROOF_LEVEL = "roof";

interface ViewerState {
  mode: ViewMode;
  /** Floor id (or ROOF_LEVEL) currently isolated; null shows all levels. */
  isolated: string | null;
  /** Floor separation 0–100. */
  explode: number;
  hiddenFloors: Record<string, boolean>;
  showRoof: boolean;
  showCeilings: boolean;
  showExteriorWalls: boolean;
  showLabels: boolean;
  /** Show the community's base/placeholder model on the customer's lot instead of their home. */
  showBaseModel: boolean;
  selectedSlot: MaterialSlotId | null;
  hoveredSlot: MaterialSlotId | null;
  cameraRequest: { view: CameraView; nonce: number };
  screenshotNonce: number;

  setMode: (mode: ViewMode) => void;
  showFullHouse: () => void;
  isolate: (id: string | null) => void;
  setExplode: (v: number) => void;
  toggleExploded: () => void;
  toggleFloorHidden: (id: string) => void;
  setShowRoof: (v: boolean) => void;
  setShowCeilings: (v: boolean) => void;
  setShowExteriorWalls: (v: boolean) => void;
  setShowLabels: (v: boolean) => void;
  setShowBaseModel: (v: boolean) => void;
  selectSlot: (slot: MaterialSlotId | null) => void;
  hoverSlot: (slot: MaterialSlotId | null) => void;
  requestView: (view: CameraView) => void;
  requestScreenshot: () => void;
}

export const DEFAULT_EXPLODE = 55;

export const useViewerStore = create<ViewerState>((set, get) => ({
  mode: "house",
  isolated: null,
  explode: 0,
  hiddenFloors: {},
  showRoof: true,
  showCeilings: false,
  showExteriorWalls: true,
  showLabels: true,
  showBaseModel: false,
  selectedSlot: null,
  hoveredSlot: null,
  cameraRequest: { view: "perspective", nonce: 0 },
  screenshotNonce: 0,

  // Community mode shows the whole home in context, so clear inspection state.
  setMode: (mode) => set(mode === "community" ? { mode, isolated: null, explode: 0 } : { mode }),
  showFullHouse: () => set({ isolated: null, explode: 0, hiddenFloors: {}, showRoof: true, showExteriorWalls: true }),
  isolate: (id) => set({ isolated: id, explode: 0 }),
  setExplode: (v) => set({ explode: Math.max(0, Math.min(100, v)), isolated: v > 0 ? null : get().isolated }),
  toggleExploded: () => set((s) => ({ explode: s.explode > 0 ? 0 : DEFAULT_EXPLODE, isolated: null })),
  toggleFloorHidden: (id) => set((s) => ({ hiddenFloors: { ...s.hiddenFloors, [id]: !s.hiddenFloors[id] }, isolated: null })),
  setShowRoof: (v) => set({ showRoof: v }),
  setShowCeilings: (v) => set({ showCeilings: v }),
  setShowExteriorWalls: (v) => set({ showExteriorWalls: v }),
  setShowLabels: (v) => set({ showLabels: v }),
  setShowBaseModel: (v) => set({ showBaseModel: v }),
  selectSlot: (slot) => set({ selectedSlot: slot }),
  hoverSlot: (slot) => set({ hoveredSlot: slot }),
  requestView: (view) => set((s) => ({ cameraRequest: { view, nonce: s.cameraRequest.nonce + 1 } })),
  requestScreenshot: () => set((s) => ({ screenshotNonce: s.screenshotNonce + 1 })),
}));

/** Is a floor visible given isolation + per-floor toggles? */
export function isFloorVisible(s: Pick<ViewerState, "isolated" | "hiddenFloors">, floorId: string) {
  if (s.isolated) return s.isolated === floorId;
  return !s.hiddenFloors[floorId];
}

export function isRoofVisible(s: Pick<ViewerState, "isolated" | "showRoof">) {
  if (s.isolated) return s.isolated === ROOF_LEVEL;
  return s.showRoof;
}
