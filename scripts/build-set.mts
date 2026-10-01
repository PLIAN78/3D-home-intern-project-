// Dev tool: run the full drawing-set → PlanSet pipeline and summarise it.
// Usage: npx tsx scripts/build-set.mts <file.pdf> [outDir]
import fs from "node:fs";
import path from "node:path";
import { buildPlanSet } from "@/lib/drawings/planSet/buildPlanSet";
import { composeHouseModel, defaultPlanSelection, LEVEL_LABEL } from "@/lib/models/planSet";

const [file, outDir] = process.argv.slice(2);
const t0 = performance.now();
const set = await buildPlanSet({
  pdf: fs.readFileSync(file),
  projectId: "dev",
  drawingId: "dev-drawing",
  putRaster: async (page, png) => {
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `sheet-${page}.png`), png);
    }
    return `dev/sheet-${page}.png`;
  },
  onProgress: (p) => process.stdout.write(`\r${p.stage.padEnd(60)} ${p.done}/${p.total}   `),
});
console.log(`\n\nBuilt in ${((performance.now() - t0) / 1000).toFixed(1)} s · model ${set.modelCode} · ${set.pageCount} sheets`);
console.log(`scale ${(set.scale.metresPerPixel * 1000).toFixed(2)} mm/px via ${set.scale.source} (support ${set.scale.support})`);
console.log(`elevations: ${set.elevations.map((e) => e.label).join(", ")}`);
console.log(`levels: ${set.levels.join(", ")}`);
console.log(`options: ${set.options.map((o) => `${LEVEL_LABEL[o.levelId]}: ${o.name}`).join(" | ")}`);
for (const v of set.variants) {
  const f = v.floor;
  const xs = f.walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = f.walls.flatMap((w) => [w.start.y, w.end.y]);
  console.log(
    `  p${String(v.page).padStart(2)} ${v.elevationId.padEnd(8)} ${v.levelId.padEnd(8)} ${(v.optionId ?? "standard").padEnd(16)} ${String(f.walls.length).padStart(3)}w ${String(f.doors.length).padStart(2)}d ${String(f.windows.length).padStart(2)}win ${String(f.rooms.length).padStart(2)}r  x ${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)} y ${Math.min(...ys).toFixed(1)}–${Math.max(...ys).toFixed(1)}  conf ${v.confidence}${v.warnings.length ? "  ! " + v.warnings.filter((w) => !w.startsWith("Ignored")).join(" / ") : ""}`,
  );
}
console.log(`unmodeled: ${set.unmodeled.map((u) => `p${u.page} (${u.reason})`).join(", ")}`);
const house = composeHouseModel(set, defaultPlanSelection(set), { id: "h", projectId: "dev", name: "Test" });
console.log(`\ncomposed default: ${house.floors.map((f) => `${f.name} el ${f.elevation} (${f.walls.length} walls)`).join(", ")} · roofs ${house.exterior.roofs.length} · confidence ${house.provenance.confidence}`);
if (outDir) fs.writeFileSync(path.join(outDir, "planset.json"), JSON.stringify(set, null, 1));
