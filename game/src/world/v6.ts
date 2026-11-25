/** V6 world contract. All coordinates are metres; +z is south. Runtime imports: pure data only (meadows.ts). */
import { MEADOW_BUILDINGS, MEADOW_ROADS } from "./meadows";
import { buildNorthCity, businessSpots, cityLoops } from "./owawaCity";
import { CAMPUS_BUILDINGS, CAMPUS_LOOPS, CAMPUS_ROADS, CAMPUS_TREE_SPOTS, CAMPUS_WALKWAYS } from "./campus";
export type Point = [number, number];
export const V6_VERSION = "6.4.0";
/** Water surface of Heron Lake and the Owawa River (terrain.ts LAKE_Y). */
export const WATER_LEVEL = -1.4;
export const riverZ = (x: number) => -555 + x * 0.07 + 24 * Math.sin(x / 240);
export const riverWidth = (x: number) => 100 + 14 * Math.cos(x / 190);
/**
 * Heron Gardens Island stands in the open water where Heron Lake meets Heron
 * Bay, halfway between the north and south shores (about 135 m of water each
 * way; v6.5: it used to be at [-650, -655], close under the north shore). Everything on it is laid out relative to where it
 * was, and moved by ISLAND_SHIFT.
 */
export const ISLAND_AT: Point = [-770, -580];
export const ISLAND_SHIFT: Point = [ISLAND_AT[0] + 650, ISLAND_AT[1] + 655];
const shift = (p: Point): Point => [p[0] + ISLAND_SHIFT[0], p[1] + ISLAND_SHIFT[1]];
export const ISLANDS = [
 {name:"Heron Gardens Island",at:ISLAND_AT,rx:100,rz:55,developed:true},
];
export function islandRadius(x: number, z: number) {
  return Math.min(...ISLANDS.map(i => Math.hypot((x-i.at[0])/i.rx, (z-i.at[1])/i.rz)));
}
export function riverDistance(x: number, z: number) { return Math.abs(z-riverZ(x)); }
export function inRiver(x: number, z: number) { return Math.abs(x)<1100 && riverDistance(x,z)<riverWidth(x)/2 && islandRadius(x,z)>1; }
export const NORTH_SHORE_Z = (x: number) => {
 const river=riverZ(x)-riverWidth(x)/2-48;
 const u=(x+690)/190;
 return Math.abs(u)<1.15?Math.min(river,-650-150*Math.sqrt(Math.max(0,1-Math.min(1,u*u)))-35):river;
};
export function inNorthCity(x: number,z:number,pad=0) {
  return x>-950-pad && x<955+pad && z>-945-pad && z<NORTH_SHORE_Z(x)+pad;
}
export const CAMPUS = { x0:495,z0:505,x1:965,z1:1000 };
export const AIRPORT = { x0:-940,z0:-310,x1:-635,z1:270 };
export const SUBURBS = [
 {x0:-600,z0:-260,x1:-455,z1:370},
 {x0:455,z0:20,x1:900,z1:380},
 {x0:-320,z0:470,x1:380,z1:655},
];
/**
 * Road bridges over the Owawa River: the west one carries Heron Bridge Road
 * (Lake Road to the north shore), the centre one carries Quarry Lane over
 * from North Meadows, the east one carries Owawa Road into downtown. Decks
 * end 4 m past each bank and sit 4 m above the water, so boats and jet skis
 * pass under and the ramps stay short and gentle.
 */
