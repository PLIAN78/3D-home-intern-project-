import { describe, expect, it } from "vitest";
import type { PageText } from "@/lib/drawings/planSet/classify";
import { combinePlanSets, elevationTokens, transferOpenings } from "@/lib/drawings/planSet/combineSets";
import { dedupeWalls, normalizeExteriorOpenings } from "@/lib/drawings/planSet/extractFloor";
import { parseLevel, readElevationSpec } from "@/lib/drawings/planSet/elevationSpec";
import type { Floor, Wall } from "@/lib/models/house";
import { composeHouseModel, type FloorVariant, type PlanSet } from "@/lib/models/planSet";

const wall = (id: string, x0: number, y0: number, x1: number, y1: number, exterior = true): Wall => ({ id, start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, thickness: 0.2, height: 3, exterior });
const floor = (walls: Wall[], extra: Partial<Floor> = {}): Floor => ({ id: "ground", name: "Main Floor", elevation: 0.3, ceilingHeight: 2.75, rooms: [], walls, doors: [], windows: [], ...extra });
// 9 m × 11 m box; the redline is missing the left 3 m of the rear wall (drawn only as an outline).
const redlineWalls = [wall("r-rear", 3, 0, 9, 0), wall("r-right", 9, 0, 9, 11), wall("r-front", 9, 11, 0, 11), wall("r-left", 0, 11, 0, 0), wall("r-int", 4, 0, 4, 6, false)];
const decorWalls = [wall("d-rear", 0, 0.05, 9, 0.05), wall("d-right", 9, 0, 9, 11), wall("d-front", 9, 11, 0, 11), wall("d-left", 0, 11, 0, 0), wall("d-int", 4.05, 0, 4.05, 6, false)];

describe("décor openings onto redline walls", () => {
  const decor = floor(decorWalls, {
    windows: [
      { id: "w1", wallId: "d-rear", position: 6, width: 2.4, height: 1.5, sillHeight: 0.9 },
      { id: "w2", wallId: "d-rear", position: 1.5, width: 1.8, height: 2, sillHeight: 0.1 },
      { id: "w3", wallId: "d-int", position: 3, width: 0.9, height: 1, sillHeight: 1 },
    ],
    doors: [{ id: "d1", wallId: "d-front", position: 4.5, width: 0.9, height: 2.1, kind: "front" }],
  });
  const { floor: out, added, walls } = transferOpenings(floor(redlineWalls), decor);

  it("lands windows and doors on the matching redline wall", () => {
    const rear = out.windows.find((w) => w.wallId === "r-rear")!;
    expect(rear.position).toBeCloseTo(3, 1); // 6 m along the décor wall = 3 m along the redline wall (starts at x = 3)
    const door = out.doors.find((d) => d.wallId === "r-front")!;
    expect(door.kind).toBe("front");
    expect(door.position).toBeCloseTo(4.5, 1);
  });

  it("brings in the décor wall where the redline has none, carrying the opening", () => {
    expect(walls).toBe(1);
    const piece = out.walls.find((w) => w.unverified && w.exterior)!;
    expect(Math.min(piece.start.x, piece.end.x)).toBeCloseTo(0, 1);
    expect(Math.max(piece.start.x, piece.end.x)).toBeCloseTo(3, 1);
    expect(out.windows.some((w) => w.wallId === piece.id)).toBe(true);
  });

  it("skips décor 'windows' on interior walls", () => {
    expect(out.windows.some((w) => w.wallId === "r-int")).toBe(false);
    expect(added).toBe(3);
  });

  it("doesn't double an opening the redline already has", () => {
    const withWindow = floor(redlineWalls, { windows: [{ id: "x", wallId: "r-rear", position: 3, width: 2.4, height: 1.5, sillHeight: 0.9 }] });
    expect(transferOpenings(withWindow, decor).floor.windows.filter((w) => w.wallId === "r-rear")).toHaveLength(1);
  });
});

