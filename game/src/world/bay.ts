/**
 * Heron Bay: the water south-west of Heron Lake, between the lake, the river's
 * south bank and the airport, west of the boat dock and Heron Lake Station.
 * The terrain is cut down below the water level inside the outline (deepening
 * to 4 m) and eases back up over a shallow shore outside it.
 *
 * Pure data and functions, no imports, so terrain.ts can use it.
 */
type P = [number, number];

/** The outline's control points (clockwise on the map); the top edge lies in the lake and river. */
const CONTROL: P[] = [
  [-1030, -600], [-860, -612], [-700, -604], [-612, -566], [-584, -526], [-580, -474], [-596, -430],
  [-634, -402], [-700, -388], [-790, -380], [-880, -378], [-960, -374], [-1030, -372],
];

/** The outline, smoothed (closed Catmull-Rom, a point every few metres). */
export const BAY_OUTLINE: P[] = (() => {
  const out: P[] = [], N = CONTROL.length;
  for (let i = 0; i < N; i++) {
    const p0 = CONTROL[(i + N - 1) % N], p1 = CONTROL[i], p2 = CONTROL[(i + 1) % N], p3 = CONTROL[(i + 2) % N];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 6));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t, p: P = [0, 0];
      for (let a = 0; a < 2; a++) p[a] = 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3);
      out.push(p);
    }
  }
  return out;
})();

export const BAY_BOUNDS = {
  x0: Math.min(...BAY_OUTLINE.map((p) => p[0])), x1: Math.max(...BAY_OUTLINE.map((p) => p[0])),
  z0: Math.min(...BAY_OUTLINE.map((p) => p[1])), z1: Math.max(...BAY_OUTLINE.map((p) => p[1])),
};
/** How far the shallow shore reaches outside the outline (m), and how far in the bed reaches full depth. */
export const BAY_SHORE = 14;
export const BAY_SLOPE = 26;

/** Signed distance to the bay's outline: positive inside (metres), negative outside. Far points get −Infinity. */
export function bayDistance(x: number, z: number, reach = 40) {
  const b = BAY_BOUNDS;
  if (x < b.x0 - reach || x > b.x1 + reach || z < b.z0 - reach || z > b.z1 + reach) return -Infinity;
  let inside = false, best = Infinity;
  for (let i = 0, j = BAY_OUTLINE.length - 1; i < BAY_OUTLINE.length; j = i++) {
    const [xi, zi] = BAY_OUTLINE[i], [xj, zj] = BAY_OUTLINE[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    const dx = xi - xj, dz = zi - zj, t = Math.max(0, Math.min(1, ((x - xj) * dx + (z - zj) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - xj - dx * t, z - zj - dz * t));
  }
  return inside ? best : -best;
}
export const inBay = (x: number, z: number) => bayDistance(x, z) > 0;
