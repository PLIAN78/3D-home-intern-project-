import { getDrawing, savePlanSet, updateDrawing } from "@/lib/data/repository";
import { getStorage } from "@/lib/storage/objectStorage";
import { buildPlanSet } from "./buildPlanSet";

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
