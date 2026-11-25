import {useRef} from "react";
import {useFrame} from "@react-three/fiber";
import * as THREE from "three";
import {B} from "../world/props";
import {mat} from "../render/materials";
export function LightPlaneModel({color="#ece8db",speed=()=>0}:{color?:string;speed?:()=>number}){
 const prop=useRef<THREE.Group>(null);useFrame((_,dt)=>{if(prop.current)prop.current.rotation.x+=dt*(8+speed()*2);});
 return <group name="High-wing trainer">
  <mesh position={[-.35,1.6,0]} rotation={[0,0,Math.PI/2]} scale={[1,1,1.1]} material={mat(color)} castShadow><capsuleGeometry args={[.7,4.7,8,16]}/></mesh>
  <mesh position={[.6,1.95,0]} scale={[1.45,.7,.67]} material={mat("#294b5c",{rough:.18})}><sphereGeometry args={[1,12,10]}/></mesh>
  <B size={[2.4,.18,11.8]} position={[-.2,2.55,0]} color={color}/>
  {[-1,1].map(s=><group key={s}><B size={[.1,2.2,.1]} position={[-.2,1.6,s*2.5]} rotation={[s*.8,0,0]} color="#8e999d"/><B size={[.45,.15,1]} position={[-.2,2.6,s*5.5]} color="#b17b37"/><B size={[1.5,.12,2.2]} position={[-3.4,1.75,s*.9]} color={color}/></group>)}
  <B size={[1.5,1.5,.13]} position={[-3.5,2.2,0]} rotation={[0,0,-.2]} color="#477e8f"/>
  {[[-.8,.45,-1.25],[-.8,.45,1.25],[2.1,.45,0]].map((p,i)=><group key={i}><B size={[.12,.8,.12]} position={[p[0],.9,p[2]]} color="#a7ada9"/><mesh position={p as [number,number,number]} rotation={[Math.PI/2,0,0]} material={mat("#292e31")} castShadow><cylinderGeometry args={[.34,.34,.22,12]}/></mesh></group>)}
  <group ref={prop} position={[3.25,1.6,0]}><B size={[.13,2.5,.14]} position={[0,0,0]} color="#30383b"/><B size={[.13,.14,2.5]} position={[0,0,0]} color="#30383b"/></group>
  <mesh position={[3.4,1.6,0]} rotation={[0,0,-Math.PI/2]} material={mat("#b8bfc0")}><coneGeometry args={[.23,.45,12]}/></mesh>
 </group>;
}
export function AirlinerModel({color="#dbe0df"}:{color?:string}){
 return <group name="Regional airliner">
  <mesh rotation={[0,0,Math.PI/2]} position={[0,3.4,0]} scale={[1,1,1.05]} material={mat(color)} castShadow><capsuleGeometry args={[1.65,23,8,16]}/></mesh>
  <B size={[8,.4,28]} position={[-1,2.7,0]} rotation={[0,0,-.035]} color="#b8c4c7"/>
  {[-1,1].map(s=><group key={s}><mesh position={[1,2.2,s*6.5]} rotation={[0,0,Math.PI/2]} material={mat("#bcc5c7")} castShadow><cylinderGeometry args={[.95,.85,3.8,14]}/></mesh><mesh position={[3,2.2,s*6.5]} rotation={[0,0,Math.PI/2]} material={mat("#243a43")}><cylinderGeometry args={[.7,.7,.08,12]}/></mesh><B size={[3,.25,10]} position={[-11,4,s*1.6]} color="#bcc5c7"/>{Array.from({length:13},(_,i)=><B key={i} size={[.5,.5,.045]} position={[-8+i*1.45,4,s*1.62]} color="#294855"/>)}</group>)}
  <B size={[4.5,6,.3]} position={[-11.5,6.5,0]} rotation={[0,0,-.3]} color="#3d7a87"/><B size={[3,.85,2.3]} position={[12.5,4,0]} color="#31505f"/>
  {[-7,8].flatMap(x=>[-1,1].map(s=><group key={x+"-"+s}><B size={[.2,2,.2]} position={[x,1.2,s*1.4]} color="#828e92"/><mesh position={[x,.4,s*1.4]} rotation={[Math.PI/2,0,0]} material={mat("#242c30")}><cylinderGeometry args={[.5,.5,.35,10]}/></mesh></group>))}
 </group>;
}