export const BRIDGE_CLEARANCE = 4;
export const BRIDGES = ([-480, 110, 690] as const).map((x, i) => ({ x, z: riverZ(x), width: i === 2 ? 14 : 11, length: riverWidth(x) + 8, y: WATER_LEVEL + BRIDGE_CLEARANCE }));
export function inRect(x:number,z:number,r:{x0:number;z0:number;x1:number;z1:number},p=0) { return x>r.x0-p&&x<r.x1+p&&z>r.z0-p&&z<r.z1+p; }
export const nearV6Development = (x:number,z:number,pad=0) => inRect(x,z,CAMPUS,pad)||inRect(x,z,AIRPORT,pad)||SUBURBS.some(r=>inRect(x,z,r,pad));
export interface V6Building {
 id:string; name:string; at:Point; size:[number,number,number];
 kind:"condo"|"shop"|"campus"|"historic"|"terminal"|"gym"|"tower";
 tone:number; level:"ground"|"city"|"island";
 /** Campus buildings: rotated wings (the box above covers them all) and the door, just outside. */
 wings?:{c:Point;w:number;d:number;h:number;rot:number}[]; door?:Point;
}
export interface V6Road { id:string; from:Point; to:Point; width:number; sidewalkWidth:number; boulevardWidth:number }
const dims={width:9,sidewalkWidth:2,boulevardWidth:2};
const rd=(id:string,from:Point,to:Point):V6Road=>({id,from,to,...dims});
export const SUBURB_ROADS: V6Road[] = [
 rd("west-link",[-530,0],[-430,0]),rd("west-spine",[-530,-235],[-530,340]),
 rd("east-link",[330,300],[860,300]),rd("east-loop",[860,300],[860,60]),
 rd("east-north",[430,0],[480,60]),rd("east-avenue",[480,60],[860,60]),
 rd("east-mid",[480,180],[860,180]),rd("east-spine",[480,60],[480,300]),
 rd("east-cross",[670,60],[670,300]),
 rd("south-link",[-110,300],[-110,520]),rd("south-avenue",[-290,520],[360,520]),
 rd("south-loop",[360,520],[360,610]),rd("south-return",[360,610],[-290,610]),rd("south-west",[-290,610],[-290,520]),
 // University of Vataloo: Columbia Street, Ring Road and the links (campus.ts).
 ...CAMPUS_ROADS,
 rd("airport-link",[-530,0],[-680,0]),rd("airport-drive",[-680,-240],[-680,210]),
 rd("west-river-approach",[-530,-235],[-480,-390]),
 // North Meadows, between the panel factory and the river (meadows.ts).
 ...MEADOW_ROADS,
];
/** Length of the street stub where a bridge road meets a street grid (curbs open for it). */
export const BRIDGEHEAD_STUB = 10;
export const RIVER_WALK:Point[] = Array.from({length:25},(_,i)=>{const x=-930+i*77;return [x,NORTH_SHORE_Z(x)] as Point;});
export const NORTH_ROADS:V6Road[] = RIVER_WALK.slice(1).map((p,i)=>rd("riverfront-"+i,RIVER_WALK[i],p));
/** Riverside Beach: sand on the river's north bank below the riverfront street, opposite Meadows Beach's side of town. */
export const NORTH_BEACH = { id: "riverside-beach", x0: -330, x1: -160, depth: 22, name: "RIVERSIDE BEACH" };
export const onNorthBeach = (x: number, z: number) => x > NORTH_BEACH.x0 - 4 && x < NORTH_BEACH.x1 + 4 && z > riverZ(x) - riverWidth(x) / 2 - NORTH_BEACH.depth - 4 && z < riverZ(x);
// The two north-shore bridgeheads: a short stub on the river side so the riverfront's
// curb and sidewalk open for the bridge road (the bridge streets are part of Owawa's grid).
for(const x of [BRIDGES[0].x,BRIDGES[1].x])NORTH_ROADS.push(rd("bridgehead-"+x,[x,NORTH_SHORE_Z(x)+BRIDGEHEAD_STUB],[x,riverfrontZ(x)]));
export function distanceToSegment(x:number,z:number,a:Point,b:Point) {
 const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
 return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
}
export function roadClear(x:number,z:number,roads:V6Road[],pad:number) {return roads.every(r=>distanceToSegment(x,z,r.from,r.to)>r.width/2+r.sidewalkWidth+r.boulevardWidth+pad);}
export const V6_BUILDINGS:V6Building[]=[
 {id:"showroom",name:"CAIVAN · HERON GARDENS",at:[-275,riverZ(-255)-2],size:[25,16,7],kind:"shop",tone:0,level:"island"},
 {id:"island-store",name:"HERON GENERAL STORE",at:[-210,riverZ(-255)-2],size:[17,14,6],kind:"shop",tone:1,level:"island"},
 {id:"sushi",name:"SAKURA SUSHI",at:[-242,riverZ(-255)-2],size:[16,14,6],kind:"shop",tone:3,level:"island"},
 {id:"loan-tower",name:"RIVERBANK FINANCIAL",at:[-410,-810],size:[32,30,112],kind:"tower",tone:1,level:"city"},
 {id:"condo-tower",name:"NORTHSHORE RESIDENCES",at:[-170,-810],size:[34,32,138],kind:"tower",tone:0,level:"city"},
 {id:"terminal",name:"OWAWA REGIONAL AIRPORT",at:[-710,90],size:[40,90,13.5],kind:"terminal",tone:0,level:"ground"},
];
V6_BUILDINGS.push(
 {id:"east-condos",name:"EASTSIDE GARDEN CONDOS",at:[755,235],size:[36,28,18],kind:"condo",tone:0,level:"ground"},
 {id:"south-condos",name:"SOUTH COMMONS CONDOS",at:[-145,565],size:[34,24,15],kind:"condo",tone:2,level:"ground"},
 {id:"ridge-strip",name:"RIDGE MARKET · CAFE · PHARMACY",at:[-300,35],size:[55,25,7],kind:"shop",tone:1,level:"ground"},
);
V6_BUILDINGS.push(...MEADOW_BUILDINGS, ...CAMPUS_BUILDINGS);
for (let i=0;i<5;i++) V6_BUILDINGS.push({id:"island-home-"+i,name:"Heron Gardens "+(i+1),at:[-342+i*30,riverZ(-255)-20],size:[20,12,9],kind:"condo",tone:i%4,level:"island"});
for(const b of V6_BUILDINGS.filter(b=>b.level==="island")){
 if(b.id.startsWith("island-home")){const n=Number(b.id.split("-").at(-1));b.at=shift([-708+n*29,-675]);}
 else b.at=shift(b.id==="showroom"?[-646,-639]:b.id==="sushi"?[-624,-638]:[-604,-638]);
 b.size[0]*=.65;
}
/**
 * Heron Gardens Island walkways. A perimeter loop runs behind the homes and
 * along the shop fronts; a central promenade crosses the island between the
 * homes and Elias's shack; a cross path runs between the buildings; spurs
 * reach every home and shop door, the harbour piers and Elias's jetty. They
 * are draped on the ground (and the pier decks), stay on the island and keep
 * clear of buildings; trees and grass are kept off them.
 */
