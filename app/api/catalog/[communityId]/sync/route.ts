import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { syncCatalogCommunity } from "@/lib/data/repository";

/** Re-read a community's homes and photos from caivan.com. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/catalog/[communityId]/sync">) {
  const { communityId } = await ctx.params;
  try {
    const c = await syncCatalogCommunity(communityId);
    revalidatePath("/communities");
    revalidatePath(`/communities/${communityId}`);
    return Response.json({ ok: true, photos: c.photoCount, designs: c.designCount, collections: c.collections.length, scrapedAt: c.scrapedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return Response.json({ error: message }, { status: message === "Unknown community" ? 404 : 502 });
  }
}
