/* v6.4 — training on the road. Dumbbells, TRX and Bodyweight share one road
   rotation; none of it moves the home programme, and the home gym is where the
   app always opens. Clicked for real wherever a person would tap. */
const fs = require("fs");
const {makeCloud, boot, wait} = require("./cloudharness");

let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}

/* YYYY-MM-DD, n days ago */
function ago(n){
  const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate() - n);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
const HOME_EX = {A:["back-squat","squat"], B:["conv-deadlift","deadlift"], C:["weighted-pullup","vpullHeavy"]};
/* a home session at index i, n days ago */
function home(i, n, w){
  const key = ["A","B","C"][i % 3];
  return {key:key, index:i, open:false, day:ago(n), date:ago(n) + "T16:00:00.000Z", minutes:40, effort:7,
    entries:[{slot:HOME_EX[key][1], exId:HOME_EX[key][0], track:"load",
      sets:[{w:w||60,r:6,done:true},{w:w||60,r:6,done:true},{w:w||60,r:6,done:true},{w:w||60,r:6,done:true}]}]};
}
/* a road session */
function road(idx, rkey, kit, n){
  return {key:"T", index:idx, kit:kit, rkey:rkey, open:false, day:ago(n), date:ago(n) + "T08:00:00.000Z",
    minutes:35, entries:[{slot:"r-goblet", exId:"r-goblet", track:"load", sets:[{w:20,r:10,done:true}]}]};
}
/* the home programme with n sessions, every other day up to `endAgo` days ago */
function homeState(n, endAgo, extra){
  const hist = [];
  for(let i = 0; i < n; i++) hist.push(home(i, endAgo + (n - 1 - i) * 2));
  return Object.assign({v:1, units:"kg", bar:20, figure:"m", courses:[], nudge:{}, custom:[],
    history:hist, current:null, sessionIndex:n, roadIndex:0, updatedAt:Date.now()}, extra || {});
}
async function signedIn(st, opts){
  const cloud = (opts && opts.cloud) || makeCloud();
  cloud.docs["u1"] = {state: JSON.parse(JSON.stringify(st)), updatedAt: Date.now(), device:"seed"};
  const b = boot({cloud: cloud});
  b.win.confirm = ()=> true; b.win.alert = ()=>{};
  await b.win.ironworkSignedIn("u1", {name:"JC"});
  const D = b.win.document;
  b.click = (el)=> el.dispatchEvent(new b.win.MouseEvent("click", {bubbles:true}));
  b.v = ()=> D.getElementById("view").innerHTML;
  b.q = (sel)=> D.querySelector(sel);
  b.qa = (sel)=> Array.from(D.querySelectorAll(sel));
  b.fault = ()=> { const f = D.querySelector(".fault") || D.getElementById("faultBox"); return f ? f.textContent.slice(0,140) : ""; };
  b.cloud = cloud;
  return b;
}
/* tick every set box, the way a thumb would */
function tickAll(b){
  let n = 0;
  for(let k = 0; k < 60; k++){
    const box = b.qa('#view .set:not(.done) [data-done]')[0];
    if(!box) break;
    b.click(box); n++;
  }
  return n;
}

