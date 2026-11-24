import type { VehicleId } from "../sim/vehicle";
import { VEHICLE_IDS } from "../sim/vehicle";

/** Everything you can own: road vehicles, animals, the jetpack and the helicopter. */
export type GearId = VehicleId | "horse" | "jetpack" | "heli" | "elephant";

/** What the player is using: on foot, or one piece of gear. */
export type ModeId = "walk" | GearId;

/** Hotbar slots. "car" is whichever of your cars is selected (press 2 again to switch). */
export type SlotId = "walk" | "car" | "horse" | "jetpack" | "heli" | "elephant";

export interface Gear {
  id: GearId;
  name: string;
  /** 0 = free; null = can't be bought (earned in a quest). */
  price: number | null;
  /** Where it's sold. */
  seller: "garage" | "dealer" | "none";
  /** Hotbar key. */
  key: string;
  blurb: string;
}

export const GEAR: Record<GearId, Gear> = {
  truck: { id: "truck", name: "Company pickup", price: 0, seller: "none", key: "2", blurb: "Caivan's site truck. Yours from day one." },
  sedan: { id: "sedan", name: "Commuter LX", price: 1500, seller: "dealer", key: "2", blurb: "Comfortable family sedan. Quiet, easy to drive, room for five." },
  trail: { id: "trail", name: "Ridgeback 4x4", price: 1800, seller: "dealer", key: "2", blurb: "Lifted off-road pickup. Climbs the hill roads with ease." },
  hauler: { id: "hauler", name: "Haul HD", price: 2200, seller: "dealer", key: "2", blurb: "Heavy-duty pickup with real torque. Ideal for delivery runs." },
  roadster: { id: "roadster", name: "Breeze RS", price: 2800, seller: "dealer", key: "2", blurb: "Light two-seat roadster with the top down. Nimble and playful." },
  car: { id: "car", name: "Volt GT", price: 3500, seller: "dealer", key: "2", blurb: "Electric sports car. Instant torque, low and very shiny." },
  suv: { id: "suv", name: "Trailhead SUV", price: 3200, seller: "dealer", key: "2", blurb: "All-wheel-drive SUV. Sits high, shrugs off gravel and hills." },
  coupe: { id: "coupe", name: "Sterling 88", price: 4500, seller: "dealer", key: "2", blurb: "A retro grand-touring coupe with chrome bumpers and a big heart." },
  super: { id: "super", name: "Apex V12", price: 12000, seller: "dealer", key: "2", blurb: "Mid-engine supercar. All-wheel drive and over 250 km/h." },
  horse: { id: "horse", name: "Biscuit the horse", price: 1200, seller: "garage", key: "3", blurb: "Gentle, quick and jumps fences. Press 3 to whistle for her." },
  jetpack: { id: "jetpack", name: "SkyHopper jetpack", price: 3000, seller: "garage", key: "4", blurb: "Hold Space to fly. Refuels whenever you land." },
  heli: { id: "heli", name: "Skylark helicopter", price: 6500, seller: "garage", key: "5", blurb: "Space to climb, Shift to descend, W/S to fly, A/D to turn." },
  elephant: { id: "elephant", name: "Peanut the elephant", price: null, seller: "none", key: "6", blurb: "Find her in the hills for Rosa. Slow, strong, unstoppable." },
};

/** Gear Garage stock (at the Sales Centre), in display order. */
export const SHOP_ORDER: GearId[] = ["horse", "jetpack", "heli"];

/** Ridge Motors stock, in display order. */
export const DEALER_ORDER: VehicleId[] = VEHICLE_IDS.filter((id) => GEAR[id].seller === "dealer");

/** The hotbar, left to right (keys 1–6). */
export const HOTBAR_ORDER: SlotId[] = ["walk", "car", "horse", "jetpack", "heli", "elephant"];

export function isVehicle(id: GearId | ModeId): id is VehicleId {
  return (VEHICLE_IDS as string[]).includes(id);
}

/** The hotbar slot a mode belongs to. */
export function slotOf(mode: ModeId): SlotId {
  return isVehicle(mode) ? "car" : mode;
}

export const BLUEPRINT_VALUE = 100;
export const GOAT_VALUE = 300;

export type Owned = Record<GearId, boolean>;

export const STARTING_OWNED: Owned = {
  truck: true,
  sedan: false,
  trail: false,
  hauler: false,
  roadster: false,
  car: false,
  suv: false,
  coupe: false,
  super: false,
  horse: false,
  jetpack: false,
  heli: false,
  elephant: false,
};

/** Pay for side jobs. */
export const DELIVERY_PAY = 400;
export const DELIVERY_BONUS = 150;
export const ELEPHANT_REWARD = 1500;

export function canBuy(cash: number, owned: Owned, id: GearId, unlimited = false): { ok: boolean; reason?: string } {
  const price = GEAR[id].price;
  if (owned[id]) return { ok: false, reason: "Already yours" };
  if (price === null) return { ok: false, reason: "Not for sale" };
  if (!unlimited && cash < price) return { ok: false, reason: `Need ${money(price - cash)} more` };
  return { ok: true };
}

export function buy(cash: number, owned: Owned, id: GearId, unlimited = false): { cash: number; owned: Owned } {
  if (!canBuy(cash, owned, id, unlimited).ok) return { cash, owned };
  return { cash: unlimited ? cash : cash - (GEAR[id].price ?? 0), owned: { ...owned, [id]: true } };
}

/** The next owned car after `current` (for pressing 2 again), in dealership order with the company truck first. */
export function nextCar(owned: Owned, current: VehicleId): VehicleId {
  const mine = VEHICLE_IDS.filter((id) => owned[id]);
  if (mine.length === 0) return current;
  const i = mine.indexOf(current);
  return mine[(i + 1) % mine.length];
}

/** Which hotbar slot a number key selects (1–6). */
export function slotForKey(key: string): SlotId | null {
  const n = Number(key);
  return n >= 1 && n <= HOTBAR_ORDER.length ? HOTBAR_ORDER[n - 1] : null;
}

/** Can you use a slot? (Cars: you always have the company pickup.) */
export function slotOwned(slot: SlotId, owned: Owned): boolean {
  if (slot === "walk" || slot === "car") return true;
  return owned[slot];
}

export function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

// ── Cheat ────────────────────────────────────────────────────────────────

/** Typing this during play turns on unlimited money (and again turns it off). */
export const CHEAT_CODE = "CASH";

/** Feeds typed letters to the cheat matcher; returns true when the code was just completed. */
export function cheatMatcher(code = CHEAT_CODE) {
  let typed = "";
  return (letter: string) => {
    typed = (typed + letter.toUpperCase()).slice(-code.length);
    if (typed === code) {
      typed = "";
      return true;
    }
    return false;
  };
}
