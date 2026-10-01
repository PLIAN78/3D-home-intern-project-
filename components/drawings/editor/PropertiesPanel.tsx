"use client";

import { useState } from "react";
import { BadgeCheck, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { autoClassifyExterior, clampOpening, countUnverified, deleteElement, EXTERIOR_THICKNESS, formatLength, INTERIOR_THICKNESS, markAllVerified } from "@/lib/editor/editorOps";
import type { CladdingZone, DoorKind, Floor, RoomFinish } from "@/lib/models/house";
import { polygonArea, SQ_M_TO_SQ_FT, wallLength } from "@/lib/models/house";
import { useEditorFloor, useEditorStore } from "@/stores/editorStore";

/** Numeric input that commits on blur / Enter, so typing doesn't spam history. */
function NumberField({ label, value, onCommit, step = 0.01, min, hint }: { label: string; value: number; onCommit: (v: number) => void; step?: number; min?: number; hint?: string }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = Number(text);
    if (Number.isFinite(v) && (min === undefined || v >= min) && Math.abs(v - value) > 1e-9) onCommit(v);
    setText(null);
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        min={min}
        value={text ?? String(Math.round(value * 1000) / 1000)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className="h-8 text-sm"
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={text ?? value}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== null && text.trim() && text !== value) onCommit(text.trim());
          setText(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className="h-8 text-sm"
      />
    </div>
  );
}

function Pick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger size="sm" className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const ft = (m: number) => {
  const inches = Math.round(m * 39.3701);
  return `${Math.floor(inches / 12)}′-${inches % 12}″`;
};

function Header({ title, unverified, onVerify, onDelete }: { title: string; unverified?: boolean; onVerify?: () => void; onDelete?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="flex items-center gap-1">
        {unverified && onVerify && (
          <Button size="xs" variant="outline" onClick={onVerify} className="border-amber-300 text-amber-800">
            <BadgeCheck /> Confirm
          </Button>
        )}
        {onDelete && (
          <Button size="icon-xs" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onDelete} aria-label="Delete">
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  );
}

const CLADDING: { id: CladdingZone; label: string }[] = [
  { id: "brick", label: "Brick" },
  { id: "stone", label: "Stone accent" },
  { id: "siding", label: "Siding / stucco" },
  { id: "foundation", label: "Foundation (concrete)" },
];
const DOOR_KINDS: { id: DoorKind; label: string }[] = [
  { id: "interior", label: "Interior (shown open)" },
  { id: "exterior", label: "Exterior" },
  { id: "front", label: "Front entry" },
  { id: "garage", label: "Garage door" },
  { id: "patio", label: "Patio / sliding" },
  { id: "opening", label: "Cased opening" },
];
const FINISHES: { id: RoomFinish; label: string }[] = [
  { id: "main", label: "Main flooring" },
  { id: "tile", label: "Tile" },
  { id: "concrete", label: "Concrete / unfinished" },
  { id: "garage", label: "Garage slab" },
];

export function PropertiesPanel() {
  const floor = useEditorFloor();
  const selection = useEditorStore((s) => s.selection);
  const { commit, select } = useEditorStore.getState();
  const unverified = countUnverified(floor);

  const update = (fn: (f: Floor) => Floor) => commit(fn);
  const remove = () => {
    if (!selection) return;
    commit((f) => deleteElement(f, selection.kind, selection.id));
    select(null);
  };
  const verify = (kind: "walls" | "doors" | "windows" | "rooms", id: string) =>
    update((f) => ({ ...f, [kind]: (f[kind] as { id: string; unverified?: boolean }[]).map((x) => (x.id === id ? { ...x, unverified: undefined } : x)) }));

  if (selection?.kind === "wall") {
    const w = floor.walls.find((x) => x.id === selection.id);
    if (!w) return null;
    const set = (p: Partial<typeof w>) => update((f) => ({ ...f, walls: f.walls.map((x) => (x.id === w.id ? { ...x, ...p, unverified: undefined } : x)) }));
    return (
      <div className="space-y-3">
        <Header title={w.exterior ? "Exterior wall" : "Interior wall"} unverified={w.unverified} onVerify={() => verify("walls", w.id)} onDelete={remove} />
        <p className="text-xs text-muted-foreground">{formatLength(wallLength(w))}</p>
        <div className="flex items-center justify-between">
          <Label htmlFor="wall-ext" className="text-sm">
            Exterior wall
          </Label>
          <Switch id="wall-ext" checked={!!w.exterior} onCheckedChange={(v) => set({ exterior: v, thickness: v ? EXTERIOR_THICKNESS : INTERIOR_THICKNESS })} />
        </div>
        <NumberField label="Thickness (m)" value={w.thickness} min={0.05} onCommit={(v) => set({ thickness: v })} hint={ft(w.thickness)} />
        {w.exterior && <Pick label="Cladding" value={w.cladding ?? "brick"} options={CLADDING} onChange={(v) => set({ cladding: v })} />}
        <p className="text-[10px] text-muted-foreground">Wall height follows the floor&apos;s ceiling height when saved.</p>
      </div>
    );
  }

  if (selection?.kind === "door" || selection?.kind === "window") {
    const isDoor = selection.kind === "door";
    const o = (isDoor ? floor.doors : floor.windows).find((x) => x.id === selection.id);
    const w = o && floor.walls.find((x) => x.id === o.wallId);
    if (!o || !w) return null;
    const key = isDoor ? "doors" : "windows";
    const set = (p: Record<string, unknown>) =>
      update((f) => ({
        ...f,
        [key]: (f[key] as { id: string }[]).map((x) => {
          if (x.id !== o.id) return x;
          const next = { ...x, ...p, unverified: undefined } as typeof o;
          const pos = clampOpening(w, next.position, next.width);
          return pos === null ? x : { ...next, position: pos };
        }),
      }));
    return (
      <div className="space-y-3">
        <Header title={isDoor ? "Door" : "Window"} unverified={o.unverified} onVerify={() => verify(key, o.id)} onDelete={remove} />
        {isDoor && <Pick label="Type" value={(o as Floor["doors"][number]).kind ?? "interior"} options={DOOR_KINDS} onChange={(v) => set({ kind: v, ...(v === "garage" ? { width: Math.max(o.width, 2.75), height: 2.13 } : {}) })} />}
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Width (m)" value={o.width} min={0.3} onCommit={(v) => set({ width: v })} hint={ft(o.width)} />
          <NumberField label="Height (m)" value={o.height} min={0.3} onCommit={(v) => set({ height: v })} hint={ft(o.height)} />
          {!isDoor && <NumberField label="Sill (m)" value={(o as Floor["windows"][number]).sillHeight} min={0} onCommit={(v) => set({ sillHeight: v })} hint={ft((o as Floor["windows"][number]).sillHeight)} />}
          <NumberField label="Position (m)" value={o.position} min={0} onCommit={(v) => set({ position: v })} hint="centre, from wall start" />
        </div>
        <p className="text-[10px] text-muted-foreground">Drag the opening along its wall to reposition it.</p>
      </div>
    );
  }

  if (selection?.kind === "room") {
    const r = floor.rooms.find((x) => x.id === selection.id);
    if (!r) return null;
    const set = (p: Partial<typeof r>) => update((f) => ({ ...f, rooms: f.rooms.map((x) => (x.id === r.id ? { ...x, ...p, unverified: undefined } : x)) }));
    return (
      <div className="space-y-3">
        <Header title="Room" unverified={r.unverified} onVerify={() => verify("rooms", r.id)} onDelete={remove} />
        <TextField label="Name" value={r.name} onCommit={(v) => set({ name: v })} />
        <Pick label="Floor finish" value={r.finish ?? "main"} options={FINISHES} onChange={(v) => set({ finish: v })} />
        <p className="text-xs text-muted-foreground">≈ {Math.round(polygonArea(r.polygon) * SQ_M_TO_SQ_FT)} sq ft ({polygonArea(r.polygon).toFixed(1)} m²)</p>
        <p className="text-[10px] text-muted-foreground">Drag the square handles to reshape.</p>
      </div>
    );
  }

  // Floor properties
  const setFloor = (p: Partial<Floor>) => update((f) => ({ ...f, ...p }));
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Floor</h3>
      <TextField label="Name" value={floor.name} onCommit={(v) => setFloor({ name: v })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Ceiling height (m)" value={floor.ceilingHeight} min={1.8} onCommit={(v) => setFloor({ ceilingHeight: v })} hint={ft(floor.ceilingHeight)} />
        <NumberField label="Floor structure (m)" value={floor.floorThickness ?? 0.3} min={0.05} onCommit={(v) => setFloor({ floorThickness: v })} hint={ft(floor.floorThickness ?? 0.3)} />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="below-grade" className="text-sm">
          Below grade (basement)
        </Label>
        <Switch id="below-grade" checked={!!floor.belowGrade} onCheckedChange={(v) => setFloor({ belowGrade: v })} />
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">Elevations are stacked automatically from the main floor (≈ 0.3 m above grade) when you save.</p>
      <div className="grid grid-cols-4 gap-1.5 pt-1 text-center">
        {[
          ["Walls", floor.walls.length],
          ["Doors", floor.doors.length],
          ["Windows", floor.windows.length],
          ["Rooms", floor.rooms.length],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-muted/60 py-1.5">
            <div className="text-sm font-semibold">{v}</div>
            <div className="text-[9px] text-muted-foreground">{k}</div>
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" className="w-full" disabled={!floor.walls.length} onClick={() => update(autoClassifyExterior)}>
        <Wand2 /> Auto-detect exterior walls
      </Button>
      {unverified > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
          <p className="text-xs font-medium">{unverified} imported element{unverified > 1 ? "s" : ""} not yet reviewed</p>
          <p className="mt-0.5 text-[10px]">Shown dashed in amber. Check them against the drawing, fix or delete, then confirm.</p>
          <Button size="xs" className="mt-2 w-full" variant="outline" onClick={() => update(markAllVerified)}>
            <BadgeCheck /> I&apos;ve reviewed everything — confirm all
          </Button>
        </div>
      )}
    </div>
  );
}
