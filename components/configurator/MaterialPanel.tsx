"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SELECTIONS,
  getMaterialOption,
  MATERIAL_SLOTS,
  optionsForSlot,
  type MaterialGroup,
  type MaterialOption,
  type MaterialSlotId,
} from "@/lib/models/materials";
import { swatchDataUrl } from "@/lib/materials/swatches";
import { useProjectStore, useSelections } from "@/stores/projectStore";
import type { PlanSelection, PlanSet } from "@/lib/models/planSet";
import { PlanOptionsPanel } from "./PlanOptionsPanel";
import { useViewerStore } from "@/stores/viewerStore";

function Swatch({ option, className }: { option: MaterialOption; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    // Painted client-side (canvas); plain colours fall back to CSS.
    const id = requestAnimationFrame(() => setUrl(swatchDataUrl(option)));
    return () => cancelAnimationFrame(id);
  }, [option]);
  return (
    <span
      className={cn("block bg-cover bg-center", className)}
      style={{ backgroundColor: option.color, backgroundImage: url ? `url(${url})` : undefined }}
      aria-hidden
    />
  );
}

function OptionGrid({ projectId, slot, selectedId }: { projectId: string; slot: MaterialSlotId; selectedId: string }) {
  const setOption = useProjectStore((s) => s.setOption);
  return (
    <div className="grid grid-cols-2 gap-2 pt-1">
      {optionsForSlot(slot).map((o) => {
        const active = o.id === selectedId;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setOption(projectId, slot, o.id)}
            className={cn(
              "group relative overflow-hidden rounded-lg border bg-card text-left transition-all hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active ? "border-brand ring-2 ring-brand/40" : "border-border",
            )}
          >
            <Swatch option={o} className="h-16 w-full" />
            <span className="block px-2 py-1.5">
              <span className="block truncate text-xs font-medium">{o.name}</span>
              {o.description && <span className="block truncate text-[10px] text-muted-foreground">{o.description}</span>}
            </span>
            {active && (
              <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground shadow">
                <Check className="size-3" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface MaterialPanelProps {
  projectId: string;
  modelName: string;
  variant?: "studio" | "customer";
  /** Drawing-set homes add a Plan tab (elevation + layout options). */
  planSet?: PlanSet;
  planSelection?: PlanSelection | null;
  onPlanChange?: (s: PlanSelection) => void;
}

/** Right-hand "Home Options" configurator. */
export function MaterialPanel({ projectId, modelName, variant = "studio", planSet, planSelection, onPlanChange }: MaterialPanelProps) {
  const selections = useSelections(projectId);
  const resetSelections = useProjectStore((s) => s.resetSelections);
  const selectedSlot = useViewerStore((s) => s.selectedSlot);
  const selectSlot = useViewerStore((s) => s.selectSlot);
  const hasPlan = !!(planSet && planSelection && onPlanChange);
  const [group, setGroup] = useState<MaterialGroup | "plan">(hasPlan ? "plan" : "exterior");
  const itemRefs = useRef<Partial<Record<MaterialSlotId, HTMLDivElement | null>>>({});

  // Clicking a surface in 3D opens its category here.
  const slotGroup = selectedSlot ? MATERIAL_SLOTS.find((s) => s.id === selectedSlot)?.group : undefined;
  const activeGroup = slotGroup ?? (group === "plan" && !hasPlan ? "exterior" : group);
  useEffect(() => {
    if (!selectedSlot) return;
    const t = setTimeout(() => itemRefs.current[selectedSlot]?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 220);
    return () => clearTimeout(t);
  }, [selectedSlot]);

  const changed = MATERIAL_SLOTS.filter((s) => selections[s.id] !== DEFAULT_SELECTIONS[s.id]).length;
  const slots = MATERIAL_SLOTS.filter((s) => s.group === activeGroup);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">{variant === "customer" ? "Personalize your home" : "Home Options"}</h2>
            <p className="text-xs text-muted-foreground">{modelName} · changes apply instantly</p>
          </div>
          {changed > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-[color:oklch(0.5_0.13_62)]">
              <Sparkles className="size-3" /> {changed} upgraded
            </span>
          )}
        </div>
        <Tabs
          value={activeGroup}
          onValueChange={(v) => {
            setGroup(v as MaterialGroup | "plan");
            selectSlot(null);
          }}
        >
          <TabsList className={hasPlan ? "grid w-full grid-cols-3" : "grid w-full grid-cols-2"}>
            {hasPlan && <TabsTrigger value="plan">Plan</TabsTrigger>}
            <TabsTrigger value="exterior">Exterior</TabsTrigger>
            <TabsTrigger value="interior">Interior</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {activeGroup === "plan" && hasPlan && (
          <div className="p-4">
            <PlanOptionsPanel planSet={planSet!} selection={planSelection!} onChange={onPlanChange!} variant={variant} />
          </div>
        )}
        <Accordion
          type="single"
          collapsible
          value={selectedSlot && slots.some((s) => s.id === selectedSlot) ? selectedSlot : ""}
          onValueChange={(v) => selectSlot((v || null) as MaterialSlotId | null)}
          className="px-4 pb-4"
        >
          {slots.map((slot) => {
            const current = getMaterialOption(selections[slot.id]);
            return (
              <AccordionItem
                key={slot.id}
                value={slot.id}
                ref={(el) => {
                  itemRefs.current[slot.id] = el;
                }}
              >
                <AccordionTrigger className="py-3 hover:no-underline">
                  <span className="flex min-w-0 items-center gap-3">
                    {current && <Swatch option={current} className="size-9 shrink-0 rounded-md ring-1 ring-black/10" />}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{slot.label}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">{current?.name ?? "—"}</span>
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="pb-2 text-[11px] text-muted-foreground">{slot.description}</p>
                  <OptionGrid projectId={projectId} slot={slot.id} selectedId={selections[slot.id]} />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </ScrollArea>

      <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
        <p className="text-[11px] leading-tight text-muted-foreground">
          Tip: click any surface on the
          <br />
          home to jump to its options.
        </p>
        <Button variant="ghost" size="sm" onClick={() => resetSelections(projectId)} disabled={changed === 0}>
          <RotateCcw /> Reset
        </Button>
      </div>
    </div>
  );
}
