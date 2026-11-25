import { LAKE, LAKE_Y, PLAY_HALF, terrainHeight } from "./terrain";
import { BRIDGES, ISLANDS, riverWidth, riverZ, type Point } from "./v6";
import { BAY_OUTLINE, bayDistance } from "./bay";

/**
 * Where water meets land. The terrain mesh is an 8 m grid, so its waterline
 * zig-zags; these shorelines trace the exact line (where the terrain crosses
 * the water level) every couple of metres. A strip of bank is laid along each
 * one: a shelf sloping under the water, wet sand at the edge, and dry ground
 * blending into the grass. Meadows Beach widens the strip into a sandy beach.
 */
export interface Shore { id: string; points: Point[]; /** Unit vectors toward the land. */ normals: Point[] }

/** Where along a ray from (x0,z0) in direction (dx,dz) the terrain rises through the water level, between t0 and t1. */
function crossing(x0: number, z0: number, dx: number, dz: number, t0: number, t1: number): number | null {
  const wet = (t: number) => terrainHeight(x0 + dx * t, z0 + dz * t) < LAKE_Y;
  if (!wet(t0) || wet(t1)) return null;
  let a = t0, b = t1;
  for (let i = 0; i < 24; i++) { const m = (a + b) / 2; if (wet(m)) a = m; else b = m; }
  return (a + b) / 2;
}

function split(id: string, pts: (Point | null)[], nrm: (Point | null)[]): Shore[] {
  const out: Shore[] = [];
  let cur: Shore | null = null;
  pts.forEach((p, i) => {
    if (!p) { cur = null; return; }
    if (!cur) { cur = { id: id + "-" + out.length, points: [], normals: [] }; out.push(cur); }
    cur.points.push(p);
    cur.normals.push(nrm[i]!);
  });
  return out.filter((s) => s.points.length > 3);
}

const nearBridge = (x: number) => BRIDGES.some((b) => Math.abs(x - b.x) < b.width / 2 + 9);
const nearLake = (x: number, z: number) => Math.hypot((x - LAKE.centre[0]) / LAKE.rx, (z - LAKE.centre[1]) / LAKE.rz) < 1.25;
const nearIsland = (x: number, z: number) => ISLANDS.some((i) => Math.hypot((x - i.at[0]) / i.rx, (z - i.at[1]) / i.rz) < 1.35);
/** Heron Bay traces its own shore (the lake's and river's give way near it). */
const nearBay = (x: number, z: number) => bayDistance(x, z) > -22;

function riverBanks(): Shore[] {
  const out: Shore[] = [];
  for (const side of [-1, 1] as const) {
    const pts: (Point | null)[] = [], nrm: (Point | null)[] = [];
    for (let x = -PLAY_HALF + 4; x <= PLAY_HALF - 4; x += 2.5) {
      const zc = riverZ(x), half = riverWidth(x) / 2;
      // Outward across the river, tilted with the river's direction.
      const slope = (riverZ(x + 1) - riverZ(x - 1)) / 2, len = Math.hypot(1, slope), nx = (-slope / len) * side, nz = (1 / len) * side;
      const t = crossing(x, zc, nx, nz, half * 0.7, half * 1.6);
      const p: Point | null = t === null ? null : [x + nx * t, zc + nz * t];
      const ok = p && !nearBridge(p[0]) && !nearLake(p[0], p[1]) && !nearIsland(p[0], p[1]) && !nearBay(p[0], p[1]);
      pts.push(ok ? p : null);
      nrm.push(ok ? [nx, nz] : null);
    }
    out.push(...split("river-" + (side < 0 ? "north" : "south"), pts, nrm));
  }
  return out;
}

function ellipseShore(id: string, c: Point, rx: number, rz: number, inward: boolean, skip: (x: number, z: number) => boolean): Shore[] {
  const pts: (Point | null)[] = [], nrm: (Point | null)[] = [];
  const n = Math.round((2 * Math.PI * Math.sqrt((rx * rx + rz * rz) / 2)) / 2.5);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, dx = Math.cos(a) * rx, dz = Math.sin(a) * rz, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    // Lake: from the middle outward (land is outside). Island: from outside inward (land is inside).
    const t = inward ? crossing(c[0] + ux * l * 1.5, c[1] + uz * l * 1.5, -ux, -uz, 0, l * 1.2) : crossing(c[0], c[1], ux, uz, l * 0.6, l * 1.5);
    const p: Point | null = t === null ? null : inward ? [c[0] + ux * (l * 1.5 - t), c[1] + uz * (l * 1.5 - t)] : [c[0] + ux * t, c[1] + uz * t];
    const ok = p && !skip(p[0], p[1]);
    pts.push(ok ? p : null);
    nrm.push(ok ? (inward ? [-ux, -uz] : [ux, uz]) : null);
  }
  return split(id, pts, nrm);
}

/** Meadows Beach: the sandy stretch of the river's south bank below Meadow Way. */
export const BEACH = { id: "meadows-beach", x0: 160, x1: 330, depth: 24, name: "MEADOWS BEACH" };
export const onBeach = (x: number) => x > BEACH.x0 && x < BEACH.x1;

/** Heron Bay's shore: rays out across the outline (where it opens into the lake or river there's no crossing). */
function bayShore(): Shore[] {
  const pts: (Point | null)[] = [], nrm: (Point | null)[] = [], N = BAY_OUTLINE.length;
  for (let i = 0; i < N; i++) {
    const a = BAY_OUTLINE[(i + N - 1) % N], b = BAY_OUTLINE[(i + 1) % N], p = BAY_OUTLINE[i];
    // Clockwise outline on the map (z down): the outward normal is (dz, −dx) of the tangent.
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tx, tz);
    tx /= l; tz /= l;
    const nx = tz, nz = -tx;
    const t = crossing(p[0] - nx * 12, p[1] - nz * 12, nx, nz, 0, 30);
    const q: Point | null = t === null ? null : [p[0] - nx * 12 + nx * t, p[1] - nz * 12 + nz * t];
    // Where the bay opens into the lake there's no shore (the lake's ellipse is water).
    const ok = q && Math.hypot((q[0] - LAKE.centre[0]) / LAKE.rx, (q[1] - LAKE.centre[1]) / LAKE.rz) > 1 && !nearIsland(q[0], q[1]);
    pts.push(ok ? q : null);
    nrm.push(ok ? [nx, nz] : null);
  }
  return split("bay", pts, nrm);
}

export const SHORES: Shore[] = [
  ...riverBanks(),
  ...bayShore(),
  // The lake's own shore (where the river joins it, the river banks take over).
  ...ellipseShore("lake", LAKE.centre, LAKE.rx, LAKE.rz, false, (x, z) => nearBay(x, z)),
  ...ISLANDS.flatMap((i) => ellipseShore("island", i.at, i.rx, i.rz, true, () => false)),
];

/** Offsets across a bank strip (m toward the land from the waterline) and the height there above the water. */
export function bankProfile(d: number) {
  if (d <= 0) return LAKE_Y + 0.16 * d; // a shelf under the water
  return LAKE_Y + 0.12 + 0.1 * d;
}
