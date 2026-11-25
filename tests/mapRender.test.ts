import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {createCanvas,ImageData} from "@napi-rs/canvas";
import {baseMap,PALETTE} from "../game/src/ui/mapRender";
import {STARTING_STAGES} from "../game/src/world/map";
import {CITY_PAVING} from "../game/src/world/owawa";
import {PLAY_HALF,LAKE_Y,terrainHeight} from "../game/src/world/terrain";
import {riverZ} from "../game/src/world/v6";

beforeAll(()=>{
 vi.stubGlobal("ImageData",ImageData);
 vi.stubGlobal("document",{createElement:(tag:string)=>{if(tag!=="canvas")throw new Error("Unexpected element: "+tag);return createCanvas(1,1);}});
});
afterAll(()=>vi.unstubAllGlobals());

describe("Owawa map shoreline",()=>{
 it("leaves the river visible south of downtown paving",()=>{
  const canvas=baseMap(STARTING_STAGES),ctx=canvas.getContext("2d")!;
  const rgb=(color:string)=>[1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16));
  for(const x of [560,580,610,640,740,770,800,820]){
   const z=riverZ(x)-10;
   expect(terrainHeight(x,z)).toBeLessThan(LAKE_Y);
   const pixel=ctx.getImageData(Math.round(x+PLAY_HALF),Math.round(z+PLAY_HALF),1,1).data;
   expect(Array.from(pixel).slice(0,3),"river at "+x+","+z).toEqual(rgb(PALETTE.water));
  }
 });
 it("keeps the downtown paving footprint on dry ground",()=>{
  for(let x=CITY_PAVING.x0;x<=CITY_PAVING.x1;x+=10){
   expect(terrainHeight(x,CITY_PAVING.z1)).toBeGreaterThan(LAKE_Y);
  }
 });
});
