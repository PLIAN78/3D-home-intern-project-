import { normaliseStreetName, type ContextRoad } from "../siteContext";
import { applySimilarity, type GeoreferenceResult, type Similarity } from "./georeference";
import type { ParsedSitePlan } from "./parseSitePlan";

/**
 * Place a site plan on real streets without relying on street names.
 *
 * Many marketing site plans draw their street names into a background
 * illustration, so the PDF has lots (vectors) but few or no street labels.
 * Lots always front onto streets, though: the middle of a lot's narrow end
 * sits a boulevard's width from a road centreline. We score poses
 * (scale, rotation, translation) against a distance field of the
 * OpenStreetMap roads: coarse exhaustive search, then local refinement.
 * Any street labels that do match by name add their own constraint.
 */

type P = [number, number];

/** Expected distance (m) from a lot's front property line to the road centreline. */
const FRONT_TO_CENTRE = 9;

interface Field {
  x0: number;
  y0: number;
  cell: number;
  w: number;
  h: number;
  d: Float32Array;
}

/** 1-D squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float32Array, n: number, d: Float32Array, v: Int32Array, z: Float32Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Distance (m) to the nearest drivable road centreline, on a regular grid. */
export function roadDistanceField(roads: ContextRoad[], cell = 2): Field | null {
  const lines = roads.filter((r) => r.kind !== "path" && r.points.length > 1);
  if (!lines.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of lines)
    for (const [x, y] of r.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  const pad = 60;
  const x0 = minX - pad;
  const y0 = minY - pad;
  const w = Math.ceil((maxX - minX + 2 * pad) / cell);
  const h = Math.ceil((maxY - minY + 2 * pad) / cell);
  const INF = 1e10;
  const grid = new Float32Array(w * h).fill(INF);
  for (const r of lines) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, ay] = r.points[i];
      const [bx, by] = r.points[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (cell * 0.5)));
      for (let j = 0; j <= n; j++) {
        const gx = Math.round((ax + ((bx - ax) * j) / n - x0) / cell);
        const gy = Math.round((ay + ((by - ay) * j) / n - y0) / cell);
        if (gx >= 0 && gy >= 0 && gx < w && gy < h) grid[gy * w + gx] = 0;
      }
    }
  }
  const n = Math.max(w, h);
  const f = new Float32Array(n);
  const d = new Float32Array(n);
  const v = new Int32Array(n);
  const z = new Float32Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]) * cell;
  }
  return { x0, y0, cell, w, h, d: grid };
}

