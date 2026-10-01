import { describe, expect, it } from "vitest";
import {
  addOpening,
  addWall,
  autoClassifyExterior,
  deleteElement,
  importInterpretation,
  moveJoinedPoint,
  parseLength,
  pxToPlan,
  scaleFloor,
  snapPoint,
} from "@/lib/editor/editorOps";
import { deriveFootprint, finalizeHouseModel, generateAutoRoofs } from "@/lib/models/finalize";
import type { FloorPlanInterpretation } from "@/lib/models/drawing";
import type { Floor } from "@/lib/models/house";
import { blankHouseModel, defaultFloors } from "@/lib/models/templates";
import { validateHouseModel } from "@/lib/models/validate";
import { PLAN_36 } from "@/lib/sample/plan36";

const ground = () => structuredClone(PLAN_36.floors.find((f) => f.id === "ground")!);
const empty = (): Floor => ({ id: "f", name: "F", elevation: 0.3, ceilingHeight: 2.7, rooms: [], walls: [], doors: [], windows: [] });

describe("parseLength", () => {
  it.each([
    ["12.8", "m", 12.8],
    ["1280cm", "m", 12.8],
    ["42'", "ft", 12.8016],
    [`41' 6"`, "ft", 12.6492],
    ["41-6", "ft", 12.6492],
    ["10", "ft", 3.048],
  ] as const)("%s (%s)", (input, unit, expected) => {
    expect(parseLength(input, unit)).toBeCloseTo(expected, 3);
  });
  it("rejects nonsense", () => expect(parseLength("abc", "m")).toBeNull());
});

describe("editor operations", () => {
  it("snaps to endpoints, then orthogonal to the previous point", () => {
    const f = addWall(empty(), { x: 0, y: 0 }, { x: 5, y: 0 }, true).floor;
    expect(snapPoint({ x: 5.05, y: 0.04 }, 0.2, { floors: [f] }).kind).toBe("endpoint");
    const ortho = snapPoint({ x: 5.02, y: 3.1 }, 0.1, { floors: [f], from: { x: 5, y: 0 } });
    expect(ortho.point.x).toBe(5);
    expect(["ortho", "align"]).toContain(ortho.kind);
  });

  it("moving a corner drags every joined wall end", () => {
    let f = addWall(empty(), { x: 0, y: 0 }, { x: 5, y: 0 }, true).floor;
    f = addWall(f, { x: 5, y: 0 }, { x: 5, y: 4 }, true).floor;
    f = moveJoinedPoint(f, { x: 5, y: 0 }, { x: 6, y: 0 });
    expect(f.walls[0].end).toEqual({ x: 6, y: 0 });
    expect(f.walls[1].start).toEqual({ x: 6, y: 0 });
  });

  it("deleting a wall removes its openings; openings must fit their wall", () => {
    const { floor, wall } = addWall(empty(), { x: 0, y: 0 }, { x: 4, y: 0 }, false);
    const withDoor = addOpening(floor, "door", wall, 0.1)!;
    expect(withDoor.floor.doors[0].position).toBeGreaterThan(0.4); // clamped inside the wall
    expect(deleteElement(withDoor.floor, "wall", wall.id).doors).toHaveLength(0);
    const tiny = addWall(empty(), { x: 0, y: 0 }, { x: 0.5, y: 0 }, false);
    expect(addOpening(tiny.floor, "window", tiny.wall, 0.25)).toBeNull();
  });

  it("re-detects exterior walls on Plan 36's main floor", () => {
    const g = ground();
    const stripped = { ...g, walls: g.walls.map((w) => ({ ...w, exterior: false, cladding: undefined })) };
    const result = autoClassifyExterior(stripped);
    const truth = new Map(g.walls.map((w) => [w.id, !!w.exterior]));
    for (const w of result.walls) expect(w.exterior, w.id).toBe(truth.get(w.id));
  });

  it("imports interpretations in metres and flags them unverified", () => {
    const interp: FloorPlanInterpretation = {
      interpreter: "test",
      walls: [{ start: { x: 100, y: 100 }, end: { x: 1100, y: 100 }, thicknessPx: 30, exterior: true, confidence: 0.5 }],
      doors: [{ kind: "door", wallIndex: 0, positionPx: 500, widthPx: 90, confidence: 0.3 }],
      windows: [],
      rooms: [],
      confidence: 0.4,
      warnings: [],
      imageSize: { width: 1200, height: 800 },
      createdAt: "",
    };
    const c = { metresPerPixel: 0.01, originPx: { x: 100, y: 100 }, calibrated: true };
    const f = importInterpretation(empty(), interp, c, "replace");
    expect(f.walls[0].start).toEqual({ x: 0, y: 0 });
    expect(f.walls[0].end).toEqual({ x: 10, y: 0 });
    expect(f.walls[0].unverified).toBe(true);
    expect(f.doors[0]).toMatchObject({ position: 5, kind: "exterior", unverified: true });
    expect(f.doors[0].width).toBeCloseTo(0.9);
    expect(pxToPlan(c, { x: 600, y: 300 })).toEqual({ x: 5, y: 2 });
  });

  it("rescales geometry about the origin after calibration", () => {
    const f = scaleFloor(addWall(empty(), { x: 1, y: 2 }, { x: 3, y: 2 }, true).floor, 2);
    expect(f.walls[0].start).toEqual({ x: 2, y: 4 });
    expect(f.walls[0].end).toEqual({ x: 6, y: 4 });
  });
});

