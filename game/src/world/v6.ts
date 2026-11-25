/** V6 world contract. All coordinates are metres; +z is south. No runtime imports. */
export type Point = [number, number];
export const V6_VERSION = "6.1.0";
export const riverZ = (x: number) => -555 + x * 0.07 + 24 * Math.sin(x / 240);
export const riverWidth = (x: number) => 100 + 14 * Math.cos(x / 190);
export const ISLANDS = [
 {name:"Heron Gardens Island",at:[-650,-655] as Point,rx:100,rz:55,developed:true},
];
export function islandRadius(x: number, z: number) {
  return Math.min(...ISLANDS.map(i => Math.hypot((x-i.at[0])/i.rx, (z-i.at[1])/i.rz)));
}
export function riverDistance(x: number, z: number) { return Math.abs(z-riverZ(x)); }
export function inRiver(x: number, z: number) { return Math.abs(x)<1100 && riverDistance(x,z)<riverWidth(x)/2 && islandRadius(x,z)>1; }
export const NORTH_SHORE_Z = (x: number) => {
 const river=riverZ(x)-riverWidth(x)/2-48;
 const u=(x+690)/190;
 return Math.abs(u)<1.15?Math.min(river,-650-150*Math.sqrt(Math.max(0,1-Math.min(1,u*u)))-35):river;
};
export function inNorthCity(x: number,z:number,pad=0) {
  return x>-950-pad && x<955+pad && z>-945-pad && z<NORTH_SHORE_Z(x)+pad;
}
export const CAMPUS = { x0:490,z0:505,x1:940,z1:930 };
export const AIRPORT = { x0:-940,z0:-310,x1:-635,z1:270 };
export const SUBURBS = [
 {x0:-600,z0:-260,x1:-455,z1:370},
 {x0:455,z0:20,x1:900,z1:380},
 {x0:-320,z0:470,x1:380,z1:655},
];
export function inRect(x:number,z:number,r:{x0:number;z0:number;x1:number;z1:number},p=0) { return x>r.x0-p&&x<r.x1+p&&z>r.z0-p&&z<r.z1+p; }
export const nearV6Development = (x:number,z:number,pad=0) => inRect(x,z,CAMPUS,pad)||inRect(x,z,AIRPORT,pad)||SUBURBS.some(r=>inRect(x,z,r,pad));
export interface V6Building {
 id:string; name:string; at:Point; size:[number,number,number];
 kind:"condo"|"shop"|"campus"|"historic"|"terminal"|"gym"|"tower";
 tone:number; level:"ground"|"city"|"island";
}
export interface V6Road { id:string; from:Point; to:Point; width:number; sidewalkWidth:number; boulevardWidth:number }
const dims={width:9,sidewalkWidth:2,boulevardWidth:2};
const rd=(id:string,from:Point,to:Point):V6Road=>({id,from,to,...dims});
export const SUBURB_ROADS: V6Road[] = [
 rd("west-link",[-530,0],[-430,0]),rd("west-spine",[-530,-235],[-530,340]),
 rd("east-link",[330,300],[860,300]),rd("east-loop",[860,300],[860,60]),
 rd("east-north",[430,0],[480,60]),rd("east-avenue",[480,60],[860,60]),
 rd("east-mid",[480,180],[860,180]),rd("east-spine",[480,60],[480,300]),
 rd("east-cross",[670,60],[670,300]),
 rd("south-link",[-110,300],[-110,520]),rd("south-avenue",[-290,520],[360,520]),
 rd("south-loop",[360,520],[360,610]),rd("south-return",[360,610],[-290,610]),rd("south-west",[-290,610],[-290,520]),
 rd("campus-approach",[860,300],[875,525]),
 rd("vataloo-ring-0",[540,550],[575,520]),
 rd("vataloo-ring-1",[575,520],[785,520]),
 rd("vataloo-ring-2",[785,520],[840,565]),
 rd("vataloo-ring-3",[840,565],[850,770]),
 rd("vataloo-ring-4",[850,770],[810,895]),
 rd("vataloo-ring-5",[810,895],[590,910]),
 rd("vataloo-ring-6",[590,910],[520,840]),
 rd("vataloo-ring-7",[520,840],[510,650]),
 rd("vataloo-ring-8",[510,650],[540,550]),
 rd("campus-east-access",[875,525],[875,875]),
 rd("airport-link",[-530,0],[-680,0]),rd("airport-drive",[-680,-240],[-680,210]),
 rd("west-river-approach",[-530,-235],[-480,riverZ(-480)+220]),
 rd("ridge-river-approach",[110,-130],[100,riverZ(100)+220]),
];
export const RIVER_WALK:Point[] = Array.from({length:25},(_,i)=>{const x=-930+i*77;return [x,NORTH_SHORE_Z(x)] as Point;});
export const NORTH_ROADS:V6Road[] = RIVER_WALK.slice(1).map((p,i)=>rd("riverfront-"+i,RIVER_WALK[i],p));
NORTH_ROADS.push(rd("heritage-avenue",[-900,-850],[540,-850]));
for(let x=-850;x<520;x+=225) {
 const z=NORTH_SHORE_Z(x);
 NORTH_ROADS.push(rd("north-link-"+x,[x,z],[x,-850]));
}
NORTH_ROADS.push(rd("city-west-link",[540,-850],[610,-820]));
for(const x of [-480,100])NORTH_ROADS.push(rd("bridge-city-link-"+x,[x,NORTH_SHORE_Z(x)],[x,-850]));
export function distanceToSegment(x:number,z:number,a:Point,b:Point) {
 const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
 return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
}
export function roadClear(x:number,z:number,roads:V6Road[],pad:number) {return roads.every(r=>distanceToSegment(x,z,r.from,r.to)>r.width/2+r.sidewalkWidth+r.boulevardWidth+pad);}
export const V6_BUILDINGS:V6Building[]=[
 {id:"showroom",name:"CAIVAN · HERON GARDENS",at:[-275,riverZ(-255)-2],size:[25,16,7],kind:"shop",tone:0,level:"island"},
 {id:"island-store",name:"HERON GENERAL STORE",at:[-210,riverZ(-255)-2],size:[17,14,6],kind:"shop",tone:1,level:"island"},
 {id:"sushi",name:"SAKURA SUSHI",at:[-242,riverZ(-255)-2],size:[16,14,6],kind:"shop",tone:3,level:"island"},
 {id:"loan-tower",name:"RIVERBANK FINANCIAL",at:[-410,-810],size:[32,30,112],kind:"tower",tone:1,level:"city"},
 {id:"condo-tower",name:"NORTHSHORE RESIDENCES",at:[-170,-810],size:[34,32,138],kind:"tower",tone:0,level:"city"},
 {id:"principal",name:"UNIVERSITY OF VATALOO - NEEDLES HALL",at:[590,745],size:[46,25,15],kind:"campus",tone:2,level:"ground"},
 {id:"engineering",name:"ENGINEERING 7",at:[912,665],size:[44,54,24],kind:"campus",tone:0,level:"ground"},
 {id:"engineering-5",name:"ENGINEERING 5",at:[912,752],size:[44,48,24],kind:"campus",tone:1,level:"ground"},
 {id:"science",name:"SCIENCE TEACHING COMPLEX",at:[772,746],size:[49,36,18],kind:"campus",tone:0,level:"ground"},
 {id:"business",name:"TATHAM CO-OP CENTRE",at:[605,810],size:[50,27,14],kind:"campus",tone:1,level:"ground"},
 {id:"arts",name:"HAGEY HALL - ARTS & HUMANITIES",at:[728,843],size:[62,28,15],kind:"historic",tone:3,level:"ground"},
 {id:"cafeteria",name:"STUDENT LIFE CENTRE - CAFE",at:[642,579],size:[51,35,9],kind:"shop",tone:1,level:"ground"},
 {id:"gym",name:"PHYSICAL ACTIVITIES COMPLEX",at:[570,595],size:[56,46,13],kind:"gym",tone:2,level:"ground"},
 {id:"davis",name:"DAVIS COMPUTING CENTRE",at:[784,595],size:[55,35,13],kind:"campus",tone:0,level:"ground"},
 {id:"math",name:"MATHEMATICS & COMPUTER",at:[708,590],size:[49,42,23],kind:"campus",tone:2,level:"ground"},
 {id:"qnc",name:"QUANTUM-NANO CENTRE",at:[724,675],size:[54,39,24],kind:"campus",tone:0,level:"ground"},
 {id:"porter",name:"DANA PORTER LIBRARY",at:[660,738],size:[30,30,40],kind:"campus",tone:2,level:"ground"},
 {id:"environment",name:"ENVIRONMENT 3",at:[588,858],size:[39,25,14],kind:"campus",tone:1,level:"ground"},
 {id:"terminal",name:"OWAWA REGIONAL AIRPORT",at:[-710,90],size:[40,90,13.5],kind:"terminal",tone:0,level:"ground"},
];
V6_BUILDINGS.push(
 {id:"east-condos",name:"EASTSIDE GARDEN CONDOS",at:[755,235],size:[36,28,18],kind:"condo",tone:0,level:"ground"},
 {id:"south-condos",name:"SOUTH COMMONS CONDOS",at:[-145,565],size:[34,24,15],kind:"condo",tone:2,level:"ground"},
 {id:"ridge-strip",name:"RIDGE MARKET · CAFE · PHARMACY",at:[-300,35],size:[55,25,7],kind:"shop",tone:1,level:"ground"},
);
for (let i=0;i<5;i++) V6_BUILDINGS.push({id:"island-home-"+i,name:"Heron Gardens "+(i+1),at:[-342+i*30,riverZ(-255)-20],size:[20,12,9],kind:"condo",tone:i%4,level:"island"});
for(const b of V6_BUILDINGS.filter(b=>b.level==="island")){
 if(b.id.startsWith("island-home")){const n=Number(b.id.split("-").at(-1));b.at=[-708+n*29,-675];}
 else b.at=b.id==="showroom"?[-646,-639]:b.id==="sushi"?[-624,-638]:[-604,-638];
 b.size[0]*=.65;
}
// Mixed civic, commercial, heritage and residential blocks fill the north shore,
// leaving generous road corridors and the original eastern civic centre intact.
for (let x=-900;x<500;x+=66) for(let z=-905;z<NORTH_SHORE_Z(x)-22;z+=69){
 if(x< -440 && Math.hypot((x+690)/190,(z+650)/150)<1.4)continue;
 if(!roadClear(x,z,NORTH_ROADS,24))continue;
 if(V6_BUILDINGS.some(b=>Math.abs(x-b.at[0])<b.size[0]/2+25&&Math.abs(z-b.at[1])<b.size[1]/2+25))continue;
 const n=V6_BUILDINGS.length, kind=(["tower","condo","historic","campus","shop"] as const)[n%5];
 V6_BUILDINGS.push({id:"north-"+n,name:(["QUAYSIDE OFFICES","RIVER LOFTS","HERITAGE MARKET","CIVIC LIBRARY","RIVERSIDE SHOPS"])[n%5],at:[x,z],size:[28+(n%3)*3,27,kind==="tower"?65+(n%6)*13:kind==="condo"?25:12+(n%3)*5],kind,tone:n%4,level:"city"});
}
for(const [i,at] of ([[530,100],[720,105],[810,245],[-570,95],[-570,265],[65,560],[-245,565]] as Point[]).entries())
 V6_BUILDINGS.push({id:"strip-"+i,name:["RIDGE COFFEE · PHARMACY","GROCER · BAKERY","EASTSIDE STRIP MALL","WEST MARKET","BOOKS · CAFE","SOUTH COMMONS","CYCLE · GARDEN SHOP"][i],at,size:[42,18,7],kind:"shop",tone:i%4,level:"ground"});
