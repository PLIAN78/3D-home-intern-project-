import type { NextRequest } from "next/server";
import { getCommunity } from "@/lib/data/repository";
import { getStorage } from "@/lib/storage/objectStorage";

/** Real-world surroundings (OpenStreetMap) for a community, in its local metres. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/communities/[communityId]/context">) {
  const { communityId } = await ctx.params;
  const community = await getCommunity(communityId);
  if (!community?.geo) return Response.json({ error: "This community has no real-world context" }, { status: 404 });
  const obj = await getStorage().get(community.geo.contextKey);
  if (!obj) return Response.json({ error: "Map data missing — re-import the community" }, { status: 404 });
  return new Response(new Uint8Array(obj.body), { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=3600" } });
}
