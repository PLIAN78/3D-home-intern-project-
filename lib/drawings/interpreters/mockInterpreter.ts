import type { FloorPlanInterpretation } from "@/lib/models/drawing";
import type { DrawingInterpreter, UploadedDrawing } from "../drawingInterpreter";

/**
 * Returns a fixed, obviously-placeholder layout sized to the drawing. Useful
 * for exercising the review workflow end to end without any extraction.
 */
export class MockDrawingInterpreter implements DrawingInterpreter {
  readonly id = "mock";
  readonly label = "Mock (placeholder)";
  readonly description = "Returns a sample rectangular layout. Does not read the drawing.";

  async interpretFloorPlan({ drawing }: UploadedDrawing): Promise<FloorPlanInterpretation> {
    const w = drawing.rasterWidth ?? 2000;
    const h = drawing.rasterHeight ?? 1400;
    const x0 = w * 0.2;
    const x1 = w * 0.8;
    const y0 = h * 0.2;
    const y1 = h * 0.8;
    const xm = (x0 + x1) / 2;
    const t = Math.max(6, w * 0.012);
    const p = (x: number, y: number) => ({ x, y });
    return {
      interpreter: this.id,
      walls: [
        { start: p(x0, y0), end: p(x1, y0), thicknessPx: t, exterior: true, confidence: 0.3 },
        { start: p(x1, y0), end: p(x1, y1), thicknessPx: t, exterior: true, confidence: 0.3 },
        { start: p(x1, y1), end: p(x0, y1), thicknessPx: t, exterior: true, confidence: 0.3 },
        { start: p(x0, y1), end: p(x0, y0), thicknessPx: t, exterior: true, confidence: 0.3 },
        { start: p(xm, y0), end: p(xm, y1), thicknessPx: t * 0.5, confidence: 0.2 },
      ],
      doors: [
        { kind: "door", wallIndex: 2, positionPx: (x1 - x0) * 0.3, widthPx: t * 4, confidence: 0.2 },
        { kind: "door", wallIndex: 4, positionPx: (y1 - y0) * 0.5, widthPx: t * 3.5, confidence: 0.2 },
      ],
      windows: [
        { kind: "window", wallIndex: 0, positionPx: (x1 - x0) * 0.25, widthPx: t * 6, confidence: 0.2 },
        { kind: "window", wallIndex: 0, positionPx: (x1 - x0) * 0.75, widthPx: t * 6, confidence: 0.2 },
      ],
      rooms: [
        { name: "Room A", polygon: [p(x0, y0), p(xm, y0), p(xm, y1), p(x0, y1)], confidence: 0.1 },
        { name: "Room B", polygon: [p(xm, y0), p(x1, y0), p(x1, y1), p(xm, y1)], confidence: 0.1 },
      ],
      confidence: 0.1,
      warnings: [
        "Mock interpreter: this geometry is a placeholder and is NOT derived from the drawing.",
        "Scale could not be determined — calibrate using two points and a known measurement.",
      ],
      imageSize: { width: w, height: h },
      createdAt: new Date().toISOString(),
    };
  }
}
