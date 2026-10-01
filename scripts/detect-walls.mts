// Run the line-detection interpreter on a PNG and print what it finds.
// Usage: node scripts/detect-walls.mts <file.png>
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { detectWalls, toGrey } from "../lib/drawings/interpreters/lineDetection.ts";

const png = PNG.sync.read(readFileSync(process.argv[2]));
const t0 = performance.now();
const r = detectWalls(toGrey(png.width, png.height, png.data));
console.log(`${png.width}x${png.height} in ${(performance.now() - t0).toFixed(0)} ms`);
console.log("stats", r.stats);
console.log(`walls ${r.walls.length} (exterior ${r.walls.filter((w) => w.exterior).length}), doors ${r.doors.length}, windows ${r.windows.length}`);
for (const w of r.walls) console.log(`  ${w.exterior ? "EXT" : "int"} (${w.start.x.toFixed(0)},${w.start.y.toFixed(0)})→(${w.end.x.toFixed(0)},${w.end.y.toFixed(0)}) t=${w.thicknessPx}`);
