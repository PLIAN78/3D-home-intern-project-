import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { applyPlanSet, getPlanSet, getProjectById, updatePlanSetVariants } from "@/lib/data/repository";
import type { Floor } from "@/lib/models/house";
import { summarizePlanSet } from "@/lib/models/planSet";
import { validateHouseModel } from "@/lib/models/validate";

/** Summary of an analysed drawing set (no geometry). Query: ?planSetId= */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/plan-set">) {
  const { projectId } = await ctx.params;
  const id = req.nextUrl.searchParams.get("planSetId");
  const set = id ? await getPlanSet(id) : undefined;
  if (!set || set.projectId !== projectId) return Response.json({ error: "Unknown drawing set" }, { status: 404 });
  return Response.json(summarizePlanSet(set), { headers: { "Cache-Control": "no-store" } });
}

/** Use a drawing set as the project's home (standard plan, default finishes). Body: { planSetId } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/plan-set">) {
  const { projectId } = await ctx.params;
  const { planSetId } = (await req.json()) as { planSetId?: string };
  if (!planSetId) return Response.json({ error: "planSetId is required" }, { status: 400 });
  try {
    const project = await applyPlanSet(projectId, planSetId);
    revalidatePath(`/projects/${project.slug}`);
    revalidatePath(`/projects/${project.slug}/view`);
    return Response.json(project);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not apply drawing set" }, { status: 400 });
  }
}

/** Save reviewed floors back into the drawing set. Body: { planSetId, variants: [{ variantId, floor, sheetOrigin?, metresPerPixel? }] } */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/plan-set">) {
  const { projectId } = await ctx.params;
  const project = await getProjectById(projectId);
  if (!project) return Response.json({ error: "Unknown project" }, { status: 404 });
  const body = (await req.json()) as { planSetId?: string; variants?: { variantId: string; floor: Floor; sheetOrigin?: { x: number; y: number }; metresPerPixel?: number }[] };
  const set = body.planSetId ? await getPlanSet(body.planSetId) : undefined;
  if (!set || set.projectId !== projectId) return Response.json({ error: "Unknown drawing set" }, { status: 404 });
  const variants = body.variants ?? [];
  const problems = validateHouseModel({ floors: variants.map((v) => v.floor), exterior: { roofs: [] } });
  if (problems.length) return Response.json({ error: "Invalid floor geometry", problems }, { status: 400 });
  await updatePlanSetVariants(set.id, variants);
  revalidatePath(`/projects/${project.slug}`);
  revalidatePath(`/projects/${project.slug}/view`);
  return Response.json({ ok: true });
}
