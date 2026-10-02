import type { Lot } from "@/lib/models/community";
import { placeholderFor } from "@/lib/geometry/placeholderHouse";
import { productSpec } from "@/lib/geometry/productMassing";
import { placeholderScale } from "@/lib/geometry/siteGeometry";
import { describe, expect, it } from "vitest";
import { buildHouseGeometry } from "@/lib/geometry/buildHouse";
import type { SurfaceGeometry } from "@/lib/geometry/surfaces";
import { sortedFloors, type HouseModel } from "@/lib/models/house";
import { PLAN_36 } from "@/lib/sample/plan36";

function maxY(surfaces: SurfaceGeometry[]) {
  let m = -Infinity;
  for (const s of surfaces) {
    const a = s.geometry.attributes.position.array;
    for (let i = 1; i < a.length; i += 3) m = Math.max(m, a[i]);
  }
  return m;
}

describe("floor junctions (no coplanar faces → no flicker)", () => {
  it("stops every level's walls below the finished floor above", () => {
    // Make the walls deliberately run up into the next slab, as drawing sets often do.
    const model: HouseModel = structuredClone(PLAN_36);
    const floors = sortedFloors(model);
    for (let i = 0; i < floors.length - 1; i++) {
      const gap = floors[i + 1].elevation - floors[i].elevation;
      for (const w of floors[i].walls) w.height = gap;
    }
    const g = buildHouseGeometry(model);
    for (let i = 0; i < g.floors.length - 1; i++) {
      const top = Math.max(maxY(g.floors[i].shell), maxY(g.floors[i].interior));
      expect(top).toBeLessThanOrEqual(g.floors[i + 1].elevation - 0.019);
      expect(top).toBeGreaterThan(g.floors[i + 1].elevation - 0.05);
    }
  });

  it("stacks overlapping room floors at distinct heights", () => {
    const model: HouseModel = structuredClone(PLAN_36);
    const floor = sortedFloors(model).find((f) => f.rooms.length >= 2)!;
    // Two rooms covering the same area with different finishes.
    floor.rooms = [
      { ...floor.rooms[0], id: "big", finish: "main", polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }] },
      { ...floor.rooms[0], id: "small", finish: "tile", polygon: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }] },
    ];
    const g = buildHouseGeometry(model).floors.find((f) => f.floorId === floor.id)!;
    const heights = new Set<number>();
    for (const s of g.slab) {
      const a = s.geometry.attributes.position.array;
      for (let i = 1; i < a.length; i += 3) if (a[i] >= floor.elevation - 1e-6 && a[i] < floor.elevation + 0.05) heights.add(Math.round(a[i] * 10000));
    }
    expect(heights.size).toBeGreaterThanOrEqual(2);
  });
});

describe("homes on real lots", () => {
  const lot = (collection: string | null, width: number, depth = 33): Lot => ({
    id: "l",
    number: "1",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    width,
    depth,
    frontSetback: 6,
    collection,
    placeholder: { style: "classic", bodyColor: "#ccc", roofColor: "#333", garageSide: "left", storeys: 2 },
  });

  it("builds the product sold on the lot, sized to its frontage", () => {
    expect(productSpec(lot("35′ Collection", 10.7))).toMatchObject({ kind: "single", width: 9.5, garageCars: 1, storeys: 2 });
    expect(productSpec(lot("50′ Collection", 15.2))).toMatchObject({ kind: "single", garageCars: 2 });
    expect(productSpec(lot("The Perfect Townhome", 6.1))).toMatchObject({ kind: "town", garageCars: 1, storeys: 2 });
    expect(productSpec(lot("The Summit Series", 6.4))).toMatchObject({ kind: "stacked", garageCars: 0, storeys: 3 });
    expect(productSpec(lot(null, 12))).toBeNull();
  });

  it("fits the massing on the lot without scaling", () => {
    const l = lot("42′ Collection", 12.8);
    const g = placeholderFor(l);
    expect(g.planSize.width).toBeLessThanOrEqual(l.width - 1.2 + 1e-6);
    expect(placeholderScale(l)[0]).toBe(1);
  });
});
