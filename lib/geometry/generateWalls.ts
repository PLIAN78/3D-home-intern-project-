import type { Floor, Point2D, Wall } from "@/lib/models/house";
import { pointInPolygon, polygonCentroid, wallLength } from "@/lib/models/house";
import { addBox, planFrame, SurfaceBuckets, type PlanFrame } from "./meshBuilder";
import { claddingSurface, type SurfaceKey } from "./surfaces";
import { addOpeningDetails, type OpeningSpan } from "./generateOpenings";

const VENEER = 0.1;
const EPS = 0.003;

export interface WallContext {
  frame: PlanFrame;
  length: number;
  /** +1 if the wall's local +z side faces the exterior, −1 otherwise (exterior walls only). */
  outward: 1 | -1;
  veneer: number;
  baseY: number;
}

/** Determine which side of an exterior wall faces outside, using the floor footprint. */
export function wallOutwardSign(wall: Wall, footprint: Point2D[] | undefined, fallbackCentre: Point2D): 1 | -1 {
  const len = wallLength(wall) || 1;
  const dx = (wall.end.x - wall.start.x) / len;
  const dy = (wall.end.y - wall.start.y) / len;
  const nx = -dy;
  const ny = dx;
  const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  if (footprint && footprint.length >= 3) {
    const probe = { x: mid.x + nx * 0.5, y: mid.y + ny * 0.5 };
    return pointInPolygon(probe, footprint) ? -1 : 1;
  }
  const toCentre = { x: fallbackCentre.x - mid.x, y: fallbackCentre.y - mid.y };
  return toCentre.x * nx + toCentre.y * ny > 0 ? -1 : 1;
}

/** Collect openings (doors + windows) on a wall as spans along its length. */
export function openingsForWall(floor: Floor, wall: Wall): OpeningSpan[] {
  const spans: OpeningSpan[] = [];
  for (const d of floor.doors) {
    if (d.wallId !== wall.id) continue;
    spans.push({ id: d.id, kind: d.kind ?? "interior", a: d.position - d.width / 2, b: d.position + d.width / 2, bottom: 0, top: Math.min(d.height, wall.height - 0.05) });
  }
  for (const w of floor.windows) {
    if (w.wallId !== wall.id) continue;
    spans.push({ id: w.id, kind: "window", a: w.position - w.width / 2, b: w.position + w.width / 2, bottom: w.sillHeight, top: Math.min(w.sillHeight + w.height, wall.height - 0.05) });
  }
  const L = wallLength(wall);
  return spans
    .map((s) => ({ ...s, a: Math.max(0.02, s.a), b: Math.min(L - 0.02, s.b) }))
    .filter((s) => s.b - s.a > 0.05 && s.top - s.bottom > 0.05)
    .sort((x, y) => x.a - y.a);
}

/**
 * Emit the solid wall pieces for one layer of a wall, leaving holes for
 * openings. Each opening produces a "below" piece (under a window sill) and an
 * "above" piece (header), with full-height pieces between openings.
 */
function addLayerWithOpenings(
  buckets: SurfaceBuckets<SurfaceKey>,
  surface: SurfaceKey,
  ctx: WallContext,
  wall: Wall,
  spans: OpeningSpan[],
  z0: number,
  z1: number,
  extension: number,
) {
  const b = buckets.get(surface);
  const cap = buckets.get("wallCap");
  const y0 = ctx.baseY;
  const y1 = ctx.baseY + wall.height;
  let cursor = -extension;
  const end = ctx.length + extension;
  for (const s of spans) {
    if (s.a > cursor) addBox(b, ctx.frame, [cursor, y0, z0], [s.a, y1, z1], "metric", { top: cap, bottom: false });
    if (s.bottom > 0.01) addBox(b, ctx.frame, [s.a, y0, z0], [s.b, y0 + s.bottom, z1], "metric", { bottom: false });
    if (s.top < wall.height - 0.01) addBox(b, ctx.frame, [s.a, y0 + s.top, z0], [s.b, y1, z1], "metric", { top: cap });
    cursor = Math.max(cursor, s.b);
  }
  if (end > cursor) addBox(b, ctx.frame, [cursor, y0, z0], [end, y1, z1], "metric", { top: cap, bottom: false });
}

export interface WallBuildResult {
  shell: SurfaceBuckets<SurfaceKey>;
  interior: SurfaceBuckets<SurfaceKey>;
}

/**
 * `maxTop` caps wall tops just under the finished floor above, so a wall that
 * runs up into the next slab never shares a plane with that floor's surface
 * (coplanar faces flicker / z-fight).
 */
export function generateWalls(floor: Floor, footprint: Point2D[] | undefined, maxTop?: number): WallBuildResult {
  const shell = new SurfaceBuckets<SurfaceKey>();
  const interior = new SurfaceBuckets<SurfaceKey>();
  const centre = footprint ? polygonCentroid(footprint) : { x: 0, y: 0 };

  for (const source of floor.walls) {
    const capped = maxTop !== undefined && floor.elevation + source.height > maxTop ? Math.max(0.5, maxTop - floor.elevation) : source.height;
    const wall = capped === source.height ? source : { ...source, height: capped };
    const L = wallLength(wall);
    if (L < 0.05) continue;
    const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
    const frame = planFrame(wall.start.x, wall.start.y, angle);
    const t = wall.thickness;
    const isExterior = !!wall.exterior;
    const outward = isExterior ? wallOutwardSign(wall, footprint, centre) : 1;
    const isFoundation = wall.cladding === "foundation";
    const veneer = isExterior && !isFoundation ? Math.min(VENEER, t * 0.45) : 0;
    const ctx: WallContext = { frame, length: L, outward, veneer, baseY: floor.elevation };
    const spans = openingsForWall(floor, wall);
    const target = isExterior ? shell : interior;

    if (!isExterior) {
      addLayerWithOpenings(target, "wallPaint", ctx, wall, spans, -t / 2, t / 2, t / 2 - EPS);
    } else if (isFoundation) {
      addLayerWithOpenings(target, "foundation", ctx, wall, spans, -t / 2, t / 2, t / 2 - EPS);
    } else {
      // Inner structural layer (painted inside), outer cladding veneer.
      const coreZ: [number, number] = outward > 0 ? [-t / 2, t / 2 - veneer] : [-t / 2 + veneer, t / 2];
      const veneerZ: [number, number] = outward > 0 ? [t / 2 - veneer, t / 2] : [-t / 2, -t / 2 + veneer];
      addLayerWithOpenings(target, "wallPaint", ctx, wall, spans, coreZ[0], coreZ[1], t / 2 - veneer - EPS);
      addLayerWithOpenings(target, claddingSurface(wall.cladding), ctx, wall, spans, veneerZ[0], veneerZ[1], t / 2 - EPS);
    }

    for (const s of spans) addOpeningDetails(target, ctx, wall, s, isExterior);
  }

  return { shell, interior };
}
