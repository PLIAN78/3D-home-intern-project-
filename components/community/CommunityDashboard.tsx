"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, ExternalLink, Footprints, Home, Images, MapPin, Move, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BrandMark } from "@/components/studio/BrandMark";
import { adjustPlacement, NO_DELTA, type PlacementDelta } from "@/lib/community/adjustPlacement";
import { LotHomesList } from "@/components/catalog/LotHomesList";
import { googleMapsUrl, streetViewUrl } from "@/lib/community/geo";
import { collectionKey } from "@/lib/catalog/match";
import type { CollectionView } from "@/lib/catalog/types";
import type { Community, Lot } from "@/lib/models/community";
import { BUILD_STATE_LABEL, buildState, progressPercent, type BuildState, type LotProgress } from "@/lib/models/construction";
import { cn } from "@/lib/utils";
import { DemoDataBadge, ProgressEditor, ProgressSummary, ProgressTimeline } from "./BuildProgress";
import { PlacementPanel } from "./PlacementPanel";
import type { LotColouring } from "./RealWorldScene";
import { BUILD_STATE_COLOUR, STATUS_COLOUR } from "./siteMaterials";

const CommunityViewer = dynamic(() => import("./CommunityViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-sky-100 to-stone-100">
      <div className="flex items-center gap-3 rounded-full bg-white/80 px-4 py-2 text-sm text-muted-foreground shadow-sm">
        <span className="size-2 animate-ping rounded-full bg-brand" /> Loading the community…
      </div>
    </div>
  ),
});

const STATUS_TEXT: Record<NonNullable<Lot["status"]>, string> = { available: "Available", sold: "Sold", "model-home": "Model home", selected: "Your home", future: "Future release" };
type Filter = "all" | "available" | "sold" | "building" | "ready" | "future";

function lotState(lot: Lot, p: LotProgress | undefined): BuildState {
  return p ? buildState(p) : lot.status === "sold" ? "complete" : "none";
}

/** Natural sort: 2 < 10 < TH-3 < U1. */
const collator = new Intl.Collator("en", { numeric: true });

interface Props {
  community: Community;
  initialProgress: Record<string, LotProgress>;
  lotProjects: Record<string, { slug: string; name: string }>;
  initialLotId: string | null;
  /** Real homes and photos published for the community (property catalogue). */
  catalog: { pageUrl: string; collections: CollectionView[]; photoCount: number } | null;
}

