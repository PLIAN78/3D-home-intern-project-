import type { Box, V2 } from "./map";

/**
 * Ridge Centre Mall, walk-in. One storey under a 7 m ceiling: a glass entrance
 * on the parking side (north) and a back door (south), two anchor stores at the
 * ends (Market Hall west, Home + Garden east), eight shops in two rows facing
 * a central concourse, and the info desk with a food court in the middle.
 *
 * Shared by the physics (walls, counters and shelving are solid), the
 * renderer, the prompts and the side quests.
 */
export const MALL = { x0: 165, x1: 265, z0: 344, z1: 400, h: 14, ceiling: 7, wall: 0.4 };
export const MALL_DOORS = { front: [210, 220] as V2, back: [212, 218] as V2 };
/** Anchor walls (with a 12 m opening onto the concourse). */
export const ANCHOR_X = { west: 183, east: 247 };
export const ANCHOR_GAP: V2 = [366, 378];
/** Shop rows: depth from the outer walls, and the shop bays (x ranges). */
export const ROW = { north: 355, south: 389 };
export const BAYS: V2[] = [[183, 196], [196, 209], [221, 234], [234, 247]];
export const OPENING = 4;

export interface MallStore {
  id: string;
  name: string;
  /** Where you stand to talk to the counter. */
  spot: V2;
  /** The counter (or shelving) the spot faces. */
  counter: V2;
  row: "north" | "south" | "west" | "east" | "centre";
  colour: string;
  blurb: string;
}

const mid = (b: V2) => (b[0] + b[1]) / 2;
export const MALL_STORES: MallStore[] = [
  { id: "mall-books", name: "RIDGE BOOKS", row: "north", colour: "#2f5e3f", blurb: "New releases, maps of Owawa and a reading nook." },
  { id: "mall-gadgets", name: "GADGET HUB", row: "north", colour: "#1d3b6a", blurb: "Phones, headphones and game consoles." },
  { id: "mall-style", name: "STYLE STREET", row: "north", colour: "#8c3b5e", blurb: "Jackets, boots and everything for site days." },
  { id: "mall-sports", name: "SPORTS CORNER", row: "north", colour: "#c94a3c", blurb: "Bikes, balls and running shoes." },
  { id: "mall-noodles", name: "NOODLE BAR", row: "south", colour: "#b5553c", blurb: "Hand-pulled noodles for the food court." },
  { id: "mall-pizza", name: "PIZZA SLICE", row: "south", colour: "#d9a441", blurb: "By the slice, all day." },
  { id: "mall-toys", name: "TOY BOX", row: "south", colour: "#2f8f9d", blurb: "Blocks, kites and plush animals." },
  { id: "mall-security", name: "MALL SECURITY", row: "south", colour: "#22262b", blurb: "Lost property and first aid." },
].map((s, i) => {
  const bay = BAYS[i % 4], north = s.row === "north";
  const counterZ = north ? MALL.z0 + 3.2 : MALL.z1 - 3.2;
  return { ...s, row: s.row as MallStore["row"], counter: [mid(bay), counterZ] as V2, spot: [mid(bay), counterZ + (north ? 2.2 : -2.2)] as V2 };
}).concat([
  { id: "mall-market", name: "MARKET HALL", row: "west", colour: "#7d5a4a", blurb: "Groceries, a bakery counter and fresh flowers.", counter: [MALL.x0 + 3.2, 372], spot: [MALL.x0 + 5.4, 372] },
  { id: "mall-home", name: "HOME + GARDEN", row: "east", colour: "#5c6066", blurb: "Paint, tools, plants and patio furniture.", counter: [MALL.x1 - 3.2, 372], spot: [MALL.x1 - 5.4, 372] },
  { id: "mall-desk", name: "MALL INFORMATION", row: "centre", colour: "#c9a54f", blurb: "Directions, lost property and a few jobs that need doing.", counter: [215, 362], spot: [215, 364.6] },
]);

/** Where the lost teddy bear turned up: among the planters in Home + Garden. */
export const LOST_BEAR: V2 = [256, 396.6];

export function inMall(x: number, z: number) {
  return x > MALL.x0 && x < MALL.x1 && z > MALL.z0 && z < MALL.z1;
}

/** Solid parts: walls with their doorways, the roof, counters, shelving and the info desk. */
export function mallBoxes(): Box[] {
  const { x0, x1, z0, z1, h, wall } = MALL;
  const out: Box[] = [];
  const add = (ax0: number, az0: number, ax1: number, az1: number, height: number, id = "mall", y = 0) => out.push({ x0: ax0, z0: az0, x1: ax1, z1: az1, h: height, y, kind: "landmark", id });
  // Outer walls, with the front and back doorways (3.2 m high openings; wall above them).
  add(x0, z0, MALL_DOORS.front[0], z0 + wall, h);
  add(MALL_DOORS.front[1], z0, x1, z0 + wall, h);
  add(MALL_DOORS.front[0], z0, MALL_DOORS.front[1], z0 + wall, h - 3.6, "mall", 3.6);
  add(x0, z1 - wall, MALL_DOORS.back[0], z1, h);
  add(MALL_DOORS.back[1], z1 - wall, x1, z1, h);
  add(MALL_DOORS.back[0], z1 - wall, MALL_DOORS.back[1], z1, h - 3.2, "mall", 3.2);
  add(x0, z0, x0 + wall, z1, h);
  add(x1 - wall, z0, x1, z1, h);
  add(x0, z0, x1, z1, 0.4, "mall-roof", h - 0.4);
  // Anchor walls with their openings.
  for (const x of [ANCHOR_X.west, ANCHOR_X.east]) {
    add(x - wall / 2, z0, x + wall / 2, ANCHOR_GAP[0], MALL.ceiling);
    add(x - wall / 2, ANCHOR_GAP[1], x + wall / 2, z1, MALL.ceiling);
  }
  // Shop partitions and fronts (fronts are glass with an opening in the middle).
  for (const [rowZ, outer] of [[ROW.north, z0], [ROW.south, z1]] as const) {
    const a = Math.min(rowZ, outer), b = Math.max(rowZ, outer);
    for (const x of [196, 209, 221, 234]) add(x - 0.1, a, x + 0.1, b, MALL.ceiling);
    for (const bay of BAYS) {
      const c = mid(bay);
      add(bay[0], rowZ - 0.08, c - OPENING / 2, rowZ + 0.08, MALL.ceiling);
      add(c + OPENING / 2, rowZ - 0.08, bay[1], rowZ + 0.08, MALL.ceiling);
    }
  }
  // Counters and the info desk.
  for (const s of MALL_STORES) {
    const along = s.row === "west" || s.row === "east";
    const w = s.row === "centre" ? 4 : 3;
    add(s.counter[0] - (along ? 0.4 : w / 2), s.counter[1] - (along ? w / 2 : 0.4), s.counter[0] + (along ? 0.4 : w / 2), s.counter[1] + (along ? w / 2 : 0.4), 1.1, "mall-counter");
  }
  // Grocery aisles in Market Hall and shelving in Home + Garden.
  for (const z of [352, 358, 386, 392]) {
    add(168, z - 0.5, 180, z + 0.5, 1.8, "mall-shelf");
    add(250, z - 0.5, 262, z + 0.5, 1.8, "mall-shelf");
  }
  return out;
}
