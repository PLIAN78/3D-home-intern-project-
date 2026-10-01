"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { uploadDrawing } from "@/lib/drawings/api";
import { formatBytes, guessCategory, guessFloorId } from "@/lib/drawings/guess";
import { rasterizeFile } from "@/lib/drawings/rasterize";
import { categoryLabel, type Drawing } from "@/lib/models/drawing";
import type { Floor } from "@/lib/models/house";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

type Stage = "preparing" | "uploading" | "done" | "failed";
interface QueueItem {
  key: string;
  name: string;
  size: number;
  stage: Stage;
  progress: number;
  error?: string;
}

export const SAMPLE_DRAWINGS = [
  { file: "plan36-ground.pdf", label: "Main floor plan (PDF)" },
  { file: "plan36-second.pdf", label: "Second floor plan (PDF)" },
  { file: "plan36-basement.pdf", label: "Basement plan (PDF)" },
];

/** Drag-and-drop multi-file uploader. Files are rasterised in the browser, then uploaded with progress. */
export function DrawingUploader({ projectId, floors, onSetUploaded }: { projectId: string; floors: Floor[]; /** Called for multi-page PDFs (drawing sets) so the set flow can start. */ onSetUploaded?: (drawing: Drawing) => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);

  const patch = (key: string, p: Partial<QueueItem>) => setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const process = useCallback(
    async (files: File[]) => {
      const items = files.map((f) => ({ key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`, name: f.name, size: f.size, stage: "preparing" as Stage, progress: 0 }));
      setQueue((q) => [...items, ...q]);
      let ok = 0;
      let firstSet: Drawing | null = null;
      await Promise.all(
        files.map(async (file, i) => {
          const key = items[i].key;
          try {
            const supported = /\.(pdf|png|jpe?g)$/i.test(file.name) || ["application/pdf", "image/png", "image/jpeg"].includes(file.type);
            if (!supported) throw new Error("Unsupported file type");
            const raster = await rasterizeFile(file).catch((e: unknown) => {
              console.warn("Raster preview failed", e);
              return null;
            });
            patch(key, { stage: "uploading" });
            const category = guessCategory(file.name);
            const uploaded = await uploadDrawing(
              { projectId, file, raster, category, floorId: category === "floor-plan" ? guessFloorId(file.name, floors) : undefined },
              (p) => patch(key, { progress: p }),
            );
            if (!firstSet && uploaded.contentType === "application/pdf" && (raster?.pageCount ?? 1) >= 2) firstSet = uploaded;
            patch(key, { stage: "done", progress: 1 });
            ok++;
          } catch (e) {
            patch(key, { stage: "failed", error: e instanceof Error ? e.message : "Upload failed" });
          }
        }),
      );
      if (firstSet) onSetUploaded?.(firstSet);
      else if (ok) toast.success(`${ok} drawing${ok > 1 ? "s" : ""} uploaded`, { description: "Check each drawing's type and floor below." });
      if (ok) {
        router.refresh();
        setTimeout(() => setQueue((q) => q.filter((i) => i.stage !== "done")), 2500);
      }
    },
    [projectId, floors, router, onSetUploaded],
  );

  const addSamples = async () => {
    try {
      const files = await Promise.all(
        SAMPLE_DRAWINGS.map(async (s) => {
          const res = await fetch(`/samples/${s.file}`);
          if (!res.ok) throw new Error(`Missing sample ${s.file}`);
          return new File([await res.blob()], s.file, { type: "application/pdf" });
        }),
      );
      await process(files);
    } catch (e) {
      toast.error("Couldn't load sample drawings", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = [...e.dataTransfer.files];
          if (files.length) void process(files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center rounded-xl border border-dashed px-4 py-5 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          dragging ? "border-brand bg-brand/5" : "hover:bg-muted/50",
        )}
      >
        <FileUp className="mb-1.5 size-5 text-muted-foreground" />
        <div className="text-sm font-medium">Drop your décor / plan set PDF</div>
        <div className="text-[11px] text-muted-foreground">We read every floor, elevation and option and build the 3D home. PNG/JPG plans work too.</div>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) void process(files);
          }}
        />
      </div>
      <Button variant="ghost" size="sm" className="w-full text-xs" onClick={addSamples}>
        <Sparkles /> Add sample Plan 36 drawings
      </Button>
      {queue.length > 0 && (
        <div className="space-y-1.5">
          {queue.map((q) => (
            <div key={q.key} className="rounded-lg border px-2.5 py-2">
              <div className="flex items-center gap-2 text-xs">
                {q.stage === "done" ? (
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                ) : q.stage === "failed" ? (
                  <XCircle className="size-3.5 text-destructive" />
                ) : (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{q.name}</span>
                <span className="text-muted-foreground">{formatBytes(q.size)}</span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {q.stage === "preparing" && "Rendering preview…"}
                {q.stage === "uploading" && `Uploading · ${Math.round(q.progress * 100)}% · ${categoryLabel(guessCategory(q.name))}`}
                {q.stage === "done" && "Uploaded"}
                {q.stage === "failed" && <span className="text-destructive">{q.error}</span>}
              </div>
              {(q.stage === "uploading" || q.stage === "preparing") && <Progress value={q.stage === "preparing" ? 5 : q.progress * 100} className="mt-1.5 h-1" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