/** 1 where an existing (mapped) building stands, on a 2 m grid. */
export function buildingOccupancy(buildings: { points: [number, number][] }[], cell = 2): Field | null {
  if (!buildings.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of buildings)
    for (const [x, y] of b.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  const w = Math.ceil((maxX - minX) / cell) + 2;
  const h = Math.ceil((maxY - minY) / cell) + 2;
  const d = new Float32Array(w * h);
  for (const b of buildings) {
    const pts = b.points;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const [x, y] of pts) {
      bx0 = Math.min(bx0, x);
      by0 = Math.min(by0, y);
      bx1 = Math.max(bx1, x);
      by1 = Math.max(by1, y);
    }
    for (let gy = Math.floor((by0 - minY) / cell); gy <= Math.ceil((by1 - minY) / cell); gy++) {
      for (let gx = Math.floor((bx0 - minX) / cell); gx <= Math.ceil((bx1 - minX) / cell); gx++) {
        const x = minX + gx * cell;
        const y = minY + gy * cell;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          if (pts[i][1] > y !== pts[j][1] > y && x < ((pts[j][0] - pts[i][0]) * (y - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) inside = !inside;
        }
        if (inside && gx >= 0 && gy >= 0 && gx < w && gy < h) d[gy * w + gx] = 1;
      }
    }
  }
  return { x0: minX, y0: minY, cell, w, h, d };
}

function occupied(B: Field, x: number, y: number) {
  const gx = Math.round((x - B.x0) / B.cell);
  const gy = Math.round((y - B.y0) / B.cell);
  return gx >= 0 && gy >= 0 && gx < B.w && gy < B.h && B.d[gy * B.w + gx] > 0;
}

/** 1 when a lot that isn't sold sits on an existing building (it can't: it's vacant land). */
function vacantCost(B: Field, pr: LotProbe, cos: number, sin: number, s: number, tx: number, ty: number) {
  for (const q of [pr.c, ...pr.inner]) {
    if (occupied(B, s * (cos * q[0] - sin * q[1]) + tx, s * (sin * q[0] + cos * q[1]) + ty)) return 1;
  }
  return 0;
}

function sample(F: Field, x: number, y: number) {
  const gx = Math.round((x - F.x0) / F.cell);
  const gy = Math.round((y - F.y0) / F.cell);
  if (gx < 0 || gy < 0 || gx >= F.w || gy >= F.h) return 200;
  return F.d[gy * F.w + gx];
}

interface LotProbe {
  /** Lot centre and the two narrow-end midpoints, in the page's (x, −y) frame. */
  c: P;
  ends: [P, P];
  /** Interior points: no road may pass through a lot. */
  inner: P[];
}

function probes(plan: ParsedSitePlan, which: "released" | "vacant" = "released"): LotProbe[] {
  const out: LotProbe[] = [];
  // Future phases often aren't built (or mapped) yet; fit on released lots when there are enough.
  const released = plan.lots.filter((l) => l.status !== "future");
  const lots = which === "vacant" ? plan.lots.filter((l) => l.status !== "sold") : released.length >= 15 ? released : plan.lots;
  for (const lot of lots) {
    const pts = lot.points;
    if (pts.length < 3) continue;
    // Oriented box: try each edge direction, keep the smallest area.
    let best: { area: number; u: P; v: P; cu: number; cv: number; eu: number; ev: number } | null = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) continue;
      const u: P = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      const v: P = [-u[1], u[0]];
      let mu = Infinity, Mu = -Infinity, mv = Infinity, Mv = -Infinity;
      for (const p of pts) {
        const pu = p[0] * u[0] + p[1] * u[1];
        const pv = p[0] * v[0] + p[1] * v[1];
        mu = Math.min(mu, pu);
        Mu = Math.max(Mu, pu);
        mv = Math.min(mv, pv);
        Mv = Math.max(Mv, pv);
      }
      const area = (Mu - mu) * (Mv - mv);
      if (!best || area < best.area) best = { area, u, v, cu: (mu + Mu) / 2, cv: (mv + Mv) / 2, eu: Mu - mu, ev: Mv - mv };
    }
    if (!best) continue;
    const { u, v, cu, cv, eu, ev } = best;
    const c: P = [u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv];
    // Long axis runs from the street to the rear lot line.
    const [axis, half, cross, crossHalf] = eu >= ev ? [u, eu / 2, v, ev / 2] : [v, ev / 2, u, eu / 2];
    const flip = (p: P): P => [p[0], -p[1]];
    const at = (a: number, b: number): P => flip([c[0] + axis[0] * half * a + cross[0] * crossHalf * b, c[1] + axis[1] * half * a + cross[1] * crossHalf * b]);
    out.push({ c: flip(c), ends: [at(1, 0), at(-1, 0)], inner: [at(0.45, 0.4), at(0.45, -0.4), at(-0.45, 0.4), at(-0.45, -0.4)] });
  }
  return out;
}

interface Pose {
  s: number;
  theta: number;
  tx: number;
  ty: number;
}

