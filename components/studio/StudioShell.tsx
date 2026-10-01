"use client";

import type { ProjectBundle } from "@/lib/data/repository";
import type { Drawing } from "@/lib/models/drawing";
import { MaterialPanel } from "@/components/configurator/MaterialPanel";
import { ProjectSidebar } from "./ProjectSidebar";
import { StudioHeader } from "./StudioHeader";
import { ViewerStage } from "./ViewerStage";
import { useActiveHouse } from "./useActiveHouse";
import { useConfigHydration } from "./useConfigHydration";

/** Internal (architecture / sales team) workspace. */
export function StudioShell({ bundle: saved, drawings, initialTab }: { bundle: ProjectBundle; drawings: Drawing[]; initialTab?: string }) {
  useConfigHydration(saved.project.id);
  const { bundle, selection, setSelection } = useActiveHouse(saved);
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <StudioHeader bundle={bundle} planSelection={selection} />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[300px] shrink-0 border-r bg-background lg:block">
          <ProjectSidebar bundle={bundle} drawings={drawings} initialTab={initialTab} />
        </aside>
        <main className="min-w-0 flex-1">
          <ViewerStage bundle={bundle} variant="studio" />
        </main>
        <aside className="hidden w-[340px] shrink-0 border-l bg-background md:block">
          <MaterialPanel
            // Remount when a drawing set is applied so the Plan tab opens first.
            key={bundle.planSet?.id ?? "materials"}
            projectId={bundle.project.id}
            modelName={bundle.project.modelName}
            planSet={bundle.planSet}
            planSelection={selection}
            onPlanChange={setSelection}
          />
        </aside>
      </div>
    </div>
  );
}
