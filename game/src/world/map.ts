import type { Community, Lot, PlaceholderStyle, Road, Tree } from "@/lib/models/community";
import type { LotProgress, StageId } from "@/lib/models/construction";
import { placeholderFor, storeysFor } from "@/lib/geometry/placeholderHouse";
import { placeholderScale } from "@/lib/geometry/siteGeometry";
import { lotToWorld } from "@/lib/viewer/placement";
import { COTTAGE, COTTAGE_Y, nearestCountryRoad } from "./terrain";
import { OFFICE, officeBoxes } from "./office";
import { lakeBoxes } from "./lake";
import { owawaBoxes } from "./owawa";
import { V6_LOTS } from "./v6Lots";
import { MEADOW_LOTS, MEADOW_PAVING, meadowStage } from "./meadows";
import { mallBoxes } from "./mall";
import { SUBURB_ROADS, V6_BUILDINGS, onStationAccess } from "./v6";
import { v6Boxes } from "./v6Geometry";
import type { VehicleId } from "../sim/vehicle";

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
 *                           ║  Birch Lane (z = 220)                       ║x=330
 *   Hills → Cottage Road ═══ Market Street (z = 300): shop · school · mall ═╝
 */

export type V2 = [number, number];

export const ROAD = { width: 9, sidewalk: 1.6, boulevard: 2 };
/** Road centreline to front lot line. */
export const FRONT = ROAD.width / 2 + ROAD.boulevard + ROAD.sidewalk;
export const LOT_W = 16.5;
export const LOT_D = 34;
/** Half-size of the community's flat ground (roads, lots, trees). The hills beyond are in terrain.ts. */
export const WORLD_HALF = 440;
/** Half-size of the flat physics slab under the community. */
export const FLAT_GROUND_HALF = WORLD_HALF + 10;

export const STREETS = {
  boulevard: { name: "Caivan Boulevard", z: 0 },
  ridgeview: { name: "Ridgeview Crescent", z: -130 },
  maple: { name: "Maple Run", z: 130 },
  birch: { name: "Birch Lane", z: 220 },
  market: { name: "Market Street", z: 300 },
  west: { name: "Founders Way", x: -110 },
  east: { name: "Quarry Lane", x: 110 },
  link: { name: "Mill Road", x: 330 },
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
  /** Base height (for buildings on the hills). */
  y?: number;
}

export type LandmarkId = "sales" | "factory" | "tower" | "farm" | "park" | "shop" | "school" | "mall" | "cottage" | "office" | "dealer" | "bank" | "clothing" | "subs" | "burger";

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
  shop: { id: "shop", name: "Ridge Corner Market", position: [40, 330], size: [30, 18, 6] },
  school: { id: "school", name: "Caivan Ridge Public School", position: [-130, 350], size: [56, 30, 9] },
  mall: { id: "mall", name: "Ridge Centre Mall", position: [215, 372], size: [100, 56, 14] },
  cottage: { id: "cottage", name: "Rosa's Cottage", position: COTTAGE.position, size: [12, 9, 6.5] },
  office: { id: "office", name: "Caivan Office", position: OFFICE.centre, size: [OFFICE.w, OFFICE.d, OFFICE.height] },
  dealer: { id: "dealer", name: "Ridge Motors", position: [200, 46], size: [36, 20, 7] },
  bank: { id: "bank", name: "Ridge Savings Bank", position: [-80, 279], size: [20, 16, 8] },
  clothing: { id: "clothing", name: "Northline Outfitters", position: [186, 280], size: [22, 14, 6] },
  subs: { id: "subs", name: "Crossroads Subs", position: [-30, 321], size: [14, 12, 5] },
  burger: { id: "burger", name: "Flat Top Burgers", position: [105, 322], size: [18, 14, 6] },
};

/** Paved areas (parking lots, yards): no trees or grass there. */
export const PAVED: { x0: number; z0: number; x1: number; z1: number; kind: "parking" | "field" }[] = [
  { x0: -199, z0: 11, x1: -143, z1: 27, kind: "parking" },
  { x0: 165, z0: 310, x1: 265, z1: 342, kind: "parking" },
  { x0: 20, z0: 309.5, x1: 60, z1: 320, kind: "parking" },
  { x0: -98, z0: 318, x1: -62, z1: 344, kind: "parking" },
  { x0: -232, z0: 318, x1: -166, z1: 384, kind: "field" },
  { x0: 176, z0: -34, x1: 214, z1: -12, kind: "parking" },
  { x0: 172, z0: 12, x1: 228, z1: 34, kind: "parking" },
  { x0: -46, z0: 309.5, x1: -14, z1: 314, kind: "parking" },
  { x0: 84, z0: 309.5, x1: 126, z1: 314.5, kind: "parking" },
];