describe("wide exterior openings", () => {
  it("makes street-side gaps windows and rear ones patio doors, leaving front and garage doors alone", () => {
    const f = normalizeExteriorOpenings(
      floor(redlineWalls, {
        doors: [
          { id: "picture", wallId: "r-front", position: 2, width: 2.2, height: 2.1 },
          { id: "patio", wallId: "r-rear", position: 3, width: 1.8, height: 2.1 },
          { id: "garage", wallId: "r-front", position: 6.5, width: 2.5, height: 2.1, kind: "garage" },
          { id: "front", wallId: "r-front", position: 4.5, width: 0.9, height: 2.1, kind: "front" },
        ],
      }),
    );
    expect(f.windows.map((w) => w.id)).toEqual(["picture"]);
    expect(f.doors.find((d) => d.id === "patio")?.kind).toBe("patio");
    expect(f.doors.map((d) => d.id).sort()).toEqual(["front", "garage", "patio"]);
  });
});

describe("duplicate walls", () => {
  it("keeps the longer of two coincident walls and moves openings onto it", () => {
    const f = dedupeWalls(
      floor([wall("front", 5.2, 10.85, 8.5, 10.85), wall("panel", 5.75, 10.75, 8.15, 10.75), wall("other", 0, 10.85, 3.6, 10.85)], {
        doors: [{ id: "g", wallId: "panel", position: 1.2, width: 2.4, height: 2.1, kind: "garage" }],
      }),
    );
    expect(f.walls.map((w) => w.id).sort()).toEqual(["front", "other"]);
    expect(f.doors[0]).toMatchObject({ wallId: "front", position: 1.75 });
  });
});

describe("front elevation reader", () => {
  const items: PageText["items"] = [];
  const at = (str: string, x: number, y: number, w = str.length * 7) => items.push({ str, x, y, w, h: 15 });
  // Datums: label with the value right-aligned beneath it.
  at("FIN. GROUND FLR.", 2162, 1342, 121);
  at('0"', 2273, 1358, 12);
  at("U/S OF GROUND FLOOR", 2126, 1375, 158);
  at('-1\'-0 5/8"', 2231, 1390, 53);
  at("FIN. SECOND FLR.", 2144, 1028, 119);
  at('10\'-1 3/4"', 2208, 1044, 56);
  at("U/S OF SECOND FLOOR", 2107, 1061, 156);
  at('9\'-1 1/8"', 2215, 1076, 49);
  at("TOP OF PLATE", 2188, 778, 96);
  at('18\'-2 3/4"', 2228, 794, 56);
  at("TOP OF SLAB STANDARD 8' BSMNT", 2034, 1613, 230);
  at('-8\'-9 1/8"', 2211, 1628, 53);
  for (const [p, x, y] of [["6:12", 1381, 605], ["10:12", 1228, 599], ["10:12", 873, 651], ["4:12", 1241, 1041]] as const) at(p, x, y);
  // Material schedule rows, then tags on the drawing.
  at("E200", 1261, 313, 35);
  at("HORIZONTAL VINYL SIDING (TYP.)", 1330, 313);
  at("E300", 1872, 194, 35);
  at("FACE BRICK (TYP.)", 1941, 194);
  at("E200", 594, 889, 24);
  at("E300", 595, 1318, 24);
  at("E300", 1820, 1266, 24);
  const spec = readElevationSpec({ width: 2800, height: 1812, items }, 13);

  it("parses feet-and-inches datums", () => {
    expect(parseLevel('10\'-1 3/4"')).toBeCloseTo(3.092, 3);
    expect(parseLevel('-8\'-9 1/8"')).toBeCloseTo(-2.67, 2);
    expect(parseLevel('0"')).toBe(0);
    expect(parseLevel("57\"x 57\"")).toBeNull();
  });

  it("reads storey datums, roof pitches and cladding per storey", () => {
    expect(spec.levels).toMatchObject({ groundUnderside: -0.321, secondFloor: 3.092, secondUnderside: 2.772, topOfPlate: 5.556, basementSlab: -2.67 });
    expect(spec.pitches.main).toBeCloseTo(0.5);
    expect(spec.pitches.gable).toBeCloseTo(10 / 12);
    expect(spec.pitches.lower).toBeCloseTo(4 / 12);
    expect(spec.cladding).toEqual({ ground: "brick", upper: "siding" });
  });
});

