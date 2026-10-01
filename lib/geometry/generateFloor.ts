import * as THREE from "three";
import type { Floor, Point2D } from "@/lib/models/house";
import { polygonArea, polygonCentroid } from "@/lib/models/house";
import { SurfaceBuckets } from "./meshBuilder";
import { roomFinishSurface, type SurfaceKey } from "./surfaces";

const v2 = (p: Point2D) => new THREE.Vector2(p.x, p.y);

/** Footprint for a floor: explicit outline, else the bounding box of its walls. */
export function resolveFootprint(floor: Floor): Point2D[] {
  if (floor.footprint && floor.footprint.length >= 3) return floor.footprint;
  const xs = floor.walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = floor.walls.flatMap((w) => [w.start.y, w.end.y]);
  if (!xs.length) return [];
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function ensureCCW(points: THREE.Vector2[]): THREE.Vector2[] {
  return THREE.ShapeUtils.isClockWise(points) ? [...points].reverse() : points;
}

function ensureCW(points: THREE.Vector2[]): THREE.Vector2[] {
  return THREE.ShapeUtils.isClockWise(points) ? points : [...points].reverse();
}

/**
 * Floor structure (slab with stair openings), finished floor surfaces per room,
 * and the ceiling plane.
 */
export function generateFloorSurfaces(floor: Floor, footprint: Point2D[]) {
  const slab = new SurfaceBuckets<SurfaceKey>();
  const ceiling = new SurfaceBuckets<SurfaceKey>();
  if (footprint.length < 3) return { slab, ceiling };

  const thickness = floor.floorThickness ?? 0.3;
  const top = floor.elevation - 0.012; // finished floors sit on top of the structure
  const bottom = floor.elevation - thickness;
  const contour = ensureCCW(footprint.map(v2));
  const holes = (floor.slabOpenings ?? []).map((h) => ensureCW(h.map(v2)));

  const struct = slab.get("structure");
  struct.flatPolygon(contour, holes, top, "up");
  slab.get("ceiling").flatPolygon(contour, holes, bottom, "down");

  // Slab edges. The outer contour is CCW and holes are CW, so in both cases the
  // right-hand perpendicular of each edge points away from the slab material.
  const edgeLoop = (loop: THREE.Vector2[]) => {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const n: [number, number, number] = [(b.y - a.y) / len, 0, -(b.x - a.x) / len];
      // Quad B→A→top(A)→top(B) has a right-hand normal in plan.
      struct.quad([b.x, bottom, b.y], [a.x, bottom, a.y], [a.x, floor.elevation, a.y], [b.x, floor.elevation, b.y], n, [
        [0, bottom],
        [len, bottom],
        [len, floor.elevation],
        [0, floor.elevation],
      ]);
    }
  };
  edgeLoop(contour);
  for (const h of holes) edgeLoop(h);

  // Floors traced without rooms still get a finished floor across the footprint.
  if (!floor.rooms.length) slab.get(floor.belowGrade ? "concrete" : "flooring").flatPolygon(contour, holes, floor.elevation, "up");

  for (const room of floor.rooms) {
    if (room.polygon.length < 3) continue;
    const poly = ensureCCW(room.polygon.map(v2));
    const roomHoles = holes.filter((h) => h.every((p) => insideLoose(p, poly)));
    slab.get(roomFinishSurface(room.finish)).flatPolygon(poly, roomHoles, floor.elevation, "up");
  }

  ceiling.get("ceiling").flatPolygon(contour, holes, floor.elevation + floor.ceilingHeight - 0.002, "down");
  return { slab, ceiling };
}

function insideLoose(p: THREE.Vector2, poly: THREE.Vector2[]): boolean {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of poly) {
    x0 = Math.min(x0, q.x);
    x1 = Math.max(x1, q.x);
    y0 = Math.min(y0, q.y);
    y1 = Math.max(y1, q.y);
  }
  return p.x >= x0 - 1e-6 && p.x <= x1 + 1e-6 && p.y >= y0 - 1e-6 && p.y <= y1 + 1e-6;
}

export interface RoomLabel {
  id: string;
  name: string;
  areaSqM: number;
  position: [number, number, number];
}

export function roomLabels(floor: Floor): RoomLabel[] {
  return floor.rooms.map((r) => {
    const c = polygonCentroid(r.polygon);
    return { id: r.id, name: r.name, areaSqM: polygonArea(r.polygon), position: [c.x, floor.elevation + 0.05, c.y] };
  });
}
