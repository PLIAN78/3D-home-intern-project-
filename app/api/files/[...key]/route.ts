import type { NextRequest } from "next/server";
import { getStorage } from "@/lib/storage/objectStorage";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/files/[...key]">) {
  const { key } = await ctx.params;
  try {
    const obj = await getStorage().get(key.join("/"));
    if (!obj) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(obj.body), {
      headers: { "Content-Type": obj.contentType, "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}
