// Dev tool: classify a drawing-set PDF and auto-extract its standard plans.
// Usage: npx tsx scripts/analyze-set.mts <file.pdf> [pages...] [--overlay outDir]
import fs from "node:fs";
import path from "node:path";
import { classifyPages, LEVEL_NAMES } from "@/lib/drawings/planSet/classify";
import { extractFloor } from "@/lib/drawings/planSet/extractFloor";
import { openPdf } from "@/lib/drawings/planSet/pdfServer";

const args = process.argv.slice(2);
const file = args[0];
const overlayIdx = args.indexOf("--overlay");
const outDir = overlayIdx > 0 ? args[overlayIdx + 1] : null;
const mppIdx = args.indexOf("--mpp");
const mpp = mppIdx > 0 ? Number(args[mppIdx + 1]) : undefined;
const only = args.slice(1).filter((a, i, all) => /^d+$/.test(a) && all[i - 1] !== "--mpp" && all[i - 1] !== "--overlay").map(Number);

const pdf = await openPdf(fs.readFileSync(file));
const texts = [];
for (let n = 1; n <= pdf.numPages; n++) texts.push(await pdf.pageText(n));
const info = classifyPages(texts);
for (const p of info) console.log(`p${p.page}\t${p.kind}\t${p.level ?? "-"}\t${p.elevation ?? "-"}\t${p.optionName ?? ""}\tdims:${p.roomDimensionCount}`);

const targets = only.length ? only : info.filter((p) => p.kind === "standard").map((p) => p.page);
for (const n of targets) {
  const p = info[n - 1];
  const r = await pdf.render(n);
  const t0 = performance.now();
  const ex = extractFloor(r.grey, r.text, { floorId: p.level ?? "f", floorName: LEVEL_NAMES[p.level ?? "ground"], ceilingHeight: 2.7, elevation: 0.3, basement: p.level === "basement", metresPerPixel: mpp });
  const f = ex.floor;
  const xs = f.walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = f.walls.flatMap((w) => [w.start.y, w.end.y]);
  console.log(
    `\n== p${n} ${p.level} ${p.elevation} (${(performance.now() - t0).toFixed(0)} ms): ${f.walls.length} walls (${f.walls.filter((w) => w.exterior).length} ext), ${f.doors.length} doors, ${f.windows.length} windows, ${f.rooms.length} rooms`,
  );
  console.log(`   scale ${(ex.metresPerPixel * 1000).toFixed(2)} mm/px via ${ex.scaleSource} (consistency ${ex.scaleConsistency?.toFixed(2)}) · size ${(Math.max(...xs) - Math.min(...xs)).toFixed(2)} × ${(Math.max(...ys) - Math.min(...ys)).toFixed(2)} m · confidence ${ex.confidence}`);
  console.log(`   rooms: ${f.rooms.map((r) => `${r.name} ${(r.polygon[1].x - r.polygon[0].x).toFixed(1)}×${(r.polygon[2].y - r.polygon[1].y).toFixed(1)}`).join(", ")}`);
  for (const w of ex.warnings) console.log(`   ! ${w}`);
  if (outDir) {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(r.png);
    const b = ex.boundsPx;
    const pad = 40;
    const c = createCanvas(Math.round(b.maxX - b.minX + pad * 2), Math.round(b.maxY - b.minY + pad * 2));
    const ctx = c.getContext("2d");
    ctx.drawImage(img, b.minX - pad, b.minY - pad, c.width, c.height, 0, 0, c.width, c.height);
    const P = (x: number, y: number) => [x / ex.metresPerPixel + pad, y / ex.metresPerPixel + pad] as const;
    ctx.globalAlpha = 0.25;
    for (const room of f.rooms) {
      ctx.fillStyle = "#22c55e";
      const [x0, y0] = P(room.polygon[0].x, room.polygon[0].y);
      const [x1, y1] = P(room.polygon[2].x, room.polygon[2].y);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    ctx.globalAlpha = 0.8;
    for (const w of f.walls) {
      ctx.strokeStyle = w.exterior ? "#2563eb" : "#ef4444";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(...P(w.start.x, w.start.y));
      ctx.lineTo(...P(w.end.x, w.end.y));
      ctx.stroke();
    }
    for (const o of [...f.doors.map((d) => ({ ...d, color: d.kind === "garage" ? "#a855f7" : d.kind === "front" ? "#f59e0b" : "#10b981" })), ...f.windows.map((w) => ({ ...w, color: "#06b6d4" }))]) {
      const w = f.walls.find((x) => x.id === o.wallId)!;
      const L = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
      const ux = (w.end.x - w.start.x) / L;
      const uy = (w.end.y - w.start.y) / L;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(...P(w.start.x + ux * (o.position - o.width / 2), w.start.y + uy * (o.position - o.width / 2)));
      ctx.lineTo(...P(w.start.x + ux * (o.position + o.width / 2), w.start.y + uy * (o.position + o.width / 2)));
      ctx.stroke();
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `p${n}.png`), await c.encode("png"));
  }
}
await pdf.close();
