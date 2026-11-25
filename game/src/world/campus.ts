import type { Point, V6Building, V6Road } from "./v6";
import { CAMPUS_DATA, CAMPUS_PATH_DATA, CAMPUS_STREETS, CAMPUS_TREE_DATA, CREEK_LINE, PLAZA_POLYGON, PONDS, RING_POINTS, RING_WALK, SKYBRIDGE_DATA } from "./campusData";

/**
 * University of Vataloo, laid out like the University of Waterloo's main
 * campus map (campusData.ts holds the traced footprints, roads and paths).
 *
 * - Columbia Street runs along the north edge and carries on west to South
 *   Commons; University Avenue runs down the east side.
 * - Ring Road is a loop inside them, joined to Columbia by Hagey Boulevard and
 *   a short north link, and to University Avenue on the east.
 * - Inside the ring, north to south: Applied Health, Matthews Hall, the
 *   athletics complex and the student centre in the north-west; the Commissary,
 *   General Services and Mathematics 3 in the north; Mathematics & Computer,
 *   the Davis Centre, Chemistry 2, Earth Sciences and the engineering
 *   buildings through the middle; the Science Teaching Complex, Needles Hall,
 *   the Dana Porter Library and Physics below them; the arts buildings,
 *   Environment 1-3, Hagey Hall and PAS in the south.
 * - Outside the ring: Engineering 5, 6 and 7, East Campus Hall and the East
 *   Campus buildings to the north-east; Laurel Creek and its ponds to the west.
 *
 * Buildings are rotated like the map (most at 28° to the street grid). Each is
 * one or more wings (rotated boxes) with a door on one face and a path from
 * the door. Skybridges join buildings as on the map.
 *
 * Pure data with type-only imports, so v6.ts can include it.
 */
export { PLAZA_POLYGON, PONDS, RING_POINTS };

/** Columbia Street's centre line (it continues the South Commons avenue). */
export const COLUMBIA_Z = 520;

export interface CampusWing { c: Point; w: number; d: number; h: number; rot: number }

/** Local (wing) coordinates of a world point: x across the wing, z through it. */
export function toWing(x: number, z: number, w: { c: Point; rot: number }): Point {
  const dx = x - w.c[0], dz = z - w.c[1], c = Math.cos(w.rot), s = Math.sin(w.rot);
  return [dx * c + dz * s, -dx * s + dz * c];
}
/** World position of a point given in a wing's local frame. */
export function fromWing(lx: number, lz: number, w: { c: Point; rot: number }): Point {
  const c = Math.cos(w.rot), s = Math.sin(w.rot);
  return [w.c[0] + lx * c - lz * s, w.c[1] + lx * s + lz * c];
}
export function inWing(x: number, z: number, w: CampusWing, pad = 0) {
  const [lx, lz] = toWing(x, z, w);
  return Math.abs(lx) < w.w / 2 + pad && Math.abs(lz) < w.d / 2 + pad;
}
export function wingCorners(w: { c: Point; w: number; d: number; rot: number }): Point[] {
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => fromWing((a * w.w) / 2, (b * w.d) / 2, w));
}

/** What each building is in the game: lessons, the principal, the gym, the café. */
const KIND: Record<string, V6Building["kind"]> = { gym: "gym", cafeteria: "shop", arts: "historic" };

export interface CampusBuilding extends V6Building {
  code: string;
  wings: CampusWing[];
  /** The main wing's turn (radians). */
  rot: number;
  /** Just outside the entrance, and the direction out of it. */
  door: Point;
  doorOut: Point;
}

