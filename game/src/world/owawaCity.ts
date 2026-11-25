import type { Point, V6Building, V6Road } from "./v6";

/**
 * Owawa: the whole north shore is one city now. West of Downtown (the old
 * Owawa grid, x ≥ 540) a regular grid of streets runs from the riverfront up
 * to the north edge, with high-rise blocks that get taller toward Downtown:
 * glass office towers, condo towers, mid-rise offices and a few heritage
 * low-rises. Businesses and agencies you can walk into line Rideau Avenue.
 *
 * Built by a function (not at import time) because it needs the shoreline
 * from v6.ts, which imports this module.
 */
const dims = { width: 9, sidewalkWidth: 2, boulevardWidth: 2 };
export const CITY_RESERVE = dims.width / 2 + dims.boulevardWidth + dims.sidewalkWidth;
const rd = (id: string, from: Point, to: Point): V6Road => ({ id, from, to, ...dims });

/** North–south streets (the two bridge streets at −480 and 110 among them) and the avenues, which line up with Downtown's. */
export const CITY_STREETS_X = [-880, -780, -680, -580, -480, -375, -290, -215, -120, -25, 110, 210, 310, 420, 520];
export const CITY_AVENUES_Z = [-920, -840, -760, -680];
export const CITY_STREET_NAMES: Record<string, string> = { "-920": "Bloor Street", "-840": "Wellington Avenue West", "-760": "Rideau Avenue West", "-680": "Queen Street West" };
/** Where Downtown's paving starts (owawa.ts CITY_PAVING.x0). */
export const DOWNTOWN_X0 = 540;
const NORTH_EDGE = -935;

export interface CityBlockBuilding extends V6Building {
  /** "tower" glass, "condo" residential, "office" mid-rise, "lowrise" heritage or shops. */
  style: "tower" | "condo" | "office" | "lowrise";
}

export interface Business {
  id: string;
  name: string;
  /** What it is, shown above the name. */
  eyebrow: string;
  blurb: string;
  /** The door (on the street side) and the way it faces. */
  door: Point;
  facing: Point;
  services: Service[];
  colour: string;
}
export type Service =
  | { kind: "meal"; label: string; kitchen: "subs" | "burger" | "shawarma" }
  | { kind: "travel"; label: string; price: number }
  | { kind: "invest"; label: string; price: number; income: number }
  | { kind: "gig"; label: string; gig: string }
  | { kind: "buy"; label: string; price: number; toast: string };

const hash = (n: number) => { const s = Math.sin(n * 91.345 + 7.13) * 43758.5453; return s - Math.floor(s); };

