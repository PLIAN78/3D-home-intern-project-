import { COTTAGE, COTTAGE_Y, ELEPHANT_SPOT } from "../world/terrain";
import { LANDMARKS, lotFront, type V2 } from "../world/map";
import type { GearId } from "./economy";

/**
 * Side jobs you can do at any time, alongside the story: Rosa's lost elephant
 * up in the hills, and panel delivery runs from the factory. Pure data and
 * rules; the Director wires them to the world.
 */

// ── Peanut the elephant ─────────────────────────────────────────────────

export type ElephantQuest = "none" | "asked" | "found";

/** Rosa waits on the cottage porch, on the north side facing the end of the road. */
export const ROSA = (() => {
  const [cx, cz] = COTTAGE.position;
  // On the porch deck (0.45 m up).
  return { position: [cx + 3, cz - 6.2] as V2, facing: -Math.PI / 2, y: COTTAGE_Y + 0.45, name: "Rosa · Cottage owner" };
})();

/** The search circle shown on the map once Rosa asks for help. Peanut is inside it, not at its centre. */
export const ELEPHANT_SEARCH = { centre: [ELEPHANT_SPOT[0] + 38, ELEPHANT_SPOT[1] - 26] as V2, radius: 90 };
export { ELEPHANT_SPOT };

// ── Delivery runs ───────────────────────────────────────────────────────

/** The factory's loading dock, at the end of the spur road. */
export const DEPOT: V2 = [255, -36];

/** Vehicles with a bed: only these can carry a pallet of wall panels. */
export const PICKUPS: GearId[] = ["truck", "trail", "hauler"];

export interface Drop {
  label: string;
  at: V2;
}

/** Where panels and supplies are needed. Chosen in turn so every run goes somewhere new. */
export const DROPS: Drop[] = [
  { label: "Lot 211, Maple Run", at: lotFront("lot-211", -4) },
  { label: "Ridge Centre Mall loading bay", at: [LANDMARKS.mall.position[0] + 58, LANDMARKS.mall.position[1] - 10] },
  { label: "Lot 305, Birch Lane", at: lotFront("lot-305", -4) },
  { label: "Caivan Ridge Public School", at: [LANDMARKS.school.position[0] + 36, LANDMARKS.school.position[1] - 34] },
  { label: "Lot 209, Maple Run", at: lotFront("lot-209", -4) },
  { label: "Ridge Corner Market", at: [LANDMARKS.shop.position[0] - 22, LANDMARKS.shop.position[1] - 14] },
  { label: "Rosa's Cottage", at: [ROSA.position[0] + 10, ROSA.position[1] - 6] },
];

export const DROP_RADIUS = 7;

export interface Delivery {
  drop: Drop;
  /** Simulation time when the run started (s). */
  started: number;
  /** Finish within this many seconds for the time bonus. */
  limit: number;
}

/** A fair time for a run: straight-line distance at a relaxed 11 m/s, plus time to get going. */
export function deliveryLimit(drop: Drop) {
  return Math.round(Math.hypot(drop.at[0] - DEPOT[0], drop.at[1] - DEPOT[1]) / 11 + 25);
}

export function nextDrop(done: number): Drop {
  return DROPS[done % DROPS.length];
}
