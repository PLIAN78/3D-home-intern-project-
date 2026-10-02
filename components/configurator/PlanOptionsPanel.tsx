"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVEL_LABEL, optionsFor, type PlanSelection, type PlanSet } from "@/lib/models/planSet";

function Choice({ active, title, subtitle, onClick }: { active: boolean; title: string; subtitle?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active ? "border-brand bg-brand/5 ring-1 ring-brand/30" : "hover:bg-muted/50",
      )}
    >
      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", active ? "border-brand bg-brand text-brand-foreground" : "border-muted-foreground/40")}>
        {active && <Check className="size-2.5" strokeWidth={4} />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>}
      </span>
    </button>
  );
}

/** Elevation + layout options from a drawing set. */
export function PlanOptionsPanel({ planSet, selection, onChange, variant }: { planSet: PlanSet; selection: PlanSelection; onChange: (s: PlanSelection) => void; variant: "studio" | "customer" }) {
  const levelsWithOptions = planSet.levels.filter((l) => optionsFor(planSet, selection.elevationId, l).length > 0);
  const unreviewed = planSet.variants.filter((v) => v.elevationId === selection.elevationId && !v.reviewed).length;
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Elevation</h3>
        <div className="grid grid-cols-2 gap-2">
          {planSet.elevations.map((e, i) => (
            <Choice key={e.id} active={selection.elevationId === e.id} title={e.label.replace(/^Elevation /, "")} subtitle={i === 0 ? "Standard" : undefined} onClick={() => onChange({ elevationId: e.id, options: selection.options })} />
          ))}
        </div>
      </section>

      {levelsWithOptions.map((level) => {
        const opts = optionsFor(planSet, selection.elevationId, level);
        const current = selection.options[level] ?? null;
        return (
          <section key={level}>
            <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{LEVEL_LABEL[level]} layout</h3>
            <div className="space-y-1.5">
              <Choice active={!current} title="Standard" onClick={() => onChange({ ...selection, options: { ...selection.options, [level]: null } })} />
              {opts.map((o) => (
                <Choice key={o.id} active={current === o.id} title={o.name} onClick={() => onChange({ ...selection, options: { ...selection.options, [level]: o.id } })} />
              ))}
            </div>
          </section>
        );
      })}

      {variant === "studio" && (
        <p className="rounded-lg bg-muted/60 p-2.5 text-[11px] leading-snug text-muted-foreground">
          From {planSet.modelCode ? `model ${planSet.modelCode}` : "the drawing set"} · {planSet.pageCount} sheets.
          {unreviewed > 0 ? ` ${unreviewed} floor plan${unreviewed > 1 ? "s" : ""} await review.` : " All floors reviewed."}
        </p>
      )}
    </div>
  );
}
