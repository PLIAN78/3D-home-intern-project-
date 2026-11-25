import type { Point, V6Building, V6Road } from "./v6";

/**
 * University of Vataloo, laid out north to south like the University of
 * Waterloo's main campus map (north is −z):
 *
 * - Columbia Street runs along the north edge. Ring Road is a loop inside it,
 *   joined to Columbia by two short links and to the east suburbs by the
 *   Campus Approach.
 * - North row: the Physical Activities Complex and, south of it, the Student
 *   Life Centre in the north-west; Exploration Hall and B.C. Matthews Hall in
 *   the north-centre; Mathematics 3 and the Davis Centre in the north-east.
 * - Middle: the Quantum-Nano Centre, then Mathematics & Computer, then the
 *   long Mathematics 4. Chemistry 2 and Earth Sciences & Chemistry stand on the
 *   east side.
 * - South-middle: Needles Hall, the Science Teaching Complex and Biology 1,
 *   the Dana Porter Library with Modern Languages to its west, and Tatham.
 * - South: Environment 3 and 1, Arts Lecture Hall, Hagey Hall and PAS.
 * - Outside the ring: Engineering 7 and 5 (joined by a skybridge) on the
 *   east, and St. Jerome's across Laurel Creek on the west.
 *
 * Footpaths make a grid between the buildings: three east–west walks, two
 * north–south walks and a central spine, plus a short path from every door.
 * They join Ring Road's inner sidewalks.
 *
 * Pure data with type-only imports, so v6.ts can include it.
 */
const dims = { width: 9, sidewalkWidth: 2, boulevardWidth: 2 };
const rd = (id: string, from: Point, to: Point): V6Road => ({ id, from, to, ...dims });
/** Centre line to the far edge of the sidewalk. */
export const CAMPUS_ROAD_RESERVE = dims.width / 2 + dims.boulevardWidth + dims.sidewalkWidth;

/** Ring Road: a rounded rectangle (centre-line), corners of radius r. */
export const RING = { x0: 545, x1: 885, z0: 560, z1: 880, r: 40 };
export const COLUMBIA_Z = 518;

function ringPoints(): Point[] {
  const { x0, x1, z0, z1, r } = RING, k = 3, out: Point[] = [];
  const corners: [number, number, number][] = [[x0 + r, z0 + r, Math.PI], [x1 - r, z0 + r, 1.5 * Math.PI], [x1 - r, z1 - r, 0], [x0 + r, z1 - r, Math.PI / 2]];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= k; i++) { const a = a0 + (i / k) * Math.PI / 2; out.push([Math.round((cx + Math.cos(a) * r) * 100) / 100, Math.round((cz + Math.sin(a) * r) * 100) / 100]); }
  return out;
}
export const RING_POINTS = ringPoints();

export const CAMPUS_ROADS: V6Road[] = [
  rd("columbia-street", [470, COLUMBIA_Z], [930, COLUMBIA_Z]),
  // The approach from the east suburbs meets Columbia at its east end.
  rd("campus-approach", [860, 300], [875, COLUMBIA_Z]),
  rd("ring-link-west", [640, COLUMBIA_Z], [640, RING.z0]),
  rd("ring-link-east", [795, COLUMBIA_Z], [795, RING.z0]),
  ...RING_POINTS.map((p, i) => rd("vataloo-ring-" + i, p, RING_POINTS[(i + 1) % RING_POINTS.length])),
];

const B = (id: string, name: string, at: Point, size: [number, number, number], kind: V6Building["kind"] = "campus", tone = 0): V6Building => ({ id, name, at, size, kind, tone, level: "ground" });

/** Building ids used by lessons, the principal and co-ops keep their v6 ids. */
export const CAMPUS_BUILDINGS: V6Building[] = [
  // North row
  B("gym", "PHYSICAL ACTIVITIES COMPLEX", [600, 606], [46, 34, 13], "gym", 2),
  B("exp", "EXPLORATION HALL", [668, 598], [30, 22, 14], "campus", 1),
  B("bmh", "B.C. MATTHEWS HALL", [722, 600], [38, 24, 12], "campus", 0),
  B("m3", "MATHEMATICS 3", [778, 600], [26, 26, 16], "campus", 2),
  B("davis", "DAVIS COMPUTING CENTRE", [838, 608], [40, 30, 13], "campus", 0),
  // Middle
  B("cafeteria", "STUDENT LIFE CENTRE - CAFE", [598, 664], [44, 34, 9], "shop", 1),
  B("qnc", "QUANTUM-NANO CENTRE", [668, 668], [40, 34, 22], "campus", 0),
  B("math", "MATHEMATICS & COMPUTER", [745, 668], [44, 40, 20], "campus", 2),
  B("m4", "MATHEMATICS 4", [830, 662], [56, 16, 12], "campus", 0),
  B("c2", "CHEMISTRY 2", [826, 718], [44, 26, 14], "campus", 1),
  B("esc", "EARTH SCIENCES & CHEMISTRY", [826, 764], [44, 28, 14], "campus", 0),
  // South-middle
  B("principal", "UNIVERSITY OF VATALOO - NEEDLES HALL", [600, 742], [38, 24, 15], "campus", 2),
  B("science", "SCIENCE TEACHING COMPLEX", [668, 738], [44, 34, 18], "campus", 0),
  B("b1", "BIOLOGY 1", [722, 730], [32, 26, 14], "campus", 1),
  B("porter", "DANA PORTER LIBRARY", [722, 790], [32, 32, 40], "campus", 2),
  B("ml", "MODERN LANGUAGES", [614, 792], [30, 22, 10], "campus", 3),
  B("business", "TATHAM CO-OP CENTRE", [765, 798], [40, 24, 14], "campus", 1),
  // South row
  B("environment", "ENVIRONMENT 3", [590, 840], [34, 22, 14], "campus", 1),
  B("ev1", "ENVIRONMENT 1", [657, 840], [26, 20, 10], "campus", 3),
  B("al", "ARTS LECTURE HALL", [700, 840], [28, 22, 10], "campus", 3),
  B("arts", "HAGEY HALL - ARTS & HUMANITIES", [760, 846], [56, 24, 15], "historic", 3),
  B("pas", "PSYCHOLOGY · ANTHROPOLOGY · SOCIOLOGY", [845, 838], [30, 24, 12], "campus", 2),
  // Outside the ring
  B("engineering", "ENGINEERING 7", [918, 660], [36, 50, 24], "campus", 0),
  B("engineering-5", "ENGINEERING 5", [918, 745], [36, 46, 24], "campus", 1),
  B("stj", "ST. JEROME'S UNIVERSITY", [490, 720], [28, 40, 12], "historic", 3),
];

