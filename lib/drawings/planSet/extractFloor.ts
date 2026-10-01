import type { FloorPlanInterpretation, InterpretedWall } from "@/lib/models/drawing";
import type { Floor, Room, RoomFinish } from "@/lib/models/house";
import { autoClassifyExterior, importInterpretation, newId } from "@/lib/editor/editorOps";
import { detectWalls, type GreyImage } from "../interpreters/lineDetection";
import { isRoomDimension, parseRoomDimension, type PageText } from "./classify";

/**
 * Turn one plan sheet into a Floor in metres, fully automatically:
 *  1. detect walls/openings (raster line detection)
 *  2. keep only the main drawing (largest connected wall cluster) — drops
 *     sheet borders and small option insets
 *  3. derive scale from room dimension labels (e.g. 18'6"x13'8") by measuring
 *     the clear span between walls around each label
 *  4. build rooms from labels, classify exterior walls, type garage/front doors
 */

export type ScaleSource = "room-dimensions" | "inherited" | "wall-thickness";

export interface ExtractedFloor {
  floor: Floor;
  metresPerPixel: number;
  scaleSource: ScaleSource;
  /** Agreement between room-dimension estimates (0–1), when available. */
  scaleConsistency: number | null;
  /** Main drawing bounds in pixels and the median wall thickness in px. */
  boundsPx: { minX: number; minY: number; maxX: number; maxY: number };
  wallThicknessPx: number;
  confidence: number;
  warnings: string[];
}

type W = InterpretedWall & { axis: "h" | "v"; c: number; a0: number; a1: number };

function asAxis(w: InterpretedWall): W {
  const h = Math.abs(w.end.y - w.start.y) < Math.abs(w.end.x - w.start.x);
  return h
    ? { ...w, axis: "h", c: (w.start.y + w.end.y) / 2, a0: Math.min(w.start.x, w.end.x), a1: Math.max(w.start.x, w.end.x) }
    : { ...w, axis: "v", c: (w.start.x + w.end.x) / 2, a0: Math.min(w.start.y, w.end.y), a1: Math.max(w.start.y, w.end.y) };
}

function rectOf(w: W, pad: number) {
  const t = w.thicknessPx / 2 + pad;
  return w.axis === "h" ? { x0: w.a0 - pad, x1: w.a1 + pad, y0: w.c - t, y1: w.c + t } : { x0: w.c - t, x1: w.c + t, y0: w.a0 - pad, y1: w.a1 + pad };
}

export interface ClusterContext {
  pageWidth: number;
  pageHeight: number;
  /** Points known to lie inside the plan (e.g. room labels / room dimensions). */
  anchors: { x: number; y: number }[];
}

/**
 * Indices of the walls forming the main plan drawing: connected clusters are
 * scored by length, boosted by how many room labels they enclose; clusters
 * that look like the sheet border or title block are rejected.
 */
export function mainCluster(walls: InterpretedWall[], ctx?: ClusterContext): number[] {
  const ws = walls.map(asAxis);
  const parent = ws.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < ws.length; i++) {
    const a = rectOf(ws[i], 4);
    for (let j = i + 1; j < ws.length; j++) {
      const b = rectOf(ws[j], 4);
      if (a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1) parent[find(i)] = find(j);
    }
  }
  const clusters = new Map<number, { len: number; minX: number; minY: number; maxX: number; maxY: number }>();
  ws.forEach((w, i) => {
    const r = rectOf(w, 0);
    const c = clusters.get(find(i)) ?? { len: 0, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    c.len += w.a1 - w.a0;
    c.minX = Math.min(c.minX, r.x0);
    c.minY = Math.min(c.minY, r.y0);
    c.maxX = Math.max(c.maxX, r.x1);
    c.maxY = Math.max(c.maxY, r.y1);
    clusters.set(find(i), c);
  });
  // One drawing often splits into several wall clusters that only meet at door
  // gaps or thin walls (e.g. house and garage). Fragments of the same drawing
  // interleave, so clusters whose bounding boxes overlap are merged; separate
  // drawings (option insets, alternates) sit apart on the sheet.
  const biggest = Math.max(0, ...[...clusters.values()].map((c) => c.len));
  for (let changed = true; changed; ) {
    changed = false;
    const roots = [...clusters.keys()];
    for (let i = 0; i < roots.length && !changed; i++) {
      for (let j = i + 1; j < roots.length && !changed; j++) {
        const a = clusters.get(roots[i])!;
        const b = clusters.get(roots[j])!;
        if (Math.min(a.len, b.len) < biggest * 0.08) continue;
        const ix = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const iy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
        if (ix <= 0 || iy <= 0) continue;
        // Require a real overlap, not just touching corners.
        const smaller = Math.min((a.maxX - a.minX) * (a.maxY - a.minY), (b.maxX - b.minX) * (b.maxY - b.minY));
        if (ix * iy < smaller * 0.05) continue;
        parent[find(roots[j])] = find(roots[i]);
        clusters.set(roots[i], { len: a.len + b.len, minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) });
        clusters.delete(roots[j]);
        changed = true;
      }
    }
  }

  let best = -1;
  let bestScore = -1;
  for (const [root, c] of clusters) {
    let score = c.len;
    if (ctx) {
      const spansSheet = c.maxX - c.minX > ctx.pageWidth * 0.85 || c.maxY - c.minY > ctx.pageHeight * 0.85;
      const inTitleBlock = c.minY > ctx.pageHeight * 0.8;
      if (spansSheet || inTitleBlock) continue;
      const inside = ctx.anchors.filter((a) => a.x >= c.minX && a.x <= c.maxX && a.y >= c.minY && a.y <= c.maxY).length;
      score *= 1 + inside;
    }
    if (score > bestScore) [best, bestScore] = [root, score];
  }
  return ws.map((_, i) => i).filter((i) => find(i) === best);
}