/** Cars parked at the mall, nose-in to the stalls (solid: you bump into them). */
export const PARKED_CARS: { x: number; z: number; heading: number; color: string }[] = [
  { x: 177, z: 315, heading: -Math.PI / 2, color: "#c9ccd1" },
  { x: 190.5, z: 315, heading: Math.PI / 2, color: "#20232a" },
  { x: 209.4, z: 323.5, heading: -Math.PI / 2, color: "#8c1d18" },
  { x: 223, z: 315, heading: Math.PI / 2, color: "#e6e2d8" },
  { x: 236.4, z: 323.5, heading: -Math.PI / 2, color: "#1d3b6a" },
  { x: 250, z: 337, heading: Math.PI / 2, color: "#4b5258" },
];
/** Where the school bus parks (it's a drivable vehicle now: see sim/vehicle.ts). */
export const SCHOOL_BUS = { x: -76, z: 331, heading: 0 };

/** Tower cranes over the east phase, in the back yards of lots being framed. */
export const CRANES: { x: number; z: number; height: number; jib: number; phase: number }[] = [
  { x: 178.75, z: 166, height: 30, jib: 36, phase: 0 },
  { x: 277.75, z: 186, height: 34, jib: 40, phase: 2.1 },
];
/** The site foreman, on the Maple Run sidewalk between the cranes. */
export const FOREMAN = { at: [228, 137.4] as V2, facing: -Math.PI / 2 };

/** Cars on display on the Ridge Motors forecourt, nose to the boulevard. */
export const DISPLAY_CARS: { id: VehicleId; x: number; z: number; heading: number; color: string }[] = [
  { id: "roadster", x: 179, z: 22, heading: -Math.PI / 2, color: "#b3261e" },
  { id: "coupe", x: 189.5, z: 22, heading: -Math.PI / 2, color: "#1f4d3a" },
  { id: "super", x: 200, z: 22, heading: -Math.PI / 2, color: "#e8a31a" },
  { id: "suv", x: 210.5, z: 22, heading: -Math.PI / 2, color: "#2f3e52" },
  { id: "sedan", x: 221, z: 22, heading: -Math.PI / 2, color: "#b9bcc0" },
];

/** Monument signs at the street (game heading = the way the lettering faces). */
export const SIGNS: { text: string; sub?: string; x: number; z: number; heading: number; width: number }[] = [
  { text: "CAIVAN SALES CENTRE", sub: "Model homes open daily", x: -150, z: 8.5, heading: -Math.PI / 2, width: 5.5 },
  { text: "CAIVAN PANEL FACTORY", sub: "Deliveries at the dock", x: 265, z: -9, heading: Math.PI / 2, width: 5.5 },
  { text: "HILLSIDE GOAT FARM", x: -290, z: -9, heading: Math.PI / 2, width: 5 },
  { text: "RIDGE PARK", x: -4, z: 9.5, heading: -Math.PI / 2, width: 3.6 },
  { text: "CAIVAN RIDGE PUBLIC SCHOOL", sub: "Kindergarten to Grade 8", x: -146, z: 323, heading: -Math.PI / 2, width: 6 },
  { text: "RIDGE CENTRE", sub: "Shops, dining, services", x: 159, z: 309.5, heading: -Math.PI / 2, width: 5.5 },
  { text: "COTTAGE ROAD", sub: "Rosa's Cottage, 0.6 km", x: -246, z: 300, heading: 0, width: 4.6 },
  { text: "RIDGE MOTORS", sub: "New cars, every day", x: 168, z: 9, heading: -Math.PI / 2, width: 5 },
  { text: "CAIVAN", sub: "Head office", x: 172, z: -9, heading: Math.PI / 2, width: 4 },
];

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
/** The east phase's lots start here (x of the first lot's centre). */
const EAST_LOT_X0 = 129.25;
const isEastLot = (n: number) => (n >= 224 && n < 300) || n >= 324;
/** Vacant lots the City Hall in Owawa sells to you (the land quest). */
export const PARCELS = ["lot-246", "lot-247", "lot-347"];
export const SURVEY_LOT_ID = "lot-113";
export const POUR_LOT_ID = "lot-207";
export const MODEL_HOME_LOT_ID = "lot-204";

