import type { Box, V2 } from "./map";
import { groundAt, LAKE, LAKE_Y } from "./terrain";

/**
 * Heron Lake's man-made parts: the boat dock at the end of Lake Road, Elias's
 * fishing jetty on the island, where the boat waits, and where his lost
 * tackle box drifted. Shared by the physics and the renderer.
 */

/** Plank decks: axis-aligned, walkable, standing on posts in the water. */
export const JETTIES: { x0: number; z0: number; x1: number; z1: number }[] = [
  // The public dock, running north from the shore below Lake Road.
  { x0: -561.6, z0: -568, x1: -558.4, z1: -542 },
  // Elias's jetty, south off the island.
  { x0: -683.4, z0: -624, x1: -680.6, z1: -609 },
];
export const DECK_Y = LAKE_Y + 0.9;

/** Where the boat is moored (beside the dock's end) and its heading. */
export const BOAT_SPOT = { at: [-555.8, -564] as V2, heading: -Math.PI / 2 };

/** Elias sits at the end of his jetty, line in the water. */
export const ELIAS = { at: [-682, -610.6] as V2, facing: Math.PI / 2, name: "Elias · Fisherman" };

/** The tackle box that floated away: somewhere in the lake's north-west. */
export const TACKLE_BOX: V2 = [-810, -720];
export const TACKLE_SEARCH = { centre: [-790, -700] as V2, radius: 60 };

/** Small buildings: the boat-rental hut by the dock, and Elias's shack on the island. */
export const LAKE_HUTS: { id: string; at: V2; size: [number, number, number]; heading: number }[] = [
  { id: "boathouse", at: [-571, -532], size: [5, 4, 3], heading: 0 },
  { id: "shack", at: [-697, -656], size: [5.5, 4.5, 3], heading: 0.3 },
];

/** Ground under a hut: the lowest corner, so it never floats on a slope. */
export function hutBase(h: (typeof LAKE_HUTS)[number]) {
  const [x, z] = h.at;
  const [w, d] = h.size;
  return Math.min(groundAt(x - w / 2, z - d / 2), groundAt(x + w / 2, z - d / 2), groundAt(x - w / 2, z + d / 2), groundAt(x + w / 2, z + d / 2)) - 0.15;
}

export function lakeBoxes(): Box[] {
  return [
    ...JETTIES.map((j) => ({ ...j, h: DECK_Y - (LAKE_Y - 4), y: LAKE_Y - 4, kind: "landmark" as const, id: "jetty" })),
    // Huts as their axis-aligned bounds (they're only turned a little).
    ...LAKE_HUTS.map((h) => {
      const r = Math.max(h.size[0], h.size[1]) / 2;
      const y = hutBase(h);
      return { x0: h.at[0] - r * 0.9, z0: h.at[1] - r * 0.9, x1: h.at[0] + r * 0.9, z1: h.at[1] + r * 0.9, h: h.size[2] + 1.6, y, kind: "landmark" as const, id: h.id };
    }),
  ];
}

/** Height you'd stand at here: a jetty deck if there is one, else null. */
export function deckAt(x: number, z: number) {
  return JETTIES.some((j) => x > j.x0 && x < j.x1 && z > j.z0 && z < j.z1) ? DECK_Y : null;
}

export { LAKE, LAKE_Y };