export function buildNorthCity(shore: (x: number) => number, avoid: { at: Point; size: [number, number, number] }[]) {
  const roads: V6Road[] = [];
  const fits = (z: number, x: number) => z <= shore(x) - 30;
  for (const x of CITY_STREETS_X) roads.push(rd("owawa-st-" + x, [x, NORTH_EDGE + 15], [x, shore(x)]));
  for (const z of CITY_AVENUES_Z) {
    for (let i = 0; i < CITY_STREETS_X.length - 1; i++) {
      const xa = CITY_STREETS_X[i], xb = CITY_STREETS_X[i + 1];
      if (fits(z, xa) && fits(z, xb)) roads.push(rd(`owawa-av${z}-${xa}`, [xa, z], [xb, z]));
    }
    // The last block runs on into Downtown's avenue of the same line.
    const last = CITY_STREETS_X.at(-1)!;
    if (z !== -920 && fits(z, last)) roads.push(rd(`owawa-av${z}-${last}`, [last, z], [DOWNTOWN_X0, z]));
  }

  const buildings: CityBlockBuilding[] = [];
  const roadGap = (x0: number, z0: number, x1: number, z1: number) => Math.min(...roads.map((r) => {
    const [a, b] = [r.from, r.to];
    if (a[0] === b[0]) {
      const lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]);
      const along = Math.max(lo - z1, z0 - hi, 0), across = Math.max(x0 - a[0], a[0] - x1, 0);
      return Math.hypot(along, across) - CITY_RESERVE;
    }
    const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
    const along = Math.max(lo - x1, x0 - hi, 0), across = Math.max(z0 - a[1], a[1] - z1, 0);
    return Math.hypot(along, across) - CITY_RESERVE;
  }));
  const free = (x0: number, z0: number, x1: number, z1: number) =>
    roadGap(x0, z0, x1, z1) > 2.5 && z1 < shore((x0 + x1) / 2) - CITY_RESERVE - 4 && z1 < shore(x0) - CITY_RESERVE - 4 && z1 < shore(x1) - CITY_RESERVE - 4 && x0 > -960 && z0 > NORTH_EDGE - 15 &&
    buildings.every((o) => x1 + 3 <= o.at[0] - o.size[0] / 2 || x0 - 3 >= o.at[0] + o.size[0] / 2 || z1 + 3 <= o.at[1] - o.size[1] / 2 || z0 - 3 >= o.at[1] + o.size[1] / 2) &&
    avoid.every((o) => x1 + 6 <= o.at[0] - o.size[0] / 2 || x0 - 6 >= o.at[0] + o.size[0] / 2 || z1 + 6 <= o.at[1] - o.size[1] / 2 || z0 - 6 >= o.at[1] + o.size[1] / 2);

  let n = 0;
  const place = (x0: number, x1: number, zEdge: number, dir: 1 | -1) => {
    // A row of buildings along a street edge, fronting it (dir +1 = building lies south of the edge).
    let x = x0;
    while (x < x1 - 14) {
      const k = n * 7 + Math.round(x);
      const w = Math.min(x1 - x, 18 + Math.floor(hash(k) * 14)), d = 18 + Math.floor(hash(k + 1) * 8);
      const z0 = dir > 0 ? zEdge : zEdge - d, z1 = dir > 0 ? zEdge + d : zEdge;
      const cx = x + w / 2, cz = (z0 + z1) / 2;
      if (w >= 14 && free(x, z0, x + w, z1)) {
        // Taller toward Downtown and in the middle rows.
        const east = Math.min(1, Math.max(0, (cx + 900) / 1420)), r = hash(k + 2), t = hash(k + 3);
        const style: CityBlockBuilding["style"] = r < 0.42 ? "tower" : r < 0.74 ? "condo" : r < 0.9 ? "office" : "lowrise";
        const h = style === "tower" ? 55 + (50 + 130 * east) * t : style === "condo" ? 32 + (25 + 45 * east) * t : style === "office" ? 18 + 26 * t : 9 + 7 * t;
        const names = { tower: ["RIVERGATE TOWER", "OWAWA TRUST", "MAPLE CENTRE", "HARBOUR PLACE", "CAPITAL SQUARE", "NORTHERN LIFE"], condo: ["SKYLINE CONDOS", "THE MERIDIAN", "PARK RESIDENCES", "LUMINA", "THE RIDEAU", "AURORA"], office: ["CIVIC OFFICES", "TECH HUB", "MEDICAL ARTS", "LAW CHAMBERS"], lowrise: ["HERITAGE BLOCK", "CORNER SHOPS", "MARKET HALL"] }[style];
        buildings.push({ id: "owawa-" + n, name: names[n % names.length], at: [cx, cz], size: [w, d, Math.round(h)], kind: style === "tower" ? "tower" : style === "condo" ? "condo" : style === "lowrise" ? "historic" : "campus", tone: n % 4, level: "city", style });
        n++;
      }
      x += w + 4;
    }
  };
  for (let i = 0; i < CITY_STREETS_X.length - 1; i++) {
    const x0 = CITY_STREETS_X[i] + CITY_RESERVE + 3, x1 = CITY_STREETS_X[i + 1] - CITY_RESERVE - 3;
    for (const z of [NORTH_EDGE + 15, ...CITY_AVENUES_Z]) {
      // Buildings on both sides of every avenue (the northernmost only on its south side).
      place(x0, x1, z + CITY_RESERVE + 3, 1);
      if (z !== NORTH_EDGE + 15) place(x0, x1, z - CITY_RESERVE - 3, -1);
    }
    // And a row facing the river along the riverfront.
    const sz = Math.min(shore(x0), shore(x1), shore((x0 + x1) / 2));
    place(x0, x1, sz - CITY_RESERVE - 4.5, -1);
  }
  return { roads, buildings };
}

/**
 * Businesses and agencies along Rideau Avenue West you can walk into. Each
 * takes the ground floor of the building on its spot (see `businessSpots`).
 */
