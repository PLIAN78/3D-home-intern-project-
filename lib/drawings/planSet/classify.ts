/**
 * Classify the pages of a builder's décor / floor-plan drawing set.
 *
 * Typical sheets carry, in the title block, an option code ("STANDARD",
 * "SOGF-CC04"…), a title ("STANDARD GROUND FLOOR PLAN", "SECOND FLOOR SPA
 * ENSUITE"…), and a sheet number; near the plan a caption names the elevation
 * ("ELEVATION A1"). Pages are grouped by elevation in order, so pages without a
 * caption inherit the elevation of the section they sit in.
 */

export interface PageText {
  /** Text with baseline-left position, width and glyph height, all in raster pixels. */
  items: { str: string; x: number; y: number; w: number; h: number }[];
  width: number;
  height: number;
}

import type { LevelId } from "@/lib/models/planSet";

export type { LevelId };

export const LEVEL_ORDER: LevelId[] = ["basement", "ground", "second", "third", "attic"];
export const LEVEL_NAMES: Record<LevelId, string> = {
  basement: "Basement",
  ground: "Main Floor",
  second: "Second Floor",
  third: "Third Floor",
  attic: "Attic / Loft",
};

export type PageKind = "standard" | "option" | "grade-condition" | "other";

export interface PageInfo {
  page: number;
  kind: PageKind;
  level: LevelId | null;
  /** Normalised elevation id, e.g. "A1", "A/A2/B1", "B". */
  elevation: string | null;
  /** Option code from the title block (e.g. "SOGF-CC04"); "STANDARD" for base plans. */
  code: string | null;
  title: string;
  /** Human option name, e.g. "Chef Center" (null for standard plans). */
  optionName: string | null;
  sheet: string | null;
  /** Count of room dimension labels like 18'6"x13'8" — a proxy for a full plan. */
  roomDimensionCount: number;
}

const DIM_RE = /^\d+'\s*\d+(?:\s*\d\/\d)?"?\s*[xX×]\s*\d+'\s*\d+(?:\s*\d\/\d)?"?$/;

export function isRoomDimension(s: string) {
  return DIM_RE.test(s.trim());
}

function levelOf(title: string): LevelId | null {
  const t = title.toUpperCase();
  if (/BASEMENT|LOWER LEVEL|CELLAR/.test(t)) return "basement";
  if (/ATTIC|LOFT/.test(t)) return "attic";
  if (/THIRD|3RD/.test(t)) return "third";
  if (/SECOND|2ND|UPPER/.test(t)) return "second";
  if (/GROUND|MAIN|FIRST|1ST/.test(t)) return "ground";
  return null;
}

/** Option-code prefixes used on builder décor sheets (SO = "structural option"). */
const CODE_LEVEL: Record<string, LevelId> = { SOBS: "basement", SOGF: "ground", SOSF: "second", SOTF: "third", SOAT: "attic" };

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9&/' -]+/g, " ")
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();

/** "GROUND FLOOR PLAN CHEF CENTER" → "Chef Center"; "BASEMENT FLOOR PLAN OPT. BEDROOM" → "Basement Bedroom". */
export function optionNameFromTitle(title: string, level: LevelId | null): string {
  const upper = title.toUpperCase();
  let t = upper.replace(/\b(STANDARD|GROUND|MAIN|FIRST|SECOND|THIRD|UPPER|FLOOR|PLANS?|OPT|OPTIONS?|FOR)\b/g, " ");
  if (level !== "basement") t = t.replace(/\bBASEMENT\b/g, " ");
  const name = titleCase(t);
  if (!name || /^basement$/i.test(name)) return /OPTIONS/.test(upper) && level === "basement" ? "Finished Basement Options" : "Option";
  if (level === "basement" && !/basement/i.test(name)) return `Basement ${name}`;
  return name;
}

