import type { PlanPolygon, PlanText, SitePlanVectors } from "./readVectors";

/**
 * Interpret site-plan vectors as a lotting plan:
 *  - legend swatches + labels → collections (e.g. "35′ COLLECTION" → 35 ft frontage)
 *  - lot polygons (collection colours, or the base lot colour at lot size)
 *  - lot numbers (text inside a lot) and status dots (red = sold, green = available)
 *  - street-name labels for georeferencing
 * All geometry stays in page points (y down) until georeferenced.
 */

export type LotStatus = "available" | "sold" | "future";

export interface PlanCollection {
  name: string;
  colour: string;
  /** Lot frontage in feet when the name says so (35′, 41′ …). */
  frontageFt: number | null;
}

export interface PlanLot {
  id: string;
  number: string | null;
  points: [number, number][];
  collection: string | null;
  status: LotStatus;
  /** Shorter side of the lot's oriented bounding box (page points). */
  frontagePts: number;
}

export interface PlanStreetLabel {
  name: string;
  x: number;
  y: number;
  angle: number;
}

export interface ParsedSitePlan {
  width: number;
  height: number;
  collections: PlanCollection[];
  lots: PlanLot[];
  /** Larger unreleased parcels (future phases / blocks), as outlines. */
  blocks: { points: [number, number][]; label: string | null }[];
  streets: PlanStreetLabel[];
  /** Street addresses printed on the plan (typically the sales centre). */
  addresses: string[];
  /** Scale estimate (metres per page point) from collection frontages, if available. */
  metresPerPointHint: number | null;
  title: string | null;
}

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const colourDistance = (a: string, b: string) => {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};
/** Hue (deg) and saturation (0–1). Lot fills are often lighter tints of the legend swatch, so match on hue. */
function hueSat(h: string): [number, number] {
  const [r, g, b] = hex(h).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
  }
  return [(hue * 60 + 360) % 360, s];
}
const tintDistance = (a: string, b: string) => {
  const [h1, s1] = hueSat(a);
  const [h2, s2] = hueSat(b);
  const dh = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
  return dh + 40 * Math.abs(s1 - s2);
};
const isRed = (c: string) => {
  const [r, g, b] = hex(c);
  return r > 200 && g < 90 && b < 90;
};
const isGreenDot = (c: string) => {
  const [r, g, b] = hex(c);
  return g > 150 && r < 140 && b < 120;
};

export function pointInPoly(x: number, y: number, pts: [number, number][]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Oriented bounding box via edge directions; returns [short, long, angle]. */
export function orientedBox(pts: [number, number][]): { short: number; long: number; angle: number } {
  let best = { area: Infinity, short: 0, long: 0, angle: 0 };
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-6) continue;
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [x, y] of pts) {
      const u = x * ux + y * uy;
      const v = -x * uy + y * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const w = maxU - minU;
    const h = maxV - minV;
    if (w * h < best.area) best = { area: w * h, short: Math.min(w, h), long: Math.max(w, h), angle: w <= h ? Math.atan2(uy, ux) : Math.atan2(ux, -uy) };
  }
  return best;
}

const STREET_RE = /\b(DRIVE|DR|STREET|ST|ROAD|RD|CRESCENT|CRES|PLACE|PL|GROVE|MEWS|LANE|LN|AVENUE|AVE|WAY|COURT|CRT|CIRCLE|TERRACE|PRIVATE|BOULEVARD|BLVD|TRAIL|GATE|HEIGHTS|WALK|PARKWAY)\b\.?$/i;

