/** What the player is using: on foot, a vehicle, the horse, or the jetpack. */
export type ModeId = "walk" | "truck" | "horse" | "car" | "jetpack";

export type GearId = "truck" | "horse" | "car" | "jetpack";

export interface Gear {
  id: GearId;
  name: string;
  price: number;
  mode: ModeId;
  /** Hotbar key. */
  key: string;
  blurb: string;
}

export const GEAR: Record<GearId, Gear> = {
  truck: { id: "truck", name: "Company pickup", price: 0, mode: "truck", key: "2", blurb: "Caivan's trusty site truck. Yours from day one." },
  horse: { id: "horse", name: "Biscuit the horse", price: 1200, mode: "horse", key: "3", blurb: "Gentle, quick, and jumps fences. Waits by the Sales Centre; press 3 to whistle for her." },
  car: { id: "car", name: "Volt GT sports car", price: 2500, mode: "car", key: "4", blurb: "Electric, very fast, very shiny. Delivered to the Sales Centre lot; press 4 to call it." },
  jetpack: { id: "jetpack", name: "SkyHopper jetpack", price: 3000, mode: "jetpack", key: "5", blurb: "Hold Space to fly. Refuels whenever you land." },
};

export const SHOP_ORDER: GearId[] = ["horse", "car", "jetpack"];

export const BLUEPRINT_VALUE = 100;
export const GOAT_VALUE = 300;

export type Owned = Record<GearId, boolean>;

export const STARTING_OWNED: Owned = { truck: true, horse: false, car: false, jetpack: false };

export function canBuy(cash: number, owned: Owned, id: GearId): { ok: boolean; reason?: string } {
  if (owned[id]) return { ok: false, reason: "Already yours" };
  if (cash < GEAR[id].price) return { ok: false, reason: `Need $${(GEAR[id].price - cash).toLocaleString("en-CA")} more` };
  return { ok: true };
}

export function buy(cash: number, owned: Owned, id: GearId): { cash: number; owned: Owned } {
  if (!canBuy(cash, owned, id).ok) return { cash, owned };
  return { cash: cash - GEAR[id].price, owned: { ...owned, [id]: true } };
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