/** "ELEVATION A/A2/B1" → "A/A2/B1" */
function elevationIds(items: PageText["items"]): string[] {
  const out: string[] = [];
  for (const t of items) {
    const m = t.str.trim().match(/^ELEVATIONS?\s+([A-Z0-9][A-Z0-9/ ,&-]*)$/i);
    if (m && !/,|\bAND\b/i.test(m[1])) out.push(m[1].replace(/\s+/g, "").toUpperCase());
  }
  return out;
}

export function classifyPages(pages: PageText[]): PageInfo[] {
  let section: string | null = null;
  return pages.map((p, i) => {
    // Title block: the largest text near the bottom of the sheet, read top→bottom.
    const tb = p.items.filter((t) => t.y > p.height * 0.82 && t.h >= p.height * 0.009).sort((a, b) => a.y - b.y || a.x - b.x);
    const maxH = Math.max(0, ...tb.map((t) => t.h));
    const bigs = tb.filter((t) => t.h >= maxH * 0.6).map((t) => t.str.trim());
    const sheet = bigs.find((s) => /^[A-Z]*\d{3,}[A-Z0-9-]*$/i.test(s) && /\d/.test(s)) ?? null;
    const code = bigs.find((s) => s.toUpperCase() === "STANDARD" || /^(SO[A-Z]{2}-|GLOB|GWOB)/i.test(s)) ?? null;
    const title =
      bigs.filter((s) => s !== sheet && s !== code && /[A-Z]{3,}/i.test(s)).sort((a, b) => b.length - a.length)[0] ??
      p.items.find((t) => /FLOOR PLAN|BASEMENT/i.test(t.str))?.str.trim() ??
      `Page ${i + 1}`;

    const elevations = elevationIds(p.items);
    let elevation: string | null = null;
    if (elevations.length) {
      elevation = elevations.includes(section ?? "") ? section : elevations[0];
    } else elevation = section;

    const upperCode = code?.toUpperCase() ?? "";
    // Level: option-code prefix (SOGF = ground, SOSF = second…), then the title,
    // then plan captions (mid-sized text away from the title block).
    const captions = p.items
      .filter((t) => t.y < p.height * 0.82 && t.h >= p.height * 0.006 && /FLOOR|BASEMENT|ATTIC|LOFT/i.test(t.str))
      .map((t) => t.str)
      .join(" ");
    const level = CODE_LEVEL[upperCode.slice(0, 4)] ?? levelOf(title) ?? levelOf(captions);
    // The option code wins over the title (some option sheets are titled "STANDARD …").
    let kind: PageKind = "other";
    if (/^SO[A-Z]{2}-/.test(upperCode)) kind = "option";
    else if (/^(GLOB|GWOB)/.test(upperCode) || /GRADE CONDITION|LOOK-?OUT|WALK-?OUT/i.test(title)) kind = "grade-condition";
    else if (upperCode === "STANDARD" || /^STANDARD\b/i.test(title)) kind = "standard";
    else if (/\bOPT/i.test(title)) kind = "option";

    // A standard plan with an explicit caption starts a new elevation section.
    if (kind === "standard" && elevations.length) {
      section = elevations[0];
      elevation = section;
    }

    return {
      page: i + 1,
      kind,
      level,
      elevation,
      code,
      title,
      optionName: kind === "option" ? optionNameFromTitle(title, level) : null,
      sheet,
      roomDimensionCount: p.items.filter((t) => isRoomDimension(t.str)).length,
    };
  });
}

/** Parse 18'6" → metres. */
export function feetInchesToMetres(s: string): number | null {
  const m = s.trim().match(/^(\d+)'\s*(\d+)?(?:\s*(\d)\/(\d))?"?$/);
  if (!m) return null;
  const inches = Number(m[1]) * 12 + Number(m[2] ?? 0) + (m[3] ? Number(m[3]) / Number(m[4]) : 0);
  return inches * 0.0254;
}

export function parseRoomDimension(s: string): [number, number] | null {
  const parts = s.split(/[xX×]/).map((p) => feetInchesToMetres(p));
  if (parts.length !== 2 || parts.some((p) => p === null)) return null;
  return [parts[0]!, parts[1]!];
}
