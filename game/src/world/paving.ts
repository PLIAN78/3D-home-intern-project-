import { ISLANDS, RIVER_WALK, riverfrontZ } from "./v6";

/**
 * The paved north shore: everything north of the Owawa River is concrete
 * paving, out to the riverfront street's south sidewalk. Between that street
 * and the water the bank is a green strip of lawn and trees (and Riverside
 * Beach), as is Heron Gardens Island. The ground shader (render/materials
 * groundHills), the grass mask and the map all use this line.
 */
/** Riverfront street centre line to the far edge of its south sidewalk (+ a little). */
export const FRONT_RESERVE = 8.6;
/** The island keeps its lawns (radius in units of the island's ellipse). */
export const ISLE = { x: ISLANDS[0].at[0], z: ISLANDS[0].at[1], rx: ISLANDS[0].rx, rz: ISLANDS[0].rz, keep: 1.25 } as const;
/** The riverfront street's centre line, for the shader (x, z pairs). */
export const FRONT_POINTS = RIVER_WALK;
/** Where the paving stops on its south side at x (z grows southward). */
export const paveEdgeZ = (x: number) => riverfrontZ(x) + FRONT_RESERVE;
/** Is ground at (x, z), height y, paved? */
export function isPaved(x: number, z: number, y: number) {
  return z < paveEdgeZ(x) && y > -1.41 && Math.hypot((x - ISLE.x) / ISLE.rx, (z - ISLE.z) / ISLE.rz) > ISLE.keep;
}
