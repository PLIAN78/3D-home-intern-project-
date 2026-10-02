"use client";

import Link from "next/link";
import { ArrowRight, Download, Eye, EyeOff, Focus, PencilRuler, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CutawayControls } from "@/components/configurator/CutawayControls";
import { useState } from "react";
import { DrawingList } from "@/components/drawings/DrawingList";
import { DrawingSetDialog, type DrawingSetRequest } from "@/components/drawings/DrawingSetDialog";
import { DrawingSetUpload } from "@/components/drawings/DrawingSetUpload";
import { DrawingUploader } from "@/components/drawings/DrawingUploader";
import { LotHomesList } from "@/components/catalog/LotHomesList";
import { PhotoLightbox } from "@/components/catalog/PhotoGallery";
import { RemotePhoto } from "@/components/catalog/RemotePhoto";
import type { Drawing } from "@/lib/models/drawing";
import type { ProjectStatus } from "@/lib/models/project";
import type { ProjectBundle } from "@/lib/data/repository";
import { floorArea, isLivingRoom, polygonArea, sortedFloors, SQ_M_TO_SQ_FT, type Floor, type GeometrySource } from "@/lib/models/house";
import { cn } from "@/lib/utils";
import { isFloorVisible, useViewerStore } from "@/stores/viewerStore";

const sqft = (m2: number) => Math.round(m2 * SQ_M_TO_SQ_FT).toLocaleString();
const feetInches = (m: number) => {
  const inches = Math.round(m * 39.3701);
  return `${Math.floor(inches / 12)}′-${inches % 12}″`;
};

/** Finished area, or gross area flagged as unfinished (e.g. basements). */
function areaLabel(f: Floor) {
  if (!f.walls.length) return "Not traced yet";
  if (!f.rooms.length) return "No rooms defined";
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

const SOURCE_LABEL: Record<GeometrySource, string> = {
  "demo-seed": "Demo data",
  interpreted: "Traced automatically",
  "manual-trace": "Traced by hand",
};

const STATUS_LABEL: Record<ProjectStatus, string> = { draft: "Draft", "in-review": "In review", "ready-for-sales": "Ready for sales" };

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{children}</h3>;
}


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
                    <Button asChild variant="ghost" size="icon-sm" aria-label={`Trace ${f.name}`}>
                      <Link href={`/projects/${bundle.project.slug}/trace?floor=${f.id}`}>
                        <PencilRuler />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Trace / edit plan</TooltipContent>
                </Tooltip>
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
          <ShieldAlert className="size-3.5" /> {SOURCE_LABEL[house.provenance.source]}
          {house.provenance.source !== "demo-seed" && <span className="ml-auto font-normal whitespace-nowrap">{Math.round(house.provenance.confidence * 100)}% confidence</span>}
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

function DrawingsTab({ bundle, drawings }: { bundle: ProjectBundle; drawings: Drawing[] }) {
  const floors = sortedFloors(bundle.house);
  const toReview = drawings.filter((d) => d.processingStatus === "needs-review").length;
  const [request, setRequest] = useState<DrawingSetRequest | null>(null);
  const [single, setSingle] = useState(false);
  // Reopen an analysed drawing: follow its pair's analysis, which the redline carries.
  const openSet = (id: string) => {
    const d = drawings.find((x) => x.id === id);
    const partner = d?.analysis?.partnerDrawingId;
    if (!d) return;
    const redlineId = partner && d.category !== "redline" ? partner : d.id;
    setRequest({ pollId: redlineId, names: [d.fileName] });
  };
  return (
    <div className="space-y-4">
      <DrawingSetUpload
        projectId={bundle.project.id}
        drawings={drawings}
        onBuild={({ redline, decor }) => setRequest({ pollId: redline.id, start: { redlineId: redline.id, decorId: decor.id }, names: [redline.fileName, decor.fileName] })}
      />
      <DrawingSetDialog projectId={bundle.project.id} projectSlug={bundle.project.slug} request={request} onOpenChange={(open) => !open && setRequest(null)} />
      <div>
        <button type="button" onClick={() => setSingle((v) => !v)} className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          {single ? "Hide" : "Or trace single floor plans by hand"}
        </button>
        {single && (
          <div className="mt-2">
            <DrawingUploader projectId={bundle.project.id} floors={floors} />
          </div>
        )}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <SectionTitle>Drawings ({drawings.length})</SectionTitle>
          {toReview > 0 && <span className="text-[10px] font-medium text-amber-700">{toReview} need review</span>}
        </div>
        <DrawingList drawings={drawings} floors={floors} projectSlug={bundle.project.slug} onOpenSet={openSet} />
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">Auto-traced plans stay marked unreviewed until saved from the editor.</p>
    </div>
  );
}

