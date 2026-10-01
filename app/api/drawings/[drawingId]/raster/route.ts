import type { NextRequest } from "next/server";
import { getDrawing, updateDrawing } from "@/lib/data/repository";
import { getStorage } from "@/lib/storage/objectStorage";

/** Replace the raster, e.g. after choosing a different page of a multi-page PDF. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/drawings/[drawingId]/raster">) {
  const { drawingId } = await ctx.params;
  const drawing = await getDrawing(drawingId);
  if (!drawing) return Response.json({ error: "Not found" }, { status: 404 });
  const form = await req.formData();
  const raster = form.get("raster");
  const page = Math.max(1, Math.floor(Number(form.get("page")) || 1));
  const width = Number(form.get("rasterWidth"));
  const height = Number(form.get("rasterHeight"));
  if (!(raster instanceof File)) return Response.json({ error: "Missing raster" }, { status: 400 });
  const rasterKey = `projects/${drawing.projectId}/drawings/${drawing.id}/raster-${page}.png`;
  await getStorage().put(rasterKey, Buffer.from(await raster.arrayBuffer()), "image/png");
  const updated = await updateDrawing(drawingId, {
    rasterKey,
    page,
    rasterWidth: width > 0 ? width : drawing.rasterWidth,
    rasterHeight: height > 0 ? height : drawing.rasterHeight,
    // A different page invalidates the previous interpretation and calibration.
    interpretation: undefined,
    calibration: undefined,
    processingStatus: drawing.category === "floor-plan" ? "not-started" : "not-applicable",
  });
  return Response.json(updated);
}
