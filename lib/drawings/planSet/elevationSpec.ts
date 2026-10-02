import type { CladdingZone } from "@/lib/models/house";
import type { ElevationSpec } from "@/lib/models/planSet";
import type { PageText } from "./classify";

/**
 * Read what a working drawing's FRONT ELEVATION states about the exterior:
 *  - level datums ("FIN. SECOND FLR. 10'-1 3/4\"", "TOP OF PLATE 18'-2 3/4\"",
 *    "U/S OF SECOND FLOOR", "TOP OF SLAB STANDARD 8' BSMT") → storey heights;
 *  - roof pitch labels ("6:12", "10:12", "4:12") → main, gable and lower roofs;
 *  - material tags pointing at each storey (E300 → "FACE BRICK" in the
 *    sheet's material schedule) → cladding per storey.
 */

/** "10'-1 3/4\"", "-8'-9 1/8\"", "0\"" → metres. */
export function parseLevel(s: string): number | null {
  const m = /^(-)?\s*(?:(\d+)'\s*-?\s*)?(\d+)?(?:\s+(\d+)\/(\d+))?\s*"?$/.exec(s.trim());
  if (!m || (!m[2] && !m[3])) return null;
  const inches = Number(m[2] ?? 0) * 12 + Number(m[3] ?? 0) + (m[4] ? Number(m[4]) / Number(m[5]) : 0);
  return Math.round((m[1] ? -1 : 1) * inches * 0.0254 * 1000) / 1000;
}

type Item = PageText["items"][number];

const DATUMS: { key: keyof ElevationSpec["levels"] | "groundFloor"; re: RegExp }[] = [
  { key: "groundFloor", re: /^FIN\.?\s*(GROUND|MAIN|FIRST)\s+(FLR|FLOOR)/i },
  { key: "groundUnderside", re: /^U\/S\s+OF\s+(GROUND|MAIN|FIRST)\s+(FLR|FLOOR)/i },
  { key: "secondFloor", re: /^FIN\.?\s*SECOND\s+(FLR|FLOOR)/i },
  { key: "secondUnderside", re: /^U\/S\s+OF\s+SECOND\s+(FLR|FLOOR)/i },
  { key: "thirdFloor", re: /^FIN\.?\s*THIRD\s+(FLR|FLOOR)/i },
  { key: "thirdUnderside", re: /^U\/S\s+OF\s+THIRD\s+(FLR|FLOOR)/i },
  { key: "topOfPlate", re: /^TOP\s+OF\s+PLATE/i },
  { key: "basementSlab", re: /^TOP\s+OF\s+SLAB\s+STANDARD/i },
];

/** The value printed under a datum label (right-aligned with it). */
function valueBelow(items: Item[], label: Item): number | null {
  const right = label.x + label.w;
  const cand = items
    .filter((t) => t !== label && t.y > label.y && t.y - label.y < label.h * 2.4 && Math.abs(t.x + t.w - right) < label.h * 3)
    .map((t) => ({ t, v: parseLevel(t.str) }))
    .filter((c) => c.v !== null)
    .sort((a, b) => a.t.y - b.t.y);
  return cand[0]?.v ?? null;
}

function claddingOf(description: string): CladdingZone | null {
  if (/BRICK/i.test(description)) return "brick";
  if (/STONE/i.test(description)) return "stone";
  if (/SIDING|BATTEN|PANEL|LAP|SHAKE|STUCCO/i.test(description)) return "siding";
  return null;
}

export function readElevationSpec(text: PageText, page: number): ElevationSpec {
  const items = text.items.map((t) => ({ ...t, str: t.str.trim() }));

  // Level datums (y positions mark the level lines on the drawing).
  const levels: ElevationSpec["levels"] = {};
  const lineY: Partial<Record<string, number>> = {};
  for (const d of DATUMS) {
    for (const label of items.filter((t) => d.re.test(t.str))) {
      const v = valueBelow(items, label);
      if (v === null) continue;
      // Several "TOP OF PLATE" datums (garage, main): the highest is the main roof's.
      if (d.key === "topOfPlate" && levels.topOfPlate !== undefined && v <= levels.topOfPlate) continue;
      if (d.key !== "groundFloor") levels[d.key as keyof ElevationSpec["levels"]] = v;
      lineY[d.key] = label.y;
    }
  }

  // Roof pitches: the steepest is the gables', the shallowest above 4:12 the main roof's.
  const pitches = items.map((t) => /^(\d{1,2})\s*:\s*12$/.exec(t.str)).filter(Boolean).map((m) => Number(m![1]) / 12);
  const upper = pitches.filter((p) => p > 4.5 / 12);
  const main = upper.length ? Math.min(...upper) : null;
  const steep = upper.length ? Math.max(...upper) : null;
  const lowerPitches = pitches.filter((p) => p <= 4.5 / 12);

  // Material schedule: a tag with its description on the same row.
  const TAG = /^[A-Z]\d{3}$/;
  const tags = items.filter((t) => TAG.test(t.str));
  const schedule = new Map<string, string>();
  const scheduleTags = new Set<Item>();
  for (const t of tags) {
    const desc = items.find((d) => d !== t && !TAG.test(d.str) && Math.abs(d.y - t.y) < t.h * 0.4 && d.x > t.x && d.x - (t.x + t.w) < t.h * 6 && d.str.length > 6);
    if (desc) {
      schedule.set(t.str, desc.str);
      scheduleTags.add(t);
    }
  }
  // Tags on the drawing, by the storey band they point into.
  const g = lineY.groundFloor;
  const s2 = lineY.secondFloor;
  const top = lineY.topOfPlate;
  const vote = (lo: number | undefined, hi: number | undefined): CladdingZone | null => {
    if (lo === undefined || hi === undefined) return null;
    const counts = new Map<CladdingZone, number>();
    for (const t of tags) {
      if (scheduleTags.has(t) || t.y < Math.min(lo, hi) || t.y > Math.max(lo, hi)) continue;
      const zone = claddingOf(schedule.get(t.str) ?? "");
      if (zone) counts.set(zone, (counts.get(zone) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };

  return {
    page,
    levels,
    pitches: { main, gable: steep !== null && main !== null && steep > main ? steep : null, lower: lowerPitches.length ? Math.max(...lowerPitches) : null },
    cladding: { ground: vote(s2 ?? top, g), upper: vote(top, s2) },
  };
}
