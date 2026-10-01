// Debug: list detected openings per wall. Usage: node scripts/detect-openings.mts <file.png>
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { detectWalls, toGrey } from "../lib/drawings/interpreters/lineDetection.ts";
const png = PNG.sync.read(readFileSync(process.argv[2]));
const r = detectWalls(toGrey(png.width, png.height, png.data));
for (const [kind, list] of [["door", r.doors], ["window", r.windows]] as const)
  for (const o of list) {
    const w = r.walls[o.wallIndex];
    console.log(kind, `wall (${w.start.x},${w.start.y})→(${w.end.x},${w.end.y})`, "pos", o.positionPx.toFixed(0), "w", o.widthPx);
  }
