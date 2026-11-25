import type { Road } from "@/lib/models/community";
import type { Box, V2 } from "./map";
import { RIVER_WALK } from "./v6";
import { CITY_Y, groundAt, OWAWA } from "./terrain";

/**
 * Downtown Owawa, on its plateau in the north-east hills: a three-by-three
 * street grid, towers and mid-rises, City Hall facing its square, and a
 * shawarma place on Queen Street. Shared by the physics and the renderer.
 */

const ROAD_DIMS = { width: 9, sidewalkWidth: 1.6, boulevardWidth: 2 };
const road = (id: string, from: V2, to: V2): Road => ({ id, from, to, ...ROAD_DIMS });

export const CITY_STREETS = {
  wellington: { name: "Wellington Avenue", z: -840 },
  rideau: { name: "Rideau Avenue", z: -760 },
  queen: { name: "Queen Street", z: -680 },
  lyon: { name: "Lyon Street", x: 610 },
  elgin: { name: "Elgin Street", x: 690 },
  kent: { name: "Kent Street", x: 770 },
} as const;

/** Shared footprint for downtown paving in the world, map and grass mask. */
export const CITY_PAVING = { x0: 540, x1: 840, z0: -920, z1: -600 } as const;
const { x0: X0, x1: X1, z0: Z0, z1: Z1 } = CITY_PAVING;

export const OWAWA_ROADS: Road[] = [
  road("wellington", [X0, CITY_STREETS.wellington.z], [X1, CITY_STREETS.wellington.z]),
  road("rideau", [X0, CITY_STREETS.rideau.z], [X1, CITY_STREETS.rideau.z]),
  road("queen", [X0, CITY_STREETS.queen.z], [X1, CITY_STREETS.queen.z]),
  road("lyon", [CITY_STREETS.lyon.x, Z0], [CITY_STREETS.lyon.x, Z1]),
  // Elgin runs on to the edge of the plateau, where Owawa Road arrives.
  road("elgin", [CITY_STREETS.elgin.x, Z0], [CITY_STREETS.elgin.x, OWAWA.centre[1] + OWAWA.half]),
  road("kent", [CITY_STREETS.kent.x, Z0], [CITY_STREETS.kent.x, Z1]),
];

export type BuildingKind = "tower" | "midrise" | "lowrise";

export interface CityBuilding {
  at: V2;
  /** Width (x), depth (z), height. */
  size: [number, number, number];
  kind: BuildingKind;
  /** Facade tint and glass style. */
  tone: number;
  name?: string;
}

/** Every building downtown (City Hall and the shawarma place are separate). */
export const CITY_BUILDINGS: CityBuilding[] = [
  { at: [575, -880], size: [28, 28, 96], kind: "tower", tone: 0 },
  { at: [650, -882], size: [26, 30, 124], kind: "tower", tone: 1, name: "CAIVAN TOWER" },
  { at: [714, -890], size: [26, 26, 36], kind: "midrise", tone: 2 },
  { at: [748, -866], size: [22, 26, 48], kind: "midrise", tone: 3 },
  { at: [805, -880], size: [26, 26, 110], kind: "tower", tone: 2 },
  { at: [575, -800], size: [40, 30, 28], kind: "midrise", tone: 1 },
  { at: [650, -800], size: [30, 30, 150], kind: "tower", tone: 3 },
  { at: [730, -800], size: [26, 34, 84], kind: "tower", tone: 0 },
  { at: [805, -800], size: [36, 40, 40], kind: "midrise", tone: 0 },
  { at: [575, -720], size: [40, 28, 22], kind: "midrise", tone: 2 },
  { at: [745, -732], size: [30, 24, 26], kind: "midrise", tone: 1 },
  { at: [805, -720], size: [28, 28, 72], kind: "tower", tone: 1 },
  { at: [575, -640], size: [40, 30, 12], kind: "lowrise", tone: 3 },
  { at: [730, -640], size: [30, 40, 30], kind: "midrise", tone: 2 },
  { at: [805, -640], size: [30, 30, 64], kind: "tower", tone: 3 },
];

/** City Hall: a stone civic building with a clock tower, facing its square to the south. */
export const CITY_HALL = { at: [650, -732] as V2, size: [42, 24, 16] as [number, number, number], tower: { at: [650, -736] as V2, size: [9, 9, 40] as [number, number, number] } };
/** Owawa Square: the open block south of City Hall, across Queen Street. */
export const SQUARE = { x0: 618.1, z0: -671.9, x1: 681.9, z1: -608.1 };
/** The shawarma place on Queen Street. */
export const SHAWARMA = { at: [712, -696] as V2, size: [14, 12, 5] as [number, number, number] };