export function CommunityDashboard({ community: saved, initialProgress, lotProjects, initialLotId, catalog }: Props) {
  const router = useRouter();
  const [adjusting, setAdjusting] = useState(false);
  const [delta, setDelta] = useState<PlacementDelta>(NO_DELTA);
  // Live preview of a placement correction.
  const community = useMemo(() => adjustPlacement(saved, delta), [saved, delta]);
  const [progress, setProgress] = useState<Record<string, LotProgress | undefined>>(initialProgress);
  const [selectedId, setSelectedId] = useState<string | null>(initialLotId && community.lots.some((l) => l.id === initialLotId) ? initialLotId : null);
  const [colouring, setColouring] = useState<LotColouring>("status");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [streetNames, setStreetNames] = useState(true);
  const [tracking, setTracking] = useState<string | null>(null);
  const geo = community.geo!;

  const lots = useMemo(() => [...community.lots].sort((a, b) => collator.compare(a.number, b.number)), [community]);
  const counts = useMemo(() => {
    const c = { all: lots.length, available: 0, sold: 0, building: 0, ready: 0, future: 0 };
    for (const l of lots) {
      if (l.status === "available") c.available++;
      if (l.status === "sold") c.sold++;
      if (l.status === "future") c.future++;
      const s = lotState(l, progress[l.id]);
      if (s !== "none" && s !== "complete") c.building++;
      if (progress[l.id] && s === "complete") c.ready++;
    }
    return c;
  }, [lots, progress]);

  const visible = lots.filter((l) => {
    if (query && !l.number.toLowerCase().includes(query.toLowerCase().replace(/^lot\s*/, ""))) return false;
    const s = lotState(l, progress[l.id]);
    switch (filter) {
      case "available":
        return l.status === "available";
      case "sold":
        return l.status === "sold";
      case "future":
        return l.status === "future";
      case "building":
        return s !== "none" && s !== "complete";
      case "ready":
        return !!progress[l.id] && s === "complete";
      default:
        return true;
    }
  });

  const selected = community.lots.find((l) => l.id === selectedId) ?? null;
  const selProgress = selected ? progress[selected.id] : undefined;
  const project = selected ? lotProjects[selected.id] : undefined;
  const selCollection = selected?.collection ? catalog?.collections.find((c) => collectionKey(c.name) === collectionKey(selected.collection!)) : undefined;

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "available", label: "Available" },
    { id: "sold", label: "Sold" },
    { id: "building", label: "Under construction" },
    { id: "ready", label: "Complete" },
    { id: "future", label: "Future" },
  ];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
        <BrandMark subtitle="Internal" />
        <span className="h-6 w-px bg-border" />
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/communities">
            <ArrowLeft /> Communities
          </Link>
        </Button>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">{community.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {community.city} · {community.lots.length} lots ·{" "}
            {geo.sitePlan.method === "manual" ? "placement adjusted by hand" : geo.sitePlan.method === "lot-shapes" ? "approximate placement" : `placed on real streets (±${geo.sitePlan.rmsMetres.toFixed(1)} m)`}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {catalog && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/communities/${community.id}/homes`}>
                <Images /> Homes &amp; photos
              </Link>
            </Button>
          )}
          <Button
            variant={adjusting ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              setAdjusting((v) => !v);
              setSelectedId(null);
            }}
          >
            <Move /> Adjust placement
          </Button>
          {geo.sitePlan.url && (
            <Button asChild variant="ghost" size="sm">
              <a href={geo.sitePlan.url} target="_blank" rel="noreferrer">
                Site plan <ExternalLink />
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <a href={googleMapsUrl(geo.origin, 16)} target="_blank" rel="noreferrer">
              <MapPin /> Google Maps
            </a>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[300px] shrink-0 flex-col border-r md:flex">
          <div className="grid grid-cols-3 gap-2 border-b p-3 text-center">
            {[
              ["Available", counts.available, "text-emerald-700"],
              ["Sold", counts.sold, ""],
              ["Building", counts.building, "text-amber-700"],
            ].map(([k, v, c]) => (
              <div key={k as string} className="rounded-lg bg-muted/60 py-2">
                <div className={cn("text-lg font-semibold tabular-nums", c as string)}>{v}</div>
                <div className="text-[10px] text-muted-foreground">{k}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2 border-b p-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a lot number" className="h-8 pl-8 text-xs" />
            </div>
            <div className="flex flex-wrap gap-1">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn("rounded-full border px-2 py-0.5 text-[11px] transition-colors", filter === f.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
                >
                  {f.label} <span className="tabular-nums opacity-70">{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.map((l) => {
              const p = progress[l.id];
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    className={cn("flex w-full items-center gap-3 border-b px-3 py-2 text-left transition-colors hover:bg-muted/50", selectedId === l.id && "bg-amber-50 hover:bg-amber-50")}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: colouring === "progress" ? BUILD_STATE_COLOUR[lotState(l, p)] : STATUS_COLOUR[l.status ?? "future"] }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">Lot {l.number}</span>
                        <span className="text-[10px] text-muted-foreground">{lotProjects[l.id] ? "Has project" : STATUS_TEXT[l.status ?? "future"]}</span>
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">{l.collection ?? `${Math.round(l.width * 3.281)}′ frontage`}</div>
                      {p && (
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500" style={{ width: `${progressPercent(p)}%` }} />
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && <li className="p-6 text-center text-xs text-muted-foreground">No lots match.</li>}
          </ul>
        </aside>

        <main className="relative min-w-0 flex-1">
          <CommunityViewer community={community} progress={progress} colouring={colouring} selectedLotId={selectedId} onSelectLot={setSelectedId} showStreetNames={streetNames} />
          <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-2">
            <div className="pointer-events-auto flex rounded-lg border bg-background/90 p-0.5 text-[11px] font-medium shadow-sm backdrop-blur">
              {(["status", "progress"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setColouring(c)} className={cn("rounded-md px-2.5 py-1 transition-colors", colouring === c ? "bg-foreground text-background" : "text-muted-foreground")}>
                  {c === "status" ? "Sales status" : "Build progress"}
                </button>
              ))}
            </div>
            <div className="pointer-events-auto space-y-1 rounded-lg border bg-background/90 p-2 text-[10px] shadow-sm backdrop-blur">
              {(colouring === "status"
                ? (["available", "sold", "future"] as const).map((k) => [STATUS_TEXT[k], STATUS_COLOUR[k]])
                : (["excavation", "foundation", "framing", "closed-in", "complete", "none"] as const).map((k) => [BUILD_STATE_LABEL[k], BUILD_STATE_COLOUR[k]])
              ).map(([label, colour]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: colour }} /> {label}
                </div>
              ))}
              <label className="flex items-center gap-1.5 border-t pt-1.5">
                <Switch checked={streetNames} onCheckedChange={setStreetNames} className="scale-75" /> Street names
              </label>
            </div>
          </div>
          {geo.sitePlan.method === "lot-shapes" && !adjusting && (
            <div className="absolute top-3 left-1/2 flex max-w-md -translate-x-1/2 items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Approximate placement: this site plan has no readable street names, so lots were fitted to the road shapes. Check it against the streets and{" "}
                <button type="button" className="font-semibold underline" onClick={() => setAdjusting(true)}>
                  adjust
                </button>{" "}
                if needed.
              </span>
            </div>
          )}
          {!selected && !adjusting && (
            <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow">Click a lot to see what&apos;s being built</div>
          )}
        </main>

        {adjusting && (
          <aside className="w-[320px] shrink-0 overflow-y-auto border-l">
            <PlacementPanel
              communityId={community.id}
              delta={delta}
              onChange={setDelta}
              onDone={(savedIt) => {
                setAdjusting(false);
                if (savedIt) router.refresh();
                setDelta(NO_DELTA);
              }}
            />
          </aside>
        )}
        {selected && !adjusting && (
          <aside className="w-[340px] shrink-0 overflow-y-auto border-l">
            <div className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-semibold">Lot {selected.number}</div>
                  <div className="text-xs text-muted-foreground">{selected.collection ?? "Collection not shown on plan"}</div>
                </div>
                <Button variant="ghost" size="icon" className="-mt-1 -mr-2 size-7" onClick={() => setSelectedId(null)} aria-label="Close">
                  <X />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" style={{ borderColor: STATUS_COLOUR[selected.status ?? "future"] }}>
                  {STATUS_TEXT[selected.status ?? "future"]}
                </Badge>
                {selProgress && <Badge variant="secondary">{BUILD_STATE_LABEL[buildState(selProgress)]}</Badge>}
                <DemoDataBadge progress={selProgress} />
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/50 p-2">
                  <dt className="text-[10px] text-muted-foreground">Frontage (approx.)</dt>
                  <dd className="font-medium">
                    {selected.width.toFixed(1)} m · {Math.round(selected.width * 3.281)}′
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <dt className="text-[10px] text-muted-foreground">Depth (approx.)</dt>
                  <dd className="font-medium">
                    {selected.depth.toFixed(1)} m · {Math.round(selected.depth * 3.281)}′
                  </dd>
                </div>
              </dl>
              {selected.latLng && (
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={googleMapsUrl(selected.latLng, 19)} target="_blank" rel="noreferrer">
                      <MapPin /> Satellite view
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={streetViewUrl(selected.latLng)} target="_blank" rel="noreferrer">
                      <Footprints /> Street View
                    </a>
                  </Button>
                </div>
              )}

              {selected.status === "sold" || selProgress || tracking === selected.id ? (
                <>
                  <ProgressSummary progress={selProgress} />
                  {selProgress?.notes && <p className="rounded-lg bg-muted/50 p-2 text-xs">{selProgress.notes}</p>}
                  <ProgressTimeline progress={selProgress} />
                  <ProgressEditor key={selected.id + (selProgress?.updatedAt ?? "")} communityId={community.id} lotId={selected.id} progress={selProgress} onSaved={(p) => setProgress((m) => ({ ...m, [p.lotId]: p }))} />
                </>
              ) : (
                <div className="space-y-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                  <p>{selected.status === "available" ? "This lot is available. Construction tracking starts once it's reserved." : "This lot is part of a future release."}</p>
                  {selected.status === "available" && (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setTracking(selected.id)}>
                      Start tracking construction
                    </Button>
                  )}
                </div>
              )}

              {selCollection && catalog && (
                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-xs font-semibold">Homes for this lot</div>
                    <Link href={`/communities/${community.id}/homes#collection-${selCollection.id.split("/").pop()}`} className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                      All photos <ArrowRight className="size-3" />
                    </Link>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {selCollection.designs.length} {selCollection.name} design{selCollection.designs.length === 1 ? "" : "s"}
                    {selCollection.priceFrom ? ` · from $${selCollection.priceFrom.toLocaleString("en-CA")}` : ""}
                  </p>
                  <LotHomesList collection={selCollection} sourceUrl={catalog.pageUrl} />
                </div>
              )}
              <div className="border-t pt-4">
                {project ? (
                  <Button asChild size="sm" className="w-full">
                    <Link href={`/projects/${project.slug}`}>
                      <Home /> Open {project.name}
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="sm" className="w-full" variant={selected.status === "future" ? "outline" : "default"}>
                    <Link href={`/projects/new?community=${community.id}&lot=${selected.id}`}>
                      <Plus /> Visualize a home on this lot
                    </Link>
                  </Button>
                )}
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Lot shape from the published site plan, aligned to OpenStreetMap streets ({geo.sitePlan.matchedStreets} street names matched). Dimensions are approximate — confirm against the
                registered plan of subdivision.
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
