"use client";

import { Building2, Home, Layers, Map as MapIcon } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { sortedFloors, type HouseModel } from "@/lib/models/house";
import { ROOF_LEVEL, useViewerStore } from "@/stores/viewerStore";

function DockButton({ active, onClick, children, tooltip, className }: { active?: boolean; onClick: () => void; children: React.ReactNode; tooltip?: string; className?: string }) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/80 hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
  if (!tooltip) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function Divider() {
  return <span className="mx-1 h-6 w-px bg-border" aria-hidden />;
}

/**
 * Bottom dock: Full House / per-floor isolation / exploded "cake" view / community.
 */
export function FloorSelector({ house }: { house: HouseModel }) {
  const isolated = useViewerStore((s) => s.isolated);
  const explode = useViewerStore((s) => s.explode);
  const mode = useViewerStore((s) => s.mode);
  const hiddenFloors = useViewerStore((s) => s.hiddenFloors);
  const showRoof = useViewerStore((s) => s.showRoof);
  const { showFullHouse, isolate, toggleExploded, setExplode, setMode, requestView } = useViewerStore.getState();

  const floors = sortedFloors(house);
  const isFull = !isolated && explode === 0 && !Object.values(hiddenFloors).some(Boolean) && showRoof;

  return (
    <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-xl border bg-background/90 p-1 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
      <DockButton
        active={isFull && mode === "house"}
        onClick={() => {
          showFullHouse();
          if (mode !== "house") setMode("house");
        }}
        tooltip="Show every level"
      >
        <Home className="size-3.5" /> Full House
      </DockButton>
      <Divider />
      {floors.map((f) => (
        <DockButton
          key={f.id}
          active={isolated === f.id}
          onClick={() => {
            if (mode !== "house") setMode("house");
            isolate(isolated === f.id ? null : f.id);
          }}
          tooltip={`Isolate ${f.name}`}
        >
          {f.name}
        </DockButton>
      ))}
      <DockButton
        active={isolated === ROOF_LEVEL}
        onClick={() => {
          if (mode !== "house") setMode("house");
          isolate(isolated === ROOF_LEVEL ? null : ROOF_LEVEL);
        }}
        tooltip="Isolate roof"
      >
        Roof
      </DockButton>
      <Divider />
      <DockButton
        active={explode > 0}
        onClick={() => {
          if (mode !== "house") setMode("house");
          toggleExploded();
          if (explode === 0) requestView("perspective");
        }}
        tooltip="Separate floors like layers of a cake"
      >
        <Layers className="size-3.5" /> Exploded
      </DockButton>
      <div className={cn("flex items-center gap-2 overflow-hidden transition-all duration-300", explode > 0 ? "w-40 px-2 opacity-100" : "w-0 opacity-0")}>
        <span className="text-[10px] font-medium text-muted-foreground uppercase">Gap</span>
        <Slider value={[explode]} min={0} max={100} step={1} onValueChange={([v]) => setExplode(Math.max(1, v))} aria-label="Floor separation" />
      </div>
      <Divider />
      <DockButton active={mode === "house"} onClick={() => setMode("house")} tooltip="Close-up of your home">
        <Building2 className="size-3.5" /> House
      </DockButton>
      <DockButton active={mode === "community"} onClick={() => setMode("community")} tooltip="See your lot in the neighbourhood">
        <MapIcon className="size-3.5" /> Community
      </DockButton>
    </div>
  );
}
