import type { Community, Lot, PlaceholderStyle, Road, Tree } from "@/lib/models/community";
import type { LotProgress, StageId } from "@/lib/models/construction";
import { placeholderFor, storeysFor } from "@/lib/geometry/placeholderHouse";
import { placeholderScale } from "@/lib/geometry/siteGeometry";
import { lotToWorld } from "@/lib/viewer/placement";

/**
 * Caivan Ridge: the game's open world, generated from Home Studio's own
 * community model (lots, roads, trees) so the same placeholder homes,
 * construction stages and road builder draw it.
 *
 * World axes as everywhere in Home Studio: x = east, z = south (−north), y up.
 *
 *            Woods ·········· Ridgeview Crescent (z = −130) ··········· Factory
 *   Goat farm               ║  lots both sides  ║                         ▒▒▒
 *                     x=−110║    Water tower    ║x=110
 *   ══════════════ Caivan Boulevard (z = 0) ══════════════════════════════════
 *        Sales Centre       ║      Park         ║
 *                           ║  Maple Run (z = 130), construction zone south
 */

export type V2 = [number, number];

export const ROAD = { width: 9, sidewalk: 1.6, boulevard: 2 };
/** Road centreline to front lot line. */
export const FRONT = ROAD.width / 2 + ROAD.boulevard + ROAD.sidewalk;
export const LOT_W = 16.5;
export const LOT_D = 34;
/** Half-size of the playable ground square. */
export const WORLD_HALF = 440;

export const STREETS = {
  boulevard: { name: "Caivan Boulevard", z: 0 },
  ridgeview: { name: "Ridgeview Crescent", z: -130 },
  maple: { name: "Maple Run", z: 130 },
  west: { name: "Founders Way", x: -110 },
  east: { name: "Quarry Lane", x: 110 },
} as const;

/** What a collision box is, so physics can treat wood frames as breakable. */
export type BoxKind = "house" | "frame" | "landmark" | "post";

/** Box with a height, in world metres (axis-aligned). */
export interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h: number;
  kind?: BoxKind;
  /** Lot id for houses and frames, landmark id for landmarks. */
  id?: string;
}

export type LandmarkId = "sales" | "factory" | "tower" | "farm" | "park";

export interface Landmark {
  id: LandmarkId;
  name: string;
  position: V2;
  /** Footprint (w along x, d along z) and height of the main building. */
  size: [number, number, number];
}

export const LANDMARKS: Record<LandmarkId, Landmark> = {
  sales: { id: "sales", name: "Caivan Sales Centre", position: [-175, 38], size: [26, 16, 7] },
  factory: { id: "factory", name: "Caivan Panel Factory", position: [275, -72], size: [64, 40, 13] },
  tower: { id: "tower", name: "Caivan Ridge Water Tower", position: [0, -48], size: [12, 12, 34] },
  farm: { id: "farm", name: "Hillside Goat Farm", position: [-335, -150], size: [16, 12, 8] },
  park: { id: "park", name: "Ridge Park", position: [0, 45], size: [70, 50, 0] },
};

/** Water tower: tank radius and the walkable deck on top. */
export const TOWER = { tankRadius: 7, tankBottom: 24, deckY: 33.2 };
/** The water tower's four legs, as offsets from its centre. You can walk (or fly) between them. */
export const TOWER_LEGS: V2[] = [0, 1, 2, 3].map((i) => {
  const a = (i * Math.PI) / 2 + Math.PI / 4;
  return [Math.cos(a) * 4.6, Math.sin(a) * 4.6];
});

/** Goat pen at the farm (square, centred). */
export const PEN = { centre: [-335, -118] as V2, half: 14 };

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STYLES: PlaceholderStyle[] = ["classic", "modern", "craftsman", "bungalow"];
const BODY_COLORS = ["#d8d2c6", "#8f8a82", "#b8a68c", "#e9e6df", "#6f7277", "#a9937a", "#cfc5b2", "#9aa19a"];
const ROOF_COLORS = ["#2c2d30", "#5a5048", "#4a4f55", "#34383d"];

