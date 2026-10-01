import Link from "next/link";
import { ArrowRight, Box, Eye, FileUp, Layers, Map as MapIcon, Palette, Plus } from "lucide-react";
import type { ProjectStatus } from "@/lib/models/project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/studio/AppHeader";
import { listProjects } from "@/lib/data/repository";

const STATUS_LABEL: Record<ProjectStatus, string> = { draft: "Draft", "in-review": "In review", "ready-for-sales": "Ready for sales" };

const STEPS = [
  { icon: FileUp, title: "Upload & trace", body: "Upload PDFs or images, auto-extract walls, review and trace in 2D.", status: "Live" },
  { icon: Box, title: "Generate 3D", body: "Procedural walls, floors, openings and roofs from structured JSON.", status: "Live" },
  { icon: Palette, title: "Configure finishes", body: "Brick, stone, siding, roof, doors, flooring, cabinets.", status: "Live" },
  { icon: Layers, title: "Inspect floors", body: "Isolate levels, cutaways and the exploded “cake” view.", status: "Live" },
  { icon: MapIcon, title: "Place in community", body: "See the configured home on its lot in the neighbourhood.", status: "Live" },
];

export default async function Home() {
  const projects = await listProjects();
  return (
    <div className="min-h-dvh bg-gradient-to-b from-stone-50 to-background">
      <AppHeader active="/" />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">Home visualization projects for sales and architecture teams.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <Card key={p.id} className="overflow-hidden pt-0">
              <div className="relative h-36 bg-gradient-to-br from-sky-200 via-sky-100 to-emerald-100">
                <svg viewBox="0 0 200 90" className="absolute inset-x-0 bottom-0 h-28 w-full text-primary/80" aria-hidden>
                  <rect x="0" y="78" width="200" height="12" fill="#7a9a55" />
                  <path d="M60 50 L100 22 L140 50 Z" fill="#2b2c2e" />
                  <rect x="66" y="50" width="68" height="28" fill="#8a8781" />
                  <rect x="40" y="58" width="30" height="20" fill="#9a958b" />
                  <path d="M36 58 L55 48 L74 58 Z" fill="#2b2c2e" />
                  <rect x="44" y="64" width="22" height="14" fill="#232425" />
                  <rect x="96" y="62" width="8" height="16" fill="#1f2021" />
                  <rect x="110" y="56" width="16" height="10" fill="#a9c4d6" />
                  <rect x="76" y="56" width="14" height="10" fill="#a9c4d6" />
                </svg>
              </div>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{p.name}</CardTitle>
                  <Badge variant="outline">{STATUS_LABEL[p.status]}</Badge>
                </div>
                <CardDescription>
                  {p.communityName} · Lot {p.lotNumber} · {p.modelName} · {p.floorCount} level{p.floorCount === 1 ? "" : "s"}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Updated {new Date(p.updatedAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}</CardContent>
              <CardFooter className="gap-2">
                <Button asChild size="sm">
                  <Link href={`/projects/${p.slug}`}>
                    Open studio <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/projects/${p.slug}/view`}>
                    <Eye /> Customer view
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
          <Link href="/projects/new" className="group">
            <Card className="flex h-full items-center justify-center border-dashed bg-transparent shadow-none transition-colors group-hover:bg-muted/40">
              <CardContent className="py-10 text-center">
                <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
                  <Plus className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">New project</p>
                <p className="mt-1 text-xs text-muted-foreground">Choose a community and lot, then upload drawings.</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <h2 className="mt-12 mb-3 text-sm font-semibold tracking-tight">Workflow</h2>
        <div className="grid gap-3 sm:grid-cols-5">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-xl border bg-background p-3">
              <div className="flex items-center justify-between">
                <s.icon className="size-4 text-muted-foreground" />
                <span className={s.status === "Live" ? "text-[10px] font-semibold text-emerald-700" : "text-[10px] font-semibold text-amber-700"}>{s.status}</span>
              </div>
              <div className="mt-2 text-xs font-semibold">
                {i + 1}. {s.title}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
