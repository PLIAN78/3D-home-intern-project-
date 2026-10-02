import type { Floor, Point2D, Room } from "./house";

/**
 * Building outlines for floors whose exterior walls don't form a clean closed
 * loop (typical of walls extracted from drawings: small gaps at doors, overlaps
 * at corners). Walls are rasterised and thickened to bridge door-sized gaps, the
 * outside is flood-filled, and the inside is traced back to a polygon snapped to
 * the wall centrelines. Rooms are then trimmed to that outline so floor finishes
 * never extend outside the house (e.g. into an L-shaped plan's notch).
 */

const CELL = 0.1;
/** Gaps up to twice this are bridged (exterior doors, missed wall pieces). */
const CLOSE = 0.65;
/** Wider bridging tried when walls leak (wall pieces missed at windows, e.g. on working drawings). */
const CLOSE_STEPS = [CLOSE, 1.0, 1.4];

type Grid = { w: number; h: number; x0: number; y0: number; data: Uint8Array };

function rasterWalls(floor: Floor, close: number): Grid | null {
  const walls = floor.walls;
  if (walls.length < 3) return null;
  const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
  const pad = close + 1;
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  const w = Math.ceil((Math.max(...xs) + pad - x0) / CELL);
  const h = Math.ceil((Math.max(...ys) + pad - y0) / CELL);
  if (w * h > 4_000_000) return null;
  const data = new Uint8Array(w * h);
  for (const wall of walls) {
    const r = wall.thickness / 2 + close;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len2 = dx * dx + dy * dy || 1e-9;
    const axisAligned = Math.abs(dx) < 0.02 || Math.abs(dy) < 0.02;
    const gx0 = Math.max(0, Math.floor((Math.min(wall.start.x, wall.end.x) - r - x0) / CELL));
    const gx1 = Math.min(w - 1, Math.ceil((Math.max(wall.start.x, wall.end.x) + r - x0) / CELL));
    const gy0 = Math.max(0, Math.floor((Math.min(wall.start.y, wall.end.y) - r - y0) / CELL));
    const gy1 = Math.min(h - 1, Math.ceil((Math.max(wall.start.y, wall.end.y) + r - y0) / CELL));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = x0 + (gx + 0.5) * CELL;
        const py = y0 + (gy + 0.5) * CELL;
        if (axisAligned) {
          // Square caps keep building corners square.
          data[gy * w + gx] = 1;
          continue;
        }
        const t = Math.max(0, Math.min(1, ((px - wall.start.x) * dx + (py - wall.start.y) * dy) / len2));
        if (Math.hypot(px - (wall.start.x + dx * t), py - (wall.start.y + dy * t)) <= r) data[gy * w + gx] = 1;
      }
    }
  }
  return { w, h, x0, y0, data };
}

