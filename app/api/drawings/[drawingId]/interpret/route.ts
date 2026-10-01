import type { NextRequest } from "next/server";
import { getDrawing, updateDrawing } from "@/lib/data/repository";
import { getInterpreter } from "@/lib/drawings/interpreters";
import { getStorage } from "@/lib/storage/objectStorage";

/** Run a drawing interpreter and store its (unreviewed) result on the drawing. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/drawings/[drawingId]/interpret">) {
  const { drawingId } = await ctx.params;
  const drawing = await getDrawing(drawingId);
  if (!drawing) return Response.json({ error: "Not found" }, { status: 404 });
  if (!drawing.rasterKey) return Response.json({ error: "Drawing has no raster to interpret" }, { status: 422 });
  const body = (await req.json().catch(() => ({}))) as { interpreter?: string };
  const interpreter = getInterpreter(body.interpreter ?? "heuristic");
  if (!interpreter) return Response.json({ error: `Unknown interpreter: ${body.interpreter}` }, { status: 400 });

  const raster = await getStorage().get(drawing.rasterKey);
  if (!raster) return Response.json({ error: "Raster missing from storage" }, { status: 500 });
  await updateDrawing(drawingId, { processingStatus: "processing" });
  try {
    const interpretation = await interpreter.interpretFloorPlan({ drawing, raster: raster.body });
    return Response.json(await updateDrawing(drawingId, { interpretation, processingStatus: "needs-review" }));
  } catch (e) {
    await updateDrawing(drawingId, { processingStatus: "failed" });
    return Response.json({ error: e instanceof Error ? e.message : "Interpretation failed" }, { status: 500 });
  }
}
