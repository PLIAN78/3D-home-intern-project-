import type { InterpretedOpening, InterpretedWall, PxPoint } from "@/lib/models/drawing";

/**
 * Simple wall detection for floor plans drawn with solid (poché) walls.
 *
 * 1. Threshold the image to dark/light.
 * 2. Find long horizontal runs of dark pixels per row, and stack consecutive
 *    rows with matching runs into "bands". A band of plausible wall thickness
 *    is a wall candidate. Repeat for columns (vertical walls).
 * 3. Merge collinear candidates across short gaps; each gap becomes a door
 *    (mostly empty) or window (thin parallel lines inside the wall) candidate.
 * 4. Snap wall endpoints onto perpendicular walls' centrelines.
 *
 * This is intentionally modest: it does not handle diagonal walls, outlined
 * (unfilled) walls, curved walls, or rooms. Everything it returns is reviewed
 * by a human in the tracing editor.
 */

export interface GreyImage {
  width: number;
  height: number;
  /** One byte per pixel, 0 = black. */
  lum: Uint8Array;
}

export function toGrey(width: number, height: number, rgba: Uint8Array | Buffer): GreyImage {
  const lum = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    const a = rgba[j + 3] / 255;
    // Transparent pixels count as white paper.
    const l = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    lum[i] = Math.round(l * a + 255 * (1 - a));
  }
  return { width, height, lum };
}

interface Band {
  /** Along-axis extent. */
  a0: number;
  a1: number;
  /** Across-axis extent (rows for horizontal bands). */
  c0: number;
  c1: number;
}

interface Segment {
  axis: "h" | "v";
  /** Centreline coordinate across the axis. */
  c: number;
  a0: number;
  a1: number;
  thickness: number;
  gaps: { a0: number; a1: number }[];
}

export interface DetectionResult {
  walls: InterpretedWall[];
  doors: InterpretedOpening[];
  windows: InterpretedOpening[];
  stats: { candidates: number; merged: number; snappedEnds: number; totalEnds: number; medianThickness: number };
  debug?: { axis: "h" | "v"; c: number; a0: number; a1: number; thickness: number }[];
}

const DARK = 110;

/** Bands of dark runs along one axis. `get(a, c)` reads pixel at along/across coords. */
function findBands(lenA: number, lenC: number, isDark: (a: number, c: number) => boolean, minRun: number, minT: number, maxT: number): Band[] {
  const done: Band[] = [];
  let active: (Band & { runs: { a0: number; a1: number }[] })[] = [];
  for (let c = 0; c < lenC; c++) {
    // Runs on this line
    const runs: { a0: number; a1: number }[] = [];
    let start = -1;
    for (let a = 0; a <= lenA; a++) {
      const d = a < lenA && isDark(a, c);
      if (d && start < 0) start = a;
      else if (!d && start >= 0) {
        if (a - start >= minRun) runs.push({ a0: start, a1: a - 1 });
        start = -1;
      }
    }
    const next: typeof active = [];
    const used = new Set<number>();
    for (const b of active) {
      // Continue the band with a run that overlaps it substantially.
      let matched = -1;
      for (let i = 0; i < runs.length; i++) {
        if (used.has(i)) continue;
        const r = runs[i];
        const overlap = Math.min(r.a1, b.a1) - Math.max(r.a0, b.a0);
        const shorter = Math.min(r.a1 - r.a0, b.a1 - b.a0);
        if (overlap > shorter * 0.8 && Math.abs(r.a0 - b.a0) < minRun * 0.5 + 4 && Math.abs(r.a1 - b.a1) < minRun * 0.5 + 4) {
          matched = i;
          break;
        }
      }
      if (matched >= 0) {
        used.add(matched);
        b.runs.push(runs[matched]);
        b.c1 = c;
        next.push(b);
      } else {
        done.push(b);
      }
    }
    runs.forEach((r, i) => {
      if (!used.has(i)) next.push({ a0: r.a0, a1: r.a1, c0: c, c1: c, runs: [r] });
    });
    active = next;
  }
  done.push(...active);

  const median = (xs: number[]) => {
    const s = [...xs].sort((p, q) => p - q);
    return s[Math.floor(s.length / 2)];
  };
  return done
    .filter((b) => {
      const t = b.c1 - b.c0 + 1;
      return t >= minT && t <= maxT;
    })
    .map((b) => {
      const runs = (b as Band & { runs: { a0: number; a1: number }[] }).runs;
      return { a0: median(runs.map((r) => r.a0)), a1: median(runs.map((r) => r.a1)), c0: b.c0, c1: b.c1 };
    });
}

