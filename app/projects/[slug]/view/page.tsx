import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { getProjectBundle } from "@/lib/data/repository";

export async function generateMetadata({ params }: PageProps<"/projects/[slug]/view">): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getProjectBundle(slug);
  return { title: bundle ? `Your ${bundle.project.modelName} · ${bundle.project.communityName}` : "Home not found" };
}

export default async function CustomerViewPage({ params, searchParams }: PageProps<"/projects/[slug]/view">) {
  const { slug } = await params;
  const { c } = await searchParams;
  const bundle = await getProjectBundle(slug);
  if (!bundle) notFound();
  return <CustomerShell bundle={bundle} encoded={typeof c === "string" ? c : null} />;
}
