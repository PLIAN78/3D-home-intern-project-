import type { NextRequest } from "next/server";
import { renderFloorPlanSvg } from "@/lib/drawings/samplePlanSvg";
import { PLAN_36 } from "@/lib/sample/plan36";

/** Demo floor-plan drawing of Plan 36, rendered from the sample model. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/samples/[floorId]">) {
  const { floorId } = await ctx.params;
  const floor = PLAN_36.floors.find((f) => f.id === floorId.replace(/\.svg$/, ""));
  if (!floor) return new Response("Not found", { status: 404 });
  return new Response(renderFloorPlanSvg(PLAN_36, floor), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
