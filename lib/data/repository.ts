import { and, asc, desc, eq, inArray, isNull, like, notInArray, sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";
import { scrapeCommunity } from "@/lib/catalog/caivanScraper";
import { collectionKey } from "@/lib/catalog/match";
import type { CatalogCommunityDetail, CatalogCommunityView, CatalogSnapshot, CollectionView, HomeDesignView, LotHomes, PhotoKind, PhotoView } from "@/lib/catalog/types";
import { getDb, type DbOrTx } from "@/lib/db/client";
import { drawingRow, importJobRow, lotProgressRow, projectRow, readCommunity, toProject, writeCatalogCommunity, writeCommunity } from "@/lib/db/rows";
import * as t from "@/lib/db/schema";
import type { Community } from "@/lib/models/community";
import type { Drawing } from "@/lib/models/drawing";
import type { HouseModel } from "@/lib/models/house";
import type { Floor } from "@/lib/models/house";
import type { CommunityImportJob } from "@/lib/models/communityImport";
import { demoProgress, type LotProgress } from "@/lib/models/construction";
import { composeHouseModel, defaultPlanSelection, type PlanSet } from "@/lib/models/planSet";
import type { Project } from "@/lib/models/project";
import { blankHouseModel } from "@/lib/models/templates";
import { BRADLEY_RIDGE } from "@/lib/sample/bradleyRidge";
import { CAIVAN_COMMUNITIES } from "@/lib/sample/caivanCommunities";
import { PLAN_36 } from "@/lib/sample/plan36";

/**
 * Data access boundary (server only), backed by SQLite through Drizzle
 * (`lib/db/`). better-sqlite3 is synchronous, so each function body runs
 * atomically; multi-statement writes use a transaction.
 */

const COMMUNITIES: Record<string, Community> = { [BRADLEY_RIDGE.id]: BRADLEY_RIDGE };

export interface ProjectBundle {
  project: Project;
  house: HouseModel;
  community: Community;
  /** Present when the home is generated from a drawing set (elevations + options). */
  planSet?: PlanSet;
  /** Construction progress for every lot in a real community (keyed by lot id). */
  lotProgress?: Record<string, LotProgress>;
  /** Real homes and photos for the project's lot, from the property catalogue. */
  homes?: LotHomes;
}

const now = () => new Date().toISOString();

/** Demo communities (code) + real communities imported from site plans. */
export async function listCommunities(): Promise<Community[]> {
  const db = getDb();
  const ids = db.select({ id: t.communities.id }).from(t.communities).all();
  return [...ids.map((r) => readCommunity(db, r.id)!), ...Object.values(COMMUNITIES)];
}

export async function getCommunity(id: string): Promise<Community | undefined> {
  return readCommunity(getDb(), id) ?? COMMUNITIES[id];
}

export async function listProjects(): Promise<Project[]> {
  await connection();
  return getDb().select().from(t.projects).orderBy(desc(t.projects.updatedAt)).all().map(toProject);
}

function progressFor(communityId: string): Record<string, LotProgress> {
  const out: Record<string, LotProgress> = {};
  for (const r of getDb().select({ data: t.lotProgress.data }).from(t.lotProgress).where(eq(t.lotProgress.communityId, communityId)).all()) out[r.data.lotId] = r.data;
  return out;
}

export async function getProjectBundle(slug: string): Promise<ProjectBundle | undefined> {
  await connection();
  const db = getDb();
  const row = db.select().from(t.projects).where(eq(t.projects.slug, slug)).get();
  if (!row) return undefined;
  const project = toProject(row);
  const house = db.select().from(t.houseModels).where(eq(t.houseModels.id, project.houseModelId)).get()?.data;
  const community = readCommunity(db, project.communityId) ?? COMMUNITIES[project.communityId];
  if (!house || !community) return undefined;
  const planSet = project.planSetId ? db.select().from(t.planSets).where(eq(t.planSets.id, project.planSetId)).get()?.data : undefined;
  const lotProgress = community.geo ? progressFor(community.id) : undefined;
  const lot = community.lots.find((l) => l.id === project.lotId);
  const homes = lotHomes(community.id, lot?.collection ?? null, project.modelName);
  return { project, house, community, planSet, lotProgress, homes };
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const row = getDb().select().from(t.projects).where(eq(t.projects.id, id)).get();
  return row ? toProject(row) : undefined;
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
  const community = await getCommunity(input.communityId);
  if (!community) throw new Error("Unknown community");
  const lot = community.lots.find((l) => l.id === input.lotId);
  if (!lot) throw new Error("Unknown lot");
  const db = getDb();
  return db.transaction((tx) => {
    const base = slugify(input.name);
    const taken = new Set(
      tx
        .select({ slug: t.projects.slug })
        .from(t.projects)
        .where(like(t.projects.slug, `${base}%`))
        .all()
        .map((r) => r.slug),
    );
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
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
      updatedAt: now(),
    };
    tx.insert(t.projects).values(projectRow(project)).run();
    tx.insert(t.houseModels).values({ id: houseModelId, projectId: id, data: house }).onConflictDoUpdate({ target: t.houseModels.id, set: { projectId: id, data: house } }).run();
    return project;
  });
}

