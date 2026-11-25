import {create} from "zustand";
import {persist} from "zustand/middleware";
import {useGame} from "./store";
import {BUSINESSES,COOPS,SUBJECTS,STATIONS,STATION_ACCESS,trainAt,V6_BUILDINGS} from "../world/v6";
import {MALL_STORES,inMall} from "../world/mall";
import {gigById} from "./gigs";
import {host} from "../core/simHost";
import {runtime} from "../core/runtime";
import {buildingY} from "../world/v6Geometry";
import {groundAt} from "../world/terrain";
export type V6Panel = {kind:"station";id:string}|{kind:"building";id:string}|{kind:"lesson";id:string}|{kind:"principal"}|{kind:"shop";id:string}|{kind:"business";id:string};
interface V6State {
 panel:V6Panel|null; ride:number|null;time:number; interior:string|null;
 lessons:string[];coops:Record<string,"following"|"office">;workSeconds:number;
 loanVisit:"none"|"documents"|"approved";condo:boolean;rentSeconds:number;
 setPanel:(p:V6Panel|null)=>void;answer:(id:string,index:number)=>boolean;
 hire:(id:string)=>void;assign:(id:string,mode:"following"|"office")=>void;
 tick:(dt:number)=>void;board:(id:number)=>void;leaveTrain:()=>void;
 visit:(id:string)=>void;exit:()=>void;buyCondo:()=>void;loanAction:()=>void;
 /** The side job you're on (see gigs.ts), and the step you're at; jobs finished; mall shops visited for the survey. */
 gig:{id:string;step:number}|null;gigsDone:string[];mallVisits:string[];
 /** Rent from units bought through Owawa Realty and Northstar Insurance dividends, paid every 2 minutes. */
 investments:number;
 startGig:(id:string)=>void;dropGig:()=>void;
 /** Express ticket from the travel agency: straight to a station's doors. */
 travel:(stationId:string,price:number)=>void;
 invest:(price:number,income:number,label:string)=>void;
 /** Opened a business or mall shop (counts toward the mall survey). */
 visited:(id:string)=>void;
}
/** Saved-progress upgrades. v7 (6.4): the Northshore condo is reset (it kept collecting rent); everything else carries over. */
export function migrateV6(persisted: unknown, version: number) {
 const p = (persisted ?? {}) as Partial<V6State>;
 return (version < 7 ? { ...p, condo: false, rentSeconds: 0 } : p) as V6State;
}
export const useV6=create<V6State>()(persist((set,get)=>({
 panel:null,ride:null,time:0,interior:null,lessons:[],coops:{},workSeconds:0,loanVisit:"none",condo:false,rentSeconds:0,
 gig:null,gigsDone:[],mallVisits:[],investments:0,
 startGig:id=>{const g=gigById(id);if(!g)return;set({gig:{id,step:0},mallVisits:[]});useGame.getState().toast(g.title+": "+g.steps[0].hint+".");},
 dropGig:()=>{if(get().gig)useGame.getState().toast("Side job dropped.");set({gig:null});},
 travel:(stationId,price)=>{const a=STATION_ACCESS.find(a=>a.id===stationId);if(!a||!useGame.getState().spend(price))return;set({panel:null});host.sim?.teleport(a.exit[0],a.exit[1],0,Math.atan2(a.face[1],a.face[0]));runtime.cameraDistance=1;useGame.getState().toast("Express to "+a.name+". Welcome!");},
 invest:(price,income,label)=>{if(!useGame.getState().spend(price))return;set(s=>({investments:s.investments+income}));useGame.getState().toast(label+": +$"+income+" every 2 minutes of play.");},
 visited:id=>{const s=get();if(s.gig?.id==="mall-walker"&&s.gig.step===0&&MALL_STORES.some(m=>m.id===id&&m.id!=="mall-desk")&&!s.mallVisits.includes(id))set({mallVisits:[...s.mallVisits,id]});},
 setPanel:panel=>set({panel}),
 answer:(id,index)=>{
  const q=SUBJECTS.find(s=>s.id===id);if(!q)return false;
  if(index!==q.correct){useGame.getState().toast("Try again. Think through the question.");return false;}
  if(!get().lessons.includes(id)){set(s=>({lessons:[...s.lessons,id]}));useGame.getState().pay(180,"University: "+id);}
  return true;
 },
 hire:id=>{if(get().coops[id])return;const c=COOPS.find(c=>c.id===id);if(!c)return;if(!get().lessons.includes(c.subject)){useGame.getState().toast("Finish the "+c.subject+" lesson first.");return;}set(s=>({coops:{...s.coops,[id]:"following"}}));useGame.getState().toast(c.name+" is following you. Assign them to the office here at any time.");},
 assign:(id,mode)=>{if(get().coops[id])set(s=>({coops:{...s.coops,[id]:mode}}));},
 tick:dt=>{
  if(useGame.getState().phase!=="playing")return;
  const s=get();let work=s.workSeconds+dt,rent=s.rentSeconds+dt;
  if(work>=120){work%=120;const pay=COOPS.filter(c=>s.coops[c.id]==="office").reduce((a,c)=>a+c.pay,0);if(pay)useGame.getState().pay(pay,"University co-op office work");}
  if(rent>=120){rent%=120;if(s.condo)useGame.getState().pay(325,"Northshore condo rent");if(s.investments)useGame.getState().pay(s.investments,"Owawa rentals and dividends");}
  // Side job steps: arrive at the spot (or finish the shop survey) to move on; the last step pays.
  if(s.gig){const g=gigById(s.gig.id),st=g?.steps[s.gig.step],b=runtime.body;
   const reached=st&&(st.visits?s.mallVisits.length>=st.visits:Math.hypot(b.x-st.at[0],b.z-st.at[1])<st.radius&&b.control.kind==="foot");
   if(g&&st&&reached){useGame.getState().toast(st.done);if(s.gig.step+1>=g.steps.length){set(x=>({gig:null,gigsDone:[...x.gigsDone,g.id]}));useGame.getState().pay(g.reward,g.title);}else{set({gig:{id:g.id,step:s.gig.step+1}});useGame.getState().toast(g.steps[s.gig.step+1].hint+".");}}}
  set({time:s.time+dt,workSeconds:work,rentSeconds:rent});
 },
 board:id=>{const s=get();const t=trainAt(s.time,id);if(t.station<0)return;set({ride:id,panel:null});useGame.getState().toast("On board · E to leave at a station. Next: "+STATIONS[t.next].name);},
 leaveTrain:()=>{const s=get();if(s.ride===null)return;const t=trainAt(s.time,s.ride);if(t.station<0){useGame.getState().toast("Wait until the train stops at a station.");return;}const a=STATION_ACCESS[t.station];set({ride:null});host.sim?.teleport(a.exit[0],a.exit[1],0,Math.atan2(a.face[1],a.face[0]));runtime.cameraDistance=1;},
 visit:id=>{const b=V6_BUILDINGS.find(b=>b.id===id);if(!b)return;set({panel:null,interior:id});host.sim?.teleport(b.at[0],b.at[1]+3,buildingY(b)+48.35-groundAt(b.at[0],b.at[1]+3));runtime.cameraDistance=.45;},
 exit:()=>{const b=V6_BUILDINGS.find(b=>b.id===get().interior);if(!b)return;set({interior:null,panel:null});host.sim?.teleport(b.at[0],b.at[1]+b.size[1]/2+4,buildingY(b)-groundAt(b.at[0],b.at[1]+b.size[1]/2+4));runtime.cameraDistance=1;},
 buyCondo:()=>{if(get().condo)return;if(!useGame.getState().spend(14000))return;set({condo:true});useGame.getState().toast("Northshore suite purchased. Rent: $325 every 2 minutes of play.");},
 loanAction:()=>{const s=get(),g=useGame.getState();if(s.loanVisit==="none"){set({loanVisit:"documents"});g.toast("Visit Northshore Residences and collect the appraisal in its upper suite.");}
 else if(s.loanVisit==="documents"){g.toast("Collect the appraisal at Northshore before returning.");}
 },
}),{name:"caivan-v6-progress",version:7,
 migrate:migrateV6,
 partialize:s=>({lessons:s.lessons,coops:s.coops,loanVisit:s.loanVisit,condo:s.condo,workSeconds:s.workSeconds,rentSeconds:s.rentSeconds,gig:s.gig,gigsDone:s.gigsDone,mallVisits:s.mallVisits,investments:s.investments})}));
