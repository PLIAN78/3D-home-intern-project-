"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Loader2, Minus, Plus, RotateCcw, RotateCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isIdentity, NO_DELTA, type PlacementDelta } from "@/lib/community/adjustPlacement";
import { cn } from "@/lib/utils";

const STEPS = [1, 5, 25] as const;

function Pad({ onClick, children, label }: { onClick: () => void; children: ReactNode; label: string }) {
  return (
    <Button type="button" variant="outline" size="icon" className="size-8" onClick={onClick} aria-label={label}>
      {children}
    </Button>
  );
}

/**
 * Nudge the whole site plan over the real map until lots line up with the
 * streets (arrow keys move, Shift = bigger steps, [ and ] rotate).
 */
export function PlacementPanel({ communityId, delta, onChange, onDone }: { communityId: string; delta: PlacementDelta; onChange: (d: PlacementDelta) => void; onDone: (saved: boolean) => void }) {
  const [step, setStep] = useState<(typeof STEPS)[number]>(5);
  const [busy, setBusy] = useState(false);
  const deg = (step === 1 ? 0.25 : step === 5 ? 1 : 4) * (Math.PI / 180);
  const pct = step === 1 ? 0.002 : step === 5 ? 0.01 : 0.04;

  const move = (dx: number, dz: number) => onChange({ ...delta, dx: delta.dx + dx * step, dz: delta.dz + dz * step });
  const rotate = (dir: number) => onChange({ ...delta, rotation: delta.rotation + dir * deg });
  const scale = (dir: number) => onChange({ ...delta, scale: Math.round(delta.scale * (1 + dir * pct) * 1e4) / 1e4 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      const k = e.shiftKey ? 5 : 1;
      const map: Record<string, () => void> = {
        ArrowUp: () => onChange({ ...delta, dz: delta.dz - step * k }),
        ArrowDown: () => onChange({ ...delta, dz: delta.dz + step * k }),
        ArrowLeft: () => onChange({ ...delta, dx: delta.dx - step * k }),
        ArrowRight: () => onChange({ ...delta, dx: delta.dx + step * k }),
        "[": () => onChange({ ...delta, rotation: delta.rotation + deg * k }),
        "]": () => onChange({ ...delta, rotation: delta.rotation - deg * k }),
      };
      const f = map[e.key];
      if (f) {
        e.preventDefault();
        f();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [delta, step, deg, onChange]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/placement`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(delta) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      toast.success("Placement saved", { description: "Lot positions and map locations were updated." });
      onDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="text-base font-semibold">Adjust placement</div>
        <p className="mt-1 text-xs text-muted-foreground">Move the site plan until the lots sit along the real streets. Arrow keys move it; Shift moves further; [ and ] rotate.</p>
      </div>
      <div className="flex rounded-lg bg-muted p-0.5 text-[11px] font-medium">
        {STEPS.map((s) => (
          <button key={s} type="button" onClick={() => setStep(s)} className={cn("flex-1 rounded-md px-2 py-1 transition-colors", step === s ? "bg-background shadow-sm" : "text-muted-foreground")}>
            {s === 1 ? "Fine" : s === 5 ? "Normal" : "Coarse"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">Move ({step} m)</div>
          <div className="grid w-fit grid-cols-3 gap-1">
            <span />
            <Pad onClick={() => move(0, -1)} label="Move north">
              <ArrowUp />
            </Pad>
            <span />
            <Pad onClick={() => move(-1, 0)} label="Move west">
              <ArrowLeft />
            </Pad>
            <span className="flex items-center justify-center text-[10px] text-muted-foreground">N↑</span>
            <Pad onClick={() => move(1, 0)} label="Move east">
              <ArrowRight />
            </Pad>
            <span />
            <Pad onClick={() => move(0, 1)} label="Move south">
              <ArrowDown />
            </Pad>
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">Rotate</div>
            <div className="flex gap-1">
              <Pad onClick={() => rotate(1)} label="Rotate anticlockwise">
                <RotateCcw />
              </Pad>
              <Pad onClick={() => rotate(-1)} label="Rotate clockwise">
                <RotateCw />
              </Pad>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">Scale</div>
            <div className="flex gap-1">
              <Pad onClick={() => scale(-1)} label="Smaller">
                <Minus />
              </Pad>
              <Pad onClick={() => scale(1)} label="Larger">
                <Plus />
              </Pad>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground tabular-nums">
        {delta.dx >= 0 ? "E" : "W"} {Math.abs(delta.dx).toFixed(0)} m · {delta.dz <= 0 ? "N" : "S"} {Math.abs(delta.dz).toFixed(0)} m · {((delta.rotation * 180) / Math.PI).toFixed(1)}° · ×{delta.scale.toFixed(3)}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="flex-1" onClick={() => (isIdentity(delta) ? onDone(false) : onChange(NO_DELTA))}>
          {isIdentity(delta) ? "Close" : "Reset"}
        </Button>
        <Button size="sm" className="flex-1" onClick={save} disabled={busy || isIdentity(delta)}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />} Save placement
        </Button>
      </div>
    </div>
  );
}