async function run(){

console.log("\n1. the app opens on the home gym, with four places to train");
{
  const b = await signedIn(homeState(40, 2));
  const btns = b.qa('#view .kits button');
  ok("four choices", btns.length === 4, String(btns.length));
  ok("in order: Home gym, Dumbbells, TRX, Bodyweight",
     btns.map(x => x.firstChild.textContent).join("|") === "Home gym|Dumbbells|TRX|Bodyweight",
     btns.map(x => x.firstChild.textContent).join("|"));
  ok("Home gym is selected", btns[0].classList.contains("on") && btns[0].getAttribute("aria-pressed") === "true");
  ok("the home card is showing", b.v().indexOf('data-act="preview"') > -1 && b.v().indexOf("Home gym holds") === -1);
  b.click(btns[1]);
  ok("tapping Dumbbells shows the road card", b.v().indexOf("Home gym holds at") > -1);
  ok("and selects it", b.qa('#view .kits button')[1].classList.contains("on"));
  const carried = JSON.parse(JSON.stringify(b.g("S")));
  b.win.close();
  const b2 = boot({cloud: makeCloud(), local: carried});
  b2.cloud = b2.cloud; await b2.win.ironworkSignedIn("u1", {});
  ok("opened again, it is back on the home gym", b2.g("kit") === "home", b2.g("kit"));
  b2.win.close();
}

console.log("\n2. a dumbbell session, start to finish, leaves home exactly where it was");
{
  const st = homeState(40, 2);                 // home next: index 40 -> Root (B)
  const b = await signedIn(st);
  const before = {idx: b.g("S").sessionIndex, next: b.g("sessionAt(S.sessionIndex).title")};
  b.click(b.qa('#view .kits button')[1]);
  ok("the road starts at whatever home has next", b.v().indexOf(">Root<") > -1 && b.g("roadNextKey()") === "B",
     b.g("roadNextKey()"));
  ok("it says where home is holding", b.v().indexOf("Home gym holds at <b>Root · session 41</b>") > -1);
  const start = b.q('#view [data-act="start"]');
  ok("the start button names the kit", start && start.textContent === "Start Root · Dumbbells", start && start.textContent);
  b.click(start);
  const c = b.g("S").current;
  ok("a road session is open", c && c.key === "T" && c.kit === "db" && c.rkey === "B", JSON.stringify(c && {k:c.key,kit:c.kit,r:c.rkey}));
  ok("on its own counter", c.index === 0, String(c.index));
  ok("with the road exercises", c.entries[0].exId === "r-db-rdl", c.entries[0].exId);
  ok("and nothing from home", c.entries.every(e => e.exId.indexOf("r-") === 0));
  ok("there is no Swap on a road session", !b.q('#view [data-swap]'));
  ok("the session screen says road session 1", b.v().indexOf("road session 1") > -1);
  ok("loads are per hand", b.v().indexOf("per hand") > -1);
  const n = tickAll(b);
  ok("every set can be ticked (" + n + ")", n === 16 && !b.fault(), b.fault());
  b.click(b.q('#view [data-act="finish"]'));
  const rec = b.g("S").history[b.g("S").history.length - 1];
  ok("it is in the history as a road session", rec.key === "T" && rec.kit === "db" && rec.rkey === "B");
  ok("home has not moved", b.g("S").sessionIndex === before.idx && b.g("sessionAt(S.sessionIndex).title") === before.next,
     b.g("S").sessionIndex + " " + b.g("sessionAt(S.sessionIndex).title"));
  ok("the road counter moved", b.g("S").roadIndex === 1, String(b.g("S").roadIndex));
  ok("the summary says what is next on the road",
     b.v().indexOf("Next on the road is <b>Reach</b>") > -1 && b.v().indexOf("Home gym holds at <b>Root</b>") > -1);
  const done = b.q('#view [data-act="closeSummary"]');
  ok("Done is the orange button", done && done.className === "btn", done && done.className);
  b.click(done);
  ok("Done goes back to the road card", b.v().indexOf("Home gym holds at") > -1 && !b.g("summaryRec"));
  ok("no fault", !b.fault(), b.fault());
  b.win.close();
}

console.log("\n3. one rotation shared by all three kits");
{
  const st = homeState(40, 6);
  st.history.push(road(0, "B", "db", 4));
  st.roadIndex = 1;
  const b = await signedIn(st);
  b.click(b.qa('#view .kits button')[2]);           // TRX
  ok("after Root on dumbbells, TRX is on Reach", b.g("roadNextKey()") === "C" && b.v().indexOf(">Reach<") > -1);
  ok("TRX is reps only", b.v().indexOf("reps only") > -1);
  b.click(b.q('#view [data-act="start"]'));
  ok("a TRX Reach session", b.g("S").current.kit === "trx" && b.g("S").current.rkey === "C");
  ok("counter 1", b.g("S").current.index === 1);
  ok("no weight boxes on a reps-only exercise", b.qa('#view .set')[0].querySelectorAll("input").length === 1,
     String(b.qa('#view .set')[0].querySelectorAll("input").length));
  tickAll(b);
  b.click(b.q('#view [data-act="finish"]'));
  b.click(b.q('#view [data-act="closeSummary"]'));
  b.click(b.qa('#view .kits button')[3]);           // Bodyweight
  ok("then Bodyweight is on Drive", b.g("roadNextKey()") === "A" && b.v().indexOf(">Drive<") > -1);
  ok("needs nothing but the floor, a towel and the bed",
     b.v().indexOf("door") === -1 && b.v().indexOf("table") === -1);
  ok("home still holds at Root", b.v().indexOf("Root · session 41") > -1);
  ok("and says two road sessions since", b.v().indexOf("2 road sessions logged since") > -1);
  b.win.close();
}

console.log("\n4. back at the rack");
{
  const st = homeState(40, 10);
  st.history.push(road(0, "B", "db", 8), road(1, "C", "bw", 6), road(2, "A", "db", 4));
  st.roadIndex = 3;
  const b = await signedIn(st);
  ok("it opens on the home gym", b.g("kit") === "home");
  ok("and welcomes you back", b.v().indexOf("Back at the rack") > -1 &&
     b.v().indexOf("3 road sessions logged since your last home session — Root, Reach, Drive") > -1);
  ok("home picks up at Root, session 41", b.g("S").sessionIndex === 40 && b.v().indexOf(">Root<") > -1);
  ok("rest is judged from the road, not from home ten days ago",
     b.v().indexOf("It has been 4 days. Barbell loads are already at 90%") > -1);
  ok("ten days off the barbell: the note", b.v().indexOf("10 days since the barbell") > -1 &&
     b.v().indexOf("start at 90% today") + b.v().indexOf("starts at 90% today") > -2);
  b.click(b.q('#view [data-act="start"]'));
  const c = b.g("S").current;
  ok("a home session at index 40", c.key === "B" && c.index === 40, c.key + c.index);
  ok("marked as the first back", c.ramp === true);
  b.win.close();
}

{
  const st = homeState(40, 8); st.history.push(road(0, "B", "db", 6), road(1, "C", "db", 4), road(2, "A", "db", 2)); st.roadIndex = 3;
  const b = await signedIn(st);
  ok("two days after a road session it says so", b.v().indexOf("Trained 2 days ago, on the road") > -1);
  b.win.close();
}

console.log("\n5. 90% on the barbell after a break, and full loads the time after");
{
  const st = homeState(40, 10);                 // session 37 (index 37, Root) was conv-deadlift at 60
  const b = await signedIn(st);
  const lastRoot = b.g("S").history.filter(h => h.key === "B").slice(-1)[0];
  const w = lastRoot.entries[0].sets[0].w;
  b.click(b.q('#view [data-act="start"]'));
  const dl = b.g("S").current.entries.find(e => e.slot === "deadlift");
  const ex = b.g("variantFor('deadlift', 40)");
  ok("the deadlift slot is a barbell lift", ex.kind === "barbell", ex.kind);
  /* the suggestion is what the last Root earned, then 90% of it */
  const full = b.g("suggest(variantFor('deadlift',40), {sets:4,lo:3,hi:6}, 40).w");
  ok("prefilled at 90% of the full suggestion", Number(dl.sets[0].w) === b.g("roundLoad(" + full + "*0.9, variantFor('deadlift',40))"),
     dl.sets[0].w + " vs full " + full);
  ok("and the screen says why", b.v().indexOf("90% today") > -1);
  tickAll(b);
  b.click(b.q('#view [data-act="finish"]'));
  const rec = b.g("S").history.slice(-1)[0];
  ok("the record is marked", rec.ramp === true);
  /* the next Root: the 90% session is not the basis */
  const nextFull = b.g("suggest(variantFor('deadlift',43), {sets:4,lo:3,hi:6}, 43).w");
  ok("next time the full load returns", nextFull === full, nextFull + " vs " + full);
  ok("no ramp the next time, because the gap has closed", b.g("rampDue()") === false);
  b.win.close();
}

console.log("\n6. hotel dumbbells never feed a home suggestion");
{
  const st = homeState(40, 2);
  st.history.push(Object.assign(road(0, "B", "db", 1), {entries:[{slot:"r-db-rdl", exId:"r-db-rdl", track:"load",
    sets:[{w:8,r:12,done:true},{w:8,r:12,done:true},{w:8,r:12,done:true},{w:8,r:12,done:true}]}]}));
  st.history.splice(st.history.length - 1, 0, Object.assign(home(39, 3), {entries:[{slot:"rdl", exId:"db-rdl", track:"load",
    sets:[{w:30,r:12,done:true},{w:30,r:12,done:true},{w:30,r:12,done:true}]}]}));
  st.history.splice(st.history.length - 3, 1);
  const b = await signedIn(st);
  ok("the home dumbbell RDL still reads 30", b.g("lastPerf('db-rdl').entry.sets[0].w") === 30);
  ok("the road one reads 8", b.g("lastPerf('r-db-rdl').entry.sets[0].w") === 8);
  ok("they are different exercises", b.g("findEx('r-db-rdl').label") === "On the road");
  b.win.close();
}

console.log("\n7. the merge: road sessions are kept, and never move the home counter");
{
  const b = await signedIn(homeState(5, 2));
  const W = b.win;
  const a = homeState(10, 4, {updatedAt: 5000});
  const c = homeState(10, 4, {updatedAt: 9000});
  a.history.push(road(0, "B", "db", 3)); a.roadIndex = 1;
  c.history.push(road(0, "B", "db", 3), road(1, "C", "trx", 1)); c.roadIndex = 2;
  const m = W.mergeStates(a, c);
  ok("all road sessions survive", m.history.filter(h => h.key === "T").length === 2,
     String(m.history.filter(h => h.key === "T").length));
  ok("the same road session is not doubled", m.history.filter(h => h.key === "T" && h.index === 0).length === 1);
  ok("the home counter is untouched", m.sessionIndex === 10, String(m.sessionIndex));
  ok("the road counter sits past them", m.roadIndex === 2, String(m.roadIndex));
  const back = W.mergeStates(c, a);
  ok("whichever way round", back.roadIndex === 2 && back.sessionIndex === 10 &&
     back.history.filter(h => h.key === "T").length === 2);
  /* a copy that never had a roadIndex at all — every phone before v6.4 */
  const old = homeState(10, 4, {updatedAt: 9e12}); delete old.roadIndex;
  const m2 = W.mergeStates(old, c);
  ok("a pre-6.4 copy still yields the right road counter", m2.roadIndex === 2, String(m2.roadIndex));
  /* a road session on the bench must not pull the home counter down */
  const live = homeState(10, 4, {updatedAt: 9e12,
    current:{key:"T", index:2, kit:"db", rkey:"A", startedAt:1, entries:[]}});
  live.roadIndex = 2;
  const m3 = W.mergeStates(live, c);
  ok("a road session in progress leaves the home counter alone", m3.sessionIndex === 10, String(m3.sessionIndex));
  ok("and is still on the bench", !!m3.current && m3.current.key === "T");
  /* finished elsewhere: the bench copy goes */
  const done = homeState(10, 4, {updatedAt: 1});
  done.history.push(road(2, "A", "db", 0)); done.roadIndex = 3;
  const m4 = W.mergeStates(live, done);
  ok("a road session finished on the other machine clears the bench", !m4.current);
  b.win.close();
}

console.log("\n8. two devices: a road session started on the phone shows on the laptop");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: homeState(20, 2), updatedAt: Date.now(), device:"seed"};
  const per = (w)=> ({get:(u)=>cloud.get(u), set:(u,s)=>{ cloud.device = w.__device; return cloud.set(u,s); }, watch:(u,cb)=>cloud.watch(u,cb)});
  const A = boot({cloud: cloud}); A.win.__cloud = per(A.win); A.win.confirm = ()=> true;
  await A.win.ironworkSignedIn("u1", {});
  const B = boot({cloud: cloud}); B.win.__cloud = per(B.win); B.win.confirm = ()=> true;
  await B.win.ironworkSignedIn("u1", {});
  const clickA = (el)=> el.dispatchEvent(new A.win.MouseEvent("click", {bubbles:true}));
  clickA(A.win.document.querySelectorAll('#view .kits button')[1]);
  clickA(A.win.document.querySelector('#view [data-act="start"]'));
  await wait(120);
  ok("the laptop sees the road session", B.g("S").current && B.g("S").current.key === "T");
  ok("and draws it", B.win.document.getElementById("view").innerHTML.indexOf("road session 1") > -1);
  B.win.eval("S.current.entries[0].sets[0].done = true; finishSession()");
  await wait(150);
  ok("finished on the laptop, the phone agrees", !A.g("S").current && A.g("S").roadIndex === 1);
  ok("both still at home session 21", A.g("S").sessionIndex === 20 && B.g("S").sessionIndex === 20);
  A.win.close(); B.win.close();
}

