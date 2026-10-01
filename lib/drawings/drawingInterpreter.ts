import type { Drawing, FloorPlanInterpretation } from "@/lib/models/drawing";

/** A drawing plus access to its PNG raster bytes, as handed to interpreters. */
export interface UploadedDrawing {
  drawing: Drawing;
  /** PNG-encoded raster of the drawing page. */
  raster: Buffer;
}

/**
 * Provider-agnostic interface for turning a floor-plan drawing into structured
 * geometry. Implementations may be local heuristics, a hosted CV model, or an
 * LLM with vision — the app only depends on this contract, and every result is
 * reviewed by a human in the tracing editor before it reaches the 3D model.
 */
export interface DrawingInterpreter {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  interpretFloorPlan(document: UploadedDrawing): Promise<FloorPlanInterpretation>;
}
