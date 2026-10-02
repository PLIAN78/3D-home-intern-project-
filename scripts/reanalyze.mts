// Re-read projects' drawing sets with the current pipeline and regenerate their homes.
//   npm run reanalyze -- [projectSlug ...]   (no slugs: every project built from a drawing set)
// Projects whose set has hand-reviewed floors are skipped unless --force is given,
// since re-reading would replace the reviewed geometry.
import { eq, isNotNull } from "drizzle-orm";
import { applyPlanSet, getDrawing, getPlanSet } from "@/lib/data/repository";
import { getDb, schema } from "@/lib/db/client";
import { runCombinedAnalysis, runDrawingSetAnalysis } from "@/lib/drawings/planSet/analysisJob";

const args = process.argv.slice(2);
const force = args.includes("--force");
const slugs = args.filter((a) => !a.startsWith("--"));
const db = getDb();
const projects = db
  .select()
  .from(schema.projects)
  .where(isNotNull(schema.projects.planSetId))
  .all()
  .filter((p) => !slugs.length || slugs.includes(p.slug));

for (const p of projects) {
  const set = await getPlanSet(p.planSetId!);
  const drawing = set && (await getDrawing(set.sourceDrawingId));
  if (!set || !drawing) {
    console.log(`${p.slug}: skipped — the source drawing is no longer stored`);
    continue;
  }
  if (!force && set.variants.some((v) => v.reviewed)) {
    console.log(`${p.slug}: skipped — has reviewed floors (use --force to replace them)`);
    continue;
  }
  const t0 = Date.now();
  // Combined sets are re-read as the same redline + décor pair.
  const decor = set.sources && (await getDrawing(set.sources.decorDrawingId));
  if (set.sources && !decor) {
    console.log(`${p.slug}: skipped — the décor drawing is no longer stored`);
    continue;
  }
  if (decor) await runCombinedAnalysis(drawing.id, decor.id);
  else await runDrawingSetAnalysis(drawing.id);
  const after = await getDrawing(drawing.id);
  if (after?.analysis?.status !== "done" || !after.analysis.planSetId) {
    console.log(`${p.slug}: analysis failed — ${after?.analysis?.error ?? "unknown error"}`);
    continue;
  }
  await applyPlanSet(p.id, after.analysis.planSetId);
  // The replaced set is no longer referenced.
  if (after.analysis.planSetId !== set.id) db.delete(schema.planSets).where(eq(schema.planSets.id, set.id)).run();
  const next = (await getPlanSet(after.analysis.planSetId))!;
  console.log(`${p.slug}: ${next.variants.length} floor plans, ${next.elevations.length} elevations (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
