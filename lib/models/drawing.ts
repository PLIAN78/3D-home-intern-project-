/**
 * Uploaded architectural drawings and their interpretation results.
 *
 * Every upload keeps the original file, plus a PNG raster (≤ 2400 px) produced
 * in the browser. The raster is used for thumbnails, as the tracing-editor
 * underlay, and as input to drawing interpreters, so interpreters only need
 * to handle one format.
 */

export type DrawingCategory = "floor-plan" | "elevation" | "redline" | "decor" | "structural" | "other";

export const DRAWING_CATEGORIES: { id: DrawingCategory; label: string }[] = [
  { id: "floor-plan", label: "Floor Plan" },
  { id: "elevation", label: "Elevation" },
  { id: "redline", label: "Redline" },
  { id: "decor", label: "Décor" },
  { id: "structural", label: "Structural" },
  { id: "other", label: "Other" },
];

export function categoryLabel(id: DrawingCategory) {
  return DRAWING_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export type UploadStatus = "uploading" | "uploaded" | "failed";

export type ProcessingStatus =
  | "not-started" // uploaded, nothing run yet
  | "processing" // interpreter running
  | "needs-review" // interpretation available, awaiting human review
  | "reviewed" // traced/reviewed geometry saved to a floor
  | "failed"
  | "not-applicable"; // non-floor-plan drawings aren't interpreted (yet)

/** Maps drawing pixels to plan metres: plan = (px − origin) × metresPerPixel. */
export interface DrawingCalibration {
  metresPerPixel: number;
  originPx: { x: number; y: number };
  /** False until a human has defined scale from a known measurement. */
  calibrated: boolean;
}

export interface Drawing {
  id: string;
  projectId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  category: DrawingCategory;
  /** Floor this drawing describes (floor plans). */
  floorId?: string;
  storageKey: string;
  /** PNG raster of the (selected page of the) drawing. */
  rasterKey?: string;
  rasterWidth?: number;
  rasterHeight?: number;
  pageCount?: number;
  page?: number;
  uploadStatus: UploadStatus;
  processingStatus: ProcessingStatus;
  calibration?: DrawingCalibration;
  interpretation?: FloorPlanInterpretation;
  /** Whole-set analysis (multi-page décor / plan sets). */
  analysis?: DrawingAnalysis;
  createdAt: string;
  updatedAt: string;
}

export interface DrawingAnalysis {
  status: "running" | "done" | "failed";
  stage: string;
  done: number;
  total: number;
  planSetId?: string;
  /** Combined redline + décor analysis: the other drawing of the pair. */
  partnerDrawingId?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

// ---------------------------------------------------------------------------
// Interpretation contract (what an AI / CV service returns)
// ---------------------------------------------------------------------------

export interface PxPoint {
  x: number;
  y: number;
}

/** Geometry in drawing PIXEL space; converted to metres after scale calibration. */
export interface InterpretedWall {
  start: PxPoint;
  end: PxPoint;
  thicknessPx: number;
  exterior?: boolean;
  confidence: number;
}

export interface InterpretedOpening {
  kind: "door" | "window";
  /** Index into `walls`. */
  wallIndex: number;
  /** Distance in px from the wall start to the opening centre. */
  positionPx: number;
  widthPx: number;
  confidence: number;
}

export interface InterpretedRoom {
  name: string;
  polygon: PxPoint[];
  confidence: number;
}

export interface FloorPlanInterpretation {
  interpreter: string;
  walls: InterpretedWall[];
  rooms: InterpretedRoom[];
  doors: InterpretedOpening[];
  windows: InterpretedOpening[];
  /** Estimated scale, if the interpreter could find one (e.g. from a scale bar or dimensions). */
  scale?: { metresPerPixel: number; confidence: number };
  /** Overall 0–1 confidence. */
  confidence: number;
  warnings: string[];
  imageSize: { width: number; height: number };
  createdAt: string;
}
