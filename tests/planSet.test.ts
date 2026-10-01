import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyPages, parseRoomDimension, type PageText } from "@/lib/drawings/planSet/classify";
import { consensusScale } from "@/lib/drawings/planSet/extractFloor";
import { registerFloor, translateFloor } from "@/lib/drawings/planSet/align";
import { buildPlanSet } from "@/lib/drawings/planSet/buildPlanSet";
import { composeHouseModel, describeSelection, optionsFor, sanitizeSelection, type FloorVariant, type PlanSet } from "@/lib/models/planSet";
import { PLAN_36 } from "@/lib/sample/plan36";

/** Synthetic sheet in the style of a builder décor set (title block at the bottom, caption near the plan). */
function sheet(code: string, title: string, sheetNo: string, caption?: string): PageText {
  const H = 2800;
  const items = [
    { str: code, x: 1400, y: H * 0.9, w: 200, h: 36 },
    { str: title, x: 600, y: H * 0.94, w: 700, h: 36 },
    { str: sheetNo, x: 1400, y: H * 0.95, w: 300, h: 50 },
    { str: "NOT TO SCALE", x: 100, y: 150, w: 200, h: 18 },
  ];
  if (caption) items.push({ str: caption, x: 140, y: H * 0.78, w: 200, h: 22 });
  return { items, width: 1700, height: H };
}

describe("drawing-set page classification", () => {
  const pages = [
    sheet("STANDARD", "STANDARD BASEMENT FLOOR PLAN", "9999A10", "ELEVATION A1"),
    sheet("STANDARD", "STANDARD GROUND FLOOR PLAN", "9999A11", "ELEVATION A1"),
    sheet("SOGF-CC04", "GROUND FLOOR PLAN CHEF CENTER", "9999A11CC", "ELEVATION A1"),
    sheet("GLOB/GWOB", "GRADE CONDITION GROUND FLOOR PLANS", "9999A11GR"),
    sheet("SOSF-4B01", "STANDARD FLOOR 4 BEDROOM", "9999A124B", "ELEVATION A1"),
    sheet("SOBS-BP02", "BASEMENT FLOOR PLAN OPT. BEDROOM", "9999A10BB", "ELEVATION A1"),
    sheet("STANDARD", "STANDARD BASEMENT FLOOR PLAN", "9999B0", "ELEVATION B"),
    sheet("SOBS-FB01/2", "BASEMENT FLOOR PLAN OPTIONS", "9999B0FB"),
  ];
  const info = classifyPages(pages);

  it("finds standard plans, options and grade conditions with their floor", () => {
    expect(info.map((p) => p.kind)).toEqual(["standard", "standard", "option", "grade-condition", "option", "option", "standard", "option"]);
    expect(info.map((p) => p.level)).toEqual(["basement", "ground", "ground", "ground", "second", "basement", "basement", "basement"]);
  });

  it("carries the elevation section forward to sheets without a caption", () => {
    expect(info.map((p) => p.elevation)).toEqual(["A1", "A1", "A1", "A1", "A1", "A1", "B", "B"]);
  });

  it("names options from their titles", () => {
    expect(info[2].optionName).toBe("Chef Center");
    expect(info[4].optionName).toBe("4 Bedroom");
    expect(info[5].optionName).toBe("Basement Bedroom");
    expect(info[7].optionName).toBe("Finished Basement Options");
  });
});

describe("scale from room dimensions", () => {
  it("parses feet-inch room sizes", () => {
    const [a, b] = parseRoomDimension(`18'6"x13'8"`)!;
    expect(a).toBeCloseTo(5.639, 3);
    expect(b).toBeCloseTo(4.166, 3);
    expect(parseRoomDimension("GARAGE")).toBeNull();
  });

  it("picks the weighted consensus and ignores outliers", () => {
    const c = consensusScale([
      { metresPerPixel: 0.0095, weight: 3 },
      { metresPerPixel: 0.0096, weight: 3 },
      { metresPerPixel: 0.0094, weight: 0.5 },
      { metresPerPixel: 0.02, weight: 0.5 },
      { metresPerPixel: 0.005, weight: 0.5 },
    ])!;
    expect(c.metresPerPixel).toBeCloseTo(0.00954, 4);
    expect(c.support).toBeCloseTo(6.5);
  });
});

