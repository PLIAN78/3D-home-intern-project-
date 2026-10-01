import type { NextRequest } from "next/server";
import { getImportJob } from "@/lib/data/repository";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/communities/import/[jobId]">) {
  const { jobId } = await ctx.params;
  const job = await getImportJob(jobId);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}
