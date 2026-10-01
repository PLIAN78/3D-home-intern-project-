import type { MaterialSelections } from "./materials";

export type ProjectStatus = "draft" | "in-review" | "ready-for-sales";

export interface Project {
  id: string;
  /** URL slug, e.g. "bradley-ridge-42". */
  slug: string;
  name: string;
  communityId: string;
  communityName: string;
  lotId: string;
  lotNumber: string;
  modelName: string;
  floorCount: number;
  houseModelId: string;
  /** Drawing set the home is generated from (elevations + layout options). */
  planSetId?: string;
  status: ProjectStatus;
  updatedAt: string;
}

export interface CustomerConfiguration {
  id: string;
  projectId: string;
  project: string;
  model: string;
  options: MaterialSelections;
  createdAt: string;
}
