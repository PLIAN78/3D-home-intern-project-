/**
 * The south-west woods around Rosa's cottage (bottom-left of the map):
 *
 * - Mount Tamarack, a small mountain in the corner, with a rocky summit.
 * - Pine Hollow Campground south of the cottage: a level clearing with a
 *   campfire, tents, picnic tables and the camp host, reached by a trail from
 *   the cottage yard. The host has a side job: chop the trees marked with
 *   orange ribbon in the woodlot east of the camp, for firewood.
 * - Two creeks running off the mountain, boulders on its slopes and along
 *   the creeks, and undergrowth through the woods.
 *
 * Pure data and functions, no imports (terrain.ts uses it).
 */
type P = [number, number];

export const MOUNTAIN = { at: [-865, 870] as P, radius: 160, height: 50, name: "MOUNT TAMARACK" };
/** The mountain's added height: a rounded cone with three soft ridges. */
export function mountainHeight(x: number, z: number) {
  const dx = x - MOUNTAIN.at[0], dz = z - MOUNTAIN.at[1], d = Math.hypot(dx, dz);
  if (d >= MOUNTAIN.radius) return 0;
  const t = 1 - d / MOUNTAIN.radius;
  const ridge = 1 + 0.12 * Math.sin(Math.atan2(dz, dx) * 3 + 0.7) * Math.min(1, d / 40);
  return MOUNTAIN.height * t * t * (3 - 2 * t) * ridge;
}

export const CAMPGROUND = { at: [-700, 800] as P, radius: 30, name: "PINE HOLLOW CAMPGROUND" };
/** The level clearing blends back into the hills over this distance. */
export const CAMP_APRON = 16;
export const CAMPFIRE: P = [-700, 800];
export const CAMP_HOST: P = [-689, 793];
/** Trail from the cottage yard down to the campground. */
export const CAMP_TRAIL: P[] = [[-716, 690], [-713, 730], [-707, 760], [-702, 772]];
export const TENTS: { at: P; heading: number; colour: string }[] = [
  { at: [-718, 784], heading: 0.4, colour: "#2f6f4f" },
  { at: [-722, 806], heading: -0.2, colour: "#c4562f" },
  { at: [-712, 823], heading: -0.9, colour: "#2e5c8a" },
  { at: [-686, 824], heading: -1.8, colour: "#d1a23a" },
];
export const PICNIC_TABLES: { at: P; heading: number }[] = [
  { at: [-684, 781], heading: 0.2 },
  { at: [-679, 810], heading: -0.3 },
];
export const LOG_PILE: P = [-676, 797];

/** The woodlot east of the camp: these trees carry orange ribbon (the firewood job). */
export const CAMP_TREES: P[] = [[-659, 776], [-651, 790], [-662, 805], [-647, 815], [-658, 827], [-645, 838], [-664, 843], [-652, 852]];

/** Creeks off the mountain (drawn water, draped on the ground). */
export const CREEKS: P[][] = [
  [[-800, 824], [-772, 806], [-748, 822], [-736, 850], [-720, 880], [-692, 910], [-652, 938], [-602, 958], [-560, 975]],
  [[-880, 728], [-902, 702], [-928, 676], [-944, 640], [-958, 598], [-972, 552], [-986, 510]],
];
export const CREEK_WIDTH = 4;

export const SUMMIT: P = MOUNTAIN.at;
/** Where bears roam: dens on the mountain's lower slopes. */
export const BEAR_DENS: P[] = [[-815, 790], [-920, 795], [-845, 945]];
/** Where deer graze: the meadow edges round the campground and the cottage. */
export const DEER_MEADOWS: P[] = [[-640, 760], [-760, 740], [-610, 870], [-780, 610], [-560, 700]];