function streetLots(streetZ: number, firstNumber: number, rand: () => number, x0 = -90.75): Lot[] {
  const lots: Lot[] = [];
  for (let i = 0; i < 12; i++) {
    const x = x0 + i * LOT_W;
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
  const lots = [
    ...streetLots(STREETS.ridgeview.z, 100, rand),
    ...streetLots(STREETS.maple.z, 200, rand),
    ...streetLots(STREETS.birch.z, 300, rand),
    // The new east phase: Maple Run and Birch Lane continue to Mill Road.
    ...streetLots(STREETS.maple.z, 224, rand, EAST_LOT_X0),
    ...streetLots(STREETS.birch.z, 324, rand, EAST_LOT_X0),
  ];
  // The hero home (Plan 36) on Ridgeview, centre north side, numbered 42 like the studio demo.
  const hero = lots.find((l) => l.id === "lot-112")!;
  hero.id = HERO_LOT_ID;
  hero.number = "42";
  hero.houseModelId = "plan-36";
  hero.status = "selected";
  for (const l of lots) {
    if (l.id === SURVEY_LOT_ID || PARCELS.includes(l.id)) l.status = "available";
    if (l.id === MODEL_HOME_LOT_ID) l.status = "model-home";
  }
  return lots;
}

/** Construction stage of each lot at the start of the game (south side of Maple Run is being built). */
function startingStages(lots: Lot[]): Record<string, StageId> {
  const stages: Record<string, StageId> = {};
  const cycle: StageId[] = ["excavation", "framing", "foundation", "roofing", "framing", "excavation"];
  // The east phase is busier: nearly every lot is being built, a few are finished.
  const east: StageId[] = ["framing", "foundation", "roofing", "excavation", "framing", "drywall", "framing", "foundation"];
  let k = 0;
  let e = 0;
  for (const l of lots) {
    if (l.id.startsWith("nm-")) {
      const st = meadowStage(l.id);
      if (st) stages[l.id] = st;
      continue;
    }
    if(l.id.startsWith("v6-")) {const n=Number(l.id.slice(7));if(n%7===0)stages[l.id]="permits";else if(n%5===0)stages[l.id]="framing";else if(n%9===0)stages[l.id]="foundation";continue;}
    const n = Number(l.number);
    if (isEastLot(n)) {
      if (e % 5 !== 4) stages[l.id] = east[e % east.length];
      e++;
    } else if (n >= 200 && n % 2 === 1) stages[l.id] = cycle[k++ % cycle.length];
  }
  for (const id of PARCELS) stages[id] = "permits";
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
  road("maple", [STREETS.west.x, STREETS.maple.z], [STREETS.link.x, STREETS.maple.z]),
  road("founders", [STREETS.west.x, STREETS.ridgeview.z], [STREETS.west.x, STREETS.market.z]),
  road("quarry", [STREETS.east.x, STREETS.ridgeview.z], [STREETS.east.x, STREETS.market.z]),
  road("birch", [STREETS.west.x, STREETS.birch.z], [STREETS.link.x, STREETS.birch.z]),
  road("market", [-230, STREETS.market.z], [STREETS.link.x, STREETS.market.z]),
  road("mill", [STREETS.link.x, STREETS.boulevard.z], [STREETS.link.x, STREETS.market.z]),
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
  for (const p of [...PAVED, ...MEADOW_PAVING]) if (x > p.x0 - pad && x < p.x1 + pad && z > p.z0 - pad && z < p.z1 + pad) return false;
  for (const g of SIGNS) if (Math.hypot(x - g.x, z - g.z) < g.width / 2 + 1.5) return false;
  if (nearestCountryRoad(x, z).d < 5.5 + pad) return false;
  for (const c of CRANES) if (Math.hypot(x - c.x, z - c.z) < 6) return false;
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
    if(V6_BUILDINGS.some(b=>Math.abs(x-b.at[0])<b.size[0]/2+pad+1&&Math.abs(z-b.at[1])<b.size[1]/2+pad+1))return;
    if (!isOpenGround(x, z, lots, pad)) return;
    if (onStationAccess(x, z, 2.5)) return;
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

const LOTS = [...buildLots(), ...V6_LOTS, ...MEADOW_LOTS];
ROADS.push(...SUBURB_ROADS);

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
  // The office is walk-in: walls, a door, furniture and the floor above (see office.ts).
  boxes.push(...officeBoxes());
  // So is the mall: walls with doorways, shop fronts, counters and shelving (see mall.ts).
  boxes.push(...mallBoxes());
  for (const m of Object.values(LANDMARKS)) {
    if (m.id === "park" || m.id === "tower" || m.id === "office" || m.id === "mall") continue;
    const [w, d, h] = m.size;
    boxes.push({ x0: m.position[0] - w / 2, z0: m.position[1] - d / 2, x1: m.position[0] + w / 2, z1: m.position[1] + d / 2, h, kind: "landmark", id: m.id, y: m.id === "cottage" ? COTTAGE_Y : 0 });
  }
  // Rosa's porch: a low deck you can step up onto.
  const [cx, cz] = COTTAGE.position;
  boxes.push({ x0: cx - 6, z0: cz - 4.5 - 2.4, x1: cx + 6, z1: cz - 4.5, h: 0.45, kind: "landmark", id: "porch", y: COTTAGE_Y });
  for (const c of [...PARKED_CARS, ...DISPLAY_CARS]) boxes.push({ x0: c.x - 0.95, z0: c.z - 2.3, x1: c.x + 0.95, z1: c.z + 2.3, h: 1.4, kind: "landmark", id: "parked" });
  for (const c of CRANES) boxes.push({ x0: c.x - 1.1, z0: c.z - 1.1, x1: c.x + 1.1, z1: c.z + 1.1, h: c.height, kind: "landmark", id: "crane" });
  boxes.push(...lakeBoxes(), ...owawaBoxes(), ...v6Boxes());
  for (const g of SIGNS) {
    const along = Math.abs(Math.cos(g.heading)) < 0.5;
    const hw = g.width / 2 + 0.25;
    boxes.push({ x0: g.x - (along ? hw : 0.35), z0: g.z - (along ? 0.35 : hw), x1: g.x + (along ? hw : 0.35), z1: g.z + (along ? 0.35 : hw), h: 1.9, kind: "landmark", id: "sign" });
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

// ── Street furniture and town life ──────────────────────────────────────────

/** Street lights along every road, on the grass strip between curb and sidewalk, clear of junctions. */
export function streetLights(roads: Road[] = ROADS, y = 0): { x: number; z: number; y: number; heading: number }[] {
  const out: { x: number; z: number; y: number; heading: number }[] = [];
  const nearJunction = (x: number, z: number, self: Road) =>
    roads.some((r) => {
      if (r === self) return false;
      const [ax, az] = r.from;
      const [bx, bz] = r.to;
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < r.width / 2 + r.boulevardWidth + r.sidewalkWidth + 6;
    });
  for (const r of roads) {
    const offset = r.width / 2 + r.boulevardWidth * 0.45;
    const [ax, az] = r.from;
    const [bx, bz] = r.to;
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    let i = 0;
    for (let s = 14; s < L - 8; s += 34, i++) {
      // Alternate sides so lamps stagger like a real street.
      const side = i % 2 ? 1 : -1;
      const x = ax + ux * s - uz * offset * side;
      const z = az + uz * s + ux * offset * side;
      if (nearJunction(x, z, r)) continue;
      // The lamp arm reaches back over the road.
      out.push({ x, z, y, heading: Math.atan2(-ux * side, uz * side) });
    }
  }
  return out;
}

/** Closed driving loops (centre lines, clockwise as seen on the map); cars keep to the right lane. */
export const TRAFFIC_LOOPS: V2[][] = [
  [
    [-110, -130],
    [110, -130],
    [110, 0],
    [-110, 0],
  ],
  [
    [110, 0],
    [110, 130],
    [-110, 130],
    [-110, 0],
  ],
  [
    [-110, 130],
    [110, 130],
    [110, 220],
    [-110, 220],
  ],
  [
    [110, 0],
    [330, 0],
    [330, 300],
    [-110, 300],
    [-110, 220],
    [110, 220],
  ],
  // West boulevard: out to the edge of town and back (a long, thin loop).
  [
    [-425, 0.05],
    [-110, 0.05],
    [-110, -0.05],
    [-425, -0.05],
  ],
];

/** Sidewalk walking loops for pedestrians (inside each block, along the sidewalks). */
export const WALK_LOOPS: V2[][] = (() => {
  const k = FRONT - ROAD.sidewalk / 2;
  const block = (x0: number, z0: number, x1: number, z1: number): V2[] => [
    [x0 + k, z0 + k],
    [x1 - k, z0 + k],
    [x1 - k, z1 - k],
    [x0 + k, z1 - k],
  ];
  return [
    block(-110, -130, 110, 0),
    block(-110, 0, 110, 130),
    block(-110, 130, 110, 220),
    block(-110, 220, 110, 300),
    block(110, 0, 330, 300),
    [
      [-225, 300 + k],
      [325, 300 + k],
      [325, 300 + k + 0.5],
      [-225, 300 + k + 0.5],
    ],
    [
      [-420, -k],
      [-120, -k],
      [-120, -k - 0.5],
      [-420, -k - 0.5],
    ],
  ];
})();
