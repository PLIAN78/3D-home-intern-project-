/**
 * The countryside's shape, shared by the physics (a Rapier heightfield) and the
 * renderer, so what you see is what you drive on. Flat inside the community,
 * rolling hills beyond, with a graded road carved up to Rosa's cottage.
 * Pure functions: no three.js, no React.
 */

import { MEADOW_WAY_Z } from "./meadows";
import { BAY_SHORE, BAY_SLOPE, bayDistance } from "./bay";
import { CAMP_APRON, CAMP_TREES, CAMPGROUND, clearOfWildsFeatures, mountainHeight } from "./wilds";
import { ISLANDS, ISLAND_SHIFT, RIVERSIDE_TREE_SPOTS, onNorthBeach, riverZ, riverWidth, riverDistance, islandRadius, inRiver, inNorthCity, nearV6Development, CAMPUS, AIRPORT, SUBURBS, SUBURB_ROADS, distanceToSegment, V6_BUILDINGS, BRIDGES, BRIDGEHEAD_STUB, NORTH_SHORE_Z, WATER_LEVEL, STATION_ACCESS, onStationAccess, onIslandWalk } from "./v6";

export type P2 = [number, number];

/** Flat community ground ends here (Chebyshev distance from the centre). */
export const FLAT_HALF = 450;
/** The physical terrain (and where you can go) extends this far. */
export const PLAY_HALF = 1000;
/** Heightfield grid spacing (m). */
export const TERRAIN_STEP = 8;

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, z: number) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    s += valueNoise(x * f, z * f) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Natural hills before any roads are cut in. */
export function naturalHeight(x:number,z:number) {
 return smoothstep(390,1050,z)*(1.6+5.2*fbm(x*.0022+4,z*.0022));
}

/** Rosa's cottage on the south-west hills, and where Peanut the elephant wandered off to. */
export const COTTAGE: { position: P2; heading: number } = { position: [-720, 662], heading: Math.PI * 0.25 };
export const ELEPHANT_SPOT: P2 = [-830, 455];

/** Heron Lake in the north-west hills: an ellipse with an island in the middle. */
export const LAKE = { centre: [-690, -650] as P2, rx: 190, rz: 150, island: 28 };
/** Where Lake Road meets the shore, and the jetty out into the water. */
export const DOCK_LAND: P2 = [-556, -529];

/** Owawa: a downtown on a levelled plateau in the north-east hills. */
export const OWAWA = { centre: [690, -760] as P2, half: 175 };

const PROFILE_STEP = 6;
const MAX_GRADE = 0.11;
/** Bridge ramps: gentler than the hill roads. */
export const RAMP_GRADE = 0.1;
/** How far either side of a bridge ramp the embankment blends back into the land. */
const RAMP_SHOULDER = 18;
/** Abutment fill under each deck end (m along the deck): full height to here (past the next
 * terrain grid row), then a 1.5 m face, still well clear of the shipping channel. */
export const ABUTMENT = 10;
/** Level road on the bank at each end of a deck, at deck height. */
const LANDING = 10;

/** A bridge deck a road crosses (centre, length along the road, deck height). */
export interface Deck {
  x: number;
  z: number;
  length: number;
  y: number;
}

/**
 * A two-lane country road out of town: a polyline with a smoothed height
 * profile that never gets steeper than 11 %, flat where it leaves the
 * community. The terrain is graded to it, so it's drivable everywhere.
 */
