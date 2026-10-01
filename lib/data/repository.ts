import type { Community } from "@/lib/models/community";
import type { HouseModel } from "@/lib/models/house";
import type { Project } from "@/lib/models/project";
import { BRADLEY_RIDGE } from "@/lib/sample/bradleyRidge";
import { PLAN_36 } from "@/lib/sample/plan36";

/**
 * Data access boundary. Phase 1 serves in-memory seed data; the persistence
 * phase swaps these implementations for Drizzle/PostgreSQL queries without
 * touching callers.
 */

const PROJECTS: Project[] = [
  {
    id: "bradley-ridge-42",
    slug: "bradley-ridge-42",
    name: "Bradley Ridge Lot 42",
    communityId: "bradley-ridge",
    communityName: "Bradley Ridge",
    lotId: "lot-42",
    lotNumber: "42",
    modelName: "Plan 36",
    floorCount: 3,
    houseModelId: "plan-36",
    status: "in-review",
    updatedAt: "2026-09-29T14:20:00.000Z",
  },
];

const HOUSE_MODELS: Record<string, HouseModel> = { [PLAN_36.id]: PLAN_36 };
const COMMUNITIES: Record<string, Community> = { [BRADLEY_RIDGE.id]: BRADLEY_RIDGE };

export function listProjects(): Project[] {
  return PROJECTS;
}

export function getProjectBySlug(slug: string): Project | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}

export function getHouseModel(id: string): HouseModel | undefined {
  return HOUSE_MODELS[id];
}

export function getCommunity(id: string): Community | undefined {
  return COMMUNITIES[id];
}

export interface ProjectBundle {
  project: Project;
  house: HouseModel;
  community: Community;
}

export function getProjectBundle(slug: string): ProjectBundle | undefined {
  const project = getProjectBySlug(slug);
  if (!project) return undefined;
  const house = getHouseModel(project.houseModelId);
  const community = getCommunity(project.communityId);
  if (!house || !community) return undefined;
  return { project, house, community };
}
