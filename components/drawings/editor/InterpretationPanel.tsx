"use client";

import { useState } from "react";
import { AlertTriangle, Download, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INTERPRETER_OPTIONS } from "@/components/drawings/DrawingList";
import { interpretDrawing } from "@/lib/drawings/api";
import { importInterpretation } from "@/lib/editor/editorOps";
import type { Drawing } from "@/lib/models/drawing";
import { useEditorFloor, useEditorStore } from "@/stores/editorStore";

/**
 * Shows what an interpreter extracted from the drawing (with confidence and
 * warnings) and lets the user import it as unverified geometry to review.
 */
export function InterpretationPanel({ drawing, onDrawingUpdated }: { drawing: Drawing; onDrawingUpdated: (d: Drawing) => void }) {
  const floor = useEditorFloor();
  const calibration = useEditorStore((s) => s.calibration);
  const [interpreter, setInterpreter] = useState("heuristic");
  const [running, setRunning] = useState(false);
  const interp = drawing.interpretation;

  const run = async () => {
    setRunning(true);
    try {
      onDrawingUpdated(await interpretDrawing(drawing.id, interpreter));
    } catch (e) {
      toast.error("Interpretation failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setRunning(false);
    }
  };

  const doImport = (mode: "replace" | "append") => {
    if (!interp) return;
    if (mode === "replace" && floor.walls.length && !window.confirm(`Replace the ${floor.walls.length} existing walls on ${floor.name} with the imported geometry?`)) return;
    const { commit } = useEditorStore.getState();
    // On a fresh import, use the interpreter's scale estimate until a person calibrates.
    // (Appending keeps the current scale so existing geometry stays aligned with the drawing.)
    const useEstimate = mode === "replace" && !calibration.calibrated && !!interp.scale;
    const c = useEstimate && interp.scale ? { ...calibration, metresPerPixel: interp.scale.metresPerPixel } : calibration;
    commit((f) => importInterpretation(f, interp, c, mode), c);
    toast.success(`Imported ${interp.walls.length} walls, ${interp.doors.length} doors, ${interp.windows.length} windows`, { description: "Shown dashed in amber until you review them." });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5">
        <Select value={interpreter} onValueChange={setInterpreter}>
          <SelectTrigger size="sm" className="h-8 min-w-0 flex-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERPRETER_OPTIONS.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={run} disabled={running || !drawing.rasterKey}>
          {running ? <Loader2 className="animate-spin" /> : <ScanSearch />} Run
        </Button>
      </div>

      {interp ? (
        <div className="space-y-2 rounded-lg border p-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{INTERPRETER_OPTIONS.find((o) => o.id === interp.interpreter)?.label ?? interp.interpreter}</span>
            <span className="tabular-nums text-muted-foreground">{Math.round(interp.confidence * 100)}% confidence</span>
          </div>
          <Progress value={interp.confidence * 100} className="h-1.5" />
          <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
            <div className="rounded bg-muted/60 py-1">
              <b className="block text-sm">{interp.walls.length}</b>walls
            </div>
            <div className="rounded bg-muted/60 py-1">
              <b className="block text-sm">{interp.doors.length}</b>doors
            </div>
            <div className="rounded bg-muted/60 py-1">
              <b className="block text-sm">{interp.windows.length}</b>windows
            </div>
          </div>
          {interp.warnings.length > 0 && (
            <ul className="space-y-1">
              {interp.warnings.map((w) => (
                <li key={w} className="flex gap-1.5 text-[10px] leading-snug text-amber-900">
                  <AlertTriangle className="mt-px size-3 shrink-0 text-amber-600" /> {w}
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="xs" onClick={() => doImport("replace")}>
              <Download /> Import (replace)
            </Button>
            <Button size="xs" variant="outline" onClick={() => doImport("append")}>
              Add to floor
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Run an interpreter to get a starting point, or trace walls by hand with the Wall tool.</p>
      )}
    </div>
  );
}