function legend(polys: PlanPolygon[], texts: PlanText[]): PlanCollection[] {
  const named = texts.filter((t) => /COLLECTION|SERIES|TOWNHOME|TOWNS?\b|SINGLES?\b|SEMIS?\b|BUNGALOW/i.test(t.str) && t.str.length < 40);
  const out: PlanCollection[] = [];
  for (const t of named) {
    // A small square swatch just left of the label, on the same line.
    const sw = polys
      .filter((p) => p.area < t.size * t.size * 3 && p.area > 1 && Math.abs(p.cy - (t.y - t.size * 0.35)) < t.size && p.cx < t.x && t.x - p.cx < t.size * 3)
      .sort((a, b) => t.x - a.cx - (t.x - b.cx))[0];
    if (!sw) continue;
    const ft = t.str.match(/(\d{2})\s*['′’]/);
    if (!out.some((c) => c.name === t.str)) out.push({ name: titleCase(t.str), colour: sw.fill, frontageFt: ft ? Number(ft[1]) : null });
  }
  return out;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)([a-z])/g, (m) => m.toUpperCase()).replace(/['’]/g, "′");
}

export function parseSitePlan(v: SitePlanVectors): ParsedSitePlan {
  const collections = legend(v.polygons, v.texts);
  const legendSwatches = new Set(v.polygons.filter((p) => collections.some((c) => c.colour === p.fill) && p.area < 80));
  const dots = v.polygons.filter((p) => p.area < 40 && (isRed(p.fill) || isGreenDot(p.fill)));

  // Base lot colour: the most common pale fill that isn't an exact legend swatch.
  const counts = new Map<string, number>();
  for (const p of v.polygons) {
    const [r, g, b] = hex(p.fill);
    const [, s] = hueSat(p.fill);
    if (g > 180 && r > 150 && b > 140 && s < 0.4 && !collections.some((c) => c.colour === p.fill) && p.area > 20) counts.set(p.fill, (counts.get(p.fill) ?? 0) + 1);
  }
  const baseColour = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const nearCollection = (fill: string) => {
    if (baseColour && colourDistance(fill, baseColour) < 12) return undefined;
    const best = collections.map((c) => ({ c, d: tintDistance(c.colour, fill) })).sort((a, b) => a.d - b.d)[0];
    return best && best.d < 22 ? best.c : undefined;
  };

  const collectionLots = v.polygons.filter((p) => nearCollection(p.fill) && !legendSwatches.has(p) && p.area > 40);
  const typical = collectionLots.map((p) => p.area).sort((a, b) => a - b)[Math.floor(collectionLots.length / 2)] ?? 150;
  const isBase = (p: PlanPolygon) => !!baseColour && colourDistance(p.fill, baseColour) < 12;
  const baseLots = v.polygons.filter((p) => isBase(p) && p.area > typical * 0.3 && p.area < typical * 3.5);
  const blocks = v.polygons.filter((p) => isBase(p) && p.area >= typical * 3.5 && p.area < v.width * v.height * 0.2);

  const numbers = v.texts.filter((t) => /^(TH-?)?\d{1,4}[A-Z]?$/i.test(t.str));
  const lots: PlanLot[] = [];
  const add = (p: PlanPolygon, collection: string | null) => {
    const inside = (x: number, y: number) => pointInPoly(x, y, p.points);
    const num = numbers.find((t) => inside(t.x + t.width / 2, t.y - t.size * 0.35));
    const dot = dots.find((d) => inside(d.cx, d.cy));
    lots.push({
      id: `lot-${lots.length + 1}`,
      number: num?.str ?? null,
      points: p.points,
      collection,
      status: dot ? (isRed(dot.fill) ? "sold" : "available") : "future",
      frontagePts: orientedBox(p.points).short,
    });
  };
  for (const p of collectionLots) add(p, nearCollection(p.fill)!.name);
  for (const p of baseLots) add(p, null);

  // Scale hint: frontage in feet ÷ measured short side.
  const ratios: number[] = [];
  for (const l of lots) {
    const ft = collections.find((c) => c.name === l.collection)?.frontageFt;
    if (ft && l.frontagePts > 0) ratios.push((ft * 0.3048) / l.frontagePts);
  }
  ratios.sort((a, b) => a - b);

  // Street addresses ("203 Meynell Road") are usually the sales centre: a location hint, not a street label.
  const isAddress = (t: PlanText) => /^\d{1,5}\s+\S/.test(t.str.trim());
  const addresses = [...new Set(v.texts.filter((t) => isAddress(t) && STREET_RE.test(t.str.trim()) && t.str.length < 40).map((t) => t.str.trim()))];
  const streets: PlanStreetLabel[] = v.texts.filter((t) => STREET_RE.test(t.str) && t.str.length < 40 && !isAddress(t)).map((t) => {
    // Label centre along its baseline.
    const cx = t.x + (Math.cos(t.angle) * t.width) / 2;
    const cy = t.y + (Math.sin(t.angle) * t.width) / 2 - t.size * 0.35;
    return { name: t.str, x: cx, y: cy, angle: t.angle };
  });

  const title = v.texts.filter((t) => t.size >= Math.max(...v.texts.map((x) => x.size)) * 0.8).map((t) => t.str).join(" ") || null;
  return {
    width: v.width,
    height: v.height,
    collections,
    lots,
    blocks: blocks.map((b) => ({ points: b.points, label: v.texts.find((t) => pointInPoly(t.x, t.y, b.points) && /FUTURE|DEVELOPMENT|BLOCK|PHASE/i.test(t.str))?.str ?? null })),
    streets,
    addresses,
    metresPerPointHint: ratios.length >= 3 ? ratios[Math.floor(ratios.length / 2)] : null,
    title,
  };
}
