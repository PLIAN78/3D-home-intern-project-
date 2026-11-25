import {B} from "../world/props";
import {mat} from "../render/materials";
export function MotorShipModel(){
 return <group name="Heron passenger motor ship">
  <B size={[10.5,1.25,4.2]} position={[-.5,.25,0]} color="#324f59"/>
  <mesh position={[4.7,.25,0]} scale={[1.65,.65,2.1]} material={mat("#324f59")} castShadow><sphereGeometry args={[1,12,8]}/></mesh>
  <B size={[11.5,.25,4.3]} position={[0,1,0]} color="#c0a780"/>
  <B size={[6.6,2.4,3.2]} position={[-1.2,2.3,0]} color="#e9e3d5"/>
  <B size={[5.9,.95,3.25]} position={[-1.1,2.7,0]} color="#304f5d"/>
  <B size={[7.2,.3,3.8]} position={[-1.2,3.65,0]} color="#d7ddd5"/>
  <B size={[2.8,1.8,2.8]} position={[.2,4.65,0]} color="#e6e5da"/>
  <B size={[2.85,.9,2.85]} position={[.2,4.95,0]} color="#355966"/>
  <B size={[3.3,.2,3.2]} position={[.2,5.65,0]} color="#c8d0c9"/>
  {[-1,1].map(s=><group key={s}>
   <B size={[10.3,.08,.08]} position={[-.4,2,s*2]} color="#d5dbd5"/>
   <B size={[10.3,.08,.08]} position={[-.4,1.6,s*2]} color="#d5dbd5"/>
   {[-5,-3,-1,1,3,4.5].map(x=><B key={x} size={[.07,1,.07]} position={[x,1.5,s*2]} color="#d5dbd5"/>)}
   {[-3.5,-1.8,0,1.6].map(x=><B key={x} size={[.1,1.05,.06]} position={[x,2.7,s*1.65]} color="#c6ceca"/>)}
  </group>)}
  <B size={[.14,.8,.14]} position={[-.7,5.9,0]} color="#9ea7a4"/>
  <B size={[1.9,.1,.12]} position={[-.7,6.3,0]} color="#e8e3d7"/>
  <B size={[.7,1.4,.7]} position={[-3.4,4.2,0]} color="#ab6f46"/>
 </group>;
}

