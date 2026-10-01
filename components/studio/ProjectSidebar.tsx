"use client";

import { Download, Eye, EyeOff, FileUp, Focus, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CutawayControls } from "@/components/configurator/CutawayControls";
import type { ProjectBundle } from "@/lib/data/repository";
import { floorArea, isLivingRoom, polygonArea, sortedFloors, SQ_M_TO_SQ_FT, type Floor } from "@/lib/models/house";
import { cn } from "@/lib/utils";
import { isFloorVisible, useViewerStore } from "@/stores/viewerStore";

const sqft = (m2: number) => Math.round(m2 * SQ_M_TO_SQ_FT).toLocaleString();
const feetInches = (m: number) => {
  const inches = Math.round(m * 39.3701);
  return `${Math.floor(inches / 12)}′-${inches % 12}″`;
};

/** Finished area, or gross area flagged as unfinished (e.g. basements). */
function areaLabel(f: Floor) {
  const living = floorArea(f, isLivingRoom);
  if (living > 0) return `${sqft(living)} sq ft`;
  return `Unfinished · ${sqft(floorArea(f))} sq ft`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{children}</h3>;
}

const DRAWING_TYPES = ["Floor Plan", "Elevation", "Redline", "Décor", "Structural", "Other"];

function FloorsTab({ bundle }: { bundle: ProjectBundle }) {
  const isolated = useViewerStore((s) => s.isolated);
  const hiddenFloors = useViewerStore((s) => s.hiddenFloors);
  const { toggleFloorHidden, isolate, setMode } = useViewerStore.getState();
  const floors = [...sortedFloors(bundle.house)].reverse();
  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>Levels</SectionTitle>
        <div className="space-y-1.5">
          {floors.map((f) => {
            const visible = isFloorVisible({ isolated, hiddenFloors }, f.id);
            return (
              <div key={f.id} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors", isolated === f.id && "border-brand bg-brand/5")}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">{f.shortName ?? f.name[0]}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{f.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {areaLabel(f)} · {feetInches(f.ceilingHeight)}
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Isolate ${f.name}`}
                      onClick={() => {
                        setMode("house");
                        isolate(isolated === f.id ? null : f.id);
                      }}
                    >
                      <Focus className={cn(isolated === f.id && "text-brand")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Isolate</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={visible ? `Hide ${f.name}` : `Show ${f.name}`} onClick={() => toggleFloorHidden(f.id)}>
                      {visible ? <Eye /> : <EyeOff className="text-muted-foreground" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{visible ? "Hide" : "Show"}</TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <SectionTitle>Cutaway</SectionTitle>
        <CutawayControls />
      </div>
    </div>
  );
}

function ModelTab({ bundle }: { bundle: ProjectBundle }) {
  const { house } = bundle;
  const floors = sortedFloors(house);
  const counts = floors.reduce(
    (acc, f) => ({ walls: acc.walls + f.walls.length, doors: acc.doors + f.doors.length, windows: acc.windows + f.windows.length, rooms: acc.rooms + f.rooms.length }),
    { walls: 0, doors: 0, windows: 0, rooms: 0 },
  );
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(house, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${house.id}.house.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <ShieldAlert className="size-3.5" /> Geometry source: demo seed data
        </div>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] leading-snug">
          {house.provenance.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-muted/60 py-2">
            <div className="text-base font-semibold">{v}</div>
            <div className="text-[10px] text-muted-foreground capitalize">{k}</div>
          </div>
        ))}
      </div>
      <div>
        <SectionTitle>Room schedule</SectionTitle>
        {[...floors].reverse().map((f) => (
          <div key={f.id} className="mb-3">
            <div className="flex items-center justify-between py-1 text-xs font-semibold">
              <span>{f.name}</span>
              <span className="text-muted-foreground">≈ {areaLabel(f)}</span>
            </div>
            <div className="divide-y rounded-md border">
              {f.rooms.map((r) => (
                <div key={r.id} className="flex justify-between px-2 py-1 text-[12px]">
                  <span>{r.name}</span>
                  <span className="text-muted-foreground tabular-nums">{sqft(polygonArea(r.polygon))}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={exportJson}>
        <Download /> Export model JSON
      </Button>
    </div>
  );
}

function DrawingsTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed p-5 text-center">
        <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
          <FileUp className="size-5 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium">No drawings uploaded</div>
        <p className="mt-1 text-xs text-muted-foreground">
          This home was generated from demo seed data. Upload &amp; tracing of PDFs and scans is the next phase.
        </p>
        <Button size="sm" className="mt-3" disabled>
          Upload drawings
        </Button>
      </div>
      <div>
        <SectionTitle>Supported categories</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {DRAWING_TYPES.map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectTab({ bundle }: { bundle: ProjectBundle }) {
  const { project, community } = bundle;
  const lot = community.lots.find((l) => l.id === project.lotId);
  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>Details</SectionTitle>
        <div className="divide-y">
          <Field label="Project" value={project.name} />
          <Field label="Community" value={project.communityName} />
          <Field label="Lot" value={project.lotNumber} />
          <Field label="Model" value={project.modelName} />
          <Field label="Floors" value={project.floorCount} />
          <Field label="Status" value={<Badge variant="outline">In review</Badge>} />
        </div>
      </div>
      {lot && (
        <div>
          <SectionTitle>Lot</SectionTitle>
          <div className="divide-y">
            <Field label="Frontage" value={`${lot.width} m (${Math.round(lot.width * 3.281)} ft)`} />
            <Field label="Depth" value={`${lot.depth} m (${Math.round(lot.depth * 3.281)} ft)`} />
            <Field label="Front setback" value={`${lot.frontSetback} m`} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Left column of the studio: project, drawings, floors, model data. */
export function ProjectSidebar({ bundle }: { bundle: ProjectBundle }) {
  return (
    <Tabs defaultValue="floors" className="flex h-full min-h-0 flex-col gap-0">
      <div className="border-b px-3 pt-3 pb-2">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="project">Project</TabsTrigger>
          <TabsTrigger value="drawings">Drawings</TabsTrigger>
          <TabsTrigger value="floors">Floors</TabsTrigger>
          <TabsTrigger value="model">Model</TabsTrigger>
        </TabsList>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          <TabsContent value="project">
            <ProjectTab bundle={bundle} />
          </TabsContent>
          <TabsContent value="drawings">
            <DrawingsTab />
          </TabsContent>
          <TabsContent value="floors">
            <FloorsTab bundle={bundle} />
          </TabsContent>
          <TabsContent value="model">
            <ModelTab bundle={bundle} />
          </TabsContent>
        </div>
      </ScrollArea>
      <Separator />
      <div className="px-4 py-2.5 text-[10px] text-muted-foreground">Home Studio · Phase 1 MVP</div>
    </Tabs>
  );
}