/** Building ids used by lessons, the principal and co-ops keep their v6 ids. */
export const CAMPUS_BUILDINGS: CampusBuilding[] = CAMPUS_DATA.map((b, i) => {
  const wings = b.wings.map((w) => ({ ...w, h: b.h }));
  const at = wings[0].c;
  // A box around every wing, centred on the main wing (for code that only knows boxes).
  let hx = 0, hz = 0;
  for (const w of wings) for (const [x, z] of wingCorners(w)) { hx = Math.max(hx, Math.abs(x - at[0])); hz = Math.max(hz, Math.abs(z - at[1])); }
  return { id: b.id, name: b.name, code: b.code, at, size: [hx * 2, hz * 2, b.h], kind: KIND[b.id] ?? "campus", tone: i % 4, level: "ground", wings, rot: wings[0].rot, door: b.door, doorOut: b.out };
});
export const campusBuilding = (id: string) => CAMPUS_BUILDINGS.find((b) => b.id === id);
/** Is a point inside a campus building (plus pad)? */
export function inCampusBuilding(x: number, z: number, pad = 0) {
  return CAMPUS_BUILDINGS.some((b) => Math.abs(x - b.at[0]) < b.size[0] / 2 + pad && Math.abs(z - b.at[1]) < b.size[1] / 2 + pad && b.wings.some((w) => inWing(x, z, w, pad)));
}

const road = (id: string, from: Point, to: Point, width: number, sidewalkWidth: number, boulevardWidth: number): V6Road => ({ id, from, to, width, sidewalkWidth, boulevardWidth });
/** Ring Road's cross-section: a little narrower than the town streets. */
export const RING_DIMS = { width: 8, sidewalkWidth: 1.6, boulevardWidth: 1 };
/** Centre line to the far edge of Ring Road's sidewalk. */
export const RING_RESERVE = RING_DIMS.width / 2 + RING_DIMS.boulevardWidth + RING_DIMS.sidewalkWidth;

export const CAMPUS_ROADS: V6Road[] = [
  ...CAMPUS_STREETS.map(([id, a, b, w, s, bl]) => road(id, a, b, w, s, bl)),
  // The approach from the east suburbs meets Columbia and University Avenue.
  road("campus-approach", [860, 300], [905, COLUMBIA_Z], 9, 2, 2),
  ...RING_POINTS.map((p, i) => road("vataloo-ring-" + i, p, RING_POINTS[(i + 1) % RING_POINTS.length], RING_DIMS.width, RING_DIMS.sidewalkWidth, RING_DIMS.boulevardWidth)),
];

/** Footpaths: the main walks (4 m) and a path from every door (3 m). */
export const CAMPUS_WALKWAYS: { id: string; points: Point[]; width: number }[] = CAMPUS_PATH_DATA.map((p) => ({ id: p.id, points: p.points, width: p.kind === "walk" ? 4 : 3 }));
export const CAMPUS_WALKS: Point[][] = CAMPUS_PATH_DATA.filter((p) => p.kind === "walk").map((p) => p.points);
export const DOOR_PATHS: Point[][] = CAMPUS_PATH_DATA.filter((p) => p.kind === "door").map((p) => p.points);
export const PATH_HALF_WIDTH = 2;

/** Laurel Creek (drawn water, the ground stays level) between its two ponds. */
export const LAUREL_CREEK: Point[] = CREEK_LINE;
export const CREEK_WIDTH = 7;

/** Skybridges, second floor up. */
export const SKYBRIDGE = { y: 6, width: 4.2, height: 3.2 };
export const SKYBRIDGES = SKYBRIDGE_DATA.map((b) => ({ ...b, length: Math.hypot(b.to[0] - b.from[0], b.to[1] - b.from[1]), heading: Math.atan2(b.to[1] - b.from[1], b.to[0] - b.from[0]), mid: [(b.from[0] + b.to[0]) / 2, (b.from[1] + b.to[1]) / 2] as Point }));

/** Students walking: Ring Road's inner sidewalk, and back and forth along the main walks. */
const there = (p: Point[]) => [...p, ...p.slice(1, -1).reverse()];
export const CAMPUS_LOOPS: Point[][] = [RING_WALK, ...CAMPUS_WALKS.map(there), RING_WALK];

/** Lawn trees (and along the creek). */
export const CAMPUS_TREE_SPOTS = CAMPUS_TREE_DATA;

