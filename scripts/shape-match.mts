// Dev tool: compare label-based and lot-shape georeferencing on a cached OSM context.
// Usage: npx tsx scripts/shape-match.mts <siteplan.pdf> <osm-cache.json> <guessLat> <guessLng>
import fs from "node:fs";
import { toLocal } from "@/lib/community/geo";
import type { SiteContext } from "@/lib/community/siteContext";
import { readSitePlanVectors } from "@/lib/community/sitePlan/readVectors";
import { parseSitePlan } from "@/lib/community/sitePlan/parseSitePlan";
import { applySimilarity, georeferenceSitePlan } from "@/lib/community/sitePlan/georeference";
import { lotFitQuality, shapeMatchSitePlan } from "@/lib/community/sitePlan/shapeMatch";
const [file, cache, lat, lng] = process.argv.slice(2);
const plan = parseSitePlan(await readSitePlanVectors(fs.readFileSync(file)));
const ctx = JSON.parse(fs.readFileSync(cache, "utf8")) as SiteContext;
const guess = toLocal(ctx.origin, { lat: Number(lat), lng: Number(lng) });
const named = georeferenceSitePlan(plan, ctx.roads, { scaleHint: plan.metresPerPointHint });
console.log("names:", named && { ...named.transform, rms: named.rmsMetres, conf: named.confidence });
const t0 = Date.now();
const shape = shapeMatchSitePlan(process.env.NO_LABELS ? { ...plan, streets: [] } : plan, ctx.roads, { guess: [guess.x, guess.y], scaleHint: plan.metresPerPointHint, searchRadius: Number(process.env.R ?? 450), buildings: ctx.buildings });
console.log(`shapes (${Date.now() - t0} ms):`, shape && { ...shape.transform, rms: shape.rmsMetres, conf: shape.confidence, inliers: shape.inlierFraction, labels: shape.matchedLabels });
if (named) console.log("lot fit at named pose:", lotFitQuality(plan, ctx.roads, named.transform));
if (shape) console.log("lot fit at shape pose:", lotFitQuality(plan, ctx.roads, shape.transform));
if (named && shape) {
  const d = plan.lots.map((l) => {
    const cx = l.points.reduce((a, p) => a + p[0], 0) / l.points.length;
    const cy = l.points.reduce((a, p) => a + p[1], 0) / l.points.length;
    const a = applySimilarity(named.transform, cx, cy);
    const b = applySimilarity(shape.transform, cx, cy);
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }).sort((x, y) => x - y);
  console.log(`lot centre disagreement: median ${d[Math.floor(d.length / 2)].toFixed(1)} m, 90% ${d[Math.floor(d.length * 0.9)].toFixed(1)} m`);
}
