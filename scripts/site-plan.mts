// Dev tool: inspect what the site-plan reader extracts. Usage: npx tsx scripts/site-plan.mts <siteplan.pdf> [page]
import fs from "node:fs";
import { readSitePlanVectors } from "@/lib/community/sitePlan/readVectors";
const [file, page] = process.argv.slice(2);
const v = await readSitePlanVectors(fs.readFileSync(file), Number(page ?? 1));
console.log(`page ${v.width.toFixed(0)}x${v.height.toFixed(0)} polygons ${v.polygons.length} texts ${v.texts.length}`);
const byFill = new Map<string, number[]>();
for (const p of v.polygons) byFill.set(p.fill, [...(byFill.get(p.fill) ?? []), p.area]);
for (const [fill, areas] of [...byFill].sort((a, b) => b[1].length - a[1].length)) {
  areas.sort((a, b) => a - b);
  console.log(`${fill}  n=${String(areas.length).padStart(4)}  area min ${areas[0].toFixed(1)} med ${areas[Math.floor(areas.length / 2)].toFixed(1)} max ${areas[areas.length - 1].toFixed(0)}`);
}
console.log("street-like texts:", v.texts.filter((t) => /(DRIVE|DR|STREET|ROAD|CRESCENT|PLACE|GROVE|MEWS|LANE|AVENUE|WAY)\b/i.test(t.str)).map((t) => `${t.str}@${t.x.toFixed(0)},${t.y.toFixed(0)} ${(t.angle * 180 / Math.PI).toFixed(0)}°`).join(" | "));
const { parseSitePlan } = await import("@/lib/community/sitePlan/parseSitePlan");
const p = parseSitePlan(v);
console.log("\ncollections:", p.collections.map((c) => `${c.name} ${c.colour} ${c.frontageFt ?? "-"}ft`).join(" | "));
const st = { sold: 0, available: 0, future: 0 } as Record<string, number>;
for (const l of p.lots) st[l.status]++;
console.log(`lots ${p.lots.length} (numbered ${p.lots.filter((l) => l.number).length})`, st, `blocks ${p.blocks.length}`);
console.log("by collection:", Object.entries(p.lots.reduce((m, l) => ({ ...m, [l.collection ?? "base"]: (m[l.collection ?? "base"] ?? 0) + 1 }), {} as Record<string, number>)));
console.log("scale hint m/pt:", p.metresPerPointHint, "title:", p.title);
console.log("sample lots:", p.lots.filter((l) => l.number).slice(0, 8).map((l) => `${l.number}:${l.collection}:${l.status}:${l.frontagePts.toFixed(1)}pt`).join(" | "));
