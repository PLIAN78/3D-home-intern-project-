import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { adjustPlacement, type PlacementDelta } from "@/lib/community/adjustPlacement";
import { getCommunity, saveCommunity } from "@/lib/data/repository";

/** Save a hand correction of the site plan's position on the real map. */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/communities/[communityId]/placement">) {
  const { communityId } = await ctx.params;
  const community = await getCommunity(communityId);
  if (!community?.geo) return Response.json({ error: "Unknown community" }, { status: 404 });
  const b = (await req.json()) as Partial<PlacementDelta>;
  const num = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
  const delta: PlacementDelta = { dx: num(b.dx, -2000, 2000, 0), dz: num(b.dz, -2000, 2000, 0), rotation: num(b.rotation, -Math.PI, Math.PI, 0), scale: num(b.scale, 0.5, 2, 1) };
  const adjusted = adjustPlacement(community, delta);
  const geo = adjusted.geo!;
  await saveCommunity({ ...adjusted, geo: { ...geo, sitePlan: { ...geo.sitePlan, method: "manual", confidence: 1, importedAt: geo.sitePlan.importedAt } } });
  revalidatePath(`/communities/${communityId}`);
  return Response.json({ ok: true });
}
