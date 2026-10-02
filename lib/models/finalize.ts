import type { Floor, HouseModel, Point2D, Wall } from "./house";
import { findPorch, generateAutoRoofs, LOWER_PITCH, porchFixtures } from "./autoExterior";

export { generateAutoRoofs };
import { clipRoomToFootprint, rasterFootprint } from "./footprint";
import { sortedFloors, wallLength } from "./house";

/**
 * Derive everything the 3D generator needs that a person shouldn't have to
 * trace by hand: stacked floor elevations, wall heights, default cladding,
 * footprints, driveway start and (optionally) simple roofs.
 */

const TOL = 0.06;

interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function key(p: Point2D) {
  return `${Math.round(p.x / TOL)}:${Math.round(p.y / TOL)}`;
}

/** Walk the exterior walls as a closed loop. Returns null if they don't form one cleanly. */
export function deriveFootprint(floor: Floor): Point2D[] | null {
  const ext = floor.walls.filter((w) => w.exterior);
  if (ext.length < 3) return null;
  const adj = new Map<string, { wall: Wall; other: Point2D; here: Point2D }[]>();
  for (const w of ext) {
    for (const [a, b] of [
      [w.start, w.end],
      [w.end, w.start],
    ] as const) {
      const k = key(a);
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k)!.push({ wall: w, other: b, here: a });
    }
  }
  if ([...adj.values()].some((list) => list.length !== 2)) return null;
  const poly: Point2D[] = [];
  const used = new Set<string>();
  let current = ext[0].start;
  let prevWall: Wall | null = null;
  for (let i = 0; i <= ext.length; i++) {
    const k = key(current);
    if (poly.length && k === key(poly[0])) break;
    poly.push(current);
    const next = adj.get(k)!.find((e) => e.wall !== prevWall && !used.has(e.wall.id));
    if (!next) return null;
    used.add(next.wall.id);
    prevWall = next.wall;
    current = next.other;
  }
  return used.size === ext.length && poly.length >= 3 ? poly : null;
}

function bounds(points: Point2D[]): Rect {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

function wallBounds(floor: Floor): Rect | null {
  const pts = floor.walls.flatMap((w) => [w.start, w.end]);
  return pts.length ? bounds(pts) : null;
}

export function finalizeHouseModel(model: HouseModel): { model: HouseModel; notes: string[] } {
  const notes: string[] = [];
  const floors = sortedFloors(structuredClone(model));

  // 1. Stack elevations from the first above-grade floor.
  const anchor = Math.max(0, floors.findIndex((f) => !f.belowGrade));
  for (let i = anchor + 1; i < floors.length; i++) {
    const prev = floors[i - 1];
    floors[i].elevation = round(prev.elevation + prev.ceilingHeight + (floors[i].floorThickness ?? 0.3));
  }
  for (let i = anchor - 1; i >= 0; i--) {
    const upper = floors[i + 1];
    floors[i].elevation = round(upper.elevation - (upper.floorThickness ?? 0.3) - floors[i].ceilingHeight);
  }

  // 2. Wall heights, cladding defaults, footprints.
  let aboveIndex = 0;
  floors.forEach((f, i) => {
    const upper = floors[i + 1];
    for (const w of f.walls) {
      w.height = round(w.exterior ? f.ceilingHeight + (upper ? (upper.floorThickness ?? 0.3) : 0) : f.ceilingHeight);
      const style = model.exterior.style;
      if (w.exterior && !w.cladding) w.cladding = f.belowGrade ? "foundation" : aboveIndex === 0 ? (style?.groundCladding ?? "brick") : (style?.upperCladding ?? "siding");
    }
    if (!f.belowGrade && f.walls.length) aboveIndex++;
    // Drop openings that no longer sit on a wall, or that run off its ends.
    const wallsById = new Map(f.walls.map((w) => [w.id, w]));
    const fits = (o: { wallId: string; position: number; width: number }) => {
      const w = wallsById.get(o.wallId);
      return !!w && o.position - o.width / 2 > -0.01 && o.position + o.width / 2 < wallLength(w) + 0.01;
    };
    const before = f.doors.length + f.windows.length;
    f.doors = f.doors.filter(fits);
    f.windows = f.windows.filter(fits);
    if (f.doors.length + f.windows.length < before) notes.push(`${f.name}: removed ${before - f.doors.length - f.windows.length} opening(s) that no longer fit their wall.`);

    if (f.walls.length) {
      // Exact loop of exterior walls → outline traced from all walls → bounding box.
      const fp = deriveFootprint(f) ?? rasterFootprint(f);
      if (fp) {
        f.footprint = fp;
        // Rooms outlined as rectangles can spill outside L-shaped plans.
        f.rooms = f.rooms.map((r) => clipRoomToFootprint(r, fp));
      } else {
        const b = wallBounds(f)!;
        f.footprint = [
          { x: b.minX, y: b.minY },
          { x: b.maxX, y: b.minY },
          { x: b.maxX, y: b.maxY },
          { x: b.minX, y: b.maxY },
        ];
        notes.push(`${f.name}: exterior walls don't form a closed loop, so the outline uses the walls' bounding box.`);
      }
    } else {
      delete f.footprint;
    }
  });

  // 3. Driveway from the garage door, if there is one.
  const exterior = { ...model.exterior };
  for (const f of floors) {
    const garage = f.doors.find((d) => d.kind === "garage");
    const w = garage && f.walls.find((x) => x.id === garage.wallId);
    if (garage && w) {
      const L = wallLength(w) || 1;
      exterior.drivewayStart = { x: w.start.x + ((w.end.x - w.start.x) * garage.position) / L, y: w.start.y + ((w.end.y - w.start.y) * garage.position) / L };
      exterior.drivewayWidth = Math.max(3, garage.width + 0.8);
      break;
    }
  }

  // 4. Roofs and the front porch, inferred from the floor outlines.
  if (exterior.autoRoof) {
    exterior.roofs = generateAutoRoofs(floors, exterior.style);
    const aboveGrade = floors.filter((f) => !f.belowGrade && f.walls.length);
    const ground = aboveGrade[0];
    if (ground) {
      ground.fixtures = (ground.fixtures ?? []).filter((x) => !x.id.startsWith("auto-porch"));
      const porch = findPorch(ground, aboveGrade[1]);
      if (porch) {
        ground.fixtures.push(...porchFixtures(ground, porch));
        if (!porch.covered) {
          const r = porch.rect;
          exterior.roofs.push({ id: "auto-porch-roof", name: "Porch Roof", type: "shed", baseFloorId: ground.id, x: r.x0, y: r.y0, width: r.x1 - r.x0, depth: r.y1 - r.y0, pitch: exterior.style?.lowerPitch ?? LOWER_PITCH, overhang: 0.25, highSide: "-y" });
        }
      }
    }
    if (exterior.roofs.length) notes.push("Roofs and porch were generated from the floor outlines — their shape is approximate.");
  }

  return { model: { ...model, floors, exterior }, notes };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
