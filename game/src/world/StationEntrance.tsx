import {B,Sign} from "./props";
import {Decal} from "../render/decal";
import {groundAt} from "./terrain";
import {Plaza,Walkway} from "./Walkways";
import {RAIL_Y,STATION_LIFT,STATION_PATH_WIDTH,STATION_PLATFORM,type StationAccess} from "./v6";

/**
 * An elevated express station: the platform and canopy follow the track; a
 * lift tower stands beside the platform with the entrance pavilion at its
 * foot, opening onto a level forecourt and a footpath to the street. Every
 * position comes from STATION_ACCESS, which the colliders, prompt, train
 * exit and map also use.
 */
export function StationEntrance({access:a}:{access:StationAccess}){
 const {length:L,width:W}=STATION_PLATFORM;
 const side=Math.sign(a.normal[0]*-a.tangent[1]+a.normal[1]*a.tangent[0])||1;
 const along=(a.lift[0]-a.at[0])*a.tangent[0]+(a.lift[1]-a.at[1])*a.tangent[1];
 const y=groundAt(a.door[0],a.door[1]),liftBase=Math.min(y,groundAt(a.lift[0],a.lift[1]))-.2,top=RAIL_Y+3.4,shaft=top-liftBase;
 const signY=groundAt(a.sign.at[0],a.sign.at[1]);
 const name=a.name.toUpperCase();
 return <group name={a.name+" station"}>
  <group position={[a.at[0],0,a.at[1]]} rotation={[0,-a.heading,0]} name="Platform">
   <B size={[L,.6,W]} position={[0,RAIL_Y-1.3,0]} color="#c7c3b5"/>
   {[-1,1].map(s=><B key={s} size={[L,.08,.35]} position={[0,RAIL_Y-.96,s*(W/2-.4)]} color="#e0b84f" cast={false}/>)}
   <B size={[L+2,.3,W+2]} position={[0,RAIL_Y+4,0]} color="#487c83"/>
   {[-1,1].flatMap(s=>[-18,-6,6,18].map(x=><B key={s+"-"+x} size={[.35,4.85,.35]} position={[x,RAIL_Y+1.45,s*(W/2-.3)]} color="#808a87"/>))}
   {[-1,1].map(s=><group key={s} position={[0,RAIL_Y+3.2,s*(W/2+1.05)]} rotation={[0,s>0?0:Math.PI,0]}>
    <B size={[22,1.4,.2]} position={[0,0,0]} color="#2f5e67"/>
    <Decal text={name} color="#fff3cf" position={[0,0,.12]} rotation={[0,0,0]} size={[18,1.1]}/>
   </group>)}
   {/* Bridge from the platform edge to the lift. */}
   <B size={[3.4,.5,STATION_LIFT.offset-W/2+1.6]} position={[along,RAIL_Y-1.3,side*(W/2+STATION_LIFT.offset)/2]} color="#bdb9ab"/>
   {[-1,1].map(s=><B key={s} size={[.12,1.1,STATION_LIFT.offset-W/2+1.4]} position={[along+s*1.65,RAIL_Y-.5,side*(W/2+STATION_LIFT.offset)/2]} color="#9aa7a4"/>)}
  </group>
  <group position={[a.lift[0],liftBase,a.lift[1]]} rotation={[0,a.yaw,0]} name="Lift tower">
   <B size={[STATION_LIFT.size,shaft,STATION_LIFT.size]} position={[0,shaft/2,0]} color="#73969e"/>
   {[-1,1].flatMap(sx=>[-1,1].map(sz=><B key={sx+"-"+sz} size={[.24,shaft,.24]} position={[sx*2.25,shaft/2,sz*2.25]} color="#c6cfc6"/>))}
   <B size={[5,.4,5]} position={[0,shaft+.2,0]} color="#317986"/>
   <Decal text="EXPRESS" color="#fff1bf" position={[0,shaft-2.2,2.32]} rotation={[0,0,0]} size={[3.6,.8]}/>
  </group>
  <group position={[a.door[0],y,a.door[1]]} rotation={[0,a.yaw,0]} name="Entrance pavilion">
   <B size={[6,.2,7]} position={[0,.1,0]} color="#c3c3b4"/>
   <B size={[.3,3.8,5]} position={[-2.2,1.9,0]} color="#78979d"/><B size={[.3,3.8,5]} position={[2.2,1.9,0]} color="#78979d"/>
   <B size={[6.3,.35,7]} position={[0,3.9,0]} color="#317986"/>
   <B size={[3.6,3.2,.2]} position={[0,1.6,-3.35]} color="#294854"/>
   <B size={[2.4,2.8,.1]} position={[0,1.5,-3.22]} color="#d5a84d"/>
   {[-1,1].map(s=><B key={s} size={[.18,3.5,.3]} position={[s*1.9,1.75,2.6]} color="#d7ac50"/>)}
   <Decal text="STATION ENTRANCE" color="#fff1cc" position={[0,3.2,3.6]} rotation={[0,0,0]} size={[5.4,.6]}/>
   <Decal text="E - LIFT / DEPARTURES" color="#f6e0a3" position={[0,2.1,2.75]} rotation={[0,0,0]} size={[3.5,.55]}/>
   <B size={[1.3,5,.65]} position={[4.6,2.5,1]} color="#2b6d7c"/>
   <Decal text="EXPRESS" color="#fff1bf" position={[4.6,4.2,1.34]} rotation={[0,0,0]} size={[1.1,.45]}/>
  </group>
  <Plaza rect={a.forecourt}/>
  {[a.path,...a.extra].map((p,i)=><Walkway key={i} points={p} width={STATION_PATH_WIDTH}/>)}
  <group position={[0,signY,0]}><Sign text={name+" STATION"} sub="EXPRESS RAIL · LIFT TO PLATFORM" at={a.sign.at} heading={a.sign.heading} width={6}/></group>
 </group>;
}
