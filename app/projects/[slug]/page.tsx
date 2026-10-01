import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@/components/studio/StudioShell";
import { getProjectBundle, listDrawings } from "@/lib/data/repository";

export async function generateMetadata({ params }: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getProjectBundle(slug);
  return { title: bundle ? `${bundle.project.name} · Home Studio` : "Project not found" };
}

export default async function ProjectStudioPage({ params, searchParams }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const bundle = await getProjectBundle(slug);
  if (!bundle) notFound();
  const drawings = await listDrawings(bundle.project.id);
  return <StudioShell bundle={bundle} drawings={drawings} initialTab={typeof tab === "string" ? tab : undefined} />;
}