export class CountryRoad {
  readonly length: number;
  private readonly pts: { x: number; z: number; s: number }[];
  private readonly h: number[];
  /** Stretches of road carried by a bridge deck (s from the start), at the deck's height. */
  readonly decks: { s0: number; s1: number; y: number }[] = [];
  constructor(
    readonly name: string,
    readonly points: P2[],
    readonly width = 7,
    bridges: Deck[] = [],
  ) {
    const pts: { x: number; z: number; s: number }[] = [];
    let s = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(L / PROFILE_STEP));
      for (let k = 0; k < n; k++) pts.push({ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n, s: s + (L * k) / n });
      s += L;
    }
    const last = points[points.length - 1];
    pts.push({ x: last[0], z: last[1], s });
    let h = pts.map((p) => naturalHeight(p.x, p.z));
    for (let pass = 0; pass < 40; pass++) h = h.map((v, i) => (i === 0 ? 0 : i === h.length - 1 ? v : (h[i - 1] + v * 2 + h[i + 1]) / 4));
    // Level where the road leaves town (the community ground is exactly flat).
    pts.forEach((p, i) => {
      if (Math.max(Math.abs(p.x), Math.abs(p.z)) < FLAT_HALF) h[i] = 0;
    });
    for (let i = 1; i < h.length; i++) h[i] = Math.min(h[i], h[i - 1] + MAX_GRADE * PROFILE_STEP);
    for (let i = h.length - 2; i >= 0; i--) h[i] = Math.min(h[i], h[i + 1] + MAX_GRADE * PROFILE_STEP);
    h[0] = 0;
    this.pts = pts;
    this.length = s;
    // Bridges: pin the deck, then lift the road on either side into ramps no steeper than RAMP_GRADE.
    if (bridges.length) {
      for (const b of bridges) {
        const sb = this.nearest(b.x, b.z).s;
        this.decks.push({ s0: sb - b.length / 2, s1: sb + b.length / 2, y: b.y });
      }
      // Each end gets a level landing, shortened where the road ends soon after it (Owawa Road
      // reaches Downtown's plateau 37 m past the north bank) so the ramp still gets back down.
      const land = this.decks.map((d) => ({
        before: Math.max(0, Math.min(LANDING, d.s0 - d.y / RAMP_GRADE - 0.5)),
        after: Math.max(0, Math.min(LANDING, s - d.s1 - d.y / RAMP_GRADE - 0.5)),
      }));
      // Profile points at the exact deck ends and landing ends, so the ramps start precisely there.
      for (const [k, d] of this.decks.entries())
        for (const sEnd of [d.s0 - land[k].before, d.s0, d.s1, d.s1 + land[k].after]) {
          const i = pts.findIndex((p) => p.s > sEnd);
          if (i > 0 && Math.abs(pts[i - 1].s - sEnd) > 0.01 && Math.abs(pts[i].s - sEnd) > 0.01) {
            const at = this.pointAt(sEnd);
            pts.splice(i, 0, { x: at.x, z: at.z, s: sEnd });
            h.splice(i, 0, 0);
          }
        }
      // The deck and a level landing on the bank at each end (longer than the terrain grid
      // step, so the ground meets the deck without a lip), then the ramps.
      const pin = () =>
        pts.forEach((p, i) => {
          const k = this.decks.findIndex((d, j) => p.s >= d.s0 - land[j].before - 1e-6 && p.s <= d.s1 + land[j].after + 1e-6);
          if (k >= 0) h[i] = this.decks[k].y;
        });
      pin();
      for (let i = 1; i < h.length; i++) h[i] = Math.max(h[i], h[i - 1] - RAMP_GRADE * (pts[i].s - pts[i - 1].s));
      for (let i = h.length - 2; i >= 0; i--) h[i] = Math.max(h[i], h[i + 1] - RAMP_GRADE * (pts[i + 1].s - pts[i].s));
      pin();
    }
    this.h = h;
  }

  /** The deck under distance `s` along the road, if it's on a bridge. */
  deckAt(s: number) {
    return this.decks.find((d) => s >= d.s0 && s <= d.s1) ?? null;
  }

  /** Height at the far end (where the road arrives). */
  get endHeight() {
    return this.h[this.h.length - 1];
  }

  /** Nearest point on the road: distance from its centre line, and how far along it is (m). */
  nearest(x: number, z: number) {
    let best = { d: Infinity, s: 0 };
    let s0 = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      const [ax, az] = this.points[i];
      const [bx, bz] = this.points[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const L2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best.d) best = { d, s: s0 + Math.sqrt(L2) * t };
      s0 += Math.sqrt(L2);
    }
    return best;
  }

  /** Road surface height at distance `s` along it. */
  heightAt(s: number) {
    // Profile points are about PROFILE_STEP apart (plus any deck ends): find the pair around s.
    let i = Math.min(this.h.length - 2, Math.max(0, Math.floor(s / PROFILE_STEP)));
    while (i > 0 && this.pts[i].s > s) i--;
    while (i < this.h.length - 2 && this.pts[i + 1].s < s) i++;
    const a = this.pts[i];
    const b = this.pts[i + 1];
    const t = Math.min(1, Math.max(0, (s - a.s) / Math.max(1e-6, b.s - a.s)));
    return this.h[i] + (this.h[i + 1] - this.h[i]) * t;
  }

  /** A point along the road, with its direction. */
  pointAt(s: number): { x: number; z: number; heading: number } {
    let s0 = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      const [ax, az] = this.points[i];
      const [bx, bz] = this.points[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (s <= s0 + L || i === this.points.length - 2) {
        const t = Math.min(1, Math.max(0, (s - s0) / L));
        return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bz - az, bx - ax) };
      }
      s0 += L;
    }
    return { x: this.points[0][0], z: this.points[0][1], heading: 0 };
  }
}

