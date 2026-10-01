"use client";

import { Download, Heart, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MaterialPanel } from "@/components/configurator/MaterialPanel";
import { BrandMark } from "@/components/studio/BrandMark";
import { buildConfiguration, customerUrl, downloadJson } from "@/components/studio/StudioHeader";
import { ViewerStage } from "@/components/studio/ViewerStage";
import { useConfigHydration } from "@/components/studio/useConfigHydration";
import type { ProjectBundle } from "@/lib/data/repository";
import { encodeSelections, useProjectStore, useSelections } from "@/stores/projectStore";

/** Customer-facing sales view: no engineering controls, just the home and its options. */
export function CustomerShell({ bundle, encoded }: { bundle: ProjectBundle; encoded?: string | null }) {
  const { project } = bundle;
  useConfigHydration(project.id, encoded);
  const selections = useSelections(project.id);
  const markSaved = useProjectStore((s) => s.markSaved);

  const share = async () => {
    const url = customerUrl(project.slug, encodeSelections(selections));
    try {
      if (navigator.share) await navigator.share({ title: `My ${project.modelName} at ${project.communityName}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied", { description: "Share it with family or your sales consultant." });
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
        <BrandMark href={`/projects/${project.slug}/view`} subtitle={project.communityName} />
        <span className="h-6 w-px bg-border" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">Your {project.modelName}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            Lot {project.lotNumber} · {project.communityName}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => downloadJson(`${project.slug}-my-selections.json`, buildConfiguration(bundle, selections))}>
            <Download /> <span className="hidden sm:inline">Summary</span>
          </Button>
          <Button variant="outline" size="sm" onClick={share}>
            <Share2 /> Share
          </Button>
          <Button
            size="sm"
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => {
              markSaved(project.id);
              toast.success("Selections saved", { description: "Your sales consultant can pick up from here." });
            }}
          >
            <Heart /> Save my home
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          <ViewerStage bundle={bundle} variant="customer" />
        </main>
        <aside className="hidden w-[340px] shrink-0 border-l md:block">
          <MaterialPanel projectId={project.id} modelName={project.modelName} variant="customer" />
        </aside>
      </div>
    </div>
  );
}
