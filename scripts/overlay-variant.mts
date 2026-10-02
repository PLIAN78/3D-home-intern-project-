// Dev tool: draw a plan-set variant's extracted floor over its sheet raster.
// Usage: npx tsx scripts/overlay-variant.mts <projectSlug | planset.json> <variantId> <out.png>
//   (with a planset.json from build-set.mts, sheet rasters are read from the same folder)
import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const [slug, variantId, out] = process.argv.slice(2);
const fromFile = slug.endsWith(".json");
const set = fromFile
  ? JSON.parse(fs.readFileSync(slug, "utf8"))
  : await (async () => {
      const { getDb, schema } = await import("@/lib/db/client");
      const { eq } = await import("drizzle-orm");
      const project = getDb().select().from(schema.projects).where(eq(schema.projects.slug, slug)).get();
      if (!project?.planSetId) throw new Error(`No drawing set for project ${slug}`);
      return getDb().select().from(schema.planSets).where(eq(schema.planSets.id, project.planSetId)).get()!.data;
    })();
const v = set.variants.find((x: { id: string }) => x.id === variantId);
const raster = fromFile ? path.join(path.dirname(slug), `sheet-${v.page}.png`) : path.join(".data/uploads", v.sheet.rasterKey);
const img = await loadImage(fs.readFileSync(raster));
const c = createCanvas(img.width, img.height);
const g = c.getContext("2d");
g.drawImage(img, 0, 0);
const mpp = v.sheet.metresPerPixel;
const o = v.sheet.originPx;
const P = (p: { x: number; y: number }) => [p.x / mpp + o.x, p.y / mpp + o.y] as const;
g.globalAlpha = 0.25;
for (const r of v.floor.rooms) {
  g.fillStyle = "#3b82f6";
  g.beginPath();
  r.polygon.forEach((q: { x: number; y: number }, i: number) => (i ? g.lineTo(...P(q)) : g.moveTo(...P(q))));
  g.closePath();
  g.fill();
}
g.globalAlpha = 0.85;
for (const w of v.floor.walls) {
  g.strokeStyle = w.exterior ? "#e11d48" : "#16a34a";
  g.lineWidth = Math.max(3, w.thickness / mpp);
  g.beginPath();
  g.moveTo(...P(w.start));
  g.lineTo(...P(w.end));
  g.stroke();
}
g.fillStyle = "#111";
g.globalAlpha = 1;
g.font = "bold 22px sans-serif";
g.fillText(`${slug} ${variantId} p${v.page} walls ${v.floor.walls.length} rooms ${v.floor.rooms.length} conf ${v.confidence}`, 20, 30);
fs.writeFileSync(out, c.toBuffer("image/png"));
console.log("wrote", out, img.width, img.height);
