import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { SalesCentreData } from "@/lib/catalog/types";
import type { Community, Lot } from "@/lib/models/community";
import type { CommunityImportJob } from "@/lib/models/communityImport";
import type { LotProgress } from "@/lib/models/construction";
import type { Drawing } from "@/lib/models/drawing";
import type { HouseModel } from "@/lib/models/house";
import type { PlanSet } from "@/lib/models/planSet";

/**
 * SQLite schema (Drizzle). Queried columns are real columns; deep, versioned
 * documents (house models, drawing sets, lot outlines) are JSON columns whose
 * shape is the TypeScript domain type. Swapping to PostgreSQL means changing
 * `sqliteTable` → `pgTable` and the JSON columns → `jsonb`.
 */

const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();
const bool = (name: string) => integer(name, { mode: "boolean" });

// ---------------------------------------------------------------------------
// Studio: projects, homes, drawings
// ---------------------------------------------------------------------------

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    communityId: text("community_id").notNull(),
    communityName: text("community_name").notNull(),
    lotId: text("lot_id").notNull(),
    lotNumber: text("lot_number").notNull(),
    modelName: text("model_name").notNull(),
    floorCount: integer("floor_count").notNull(),
    houseModelId: text("house_model_id").notNull(),
    planSetId: text("plan_set_id"),
    status: text("status", { enum: ["draft", "in-review", "ready-for-sales"] }).notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("projects_slug_uq").on(t.slug), index("projects_community_idx").on(t.communityId, t.lotId)],
);

export const houseModels = sqliteTable("house_models", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  data: json<HouseModel>("data").notNull(),
});

export const drawings = sqliteTable(
  "drawings",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    data: json<Drawing>("data").notNull(),
  },
  (t) => [index("drawings_project_idx").on(t.projectId, t.createdAt)],
);

export const planSets = sqliteTable(
  "plan_sets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    data: json<PlanSet>("data").notNull(),
  },
  (t) => [index("plan_sets_project_idx").on(t.projectId)],
);

// ---------------------------------------------------------------------------
// Real-world communities, lots and construction progress
// ---------------------------------------------------------------------------

/** A community placed on the real map. `data` holds everything except its lots. */
export const communities = sqliteTable("communities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  region: text("region"),
  url: text("url"),
  data: json<Omit<Community, "lots">>("data").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const lots = sqliteTable(
  "lots",
  {
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    number: text("number").notNull(),
    status: text("status"),
    collection: text("collection"),
    lat: real("lat"),
    lng: real("lng"),
    sort: integer("sort").notNull(),
    data: json<Lot>("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.id] }), index("lots_collection_idx").on(t.communityId, t.collection)],
);

export const lotProgress = sqliteTable(
  "lot_progress",
  {
    communityId: text("community_id").notNull(),
    lotId: text("lot_id").notNull(),
    stage: text("stage").notNull(),
    demo: bool("demo").notNull().default(false),
    updatedAt: text("updated_at").notNull(),
    data: json<LotProgress>("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.lotId] })],
);

export const communityImports = sqliteTable(
  "community_imports",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id").notNull(),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    data: json<CommunityImportJob>("data").notNull(),
  },
  (t) => [index("community_imports_community_idx").on(t.communityId)],
);

// ---------------------------------------------------------------------------
// Property catalogue: what each community sells, linked to real photography
// ---------------------------------------------------------------------------

export const catalogCommunities = sqliteTable("catalog_communities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  region: text("region").notNull(),
  city: text("city").notNull(),
  pageUrl: text("page_url").notNull(),
  sitePlanPdf: text("site_plan_pdf"),
  blurb: text("blurb").notNull(),
  description: text("description"),
  heroUrl: text("hero_url"),
  logoUrl: text("logo_url"),
  salesCentre: json<SalesCentreData>("sales_centre"),
  /** Collection names published for the community (before the pages are scraped). */
  collectionNames: json<string[]>("collection_names").notNull(),
  sort: integer("sort").notNull(),
  scrapedAt: text("scraped_at"),
});

export const catalogCollections = sqliteTable(
  "catalog_collections",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id")
      .notNull()
      .references(() => catalogCommunities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Normalised name used to match a lot's collection from the site plan. */
    nameKey: text("name_key").notNull(),
    pageUrl: text("page_url"),
    priceFrom: integer("price_from"),
    sqft: text("sqft"),
    bedrooms: text("bedrooms"),
    bathrooms: text("bathrooms"),
    parking: text("parking"),
    imageUrl: text("image_url"),
    sort: integer("sort").notNull(),
  },
  (t) => [index("catalog_collections_key_idx").on(t.communityId, t.nameKey)],
);

export const homeDesigns = sqliteTable(
  "home_designs",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id")
      .notNull()
      .references(() => catalogCommunities.id, { onDelete: "cascade" }),
    collectionId: text("collection_id")
      .notNull()
      .references(() => catalogCollections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    modelHome: bool("model_home").notNull(),
    soldOut: bool("sold_out").notNull(),
    sqft: integer("sqft"),
    sqftNote: text("sqft_note"),
    bedrooms: text("bedrooms"),
    bathrooms: text("bathrooms"),
    parking: text("parking"),
    floorplanPdf: text("floorplan_pdf"),
    featureSheetPdf: text("feature_sheet_pdf"),
    brochurePdf: text("brochure_pdf"),
    virtualTourUrl: text("virtual_tour_url"),
    pageUrl: text("page_url").notNull(),
    sort: integer("sort").notNull(),
  },
  (t) => [index("home_designs_collection_idx").on(t.collectionId)],
);

export const photos = sqliteTable(
  "photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    communityId: text("community_id")
      .notNull()
      .references(() => catalogCommunities.id, { onDelete: "cascade" }),
    collectionId: text("collection_id").references(() => catalogCollections.id, { onDelete: "cascade" }),
    designId: text("design_id").references(() => homeDesigns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    url: text("url").notNull(),
    caption: text("caption"),
    linkUrl: text("link_url"),
    sourceUrl: text("source_url").notNull(),
    sort: integer("sort").notNull(),
  },
  // One row per photo per design: sibling designs often share elevation renderings.
  (t) => [uniqueIndex("photos_community_design_url_uq").on(t.communityId, t.designId, t.url), index("photos_design_idx").on(t.designId), index("photos_collection_idx").on(t.collectionId)],
);

/** Key/value bookkeeping (e.g. one-time migrations that have run). */
export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
