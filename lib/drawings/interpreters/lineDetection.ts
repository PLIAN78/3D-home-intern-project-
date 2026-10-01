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
 * Join collinear segments separated by short gaps (door / window openings, or
 * the notch a crossing wall leaves). `perp` are the candidate walls on the other
 * axis: a wide gap whose edge stops at a perpendicular wall is two separate
 * walls meeting other walls, not an opening, so it is not bridged.
 */
function mergeCollinear(segs: Segment[], maxGap: number, perp: Segment[]): Segment[] {
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

export function detectWalls(img: GreyImage): DetectionResult {
  const { width: W, height: H, lum } = img;
  const maxDim = Math.max(W, H);
  const minRun = Math.max(16, Math.round(maxDim * 0.012));
  const minT = 3;
  const maxT = Math.round(maxDim * 0.03);
  const dark = (x: number, y: number) => lum[y * W + x] < DARK;

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
  const candidates = segs.length;

  const thicknesses = segs.map((s) => s.thickness).sort((a, b) => a - b);
  const medianThickness = thicknesses[Math.floor(thicknesses.length / 2)] ?? 0;
  // Openings can be wide (double garage doors ≈ 5 m), so allow generous gaps.
  const maxGap = Math.round(maxDim * 0.28);
  const hs = segs.filter((s) => s.axis === "h");
  const vs = segs.filter((s) => s.axis === "v");
  segs = [...mergeCollinear(hs, maxGap, vs), ...mergeCollinear(vs, maxGap, hs)];

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

  const maxThick = Math.max(...segs.map((s) => s.thickness), 1);
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

  return { walls, doors, windows, stats: { candidates, merged: segs.length, snappedEnds: snapped, totalEnds: segs.length * 2, medianThickness } };
}
