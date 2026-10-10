/* The merge. The question these answer is: can a session that exists in either
   copy ever disappear? It must not. */
const {makeCloud, boot, wait, stateWith} = require("./cloudharness");

let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}

/* a programme session at a given index, on a given day */
function sess(index, day, sets){
  const key = ["Drive","Root","Reach"][index % 3][0] === "D" ? "D" : (index % 3 === 1 ? "R" : "C");
  return {
    key: key, index: index, day: day,
    date: new Date(day + "T18:00:00Z").toISOString(),
    minutes: 45, effort: "ok",
    entries: [{slot:"sq", exId:"bb-squat", track:"load",
      sets: Array.from({length: sets || 2}, ()=>({w:80, r:8, done:true}))}]
  };
}
/* an alongside session: golf, a run */
function also(day, exId, mins){
  return {
    key:"X", open:true, index:0, day:day,
    date: new Date(day + "T09:00:00Z").toISOString(), minutes: mins || 60,
    entries:[{slot:null, exId:exId, extra:true, name:exId, track:"time",
      sets:[{w:mins||60, r:7, done:true}], meta:{}}]
  };
}
function st(history, extra){
  return Object.assign({
    v:1, units:"kg", bar:20, figure:"m", courses:[], nudge:{}, custom:[],
    history: history, current:null,
    sessionIndex: history.filter(h=>h && h.key && h.key!=="X").length,
    updatedAt: 1000
  }, extra || {});
}