/** Lot numbers: Ridgeview 1xx, Maple 2xx; north side even, south side odd. */
export const HERO_LOT_ID = "lot-42";
export const SURVEY_LOT_ID = "lot-113";
export const POUR_LOT_ID = "lot-207";
export const MODEL_HOME_LOT_ID = "lot-204";

function streetLots(streetZ: number, firstNumber: number, rand: () => number): Lot[] {
  const lots: Lot[] = [];
  for (let i = 0; i < 12; i++) {
    const x = -90.75 + i * LOT_W;
    for (const side of [-1, 1] as const) {
      const n = firstNumber + i * 2 + (side > 0 ? 1 : 0);
      const s = Math.floor(rand() * 1000);
      lots.push({
        id: `lot-${n}`,
        number: String(n),
        position: [x, 0, streetZ + side * (FRONT + LOT_D / 2)],
        // North-side lots face +z (south) toward the street, south-side lots face −z.
        rotation: [0, side < 0 ? 0 : Math.PI, 0],
        width: LOT_W,
        depth: LOT_D,
        frontSetback: 6,
        status: "sold",
        collection: "41′ Collection",
        placeholder: {
          style: STYLES[s % STYLES.length],
          bodyColor: BODY_COLORS[(s >> 2) % BODY_COLORS.length],
          roofColor: ROOF_COLORS[(s >> 4) % ROOF_COLORS.length],
          garageSide: s % 2 ? "left" : "right",
          storeys: s % 5 === 0 ? 1 : 2,
        },
      });
    }
  }
  return lots;
}

function buildLots(): Lot[] {
  const rand = mulberry32(2026);
  const lots = [...streetLots(STREETS.ridgeview.z, 100, rand), ...streetLots(STREETS.maple.z, 200, rand)];
  // The hero home (Plan 36) on Ridgeview, centre north side, numbered 42 like the studio demo.
  const hero = lots.find((l) => l.id === "lot-112")!;
  hero.id = HERO_LOT_ID;
  hero.number = "42";
  hero.houseModelId = "plan-36";
  hero.status = "selected";
  for (const l of lots) {
    if (l.id === SURVEY_LOT_ID) l.status = "available";
    if (l.id === MODEL_HOME_LOT_ID) l.status = "model-home";
  }
  return lots;
}

/** Construction stage of each lot at the start of the game (south side of Maple Run is being built). */
function startingStages(lots: Lot[]): Record<string, StageId> {
  const stages: Record<string, StageId> = {};
  const cycle: StageId[] = ["excavation", "framing", "foundation", "roofing", "framing", "excavation"];
  let k = 0;
  for (const l of lots) {
    const n = Number(l.number);
    if (n >= 200 && n % 2 === 1) stages[l.id] = cycle[k++ % cycle.length];
  }
  stages[POUR_LOT_ID] = "excavation";
  stages[SURVEY_LOT_ID] = "permits";
  stages[HERO_LOT_ID] = "roofing";
  return stages;
}

function road(id: string, from: V2, to: V2): Road {
  return { id, from, to, width: ROAD.width, sidewalkWidth: ROAD.sidewalk, boulevardWidth: ROAD.boulevard };
}

const ROADS: Road[] = [
  road("boulevard", [-WORLD_HALF + 10, STREETS.boulevard.z], [WORLD_HALF - 10, STREETS.boulevard.z]),
  road("ridgeview", [STREETS.west.x, STREETS.ridgeview.z], [STREETS.east.x, STREETS.ridgeview.z]),
  road("maple", [STREETS.west.x, STREETS.maple.z], [STREETS.east.x, STREETS.maple.z]),
  road("founders", [STREETS.west.x, STREETS.ridgeview.z], [STREETS.west.x, STREETS.maple.z]),
  road("quarry", [STREETS.east.x, STREETS.ridgeview.z], [STREETS.east.x, STREETS.maple.z]),
  // Factory spur and farm lane
  road("factory-spur", [255, STREETS.boulevard.z], [255, -46]),
  road("farm-lane", [-300, STREETS.boulevard.z], [-300, -112]),
];

