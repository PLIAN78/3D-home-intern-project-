"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProject, listCommunities } from "@/lib/data/repository";

export interface CreateProjectState {
  error?: string;
  fields?: Record<string, string>;
}

export async function createProjectAction(_prev: CreateProjectState, form: FormData): Promise<CreateProjectState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const fields = { name: get("name"), communityId: get("communityId"), lotId: get("lotId"), modelName: get("modelName"), floorCount: get("floorCount"), template: get("template") };
  const floorCount = Number(fields.floorCount);
  if (!fields.name) return { error: "Project name is required.", fields };
  if (!fields.modelName) return { error: "Model / home name is required.", fields };
  if (!Number.isInteger(floorCount) || floorCount < 1 || floorCount > 5) return { error: "Number of floors must be between 1 and 5.", fields };
  const community = listCommunities().find((c) => c.id === fields.communityId);
  if (!community) return { error: "Choose a community.", fields };
  if (!community.lots.some((l) => l.id === fields.lotId)) return { error: "Choose a lot.", fields };

  let slug: string;
  try {
    const project = await createProject({
      name: fields.name.slice(0, 80),
      communityId: community.id,
      lotId: fields.lotId,
      modelName: fields.modelName.slice(0, 60),
      floorCount,
      hasBasement: form.get("hasBasement") === "on",
      template: fields.template === "plan-36" ? "plan-36" : "blank",
    });
    slug = project.slug;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create project.", fields };
  }
  revalidatePath("/");
  redirect(`/projects/${slug}?tab=drawings`);
}
