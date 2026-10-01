import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewProjectForm } from "@/components/projects/NewProjectForm";
import { AppHeader } from "@/components/studio/AppHeader";
import { listCommunities, listProjects } from "@/lib/data/repository";

export const metadata: Metadata = { title: "New project · Home Studio" };

export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  const { community: initialCommunityId, lot: initialLotId } = await searchParams;
  const projects = await listProjects();
  const communities = (await listCommunities()).map((c) => ({
    id: c.id,
    name: c.name,
    lots: c.lots.map((l) => ({ id: l.id, number: l.number, status: l.status, takenBy: projects.find((p) => p.communityId === c.id && p.lotId === l.id)?.name })),
  }));
  return (
    <div className="min-h-dvh bg-gradient-to-b from-stone-50 to-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href="/">
            <ArrowLeft /> Projects
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>New home visualization project</CardTitle>
            <CardDescription>Create the project, then upload its drawings.</CardDescription>
          </CardHeader>
          <CardContent>
            <NewProjectForm communities={communities} initialCommunityId={typeof initialCommunityId === "string" ? initialCommunityId : undefined} initialLotId={typeof initialLotId === "string" ? initialLotId : undefined} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
