import {create} from "zustand";
import {persist} from "zustand/middleware";
import {useGame} from "./store";
import {COOPS,SUBJECTS,STATIONS,trainAt,V6_BUILDINGS} from "../world/v6";
import {host} from "../core/simHost";
import {runtime} from "../core/runtime";
import {buildingY} from "../world/v6Geometry";
import {groundAt} from "../world/terrain";
export type V6Panel = {kind:"station";id:string}|{kind:"building";id:string}|{kind:"lesson";id:string}|{kind:"principal"}|{kind:"shop";id:string};
interface V6State {
 panel:V6Panel|null; ride:number|null;time:number; interior:string|null;
 lessons:string[];coops:Record<string,"following"|"office">;workSeconds:number;
 loanVisit:"none"|"documents"|"approved";condo:boolean;rentSeconds:number;
 setPanel:(p:V6Panel|null)=>void;answer:(id:string,index:number)=>boolean;
 hire:(id:string)=>void;assign:(id:string,mode:"following"|"office")=>void;
 tick:(dt:number)=>void;board:(id:number)=>void;leaveTrain:()=>void;
 visit:(id:string)=>void;exit:()=>void;buyCondo:()=>void;loanAction:()=>void;
}
export const useV6=create<V6State>()(persist((set,get)=>({
 panel:null,ride:null,time:0,interior:null,lessons:[],coops:{},workSeconds:0,loanVisit:"none",condo:false,rentSeconds:0,
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
  if(rent>=120){rent%=120;if(s.condo)useGame.getState().pay(325,"Northshore condo rent");}
  set({time:s.time+dt,workSeconds:work,rentSeconds:rent});
 },
 board:id=>{const s=get();const t=trainAt(s.time,id);if(t.station<0)return;set({ride:id,panel:null});useGame.getState().toast("On board · E to leave at a station. Next: "+STATIONS[t.next].name);},
 leaveTrain:()=>{const s=get();if(s.ride===null)return;const t=trainAt(s.time,s.ride);if(t.station<0){useGame.getState().toast("Wait until the train stops at a station.");return;}const p=STATIONS[t.station].at;set({ride:null});host.sim?.teleport(p[0],p[1]+18,0);runtime.cameraDistance=1;},
 visit:id=>{const b=V6_BUILDINGS.find(b=>b.id===id);if(!b)return;set({panel:null,interior:id});host.sim?.teleport(b.at[0],b.at[1]+3,buildingY(b)+48.35-groundAt(b.at[0],b.at[1]+3));runtime.cameraDistance=.45;},
 exit:()=>{const b=V6_BUILDINGS.find(b=>b.id===get().interior);if(!b)return;set({interior:null,panel:null});host.sim?.teleport(b.at[0],b.at[1]+b.size[1]/2+4,buildingY(b)-groundAt(b.at[0],b.at[1]+b.size[1]/2+4));runtime.cameraDistance=1;},
 buyCondo:()=>{if(get().condo)return;if(!useGame.getState().spend(14000))return;set({condo:true});useGame.getState().toast("Northshore suite purchased. Rent: $325 every 2 minutes of play.");},
 loanAction:()=>{const s=get(),g=useGame.getState();if(s.loanVisit==="none"){set({loanVisit:"documents"});g.toast("Visit Northshore Residences and collect the appraisal in its upper suite.");}
 else if(s.loanVisit==="documents"){g.toast("Collect the appraisal at Northshore before returning.");}
 },
}),{name:"caivan-v6-progress",version:6,partialize:s=>({lessons:s.lessons,coops:s.coops,loanVisit:s.loanVisit,condo:s.condo,workSeconds:s.workSeconds,rentSeconds:s.rentSeconds})}));
export function approveLoan(){const s=useV6.getState();if(s.loanVisit!=="documents")return;useV6.setState({loanVisit:"approved"});useGame.getState().pay(900,"Riverbank appraisal visit");}
export function v6Offer():{text:string;run:()=>void}|null{
 const v=useV6.getState(),b=runtime.body;
 if(v.ride!==null){const t=trainAt(v.time,v.ride);return {text:t.station>=0?"Leave train · "+STATIONS[t.station].name:"Riding express · next "+STATIONS[t.next].name,run:v.leaveTrain};}
 if(v.interior){return {text:"Visit "+V6_BUILDINGS.find(x=>x.id===v.interior)?.name+" · services / elevator",run:()=>v.setPanel({kind:"building",id:v.interior!})};}
 if(b.control.kind!=="foot")return null;
 for(const s of STATIONS)if(Math.hypot(b.x-s.at[0],b.z-s.at[1]-18)<8)return {text:"Express rail · "+s.name,run:()=>v.setPanel({kind:"station",id:s.id})};
 for(const x of V6_BUILDINGS){
  if(Math.abs(b.y-buildingY(x))>5)continue;
  if(Math.hypot(b.x-x.at[0],b.z-(x.at[1]+x.size[1]/2+3))>5)continue;
  if(x.id==="principal")return {text:"Meet Principal Chen · university co-ops",run:()=>v.setPanel({kind:"principal"})};
  if(SUBJECTS.some(q=>q.id===x.id))return {text:"Learn · "+x.name,run:()=>v.setPanel({kind:"lesson",id:x.id})};
  if(x.id==="loan-tower"||x.id==="condo-tower")return {text:"Enter "+x.name+" · elevator to floor 16",run:()=>v.visit(x.id)};
  if(x.kind==="shop"||x.id==="terminal"||x.id==="gym")return {text:"Visit "+x.name,run:()=>v.setPanel({kind:"shop",id:x.id})};
 }return null;
}