async function run(){
const base = boot({cloud: makeCloud()});
const W = base.win, g = base.g;
const merge = (a, b)=> W.mergeStates(a, b);
const ids = (s)=> (s.history || []).map(h => W.sessionId(h));

console.log("\n1. the September case: each copy has what the other lost");
{
  const phone  = st([sess(0,"2026-09-02"), sess(1,"2026-09-04"), sess(2,"2026-09-07")], {updatedAt: 5000});
  const laptop = st([sess(0,"2026-09-02"), sess(3,"2026-09-09"), sess(4,"2026-09-11")], {updatedAt: 9000});
  const m = merge(phone, laptop);
  ok("all five sessions survive", m.history.length === 5, m.history.length + ": " + ids(m).join(" "));
  ok("in date order", JSON.stringify(m.history.map(h=>h.day)) ===
     JSON.stringify(["2026-09-02","2026-09-04","2026-09-07","2026-09-09","2026-09-11"]),
     m.history.map(h=>h.day).join(" "));
  ok("the duplicate is not doubled", m.history.filter(h=>h.day==="2026-09-02").length === 1);
  ok("the counter sits past them all", m.sessionIndex === 5, String(m.sessionIndex));
  const back = merge(laptop, phone);
  ok("and it does not matter which way round", back.history.length === 5);
}

console.log("\n2. nothing is ever lost, whatever the timestamps say");
{
  const rich = st([sess(0,"2026-09-01"), sess(1,"2026-09-03"), sess(2,"2026-09-05")], {updatedAt: 100});
  const thin = st([], {updatedAt: 9e12});
  ok("an empty copy, however new, takes nothing away", merge(rich, thin).history.length === 3);
  ok("the other way round too", merge(thin, rich).history.length === 3);
  const one = st([sess(0,"2026-09-01")], {updatedAt: 9e12});
  ok("a short new copy does not shorten a long old one", merge(rich, one).history.length === 3);
}

console.log("\n3. the same session held twice");
{
  const few  = st([sess(4,"2026-09-10", 2)], {updatedAt: 1000});
  const many = st([sess(4,"2026-09-10", 5)], {updatedAt: 1000});
  const m = merge(few, many);
  ok("kept once", m.history.length === 1);
  ok("and the fuller record wins", m.history[0].entries[0].sets.length === 5,
     String(m.history[0].entries[0].sets.length));
  ok("whichever side it is on", merge(many, few).history[0].entries[0].sets.length === 5);
}

console.log("\n4. alongside sessions, which have no place in the programme");
{
  const a = st([also("2026-09-06","golf",240), also("2026-09-08","run",35)], {updatedAt: 1000});
  const b = st([also("2026-09-06","golf",240), also("2026-09-13","padel",90)], {updatedAt: 2000});
  const m = merge(a, b);
  ok("three activities, not four", m.history.length === 3, m.history.length + ": " + ids(m).join(" "));
  ok("golf is not duplicated", m.history.filter(h=>h.entries[0].exId==="golf").length === 1);
  /* two rounds of golf on the same day are two rounds */
  const twice = st([also("2026-09-06","golf",240),
                    Object.assign(also("2026-09-06","golf",120), {minutes:120})], {updatedAt: 1000});
  ok("but two different rounds on one day stay two", merge(twice, st([], {updatedAt:1})).history.length === 2);
  ok("and they do not raise the programme counter", merge(a, b).sessionIndex === 0,
     String(merge(a, b).sessionIndex));
}

console.log("\n5. a session finished on one machine and still on the bench on the other");
{
  const done = st([sess(0,"2026-09-01"), sess(1,"2026-09-03")], {updatedAt: 9000});
  const live = st([sess(0,"2026-09-01")], {updatedAt: 5000,
    current:{index:1, key:"R", startedAt:1, entries:[{slot:"sq", exId:"bb-squat", sets:[{w:80,r:8,done:true}]}]}});
  const m = merge(live, done);
  ok("the finished record stands", m.history.length === 2);
  ok("and the stale bench copy is dropped", !m.current);

  /* but one deliberately reopened is not stale */
  const reopened = st([sess(0,"2026-09-01")], {updatedAt: 9e12,
    current:{index:1, key:"R", startedAt:1, reopened:{at:1, day:"2026-09-03"},
             entries:[{slot:"sq", exId:"bb-squat", sets:[{w:80,r:8,done:true}]}]}});
  const m2 = merge(reopened, st([sess(0,"2026-09-01")], {updatedAt: 1}));
  ok("a reopened session is left on the bench", !!m2.current);
}

console.log("\n6. settings, courses and added exercises");
{
  const a = st([], {updatedAt: 5000, units:"kg", bar:20,
    custom:[{id:"x1", name:"Padel"}], courses:[{name:"Pebble Beach"}], nudge:{sq:1}});
  const b = st([], {updatedAt: 9000, units:"lb", bar:15,
    custom:[{id:"x2", name:"Skiing"}], courses:[{name:"Spyglass"}], nudge:{bench:2}});
  const m = merge(a, b);
  ok("the newer copy decides the settings", m.units === "lb" && m.bar === 15, m.units + "/" + m.bar);
  ok("both added exercises survive", m.custom.length === 2, String(m.custom.length));
  ok("both courses survive", m.courses.length === 2, String(m.courses.length));
  ok("the nudges are combined", m.nudge.sq === 1 && m.nudge.bench === 2, JSON.stringify(m.nudge));
  const dup = merge(a, st([], {updatedAt: 9000, courses:[{name:"pebble  beach"}]}));
  ok("the same course under sloppier spacing is not duplicated", dup.courses.length === 1,
     JSON.stringify(dup.courses));
}

console.log("\n7. rubbish in");
{
  ok("no copies at all", merge(null, null) === null);
  ok("only one copy", merge(null, st([sess(0,"2026-09-01")])).history.length === 1);
  ok("a copy with no version is ignored", merge(st([sess(0,"2026-09-01")]), {history:[sess(9,"2026-09-20")]}).history.length === 1);
  const junk = st([sess(0,"2026-09-01"), null, undefined, "nonsense", {}]);
  const m = merge(junk, st([], {updatedAt:1}));
  ok("nonsense in the history is dropped, not crashed on", m.history.length <= 2,
     m.history.length + ": " + JSON.stringify(m.history.map(h=>h&&h.day)));
}

console.log("\n8. the fingerprint only changes when something real does");
{
  const a = st([sess(0,"2026-09-01")], {updatedAt: 1000});
  const b = st([sess(0,"2026-09-01")], {updatedAt: 9000});
  ok("a bare timestamp bump is not a change",
     W.stateFingerprint(a) === W.stateFingerprint(b));
  ok("a new session is", W.stateFingerprint(a) !==
     W.stateFingerprint(st([sess(0,"2026-09-01"), sess(1,"2026-09-03")])));
  ok("a logged set is", W.stateFingerprint(a) !== W.stateFingerprint(st([sess(0,"2026-09-01", 4)])));
  ok("a change of units is", W.stateFingerprint(a) !==
     W.stateFingerprint(st([sess(0,"2026-09-01")], {units:"lb"})));
}
base.win.close();

console.log("\n9. in the app: a device holding sessions the account lost");
{
  const cloud = makeCloud();
  /* the account was overwritten by a machine that had never seen September */
  cloud.docs["u1"] = {state: st([sess(0,"2026-08-28"), sess(1,"2026-08-30")], {updatedAt: 9e12}),
                      updatedAt: Date.now(), device:"laptop"};
  /* but this phone still has them */
  const onPhone = st([sess(0,"2026-08-28"), sess(1,"2026-08-30"),
                      sess(2,"2026-09-02"), sess(3,"2026-09-04"), sess(4,"2026-09-07"),
                      also("2026-09-06","golf",240)], {updatedAt: 1000});
  const {win, g} = boot({cloud: cloud, local: onPhone});
  await win.ironworkSignedIn("u1", {});
  ok("the phone shows all six", g("S").history.length === 6, String(g("S").history.length));
  await wait(900);
  ok("and puts them back into the account", (cloud.docs["u1"].state.history || []).length === 6,
     String((cloud.docs["u1"].state.history || []).length));
  ok("the backup of the pre-merge copy was kept",
     !!win.localStorage.getItem("ironwork:v1:u1:prev"));
  ok("no fault bar", !win.document.querySelector(".fault"));
  win.close();
}

console.log("\n10. the other machine then picks them up");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: st([sess(0,"2026-08-28")], {updatedAt: 1000}), updatedAt: Date.now(), device:"seed"};
  const A = boot({cloud: cloud});
  A.win.__cloud = {get:(u)=>cloud.get(u),
                   set:(u,s)=>{cloud.device = A.win.__device; return cloud.set(u,s);},
                   watch:(u,c)=>cloud.watch(u,c)};
  await A.win.ironworkSignedIn("u1", {});
  const B = boot({cloud: cloud, local: st([sess(0,"2026-08-28"), sess(1,"2026-09-03"),
                                           sess(2,"2026-09-05")], {updatedAt: 500})});
  B.win.__cloud = {get:(u)=>cloud.get(u),
                   set:(u,s)=>{cloud.device = B.win.__device; return cloud.set(u,s);},
                   watch:(u,c)=>cloud.watch(u,c)};
  await B.win.ironworkSignedIn("u1", {});
  await wait(1200);
  ok("the second machine recovered its two", B.g("S").history.length === 3, String(B.g("S").history.length));
  ok("and the first machine now has them too", A.g("S").history.length === 3, String(A.g("S").history.length));
  ok("neither faulted", !A.win.document.querySelector(".fault") && !B.win.document.querySelector(".fault"));
  A.win.close(); B.win.close();
}

