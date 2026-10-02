import { describe, expect, it } from "vitest";
import { closeGarageFront, dropAttachedInsets, mainCluster, splitAdjacentDrawings } from "@/lib/drawings/planSet/extractFloor";
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

describe("option insets drawn against the plan", () => {
  const text = (captions: { x: number; y: number; lines: string[] }[], dims: { x: number; y: number; str: string }[] = []): PageText => ({
    width: 2000,
    height: 3000,
    items: [
      ...captions.flatMap((c) => c.lines.map((str, k) => ({ str, x: c.x, y: c.y + k * 25, w: str.length * 12, h: 22 }))),
      ...dims.map((d) => ({ ...d, w: 90, h: 13 })),
    ],
  });
  // Plan x 100–1000, y 800–2000; a walk-up-steps inset above it (y 400–700), joined by the shared left wall line.
  const plan = [W(100, 800, 1000, 800), W(1000, 800, 1000, 2000), W(1000, 2000, 100, 2000), W(100, 400, 100, 2000), W(100, 1400, 1000, 1400)];
  const inset = [W(100, 400, 700, 400), W(700, 400, 700, 700), W(100, 700, 700, 700)];
  const planDims = [
    { x: 400, y: 1100, str: `14'11"x20'1"` },
    { x: 400, y: 1700, str: `12'0"x10'6"` },
  ];
  const sheetCaption = { x: 120, y: 2200, lines: ["ELEVATION A", "STANDARD BASEMENT FLOOR PLAN"] };
  const ys = (ws: InterpretedWall[]) => ws.flatMap((w) => [w.start.y, w.end.y]);

  it("drops an inset above the plan, captioned beside it", () => {
    const t = text([sheetCaption, { x: 800, y: 500, lines: ["SOBS-WK01", "ELEVATION A", "BASEMENT OPT. WALK-UP STEPS"] }], planDims);
    const r = dropAttachedInsets([...plan, ...inset], t);
    expect(r.dropped).toEqual(["SOBS-WK01 ELEVATION A BASEMENT OPT. WALK-UP STEPS"]);
    expect(Math.min(...ys(r.walls))).toBe(800);
    // The shared left wall is trimmed, not dropped.
    expect(r.walls.some((w) => w.start.x === 100 && w.end.x === 100)).toBe(true);
  });

  it("drops an inset that repeats a room from another elevation", () => {
    const t = text([sheetCaption, { x: 120, y: 730, lines: ["SOBS-", "ELEVATION C", "OPT. BASEMENT WALK-UP STEPS"] }], [...planDims, { x: 300, y: 550, str: `10'6"x13'7"` }]);
    expect(dropAttachedInsets([...plan, ...inset], t).dropped).toHaveLength(1);
  });

  it("ignores the option code repeated in the title block", () => {
    const t = text([sheetCaption, { x: 1500, y: 2700, lines: ["SOBS-BP02"] }], planDims);
    expect(dropAttachedInsets(plan, t)).toEqual({ walls: plan, dropped: [] });
  });

  it("never cuts away part of the plan that holds its rooms", () => {
    // A caption beside the lower half must not split the plan through its rooms.
    const t = text([sheetCaption, { x: 1100, y: 1500, lines: ["SOGF-GF01", "ELEV. A OPT. F.P."] }], planDims);
    expect(dropAttachedInsets(plan, t).walls).toEqual(plan);
  });
});

describe("garage front", () => {
  const wall = (id: string, x0: number, y0: number, x1: number, y1: number): Wall => ({ id, start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, thickness: 0.25, height: 3, exterior: true });
  // A double garage (x 7.3–13.2, front at y = 11.1) whose 5 m door gap the tracer left open between two piers.
  const base: Floor = {
    id: "ground",
    name: "Main Floor",
    elevation: 0.3,
    ceilingHeight: 2.75,
    rooms: [],
    doors: [],
    windows: [],
    walls: [wall("left", 7.3, 4.8, 7.3, 11.1), wall("right", 13.2, 0.4, 13.2, 11.1), wall("back", 7.3, 4.8, 13.2, 4.8), wall("pier-l", 7.3, 11.1, 7.8, 11.1), wall("pier-r", 12.76, 11.1, 13.2, 11.1)],
  };
  const label = [{ name: "GARAGE", x: 10.3, y: 7.9 }];

  it("puts the front wall back with a garage door between the piers", () => {
    const f = closeGarageFront(base, label);
    const door = f.doors.find((d) => d.kind === "garage")!;
    const w = f.walls.find((x) => x.id === door.wallId)!;
    expect(w.start).toEqual({ x: 7.8, y: 11.1 });
    expect(w.end).toEqual({ x: 12.76, y: 11.1 });
    expect(door.width).toBeCloseTo(4.56, 2);
    expect(w.unverified).toBe(true);
  });

  it("leaves a garage that already has its door, or no garage label, alone", () => {
    const withDoor = closeGarageFront(base, label);
    expect(closeGarageFront(withDoor, label)).toBe(withDoor);
    expect(closeGarageFront(base, [{ name: "GREAT ROOM", x: 10.3, y: 7.9 }])).toBe(base);
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
