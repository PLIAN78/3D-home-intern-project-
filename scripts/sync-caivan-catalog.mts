// Refresh the property catalogue from caivan.com: every community page and its
// collection pages (home designs, elevation renderings, floorplans, virtual
// tours, community photography).
//
//   npm run catalog:sync            # write the snapshot and update the database
//   npm run catalog:sync -- --no-db # snapshot only
//
// The snapshot (lib/catalog/caivanCatalog.snapshot.json) is committed so a new
// database seeds with real photos without network access.
import fs from "node:fs";
import path from "node:path";
import { scrapeCommunity } from "@/lib/catalog/caivanScraper";
import type { CatalogSnapshot, CommunityPageData } from "@/lib/catalog/types";
import { CAIVAN_COMMUNITIES } from "@/lib/sample/caivanCommunities";

const OUT = path.join(import.meta.dirname, "..", "lib", "catalog", "caivanCatalog.snapshot.json");
const previous: CatalogSnapshot | null = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;

const communities: CommunityPageData[] = [];
for (const c of CAIVAN_COMMUNITIES) {
  console.log(`${c.name}  ${c.url}`);
  try {
    const page = await scrapeCommunity(c.id, c.url, console.log);
    console.log(`  → ${page.collections.length} collections, ${page.collections.reduce((n, x) => n + x.designs.length, 0)} designs, ${page.photos.length} photos`);
    communities.push(page);
  } catch (err) {
    // Keep what we had rather than dropping a community on a transient error.
    const old = previous?.communities.find((x) => x.id === c.id);
    console.warn(`  ! ${err instanceof Error ? err.message : err}${old ? " (keeping previous snapshot)" : ""}`);
    if (old) communities.push(old);
  }
}

const snapshot: CatalogSnapshot = { source: "https://caivan.com", scrapedAt: new Date().toISOString(), communities };
fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 1) + "\n");
console.log(`\nWrote ${path.relative(process.cwd(), OUT)}`);

if (!process.argv.includes("--no-db")) {
  const { saveCatalogSnapshot } = await import("@/lib/data/repository");
  const n = await saveCatalogSnapshot(snapshot);
  console.log(`Updated ${n} communities in the database`);
}