console.log("\n9. the rhythm grid after a trip");
{
  /* block of 9 starting at index 36: 36,37,38,39 logged, then 40 after a 10-day trip */
  const st = homeState(40, 10);
  st.history.push(road(0, "B", "db", 8), road(1, "C", "bw", 6), road(2, "A", "db", 4), road(3, "B", "trx", 2));
  st.history.push(home(40, 0));
  st.sessionIndex = 41; st.roadIndex = 4;
  const b = await signedIn(st);
  const box = b.qa('#view .rgrid .rbx').find(x => /on the road/.test(x.textContent));
  ok("the session after the trip is not late", !!box && box.classList.contains("on"), box ? box.className : "none");
  ok("it says how many on the road", !!box && /4 on the road/.test(box.textContent), box && box.textContent);
  ok("no box says +8 days", !b.qa('#view .rgrid .rbx').some(x => /\+8 days/.test(x.textContent)));
  const tile = b.q('#view .rgrid [data-act="roadList"]');
  ok("a Road tile in the alongside row", !!tile && /Road 4/.test(tile.textContent), tile && tile.textContent);
  b.click(tile);
  ok("it opens the road sessions", b.g("histFilter") === "road" && b.qa('#view [data-hopen]').length === 4,
     b.qa('#view [data-hopen]').length + " rows");
  ok("with no NaN", b.v().indexOf("NaN") === -1);
  b.win.close();
}
{
  /* the same gap with nothing in it is still late */
  const st = homeState(40, 10); st.history.push(home(40, 0)); st.sessionIndex = 41;
  const b = await signedIn(st);
  ok("a gap with no training is still late", b.qa('#view .rgrid .rbx.late').some(x => /\+8 days/.test(x.textContent)));
  b.win.close();
}
{
  /* a road session that leaves a long hole is not a bridge */
  const st = homeState(40, 12);
  st.history.push(road(0, "B", "db", 10));
  st.history.push(home(40, 0)); st.sessionIndex = 41; st.roadIndex = 1;
  const b = await signedIn(st);
  ok("one road session at the start of a long gap does not bridge it",
     b.qa('#view .rgrid .rbx.late').length >= 1);
  b.win.close();
}

