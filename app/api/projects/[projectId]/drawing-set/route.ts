import { after, type NextRequest } from "next/server";
import { getDrawing, getProjectById, updateDrawing } from "@/lib/data/repository";
import { isAnalysisRunning, runCombinedAnalysis } from "@/lib/drawings/planSet/analysisJob";

// Both sets are rendered and traced; allow it to run past the response.
export const maxDuration = 300;

/**
 * Build the home from a redline (working drawings) set and a décor set.
 * Body: { redlineDrawingId, decorDrawingId }. Returns the redline drawing (poll GET /api/drawings/[id]).
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/drawing-set">) {
  const { projectId } = await ctx.params;
  if (!(await getProjectById(projectId))) return Response.json({ error: "Unknown project" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { redlineDrawingId?: string; decorDrawingId?: string };
  if (!body.redlineDrawingId || !body.decorDrawingId) return Response.json({ error: "Both a redline set and a décor set are required" }, { status: 400 });
  if (body.redlineDrawingId === body.decorDrawingId) return Response.json({ error: "The redline and décor sets must be different files" }, { status: 400 });
  const [redline, decor] = await Promise.all([getDrawing(body.redlineDrawingId), getDrawing(body.decorDrawingId)]);
  for (const [d, label] of [
    [redline, "redline"],
    [decor, "décor"],
  ] as const) {
    if (!d || d.projectId !== projectId) return Response.json({ error: `Unknown ${label} drawing` }, { status: 404 });
    if (d.contentType !== "application/pdf") return Response.json({ error: `The ${label} set must be a PDF` }, { status: 415 });
  }
  if (isAnalysisRunning(redline!.analysis)) return Response.json(redline, { status: 202 });
  const updated = await updateDrawing(redline!.id, {
    analysis: { status: "running", stage: "Starting", done: 0, total: 2000, partnerDrawingId: decor!.id, startedAt: new Date().toISOString() },
    processingStatus: "processing",
  });
  after(() => runCombinedAnalysis(redline!.id, decor!.id));
  return Response.json(updated, { status: 202 });
}
