import type { Floor, HouseModel } from "./house";
import { finalizeHouseModel } from "./finalize";
import { defaultFloors } from "./templates";

/**
 * A builder drawing set turned into a configurable home: per elevation, a
 * standard plan for every level plus optional layout variants (chef kitchen,
 * spa ensuite…). A concrete HouseModel is composed from a selection.
 */

export type LevelId = "basement" | "ground" | "second" | "third" | "attic";

export interface PlanElevation {
  id: string;
  label: string;
}

export interface PlanOption {
  id: string;
  levelId: LevelId;
  name: string;
  code: string | null;
}

export interface FloorVariant {
  id: string;
  levelId: LevelId;
  elevationId: string;
  /** null = the standard plan for this level. */
  optionId: string | null;
  page: number;
  floor: Floor;
  confidence: number;
  warnings: string[];
  reviewed: boolean;
  /** Sheet raster + mapping, so the editor can show the drawing under the geometry. */
  sheet: { rasterKey: string; width: number; height: number; metresPerPixel: number; originPx: { x: number; y: number } };
}

export interface UnmodeledSheet {
  page: number;
  title: string;
  reason: string;
}

export interface PlanSet {
  id: string;
  projectId: string;
  sourceDrawingId: string;
  modelCode: string | null;
  createdAt: string;
  scale: { metresPerPixel: number; source: "room-dimensions" | "wall-thickness"; support: number };
  levels: LevelId[];
  elevations: PlanElevation[];
  options: PlanOption[];
  variants: FloorVariant[];
  unmodeled: UnmodeledSheet[];
  defaultElevationId: string;
  pageCount: number;
}

export interface PlanSelection {
  elevationId: string;
  /** Selected option per level; missing / null = standard. */
  options: Partial<Record<LevelId, string | null>>;
}

export const LEVEL_LABEL: Record<LevelId, string> = {
  basement: "Basement",
  ground: "Main Floor",
  second: "Second Floor",
  third: "Third Floor",
  attic: "Attic / Loft",
};

export function defaultPlanSelection(set: PlanSet): PlanSelection {
  return { elevationId: set.defaultElevationId, options: {} };
}

export function variantFor(set: PlanSet, elevationId: string, levelId: LevelId, optionId: string | null): FloorVariant | undefined {
  const pick = (opt: string | null) => set.variants.find((v) => v.elevationId === elevationId && v.levelId === levelId && v.optionId === opt);
  return (optionId ? pick(optionId) : undefined) ?? pick(null);
}

/** Options that exist for a level in a given elevation. */
export function optionsFor(set: PlanSet, elevationId: string, levelId: LevelId): PlanOption[] {
  return set.options.filter((o) => o.levelId === levelId && set.variants.some((v) => v.elevationId === elevationId && v.optionId === o.id));
}

export function sanitizeSelection(set: PlanSet, sel: Partial<PlanSelection> | null | undefined): PlanSelection {
  const elevationId = set.elevations.some((e) => e.id === sel?.elevationId) ? sel!.elevationId! : set.defaultElevationId;
  const options: PlanSelection["options"] = {};
  for (const [level, opt] of Object.entries(sel?.options ?? {})) {
    if (opt && optionsFor(set, elevationId, level as LevelId).some((o) => o.id === opt)) options[level as LevelId] = opt;
  }
  return { elevationId, options };
}

