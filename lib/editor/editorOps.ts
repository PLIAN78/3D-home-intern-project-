import type { DrawingCalibration, FloorPlanInterpretation } from "@/lib/models/drawing";
import type { Door, Floor, Point2D, Room, Wall, Window } from "@/lib/models/house";
import { wallLength } from "@/lib/models/house";

/**
 * Pure geometry operations for the 2D tracing editor. All functions take and
 * return plain data (immutable updates), so they are easy to test and undo.
 */

export const EXTERIOR_THICKNESS = 0.3;
export const INTERIOR_THICKNESS = 0.14;
const JOIN_TOL = 0.015;

let counter = 0;
export function newId(prefix: string) {
  counter = (counter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

export function projectOnSegment(p: Point2D, a: Point2D, b: Point2D) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const point = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, point, dist: dist(p, point), along: t * Math.sqrt(len2) };
}

export function nearestWall(floor: Floor, p: Point2D, maxDist: number) {
  let best: { wall: Wall; along: number; dist: number; point: Point2D } | null = null;
  for (const w of floor.walls) {
    const r = projectOnSegment(p, w.start, w.end);
    if (r.dist <= Math.max(maxDist, w.thickness / 2 + 0.05) && (!best || r.dist < best.dist)) best = { wall: w, along: r.along, dist: r.dist, point: r.point };
  }
  return best;
}

export interface SnapResult {
  point: Point2D;
  kind: "endpoint" | "wall" | "ortho" | "align" | "free";
}

/**
 * Snap a cursor position: existing endpoints first, then points on walls,
 * then orthogonal/aligned to the previous point; finally round to 1 cm.
 */
