import { after, type NextRequest } from "next/server";
import { listImportJobs, saveImportJob } from "@/lib/data/repository";
import { IMPORT_STEPS, runCommunityImport, type ImportInput } from "@/lib/community/importJob";
import type { CommunityImportJob } from "@/lib/models/communityImport";
import { CAIVAN_COMMUNITIES } from "@/lib/sample/caivanCommunities";
import { getStorage } from "@/lib/storage/objectStorage";

// Downloading map data and fitting the plan can take a few minutes.
export const maxDuration = 600;

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "community";

/**
 * Start importing a community from its site plan.
 * JSON { catalogId } uses the published caivan.com site plan; multipart
 * { file, name, city } uses an uploaded site-plan PDF.
 */
export async function POST(req: NextRequest) {
  let input: Omit<ImportInput, "jobId">;
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const name = String(form.get("name") ?? "").trim();
    const city = String(form.get("city") ?? "").trim();
    if (!(file instanceof File) || !name || !city) return Response.json({ error: "A site-plan PDF, community name and city are required" }, { status: 400 });
    const catalog = CAIVAN_COMMUNITIES.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const communityId = catalog?.id ?? slug(name);
    const storageKey = `communities/${communityId}/site-plan.pdf`;
    await getStorage().put(storageKey, Buffer.from(await file.arrayBuffer()), "application/pdf");
    input = { communityId, name, city, region: catalog?.region, url: catalog?.url, storageKey, fileName: file.name };
  } else {
    const { catalogId } = (await req.json()) as { catalogId?: string };
    const c = CAIVAN_COMMUNITIES.find((x) => x.id === catalogId);
    if (!c) return Response.json({ error: "Unknown community" }, { status: 404 });
    if (!c.sitePlanPdf) return Response.json({ error: `${c.name} has no published site plan — upload one instead.` }, { status: 422 });
    input = { communityId: c.id, name: c.name, city: c.city, region: c.region, url: c.url, sitePlanUrl: c.sitePlanPdf, fileName: c.sitePlanPdf.split("/").pop() };
  }

  const running = (await listImportJobs()).find((j) => j.communityId === input.communityId && j.status === "running" && Date.now() - Date.parse(j.startedAt) < 15 * 60_000);
  if (running) return Response.json(running, { status: 202 });

  const job: CommunityImportJob = {
    id: `imp-${input.communityId}-${Date.now().toString(36)}`,
    communityId: input.communityId,
    name: input.name,
    status: "running",
    stage: "Starting",
    step: 0,
    steps: IMPORT_STEPS,
    startedAt: new Date().toISOString(),
  };
  await saveImportJob(job);
  after(() => runCommunityImport({ ...input, jobId: job.id }));
  return Response.json(job, { status: 202 });
}
