"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, HardHat, MapPin } from "lucide-react";
import { googleMapsUrl } from "@/lib/community/geo";
import type { Community, Lot } from "@/lib/models/community";
import type { LotProgress } from "@/lib/models/construction";
import { cn } from "@/lib/utils";
import { DemoDataBadge, ProgressSummary, ProgressTimeline } from "./BuildProgress";

/** Floating "how is my home coming along" card for a project on a real lot. */
export function LotProgressCard({ community, lot, progress, variant }: { community: Community; lot: Lot; progress: LotProgress | undefined; variant: "studio" | "customer" }) {
  const [open, setOpen] = useState(false);
  if (!community.geo) return null;
  return (
    <div className="pointer-events-auto w-64 rounded-xl border bg-background/90 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 pt-2 text-left">
        <HardHat className="size-3.5 text-amber-600" />
        <span className="flex-1 text-xs font-semibold">{variant === "customer" ? "Your build progress" : "Build progress"}</span>
        <DemoDataBadge progress={progress} />
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <div className="px-3 pt-1.5 pb-2.5">
        {progress ? <ProgressSummary progress={progress} compact={!open} /> : <p className="text-[11px] text-muted-foreground">Construction hasn&apos;t started on this lot yet.</p>}
        {open && (
          <div className="mt-3 space-y-3">
            {progress?.notes && <p className="rounded-lg bg-muted/60 p-2 text-[11px]">{progress.notes}</p>}
            <div className="max-h-[38vh] overflow-y-auto pr-1">
              <ProgressTimeline progress={progress} />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-[11px]">
              {lot.latLng && (
                <a href={googleMapsUrl(lot.latLng, 19)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground/80 hover:underline">
                  <MapPin className="size-3" /> Lot on Google Maps
                </a>
              )}
              {variant === "studio" && (
                <Link href={`/communities/${community.id}?lot=${lot.id}`} className="font-medium text-foreground/80 hover:underline">
                  Update progress →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
