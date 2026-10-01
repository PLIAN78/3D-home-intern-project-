/**
 * Construction progress per lot, from reservation to keys in hand.
 * Weights give the overall percentage; `buildState` drives how the home is
 * drawn in 3D (an open hole, a foundation, framing, closed-in, finished).
 */

export type StageId = "reserved" | "permits" | "excavation" | "foundation" | "framing" | "roofing" | "rough-ins" | "drywall" | "finishes" | "pdi" | "ready" | "closed";

export interface ConstructionStage {
  id: StageId;
  label: string;
  /** Short customer-friendly description. */
  description: string;
  /** Share of overall progress this stage represents. */
  weight: number;
}

export const CONSTRUCTION_STAGES: ConstructionStage[] = [
  { id: "reserved", label: "Lot reserved", description: "Agreement signed and lot held for you.", weight: 2 },
  { id: "permits", label: "Permits & approvals", description: "Design finalised and building permit issued.", weight: 6 },
  { id: "excavation", label: "Excavation", description: "Lot staked and dug for the foundation.", weight: 6 },
  { id: "foundation", label: "Foundation", description: "Footings, foundation walls and waterproofing.", weight: 10 },
  { id: "framing", label: "Framing", description: "Floors, walls and roof structure go up.", weight: 16 },
  { id: "roofing", label: "Roof & windows", description: "Roof shingled, windows and exterior doors installed.", weight: 10 },
  { id: "rough-ins", label: "Mechanical rough-ins", description: "Plumbing, electrical and HVAC run through the walls.", weight: 12 },
  { id: "drywall", label: "Insulation & drywall", description: "Walls insulated, drywalled and taped.", weight: 10 },
  { id: "finishes", label: "Interior finishes", description: "Flooring, cabinets, trim and paint — your selections.", weight: 14 },
  { id: "pdi", label: "Final inspection (PDI)", description: "Pre-delivery inspection walkthrough with you.", weight: 6 },
  { id: "ready", label: "Ready for closing", description: "Occupancy granted; closing scheduled.", weight: 6 },
  { id: "closed", label: "Keys handed over", description: "Welcome home!", weight: 2 },
];

export interface LotProgress {
  communityId: string;
  lotId: string;
  /** Current (in-progress or latest completed) stage. */
  stage: StageId;
  /** Completion date (ISO) per finished stage. */
  completed: Partial<Record<StageId, string>>;
  expectedClosing?: string;
  notes?: string;
  /** True when generated for demos rather than entered by the construction team. */
  demo?: boolean;
  updatedAt: string;
}

export type BuildState = "none" | "excavation" | "foundation" | "framing" | "closed-in" | "complete";

export function stageIndex(stage: StageId) {
  return CONSTRUCTION_STAGES.findIndex((s) => s.id === stage);
}

/** Overall percentage: all earlier stages + half of the current one (full if closed). */
export function progressPercent(p: Pick<LotProgress, "stage"> | null | undefined): number {
  if (!p) return 0;
  const i = stageIndex(p.stage);
  const total = CONSTRUCTION_STAGES.reduce((a, s) => a + s.weight, 0);
  const done = CONSTRUCTION_STAGES.slice(0, i).reduce((a, s) => a + s.weight, 0) + (p.stage === "closed" ? CONSTRUCTION_STAGES[i].weight : CONSTRUCTION_STAGES[i].weight / 2);
  return Math.round((done / total) * 100);
}

export function buildState(p: Pick<LotProgress, "stage"> | null | undefined): BuildState {
  if (!p) return "none";
  const i = stageIndex(p.stage);
  if (i <= stageIndex("permits")) return "none";
  if (i === stageIndex("excavation")) return "excavation";
  if (i === stageIndex("foundation")) return "foundation";
  if (i === stageIndex("framing")) return "framing";
  if (i <= stageIndex("drywall")) return "closed-in";
  return "complete";
}

export const BUILD_STATE_LABEL: Record<BuildState, string> = {
  none: "Not started",
  excavation: "Excavation",
  foundation: "Foundation",
  framing: "Framing",
  "closed-in": "Closed in",
  complete: "Complete",
};

/**
 * Plausible demo progress for sold lots (deterministic per lot) so a freshly
 * imported community shows a mix of homes under construction. Clearly flagged
 * `demo` until the construction team enters real dates.
 */
export function demoProgress(communityId: string, lotId: string, seed: string, now = new Date()): LotProgress {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = ((h >>> 0) % 1000) / 1000;
  const idx = Math.min(CONSTRUCTION_STAGES.length - 1, Math.floor(r * r * CONSTRUCTION_STAGES.length * 1.1));
  const completed: LotProgress["completed"] = {};
  for (let i = 0; i < idx; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (idx - i) * 21);
    completed[CONSTRUCTION_STAGES[i].id] = d.toISOString().slice(0, 10);
  }
  const closing = new Date(now);
  closing.setDate(closing.getDate() + (CONSTRUCTION_STAGES.length - idx) * 21);
  return { communityId, lotId, stage: CONSTRUCTION_STAGES[idx].id, completed, expectedClosing: closing.toISOString().slice(0, 10), demo: true, updatedAt: now.toISOString() };
}
