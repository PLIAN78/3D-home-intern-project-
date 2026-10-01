import { PNG } from "pngjs";
import type { FloorPlanInterpretation } from "@/lib/models/drawing";
import type { DrawingInterpreter, UploadedDrawing } from "../drawingInterpreter";
import { detectWalls, toGrey } from "./lineDetection";

/** Typical exterior wall thickness, used only to suggest an initial scale. */
const ASSUMED_EXTERIOR_WALL_M = 0.3;

export class HeuristicDrawingInterpreter implements DrawingInterpreter {
  readonly id = "heuristic";
  readonly label = "Line detection (experimental)";
  readonly description = "Detects solid horizontal/vertical walls and gaps in them. No rooms or text.";

  async interpretFloorPlan({ raster }: UploadedDrawing): Promise<FloorPlanInterpretation> {
    const png = PNG.sync.read(raster);
    const img = toGrey(png.width, png.height, png.data);
    const result = detectWalls(img);
    const warnings: string[] = [
      "Experimental line detection: only solid, axis-aligned walls are found. Review every element.",
      "Rooms are not detected — define them with the Room tool.",
    ];
    if (result.walls.length < 4) warnings.push("Very few walls were found. The drawing may use outlined (unfilled) walls or be low contrast.");
    const ends = result.stats.totalEnds || 1;
    const snapRatio = result.stats.snappedEnds / ends;
    if (snapRatio < 0.6) warnings.push("Many wall ends don't meet another wall — some boundaries may be ambiguous.");
    if (result.doors.length + result.windows.length > 0) warnings.push("Doors vs. windows were guessed from gap contents — check each opening.");

    const exteriorThickness = result.walls.filter((w) => w.exterior).map((w) => w.thicknessPx);
    const extT = exteriorThickness.length ? exteriorThickness.reduce((a, b) => a + b, 0) / exteriorThickness.length : 0;
    const scale = extT > 0 ? { metresPerPixel: ASSUMED_EXTERIOR_WALL_M / extT, confidence: 0.25 } : undefined;
    warnings.push(
      scale
        ? "Scale was estimated from exterior wall thickness (assumes ~300 mm walls). Calibrate with a known dimension."
        : "Scale could not be determined confidently — calibrate using two points and a known measurement.",
    );

    const confidence = Math.min(0.65, 0.15 + 0.3 * Math.min(1, result.walls.length / 12) + 0.25 * snapRatio);
    return {
      interpreter: this.id,
      walls: result.walls,
      doors: result.doors,
      windows: result.windows,
      rooms: [],
      scale,
      confidence: Math.round(confidence * 100) / 100,
      warnings,
      imageSize: { width: png.width, height: png.height },
      createdAt: new Date().toISOString(),
    };
  }
}
