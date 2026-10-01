// Dev tool: where would an import centre this site plan? Usage: npx tsx scripts/locate.mts <siteplan.pdf> <city>
import fs from "node:fs";
import { readSitePlanVectors } from "@/lib/community/sitePlan/readVectors";
import { parseSitePlan } from "@/lib/community/sitePlan/parseSitePlan";
import { locateByStreets } from "@/lib/community/geocode";
const [file, city] = process.argv.slice(2);
const plan = parseSitePlan(await readSitePlanVectors(fs.readFileSync(file)));
const extent = plan.metresPerPointHint ? Math.hypot(plan.width, plan.height) * plan.metresPerPointHint * 0.55 : 1200;
console.log("streets", plan.streets.map((s) => s.name).join(", "));
console.log("radius", Math.round(Math.min(1800, Math.max(700, extent))), "extent", Math.round(extent));
console.log("located", await locateByStreets(plan.streets.map((s) => s.name), city));
