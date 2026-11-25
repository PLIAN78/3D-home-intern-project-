/**
 * Support columns for the elevated Owawa Express, placed clear of every road
 * carriageway, station forecourt, footpath and building. Columns are spaced
 * about every 75 m along the track (plus one at each end of every platform)
 * and slide along the track, up to 30 m, to the nearest clear spot.
 *
 * Imports map.ts, which reaches this module again through v6Geometry, so
 * nothing here runs at import time: the columns are worked out on first use.
 */
import { CAIVAN_RIDGE, LANDMARKS } from "./map";
import { OWAWA_ROADS } from "./owawa";
import { COUNTRY_ROADS, terrainHeight } from "./terrain";
import { JETTIES } from "./lake";
import {
  NORTH_ROADS, RAIL_LENGTH, RAIL_PATH, RAIL_Y, STATION_DISTANCES, STATION_PLATFORM, V6_BUILDINGS,
  distanceToSegment, onStationAccess, pathPoint, type Point,
} from "./v6";

export const RAIL_POST_SIZE = 1.2;
const SPACING = 75;
const MAX_SLIDE = 30;

/** Distance from a point to the nearest road carriageway edge (negative on the carriageway). */
export function carriagewayClearance(x: number, z: number) {
  let d = Infinity;
  for (const r of [...CAIVAN_RIDGE.roads, ...NORTH_ROADS, ...OWAWA_ROADS]) d = Math.min(d, distanceToSegment(x, z, r.from as Point, r.to as Point) - r.width / 2);
  for (const r of COUNTRY_ROADS) d = Math.min(d, r.nearest(x, z).d - r.width / 2);
  return d;
}

function onLot(x: number, z: number, pad: number) {
  return CAIVAN_RIDGE.lots.some((l) => {
    const r = l.rotation[1], dx = x - l.position[0], dz = z - l.position[2];
    const u = dx * Math.cos(r) - dz * Math.sin(r), v = dx * Math.sin(r) + dz * Math.cos(r);
    return Math.abs(u) < l.width / 2 + pad && Math.abs(v) < l.depth / 2 + pad;
  });
}

function inBuilding(x: number, z: number, pad: number) {
  const hit = (cx: number, cz: number, w: number, d: number) => Math.abs(x - cx) < w / 2 + pad && Math.abs(z - cz) < d / 2 + pad;
  return V6_BUILDINGS.some((b) => hit(b.at[0], b.at[1], b.size[0], b.size[1])) ||
    Object.values(LANDMARKS).some((l) => l.size[2] > 0 && hit(l.position[0], l.position[1], l.size[0], l.size[1])) ||
    JETTIES.some((j) => x > j.x0 - pad && x < j.x1 + pad && z > j.z0 - pad && z < j.z1 + pad);
}

/** Is this a good place for a column? Shoulders and sidewalks count as road. */
export function railPostClear(x: number, z: number, avoidLots = true) {
  const half = RAIL_POST_SIZE / 2;
  return carriagewayClearance(x, z) > half + 2.5 && !onStationAccess(x, z, half + 0.5) && !inBuilding(x, z, half + 1) && (!avoidLots || !onLot(x, z, half));
}

export interface RailPost { x: number; z: number; ground: number; height: number }
let posts: RailPost[] | null = null;

export function railPosts(): RailPost[] {
  if (posts) return posts;
  const wanted: number[] = [];
  for (let s = 0; s < RAIL_LENGTH; s += SPACING) wanted.push(s);
  for (const s of STATION_DISTANCES) wanted.push(s - STATION_PLATFORM.length / 2 + 6, s + STATION_PLATFORM.length / 2 - 6);
  const out: RailPost[] = [];
  const place = (s: number, avoidLots: boolean) => {
    for (let k = 0; k <= MAX_SLIDE; k += 1.5) for (const sign of k ? [1, -1] : [1]) {
      const p = pathPoint(RAIL_PATH, s + sign * k, true);
      if (!railPostClear(p.x, p.z, avoidLots)) continue;
      const ground = terrainHeight(p.x, p.z), height = RAIL_Y - 1 - ground;
      if (height < 1) return true;
      if (out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 12)) return true;
      out.push({ x: p.x, z: p.z, ground, height });
      return true;
    }
    return false;
  };
  for (const s of wanted) if (!place(s, true)) place(s, false);
  posts = out;
  return out;
}
