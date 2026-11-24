import { LANDMARKS, type LandmarkId, type V2 } from "../world/map";

/**
 * Places you can use from the door (the building interiors aren't modelled):
 * walk up to the entrance and press E. The Caivan office is the exception:
 * you walk inside (see world/office.ts).
 */
export type PlaceId = "dealer" | "bank" | "clothing" | "subs" | "burger";

/** A spot on the pavement just outside the front door. Buildings face the street: north (−z) or south (+z). */
function door(id: LandmarkId, faces: "north" | "south", out = 2.5): V2 {
  const m = LANDMARKS[id];
  const k = faces === "north" ? -1 : 1;
  return [m.position[0], m.position[1] + k * (m.size[1] / 2 + out)];
}

export const PLACES: Record<PlaceId, { name: string; verb: string; door: V2 }> = {
  dealer: { name: "Ridge Motors", verb: "Browse cars at Ridge Motors", door: door("dealer", "north") },
  bank: { name: "Ridge Savings Bank", verb: "Go into Ridge Savings Bank", door: door("bank", "south", 4.5) },
  clothing: { name: "Northline Outfitters", verb: "Try on clothes at Northline Outfitters", door: door("clothing", "south") },
  subs: { name: "Crossroads Subs", verb: "Go into Crossroads Subs", door: door("subs", "north") },
  burger: { name: "Flat Top Burgers", verb: "Go into Flat Top Burgers", door: door("burger", "north") },
};

export const PLACE_IDS = Object.keys(PLACES) as PlaceId[];