console.log("\n10. due dates never fall in the past");
{
  const st = homeState(38, 20);                 // last home session 20 days ago
  const b = await signedIn(st);
  const today = b.g("dayKey(new Date())");
  ok("the next one is due today", b.g("dueDay(38)") === today, b.g("dueDay(38)") + " vs " + today);
  ok("the one after, two days on", b.g("dayGap(dayKey(new Date()), dueDay(39))") === 2);
  const boxes = b.qa('#view .rgrid .rbx.due,#view .rgrid .rbx.next').map(x => x.textContent);
  ok("the next box says Today", boxes[0] === "Today", boxes.join(","));
  b.win.close();
}
{
  /* after a road session yesterday, the next home session is due tomorrow */
  const st = homeState(38, 9); st.history.push(road(0, "B", "db", 1)); st.roadIndex = 1;
  const b = await signedIn(st);
  ok("counted from the road session", b.g("dayGap(dayKey(new Date()), dueDay(38))") === 1,
     String(b.g("dayGap(dayKey(new Date()), dueDay(38))")));
  b.win.close();
}

console.log("\n11. reopening a road session");
{
  const st = homeState(40, 4); st.history.push(road(0, "B", "db", 1)); st.roadIndex = 1;
  const b = await signedIn(st);
  const idx = b.g("S").history.length - 1;
  ok("reopen works", b.win.eval("reopenSession(" + idx + ")") === null);
  ok("the home counter did not move", b.g("S").sessionIndex === 40);
  ok("it is a road session on the bench", b.g("S").current.key === "T" && b.g("S").current.kit === "db");
  ok("and draws as one", b.v().indexOf("road session 1") > -1 && !b.fault(), b.fault());
  b.win.eval("finishSession()");
  ok("re-finished, home still 40, road still 1", b.g("S").sessionIndex === 40 && b.g("S").roadIndex === 1);
  b.win.close();
}