/** Where Principal Chen waits and where the co-op students stand: outside Needles Hall. */
const nh = campusBuilding("principal")!;
export const PRINCIPAL_SPOT: Point = [nh.door[0] + nh.doorOut[0] * 4 - nh.doorOut[1] * 3, nh.door[1] + nh.doorOut[1] * 4 + nh.doorOut[0] * 3];
export const COOP_SPOT: Point = [nh.door[0] + nh.doorOut[0] * 5 + nh.doorOut[1] * 3, nh.door[1] + nh.doorOut[1] * 5 - nh.doorOut[0] * 3];

/** Flower beds beside the busiest doors. */
export const FLOWER_BEDS: Point[] = ["math", "porter", "cafeteria", "davis", "arts", "science", "principal", "business", "qnc", "e3", "gym", "engineering"].map((id) => {
  const b = campusBuilding(id)!;
  return [b.door[0] + b.doorOut[0] * 2.5 + b.doorOut[1] * 6, b.door[1] + b.doorOut[1] * 2.5 - b.doorOut[0] * 6] as Point;
});

/**
 * Ring Road is drawn as one continuous loop (VatalooCampus RingRoad): mitred
 * asphalt, curbs and sidewalks, so its many short pieces join without gaps.
 * The streets that meet it (Hagey Boulevard, the north link, University
 * Avenue's link) stop just short of its asphalt, an apron fills the rest, and
 * the ring's outer curb and sidewalk open where each one joins.
 */
export const RING_LENGTHS: number[] = (() => {
  const out = [0];
  for (let i = 1; i <= RING_POINTS.length; i++) { const a = RING_POINTS[i - 1], b = RING_POINTS[i % RING_POINTS.length]; out.push(out[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  return out;
})();
export const RING_LENGTH = RING_LENGTHS[RING_POINTS.length];
/** Nearest point on Ring Road's centre line: arc length, distance and the tangent there. */
export function nearestOnRing(x: number, z: number) {
  let best = { s: 0, d: Infinity, t: [1, 0] as Point };
  for (let i = 0; i < RING_POINTS.length; i++) {
    const a = RING_POINTS[i], b = RING_POINTS[(i + 1) % RING_POINTS.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (L * L))), d = Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u);
    if (d < best.d) best = { s: RING_LENGTHS[i] + u * L, d, t: [dx / L, dz / L] };
  }
  return best;
}
export interface RingJunction { id: string; road: V6Road; /** Where the drawn street stops (just clear of the ring's asphalt). */ cut: Point; dir: Point; s: number; /** Arc-length range where the outer curb and sidewalk open. */ gap: [number, number] }
export const RING_JUNCTIONS: RingJunction[] = CAMPUS_ROADS.filter((r) => !r.id.startsWith("vataloo-ring") && nearestOnRing(r.to[0], r.to[1]).d < 0.5).map((r) => {
  const L = Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]), dir: Point = [(r.to[0] - r.from[0]) / L, (r.to[1] - r.from[1]) / L];
  const n = nearestOnRing(r.to[0], r.to[1]), sin = Math.max(0.35, Math.abs(dir[0] * n.t[1] - dir[1] * n.t[0])), cos = Math.abs(dir[0] * n.t[0] + dir[1] * n.t[1]);
  // Far enough back that both curbs end clear of the ring's asphalt, however it meets the ring.
  const trim = (RING_DIMS.width / 2 + (r.width / 2 + 0.2) * cos) / sin;
  const open = (r.width / 2 + r.boulevardWidth + r.sidewalkWidth + 1) / sin;
  return { id: r.id, road: r, cut: [r.to[0] - dir[0] * trim, r.to[1] - dir[1] * trim], dir, s: n.s, gap: [n.s - open, n.s + open] };
});
/** The roads as drawn by the site builder: Ring Road left out (it has its own mesh), its side streets stopped short. */
export function siteRoads<T extends { id: string; from: Point; to: Point }>(roads: T[]): T[] {
  return roads.filter((r) => !r.id.startsWith("vataloo-ring")).map((r) => {
    const j = RING_JUNCTIONS.find((k) => k.id === r.id);
    return j ? { ...r, to: j.cut } : r;
  });
}