/** Cells reachable from the border without crossing walls. */
function outside(g: Grid): Uint8Array {
  const out = new Uint8Array(g.w * g.h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!out[i] && !g.data[i]) {
      out[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < g.w; x++) {
    push(x);
    push((g.h - 1) * g.w + x);
  }
  for (let y = 0; y < g.h; y++) {
    push(y * g.w);
    push(y * g.w + g.w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % g.w;
    if (x > 0) push(i - 1);
    if (x < g.w - 1) push(i + 1);
    if (i >= g.w) push(i - g.w);
    if (i < (g.h - 1) * g.w) push(i + g.w);
  }
  return out;
}

/** Outer boundary (largest loop) of a set of grid cells, as polygon vertices in cell-corner indices. */
function traceOutline(inside: (cx: number, cy: number) => boolean, w: number, h: number): [number, number][] | null {
  // Directed boundary edges with the inside on the left (CCW in a y-down grid → we normalise later).
  const next = new Map<string, [number, number][]>();
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = `${ax},${ay}`;
    const list = next.get(k);
    if (list) list.push([bx, by]);
    else next.set(k, [[bx, by]]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      if (y === 0 || !inside(x, y - 1)) add(x, y, x + 1, y);
      if (x === w - 1 || !inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (y === h - 1 || !inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (x === 0 || !inside(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  let best: [number, number][] | null = null;
  let bestArea = 0;
  while (next.size) {
    const [startKey, list] = next.entries().next().value as [string, [number, number][]];
    const loop: [number, number][] = [];
    let [cx, cy] = startKey.split(",").map(Number) as [number, number];
    let edges = list;
    for (let guard = 0; guard < 1_000_000; guard++) {
      const k = `${cx},${cy}`;
      edges = next.get(k) ?? [];
      if (!edges.length) break;
      const [nx, ny] = edges.pop()!;
      if (!edges.length) next.delete(k);
      loop.push([cx, cy]);
      [cx, cy] = [nx, ny];
      if (`${cx},${cy}` === startKey) break;
    }
    let area = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (Math.abs(area) > bestArea) [best, bestArea] = [loop, Math.abs(area)];
  }
  return best && simplify(best);
}

/** Drop collinear vertices of a rectilinear loop. */
function simplify(loop: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[(i - 1 + loop.length) % loop.length];
    const b = loop[i];
    const c = loop[(i + 1) % loop.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross !== 0) out.push(b);
  }
  return out;
}

function snapTo(v: number, candidates: number[], tol: number) {
  let best = v;
  let d = tol;
  for (const c of candidates) {
    if (Math.abs(c - v) < d) [best, d] = [c, Math.abs(c - v)];
  }
  return best;
}

/** Remove (near-)duplicate and collinear vertices until nothing changes. */
function tidyLoop(points: Point2D[]): Point2D[] {
  let pts = points;
  for (let pass = 0; pass < 8; pass++) {
    const out: Point2D[] = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (!last || Math.abs(last.x - p.x) > 1e-3 || Math.abs(last.y - p.y) > 1e-3) out.push(p);
    }
    while (out.length > 1 && Math.abs(out[0].x - out[out.length - 1].x) <= 1e-3 && Math.abs(out[0].y - out[out.length - 1].y) <= 1e-3) out.pop();
    const kept = out.filter((b, i) => {
      const a = out[(i - 1 + out.length) % out.length];
      const c = out[(i + 1) % out.length];
      return Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) > 1e-6;
    });
    if (kept.length === pts.length) return kept;
    pts = kept;
  }
  return pts;
}

/** Map each value to a representative of its cluster (values within `tol` chain together). */
function clusterValues(values: number[], preferred: number[], tol: number): (v: number) => number {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const rep = new Map<number, number>();
  let group: number[] = [];
  const flush = () => {
    if (!group.length) return;
    const onWall = group.find((v) => preferred.some((p) => Math.abs(p - v) < 1e-6));
    const r = onWall ?? group.reduce((a, b) => a + b, 0) / group.length;
    for (const v of group) rep.set(v, r);
    group = [];
  };
  for (const v of sorted) {
    if (group.length && v - group[group.length - 1] > tol) flush();
    group.push(v);
  }
  flush();
  return (v) => rep.get(v) ?? v;
}

function polygonArea(p: Point2D[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i].x * q.y - q.x * p[i].y;
  }
  return a / 2;
}

/**
 * Outline from the walls by flood fill. Returns null when the walls don't
 * enclose anything sensible (the caller then falls back to the bounding box).
 */
export function rasterFootprint(floor: Floor): Point2D[] | null {
  // Bridge as little as possible: wider bridging also fills real recesses (porches),
  // so take the smallest that encloses nearly as much as the widest.
  const tries = CLOSE_STEPS.map((c) => rasterFootprintAt(floor, c));
  const area = (p: Point2D[] | null) => (p ? Math.abs(polygonArea(p)) : 0);
  const widest = Math.max(...tries.map(area));
  return tries.find((p) => p && area(p) >= widest * 0.9) ?? null;
}

function rasterFootprintAt(floor: Floor, close: number): Point2D[] | null {
  const g = rasterWalls(floor, close);
  if (!g) return null;
  const out = outside(g);
  // Shrink the filled region back from the thickened walls' outer edge to the
  // wall centreline: keep cells further than `close` from the outside.
  const reach = Math.round(close / CELL);
  const dist = new Int32Array(g.w * g.h).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < out.length; i++) {
    if (!out[i]) continue;
    dist[i] = 0;
    queue.push(i);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    if (dist[i] >= reach) continue;
    const x = i % g.w;
    // 8-neighbour (Chebyshev) distance keeps convex corners square.
    const l = x > 0;
    const r = x < g.w - 1;
    for (const j of [l ? i - 1 : -1, r ? i + 1 : -1, i - g.w, i + g.w, l ? i - g.w - 1 : -1, r ? i - g.w + 1 : -1, l ? i + g.w - 1 : -1, r ? i + g.w + 1 : -1]) {
      if (j >= 0 && j < dist.length && dist[j] < 0) {
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
    }
  }
  const inside = (cx: number, cy: number) => dist[cy * g.w + cx] < 0;
  const loop = traceOutline(inside, g.w, g.h);
  if (!loop || loop.length < 4) return null;
  // Snap to exterior wall centrelines (fall back to any wall).
  const ext = floor.walls.filter((w) => w.exterior);
  const ref = ext.length >= 3 ? ext : floor.walls;
  const vx = ref.filter((w) => Math.abs(w.end.x - w.start.x) < Math.abs(w.end.y - w.start.y)).map((w) => (w.start.x + w.end.x) / 2);
  const hy = ref.filter((w) => Math.abs(w.end.x - w.start.x) >= Math.abs(w.end.y - w.start.y)).map((w) => (w.start.y + w.end.y) / 2);
  const raw = loop.map(([cx, cy]) => ({ x: snapTo(g.x0 + cx * CELL, vx, 0.35), y: snapTo(g.y0 + cy * CELL, hy, 0.35) }));
  // Merge coordinates closer than 25 cm (collapses small jogs where walls don't quite line up),
  // preferring values that sit on a wall centreline.
  const qx = clusterValues(raw.map((p) => p.x), vx, 0.25);
  const qy = clusterValues(raw.map((p) => p.y), hy, 0.25);
  const poly = raw.map((p) => ({ x: Math.round(qx(p.x) * 1000) / 1000, y: Math.round(qy(p.y) * 1000) / 1000 }));
  // Snapping can create duplicate or collinear points.
  const clean: Point2D[] = [];
  for (const p of poly) {
    const last = clean[clean.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-6 || Math.abs(last.y - p.y) > 1e-6) clean.push(p);
  }
  if (clean.length > 1 && Math.abs(clean[0].x - clean[clean.length - 1].x) < 1e-6 && Math.abs(clean[0].y - clean[clean.length - 1].y) < 1e-6) clean.pop();
  const simple = tidyLoop(clean);
  if (simple.length < 3) return null;
  const area = Math.abs(polygonArea(simple));
  const xs = floor.walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = floor.walls.flatMap((w) => [w.start.y, w.end.y]);
  const bboxArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  // Something went wrong (walls barely enclose anything): let the caller use the bounds.
  if (area < bboxArea * 0.4) return null;
  return polygonArea(simple) < 0 ? simple.reverse() : simple;
}

/**
 * Exterior walls along the parts of the outline that have none (wall pieces a
 * tracer missed, e.g. drawn as outlines next to windows). Only axis-aligned
 * outline edges are filled; each new wall is flagged unverified. Meant for
 * upper floors, whose outline never legitimately opens (no porches or garage
 * doors that a wider bridge could swallow).
 */
export function missingShellWalls(floor: Floor, newWallId: () => string): Floor["walls"] {
  const ext = floor.walls.filter((w) => w.exterior);
  if (ext.length < 2) return [];
  const thickness = [...ext.map((w) => w.thickness)].sort((a, b) => a - b)[Math.floor(ext.length / 2)];
  const height = Math.max(...ext.map((w) => w.height));
  return outlineGaps(floor).map((g) => ({ id: newWallId(), start: g.start, end: g.end, thickness, height, exterior: true, unverified: true }));
}

/** Stretches (≥ 0.6 m) of a floor's outline with no wall along them. */
export function outlineGaps(floor: Floor): { start: Point2D; end: Point2D; horizontal: boolean; length: number }[] {
  const fp = rasterFootprint(floor);
  if (!fp) return [];
  const step = 0.1;
  const covered = (x: number, y: number, horizontal: boolean) =>
    floor.walls.some((w) => {
      const wh = Math.abs(w.end.y - w.start.y) < Math.abs(w.end.x - w.start.x);
      if (wh !== horizontal) return false;
      if (horizontal) return Math.abs(w.start.y - y) < 0.35 && x >= Math.min(w.start.x, w.end.x) - 0.05 && x <= Math.max(w.start.x, w.end.x) + 0.05;
      return Math.abs(w.start.x - x) < 0.35 && y >= Math.min(w.start.y, w.end.y) - 0.05 && y <= Math.max(w.start.y, w.end.y) + 0.05;
    });
  const out: { start: Point2D; end: Point2D; horizontal: boolean; length: number }[] = [];
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i];
    const b = fp[(i + 1) % fp.length];
    const horizontal = Math.abs(a.y - b.y) < 1e-6;
    if (!horizontal && Math.abs(a.x - b.x) > 1e-6) continue;
    const len = horizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
    const n = Math.floor(len / step);
    let runStart: number | null = null;
    for (let k = 0; k <= n; k++) {
      const t = Math.min(len, k * step);
      const x = horizontal ? Math.min(a.x, b.x) + t : a.x;
      const y = horizontal ? a.y : Math.min(a.y, b.y) + t;
      const gap = !covered(x, y, horizontal) && k < n;
      if (gap && runStart === null) runStart = t;
      if (!gap && runStart !== null) {
        if (t - runStart >= 0.6) {
          const start = horizontal ? { x: Math.min(a.x, b.x) + runStart, y: a.y } : { x: a.x, y: Math.min(a.y, b.y) + runStart };
          const end = horizontal ? { x: Math.min(a.x, b.x) + t, y: a.y } : { x: a.x, y: Math.min(a.y, b.y) + t };
          out.push({ start, end, horizontal, length: t - runStart });
        }
        runStart = null;
      }
    }
  }
  return out;
}

function pointInPolygon(p: Point2D, poly: Point2D[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/**
 * Trim a room to the building outline, exactly (no rasterising): the plane is
 * cut into cells along every vertex coordinate of both polygons, cells inside
 * both are kept, and their outline is traced. Rooms already inside are returned
 * unchanged.
 */
export function clipRoomToFootprint(room: Room, footprint: Point2D[]): Room {
  if (room.polygon.length < 3 || footprint.length < 3) return room;
  if (room.polygon.every((p) => pointInPolygon(p, footprint) || footprint.some((q) => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6) || onBoundary(p, footprint))) {
    // All corners inside: only trim if the outline cuts into the room.
    if (!footprint.some((q) => pointInPolygon(q, room.polygon))) return room;
  }
  const xs = [...new Set([...room.polygon, ...footprint].map((p) => p.x))].sort((a, b) => a - b);
  const ys = [...new Set([...room.polygon, ...footprint].map((p) => p.y))].sort((a, b) => a - b);
  const keep = (cx: number, cy: number) => {
    const c = { x: (xs[cx] + xs[cx + 1]) / 2, y: (ys[cy] + ys[cy + 1]) / 2 };
    return pointInPolygon(c, room.polygon) && pointInPolygon(c, footprint);
  };
  const loop = traceOutline(keep, xs.length - 1, ys.length - 1);
  if (!loop || loop.length < 3) return room;
  const polygon = loop.map(([i, j]) => ({ x: xs[i], y: ys[j] }));
  if (Math.abs(polygonArea(polygon)) < 0.5) return room;
  return { ...room, polygon };
}

function onBoundary(p: Point2D, poly: Point2D[]) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) > 1e-6) continue;
    if (p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6 && p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6) return true;
  }
  return false;
}