/** The skybridge between Engineering 7 and Engineering 5 (north–south, above the lawn). */
export const SKYBRIDGE = { x: 918, z0: 685, z1: 722, y: 11.4, width: 6, height: 3.2 };

/** Footpath centre lines: walks east–west and north–south between Ring Road's inner sidewalks. */
const INNER = { x0: RING.x0 + CAMPUS_ROAD_RESERVE, x1: RING.x1 - CAMPUS_ROAD_RESERVE, z0: RING.z0 + CAMPUS_ROAD_RESERVE, z1: RING.z1 - CAMPUS_ROAD_RESERVE };
export const WALKS_Z = [630, 700, 815];
export const WALKS_X = [640, 697, 795];
export const CAMPUS_WALKS: Point[][] = [
  ...WALKS_Z.map((z): Point[] => [[INNER.x0, z], [INNER.x1, z]]),
  [[640, INNER.z0], [640, INNER.z1]],
  [[795, INNER.z0], [795, INNER.z1]],
  // The central spine from the north side of the ring to the library.
  [[697, INNER.z0], [697, 815]],
  // From University Station across Laurel Creek to Ring Road's west sidewalk.
  [[476, 558], [530, 558], [549, 569]],
  // St. Jerome's: from its door over the creek to Ring Road's west sidewalk.
  [[490, 740.3], [490, 748], [RING.x0 - CAMPUS_ROAD_RESERVE + 1.5, 748]],
];
export const PATH_HALF_WIDTH = 2.6;

/** Is a footpath of the given half-width from a to b clear of every campus building (plus pad)? */
function clearOfBuildings(a: Point, b: Point, pad: number, except?: V6Building) {
  return CAMPUS_BUILDINGS.every((o) => {
    if (o === except) return true;
    const x0 = Math.min(a[0], b[0]) - pad, x1 = Math.max(a[0], b[0]) + pad, z0 = Math.min(a[1], b[1]) - pad, z1 = Math.max(a[1], b[1]) + pad;
    return x1 <= o.at[0] - o.size[0] / 2 || x0 >= o.at[0] + o.size[0] / 2 || z1 <= o.at[1] - o.size[1] / 2 || z0 >= o.at[1] + o.size[1] / 2;
  });
}

/**
 * A path from every door (doors are in the south wall) to the walks: straight
 * south to the next east–west walk, or, if another building is in the way,
 * a few metres south and then across to the nearest north–south walk.
 */
export const DOOR_PATHS: Point[][] = CAMPUS_BUILDINGS.filter((b) => b.id !== "stj").map((b) => {
  const [x, z] = b.at, door = z + b.size[1] / 2;
  // Engineering, outside the ring: to Ring Road's east sidewalk.
  if (x > RING.x1) return [[x, door + 0.3], [x, door + 4.5], [RING.x1 + CAMPUS_ROAD_RESERVE - 1, door + 4.5]] as Point[];
  const next = [...WALKS_Z, INNER.z1].find((wz) => wz > door + 1)!;
  if (clearOfBuildings([x, door + 0.3], [x, next], PATH_HALF_WIDTH, b)) return [[x, door + 0.3], [x, next]] as Point[];
  const y = door + 4.5, wx = [INNER.x0, ...WALKS_X, INNER.x1].reduce((best, c) => (Math.abs(c - x) < Math.abs(best - x) ? c : best));
  return [[x, door + 0.3], [x, y], [wx, y]] as Point[];
});

/** Laurel Creek, west of the ring (drawn water; the ground stays level). */
export const LAUREL_CREEK: Point[] = [[528, 532], [522, 580], [516, 650], [524, 700], [516, 760], [521, 830], [515, 928]];
export const CREEK_WIDTH = 8;

/** Lawns and squares: the Arts Quad, the rock garden between MC and the library, the SLC green. */
export const CAMPUS_LAWNS = [
  { id: "arts-quad", x0: 646, z0: 768, x1: 692, z1: 808 },
  { id: "rock-garden", x0: 747, z0: 706, x1: 790, z1: 782 },
  { id: "slc-green", x0: 562, z0: 690, x1: 632, z1: 726 },
];

/** Students walking: the inner block, the west block and the east block. */
export const CAMPUS_LOOPS: Point[][] = [
  [[640, 630], [795, 630], [795, 815], [640, 815]],
  [[INNER.x0, 630], [640, 630], [640, 700], [INNER.x0, 700]],
  [[697, 700], [INNER.x1, 700], [INNER.x1, 815], [697, 815]],
];
