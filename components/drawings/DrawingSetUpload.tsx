"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, CheckCircle2, FileStack, FileUp, Palette, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { uploadDrawing } from "@/lib/drawings/api";
import { formatBytes } from "@/lib/drawings/guess";
import { rasterizeFile } from "@/lib/drawings/rasterize";
import type { Drawing, DrawingCategory } from "@/lib/models/drawing";
import { cn } from "@/lib/utils";

type Role = "redline" | "decor";

const SLOTS: Record<Role, { title: string; hint: string; icon: typeof FileStack; category: DrawingCategory }> = {
  redline: { title: "Redline set", hint: "Working drawings (PDF) — exact walls, heights, roofs, cladding", icon: FileStack, category: "redline" },
  decor: { title: "Décor set", hint: "Décor plans (PDF) — layout options, windows, doors", icon: Palette, category: "decor" },
};

/** The newest multi-page PDF already uploaded in a role, if any. */
function latest(drawings: Drawing[], role: Role) {
  return drawings.filter((d) => d.category === role && d.contentType === "application/pdf").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function Slot({ role, drawing, onUploaded, projectId }: { role: Role; drawing: Drawing | null; onUploaded: (d: Drawing) => void; projectId: string }) {
  const meta = SLOTS[role];
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ name: string; size: number; progress: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File) => {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      toast.error(`The ${role === "redline" ? "redline" : "décor"} set must be a PDF`);
      return;
    }
    setState({ name: file.name, size: file.size, progress: 0 });
    try {
      const raster = await rasterizeFile(file).catch(() => null);
      const d = await uploadDrawing({ projectId, file, raster, category: meta.category }, (p) => setState((s) => (s ? { ...s, progress: p } : s)));
      onUploaded(d);
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setState(null);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !state && input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !state && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) void upload(f);
      }}
      className={cn(
        "rounded-xl border px-3 py-2.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        drawing ? "border-emerald-300 bg-emerald-50/60" : "cursor-pointer border-dashed hover:bg-muted/50",
        dragging && "border-brand bg-brand/5",
      )}
    >
      <div className="flex items-start gap-2">
        {drawing ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <meta.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-xs font-semibold">
            {meta.title} <span className="font-normal text-destructive">*</span>
          </div>
          {state ? (
            <div className="mt-1 space-y-1">
              <div className="truncate text-[11px]">
                {state.name} · {formatBytes(state.size)}
              </div>
              <Progress value={Math.max(4, state.progress * 100)} className="h-1" />
            </div>
          ) : drawing ? (
            <div className="truncate text-[11px] text-muted-foreground">
              {drawing.fileName}
              {drawing.pageCount ? ` · ${drawing.pageCount} sheets` : ""}
            </div>
          ) : (
            <div className="text-[10px] leading-snug text-muted-foreground">{meta.hint}</div>
          )}
        </div>
        {drawing && !state && (
          <Button
            size="xs"
            variant="ghost"
            className="-mr-1 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              input.current?.click();
            }}
          >
            <RefreshCw /> Replace
          </Button>
        )}
        {!drawing && !state && <FileUp className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
      </div>
      <input
        ref={input}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
    </div>
  );
}

/**
 * The home is built from two drawing sets of the same model: the redline
 * (architectural working drawings) and the décor plans. Both are required.
 */
export function DrawingSetUpload({ projectId, drawings, onBuild }: { projectId: string; drawings: Drawing[]; onBuild: (pair: { redline: Drawing; decor: Drawing }) => void }) {
  const router = useRouter();
  // Uploads made here win over earlier ones until the page refreshes.
  const [picked, setPicked] = useState<Partial<Record<Role, Drawing>>>({});
  const redline = picked.redline ?? latest(drawings, "redline");
  const decor = picked.decor ?? latest(drawings, "decor");
  const ready = !!redline && !!decor;
  const set = (role: Role) => (d: Drawing) => {
    setPicked((p) => ({ ...p, [role]: d }));
    router.refresh();
  };
  return (
    <div className="space-y-2 rounded-xl border bg-muted/20 p-2.5">
      <div className="px-0.5">
        <div className="text-sm font-medium">Build the 3D home</div>
        <p className="text-[11px] leading-snug text-muted-foreground">Walls and exterior come from the redlines; options and openings from the décor plans.</p>
      </div>
      <Slot role="redline" drawing={redline} onUploaded={set("redline")} projectId={projectId} />
      <Slot role="decor" drawing={decor} onUploaded={set("decor")} projectId={projectId} />
      <Button className="w-full bg-brand text-brand-foreground hover:bg-brand/90" disabled={!ready} onClick={() => ready && onBuild({ redline: redline!, decor: decor! })}>
        {ready && <Box />}
        {ready ? "Read drawings & build" : `Add the ${!redline && !decor ? "redline and décor sets" : !redline ? "redline set" : "décor set"}`}
      </Button>
    </div>
  );
}