function lotCost(F: Field, pr: LotProbe, cos: number, sin: number, s: number, tx: number, ty: number, sigma = 4) {
  const tf = (p: P): P => [s * (cos * p[0] - sin * p[1]) + tx, s * (sin * p[0] + cos * p[1]) + ty];
  const [cx, cy] = tf(pr.c);
  // A lot never sits on a road.
  if (sample(F, cx, cy) < 3.5) return 1.5;
  for (const q of pr.inner) {
    const [x, y] = tf(q);
    if (sample(F, x, y) < 3) return 1.5;
  }
  let best = 1;
  for (const e of pr.ends) {
    const [x, y] = tf(e);
    const r = (sample(F, x, y) - FRONT_TO_CENTRE) / sigma;
    best = Math.min(best, r * r);
  }
  return best;
}

export interface ShapeMatchOptions {
  /** Rough plan-metre position of the community centre (from geocoding). */
  guess: P;
  /** Metres per page point, if known (from collection frontages). */
  scaleHint: number | null;
  /** How far (m) the true centre may be from the guess. */
  searchRadius?: number;
  /** Existing mapped buildings: unsold lots can't sit on them. */
  buildings?: { points: [number, number][] }[];
}

/**
 * Fit the plan to the road network. Returns a GeoreferenceResult so callers
 * treat it like the label-based fit; `rmsMetres` is the RMS front-distance
 * error over inlier lots.
 */
