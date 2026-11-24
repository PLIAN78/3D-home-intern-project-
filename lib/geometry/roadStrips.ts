import type { Road } from "@/lib/models/community";

/**
 * Where a road's curb or sidewalk strip may run without crossing another
 * road's carriageway. A strip is a band beside the road's centre line, from
 * `v0` to `v1` metres across (negative on the right); the result is the list
 * of along-road intervals `[u0, u1]` (metres from `road.from`) left after
 * cutting out every crossing street, so sidewalks and curbs stop at the edge
 * of the asphalt instead of running through intersections.
 */
export function stripPieces(roads: Road[], index: number, v0: number, v1: number, minLength = 0.05): [number, number][] {
  const r = roads[index];
  const dx = r.to[0] - r.from[0];
  const dz = r.to[1] - r.from[1];
  const L = Math.hypot(dx, dz);
  if (L < 1e-6) return [];
  const ux = dx / L;
  const uz = dz / L;
  // Left normal, matching planFrame's +z across the road.
  const nx = -uz;
  const nz = ux;
  const lo = Math.min(v0, v1);
  const hi = Math.max(v0, v1);

  const cuts: [number, number][] = [];
  roads.forEach((o, j) => {
    if (j === index) return;
    const odx = o.to[0] - o.from[0];
    const odz = o.to[1] - o.from[1];
    const oL = Math.hypot(odx, odz);
    if (oL < 1e-6) return;
    // Parallel streets never cross (and a street continuing in line must keep its sidewalks).
    if (Math.abs(ux * (odz / oL) - uz * (odx / oL)) < 0.1) return;
    const ox = odx / oL;
    const oz = odz / oL;
    const hw = o.width / 2;
    // The other carriageway's corners, in this road's (u, v) frame.
    const corners: [number, number][] = [
      [0, -hw],
      [oL, -hw],
      [oL, hw],
      [0, hw],
    ].map(([a, b]) => {
      const wx = o.from[0] + ox * a - oz * b;
      const wz = o.from[1] + oz * a + ox * b;
      const px = wx - r.from[0];
      const pz = wz - r.from[1];
      return [px * ux + pz * uz, px * nx + pz * nz];
    });
    const clipped = clipBand(corners, lo, hi);
    if (clipped.length === 0) return;
    let a = Infinity;
    let b = -Infinity;
    for (const [u] of clipped) {
      a = Math.min(a, u);
      b = Math.max(b, u);
    }
    if (b > 0 && a < L) cuts.push([Math.max(0, a), Math.min(L, b)]);
  });

  cuts.sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  let at = 0;
  for (const [a, b] of cuts) {
    if (a > at + minLength) out.push([at, a]);
    at = Math.max(at, b);
  }
  if (L - at > minLength) out.push([at, L]);
  return out;
}

/** Clips a convex polygon (u, v) to the band lo ≤ v ≤ hi. */
function clipBand(poly: [number, number][], lo: number, hi: number) {
  const clip = (pts: [number, number][], keep: (v: number) => boolean, edge: number) => {
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const pin = keep(p[1]);
      const qin = keep(q[1]);
      if (pin) out.push(p);
      if (pin !== qin) {
        const t = (edge - p[1]) / (q[1] - p[1]);
        out.push([p[0] + (q[0] - p[0]) * t, edge]);
      }
    }
    return out;
  };
  // A sliver of tolerance so a strip that only touches the carriageway edge isn't cut.
  const eps = 1e-4;
  return clip(clip(poly, (v) => v >= lo + eps, lo + eps), (v) => v <= hi - eps, hi - eps);
}
