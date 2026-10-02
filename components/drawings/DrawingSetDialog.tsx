"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Box, CheckCircle2, ChevronDown, Layers, Loader2, PencilRuler, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { applyPlanSetRequest, fetchDrawing, fetchPlanSetSummary, startDrawingSet } from "@/lib/drawings/api";
import type { Drawing } from "@/lib/models/drawing";
import type { PlanSetSummary } from "@/lib/models/planSet";

/** What the dialog follows: the drawing carrying the analysis, and the pair to (re)start it with. */
export interface DrawingSetRequest {
  /** Drawing whose analysis progress is polled (the redline of a pair). */
  pollId: string;
  /** Start a combined analysis of this redline + décor pair (omit to only follow an existing one). */
  start?: { redlineId: string; decorId: string };
  /** File names to show. */
  names?: string[];
}

interface Props {
  projectId: string;
  projectSlug: string;
  request: DrawingSetRequest | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * One-step flow for drawing sets: read the redline and décor sets, show a
 * short summary, then ask once — generate the 3D home now, or review first.
 */
export function DrawingSetDialog({ projectId, projectSlug, request, onOpenChange }: Props) {
  const drawingId = request?.pollId ?? null;
  const router = useRouter();
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [summary, setSummary] = useState<PlanSetSummary | null>(null);
  const [busy, setBusy] = useState<"generate" | "review" | null>(null);
  const [showSheets, setShowSheets] = useState(false);
  const started = useRef<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Start (if needed) and poll the analysis job.
  useEffect(() => {
    if (!drawingId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        let d = await fetchDrawing(drawingId);
        const pair = request?.start;
        if (pair && started.current !== drawingId) {
          started.current = drawingId;
          // A finished analysis of this exact pair is reused; anything else starts afresh.
          const same = d.analysis?.partnerDrawingId === pair.decorId && d.analysis.status !== "failed";
          if (!same) d = await startDrawingSet(projectId, pair.redlineId, pair.decorId);
        }
        if (stop) return;
        setDrawing(d);
        if (d.analysis?.status === "done" && d.analysis.planSetId) {
          const s = await fetchPlanSetSummary(projectId, d.analysis.planSetId);
          if (!stop) setSummary(s);
          return;
        }
        if (d.analysis?.status === "failed") return;
      } catch (e) {
        if (!stop) toast.error("Couldn't read the drawing set", { description: e instanceof Error ? e.message : undefined });
        return;
      }
      timer = setTimeout(tick, 1200);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `request` identity changes with each open; the ids drive the effect
  }, [drawingId, projectId, nonce, request?.start?.decorId]);

  const reset = () => {
    setDrawing(null);
    setSummary(null);
    started.current = null;
  };

  const retry = async () => {
    const pair = request?.start ?? (drawing?.analysis?.partnerDrawingId && drawingId ? { redlineId: drawingId, decorId: drawing.analysis.partnerDrawingId } : null);
    if (!drawingId || !pair) return;
    setSummary(null);
    started.current = drawingId;
    try {
      setDrawing(await startDrawingSet(projectId, pair.redlineId, pair.decorId));
    } catch (e) {
      toast.error("Couldn't start reading the drawings", { description: e instanceof Error ? e.message : undefined });
    }
    setNonce((n) => n + 1);
  };

  const apply = async (then: "generate" | "review") => {
    const planSetId = drawing?.analysis?.planSetId;
    if (!planSetId) return;
    setBusy(then);
    try {
      await applyPlanSetRequest(projectId, planSetId);
      toast.success(then === "generate" ? "Your 3D home is ready" : "Drawings ready to review", {
        description: then === "generate" ? "Showing the standard plan with default finishes. Switch elevations and layouts in the Plan tab." : "Check each floor, then save to update the 3D home.",
      });
      onOpenChange(false);
      reset();
      router.push(then === "generate" ? `/projects/${projectSlug}` : `/projects/${projectSlug}/trace`);
      router.refresh();
    } catch (e) {
      toast.error("Couldn't generate the home", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const a = drawing?.analysis;
  const running = !summary && (!a || a.status === "running");
  const pct = a && a.total ? Math.round((a.done / a.total) * 100) : 0;
  // Combined analyses report one 0–2000 scale across both sets; single-set ones report per stage.
  const progress = a && a.total >= 1000 ? Math.max(3, pct) : a?.stage === "Reading sheets" ? pct * 0.1 : a?.stage === "Measuring scale" ? 10 + pct * 0.25 : a?.stage?.startsWith("Tracing") ? 35 + pct * 0.6 : 3;

  return (
    <Dialog
      open={!!request}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-4.5 text-brand" />
            {summary ? "Your drawings are ready" : a?.status === "failed" ? "We couldn't read these drawings" : "Reading your drawings…"}
          </DialogTitle>
          <DialogDescription className="truncate">{request?.names?.join(" + ") ?? drawing?.fileName ?? "Preparing…"}</DialogDescription>
        </DialogHeader>

        {running && (
          <div className="space-y-2 py-2">
            <Progress value={progress} className="h-2" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              <span className="truncate">{a?.stage ?? "Starting"}</span>
            </div>
            <p className="text-xs text-muted-foreground">Walls and exterior from the redlines; options and openings from the décor plans. Large sets take a few minutes.</p>
          </div>
        )}

        {a?.status === "failed" && (
          <div className="space-y-3 py-1">
            <p className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {a.error ?? "Analysis failed."}
            </p>
            <p className="text-xs text-muted-foreground">You can still trace the plans by hand in the floor-plan editor.</p>
          </div>
        )}

        {summary && (
          <div className="space-y-4 py-1">
            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="size-4 text-emerald-600" />
                {summary.modelCode ? `Model ${summary.modelCode}` : "Floor plans found"} · {summary.pageCount} sheets
              </div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Floors</dt>
                <dd>{summary.levels.map((l) => l.name).join(", ")}</dd>
                <dt className="text-muted-foreground">Elevations</dt>
                <dd className="flex flex-wrap gap-1">
                  {summary.elevations.map((e, i) => (
                    <Badge key={e.id} variant={i === 0 ? "default" : "secondary"}>
                      {e.label.replace(/^Elevation /, "")}
                      {i === 0 && " · standard"}
                    </Badge>
                  ))}
                </dd>
                <dt className="text-muted-foreground">Layout options</dt>
                <dd>{summary.options.length ? summary.options.map((o) => `${o.name} (${o.levelName.replace(" Floor", "")})`).join(", ") : "None"}</dd>
              </dl>
            </div>

            <p className="text-sm">
              Starts on the <b>standard plan</b> of <b>{summary.elevations[0]?.label}</b> with default finishes — switch any time in the <b>Plan</b> tab.
            </p>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[12px] text-amber-900">
              Traced automatically · ~{Math.round(summary.confidence * 100)}% confidence. Dimensions are approximate until reviewed.
            </div>

            {summary.unmodeled.length > 0 && (
              <div>
                <button type="button" onClick={() => setShowSheets((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <ChevronDown className={`size-3.5 transition-transform ${showSheets ? "rotate-180" : ""}`} /> {summary.unmodeled.length} sheets kept for reference only
                </button>
                {showSheets && (
                  <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-auto text-[11px] text-muted-foreground">
                    {summary.unmodeled.map((u) => (
                      <li key={u.page}>
                        p{u.page} · {u.title} — {u.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <p className="text-sm font-medium">Do you want to review or edit the floor plans first?</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {a?.status === "failed" ? (
            <>
              <Button variant="outline" onClick={() => router.push(`/projects/${projectSlug}/trace`)}>
                <PencilRuler /> Trace manually
              </Button>
              <Button onClick={retry}>
                <RotateCw /> Try again
              </Button>
            </>
          ) : summary ? (
            <>
              <Button variant="outline" onClick={() => apply("review")} disabled={!!busy}>
                {busy === "review" ? <Loader2 className="animate-spin" /> : <PencilRuler />} Yes, review first
              </Button>
              <Button onClick={() => apply("generate")} disabled={!!busy} className="bg-brand text-brand-foreground hover:bg-brand/90">
                {busy === "generate" ? <Loader2 className="animate-spin" /> : <Box />} No, generate my 3D home
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Run in background
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
