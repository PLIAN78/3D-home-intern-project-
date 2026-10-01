import type { Floor, Point2D } from "@/lib/models/house";

/**
 * Register floors drawn on separate sheets into one shared plan frame.
 * Exterior walls are rasterised onto a 10 cm grid and the translation that
 * maximises their overlap with a reference floor wins. Candidates come from
 * aligning bounding-box edges/centres, then a local ±0.6 m refinement.
 */

const CELL = 0.1;

function occupancy(floor: Floor, exteriorOnly: boolean): Set<string> {
  const cells = new Set<string>();
  for (const w of floor.walls) {
    if (exteriorOnly && !w.exterior) continue;
    const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
    const steps = Math.max(1, Math.ceil(len / (CELL / 2)));
    for (let i = 0; i <= steps; i++) {
      const x = w.start.x + ((w.end.x - w.start.x) * i) / steps;
      const y = w.start.y + ((w.end.y - w.start.y) * i) / steps;
      cells.add(`${Math.round(x / CELL)},${Math.round(y / CELL)}`);
    }
  }
  return cells;
}

function bounds(floor: Floor) {
  const pts = floor.walls.flatMap((w) => [w.start, w.end]);
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

function score(ref: Set<string>, mov: Set<string>, dx: number, dy: number): number {
  const ox = Math.round(dx / CELL);
  const oy = Math.round(dy / CELL);
  let hit = 0;
  for (const c of mov) {
    const [x, y] = c.split(",").map(Number);
    // Allow one cell of slack for drafting / detection noise.
    if (ref.has(`${x + ox},${y + oy}`) || ref.has(`${x + ox + 1},${y + oy}`) || ref.has(`${x + ox - 1},${y + oy}`) || ref.has(`${x + ox},${y + oy + 1}`) || ref.has(`${x + ox},${y + oy - 1}`)) hit++;
  }
  return hit / Math.max(1, Math.min(ref.size, mov.size));
}

/** Best translation (metres) that moves `floor` onto `reference`, plus its overlap score (0–1). */
export function registerFloor(reference: Floor, floor: Floor): { dx: number; dy: number; score: number } {
  if (!reference.walls.length || !floor.walls.length) return { dx: 0, dy: 0, score: 0 };
  const exteriorOnly = reference.walls.some((w) => w.exterior) && floor.walls.some((w) => w.exterior);
  const ref = occupancy(reference, exteriorOnly);
  const mov = occupancy(floor, exteriorOnly);
  const a = bounds(reference);
  const b = bounds(floor);
  const xs = [a.minX - b.minX, a.maxX - b.maxX, (a.minX + a.maxX) / 2 - (b.minX + b.maxX) / 2];
  const ys = [a.minY - b.minY, a.maxY - b.maxY, (a.minY + a.maxY) / 2 - (b.minY + b.maxY) / 2];
  let best = { dx: 0, dy: 0, score: -1 };
  for (const dx of xs) for (const dy of ys) {
    const s = score(ref, mov, dx, dy);
    if (s > best.score) best = { dx, dy, score: s };
  }
  const seed = best;
  for (let ix = -6; ix <= 6; ix++)
    for (let iy = -6; iy <= 6; iy++) {
      const dx = seed.dx + ix * CELL;
      const dy = seed.dy + iy * CELL;
      const s = score(ref, mov, dx, dy);
      if (s > best.score + 1e-9) best = { dx, dy, score: s };
    }
  return { dx: Math.round(best.dx * 100) / 100, dy: Math.round(best.dy * 100) / 100, score: Math.round(best.score * 100) / 100 };
}

export function translateFloor(floor: Floor, dx: number, dy: number): Floor {
  const t = (p: Point2D) => ({ x: Math.round((p.x + dx) * 100) / 100, y: Math.round((p.y + dy) * 100) / 100 });
  return {
    ...floor,
    walls: floor.walls.map((w) => ({ ...w, start: t(w.start), end: t(w.end) })),
    rooms: floor.rooms.map((r) => ({ ...r, polygon: r.polygon.map(t) })),
    fixtures: floor.fixtures?.map((f) => ({ ...f, x: f.x + dx, y: f.y + dy })),
    footprint: floor.footprint?.map(t),
    slabOpenings: floor.slabOpenings?.map((h) => h.map(t)),
  };
}
