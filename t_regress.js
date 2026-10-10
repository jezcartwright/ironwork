/* Everything that has broken before, clicked for real. */
const {makeCloud, boot, wait, stateWith} = require("./cloudharness");

let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}

async function run(){
const cloud = makeCloud();
cloud.docs["u1"] = {state: stateWith(14), updatedAt: Date.now(), device:"this"};
const {win, g} = boot({cloud: cloud});
await win.ironworkSignedIn("u1", {name:"JC"});
/* jsdom has no confirm. During the blind sweep every destructive prompt is
   declined, so the sweep cannot erase the data it is meant to be clicking. */
let allowDestructive = false;
win.confirm = (msg)=> allowDestructive ||
  !/erase every|cannot be undone|discard|remove |delete |sign out/i.test(String(msg));
win.alert = ()=> {};

const D = win.document;
const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
const v = ()=> D.getElementById("view").innerHTML;
const fault = ()=> {
  const f = D.querySelector(".fault");
  return f ? f.textContent.slice(0, 120) : "";
};
const tapTab = (t)=> click(D.querySelector('.nav button[data-tab="' + t + '"]'));

console.log("\nthe fault reporter is still wired");
ok("window error handler present", typeof win.showFault === "function");
ok("nothing has faulted yet", fault() === "", fault());

console.log("\nevery tab, and every clickable thing on it");
let clicked = 0, faults = [];
["train","progress","library","settings"].forEach(t=>{
  tapTab(t);
  if(fault()) faults.push(t + " tab: " + fault());
  /* Re-query every time: a tap redraws the view, so a list captured up front
     holds elements that are no longer on the page. */
  const sel = "#view [data-act],#view [data-rot],#view [data-histex],#view [data-hopen]," +
              "#view [data-day],#view [data-units],#view [data-figure],#view [data-bar]," +
              "#view [data-nudge],#view [data-histfilter],#view [data-pick],#view [data-swap]," +
              "#view [data-family],#view [data-effort],#view [data-feel],#view [data-place]";
  const n = D.querySelectorAll(sel).length;
  for(let i = 0; i < Math.min(n, 60); i++){
    tapTab(t);
    const els = D.querySelectorAll(sel);
    if(i >= els.length) break;
    const el = els[i];
    const what = JSON.stringify(Object.assign({}, el.dataset));
    click(el); clicked++;
    if(fault()){ faults.push(t + ": " + what + " -> " + fault()); break; }
  }
});
ok(clicked + " elements tapped with no fault", faults.length === 0, faults.slice(0,3).join(" | "));
ok("the sweep did not lose the history", g("S").history.length === 14, g("S").history.length + " left");

console.log("\nthe Rhythm grid");
/* the blind sweep may well have started a session — back to the home screen */
win.eval('S.current = null; pick = {open:false, sel:null, when:null, family:null}; addOpen = false; save();');
tapTab("train");
const grid = Array.from(D.querySelectorAll("#view .rgrid .rbx"));
ok("nine-box grid is there", grid.length === 9, grid.length + " boxes");
ok("the ALSO row is there", D.querySelectorAll("#view .rgrid .rgb").length === 3,
   D.querySelectorAll("#view .rgrid .rgb").length + " tiles");
if(grid.length){
  click(grid[0]);
  ok("a grid box opens something", v().length > 100);
  ok("with no NaN", v().indexOf("NaN") === -1);
  ok("and no fault", fault() === "", fault());
  tapTab("train");
}

console.log("\nProgress drills down");
tapTab("progress");
const rows = Array.from(D.querySelectorAll("#view [data-histex],#view [data-act],#view [data-hopen]"));
ok("Progress has rows", rows.length > 0);
if(rows.length){ click(rows[0]); ok("a row opens", v().length > 100); ok("no fault", fault() === "", fault()); }

console.log("\na session end to end");
tapTab("train");
win.eval("startSession()");
await wait(60);
ok("a session is open", !!g("S").current);
ok("the session view drew", v().indexOf("input") > -1);

/* log every set the way a thumb would */
let logged = 0;
const nSets = D.querySelectorAll('#view [data-done]').length;
for(let i = 0; i < nSets - 1; i++){      // leave one untouched, to reopen onto
  /* one tap per tick box, by position — each tap redraws, so re-query */
  const els = D.querySelectorAll('#view [data-done]');
  if(i >= els.length) break;
  click(els[i]); logged++;
  if(fault()) break;
}
ok("sets are marked done in the state",
   g("S").current.entries.reduce((a,e)=> a + (e.sets||[]).filter(s=>s.done).length, 0) > 0);
ok("sets can be logged (" + logged + ")", logged > 0 && fault() === "", fault());

const restOn = D.getElementById("restHost").innerHTML.indexOf("rest") > -1;
ok("a rest clock started", restOn);
if(restOn){
  const add = D.querySelector('[data-rest="add"]');
  if(add){ click(add); ok("+30s works", fault() === "", fault()); }
  const skip = D.querySelector('[data-rest="skip"]');
  if(skip){ click(skip); ok("Skip works", fault() === "" && g("restLeft") === 0, fault()); }
}

console.log("\nfinish, then reopen");
allowDestructive = true;
const before = g("S").history.length;
win.eval("finishSession()");
await wait(60);
ok("the session landed in history", g("S").history.length === before + 1,
   before + " -> " + g("S").history.length);
ok("and nothing is in progress", !g("S").current);
ok("the summary drew", v().length > 100 && fault() === "", fault());

const idx = g("S").history.length - 1;
const res = win.eval("reopenSession(" + idx + ")");
await wait(60);
ok("reopen returned no complaint", res === null, String(res));
ok("it is back in progress", !!g("S").current);
ok("history is back to " + before, g("S").history.length === before);
const sets = g("S").current.entries.reduce((n,e)=> n + (e.sets||[]).length, 0);
const done = g("S").current.entries.reduce((n,e)=> n + (e.sets||[]).filter(s=>s.done).length, 0);
ok("the logged sets came back (" + done + " of " + sets + ")", done > 0);
ok("the untouched set came back too", sets - done === 1, (sets - done) + " untouched");
win.eval("finishSession()");
await wait(60);
ok("re-finishing works", g("S").history.length === before + 1 && fault() === "", fault());

console.log("\nthe rest clock survives a reload");
win.eval('startSession(); startRest(120, "Rest 2:00")');
await wait(900);
ok("the rest is recorded in the state", !!g("S").rest, JSON.stringify(g("S").rest));
const carried = JSON.parse(JSON.stringify(g("S")));
win.close();

const {win: w2, g: g2} = boot({cloud: cloud, local: carried});
await w2.ironworkSignedIn("u1", {});
ok("the clock is still running after a reload", g2("restLeft") > 100 && g2("restLeft") <= 120,
   "restLeft=" + g2("restLeft"));
ok("and shown", w2.document.getElementById("restHost").innerHTML.indexOf("rest") > -1);
w2.close();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
