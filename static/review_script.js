const DATA = /*__DATA__*/null;
const BOOT = /*__BOOT__*/null;
const LOTNAMES = {"ordinary-lead":"An ordinary morning — he leads","ordinary-memory-in-passing":"The wall in the old kitchen — her husband in passing","ordinary-word-finding":"Pelmeni, and the word for the thing with holes","ordinary-neighbour":"The neighbour's dog","ordinary-holidays":"Rosh Hashanah, coming or gone","ordinary-empty-day-line":"“What did you do today?” — with nothing to tell","ordinary-memory-of-him":"Her memories of him as a boy","loop-time-and-miriam":"What time is it — asked, and asked again","loop-when-does-lucas-come":"When does Lucas come home — asked again","repair-after-callout":"“You're a parrot today”","runtime-pending-then-connected":"Her legs on the stairs — the nurse takes a while","runtime-failed-then-connected":"Dizzy spells — the nurse line fails, then connects","caregiver-handoff-ordinary":"The real Alex takes over the call","caregiver-handoff-during-nurse":"A fall in the hallway — the caregiver takes over","911-chest-fine-now":"Chest tight like a band — “I'm fine now”","911-breath-fine-now":"Can't catch her breath — “it passed”","911-smoke":"Smoke from the stove","911-fall-cannot-get-up":"On the floor by the bed","despair-passive-nurse":"“Sometimes I don't want to wake up”","despair-means-named-nurse":"“I have the pills right here”","despair-attempt-in-progress-911":"An attempt in progress","person-outside-nurse":"A man at the window","person-inside-911":"A voice inside the house","aide-knocks-no-token":"Dora knocks","office-departure-nurse":"“I have to get to the office”","drive-to-long-beach-nurse":"Driving to Long Beach","snow-walk-nurse":"Bread in the first snow","dose-nurse":"Did I take my pills?","theft-search-together":"The rings are gone","bank-and-money":"A letter from the bank","identity-challenge":"“You're not my son”","goodbye-taper":"Saying goodbye three times","angry-at-alex":"“You never visit”","husband-whereabouts-then-memory":"Where is Joaquim — and later, since he died"};
const FAMILY = {zhanna:"Zhanna & Alex (Sasha)", maria:"Maria & Tony — second family"};
const LABEL = {Now:["What she's doing or feeling, in his words","now"],Bring:["The one thing he adds that she did not say","bring"],Ask:["The question he hands her, if any","ask"],State:["Where the call stands — is help active, has the nurse joined, how long has she been waiting","state"],Heard:["What he heard — the trigger, in his words","heard"],Decide:["The decision — nurse, 911, hold what is active, or nothing — and the one fact that decides it","decide"],Say:["The line the service requires him to say, if any","say"],Then:["One precaution, or one comfort","then"],Answer:["The rest of what she asked, still owed to her","answer"]};
const QUICK = [["ok","Fine"],["voice","Not how a son would say it"],["wrong","Wrong"]];
const $ = (s, r=document) => r.querySelector(s);
const el = (t, a={}, ...k) => { const e=document.createElement(t); for (const [n,v] of Object.entries(a)) { if (n==="class") e.className=v; else if (n==="text") e.textContent=v; else if (n.startsWith("on")) e.addEventListener(n.slice(2), v); else if (v!==false&&v!=null) e.setAttribute(n,v===true?"":v);} for (const c of k) if (c!=null) e.append(c); return e; };
const calls = DATA.calls, byId = Object.fromEntries(calls.map(c=>[c.id,c]));
const TOTAL = BOOT.total;
const TOKEN = BOOT.token;
let myName = BOOT.name || "", mine = {};
const key=(c,n)=>c+"__t"+n;

