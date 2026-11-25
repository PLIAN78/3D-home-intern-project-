import type { Box } from "./map";
import { COTTAGE, ELEPHANT_SPOT, groundAt, nearestCountryRoad } from "./terrain";
import { BUSH_SPOTS, LOG_PILE, PICNIC_TABLES, ROCKS, TENTS } from "./wilds";

/** Off the country roads (Cottage Road runs through the woods), the cottage's yard and Peanut's clearing. */
const clear = ([x, z]: [number, number], road: number) =>
  nearestCountryRoad(x, z).d > road && Math.hypot(x - COTTAGE.position[0], z - COTTAGE.position[1]) > 34 && Math.hypot(x - ELEPHANT_SPOT[0], z - ELEPHANT_SPOT[1]) > 26;
/** The boulders and bushes actually placed (wilds.ts scatters them without knowing where the roads are). */
export const PLACED_ROCKS = ROCKS.filter((r) => clear(r.at, 7 + r.scale));
export const PLACED_BUSHES = BUSH_SPOTS.filter((b) => clear(b.at, 7));

/** Solid parts of the south-west woods: the bigger boulders, the tents, the picnic tables and the log pile. */
export function wildsBoxes(): Box[] {
  const out: Box[] = [];
  const at = (x: number, z: number, w: number, d: number, h: number, id: string, rot = 0) => {
    const y = groundAt(x, z) - 0.2;
    out.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: h + 0.2, y, rot: rot || undefined, kind: "landmark", id });
  };
  for (const r of PLACED_ROCKS) if (r.scale >= 1.4) at(r.at[0], r.at[1], r.scale * 1.3, r.scale * 1.3, r.scale * 0.85, "rock", r.turn);
  for (const t of TENTS) at(t.at[0], t.at[1], 3.2, 2.6, 1.7, "tent", t.heading);
  for (const t of PICNIC_TABLES) at(t.at[0], t.at[1], 2, 1.8, 0.78, "picnic-table", t.heading);
  at(LOG_PILE[0], LOG_PILE[1], 2.6, 1.4, 1.0, "log-pile");
  return out;
}
