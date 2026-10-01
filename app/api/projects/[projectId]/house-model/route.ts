import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getProjectById, saveHouseModel, updateDrawing } from "@/lib/data/repository";
import type { HouseModel } from "@/lib/models/house";
import { validateHouseModel } from "@/lib/models/validate";

/** Save reviewed / traced geometry. Body: { model: HouseModel, reviewedDrawingId?: string } */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/house-model">) {
  const { projectId } = await ctx.params;
  const project = await getProjectById(projectId);
  if (!project) return Response.json({ error: "Unknown project" }, { status: 404 });
  const body = (await req.json()) as { model?: HouseModel; reviewedDrawingId?: string };
  const problems = validateHouseModel(body.model);
  if (problems.length || !body.model) return Response.json({ error: "Invalid house model", problems }, { status: 400 });
  await saveHouseModel(projectId, body.model);
  if (body.reviewedDrawingId) await updateDrawing(body.reviewedDrawingId, { processingStatus: "reviewed" }).catch(() => undefined);
  revalidatePath(`/projects/${project.slug}`);
  revalidatePath(`/projects/${project.slug}/view`);
  return Response.json({ ok: true });
}
