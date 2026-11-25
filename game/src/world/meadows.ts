import type { Lot } from "@/lib/models/community";
import type { Point, V6Building, V6Road } from "./v6";

/**
 * North Meadows: the new neighbourhood between the panel factory and the
 * river. Quarry Lane, Ridgeview Crescent and Mill Road carry on north into a
 * small grid (Fieldstone Avenue, Clover Crescent, Meadow Way, with Sorrel
 * Lane and Meadow Court across). Detached homes and freehold towns line the
 * streets; condos, a row of shops and two small office buildings fill the
 * blocks east of Mill Road; a riverside green runs along Meadow Way. Quarry
 * Lane leaves the grid at Meadow Way for the centre bridge.
 *
 * Pure data, no runtime imports, so terrain.ts and v6.ts can both use it.
 */

/** Same street dimensions as the rest of Caivan Ridge (map.ts ROAD). */
export const MEADOW_ROAD_DIMS = { width: 9, sidewalkWidth: 1.6, boulevardWidth: 2 };
/** Centre line to front lot line. */
const FRONT = MEADOW_ROAD_DIMS.width / 2 + MEADOW_ROAD_DIMS.boulevardWidth + MEADOW_ROAD_DIMS.sidewalkWidth;
const LOT_DEPTH = 34;

export const MEADOW_X = { quarry: 110, sorrel: 220, mill: 330, court: 420 } as const;
export const MEADOW_Z = { ridgeview: -130, fieldstone: -220, clover: -320, meadow: -420 } as const;
/** Meadow Way: the riverside street where Quarry Lane turns onto the bridge. */
export const MEADOW_WAY_Z = MEADOW_Z.meadow;

export const MEADOW_STREET_NAMES = {
  heron: "Heron Fields Drive",
  wren: "Wren Lane",
  bluebell: "Bluebell Lane",
  fieldstone: "Fieldstone Avenue",
  clover: "Clover Crescent",
  meadow: "Meadow Way",
  sorrel: "Sorrel Lane",
  court: "Meadow Court",
} as const;

const road = (id: string, from: Point, to: Point): V6Road => ({ id, from, to, ...MEADOW_ROAD_DIMS });
const { quarry, sorrel, mill, court } = MEADOW_X;
/**
 * Heron Fields: North Meadows' streets carry on west of Quarry Lane, between
 * Lake Road and the community's back fences, with three new cross streets.
 */
export const HERON_FIELDS_X = { heron: -262, wren: -138, bluebell: -14 } as const;
const { heron, wren, bluebell } = HERON_FIELDS_X;
const { ridgeview, fieldstone, clover, meadow } = MEADOW_Z;

export const MEADOW_ROADS: V6Road[] = [
  road("quarry-north", [quarry, ridgeview], [quarry, meadow]),
  // The bridgehead: a short stub so Meadow Way's curb opens for the bridge road (terrain.ts QUARRY_BRIDGE_ROAD).
  road("quarry-bridgehead", [quarry, meadow], [quarry, meadow - 10]),
  road("ridgeview-east", [quarry, ridgeview], [mill, ridgeview]),
  road("mill-north", [mill, 0], [mill, meadow]),
  road("sorrel", [sorrel, ridgeview], [sorrel, meadow]),
  road("court", [court, fieldstone], [court, meadow]),
  road("fieldstone", [quarry, fieldstone], [court, fieldstone]),
  road("clover", [quarry, clover], [court, clover]),
  road("meadow-way", [quarry, meadow], [court, meadow]),
  // Heron Fields
  road("fieldstone-west", [heron, fieldstone], [quarry, fieldstone]),
  road("clover-west", [heron, clover], [quarry, clover]),
  road("meadow-west", [heron, meadow], [quarry, meadow]),
  road("heron-fields", [heron, fieldstone], [heron, meadow]),
  road("wren", [wren, fieldstone], [wren, meadow]),
  road("bluebell", [bluebell, fieldstone], [bluebell, meadow]),
];

const BODY = ["#d8d2c6", "#b8a68c", "#e9e6df", "#cfc5b2", "#9aa19a", "#a9937a", "#8f8a82", "#c9c1b3"];
const ROOF = ["#2c2d30", "#5a5048", "#4a4f55", "#34383d"];
const STYLES = ["modern", "classic", "craftsman"] as const;