export const CAMPUS_PATHS:Point[][]=[
 [[530,700],[645,700],[720,720],[834,705]],
 [[642,610],[650,680],[660,715]],[[712,620],[712,648]],
 [[785,617],[785,695],[798,780],[770,825]],
 [[590,763],[590,783],[650,790],[699,810]],[[620,755],[630,755]],
 [[560,840],[560,810],[590,783]],[[650,790],[675,835],[695,843]],
 [[810,630],[860,630],[875,635],[912,635]],[[825,785],[860,785],[880,785],[912,779]],
 [[460,558],[505,558],[535,650],[530,700]],
 [[834,705],[875,705],[912,695]],[[772,767],[798,780]],[[728,860],[675,865],[650,790]],
];
export const CAMPUS_TREES:( {position:Point;y:number;scale:number;variant:0|1|2})[]=[];
for(let x=545;x<840;x+=25)for(let z=635;z<895;z+=25){
 if(!roadClear(x,z,SUBURB_ROADS,3)||V6_BUILDINGS.some(b=>Math.abs(x-b.at[0])<b.size[0]/2+6&&Math.abs(z-b.at[1])<b.size[1]/2+6))continue;
 if(CAMPUS_PATHS.some(p=>p.slice(1).some((b,i)=>distanceToSegment(x,z,p[i],b)<4)))continue;
 CAMPUS_TREES.push({position:[x,z],y:0,scale:.72+((x+z)%3)*.12,variant:0});
}
export const STUDENT_LOOPS:Point[][]=[
 [[535,700],[645,700],[650,680],[642,625],[620,625],[620,680]],
 [[712,630],[712,645],[740,645],[780,645],[785,630]],
 [[590,780],[650,790],[675,825],[650,845],[610,830],[590,810]],
 [[790,660],[815,660],[820,700],[800,705],[785,690]],
];
export const SUBJECTS=[
 {id:"engineering",question:"A panel line makes 12 panels in 3 minutes. How many in 15 minutes?",choices:["48 panels","60 panels","72 panels"],correct:1,explanation:"12 ÷ 3 = 4 panels/minute; 4 × 15 = 60."},
 {id:"science",question:"Which riverbank planting best reduces soil erosion?",choices:["Native plants with deep roots","Bare soil","Plastic turf"],correct:0,explanation:"Native roots bind soil and filter runoff before it reaches the river."},
 {id:"business",question:"Revenue is $1,200 and costs are $850. What is the profit?",choices:["$250","$2,050","$350"],correct:2,explanation:"Profit = revenue − costs = $350."},
 {id:"arts",question:"Why preserve historic buildings when a city grows?",choices:["They never need maintenance","They connect communities to their history","They eliminate all building costs"],correct:1,explanation:"Adaptive reuse keeps a community's history while giving old buildings new purposes."},
];
export const COOPS=[{id:"ava",name:"Ava",subject:"engineering",pay:85},{id:"leo",name:"Leo",subject:"science",pay:75},{id:"mina",name:"Mina",subject:"business",pay:95}];
export const STATIONS=[
 {id:"ridge",name:"Ridge West",at:[-480,0] as Point},
 {id:"airport",name:"Airport",at:[-620,-120] as Point},
 {id:"lake",name:"Heron Lake",at:[-520,-460] as Point},
 {id:"owawa",name:"Owawa Quay",at:[690,-440] as Point},
 {id:"centre",name:"Ridge Centre",at:[430,350] as Point},
 {id:"university",name:"University",at:[460,540] as Point},
 {id:"south",name:"South Commons",at:[-170,680] as Point},
];
export const RAIL_Y=32;
export const TRAIN_MAX_SPEED=250/3.6;
export const TRAIN_ACCEL=4.5;
export const TRAIN_DWELL=10;
/** Centripedal-looking rounded track sampled once, shared by drawing and simulation. */
export const RAIL_PATH:Point[]=[];
export const STATION_DISTANCES:number[]=[];
let railLength=0;
for(let i=0;i<STATIONS.length;i++){
 STATION_DISTANCES.push(railLength);
 const p0=STATIONS[(i+STATIONS.length-1)%STATIONS.length].at,p1=STATIONS[i].at,p2=STATIONS[(i+1)%STATIONS.length].at,p3=STATIONS[(i+2)%STATIONS.length].at;
 for(let k=0;k<80;k++){
  const t=k/80,t2=t*t,t3=t2*t;
  const p:Point=[0,0];
  for(let a=0;a<2;a++)p[a]=0.5*(2*p1[a]+(-p0[a]+p2[a])*t+(2*p0[a]-5*p1[a]+4*p2[a]-p3[a])*t2+(-p0[a]+3*p1[a]-3*p2[a]+p3[a])*t3);
  if(RAIL_PATH.length)railLength+=Math.hypot(p[0]-RAIL_PATH.at(-1)![0],p[1]-RAIL_PATH.at(-1)![1]);
  RAIL_PATH.push(p);
 }
 // Add the final sample interval to the next station to keep station offsets exact.
 railLength+=Math.hypot(p2[0]-RAIL_PATH.at(-1)![0],p2[1]-RAIL_PATH.at(-1)![1]);
 RAIL_PATH.push([...p2]);
}
export const RAIL_LENGTH=railLength;
export function pathPoint(points:Point[],s:number,closed=false){
 let length=0;for(let i=0;i<points.length-1;i++)length+=Math.hypot(points[i+1][0]-points[i][0],points[i+1][1]-points[i][1]);
 s=closed?((s%length)+length)%length:Math.max(0,Math.min(length,s));
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(s<=d||i===points.length-2){const t=d?s/d:0;return {x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,heading:Math.atan2(b[1]-a[1],b[0]-a[0])};}s-=d;}return {x:0,z:0,heading:0};
}
function travelProfile(length:number){
 const peak=Math.min(TRAIN_MAX_SPEED,Math.sqrt(length*TRAIN_ACCEL));
 const ramp=peak/TRAIN_ACCEL,cruise=Math.max(0,(length-peak*peak/TRAIN_ACCEL)/peak);
 return {peak,ramp,cruise,time:2*ramp+cruise};
}
export const RAIL_LEGS=STATIONS.map((_,i)=>travelProfile((i===STATIONS.length-1?RAIL_LENGTH:STATION_DISTANCES[i+1])-STATION_DISTANCES[i]));
export const TRAIN_PERIOD=RAIL_LEGS.reduce((s,l)=>s+l.time+TRAIN_DWELL,0);
export const TRAIN_COUNT=6;
export function trainAt(time:number,index:number){
 let t=((time+index*TRAIN_PERIOD/TRAIN_COUNT)%TRAIN_PERIOD+TRAIN_PERIOD)%TRAIN_PERIOD;
 for(let i=0;i<RAIL_LEGS.length;i++){
  const l=RAIL_LEGS[i];
  if(t<TRAIN_DWELL)return {...pathPoint(RAIL_PATH,STATION_DISTANCES[i],true),speed:0,station:i,next:(i+1)%STATIONS.length,distance:STATION_DISTANCES[i]};
  t-=TRAIN_DWELL;
  if(t<l.time){
   let d:number,speed:number;
   if(t<l.ramp){speed=TRAIN_ACCEL*t;d=0.5*TRAIN_ACCEL*t*t;}
   else if(t<l.ramp+l.cruise){speed=l.peak;d=0.5*l.peak*l.ramp+l.peak*(t-l.ramp);}
   else {const u=t-l.ramp-l.cruise;speed=l.peak-TRAIN_ACCEL*u;d=0.5*l.peak*l.ramp+l.peak*l.cruise+l.peak*u-0.5*TRAIN_ACCEL*u*u;}
   const distance=STATION_DISTANCES[i]+d;
   return {...pathPoint(RAIL_PATH,distance,true),speed,station:-1,next:(i+1)%STATIONS.length,distance};
  }t-=l.time;
 }return {...pathPoint(RAIL_PATH,0,true),speed:0,station:0,next:1,distance:0};
}
export const SHIP_ROUTE:Point[]=Array.from({length:81},(_,i)=>{const x=-1150+i*2300/80;return [x,riverZ(x)+riverWidth(x)*0.38] as Point;});
export const SHIP_LENGTH=SHIP_ROUTE.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-SHIP_ROUTE[i][0],p[1]-SHIP_ROUTE[i][1]),0);
export const PORT={at:[-610,-601] as Point};
export const PORTS=[
 {id:"lake",name:"Heron Lake Marina",at:[-556,-542] as Point,heading:-Math.PI/2,shore:[-556,-526] as Point,boat:[-555.8,-564] as Point,ship:[-546,-564] as Point},
 {id:"island",name:"Heron Gardens Harbour",at:[-610,-601] as Point,heading:Math.PI/2,shore:[-610,-618] as Point,boat:[-615,-586] as Point,ship:[-626,-588] as Point},
 {id:"river",name:"Owawa River Quay",at:[420,riverZ(420)-riverWidth(420)/2+9] as Point,heading:Math.PI/2,shore:[420,riverZ(420)-riverWidth(420)/2-12] as Point,boat:[414,riverZ(420)-riverWidth(420)/2+22] as Point,ship:[429,riverZ(420)-riverWidth(420)/2+24] as Point},
];