console.log("\n12. looking ahead on the road");
{
  const b = await signedIn(homeState(40, 2));
  b.click(b.qa('#view .kits button')[1]);
  b.click(b.q('#view .rot[data-act="rprev:C"]'));
  ok("the preview opens", b.v().indexOf("What you will do") > -1 && b.v().indexOf("Looking ahead only") > -1);
  const row = b.q('#view .prow[data-diag]');
  b.click(row);
  ok("an exercise opens its cue", b.v().indexOf('class="cue"') > -1 && !b.fault(), b.fault());
  b.click(b.q('#view [data-act="closePreview"]'));
  ok("Close goes back", b.v().indexOf("Home gym holds at") > -1);
  b.click(b.q('#view .btn-ghost[data-act="rprev:B"]'));
  ok("the next one can be started from its preview", !!b.q('#view .btn[data-act="start"]'));
  b.click(b.q('#view .btn[data-act="start"]'));
  ok("and it starts", b.g("S").current && b.g("S").current.key === "T");
  b.win.close();
}

console.log("\n13. every screen, every kit: no fault, no NaN");
{
  const st = homeState(40, 10);
  st.history.push(road(0, "B", "db", 8), road(1, "C", "bw", 6));
  st.roadIndex = 2;
  const b = await signedIn(st);
  const bad = [];
  ["train","progress","library","settings"].forEach(t=>{
    b.click(b.q('.nav button[data-tab="' + t + '"]'));
    if(b.v().indexOf("NaN") > -1) bad.push(t + " NaN");
    if(b.fault()) bad.push(t + " " + b.fault());
  });
  [0,1,2,3].forEach(k=>{
    b.click(b.q('.nav button[data-tab="train"]'));
    b.click(b.qa('#view .kits button')[k]);
    if(b.v().indexOf("NaN") > -1 || b.v().indexOf("undefined") > -1) bad.push("kit " + k);
    if(b.fault()) bad.push("kit " + k + " " + b.fault());
  });
  ok("clean", bad.length === 0, bad.join(" | "));
  b.click(b.q('.nav button[data-tab="library"]'));
  ok("the Library lists all three road kits",
     ["Dumbbells","TRX","Bodyweight"].every(n => b.v().indexOf('<h2 class="head">' + n + '</h2>') > -1));
  b.click(b.q('.nav button[data-tab="settings"]'));
  ok("Setup counts road sessions on their own", /in the programme, 2 on the road/.test(b.v()));
  b.click(b.q('.nav button[data-tab="progress"]'));
  ok("Progress names road sessions by kit", b.v().indexOf("Root · Dumbbells") > -1);
  b.win.close();
}

