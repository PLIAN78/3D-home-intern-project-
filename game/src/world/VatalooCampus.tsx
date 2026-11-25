import {useEffect,useMemo} from "react";
import type {ReactNode} from "react";
import * as THREE from "three";
import {B,Windows,Sign} from "./props";
import {Decal} from "../render/decal";
import {concreteSurface,groundAsphalt,groundConcrete,mat} from "../render/materials";
import {Walkway} from "./Walkways";
import type {Point} from "./v6";
import {CAMPUS_BUILDINGS,CAMPUS_WALKWAYS,COLUMBIA_Z,CREEK_WIDTH,LAUREL_CREEK,PLAZA_POLYGON,PONDS,RING_DIMS,RING_JUNCTIONS,RING_LENGTH,RING_LENGTHS,RING_POINTS,SKYBRIDGE,SKYBRIDGES,toWing,type CampusBuilding,type CampusWing} from "./campus";

/**
 * Each building's look: brick, buff stone, concrete or glass, loosely after the
 * real campus (the library's white columns, the Quantum-Nano Centre's fins,
 * the engineering buildings' glass).
 */
const LOOK:Record<string,{color:string;glass?:boolean;trim?:string}>={
 ahs:{color:"#b9a27c"},bmh:{color:"#a98f6d"},lhi:{color:"#c7b38d"},gym:{color:"#9aa3a6",trim:"#c9a54f"},uc:{color:"#b57f5c"},
 cafeteria:{color:"#c9ae67"},erc:{color:"#5d878c",glass:true},csb:{color:"#a7a297"},com:{color:"#9d9a90"},gsc:{color:"#aaa69a"},
 m3:{color:"#c4a3b1"},math:{color:"#b6939f",trim:"#d6d2c6"},davis:{color:"#3b5964",glass:true},c2:{color:"#6f86ad"},
 eit:{color:"#8c9bb7",glass:true},esc:{color:"#8c9bb7"},e3:{color:"#476a73",glass:true},e2:{color:"#a08c74"},phy:{color:"#9b8770"},
 cph:{color:"#a4876a"},rch:{color:"#b9a48a"},dwe:{color:"#8f7c68"},gh:{color:"#9a5b45"},porter:{color:"#e0dfd2"},sch:{color:"#bba27a"},
 business:{color:"#9fa3a8",glass:true},al:{color:"#b56a4f"},ml:{color:"#c9945a"},ev1:{color:"#93a06a"},environment:{color:"#7d9157",trim:"#c9b36a"},
 ev2:{color:"#8a9a66"},arts:{color:"#b98455"},pas:{color:"#ad5c48"},principal:{color:"#a9a9a2"},science:{color:"#9db3c1",glass:true},
 b2:{color:"#7a92b6"},b1:{color:"#6a83ad"},qnc:{color:"#76708f",glass:true},ec2:{color:"#a9aaa3"},ec4:{color:"#b3b0a5"},ech:{color:"#8f9893"},
 "engineering-5":{color:"#476a73",glass:true},engineering:{color:"#3b5964",glass:true},e6:{color:"#56777f",glass:true},
};
const DARK=new Set(["#3b5964","#476a73","#76708f","#6f86ad","#6a83ad","#5d878c","#56777f","#b56a4f","#ad5c48","#9a5b45","#7a92b6"]);

/** Which face of a wing a point outside it is on, and where along that face (local coordinates). */
function faceOf(w:CampusWing,p:Point){
 const [lx,lz]=toWing(p[0],p[1],w),ex=Math.abs(lx)-w.w/2,ez=Math.abs(lz)-w.d/2;
 return ez>=ex?{face:(lz>0?"+z":"-z") as "+z"|"-z",along:lx,out:[0,Math.sign(lz)] as Point,at:[lx,Math.sign(lz)*w.d/2] as Point}:{face:(lx>0?"+x":"-x") as "+x"|"-x",along:lz,out:[Math.sign(lx),0] as Point,at:[Math.sign(lx)*w.w/2,lz] as Point};
}

