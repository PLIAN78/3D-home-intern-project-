"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, ExternalLink, Images, Loader2, MapPinned, Upload } from "lucide-react";
import { RemotePhoto } from "@/components/catalog/RemotePhoto";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { CommunityImportJob } from "@/lib/models/communityImport";
import type { CatalogCommunity } from "@/lib/sample/caivanCommunities";

export interface CatalogEntry extends CatalogCommunity {
  heroUrl: string | null;
  photoCount: number;
  designCount: number;
  priceFrom: number | null;
  stats: { lots: number; sold: number; available: number; building: number; rmsMetres: number } | null;
  job: CommunityImportJob | null;
}

/** Poll an import job until it finishes. */
function useImportJob(initial: CommunityImportJob | null, onDone: () => void) {
  const [job, setJob] = useState(initial);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  const id = job?.status === "running" ? job.id : null;
  useEffect(() => {
    if (!id) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/communities/import/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as CommunityImportJob;
      setJob(next);
      if (next.status !== "running") {
        clearInterval(t);
        if (next.status === "done") {
          toast.success(`${next.name} is ready`, { description: `${next.result?.lots} lots placed on the real map.` });
          done.current();
        } else toast.error(`Couldn't import ${next.name}`, { description: next.error });
      }
    }, 2000);
    return () => clearInterval(t);
  }, [id]);
  return [job, setJob] as const;
}

async function startImport(body: FormData | { catalogId: string }): Promise<CommunityImportJob> {
  const res = await fetch("/api/communities/import", body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json()) as CommunityImportJob & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Import failed to start");
  return data;
}

function UploadDialog({ entry, open, onOpenChange, onStarted }: { entry: CatalogEntry | null; open: boolean; onOpenChange: (v: boolean) => void; onStarted: (job: CommunityImportJob) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a site plan</DialogTitle>
          <DialogDescription>A vector PDF lotting plan with lot numbers and street names. Scanned images can&apos;t be read yet.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              onStarted(await startImport(new FormData(e.currentTarget)));
              onOpenChange(false);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Upload failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cname">Community</Label>
              <Input id="cname" name="name" required defaultValue={entry?.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ccity">City</Label>
              <Input id="ccity" name="city" required defaultValue={entry?.city} placeholder="Ottawa" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfile">Site plan (PDF)</Label>
            <Input id="cfile" name="file" type="file" accept="application/pdf" required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />} Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CommunityCard({ entry, onUpload }: { entry: CatalogEntry; onUpload: (e: CatalogEntry) => void }) {
  const router = useRouter();
  const [job, setJob] = useImportJob(entry.job, () => router.refresh());
  const running = job?.status === "running";
  const s = entry.stats;

  const runImport = async () => {
    try {
      setJob(await startImport({ catalogId: entry.id }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed to start");
    }
  };

  return (
    <Card className="flex flex-col overflow-hidden pt-0">
      <Link href={`/communities/${entry.id}/homes`} className="group relative block" aria-label={`${entry.name} homes and photos`}>
        {entry.heroUrl ? (
          <RemotePhoto src={entry.heroUrl} alt={entry.name} className="aspect-[16/9]" imgClassName="transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="aspect-[16/9] bg-gradient-to-br from-sky-200 via-sky-100 to-emerald-100" />
        )}
        {(entry.designCount > 0 || entry.photoCount > 1) && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
            <Images className="size-3" />
            {entry.designCount > 0 ? `${entry.designCount} home designs · ` : ""}
            {entry.photoCount} photos
          </span>
        )}
        {entry.priceFrom && <span className="absolute right-2 bottom-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-foreground">From ${entry.priceFrom.toLocaleString("en-CA")}</span>}
      </Link>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{entry.name}</CardTitle>
            <CardDescription>{entry.city}</CardDescription>
          </div>
          {s ? <Badge className="bg-emerald-600 text-white">On the map</Badge> : entry.sitePlanPdf ? <Badge variant="outline">Site plan available</Badge> : <Badge variant="secondary">No published plan</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 text-sm">
        <p className="text-muted-foreground">{entry.blurb}</p>
        {s && (
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ["Lots", s.lots],
              ["Sold", s.sold],
              ["Available", s.available],
              ["Building", s.building],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted/60 py-1.5">
                <div className="text-base font-semibold tabular-nums">{v}</div>
                <div className="text-[10px] text-muted-foreground">{k}</div>
              </div>
            ))}
          </div>
        )}
        {running && job && (
          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Loader2 className="size-3.5 animate-spin" /> {job.stage}
            </div>
            <Progress value={(Math.max(0, job.step - 0.5) / job.steps) * 100} />
            <p className="text-[10px] text-muted-foreground">Map servers can be slow — this usually takes 1–5 minutes.</p>
          </div>
        )}
        {job?.status === "failed" && (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {job.error}
          </div>
        )}
        {entry.collections.length > 0 && <p className="text-[11px] text-muted-foreground">{entry.collections.join(" · ")}</p>}
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        {s ? (
          <Button asChild size="sm">
            <Link href={`/communities/${entry.id}`}>
              Open community <ArrowRight />
            </Link>
          </Button>
        ) : entry.sitePlanPdf ? (
          <Button size="sm" onClick={runImport} disabled={running}>
            {running ? <Loader2 className="animate-spin" /> : <MapPinned />} Place on real map
          </Button>
        ) : null}
        {entry.heroUrl && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/communities/${entry.id}/homes`}>
              <Images /> Homes &amp; photos
            </Link>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onUpload(entry)} disabled={running}>
          <Upload /> {s ? "Re-import" : "Upload site plan"}
        </Button>
        {s && entry.sitePlanPdf && (
          <Button size="sm" variant="ghost" onClick={runImport} disabled={running}>
            Refresh site plan
          </Button>
        )}
        {entry.url && (
          <Button asChild size="sm" variant="ghost" className="ml-auto">
            <a href={entry.url} target="_blank" rel="noreferrer">
              caivan.com <ExternalLink />
            </a>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export function CommunityCatalog({ entries }: { entries: CatalogEntry[] }) {
  const [upload, setUpload] = useState<CatalogEntry | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const regions = [...new Set(entries.map((e) => e.region))];
  return (
    <>
      {regions.map((r) => (
        <section key={r} className="mb-10">
          <h2 className="mb-3 text-sm font-semibold tracking-tight">{r}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entries
              .filter((e) => e.region === r)
              .map((e) => (
                <CommunityCard
                  key={`${e.id}:${e.job?.id ?? ""}`}
                  entry={e}
                  onUpload={(x) => {
                    setUpload(x);
                    setOpen(true);
                  }}
                />
              ))}
          </div>
        </section>
      ))}
      <UploadDialog
        entry={upload}
        open={open}
        onOpenChange={setOpen}
        onStarted={(job) => {
          toast.message(`Importing ${job.name}…`, { description: "This page will update when it's ready." });
          router.refresh();
        }}
      />
    </>
  );
}
