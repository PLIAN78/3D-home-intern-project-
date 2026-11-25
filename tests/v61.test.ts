import {beforeAll,describe,expect,it} from "vitest";
import {CITY_Y,LAKE_Y,terrainHeight,groundAt,HILL_TREES,roadSurfaceAt} from "../game/src/world/terrain";
import {ISLANDS,PORTS,STATIONS,STATION_ACCESS,V6_BUILDINGS,SUBURB_ROADS} from "../game/src/world/v6";
import {v6Boxes,buildingY} from "../game/src/world/v6Geometry";
import {Simulation,IDLE_INPUT,type SimInput} from "../game/src/sim/simulation";
import {loadRapier} from "../game/src/sim/rapier";
import {STARTING_STAGES} from "../game/src/world/map";
import {PLANE_SPOTS} from "../game/src/sim/plane";
import {JETTIES,DECK_Y} from "../game/src/world/lake";
beforeAll(async()=>{await loadRapier();});
const sim=()=>Simulation.create({stages:STARTING_STAGES,trees:[],spawn:{position:[-790,-185],heading:0}});
function run(s:Simulation,seconds:number,input:Partial<SimInput>={}){for(let i=0;i<seconds*60;i++)s.step(1/60,{...IDLE_INPUT,...input});}
describe("V6.1 terrain and access",()=>{
 it("keeps the northern city at ground level and limits southern hills",()=>{
  expect(CITY_Y).toBe(0);
  for(let x=-950;x<=950;x+=50)for(let z=-950;z<390;z+=50)expect(terrainHeight(x,z)).toBeLessThanOrEqual(6);
  for(let x=-950;x<=950;x+=50)for(let z=400;z<=950;z+=50)expect(terrainHeight(x,z)).toBeLessThan(7);
 });
 it("merges the two islands while retaining a complete navigable water channel",()=>{
  expect(ISLANDS).toHaveLength(1);const island=ISLANDS[0];
  for(let a=0;a<Math.PI*2;a+=.15){const x=island.at[0]+Math.cos(a)*island.rx*1.3,z=island.at[1]+Math.sin(a)*island.rz*1.3;expect(terrainHeight(x,z),x+","+z).toBeLessThan(LAKE_Y-.8);}
  expect(v6Boxes().some(b=>b.id==="island-causeway")).toBe(false);
 });
 it("seats every island building on its actual ground",()=>{
  for(const b of V6_BUILDINGS.filter(b=>b.level==="island"))expect(Math.abs(groundAt(...b.at)-buildingY(b)),b.id).toBeLessThan(.12);
 });
 it("gives every station a visible, reachable ground entrance",()=>{
  for(const a of STATION_ACCESS){const walls=v6Boxes().filter(b=>b.id==="station-entrance"&&Math.hypot((b.x0+b.x1)/2-a.door[0],(b.z0+b.z1)/2-a.door[1])<2.5);expect(walls,a.id).toHaveLength(2);expect(walls[0].y).toBeCloseTo(groundAt(...a.door));}
  expect(STATION_ACCESS.map(a=>a.id)).toEqual(STATIONS.map(s=>s.id));
 });
 it("provides a university ring road and characteristic Waterloo buildings",()=>{
  expect(SUBURB_ROADS.filter(r=>r.id.startsWith("vataloo-ring"))).toHaveLength(9);
  for(const id of ["porter","davis","math","qnc","engineering","engineering-5","principal","business","gym","cafeteria"])expect(V6_BUILDINGS.some(b=>b.id===id)).toBe(true);
 });
 it("fills the southwest woodland with stable clustered tree cover",()=>{
  const trees=HILL_TREES.filter(t=>t.position[0]<-430&&t.position[1]>430);expect(trees.length).toBeGreaterThan(500);
  for(const t of trees)expect(t.y).toBeCloseTo(terrainHeight(...t.position));
 });
 it("uses the same deck heights for roads and bridge colliders",()=>{
  for(const b of v6Boxes().filter(b=>b.id==="river-bridge"))expect(roadSurfaceAt((b.x0+b.x1)/2,(b.z0+b.z1)/2)).toBeCloseTo((b.y??0)+b.h);
 });
});
describe("V6.1 controllable aircraft and watercraft",()=>{
 it("spawns one motorboat and one jet ski at each of three ports",async()=>{
  const s=await sim();expect(PORTS).toHaveLength(3);expect(Object.keys(s.boats)).toHaveLength(6);
  for(const p of PORTS){for(const type of ["boat","jetski"] as const){const b=s.boats[p.id+"-"+type];expect(b).toBeDefined();expect(terrainHeight(b.x,b.z),p.id+"-"+type).toBeLessThan(LAKE_Y-.4);}}
 });
 it("allows each watercraft to be boarded from a neighbouring pier",async()=>{
  const s=await sim();
  for(const [id,b] of Object.entries(s.boats)){
   const spots=JETTIES.map(j=>({x:Math.max(j.x0+.3,Math.min(j.x1-.3,b.x)),z:Math.max(j.z0+.3,Math.min(j.z1-.3,b.z))})).sort((a,c)=>Math.hypot(a.x-b.x,a.z-b.z)-Math.hypot(c.x-b.x,c.z-b.z));
   s.control={kind:"foot"};s.player.setActive(true);s.teleport(spots[0].x,spots[0].z,DECK_Y-terrainHeight(spots[0].x,spots[0].z));
   const near=s.nearestRide(r=>r.kind==="boat"&&r.id===id);expect(near,id).not.toBeNull();expect(s.board({kind:"boat",id})).toBe(true);expect(s.boat).toBe(b);
  }
 });
 it("accelerates a trainer, takes off and refuses an airborne exit",async()=>{
  const s=await sim();const p=PLANE_SPOTS.trainer;s.teleport(p.x-4,p.z);expect(s.nearestRide(r=>r.kind==="plane")?.kind).toBe("plane");expect(s.board({kind:"plane",id:"trainer"})).toBe(true);
  run(s,12,{forward:1,jumpHeld:true});expect(s.planes.trainer.speed).toBeGreaterThan(25);expect(s.planes.trainer.y).toBeGreaterThan(8);expect(s.planes.trainer.grounded).toBe(false);expect(s.exit()).toBe(false);
 });
 it("can taxi and leave a stopped plane on the ground",async()=>{
  const s=await sim();expect(s.board({kind:"plane",id:"scout"})).toBe(true);run(s,2,{forward:1});expect(s.planes.scout.speed).toBeGreaterThan(2);run(s,6,{forward:-1,handbrake:true});expect(s.planes.scout.grounded).toBe(true);expect(s.exit()).toBe(true);expect(s.control.kind).toBe("foot");
 });
 it("lands on the airport runway and brakes before the pilot exits",async()=>{
  const s=await sim();s.board({kind:"plane",id:"trainer"});const p=s.planes.trainer;
  p.place(-875,100,-Math.PI/2,22);p.speed=28;p.throttle=.54;p.grounded=false;
  run(s,7,{sprint:true});expect(p.grounded).toBe(true);expect(Math.abs(p.y-terrainHeight(p.x,p.z))).toBeLessThan(.1);
  run(s,5,{forward:-1,handbrake:true});expect(p.speed).toBeLessThan(1);expect(s.exit()).toBe(true);
 });
});