function toSegments(bands: Band[], axis: "h" | "v"): Segment[] {
  return bands.map((b) => ({ axis, c: (b.c0 + b.c1) / 2, a0: b.a0, a1: b.a1, thickness: b.c1 - b.c0 + 1, gaps: [] }));
}

/**
 * A short wall piece can be read both as a horizontal and a vertical band
 * (same pixels). Keep only the reading that is more wall-like — longer
 * relative to its thickness — so side-on stubs don't pose as cross walls.
 */
function dedupeCrossAxis(segs: Segment[], maxGap = Infinity): Segment[] {
  // Does a same-axis segment continue this one's line (e.g. the pier on the other
  // side of a garage door)? Ambiguous blobs take the orientation that has one.
  const hasPartner = (s: Segment) =>
    segs.some(
      (o) =>
        o !== s &&
        o.axis === s.axis &&
        Math.abs(o.c - s.c) <= Math.max(3, s.thickness * 0.25) &&
        Math.abs(o.thickness - s.thickness) <= Math.max(4, s.thickness * 0.35) &&
        Math.min(Math.abs(o.a0 - s.a1), Math.abs(s.a0 - o.a1)) <= maxGap,
    );
  const rect = (s: Segment) =>
    s.axis === "h" ? { x0: s.a0, x1: s.a1, y0: s.c - s.thickness / 2, y1: s.c + s.thickness / 2 } : { x0: s.c - s.thickness / 2, x1: s.c + s.thickness / 2, y0: s.a0, y1: s.a1 };
  const area = (r: { x0: number; x1: number; y0: number; y1: number }) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
  const aspect = (s: Segment) => (s.a1 - s.a0) / Math.max(1, s.thickness);
  const drop = new Set<Segment>();
  for (const a of segs) {
    if (a.axis !== "h") continue;
    const ra = rect(a);
    for (const b of segs) {
      if (b.axis !== "v") continue;
      const rb = rect(b);
      const inter = area({ x0: Math.max(ra.x0, rb.x0), x1: Math.min(ra.x1, rb.x1), y0: Math.max(ra.y0, rb.y0), y1: Math.min(ra.y1, rb.y1) });
      if (inter <= 0.8 * Math.min(area(ra), area(rb))) continue;
      const ambiguous = aspect(a) < 2 && aspect(b) < 2;
      const pa = ambiguous && hasPartner(a);
      const pb = ambiguous && hasPartner(b);
      if (pa !== pb) drop.add(pa ? b : a);
      else drop.add(aspect(a) >= aspect(b) ? b : a);
    }
  }
  return segs.filter((s) => !drop.has(s));
}

/**
 * Join collinear segments separated by short gaps (door / window openings, or
 * the notch a crossing wall leaves). `perp` are the candidate walls on the other
 * axis: a wide gap whose edge stops at a perpendicular wall is two separate
 * walls meeting other walls, not an opening, so it is not bridged.
 */
function mergeCollinear(segs: Segment[], maxGap: number, perp: Segment[], doorGapPx?: [number, number]): Segment[] {
  const sorted = [...segs].sort((p, q) => p.c - q.c || p.a0 - q.a0);
  const out: Segment[] = [];
  const endsAtPerp = (along: number, across: number, t: number) =>
    perp.find((p) => Math.abs(p.c - along) <= p.thickness / 2 + 6 && across >= p.a0 - t && across <= p.a1 + t);
  const bridgeable = (o: Segment, s: Segment) => {
    const gap = s.a0 - o.a1;
    if (gap <= 0) return true;
    const left = endsAtPerp(o.a1, o.c, o.thickness);
    const right = endsAtPerp(s.a0, s.c, s.thickness);
    // Gap is just a crossing wall's footprint (T-junction): always join.
    if (left && left === right) return true;
    if (left && Math.abs(left.c - (o.a1 + s.a0) / 2) < left.thickness && gap <= left.thickness + 8) return true;
    // With a known scale, a door-sized gap is an opening even beside a corner.
    if (doorGapPx && gap >= doorGapPx[0] && gap <= doorGapPx[1]) return true;
    return !left && !right;
  };
  for (const s of sorted) {
    const prev = out.find(
      (o) =>
        Math.abs(o.c - s.c) <= Math.max(2, Math.min(o.thickness, s.thickness) * 0.25) &&
        Math.abs(o.thickness - s.thickness) <= Math.max(3, o.thickness * 0.3) &&
        s.a0 - o.a1 <= maxGap &&
        s.a0 > o.a0 &&
        bridgeable(o, s),
    );
    if (prev) {
      if (s.a0 > prev.a1 + 1) prev.gaps.push({ a0: prev.a1 + 1, a1: s.a0 - 1 });
      prev.a1 = Math.max(prev.a1, s.a1);
      prev.gaps.push(...s.gaps);
    } else {
      out.push({ ...s, gaps: [...s.gaps] });
    }
  }
  return out;
}

