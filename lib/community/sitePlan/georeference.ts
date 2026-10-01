import { normaliseStreetName, type ContextRoad } from "../siteContext";
import type { ParsedSitePlan, PlanStreetLabel } from "./parseSitePlan";

/**
 * Fit a similarity transform (scale, rotation, translation) that maps site
 * plan page points onto real-world plan metres, by snapping each street
 * label to the OpenStreetMap street of the same name.
 *
 * page (x right, y down) → plan metres (x east, y north):
 *   [X, Y] = s · R(θ) · [x, −y] + [tx, ty]
 *
 * Robust ICP: multiple rotation starts, trimmed correspondences (labels from
 * inset/key maps become outliers), and a penalty when a label doesn't run
 * along its street.
 */

export interface Similarity {
  s: number;
  theta: number;
  tx: number;
  ty: number;
}

export interface GeoreferenceResult {
  transform: Similarity;
  /** Trimmed RMS distance (m) between labels and their streets. */
  rmsMetres: number;
  matchedLabels: number;
  usedLabels: number;
  unmatched: string[];
  /** Distance (m) from each matched label to its street after fitting. */
  residuals: { name: string; metres: number; used: boolean }[];
  /** 0–1: how much to trust the placement. */
  confidence: number;
  /** How the plan was placed: by matching street labels, or by fitting lot shapes to the road network. */
  method?: "street-names" | "lot-shapes";
  /** Lot-shape fits: share of lots whose narrow end sits at a plausible distance from a road. */
  inlierFraction?: number;
}

export function applySimilarity(t: Similarity, x: number, y: number): [number, number] {
  const c = Math.cos(t.theta);
  const sn = Math.sin(t.theta);
  const px = x;
  const py = -y;
  return [t.s * (c * px - sn * py) + t.tx, t.s * (sn * px + c * py) + t.ty];
}

function nearestOnPolylines(lines: [number, number][][], x: number, y: number) {
  let best = { d: Infinity, x: 0, y: 0, dir: 0 };
  for (const pts of lines) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      const qx = ax + dx * t;
      const qy = ay + dy * t;
      const d = Math.hypot(x - qx, y - qy);
      if (d < best.d) best = { d, x: qx, y: qy, dir: Math.atan2(dy, dx) };
    }
  }
  return best;
}

/** Umeyama similarity from paired points (page already y-flipped). */
function solveSimilarity(src: [number, number][], dst: [number, number][], fixedScale?: number): Similarity {
  const n = src.length;
  const ms = src.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0]);
  const md = dst.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0]);
  let sxx = 0, sxy = 0, varS = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i][0] - ms[0];
    const ay = src[i][1] - ms[1];
    const bx = dst[i][0] - md[0];
    const by = dst[i][1] - md[1];
    sxx += ax * bx + ay * by;
    sxy += ax * by - ay * bx;
    varS += ax * ax + ay * ay;
  }
  const theta = Math.atan2(sxy, sxx);
  const s = fixedScale ?? Math.hypot(sxx, sxy) / (varS || 1);
  const c = Math.cos(theta);
  const sn = Math.sin(theta);
  return { s, theta, tx: md[0] - s * (c * ms[0] - sn * ms[1]), ty: md[1] - s * (sn * ms[0] + c * ms[1]) };
}

