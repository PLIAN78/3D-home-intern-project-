import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FloorPlanEditor } from "@/components/drawings/FloorPlanEditor";
import { getProjectBundle, listDrawings } from "@/lib/data/repository";
import { sanitizeSelection, type LevelId, type PlanSelection } from "@/lib/models/planSet";

export const metadata: Metadata = { title: "Floor plan editor · Home Studio" };

export default async function TracePage({ params, searchParams }: PageProps<"/projects/[slug]/trace">) {
  const { slug } = await params;
  const query = await searchParams;
  const bundle = await getProjectBundle(slug);
  if (!bundle) notFound();
  const drawings = await listDrawings(bundle.project.id);
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  // Drawing-set projects edit the floors of one elevation (+ chosen layouts): ?elevation=A1&layout.second=sosf-se02
  let planSelection: PlanSelection | undefined;
  if (bundle.planSet) {
    const options: PlanSelection["options"] = {};
    for (const [k, v] of Object.entries(query)) if (k.startsWith("layout.") && typeof v === "string") options[k.slice(7) as LevelId] = v;
    planSelection = sanitizeSelection(bundle.planSet, { elevationId: str(query.elevation) ?? bundle.planSet.defaultElevationId, options });
  }

  return (
    <FloorPlanEditor
      bundle={bundle}
      drawings={drawings}
      planSelection={planSelection}
      initialFloorId={str(query.floor)}
      initialDrawingId={str(query.drawing)}
    />
  );
}
