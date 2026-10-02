"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Expand, Layers, Loader2, PencilRuler, ScanSearch, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { interpretDrawing, patchDrawing, removeDrawing, replaceRaster } from "@/lib/drawings/api";
import { formatBytes, PROCESSING_LABEL } from "@/lib/drawings/guess";
import { rasterizePdf } from "@/lib/drawings/rasterize";
import { DRAWING_CATEGORIES, type Drawing, type DrawingCategory, type ProcessingStatus } from "@/lib/models/drawing";
import type { Floor } from "@/lib/models/house";
import { fileUrl } from "@/lib/storage/urls";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<ProcessingStatus, string> = {
  "not-started": "bg-muted text-muted-foreground",
  processing: "bg-sky-100 text-sky-800",
  "needs-review": "bg-amber-100 text-amber-900",
  reviewed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  "not-applicable": "bg-muted text-muted-foreground",
};

export const INTERPRETER_OPTIONS = [
  { id: "heuristic", label: "Line detection (experimental)" },
  { id: "mock", label: "Mock interpreter (placeholder)" },
];

function DrawingPreview({ drawing, open, onOpenChange }: { drawing: Drawing; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(92vw,1100px)] sm:max-w-[min(92vw,1100px)]">
        <DialogHeader>
          <DialogTitle className="truncate">{drawing.fileName}</DialogTitle>
          <DialogDescription>
            {DRAWING_CATEGORIES.find((c) => c.id === drawing.category)?.label} · {formatBytes(drawing.sizeBytes)}
            {drawing.pageCount && drawing.pageCount > 1 ? ` · page ${drawing.page ?? 1} of ${drawing.pageCount}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[72vh] overflow-auto rounded-lg border bg-white">
          {drawing.rasterKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(drawing.rasterKey)} alt={drawing.fileName} className="mx-auto h-auto max-w-full" />
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">No preview available.</div>
          )}
        </div>
        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <a href={fileUrl(drawing.storageKey)} target="_blank" rel="noopener">
              Open original
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Whole-set status + the one-click action for PDF drawing sets. */
function SetRow({ drawing, onOpen }: { drawing: Drawing; onOpen: () => void }) {
  const a = drawing.analysis;
  return (
    <div className="mt-2 flex items-center gap-2 rounded-md bg-brand/10 px-2 py-1.5">
      <Layers className="size-3.5 shrink-0 text-[color:oklch(0.5_0.13_62)]" />
      <span className="min-w-0 flex-1 truncate text-[11px]">
        {a?.status === "running" && `Reading… ${a.stage}`}
        {a?.status === "done" && (a.partnerDrawingId ? `Read with the ${drawing.category === "redline" ? "décor" : "redline"} set` : "Drawing set read")}
        {a?.status === "failed" && "Analysis failed"}
      </span>
      <Button size="xs" onClick={onOpen} className="bg-brand text-brand-foreground hover:bg-brand/90">
        {a?.status === "done" ? "View" : a?.status === "running" ? "Progress" : "Details"}
      </Button>
    </div>
  );
}

function DrawingCard({ drawing, floors, projectSlug, onOpenSet }: { drawing: Drawing; floors: Floor[]; projectSlug: string; onOpenSet?: (id: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const isPlan = drawing.category === "floor-plan";
  const floor = floors.find((f) => f.id === drawing.floorId);

  const run = async (label: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(label);
    try {
      await fn();
      if (success) toast.success(success);
      router.refresh();
    } catch (e) {
      toast.error(`${label} failed`, { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const interpret = (id: string) =>
    run("Interpretation", async () => {
      const d = await interpretDrawing(drawing.id, id);
      const i = d.interpretation;
      if (i) toast.message(`Found ${i.walls.length} walls, ${i.doors.length} doors, ${i.windows.length} windows`, { description: `Confidence ${Math.round(i.confidence * 100)}% — review in the tracing editor before use.` });
    });

  const changePage = (page: number) =>
    run("Page change", async () => {
      const data = await (await fetch(fileUrl(drawing.storageKey))).arrayBuffer();
      const r = await rasterizePdf(data, page);
      await replaceRaster(drawing.id, page, r);
    });

  const traceHref = `/projects/${projectSlug}/trace?drawing=${drawing.id}${drawing.floorId ? `&floor=${drawing.floorId}` : ""}`;

  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="flex gap-2.5">
        <button type="button" onClick={() => setPreview(true)} className="group relative h-16 w-20 shrink-0 overflow-hidden rounded-md border bg-white" aria-label="Preview drawing">
          {drawing.rasterKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(drawing.rasterKey)} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">No preview</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
            <Expand className="size-4" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium" title={drawing.fileName}>
            {drawing.fileName}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
              {drawing.uploadStatus === "uploaded" ? "Uploaded" : drawing.uploadStatus}
            </Badge>
            <span className={cn("rounded px-1.5 py-px text-[9px] font-medium", STATUS_STYLE[drawing.processingStatus])}>
              {PROCESSING_LABEL[drawing.processingStatus]}
              {drawing.processingStatus === "needs-review" && drawing.interpretation ? ` · ${Math.round(drawing.interpretation.confidence * 100)}%` : ""}
            </span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{formatBytes(drawing.sizeBytes)}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Select value={drawing.category} onValueChange={(v) => run("Update", () => patchDrawing(drawing.id, { category: v as DrawingCategory }))}>
          <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label="Drawing type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DRAWING_CATEGORIES.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select disabled={!isPlan} value={drawing.floorId ?? "none"} onValueChange={(v) => run("Update", () => patchDrawing(drawing.id, { floorId: v === "none" ? null : v }))}>
          <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label="Floor">
            <SelectValue placeholder="Floor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No floor</SelectItem>
            {floors.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {drawing.contentType === "application/pdf" && (drawing.pageCount ?? 1) > 1 && !drawing.analysis && (
        <Select value={String(drawing.page ?? 1)} onValueChange={(v) => changePage(Number(v))}>
          <SelectTrigger size="sm" className="mt-1.5 h-7 w-full text-xs" aria-label="PDF page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: drawing.pageCount ?? 1 }, (_, i) => (
              <SelectItem key={i} value={String(i + 1)}>
                Page {i + 1} of {drawing.pageCount}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="mt-2 flex items-center gap-1">
        {isPlan && (
          <>
            <Button asChild size="xs" className="flex-1">
              <Link href={traceHref}>
                <PencilRuler /> {drawing.processingStatus === "needs-review" ? "Review" : "Trace"}
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="xs" variant="outline" disabled={!!busy || !drawing.rasterKey}>
                  {busy === "Interpretation" ? <Loader2 className="animate-spin" /> : <ScanSearch />} Interpret <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Extract geometry with…</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {INTERPRETER_OPTIONS.map((o) => (
                  <DropdownMenuItem key={o.id} onSelect={() => interpret(o.id)}>
                    {o.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        <Button
          size="icon-xs"
          variant="ghost"
          className="ml-auto text-muted-foreground hover:text-destructive"
          aria-label="Delete drawing"
          disabled={!!busy}
          onClick={() => {
            if (window.confirm(`Delete ${drawing.fileName}?`)) void run("Delete", () => removeDrawing(drawing.id), "Drawing deleted");
          }}
        >
          <Trash2 />
        </Button>
      </div>
      {drawing.contentType === "application/pdf" && drawing.analysis && onOpenSet && (
        <SetRow drawing={drawing} onOpen={() => onOpenSet(drawing.id)} />
      )}
      {isPlan && !floor && !drawing.analysis && <p className="mt-1.5 text-[10px] text-amber-700">Assign a floor before tracing.</p>}
      <DrawingPreview drawing={drawing} open={preview} onOpenChange={setPreview} />
    </div>
  );
}

export function DrawingList({ drawings, floors, projectSlug, onOpenSet }: { drawings: Drawing[]; floors: Floor[]; projectSlug: string; onOpenSet?: (id: string) => void }) {
  if (!drawings.length) return <p className="py-2 text-center text-xs text-muted-foreground">No drawings uploaded yet.</p>;
  return (
    <div className="space-y-2">
      {drawings.map((d) => (
        <DrawingCard key={d.id} drawing={d} floors={floors} projectSlug={projectSlug} onOpenSet={onOpenSet} />
      ))}
    </div>
  );
}