export interface Walk { id: string; points: Point[]; width: number }
const ISLAND_LOOP = { x0: -728 + ISLAND_SHIFT[0], x1: -572 + ISLAND_SHIFT[0], z0: -692 + ISLAND_SHIFT[1], z1: -625 + ISLAND_SHIFT[1], r: 18 };
function roundedLoop(r: typeof ISLAND_LOOP): Point[] {
 const out: Point[] = [], k = 6;
 const corners: [number, number, number][] = [[r.x1 - r.r, r.z1 - r.r, 0], [r.x0 + r.r, r.z1 - r.r, Math.PI / 2], [r.x0 + r.r, r.z0 + r.r, Math.PI], [r.x1 - r.r, r.z0 + r.r, 1.5 * Math.PI]];
 for (const [cx, cz, a0] of corners) for (let i = 0; i <= k; i++) { const a = a0 + (i / k) * Math.PI / 2; out.push([cx + Math.cos(a) * r.r, cz + Math.sin(a) * r.r]); }
 out.push(out[0]);
 return out;
}
export const ISLAND_PROMENADE_Z = -663.5 + ISLAND_SHIFT[1];
export const ISLAND_WALKS: Walk[] = (() => {
 const L = ISLAND_LOOP, walks: Walk[] = [
  { id: "island-loop", points: roundedLoop(L), width: 3 },
  { id: "island-promenade", points: [[L.x0, ISLAND_PROMENADE_Z], [L.x1, ISLAND_PROMENADE_Z]], width: 4 },
  // Between homes 2 and 3 and between the showroom and the sushi bar.
  { id: "island-cross", points: [[-634 + ISLAND_SHIFT[0], L.z0], [-634 + ISLAND_SHIFT[0], L.z1]], width: 2.6 },
  // Down the beach onto the harbour's pier head.
  { id: "island-harbour", points: [[-614 + ISLAND_SHIFT[0], L.z1], shift([-614, -603.2])], width: 2.6 },
  // West to Elias's fishing jetty.
  { id: "island-jetty", points: [[L.x0, -656 + ISLAND_SHIFT[1]], shift([-758.5, -655.5])], width: 2.4 },
 ];
 for (const b of V6_BUILDINGS.filter(b => b.level === "island")) {
  // Doors are in the south wall; homes open onto the promenade, shops onto the loop.
  const door = b.at[1] + b.size[1] / 2, to = b.id.startsWith("island-home") ? ISLAND_PROMENADE_Z : L.z1;
  walks.push({ id: "island-door-" + b.id, points: [[b.at[0], door + 0.3], [b.at[0], to]], width: 2.4 });
 }
 return walks;
})();
export function onIslandWalk(x: number, z: number, pad = 0) {
 return ISLAND_WALKS.some(w => w.points.slice(1).some((p, i) => distanceToSegment(x, z, w.points[i], p) < w.width / 2 + pad));
}
// Owawa: the north shore's street grid and high-rise blocks (owawaCity.ts), around the
// two visitable towers, and the businesses along Rideau Avenue West.
/** The riverfront road's centre line (straight between RIVER_WALK points) at x. */
export function riverfrontZ(x:number){
 for(let i=0;i<RIVER_WALK.length-1;i++){const a=RIVER_WALK[i],b=RIVER_WALK[i+1];if(x>=a[0]&&x<=b[0])return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}
 return NORTH_SHORE_Z(x);
}
const northCity=buildNorthCity(riverfrontZ,V6_BUILDINGS.filter(b=>b.level==="city"));
NORTH_ROADS.push(...northCity.roads);
V6_BUILDINGS.push(...northCity.buildings);
export const CITY_BLOCKS=northCity.buildings;
export const BUSINESSES=businessSpots(northCity.buildings);
export const CITY_LOOPS=cityLoops(northCity.roads);
for(const [i,at] of ([[530,100],[720,105],[810,245],[-570,95],[-570,265],[65,560],[-245,565]] as Point[]).entries())
 V6_BUILDINGS.push({id:"strip-"+i,name:["RIDGE COFFEE · PHARMACY","GROCER · BAKERY","EASTSIDE STRIP MALL","WEST MARKET","BOOKS · CAFE","SOUTH COMMONS","CYCLE · GARDEN SHOP"][i],at,size:[42,18,7],kind:"shop",tone:i%4,level:"ground"});
