import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCommunity, saveLotProgress } from "@/lib/data/repository";
import { CONSTRUCTION_STAGES, type LotProgress, type StageId } from "@/lib/models/construction";

/** Update a lot's construction progress. Body: { stage, completed?, expectedClosing?, notes? } */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/communities/[communityId]/lots/[lotId]/progress">) {
  const { communityId, lotId } = await ctx.params;
  const community = await getCommunity(communityId);
  if (!community?.lots.some((l) => l.id === lotId)) return Response.json({ error: "Unknown lot" }, { status: 404 });
  const body = (await req.json()) as Partial<LotProgress>;
  if (!body.stage || !CONSTRUCTION_STAGES.some((s) => s.id === body.stage)) return Response.json({ error: "Invalid stage" }, { status: 400 });
  const completed: LotProgress["completed"] = {};
  for (const [k, v] of Object.entries(body.completed ?? {})) {
    if (CONSTRUCTION_STAGES.some((s) => s.id === k) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) completed[k as StageId] = v.slice(0, 10);
  }
  const saved = await saveLotProgress({
    communityId,
    lotId,
    stage: body.stage,
    completed,
    expectedClosing: typeof body.expectedClosing === "string" && body.expectedClosing ? body.expectedClosing.slice(0, 10) : undefined,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : undefined,
    demo: false,
    updatedAt: new Date().toISOString(),
  });
  revalidatePath(`/communities/${communityId}`);
  revalidatePath("/projects/[slug]", "page");
  revalidatePath("/projects/[slug]/view", "page");
  return Response.json(saved);
}
