"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useViewerStore } from "@/stores/viewerStore";

function Row({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Toggles for peeling the building open to see interiors. */
export function CutawayControls() {
  const showRoof = useViewerStore((s) => s.showRoof);
  const showExteriorWalls = useViewerStore((s) => s.showExteriorWalls);
  const showCeilings = useViewerStore((s) => s.showCeilings);
  const showLabels = useViewerStore((s) => s.showLabels);
  const { setShowRoof, setShowExteriorWalls, setShowCeilings, setShowLabels } = useViewerStore.getState();
  return (
    <div className="divide-y">
      <Row id="cut-roof" label="Roof" hint="Hide to look down into the top floor" checked={showRoof} onChange={setShowRoof} />
      <Row id="cut-walls" label="Exterior walls" hint="Dollhouse view of interiors" checked={showExteriorWalls} onChange={setShowExteriorWalls} />
      <Row id="cut-ceilings" label="Ceilings" hint="Show ceiling planes" checked={showCeilings} onChange={setShowCeilings} />
      <Row id="cut-labels" label="Room labels" hint="Names and approximate areas" checked={showLabels} onChange={setShowLabels} />
    </div>
  );
}