/** One wing: the block, windows on every face, floor bands, a parapet, and (on the main wing) the entrance. */
function Wing({b,w,main}:{b:CampusBuilding;w:CampusWing;main:boolean}){
 const look=LOOK[b.id]??{color:"#c4c8bf"},glass=!!look.glass,porter=b.id==="porter",h=w.h;
 const floors=useMemo(()=>Array.from({length:Math.max(2,Math.floor(h/3.6))},(_,i)=>2+i*3.6),[h]);
 const door=main?faceOf(w,b.door):null;
 const faces=(["+x","-x","+z","-z"] as const);
 return <group position={[w.c[0],0,w.c[1]]} rotation={[0,-w.rot,0]}>
  <B size={[w.w,h,w.d]} position={[0,h/2,0]} color={look.color}/>
  {faces.map(face=>{const alongX=face.endsWith("z"),len=alongX?w.w:w.d,skip:[number,number][]=door&&door.face===face?[[door.along-2.8,door.along+2.8],[-door.along-2.8,-door.along+2.8]]:[];
   return <Windows key={face} centre={[0,0]} face={face} offset={(alongX?w.d:w.w)/2+.03} length={len} floors={floors} size={porter?[1.8,2.3]:glass?[3,2.3]:[2.3,1.7]} spacing={porter?3.2:glass?3.6:3.4} skip={skip}/>;})}
  {floors.map((y,i)=><B key={i} size={[w.w+.45,porter?.6:.35,w.d+.45]} position={[0,y+1.4,0]} color={porter?"#e5e2d5":look.trim??(glass?"#7e9397":"#b5b7ad")}/>)}
  <B size={[w.w+1,.65,w.d+1]} position={[0,h+.32,0]} color="#d4d5ca"/>
  {porter&&Array.from({length:Math.floor(w.w/3.2)},(_,i)=><B key={i} size={[.4,h,.35]} position={[-w.w/2+1.6+i*3.2,h/2,w.d/2+.12]} color="#ece8da"/>)}
  {b.id==="qnc"&&Array.from({length:Math.floor(w.w/4.5)},(_,i)=><B key={i} size={[.3,h*.8,1]} position={[-w.w/2+2+i*4.5,h*.55,w.d/2+.2]} color="#a98e63"/>)}
  {b.id==="gym"&&<B size={[w.w+1.5,1.2,w.d+1.5]} position={[0,h+.6,0]} color="#7e8689"/>}
  {/* Rooftop plant on the bigger blocks. */}
  {w.w*w.d>500&&<B size={[w.w*.3,1.8,w.d*.25]} position={[w.w*.15,h+1.5,-w.d*.15]} color="#a8aca4"/>}
  {door&&<Entrance b={b} glass={glass} dark={DARK.has(look.color)||glass} at={door.at} out={door.out} width={Math.min(12,(door.face.endsWith("z")?w.w:w.d)*.4)} sign={(door.face.endsWith("z")?w.w:w.d)*.85}/>}
 </group>;
}

/** Canopy, glass doors and the building's name over them, facing out of the wall at `at`. */
function Entrance({b,glass,dark,at,out,width,sign}:{b:CampusBuilding;glass:boolean;dark:boolean;at:Point;out:Point;width:number;sign:number}){
 return <group position={[at[0],0,at[1]]} rotation={[0,Math.atan2(out[0],out[1]),0]}>
  <B size={[width,.25,5.5]} position={[0,4.7,2]} color={glass?"#7ba0a4":"#b7b5a5"}/>
  {[-1,1].map(s=><B key={s} size={[.25,4.6,.25]} position={[s*width*.45,2.3,4.4]} color="#8a8f8c"/>)}
  <B size={[3.6,3.5,.14]} position={[0,1.75,.15]} color="#294754"/>
  <Decal text={b.name} color={dark?"#f2e7c4":"#344c52"} position={[0,5.8,.3]} rotation={[0,0,0]} size={[Math.min(sign,b.name.length*.75),1.1]}/>
  <Decal text={b.code} color={dark?"#f2e7c4":"#344c52"} position={[width*.45+1.2,2.6,.3]} rotation={[0,0,0]} size={[1.6,1.1]}/>
 </group>;
}

