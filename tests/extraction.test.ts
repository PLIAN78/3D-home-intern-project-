import { describe, expect, it } from "vitest";
import { mainCluster, splitAdjacentDrawings } from "@/lib/drawings/planSet/extractFloor";
import type { PageText } from "@/lib/drawings/planSet/classify";
import type { InterpretedWall } from "@/lib/models/drawing";
import { clipRoomToFootprint, rasterFootprint } from "@/lib/models/footprint";
import type { Floor, Wall } from "@/lib/models/house";
import { composeHouseModel, defaultPlanSelection, type PlanSet } from "@/lib/models/planSet";

// Synthetic drawings (pixels) — not taken from any real plan.
const W = (x0: number, y0: number, x1: number, y1: number, t = 12): InterpretedWall => ({ start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, thicknessPx: t, confidence: 0.9 });
const rect = (x0: number, y0: number, x1: number, y1: number) => [W(x0, y0, x1, y0), W(x1, y0, x1, y1), W(x1, y1, x0, y1), W(x0, y1, x0, y0)];
const ctx = (anchors: { x: number; y: number }[]) => ({ pageWidth: 2000, pageHeight: 3000, anchors });

describe("main drawing selection", () => {
  it("keeps a house and garage that only meet through gaps as one drawing", () => {
    // House (left) and garage (right): no wall touches, but their outlines interleave.
    const house = [W(100, 500, 600, 500), W(100, 500, 100, 1500), W(100, 1500, 380, 1500), W(380, 900, 380, 1500), W(380, 900, 560, 900)];
    const garage = rect(400, 700, 900, 1500);
    const inset = rect(1100, 1800, 1400, 2000);
    const walls = [...house, ...garage, ...inset];
    const keep = new Set(mainCluster(walls, ctx([{ x: 250, y: 700 }, { x: 650, y: 1100 }])));
    for (let i = 0; i < house.length + garage.length; i++) expect(keep.has(i)).toBe(true);
    for (let i = house.length + garage.length; i < walls.length; i++) expect(keep.has(i)).toBe(false);
  });
});

describe("alternate drawn against the plan", () => {
  const text = (captions: { x: number; y: number; lines: string[] }[]): PageText => ({
    width: 2000,
    height: 3000,
    items: captions.flatMap((c) => c.lines.map((str, k) => ({ str, x: c.x, y: c.y + k * 25, w: str.length * 12, h: 22 }))),
  });
  // A narrow alternate strip (x 100–300) sharing its right wall with the plan (x 300–1000).
  const walls = [W(100, 500, 1000, 500), W(100, 1500, 1000, 1500), W(100, 500, 100, 1500), W(300, 500, 300, 1500), W(1000, 500, 1000, 1500), W(300, 1000, 1000, 1000), W(100, 900, 300, 900)];

  it("cuts off the 'w/ SIDE UPGRADE' strip and keeps the standard plan", () => {
    const t = text([
      { x: 110, y: 1700, lines: ["ESID-100", "ELEVATION A", "STANDARD SECOND FLOOR PLAN", "w/ SIDE UPGRADE"] },
      { x: 620, y: 1700, lines: ["ELEVATION A", "STANDARD SECOND FLOOR PLAN"] },
    ]);
    const r = splitAdjacentDrawings(walls, t);
    expect(r.dropped).toContain("SIDE UPGRADE");
    const xs = r.walls.flatMap((w) => [w.start.x, w.end.x]);
    expect(Math.min(...xs)).toBe(300);
    expect(Math.max(...xs)).toBe(1000);
  });

  it("handles option sheets whose own name contains 'W/'", () => {
    const t = text([
      { x: 110, y: 1700, lines: ["ESID-100", "ELEVATION A", "SECOND FLOOR OPT. RETREAT W/ DELUXE LAUNDRY", "w/ SIDE UPGRADE"] },
      { x: 620, y: 1700, lines: ["SOSF-PT02", "ELEVATION A", "SECOND FLOOR OPT. RETREAT W/ DELUXE LAUNDRY"] },
    ]);
    expect(splitAdjacentDrawings(walls, t).dropped).toContain("SIDE UPGRADE");
  });

  it("leaves a single-caption drawing alone", () => {
    const t = text([{ x: 400, y: 1700, lines: ["ELEVATION A", "STANDARD SECOND FLOOR PLAN"] }]);
    expect(splitAdjacentDrawings(walls, t)).toEqual({ walls, dropped: null });
  });
});

