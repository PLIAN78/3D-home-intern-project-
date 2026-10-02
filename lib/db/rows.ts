import { eq } from "drizzle-orm";
import { collectionKey } from "@/lib/catalog/match";
import type { CommunityPageData } from "@/lib/catalog/types";
import type { Community } from "@/lib/models/community";
import type { CommunityImportJob } from "@/lib/models/communityImport";
import type { LotProgress } from "@/lib/models/construction";
import type { Drawing } from "@/lib/models/drawing";
import type { Project } from "@/lib/models/project";
import type { CatalogCommunity } from "@/lib/sample/caivanCommunities";
import type { DbOrTx } from "./client";
import * as t from "./schema";

/** Domain object ↔ table row mapping, shared by the repository and the seeder. */

export function projectRow(p: Project): typeof t.projects.$inferInsert {
  return { ...p, planSetId: p.planSetId ?? null };
}

export function toProject(r: typeof t.projects.$inferSelect): Project {
  const { planSetId, ...rest } = r;
  return planSetId ? { ...rest, planSetId } : rest;
}

export function drawingRow(d: Drawing): typeof t.drawings.$inferInsert {
  return { id: d.id, projectId: d.projectId, createdAt: d.createdAt, updatedAt: d.updatedAt ?? d.createdAt, data: d };
}

export function lotProgressRow(p: LotProgress): typeof t.lotProgress.$inferInsert {
  return { communityId: p.communityId, lotId: p.lotId, stage: p.stage, demo: !!p.demo, updatedAt: p.updatedAt, data: p };
}

export function importJobRow(j: CommunityImportJob): typeof t.communityImports.$inferInsert {
  return { id: j.id, communityId: j.communityId, status: j.status, startedAt: j.startedAt, data: j };
}

/** Replace a community and all of its lots. */
export function writeCommunity(db: DbOrTx, c: Community) {
  const { lots, ...rest } = c;
  const row = { id: c.id, name: c.name, city: c.city ?? null, region: c.region ?? null, url: c.url ?? null, data: rest, updatedAt: new Date().toISOString() };
  db.insert(t.communities).values(row).onConflictDoUpdate({ target: t.communities.id, set: row }).run();
  db.delete(t.lots).where(eq(t.lots.communityId, c.id)).run();
  const rows = lots.map((l, i) => ({
    communityId: c.id,
    id: l.id,
    number: l.number,
    status: l.status ?? null,
    collection: l.collection ?? null,
    lat: l.latLng?.lat ?? null,
    lng: l.latLng?.lng ?? null,
    sort: i,
    data: l,
  }));
  // SQLite caps bound parameters per statement; insert in chunks.
  for (let i = 0; i < rows.length; i += 100) db.insert(t.lots).values(rows.slice(i, i + 100)).run();
}

export function readCommunity(db: DbOrTx, id: string): Community | undefined {
  const row = db.select().from(t.communities).where(eq(t.communities.id, id)).get();
  if (!row) return undefined;
  const lots = db.select({ data: t.lots.data }).from(t.lots).where(eq(t.lots.communityId, id)).orderBy(t.lots.sort).all();
  return { ...row.data, lots: lots.map((l) => l.data) };
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[′’']/g, "")
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "") || "x"
  );
}

/**
 * Replace a catalogue community, its collections, home designs and photos.
 * `page` is what was read from the builder's site; without it only the
 * catalogue entry itself is stored.
 */
export function writeCatalogCommunity(db: DbOrTx, entry: CatalogCommunity, sort: number, page: CommunityPageData | null) {
  const row: typeof t.catalogCommunities.$inferInsert = {
    id: entry.id,
    name: entry.name,
    region: entry.region,
    city: entry.city,
    pageUrl: entry.url,
    sitePlanPdf: entry.sitePlanPdf,
    blurb: entry.blurb,
    description: page?.description ?? null,
    heroUrl: page?.heroUrl ?? null,
    logoUrl: page?.logoUrl ?? null,
    salesCentre: page?.salesCentre ?? null,
    collectionNames: page?.collections.length ? page.collections.map((c) => c.name) : entry.collections,
    sort,
    scrapedAt: page?.scrapedAt ?? null,
  };
  db.insert(t.catalogCommunities).values(row).onConflictDoUpdate({ target: t.catalogCommunities.id, set: row }).run();
  if (!page) return;

  // Cascades remove the old designs and photos.
  db.delete(t.photos).where(eq(t.photos.communityId, entry.id)).run();
  db.delete(t.catalogCollections).where(eq(t.catalogCollections.communityId, entry.id)).run();

  const collectionIds = new Map<string, string>();
  const designIds = new Map<string, string>();
  page.collections.forEach((c, ci) => {
    let id = `${entry.id}/${slug(c.name)}`;
    while ([...collectionIds.values()].includes(id)) id += "-2";
    collectionIds.set(c.name, id);
    db.insert(t.catalogCollections)
      .values({ id, communityId: entry.id, name: c.name, nameKey: collectionKey(c.name), pageUrl: c.pageUrl, priceFrom: c.priceFrom, sqft: c.sqft, bedrooms: c.bedrooms, bathrooms: c.bathrooms, parking: c.parking, imageUrl: c.imageUrl, sort: ci })
      .run();
    c.designs.forEach((d, di) => {
      let did = `${id}/${slug(d.name)}`;
      while ([...designIds.values()].includes(did)) did += "-2";
      designIds.set(`${c.name}\u0000${d.name}`, did);
      db.insert(t.homeDesigns)
        .values({
          id: did,
          communityId: entry.id,
          collectionId: id,
          name: d.name,
          modelHome: d.modelHome,
          soldOut: d.soldOut,
          sqft: d.sqft,
          sqftNote: d.sqftNote,
          bedrooms: d.bedrooms,
          bathrooms: d.bathrooms,
          parking: d.parking,
          floorplanPdf: d.floorplanPdf,
          featureSheetPdf: d.featureSheetPdf,
          brochurePdf: d.brochurePdf,
          virtualTourUrl: d.virtualTourUrl,
          pageUrl: d.pageUrl,
          sort: di,
        })
        .run();
    });
  });

  const seen = new Set<string>();
  page.photos.forEach((p, i) => {
    const designId = p.collection && p.design ? (designIds.get(`${p.collection}\u0000${p.design}`) ?? null) : null;
    const key = `${designId ?? ""}\u0000${p.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    db.insert(t.photos)
      .values({
        communityId: entry.id,
        collectionId: p.collection ? (collectionIds.get(p.collection) ?? null) : null,
        designId,
        kind: p.kind,
        url: p.url,
        caption: p.caption,
        linkUrl: p.linkUrl ?? null,
        sourceUrl: p.sourceUrl,
        sort: i,
      })
      .run();
  });
}