export function shapeMatchSitePlan(plan: ParsedSitePlan, roads: ContextRoad[], opts: ShapeMatchOptions): GeoreferenceResult | null {
  const F = roadDistanceField(roads);
  const all = probes(plan);
  if (!F || all.length < 8) return null;
  const B = opts.buildings ? buildingOccupancy(opts.buildings) : null;
  const vacantAll = B ? probes(plan, "vacant") : [];
  const vStep = Math.max(1, Math.floor(vacantAll.length / 40));
  const vacantSubset = vacantAll.filter((_, i) => i % vStep === 0);
  const VACANT_WEIGHT = 1.2;

  // Matching labels (often arterials around the edge) as extra evidence.
  const byName = new Map<string, P[][]>();
  for (const r of roads) if (r.name) byName.set(normaliseStreetName(r.name), [...(byName.get(normaliseStreetName(r.name)) ?? []), r.points]);
  const labels = plan.streets.map((l) => ({ ...l, lines: byName.get(normaliseStreetName(l.name)) })).filter((l) => l.lines);
  const labelField = new Map<string, Field>();
  for (const l of labels) {
    const k = normaliseStreetName(l.name);
    if (!labelField.has(k)) {
      const f = roadDistanceField(l.lines!.map((points, i) => ({ id: i, kind: "residential", width: 8, points })), 4);
      if (f) labelField.set(k, f);
    }
  }
  const labelCost = (pose: Pose) => {
    let c = 0;
    for (const l of labels) {
      const [X, Y] = applySimilarity(pose, l.x, l.y);
      const d = sample(labelField.get(normaliseStreetName(l.name))!, X, Y);
      c += Math.min(1, (d / 25) ** 2);
    }
    return c;
  };

  // Centre of the lots in page (x, −y).
  const pc: P = [all.reduce((a, p) => a + p.c[0], 0) / all.length, all.reduce((a, p) => a + p.c[1], 0) / all.length];
  const step = Math.max(1, Math.floor(all.length / 40));
  const subset = all.filter((_, i) => i % step === 0);
  const s0 = opts.scaleHint ?? 1;
  const scales = opts.scaleHint ? [0.93, 1, 1.07].map((f) => f * s0) : [0.5, 0.65, 0.8, 0.95, 1.1, 1.3, 1.6];
  const R = opts.searchRadius ?? 700;
  const labelWeight = Math.max(2, subset.length / 6);

  const cost = (pose: Pose, lots: LotProbe[]) => {
    const cos = Math.cos(pose.theta);
    const sin = Math.sin(pose.theta);
    let c = 0;
    for (const pr of lots) c += lotCost(F, pr, cos, sin, pose.s, pose.tx, pose.ty);
    let v = 0;
    if (B) for (const pr of vacantAll) v += vacantCost(B, pr, cos, sin, pose.s, pose.tx, pose.ty);
    return c / lots.length + (vacantAll.length ? (VACANT_WEIGHT * v) / vacantAll.length : 0) + (labels.length ? (labelWeight * labelCost(pose)) / (labels.length * lots.length) : 0);
  };

  // Coarse exhaustive search: 6° rotations, 20 m translations around the guess,
  // with a wide tolerance so the true pose isn't missed between grid points.
  const top: { pose: Pose; c: number }[] = [];
  const keep = 24;
  const tStep = 20;
  const coarseSigma = 10;
  for (const s of scales) {
    for (let deg = 0; deg < 360; deg += 6) {
      const theta = (deg * Math.PI) / 180;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      // tx/ty such that the lot centre lands on (gx, gy).
      const ox = s * (cos * pc[0] - sin * pc[1]);
      const oy = s * (sin * pc[0] + cos * pc[1]);
      for (let gx = opts.guess[0] - R; gx <= opts.guess[0] + R; gx += tStep) {
        for (let gy = opts.guess[1] - R; gy <= opts.guess[1] + R; gy += tStep) {
          const tx = gx - ox;
          const ty = gy - oy;
          let c = 0;
          const worst = top.length >= keep ? top[top.length - 1].c * subset.length : Infinity;
          for (let i = 0; i < subset.length && c < worst; i++) c += lotCost(F, subset[i], cos, sin, s, tx, ty, coarseSigma);
          if (c >= worst) continue;
          c /= subset.length;
          if (B && vacantSubset.length) {
            let v = 0;
            for (const pr of vacantSubset) v += vacantCost(B, pr, cos, sin, s, tx, ty);
            c += (VACANT_WEIGHT * v) / vacantSubset.length;
          }
          top.push({ pose: { s, theta, tx, ty }, c });
          top.sort((a, b) => a.c - b.c);
          if (top.length > keep) top.pop();
        }
      }
    }
  }

  // Local refinement of the best candidates on all lots (+ labels).
  const refine = (start: Pose) => {
    let p = { ...start };
    let c = cost(p, all);
    let dt = 12;
    let da = (4 * Math.PI) / 180;
    let ds = 0.03;
    while (dt > 0.25) {
      let improved = false;
      const tries: Pose[] = [
        { ...p, tx: p.tx + dt },
        { ...p, tx: p.tx - dt },
        { ...p, ty: p.ty + dt },
        { ...p, ty: p.ty - dt },
        { ...p, theta: p.theta + da },
        { ...p, theta: p.theta - da },
        { ...p, s: p.s * (1 + ds) },
        { ...p, s: p.s * (1 - ds) },
      ];
      for (const t of tries) {
        // Rotating / scaling about the lots' centre keeps the other parameters meaningful.
        if (t.theta !== p.theta || t.s !== p.s) {
          const cx = p.s * (Math.cos(p.theta) * pc[0] - Math.sin(p.theta) * pc[1]) + p.tx;
          const cy = p.s * (Math.sin(p.theta) * pc[0] + Math.cos(p.theta) * pc[1]) + p.ty;
          t.tx = cx - t.s * (Math.cos(t.theta) * pc[0] - Math.sin(t.theta) * pc[1]);
          t.ty = cy - t.s * (Math.sin(t.theta) * pc[0] + Math.cos(t.theta) * pc[1]);
        }
        if (opts.scaleHint && (t.s < s0 * 0.8 || t.s > s0 * 1.25)) continue;
        const tc = cost(t, all);
        if (tc < c - 1e-6) {
          p = t;
          c = tc;
          improved = true;
        }
      }
      if (!improved) {
        dt /= 2;
        da /= 2;
        ds /= 2;
      }
    }
    return { pose: p, c };
  };
  const refined = top.map((t) => refine(t.pose)).sort((a, b) => a.c - b.c);
  const best = refined[0];
  if (!best) return null;

  // Quality: fraction of lots whose narrow end is at a plausible distance from a road.
  const cos = Math.cos(best.pose.theta);
  const sin = Math.sin(best.pose.theta);
  const errs: number[] = [];
  for (const pr of all) {
    let e = Infinity;
    for (const end of pr.ends) {
      const x = best.pose.s * (cos * end[0] - sin * end[1]) + best.pose.tx;
      const y = best.pose.s * (sin * end[0] + cos * end[1]) + best.pose.ty;
      e = Math.min(e, Math.abs(sample(F, x, y) - FRONT_TO_CENTRE));
    }
    errs.push(e);
  }
  const inliers = errs.filter((e) => e < 5);
  const inlierFraction = inliers.length / errs.length;
  const rms = Math.sqrt(inliers.reduce((a, e) => a + e * e, 0) / Math.max(1, inliers.length));
  // A distinct runner-up nearly as good means the placement is ambiguous.
  const centre = (p: Pose): P => [p.s * (Math.cos(p.theta) * pc[0] - Math.sin(p.theta) * pc[1]) + p.tx, p.s * (Math.sin(p.theta) * pc[0] + Math.cos(p.theta) * pc[1]) + p.ty];
  const bc = centre(best.pose);
  const rival = refined.find((r) => {
    const rc = centre(r.pose);
    return Math.hypot(rc[0] - bc[0], rc[1] - bc[1]) > 25 || Math.abs(Math.atan2(Math.sin(r.pose.theta - best.pose.theta), Math.cos(r.pose.theta - best.pose.theta))) > 0.15;
  });
  const margin = rival ? (rival.c - best.c) / Math.max(1e-6, rival.c) : 1;
  const confidence = Math.max(0, Math.min(1, (inlierFraction - 0.35) / 0.45)) * Math.min(1, margin / 0.15 + 0.3);

  const transform: Similarity = best.pose;
  const residuals = labels.map((l) => {
    const [X, Y] = applySimilarity(transform, l.x, l.y);
    return { name: l.name, metres: Math.round(sample(labelField.get(normaliseStreetName(l.name))!, X, Y) * 10) / 10, used: true };
  });
  return {
    transform,
    rmsMetres: Math.round(rms * 10) / 10,
    matchedLabels: labels.length,
    usedLabels: labels.length,
    unmatched: plan.streets.filter((s) => !byName.has(normaliseStreetName(s.name))).map((s) => s.name),
    residuals,
    confidence: Math.round(Math.min(1, confidence) * 100) / 100,
    method: "lot-shapes",
    inlierFraction: Math.round(inlierFraction * 100) / 100,
  };
}

