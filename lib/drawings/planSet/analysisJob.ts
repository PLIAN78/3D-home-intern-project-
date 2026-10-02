import { getDrawing, savePlanSet, updateDrawing } from "@/lib/data/repository";
import { getStorage } from "@/lib/storage/objectStorage";
import { buildPlanSet } from "./buildPlanSet";
import { combinePlanSets } from "./combineSets";

const STALE_MS = 10 * 60 * 1000;

export function isAnalysisRunning(analysis: { status: string; startedAt: string } | undefined) {
  return analysis?.status === "running" && Date.now() - Date.parse(analysis.startedAt) < STALE_MS;
}

/**
 * Analyse a multi-page drawing set end to end and store the resulting PlanSet.
 * Progress is written to the drawing so the UI can poll it.
 */
export async function runDrawingSetAnalysis(drawingId: string): Promise<void> {
  const drawing = await getDrawing(drawingId);
  if (!drawing) return;
  const storage = getStorage();
  const startedAt = drawing.analysis?.startedAt ?? new Date().toISOString();
  let lastWrite = 0;
  try {
    const original = await storage.get(drawing.storageKey);
    if (!original) throw new Error("Original file is missing from storage");
    const planSet = await buildPlanSet({
      pdf: original.body,
      projectId: drawing.projectId,
      drawingId,
      putRaster: async (page, png) => {
        const key = `projects/${drawing.projectId}/drawings/${drawingId}/sheets/p${page}.png`;
        await storage.put(key, png, "image/png");
        return key;
      },
      onProgress: async (p) => {
        const now = Date.now();
        if (now - lastWrite < 700 && p.done < p.total) return;
        lastWrite = now;
        await updateDrawing(drawingId, { analysis: { status: "running", stage: p.stage, done: p.done, total: p.total, startedAt } });
      },
    });
    if (!planSet.variants.length) throw new Error("No floor plans could be read from this file.");
    await savePlanSet(planSet);
    await updateDrawing(drawingId, {
      analysis: { status: "done", stage: "Ready", done: 1, total: 1, planSetId: planSet.id, startedAt, finishedAt: new Date().toISOString() },
      processingStatus: "needs-review",
      pageCount: planSet.pageCount,
    });
  } catch (e) {
    console.error("Drawing set analysis failed", e);
    await updateDrawing(drawingId, {
      analysis: { status: "failed", stage: "Failed", done: 0, total: 1, error: e instanceof Error ? e.message : String(e), startedAt, finishedAt: new Date().toISOString() },
      processingStatus: "failed",
    }).catch(() => undefined);
  }
}

/**
 * Analyse a redline (working drawings) set and a décor set of the same model
 * and store one combined PlanSet. Progress is written to the redline drawing,
 * which the UI polls; the décor drawing records the same result when done.
 */
export async function runCombinedAnalysis(redlineId: string, decorId: string): Promise<void> {
  const [redline, decor] = await Promise.all([getDrawing(redlineId), getDrawing(decorId)]);
  if (!redline || !decor) return;
  const storage = getStorage();
  const startedAt = redline.analysis?.startedAt ?? new Date().toISOString();
  let lastWrite = 0;
  const report = async (phase: 0 | 1, label: string, p: { stage: string; done: number; total: number }) => {
    const now = Date.now();
    if (now - lastWrite < 700 && p.done < p.total) return;
    lastWrite = now;
    const done = phase * 1000 + Math.round((p.done / Math.max(1, p.total)) * 1000);
    await updateDrawing(redlineId, { analysis: { status: "running", stage: `${label} · ${p.stage}`, done, total: 2000, partnerDrawingId: decorId, startedAt } });
  };
  const read = async (d: NonNullable<typeof redline>, phase: 0 | 1, label: string) => {
    const original = await storage.get(d.storageKey);
    if (!original) throw new Error(`${d.fileName} is missing from storage`);
    return buildPlanSet({
      pdf: original.body,
      projectId: d.projectId,
      drawingId: d.id,
      putRaster: async (page, png) => {
        const key = `projects/${d.projectId}/drawings/${d.id}/sheets/p${page}.png`;
        await storage.put(key, png, "image/png");
        return key;
      },
      onProgress: (p) => report(phase, label, p),
    });
  };
  try {
    const red = await read(redline, 0, "Redline");
    if (red.format !== "working")
      throw new Error(`"${redline.fileName}" doesn't look like redline / working drawings — no sheets are captioned like "A1 - GROUND FLOOR PLAN (STANDARD)". Upload it as the décor set instead.`);
    if (!red.variants.length) throw new Error("No floor plans could be read from the redline set.");
    const dec = await read(decor, 1, "Décor");
    if (dec.format !== "decor") throw new Error(`"${decor.fileName}" looks like working drawings, not décor plans. Upload it as the redline set instead.`);
    const planSet = combinePlanSets(red, dec, { projectId: redline.projectId, redlineDrawingId: redlineId, decorDrawingId: decorId });
    await savePlanSet(planSet);
    const finishedAt = new Date().toISOString();
    await updateDrawing(redlineId, {
      analysis: { status: "done", stage: "Ready", done: 1, total: 1, planSetId: planSet.id, partnerDrawingId: decorId, startedAt, finishedAt },
      processingStatus: "needs-review",
      pageCount: red.pageCount,
    });
    await updateDrawing(decorId, {
      analysis: { status: "done", stage: "Ready", done: 1, total: 1, planSetId: planSet.id, partnerDrawingId: redlineId, startedAt, finishedAt },
      processingStatus: "needs-review",
      pageCount: dec.pageCount,
    });
  } catch (e) {
    console.error("Combined drawing analysis failed", e);
    await updateDrawing(redlineId, {
      analysis: { status: "failed", stage: "Failed", done: 0, total: 1, partnerDrawingId: decorId, error: e instanceof Error ? e.message : String(e), startedAt, finishedAt: new Date().toISOString() },
      processingStatus: "failed",
    }).catch(() => undefined);
  }
}
