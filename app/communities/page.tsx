import type { Metadata } from "next";
import { AppHeader } from "@/components/studio/AppHeader";
import { CommunityCatalog, type CatalogEntry } from "@/components/community/CommunityCatalog";
import { listCatalog, listCommunities, listImportJobs, listLotProgress } from "@/lib/data/repository";
import { progressPercent } from "@/lib/models/construction";

export const metadata: Metadata = { title: "Communities · Home Studio" };

export default async function CommunitiesPage() {
  const [communities, jobs, catalog] = await Promise.all([listCommunities(), listImportJobs(), listCatalog()]);
  const latestJob = (id: string) => jobs.filter((j) => j.communityId === id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

  const entries: CatalogEntry[] = await Promise.all(
    catalog.map(async (c) => {
      const imported = communities.find((x) => x.id === c.id && x.geo);
      let stats: CatalogEntry["stats"] = null;
      if (imported) {
        const progress = Object.values(await listLotProgress(c.id));
        const building = progress.filter((p) => p.stage !== "closed" && progressPercent(p) > 8).length;
        stats = {
          lots: imported.lots.length,
          sold: imported.lots.filter((l) => l.status === "sold").length,
          available: imported.lots.filter((l) => l.status === "available").length,
          building,
          rmsMetres: imported.geo!.sitePlan.rmsMetres,
        };
      }
      return {
        id: c.id,
        name: c.name,
        region: c.region,
        city: c.city,
        url: c.pageUrl,
        sitePlanPdf: c.sitePlanPdf,
        collections: c.collectionNames,
        blurb: c.blurb,
        heroUrl: c.heroUrl,
        photoCount: c.photoCount,
        designCount: c.designCount,
        priceFrom: c.priceFrom,
        stats,
        job: latestJob(c.id) ?? null,
      };
    }),
  );
  // Communities imported by upload that aren't in the published catalog.
  for (const c of communities) {
    if (!c.geo || entries.some((e) => e.id === c.id)) continue;
    entries.push({
      id: c.id,
      name: c.name,
      region: (c.region as CatalogEntry["region"]) ?? "Ottawa",
      city: c.city ?? "",
      url: c.url ?? "",
      sitePlanPdf: null,
      collections: (c.collections ?? []).map((x) => x.name),
      blurb: "Imported from an uploaded site plan.",
      heroUrl: null,
      photoCount: 0,
      designCount: 0,
      priceFrom: null,
      stats: { lots: c.lots.length, sold: c.lots.filter((l) => l.status === "sold").length, available: c.lots.filter((l) => l.status === "available").length, building: 0, rmsMetres: c.geo.sitePlan.rmsMetres },
      job: latestJob(c.id) ?? null,
    });
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-stone-50 to-background">
      <AppHeader active="/communities" />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Communities</h1>
          <p className="mt-1 text-sm text-muted-foreground">Caivan communities with their published homes and photos. Import a site plan to place every lot on the real map.</p>
        </div>
        <CommunityCatalog entries={entries} />
      </main>
    </div>
  );
}
