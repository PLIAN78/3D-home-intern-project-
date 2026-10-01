import type { FloorVariant, LevelId, PlanOption, PlanSet, UnmodeledSheet } from "@/lib/models/planSet";
import { LEVEL_LABEL } from "@/lib/models/planSet";
import { defaultFloors } from "@/lib/models/templates";
import { classifyPages, LEVEL_ORDER, type PageInfo, type PageText } from "./classify";
import { consensusScale, extractFloor, measureSheet, type ScaleVote } from "./extractFloor";
import { registerFloor, translateFloor } from "./align";
import { openPdf } from "./pdfServer";

export interface BuildProgress {
  stage: string;
  done: number;
  total: number;
}

export interface BuildInput {
  pdf: Buffer;
  projectId: string;
  drawingId: string;
  /** Persist a sheet raster; returns its storage key. */
  putRaster: (page: number, png: Buffer) => Promise<string>;
  onProgress?: (p: BuildProgress) => void | Promise<void>;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "option";

function elevationLabel(id: string) {
  return id === "STD" ? "Standard" : `Elevation ${id.split("/").join(" / ")}`;
}

/** If a set has no recognisable title blocks, treat each sheet as a standard plan, levels in order. */
function fallbackClassification(info: PageInfo[], texts: PageText[]): PageInfo[] {
  if (info.some((p) => p.kind === "standard" && p.level)) return info;
  const order: LevelId[] = ["ground", "second", "third", "attic"];
  let next = 0;
  return info.map((p, i) => {
    const level = p.level ?? (texts[i].items.length ? order[Math.min(next, order.length - 1)] : null);
    if (!p.level && level) next++;
    return { ...p, kind: "standard", level, elevation: p.elevation ?? "STD" };
  });
}

function wallArea(walls: { start: { x: number; y: number }; end: { x: number; y: number } }[]) {
  if (!walls.length) return 0;
  const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

export async function buildPlanSet(input: BuildInput): Promise<PlanSet> {
  const progress = async (stage: string, done: number, total: number) => input.onProgress?.({ stage, done, total });
  const pdf = await openPdf(input.pdf);
  try {
    const n = pdf.numPages;
    const texts: PageText[] = [];
    for (let i = 1; i <= n; i++) {
      texts.push(await pdf.pageText(i));
      if (i % 8 === 0 || i === n) await progress("Reading sheets", i, n);
    }
    const info = fallbackClassification(classifyPages(texts), texts);
    const candidates = info.filter((p) => (p.kind === "standard" || p.kind === "option") && p.level);
    const unmodeled: UnmodeledSheet[] = info
      .filter((p) => !candidates.includes(p))
      .map((p) => ({ page: p.page, title: p.title, reason: p.kind === "grade-condition" ? "Grade-condition variant (look-out / walk-out) — reference only" : "Not a floor plan" }));

    // Pass 1 — one scale for the whole set (sheets are exported at the same drawing scale).
    // Standard sheets are measured first; option sheets only if that isn't conclusive.
    const votes: ScaleVote[] = [];
    // Pass-1 renders are reused by pass 2 (bounded so memory stays modest).
    const cache = new Map<number, { render: Awaited<ReturnType<typeof pdf.render>>; mainWalls: ReturnType<typeof measureSheet>["mainWalls"] }>();
    let k = 0;
    const standards = candidates.filter((p) => p.kind === "standard");
    for (const group of [standards, candidates.filter((p) => p.kind !== "standard")]) {
      for (const p of group) {
        const r = await pdf.render(p.page);
        const m = measureSheet(r.grey, r.text);
        votes.push(...m.votes);
        if (cache.size < 16) cache.set(p.page, { render: r, mainWalls: m.mainWalls });
        await progress("Measuring scale", ++k, group === standards ? standards.length : candidates.length);
      }
      const c = consensusScale(votes);
      if (c && c.support >= 6) break;
    }
    const consensus = consensusScale(votes);
    const setScale = consensus && consensus.support >= 2 ? consensus : null;

    // Pass 2 — trace every standard and option sheet at that scale.
    const templates = defaultFloors(5, true);
    const tplFor = (level: LevelId) => (level === "basement" ? templates.find((t) => t.belowGrade)! : templates.filter((t) => !t.belowGrade)[LEVEL_ORDER.indexOf(level) - 1] ?? templates[templates.length - 1]);
    const raw: (FloorVariant & { info: PageInfo })[] = [];
    k = 0;
    for (const p of candidates) {
      const level = p.level!;
      const elevationId = p.elevation ?? "STD";
      await progress(`Tracing ${LEVEL_LABEL[level]} · ${elevationLabel(elevationId)}${p.optionName ? ` · ${p.optionName}` : ""}`, k, candidates.length);
      const cached = cache.get(p.page);
      cache.delete(p.page);
      const r = cached?.render ?? (await pdf.render(p.page));
      const tpl = tplFor(level);
      const ex = extractFloor(r.grey, r.text, {
        metresPerPixel: setScale?.metresPerPixel,
        scaleSource: "room-dimensions",
        scaleConsistency: setScale?.consistency ?? null,
        floorId: level,
        floorName: LEVEL_LABEL[level],
        ceilingHeight: tpl.ceilingHeight,
        elevation: tpl.elevation,
        basement: level === "basement",
        mainWalls: cached?.mainWalls,
      });
      k++;
      if (ex.floor.walls.length < 4) {
        unmodeled.push({ page: p.page, title: p.title, reason: "Could not find enough walls on this sheet" });
        continue;
      }
      const rasterKey = await input.putRaster(p.page, r.png);
      raw.push({
        id: `v-${p.page}`,
        levelId: level,
        elevationId,
        optionId: p.kind === "option" ? slug(p.code ?? p.optionName ?? `p${p.page}`) : null,
        page: p.page,
        floor: ex.floor,
        confidence: ex.confidence,
        warnings: ex.warnings,
        reviewed: false,
        sheet: { rasterKey, width: r.width, height: r.height, metresPerPixel: ex.metresPerPixel, originPx: { x: ex.boundsPx.minX, y: ex.boundsPx.minY } },
        info: p,
      });
    }
    await progress("Assembling the home", candidates.length, candidates.length);

    // A level drawn only on option-coded sheets (e.g. model-home sets titled
    // "SOGF-…") has no standard plan; its first full sheet becomes the standard,
    // otherwise the default home would be missing that whole floor.
    for (const v of raw) {
      if (v.optionId === null) continue;
      const hasStd = raw.some((s) => s.optionId === null && s.levelId === v.levelId && s.elevationId === v.elevationId);
      if (hasStd) continue;
      const first = raw.filter((s) => s.levelId === v.levelId && s.elevationId === v.elevationId).sort((a, b) => wallArea(b.floor.walls) - wallArea(a.floor.walls) || a.page - b.page)[0];
      first.optionId = null;
    }

    // Keep one standard per elevation+level (first sheet wins); drop partial option sheets.
    const variants: FloorVariant[] = [];
    for (const v of raw) {
      const std = raw.find((s) => s.optionId === null && s.levelId === v.levelId && s.elevationId === v.elevationId);
      if (v.optionId === null) {
        if (std !== v) unmodeled.push({ page: v.page, title: v.info.title, reason: "Duplicate standard plan" });
        else variants.push(v);
        continue;
      }
      if (std && wallArea(v.floor.walls) < 0.6 * wallArea(std.floor.walls)) {
        unmodeled.push({ page: v.page, title: v.info.title, reason: "Partial drawing — shows only the changed area" });
        continue;
      }
      variants.push(v);
    }

    // Align: levels to the elevation's main floor, options to their level's standard plan.
    for (const elevationId of new Set(variants.map((v) => v.elevationId))) {
      const own = variants.filter((v) => v.elevationId === elevationId);
      const ref = own.find((v) => v.levelId === "ground" && !v.optionId) ?? own.find((v) => !v.optionId);
      if (!ref) continue;
      for (const v of own) {
        if (v === ref) continue;
        const target = v.optionId ? own.find((s) => !s.optionId && s.levelId === v.levelId) ?? ref : ref;
        const { dx, dy, score } = registerFloor(target.floor, v.floor);
        v.floor = translateFloor(v.floor, dx, dy);
        v.sheet = { ...v.sheet, originPx: { x: v.sheet.originPx.x - dx / v.sheet.metresPerPixel, y: v.sheet.originPx.y - dy / v.sheet.metresPerPixel } };
        if (score < 0.5) v.warnings.push("Couldn't confidently line this floor up with the floor below — check stacking.");
      }
    }

    // Options: group by code across elevations; name by majority.
    const options: PlanOption[] = [];
    for (const v of variants) {
      if (!v.optionId || options.some((o) => o.id === v.optionId)) continue;
      const pages = raw.filter((r) => r.optionId === v.optionId);
      const names = pages.map((r) => r.info.optionName ?? "Option");
      const name = names.sort((a, b) => names.filter((x) => x === b).length - names.filter((x) => x === a).length)[0];
      options.push({ id: v.optionId, levelId: v.levelId, name, code: pages[0].info.code });
    }

    const elevationIds = [...new Set(variants.map((v) => v.elevationId))];
    const levels = LEVEL_ORDER.filter((l) => variants.some((v) => v.levelId === l));
    const codes = info.map((p) => p.sheet?.match(/(\d{3,5})/)?.[1]).filter(Boolean) as string[];
    const modelCode = codes.length ? codes.sort((a, b) => codes.filter((c) => c === b).length - codes.filter((c) => c === a).length)[0] : null;

    return {
      id: `ps-${input.drawingId.slice(0, 8)}-${Date.now().toString(36)}`,
      projectId: input.projectId,
      sourceDrawingId: input.drawingId,
      modelCode,
      createdAt: new Date().toISOString(),
      scale: setScale ? { metresPerPixel: setScale.metresPerPixel, source: "room-dimensions", support: setScale.support } : { metresPerPixel: variants[0]?.sheet.metresPerPixel ?? 0.01, source: "wall-thickness", support: 0 },
      levels,
      elevations: elevationIds.map((id) => ({ id, label: elevationLabel(id) })),
      options,
      variants: variants.map(({ ...v }) => {
        delete (v as { info?: PageInfo }).info;
        return v;
      }),
      unmodeled: unmodeled.sort((a, b) => a.page - b.page),
      defaultElevationId: elevationIds[0] ?? "STD",
      pageCount: n,
    };
  } finally {
    await pdf.close();
  }
}