describe("combined drawing set", () => {
  const variant = (id: string, elevationId: string, levelId: FloorVariant["levelId"], walls: Wall[], optionId: string | null = null): FloorVariant => ({
    id,
    levelId,
    elevationId,
    optionId,
    page: 1,
    floor: floor(walls, { id: levelId }),
    confidence: 0.6,
    warnings: [],
    reviewed: false,
    sheet: { rasterKey: "k", width: 100, height: 100, metresPerPixel: 0.01, originPx: { x: 0, y: 0 } },
  });
  const base = { projectId: "p", sourceDrawingId: "x", modelCode: "3515", createdAt: "", scale: { metresPerPixel: 0.01, source: "room-dimensions" as const, support: 9 }, levels: ["ground" as const], unmodeled: [], pageCount: 1 };
  const redline: PlanSet = {
    ...base,
    id: "red",
    format: "working",
    elevations: [{ id: "A1", label: "Elevation A1" }, { id: "B1", label: "Elevation B1" }],
    options: [],
    variants: [variant("r1", "A1", "ground", redlineWalls), variant("r2", "B1", "ground", redlineWalls)],
    defaultElevationId: "A1",
    exterior: { A1: { page: 13, levels: { secondUnderside: 2.772, groundUnderside: -0.321 }, pitches: { main: 0.5, gable: 10 / 12, lower: 4 / 12 }, cladding: { ground: "stone", upper: "siding" } } },
  };
  const decor: PlanSet = {
    ...base,
    id: "dec",
    format: "decor",
    elevations: [{ id: "A1", label: "Elevation A1" }, { id: "A/A2/B1", label: "Elevation A / A2 / B1" }, { id: "F", label: "Elevation F" }],
    options: [{ id: "sogf-cc04", levelId: "ground", name: "Chef Center", code: "SOGF-CC04" }],
    variants: [variant("d1", "A1", "ground", decorWalls), variant("d2", "A1", "ground", decorWalls, "sogf-cc04"), variant("d3", "A/A2/B1", "ground", decorWalls), variant("d4", "F", "ground", decorWalls)],
    defaultElevationId: "A1",
  };
  const set = combinePlanSets(redline, decor, { projectId: "p", redlineDrawingId: "red-drawing", decorDrawingId: "dec-drawing" });

  it("splits combined décor elevations and keeps the ones only the décor set draws", () => {
    expect(elevationTokens("A/A2/B1")).toEqual(["A", "A2", "B1"]);
    expect(set.elevations.map((e) => e.id)).toEqual(["A1", "B1", "A/A2", "F"]);
    expect(set.sources).toEqual({ redlineDrawingId: "red-drawing", decorDrawingId: "dec-drawing" });
  });

  it("builds redline elevations from redline geometry with the décor options", () => {
    const a1 = set.variants.filter((v) => v.elevationId === "A1");
    expect(a1.find((v) => !v.optionId)?.source).toBe("redline");
    expect(a1.find((v) => v.optionId === "sogf-cc04")?.source).toBe("decor");
    expect(set.variants.find((v) => v.elevationId === "F")?.source).toBe("decor");
  });

  it("applies the elevation's heights, pitches and cladding to the home", () => {
    const home = composeHouseModel(set, { elevationId: "A1", options: {} }, { id: "h", projectId: "p", name: "3515" });
    const ground = home.floors.find((f) => f.id === "ground")!;
    expect(ground.ceilingHeight).toBeCloseTo(2.772);
    expect(ground.walls.find((w) => w.exterior)?.cladding).toBe("stone");
    expect(home.exterior.roofs.every((r) => [0.5, 10 / 12, 4 / 12].some((p) => Math.abs(r.pitch - p) < 1e-9))).toBe(true);
  });
});
