import { connection } from "next/server";
import type { Community } from "@/lib/models/community";
import type { Drawing } from "@/lib/models/drawing";
import type { HouseModel } from "@/lib/models/house";
import type { Project } from "@/lib/models/project";
import { blankHouseModel } from "@/lib/models/templates";
import { BRADLEY_RIDGE } from "@/lib/sample/bradleyRidge";
import { PLAN_36 } from "@/lib/sample/plan36";
import { read, write } from "./documentStore";

/**
 * Data access boundary (server only). Backed by a JSON document store in the
 * MVP; the persistence phase swaps these bodies for Drizzle/PostgreSQL queries
 * with the same signatures.
 */

const COMMUNITIES: Record<string, Community> = { [BRADLEY_RIDGE.id]: BRADLEY_RIDGE };

export interface ProjectBundle {
  project: Project;
  house: HouseModel;
  community: Community;
}

export function listCommunities(): Community[] {
  return Object.values(COMMUNITIES);
}

export function getCommunity(id: string): Community | undefined {
  return COMMUNITIES[id];
}

export async function listProjects(): Promise<Project[]> {
  await connection();
  return read((db) => [...db.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}

export async function getProjectBundle(slug: string): Promise<ProjectBundle | undefined> {
  await connection();
  return read((db) => {
    const project = db.projects.find((p) => p.slug === slug);
    if (!project) return undefined;
    const house = db.houseModels[project.houseModelId];
    const community = COMMUNITIES[project.communityId];
    if (!house || !community) return undefined;
    return { project, house, community };
  });
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  return read((db) => db.projects.find((p) => p.id === id));
}

export interface CreateProjectInput {
  name: string;
  communityId: string;
  lotId: string;
  modelName: string;
  floorCount: number;
  hasBasement: boolean;
  template: "blank" | "plan-36";
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60) || "project"
  );
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const community = COMMUNITIES[input.communityId];
  if (!community) throw new Error("Unknown community");
  const lot = community.lots.find((l) => l.id === input.lotId);
  if (!lot) throw new Error("Unknown lot");
  return write((db) => {
    let slug = slugify(input.name);
    for (let n = 2; db.projects.some((p) => p.slug === slug); n++) slug = `${slugify(input.name)}-${n}`;
    const id = slug;
    const houseModelId = `${id}-house`;
    const house: HouseModel =
      input.template === "plan-36"
        ? { ...structuredClone(PLAN_36), id: houseModelId, projectId: id, name: input.modelName }
        : blankHouseModel(houseModelId, id, input.modelName, input.floorCount, input.hasBasement);
    const project: Project = {
      id,
      slug,
      name: input.name,
      communityId: community.id,
      communityName: community.name,
      lotId: lot.id,
      lotNumber: lot.number,
      modelName: input.modelName,
      floorCount: house.floors.length,
      houseModelId,
      status: "draft",
      updatedAt: new Date().toISOString(),
    };
    db.projects.push(project);
    db.houseModels[houseModelId] = house;
    return project;
  });
}

export async function saveHouseModel(projectId: string, model: HouseModel): Promise<void> {
  await write((db) => {
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) throw new Error("Unknown project");
    db.houseModels[project.houseModelId] = { ...model, id: project.houseModelId, projectId };
    project.floorCount = model.floors.length;
    project.updatedAt = new Date().toISOString();
  });
}

// ---------------------------------------------------------------------------
// Drawings
// ---------------------------------------------------------------------------

export async function listDrawings(projectId: string): Promise<Drawing[]> {
  await connection();
  return read((db) => db.drawings.filter((d) => d.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function getDrawing(id: string): Promise<Drawing | undefined> {
  return read((db) => db.drawings.find((d) => d.id === id));
}

export async function createDrawing(drawing: Drawing): Promise<Drawing> {
  return write((db) => {
    db.drawings.push(drawing);
    const project = db.projects.find((p) => p.id === drawing.projectId);
    if (project) project.updatedAt = new Date().toISOString();
    return drawing;
  });
}

export async function updateDrawing(id: string, patch: Partial<Omit<Drawing, "id" | "projectId">>): Promise<Drawing> {
  return write((db) => {
    const d = db.drawings.find((x) => x.id === id);
    if (!d) throw new Error("Unknown drawing");
    Object.assign(d, patch, { updatedAt: new Date().toISOString() });
    return d;
  });
}

export async function deleteDrawing(id: string): Promise<Drawing | undefined> {
  return write((db) => {
    const i = db.drawings.findIndex((x) => x.id === id);
    if (i < 0) return undefined;
    const [removed] = db.drawings.splice(i, 1);
    return removed;
  });
}