/** Is a ground point clear of roads, lots and landmarks (for scattering trees and props)? */
export function isOpenGround(x: number, z: number, lots: Lot[], pad = 3): boolean {
  if (Math.abs(x) > WORLD_HALF - 8 || Math.abs(z) > WORLD_HALF - 8) return false;
  for (const r of ROADS) {
    const half = r.width / 2 + r.boulevardWidth + r.sidewalkWidth + pad;
    const [ax, az] = r.from;
    const [bx, bz] = r.to;
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < half) return false;
  }
  for (const l of lots) if (Math.abs(x - l.position[0]) < l.width / 2 + pad && Math.abs(z - l.position[2]) < l.depth / 2 + pad) return false;
  for (const m of Object.values(LANDMARKS)) {
    const [w, d] = m.size;
    if (Math.abs(x - m.position[0]) < w / 2 + 12 && Math.abs(z - m.position[1]) < d / 2 + 12) return false;
  }
  if (Math.abs(x - PEN.centre[0]) < PEN.half + 4 && Math.abs(z - PEN.centre[1]) < PEN.half + 4) return false;
  return true;
}

/** Kept free of trees so the opening shot (and the Sales Centre frontage) has a clear view. */
const CLEARINGS: { min: V2; max: V2 }[] = [
  { min: [LANDMARKS.sales.position[0] - 32, 0], max: [LANDMARKS.sales.position[0] + 32, LANDMARKS.sales.position[1]] },
];

function buildTrees(lots: Lot[]): Tree[] {
  const rand = mulberry32(7);
  const trees: Tree[] = [];
  const tryPlace = (x: number, z: number, variant?: 0 | 1 | 2, pad = 3) => {
    if (!isOpenGround(x, z, lots, pad)) return;
    if (CLEARINGS.some((c) => x > c.min[0] && x < c.max[0] && z > c.min[1] && z < c.max[1])) return;
    trees.push({ position: [x, z], scale: 0.85 + rand() * 0.8, variant: variant ?? ((Math.floor(rand() * 3)) as 0 | 1 | 2) });
  };
  // Street trees along the boulevard's verges
  for (let x = -WORLD_HALF + 20; x < WORLD_HALF - 20; x += 14) for (const side of [-1, 1]) tryPlace(x + (rand() - 0.5) * 3, side * (FRONT + 2.5), 0, 0.5);
  // Park clusters
  for (let i = 0; i < 40; i++) tryPlace(-35 + rand() * 70, 25 + rand() * 45, undefined, 1);
  // Woodlots around the edges and between neighbourhoods
  for (let i = 0; i < 900 && trees.length < 650; i++) {
    const x = (rand() * 2 - 1) * (WORLD_HALF - 15);
    const z = (rand() * 2 - 1) * (WORLD_HALF - 15);
    const edge = Math.max(Math.abs(x), Math.abs(z)) > 230 || Math.abs(z) > 185;
    if (edge || rand() < 0.15) tryPlace(x, z);
  }
  return trees;
}

const LOTS = buildLots();

export const CAIVAN_RIDGE: Community = {
  id: "caivan-ridge",
  name: "Caivan Ridge",
  phase: "Game world",
  lots: LOTS,
  roads: ROADS,
  trees: buildTrees(LOTS),
};

export const STARTING_STAGES = startingStages(LOTS);

/** LotProgress records for Home Studio's build-stage renderer. */
export function progressFor(stages: Record<string, StageId>): Record<string, LotProgress> {
  const out: Record<string, LotProgress> = {};
  for (const [lotId, stage] of Object.entries(stages)) out[lotId] = { communityId: CAIVAN_RIDGE.id, lotId, stage, completed: {}, updatedAt: "" };
  return out;
}

