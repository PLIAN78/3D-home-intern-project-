"use client";

import type { ProjectBundle } from "@/lib/data/repository";
import { MaterialPanel } from "@/components/configurator/MaterialPanel";
import { ProjectSidebar } from "./ProjectSidebar";
import { StudioHeader } from "./StudioHeader";
import { ViewerStage } from "./ViewerStage";
import { useConfigHydration } from "./useConfigHydration";

/** Internal (architecture / sales team) workspace. */
export function StudioShell({ bundle }: { bundle: ProjectBundle }) {
  useConfigHydration(bundle.project.id);
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <StudioHeader bundle={bundle} />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[300px] shrink-0 border-r bg-background lg:block">
          <ProjectSidebar bundle={bundle} />
        </aside>
        <main className="min-w-0 flex-1">
          <ViewerStage bundle={bundle} variant="studio" />
        </main>
        <aside className="hidden w-[340px] shrink-0 border-l bg-background md:block">
          <MaterialPanel projectId={bundle.project.id} modelName={bundle.project.modelName} />
        </aside>
      </div>
    </div>
  );
}