/** A flat shape on the ground (the plaza, the ponds). */
function Flat({poly,color,y,rough=.85,metal=0}:{poly:Point[];color:string;y:number;rough?:number;metal?:number}){
 const g=useMemo(()=>{const s=new THREE.Shape(poly.map(([x,z])=>new THREE.Vector2(x,-z)));const geo=new THREE.ShapeGeometry(s);geo.rotateX(-Math.PI/2);geo.translate(0,y,0);return geo;},[poly,y]);
 useEffect(()=>()=>g.dispose(),[g]);
 return <mesh geometry={g} material={mat(color,{rough,metal})} receiveShadow/>;
}

/** Laurel Creek and its ponds: water ribbons with muddy banks. */
function Creek(){
 return <group name="Laurel Creek">
  <Walkway points={LAUREL_CREEK} width={CREEK_WIDTH+3} color="#6f7f5a" lift={.04}/>
  <Walkway points={LAUREL_CREEK} width={CREEK_WIDTH} color="#4f8fa1" lift={.07}/>
  {PONDS.map((p,i)=><group key={i}><Flat poly={p.map(([x,z])=>{const c=p.reduce((a,q)=>[a[0]+q[0]/p.length,a[1]+q[1]/p.length],[0,0]);return [c[0]+(x-c[0])*1.08,c[1]+(z-c[1])*1.08] as Point;})} color="#6f7f5a" y={.045}/><Flat poly={p} color="#4f8fa1" y={.075} rough={.15} metal={.1}/></group>)}
 </group>;
}

/**
 * Ring Road as one continuous loop: mitred asphalt, curbs and sidewalks on both
 * sides, and dashed centre lines. Drawn by hand because the site builder lays
 * each straight piece separately, and on a curve that left wedge-shaped gaps
 * at every joint and cut the sidewalks into pieces. The outer curb and
 * sidewalk open where the side streets join, and an apron of asphalt fills
 * the space between each side street's end and the ring.
 */
