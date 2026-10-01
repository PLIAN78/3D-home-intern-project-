"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Box, CheckCircle2, ChevronDown, Layers, Loader2, PencilRuler, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { analyzeDrawingSet, applyPlanSetRequest, fetchDrawing, fetchPlanSetSummary } from "@/lib/drawings/api";
import type { Drawing } from "@/lib/models/drawing";
import type { PlanSetSummary } from "@/lib/models/planSet";

interface Props {
  projectId: string;
  projectSlug: string;
  drawingId: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * One-step flow for décor / plan sets: read every sheet automatically, show a
 * short summary, then ask once — generate the 3D home now, or review first.
 */
export function DrawingSetDialog({ projectId, projectSlug, drawingId, onOpenChange }: Props) {
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
        if (!d.analysis && started.current !== drawingId) {
          started.current = drawingId;
          d = await analyzeDrawingSet(drawingId);
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
  }, [drawingId, projectId, nonce]);

  const reset = () => {
    setDrawing(null);
    setSummary(null);
    started.current = null;
  };

  const retry = async () => {
    if (!drawingId) return;
    setSummary(null);
    started.current = drawingId;
    setDrawing(await analyzeDrawingSet(drawingId));
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

  return (
    <Dialog
      open={!!drawingId}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-4.5 text-brand" />
            {summary ? "Your drawing set is ready" : a?.status === "failed" ? "We couldn't read this drawing set" : "Reading your drawing set…"}
          </DialogTitle>
          <DialogDescription className="truncate">{drawing?.fileName ?? "Preparing…"}</DialogDescription>
        </DialogHeader>

        {running && (
          <div className="space-y-2 py-2">
            <Progress value={a?.stage === "Reading sheets" ? pct * 0.1 : a?.stage === "Measuring scale" ? 10 + pct * 0.25 : a?.stage?.startsWith("Tracing") ? 35 + pct * 0.6 : 3} className="h-2" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              <span className="truncate">{a?.stage ?? "Starting"}{a && a.total > 1 ? ` · ${a.done}/${a.total}` : ""}</span>
            </div>
            <p className="text-xs text-muted-foreground">Finding every floor, elevation and layout option, reading room sizes for scale, and tracing walls, doors and windows. This takes about a minute for a large set.</p>
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
              We&apos;ll start with the <b>standard plan</b> for <b>{summary.elevations[0]?.label}</b> and default exterior and interior finishes. Elevations and layout options can be switched any time in the <b>Plan</b> tab.
            </p>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[12px] text-amber-900">
              Plans were traced automatically (about {Math.round(summary.confidence * 100)}% confidence
              {summary.scale.source === "room-dimensions" ? ", scale read from room sizes" : ""}). Dimensions are approximate until reviewed.
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
