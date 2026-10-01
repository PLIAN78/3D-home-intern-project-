"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLength, parseLength } from "@/lib/editor/editorOps";

interface Props {
  open: boolean;
  /** Distance between the two clicked points at the current scale (m). */
  measured: number;
  defaultRescale: boolean;
  hasGeometry: boolean;
  onCancel: () => void;
  onConfirm: (realMetres: number, rescaleGeometry: boolean) => void;
}

/** "Define scale using two points and a known measurement." */
export function CalibrationDialog({ open, measured, defaultRescale, hasGeometry, onCancel, onConfirm }: Props) {
  const [text, setText] = useState("");
  const [unit, setUnit] = useState<"m" | "ft">("ft");
  const [rescale, setRescale] = useState(defaultRescale);
  const value = parseLength(text, unit);
  const valid = value !== null && value > 0.05;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set drawing scale</DialogTitle>
          <DialogDescription>Enter the real distance between the two points you clicked, e.g. an overall dimension string.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onConfirm(value, rescale);
          }}
        >
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="cal-len">Real length</Label>
              <Input id="cal-len" autoFocus placeholder={unit === "ft" ? `e.g. 42'-0"` : "e.g. 12.8"} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <div className="flex rounded-md border p-0.5 text-xs">
              {(["ft", "m"] as const).map((u) => (
                <button key={u} type="button" onClick={() => setUnit(u)} className={`rounded px-2.5 py-1.5 ${unit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Currently measures {formatLength(measured)}.{valid && ` New scale ×${(value / measured).toFixed(3)} → ${formatLength(value)}.`}
          </p>
          {hasGeometry && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={rescale} onCheckedChange={(v) => setRescale(v === true)} className="mt-0.5" />
              <span>
                Rescale existing geometry on this floor
                <span className="block text-xs text-muted-foreground">Tick if it was traced on this drawing before calibrating. Untick to keep geometry and only resize the drawing.</span>
              </span>
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              Apply scale
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
