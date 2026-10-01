import type { Floor, HouseModel, Point2D, RoofSection, Wall } from "./house";
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

/** Sutherland–Hodgman clip of a polygon to an axis-aligned rectangle. */
function clipToRect(poly: Point2D[], r: Rect): Point2D[] {
  const edges: [(p: Point2D) => boolean, (a: Point2D, b: Point2D) => Point2D][] = [
    [(p) => p.x >= r.minX, (a, b) => ({ x: r.minX, y: a.y + ((b.y - a.y) * (r.minX - a.x)) / (b.x - a.x) })],
    [(p) => p.x <= r.maxX, (a, b) => ({ x: r.maxX, y: a.y + ((b.y - a.y) * (r.maxX - a.x)) / (b.x - a.x) })],
    [(p) => p.y >= r.minY, (a, b) => ({ x: a.x + ((b.x - a.x) * (r.minY - a.y)) / (b.y - a.y), y: r.minY })],
    [(p) => p.y <= r.maxY, (a, b) => ({ x: a.x + ((b.x - a.x) * (r.maxY - a.y)) / (b.y - a.y), y: r.maxY })],
  ];
  let out = poly;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}

/**
 * Simple roofs: a hip roof over the top floor's outline bounds, plus shed roofs
 * over parts of lower floors that stick out beyond the floor above (garages,
 * bump-outs), sloping away from the taller wall.
 */
export function generateAutoRoofs(floors: Floor[]): RoofSection[] {
  const above = floors.filter((f) => !f.belowGrade && f.walls.length);
  const roofs: RoofSection[] = [];
  above.forEach((floor, i) => {
    const fp = floor.footprint ?? [];
    if (fp.length < 3) return;
    const b = bounds(fp);
    const upper = above[i + 1];
    if (!upper?.footprint?.length) {
      const w = b.maxX - b.minX;
      const d = b.maxY - b.minY;
      if (w > 1 && d > 1) roofs.push({ id: `auto-${floor.id}-hip`, name: `${floor.name} Roof`, type: "hip", baseFloorId: floor.id, x: b.minX, y: b.minY, width: w, depth: d, pitch: 6 / 12, overhang: 0.4 });
      return;
    }
    const u = bounds(upper.footprint);
    const strips: { rect: Rect; highSide: RoofSection["highSide"] }[] = [
      { rect: { minX: b.minX, maxX: b.maxX, minY: u.maxY, maxY: b.maxY }, highSide: "-y" },
      { rect: { minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: u.minY }, highSide: "+y" },
      { rect: { minX: b.minX, maxX: u.minX, minY: Math.max(b.minY, u.minY), maxY: Math.min(b.maxY, u.maxY) }, highSide: "+x" },
      { rect: { minX: u.maxX, maxX: b.maxX, minY: Math.max(b.minY, u.minY), maxY: Math.min(b.maxY, u.maxY) }, highSide: "-x" },
    ];
    strips.forEach(({ rect, highSide }, k) => {
      if (rect.maxX - rect.minX < 0.6 || rect.maxY - rect.minY < 0.6) return;
      const clipped = clipToRect(fp, rect);
      if (clipped.length < 3) return;
      const c = bounds(clipped);
      if (c.maxX - c.minX < 0.6 || c.maxY - c.minY < 0.6) return;
      roofs.push({ id: `auto-${floor.id}-shed-${k}`, name: `${floor.name} Lower Roof`, type: "shed", baseFloorId: floor.id, x: c.minX, y: c.minY, width: c.maxX - c.minX, depth: c.maxY - c.minY, pitch: 4 / 12, overhang: 0.3, highSide });
    });
  });
  return roofs;
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
      if (w.exterior && !w.cladding) w.cladding = f.belowGrade ? "foundation" : aboveIndex === 0 ? "brick" : "siding";
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
      const fp = deriveFootprint(f);
      if (fp) f.footprint = fp;
      else {
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

  // 4. Roofs
  if (exterior.autoRoof) {
    exterior.roofs = generateAutoRoofs(floors);
    if (exterior.roofs.length) notes.push("Roofs were generated automatically from floor outlines — roof shape is approximate.");
  }

  return { model: { ...model, floors, exterior }, notes };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
