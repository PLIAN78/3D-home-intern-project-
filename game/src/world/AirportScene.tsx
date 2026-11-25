import {useMemo} from "react";
import {B,Sign} from "./props";
import {Decal} from "../render/decal";
import {mat} from "../render/materials";
import {AirlinerModel} from "../models/planes";
import {CarBody,Wheel} from "../models/vehicles";
import {HELIPAD} from "../sim/plane";
function ParkedCar({x,z,color}:{x:number;z:number;color:string}){
 return <group position={[x,.75,z]} rotation={[0,Math.PI/2,0]} scale={.85}><CarBody color={color}/>{[-1.4,1.4].flatMap(a=>[-.8,.8].map(b=><group key={a+"-"+b} position={[a,-.35,b]}><Wheel radius={.35} width={.22} side={b>0?1:-1}/></group>))}</group>;
}
function Terminal({x,z,w,d,label}:{x:number;z:number;w:number;d:number;label:string}){
 return <group position={[x,0,z]}>
  <B size={[w,10,d]} position={[0,5,0]} color="#c6c9c2"/><B size={[w+.25,5,d+.25]} position={[0,4.5,0]} color="#416573"/>
  {Array.from({length:Math.ceil(d/5)},(_,i)=><B key={i} size={[w+.5,10,.22]} position={[0,5,-d/2+i*5]} color="#a8b5b6"/>)}
  <B size={[w+2,.6,d+2]} position={[0,10.3,0]} color="#d8d9cf"/>
  <B size={[w*.6,3.3,d*.64]} position={[0,11.4,0]} color="#7d9b9f"/><B size={[w*.65,.4,d*.7]} position={[0,13.2,0]} color="#d4d6cd"/>
  <B size={[w+5,.4,9]} position={[0,5.8,d/2+2.8]} color="#b8c6c5"/>
  <Decal text={label} color="#f0e9d7" position={[0,8.4,d/2+.16]} rotation={[0,0,0]} size={[w*.88,1.8]}/>
  <B size={[5,3.8,.16]} position={[0,1.9,d/2+.18]} color="#233f4b"/>
  {[-1,1].map(s=><B key={s} size={[.25,4.2,.3]} position={[s*2.7,2.1,d/2+.2]} color="#d6aa49"/>)}
 </group>;
}
function Hangar({x,z,w=48,d=35}:{x:number;z:number;w?:number;d?:number}){
 return <group position={[x,0,z]}>
 <B size={[w,10,d]} position={[0,5,0]} color="#aab1ac"/><B size={[w+1,1,d+1]} position={[0,10.5,0]} color="#737f80"/>
 <B size={[w*.85,7,.22]} position={[0,3.5,d/2+.14]} color="#5f737a"/>
 {Array.from({length:8},(_,i)=><B key={i} size={[.13,7,.1]} position={[-w*.4+i*w*.8/7,3.5,d/2+.3]} color="#bfc7c1"/>)}
 <Decal text="FLIGHT TRAINING" color="#eee4c7" position={[0,8.8,d/2+.2]} rotation={[0,0,0]} size={[w*.8,1.2]}/>
 </group>;
}
/** The airport helicopter's pad by the control tower: a marked square with an H in a circle. */
function Helipad(){
 const {x,z,size}=HELIPAD;
 return <group position={[x,0,z]} name="Helipad">
  {/* The pad stands 3 cm proud of the apron (they used to share a surface and flickered at the edges). */}
  <B size={[size,.15,size]} position={[0,.075,0]} color="#4e575c" cast={false}/>
  <mesh position={[0,.165,0]} rotation={[-Math.PI/2,0,0]} material={mat("#ece7d9")}><ringGeometry args={[size*.36,size*.4,40]}/></mesh>
  <Decal text="H" color="#ece7d9" position={[0,.175,0]} rotation={[-Math.PI/2,0,Math.PI/2]} size={[5,6]}/>
  {[-1,1].flatMap(a=>[-1,1].map(b=><mesh key={a+"-"+b} position={[a*size/2,.32,b*size/2]} material={mat("#e8d36a",{emissive:"#8a7a2a"})}><sphereGeometry args={[.18,6,4]}/></mesh>))}
  <Sign text="HELIPAD" sub="F - OWAWA AIR HELICOPTER" at={[size/2+3,0]} heading={0} width={6}/>
 </group>;
}
export function AirportScene(){
 const lights=useMemo(()=>Array.from({length:48},(_,i)=>({z:-270+i*11,x:-875+(i%2?21:-21)})),[]);
 return <group name="Owawa Regional Airport - expanded">
  <B size={[42,.16,550]} position={[-875,.08,0]} color="#515c61"/><B size={[13,.14,490]} position={[-805,.07,-10]} color="#626c70"/>
  <B size={[66,.12,215]} position={[-768,.06,99]} color="#9fa6a2"/><B size={[95,.12,130]} position={[-775,.06,-180]} color="#939f9c"/>
  {[-220,210].map(z=><B key={z} size={[70,.15,13]} position={[-840,.075,z]} color="#687477"/>)}
  {Array.from({length:25},(_,i)=><B key={i} size={[.7,.02,7]} position={[-875,.18,-240+i*20]} color="#f1ede1" cast={false}/>)}
  {[-245,245].flatMap(z=>[-1,1].flatMap(side=>[0,1,2,3].map(i=><B key={z+"-"+side+"-"+i} size={[1.5,.02,18]} position={[-875+side*(4+i*3),.18,z]} color="#ece7d9" cast={false}/>)))}
  {[-220,220].map(z=><Decal key={z} text={z<0?"18":"36"} color="#f6f0dc" position={[-875,.2,z]} rotation={[-Math.PI/2,0,0]} size={[11,16]}/>)}
  <B size={[.2,.025,470]} position={[-805,.16,-10]} color="#dfb84f" cast={false}/>
  {lights.map((p,i)=><mesh key={i} position={[p.x,.25,p.z]} material={mat(i<4||i>43?"#81bb91":"#e8dfb1",{emissive:i<4?"#3d774a":"#6c6441"})}><sphereGeometry args={[.15,6,4]}/></mesh>)}
  <Terminal x={-710} z={90} w={40} d={90} label="OWAWA REGIONAL - TERMINAL A"/>
  <Terminal x={-735} z={-30} w={45} d={38} label="TERMINAL B - REGIONAL"/>
  <Hangar x={-735} z={-235} w={55} d={40}/><Hangar x={-725} z={-170} w={40} d={35}/>
  <Helipad/>
  <group position={[-735,0,-100]}><B size={[10,26,10]} position={[0,13,0]} color="#b6bbae"/><B size={[16,5,16]} position={[0,28,0]} color="#345967"/><B size={[18,.5,18]} position={[0,30.8,0]} color="#d9dbd0"/><B size={[.2,7,.2]} position={[0,34,0]} color="#c3cac3"/></group>
  <B size={[45,14,70]} position={[-650,7,145]} color="#b5b8ae"/>
  {[3.5,7,10.5].map(y=><B key={y} size={[45.2,1.7,70.2]} position={[-650,y,145]} color="#56656a"/>)}
  <Decal text="PARKING P1" color="#e7d7a7" position={[-650,12.5,180.2]} rotation={[0,0,0]} size={[31,2]}/>
  <B size={[58,.1,75]} position={[-648,.05,20]} color="#58666a"/>
  {Array.from({length:13},(_,i)=><B key={i} size={[.13,.02,12]} position={[-673+i*4,.12,25]} color="#e0dccb" cast={false}/>)}
  {[[-665,19],[-657,19],[-645,19],[-633,19],[-665,44],[-649,44],[-637,44]].map(([x,z],i)=><ParkedCar key={i} x={x} z={z} color={["#d7d4cb","#36546a","#6d7779","#9a5140"][i%4]}/>)}
  <B size={[28,3,5]} position={[-680,7,130]} color="#537b84"/><B size={[29,.25,6]} position={[-680,8.6,130]} color="#c4cdc6"/>
  {[70,145].map(z=><group key={z}><group position={[-770,0,z]}><AirlinerModel/></group><B size={[25,2.5,3.8]} position={[-742.5,4,z]} color="#bbc7c4"/><B size={[25.1,1.2,3.9]} position={[-742.5,4.2,z]} color="#486874"/></group>)}
  <Sign text="AIRPORT - TRAINING PLANES" sub="F to board - W/S throttle - Space lift - Shift descend" at={[-688,-125]} heading={Math.PI/2} width={15}/>
  <Sign text="TERMINALS A / B - PARKING" sub="Express rail connection" at={[-671,218]} heading={Math.PI/2} width={12}/>
 </group>;
}