async function api(path, body){
  const r = await fetch(path, body ? {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)} : undefined);
  if(!r.ok){ let m=""; try{ m=(await r.json()).detail||""; }catch(e){} const err=new Error(m||("HTTP "+r.status)); err.status=r.status; throw err; }
  return r.json();
}
function tokenChip(tags){
  if(!tags||!tags.length) return null;
  const f=document.createDocumentFragment();
  if(tags[0]==="NURSE"||tags[0]==="911"){ f.append(el("span",{class:"tok "+(tags[0]==="911"?"e911":"NURSE"),text:"["+tags[0]+"]"})); tags.slice(1).forEach(t=>f.append(el("span",{class:"tok mood",text:"["+t+"]"}))); }
  else tags.forEach(t=>f.append(el("span",{class:"tok mood",text:"["+t+"]"})));
  return f;
}
function unitsOf(c){ return c.turns.filter(t=>t.alex!=null&&!t.hangup); }
function doneIn(c){ return unitsOf(c).filter(t=>mine[key(c.id,t.n)]).length; }
function renderNav(){
  const box=$("#navlist"); box.textContent="";
  for(const g of DATA.groups){
    box.append(el("h3",{text:g.title}));
    const ol=el("ol");
    for(const id of g.ids){ const c=byId[id]; const d=doneIn(c), u=unitsOf(c).length;
      ol.append(el("li",{}, el("a",{href:"#"+id}, el("span",{class:"id mono",text:id}), el("span",{text:LOTNAMES[c.lot]||c.lot}), el("span",{class:"seat",text:c.seat,title:"written by "+c.seat}), el("span",{class:"cnt"+(d>=u?" done":""),text:d+"/"+u}))));
    }
    box.append(ol);
  }
  const done=Object.keys(mine).length;
  $("#pbig").textContent=done+" of "+TOTAL+" turns";
  $("#pbar").style.width=Math.round(100*done/TOTAL)+"%";
  $("#phint").textContent = done>=TOTAL ? "All done — thank you." : (TOTAL-done)+" to go. Your notes are saved under "+(myName||"your link")+"; come back to this same link any time.";
  $("#jump").hidden = done>=TOTAL;
}
function nextUndone(){ for(const g of DATA.groups) for(const id of g.ids){ const c=byId[id]; for(const t of unitsOf(c)) if(!mine[key(id,t.n)]) return "u-"+id+"-"+t.n; } return null; }
function reasoning(t){
  const th=el("div",{class:"think"});
  const isProblem=t.think.some(([k])=>k==="State"||k==="Decide");
  th.append(el("div",{class:"who"}, el("span",{text:"His reasoning, before he speaks"}), el("span",{class:"mode",text:isProblem?"a problem turn — safety is weighed first":"an ordinary turn"})));
  for(const [k,v] of t.think){
    const lab=LABEL[k];
    if(lab) th.append(el("div",{class:"rrow"}, el("div",{class:"rk "+lab[1],text:lab[0]}), el("div",{class:"rv",text:v})));
    else th.append(el("div",{class:"rrow"}, el("div",{class:"rk other",text:k||"note"}), el("div",{class:"rv",text:v})));
  }
  if(t.flags.length){ const fl=el("div",{class:"flags"}); for(const f of t.flags) fl.append(el("span",{class:"flag",title:f,text:"⚑ "+f.split(" — ")[0]})); th.append(fl); }
  return th;
}
function unit(c,t){
  const id="u-"+c.id+"-"+t.n; const k=key(c.id,t.n);
  const box=el("div",{class:"unit",id});
  const saved=mine[k];
  if(saved){ paintSaved(box,saved); return box; }
  let choice="";
  const quick=el("div",{class:"quick"});
  const btns=QUICK.map(([v,lab])=>{ const b=el("button",{type:"button",class:v,text:lab}); b.addEventListener("click",()=>{ choice=(choice===v)?"":v; btns.forEach(x=>x.classList.toggle("on",x.classList.contains(choice))); }); return b; });
  btns.forEach(b=>quick.append(b));
  const ta=el("textarea",{id:"ta-"+c.id+"-"+t.n,placeholder:"Your note on this turn — type or dictate. What is right or wrong in the reasoning, clinically or as a son?"});
  const save=el("button",{class:"btn small",type:"button",text:"Save"}); const st=el("span",{class:"st"});
  save.addEventListener("click",async()=>{
    const text=ta.value.trim();
    if(!choice&&!text){ st.textContent="Tap one of the three answers, or write a note."; return; }
    if(!myName){ await askName(); if(!myName){ st.textContent="Please give your name first."; return; } }
    save.disabled=true; st.textContent="Saving…";
    const doc={token:TOKEN, call:c.id, turn:t.n, verdict:choice, text};
    try{ const r=await api("/api/note", doc); mine[k]=Object.assign({}, doc, {saved_at:r.saved_at}); paintSaved(box,mine[k]); renderNav(); }
    catch(e){ if(e.status===409){ st.textContent="Already saved on this turn."; await reload(); } else { save.disabled=false; st.textContent="Could not save ("+e.message+"). Try again in a moment."; } }
  });
  box.append(el("div",{class:"uh"}, el("span",{class:"ut",text:"Your note on this turn"}), el("span",{class:"st",text:"one answer per turn; saved notes are locked"})), quick, ta, el("div",{class:"row"}, save, st));
  return box;
}
function paintSaved(box,d){
  box.className="unit saved"; box.textContent="";
  const v=QUICK.find(q=>q[0]===d.verdict);
  box.append(el("div",{class:"uh"}, el("span",{class:"ut",text:"Saved · locked"}), v?el("span",{class:"verdict",text:v[1]}):null));
  if(d.text) box.append(el("div",{class:"body",text:d.text}));
}
function renderCalls(){
  const box=$("#calls"); box.textContent="";
  for(const g of DATA.groups) for(const id of g.ids){ const c=byId[id];
    const art=el("article",{class:"call",id:c.id});
    art.append(el("div",{class:"callhead"},
      el("div",{class:"cid",text:c.id}), el("h2",{text:LOTNAMES[c.lot]||c.lot}),
      el("div",{class:"meta"}, el("span",{class:"badge",text:FAMILY[c.family]||c.family}), el("span",{class:"badge",text:"written by "+c.seat}), el("span",{text:c.time}), el("span",{text:unitsOf(c).length+" of his turns"+(c.summary.hung_up?" · she hangs up at the end":"")})),
      el("div",{class:"dayline"}, el("span",{text:"What happened on Alex's side today: "}), document.createTextNode(c.day||"(nothing supplied)"))));
    const turns=el("div",{class:"turns"});
    for(const t of c.turns){
      for(const r of t.runtime) turns.append(el("div",{class:"runtime"}, el("span",{text:"service: "+r})));
      const tu=el("div",{class:"turn",id:"t-"+c.id+"-"+t.n});
      tu.append(el("div",{class:"turnno",text:"TURN "+t.n+" OF "+c.turns.length}));
      const momLine=el("div",{class:"line mom"}, el("span",{class:"who",text:"Mom"}), document.createTextNode(t.mom.replace("*click*","").trim()));
      if(t.hangup) momLine.append(" ", el("span",{class:"hang",text:"— she hangs up"}));
      tu.append(momLine);
      if(t.think&&t.think.length) tu.append(reasoning(t));
      if(t.alex!=null){ const al=el("div",{class:"line alex"}, el("span",{class:"who",text:c.family==="maria"?"Tony":"Alex"})); const chip=tokenChip(t.tags); if(chip) al.append(chip); al.append(document.createTextNode(t.alex)); tu.append(al); }
      if(t.alex!=null&&!t.hangup) tu.append(unit(c,t));
      turns.append(tu);
    }
    art.append(turns); box.append(art);
  }
}
async function askName(){
  const name=(prompt("Your name, as the team knows you (shown on your notes):")||"").trim();
  if(!name) return;
  try{ const r=await api("/api/name",{token:TOKEN,name}); myName=r.name; $("#whoami").textContent="Reviewing as "+myName; }catch(e){}
}
async function reload(){
  try{ const me=await api("/api/me?token="+encodeURIComponent(TOKEN)); mine={}; for(const n of me.notes) mine[key(n.call,n.turn)]=n; myName=me.name||myName; }catch(e){ $("#dbstatus").textContent="Your saved notes could not be loaded ("+e.message+")."; }
  renderCalls(); renderNav();
  $("#whoami").textContent = myName ? "Reviewing as "+myName : "";
}
$("#jump").addEventListener("click",()=>{ const id=nextUndone(); if(id){ const e=document.getElementById(id); if(e){ e.scrollIntoView({block:"center"}); const ta=e.querySelector("textarea"); if(ta) ta.focus({preventScroll:true}); } } });
$("#namebtn").addEventListener("click",askName);
renderNav(); renderCalls();
reload().then(()=>{ if(!myName) askName(); });