describe("building outline", () => {
  const wall = (id: string, x0: number, y0: number, x1: number, y1: number, exterior = true): Wall => ({ id, start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, thickness: 0.25, height: 2.7, exterior });
  // L-shaped plan with a notch at the top right; the exterior walls have a door-sized gap
  // (bottom) and don't meet exactly at one corner, so they don't form a clean loop.
  const floor: Floor = {
    id: "ground",
    name: "Main Floor",
    elevation: 0.3,
    ceilingHeight: 2.7,
    rooms: [],
    doors: [],
    windows: [],
    walls: [
      wall("a", 0, 0, 5, 0),
      wall("b", 5, 0, 5, 2),
      wall("c", 5, 2, 9, 2),
      wall("d", 9, 2.05, 9, 13),
      wall("e", 9, 13, 4, 13),
      wall("f", 3, 13, 0, 13),
      wall("g", 0, 13, 0, 0),
      wall("i", 0, 7, 5, 7, false),
    ],
  };

  it("traces an L-shaped outline when the walls don't form a clean loop", () => {
    const fp = rasterFootprint(floor)!;
    expect(fp).not.toBeNull();
    expect(fp).toHaveLength(6);
    const xs = fp.map((p) => p.x);
    const ys = fp.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 1);
    expect(Math.max(...xs)).toBeCloseTo(9, 1);
    expect(Math.max(...ys)).toBeCloseTo(13, 1);
    // The notch corner is there.
    expect(fp.some((p) => Math.abs(p.x - 5) < 0.05 && Math.abs(p.y - 2) < 0.1)).toBe(true);
  });

  it("trims a room that spills into the notch", () => {
    const fp = rasterFootprint(floor)!;
    const room = { id: "r", name: "Great Room", finish: "main" as const, polygon: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 7 }, { x: 0, y: 7 }] };
    const clipped = clipRoomToFootprint(room, fp);
    expect(clipped.polygon.length).toBe(6);
    expect(clipped.polygon.some((p) => p.x > 5.5 && p.y < 1.5)).toBe(false);
    const inside = { ...room, polygon: [{ x: 1, y: 8 }, { x: 4, y: 8 }, { x: 4, y: 12 }, { x: 1, y: 12 }] };
    expect(clipRoomToFootprint(inside, fp)).toBe(inside);
  });
});

describe("drawing sets without a standard sheet for a level", () => {
  it("still builds that floor from its only (option-coded) sheet", () => {
    const floor = (id: string, elevation: number): Floor => ({ id, name: id, elevation, ceilingHeight: 2.7, rooms: [], doors: [], windows: [], walls: [] });
    const sheet = { rasterKey: "k", width: 1, height: 1, metresPerPixel: 0.01, originPx: { x: 0, y: 0 } };
    const set = {
      id: "ps",
      projectId: "p",
      sourceDrawingId: "d",
      modelCode: "9999",
      createdAt: "",
      scale: { metresPerPixel: 0.01, source: "room-dimensions", support: 3 },
      levels: ["basement", "ground"],
      elevations: [{ id: "D", label: "Elevation D" }],
      options: [{ id: "sogf", levelId: "ground", name: "Alt", code: "SOGF-" }],
      variants: [
        { id: "v1", levelId: "basement", elevationId: "D", optionId: null, page: 1, floor: floor("basement", -2.3), confidence: 0.7, warnings: [], reviewed: false, sheet },
        { id: "v2", levelId: "ground", elevationId: "D", optionId: "sogf", page: 2, floor: floor("ground", 0.3), confidence: 0.7, warnings: [], reviewed: false, sheet },
      ],
      unmodeled: [],
      defaultElevationId: "D",
      pageCount: 2,
    } as unknown as PlanSet;
    const house = composeHouseModel(set, defaultPlanSelection(set), { id: "h", projectId: "p", name: "T" });
    expect(house.floors.map((f) => f.id).sort()).toEqual(["basement", "ground"]);
  });
});
