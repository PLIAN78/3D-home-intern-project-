import fs from "node:fs";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { eq } from "drizzle-orm";
import snapshotJson from "@/lib/catalog/caivanCatalog.snapshot.json";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { Community } from "@/lib/models/community";
import type { CommunityImportJob } from "@/lib/models/communityImport";
import type { LotProgress } from "@/lib/models/construction";
import type { Drawing } from "@/lib/models/drawing";
import type { HouseModel } from "@/lib/models/house";
import type { PlanSet } from "@/lib/models/planSet";
import type { Project } from "@/lib/models/project";
import { CAIVAN_COMMUNITIES } from "@/lib/sample/caivanCommunities";
import { PLAN_36 } from "@/lib/sample/plan36";
import { DATA_DIR } from "@/lib/storage/objectStorage";
import type { Db } from "./client";
import { drawingRow, importJobRow, lotProgressRow, projectRow, writeCatalogCommunity, writeCommunity } from "./rows";
import * as t from "./schema";

export const CATALOG_SNAPSHOT = snapshotJson as unknown as CatalogSnapshot;

export const SEED_PROJECT: Project = {
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
};

/** The JSON document store this database replaced (`.data/db.json`). */
interface LegacyDatabase {
  projects: Project[];
  houseModels: Record<string, HouseModel>;
  drawings: Drawing[];
  planSets?: Record<string, PlanSet>;
  communities?: Record<string, Community>;
  lotProgress?: Record<string, LotProgress>;
  communityImports?: Record<string, CommunityImportJob>;
}

const LEGACY_FILE = path.join(DATA_DIR, "db.json");

function done(db: Db, key: string) {
  return !!db.select().from(t.meta).where(eq(t.meta.key, key)).get();
}

function mark(db: Db, key: string) {
  db.insert(t.meta).values({ key, value: new Date().toISOString() }).onConflictDoNothing().run();
}

function importLegacy(db: Db, legacy: LegacyDatabase) {
  for (const p of legacy.projects) db.insert(t.projects).values(projectRow(p)).onConflictDoNothing().run();
  for (const [id, house] of Object.entries(legacy.houseModels)) db.insert(t.houseModels).values({ id, projectId: house.projectId ?? null, data: house }).onConflictDoNothing().run();
  for (const d of legacy.drawings) db.insert(t.drawings).values(drawingRow(d)).onConflictDoNothing().run();
  for (const s of Object.values(legacy.planSets ?? {})) db.insert(t.planSets).values({ id: s.id, projectId: s.projectId, data: s }).onConflictDoNothing().run();
  for (const c of Object.values(legacy.communities ?? {})) writeCommunity(db, c);
  for (const p of Object.values(legacy.lotProgress ?? {})) db.insert(t.lotProgress).values(lotProgressRow(p)).onConflictDoNothing().run();
  for (const j of Object.values(legacy.communityImports ?? {})) db.insert(t.communityImports).values(importJobRow(j)).onConflictDoNothing().run();
}

/**
 * First-run data, applied once per database inside one write transaction (so
 * parallel processes can't both seed):
 * - studio data: imported from the old JSON store when present, otherwise the
 *   Plan 36 demo project;
 * - property catalogue: the Caivan communities with the photos, collections
 *   and home designs captured in the committed snapshot.
 */
export function seedDatabase(db: Db, sqlite: BetterSqlite3.Database) {
  let migratedLegacy = false;
  sqlite
    .transaction(() => {
      if (!done(db, "seed:studio")) {
        const legacy = fs.existsSync(LEGACY_FILE) ? (JSON.parse(fs.readFileSync(LEGACY_FILE, "utf8")) as LegacyDatabase) : null;
        if (legacy) {
          importLegacy(db, legacy);
          migratedLegacy = true;
        } else {
          db.insert(t.projects).values(projectRow(SEED_PROJECT)).onConflictDoNothing().run();
          db.insert(t.houseModels).values({ id: PLAN_36.id, projectId: SEED_PROJECT.id, data: PLAN_36 }).onConflictDoNothing().run();
        }
        mark(db, "seed:studio");
      }
      if (!done(db, "seed:catalog")) {
        CAIVAN_COMMUNITIES.forEach((entry, i) =>
          writeCatalogCommunity(
            db,
            entry,
            i,
            CATALOG_SNAPSHOT.communities.find((c) => c.id === entry.id) ?? null,
          ),
        );
        mark(db, "seed:catalog");
      }
    })
    .immediate();
  // Keep the old file as a backup, out of the way so it isn't mistaken for live data.
  if (migratedLegacy) fs.renameSync(LEGACY_FILE, LEGACY_FILE + ".migrated");
}
