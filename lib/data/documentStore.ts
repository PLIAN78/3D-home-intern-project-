import { promises as fs } from "node:fs";
import path from "node:path";
import type { HouseModel } from "@/lib/models/house";
import type { Drawing } from "@/lib/models/drawing";
import type { PlanSet } from "@/lib/models/planSet";
import type { Project } from "@/lib/models/project";
import { DATA_DIR } from "@/lib/storage/objectStorage";
import { PLAN_36 } from "@/lib/sample/plan36";

/**
 * Tiny JSON-file document store standing in for PostgreSQL in the MVP.
 * Writes are serialised and atomic (temp file + rename). The repository is the
 * only caller, so replacing this with Drizzle queries is a contained change.
 */
export interface Database {
  version: 1;
  projects: Project[];
  houseModels: Record<string, HouseModel>;
  drawings: Drawing[];
  planSets?: Record<string, PlanSet>;
}

const DB_FILE = path.join(DATA_DIR, "db.json");

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

function seed(): Database {
  return { version: 1, projects: [SEED_PROJECT], houseModels: { [PLAN_36.id]: PLAN_36 }, drawings: [], planSets: {} };
}

// Route handlers and pages can run as separate module instances, so the
// in-memory copy is only trusted while the file's mtime is unchanged.
let cache: { db: Database; mtimeMs: number } | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<Database> {
  const stat = await fs.stat(DB_FILE).catch(() => null);
  if (!stat) {
    const db = seed();
    await persist(db);
    return db;
  }
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.db;
  const db = JSON.parse(await fs.readFile(DB_FILE, "utf8")) as Database;
  cache = { db, mtimeMs: stat.mtimeMs };
  return db;
}

async function persist(db: Database) {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + "." + process.pid + "." + Date.now() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_FILE);
  const stat = await fs.stat(DB_FILE);
  cache = { db, mtimeMs: stat.mtimeMs };
}

/** Read a snapshot. Returned objects must be treated as immutable. */
export async function read<T>(fn: (db: Database) => T): Promise<T> {
  await queue;
  return fn(await load());
}

/** Apply a mutation and persist it; mutations run one at a time. */
export function write<T>(fn: (db: Database) => T): Promise<T> {
  const run = queue.then(async () => {
    const db = structuredClone(await load());
    const result = fn(db);
    await persist(db);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}
