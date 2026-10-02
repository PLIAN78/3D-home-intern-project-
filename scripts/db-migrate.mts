// Create or upgrade the database, run first-time seeding (including the
// one-off import of a legacy .data/db.json), and print row counts.
//   npm run db:migrate
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";

const db = getDb();
console.log(`Database: ${db.$client.name}`);
for (const [name, table] of Object.entries(schema)) {
  if (!table || typeof table !== "object" || !("getSQL" in table)) continue;
  const { n } = db.select({ n: sql<number>`count(*)` }).from(table as never).get() as { n: number };
  console.log(`  ${name.padEnd(20)} ${n}`);
}