export function snapPoint(p: Point2D, tolerance: number, opts: { floors: Floor[]; from?: Point2D; disableSnap?: boolean; exclude?: Point2D }): SnapResult {
  if (opts.disableSnap) return { point: round2(p), kind: "free" };
  const ex = opts.exclude;
  const endpoints = opts.floors.flatMap((f) => f.walls.flatMap((w) => [w.start, w.end])).filter((e) => !ex || dist(e, ex) > JOIN_TOL);
  let best: Point2D | null = null;
  let bestD = tolerance;
  for (const e of endpoints) {
    const d = dist(e, p);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  if (best) return { point: { ...best }, kind: "endpoint" };

  let q = { ...p };
  let kind: SnapResult["kind"] = "free";
  if (opts.from) {
    const dx = p.x - opts.from.x;
    const dy = p.y - opts.from.y;
    const ang = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
    const nearH = ang < 7 || ang > 173;
    const nearV = Math.abs(ang - 90) < 7;
    if (nearH) q = { x: p.x, y: opts.from.y };
    if (nearV) q = { x: opts.from.x, y: p.y };
    if (nearH || nearV) kind = "ortho";
    // Align the free coordinate with another endpoint (inference line).
    for (const e of endpoints) {
      if (nearH && Math.abs(e.x - q.x) < tolerance) {
        q.x = e.x;
        kind = "align";
        break;
      }
      if (nearV && Math.abs(e.y - q.y) < tolerance) {
        q.y = e.y;
        kind = "align";
        break;
      }
    }
  }
  if (kind === "free") {
    const onWall = opts.floors.length ? nearestWall(opts.floors[0], p, tolerance * 0.6) : null;
    if (onWall) return { point: round2(onWall.point), kind: "wall" };
  }
  return { point: kind === "free" ? round2(q) : q, kind };
}

function round2(p: Point2D): Point2D {
  return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

export function addWall(floor: Floor, start: Point2D, end: Point2D, exterior: boolean): { floor: Floor; wall: Wall } {
  const wall: Wall = {
    id: newId("w"),
    start: { ...start },
    end: { ...end },
    thickness: exterior ? EXTERIOR_THICKNESS : INTERIOR_THICKNESS,
    height: floor.ceilingHeight,
    exterior,
  };
  return { floor: { ...floor, walls: [...floor.walls, wall] }, wall };
}

/** Move every wall endpoint coincident with `from` (keeps corners joined). */
export function moveJoinedPoint(floor: Floor, from: Point2D, to: Point2D): Floor {
  const move = (p: Point2D) => (dist(p, from) <= JOIN_TOL ? { ...to } : p);
  return { ...floor, walls: floor.walls.map((w) => ({ ...w, start: move(w.start), end: move(w.end) })) };
}

/** Translate a wall, dragging the endpoints of walls joined to it along. */
export function moveWall(original: Floor, wallId: string, dx: number, dy: number): Floor {
  const w0 = original.walls.find((w) => w.id === wallId);
  if (!w0) return original;
  let f = original;
  for (const p of [w0.start, w0.end]) f = moveJoinedPoint(f, p, { x: p.x + dx, y: p.y + dy });
  return f;
}

export function deleteElement(floor: Floor, kind: "wall" | "door" | "window" | "room", id: string): Floor {
  switch (kind) {
    case "wall":
      return { ...floor, walls: floor.walls.filter((w) => w.id !== id), doors: floor.doors.filter((d) => d.wallId !== id), windows: floor.windows.filter((w) => w.wallId !== id) };
    case "door":
      return { ...floor, doors: floor.doors.filter((d) => d.id !== id) };
    case "window":
      return { ...floor, windows: floor.windows.filter((w) => w.id !== id) };
    case "room":
      return { ...floor, rooms: floor.rooms.filter((r) => r.id !== id) };
  }
}

export function clampOpening(wall: Wall, position: number, width: number) {
  const L = wallLength(wall);
  const half = width / 2 + 0.03;
  if (L < width + 0.06) return null;
  return Math.max(half, Math.min(L - half, position));
}

export function addOpening(floor: Floor, kind: "door" | "window", wall: Wall, along: number): { floor: Floor; id: string } | null {
  if (kind === "door") {
    const width = wall.exterior ? 0.91 : 0.81;
    const position = clampOpening(wall, along, width);
    if (position === null) return null;
    const door: Door = { id: newId("d"), wallId: wall.id, position, width, height: 2.03, kind: wall.exterior ? "exterior" : "interior" };
    return { floor: { ...floor, doors: [...floor.doors, door] }, id: door.id };
  }
  const width = 1.2;
  const position = clampOpening(wall, along, width);
  if (position === null) return null;
  const win: Window = { id: newId("win"), wallId: wall.id, position, width, height: 1.4, sillHeight: 0.8 };
  return { floor: { ...floor, windows: [...floor.windows, win] }, id: win.id };
}

export function addRoom(floor: Floor, polygon: Point2D[]): { floor: Floor; room: Room } {
  const room: Room = { id: newId("r"), name: `Room ${floor.rooms.length + 1}`, polygon: polygon.map((p) => ({ ...p })), finish: "main" };
  return { floor: { ...floor, rooms: [...floor.rooms, room] }, room };
}

/** Scale all plan geometry about the origin (after a scale re-calibration). */
export function scaleFloor(floor: Floor, k: number): Floor {
  const s = (p: Point2D) => ({ x: p.x * k, y: p.y * k });
  return {
    ...floor,
    walls: floor.walls.map((w) => ({ ...w, start: s(w.start), end: s(w.end) })),
    doors: floor.doors.map((d) => ({ ...d, position: d.position * k })),
    windows: floor.windows.map((w) => ({ ...w, position: w.position * k })),
    rooms: floor.rooms.map((r) => ({ ...r, polygon: r.polygon.map(s) })),
    fixtures: floor.fixtures?.map((f) => ({ ...f, x: f.x * k, y: f.y * k, width: f.width * k, depth: f.depth * k })),
    footprint: undefined,
    slabOpenings: floor.slabOpenings?.map((h) => h.map(s)),
  };
}

export function markAllVerified(floor: Floor): Floor {
  const v = <T extends { unverified?: boolean }>(x: T): T => {
    const { unverified: _u, ...rest } = x;
    void _u;
    return rest as T;
  };
  return { ...floor, walls: floor.walls.map(v), doors: floor.doors.map(v), windows: floor.windows.map(v), rooms: floor.rooms.map(v) };
}

export function countUnverified(floor: Floor) {
  return [...floor.walls, ...floor.doors, ...floor.windows, ...floor.rooms].filter((e) => e.unverified).length;
}

// ---------------------------------------------------------------------------
// Calibration + interpretation import
// ---------------------------------------------------------------------------

export function pxToPlan(c: DrawingCalibration, p: { x: number; y: number }): Point2D {
  return { x: (p.x - c.originPx.x) * c.metresPerPixel, y: (p.y - c.originPx.y) * c.metresPerPixel };
}

export function planToPx(c: DrawingCalibration, p: Point2D) {
  return { x: p.x / c.metresPerPixel + c.originPx.x, y: p.y / c.metresPerPixel + c.originPx.y };
}

/**
 * Convert an interpreter result (pixels) into editable floor geometry (metres).
 * Every imported element is flagged `unverified` until a person reviews it.
 */
export function importInterpretation(floor: Floor, interp: FloorPlanInterpretation, c: DrawingCalibration, mode: "replace" | "append"): Floor {
  const base: Floor = mode === "replace" ? { ...floor, walls: [], doors: [], windows: [], rooms: [], footprint: undefined } : floor;
  const walls: Wall[] = interp.walls.map((w) => ({
    id: newId("w"),
    start: round2(pxToPlan(c, w.start)),
    end: round2(pxToPlan(c, w.end)),
    // Detected thickness in px is unreliable; use standard assemblies.
    thickness: w.exterior ? EXTERIOR_THICKNESS : INTERIOR_THICKNESS,
    height: floor.ceilingHeight,
    exterior: !!w.exterior,
    unverified: true,
  }));
  const m = c.metresPerPixel;
  const doors: Door[] = [];
  const windows: Window[] = [];
  for (const o of [...interp.doors, ...interp.windows]) {
    const wall = walls[o.wallIndex];
    if (!wall) continue;
    if (o.kind === "door") {
      const width = Math.max(0.6, Math.min(5.5, o.widthPx * m));
      const garage = !!wall.exterior && width > 3.2;
      const position = clampOpening(wall, o.positionPx * m, width);
      if (position === null) continue;
      doors.push({ id: newId("d"), wallId: wall.id, position, width, height: garage ? 2.13 : 2.03, kind: garage ? "garage" : wall.exterior ? "exterior" : "interior", unverified: true });
    } else {
      const width = Math.max(0.4, Math.min(3.5, o.widthPx * m));
      const position = clampOpening(wall, o.positionPx * m, width);
      if (position === null) continue;
      windows.push({ id: newId("win"), wallId: wall.id, position, width, height: 1.4, sillHeight: 0.8, unverified: true });
    }
  }
  const rooms: Room[] = interp.rooms.map((r) => ({ id: newId("r"), name: r.name, polygon: r.polygon.map((p) => round2(pxToPlan(c, p))), finish: "main", unverified: true }));
  return { ...base, walls: [...base.walls, ...walls], doors: [...base.doors, ...doors], windows: [...base.windows, ...windows], rooms: [...base.rooms, ...rooms] };
}

/**
 * Classify walls as exterior when exactly one side opens to the outside.
 * "Outside" = from a probe point just off the wall, at least one of four
 * axis rays escapes without hitting another wall.
 */
export function autoClassifyExterior(floor: Floor): Floor {
  const segs = floor.walls;
  // Probes sit beyond the wall thickness, so the wall itself is a valid blocker
  // (the inside probe's ray back toward it must not "escape").
  const hitsWall = (o: Point2D, d: Point2D) =>
    segs.some((w) => {
      // Ray/segment intersection
      const ex = w.end.x - w.start.x;
      const ey = w.end.y - w.start.y;
      const den = d.x * ey - d.y * ex;
      if (Math.abs(den) < 1e-9) return false;
      const t = ((w.start.x - o.x) * ey - (w.start.y - o.y) * ex) / den;
      const u = ((w.start.x - o.x) * d.y - (w.start.y - o.y) * d.x) / den;
      return t > 0 && u >= -0.02 && u <= 1.02;
    });
  const escapes = (p: Point2D) => [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }].some((d) => !hitsWall(p, d));
  return {
    ...floor,
    walls: floor.walls.map((w) => {
      const L = wallLength(w) || 1;
      const nx = -(w.end.y - w.start.y) / L;
      const ny = (w.end.x - w.start.x) / L;
      const mid = { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 };
      const off = w.thickness / 2 + 0.25;
      const a = escapes({ x: mid.x + nx * off, y: mid.y + ny * off });
      const b = escapes({ x: mid.x - nx * off, y: mid.y - ny * off });
      const exterior = a !== b;
      if (exterior === !!w.exterior) return w;
      return { ...w, exterior, thickness: exterior ? EXTERIOR_THICKNESS : INTERIOR_THICKNESS, cladding: exterior ? w.cladding : undefined };
    }),
  };
}

export function floorBounds(floors: Floor[]) {
  const pts = floors.flatMap((f) => [...f.walls.flatMap((w) => [w.start, w.end]), ...f.rooms.flatMap((r) => r.polygon)]);
  if (!pts.length) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

/** Parse "12.5", "12.5m", "41'", "41' 6\"", "41-6" (feet-inches) into metres. */
export function parseLength(input: string, unit: "m" | "ft"): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const ftIn = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inches)?)?$/);
  if (ftIn) return (Number(ftIn[1]) * 12 + Number(ftIn[2] ?? 0)) * 0.0254;
  const dash = s.match(/^(\d+)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (dash && unit === "ft") return (Number(dash[1]) * 12 + Number(dash[2])) * 0.0254;
  const metres = s.match(/^(\d+(?:\.\d+)?)\s*(m|mm|cm)?$/);
  if (metres) {
    const v = Number(metres[1]);
    if (metres[2] === "mm") return v / 1000;
    if (metres[2] === "cm") return v / 100;
    if (metres[2] === "m") return v;
    return unit === "ft" ? v * 0.3048 : v;
  }
  return null;
}

export function formatLength(m: number) {
  const inches = Math.round(m * 39.3701);
  return `${m.toFixed(2)} m · ${Math.floor(inches / 12)}′-${inches % 12}″`;
}
