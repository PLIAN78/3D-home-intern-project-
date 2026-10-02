import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { DATA_DIR } from "@/lib/storage/objectStorage";
import * as schema from "./schema";
import { seedDatabase } from "./seed";

/**
 * SQLite database (server only). One connection per process: Next.js can
 * evaluate this module more than once (route handlers and pages live in
 * separate module graphs), so the handle is kept on `globalThis`.
 *
 * WAL mode lets the dev server, build workers and scripts share the file;
 * `busy_timeout` makes a second process wait for a writer instead of failing.
 */

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };
/** The database or an open transaction on it. */
export type DbOrTx = BaseSQLiteDatabase<"sync", Database.RunResult, typeof schema>;

const DB_PATH = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "home-studio.db");
const MIGRATIONS = path.join(process.cwd(), "drizzle");

const g = globalThis as typeof globalThis & { __homeStudioDb?: Db };

function open(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 10000");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle(sqlite, { schema });
  // Another process (e.g. a parallel build worker) may apply the same
  // migration first; the retry then sees it as done.
  for (let attempt = 0; ; attempt++) {
    try {
      migrate(db, { migrationsFolder: MIGRATIONS });
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * (attempt + 1));
    }
  }
  seedDatabase(db, sqlite);
  return db;
}

export function getDb(): Db {
  return (g.__homeStudioDb ??= open(DB_PATH));
}

/** A fresh, isolated database (tests). */
export function openDatabase(file = ":memory:"): Db {
  return open(file);
}

export { schema };