function putHouseModel(db: DbOrTx, id: string, projectId: string, data: HouseModel) {
  db.insert(t.houseModels).values({ id, projectId, data }).onConflictDoUpdate({ target: t.houseModels.id, set: { projectId, data } }).run();
}

function touchProject(db: DbOrTx, id: string, patch: Partial<typeof t.projects.$inferInsert> = {}) {
  db.update(t.projects)
    .set({ ...patch, updatedAt: now() })
    .where(eq(t.projects.id, id))
    .run();
}

export async function saveHouseModel(projectId: string, model: HouseModel): Promise<void> {
  getDb().transaction((tx) => {
    const project = tx.select().from(t.projects).where(eq(t.projects.id, projectId)).get();
    if (!project) throw new Error("Unknown project");
    putHouseModel(tx, project.houseModelId, projectId, { ...model, id: project.houseModelId, projectId });
    touchProject(tx, projectId, { floorCount: model.floors.length });
  });
}

// ---------------------------------------------------------------------------
// Drawings
// ---------------------------------------------------------------------------

export async function listDrawings(projectId: string): Promise<Drawing[]> {
  await connection();
  return getDb()
    .select({ data: t.drawings.data })
    .from(t.drawings)
    .where(eq(t.drawings.projectId, projectId))
    .orderBy(desc(t.drawings.createdAt))
    .all()
    .map((r) => r.data);
}

export async function getDrawing(id: string): Promise<Drawing | undefined> {
  return getDb().select({ data: t.drawings.data }).from(t.drawings).where(eq(t.drawings.id, id)).get()?.data;
}

export async function createDrawing(drawing: Drawing): Promise<Drawing> {
  getDb().transaction((tx) => {
    tx.insert(t.drawings).values(drawingRow(drawing)).run();
    touchProject(tx, drawing.projectId);
  });
  return drawing;
}

export async function updateDrawing(id: string, patch: Partial<Omit<Drawing, "id" | "projectId">>): Promise<Drawing> {
  return getDb().transaction((tx) => {
    const current = tx.select({ data: t.drawings.data }).from(t.drawings).where(eq(t.drawings.id, id)).get()?.data;
    if (!current) throw new Error("Unknown drawing");
    const next: Drawing = { ...current, ...patch, updatedAt: now() };
    tx.update(t.drawings).set(drawingRow(next)).where(eq(t.drawings.id, id)).run();
    return next;
  });
}

export async function deleteDrawing(id: string): Promise<Drawing | undefined> {
  return getDb().delete(t.drawings).where(eq(t.drawings.id, id)).returning({ data: t.drawings.data }).get()?.data;
}

// ---------------------------------------------------------------------------
// Drawing sets
// ---------------------------------------------------------------------------

export async function savePlanSet(planSet: PlanSet): Promise<void> {
  const row = { id: planSet.id, projectId: planSet.projectId, data: planSet };
  getDb().insert(t.planSets).values(row).onConflictDoUpdate({ target: t.planSets.id, set: row }).run();
}

export async function getPlanSet(id: string): Promise<PlanSet | undefined> {
  return getDb().select().from(t.planSets).where(eq(t.planSets.id, id)).get()?.data;
}

