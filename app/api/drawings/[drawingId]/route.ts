import type { NextRequest } from "next/server";
import { deleteDrawing, getDrawing, updateDrawing } from "@/lib/data/repository";
import { DRAWING_CATEGORIES, type Drawing } from "@/lib/models/drawing";
import { getStorage } from "@/lib/storage/objectStorage";

/** Current drawing state (used to poll set-analysis progress). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/drawings/[drawingId]">) {
  const { drawingId } = await ctx.params;
  const drawing = await getDrawing(drawingId);
  if (!drawing) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(drawing, { headers: { "Cache-Control": "no-store" } });
}

/** Update category, floor assignment or scale calibration. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/drawings/[drawingId]">) {
  const { drawingId } = await ctx.params;
  const existing = await getDrawing(drawingId);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as Partial<Drawing>;
  const patch: Partial<Drawing> = {};
  if (body.category && DRAWING_CATEGORIES.some((c) => c.id === body.category)) {
    patch.category = body.category;
    if (body.category !== "floor-plan") patch.processingStatus = "not-applicable";
    else if (existing.processingStatus === "not-applicable") patch.processingStatus = existing.interpretation ? "needs-review" : "not-started";
  }
  if ("floorId" in body) patch.floorId = body.floorId || undefined;
  if (body.calibration) {
    const c = body.calibration;
    if (!(c.metresPerPixel > 0) || !Number.isFinite(c.originPx?.x) || !Number.isFinite(c.originPx?.y)) {
      return Response.json({ error: "Invalid calibration" }, { status: 400 });
    }
    patch.calibration = { metresPerPixel: c.metresPerPixel, originPx: { x: c.originPx.x, y: c.originPx.y }, calibrated: !!c.calibrated };
  }
  return Response.json(await updateDrawing(drawingId, patch));
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/drawings/[drawingId]">) {
  const { drawingId } = await ctx.params;
  const removed = await deleteDrawing(drawingId);
  if (!removed) return Response.json({ error: "Not found" }, { status: 404 });
  const storage = getStorage();
  await Promise.all([storage.delete(removed.storageKey), removed.rasterKey ? storage.delete(removed.rasterKey) : null]);
  return new Response(null, { status: 204 });
}
