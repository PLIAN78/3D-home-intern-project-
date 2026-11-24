/** Everything you can own: vehicles, animals, the jetpack and the helicopter. */
export type GearId = "truck" | "horse" | "car" | "jetpack" | "heli" | "trail" | "hauler" | "elephant";

/** What the player is using: on foot, or one piece of gear. */
export type ModeId = "walk" | GearId;

export interface Gear {
  id: GearId;
  name: string;
  /** 0 = free; null = can't be bought (earned in a quest). */
  price: number | null;
  mode: ModeId;
  /** Hotbar key. */
  key: string;
  blurb: string;
}

export const GEAR: Record<GearId, Gear> = {
  truck: { id: "truck", name: "Company pickup", price: 0, mode: "truck", key: "2", blurb: "Caivan's site truck. Yours from day one." },
  horse: { id: "horse", name: "Biscuit the horse", price: 1200, mode: "horse", key: "3", blurb: "Gentle, quick and jumps fences. Press 3 to whistle for her." },
  car: { id: "car", name: "Volt GT", price: 2500, mode: "car", key: "4", blurb: "Electric sports car. Fast, low and very shiny." },
  jetpack: { id: "jetpack", name: "SkyHopper jetpack", price: 3000, mode: "jetpack", key: "5", blurb: "Hold Space to fly. Refuels whenever you land." },
  heli: { id: "heli", name: "Skylark helicopter", price: 6500, mode: "heli", key: "6", blurb: "Space to climb, Shift to descend, W/S to fly, A/D to turn." },
  trail: { id: "trail", name: "Ridgeback 4x4", price: 1800, mode: "trail", key: "7", blurb: "Lifted off-road pickup. Climbs the hill roads with ease." },
  hauler: { id: "hauler", name: "Haul HD", price: 2200, mode: "hauler", key: "8", blurb: "Heavy-duty pickup with real torque. Ideal for delivery runs." },
  elephant: { id: "elephant", name: "Peanut the elephant", price: null, mode: "elephant", key: "9", blurb: "Find her in the hills for Rosa. Slow, strong, unstoppable." },
};

/** Gear Garage stock, in display order (the elephant is earned, not sold). */
export const SHOP_ORDER: GearId[] = ["horse", "trail", "hauler", "car", "jetpack", "heli"];

/** The hotbar, left to right. */
export const HOTBAR_ORDER: ModeId[] = ["walk", "truck", "horse", "car", "jetpack", "heli", "trail", "hauler", "elephant"];

export const BLUEPRINT_VALUE = 100;
export const GOAT_VALUE = 300;

export type Owned = Record<GearId, boolean>;

export const STARTING_OWNED: Owned = { truck: true, horse: false, car: false, jetpack: false, heli: false, trail: false, hauler: false, elephant: false };

/** Pay for side jobs. */
export const DELIVERY_PAY = 400;
export const DELIVERY_BONUS = 150;
export const ELEPHANT_REWARD = 1500;

export function canBuy(cash: number, owned: Owned, id: GearId): { ok: boolean; reason?: string } {
  const price = GEAR[id].price;
  if (owned[id]) return { ok: false, reason: "Already yours" };
  if (price === null) return { ok: false, reason: "Not for sale" };
  if (cash < price) return { ok: false, reason: `Need $${(price - cash).toLocaleString("en-CA")} more` };
  return { ok: true };
}

export function buy(cash: number, owned: Owned, id: GearId): { cash: number; owned: Owned } {
  if (!canBuy(cash, owned, id).ok) return { cash, owned };
  return { cash: cash - (GEAR[id].price ?? 0), owned: { ...owned, [id]: true } };
}

/** Which mode a hotbar key selects, if owned. */
export function modeForKey(key: string, owned: Owned): ModeId | null {
  if (key === "1") return "walk";
  const gear = Object.values(GEAR).find((g) => g.key === key);
  return gear && owned[gear.id] ? gear.mode : null;
}

export function money(n: number) {
  return `$${n.toLocaleString("en-CA")}`;
}