console.log("\n11. a deletion you asked for still goes through");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: st([sess(0,"2026-09-01"), sess(1,"2026-09-03"), sess(2,"2026-09-05")],
                                {updatedAt: 1000}), updatedAt: Date.now(), device:"seed"};
  const {win, g} = boot({cloud: cloud});
  win.confirm = ()=> true;
  await win.ironworkSignedIn("u1", {});
  ok("three to start", g("S").history.length === 3);
  /* tap Delete the way a thumb would */
  win.eval("histIdx = 1; render();");
  const del = Array.from(win.document.querySelectorAll('#view [data-act="delSession"]'))[0];
  ok("there is a Delete button on the session", !!del);
  if(del) del.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  await wait(900);
  ok("two left on the device", g("S").history.length === 2, String(g("S").history.length));
  ok("and two in the account — the guard stood aside",
     (cloud.docs["u1"].state.history || []).length === 2,
     String((cloud.docs["u1"].state.history || []).length));
  win.close();
}

console.log("\n12. an accidental wipe still cannot reach the account");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: st([sess(0,"2026-09-01"), sess(1,"2026-09-03")], {updatedAt: 1000}),
                      updatedAt: Date.now(), device:"seed"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  win.eval("S.history = []; save();");          // a fault, not a request
  await wait(900);
  ok("the account still has both", (cloud.docs["u1"].state.history || []).length === 2,
     String((cloud.docs["u1"].state.history || []).length));
  win.close();
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
