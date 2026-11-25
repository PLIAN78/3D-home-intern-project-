import {useEffect,useMemo,useRef} from "react";
import {useFrame,useThree} from "@react-three/fiber";
import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {buildSite} from "@/components/viewer/CommunityScene";
import type {Community} from "@/lib/models/community";
import {runtime} from "../core/runtime";
import {host} from "../core/simHost";
import {Human,TOWNSFOLK} from "../models/human";
import {Decal} from "../render/decal";
import {concreteSurface,groundAsphalt,groundConcrete,mat} from "../render/materials";
import {useV6} from "../story/v6Store";
import {AirportScene} from "./AirportScene";
import {VatalooCampus} from "./VatalooCampus";
import {StationEntrance} from "./StationEntrance";
import {Armchair,Bed,Bookshelf,Chair,Counter,DiningSet,FloorLamp,Kitchen,LiftDoors,Plant,Rug,Sofa,Table,TV,WallArt} from "../models/furniture";
import {Shores} from "./Shores";
import {OwawaBlocks} from "./OwawaBlocks";
import {TrafficLights} from "./TrafficLights";
import {Walkway} from "./Walkways";
import {deckAt} from "./lake";
import {JetSkiRider} from "../models/jetski";
import {MEADOW_PAVING} from "./meadows";
import {railPosts,RAIL_POST_SIZE} from "./railPosts";
import {B,Sign} from "./props";
import {Building,facade} from "./OwawaScene";
import {ABUTMENT,CITY_Y,LAKE_Y,groundAt,HILL_TREES} from "./terrain";
import {buildingY,BRIDGES} from "./v6Geometry";
import {V6_BUILDINGS,NORTH_ROADS,PORTS,RAIL_PATH,RAIL_Y,STATION_ACCESS,TRAIN_COUNT,trainAt,pathPoint,ISLAND_WALKS,NPC_JETSKIS,npcJetSki,STUDENT_LOOPS,COOPS,type V6Building} from "./v6";

/** Walkways on Heron Gardens Island follow the ground, and the pier decks where they run onto them. */
const islandSurface=(x:number,z:number)=>Math.max(groundAt(x,z),deckAt(x,z)??-Infinity);
/**
 * A road bridge: a concrete deck (the road ribbon is drawn on top by
 * CountryRoads), parapets, piers standing in the river, and abutments at each
 * end where the ramps arrive.
 */