console.log("\n14. restore keeps the road");
{
  const st = homeState(40, 10);
  const exportArr = homeState(40, 10).history.concat([road(0, "B", "db", 8), road(1, "C", "trx", 6)]);
  const b = await signedIn(st);
  b.click(b.q('.nav button[data-tab="settings"]'));
  b.click(b.q('#view [data-act="toggleRestore"]'));
  b.win.document.getElementById("restoreBox").value = JSON.stringify(exportArr);
  b.click(b.q('#view [data-act="restore"]'));
  ok("the road sessions came in", b.g("S").history.filter(h => h.key === "T").length === 2);
  ok("the road counter followed them", b.g("S").roadIndex === 2, String(b.g("S").roadIndex));
  ok("home did not move", b.g("S").sessionIndex === 40);
  b.win.close();
}

console.log("\n15. house rules");
{
  const html = fs.readFileSync(__dirname + "/index.html", "utf8");
  ok("no opacity anywhere", !/opacity/.test(html));
  ok("no rgba anywhere", !/rgba\(/.test(html));
  ok("the build is 64", /const BUILD = "64"/.test(html));
  ok("every road exercise is used, every used one exists", (function(){
    const b = boot({cloud: makeCloud()});
    const res = b.win.eval(`(function(){
      const used = {};
      Object.keys(ROAD).forEach(k => Object.keys(ROAD[k]).forEach(r => ROAD[k][r].blocks.forEach(bl => bl.items.forEach(it => used[it.ex] = 1))));
      const missing = Object.keys(used).filter(id => !ROAD_EX[id]);
      const spare = Object.keys(ROAD_EX).filter(id => !used[id]);
      return missing.concat(spare).join(",");
    })()`);
    b.win.close();
    return res === "";
  })());
  ok("every road session fits in 45 minutes", (function(){
    const b = boot({cloud: makeCloud()});
    const worst = b.win.eval(`Math.max(...Object.keys(ROAD).flatMap(k => ["A","B","C"].map(r => estimateMinutes(roadSession(k, r)))))`);
    b.win.close();
    return worst <= 45;
  })());
  ok("art is only borrowed from a drawing that exists", (function(){
    const b = boot({cloud: makeCloud()});
    const bad = b.win.eval(`Object.values(ROAD_EX).filter(x => x.art && !DIAG[x.art] && !SHOT_CAPS[x.art]).map(x => x.id).join(",")`);
    b.win.close();
    return bad === "";
  })());
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