const HALL_FRONT = CITY_HALL.at[1] + CITY_HALL.size[1] / 2;
/** City Hall's portico: a raised platform with two steps down to the plaza, and six columns. Solid, so you climb it. */
export const PORTICO = {
  steps: [
    { x0: CITY_HALL.at[0] - 8, x1: CITY_HALL.at[0] + 8, z0: HALL_FRONT, z1: HALL_FRONT + 3, top: 0.9 },
    { x0: CITY_HALL.at[0] - 9, x1: CITY_HALL.at[0] + 9, z0: HALL_FRONT + 3, z1: HALL_FRONT + 3.6, top: 0.6 },
    { x0: CITY_HALL.at[0] - 9.5, x1: CITY_HALL.at[0] + 9.5, z0: HALL_FRONT + 3.6, z1: HALL_FRONT + 4.2, top: 0.3 },
  ],
  columns: Array.from({ length: 6 }, (_, i) => [CITY_HALL.at[0] - 7 + i * 2.8, HALL_FRONT + 2.3] as V2),
  columnHeight: 9,
};

/** Door spots (in front of the entrance). */
export const CITY_HALL_DOOR: V2 = [CITY_HALL.at[0], HALL_FRONT + 6];
export const SHAWARMA_DOOR: V2 = [SHAWARMA.at[0], SHAWARMA.at[1] + SHAWARMA.size[1] / 2 + 2.5];

/** Traffic and pedestrian loops downtown (on top of the plateau). */
export const CITY_TRAFFIC: V2[][] = [
  [
    [610, -840],
    [770, -840],
    [770, -680],
    [610, -680],
  ],
  [
    [545, -759.95],
    [835, -759.95],
    [835, -760.05],
    [545, -760.05],
  ],
];
export const CITY_WALKS: V2[][] = (() => {
  const k = 8.1 - 0.8;
  const block = (x0: number, z0: number, x1: number, z1: number): V2[] => [
    [x0 + k, z0 + k],
    [x1 - k, z0 + k],
    [x1 - k, z1 - k],
    [x0 + k, z1 - k],
  ];
  return [...RIVER_WALK.slice(1).map((p,i)=>[[RIVER_WALK[i][0],RIVER_WALK[i][1]-8],[p[0],p[1]-8],[p[0],p[1]-11],[RIVER_WALK[i][0],RIVER_WALK[i][1]-11]] as V2[]), block(610, -840, 690, -760), block(690, -840, 770, -760), block(610, -760, 690, -680), block(690, -760, 770, -680), block(610, -680, 690, -600), block(690, -680, 770, -600)];
})();

/** Every building footprint downtown, for keeping trees and props clear. */
const FOOTPRINTS: { at: V2; size: [number, number, number] }[] = [...CITY_BUILDINGS, CITY_HALL, SHAWARMA];
const clearOfBuildings = (x: number, z: number, pad: number) => FOOTPRINTS.every((b) => Math.abs(x - b.at[0]) > b.size[0] / 2 + pad || Math.abs(z - b.at[1]) > b.size[1] / 2 + pad);

/** "Welcome to Owawa" beside Owawa Road, below the plateau. */
export const CITY_SIGN = { at: [701, -568] as V2 };

/** The fountain in Owawa Square. */
export const FOUNTAIN = { at: [650, -640] as V2, radius: 3.5 };

/**
 * Street trees in tree pits just behind the sidewalks (clear of the lamp
 * posts on the boulevard and of the corners), and maples around the square.
 */
