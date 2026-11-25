/**
 * The paved north shore: everything north of the Owawa River is concrete
 * paving down to the water, apart from Heron Gardens Island. The line is the
 * river's north edge (the river formula in v6.ts) pushed PAVE_SETBACK metres
 * into the river, so the bridge abutments are paved too; the water hides the
 * rest. The ground shader (render/materials groundHills), the grass mask and
 * the map all use this.
 *
 * Pure, no imports.
 */
export const PAVE_SETBACK = 14;
/** Heron Gardens Island keeps its lawns (radius in units of the island's ellipse). */
export const ISLE = { x: -650, z: -655, rx: 100, rz: 55, keep: 1.25 } as const;
const riverZ = (x: number) => -555 + x * 0.07 + 24 * Math.sin(x / 240);
const riverWidth = (x: number) => 100 + 14 * Math.cos(x / 190);
/** Where the paving stops on its south side at x (z grows southward). */
export const paveEdgeZ = (x: number) => riverZ(x) - riverWidth(x) / 2 + PAVE_SETBACK;
/** Is ground at (x, z), height y, paved? */
export function isPaved(x: number, z: number, y: number) {
  return z < paveEdgeZ(x) && y > -1.41 && Math.hypot((x - ISLE.x) / ISLE.rx, (z - ISLE.z) / ISLE.rz) > ISLE.keep;
}
