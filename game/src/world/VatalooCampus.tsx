import {useMemo} from "react";
import type {ReactNode} from "react";
import {B,Windows,Sign} from "./props";
import {Decal} from "../render/decal";
import {mat} from "../render/materials";
import {Walkway,Plaza} from "./Walkways";
import {V6_BUILDINGS,CAMPUS_PATHS,type V6Building} from "./v6";
import {CAMPUS_BUILDINGS,CAMPUS_LAWNS,COLUMBIA_Z,CREEK_WIDTH,LAUREL_CREEK,PATH_HALF_WIDTH,RING,SKYBRIDGE} from "./campus";

/** Each building's own colour, loosely after the campus map; glass buildings get big windows. */
const LOOK:Record<string,{color:string;glass?:boolean;trim?:string}>={
 gym:{color:"#9aa3a6",trim:"#c9a54f"},cafeteria:{color:"#c9ae67"},exp:{color:"#5d878c",glass:true},bmh:{color:"#7f9a9b"},
 m3:{color:"#c4a3b1"},davis:{color:"#3b5964",glass:true},qnc:{color:"#76708f",glass:true},math:{color:"#b6939f"},
 m4:{color:"#c8c8c6",trim:"#b98aa0"},c2:{color:"#6f86ad"},esc:{color:"#8c9bb7"},principal:{color:"#a9a9a2"},
 science:{color:"#9db3c1",glass:true},b1:{color:"#6a83ad"},porter:{color:"#e0dfd2"},ml:{color:"#c9945a"},
 business:{color:"#9fa3a8"},environment:{color:"#7d9157",trim:"#c9b36a"},ev1:{color:"#93a06a"},al:{color:"#b56a4f"},
 arts:{color:"#b98455"},pas:{color:"#ad5c48"},engineering:{color:"#3b5964",glass:true},"engineering-5":{color:"#476a73",glass:true},
 stj:{color:"#4b6b54",trim:"#d8c48a"},
};

function AcademicBuilding({b}:{b:V6Building}){
 const [w,d,h]=b.size,[x,z]=b.at;
 const floors=useMemo(()=>Array.from({length:Math.max(2,Math.floor(h/3.5))},(_,i)=>2+i*3.5),[h]);
 const look=LOOK[b.id]??{color:"#c4c8bf"},glass=!!look.glass,porter=b.id==="porter";
 const dark=["#3b5964","#476a73","#76708f","#6f86ad","#6a83ad","#4b6b54","#b56a4f","#ad5c48","#5d878c"].includes(look.color);
 return <group position={[x,0,z]} name={b.name}>
  <B size={[w,h,d]} position={[0,h/2,0]} color={look.color}/>
  {(["+x","-x","+z","-z"] as const).map(face=><Windows key={face} centre={[0,0]} face={face} offset={face.endsWith("x")?w/2+.03:d/2+.03} length={face.endsWith("x")?d:w} floors={floors} size={porter?[1.8,2.3]:glass?[3,2.3]:[2.3,1.7]} spacing={porter?3.2:glass?3.6:3.4} skip={face==="+z"?[[-2.5,2.5]]:[]}/>)}
  {floors.map((y,i)=><B key={i} size={[w+.45,porter?.6:.35,d+.45]} position={[0,y+1.4,0]} color={porter?"#e5e2d5":look.trim??(glass?"#7e9397":"#b5b7ad")}/>)}
  {porter&&Array.from({length:9},(_,i)=><B key={i} size={[.4,h,.35]} position={[-w/2+2+i*3.2,h/2,d/2+.12]} color="#ece8da"/>)}
  {b.id==="qnc"&&Array.from({length:9},(_,i)=><B key={i} size={[.3,h*.8,1]} position={[-w/2+2+i*4.5,h*.55,d/2+.2]} color="#a98e63"/>)}
  {b.id==="gym"&&<B size={[w+1.5,1.2,d+1.5]} position={[0,h+.6,0]} color="#7e8689"/>}
  <B size={[w+1,.65,d+1]} position={[0,h+.32,0]} color="#d4d5ca"/>
  {/* Entrance canopy, glass doors and the name over them (doors face south, +z). */}
  <B size={[Math.min(12,w*.4),.25,5.5]} position={[0,4.7,d/2+2]} color={glass?"#7ba0a4":"#b7b5a5"}/>
  {[-1,1].map(s=><B key={s} size={[.25,4.6,.25]} position={[s*Math.min(5.6,w*.19),2.3,d/2+4.4]} color="#8a8f8c"/>)}
  <B size={[3.6,3.5,.14]} position={[0,1.75,d/2+.15]} color="#294754"/>
  <Decal text={b.name} color={dark||glass?"#f2e7c4":"#344c52"} position={[0,5.8,d/2+.3]} rotation={[0,0,0]} size={[w*.9,1.1]}/>
 </group>;
}