export function lotById(id: string): Lot {
  const lot = CAIVAN_RIDGE.lots.find((l) => l.id === id);
  if (!lot) throw new Error(`Unknown lot ${id}`);
  return lot;
}

/** World point on a lot, from lot-local metres (x across, z toward the street). */
export function onLot(lotId: string, local: V2): V2 {
  const p = lotToWorld(lotById(lotId), [local[0], 0, local[1]]);
  return [p[0], p[2]];
}

/** Front-yard point of a lot, just inside the front lot line. */
export function lotFront(lotId: string, inset = 3): V2 {
  const lot = lotById(lotId);
  return onLot(lotId, [0, lot.depth / 2 - inset]);
}

/** World AABB of the house standing on a lot (placeholder massing, scaled like the renderer). */
export function houseBox(lot: Lot, stage: StageId | undefined): Box | null {
  const built = !stage || !["reserved", "permits", "excavation", "foundation"].includes(stage);
  if (!built) return null;
  const g = placeholderFor(lot);
  const [sx, , sz] = placeholderScale(lot);
  const halfW = (g.planSize.width * sx) / 2;
  const front = lot.depth / 2 - lot.frontSetback;
  const back = front - g.planSize.depth * sz;
  const a = lotToWorld(lot, [-halfW, 0, back]);
  const b = lotToWorld(lot, [halfW, 0, front + 1.5]);
  return { x0: Math.min(a[0], b[0]), z0: Math.min(a[2], b[2]), x1: Math.max(a[0], b[0]), z1: Math.max(a[2], b[2]), h: storeysFor(lot) * 2.9 + 3 };
}

/** Everything the player bumps into, for the current construction stages. */
export function collisionBoxes(stages: Record<string, StageId>): Box[] {
  const boxes: Box[] = [];
  for (const lot of CAIVAN_RIDGE.lots) {
    const stage = stages[lot.id];
    const b = houseBox(lot, stage);
    if (b) boxes.push({ ...b, kind: stage === "framing" ? "frame" : "house", id: lot.id });
  }
  for (const m of Object.values(LANDMARKS)) {
    if (m.id === "park" || m.id === "tower") continue;
    const [w, d, h] = m.size;
    boxes.push({ x0: m.position[0] - w / 2, z0: m.position[1] - d / 2, x1: m.position[0] + w / 2, z1: m.position[1] + d / 2, h, kind: "landmark", id: m.id });
  }
  // Water tower legs: four posts, so there is room to walk (or fly) between them.
  const [tx, tz] = LANDMARKS.tower.position;
  for (const [lx, lz] of TOWER_LEGS) boxes.push({ x0: tx + lx - 0.6, z0: tz + lz - 0.6, x1: tx + lx + 0.6, z1: tz + lz + 0.6, h: TOWER.tankBottom, kind: "post", id: "tower" });
  return boxes;
}

function underTank(x: number, z: number) {
  const [tx, tz] = LANDMARKS.tower.position;
  return Math.hypot(x - tx, z - tz) <= TOWER.tankRadius;
}

/**
 * Height of the walkable surface under a body at height y: the water-tower deck when
 * you are up at tank level, else the ground (so you can stand under the tank).
 */
export function groundHeightAt(x: number, z: number, y = Infinity): number {
  return underTank(x, z) && y >= TOWER.tankBottom - 0.5 ? TOWER.deckY : 0;
}

/** Lowest overhead surface for a body at height y: the bottom of the tank when under it. */
export function ceilingHeightAt(x: number, z: number, y: number): number {
  return underTank(x, z) && y < TOWER.tankBottom ? TOWER.tankBottom : Infinity;
}

export const SPAWN: { position: V2; heading: number } = { position: [-175, 22], heading: Math.PI / 2 };
