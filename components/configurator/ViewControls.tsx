"use client";

import { ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, Camera, Rotate3d, ScanEye } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useViewerStore, type CameraView } from "@/stores/viewerStore";

const VIEWS: { view: CameraView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { view: "perspective", label: "Perspective (reset)", icon: Rotate3d },
  { view: "front", label: "Front elevation", icon: ArrowUpToLine },
  { view: "rear", label: "Rear elevation", icon: ArrowDownToLine },
  { view: "left", label: "Left elevation", icon: ArrowLeftToLine },
  { view: "right", label: "Right elevation", icon: ArrowRightToLine },
  { view: "top", label: "Top view", icon: ScanEye },
];

function IconButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "flex size-9 items-center justify-center rounded-lg text-foreground/75 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            active && "bg-muted text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Floating camera toolbar: reset, elevations, top view, screenshot. */
export function ViewControls() {
  const requestView = useViewerStore((s) => s.requestView);
  const requestScreenshot = useViewerStore((s) => s.requestScreenshot);
  const setMode = useViewerStore((s) => s.setMode);
  const mode = useViewerStore((s) => s.mode);
  const last = useViewerStore((s) => s.cameraRequest.view);

  return (
    <div className="pointer-events-auto flex flex-col gap-0.5 rounded-xl border bg-background/90 p-1 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
      {VIEWS.map(({ view, label, icon: Icon }) => (
        <IconButton
          key={view}
          label={label}
          active={mode === "house" && last === view}
          onClick={() => {
            if (mode !== "house") setMode("house");
            requestView(view);
          }}
        >
          <Icon className="size-4" />
        </IconButton>
      ))}
      <span className="mx-2 my-0.5 h-px bg-border" />
      <IconButton label="Save screenshot" onClick={requestScreenshot}>
        <Camera className="size-4" />
      </IconButton>
    </div>
  );
}
