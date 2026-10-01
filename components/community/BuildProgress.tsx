"use client";

import { useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BUILD_STATE_LABEL, buildState, CONSTRUCTION_STAGES, progressPercent, stageIndex, type LotProgress, type StageId } from "@/lib/models/construction";
import { cn } from "@/lib/utils";

const fmt = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "");

/** Overall bar + headline for a lot's construction. */
export function ProgressSummary({ progress, compact = false }: { progress: LotProgress | null | undefined; compact?: boolean }) {
  const pct = progressPercent(progress);
  const stage = progress ? CONSTRUCTION_STAGES[stageIndex(progress.stage)] : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className={cn("font-semibold", compact ? "text-xs" : "text-sm")}>{stage ? stage.label : "Not started"}</div>
        <div className={cn("tabular-nums text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>{pct}%</div>
      </div>
      <div className={cn("overflow-hidden rounded-full bg-muted", compact ? "h-1.5" : "h-2.5")}>
        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500" style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      {!compact && progress?.expectedClosing && progress.stage !== "closed" && (
        <div className="text-xs text-muted-foreground">
          Expected closing <span className="font-medium text-foreground">{fmt(progress.expectedClosing)}</span>
        </div>
      )}
    </div>
  );
}

/** Stage-by-stage timeline with completion dates. */
export function ProgressTimeline({ progress }: { progress: LotProgress | null | undefined }) {
  const current = progress ? stageIndex(progress.stage) : -1;
  return (
    <ol className="relative space-y-0">
      {CONSTRUCTION_STAGES.map((s, i) => {
        const done = i < current || (progress?.stage === "closed" && i === current);
        const active = i === current && !done;
        return (
          <li key={s.id} className="relative flex gap-3 pb-3 last:pb-0">
            {i < CONSTRUCTION_STAGES.length - 1 && <span className={cn("absolute top-5 left-[9px] h-[calc(100%-12px)] w-px", done ? "bg-emerald-500" : "bg-border")} />}
            <span
              className={cn(
                "relative z-10 mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full border text-[9px]",
                done ? "border-emerald-500 bg-emerald-500 text-white" : active ? "border-amber-500 bg-amber-50 ring-4 ring-amber-500/15" : "bg-background",
              )}
            >
              {done ? <Check className="size-3" /> : active ? <span className="size-2 animate-pulse rounded-full bg-amber-500" /> : null}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn("text-xs font-medium", !done && !active && "text-muted-foreground")}>{s.label}</span>
                {done && progress?.completed[s.id] && <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{fmt(progress.completed[s.id])}</span>}
                {active && <span className="shrink-0 text-[10px] font-medium text-amber-700">In progress</span>}
              </div>
              {(active || (!progress && i === 0)) && <p className="mt-0.5 text-[11px] text-muted-foreground">{s.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function DemoDataBadge({ progress }: { progress: LotProgress | null | undefined }) {
  if (!progress?.demo) return null;
  return (
    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-800" title="Generated for the demo — not entered by the construction team">
      Sample data
    </Badge>
  );
}

/** Construction team: move a lot to a stage, set the closing date and notes. */
export function ProgressEditor({ communityId, lotId, progress, onSaved }: { communityId: string; lotId: string; progress: LotProgress | null | undefined; onSaved: (p: LotProgress) => void }) {
  const [stage, setStage] = useState<StageId>(progress?.stage ?? "reserved");
  const [closing, setClosing] = useState(progress?.expectedClosing ?? "");
  const [notes, setNotes] = useState(progress?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      // Stages before the chosen one count as complete; keep known dates, stamp new ones today.
      const today = new Date().toISOString().slice(0, 10);
      const completed: LotProgress["completed"] = {};
      const idx = stageIndex(stage);
      for (const s of CONSTRUCTION_STAGES.slice(0, stage === "closed" ? idx + 1 : idx)) completed[s.id] = progress?.completed[s.id] ?? today;
      const res = await fetch(`/api/communities/${communityId}/lots/${lotId}/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, completed, expectedClosing: closing || undefined, notes: notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSaved(data as LotProgress);
      toast.success("Progress updated", { description: `${BUILD_STATE_LABEL[buildState(data)]} · ${progressPercent(data)}%` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
      <div className="text-xs font-semibold">Update progress</div>
      <div className="space-y-1.5">
        <Label className="text-[11px]">Current stage</Label>
        <Select value={stage} onValueChange={(v) => setStage(v as StageId)}>
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONSTRUCTION_STAGES.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px]" htmlFor={`closing-${lotId}`}>
          Expected closing
        </Label>
        <Input id={`closing-${lotId}`} type="date" className="h-8 text-xs" value={closing} onChange={(e) => setClosing(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px]" htmlFor={`notes-${lotId}`}>
          Note for the homeowner
        </Label>
        <Input id={`notes-${lotId}`} className="h-8 text-xs" value={notes} maxLength={300} placeholder="e.g. Roof trusses delivered" onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button size="sm" className="w-full" onClick={save} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Save />} Save progress
      </Button>
    </div>
  );
}