describe("finalizeHouseModel", () => {
  it("derives the L-shaped footprint from exterior walls", () => {
    const fp = deriveFootprint(ground())!;
    expect(fp).toHaveLength(6);
    const area = Math.abs(fp.reduce((s, p, i) => s + p.x * fp[(i + 1) % fp.length].y - fp[(i + 1) % fp.length].x * p.y, 0)) / 2;
    expect(area).toBeCloseTo(12.8 * 11 + 6.1 * 2, 1);
  });

  it("stacks elevations, sets wall heights and generates roofs", () => {
    const model = structuredClone(PLAN_36);
    for (const f of model.floors) for (const w of f.walls) w.height = 1; // scramble
    model.floors.find((f) => f.id === "second")!.elevation = 99;
    const { model: out } = finalizeHouseModel({ ...model, exterior: { ...model.exterior, autoRoof: true } });
    const byId = (id: string) => out.floors.find((f) => f.id === id)!;
    expect(byId("second").elevation).toBeCloseTo(3.35);
    expect(byId("basement").elevation).toBeCloseTo(-2.3);
    const ext = byId("ground").walls.find((w) => w.exterior)!;
    expect(ext.height).toBeCloseTo(2.75 + 0.3);
    expect(byId("ground").walls.find((w) => !w.exterior)!.height).toBeCloseTo(2.75);
    // Hip over the second floor + a shed over the projecting garage.
    expect(out.exterior.roofs.some((r) => r.type === "hip" && r.baseFloorId === "second")).toBe(true);
    expect(out.exterior.roofs.some((r) => r.type === "shed" && r.baseFloorId === "ground" && r.highSide === "-y")).toBe(true);
    expect(out.exterior.drivewayStart).toEqual({ x: 3.05, y: 13 });
  });

  it("generates nothing for floors without walls", () => {
    expect(generateAutoRoofs(defaultFloors(2, false))).toEqual([]);
  });
});

describe("validateHouseModel", () => {
  it("accepts the sample and blank models", () => {
    expect(validateHouseModel(PLAN_36)).toEqual([]);
    expect(validateHouseModel(blankHouseModel("h", "p", "X", 3, true))).toEqual([]);
  });
  it("rejects openings on missing walls and bad numbers", () => {
    const m = structuredClone(PLAN_36);
    m.floors[1].doors[0].wallId = "nope";
    m.floors[1].walls[0].thickness = Number.NaN;
    expect(validateHouseModel(m).length).toBeGreaterThanOrEqual(2);
    expect(validateHouseModel(null)).toEqual(["Model is missing"]);
  });
});
