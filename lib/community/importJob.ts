import { getImportJob, saveCommunity, saveImportJob } from "@/lib/data/repository";
import type { CommunityImportJob } from "@/lib/models/communityImport";
import { getStorage } from "@/lib/storage/objectStorage";
import { buildCommunityFromSitePlan } from "./buildCommunity";
import { toLocal, type LatLng } from "./geo";
import { geocodeQuery, locateByStreets } from "./geocode";
import { fetchSiteContext } from "./osm";
import { georeferenceSitePlan } from "./sitePlan/georeference";
import { shapeMatchSitePlan } from "./sitePlan/shapeMatch";
import { parseSitePlan, type ParsedSitePlan } from "./sitePlan/parseSitePlan";
import { readSitePlanVectors } from "./sitePlan/readVectors";

export interface ImportInput {
  jobId: string;
  communityId: string;
  name: string;
  city: string;
  region?: string;
  url?: string;
  /** Either a PDF already in storage, or a public URL to download it from. */
  storageKey?: string;
  sitePlanUrl?: string;
  fileName?: string;
}

const STEPS = 6;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

async function update(jobId: string, patch: Partial<CommunityImportJob>) {
  const job = await getImportJob(jobId);
  if (job) await saveImportJob({ ...job, ...patch });
}

/**
 * Import a community from its site-plan PDF:
 * read lots → locate by street names → fetch OpenStreetMap → georeference →
 * build a real-world Community (with demo construction progress for sold lots).
 */
export async function runCommunityImport(input: ImportInput): Promise<void> {
  const step = (n: number, stage: string) => update(input.jobId, { step: n, stage });
  try {
    await step(1, "Getting the site plan");
    let pdf: Buffer;
    if (input.storageKey) {
      const obj = await getStorage().get(input.storageKey);
      if (!obj) throw new Error("Uploaded site plan is missing");
      pdf = obj.body;
    } else if (input.sitePlanUrl) {
      const res = await fetch(input.sitePlanUrl, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`Couldn't download the site plan (${res.status})`);
      pdf = Buffer.from(await res.arrayBuffer());
      await getStorage().put(`communities/${input.communityId}/site-plan.pdf`, pdf, "application/pdf");
    } else throw new Error("No site plan provided");

    await step(2, "Reading lots, collections and sold / available status");
    let plan: ParsedSitePlan | null = null;
    for (let page = 1; page <= 3; page++) {
      try {
        const p = parseSitePlan(await readSitePlanVectors(pdf, page));
        if (!plan || p.lots.length > plan.lots.length) plan = p;
      } catch {
        break;
      }
    }
    if (!plan || plan.lots.length < 3) throw new Error("No lots were found on this site plan (it may be a scanned image).");

    await step(3, "Locating the community");
    // Street names on the plan → the sales-centre address printed on it → the community name.
    let found: LatLng | null = null;
    let guessRadius = 450;
    if (new Set(plan.streets.map((x) => x.name)).size >= 2) found = await locateByStreets(plan.streets.map((x) => x.name), input.city);
    for (const a of plan.addresses) {
      if (found) break;
      found = await geocodeQuery(`${a}, ${input.city}, Ontario`).catch(() => null);
      guessRadius = 400;
    }
    if (!found) {
      found = await geocodeQuery(`${input.name}, ${input.city}, Ontario`).catch(() => null);
      guessRadius = 700;
    }
    if (!found) throw new Error(`Couldn't find ${input.name} in ${input.city} — the plan has no street names or address to search for.`);
    // Round (≈100 m) so re-imports reuse the cached map data; it is only a reference point.
    const located = { lat: Math.round(found.lat * 1000) / 1000, lng: Math.round(found.lng * 1000) / 1000 };

    await step(4, "Downloading real-world streets and buildings (OpenStreetMap)");
    // Radius from the plan's real size (page extent × scale hint), within sensible limits.
    const extent = plan.metresPerPointHint ? Math.hypot(plan.width, plan.height) * plan.metresPerPointHint * 0.55 : 1200;
    const radius = Math.round(Math.min(1800, Math.max(700, extent + guessRadius * 0.5)));
    const context = await fetchSiteContext(located, radius);
    // Cached map data may be centred slightly elsewhere; its origin is the plan origin.
    const origin = context.origin;

    await step(5, "Lining the site plan up with real streets");
    let georef = georeferenceSitePlan(plan, context.roads, { scaleHint: plan.metresPerPointHint });
    if (!georef || georef.rmsMetres > 25 || georef.usedLabels < 3) {
      // Few usable street labels: fit the lots themselves to the road network.
      const g = toLocal(origin, found);
      const shape = shapeMatchSitePlan(plan, context.roads, { guess: [g.x, g.y], scaleHint: plan.metresPerPointHint, searchRadius: guessRadius, buildings: context.buildings });
      if (!shape || (shape.inlierFraction ?? 0) < 0.45) {
        throw new Error("The site plan couldn't be lined up with mapped streets — its streets may not be on OpenStreetMap yet. Import it anyway from an uploaded plan with street names, or adjust the placement by hand.");
      }
      georef = shape;
    }

    await step(6, "Building the community");
    const contextKey = `communities/${input.communityId}/context.json`;
    await getStorage().put(contextKey, Buffer.from(JSON.stringify(context)), "application/json");
    const community = buildCommunityFromSitePlan({
      id: input.communityId,
      name: input.name,
      city: input.city,
      region: input.region,
      url: input.url,
      origin,
      contextKey,
      plan,
      georef,
      roads: context.roads,
      sitePlan: { url: input.sitePlanUrl, fileName: input.fileName },
    });
    await saveCommunity(community, { seedDemoProgress: true });
    const count = (s: string) => community.lots.filter((l) => l.status === s).length;
    await update(input.jobId, {
      status: "done",
      stage: "Ready",
      step: STEPS,
      finishedAt: new Date().toISOString(),
      result: { lots: community.lots.length, sold: count("sold"), available: count("available"), future: count("future"), rmsMetres: georef.rmsMetres, confidence: georef.confidence, matchedStreets: georef.usedLabels, buildings: context.buildings.length },
    });
  } catch (e) {
    console.error("Community import failed", e);
    await update(input.jobId, { status: "failed", stage: "Failed", error: e instanceof Error ? e.message : String(e), finishedAt: new Date().toISOString() });
  }
}

export const IMPORT_STEPS = STEPS;
