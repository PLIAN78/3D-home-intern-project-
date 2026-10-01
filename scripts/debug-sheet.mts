// Debug: raw wall candidates in a region of a PDF page. Usage: npx tsx scripts/debug-sheet.mts <pdf> <page> <x0> <y0> <x1> <y1> (fractions of page)
import fs from "node:fs";
import { detectWalls } from "@/lib/drawings/interpreters/lineDetection";
import { openPdf } from "@/lib/drawings/planSet/pdfServer";
const [file, page, ...box] = process.argv.slice(2);
const pdf = await openPdf(fs.readFileSync(file));
const r = await pdf.render(Number(page));
const [fx0, fy0, fx1, fy1] = box.map(Number);
const [x0, y0, x1, y1] = [fx0 * r.width, fy0 * r.height, fx1 * r.width, fy1 * r.height];
const d = detectWalls(r.grey, { debug: true, metresPerPixel: 0.00955 });
const inBox = (s: { axis: string; c: number; a0: number; a1: number }) => (s.axis === "h" ? s.c >= y0 && s.c <= y1 && s.a1 >= x0 && s.a0 <= x1 : s.c >= x0 && s.c <= x1 && s.a1 >= y0 && s.a0 <= y1);
console.log("raw:", d.debug!.filter(inBox).map((s) => `${s.axis} c${s.c.toFixed(0)} ${s.a0}-${s.a1} t${s.thickness}`).join("\n     "));
console.log("walls:", d.walls.filter((w) => inBox({ axis: Math.abs(w.end.y - w.start.y) < Math.abs(w.end.x - w.start.x) ? "h" : "v", c: Math.abs(w.end.y - w.start.y) < Math.abs(w.end.x - w.start.x) ? w.start.y : w.start.x, a0: Math.min(w.start.x, w.start.y, w.end.x, w.end.y), a1: Math.max(w.start.x, w.end.x, w.start.y, w.end.y) })).map((w) => `(${w.start.x.toFixed(0)},${w.start.y.toFixed(0)})→(${w.end.x.toFixed(0)},${w.end.y.toFixed(0)}) t${w.thicknessPx}`).join("\n       "));
await pdf.close();