/** Cottage Road: from the west end of Market Street up into the hills. */
export const COTTAGE_ROAD = new CountryRoad("Cottage Road", [
  [-230, 300],
  [-300, 342],
  [-382, 392],
  [-470, 446],
  [-552, 510],
  [-612, 566],
  [-664, 616],
  [COTTAGE.position[0] + 18, COTTAGE.position[1] - 14],
]);
/** Lake Road: past the goat farm, north-west to the dock on Heron Lake. */
export const LAKE_ROAD = new CountryRoad("Lake Road", [
  [-300, -112],
  [-304, -230],
  [-350, -330],
  [-420, -410],
  [-490, -470],
  DOCK_LAND,
]);
/** Owawa Road: from the east end of Caivan Boulevard, over the east bridge, into downtown. */
export const OWAWA_ROAD = new CountryRoad("Owawa Road", [
  [430, 0],
  [480, -60],
  [560, -190],
  [630, -320],
  [690, -430],
  [690, OWAWA.centre[1] + OWAWA.half],
], 9, [BRIDGES[2]]);
/** Heron Bridge Road: on from Ridge West's river street, across Lake Road, over the west bridge to the north shore. */
export const HERON_BRIDGE_ROAD = new CountryRoad("Heron Bridge Road", [
  [BRIDGES[0].x, -390],
  [BRIDGES[0].x, NORTH_SHORE_Z(BRIDGES[0].x) + BRIDGEHEAD_STUB],
], 9, [BRIDGES[0]]);
/** Quarry Bridge: Quarry Lane carries on from North Meadows over the centre bridge. */
export const QUARRY_BRIDGE_ROAD = new CountryRoad("Quarry Bridge", [
  [BRIDGES[1].x, MEADOW_WAY_Z - BRIDGEHEAD_STUB],
  [BRIDGES[1].x, NORTH_SHORE_Z(BRIDGES[1].x) + BRIDGEHEAD_STUB],
], 9, [BRIDGES[1]]);

export const COUNTRY_ROADS = [COTTAGE_ROAD, LAKE_ROAD, OWAWA_ROAD, HERON_BRIDGE_ROAD, QUARRY_BRIDGE_ROAD];
/** The country roads that cross the river. */
export const BRIDGE_ROADS = [HERON_BRIDGE_ROAD, QUARRY_BRIDGE_ROAD, OWAWA_ROAD];

// Older names for Cottage Road, used around the code.
export const HILL_ROAD = COTTAGE_ROAD.points;
export const HILL_ROAD_WIDTH = COTTAGE_ROAD.width;
export const HILL_ROAD_LENGTH = COTTAGE_ROAD.length;
export const nearestOnRoad = (x: number, z: number) => COTTAGE_ROAD.nearest(x, z);
export const roadHeightAt = (s: number) => COTTAGE_ROAD.heightAt(s);
export const roadPointAt = (s: number) => COTTAGE_ROAD.pointAt(s);

