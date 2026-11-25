import {useEffect,useState} from "react";
import {useV6,approveLoan} from "../story/v6Store";
import {useGame} from "../story/store";
import {BUSINESSES,COOPS,SUBJECTS,STATIONS,TRAIN_COUNT,TRAIN_PERIOD,trainAt,V6_BUILDINGS} from "../world/v6";
import {MALL_STORES} from "../world/mall";
import {GIGS,gigById} from "../story/gigs";
import type {Service} from "../world/owawaCity";

/** What the mall's shops sell (the info desk hands out side jobs instead). */
const MALL_SERVICES:Record<string,Service[]>={
 "mall-books":[{kind:"buy",label:"Map of Owawa · $8",price:8,toast:"A folding map of Owawa: Downtown, the north shore and the river."},{kind:"buy",label:"Paperback · $14",price:14,toast:"A paperback for the train."}],
 "mall-gadgets":[{kind:"buy",label:"Headphones · $60",price:60,toast:"Noise-cancelling headphones. Turn the volume up (slider under the map)."},{kind:"buy",label:"Phone case · $20",price:20,toast:"A tough phone case for site days."}],
 "mall-style":[{kind:"buy",label:"Rain jacket · $45",price:45,toast:"A rain jacket. Snug."},{kind:"buy",label:"Work boots · $80",price:80,toast:"Steel-toe boots for the site."}],
 "mall-sports":[{kind:"buy",label:"Soccer ball · $25",price:25,toast:"A new soccer ball for the park."},{kind:"meal",label:"Sports drink",kitchen:"subs"}],
 "mall-noodles":[{kind:"meal",label:"Noodle bowl",kitchen:"shawarma"}],
 "mall-pizza":[{kind:"meal",label:"Two slices and a drink",kitchen:"burger"}],
 "mall-toys":[{kind:"buy",label:"Kite · $18",price:18,toast:"A kite for Meadows Beach."},{kind:"buy",label:"Plush goat · $16",price:16,toast:"A plush goat. It looks like one of yours."}],
 "mall-security":[{kind:"buy",label:"Report lost property",price:0,toast:"Noted. Check back at the info desk."}],
 "mall-market":[{kind:"meal",label:"Deli sandwich",kitchen:"subs"},{kind:"buy",label:"Flowers · $12",price:12,toast:"Fresh flowers. Maybe for Rosa?"}],
 "mall-home":[{kind:"buy",label:"Potted plant · $22",price:22,toast:"A potted plant for the office."},{kind:"buy",label:"Paint and brushes · $35",price:35,toast:"Paint and brushes. Something needs a fresh coat."}],
};
export function V6Panel(){const p=useV6(s=>s.panel);return p?<V6PanelContent key={p.kind+('id' in p?p.id:'')} />:null;}
function V6PanelContent(){
 const panel=useV6(s=>s.panel),lessons=useV6(s=>s.lessons),coops=useV6(s=>s.coops),owned=useV6(s=>s.condo),loan=useV6(s=>s.loanVisit);
 const [,refresh]=useState(0),[answer,setAnswer]=useState<string|null>(null);
 useEffect(()=>{if(!panel)return;const timer=setInterval(()=>refresh(n=>n+1),400);return()=>clearInterval(timer);},[panel]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.code==="Escape")useV6.getState().setPanel(null);};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[]);
 if(!panel)return null;
 const v=useV6.getState(),g=useGame.getState(),b="id" in panel?V6_BUILDINGS.find(b=>b.id===panel.id):null;
 let content;
 if(panel.kind==="station"){
  const index=STATIONS.findIndex(s=>s.id===panel.id);
  const trains=Array.from({length:TRAIN_COUNT},(_,i)=>{const t=trainAt(v.time,i);let eta=0;if(t.station!==index){for(eta=1;eta<TRAIN_PERIOD;eta++)if(trainAt(v.time+eta,i).station===index)break;}return {i,t,eta};}).sort((a,b)=>a.eta-b.eta);
  content=<><p className="v6-eyebrow">OWAWA EXPRESS · FREE TRANSIT</p><h2>{STATIONS[index].name}</h2><p>Six trains serve the loop. Trains accelerate smoothly up to 250 km/h and stop for ten seconds at every station.</p><div className="v6-route">{STATIONS.map(s=><span key={s.id} className={s.id===panel.id?"active":""}>{s.name}</span>)}</div>{trains.slice(0,3).map(({i,t,eta})=><div className="v6-row" key={i}><div><strong>Express {i+1}</strong><small>{eta===0?"Doors open":("Arrives in "+eta+" s")} · clockwise service</small></div><button disabled={t.station!==index} onClick={()=>v.board(i)}>Board train</button></div>)}<p className="v6-muted">Use E at a station to leave the train. The next stop appears while you ride.</p></>;
 }else if(panel.kind==="lesson"){
  const q=SUBJECTS.find(q=>q.id===panel.id)!;
  content=<><p className="v6-eyebrow">UNIVERSITY OF VATALOO · FIELD LESSON</p><h2>{b?.name}</h2><p>{q.question}</p>{q.choices.map((c,i)=><button className="v6-choice" key={c} onClick={()=>{setAnswer(v.answer(q.id,i)?q.explanation:"That answer needs another look. Try again.");}}>{c}</button>)}{answer&&<p className="v6-feedback">{answer}</p>}<p className="v6-muted">{lessons.includes(q.id)?"Lesson completed · visit Principal Chen to recruit a co-op.":"First completion earns $180 and unlocks a student in this subject."}</p></>;
 }else if(panel.kind==="principal"){
  content=<><p className="v6-eyebrow">UNIVERSITY OF VATALOO · CO-OP OFFICE</p><h2>Principal Chen</h2><p>Learn with our departments, then give a student a place on your team. They can follow you or work at the Caivan office.</p>{COOPS.map(c=><div key={c.id} className="v6-row"><div><strong>{c.name} · {c.subject}</strong><small>{coops[c.id]?coops[c.id]==="office"?"Working at Caivan":"Following you":lessons.includes(c.subject)?"Ready to recruit":"Complete the department lesson"} · {"$"+c.pay} / 2 min at the office</small></div>{!coops[c.id]?<button disabled={!lessons.includes(c.subject)} onClick={()=>v.hire(c.id)}>Hire co-op</button>:<button onClick={()=>v.assign(c.id,coops[c.id]==="office"?"following":"office")}>{coops[c.id]==="office"?"Follow me":"Assign to office"}</button>}</div>)}<p className="v6-muted">Office earnings accrue during play. No bus ride is needed.</p></>;
 }else if(panel.kind==="building"){
  content=<><p className="v6-eyebrow">FLOOR 16 · CLIENT SUITE</p><h2>{b?.name}</h2><p>{panel.id==="loan-tower"?"Meet your lending adviser, visit a property and collect its appraisal.":"Tour the furnished Northshore suite, collect an appraisal, or purchase your own condo."}</p>{panel.id==="loan-tower"?<><button className="v6-choice" onClick={v.loanAction}>{loan==="none"?"Start property appraisal visit":loan==="approved"?"Appraisal completed":"Review appraisal assignment"}</button><button className="v6-choice" onClick={()=>g.bankBorrow(2000)}>Request a $2,000 loan</button><p className="v6-muted">Existing bank rules apply: 10% borrowing fee; 30% of future pay goes to repayment.</p></>:<>{loan==="documents"&&<button className="v6-choice" onClick={()=>{approveLoan();setAnswer("Appraisal collected · $900 paid.");}}>Collect property appraisal · $900</button>}<button className="v6-choice" disabled={owned} onClick={v.buyCondo}>{owned?"Your condo · earning rent":"Purchase condo · $14,000"}</button><p className="v6-muted">Rent pays $325 every 2 minutes of play.</p></>}{answer&&<p>{answer}</p>}<button className="v6-choice" onClick={v.exit}>Elevator · return to street</button></>;
 }else if(panel.kind==="business"){
  const biz=BUSINESSES.find(x=>x.id===panel.id),mall=MALL_STORES.find(x=>x.id===panel.id);
  const name=biz?.name??mall?.name??"",services=biz?.services??MALL_SERVICES[panel.id]??[],gig=v.gig?gigById(v.gig.id):null;
  const offers=GIGS.filter(x=>x.giver===panel.id);
  const run=(s:Service)=>{
   if(s.kind==="meal")g.buyMeal(s.kitchen,v.time);
   else if(s.kind==="invest")v.invest(s.price,s.income,s.label.split(" · ")[0]);
   else if(s.kind==="gig")v.startGig(s.gig);
   else if(s.kind==="buy"){if(s.price===0||g.spend(s.price))g.toast(s.toast);}
  };
  content=<><p className="v6-eyebrow">{biz?biz.eyebrow:panel.id==="mall-desk"?"RIDGE CENTRE MALL":"RIDGE CENTRE MALL · SHOP"}</p><h2>{name}</h2><p>{biz?.blurb??mall?.blurb}</p>
   {services.filter(s=>s.kind!=="travel"&&s.kind!=="gig").map(s=><button className="v6-choice" key={s.label} onClick={()=>run(s)}>{s.kind==="meal"?s.label+" · $"+({subs:12,burger:14,shawarma:16} as const)[s.kitchen]:s.label}</button>)}
   {services.some(s=>s.kind==="travel")&&<div className="v6-route">{STATIONS.map(st=><button key={st.id} className="v6-choice" onClick={()=>v.travel(st.id,20)}>{st.name} · $20</button>)}</div>}
   {[...services.filter(s=>s.kind==="gig").map(s=>s.kind==="gig"?gigById(s.gig)!:null),...offers].filter((x,i,a)=>x&&a.indexOf(x)===i).map(x=>x&&<div key={x.id} className="v6-row"><div><strong>{x.title}</strong><small>{x.steps.map(st=>st.hint).join(" → ")} · ${x.reward}{v.gigsDone.includes(x.id)?" · done before":""}</small></div><button disabled={!!v.gig} onClick={()=>v.startGig(x.id)}>{v.gig?.id===x.id?"In progress":"Take the job"}</button></div>)}
   {gig&&<p className="v6-muted">Current side job: {gig.title}: {gig.steps[v.gig!.step].hint}{gig.steps[v.gig!.step].visits?` (${v.mallVisits.length}/${gig.steps[v.gig!.step].visits})`:""}. <button className="v6-link" onClick={v.dropGig}>Drop it</button></p>}
   {v.investments>0&&biz&&(biz.id==="realty"||biz.id==="insurance")&&<p className="v6-muted">Your rentals and policies pay ${v.investments} every 2 minutes.</p>}</>;
 }else{
  const sushi=panel.id==="sushi",airport=panel.id==="terminal";
  content=<><p className="v6-eyebrow">{airport?"OWAWA REGIONAL":"LOCAL BUSINESS"}</p><h2>{b?.name}</h2><p>{airport?"The regional airport connects the western suburbs to the Owawa Express. Explore its forecourt, aircraft apron and runway.":panel.id==="showroom"?"Explore Heron Gardens: waterfront homes, low-rise condos and a harbour reached by boat.":sushi?"Fresh sushi on the island waterfront.":"A local stop for food and supplies."}</p>{!airport&&<button className="v6-choice" onClick={()=>g.buyMeal("subs",v.time)}>{sushi?"Order sushi lunch":"Grab a snack"} · $12</button>}<button className="v6-choice" onClick={()=>v.setPanel({kind:"principal"})}>Manage university co-ops</button></>;
 }
 return <div className="v6-backdrop" role="dialog" aria-modal="true" aria-label="V6 services"><section className="v6-panel"><button className="v6-close" onClick={()=>v.setPanel(null)} aria-label="Close">×</button>{content}<button className="v6-done" onClick={()=>v.setPanel(null)}>Back to exploring</button></section></div>;
}