function Bridge({b}:{b:typeof BRIDGES[number]}){
 const rise=b.y-LAKE_Y;
 const piers=[-.3,0,.3].map(t=>t*b.length);
 return <group position={[b.x,b.y,b.z]} name="River bridge">
  <B size={[b.width,.6,b.length]} position={[0,-.3,0]} color="#7d8180"/>
  <B size={[b.width+.4,.35,b.length]} position={[0,-.75,0]} color="#9a9b95"/>
  {[-1,1].map(s=><group key={s}>
   <B size={[.4,1,b.length]} position={[s*(b.width/2-.2),.5,0]} color="#c1c3bd"/>
   <B size={[.12,.12,b.length]} position={[s*(b.width/2-.2),1.06,0]} color="#8d9496"/>
   {piers.map(z=><B key={z} size={[1.1,rise+1.5,1.4]} position={[s*b.width*.3,-(rise+1.5)/2-.6,z]} color="#a5a49b"/>)}
   {/* Abutment: a concrete face where the fill under each deck end meets the river. */}
   <B size={[b.width+8,rise+4.6,1.4]} position={[0,-(rise+4.6)/2-.6,s*(b.length/2-ABUTMENT-.9)]} color="#a9a79f"/>
   <B size={[b.width+8.4,.4,1.8]} position={[0,-.75,s*(b.length/2-ABUTMENT-.9)]} color="#9a9b95"/>
  </group>)}
  {piers.map(z=><B key={z} size={[b.width*.72,.8,1.2]} position={[0,-1.2,z]} color="#9a9b95"/>)}
 </group>;
}
function River(){
 return <group name="Owawa River"><Shores/>{BRIDGES.map(b=><Bridge key={b.x} b={b}/>)}
 {ISLAND_WALKS.map(w=><Walkway key={w.id} points={w.points} width={w.width} surface={islandSurface} color={w.id==="island-promenade"?"#c9bea6":"#bfb49c"}/>)}
 {PORTS.map(p=><group key={p.id} position={[p.shore[0],0,p.shore[1]]}><Sign text={p.name.toUpperCase()} sub="F - motorboat / jet ski" at={[0,0]} heading={-Math.PI/2} width={8}/></group>)}
 {Array.from({length:NPC_JETSKIS},(_,i)=><RiverJetSki key={i} index={i}/>)}
 </group>;
}
/** A townsperson out on a jet ski, looping an open reach of the river and leaning into the bends. */
function RiverJetSki({index}:{index:number}){
 const ref=useRef<THREE.Group>(null),tilt=useRef<THREE.Group>(null),camera=useThree(s=>s.camera);
 const speed=()=>npcJetSki(index,useV6.getState().time).speed;
 useFrame(()=>{if(!ref.current)return;const time=useV6.getState().time,p=npcJetSki(index,time),q=npcJetSki(index,time+.3);
  ref.current.visible=Math.hypot(camera.position.x-p.x,camera.position.z-p.z)<600;
  ref.current.position.set(p.x,LAKE_Y-.05+Math.sin(time*2.3+index)*.05,p.z);ref.current.rotation.y=-p.heading;
  let turn=q.heading-p.heading;turn=Math.atan2(Math.sin(turn),Math.cos(turn));
  if(tilt.current)tilt.current.rotation.set(Math.max(-.35,Math.min(.35,turn*1.4)),0,.06);});
 return <group ref={ref} name="River jet ski"><group ref={tilt}><JetSkiRider outfit={index} color={["#e0a43a","#2f8f9d","#c2463a","#4f7d3a","#7a5aa6"][index%5]} speed={speed}/></group></group>;
}
function CivicRoads(){
 const site=useMemo(()=>buildSite({id:"north",name:"North Shore",lots:[],trees:[],roads:NORTH_ROADS} as unknown as Community,[],{ground:false}),[]);
 useEffect(()=>()=>Object.values(site).forEach(g=>g.dispose()),[site]);
 return <group position={[0,CITY_Y+.03,0]}><mesh geometry={site.asphalt} material={groundAsphalt()} receiveShadow/><mesh geometry={site.concrete} material={groundConcrete()} receiveShadow/><mesh geometry={site.curb} material={concreteSurface()} receiveShadow/></group>;
}
function CivicBuilding({b}:{b:V6Building}){
 const group=useRef<THREE.Group>(null),camera=useThree(s=>s.camera);
 useFrame(()=>{if(group.current)group.current.visible=Math.hypot(camera.position.x-b.at[0],camera.position.z-b.at[1])<1100;});
 if(b.level==="ground"&&((b.at[0]>490&&b.at[1]>500)||b.id==="terminal"))return null;
 // Owawa's blocks are drawn together, merged (OwawaBlocks).
 if(b.id.startsWith("owawa-"))return null;
 const visit=b.id==="loan-tower"||b.id==="condo-tower",[w,d,h]=b.size;
 return <group ref={group} position={[0,buildingY(b),0]}>
 {visit?<VisitableTower b={b}/>:<><Building b={{at:b.at,size:b.size,kind:b.kind==="tower"?"tower":b.kind==="shop"||b.kind==="historic"?"lowrise":"midrise",tone:b.tone,name:b.name}}/>
 {b.kind==="historic"&&<group position={[b.at[0],h,b.at[1]]}><mesh rotation={[0,Math.PI/4,0]} material={mat("#52605d")} castShadow><coneGeometry args={[Math.min(w,d)*.38,7,4]}/></mesh></group>}
 {b.kind==="campus"&&<B size={[w*.35,h*.4,d*.6]} position={[b.at[0]+w*.35,h*.25,b.at[1]+d*.35]} color="#a89c89"/>}
 </>}
 </group>;
}
function VisitableTower({b}:{b:V6Building}){
 const [x,z]=b.at,[w,d,h]=b.size;
 const skin=facade("tower",b.tone);
 return <group position={[x,0,z]} name={b.name}>
 {/* Four facade walls leave a genuine hollow lobby and visitable 16th floor. */}
 {[-1,1].map(s=><group key={s}><mesh position={[s*w/2,h/2,0]} material={skin} castShadow><boxGeometry args={[.35,h,d]}/></mesh><mesh position={[0,(h+5)/2,s*d/2]} material={skin} castShadow><boxGeometry args={[w,h-5,.35]}/></mesh></group>)}
 <B size={[w,.25,d]} position={[0,.125,0]} color="#b8b3a7"/><B size={[w,.25,d]} position={[0,48.125,0]} color="#d1c8b5"/><B size={[w,.25,d]} position={[0,53.125,0]} color="#eee9dd"/><B size={[w+1,1,d+1]} position={[0,h,0]} color="#c2c4bf"/>
 {[-1,1].map(s=><B key={s} size={[w/2-2,5,.4]} position={[s*(w/4+1),2.5,d/2]} color="#a7b6b7"/>)}
 <Decal text={b.name} color="#f4e4b7" position={[0,6.2,d/2+.24]} rotation={[0,0,0]} size={[w*.85,1.1]}/>
 <TowerLobby w={w} d={d} bank={b.id==="loan-tower"}/>
 <group position={[0,48.25,0]}>{b.id==="loan-tower"?<BankSuite w={w} d={d}/>:<CondoSuite w={w} d={d}/>}</group>
 </group>;
}
/** Ground-floor lobby: stone floor, reception, waiting seats, plants, lift doors and a feature wall. */
function TowerLobby({w,d,bank}:{w:number;d:number;bank:boolean}){
 return <group name="Lobby">
  <B size={[w-1,.02,d-1]} position={[0,.26,0]} color="#d8d2c4" cast={false}/>
  <Rug position={[0,.27,d/2-7]} w={8} d={5} color={bank?"#1f3a5f":"#6f5a48"} border="#c9b98f"/>
  <Counter position={[-w/2+6,.25,-2]} rotation={Math.PI/2} w={4} sign={bank?"#1f3a5f":"#c9a54f"}/>
  <Sofa position={[3,.25,d/2-9]} rotation={0} color={bank?"#3d4a52":"#8c6a52"}/>
  <Armchair position={[6.5,.25,d/2-6.5]} rotation={-Math.PI/2} color="#a7a39a"/>
  <Table position={[3,.25,d/2-7]} w={1.4} d={.7} h={.42} top="#2b2f34"/>
  {[[-w/2+1.5,d/2-1.5],[w/2-1.5,d/2-1.5],[-w/2+1.5,-d/2+3],[w/2-1.5,-d/2+3]].map(([px,pz],i)=><Plant key={i} position={[px,.25,pz]} h={2}/>)}
  {[-3,3].map(px=><LiftDoors key={px} position={[px,.25,-d/2+.6]}/>)}
  <B size={[14,4,.2]} position={[0,2.3,-d/2+.3]} color={bank?"#2b4a63":"#8a6a52"}/>
  <Decal text={bank?"RIVERBANK FINANCIAL":"NORTHSHORE RESIDENCES"} color="#f4e4b7" position={[0,3.9,-d/2+.45]} rotation={[0,0,0]} size={[10,.7]}/>
  <WallArt position={[w/2-.4,2.6,0]} rotation={-Math.PI/2} w={3} h={1.8} color={bank?"#2f6f86":"#c9744f"}/>
  <group position={[-w/2+4.5,.25,-2]} rotation={[0,-Math.PI/2,0]}><Human outfit={TOWNSFOLK[bank?3:5]}/></group>
 </group>;
}
/** Riverbank Financial's client suite: reception, waiting area, the adviser's office and a meeting table. */
function BankSuite({w,d}:{w:number;d:number}){
 return <group name="Client suite">
  <B size={[w-1,.02,d-1]} position={[0,.13,0]} color="#c9c1b3" cast={false}/>
  <LiftDoors position={[0,.12,-d/2+1.1]}/><Decal text="ELEVATOR · E" color="#f2e7c8" position={[0,2.95,-d/2+1.2]} rotation={[0,0,0]} size={[2.4,.4]}/>
  <Counter position={[-5,.12,-d/2+5]} w={3.5} sign="#1f3a5f"/>
  <Rug position={[-8,.13,3]} w={5} d={4} color="#1f3a5f"/>
  <Sofa position={[-8,.12,1.5]} color="#3d4a52"/><Armchair position={[-10.8,.12,3.8]} rotation={Math.PI/2} color="#7a6450"/><Table position={[-8,.12,3.4]} w={1.2} d={.6} h={.42} top="#2b2f34"/>
  <Table position={[6,.12,-4]} w={2.2} d={1} top="#5a4632"/>
  <B size={[.6,.38,.03]} position={[6,1.05,-4.3]} color="#15171a"/>
  <Chair position={[6,.12,-5.1]} color="#22262b"/>{[-.7,.7].map(px=><Chair key={px} position={[6+px,.12,-2.9]} rotation={Math.PI} color="#7a6450"/>)}
  <Bookshelf position={[6,.12,-d/2+1.4]} w={3.6} h={2.6}/>
  <DiningSet position={[6,.12,6]} seats={4} top="#e8e4da" chair="#3d4a52"/>
  {[[-w/2+1.4,-d/2+1.6],[w/2-1.4,-d/2+1.6],[-w/2+1.4,d/2-1.6],[w/2-1.4,d/2-1.6]].map(([px,pz],i)=><Plant key={i} position={[px,.12,pz]} h={1.8}/>)}
  <WallArt position={[-w/2+.4,2.2,-4]} rotation={Math.PI/2} w={2.4} h={1.4}/><WallArt position={[w/2-.4,2.2,4]} rotation={-Math.PI/2} w={2} h={1.2} color="#2f6f86"/>
  <FloorLamp position={[-11,.12,0]}/>
  <group position={[6,.12,-5.1]}><Human outfit={TOWNSFOLK[3]} pose="sit"/></group>
 </group>;
}
/** The Northshore show suite: living room, kitchen and dining, and a bedroom corner. */
function CondoSuite({w,d}:{w:number;d:number}){
 return <group name="Show suite">
  <B size={[w-1,.02,d-1]} position={[0,.13,0]} color="#b8a27f" cast={false}/>
  <LiftDoors position={[0,.12,-d/2+1.1]}/><Decal text="ELEVATOR · E" color="#f2e7c8" position={[0,2.95,-d/2+1.2]} rotation={[0,0,0]} size={[2.4,.4]}/>
  {/* Living room by the south windows */}
  <Rug position={[-6,.13,6]} w={6} d={4.2} color="#6f5a48"/>
  <Sofa position={[-6,.12,4.4]} width={2.6} color="#8c8f86"/><Armchair position={[-9.4,.12,6.6]} rotation={Math.PI/2} color="#b5553c"/><Table position={[-6,.12,6.4]} w={1.3} d={.7} h={.42} top="#5a4632"/>
  <TV position={[-6,.12,9.6]} rotation={Math.PI} w={1.8}/><FloorLamp position={[-9.2,.12,4]}/>
  {/* Kitchen along the west wall, dining in front */}
  <Kitchen position={[-w/2+1,.12,-4]} rotation={Math.PI/2} w={5}/>
  <DiningSet position={[-6,.12,-4]} seats={4}/>
  {/* Bedroom corner */}
  <Rug position={[8,.13,-6]} w={4.4} d={5} color="#9aa3a6"/>
  <Bed position={[8,.12,-7]} duvet="#c9d4d8"/>
  <WallArt position={[8,2.4,-d/2+1.1]} w={2} h={1}/>
  <Bookshelf position={[w/2-.9,.12,2]} rotation={-Math.PI/2} w={2.4} h={2.2}/>
  {[[-w/2+1.4,d/2-1.6],[w/2-1.4,d/2-1.6],[3,-d/2+1.6]].map(([px,pz],i)=><Plant key={i} position={[px,.12,pz]} h={1.6}/>)}
  <WallArt position={[-w/2+.4,2.2,6]} rotation={Math.PI/2} w={2.2} h={1.3} color="#c9744f"/>
  <group position={[2,.12,4]}><Human outfit={TOWNSFOLK[5]}/></group>
 </group>;
}
function Campus(){
 return <VatalooCampus><Flowers/>{Array.from({length:36},(_,i)=><Student key={i} index={i}/>)}
 <group position={[590,0,761]}><Human outfit={TOWNSFOLK[6]} pose="wave"/></group>
 {COOPS.map((c,i)=><Coop key={c.id} id={c.id} index={i}/>)}</VatalooCampus>;
}
function Flowers(){
 const ref=useRef<THREE.InstancedMesh>(null);
 useEffect(()=>{if(!ref.current)return;const dummy=new THREE.Object3D(),col=new THREE.Color();for(let i=0;i<720;i++){const beds=[[545,680],[625,675],[675,700],[692,630],[805,655],[807,800],[625,850],[552,770],[735,800],[814,855],[860,565],[555,555]],bed=beds[Math.floor(i/60)],a=i*2.3999,r=.3+(i%13)*.12;dummy.position.set(bed[0]+Math.cos(a)*r,.25,bed[1]+Math.sin(a)*r);dummy.scale.setScalar(.18+(i%4)*.03);dummy.updateMatrix();ref.current.setMatrixAt(i,dummy.matrix);ref.current.setColorAt(i,col.set(["#d9b4ce","#e4c863","#9d87b1","#e6e4d2"][i%4]));}ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;},[]);
 return <instancedMesh ref={ref} args={[undefined,undefined,720]}><icosahedronGeometry args={[1,0]}/><meshStandardMaterial roughness={1}/></instancedMesh>;
}
function Student({index}:{index:number}){
 const ref=useRef<THREE.Group>(null),camera=useThree(s=>s.camera);
 useFrame(()=>{if(!ref.current)return;const path=STUDENT_LOOPS[index%STUDENT_LOOPS.length],closed=[...path,path[0]],p=pathPoint(closed,useV6.getState().time*(1.1+(index%4)*.1)+index*27,true);ref.current.visible=Math.hypot(camera.position.x-p.x,camera.position.z-p.z)<150;ref.current.position.set(p.x,0,p.z);ref.current.rotation.y=-p.heading;});
 return <group ref={ref}><Human outfit={TOWNSFOLK[index%TOWNSFOLK.length]} motion={{speed:()=>1.3,airborne:()=>false}}/></group>;
}
function Coop({id,index}:{id:string;index:number}){
 const ref=useRef<THREE.Group>(null),mode=useV6(s=>s.coops[id]);
 useFrame((_,dt)=>{if(!ref.current)return;const b=runtime.body;let x=590+index*2,z=762,y=0;if(mode==="following"){x=b.x-Math.cos(b.heading)*(3+index*1.4)+Math.sin(b.heading)*(index-1);z=b.z-Math.sin(b.heading)*(3+index*1.4)-Math.cos(b.heading)*(index-1);y=groundAt(x,z);}else if(mode==="office"){x=145+index*2;z=-25;}const g=ref.current;g.visible=Math.hypot(b.x-x,b.z-z)<170;g.position.lerp(new THREE.Vector3(x,y,z),Math.min(1,dt*3));g.rotation.y=-b.heading;});
 return <group ref={ref} position={[590+index*2,0,762]}><Human outfit={TOWNSFOLK[(index+2)%TOWNSFOLK.length]} motion={{speed:()=>mode==="following"?runtime.body.speed:0,airborne:()=>false}}/></group>;
}
function Rail(){
 const structure=useMemo(()=>{const deck:THREE.BufferGeometry[]=[],rails:THREE.BufferGeometry[]=[],posts:THREE.BufferGeometry[]=[];
 for(let i=0;i<RAIL_PATH.length-1;i++){const a=RAIL_PATH[i],b=RAIL_PATH[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(L<.01)continue;const h=Math.atan2(b[1]-a[1],b[0]-a[0]);const part=(w:number,y:number,z:number,target:THREE.BufferGeometry[])=>{const g=new THREE.BoxGeometry(L+.04,y,w);g.translate(0,0,z);g.rotateY(-h);g.translate((a[0]+b[0])/2,RAIL_Y-1,(a[1]+b[1])/2);target.push(g);};part(5,.6,0,deck);part(.16,.85,-1.2,rails);part(.16,.85,1.2,rails);}
 for(const p of railPosts()){const g=new THREE.BoxGeometry(RAIL_POST_SIZE,p.height,RAIL_POST_SIZE);g.translate(p.x,p.ground+p.height/2,p.z);posts.push(g);}
 const merge=(a:THREE.BufferGeometry[])=>{const g=mergeGeometries(a,false);a.forEach(g=>g.dispose());return g;};return {deck:merge(deck),rails:merge(rails),posts:merge(posts)};},[]);
 useEffect(()=>()=>Object.values(structure).forEach(g=>g?.dispose()),[structure]);
 return <group name="Owawa Express">{Object.entries(structure).map(([key,g])=>g&&<mesh key={key} geometry={g} material={mat(key==="rails"?"#839397":"#a8aaa0")} castShadow receiveShadow/>)}
 {STATION_ACCESS.map(a=><StationEntrance key={a.id} access={a}/>)}
 {Array.from({length:TRAIN_COUNT},(_,i)=><Train key={i} index={i}/>)}
 </group>;
}
function Train({index}:{index:number}){
 const refs=useRef<(THREE.Group|null)[]>([]);
 useFrame(()=>{const t=trainAt(useV6.getState().time,index);refs.current.forEach((r,k)=>{if(!r)return;const p=pathPoint(RAIL_PATH,t.distance-k*16,true);r.position.set(p.x,RAIL_Y+.3,p.z);r.rotation.y=-p.heading;});});
 return <group name={"Express "+(index+1)}>{[0,1,2].map(k=><group key={k} ref={r=>{refs.current[k]=r;}}><B size={[15,3.1,3.2]} position={[0,1.5,0]} color="#d9e1dc"/><B size={[14.2,1.2,3.25]} position={[0,2,0]} color="#274652"/><B size={[15,.5,3.28]} position={[0,.6,0]} color="#398c99"/><B size={[14,.3,3]} position={[0,3.2,0]} color="#bcc9c5"/>{[-5,-1,3].map(x=><B key={x} size={[.16,1.3,3.3]} position={[x,2,0]} color="#c5d2ce"/>)}{[-5,5].map(x=><B key={x} size={[2,.65,2.8]} position={[x,-.1,0]} color="#333c40"/>)}</group>)}</group>;
}
function Wildlife({index}:{index:number}){
 const ref=useRef<THREE.Group>(null),camera=useThree(s=>s.camera);
 const tree=HILL_TREES[(index*37+150)%HILL_TREES.length],small=index%3===0;
 useFrame(()=>{if(!ref.current||!tree)return;const t=useV6.getState().time*.12+index,x=tree.position[0]+Math.sin(t)*3,z=tree.position[1]+Math.cos(t*.8)*3;ref.current.visible=Math.hypot(camera.position.x-x,camera.position.z-z)<150;ref.current.position.set(x,groundAt(x,z),z);ref.current.rotation.y=-Math.atan2(-Math.sin(t*.8)*.8,Math.cos(t));});
 const c=index%3===0?"#b5aca0":index%3===1?"#a78761":"#af7349";
 return <group ref={ref} name={small?"Wild rabbit":index%3===1?"Wild deer":"Wild fox"} scale={small?.4:1}>
 <mesh position={[0,1,0]} scale={[1,.5,.32]} material={mat(c)} castShadow><sphereGeometry args={[.7,10,8]}/></mesh>
 <mesh position={[.75,1.4,0]} scale={[.7,1,.65]} material={mat(c)}><sphereGeometry args={[.28,8,8]}/></mesh>
 {[-1,1].flatMap(x=>[-1,1].map(z=><B key={x+"-"+z} size={[.1,.7,.1]} position={[x*.4,.4,z*.2]} color={c}/>))}
 {[-1,1].map(z=><B key={z} size={[.1,small?.6:.25,.08]} position={[.72,small?1.9:1.7,z*.14]} color={c}/>)}
 </group>;
}
export function V6Dynamics(){
 useFrame((_,rawDt)=>{const v=useV6.getState();v.tick(Math.min(rawDt,.1));if(v.ride!==null&&host.sim){const t=trainAt(useV6.getState().time,v.ride);host.sim.teleport(t.x,t.z,RAIL_Y+1-groundAt(t.x,t.z),t.heading);runtime.body=host.sim.focus();runtime.body.speed=t.speed;}},-25);
 return null;
}
/** North Meadows parking courts: asphalt with a row of stalls along each side and an aisle between. */
function MeadowParking(){
 return <group name="North Meadows parking">{MEADOW_PAVING.map((p,i)=>{
  const stalls:number[]=[];for(let x=p.x0+10;x<p.x1-1;x+=2.8)stalls.push(x);
  return <group key={i}>
   <B size={[p.x1-p.x0,.06,p.z1-p.z0]} position={[(p.x0+p.x1)/2,.03,(p.z0+p.z1)/2]} color="#585c5f" cast={false}/>
   {stalls.flatMap(x=>[p.z0+2.5,p.z1-2.5].map(z=><B key={x+"-"+z} size={[.12,.02,4.6]} position={[x,.07,z]} color="#e7e3d6" cast={false}/>))}
  </group>;})}</group>;
}
export function V6Scene(){
 return <group name="V6 River City"><River/><CivicRoads/><OwawaBlocks/><TrafficLights/><MeadowParking/>{V6_BUILDINGS.map(b=><CivicBuilding key={b.id} b={b}/>)}<Campus/><AirportScene/><Rail/>{Array.from({length:42},(_,i)=><Wildlife key={i} index={i}/>)}<V6Dynamics/></group>;
}
