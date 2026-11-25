import type {Lot} from "@/lib/models/community";
import {SUBURB_ROADS,V6_BUILDINGS,roadClear} from "./v6";
export const V6_LOTS:Lot[]=[];
for(const r of SUBURB_ROADS.filter(r=>["west-spine","east-avenue","east-mid","east-link","south-avenue","south-return"].includes(r.id))){
 const dx=r.to[0]-r.from[0],dz=r.to[1]-r.from[1],len=Math.hypot(dx,dz),ux=dx/len,uz=dz/len;
 for(let s=24;s<len-20;s+=23)for(const side of [-1,1]){
  const x=r.from[0]+ux*s-uz*side*29,z=r.from[1]+uz*s+ux*side*29;
  if(!roadClear(x,z,SUBURB_ROADS.filter(o=>o!==r),17))continue;
  if(V6_BUILDINGS.some(b=>Math.abs(x-b.at[0])<b.size[0]/2+14&&Math.abs(z-b.at[1])<b.size[1]/2+20))continue;
  const n=V6_LOTS.length;
  V6_LOTS.push({id:"v6-lot-"+n,number:"V6-"+String(n).padStart(3,"0"),position:[x,0,z],rotation:[0,Math.atan2(uz*side,-ux*side),0],width:20,depth:34,frontSetback:6,status:n%7===0?"available":"sold",collection:n%4===0?"Condo Towns":"Detached Collection",placeholder:{style:n%3===0?"modern":n%3===1?"classic":"craftsman",bodyColor:["#c9c1b3","#ebe5d9","#8f9694","#b7a08b"][n%4],roofColor:"#42484b",storeys:2,garageSide:n%2?"left":"right"}});
 }
}