/** Laurel Creek: a water ribbon with darker banks, and a footbridge where each path crosses. */
function Creek(){
 const crossings=[558,748];
 return <group name="Laurel Creek">
  <Walkway points={LAUREL_CREEK} width={CREEK_WIDTH+3} color="#6f7f5a" lift={.04}/>
  <Walkway points={LAUREL_CREEK} width={CREEK_WIDTH} color="#4f8fa1" lift={.07}/>
  {crossings.map(z=>{const x=LAUREL_CREEK.reduce((best,p,i)=>i&&Math.min(p[1],LAUREL_CREEK[i-1][1])<=z&&Math.max(p[1],LAUREL_CREEK[i-1][1])>=z?LAUREL_CREEK[i-1][0]+(p[0]-LAUREL_CREEK[i-1][0])*(z-LAUREL_CREEK[i-1][1])/(p[1]-LAUREL_CREEK[i-1][1]):best,LAUREL_CREEK[0][0]);
   return <group key={z} position={[x,0,z]} name="Footbridge">
    <B size={[CREEK_WIDTH+5,.35,4.4]} position={[0,.45,0]} color="#9b7b55"/>
    {[-1,1].map(s=><B key={s} size={[CREEK_WIDTH+5,.9,.15]} position={[0,1.05,s*2.1]} color="#7a5f42"/>)}
   </group>;})}
 </group>;
}

/** The rock garden: boulders on a lawn between Mathematics & Computer and the library. */
function RockGarden({r}:{r:{x0:number;z0:number;x1:number;z1:number}}){
 const rocks=useMemo(()=>Array.from({length:14},(_,i)=>({x:r.x0+4+((i*37)%100)/100*(r.x1-r.x0-8),z:r.z0+4+((i*61)%100)/100*(r.z1-r.z0-8),s:.9+((i*13)%10)/10*1.4})),[r]);
 return <group name="Rock garden">{rocks.map((k,i)=><mesh key={i} position={[k.x,k.s*.35,k.z]} scale={[k.s*1.3,k.s*.8,k.s]} rotation={[0,i,0]} material={mat(i%3?"#9a968c":"#7f7b72",{rough:.95})} castShadow receiveShadow><dodecahedronGeometry args={[1,0]}/></mesh>)}</group>;
}

export function VatalooCampus({children}:{children?:ReactNode}){
 const campus=V6_BUILDINGS.filter(b=>CAMPUS_BUILDINGS.includes(b));
 const benches:[number,number][]=[[668,628],[745,628],[620,702],[760,702],[668,817],[740,817],[600,632],[840,817]];
 return <group name="University of Vataloo">
  {CAMPUS_PATHS.map((p,i)=><Walkway key={i} points={p} width={PATH_HALF_WIDTH*2}/>)}
  {CAMPUS_LAWNS.map(l=><Plaza key={l.id} rect={l} color={l.id==="arts-quad"?"#7fa060":"#73925c"}/>)}
  <RockGarden r={CAMPUS_LAWNS.find(l=>l.id==="rock-garden")!}/>
  <Creek/>
  {campus.map(b=><AcademicBuilding key={b.id} b={b}/>)}
  {/* Engineering 7 to Engineering 5 skybridge. */}
  <group position={[SKYBRIDGE.x,SKYBRIDGE.y,(SKYBRIDGE.z0+SKYBRIDGE.z1)/2]}>
   <B size={[SKYBRIDGE.width,SKYBRIDGE.height,SKYBRIDGE.z1-SKYBRIDGE.z0+2]} position={[0,SKYBRIDGE.height/2,0]} color="#5a7880"/>
   <B size={[SKYBRIDGE.width+1,.4,SKYBRIDGE.z1-SKYBRIDGE.z0+2]} position={[0,SKYBRIDGE.height+.2,0]} color="#c1c9c3"/>
   {[-1,1].map(s=><B key={s} size={[.12,1.7,SKYBRIDGE.z1-SKYBRIDGE.z0]} position={[s*(SKYBRIDGE.width/2+.03),SKYBRIDGE.height/2,0]} color="#496673"/>)}
  </group>
  {benches.map(([x,z],i)=><group key={i} position={[x,0,z]}><B size={[3.2,.12,.9]} position={[0,.55,0]} color="#92795a"/><B size={[3.2,.6,.12]} position={[0,.9,-.42]} color="#92795a"/>{[-1.3,1.3].map(a=><B key={a} size={[.12,.55,.8]} position={[a,.28,0]} color="#4a4f53"/>)}</group>)}
  {/* Lot east of Engineering 5. */}
  <B size={[48,.15,28]} position={[915,.08,842]} color="#626e70" cast={false}/>
  {Array.from({length:10},(_,i)=><B key={i} size={[.12,.02,12]} position={[894+i*4,.17,842]} color="#e4dbc5" cast={false}/>)}
  <Sign text="UNIVERSITY OF VATALOO" sub="Columbia Street · Ring Road · campus map" at={[640+12,COLUMBIA_Z+11]} heading={0} width={13}/>
  <Sign text="RING ROAD" sub="Engineering · Davis · Math" at={[795+12,COLUMBIA_Z+11]} heading={0} width={8}/>
  <Sign text="NEEDLES HALL / TATHAM" sub="Principal Chen - University co-ops" at={[577,760]} heading={0} width={9}/>
  <Sign text="LAUREL CREEK TRAIL" sub="St. Jerome's · University Station" at={[RING.x0-10,590]} heading={Math.PI/2} width={8}/>
  {children}
 </group>;
}
