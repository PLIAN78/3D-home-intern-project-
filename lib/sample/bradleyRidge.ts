import type { Community, Lot, PlaceholderStyle, Tree } from "@/lib/models/community";

/**
 * Fictional demo streetscape: one residential crescent with lots on both sides.
 * World axes: road runs along x; north lots (rotation 0) face +z toward the road,
 * south lots (rotation π) face −z.
 */

const ROAD_WIDTH = 9;
const BOULEVARD = 2.0;
const SIDEWALK = 1.6;
const LOT_WIDTH = 16.5;
const LOT_DEPTH = 34;
const FRONT_LINE = ROAD_WIDTH / 2 + BOULEVARD + SIDEWALK; // distance from road centreline to front lot line

const STYLES: PlaceholderStyle[] = ["classic", "modern", "craftsman", "bungalow"];
const BODY_COLORS = ["#d8d2c6", "#8f8a82", "#b8a68c", "#e9e6df", "#6f7277", "#a9937a", "#cfc5b2", "#9aa19a"];
const ROOF_COLORS = ["#2c2d30", "#5a5048", "#4a4f55", "#34383d"];

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildLots(): Lot[] {
  const lots: Lot[] = [];
  const xs = [-2, -1, 0, 1, 2].map((i) => i * LOT_WIDTH);
  xs.forEach((x, i) => {
    const north = 38 + i * 2;
    const south = 39 + i * 2;
    lots.push({
      id: `lot-${north}`,
      number: String(north),
      position: [x, 0, -(FRONT_LINE + LOT_DEPTH / 2)],
      rotation: [0, 0, 0],
      width: LOT_WIDTH,
      depth: LOT_DEPTH,
      frontSetback: 6,
      houseModelId: north === 42 ? "plan-36" : undefined,
      status: north === 42 ? "selected" : i % 2 === 0 ? "sold" : "available",
      placeholder: {
        style: STYLES[(i * 3) % STYLES.length],
        bodyColor: BODY_COLORS[(i * 2) % BODY_COLORS.length],
        roofColor: ROOF_COLORS[i % ROOF_COLORS.length],
        garageSide: i % 2 === 0 ? "left" : "right",
        storeys: i === 4 ? 1 : 2,
      },
    });
    lots.push({
      id: `lot-${south}`,
      number: String(south),
      position: [x, 0, FRONT_LINE + LOT_DEPTH / 2],
      rotation: [0, Math.PI, 0],
      width: LOT_WIDTH,
      depth: LOT_DEPTH,
      frontSetback: 6,
      status: i % 3 === 0 ? "model-home" : "sold",
      placeholder: {
        style: STYLES[(i * 3 + 1) % STYLES.length],
        bodyColor: BODY_COLORS[(i * 2 + 1) % BODY_COLORS.length],
        roofColor: ROOF_COLORS[(i + 2) % ROOF_COLORS.length],
        garageSide: i % 2 === 0 ? "right" : "left",
        storeys: i === 1 ? 1 : 2,
      },
    });
  });
  return lots;
}

function buildTrees(): Tree[] {
  const rand = mulberry32(42);
  const trees: Tree[] = [];
  const blvdZ = ROAD_WIDTH / 2 + BOULEVARD / 2;
  for (let x = -41.25; x <= 41.25; x += 8.25) {
    for (const side of [-1, 1]) {
      // Keep street views of the featured lot (42, north side at x = 0) clear.
      if (Math.abs(x) < 6) continue;
      trees.push({ position: [x + (rand() - 0.5) * 1.2, side * blvdZ], scale: 0.85 + rand() * 0.35, variant: 0 });
    }
  }
  // Rear-yard and edge trees
  for (let i = 0; i < 46; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = -40 + rand() * 80;
    const z = side * (FRONT_LINE + LOT_DEPTH - 2 - rand() * 6);
    trees.push({ position: [x, z], scale: 0.8 + rand() * 0.7, variant: (1 + Math.floor(rand() * 2)) as 1 | 2 });
  }
  // Woodlot beyond the subdivision edge
  for (let i = 0; i < 70; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = -75 + rand() * 150;
    const z = side * (FRONT_LINE + LOT_DEPTH + 6 + rand() * 30);
    trees.push({ position: [x, z], scale: 0.9 + rand() * 0.9, variant: (Math.floor(rand() * 3)) as 0 | 1 | 2 });
  }
  for (let i = 0; i < 30; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = side * (48 + rand() * 30);
    const z = -40 + rand() * 80;
    if (Math.abs(z) < ROAD_WIDTH) continue;
    trees.push({ position: [x, z], scale: 0.9 + rand() * 0.8, variant: (Math.floor(rand() * 3)) as 0 | 1 | 2 });
  }
  return trees;
}

export const BRADLEY_RIDGE: Community = {
  id: "bradley-ridge",
  name: "Bradley Ridge",
  phase: "Phase 2 · Ridgeview Crescent",
  lots: buildLots(),
  roads: [{ id: "ridgeview-cres", from: [-90, 0], to: [90, 0], width: ROAD_WIDTH, sidewalkWidth: SIDEWALK, boulevardWidth: BOULEVARD }],
  trees: buildTrees(),
};
