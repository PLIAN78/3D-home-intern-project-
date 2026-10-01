// Dev tool: parse a site plan, fetch OSM context around a point and georeference.
// Usage: npx tsx scripts/georef.mts <siteplan.pdf> <lat> <lng> [radius]
import fs from "node:fs";
import { readSitePlanVectors } from "@/lib/community/sitePlan/readVectors";
import { parseSitePlan } from "@/lib/community/sitePlan/parseSitePlan";
import { applySimilarity, georeferenceSitePlan } from "@/lib/community/sitePlan/georeference";
import { fetchSiteContext } from "@/lib/community/osm";
import { toLatLng } from "@/lib/community/geo";
const [file, lat, lng, radius] = process.argv.slice(2);
const plan = parseSitePlan(await readSitePlanVectors(fs.readFileSync(file)));
const origin = { lat: Number(lat), lng: Number(lng) };
const t0 = Date.now();
const ctx = await fetchSiteContext(origin, Number(radius ?? 1400));
console.log(`OSM: ${ctx.roads.length} roads, ${ctx.buildings.length} buildings, ${ctx.water.length} water, ${ctx.green.length} green (${Date.now() - t0} ms)`);
const t1 = Date.now();
const g = georeferenceSitePlan(plan, ctx.roads, { scaleHint: plan.metresPerPointHint });
console.log(`georef (${Date.now() - t1} ms):`, JSON.stringify(g, null, 1));
if (g) {
  const star = plan.lots.find((l) => l.number === "337");
  for (const l of plan.lots.filter((x) => x.number).slice(0, 4).concat(star ? [star] : [])) {
    const cx = l.points.reduce((a, p) => a + p[0], 0) / l.points.length;
    const cy = l.points.reduce((a, p) => a + p[1], 0) / l.points.length;
    const [X, Y] = applySimilarity(g.transform, cx, cy);
    const ll = toLatLng(origin, { x: X, y: Y });
    console.log(`lot ${l.number} → ${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`);
  }
}