function hash(n: number) {
  const s = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * A row of lots along one side of an east–west street, between two
 * north–south streets: detached (16.5 m) or freehold towns (7.2 m, attached).
 */
function row(streetZ: number, side: -1 | 1, xa: number, xb: number, kind: "detached" | "towns", first: number): Lot[] {
  const width = kind === "towns" ? 7.2 : 16.5;
  // Keep clear of the cross streets' sidewalks (and a metre more).
  const x0 = xa + FRONT + 1;
  const x1 = xb - FRONT - 1;
  const n = Math.floor((x1 - x0) / width);
  const start = x0 + (x1 - x0 - n * width) / 2 + width / 2;
  const lots: Lot[] = [];
  for (let i = 0; i < n; i++) {
    const k = first + i;
    const s = Math.floor(hash(k) * 1000);
    lots.push({
      id: `nm-lot-${k}`,
      number: `NM-${String(k).padStart(3, "0")}`,
      position: [start + i * width, 0, streetZ + side * (FRONT + LOT_DEPTH / 2)],
      // North-side lots (side −1) face +z toward their street; south-side lots face −z.
      rotation: [0, side < 0 ? 0 : Math.PI, 0],
      width,
      depth: LOT_DEPTH,
      frontSetback: kind === "towns" ? 5 : 6,
      status: "sold",
      collection: kind === "towns" ? "Freehold Towns" : "36′ Collection",
      placeholder: {
        style: STYLES[s % STYLES.length],
        // A towns block shares one palette, like a real terrace.
        bodyColor: BODY[kind === "towns" ? (first >> 2) % BODY.length : (s >> 2) % BODY.length],
        roofColor: ROOF[kind === "towns" ? (first >> 3) % ROOF.length : (s >> 4) % ROOF.length],
        garageSide: kind === "towns" ? (i % 2 ? "left" : "right") : s % 2 ? "left" : "right",
        storeys: 2,
      },
    });
  }
  return lots;
}

/** The lots, west and east of Sorrel Lane on each street side. */
export const MEADOW_LOTS: Lot[] = (() => {
  const plan: [number, -1 | 1, "detached" | "towns"][] = [
    [ridgeview, -1, "detached"],
    [fieldstone, 1, "detached"],
    [fieldstone, -1, "towns"],
    [clover, 1, "towns"],
    [clover, -1, "detached"],
    [meadow, 1, "detached"],
  ];
  const out: Lot[] = [];
  for (const [z, side, kind] of plan)
    for (const [xa, xb] of [
      [quarry, sorrel],
      [sorrel, mill],
    ])
      out.push(...row(z, side, xa, xb, kind, out.length));
  // Heron Fields (numbered after North Meadows, so earlier lots keep their ids).
  const west: [number, -1 | 1, "detached" | "towns"][] = [
    [fieldstone, 1, "detached"],
    [fieldstone, -1, "towns"],
    [clover, 1, "towns"],
    [clover, -1, "detached"],
    [meadow, 1, "detached"],
    [meadow, -1, "detached"],
  ];
  for (const [xa, xb] of [[heron, wren], [wren, bluebell], [bluebell, quarry]])
    for (const [z, side, kind] of west) {
      // The riverside green stays open north of Meadow Way near the beach.
      if (z === meadow && side < 0 && xb === quarry) continue;
      out.push(...row(z, side, xa, xb, kind, out.length));
    }
  return out;
})();

/** Construction in North Meadows: about a quarter of the homes still being built. */
export function meadowStage(lotId: string): "framing" | "roofing" | "drywall" | "foundation" | undefined {
  const n = Number(lotId.slice(7));
  if (n % 9 === 4) return "framing";
  if (n % 11 === 7) return "roofing";
  if (n % 13 === 2) return "drywall";
  if (n % 17 === 9) return "foundation";
  return undefined;
}

/** Mixed use east of Mill Road: shops, condos and small offices, set back behind lawns and forecourts. */
export const MEADOW_BUILDINGS: V6Building[] = [
  { id: "meadows-market", name: "MEADOWS MARKET · GROCER · CAFE", at: [376, -197], size: [58, 18, 7], kind: "shop", tone: 1, level: "ground" },
  { id: "meadows-offices", name: "MEADOWS MEDICAL · OFFICES", at: [378, -152], size: [44, 16, 10], kind: "campus", tone: 2, level: "ground" },
  { id: "meadowview-condos", name: "MEADOWVIEW CONDOS", at: [375, -270], size: [50, 36, 22], kind: "condo", tone: 3, level: "ground" },
  { id: "meadows-business", name: "MEADOWS BUSINESS CENTRE", at: [375, -350], size: [50, 22, 16], kind: "tower", tone: 0, level: "ground" },
  { id: "riverwalk-condos", name: "RIVERWALK CONDOS", at: [375, -391], size: [50, 18, 18], kind: "condo", tone: 1, level: "ground" },
];

/** Parking courts between the mixed-use buildings, entered from the Mill Road sidewalk. */
export const MEADOW_PAVING: { x0: number; z0: number; x1: number; z1: number }[] = [
  { x0: 338.5, z0: -186, x1: 405, z1: -170 },
  { x0: 338.5, z0: -251, x1: 404, z1: -239 },
];