/** Campus footpaths: the main walks and the paths from every door (campus.ts). */
export const CAMPUS_PATHS:Point[][]=CAMPUS_WALKWAYS.map(w=>w.points);
export {CAMPUS_WALKWAYS};
/** Trees on the campus lawns and along Laurel Creek. */
export const CAMPUS_TREES:( {position:Point;y:number;scale:number;variant:0|1|2})[]=CAMPUS_TREE_SPOTS.map(([x,z,s],i)=>({position:[x,z],y:0,scale:s,variant:(i%5===0?2:0)}));
/**
 * Trees along the green north bank, between the riverfront street's sidewalk
 * and the water: two loose rows, clear of the bridges, Riverside Beach, the
 * river quay's piers and the water's edge. (Heights are filled in by terrain.ts.)
 */
export const RIVERSIDE_TREE_SPOTS:Point[]=(()=>{
 const out:Point[]=[];
 const h=(n:number)=>{const s=Math.sin(n*12.9898)*43758.5453;return s-Math.floor(s);};
 for(let x=-985,i=0;x<985;x+=12.5,i++)for(const row of [0,1]){
  const px=x+(h(i*3+row)-.5)*6+row*6,front=riverfrontZ(px),water=riverZ(px)-riverWidth(px)/2;
  // Rows at about a third and two thirds of the way from the sidewalk to the water.
  const z=front+8.6+(water-front-8.6)*(row?.62:.3)+(h(i*7+row)-.5)*4;
  if(water-front<26)continue;
  if(BRIDGES.some(b=>Math.abs(px-b.x)<b.width/2+12))continue;
  if(onNorthBeach(px,z)||Math.abs(px-420)<20)continue;
  if(islandRadius(px,z)<1.4)continue;
  out.push([px,z]);
 }
 return out;
})();
export const STUDENT_LOOPS:Point[][]=CAMPUS_LOOPS;
export const SUBJECTS=[
 {id:"engineering",question:"A panel line makes 12 panels in 3 minutes. How many in 15 minutes?",choices:["48 panels","60 panels","72 panels"],correct:1,explanation:"12 ÷ 3 = 4 panels/minute; 4 × 15 = 60."},
 {id:"science",question:"Which riverbank planting best reduces soil erosion?",choices:["Native plants with deep roots","Bare soil","Plastic turf"],correct:0,explanation:"Native roots bind soil and filter runoff before it reaches the river."},
 {id:"business",question:"Revenue is $1,200 and costs are $850. What is the profit?",choices:["$250","$2,050","$350"],correct:2,explanation:"Profit = revenue − costs = $350."},
 {id:"arts",question:"Why preserve historic buildings when a city grows?",choices:["They never need maintenance","They connect communities to their history","They eliminate all building costs"],correct:1,explanation:"Adaptive reuse keeps a community's history while giving old buildings new purposes."},
];
export const COOPS=[{id:"ava",name:"Ava",subject:"engineering",pay:85},{id:"leo",name:"Leo",subject:"science",pay:75},{id:"mina",name:"Mina",subject:"business",pay:95}];
export const STATIONS=[
 {id:"ridge",name:"Ridge West",at:[-480,0] as Point},
 {id:"airport",name:"Airport",at:[-620,-120] as Point},
 {id:"lake",name:"Heron Lake",at:[-520,-460] as Point},
 // On dry ground east of Owawa Road, clear of the bridge ramp (v6.2).
 {id:"owawa",name:"Owawa Quay",at:[712,-414] as Point},
 {id:"centre",name:"Ridge Centre",at:[430,350] as Point},
 {id:"university",name:"University",at:[460,540] as Point},
 {id:"south",name:"South Commons",at:[-170,680] as Point},
];
export const RAIL_Y=32;
export const TRAIN_MAX_SPEED=250/3.6;
export const TRAIN_ACCEL=4.5;
export const TRAIN_DWELL=10;
/** Centripedal-looking rounded track sampled once, shared by drawing and simulation. */
export const RAIL_PATH:Point[]=[];
export const STATION_DISTANCES:number[]=[];
let railLength=0;
for(let i=0;i<STATIONS.length;i++){
 STATION_DISTANCES.push(railLength);
 const p0=STATIONS[(i+STATIONS.length-1)%STATIONS.length].at,p1=STATIONS[i].at,p2=STATIONS[(i+1)%STATIONS.length].at,p3=STATIONS[(i+2)%STATIONS.length].at;
 for(let k=0;k<80;k++){
  const t=k/80,t2=t*t,t3=t2*t;
  const p:Point=[0,0];
  for(let a=0;a<2;a++)p[a]=0.5*(2*p1[a]+(-p0[a]+p2[a])*t+(2*p0[a]-5*p1[a]+4*p2[a]-p3[a])*t2+(-p0[a]+3*p1[a]-3*p2[a]+p3[a])*t3);
  if(RAIL_PATH.length)railLength+=Math.hypot(p[0]-RAIL_PATH.at(-1)![0],p[1]-RAIL_PATH.at(-1)![1]);
  RAIL_PATH.push(p);
 }
 // Add the final sample interval to the next station to keep station offsets exact.
 railLength+=Math.hypot(p2[0]-RAIL_PATH.at(-1)![0],p2[1]-RAIL_PATH.at(-1)![1]);
 RAIL_PATH.push([...p2]);
}
export const RAIL_LENGTH=railLength;
export function pathPoint(points:Point[],s:number,closed=false){
 let length=0;for(let i=0;i<points.length-1;i++)length+=Math.hypot(points[i+1][0]-points[i][0],points[i+1][1]-points[i][1]);
 s=closed?((s%length)+length)%length:Math.max(0,Math.min(length,s));
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(s<=d||i===points.length-2){const t=d?s/d:0;return {x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,heading:Math.atan2(b[1]-a[1],b[0]-a[0])};}s-=d;}return {x:0,z:0,heading:0};
}
function travelProfile(length:number){
 const peak=Math.min(TRAIN_MAX_SPEED,Math.sqrt(length*TRAIN_ACCEL));
 const ramp=peak/TRAIN_ACCEL,cruise=Math.max(0,(length-peak*peak/TRAIN_ACCEL)/peak);
 return {peak,ramp,cruise,time:2*ramp+cruise};
}
export const RAIL_LEGS=STATIONS.map((_,i)=>travelProfile((i===STATIONS.length-1?RAIL_LENGTH:STATION_DISTANCES[i+1])-STATION_DISTANCES[i]));
export const TRAIN_PERIOD=RAIL_LEGS.reduce((s,l)=>s+l.time+TRAIN_DWELL,0);
export const TRAIN_COUNT=6;
export function trainAt(time:number,index:number){
 let t=((time+index*TRAIN_PERIOD/TRAIN_COUNT)%TRAIN_PERIOD+TRAIN_PERIOD)%TRAIN_PERIOD;
 for(let i=0;i<RAIL_LEGS.length;i++){
  const l=RAIL_LEGS[i];
  if(t<TRAIN_DWELL)return {...pathPoint(RAIL_PATH,STATION_DISTANCES[i],true),speed:0,station:i,next:(i+1)%STATIONS.length,distance:STATION_DISTANCES[i]};
  t-=TRAIN_DWELL;
  if(t<l.time){
   let d:number,speed:number;
   if(t<l.ramp){speed=TRAIN_ACCEL*t;d=0.5*TRAIN_ACCEL*t*t;}
   else if(t<l.ramp+l.cruise){speed=l.peak;d=0.5*l.peak*l.ramp+l.peak*(t-l.ramp);}
   else {const u=t-l.ramp-l.cruise;speed=l.peak-TRAIN_ACCEL*u;d=0.5*l.peak*l.ramp+l.peak*l.cruise+l.peak*u-0.5*TRAIN_ACCEL*u*u;}
   const distance=STATION_DISTANCES[i]+d;
   return {...pathPoint(RAIL_PATH,distance,true),speed,station:-1,next:(i+1)%STATIONS.length,distance};
  }t-=l.time;
 }return {...pathPoint(RAIL_PATH,0,true),speed:0,station:0,next:1,distance:0};
}
/**
 * Ground access for each elevated station: the lift tower beside the
 * platform, the entrance pavilion at its foot, the paved forecourt in front of
 * the doors and the footpath out to the street. Rendering, colliders, the
 * interaction prompt, train exits, trees, grass and the map all read this, so
 * they cannot drift apart. `side` picks the side of the track for the lift,
 * `along` slides it along the platform, `face` is the way the doors open
 * (a compass axis, so walls and colliders stay axis-aligned) and `path`
 * continues the footpath from the front edge of the forecourt to a sidewalk.
 */