export const BUSINESS_DEFS: Omit<Business, "door" | "facing">[] = [
  { id: "police", name: "OWAWA POLICE · DIVISION 1", eyebrow: "POLICE SERVICE", colour: "#203a63", blurb: "The front desk takes reports and hands out community tasks.", services: [{ kind: "gig", label: "Take a community patrol task", gig: "patrol" }, { kind: "buy", label: "Buy a bike lock · $15", price: 15, toast: "A sturdy bike lock. Owawa thanks you." }] },
  { id: "travel", name: "MAPLE TRAVEL AGENCY", eyebrow: "TRAVEL AGENCY", colour: "#2f8f9d", blurb: "Express tickets anywhere on the Owawa Express loop, delivered to the platform.", services: [{ kind: "travel", label: "Express ticket to any station", price: 20 }] },
  { id: "realty", name: "OWAWA REALTY", eyebrow: "REAL ESTATE AGENCY", colour: "#8c1d18", blurb: "Buy into a rental unit downtown: the agency manages it and sends you the rent.", services: [{ kind: "invest", label: "Buy a rental unit · $6,000", price: 6000, income: 140 }] },
  { id: "jobs", name: "OWAWA JOB CENTRE", eyebrow: "EMPLOYMENT AGENCY", colour: "#4b5258", blurb: "Quick paid errands across town.", services: [{ kind: "gig", label: "Courier: documents to Owawa Realty", gig: "courier-realty" }, { kind: "gig", label: "Courier: a parcel to the mall info desk", gig: "courier-mall" }] },
  { id: "bakery", name: "RIVER BAKERY · CAFE", eyebrow: "BAKERY", colour: "#a9733f", blurb: "Fresh bread, coffee and pastries.", services: [{ kind: "meal", label: "Coffee and a pastry", kitchen: "subs" }] },
  { id: "pharmacy", name: "NORTHSIDE PHARMACY", eyebrow: "PHARMACY", colour: "#2e5a3b", blurb: "Prescriptions, snacks and first aid.", services: [{ kind: "buy", label: "First-aid kit · $25", price: 25, toast: "First-aid kit packed." }, { kind: "meal", label: "Energy drink", kitchen: "burger" }] },
  { id: "insurance", name: "NORTHSTAR INSURANCE", eyebrow: "INSURANCE AGENCY", colour: "#1d3b6a", blurb: "Home and vehicle cover for Caivan owners.", services: [{ kind: "invest", label: "Home policy (pays dividends) · $2,500", price: 2500, income: 45 }] },
  { id: "diner", name: "QUEEN STREET DINER", eyebrow: "RESTAURANT", colour: "#c9a54f", blurb: "Burgers, fries and shakes.", services: [{ kind: "meal", label: "Burger combo", kitchen: "burger" }, { kind: "meal", label: "Shawarma wrap", kitchen: "shawarma" }] },
];

/** Pick the building for each business: one fronting Rideau Avenue West on its north side, spread along the avenue. */
export function businessSpots(buildings: CityBlockBuilding[]): Business[] {
  const front = buildings.filter((b) => Math.abs(b.at[1] - b.size[1] / 2 - (-760 + CITY_RESERVE + 3)) < 0.5).sort((a, b) => a.at[0] - b.at[0]);
  const step = front.length / BUSINESS_DEFS.length;
  return BUSINESS_DEFS.map((def, i) => {
    const b = front[Math.min(front.length - 1, Math.floor(i * step + step / 2))];
    b.style = "lowrise";
    b.kind = "shop";
    b.size[2] = Math.min(b.size[2], 14);
    b.name = def.name;
    return { ...def, door: [b.at[0], b.at[1] - b.size[1] / 2 - 1.5] as Point, facing: [0, -1] as Point };
  });
}

/** Traffic and sidewalk loops on the new grid: around long blocks between avenues. */
export function cityLoops(roads: V6Road[]) {
  const has = (id: string) => roads.some((r) => r.id === id);
  const loops: Point[][] = [];
  const pairs: [number, number][] = [[-480, -215], [-215, 110], [110, 420]];
  for (const [xa, xb] of pairs) for (let k = 0; k < CITY_AVENUES_Z.length - 1; k++) {
    const za = CITY_AVENUES_Z[k], zb = CITY_AVENUES_Z[k + 1];
    const ok = CITY_STREETS_X.filter((x) => x >= xa && x < xb).every((x) => { const nx = CITY_STREETS_X[CITY_STREETS_X.indexOf(x) + 1]; return has(`owawa-av${za}-${x}`) && has(`owawa-av${zb}-${x}`) && nx !== undefined; });
    if (ok) loops.push([[xa, za], [xb, za], [xb, zb], [xa, zb]]);
  }
  return loops;
}
