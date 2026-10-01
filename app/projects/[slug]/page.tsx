import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioShell } from "@/components/studio/StudioShell";
import { getProjectBundle } from "@/lib/data/repository";

export async function generateMetadata({ params }: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const bundle = getProjectBundle(slug);
  return { title: bundle ? `${bundle.project.name} · Home Studio` : "Project not found" };
}

export default async function ProjectStudioPage({ params }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const bundle = getProjectBundle(slug);
  if (!bundle) notFound();
  return <StudioShell bundle={bundle} />;
}