interface AccessSpec { side: 1 | -1; along: number; face: Point; path: Point[]; extra?: Point[][] }
const ACCESS: Record<string, AccessSpec> = {
 // Forecourt meets the West Link sidewalk across the boulevard.
 ridge: { side: -1, along: -14, face: [-1, 0], path: [[-490, 6.8]] },
 // West to the Airport Drive sidewalk.
 airport: { side: -1, along: 0, face: [-1, 0], path: [[-671.8, -119]] },
 // East to the Heron Bridge Road shoulder, south of the Lake Road junction.
 lake: { side: 1, along: 0, face: [0, 1], path: [[-505, -428], [-486.2, -428]] },
 // West to the Owawa Road shoulder, plus a walk north along the road to the bridge.
 owawa: { side: 1, along: 0, face: [-1, 0], path: [[685.6, -407.9]], extra: [[[696, -415], [697.5, -432], [698.6, -446], [696.8, -452.5]]] },
 // North through the walkway between lots 49 and 50 to the East Link sidewalk.
 centre: { side: -1, along: 3, face: [1, 0], path: [[457.5, 346.6], [457.5, 308.2]] },
 // South-east to Ring Road's outer sidewalk (the campus paths start there).
 university: { side: -1, along: 0, face: [0, 1], path: [[476, 560], [521.6, 613.8]] },
 // North through the walkway between lots 200 and 201 to the South Return sidewalk.
 south: { side: 1, along: 0, face: [1, 0], path: [[-158.5, 658], [-158.5, 619.2]] },
};
export const STATION_PLATFORM = { length: 42, width: 10 };
/** Station footpaths are narrow enough for the 3 m walkways between lots. */
export const STATION_PATH_WIDTH = 2.4;
/** Lift tower: square plan, centred this far from the track. */
export const STATION_LIFT = { offset: 8, size: 4.6 };
/** Entrance pavilion: width across the doors, depth from the lift face. */
export const STATION_PAVILION = { width: 6.3, depth: 7 };
/** Forecourt depth beyond the lift face and its half-width across the doors. */
export const STATION_FORECOURT = { depth: 16, half: 7 };
export interface StationAccess {
 id: string; name: string; at: Point; heading: number;
 /** Unit vector along the track (direction of travel) and toward the lift side. */
 tangent: Point; normal: Point;
 lift: Point; face: Point; yaw: number;
 /** Centre of the entrance pavilion, the spot in front of its doors, and the forecourt. */
 door: Point; exit: Point; forecourt: { x0: number; z0: number; x1: number; z1: number };
 /** Footpath from the forecourt's edge to the street, any further walkways, and the roadside sign. */
 path: Point[]; extra: Point[][]; sign: { at: Point; heading: number };
}
export const STATION_ACCESS: StationAccess[] = STATIONS.map((st, i) => {
 const a = pathPoint(RAIL_PATH, STATION_DISTANCES[i] - 4, true), b = pathPoint(RAIL_PATH, STATION_DISTANCES[i] + 4, true);
 const heading = Math.atan2(b.z - a.z, b.x - a.x), tangent: Point = [Math.cos(heading), Math.sin(heading)];
 const spec = ACCESS[st.id], normal: Point = [-tangent[1] * spec.side, tangent[0] * spec.side], f = spec.face;
 const lift: Point = [st.at[0] + tangent[0] * spec.along + normal[0] * STATION_LIFT.offset, st.at[1] + tangent[1] * spec.along + normal[1] * STATION_LIFT.offset];
 const out = (d: number, across = 0): Point => [lift[0] + f[0] * d - f[1] * across, lift[1] + f[1] * d + f[0] * across];
 const face0 = STATION_LIFT.size / 2;
 const c0 = out(face0, -STATION_FORECOURT.half), c1 = out(face0 + STATION_FORECOURT.depth, STATION_FORECOURT.half);
 const forecourt = { x0: Math.min(c0[0], c1[0]), z0: Math.min(c0[1], c1[1]), x1: Math.max(c0[0], c1[0]), z1: Math.max(c0[1], c1[1]) };
 // The footpath leaves the forecourt at the edge point nearest its first waypoint.
 const w = spec.path[0], cx = Math.min(forecourt.x1, Math.max(forecourt.x0, w[0])), cz = Math.min(forecourt.z1, Math.max(forecourt.z0, w[1]));
 const edge = Math.min(cx - forecourt.x0, forecourt.x1 - cx, cz - forecourt.z0, forecourt.z1 - cz);
 const start: Point = edge === cx - forecourt.x0 ? [forecourt.x0, cz] : edge === forecourt.x1 - cx ? [forecourt.x1, cz] : edge === cz - forecourt.z0 ? [cx, forecourt.z0] : [cx, forecourt.z1];
 const path: Point[] = [start, ...spec.path];
 const end = path.at(-1)!, prev = path.at(-2) ?? lift, pathHeading = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
 const sign: Point = [end[0] - Math.cos(pathHeading) * 2.5 + Math.sin(pathHeading) * 3.2, end[1] - Math.sin(pathHeading) * 2.5 - Math.cos(pathHeading) * 3.2];
 return {
  id: st.id, name: st.name, at: st.at, heading, tangent, normal, lift, face: f, yaw: Math.atan2(f[0], f[1]),
  door: out(face0 + STATION_PAVILION.depth / 2), exit: out(face0 + STATION_PAVILION.depth + 3),
  forecourt, path, extra: spec.extra ?? [], sign: { at: sign, heading: pathHeading + Math.PI / 2 },
 };
});
export const stationAccess = (id: string) => STATION_ACCESS.find(a => a.id === id)!;
/** Is a point on a station forecourt or footpath (plus `pad`)? Keeps trees and grass off them. */
export function onStationAccess(x: number, z: number, pad = 0) {
 return STATION_ACCESS.some(a => inRect(x, z, a.forecourt, pad) || [a.path, ...a.extra].some(l => l.slice(1).some((p, i) => distanceToSegment(x, z, l[i], p) < STATION_PATH_WIDTH / 2 + pad)));
}
/** The river boat's route: down the south side of the river, passing north of Heron Gardens Island. */
export const SHIP_ROUTE:Point[]=Array.from({length:81},(_,i)=>{
 const x=-1150+i*2300/80,i0=ISLANDS[0],u=(x-i0.at[0])/(i0.rx*1.35);
 const z=riverZ(x)+riverWidth(x)*0.38;
 return [x,Math.abs(u)<1?Math.min(z,i0.at[1]-i0.rz*1.35*Math.sqrt(1-u*u)-14):z] as Point;
});
export const SHIP_LENGTH=SHIP_ROUTE.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-SHIP_ROUTE[i][0],p[1]-SHIP_ROUTE[i][1]),0);
/**
 * Jet-ski riders on the river (ambient, no physics). Each loops an open reach
 * of river, well clear of the bridges and their piers, the harbour piers, the
 * quay and the island (v6.5: none west of the island any more, where Elias's
 * jetty now reaches out); riders on the same reach go opposite ways.
 */
