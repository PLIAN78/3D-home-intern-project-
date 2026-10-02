import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CommunityDashboard } from "@/components/community/CommunityDashboard";
import { getCatalogCommunity, getCommunity, listLotProgress, listProjects } from "@/lib/data/repository";

export async function generateMetadata({ params }: PageProps<"/communities/[communityId]">): Promise<Metadata> {
  const { communityId } = await params;
  const c = await getCommunity(communityId);
  return { title: c ? `${c.name} · Communities` : "Community not found" };
}

export default async function CommunityPage({ params, searchParams }: PageProps<"/communities/[communityId]">) {
  const { communityId } = await params;
  const { lot } = await searchParams;
  const [community, progress, projects, catalog] = await Promise.all([getCommunity(communityId), listLotProgress(communityId), listProjects(), getCatalogCommunity(communityId)]);
  if (!community?.geo) {
    // Not on the map yet: show what the community sells instead.
    if (catalog) redirect(`/communities/${communityId}/homes`);
    notFound();
  }
  const lotProjects: Record<string, { slug: string; name: string }> = {};
  for (const p of projects) if (p.communityId === community.id) lotProjects[p.lotId] = { slug: p.slug, name: p.name };
  return (
    <CommunityDashboard
      community={community}
      initialProgress={progress}
      lotProjects={lotProjects}
      initialLotId={typeof lot === "string" ? lot : null}
      catalog={catalog ? { pageUrl: catalog.pageUrl, collections: catalog.collections, photoCount: catalog.photoCount } : null}
    />
  );
}