const RING_TOP = .028;
function ringGeometry(){
 const N=RING_POINTS.length,P=RING_POINTS;
 // Cross-section frames: the average direction at each point, with a mitre so widths stay even.
 const frames=P.map((p,i)=>{
  const a=P[(i+N-1)%N],b=P[(i+1)%N];
  let ux=p[0]-a[0],uz=p[1]-a[1],vx=b[0]-p[0],vz=b[1]-p[1];
  const lu=Math.hypot(ux,uz),lv=Math.hypot(vx,vz);ux/=lu;uz/=lu;vx/=lv;vz/=lv;
  let tx=ux+vx,tz=uz+vz;const lt=Math.hypot(tx,tz);tx/=lt;tz/=lt;
  const m=Math.min(2,1/Math.max(.5,tx*ux+tz*uz));
  return {p,n:[-tz,tx] as Point,m};
 });
 // Which side of the centre line is outside the ring (+1 = along the frame normal).
 const cx=P.reduce((s,p)=>s+p[0],0)/N,cz=P.reduce((s,p)=>s+p[1],0)/N;
 const out=Math.sign(frames[0].n[0]*(P[0][0]-cx)+frames[0].n[1]*(P[0][1]-cz));
 const inGap=(s:number)=>RING_JUNCTIONS.some(j=>{const d=((s-(j.gap[0]+j.gap[1])/2)%RING_LENGTH+RING_LENGTH*1.5)%RING_LENGTH-RING_LENGTH/2;return Math.abs(d)<(j.gap[1]-j.gap[0])/2;});
 const at=(i:number,off:number,y:number)=>{const f=frames[i%N];return [f.p[0]+f.n[0]*f.m*off,y,f.p[1]+f.n[1]*f.m*off];};
 const build=()=>({pos:[] as number[],uv:[] as number[]});
 const quad=(g:{pos:number[];uv:number[]},a:number[],b:number[],c:number[],d:number[],uv:number[][])=>{g.pos.push(...a,...b,...c,...a,...c,...d);for(const k of [0,1,2,0,2,3])g.uv.push(...uv[k]);};
 const asphalt=build(),curb=build(),walk=build();
 /** A raised strip between two offsets (signed, along the normal), top and both sides; `gapped` opens it at the junctions. */
 const strip=(g:{pos:number[];uv:number[]},o0:number,o1:number,y0:number,y1:number,gapped:boolean)=>{
  for(let i=0;i<N;i++){
   const s0=RING_LENGTHS[i],s1=RING_LENGTHS[i+1];
   if(gapped&&inGap((s0+s1)/2))continue;
   const w=Math.abs(o1-o0);
   quad(g,at(i,o0,y1),at(i,o1,y1),at(i+1,o1,y1),at(i+1,o0,y1),[[s0,0],[s0,w],[s1,w],[s1,0]]);
   // Side faces: this winding faces −normal, so the face on the larger offset is turned round to face +normal.
   if(y0<y1)for(const o of [o0,o1]){
    const u=[[s0,0],[s0,y1-y0],[s1,y1-y0],[s1,0]];
    if(o===Math.max(o0,o1))quad(g,at(i,o,y0),at(i+1,o,y0),at(i+1,o,y1),at(i,o,y1),[u[0],u[3],u[2],u[1]]);
    else quad(g,at(i,o,y0),at(i,o,y1),at(i+1,o,y1),at(i+1,o,y0),u);
   }
  }
 };
 const {width:W,boulevardWidth:BL,sidewalkWidth:SW}=RING_DIMS,h=W/2;
 strip(asphalt,-h,h,RING_TOP,RING_TOP,false);
 for(const side of [1,-1]){
  const gapped=side===out;
  strip(curb,side*h,side*(h+.18),0,.14,gapped);
  strip(walk,side*(h+BL),side*(h+BL+SW),0,.08,gapped);
 }
 // Aprons: asphalt from where each side street stops to the ring's centre line.
 for(const j of RING_JUNCTIONS){
  const r=j.road,[dx,dz]=j.dir,nx=-dz*r.width/2,nz=dx*r.width/2,y=RING_TOP-.004;
  quad(asphalt,[j.cut[0]-nx,y,j.cut[1]-nz],[j.cut[0]+nx,y,j.cut[1]+nz],[r.to[0]+nx,y,r.to[1]+nz],[r.to[0]-nx,y,r.to[1]-nz],[[0,0],[1,0],[1,1],[0,1]]);
 }
 // Dashed yellow centre line, broken at the junctions.
 const dash=build();
 for(let s=3;s<RING_LENGTH-3;s+=9){
  if(inGap(s+1.5))continue;
  let i=0;while(RING_LENGTHS[i+1]<s)i++;
  const a=P[i],b=P[(i+1)%N],L=RING_LENGTHS[i+1]-RING_LENGTHS[i],u=(s-RING_LENGTHS[i])/L,tx=(b[0]-a[0])/L,tz=(b[1]-a[1])/L,x=a[0]+(b[0]-a[0])*u,z=a[1]+(b[1]-a[1])*u,y=RING_TOP+.006;
  quad(dash,[x-tz*.07,y,z+tx*.07],[x+tz*.07,y,z-tx*.07],[x+tx*3+tz*.07,y,z+tz*3-tx*.07],[x+tx*3-tz*.07,y,z+tz*3+tx*.07],[[0,0],[0,1],[1,1],[1,0]]);
 }
 const geo=(g:{pos:number[];uv:number[]})=>{
  const out=new THREE.BufferGeometry();
  out.setAttribute("position",new THREE.Float32BufferAttribute(g.pos,3));
  out.setAttribute("uv",new THREE.Float32BufferAttribute(g.uv,2));
  // Wind every triangle to face out of the road (up, or away from the strip), whichever way the loop runs.
  const p=out.getAttribute("position") as THREE.BufferAttribute,A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3(),n=new THREE.Vector3();
  for(let i=0;i<p.count;i+=3){
   A.fromBufferAttribute(p,i);B.fromBufferAttribute(p,i+1);C.fromBufferAttribute(p,i+2);
   n.subVectors(B,A).cross(C.clone().sub(A));
   const flat=Math.abs(n.y)>Math.hypot(n.x,n.z);
   if(flat?n.y<0:false){p.setXYZ(i+1,C.x,C.y,C.z);p.setXYZ(i+2,B.x,B.y,B.z);}
  }
  out.computeVertexNormals();
  return out;
 };
 return {asphalt:geo(asphalt),curb:geo(curb),walk:geo(walk),dash:geo(dash)};
}
function RingRoad(){
 const g=useMemo(()=>ringGeometry(),[]);
 useEffect(()=>()=>Object.values(g).forEach(x=>x.dispose()),[g]);
 return <group name="Ring Road">
  <mesh geometry={g.asphalt} material={groundAsphalt()} receiveShadow/>
  <mesh geometry={g.curb} material={concreteSurface()} receiveShadow/>
  <mesh geometry={g.walk} material={groundConcrete()} receiveShadow/>
  <mesh geometry={g.dash} material={mat("#e9b62a",{rough:.6})} receiveShadow/>
 </group>;
}