export const CITY_TREES: { position: V2; y: number; scale: number; variant: 0 | 1 | 2 }[] = (() => {
  const out: { position: V2; y: number; scale: number; variant: 0 | 1 | 2 }[] = [];
  const pit = ROAD_DIMS.width / 2 + ROAD_DIMS.boulevardWidth + ROAD_DIMS.sidewalkWidth + 1.3;
  const xs = [CITY_STREETS.lyon.x, CITY_STREETS.elgin.x, CITY_STREETS.kent.x];
  const zs = [CITY_STREETS.wellington.z, CITY_STREETS.rideau.z, CITY_STREETS.queen.z];
  const nearCorner = (x: number, z: number) => xs.some((sx) => Math.abs(x - sx) < 14) && zs.some((sz) => Math.abs(z - sz) < 14);
  const inSquare = (x: number, z: number) => x > SQUARE.x0 - 1 && x < SQUARE.x1 + 1 && z > SQUARE.z0 - 1 && z < SQUARE.z1 + 1;
  let k = 0;
  const add = (x: number, z: number) => {
    if (x < X0 + 4 || x > X1 - 4 || z < Z0 + 4 || z > Z1 - 4) return;
    if (nearCorner(x, z) || inSquare(x, z) || !clearOfBuildings(x, z, 3.2)) return;
    if (xs.some((sx) => Math.abs(x - sx) < pit - 0.5) && zs.some((sz) => Math.abs(z - sz) < pit - 0.5)) return;
    out.push({ position: [x, z], y: CITY_Y, scale: 0.75 + ((k * 0.37) % 0.35), variant: k++ % 3 === 1 ? 2 : 0 });
  };
  for (const sz of zs) for (let x = X0 + 9; x < X1; x += 16) for (const side of [-1, 1]) add(x, sz + side * pit);
  for (const sx of xs) for (let z = Z0 + 9; z < Z1; z += 16) for (const side of [-1, 1]) add(sx + side * pit, z);
  // Owawa Square: a ring of maples around the lawn.
  const [fx, fz] = FOUNTAIN.at;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    out.push({ position: [fx + Math.cos(a) * 22, fz + Math.sin(a) * 22], y: CITY_Y, scale: 0.9 + (i % 3) * 0.12, variant: i % 4 === 0 ? 2 : 0 });
  }
  return out;
})();

/** Benches on the square's diagonals, facing the fountain. */
export const BENCHES: { at: V2; heading: number }[] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
].map(([sx, sz]) => ({ at: [FOUNTAIN.at[0] + sx * 10.6, FOUNTAIN.at[1] + sz * 10.6] as V2, heading: Math.atan2(-sz, -sx) }));

/** People enjoying the square and outside City Hall and the shawarma place (static; the walkers are in the sim). */
export const SQUARE_PEOPLE: { at: V2; facing: number; outfit: number; pose: "sit" | "auto" }[] = [
  ...BENCHES.slice(0, 3).flatMap((b, i) => {
    // Two sitters on the first bench, one on the others; along the bench, across its heading.
    const ax = -Math.sin(b.heading);
    const az = Math.cos(b.heading);
    const spots = i === 0 ? [-0.5, 0.5] : [0.3];
    return spots.map((o, k) => ({ at: [b.at[0] + ax * o - Math.cos(b.heading) * 0.15, b.at[1] + az * o - Math.sin(b.heading) * 0.15] as V2, facing: b.heading, outfit: (i * 3 + k * 5) % 10, pose: "sit" as const }));
  }),
  { at: [645, -653], facing: 1.2, outfit: 1, pose: "auto" },
  { at: [646.1, -652.2], facing: -2.1, outfit: 4, pose: "auto" },
  { at: [628, -710], facing: Math.PI / 2, outfit: 0, pose: "auto" },
  { at: [671, -712], facing: 2.2, outfit: 3, pose: "auto" },
  { at: [700, -685], facing: -Math.PI / 2, outfit: 5, pose: "auto" },
  { at: [722, -685.5], facing: Math.PI, outfit: 8, pose: "auto" },
];

export function owawaBoxes(): Box[] {
  const y = CITY_Y;
  const box = (at: V2, size: [number, number, number], id: string): Box => ({ x0: at[0] - size[0] / 2, z0: at[1] - size[1] / 2, x1: at[0] + size[0] / 2, z1: at[1] + size[1] / 2, h: size[2], y, kind: "landmark", id });
  return [
    ...CITY_BUILDINGS.map((b) => box(b.at, b.size, "city")),
    box(CITY_HALL.at, CITY_HALL.size, "cityhall"),
    box(CITY_HALL.tower.at, CITY_HALL.tower.size, "cityhall"),
    box(SHAWARMA.at, SHAWARMA.size, "shawarma"),
    ...PORTICO.steps.map((s): Box => ({ x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, h: s.top, y, kind: "landmark", id: "cityhall" })),
    ...PORTICO.columns.map((c) => box(c, [0.9, 0.9, 0.9 + PORTICO.columnHeight], "cityhall")),
    // The welcome sign where Owawa Road arrives.
    { ...box(CITY_SIGN.at, [6.4, 0.8, 2.3], "sign"), y: groundAt(CITY_SIGN.at[0], CITY_SIGN.at[1]) },
    // The fountain in Owawa Square.
    box(FOUNTAIN.at, [FOUNTAIN.radius * 2, FOUNTAIN.radius * 2, 1.2], "fountain"),
  ];
}
