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
import {waterNormalMap} from "../render/textures";
import {concreteSurface,groundAsphalt,groundConcrete,mat} from "../render/materials";
import {useV6} from "../story/v6Store";
import {AirportScene} from "./AirportScene";
import {VatalooCampus} from "./VatalooCampus";
import {StationEntrance} from "./StationEntrance";
import {B,Sign} from "./props";
import {Building,facade} from "./OwawaScene";
import {CITY_Y,LAKE_Y,groundAt,terrainHeight,HILL_TREES} from "./terrain";
import {buildingY,BRIDGES} from "./v6Geometry";
import {V6_BUILDINGS,NORTH_ROADS,riverZ,riverWidth,PORTS,RAIL_PATH,RAIL_LENGTH,RAIL_Y,STATIONS,TRAIN_COUNT,trainAt,pathPoint,SHIP_ROUTE,SHIP_LENGTH,STUDENT_LOOPS,COOPS,type Point,type V6Building} from "./v6";

function Ribbon({points,width,y,color}:{points:Point[];width:number;y:number;color:string}){
 const geo=useMemo(()=>{const p:number[]=[],idx:number[]=[];points.forEach(([x,z],i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz)||1;for(const side of [-1,1])p.push(x-dz/L*width/2*side,y,z+dx/L*width/2*side);if(i){const n=i*2;idx.push(n-2,n-1,n,n-1,n+1,n);}});const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g;},[points,width,y]);
 useEffect(()=>()=>geo.dispose(),[geo]);
 return <mesh geometry={geo} material={mat(color,{rough:.6})} receiveShadow/>;
}
const riverPoints:Point[]=Array.from({length:161},(_,i)=>{const x=-1100+i*2200/160;return [x,riverZ(x)];});
function BridgeApproach({bridge}:{bridge:typeof BRIDGES[number]}){
 const geo=useMemo(()=>{const p:number[]=[],idx:number[]=[];for(let i=0;i<=110;i++){const z=bridge.z-220+i*4;const y=Math.abs(z-bridge.z)<bridge.length/2?bridge.y:groundAt(bridge.x,z);p.push(bridge.x-bridge.width/2+.3,y+.04,z,bridge.x+bridge.width/2-.3,y+.04,z);if(i){const n=i*2;idx.push(n-2,n,n-1,n-1,n,n+1);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g;},[bridge]);
 useEffect(()=>()=>geo.dispose(),[geo]);
 return <mesh geometry={geo} material={mat('#626a6a')} receiveShadow/>;
}
function River(){
 const water=useMemo(()=>{const p:number[]=[],idx:number[]=[];riverPoints.forEach(([x,z],i)=>{const w=riverWidth(x);p.push(x,LAKE_Y,z-w/2,x,LAKE_Y,z+w/2);if(i){const n=i*2;idx.push(n-2,n-1,n,n-1,n+1,n);}});const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g;},[]);
 const m=useMemo(()=>new THREE.MeshPhysicalMaterial({color:"#397c89",roughness:.2,normalMap:waterNormalMap(),normalScale:new THREE.Vector2(.22,.22),metalness:.25,transparent:true,opacity:.87,clearcoat:1,side:THREE.DoubleSide}),[]);
 useEffect(()=>()=>{water.dispose();m.dispose();},[water,m]);
 return <group name="Owawa River"><mesh geometry={water} material={m} receiveShadow/>{BRIDGES.map(b=><BridgeApproach key={b.x} bridge={b}/>)}{BRIDGES.map(b=><group key={b.x} position={[b.x,b.y,b.z]}><B size={[b.width,.6,b.length]} position={[0,-.3,0]} color="#64696a"/>{[-1,1].map(s=><group key={s}><B size={[.4,1,b.length]} position={[s*(b.width/2-.2),.5,0]} color="#c1c3bd"/>{[-.32,.32].map(t=><B key={t} size={[1.2,b.y-LAKE_Y,1.5]} position={[s*b.width*.35,-(b.y-LAKE_Y)/2,b.length*t]} color="#a5a49b"/>)}</group>)}</group>)}
 <Ribbon points={[[-724,-658],[-584,-658]]} width={4} y={LAKE_Y+2.57} color="#b9ad96"/>
 <Ribbon points={[[-646,-658],[-646,-623]]} width={4} y={LAKE_Y+2.57} color="#b9ad96"/>
 {PORTS.map(p=><group key={p.id} position={[p.shore[0],0,p.shore[1]]}><Sign text={p.name.toUpperCase()} sub="F - motorboat / motor ship" at={[0,0]} heading={-Math.PI/2} width={8}/></group>)}
 {Array.from({length:6},(_,i)=><Ship key={i} index={i}/>)}
 </group>;
}
function Ship({index}:{index:number}){
 const ref=useRef<THREE.Group>(null);
 useFrame(()=>{if(!ref.current)return;const time=useV6.getState().time;const reverse=index%2===1;const s=(time*(5+index*.35)+index*SHIP_LENGTH/6)%SHIP_LENGTH;const p=pathPoint(SHIP_ROUTE,reverse?SHIP_LENGTH-s:s);ref.current.position.set(p.x,LAKE_Y+.2+Math.sin(time*.9+index)*.1,p.z+(reverse?-8:0));ref.current.rotation.set(0,-p.heading+(reverse?Math.PI:0),Math.sin(time*.5+index)*.015);});
 const cargo=index%3===0;
 return <group ref={ref} name="River traffic"><B size={[cargo?28:13,2.4,cargo?7:4.6]} position={[0,0,0]} color={index%2?"#e0e3db":"#304953"}/><B size={[cargo?25:11,.7,cargo?6.8:4.2]} position={[0,1.4,0]} color="#c4b6a0"/><B size={[cargo?6:5,3,3.6]} position={[-3,3,0]} color="#e6e7df"/><B size={[4,1.1,3.7]} position={[-2.7,3.6,0]} color="#33505c"/>{cargo&&[-1,1,3].map((x,i)=><B key={x} size={[5,2.5,5.8]} position={[x*3,3,0]} color={["#a14f37","#3e7173","#bd984d"][i]}/>)}<B size={[.14,1.5,.14]} position={[-4,4.8,0]} color="#b9c0bb"/></group>;
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
 <B size={[4,4,.4]} position={[0,50,-d/2+1]} color="#687982"/><Decal text="ELEVATOR · E" color="#f2e7c8" position={[0,51,-d/2+1.25]} rotation={[0,0,0]} size={[3,.6]}/>
 <B size={[8,.7,3]} position={[-6,48.6,1]} color="#b9a68b"/><B size={[7,1.2,2.8]} position={[6,48.8,-5]} color="#777f72"/><B size={[2.5,.45,2]} position={[6,48.5,-.8]} color="#a17d55"/><B size={[2,2,.5]} position={[-9,49.2,-d/2+1]} color="#5a6967"/>
 <HumanAt at={[2,z]} y={0} hidden/>
 <group position={[-6,48.3,-1]}><Human outfit={TOWNSFOLK[3]}/></group>
 </group>;
}
function HumanAt({at,y=0,hidden=false}:{at:Point;y?:number;hidden?:boolean}){return hidden?null:<group position={[at[0],y,at[1]]}><Human outfit={TOWNSFOLK[0]}/></group>;}
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
 for(let s=0;s<RAIL_LENGTH;s+=75){const p=pathPoint(RAIL_PATH,s,true),ground=terrainHeight(p.x,p.z),height=RAIL_Y-1-ground;if(height<1)continue;const g=new THREE.BoxGeometry(1.2,height,1.2);g.translate(p.x,ground+height/2,p.z);posts.push(g);}
 const merge=(a:THREE.BufferGeometry[])=>{const g=mergeGeometries(a,false);a.forEach(g=>g.dispose());return g;};return {deck:merge(deck),rails:merge(rails),posts:merge(posts)};},[]);
 useEffect(()=>()=>Object.values(structure).forEach(g=>g?.dispose()),[structure]);
 return <group name="Owawa Express">{Object.entries(structure).map(([key,g])=>g&&<mesh key={key} geometry={g} material={mat(key==="rails"?"#839397":"#a8aaa0")} castShadow receiveShadow/>)}
 {STATIONS.map(s=><StationEntrance key={s.id} station={s}/>)}
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
export function V6Scene(){
 return <group name="V6 River City"><River/><CivicRoads/>{V6_BUILDINGS.map(b=><CivicBuilding key={b.id} b={b}/>)}<Campus/><AirportScene/><Rail/>{Array.from({length:42},(_,i)=><Wildlife key={i} index={i}/>)}<V6Dynamics/></group>;
}