/** Make a plan set the source of a project's home; the standard plan becomes the saved model. */
export async function applyPlanSet(projectId: string, planSetId: string): Promise<Project> {
  return getDb().transaction((tx) => {
    const row = tx.select().from(t.projects).where(eq(t.projects.id, projectId)).get();
    const set = tx.select().from(t.planSets).where(eq(t.planSets.id, planSetId)).get()?.data;
    if (!row || !set || set.projectId !== projectId) throw new Error("Unknown project or drawing set");
    const house = composeHouseModel(set, defaultPlanSelection(set), { id: row.houseModelId, projectId, name: row.modelName });
    putHouseModel(tx, row.houseModelId, projectId, house);
    touchProject(tx, projectId, { planSetId, floorCount: house.floors.length });
    return toProject(tx.select().from(t.projects).where(eq(t.projects.id, projectId)).get()!);
  });
}

/** Replace reviewed floor geometry in a plan set (from the tracing editor). */
export async function updatePlanSetVariants(planSetId: string, floors: { variantId: string; floor: Floor; sheetOrigin?: { x: number; y: number }; metresPerPixel?: number }[]): Promise<void> {
  getDb().transaction((tx) => {
    const set = tx.select().from(t.planSets).where(eq(t.planSets.id, planSetId)).get()?.data;
    if (!set) throw new Error("Unknown drawing set");
    for (const u of floors) {
      const v = set.variants.find((x) => x.id === u.variantId);
      if (!v) continue;
      v.floor = u.floor;
      v.reviewed = !u.floor.walls.some((w) => w.unverified) && !u.floor.doors.some((d) => d.unverified) && !u.floor.windows.some((w) => w.unverified);
      if (v.reviewed) v.confidence = Math.max(v.confidence, 0.85);
      if (u.sheetOrigin) v.sheet = { ...v.sheet, originPx: u.sheetOrigin };
      if (u.metresPerPixel) v.sheet = { ...v.sheet, metresPerPixel: u.metresPerPixel };
    }
    tx.update(t.planSets).set({ data: set }).where(eq(t.planSets.id, planSetId)).run();
    const project = tx
      .select()
      .from(t.projects)
      .where(and(eq(t.projects.id, set.projectId), eq(t.projects.planSetId, planSetId)))
      .get();
    if (project) {
      putHouseModel(tx, project.houseModelId, project.id, composeHouseModel(set, defaultPlanSelection(set), { id: project.houseModelId, projectId: project.id, name: project.modelName }));
      touchProject(tx, project.id);
    }
  });
}

// ---------------------------------------------------------------------------
// Real communities + construction progress
// ---------------------------------------------------------------------------

export async function saveCommunity(community: Community, opts: { seedDemoProgress?: boolean } = {}): Promise<void> {
  getDb().transaction((tx) => {
    writeCommunity(tx, community);
    // Drop sample progress for lots that no longer exist after a re-import (real entries are kept).
    const ids = community.lots.map((l) => l.id);
    tx.delete(t.lotProgress)
      .where(and(eq(t.lotProgress.communityId, community.id), eq(t.lotProgress.demo, true), ids.length ? notInArray(t.lotProgress.lotId, ids) : undefined))
      .run();
    if (opts.seedDemoProgress) {
      for (const lot of community.lots) {
        if (lot.status !== "sold") continue;
        tx.insert(t.lotProgress)
          .values(lotProgressRow(demoProgress(community.id, lot.id, community.id + lot.number)))
          .onConflictDoNothing()
          .run();
      }
    }
  });
}

export async function listLotProgress(communityId: string): Promise<Record<string, LotProgress>> {
  await connection();
  return progressFor(communityId);
}

export async function saveLotProgress(p: LotProgress): Promise<LotProgress> {
  const row = lotProgressRow(p);
  getDb()
    .insert(t.lotProgress)
    .values(row)
    .onConflictDoUpdate({ target: [t.lotProgress.communityId, t.lotProgress.lotId], set: row })
    .run();
  return p;
}

/** Mark a lot as sold to a project (used when a project is placed on a real lot). */
export async function setLotStatus(communityId: string, lotId: string, status: NonNullable<Community["lots"][number]["status"]>): Promise<void> {
  getDb().transaction((tx) => {
    const lot = tx
      .select({ data: t.lots.data })
      .from(t.lots)
      .where(and(eq(t.lots.communityId, communityId), eq(t.lots.id, lotId)))
      .get()?.data;
    if (!lot) return;
    tx.update(t.lots)
      .set({ status, data: { ...lot, status } })
      .where(and(eq(t.lots.communityId, communityId), eq(t.lots.id, lotId)))
      .run();
  });
}