export const JETSKI_LOOPS = [{ cx: -250, a: 85 }, { cx: 270, a: 72 }, { cx: 560, a: 62 }, { cx: 880, a: 85 }];
export const NPC_JETSKIS = JETSKI_LOOPS.length * 2;
export function npcJetSki(i: number, time: number) {
 const loop = JETSKI_LOOPS[i % JETSKI_LOOPS.length], dir = i < JETSKI_LOOPS.length ? 1 : -1;
 const b = riverWidth(loop.cx) * 0.22, speed = 10 + ((i * 3.7) % 5);
 const perimeter = 2 * Math.PI * Math.sqrt((loop.a * loop.a + b * b) / 2);
 const at = (u: number) => { const x = loop.cx + loop.a * Math.cos(u); return [x, riverZ(x) + b * Math.sin(u) + 4 * Math.sin(3 * u)] as Point; };
 const u = dir * time * speed / perimeter * 2 * Math.PI + i * 1.9, [x, z] = at(u), [x2, z2] = at(u + dir * 0.02);
 return { x, z, heading: Math.atan2(z2 - z, x2 - x), speed };
}
export const PORT={at:[-610,-601] as Point};
export const PORTS=[
// Each harbour moors a motorboat between its piers and a jet ski along the outer pier.
 {id:"lake",name:"Heron Lake Marina",at:[-556,-542] as Point,heading:-Math.PI/2,shore:[-556,-526] as Point,boat:[-555.8,-564] as Point,jetski:[-546.9,-567.5] as Point},
 {id:"island",name:"Heron Gardens Harbour",at:shift([-610,-601]),heading:Math.PI/2,shore:shift([-610,-618]),boat:shift([-615,-586]),jetski:shift([-622.1,-584])},
 {id:"river",name:"Owawa River Quay",at:[420,riverZ(420)-riverWidth(420)/2+9] as Point,heading:Math.PI/2,shore:[420,riverZ(420)-riverWidth(420)/2-12] as Point,boat:[414,riverZ(420)-riverWidth(420)/2+22] as Point,jetski:[427.1,riverZ(420)-riverWidth(420)/2+24] as Point},
];