/** Share of (released) lots whose narrow end sits at a plausible distance from a road under `t`. */
export function lotFitQuality(plan: ParsedSitePlan, roads: ContextRoad[], t: Similarity) {
  const F = roadDistanceField(roads);
  if (!F) return { inlierFraction: 0, cost: Infinity };
  const all = probes(plan);
  const cos = Math.cos(t.theta);
  const sin = Math.sin(t.theta);
  let inl = 0;
  let cost = 0;
  const front: number[] = [];
  for (const pr of all) {
    cost += lotCost(F, pr, cos, sin, t.s, t.tx, t.ty);
    let e = Infinity;
    let raw = Infinity;
    for (const end of pr.ends) {
      const d = sample(F, t.s * (cos * end[0] - sin * end[1]) + t.tx, t.s * (sin * end[0] + cos * end[1]) + t.ty);
      e = Math.min(e, Math.abs(d - FRONT_TO_CENTRE));
      raw = Math.min(raw, d);
    }
    front.push(raw);
    if (e < 5) inl++;
  }
  front.sort((a, b) => a - b);
  const q = (f: number) => Math.round(front[Math.floor(front.length * f)] * 10) / 10;
  return { inlierFraction: inl / all.length, cost: cost / all.length, frontDistance: { p10: q(0.1), p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9) } };
}