export function approveLoan(){const s=useV6.getState();if(s.loanVisit!=="documents")return;useV6.setState({loanVisit:"approved"});useGame.getState().pay(900,"Riverbank appraisal visit");}
export function v6Offer():{text:string;run:()=>void}|null{
 const v=useV6.getState(),b=runtime.body;
 if(v.ride!==null){const t=trainAt(v.time,v.ride);return {text:t.station>=0?"Leave train · "+STATIONS[t.station].name:"Riding express · next "+STATIONS[t.next].name,run:v.leaveTrain};}
 if(v.interior){return {text:"Visit "+V6_BUILDINGS.find(x=>x.id===v.interior)?.name+" · services / elevator",run:()=>v.setPanel({kind:"building",id:v.interior!})};}
 if(b.control.kind!=="foot")return null;
 // The mall's shops and info desk, and Owawa's businesses.
 if(inMall(b.x,b.z))for(const m of MALL_STORES)if(Math.hypot(b.x-m.spot[0],b.z-m.spot[1])<2.6)return {text:"Visit "+m.name.charAt(0)+m.name.slice(1).toLowerCase(),run:()=>{v.visited(m.id);v.setPanel({kind:"business",id:m.id});}};
 for(const s of BUSINESSES)if(Math.hypot(b.x-s.door[0],b.z-s.door[1])<4)return {text:"Enter "+s.name,run:()=>{v.visited(s.id);v.setPanel({kind:"business",id:s.id});}};
 for(const a of STATION_ACCESS)if(Math.hypot(b.x-(a.door[0]+a.exit[0])/2,b.z-(a.door[1]+a.exit[1])/2)<5.5)return {text:"Express rail · "+a.name,run:()=>v.setPanel({kind:"station",id:a.id})};
 for(const x of V6_BUILDINGS){
  if(Math.abs(b.y-buildingY(x))>5)continue;
  // At the door: campus buildings know theirs; the rest open in the south wall.
  const [dx,dz]=x.door??[x.at[0],x.at[1]+x.size[1]/2+3];
  if(Math.hypot(b.x-dx,b.z-dz)>5)continue;
  if(x.id==="principal")return {text:"Meet Principal Chen · university co-ops",run:()=>v.setPanel({kind:"principal"})};
  if(SUBJECTS.some(q=>q.id===x.id))return {text:"Learn · "+x.name,run:()=>v.setPanel({kind:"lesson",id:x.id})};
  if(x.id==="loan-tower"||x.id==="condo-tower")return {text:"Enter "+x.name+" · elevator to floor 16",run:()=>v.visit(x.id)};
  if(x.kind==="shop"||x.id==="terminal"||x.id==="gym")return {text:"Visit "+x.name,run:()=>v.setPanel({kind:"shop",id:x.id})};
 }return null;
}
