/* Opening the app. The bug being pinned down: it painted the signed-out copy
   first, so a session finished weeks ago appeared and then vanished. */
const {makeCloud, boot, wait, stateWith} = require("./cloudharness");

let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}

const KEY = "ironwork:v1";

/* a stale copy left behind before anyone signed in, with a session on the bench */
function anonWithLiveSession(){
  const S = stateWith(5);
  S.updatedAt = 1000;
  S.current = {index:5, key:"D", startedAt: 1000, entries:[
    {block:0, slot:"sq", exId:"bb-squat", track:"load", sets:[{w:80,r:8,done:true}]}
  ]};
  return S;
}

const screen = (win)=>{
  const h = win.document.getElementById("view").innerHTML;
  if(!h) return "nothing";
  if(h.indexOf("data-done") > -1) return "session in progress";
  if(h.indexOf("rgrid") > -1 || h.indexOf("Rhythm") > -1) return "home";
  return "something else";
};

async function run(){

console.log("\n1. with a sign-in expected, nothing is painted from the signed-out copy");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(45), updatedAt: Date.now(), device:"other"};
  const {win, g} = boot({
    cloud: cloud,
    local: stateWith(45),
    anon: anonWithLiveSession(),
    lastUid: "u1"
  });
  /* Auth has NOT answered. Wait past 2.5 seconds — that was the old fallback,
     and the moment the signed-out copy used to get painted. This is the exact
     window the flash lived in, so a shorter wait would not catch it. */
  await wait(3200);
  ok("the screen is held, not guessed at", screen(win) === "nothing", screen(win));
  ok("no phantom session on the bench", !g("S") || !g("S").current,
     g("S") && g("S").current ? "current present" : "none");

  /* auth answers */
  await win.ironworkSignedIn("u1", {name:"JC"});
  ok("it opens on the home screen", screen(win) === "home", screen(win));
  ok("with all 45", g("S").history.length === 45, String(g("S").history.length));
  ok("and no session in progress", !g("S").current);
  ok("no fault", !win.document.querySelector(".fault"));
  win.close();
}

console.log("\n2. a genuine session in progress still opens straight onto it");
{
  const cloud = makeCloud();
  const live = stateWith(45);
  live.current = {index:45, key:"D", startedAt: Date.now(), entries:[
    {block:0, slot:"sq", exId:"bb-squat", track:"load", sets:[{w:80,r:8,done:false}]}
  ]};
  cloud.docs["u1"] = {state: live, updatedAt: Date.now(), device:"other"};
  const {win, g} = boot({cloud: cloud, local: live, lastUid: "u1"});
  await win.ironworkSignedIn("u1", {});
  ok("straight onto the session", screen(win) === "session in progress", screen(win));
  ok("and it stays there", !!g("S").current);
  await wait(400);
  ok("still there a moment later", screen(win) === "session in progress", screen(win));
  win.close();
}

console.log("\n3. auth never answers — offline, or the SDK did not load");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(45), updatedAt: Date.now(), device:"other"};
  const {win, g} = boot({
    cloud: cloud, local: stateWith(45), anon: anonWithLiveSession(), lastUid: "u1"
  });
  win.eval("firstRender()");                 // the fallback firing
  await wait(400);
  ok("it opens on the right person's copy", g("S") && g("S").history.length === 45,
     g("S") ? String(g("S").history.length) : "none");
  ok("not the signed-out one", !g("S").current, g("S") && g("S").current ? "phantom" : "clean");
  ok("on the home screen", screen(win) === "home", screen(win));
  ok("and the sign-in gate is not in the way", win.document.getElementById("gate").hidden);
  win.close();
}

console.log("\n4. a device nobody has signed in on still opens");
{
  const cloud = makeCloud();
  const {win, g} = boot({cloud: cloud});
  win.eval("firstRender()");
  await wait(300);
  ok("it drew something", screen(win) !== "nothing" || !!g("S"), screen(win));
  ok("no fault", !win.document.querySelector(".fault"));
  win.close();
}

console.log("\n5. signing out forgets whose device it is");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(45), updatedAt: Date.now(), device:"other"};
  const {win} = boot({cloud: cloud, lastUid: null});
  await win.ironworkSignedIn("u1", {});
  ok("signing in remembers", win.localStorage.getItem(KEY + ":signedin") === "u1",
     String(win.localStorage.getItem(KEY + ":signedin")));
  win.ironworkSignedOut();
  ok("signing out forgets", !win.localStorage.getItem(KEY + ":signedin"));
  ok("and the gate is shown", !win.document.getElementById("gate").hidden);
  win.close();
}

console.log("\n6. a missing `current` key does not resurrect the other copy's session");
{
  const {win} = boot({cloud: makeCloud()});
  const older = stateWith(5);
  older.updatedAt = 1000;
  older.current = {index:5, key:"D", startedAt:1, entries:[]};
  const newer = stateWith(6);
  newer.updatedAt = 9000;
  delete newer.current;                        // saved by a build that omitted it
  const m = win.mergeStates(older, newer);
  ok("no session is carried over", !m.current, "current=" + JSON.stringify(m.current));
  ok("the sessions still merge", m.history.length === 6, String(m.history.length));
  win.close();
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
