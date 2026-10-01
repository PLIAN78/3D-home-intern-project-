import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FloorPlanEditor } from "@/components/drawings/FloorPlanEditor";
import { getProjectBundle, listDrawings } from "@/lib/data/repository";

export const metadata: Metadata = { title: "Floor plan editor · Home Studio" };

export default async function TracePage({ params, searchParams }: PageProps<"/projects/[slug]/trace">) {
  const { slug } = await params;
  const { floor, drawing } = await searchParams;
  const bundle = await getProjectBundle(slug);
  if (!bundle) notFound();
  const drawings = await listDrawings(bundle.project.id);
  return (
    <FloorPlanEditor
      bundle={bundle}
      drawings={drawings}
      initialFloorId={typeof floor === "string" ? floor : undefined}
      initialDrawingId={typeof drawing === "string" ? drawing : undefined}
    />
  );
}