const CAPTION_RE = /\bPLAN\b/i;
const CAPTION_LEVEL_RE = /\b(FLOOR|BASEMENT|LOWER|UPPER|SECOND|GROUND|MAIN|ATTIC|LOFT|THIRD)\b/i;
// Add-on alternates drawn beside a plan ("… w/ SIDE UPGRADE", "… w/ ALT. PORCH"). "OPT." is not one:
// on an option sheet it names the sheet's own subject.
const ALTERNATE_RE = /\bw\/|\bWITH\b|UPGRADE|\bALT\b|\bALT\.|ALTERNATE/i;

/**
 * Sheets sometimes draw an alternate (e.g. "… PLAN w/ SIDE UPGRADE") right
 * against the standard plan, sharing a wall line, so both end up in one wall
 * cluster. Each drawing has its own caption underneath; when the cluster has
 * a standard caption and an alternate caption side by side, cut the cluster at
 * the full-height wall between them and keep the standard side.
 */
export function splitAdjacentDrawings(walls: InterpretedWall[], text: PageText): { walls: InterpretedWall[]; dropped: string | null } {
  if (walls.length < 4) return { walls, dropped: null };
  const ws = walls.map(asAxis);
  const minX = Math.min(...ws.map((w) => (w.axis === "h" ? w.a0 : w.c)));
  const maxX = Math.max(...ws.map((w) => (w.axis === "h" ? w.a1 : w.c)));
  const minY = Math.min(...ws.map((w) => (w.axis === "v" ? w.a0 : w.c)));
  const maxY = Math.max(...ws.map((w) => (w.axis === "v" ? w.a1 : w.c)));
  const width = maxX - minX;
  const height = maxY - minY;

  // Caption lines just below the drawing, then whole caption blocks around them.
  const near = text.items.filter((t) => t.y > maxY - height * 0.05 && t.y < maxY + text.height * 0.2 && t.x + t.w > minX - width * 0.1 && t.x < maxX + width * 0.1);
  // "… FLOOR PLAN" on standard sheets, "SECOND FLOOR OPT. SPA ENSUITE" on option sheets.
  const heads = near.filter((t) => CAPTION_LEVEL_RE.test(t.str) && (CAPTION_RE.test(t.str) || /\bOPT\b|\bOPTION\b/i.test(t.str)));
  const blocks: { x0: number; x1: number; text: string }[] = [];
  for (const h of heads) {
    // A caption block: a code / "ELEVATION X" line above, a qualifier ("w/ …") line below.
    // Caption lines are left-aligned with each other.
    const members = near.filter((t) => t.y > h.y - h.h * 3.5 && t.y < h.y + h.h * 2.2 && Math.abs(t.x - h.x) < h.h * 2);
    const x0 = Math.min(...members.map((t) => t.x));
    const x1 = Math.max(...members.map((t) => t.x + t.w));
    if (blocks.some((b) => Math.abs((b.x0 + b.x1) / 2 - (x0 + x1) / 2) < width * 0.1)) continue;
    blocks.push({ x0, x1, text: members.map((t) => t.str).join(" ") });
  }
  if (blocks.length < 2) return { walls, dropped: null };
  // The main drawing's caption has the fewest add-on qualifiers (an option's own name
  // may contain one, e.g. "PRIMARY RETREAT W/ DELUXE LAUNDRY"; its add-on adds "w/ SIDE UPGRADE").
  const addOns = (b: { text: string }) => (b.text.match(new RegExp(ALTERNATE_RE.source, "gi")) ?? []).length;
  const fewest = Math.min(...blocks.map(addOns));
  const standard = blocks.filter((b) => addOns(b) === fewest);
  if (standard.length !== 1) return { walls, dropped: null };
  const main = standard[0];
  // Captions start at (or just inside) their drawing's left edge; their widths vary
  // with the option name, so compare left edges rather than centres.
  const mc = main.x0;
  const others = blocks.filter((b) => b !== main);
  // The nearest alternate beside it decides the cut.
  const other = others.sort((a, b) => Math.abs(a.x0 - mc) - Math.abs(b.x0 - mc))[0];
  const oc = other.x0;
  if (Math.abs(oc - mc) < width * 0.2) return { walls, dropped: null };
  const lo = Math.min(mc, oc);
  const hi = Math.max(mc, oc);
  const cuts = ws.filter((w) => w.axis === "v" && w.a1 - w.a0 >= height * 0.8 && w.c > lo && w.c < hi);
  if (!cuts.length) return { walls, dropped: null };
  const cut = cuts.sort((a, b) => Math.abs(a.c - (lo + hi) / 2) - Math.abs(b.c - (lo + hi) / 2))[0].c;
  const keepRight = mc > cut;
  const out: InterpretedWall[] = [];
  for (const w of ws) {
    const { axis, c, a0, a1, ...wall } = w;
    if (axis === "v") {
      if (keepRight ? c >= cut - 1 : c <= cut + 1) out.push(wall);
      continue;
    }
    const s = keepRight ? Math.max(a0, cut) : a0;
    const e = keepRight ? a1 : Math.min(a1, cut);
    if (e - s < 8) continue;
    const forward = wall.end.x >= wall.start.x;
    out.push({ ...wall, start: { x: forward ? s : e, y: wall.start.y }, end: { x: forward ? e : s, y: wall.end.y } });
  }
  return { walls: out, dropped: other.text.replace(/\s+/g, " ").trim() };
}