/** A glazed skybridge between two buildings, second floor up. */
function Skybridge({s}:{s:(typeof SKYBRIDGES)[number]}){
 const {width:W,height:H,y}=SKYBRIDGE;
 return <group position={[s.mid[0],y,s.mid[1]]} rotation={[0,-s.heading,0]} name={"Skybridge "+s.a+"-"+s.b}>
  <B size={[s.length,H,W]} position={[0,H/2,0]} color="#5a7880"/>
  <B size={[s.length,.4,W+.8]} position={[0,H+.2,0]} color="#c1c9c3"/>
  <B size={[s.length,.5,W+.4]} position={[0,-.25,0]} color="#9aa29c"/>
  {[-1,1].map(k=><B key={k} size={[s.length-.4,1.7,.12]} position={[0,H/2,k*(W/2+.03)]} color="#496673"/>)}
 </group>;
}

export function VatalooCampus({children}:{children?:ReactNode}){
 const benches=useMemo(()=>CAMPUS_WALKWAYS.filter(w=>w.width>3).flatMap(w=>w.points.slice(1).map((q,i)=>{const p=w.points[i],L=Math.hypot(q[0]-p[0],q[1]-p[1]);if(L<30)return null;const dx=(q[0]-p[0])/L,dz=(q[1]-p[1])/L;return {x:(p[0]+q[0])/2-dz*3.4,z:(p[1]+q[1])/2+dx*3.4,h:Math.atan2(dz,dx)};}).filter(b=>b!==null)),[]);
 return <group name="University of Vataloo">
  <RingRoad/>
  {CAMPUS_WALKWAYS.map(w=><Walkway key={w.id} points={w.points} width={w.width}/>)}
  <Flat poly={PLAZA_POLYGON} color="#cdc6b3" y={.09}/>
  <Creek/>
  {CAMPUS_BUILDINGS.map(b=><group key={b.id} name={b.name}>{b.wings.map((w,i)=><Wing key={i} b={b} w={w} main={i===0}/>)}</group>)}
  {SKYBRIDGES.map(s=><Skybridge key={s.a+s.b} s={s}/>)}
  {benches.map((b,i)=><group key={i} position={[b.x,0,b.z]} rotation={[0,-b.h,0]}><B size={[3.2,.12,.9]} position={[0,.55,0]} color="#92795a"/><B size={[3.2,.6,.12]} position={[0,.9,-.42]} color="#92795a"/>{[-1.3,1.3].map(a=><B key={a} size={[.12,.55,.8]} position={[a,.28,0]} color="#4a4f53"/>)}</group>)}
  <Sign text="UNIVERSITY OF VATALOO" sub="Columbia Street · Ring Road · campus map" at={[601,COLUMBIA_Z+12]} heading={-Math.PI/2} width={13}/>
  <Sign text="RING ROAD" sub="Hagey Boulevard · campus north" at={[676,COLUMBIA_Z+11]} heading={-Math.PI/2} width={8}/>
  <Sign text="UNIVERSITY AVENUE" sub="Engineering 5 · 6 · 7 · East Campus" at={[892,COLUMBIA_Z+22]} heading={Math.PI} width={10}/>
  <Sign text="LAUREL CREEK" sub="University Station · ponds" at={[564,774]} heading={0} width={7}/>
  {children}
 </group>;
}
