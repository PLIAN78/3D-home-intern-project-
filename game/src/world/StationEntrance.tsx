import {B} from "./props";
import {Decal} from "../render/decal";
import {groundAt} from "./terrain";
import {RAIL_Y,type STATIONS} from "./v6";
export function StationEntrance({station}:{station:(typeof STATIONS)[number]}){
 const [x,z]=station.at,y=groundAt(x,z+18);
 return <group name={station.name+" ground entrance"}>
  <group position={[x,0,z]}>
   <B size={[42,.6,10]} position={[0,RAIL_Y-1.3,0]} color="#c7c3b5"/>
   <B size={[44,.3,12]} position={[0,RAIL_Y+4,0]} color="#487c83"/>
   {[-18,18].map(a=><B key={a} size={[.4,5,.4]} position={[a,RAIL_Y+1.5,3]} color="#808a87"/>)}
   <B size={[4.6,RAIL_Y-y,4.6]} position={[0,y+(RAIL_Y-y)/2,8]} color="#73969e"/>
   {[-1,1].map(s=><B key={s} size={[.22,RAIL_Y-y,4.8]} position={[s*2.25,y+(RAIL_Y-y)/2,8]} color="#c6cfc6"/>)}
   <B size={[3.4,3.6,3.5]} position={[0,y+1.8,8]} color="#d5a84d"/>
   <Decal text={station.name.toUpperCase()} color="#fff3cf" position={[0,RAIL_Y+2,5.2]} rotation={[0,0,0]} size={[18,1.2]}/>
  </group>
  <group position={[x,y,z+18]}>
   <B size={[6,.2,7]} position={[0,.1,0]} color="#c3c3b4"/>
   <B size={[.3,3.8,5]} position={[-2.2,1.9,0]} color="#78979d"/><B size={[.3,3.8,5]} position={[2.2,1.9,0]} color="#78979d"/>
   <B size={[6.3,.35,7]} position={[0,3.9,0]} color="#317986"/>
   <B size={[3.6,3.2,.2]} position={[0,1.6,-2.35]} color="#294854"/>
   {[-1,1].map(s=><B key={s} size={[.18,3.5,.3]} position={[s*1.9,1.75,2.6]} color="#d7ac50"/>)}
   <Decal text="STATION ENTRANCE" color="#fff1cc" position={[0,3.2,3.6]} rotation={[0,0,0]} size={[5.4,.6]}/>
   <Decal text="E - LIFT / DEPARTURES" color="#f6e0a3" position={[0,2.1,2.75]} rotation={[0,0,0]} size={[3.5,.55]}/>
   <B size={[1.3,5,.65]} position={[4.6,2.5,1]} color="#2b6d7c"/>
   <Decal text="EXPRESS" color="#fff1bf" position={[4.6,4.2,1.34]} rotation={[0,0,0]} size={[1.1,.45]}/>
  </group>
 </group>;
}