/** The nearest country road to a point, and how far it is. */
export function nearestCountryRoad(x: number, z: number) {
  let best = { road: COTTAGE_ROAD, d: Infinity, s: 0 };
  for (const road of COUNTRY_ROADS) {
    const n = road.nearest(x, z);
    if (n.d < best.d) best = { road, ...n };
  }
  return best;
}

const COTTAGE_PAD = 26;
const cottageHeight = COTTAGE_ROAD.endHeight;
export const COTTAGE_Y = cottageHeight;
/** Lake surface: a little below where Lake Road reaches the shore. */
export const LAKE_Y = WATER_LEVEL;
/** Owawa's ground level: where Owawa Road arrives. */
export const CITY_Y = 0;

/** 0 at the lake's centre, 1 on the shoreline. */
export function lakeRadius(x: number, z: number) {
  return Math.hypot((x - LAKE.centre[0]) / LAKE.rx, (z - LAKE.centre[1]) / LAKE.rz);
}

export function inLake(x: number, z: number) {
  return islandRadius(x,z)>1.18 && (inRiver(x,z) || lakeRadius(x,z)<1 || bayDistance(x,z)>0);
}

/** Ground height anywhere: hills, with the lake, the city, the cottage yard and the roads worked in. */
/** Station forecourts are levelled to the ground at their centre; the terrain eases back over this distance. */
const FORECOURT_APRON = 10;
let forecourtLevels: number[] | null = null;
export function terrainHeight(x:number,z:number) {
 let h=shapedHeight(x,z);
 for(let i=0;i<STATION_ACCESS.length;i++){
  const r=STATION_ACCESS[i].forecourt,d=Math.hypot(Math.max(r.x0-x,0,x-r.x1),Math.max(r.z0-z,0,z-r.z1));
  if(d>=FORECOURT_APRON)continue;
  forecourtLevels??=STATION_ACCESS.map(a=>shapedHeight((a.forecourt.x0+a.forecourt.x1)/2,(a.forecourt.z0+a.forecourt.z1)/2));
  h+=(forecourtLevels[i]-h)*smoothstep(FORECOURT_APRON,0,d);
 }
 return h;
}
/** Pine Hollow Campground's level (the hills' height at its centre). */
let campLevel: number | null = null;
function shapedHeight(x:number,z:number) {
 // Mount Tamarack rises out of the south-west woods; the campground is levelled into the slope.
 let h=naturalHeight(x,z)+mountainHeight(x,z);
 const dcamp=Math.hypot(x-CAMPGROUND.at[0],z-CAMPGROUND.at[1]);
 if(dcamp<CAMPGROUND.radius+CAMP_APRON){campLevel??=naturalHeight(...CAMPGROUND.at)+mountainHeight(...CAMPGROUND.at);h+=(campLevel-h)*smoothstep(CAMPGROUND.radius+CAMP_APRON,CAMPGROUND.radius,dcamp);}
 const outside=(r:{x0:number;z0:number;x1:number;z1:number})=>Math.hypot(Math.max(r.x0-x,0,x-r.x1),Math.max(r.z0-z,0,z-r.z1));
 for(const r of [CAMPUS,AIRPORT,...SUBURBS])h*=smoothstep(0,65,outside(r));
 const road=nearestCountryRoad(x,z);
 if(road.d<40&&!road.road.deckAt(road.s))h+=(road.road.heightAt(road.s)-h)*smoothstep(40,road.road.width/2+2,road.d);
 for(const rd of SUBURB_ROADS){const d=distanceToSegment(x,z,rd.from,rd.to);if(d<45)h*=smoothstep(rd.width/2+rd.sidewalkWidth+rd.boulevardWidth,45,d);}
 const dc=Math.hypot(x-COTTAGE.position[0],z-COTTAGE.position[1]);
 if(dc<60)h+=(cottageHeight-h)*smoothstep(60,COTTAGE_PAD,dc);
 const e=lakeRadius(x,z);
 if(e<1)h=Math.min(h,LAKE_Y-4*smoothstep(1,.78,e));
 else if(e<1.2)h=Math.min(h,LAKE_Y+(Math.max(0,h)-LAKE_Y)*smoothstep(1,1.2,e));
 // Heron Bay, south-west of the lake.
 const bd=bayDistance(x,z);
 if(bd>0)h=Math.min(h,LAKE_Y-4*smoothstep(0,BAY_SLOPE,bd));
 else if(bd>-BAY_SHORE)h=Math.min(h,LAKE_Y+(Math.max(0,h)-LAKE_Y)*smoothstep(0,BAY_SHORE,-bd));
 const r=riverDistance(x,z)/(riverWidth(x)/2);
 if(r<1)h=Math.min(h,LAKE_Y-4*smoothstep(1,.62,r));
 else if(r<1.5)h=Math.min(h,LAKE_Y+(Math.max(0,h)-LAKE_Y)*smoothstep(1,1.5,r));
 const island=islandRadius(x,z);
 if(island<1.18)h=Math.max(h,LAKE_Y+2.5*smoothstep(1.18,.82,island));
 // Bridge ramps and abutments: built up after the river is cut, so the bank doesn't eat
 // the embankment. Each deck end sits on an abutment fill reaching just under the deck,
 // so the ramp runs straight onto the deck with no slot and the bank meets the bridge;
 // between the abutments the river stays open.
 for(const road of BRIDGE_ROADS){
  const n=road.nearest(x,z);
  if(n.d>=RAMP_SHOULDER)continue;
  const deck=road.deckAt(n.s);
  if(!deck){h+=(road.heightAt(n.s)-h)*smoothstep(RAMP_SHOULDER,road.width/2+2,n.d);continue;}
  const into=Math.min(n.s-deck.s0,deck.s1-n.s);
  if(into>=ABUTMENT+1.5)continue;
  const w=smoothstep(road.width/2+7,road.width/2+2,n.d)*smoothstep(ABUTMENT+1.5,ABUTMENT,into);
  h=Math.max(h,h+(deck.y-.1-h)*w);
 }
 return h;
}

