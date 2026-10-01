"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Eye, Info, MousePointerClick, PencilRuler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasGeometry } from "@/lib/models/house";
import type { ProjectBundle } from "@/lib/data/repository";
import { FloorSelector } from "@/components/configurator/FloorSelector";
import { ViewControls } from "@/components/configurator/ViewControls";
import { cn } from "@/lib/utils";
import { useViewerStore } from "@/stores/viewerStore";

const HouseViewer = dynamic(() => import("@/components/viewer/HouseViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-sky-100 to-stone-100">
      <div className="flex items-center gap-3 rounded-full bg-white/80 px-4 py-2 text-sm text-muted-foreground shadow-sm">
        <span className="size-2 animate-ping rounded-full bg-brand" /> Building your home…
      </div>
    </div>
  ),
});

function CommunityBanner({ bundle }: { bundle: ProjectBundle }) {
  const mode = useViewerStore((s) => s.mode);
  const showBaseModel = useViewerStore((s) => s.showBaseModel);
  const setShowBaseModel = useViewerStore((s) => s.setShowBaseModel);
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-3 rounded-xl border bg-background/90 py-1.5 pr-1.5 pl-3 shadow-lg ring-1 ring-black/5 backdrop-blur-md transition-all duration-300",
        mode === "community" ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
      )}
    >
      <div className="leading-tight">
        <div className="text-xs font-semibold">{bundle.community.name}</div>
        <div className="text-[10px] text-muted-foreground">{bundle.community.phase}</div>
      </div>
      <div className="flex rounded-lg bg-muted p-0.5 text-[11px] font-medium">
        <button type="button" onClick={() => setShowBaseModel(true)} className={cn("rounded-md px-2.5 py-1 transition-colors", showBaseModel ? "bg-background shadow-sm" : "text-muted-foreground")}>
          Base model
        </button>
        <button type="button" onClick={() => setShowBaseModel(false)} className={cn("rounded-md px-2.5 py-1 transition-colors", !showBaseModel ? "bg-background shadow-sm" : "text-muted-foreground")}>
          Your home
        </button>
      </div>
    </div>
  );
}

interface ViewerStageProps {
  bundle: ProjectBundle;
  variant: "studio" | "customer";
}

/** The 3D viewport plus its floating overlays. */
export function ViewerStage({ bundle, variant }: ViewerStageProps) {
  const { project, house, community } = bundle;
  const hasSelected = useViewerStore((s) => s.selectedSlot !== null);
  const lot = community.lots.find((l) => l.id === project.lotId);

  return (
    <div className="relative h-full w-full overflow-hidden bg-stone-100">
      <HouseViewer projectId={project.id} projectName={project.name} house={house} community={community} lotId={project.lotId} />
      {!hasGeometry(house) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[2px]">
          <div className="max-w-sm rounded-2xl border bg-background p-6 text-center shadow-xl">
            <div className="text-base font-semibold">No 3D geometry yet</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {variant === "studio" ? "Upload a floor plan, extract or trace its walls, and the 3D home is generated automatically." : "This home is still being prepared. Please check back soon."}
            </p>
            {variant === "studio" && (
              <div className="mt-4 flex justify-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/projects/${project.slug}?tab=drawings`}>Upload drawings</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={`/projects/${project.slug}/trace`}>
                    <PencilRuler /> Open editor
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto rounded-xl border bg-background/90 px-3 py-2 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
            <div className="text-sm font-semibold tracking-tight">{project.modelName}</div>
            <div className="text-[11px] text-muted-foreground">
              Lot {lot?.number ?? project.lotNumber} · {community.name}
            </div>
            {variant === "studio" && (house.provenance.source === "demo-seed" || house.provenance.confidence < 0.7) && hasGeometry(house) && (
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">
                <Info className="size-3" /> {house.provenance.source === "demo-seed" ? "Demo model · approximate dimensions" : `Needs review · ${Math.round(house.provenance.confidence * 100)}% confidence`}
              </div>
            )}
          </div>
          <CommunityBanner bundle={bundle} />
          <ViewControls />
        </div>

        <div className="flex flex-col items-center gap-2">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-[11px] whitespace-nowrap text-foreground/70 shadow-sm ring-1 ring-black/5 backdrop-blur transition-opacity duration-500",
              hasSelected && "opacity-0",
            )}
          >
            <MousePointerClick className="size-3.5" /> Click a surface to customize · drag to orbit · scroll to zoom
          </div>
          <FloorSelector house={house} />
          {variant === "customer" && (
            <div className="flex items-center gap-1 rounded-full bg-background/85 px-2.5 py-0.5 text-[10px] text-foreground/70 shadow-sm backdrop-blur">
              <Eye className="size-3" /> Visualization for illustration only — finishes and dimensions may vary.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
