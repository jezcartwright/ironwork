/* Restore from JSON, clicked for real, against the actual exported files. */
const fs = require("fs");
const {makeCloud, boot, wait} = require("./cloudharness");

let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}

const IPHONE = "/tmp/claude-0/data/iphone.json";
const MAC    = "/tmp/claude-0/data/mac.json";
const have = fs.existsSync(IPHONE) && fs.existsSync(MAC);

function wrap(history, updatedAt){
  return {v:1, units:"kg", bar:20, figure:"m", courses:[], nudge:{}, custom:[],
          history: history, current:null,
          sessionIndex: history.filter(h=>h.key && h.key !== "X").length,
          updatedAt: updatedAt};
}

async function run(){
if(!have){ console.log("  (the exported files are not here — skipping)"); process.exit(0); }
const A = JSON.parse(fs.readFileSync(IPHONE, "utf8"));   // 45, complete
const B = JSON.parse(fs.readFileSync(MAC, "utf8"));      // 23, stale subset

console.log("\nthe stale machine, restored from the phone's export");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: wrap(B, 9e12), updatedAt: Date.now(), device:"mac"};
  const {win, g} = boot({cloud: cloud, local: wrap(B, 9e12)});
  const alerts = [];
  win.alert = (m)=> alerts.push(String(m));
  win.confirm = ()=> true;
  await win.ironworkSignedIn("u1", {});
  ok("starts on the stale 23", g("S").history.length === 23, String(g("S").history.length));

  const D = win.document;
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  ok("Setup says 23 sessions recorded", D.getElementById("view").innerHTML.indexOf("23 sessions recorded") > -1);

  const toggle = D.querySelector('#view [data-act="toggleRestore"]');
  ok("there is a Restore button", !!toggle);
  click(toggle);
  const box = D.getElementById("restoreBox");
  ok("the paste box opened", !!box);
  box.value = JSON.stringify(A);
  click(D.querySelector('#view [data-act="restore"]'));
  await wait(60);
  ok("all 45 are there now", g("S").history.length === 45, String(g("S").history.length));
  ok("it said how many it added", /22 sessions added/.test(alerts.join(" ")), alerts.join(" | "));
  ok("September is complete", g("S").history.filter(h =>
      ((h.day) || (h.date || "")).slice(0,7) === "2026-09").length === 21);
  ok("the box closed again", !D.getElementById("restoreBox"));
  ok("no fault", !D.querySelector(".fault"));
  await wait(900);
  ok("and it went up to the account", (cloud.docs["u1"].state.history || []).length === 45,
     String((cloud.docs["u1"].state.history || []).length));
  ok("the pre-restore copy was kept", !!win.localStorage.getItem("ironwork:v1:u1:prev"));
  win.close();
}

console.log("\nrestoring the same thing twice adds nothing");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: wrap(A, 1000), updatedAt: Date.now(), device:"phone"};
  const {win, g} = boot({cloud: cloud});
  const alerts = [];
  win.alert = (m)=> alerts.push(String(m));
  await win.ironworkSignedIn("u1", {});
  const D = win.document;
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  click(D.querySelector('#view [data-act="toggleRestore"]'));
  D.getElementById("restoreBox").value = JSON.stringify(A);
  click(D.querySelector('#view [data-act="restore"]'));
  await wait(60);
  ok("still 45", g("S").history.length === 45, String(g("S").history.length));
  ok("and it said so plainly", /already here/.test(alerts.join(" ")), alerts.join(" | "));
  win.close();
}

console.log("\na pasted copy cannot change anything but the sessions");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: wrap(B, 9e12), updatedAt: Date.now(), device:"mac"};
  const {win, g} = boot({cloud: cloud});
  win.alert = ()=>{};
  await win.ironworkSignedIn("u1", {});
  win.eval("S.units = 'lb'; S.bar = 15; S.current = {index:99, key:'A', startedAt:1, entries:[]}; save();");
  await wait(900);
  const D = win.document;
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  click(D.querySelector('#view [data-act="toggleRestore"]'));
  D.getElementById("restoreBox").value = JSON.stringify(
    Object.assign(wrap(A, 9e13), {units:"kg", bar:99, current:null}));
  click(D.querySelector('#view [data-act="restore"]'));
  await wait(60);
  ok("the sessions came in", g("S").history.length === 45, String(g("S").history.length));
  ok("but the units are still mine", g("S").units === "lb", g("S").units);
  ok("and the bar weight is still mine", g("S").bar === 15, String(g("S").bar));
  ok("and the session on the bench is untouched", g("S").current && g("S").current.index === 99);
  win.close();
}

console.log("\nrubbish pasted in");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: wrap(B, 1000), updatedAt: Date.now(), device:"mac"};
  const {win, g} = boot({cloud: cloud});
  const alerts = [];
  win.alert = (m)=> alerts.push(String(m));
  await win.ironworkSignedIn("u1", {});
  const D = win.document;
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  const paste = (text)=>{
    if(!D.getElementById("restoreBox")) click(D.querySelector('#view [data-act="toggleRestore"]'));
    D.getElementById("restoreBox").value = text;
    click(D.querySelector('#view [data-act="restore"]'));
  };
  click(D.querySelector('.nav button[data-tab="settings"]'));
  paste("");
  ok("an empty box is refused", /Paste the copied JSON/.test(alerts.join(" ")), alerts.join(" | "));
  paste("not json at all {{{");
  ok("broken text is refused", /not readable JSON/.test(alerts.join(" ")));
  paste("[]");
  ok("an empty list is refused", /No sessions found/.test(alerts.join(" ")));
  paste('{"hello":"world"}');
  ok("the wrong shape is refused", (alerts.join(" ").match(/No sessions found/g) || []).length >= 2);
  ok("none of it changed the history", g("S").history.length === 23, String(g("S").history.length));
  ok("and nothing faulted", !D.querySelector(".fault"),
     D.querySelector(".fault") ? D.querySelector(".fault").textContent.slice(0,80) : "");
  win.close();
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