/** Text likely to sit inside the plan: room dimensions and mid-sized labels outside notes/title areas. */
export function planAnchors(text: PageText): { x: number; y: number }[] {
  const dims = text.items.filter((t) => isRoomDimension(t.str));
  const dimH = dims.length ? dims.map((d) => d.h).sort((a, b) => a - b)[Math.floor(dims.length / 2)] : text.height * 0.005;
  const labels = text.items.filter(
    (t) => t.y > text.height * 0.18 && t.y < text.height * 0.8 && t.h > dimH * 1.3 && t.h < dimH * 3 && /^[A-Z][A-Z .&/'-]{2,28}$/.test(t.str.trim()) && !NOT_ROOMS.test(t.str),
  );
  return [...dims, ...labels].map((t) => ({ x: t.x + t.w / 2, y: t.y - t.h / 2 }));
}

interface Hit {
  wall: W;
  dist: number;
}

/** Nearest wall hit from a point along an axis direction. */
function cast(ws: W[], x: number, y: number, dir: "l" | "r" | "u" | "d"): Hit | null {
  let best: Hit | null = null;
  for (const w of ws) {
    if (dir === "l" || dir === "r") {
      if (w.axis !== "v" || y < w.a0 - 2 || y > w.a1 + 2) continue;
      const d = dir === "l" ? x - w.c : w.c - x;
      if (d > w.thicknessPx / 2 && (!best || d < best.dist)) best = { wall: w, dist: d };
    } else {
      if (w.axis !== "h" || x < w.a0 - 2 || x > w.a1 + 2) continue;
      const d = dir === "u" ? y - w.c : w.c - y;
      if (d > w.thicknessPx / 2 && (!best || d < best.dist)) best = { wall: w, dist: d };
    }
  }
  return best;
}

interface Label {
  name: string;
  x: number;
  y: number;
  dims: [number, number] | null;
}

const ROOM_WORDS =
  /^(?!.*\b(LOW|SLOPED|MAY VARY|IF|PUMP|TO BE|UNEX)\b).*\b(ROOM|BED(ROOM)?|BATH|ENS(UITE)?|KITCHEN|DINING|GREAT|FAMILY|LIVING|DEN|OFFICE|STUDY|FOYER|ENTRY|GARAGE|LAUNDRY|LAUN|PWD|POWDER|CLOSET|W\.?I\.?C|PANTRY|MUD|REC|BASEMENT|STORAGE|MECH(ANICAL)?|UTILITY|COLD|CELLAR|LOFT|PORCH|HALL|NOOK|BREAKFAST|MEDIA|GYM|LIBRARY|FLEX|PRIMARY|MASTER)\b/i;

const NOT_ROOMS =/\b(OPT|ELEVATION|PLAN|FIREPLACE|SINK|STEPS|REQ|SCHEDULE|FLOORING|KNEEWALL|LEDGE|UPPERS|USB|BAR|WINDOWS?|DECK|GRADE|NOTES?|SKETCH|LOT|DN|UP)\b/i;

/** Room labels: short uppercase text, larger than the dimension text, usually with a dimension right below. */
export function findRoomLabels(text: PageText, bounds: { minX: number; minY: number; maxX: number; maxY: number }): Label[] {
  const inside = (t: { x: number; y: number }) => t.x >= bounds.minX && t.x <= bounds.maxX && t.y >= bounds.minY && t.y <= bounds.maxY;
  const dims = text.items.filter((t) => isRoomDimension(t.str) && inside(t));
  const dimH = dims.length ? dims.map((d) => d.h).sort((a, b) => a - b)[Math.floor(dims.length / 2)] : null;
  const labels: Label[] = [];
  for (const t of text.items) {
    const s = t.str.trim();
    if (!inside(t) || !/^[A-Z][A-Z0-9 .&/'-]{1,28}$/.test(s) || NOT_ROOMS.test(s) || isRoomDimension(s)) continue;
    if (dimH && (t.h < dimH * 1.3 || t.h > dimH * 3)) continue;
    const cx = t.x + t.w / 2;
    // Dimension label directly beneath (within ~2 line heights, horizontally overlapping)
    const below = dims.find((d) => d.y > t.y && d.y - t.y < t.h * 2.2 && Math.abs(d.x + d.w / 2 - cx) < Math.max(t.h * 4, t.w));
    // Without a dimension underneath, only accept recognisable room names (notes like
    // "LOW HEADROOM" or "SUMP PUMP" sit inside plans too).
    if (!below && !ROOM_WORDS.test(s)) continue;
    labels.push({ name: s, x: cx, y: t.y - t.h / 2, dims: below ? parseRoomDimension(below.str) : null });
  }
  return labels;
}

/**
 * Open-concept spaces (kitchen + great room…) have no wall between them, so
 * several labels produce the same rectangle. Split such a rectangle between
 * its labels along the axis that separates them, at the label midpoints.
 */
function splitSharedRooms(rooms: Room[], labels: Label[], bounds: { minX: number; minY: number }, mpp: number): Room[] {
  const key = (r: Room) => r.polygon.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("|");
  const groups = new Map<string, Room[]>();
  for (const r of rooms) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  const labelAt = (r: Room) => labels.find((l) => pretty(l.name) === r.name);
  const out: Room[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const [x0, y0] = [group[0].polygon[0].x, group[0].polygon[0].y];
    const [x1, y1] = [group[0].polygon[2].x, group[0].polygon[2].y];
    const pts = group.map((r) => {
      const l = labelAt(r);
      return { r, x: l ? (l.x - bounds.minX) * mpp : (x0 + x1) / 2, y: l ? (l.y - bounds.minY) * mpp : (y0 + y1) / 2 };
    });
    const spreadX = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    const spreadY = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
    const alongX = spreadX >= spreadY;
    pts.sort((a, b) => (alongX ? a.x - b.x : a.y - b.y));
    const cuts = pts.slice(1).map((p, i) => Math.round(((alongX ? pts[i].x + p.x : pts[i].y + p.y) / 2) * 100) / 100);
    pts.forEach((p, i) => {
      const lo = i === 0 ? (alongX ? x0 : y0) : cuts[i - 1];
      const hi = i === pts.length - 1 ? (alongX ? x1 : y1) : cuts[i];
      const poly = alongX
        ? [{ x: lo, y: y0 }, { x: hi, y: y0 }, { x: hi, y: y1 }, { x: lo, y: y1 }]
        : [{ x: x0, y: lo }, { x: x1, y: lo }, { x: x1, y: hi }, { x: x0, y: hi }];
      out.push({ ...p.r, polygon: poly });
    });
  }
  return out;
}

/** Centre of an opening in plan coordinates. */
function openingPoint(w: Floor["walls"][number], position: number) {
  const L = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) || 1;
  return { x: w.start.x + ((w.end.x - w.start.x) * position) / L, y: w.start.y + ((w.end.y - w.start.y) * position) / L };
}

function nearRoomEdge(p: { x: number; y: number }, r: Room, tol: number) {
  const x0 = Math.min(...r.polygon.map((q) => q.x));
  const x1 = Math.max(...r.polygon.map((q) => q.x));
  const y0 = Math.min(...r.polygon.map((q) => q.y));
  const y1 = Math.max(...r.polygon.map((q) => q.y));
  const inX = p.x >= x0 - tol && p.x <= x1 + tol;
  const inY = p.y >= y0 - tol && p.y <= y1 + tol;
  return inX && inY && (Math.abs(p.x - x0) < tol || Math.abs(p.x - x1) < tol || Math.abs(p.y - y0) < tol || Math.abs(p.y - y1) < tol);
}

/**
 * Use room labels to type exterior openings: a wide opening on the garage's
 * exterior wall is the garage door (its outline often makes it look like a
 * window), and a door-sized opening on the foyer/porch exterior wall is the
 * front door.
 */
function assignEntryDoors(floor: Floor, labels: { name: string; x: number; y: number }[]): Floor {
  const wallById = new Map(floor.walls.map((w) => [w.id, w]));
  const garage = floor.rooms.find((r) => /garage/i.test(r.name));
  const garageLabel = labels.find((l) => /GARAGE/i.test(l.name));
  const entry = floor.rooms.filter((r) => /foyer|porch|entry|vestibule/i.test(r.name));
  const entryLabels = labels.filter((l) => /FOYER|PORCH|ENTRY|VESTIBULE/i.test(l.name));
  const near = (o: { wallId: string; position: number }, pts: { x: number; y: number }[], max: number) => {
    const w = wallById.get(o.wallId);
    if (!w) return Infinity;
    const p = openingPoint(w, o.position);
    return Math.min(max, ...pts.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
  };
  let doors = [...floor.doors];
  let windows = [...floor.windows];

  if ((garage || garageLabel) && !doors.some((d) => d.kind === "garage")) {
    const all = [...doors, ...windows];
    const cand = all
      .filter((o) => o.width >= 2.2 && wallById.get(o.wallId)?.exterior)
      .filter((o) => (garage ? nearRoomEdge(openingPoint(wallById.get(o.wallId)!, o.position), garage, 0.6) : near(o, [garageLabel!], 99) < 7))
      .sort((a, b) => b.width - a.width)[0];
    if (cand) {
      windows = windows.filter((w) => w.id !== cand.id);
      doors = doors.filter((d) => d.id !== cand.id);
      doors.push({ id: cand.id, wallId: cand.wallId, position: cand.position, width: cand.width, height: 2.13, kind: "garage", unverified: true });
    }
  }

  if ((entry.length || entryLabels.length) && !doors.some((d) => d.kind === "front")) {
    const onEntry = (o: { wallId: string; position: number }) => {
      const w = wallById.get(o.wallId);
      if (!w?.exterior) return false;
      if (entry.length) return entry.some((r) => nearRoomEdge(openingPoint(w, o.position), r, 0.6));
      return near(o, entryLabels, 99) < 3;
    };
    const door = doors.find((d) => d.kind !== "garage" && d.width >= 0.7 && d.width <= 1.5 && onEntry(d));
    const win = !door ? windows.find((w) => w.width >= 0.7 && w.width <= 1.3 && onEntry(w)) : undefined;
    if (door) doors = doors.map((d) => (d === door ? { ...d, kind: "front", height: 2.3 } : d));
    else if (win) {
      windows = windows.filter((w) => w !== win);
      doors.push({ id: win.id, wallId: win.wallId, position: win.position, width: win.width, height: 2.3, kind: "front", unverified: true });
    }
  }
  return { ...floor, doors, windows };
}

function finishFor(name: string, basement: boolean): RoomFinish {
  const n = name.toUpperCase();
  if (/GARAGE/.test(n)) return "garage";
  if (/PWD|POWDER|BATH|ENS|W\.?C|LAUNDRY|LAUN|MUD|FOYER|ENTRY|VESTIBULE/.test(n)) return "tile";
  if (basement && /UNFINISHED|BASEMENT|MECH|COLD|STORAGE|UTILITY/.test(n)) return "concrete";
  return "main";
}

const pretty = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/^Pwd\.?$/, "Powder Room")
    .replace(/\bEns\.?\b/, "Ensuite")
    .replace(/\bW\.?I\.?C\.?\b/, "Walk-in Closet")
    .replace(/\bBed ?(\d)/, "Bedroom $1")
    .replace(/[.\s]+$/, "");

/** Clip walls (and their openings) to the bounding box of a reference wall set. */
function clipDetection(det: ReturnType<typeof detectWalls>, reference: InterpretedWall[]): ReturnType<typeof detectWalls> {
  if (!reference.length) return det;
  const pad = Math.max(...reference.map((w) => w.thicknessPx));
  const xs = reference.flatMap((w) => [w.start.x, w.end.x]);
  const ys = reference.flatMap((w) => [w.start.y, w.end.y]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  const walls: InterpretedWall[] = [];
  const remap = new Map<number, { index: number; shift: number; length: number }>();
  det.walls.forEach((w, i) => {
    const horizontal = Math.abs(w.end.y - w.start.y) < Math.abs(w.end.x - w.start.x);
    const c = horizontal ? (w.start.y + w.end.y) / 2 : (w.start.x + w.end.x) / 2;
    if (horizontal ? c < y0 || c > y1 : c < x0 || c > x1) return;
    const [lo, hi] = horizontal ? [x0, x1] : [y0, y1];
    const s = horizontal ? w.start.x : w.start.y;
    const e = horizontal ? w.end.x : w.end.y;
    const forward = e >= s;
    const a = Math.max(lo, Math.min(s, e));
    const b = Math.min(hi, Math.max(s, e));
    if (b - a < 8) return;
    const start = forward ? a : b;
    const end = forward ? b : a;
    remap.set(i, { index: walls.length, shift: Math.abs(start - s), length: b - a });
    walls.push(horizontal ? { ...w, start: { x: start, y: w.start.y }, end: { x: end, y: w.end.y } } : { ...w, start: { x: w.start.x, y: start }, end: { x: w.end.x, y: end } });
  });
  const mapOpenings = (list: typeof det.doors) =>
    list.flatMap((o) => {
      const m = remap.get(o.wallIndex);
      if (!m) return [];
      const pos = o.positionPx - m.shift;
      return pos - o.widthPx / 2 < 0 || pos + o.widthPx / 2 > m.length ? [] : [{ ...o, wallIndex: m.index, positionPx: pos }];
    });
  return { ...det, walls, doors: mapOpenings(det.doors), windows: mapOpenings(det.windows) };
}

/**
 * A wall that runs on past the outermost wall it crosses, into empty space,
 * has usually been bridged across a small gap into a neighbouring inset (or
 * picked up a leader line). Trim such ends back to that outermost crossing
 * wall. Edits `det` in place (walls and their openings).
 */
function trimOvershoots(det: ReturnType<typeof detectWalls>, keep: number[]) {
  const ws = keep.map((i) => ({ i, w: asAxis(det.walls[i]) }));
  for (const { i, w } of ws) {
    const t = Math.max(4, w.thicknessPx);
    const crossing = ws.filter((o) => o.w.axis !== w.axis && o.w.a0 - t <= w.c && o.w.a1 + t >= w.c && o.w.c >= w.a0 - t && o.w.c <= w.a1 + t);
    if (crossing.length < 2) continue;
    const cs = crossing.map((o) => o.w.c);
    let lo = w.a0;
    let hi = w.a1;
    const minC = Math.min(...cs);
    const maxC = Math.max(...cs);
    // Anything else of the drawing beyond that end (parallel walls) means the extension is real.
    const occupied = (from: number, to: number) => ws.some((o) => o.i !== i && o.w.axis === w.axis && o.w.a1 > from && o.w.a0 < to);
    if (hi - maxC > t * 3 && !occupied(maxC + t, hi)) hi = maxC + w.thicknessPx / 2;
    if (minC - lo > t * 3 && !occupied(lo, minC - t)) lo = minC - w.thicknessPx / 2;
    if (lo === w.a0 && hi === w.a1) continue;
    const wall = det.walls[i];
    const forward = w.axis === "h" ? wall.end.x >= wall.start.x : wall.end.y >= wall.start.y;
    const start = forward ? lo : hi;
    const end = forward ? hi : lo;
    const shift = Math.abs(start - (w.axis === "h" ? wall.start.x : wall.start.y));
    const length = hi - lo;
    det.walls[i] = w.axis === "h" ? { ...wall, start: { x: start, y: wall.start.y }, end: { x: end, y: wall.end.y } } : { ...wall, start: { x: wall.start.x, y: start }, end: { x: wall.end.x, y: end } };
    const fix = (list: typeof det.doors) => list.filter((o) => o.wallIndex !== i || ((o.positionPx -= shift), o.positionPx - o.widthPx / 2 >= 0 && o.positionPx + o.widthPx / 2 <= length));
    det.doors = fix(det.doors);
    det.windows = fix(det.windows);
  }
}

export interface ScaleVote {
  metresPerPixel: number;
  weight: number;
}

/**
 * Each room dimension label votes for a scale. A room whose two measured
 * spans agree with its two dimensions casts a strong vote; a room where only
 * one span is reliable (open-concept spaces, door gaps) casts weak votes for
 * both possible readings — the consensus sorts it out.
 */
export function collectScaleVotes(ws: W[], labels: Label[]): ScaleVote[] {
  const votes: ScaleVote[] = [];
  for (const l of labels) {
    if (!l.dims) continue;
    const L = cast(ws, l.x, l.y, "l");
    const R = cast(ws, l.x, l.y, "r");
    const U = cast(ws, l.x, l.y, "u");
    const D = cast(ws, l.x, l.y, "d");
    // Clear (inside-face) spans, which is what room dimensions describe.
    const wPx = L && R ? R.wall.c - R.wall.thicknessPx / 2 - (L.wall.c + L.wall.thicknessPx / 2) : 0;
    const hPx = U && D ? D.wall.c - D.wall.thicknessPx / 2 - (U.wall.c + U.wall.thicknessPx / 2) : 0;
    const [a, b] = l.dims;
    if (wPx > 0 && hPx > 0) {
      const agree = (p: number, q: number) => Math.abs(p - q) / ((p + q) / 2);
      const h1 = agree(a / wPx, b / hPx);
      const h2 = agree(b / wPx, a / hPx);
      if (Math.min(h1, h2) < 0.08) {
        votes.push({ metresPerPixel: h1 <= h2 ? (a / wPx + b / hPx) / 2 : (b / wPx + a / hPx) / 2, weight: 3 });
        continue;
      }
    }
    for (const span of [wPx, hPx]) if (span > 0) votes.push({ metresPerPixel: a / span, weight: 0.5 }, { metresPerPixel: b / span, weight: 0.5 });
  }
  return votes;
}

/** Weighted mode of scale votes (±4% window). */
export function consensusScale(votes: ScaleVote[]): { metresPerPixel: number; support: number; consistency: number } | null {
  if (!votes.length) return null;
  let best: { centre: number; support: number } | null = null;
  for (const v of votes) {
    const support = votes.filter((u) => Math.abs(u.metresPerPixel - v.metresPerPixel) / v.metresPerPixel < 0.04).reduce((s, u) => s + u.weight, 0);
    if (!best || support > best.support) best = { centre: v.metresPerPixel, support };
  }
  const members = votes.filter((u) => Math.abs(u.metresPerPixel - best!.centre) / best!.centre < 0.04);
  const w = members.reduce((s, u) => s + u.weight, 0);
  const mpp = members.reduce((s, u) => s + u.metresPerPixel * u.weight, 0) / w;
  const total = votes.reduce((s, u) => s + u.weight, 0);
  return { metresPerPixel: mpp, support: best!.support, consistency: Math.round((best!.support / total) * 100) / 100 };
}

/** First pass for drawing sets: the sheet's scale votes (and its main-drawing size). */
export function measureSheet(img: GreyImage, text: PageText): { votes: ScaleVote[]; wallThicknessPx: number; mainWalls: InterpretedWall[] } {
  const det = detectWalls(img);
  const keep = mainCluster(det.walls, { pageWidth: img.width, pageHeight: img.height, anchors: planAnchors(text) });
  const walls = keep.map((i) => det.walls[i]);
  const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
  if (!xs.length) return { votes: [], wallThicknessPx: 0, mainWalls: [] };
  const b = { minX: Math.min(...xs) - 5, minY: Math.min(...ys) - 5, maxX: Math.max(...xs) + 5, maxY: Math.max(...ys) + 5 };
  const t = walls.map((w) => w.thicknessPx).sort((p, q) => p - q);
  return { votes: collectScaleVotes(walls.map(asAxis), findRoomLabels(text, b)), wallThicknessPx: t[Math.floor(t.length / 2)], mainWalls: walls };
}

export interface ExtractOptions {
  /** Known scale (e.g. set-wide consensus). Enables size-based door detection. */
  metresPerPixel?: number;
  scaleSource?: ScaleSource;
  scaleConsistency?: number | null;
  /** Scale to use when the sheet has no usable room dimensions. */
  fallbackMetresPerPixel?: number;
  /** Main-drawing walls from a previous pass (skips one detection). */
  mainWalls?: InterpretedWall[];
  basement?: boolean;
  floorId: string;
  floorName: string;
  ceilingHeight: number;
  elevation: number;
}

export function extractFloor(img: GreyImage, text: PageText, opts: ExtractOptions): ExtractedFloor {
  const warnings: string[] = [];
  const ctx = { pageWidth: img.width, pageHeight: img.height, anchors: planAnchors(text) };
  // Locate the main drawing without scale-aware door bridging (which could
  // join it to nearby option insets), then clip the scale-aware pass to it.
  const det0 = opts.mainWalls && opts.metresPerPixel ? null : detectWalls(img);
  const cluster0 = opts.mainWalls ?? mainCluster(det0!.walls, ctx).map((i) => det0!.walls[i]);
  // An alternate drawn against the plan ("… w/ SIDE UPGRADE") joins its wall cluster; cut it off.
  const split = splitAdjacentDrawings(cluster0, text);
  const main0 = split.walls;
  if (split.dropped) warnings.push(`Left out an alternate drawn next to the plan ("${split.dropped}").`);
  const full = opts.metresPerPixel ? detectWalls(img, { metresPerPixel: opts.metresPerPixel }) : det0!;
  const det = opts.metresPerPixel || split.dropped ? clipDetection(full, main0) : full;
  const kept0 = mainCluster(det.walls, ctx);
  trimOvershoots(det, kept0);
  const keep = kept0.filter((i) => det.walls[i].start.x !== det.walls[i].end.x || det.walls[i].start.y !== det.walls[i].end.y);
  const keepSet = new Set(keep);
  const remap = new Map(keep.map((oldI, newI) => [oldI, newI]));
  const walls = keep.map((i) => det.walls[i]);
  const ws = walls.map(asAxis);
  const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
  const boundsPx = xs.length ? { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const thick = walls.map((w) => w.thicknessPx).sort((a, b) => a - b);
  const wallThicknessPx = thick[Math.floor(thick.length / 2)] ?? 0;
  if (det.walls.length - walls.length > 0) warnings.push(`Ignored ${det.walls.length - walls.length} line(s) outside the main drawing (borders, option insets).`);

  // --- Scale ------------------------------------------------------------------
  const labels = findRoomLabels(text, { minX: boundsPx.minX - 5, minY: boundsPx.minY - 5, maxX: boundsPx.maxX + 5, maxY: boundsPx.maxY + 5 });
  let metresPerPixel: number;
  let scaleSource: ScaleSource;
  let scaleConsistency: number | null = null;
  const own = consensusScale(collectScaleVotes(ws, labels));
  if (opts.metresPerPixel) {
    // Set-wide consensus supplied by the caller (all sheets share one drawing scale).
    metresPerPixel = opts.metresPerPixel;
    scaleSource = opts.scaleSource ?? "room-dimensions";
    scaleConsistency = opts.scaleConsistency ?? null;
    if (own && Math.abs(own.metresPerPixel - metresPerPixel) / metresPerPixel > 0.08 && own.support >= 3) {
      warnings.push("This sheet's room dimensions disagree with the rest of the set — it may be drawn at a different scale.");
    }
  } else if (own && own.support >= 2) {
    metresPerPixel = own.metresPerPixel;
    scaleConsistency = own.consistency;
    scaleSource = "room-dimensions";
  } else if (opts.fallbackMetresPerPixel) {
    metresPerPixel = opts.fallbackMetresPerPixel;
    scaleSource = "inherited";
    warnings.push("No usable room dimensions on this sheet; scale taken from the other floors in the set.");
  } else {
    metresPerPixel = wallThicknessPx > 0 ? 0.3 / Math.max(...thick) : 0.01;
    scaleSource = "wall-thickness";
    warnings.push("Scale estimated from wall thickness only — calibrate with a known dimension.");
  }

  // --- Convert to metres ------------------------------------------------------
  const calibration = { metresPerPixel, originPx: { x: boundsPx.minX, y: boundsPx.minY }, calibrated: scaleSource === "room-dimensions" };
  const interp: FloorPlanInterpretation = {
    interpreter: "plan-set",
    walls,
    doors: det.doors.filter((o) => keepSet.has(o.wallIndex)).map((o) => ({ ...o, wallIndex: remap.get(o.wallIndex)! })),
    windows: det.windows.filter((o) => keepSet.has(o.wallIndex)).map((o) => ({ ...o, wallIndex: remap.get(o.wallIndex)! })),
    rooms: [],
    confidence: 0,
    warnings: [],
    imageSize: { width: img.width, height: img.height },
    createdAt: "",
  };
  const base: Floor = { id: opts.floorId, name: opts.floorName, elevation: opts.elevation, ceilingHeight: opts.ceilingHeight, belowGrade: !!opts.basement, floorThickness: opts.basement ? 0.1 : 0.3, rooms: [], walls: [], doors: [], windows: [] };
  let floor = autoClassifyExterior(importInterpretation(base, interp, calibration, "replace"));

  // --- Rooms from labels (rectangles between surrounding wall centrelines) -----
  const rooms: Room[] = [];
  const toM = (px: number, origin: number) => Math.round((px - origin) * metresPerPixel * 100) / 100;
  for (const l of labels) {
    const L = cast(ws, l.x, l.y, "l");
    const R = cast(ws, l.x, l.y, "r");
    const U = cast(ws, l.x, l.y, "u");
    const D = cast(ws, l.x, l.y, "d");
    if (!L || !R || !U || !D) continue;
    const [x0, x1, y0, y1] = [toM(L.wall.c, boundsPx.minX), toM(R.wall.c, boundsPx.minX), toM(U.wall.c, boundsPx.minY), toM(D.wall.c, boundsPx.minY)];
    if (x1 - x0 < 0.8 || y1 - y0 < 0.8) continue;
    rooms.push({
      id: newId("r"),
      name: pretty(l.name),
      polygon: [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
      finish: finishFor(l.name, !!opts.basement),
      unverified: true,
    });
  }
  floor = { ...floor, rooms: splitSharedRooms(rooms, labels, boundsPx, metresPerPixel) };

  const labelPts = labels.map((l) => ({ name: l.name, x: (l.x - boundsPx.minX) * metresPerPixel, y: (l.y - boundsPx.minY) * metresPerPixel }));
  floor = assignEntryDoors(floor, labelPts);

  if (!floor.doors.length) warnings.push("No door openings were recognised on this sheet.");
  if (!rooms.length) warnings.push("Rooms could not be outlined from the labels.");
  const ext = floor.walls.filter((w) => w.exterior).length;
  if (ext < 4) warnings.push("The exterior outline is incomplete.");

  const confidence = Math.min(
    0.8,
    0.15 + (scaleSource === "room-dimensions" ? 0.25 * (scaleConsistency ?? 0.5) + 0.1 : scaleSource === "inherited" ? 0.15 : 0) + 0.2 * Math.min(1, ext / 6) + 0.1 * Math.min(1, rooms.length / 4) + 0.05 * Math.min(1, floor.doors.length / 3),
  );
  return { floor, metresPerPixel, scaleSource, scaleConsistency, boundsPx, wallThicknessPx, confidence: Math.round(confidence * 100) / 100, warnings };
}