function angleDiffLines(a: number, b: number) {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

export function georeferenceSitePlan(plan: ParsedSitePlan, roads: ContextRoad[], opts: { scaleHint?: number | null; approxOrigin?: [number, number] } = {}): GeoreferenceResult | null {
  const byName = new Map<string, [number, number][][]>();
  for (const r of roads) {
    if (!r.name) continue;
    const k = normaliseStreetName(r.name);
    byName.set(k, [...(byName.get(k) ?? []), r.points]);
  }
  const labels: (PlanStreetLabel & { lines: [number, number][][] })[] = [];
  const unmatched: string[] = [];
  for (const l of plan.streets) {
    const lines = byName.get(normaliseStreetName(l.name));
    if (lines) labels.push({ ...l, lines });
    else unmatched.push(l.name);
  }
  // Two streets can't pin a plan down (it can slide along parallel streets).
  if (labels.length < 3 || new Set(labels.map((l) => normaliseStreetName(l.name))).size < 3) return null;

  const pts = labels.map((l) => [l.x, -l.y] as [number, number]);
  const scale0 = opts.scaleHint ?? null;
  const keepFraction = 0.7;
  let best: { t: Similarity; score: number; rms: number; used: number } | null = null;

  const evaluate = (t: Similarity) => {
    const res = labels.map((l, i) => {
      const [X, Y] = applySimilarity(t, l.x, l.y);
      const q = nearestOnPolylines(l.lines, X, Y);
      // Label baseline direction in plan space (page angle measured with y down).
      const dir = -l.angle + t.theta;
      return { i, d: q.d, q, dirPenalty: angleDiffLines(dir, q.dir) };
    });
    res.sort((a, b) => a.d + 20 * a.dirPenalty - (b.d + 20 * b.dirPenalty));
    return res.slice(0, Math.max(3, Math.round(res.length * keepFraction)));
  };

  for (let deg = 0; deg < 360; deg += 10) {
    const theta = (deg * Math.PI) / 180;
    const s = scale0 ?? 1;
    // Initial translation: align label centroid with the centroid of their streets.
    const c = labels.reduce((a, l) => {
      const all = l.lines.flat();
      const m = all.reduce((p, q) => [p[0] + q[0] / all.length, p[1] + q[1] / all.length], [0, 0]);
      return [a[0] + m[0] / labels.length, a[1] + m[1] / labels.length];
    }, [0, 0]);
    const pc = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
    let t: Similarity = { s, theta, tx: c[0] - s * (Math.cos(theta) * pc[0] - Math.sin(theta) * pc[1]), ty: c[1] - s * (Math.sin(theta) * pc[0] + Math.cos(theta) * pc[1]) };
    for (let it = 0; it < 40; it++) {
      const kept = evaluate(t);
      const src = kept.map((k) => pts[k.i]);
      const dst = kept.map((k) => [k.q.x, k.q.y] as [number, number]);
      // Hold scale for the first iterations when we have a good prior.
      const next = solveSimilarity(src, dst, scale0 && it < 15 ? scale0 : undefined);
      if (scale0 && (next.s < scale0 * 0.7 || next.s > scale0 * 1.4)) next.s = Math.min(scale0 * 1.4, Math.max(scale0 * 0.7, next.s));
      const moved = Math.hypot(next.tx - t.tx, next.ty - t.ty) + Math.abs(next.theta - t.theta) * 500;
      t = next;
      if (moved < 0.01) break;
    }
    const kept = evaluate(t);
    const rms = Math.sqrt(kept.reduce((a, k) => a + k.d * k.d, 0) / kept.length);
    const dirPen = kept.reduce((a, k) => a + k.dirPenalty, 0) / kept.length;
    const score = rms + 40 * dirPen;
    if (!best || score < best.score) best = { t, score, rms, used: kept.length };
  }
  if (!best) return null;
  const final = best;
  const keptSet = new Set(evaluate(final.t).map((k) => k.i));
  const residuals = labels.map((l, i) => {
    const [X, Y] = applySimilarity(final.t, l.x, l.y);
    return { name: l.name, metres: Math.round(nearestOnPolylines(l.lines, X, Y).d * 10) / 10, used: keptSet.has(i) };
  });
  const confidence = Math.max(0, Math.min(1, 1 - best.rms / 40)) * Math.min(1, labels.length / 6);
  return { transform: best.t, rmsMetres: Math.round(best.rms * 10) / 10, matchedLabels: labels.length, usedLabels: best.used, unmatched, residuals, confidence: Math.round(confidence * 100) / 100, method: "street-names" };
}
