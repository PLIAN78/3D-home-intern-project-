"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, View } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PhotoKind, PhotoView } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { RemotePhoto } from "./RemotePhoto";

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  hero: "Community",
  aerial: "Aerial",
  exterior: "Exterior",
  elevation: "Elevation",
  interior: "Interior",
  amenity: "Nearby",
  lifestyle: "Lifestyle",
  "site-plan": "Site plan",
  "sales-centre": "Sales centre",
  "virtual-tour": "360° tour",
};

/** Credit line: every photo is linked from, and belongs to, the builder's site. */
export function PhotoCredit({ href, className }: { href: string; className?: string }) {
  return (
    <p className={cn("text-[10px] text-muted-foreground", className)}>
      Photos and renderings ©{" "}
      <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        Caivan
      </a>
      , linked from caivan.com. Renderings are artist&apos;s concepts.
    </p>
  );
}

/** Full-screen viewer for a list of photos, with arrow-key navigation. */
export function PhotoLightbox({ photos, index, onIndexChange }: { photos: PhotoView[]; index: number | null; onIndexChange: (i: number | null) => void }) {
  const photo = index === null ? null : photos[index];
  const step = (d: number) => index !== null && onIndexChange((index + d + photos.length) % photos.length);
  return (
    <Dialog open={!!photo} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent
        className="gap-3 p-3 sm:max-w-5xl"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
      >
        {photo && (
          <>
            <div className="relative">
              <RemotePhoto key={photo.url} src={photo.url} alt={photo.caption ?? PHOTO_KIND_LABEL[photo.kind]} eager className="aspect-[3/2] w-full rounded-lg" imgClassName="object-contain bg-black/90" />
              {photos.length > 1 && (
                <>
                  <Button variant="secondary" size="icon" className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full opacity-90" onClick={() => step(-1)} aria-label="Previous photo">
                    <ChevronLeft />
                  </Button>
                  <Button variant="secondary" size="icon" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full opacity-90" onClick={() => step(1)} aria-label="Next photo">
                    <ChevronRight />
                  </Button>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-2 pr-8">
              <div className="min-w-0">
                <DialogTitle className="text-sm">{photo.caption ?? PHOTO_KIND_LABEL[photo.kind]}</DialogTitle>
                <DialogDescription className="text-xs">
                  {PHOTO_KIND_LABEL[photo.kind]} · {index! + 1} of {photos.length}
                </DialogDescription>
              </div>
              <div className="flex gap-2">
                {photo.linkUrl && (
                  <Button asChild size="sm">
                    <a href={photo.linkUrl} target="_blank" rel="noreferrer">
                      {photo.kind === "virtual-tour" ? <View /> : <ExternalLink />} {photo.kind === "virtual-tour" ? "Open 360° tour" : "Open"}
                    </a>
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <a href={photo.sourceUrl} target="_blank" rel="noreferrer">
                    Source <ExternalLink />
                  </a>
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Filterable photo grid; clicking a photo opens the lightbox. */
export function PhotoGallery({ photos, sourceUrl, columns = "sm:grid-cols-3 lg:grid-cols-4" }: { photos: PhotoView[]; sourceUrl: string; columns?: string }) {
  const kinds = [...new Set(photos.map((p) => p.kind))];
  const [kind, setKind] = useState<PhotoKind | "all">("all");
  const [open, setOpen] = useState<number | null>(null);
  const shown = kind === "all" ? photos : photos.filter((p) => p.kind === kind);
  if (!photos.length) return null;
  return (
    <div className="space-y-3">
      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {(["all", ...kinds] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn("rounded-full border px-2.5 py-0.5 text-[11px] transition-colors", kind === k ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
            >
              {k === "all" ? "All" : PHOTO_KIND_LABEL[k]} <span className="tabular-nums opacity-70">{k === "all" ? photos.length : photos.filter((p) => p.kind === k).length}</span>
            </button>
          ))}
        </div>
      )}
      <div className={cn("grid grid-cols-2 gap-2", columns)}>
        {shown.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setOpen(i)} className="group relative overflow-hidden rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <RemotePhoto src={p.url} alt={p.caption ?? PHOTO_KIND_LABEL[p.kind]} className="aspect-[4/3]" imgClassName="transition-transform duration-300 group-hover:scale-105" />
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-[11px] font-medium text-white">
              {p.kind === "virtual-tour" && <View className="mr-1 inline size-3" />}
              {p.caption ? p.caption.split(":")[0] : PHOTO_KIND_LABEL[p.kind]}
            </span>
          </button>
        ))}
      </div>
      <PhotoCredit href={sourceUrl} />
      <PhotoLightbox photos={shown} index={open} onIndexChange={setOpen} />
    </div>
  );
}
