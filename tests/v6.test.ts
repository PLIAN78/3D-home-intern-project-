import {describe,it,expect} from "vitest";
import {STATIONS,RAIL_LENGTH,TRAIN_PERIOD,TRAIN_COUNT,TRAIN_MAX_SPEED,TRAIN_ACCEL,trainAt,SHIP_ROUTE,inRiver,riverZ,V6_BUILDINGS,SUBJECTS,COOPS} from "../game/src/world/v6";
import {V6_LOTS} from "../game/src/world/v6Lots";
import {terrainHeight,LAKE_Y,CITY_Y,inLake} from "../game/src/world/terrain";
import {v6Boxes,buildingY} from "../game/src/world/v6Geometry";
describe("v6 river city",()=>{
 it("grades a visible continuous approach into the original flat community",()=>{
  const x=100,z=riverZ(x);expect(terrainHeight(x,z+150)).toBeGreaterThan(1);
  for(let s=82;s<218;s+=4)expect(Math.abs(terrainHeight(x,z+s+4)-terrainHeight(x,z+s))).toBeLessThan(2);
 });
 it("connects the lake to both map edges without blocking shipping",()=>{
  for(const [x,z] of SHIP_ROUTE)if(Math.abs(x)<990){expect(inRiver(x,z)).toBe(true);expect(terrainHeight(x,z)).toBeLessThan(LAKE_Y);}
  for(const x of [-950,0,950])expect(inLake(x,riverZ(x))).toBe(true);
 });
 it("provides two high-rise suites, four subjects and over 150 suburban lots",()=>{
  expect(V6_LOTS.length).toBeGreaterThan(150);
  for(const id of ["loan-tower","condo-tower"]){const b=V6_BUILDINGS.find(b=>b.id===id)!;expect(b.size[2]).toBeGreaterThan(100);expect(terrainHeight(...b.at)).toBeCloseTo(CITY_Y);expect(v6Boxes().filter(x=>x.id===id).some(x=>x.y===buildingY(b)+48)).toBe(true);}
  expect(SUBJECTS.length).toBe(4);expect(COOPS.length).toBe(3);
 });
 it("keeps trains continuous and smoothly limited to 250 km/h",()=>{
  expect(RAIL_LENGTH).toBeGreaterThan(4000);expect(TRAIN_COUNT).toBe(6);let max=0;
  for(let t=0;t<TRAIN_PERIOD;t+=.2){const a=trainAt(t,0),b=trainAt(t+.1,0);expect(Number.isFinite(a.x+a.z)).toBe(true);expect(a.speed).toBeGreaterThanOrEqual(0);expect(a.speed).toBeLessThanOrEqual(TRAIN_MAX_SPEED+.001);expect(Math.abs(b.speed-a.speed)).toBeLessThanOrEqual(TRAIN_ACCEL*.1+.01);if(a.station>=0){expect(Math.hypot(a.x-STATIONS[a.station].at[0],a.z-STATIONS[a.station].at[1])).toBeLessThan(.1);expect(a.speed).toBe(0);}max=Math.max(max,a.speed);}
  expect(max).toBeGreaterThan(65);
 });
 it("keeps all station service gaps under 90 seconds",()=>{
  for(let station=0;station<STATIONS.length;station++){let maxWait=0,wait=0;for(let t=0;t<TRAIN_PERIOD;t++){const stopped=Array.from({length:TRAIN_COUNT},(_,i)=>trainAt(t,i)).some(v=>v.station===station);wait=stopped?0:wait+1;maxWait=Math.max(maxWait,wait);}expect(maxWait).toBeLessThan(90);}
 });
});
