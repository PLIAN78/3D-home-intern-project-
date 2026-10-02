"use client";

import { useState } from "react";
import { BedDouble, Bath, Car, ExternalLink, FileText, Ruler, View } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HomeDesignView } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { PHOTO_KIND_LABEL, PhotoLightbox } from "./PhotoGallery";
import { RemotePhoto } from "./RemotePhoto";

/** "3 (Optional up to 5)" → "3–5"; leaves other wording alone. */
function compact(v: string | null) {
  if (!v) return null;
  const m = /^([\d.]+)\s*\(optional up to ([\d.]+)\)?/i.exec(v);
  return m ? `${m[1]}–${m[2]}` : v.replace(/^up to /i, "≤ ");
}

export function DesignSpecs({ design, className }: { design: HomeDesignView; className?: string }) {
  const items = [
    { icon: Ruler, label: "Size", value: design.sqft ? `${design.sqft.toLocaleString()} sq ft` : null, title: design.sqftNote },
    { icon: BedDouble, label: "Bedrooms", value: compact(design.bedrooms), title: design.bedrooms },
    { icon: Bath, label: "Bathrooms", value: compact(design.bathrooms), title: design.bathrooms },
    { icon: Car, label: "Parking", value: design.parking, title: design.parking },
  ].filter((i) => i.value);
  return (
    <dl className={cn("flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground", className)}>
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1" title={i.title ?? undefined}>
          <i.icon className="size-3" />
          <dt className="sr-only">{i.label}</dt>
          <dd className="font-medium text-foreground">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DesignLinks({ design, size = "sm" }: { design: HomeDesignView; size?: "sm" | "xs" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {design.floorplanPdf && (
        <Button asChild size={size} variant="outline">
          <a href={design.floorplanPdf} target="_blank" rel="noreferrer">
            <FileText /> Floorplan
          </a>
        </Button>
      )}
      {design.virtualTourUrl && (
        <Button asChild size={size} variant="outline">
          <a href={design.virtualTourUrl} target="_blank" rel="noreferrer">
            <View /> 360° tour
          </a>
        </Button>
      )}
      {design.featureSheetPdf && (
        <Button asChild size={size} variant="ghost">
          <a href={design.featureSheetPdf} target="_blank" rel="noreferrer">
            Features
          </a>
        </Button>
      )}
      <Button asChild size={size} variant="ghost">
        <a href={design.pageUrl} target="_blank" rel="noreferrer">
          caivan.com <ExternalLink />
        </a>
      </Button>
    </div>
  );
}

/** One published home design: its elevation renderings, specs and documents. */
export function HomeDesignCard({ design, highlighted, compactLayout }: { design: HomeDesignView; highlighted?: boolean; compactLayout?: boolean }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const photo = design.photos[active];
  return (
    <div id={`design-${design.id.split("/").pop()}`} className={cn("overflow-hidden rounded-xl border bg-background", highlighted && "ring-2 ring-brand")}>
      <button type="button" className="group relative block w-full text-left" onClick={() => photo && setOpen(active)} disabled={!photo}>
        {photo ? (
          <RemotePhoto src={photo.url} alt={`${design.name} · ${photo.caption ?? PHOTO_KIND_LABEL[photo.kind]}`} className={compactLayout ? "aspect-[16/9]" : "aspect-[3/2]"} imgClassName="transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className={cn("flex items-center justify-center bg-muted text-xs text-muted-foreground", compactLayout ? "aspect-[16/9]" : "aspect-[3/2]")}>No rendering published</div>
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          {highlighted && <Badge className="bg-brand text-brand-foreground">This project</Badge>}
          {design.modelHome && <Badge className="bg-emerald-600 text-white">Model home</Badge>}
          {design.soldOut && <Badge variant="secondary">Sold out</Badge>}
        </div>
        {photo && <span className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{photo.caption?.split(" · ").pop() ?? PHOTO_KIND_LABEL[photo.kind]}</span>}
      </button>
      {design.photos.length > 1 && (
        <div className="flex gap-1 overflow-x-auto px-2 pt-2">
          {design.photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show ${p.caption ?? PHOTO_KIND_LABEL[p.kind]}`}
              className={cn("relative shrink-0 overflow-hidden rounded-md border-2 transition-colors", i === active ? "border-foreground" : "border-transparent opacity-70 hover:opacity-100")}
            >
              <RemotePhoto src={p.url} alt="" className="h-9 w-14" />
              {p.kind === "virtual-tour" && <View className="absolute inset-0 m-auto size-3.5 text-white drop-shadow" />}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-2 p-3">
        <div className="text-sm font-semibold">{design.name}</div>
        <DesignSpecs design={design} />
        {!compactLayout && design.sqftNote && <p className="text-[10px] text-muted-foreground">*{design.sqftNote}</p>}
        <DesignLinks design={design} size={compactLayout ? "xs" : "sm"} />
      </div>
      <PhotoLightbox photos={design.photos} index={open} onIndexChange={setOpen} />
    </div>
  );
}
