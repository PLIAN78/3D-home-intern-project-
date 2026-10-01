import { readFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { detectWalls, toGrey } from "@/lib/drawings/interpreters/lineDetection";
import { HeuristicDrawingInterpreter } from "@/lib/drawings/interpreters/heuristicInterpreter";
import { MockDrawingInterpreter } from "@/lib/drawings/interpreters/mockInterpreter";
import { guessCategory, guessFloorId } from "@/lib/drawings/guess";
import type { Drawing } from "@/lib/models/drawing";
import { PLAN_36 } from "@/lib/sample/plan36";

const sample = (name: string) => readFileSync(path.join(__dirname, "..", "public", "samples", name));
const floorOf = (id: string) => PLAN_36.floors.find((f) => f.id === id)!;

function detect(file: string) {
  const png = PNG.sync.read(sample(file));
  return detectWalls(toGrey(png.width, png.height, png.data));
}

describe("line detection on the Plan 36 sample drawings", () => {
  // The samples are rendered from PLAN_36, so the model is the ground truth.
  it.each([
    ["plan36-ground.png", "ground"],
    ["plan36-second.png", "second"],
    ["plan36-basement.png", "basement"],
  ])("%s: finds walls and openings close to the source model", (file, floorId) => {
    const truth = floorOf(floorId);
    const r = detect(file);
    expect(Math.abs(r.walls.length - truth.walls.length)).toBeLessThanOrEqual(2);
    expect(r.windows.length).toBe(truth.windows.length);
    expect(Math.abs(r.doors.length - truth.doors.length)).toBeLessThanOrEqual(1);
    expect(r.walls.filter((w) => w.exterior).length).toBeGreaterThanOrEqual(4);
  });

  it("heuristic interpreter estimates scale within 5% and reports warnings", async () => {
    const raster = sample("plan36-ground.png");
    const png = PNG.sync.read(raster);
    const result = await new HeuristicDrawingInterpreter().interpretFloorPlan({ drawing: { rasterWidth: png.width, rasterHeight: png.height } as Drawing, raster });
    // Samples are drawn at 110 px per metre.
    expect(result.scale?.metresPerPixel).toBeCloseTo(1 / 110, 3);
    expect(result.confidence).toBeGreaterThan(0.3);
    expect(result.confidence).toBeLessThanOrEqual(0.65);
    expect(result.warnings.some((w) => /scale/i.test(w))).toBe(true);
    expect(result.rooms).toHaveLength(0);
  });

  it("mock interpreter is clearly labelled as a placeholder", async () => {
    const r = await new MockDrawingInterpreter().interpretFloorPlan({ drawing: { rasterWidth: 1000, rasterHeight: 800 } as Drawing, raster: Buffer.alloc(0) });
    expect(r.confidence).toBeLessThan(0.2);
    expect(r.warnings[0]).toMatch(/NOT derived/);
  });
});

describe("upload guesses", () => {
  it("guesses category and floor from file names", () => {
    expect(guessCategory("A-101 Main Floor Plan.pdf")).toBe("floor-plan");
    expect(guessCategory("Front Elevation.png")).toBe("elevation");
    expect(guessCategory("redline-rev3.pdf")).toBe("redline");
    expect(guessCategory("S-201 framing.pdf")).toBe("structural");
    expect(guessFloorId("plan36-second.pdf", PLAN_36.floors)).toBe("second");
    expect(guessFloorId("Basement plan.pdf", PLAN_36.floors)).toBe("basement");
    expect(guessFloorId("main floor.png", PLAN_36.floors)).toBe("ground");
    expect(guessFloorId("site plan.pdf", PLAN_36.floors)).toBeUndefined();
  });
});