/** Clearing in the woods where Peanut is grazing. */
const CLEARING = 26;

/**
 * Wild woodland on the hills inside the playable area: real trees (the same
 * kinds as in town, breakable like them), in bands rather than everywhere,
 * kept off the road and out of the cottage yard and Peanut's clearing.
 */
export const HILL_TREES: {position:P2;y:number;scale:number;variant:0|1|2}[]=(()=>{
 const out:{position:P2;y:number;scale:number;variant:0|1|2}[]=[];
 // The green north bank's two rows (v6.ts), on dry ground only.
 RIVERSIDE_TREE_SPOTS.forEach(([x,z],i)=>{const y=terrainHeight(x,z);if(y>LAKE_Y+0.5)out.push({position:[x,z],y,scale:.9+((i*37)%10)/20,variant:i%4===3?1:0});});
 const rand=(i:number)=>hash(i*1.37+.5,i*2.71+.25);
 const add=(x:number,z:number,i:number)=>{
  if(nearestCountryRoad(x,z).d<15 || SUBURB_ROADS.some(r=>distanceToSegment(x,z,r.from,r.to)<14))return;
  if(lakeRadius(x,z)<1.25 || inRiver(x,z) || bayDistance(x,z)>-BAY_SHORE-4 || inNorthCity(x,z,20) || nearV6Development(x,z,12) || onStationAccess(x,z,3) || onNorthBeach(x,z))return;
  // The riverside rows have the north bank's trees already.
  if(z<riverZ(x) && out.some(t=>Math.hypot(t.position[0]-x,t.position[1]-z)<7))return;
  if(Math.hypot(x-COTTAGE.position[0],z-COTTAGE.position[1])<38 || Math.hypot(x-ELEPHANT_SPOT[0],z-ELEPHANT_SPOT[1])<CLEARING)return;
  // The campground, its trail, the creeks, the marked woodlot and Mount Tamarack's bare summit.
  if(x<-400&&z>400&&!clearOfWildsFeatures(x,z,0))return;
  if(V6_BUILDINGS.some(b=>Math.abs(x-b.at[0])<b.size[0]/2+7&&Math.abs(z-b.at[1])<b.size[1]/2+7))return;
  out.push({position:[x,z],y:terrainHeight(x,z),scale:.85+rand(i+70000)*.9,variant:rand(i+80000)<.62?1:rand(i+90000)<.6?0:2});
 };
 let i=0;
 for(let x=-965;x<-425;x+=14)for(let z=420;z<970;z+=14){i++;const px=x+(rand(i)-.5)*7,pz=z+(rand(i+2000)-.5)*7;if(fbm(px*.004+11,pz*.004+7)>.32)add(px,pz,i);}
 for(let n=0;out.length<2400&&n<25000;n++){const x=(rand(n+10000)*2-1)*980,z=(rand(n+40000)*2-1)*980;
  if(Math.max(Math.abs(x),Math.abs(z))<FLAT_HALF+15 || (x<-425&&z>420) || fbm(x*.004+7,z*.004)<.43)continue;
  add(x,z,n+100000);
 }
 const [ix,iz]=ISLANDS[0].at;
 for(let n=0;n<14;n++){const angle=n*2.4,x=ix+Math.cos(angle)*85,z=iz+Math.sin(angle)*36;
  if(onIslandWalk(x,z,2))continue;
  if(V6_BUILDINGS.some(b=>Math.abs(x-b.at[0])<b.size[0]/2+5&&Math.abs(z-b.at[1])<b.size[1]/2+5)||Math.hypot(x-(-697+ISLAND_SHIFT[0]),z-(-656+ISLAND_SHIFT[1]))<8)continue;
  out.push({position:[x,z],y:terrainHeight(x,z),scale:.85+(n%4)*.13,variant:n%3===0?0:1});
 }
 return out;
})();