/** Real homes for the project's lot and a strip of community photos. */
function RealHomes({ bundle }: { bundle: ProjectBundle }) {
  const homes = bundle.homes!;
  const [open, setOpen] = useState<number | null>(null);
  const strip = homes.photos.slice(0, 6);
  return (
    <div className="space-y-4">
      {homes.collection && (
        <div>
          <SectionTitle>Real homes for this lot</SectionTitle>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {homes.collection.name}
            {homes.collection.priceFrom ? ` · from $${homes.collection.priceFrom.toLocaleString("en-CA")}` : ""}
          </p>
          <LotHomesList collection={homes.collection} sourceUrl={homes.community.pageUrl} highlightId={homes.matchedDesignId} />
        </div>
      )}
      {strip.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <SectionTitle>{homes.community.name} photos</SectionTitle>
            <Link href={`/communities/${homes.community.id}/homes`} className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
              All {homes.community.photoCount} <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {strip.map((p, i) => (
              <button key={p.id} type="button" onClick={() => setOpen(i)} className="overflow-hidden rounded-md" aria-label={p.caption ?? "Community photo"}>
                <RemotePhoto src={p.url} alt={p.caption ?? ""} className="aspect-square" />
              </button>
            ))}
          </div>
          <PhotoLightbox photos={strip} index={open} onIndexChange={setOpen} />
        </div>
      )}
    </div>
  );
}

function ProjectTab({ bundle }: { bundle: ProjectBundle }) {
  const { project, community } = bundle;
  const lot = community.lots.find((l) => l.id === project.lotId);
  const m = (v: number) => `${v.toFixed(1)} m (${Math.round(v * 3.281)} ft)`;
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
          <Field label="Status" value={<Badge variant="outline">{STATUS_LABEL[project.status]}</Badge>} />
        </div>
      </div>
      {lot && (
        <div>
          <SectionTitle>Lot</SectionTitle>
          <div className="divide-y">
            {lot.collection && <Field label="Collection" value={lot.collection} />}
            <Field label="Frontage" value={m(lot.width)} />
            <Field label="Depth" value={m(lot.depth)} />
            <Field label="Front setback" value={`${lot.frontSetback.toFixed(1)} m`} />
          </div>
        </div>
      )}
      {bundle.homes && <RealHomes bundle={bundle} />}
    </div>
  );
}

/** Left column of the studio: project, drawings, floors, model data. */
export function ProjectSidebar({ bundle, drawings, initialTab = "floors" }: { bundle: ProjectBundle; drawings: Drawing[]; initialTab?: string }) {
  return (
    <Tabs defaultValue={initialTab} className="flex h-full min-h-0 flex-col gap-0">
      <div className="border-b px-3 pt-3 pb-2">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="project">Project</TabsTrigger>
          <TabsTrigger value="drawings">Drawings</TabsTrigger>
          <TabsTrigger value="floors">Floors</TabsTrigger>
          <TabsTrigger value="model">Model</TabsTrigger>
        </TabsList>
      </div>
      {/* Radix wraps content in a display:table div that grows to fit long file names; keep it to the sidebar width. */}
      <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
        <div className="p-4">
          <TabsContent value="project">
            <ProjectTab bundle={bundle} />
          </TabsContent>
          <TabsContent value="drawings">
            <DrawingsTab bundle={bundle} drawings={drawings} />
          </TabsContent>
          <TabsContent value="floors">
            <FloorsTab bundle={bundle} />
          </TabsContent>
          <TabsContent value="model">
            <ModelTab bundle={bundle} />
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  );
}
