"use client";

import { useState } from "react";
import { FileText, View } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CollectionView, HomeDesignView } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { DesignSpecs } from "./HomeDesignCard";
import { PhotoCredit, PhotoLightbox } from "./PhotoGallery";
import { RemotePhoto } from "./RemotePhoto";

/** Compact list of a collection's home designs for narrow side panels. */
export function LotHomesList({ collection, sourceUrl, highlightId }: { collection: CollectionView; sourceUrl: string; highlightId?: string | null }) {
  const [viewing, setViewing] = useState<{ design: HomeDesignView; index: number } | null>(null);
  // The project's own design first.
  const designs = [...collection.designs].sort((a, b) => Number(b.id === highlightId) - Number(a.id === highlightId));
  if (!designs.length) return <p className="text-[11px] text-muted-foreground">No designs published for {collection.name} yet.</p>;
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {designs.map((d) => (
          <li key={d.id} className={cn("flex gap-2 rounded-lg border p-1.5", d.id === highlightId && "border-brand bg-brand/5")}>
            <button type="button" className="shrink-0 overflow-hidden rounded-md" onClick={() => d.photos.length && setViewing({ design: d, index: 0 })} aria-label={`Photos of ${d.name}`}>
              {d.photos[0] ? <RemotePhoto src={d.photos[0].url} alt={d.name} className="h-14 w-20" /> : <div className="h-14 w-20 bg-muted" />}
            </button>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1">
                <span className="truncate text-xs font-semibold">{d.name}</span>
                {d.id === highlightId && <Badge className="h-4 bg-brand px-1 text-[9px] text-brand-foreground">This home</Badge>}
                {d.modelHome && <Badge className="h-4 bg-emerald-600 px-1 text-[9px] text-white">Model</Badge>}
                {d.soldOut && (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                    Sold out
                  </Badge>
                )}
              </div>
              <DesignSpecs design={d} className="gap-x-2 text-[10px]" />
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] whitespace-nowrap">
                {d.floorplanPdf && (
                  <a href={d.floorplanPdf} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                    <FileText className="size-3" /> Floorplan
                  </a>
                )}
                {d.virtualTourUrl && (
                  <a href={d.virtualTourUrl} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                    <View className="size-3" /> 360° tour
                  </a>
                )}
                {d.photos.length > 0 && (
                  <button type="button" onClick={() => setViewing({ design: d, index: 0 })} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                    {d.photos.length} photo{d.photos.length === 1 ? "" : "s"}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <PhotoCredit href={sourceUrl} />
      <PhotoLightbox photos={viewing?.design.photos ?? []} index={viewing?.index ?? null} onIndexChange={(i) => setViewing((v) => (v && i !== null ? { ...v, index: i } : null))} />
    </div>
  );
}
