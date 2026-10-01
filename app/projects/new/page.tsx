import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewProjectForm } from "@/components/projects/NewProjectForm";
import { BrandMark } from "@/components/studio/BrandMark";
import { listCommunities, listProjects } from "@/lib/data/repository";

export const metadata: Metadata = { title: "New project · Home Studio" };

export default async function NewProjectPage() {
  const projects = await listProjects();
  const communities = listCommunities().map((c) => ({
    id: c.id,
    name: c.name,
    lots: c.lots.map((l) => ({ id: l.id, number: l.number, status: l.status, takenBy: projects.find((p) => p.communityId === c.id && p.lotId === l.id)?.name })),
  }));
  return (
    <div className="min-h-dvh bg-gradient-to-b from-stone-50 to-background">
      <header className="flex h-14 items-center border-b bg-background/80 px-6 backdrop-blur">
        <BrandMark subtitle="Internal" />
      </header>
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
            <NewProjectForm communities={communities} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