/** The firewood trees in the woodlot by the campground (breakable like the rest; wilds.ts). */
export const CAMP_WOODLOT: {position:P2;y:number;scale:number;variant:0|1|2}[]=CAMP_TREES.map(([x,z],i)=>({position:[x,z],y:terrainHeight(x,z),scale:1+(i%3)*.12,variant:i%3===1?1:0}));

/**
 * Height of the drawn (and physical) ground at any point: the terrain grid's
 * triangles interpolated exactly as they are meshed, so things placed with it
 * sit on the surface rather than floating or sinking between grid points.
 */
export function groundAt(x: number, z: number) {
  const fx = (x + PLAY_HALF) / TERRAIN_STEP;
  const fz = (z + PLAY_HALF) / TERRAIN_STEP;
  const c = Math.floor(fx);
  const r = Math.floor(fz);
  const u = fx - c;
  const v = fz - r;
  const X = (k: number) => -PLAY_HALF + k * TERRAIN_STEP;
  const Z = (k: number) => -PLAY_HALF + k * TERRAIN_STEP;
  const ha = terrainHeight(X(c), Z(r));
  const hb = terrainHeight(X(c + 1), Z(r));
  const hd = terrainHeight(X(c), Z(r + 1));
  const he = terrainHeight(X(c + 1), Z(r + 1));
  return u + v <= 1 ? ha + (hb - ha) * u + (hd - ha) * v : he + (hd - he) * (1 - u) + (hb - he) * (1 - v);
}

/**
 * What a road ribbon drapes on: the bridge deck where a road is carried over
 * the river, otherwise the drawn ground (so it matches the terrain triangles).
 */
export function roadSurfaceAt(x:number,z:number){
 for(const road of BRIDGE_ROADS){
  const n=road.nearest(x,z),d=road.deckAt(n.s);
  if(d&&n.d<road.width/2+2.5)return d.y;
 }
 return groundAt(x,z);
}
