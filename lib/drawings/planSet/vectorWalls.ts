import type { PlanPolygon, PlanText } from "@/lib/community/sitePlan/readVectors";
import type { GreyImage } from "../interpreters/lineDetection";

/**
 * Architectural working drawings (Revit exports) draw each cut wall as stacked
 * white-filled strips (cladding, sheathing, studs, drywall) with outlines, and
 * windows as grey glass strips framed by small white pieces. Raster line
 * detection can't see outlined walls, but the vectors describe them exactly.
 *
 * Paint those strips into a clean black-on-white image at the sheet raster's
 * resolution, so the regular wall detector reads it like a solid-wall plan:
 * wall strips become solid bands, each window becomes a gap with a thin line
 * across it (classified as a window), and doors stay empty gaps.
 */

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function bbox(p: PlanPolygon): Rect {
  const xs = p.points.map((q) => q[0]);
  const ys = p.points.map((q) => q[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Axis-aligned, (nearly) rectangular fills only. */
function asStrip(p: PlanPolygon): Rect | null {
  const r = bbox(p);
  const area = (r.x1 - r.x0) * (r.y1 - r.y0);
  return area > 0 && p.area / area > 0.85 ? r : null;
}

const isGlass = (fill: string) => fill === "#b4b4b4" || fill === "#c0c0c0" || fill === "#a0a0a0";

export interface WallMaskOptions {
  /** Raster size the mask must match (the rendered sheet). */
  width: number;
  height: number;
  /** Thickest strip that can be part of a wall, in page points. */
  maxStripPt?: number;
}

/** Paint a working drawing's wall and window strips as a solid-wall plan image. */
export function wallMaskFromVectors(polygons: PlanPolygon[], texts: PlanText[], page: { width: number; height: number }, opts: WallMaskOptions): GreyImage {
  const s = opts.width / page.width;
  const maxStrip = opts.maxStripPt ?? 12;
  const lum = new Uint8Array(opts.width * opts.height).fill(255);
  const paint = (r: Rect, v: number) => {
    const x0 = Math.max(0, Math.floor(r.x0 * s));
    const x1 = Math.min(opts.width, Math.ceil(r.x1 * s));
    const y0 = Math.max(0, Math.floor(r.y0 * s));
    const y1 = Math.min(opts.height, Math.ceil(r.y1 * s));
    for (let y = y0; y < y1; y++) lum.fill(v, y * opts.width + x0, y * opts.width + x1);
  };
  // Text sits on white masks of about the same size as a wall strip; skip any strip holding text.
  const holdsText = (r: Rect) => texts.some((t) => t.x >= r.x0 - 0.5 && t.x <= r.x1 + 0.5 && t.y >= r.y0 - 0.5 && t.y <= r.y1 + 0.5);

  const glass: Rect[] = [];
  for (const p of polygons) {
    const r = asStrip(p);
    if (!r) continue;
    const short = Math.min(r.x1 - r.x0, r.y1 - r.y0);
    const long = Math.max(r.x1 - r.x0, r.y1 - r.y0);
    if (isGlass(p.fill)) {
      if (long > short * 4) glass.push(r);
      continue;
    }
    // Tiny pieces are window frames and jambs, not wall.
    if (p.fill !== "#ffffff" || short > maxStrip || long < 4 || holdsText(r)) continue;
    paint(r, 0);
  }
  // Windows: clear the wall across each glass strip, then draw the glass as a thin line.
  for (const g of glass) {
    const horizontal = g.x1 - g.x0 > g.y1 - g.y0;
    const reach = maxStrip;
    paint(horizontal ? { x0: g.x0, x1: g.x1, y0: g.y0 - reach, y1: g.y1 + reach } : { x0: g.x0 - reach, x1: g.x1 + reach, y0: g.y0, y1: g.y1 }, 255);
  }
  // Drawn like a solid-wall plan's window symbol: two thin lines across the opening.
  for (const g of glass) {
    const horizontal = g.x1 - g.x0 > g.y1 - g.y0;
    const c = horizontal ? (g.y0 + g.y1) / 2 : (g.x0 + g.x1) / 2;
    const half = 0.5 / s;
    for (const off of [-1.6, 1.6]) {
      const m = c + off;
      paint(horizontal ? { x0: g.x0, x1: g.x1, y0: m - half, y1: m + half } : { x0: m - half, x1: m + half, y0: g.y0, y1: g.y1 }, 0);
    }
  }
  return { width: opts.width, height: opts.height, lum };
}