describe("floor registration", () => {
  it("recovers the offset between two sheets of the same floor", () => {
    const ground = PLAN_36.floors.find((f) => f.id === "ground")!;
    const moved = translateFloor(ground, 1.3, -0.7);
    const r = registerFloor(ground, moved);
    expect(r.dx).toBeCloseTo(-1.3, 1);
    expect(r.dy).toBeCloseTo(0.7, 1);
    expect(r.score).toBeGreaterThan(0.9);
  });
});

describe("composing a home from a plan set", () => {
  const sheetInfo = { rasterKey: "k", width: 100, height: 100, metresPerPixel: 0.01, originPx: { x: 0, y: 0 } };
  const v = (id: string, levelId: FloorVariant["levelId"], elevationId: string, optionId: string | null, floorId: string): FloorVariant => ({
    id,
    levelId,
    elevationId,
    optionId,
    page: 1,
    floor: structuredClone(PLAN_36.floors.find((f) => f.id === floorId)!),
    confidence: 0.7,
    warnings: [],
    reviewed: false,
    sheet: sheetInfo,
  });
  const option = v("o1", "second", "A", "spa", "second");
  option.floor.walls = option.floor.walls.slice(0, 6);
  option.floor.doors = option.floor.doors.filter((d) => option.floor.walls.some((w) => w.id === d.wallId));
  option.floor.windows = option.floor.windows.filter((d) => option.floor.walls.some((w) => w.id === d.wallId));
  const set: PlanSet = {
    id: "ps",
    projectId: "p",
    sourceDrawingId: "d",
    modelCode: "9999",
    createdAt: "",
    scale: { metresPerPixel: 0.01, source: "room-dimensions", support: 10 },
    levels: ["basement", "ground", "second"],
    elevations: [
      { id: "A", label: "Elevation A" },
      { id: "B", label: "Elevation B" },
    ],
    options: [{ id: "spa", levelId: "second", name: "Spa Ensuite", code: "SOSF-SE02" }],
    variants: [v("a0", "basement", "A", null, "basement"), v("a1", "ground", "A", null, "ground"), v("a2", "second", "A", null, "second"), option, v("b1", "ground", "B", null, "ground"), v("b2", "second", "B", null, "second")],
    unmodeled: [],
    defaultElevationId: "A",
    pageCount: 6,
  };
  const base = { id: "h", projectId: "p", name: "Test" };

  it("defaults to the standard plan of the default elevation", () => {
    const house = composeHouseModel(set, sanitizeSelection(set, null), base);
    expect(house.floors.map((f) => f.id)).toEqual(["basement", "ground", "second"]);
    expect(house.floors.find((f) => f.id === "second")!.walls).toHaveLength(13);
    expect(house.exterior.roofs.length).toBeGreaterThan(0);
    expect(house.provenance.source).toBe("interpreted");
  });

  it("swaps in a layout option and drops options the elevation doesn't offer", () => {
    const withOption = composeHouseModel(set, { elevationId: "A", options: { second: "spa" } }, base);
    expect(withOption.floors.find((f) => f.id === "second")!.walls).toHaveLength(6);
    expect(optionsFor(set, "B", "second")).toHaveLength(0);
    expect(sanitizeSelection(set, { elevationId: "B", options: { second: "spa" } }).options).toEqual({});
    expect(describeSelection(set, { elevationId: "A", options: { second: "spa" } })).toBe("Elevation A · Spa Ensuite");
  });
});

describe("buildPlanSet (end to end on a sample PDF)", () => {
  it("turns a single floor-plan PDF into a one-floor plan set", async () => {
    const pdf = readFileSync(path.join(__dirname, "..", "public", "samples", "plan36-ground.pdf"));
    const set = await buildPlanSet({ pdf, projectId: "p", drawingId: "dddddddd", putRaster: async (page) => `k${page}` });
    expect(set.levels).toEqual(["ground"]);
    const ground = set.variants[0].floor;
    expect(ground.walls.length).toBeGreaterThanOrEqual(10);
    expect(ground.windows.length).toBeGreaterThanOrEqual(6);
    // House width ≈ 12.8 m even though the sample has no room-dimension labels.
    const xs = ground.walls.flatMap((w) => [w.start.x, w.end.x]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(16);
  }, 60_000);
});