export async function saveImportJob(job: CommunityImportJob): Promise<void> {
  const row = importJobRow(job);
  getDb().insert(t.communityImports).values(row).onConflictDoUpdate({ target: t.communityImports.id, set: row }).run();
}

export async function getImportJob(id: string): Promise<CommunityImportJob | undefined> {
  return getDb().select({ data: t.communityImports.data }).from(t.communityImports).where(eq(t.communityImports.id, id)).get()?.data;
}

export async function listImportJobs(): Promise<CommunityImportJob[]> {
  await connection();
  return getDb()
    .select({ data: t.communityImports.data })
    .from(t.communityImports)
    .all()
    .map((r) => r.data);
}

// ---------------------------------------------------------------------------
// Property catalogue: real homes and photography (linked from caivan.com)
// ---------------------------------------------------------------------------

function toPhoto(r: typeof t.photos.$inferSelect): PhotoView {
  return { id: r.id, kind: r.kind as PhotoKind, url: r.url, caption: r.caption, linkUrl: r.linkUrl, sourceUrl: r.sourceUrl, collectionId: r.collectionId, designId: r.designId };
}

function catalogViews(where?: SQL): CatalogCommunityView[] {
  const db = getDb();
  const rows = db.select().from(t.catalogCommunities).where(where).orderBy(asc(t.catalogCommunities.sort)).all();
  const photoCounts = new Map(
    db
      .select({ id: t.photos.communityId, n: sql<number>`count(*)` })
      .from(t.photos)
      .groupBy(t.photos.communityId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  const designCounts = new Map(
    db
      .select({ id: t.homeDesigns.communityId, n: sql<number>`count(*)` })
      .from(t.homeDesigns)
      .groupBy(t.homeDesigns.communityId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  const prices = new Map(
    db
      .select({ id: t.catalogCollections.communityId, p: sql<number | null>`min(${t.catalogCollections.priceFrom})` })
      .from(t.catalogCollections)
      .groupBy(t.catalogCollections.communityId)
      .all()
      .map((r) => [r.id, r.p]),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region as CatalogCommunityView["region"],
    city: r.city,
    pageUrl: r.pageUrl,
    sitePlanPdf: r.sitePlanPdf,
    blurb: r.blurb,
    description: r.description,
    heroUrl: r.heroUrl,
    logoUrl: r.logoUrl,
    salesCentre: r.salesCentre,
    collectionNames: r.collectionNames,
    scrapedAt: r.scrapedAt,
    photoCount: photoCounts.get(r.id) ?? 0,
    designCount: designCounts.get(r.id) ?? 0,
    priceFrom: prices.get(r.id) ?? null,
  }));
}

function collectionViews(communityId: string, collectionIds?: string[]): CollectionView[] {
  const db = getDb();
  const cols = db
    .select()
    .from(t.catalogCollections)
    .where(and(eq(t.catalogCollections.communityId, communityId), collectionIds ? inArray(t.catalogCollections.id, collectionIds) : undefined))
    .orderBy(asc(t.catalogCollections.sort))
    .all();
  if (!cols.length) return [];
  const ids = cols.map((c) => c.id);
  const designs = db.select().from(t.homeDesigns).where(inArray(t.homeDesigns.collectionId, ids)).orderBy(asc(t.homeDesigns.sort)).all();
  const designPhotos = designs.length
    ? db
        .select()
        .from(t.photos)
        .where(
          inArray(
            t.photos.designId,
            designs.map((d) => d.id),
          ),
        )
        .orderBy(asc(t.photos.sort))
        .all()
        .map(toPhoto)
    : [];
  // Elevations first, then the tour thumbnail and interiors.
  const rank = (p: PhotoView) => (p.kind === "elevation" ? 0 : p.kind === "virtual-tour" ? 2 : 1);
  return cols.map((c) => ({
    id: c.id,
    name: c.name,
    pageUrl: c.pageUrl,
    priceFrom: c.priceFrom,
    sqft: c.sqft,
    bedrooms: c.bedrooms,
    bathrooms: c.bathrooms,
    parking: c.parking,
    imageUrl: c.imageUrl,
    designs: designs
      .filter((d) => d.collectionId === c.id)
      .map(
        (d): HomeDesignView => ({
          id: d.id,
          collectionId: d.collectionId,
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
          photos: designPhotos.filter((p) => p.designId === d.id).sort((a, b) => rank(a) - rank(b)),
        }),
      ),
  }));
}

function communityPhotos(communityId: string): PhotoView[] {
  return getDb()
    .select()
    .from(t.photos)
    .where(and(eq(t.photos.communityId, communityId), isNull(t.photos.designId)))
    .orderBy(asc(t.photos.sort))
    .all()
    .map(toPhoto);
}

/** Every catalogue community with its hero image and counts. */
export async function listCatalog(): Promise<CatalogCommunityView[]> {
  return catalogViews();
}

/** One community's collections, home designs and photography. */
export async function getCatalogCommunity(id: string): Promise<CatalogCommunityDetail | undefined> {
  const [view] = catalogViews(eq(t.catalogCommunities.id, id));
  if (!view) return undefined;
  return { ...view, collections: collectionViews(id), photos: communityPhotos(id) };
}

/** Normalise a home name for matching a project's model to a published design. */
const designKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function lotHomes(communityId: string, collection: string | null, modelName?: string): LotHomes | undefined {
  const [community] = catalogViews(eq(t.catalogCommunities.id, communityId));
  if (!community) return undefined;
  const match = collection
    ? getDb()
        .select({ id: t.catalogCollections.id })
        .from(t.catalogCollections)
        .where(and(eq(t.catalogCollections.communityId, communityId), eq(t.catalogCollections.nameKey, collectionKey(collection))))
        .get()
    : undefined;
  const [view] = match ? collectionViews(communityId, [match.id]) : [];
  const key = modelName ? designKey(modelName) : "";
  const matched = key ? view?.designs.find((d) => designKey(d.name) === key) : undefined;
  const photos = communityPhotos(communityId).filter((p) => p.kind !== "site-plan" && p.kind !== "sales-centre");
  return { community, collection: view ?? null, matchedDesignId: matched?.id ?? null, photos };
}

/**
 * A real photo for each project's card: the published rendering of its model
 * when the name matches a design, else its lot's collection, else the
 * community's hero image.
 */
export async function listProjectCovers(projects: Project[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const communities = new Map<string, Community | undefined>();
  for (const p of projects) {
    if (!communities.has(p.communityId)) communities.set(p.communityId, readCommunity(getDb(), p.communityId));
    const lot = communities.get(p.communityId)?.lots.find((l) => l.id === p.lotId);
    const homes = lotHomes(p.communityId, lot?.collection ?? null, p.modelName);
    if (!homes) continue;
    const design = homes.collection?.designs.find((d) => d.id === homes.matchedDesignId);
    const url = design?.photos[0]?.url ?? homes.collection?.imageUrl ?? homes.community.heroUrl;
    if (url) out[p.id] = url;
  }
  return out;
}

/** The real homes that can be built on a lot (from its site-plan collection). */
export async function getLotHomes(communityId: string, collection: string | null): Promise<LotHomes | undefined> {
  return lotHomes(communityId, collection);
}

/** Replace catalogue data with a scraped snapshot. Returns how many communities were written. */
export async function saveCatalogSnapshot(snapshot: CatalogSnapshot): Promise<number> {
  let n = 0;
  getDb().transaction((tx) => {
    CAIVAN_COMMUNITIES.forEach((entry, i) => {
      const page = snapshot.communities.find((c) => c.id === entry.id);
      if (!page) return;
      writeCatalogCommunity(tx, entry, i, page);
      n++;
    });
  });
  return n;
}

/** Re-read one community from caivan.com and store it. */
export async function syncCatalogCommunity(id: string): Promise<CatalogCommunityDetail> {
  const i = CAIVAN_COMMUNITIES.findIndex((c) => c.id === id);
  if (i < 0) throw new Error("Unknown community");
  const entry = CAIVAN_COMMUNITIES[i];
  const page = await scrapeCommunity(entry.id, entry.url);
  getDb().transaction((tx) => writeCatalogCommunity(tx, entry, i, page));
  return (await getCatalogCommunity(id))!;
}
