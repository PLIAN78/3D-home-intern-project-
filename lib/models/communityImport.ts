/** Progress of importing a community from its site plan (polled by the UI). */
export interface CommunityImportJob {
  id: string;
  communityId: string;
  name: string;
  status: "running" | "done" | "failed";
  stage: string;
  step: number;
  steps: number;
  error?: string;
  /** Summary when done. */
  result?: { lots: number; sold: number; available: number; future: number; rmsMetres: number; confidence: number; matchedStreets: number; buildings: number };
  startedAt: string;
  finishedAt?: string;
}