/** Build the concrete HouseModel for a selection. Pure; safe to call on the client. */
export function composeHouseModel(set: PlanSet, selection: PlanSelection, base: { id: string; projectId: string; name: string }): HouseModel {
  const sel = sanitizeSelection(set, selection);
  // Default heights / elevations per level (bottom → top), stacked later by finalize.
  const hasBasement = set.levels.includes("basement");
  const templates = defaultFloors(set.levels.length, hasBasement);
  const aboveTemplates = templates.filter((t) => !t.belowGrade);
  const levelTemplate = (levelId: LevelId, i: number) => (levelId === "basement" ? templates.find((t) => t.belowGrade) : aboveTemplates[i]);
  const used: FloorVariant[] = [];
  let aboveIndex = 0;
  const floors: Floor[] = [];
  for (const levelId of set.levels) {
    const v = variantFor(set, sel.elevationId, levelId, sel.options[levelId] ?? null);
    const t = levelTemplate(levelId, levelId === "basement" ? 0 : aboveIndex);
    if (levelId !== "basement") aboveIndex++;
    if (!v) continue;
    used.push(v);
    floors.push({
      ...structuredClone(v.floor),
      id: levelId,
      name: LEVEL_LABEL[levelId],
      shortName: levelId === "basement" ? "B" : String(aboveIndex),
      elevation: t?.elevation ?? v.floor.elevation,
      ceilingHeight: v.floor.ceilingHeight || t?.ceilingHeight || 2.6,
      floorThickness: t?.floorThickness ?? v.floor.floorThickness,
      belowGrade: levelId === "basement",
    });
  }
  const unreviewed = used.filter((v) => !v.reviewed).length;
  const confidence = used.length ? Math.min(...used.map((v) => v.confidence)) : 0;
  const elevation = set.elevations.find((e) => e.id === sel.elevationId);
  const model: HouseModel = {
    ...base,
    floors,
    exterior: { roofs: [], autoRoof: true },
    provenance: {
      source: unreviewed ? "interpreted" : "manual-trace",
      confidence: Math.round(confidence * 100) / 100,
      notes: [
        `Generated automatically from the drawing set${elevation ? ` (${elevation.label})` : ""}.`,
        ...(unreviewed ? [`${unreviewed} floor(s) have not been reviewed by a person — dimensions are approximate.`] : []),
      ],
    },
  };
  const { model: finalized, notes } = finalizeHouseModel(model);
  return { ...finalized, provenance: { ...finalized.provenance, notes: [...finalized.provenance.notes, ...notes] } };
}

export interface PlanSetSummary {
  id: string;
  modelCode: string | null;
  pageCount: number;
  scale: PlanSet["scale"];
  levels: { id: LevelId; name: string }[];
  elevations: (PlanElevation & { floors: number })[];
  options: (PlanOption & { levelName: string; elevations: number })[];
  unmodeled: UnmodeledSheet[];
  /** Lowest per-floor confidence of the standard plans. */
  confidence: number;
  warnings: string[];
}

export function summarizePlanSet(set: PlanSet): PlanSetSummary {
  const standards = set.variants.filter((v) => !v.optionId);
  const warnings = [...new Set(set.variants.flatMap((v) => v.warnings).filter((w) => !w.startsWith("Ignored")))].slice(0, 6);
  if (set.scale.source !== "room-dimensions") warnings.unshift("Scale could not be read from room dimensions — sizes are estimates.");
  return {
    id: set.id,
    modelCode: set.modelCode,
    pageCount: set.pageCount,
    scale: set.scale,
    levels: set.levels.map((id) => ({ id, name: LEVEL_LABEL[id] })),
    elevations: set.elevations.map((e) => ({ ...e, floors: standards.filter((v) => v.elevationId === e.id).length })),
    options: set.options.map((o) => ({ ...o, levelName: LEVEL_LABEL[o.levelId], elevations: new Set(set.variants.filter((v) => v.optionId === o.id).map((v) => v.elevationId)).size })),
    unmodeled: set.unmodeled,
    confidence: standards.length ? Math.round(Math.min(...standards.map((v) => v.confidence)) * 100) / 100 : 0,
    warnings,
  };
}

/** e.g. "Elevation A1 · Chef Center · Spa Ensuite" (standard layouts omitted). */
export function describeSelection(set: PlanSet, sel: PlanSelection): string {
  const elevation = set.elevations.find((e) => e.id === sel.elevationId)?.label ?? sel.elevationId;
  const opts = Object.values(sel.options)
    .filter(Boolean)
    .map((id) => set.options.find((o) => o.id === id)?.name)
    .filter(Boolean);
  return [elevation, ...(opts.length ? opts : ["Standard plan"])].join(" · ");
}
