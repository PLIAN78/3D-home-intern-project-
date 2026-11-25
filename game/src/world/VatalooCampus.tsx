import {useMemo} from "react";
import * as THREE from "three";
import type {ReactNode} from "react";
import {B,Windows,Sign} from "./props";
import {Decal} from "../render/decal";
import {mat} from "../render/materials";
import {V6_BUILDINGS,CAMPUS_PATHS} from "./v6";
const palette=["#c4c8bf","#b5a189","#8f9490","#a97459"];
function AcademicBuilding({b}:{b:typeof V6_BUILDINGS[number]}){
 const [w,d,h]=b.size,[x,z]=b.at;
 const floors=useMemo(()=>Array.from({length:Math.max(2,Math.floor(h/3.5))},(_,i)=>2+i*3.5),[h]);
 const glass=["engineering","engineering-5","qnc","davis"].includes(b.id),porter=b.id==="porter";
 return <group position={[x,0,z]} name={b.name}>
  <B size={[w,h,d]} position={[0,h/2,0]} color={porter?"#e0dfd2":glass?"#3b5964":palette[b.tone]}/>
  {(["+x","-x","+z","-z"] as const).map(face=><Windows key={face} centre={[0,0]} face={face} offset={face.endsWith("x")?w/2+.03:d/2+.03} length={face.endsWith("x")?d:w} floors={floors} size={porter?[1.8,2.3]:glass?[3,2.3]:[2.3,1.7]} spacing={porter?3:4}/>)}
  {floors.map((y,i)=><B key={i} size={[w+.45,porter?.6:.4,d+.45]} position={[0,y+1.4,0]} color={porter?"#e5e2d5":glass?"#7e9397":"#b5b7ad"}/>)}
  {porter&&Array.from({length:9},(_,i)=><B key={i} size={[.4,h,.35]} position={[-w/2+2+i*3.2,h/2,d/2+.12]} color="#ece8da"/>)}
  {b.id==="qnc"&&Array.from({length:13},(_,i)=><B key={i} size={[.3,h*.8,1]} position={[-w/2+2+i*4,h*.55,d/2+.2]} color="#a98e63"/>)}
  {b.id==="davis"&&[-1,0,1].map(n=><group key={n} position={[n*w*.28,0,d/2+2.4]}><B size={[.35,8,.4]} position={[-3,4,0]} color="#367f85"/><B size={[.35,8,.4]} position={[3,4,0]} color="#367f85"/><B size={[6.3,.35,.4]} position={[0,8,0]} color="#b79c4f"/></group>)}
  <B size={[w+1,.65,d+1]} position={[0,h+.32,0]} color="#d4d5ca"/>
  <B size={[Math.min(12,w*.4),.25,5.5]} position={[0,4.7,d/2+2]} color={glass?"#7ba0a4":"#b7b5a5"}/>
  <B size={[3.6,3.5,.14]} position={[0,1.75,d/2+.15]} color="#294754"/>
  <Decal text={b.name} color={glass?"#f2e7c4":"#344c52"} position={[0,5.8,d/2+.3]} rotation={[0,0,0]} size={[w*.9,1.1]}/>
 </group>;
}
function Path({points}:{points:[number,number][]}){
 const g=useMemo(()=>{const p:number[]=[],ix:number[]=[];points.forEach(([x,z],i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;for(const s of [-1,1])p.push(x-dz/l*2.6*s,.07,z+dx/l*2.6*s);if(i){const n=i*2;ix.push(n-2,n-1,n,n-1,n+1,n);}});const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(p,3));geo.setIndex(ix);geo.computeVertexNormals();return geo;},[points]);
 return <mesh geometry={g} material={mat("#c3bda9")} receiveShadow/>;
}
export function VatalooCampus({children}:{children?:ReactNode}){
 const campus=V6_BUILDINGS.filter(b=>b.at[0]>490&&b.at[1]>500&&["campus","historic","shop","gym"].includes(b.kind));
 return <group name="University of Vataloo">
  {CAMPUS_PATHS.map((p,i)=><Path key={i} points={p}/>)}
  {campus.map(b=><AcademicBuilding key={b.id} b={b}/>)}
  <B size={[90,3.2,6]} position={[846,13,752]} color="#5a7880"/><B size={[91,.4,7]} position={[846,14.8,752]} color="#c1c9c3"/>
  {[-1,1].map(s=><B key={s} size={[90,1.7,.12]} position={[846,13,752+s*3.05]} color="#496673"/>)}
  <B size={[30,.2,22]} position={[658,.1,696]} color="#b7b5a5"/>
  {Array.from({length:12},(_,i)=><B key={i} size={[1.2,.02,22]} position={[643+i*2.5,.22,696]} color="#d2cebf" cast={false}/>)}
  <mesh position={[658,.32,695]} rotation={[-Math.PI/2,0,0]} material={mat("#798e7d")}><circleGeometry args={[3.6,32]}/></mesh>
  <B size={[55,.12,45]} position={[595,.07,655]} color="#73925c"/>
  {[[555,694],[620,686],[680,805],[794,830],[554,782]].map(([x,z],i)=><group key={i}><B size={[4,.2,1]} position={[x,.6,z]} color="#92795a"/><B size={[4,.6,.15]} position={[x,.95,z+.45]} color="#92795a"/><B size={[3,.12,4]} position={[x,.07,z+3]} color="#8d986b"/></group>)}
  <B size={[48,.15,28]} position={[915,.08,842]} color="#626e70"/>
  {Array.from({length:10},(_,i)=><B key={i} size={[.12,.02,12]} position={[894+i*4,.17,842]} color="#e4dbc5" cast={false}/>)}
  <Sign text="UNIVERSITY OF VATALOO" sub="Ring Road - Engineering - Arts - Co-op" at={[530,545]} heading={-Math.PI/2} width={13}/>
  <Sign text="NEEDLES HALL / TATHAM" sub="Principal Chen - University co-ops" at={[535,760]} heading={Math.PI/2} width={9}/>
  {children}
 </group>;
}