/**
 * Binary morphological opening (erode then dilate with a square of radius r):
 * removes dark features thinner than 2r+1 px — tile grids, hatching, text,
 * dimension lines — while keeping solid walls. Separable running-sum filters.
 */
export function openDarkMask(img: GreyImage, r: number): Uint8Array {
  const { width: W, height: H, lum } = img;
  const src = new Uint8Array(W * H);
  for (let i = 0; i < src.length; i++) src[i] = lum[i] < DARK ? 1 : 0;
  if (r <= 0) return src;
  const k = 2 * r + 1;
  // Erode: a pixel stays dark only if the whole k×k window is dark (min filter).
  // Dilate: a pixel becomes dark if any pixel in the window is dark (max filter).
  const pass = (input: Uint8Array, horizontal: boolean, mode: "min" | "max") => {
    const out = new Uint8Array(W * H);
    const lines = horizontal ? H : W;
    const len = horizontal ? W : H;
    const at = (line: number, i: number) => (horizontal ? line * W + i : i * W + line);
    for (let line = 0; line < lines; line++) {
      let sum = 0;
      for (let i = -r; i < len + r; i++) {
        const add = i + r;
        if (add >= 0 && add < len) sum += input[at(line, add)];
        else if (mode === "min") sum += 0; // outside counts as light
        const rem = i - r - 1;
        if (rem >= 0 && rem < len) sum -= input[at(line, rem)];
        if (i >= 0 && i < len) {
          const lo = Math.max(0, i - r);
          const hi = Math.min(len - 1, i + r);
          const span = hi - lo + 1;
          out[at(line, i)] = mode === "min" ? (sum === span && span === k ? 1 : 0) : sum > 0 ? 1 : 0;
        }
      }
    }
    return out;
  };
  const eroded = pass(pass(src, true, "min"), false, "min");
  return pass(pass(eroded, true, "max"), false, "max");
}

export interface DetectOptions {
  /** Opening radius in px; default scales with image size (≈2 px at 2400 px). */
  openRadius?: number;
  /** Return raw pre-merge candidates for debugging. */
  debug?: boolean;
  /** Known drawing scale; lets door-sized gaps next to wall junctions be recognised. */
  metresPerPixel?: number;
}

