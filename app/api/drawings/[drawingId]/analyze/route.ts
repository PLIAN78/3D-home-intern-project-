import { after, type NextRequest } from "next/server";
import { getDrawing, updateDrawing } from "@/lib/data/repository";
import { isAnalysisRunning, runDrawingSetAnalysis } from "@/lib/drawings/planSet/analysisJob";

// Analysis renders and traces every sheet; allow it to run past the response.
export const maxDuration = 300;

/** Start whole-set analysis of a PDF drawing set (returns immediately; poll GET /api/drawings/[id]). */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/drawings/[drawingId]/analyze">) {
  const { drawingId } = await ctx.params;
  const drawing = await getDrawing(drawingId);
  if (!drawing) return Response.json({ error: "Not found" }, { status: 404 });
  if (drawing.contentType !== "application/pdf") return Response.json({ error: "Drawing-set analysis needs a PDF" }, { status: 415 });
  if (isAnalysisRunning(drawing.analysis)) return Response.json(drawing, { status: 202 });
  const updated = await updateDrawing(drawingId, {
    analysis: { status: "running", stage: "Starting", done: 0, total: 1, startedAt: new Date().toISOString() },
    processingStatus: "processing",
  });
  after(() => runDrawingSetAnalysis(drawingId));
  return Response.json(updated, { status: 202 });
}