const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const segDist = (x: number, z: number, a: P, b: P) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
};
const lineDist = (x: number, z: number, line: P[]) => Math.min(...line.slice(1).map((b, i) => segDist(x, z, line[i], b)));
export const nearCreek = (x: number, z: number, pad = 0) => CREEKS.some((c) => lineDist(x, z, c) < CREEK_WIDTH / 2 + pad);
export const nearCampTrail = (x: number, z: number, pad = 0) => lineDist(x, z, CAMP_TRAIL) < 1.5 + pad;
export const inCampground = (x: number, z: number, pad = 0) => Math.hypot(x - CAMPGROUND.at[0], z - CAMPGROUND.at[1]) < CAMPGROUND.radius + pad;
/** Keep trees and bushes off: the camp, its trail, the creeks, the woodlot's marked trees and the bare summit. */
export const clearOfWildsFeatures = (x: number, z: number, pad = 0) =>
  !inCampground(x, z, 6 + pad) && !nearCampTrail(x, z, 2.5 + pad) && !nearCreek(x, z, 2.5 + pad) && !CAMP_TREES.some((t) => Math.hypot(x - t[0], z - t[1]) < 5 + pad) && mountainHeight(x, z) < 36;

/** Boulders: crowding the summit, strewn down the slopes, along the creeks and through the woods. Scale ≈ size in metres. */
export const ROCKS: { at: P; scale: number; turn: number }[] = (() => {
  const out: { at: P; scale: number; turn: number }[] = [];
  const add = (x: number, z: number, scale: number, i: number) => {
    if (inCampground(x, z, 3) || nearCampTrail(x, z, 1.5) || nearCreek(x, z, 0.5) || x < -995 || z > 995) return;
    if (out.some((r) => Math.hypot(r.at[0] - x, r.at[1] - z) < (r.scale + scale) * 0.7)) return;
    out.push({ at: [x, z], scale, turn: hash(i + 3) * Math.PI * 2 });
  };
  for (let i = 0; i < 160; i++) {
    const a = hash(i) * Math.PI * 2, r = Math.sqrt(hash(i + 500)) * MOUNTAIN.radius * 0.9;
    const x = MOUNTAIN.at[0] + Math.cos(a) * r, z = MOUNTAIN.at[1] + Math.sin(a) * r;
    add(x, z, 0.8 + (1 - r / MOUNTAIN.radius) * 2.6 * hash(i + 900) + 0.4, i);
  }
  for (const [c, creek] of CREEKS.entries())
    for (let k = 0; k < creek.length - 1; k++)
      for (let j = 0; j < 3; j++) {
        const t = hash(c * 100 + k * 7 + j), a = creek[k], b = creek[k + 1], side = hash(c * 100 + k * 7 + j + 50) < 0.5 ? -1 : 1;
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
        add(a[0] + dx * t - (dz / L) * side * (CREEK_WIDTH / 2 + 1), a[1] + dz * t + (dx / L) * side * (CREEK_WIDTH / 2 + 1), 0.4 + hash(c + k + j) * 0.6, 2000 + c * 100 + k * 7 + j);
      }
  for (let i = 0; i < 70; i++) add(-985 + hash(i + 3000) * 540, 440 + hash(i + 4000) * 545, 0.5 + hash(i + 5000) * 1.1, 3000 + i);
  return out;
})();

/** Undergrowth through the woods (wildsBoxes.PLACED_BUSHES keeps them off the roads and the cottage yard). */
export const BUSH_SPOTS: { at: P; scale: number; tone: number }[] = (() => {
  const out: { at: P; scale: number; tone: number }[] = [];
  for (let i = 0; i < 900 && out.length < 420; i++) {
    const x = -990 + hash(i + 7000) * 560, z = 430 + hash(i + 8000) * 560;
    if (!clearOfWildsFeatures(x, z, 0) || x < -995 || z > 995) continue;
    if (ROCKS.some((r) => Math.hypot(r.at[0] - x, r.at[1] - z) < r.scale + 1)) continue;
    out.push({ at: [x, z], scale: 0.6 + hash(i + 9000) * 0.9, tone: Math.floor(hash(i + 9500) * 3) });
  }
  return out;
})();