export function detectWalls(img: GreyImage, opts: DetectOptions = {}): DetectionResult {
  const { width: W, height: H, lum } = img;
  const maxDim = Math.max(W, H);
  // Thin linework is removed by the opening filter, so short solid pieces (piers
  // beside garage / entry doors) can be kept.
  const minRun = Math.max(14, Math.round(maxDim * 0.007));
  const minT = 3;
  const maxT = Math.round(maxDim * 0.03);
  const radius = opts.openRadius ?? Math.max(1, Math.round(maxDim / 1200));
  const mask = openDarkMask(img, radius);
  const dark = (x: number, y: number) => mask[y * W + x] === 1;

  // Cross-section filter: a pixel can belong to a horizontal wall only if the
  // vertical dark run through it is wall-thick (and vice versa). This drops
  // thin linework (window symbols, dimensions, text, hatching) that would
  // otherwise merge with or fragment wall bands.
  const vRun = new Uint16Array(W * H);
  const hRun = new Uint16Array(W * H);
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!dark(x, y)) {
        y++;
        continue;
      }
      let y1 = y;
      while (y1 < H && dark(x, y1)) y1++;
      const len = Math.min(65535, y1 - y);
      for (let k = y; k < y1; k++) vRun[k * W + x] = len;
      y = y1;
    }
  }
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!dark(x, y)) {
        x++;
        continue;
      }
      let x1 = x;
      while (x1 < W && dark(x1, y)) x1++;
      const len = Math.min(65535, x1 - x);
      for (let k = x; k < x1; k++) hRun[y * W + k] = len;
      x = x1;
    }
  }
  const wallThick = (n: number) => n >= minT && n <= maxT;

  const hBands = findBands(W, H, (a, c) => wallThick(vRun[c * W + a]), minRun, minT, maxT);
  const vBands = findBands(H, W, (a, c) => wallThick(hRun[a * W + c]), minRun, minT, maxT);
  // Discard sheet borders / frames spanning nearly the whole sheet.
  let segs = [...toSegments(hBands, "h").filter((s) => s.a1 - s.a0 < W * 0.9), ...toSegments(vBands, "v").filter((s) => s.a1 - s.a0 < H * 0.9)];
  const rawCandidates = opts.debug ? segs.map((x) => ({ axis: x.axis, c: x.c, a0: x.a0, a1: x.a1, thickness: x.thickness })) : undefined;
  segs = dedupeCrossAxis(segs, Math.round(maxDim * 0.28));
  const candidates = segs.length;

  const thicknesses = segs.map((s) => s.thickness).sort((a, b) => a - b);
  const medianThickness = thicknesses[Math.floor(thicknesses.length / 2)] ?? 0;
  // Openings can be wide (double garage doors ≈ 5 m), so allow generous gaps.
  const maxGap = Math.round(maxDim * 0.28);
  const hs = segs.filter((s) => s.axis === "h");
  const vs = segs.filter((s) => s.axis === "v");
  const doorGap: [number, number] | undefined = opts.metresPerPixel ? [0.6 / opts.metresPerPixel, 1.25 / opts.metresPerPixel] : undefined;
  segs = [...mergeCollinear(hs, maxGap, vs, doorGap), ...mergeCollinear(vs, maxGap, hs, doorGap)];

  // Snap endpoints onto perpendicular wall centrelines.
  let snapped = 0;
  const tol = (s: Segment) => s.thickness * 0.75 + 4;
  for (const s of segs) {
    for (const end of ["a0", "a1"] as const) {
      const pos = s[end];
      let best: Segment | null = null;
      let bestD = Infinity;
      for (const o of segs) {
        if (o.axis === s.axis) continue;
        // o runs across s's axis at coordinate o.c (along s), spanning o.a0..o.a1 (across s)
        const within = s.c >= o.a0 - tol(s) && s.c <= o.a1 + tol(s);
        const d = Math.abs(o.c - pos);
        if (within && d <= o.thickness / 2 + tol(o) && d < bestD) {
          best = o;
          bestD = d;
        }
      }
      if (best) {
        s[end] = best.c;
        snapped++;
      }
    }
  }

  // Robust "thick wall" reference: 90th percentile of walls that will be kept
  // (a single short thick blob must not redefine what an exterior wall is).
  const kept = segs.filter((s) => Math.abs(s.a1 - s.a0) >= minRun).map((s) => s.thickness).sort((a, b) => a - b);
  const maxThick = kept.length ? kept[Math.min(kept.length - 1, Math.floor(kept.length * 0.9))] : 1;
  const walls: InterpretedWall[] = [];
  const doors: InterpretedOpening[] = [];
  const windows: InterpretedOpening[] = [];
  for (const s of segs) {
    const start: PxPoint = s.axis === "h" ? { x: s.a0, y: s.c } : { x: s.c, y: s.a0 };
    const end: PxPoint = s.axis === "h" ? { x: s.a1, y: s.c } : { x: s.c, y: s.a1 };
    const len = Math.abs(s.a1 - s.a0);
    if (len < minRun) continue;
    const idx = walls.length;
    walls.push({ start, end, thicknessPx: s.thickness, exterior: s.thickness >= maxThick * 0.75, confidence: 0.5 });
    for (const g of s.gaps) {
      const gw = g.a1 - g.a0 + 1;
      if (gw < s.thickness * 1.2) continue; // tiny breaks are noise, not openings
      // A perpendicular wall crossing the gap (T-junction) is not an opening.
      const crossed = segs.some((o) => o.axis !== s.axis && o.c >= g.a0 - 2 && o.c <= g.a1 + 2 && s.c >= o.a0 - o.thickness && s.c <= o.a1 + o.thickness);
      if (crossed) continue;
      // Window symbols are thin parallel lines inside the wall band; doors leave it mostly empty.
      let darkCount = 0;
      let total = 0;
      const c0 = Math.round(s.c - s.thickness / 2);
      const c1 = Math.round(s.c + s.thickness / 2);
      for (let a = g.a0; a <= g.a1; a++)
        for (let c = c0; c <= c1; c++) {
          const x = s.axis === "h" ? a : c;
          const y = s.axis === "h" ? c : a;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          total++;
          // Lighter threshold: window symbols are thin, antialiased lines.
          if (lum[y * W + x] < 200) darkCount++;
        }
      const fill = total ? darkCount / total : 0;
      const opening: InterpretedOpening = {
        kind: fill > 0.12 ? "window" : "door",
        wallIndex: idx,
        positionPx: (g.a0 + g.a1) / 2 - s.a0,
        widthPx: gw,
        confidence: 0.35,
      };
      (opening.kind === "window" ? windows : doors).push(opening);
    }
  }

  return { walls, doors, windows, stats: { candidates, merged: segs.length, snappedEnds: snapped, totalEnds: segs.length * 2, medianThickness }, debug: rawCandidates };
}
