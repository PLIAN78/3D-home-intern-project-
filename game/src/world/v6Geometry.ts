import type {Box} from "./map";
import {CITY_Y,LAKE_Y,groundAt} from "./terrain";
import {V6_BUILDINGS,riverZ,riverWidth,RAIL_Y,STATIONS} from "./v6";
export const buildingY=(b:typeof V6_BUILDINGS[number])=>b.level==="city"?CITY_Y:b.level==="island"?LAKE_Y+2.5:0;
export const BRIDGES=[-480,100,690].map((x,i)=>({x,z:riverZ(x),width:i===2?14:10,length:riverWidth(x)+48,y:LAKE_Y+7}));
export function v6Boxes():Box[]{
 const out:Box[]=[];
 const add=(x:number,z:number,w:number,d:number,h:number,y:number,id:string)=>out.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,h,y,id,kind:"landmark"});
 for(const b of V6_BUILDINGS){
  const [w,d,h]=b.size,y=buildingY(b),[x,z]=b.at;
  if(b.id==="loan-tower"||b.id==="condo-tower"){
   // Tall shells with real lobbies and an upper visitable floor. Door in the south wall.
   add(x,z,w,d,.25,y,b.id);add(x,z,w,d,.25,y+48,b.id);add(x,z,w,d,.25,y+53,b.id);
   add(x-w/2,z,.4,d,h,y,b.id);add(x+w/2,z,.4,d,h,y,b.id);add(x,z-d/2,w,.4,h,y,b.id);
   add(x-w/4-1,z+d/2,w/2-2,.4,5,y,b.id);add(x+w/4+1,z+d/2,w/2-2,.4,5,y,b.id);
   add(x,z+d/2,w,.4,h-5,y+5,b.id);
  } else add(x,z,w,d,h,y,b.id);
 }
 for(const b of BRIDGES){add(b.x,b.z,b.width,b.length,.6,b.y-.6,"river-bridge");for(const s of [-1,1])add(b.x+s*(b.width/2-.2),b.z,.4,b.length,1,b.y,"bridge-rail");}

 for(const st of STATIONS){
 add(st.at[0],st.at[1],42,10,.6,RAIL_Y-1.6,"station-platform");
 const y=groundAt(st.at[0],st.at[1]+18);
 add(st.at[0]-2.2,st.at[1]+18,.3,5,3.5,y,"station-entrance");
 add(st.at[0]+2.2,st.at[1]+18,.3,5,3.5,y,"station-entrance");
 }
 add(-735,-30,45,38,13.5,0,"terminal-b");
 add(-735,-235,55,40,11,0,"hangar");
 add(-725,-170,40,35,11,0,"hangar");
 add(-735,-100,10,10,30,0,"control-tower");
 add(-650,145,45,70,14,0,"parking-garage");
 add(-680,130,28,5,3,5.5,"airport-skybridge");
 add(846,752,90,6,3.2,11.4,"campus-skybridge");
 return out;
}
