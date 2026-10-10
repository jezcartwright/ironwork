const {makeCloud, boot, wait, stateWith} = require("./cloudharness");

let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}
function eq(name, a, b){ ok(name + "  [" + JSON.stringify(a) + "]", a === b, "expected " + JSON.stringify(b)); }

async function run(){

/* ================================================================
   1. a machine signing in for the first time gets the account copy
   ================================================================ */
console.log("\n1. account is the record of truth");
{
  const cloud = makeCloud();
  const remote = stateWith(7);
  cloud.docs["u1"] = {state: remote, updatedAt: Date.now(), device: "phone"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {email:"jc@x.com"});
  eq("history came from the account", g("S").history.length, 7);
  eq("session counter came with it", g("S").sessionIndex, 7);
  ok("a watcher is running", cloud.watchers === 1);
  win.close();
}

/* a blank device with nothing local at all */
{
  const cloud = makeCloud();
  cloud.docs["u2"] = {state: stateWith(12), updatedAt: Date.now(), device: "laptop"};
  const {win, g} = boot({cloud: cloud, uid:"u2"});
  await win.ironworkSignedIn("u2", {});
  eq("brand-new machine sees 12 sessions", g("S").history.length, 12);
  eq("and caches them locally", JSON.parse(win.localStorage.getItem("ironwork:v1:u2")).history.length, 12);
  win.close();
}

/* ================================================================
   2. the local copy only wins when it is genuinely newer
   ================================================================ */
console.log("\n2. the device copy is a cache, not a peer");
{
  const cloud = makeCloud();
  const remote = stateWith(9); remote.updatedAt = 5000;
  cloud.docs["u1"] = {state: remote, updatedAt: 5000, device:"phone"};
  const local = stateWith(4); local.updatedAt = 3000;     // older, fewer sessions
  const {win, g} = boot({cloud: cloud, local: local});
  await win.ironworkSignedIn("u1", {});
  eq("a device copy that adds nothing changes nothing", g("S").history.length, 9);
  win.close();
}
{
  const cloud = makeCloud();
  const remote = stateWith(9); remote.updatedAt = 5000;
  cloud.docs["u1"] = {state: remote, updatedAt: 5000, device:"phone"};
  const local = stateWith(10); local.updatedAt = 9000;    // logged while offline
  const {win, g} = boot({cloud: cloud, local: local});
  await win.ironworkSignedIn("u1", {});
  eq("a session logged offline survives", g("S").history.length, 10);
  await wait(900);
  ok("and is sent up", cloud.writes.some(w => w.history === 10));
  win.close();
}
{
  const cloud = makeCloud();
  const remote = stateWith(0); remote.updatedAt = 9e12;   // empty but newest
  cloud.docs["u1"] = {state: remote, updatedAt: 9e12, device:"phone"};
  const local = stateWith(6); local.updatedAt = 1000;
  const {win, g} = boot({cloud: cloud, local: local});
  await win.ironworkSignedIn("u1", {});
  eq("an empty account copy takes nothing away", g("S").history.length, 6);
  win.close();
}

/* ================================================================
   3. a session logged on another machine arrives here
   ================================================================ */
console.log("\n3. live updates from another machine");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  eq("starts at 5", g("S").history.length, 5);

  const next = stateWith(6);
  next.updatedAt = g("S").updatedAt + 60000;
  cloud.remote("u1", next, "the-phone");
  await wait(60);
  eq("the sixth session appears without a reload", g("S").history.length, 6);
  eq("and the counter moves", g("S").sessionIndex, 6);
  ok("the screen was redrawn", win.document.getElementById("view").innerHTML.length > 100);
  ok("no NaN on screen", win.document.getElementById("view").innerHTML.indexOf("NaN") === -1);
  win.close();
}

/* a session started elsewhere shows as in progress here */
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  const live = stateWith(5);
  live.current = {index:5, key:"D", startedAt:Date.now(), entries:[
    {block:0, slot:"sq", exId:"bb-squat", track:"load", sets:[{w:80,r:8,done:true},{w:80,r:"",done:false}]}
  ]};
  live.updatedAt = g("S").updatedAt + 60000;
  cloud.remote("u1", live, "the-phone");
  await wait(60);
  ok("the live session carried over", !!g("S").current);
  eq("masthead says so", win.document.getElementById("mastSub").textContent.split("·")[0].trim(), "Session in progress");
  win.close();
}

/* this device's own write must not come back and clobber it */
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  win.eval("startSession()");
  await wait(900);
  const before = JSON.stringify(g("S").current);
  await wait(300);
  eq("the live session is untouched by the echo", JSON.stringify(g("S").current), before);
  ok("the write went up with the session on it", cloud.writes.some(w => w.current));
  win.close();
}

/* an older copy arriving late is ignored */
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  const old = stateWith(2); old.updatedAt = 1000;
  cloud.remote("u1", old, "a-stale-tab");
  await wait(60);
  eq("an older copy that adds nothing changes nothing", g("S").history.length, 5);
  win.close();
}

/* an empty copy arriving from elsewhere is refused */
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  const wiped = stateWith(0); wiped.updatedAt = g("S").updatedAt + 60000;
  cloud.remote("u1", wiped, "a-broken-tab");
  await wait(60);
  eq("a wipe arriving from elsewhere takes nothing away", g("S").history.length, 5);
  win.close();
}


/* an older copy that holds a session this device has never seen */
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  const older = stateWith(5);
  older.updatedAt = 1;                                  // older than anything here
  older.history.push({key:"X", open:true, index:0, day:"2026-09-06",
    date:"2026-09-06T09:00:00.000Z", minutes:240,
    entries:[{slot:null, exId:"golf", extra:true, name:"Golf", track:"time",
              sets:[{w:240, r:7, done:true}], meta:{course:"Pebble Beach", score:88}}]});
  cloud.remote("u1", older, "the-phone");
  await wait(80);
  eq("a round of golf only the account knew about is taken on", g("S").history.length, 6);
  ok("with its score intact", JSON.stringify(g("S").history).indexOf("Pebble Beach") > -1);
  await wait(900);
  ok("and the union goes back up", (cloud.docs["u1"].state.history || []).length === 6,
     String((cloud.docs["u1"].state.history || []).length));
  win.close();
}

/* ================================================================
   4. nothing is swapped out from under a half-typed number
   ================================================================ */
console.log("\n4. holding off while the user is mid-entry");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  win.eval("startSession()");
  win.eval("render()");
  await wait(900);
  const input = win.document.querySelector('input[type="number"]');
  ok("there is a weight box to focus", !!input);
  if(input){
    input.focus();
    const next = stateWith(9); next.updatedAt = g("S").updatedAt + 60000;
    cloud.remote("u1", next, "the-phone");
    await wait(200);
    eq("not applied while the box has focus", g("S").history.length, 5);
    input.blur();
    await wait(1500);
    eq("applied once the box is let go", g("S").history.length, 9);
  }
  win.close();
}

/* ================================================================
   5. the moment it matters, the write goes straight up
   ================================================================ */
console.log("\n5. sending without waiting");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  const n = cloud.writes.length;
  win.eval("startSession()");
  await wait(5);
  ok("starting a session is sent at once", cloud.writes.length > n);
  win.close();
}
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  win.eval("startSession()");
  await wait(900);
  const n = cloud.writes.length;
  g("S").current.entries[0].sets[0].done = true;
  g("S").current.entries[0].sets[0].w = 95;
  win.eval("save()");                                    // debounced
  eq("not yet sent", cloud.writes.length, n);
  win.dispatchEvent(new win.Event("pagehide"));   // phone locks
  await wait(5);
  ok("putting the phone down sends it", cloud.writes.length > n);
  ok("with the 95 on it", JSON.stringify(cloud.docs["u1"].state).indexOf("95") > -1);
  win.close();
}
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  win.eval("startSession()");
  await wait(900);
  const n = cloud.writes.length;
  g("S").current.entries[0].sets[0].done = true;
  win.eval("save()");
  Object.defineProperty(win.document, "hidden", {value:true, configurable:true});
  win.document.dispatchEvent(new win.Event("visibilitychange"));
  await wait(5);
  ok("switching away from the app sends it", cloud.writes.length > n);
  win.close();
}

/* ================================================================
   6. coming back to the app checks the account again
   ================================================================ */
console.log("\n6. coming back to a backgrounded tab");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  win.eval("stopCloudWatch()");                                  // as a phone would
  const next = stateWith(11); next.updatedAt = g("S").updatedAt + 60000;
  cloud.docs["u1"] = {state: next, updatedAt: Date.now(), device:"laptop"};
  Object.defineProperty(win.document, "hidden", {value:false, configurable:true});
  win.document.dispatchEvent(new win.Event("visibilitychange"));
  await wait(120);
  eq("the account is re-read on return", g("S").history.length, 11);
  win.close();
}

/* ================================================================
   7. a rest started elsewhere keeps counting here
   ================================================================ */
console.log("\n7. the rest clock across machines");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  const resting = stateWith(5);
  resting.current = {index:5, key:"D", startedAt:Date.now(), entries:[]};
  resting.rest = {endsAt: Date.now() + 90000, label:"Rest 90s"};
  resting.updatedAt = g("S").updatedAt + 60000;
  cloud.remote("u1", resting, "the-phone");
  await wait(60);
  ok("the clock picked up where it was", g("restLeft") > 80 && g("restLeft") <= 90, "restLeft=" + g("restLeft"));
  ok("and is on screen", win.document.getElementById("restHost").innerHTML.indexOf("1:3") > -1);
  win.close();
}
{
  const cloud = makeCloud();
  const s = stateWith(5);
  s.rest = {endsAt: Date.now() - 5000, label:"Rest"};   // expired before we got here
  cloud.docs["u1"] = {state: s, updatedAt: Date.now(), device:"phone"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  eq("an expired rest is cleared, not shown", g("restLeft"), 0);
  eq("and dropped from the state", g("S").rest, null);
  win.close();
}

/* ================================================================
   8. signing out
   ================================================================ */
console.log("\n8. signing out");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  ok("watching while signed in", cloud.watchers === 1);
  win.ironworkSignedOut();
  eq("watcher stopped", cloud.watchers, 0);
  const n = cloud.writes.length;
  const next = stateWith(20); next.updatedAt = Date.now() + 1e6;
  cloud.remote("u1", next, "the-phone");
  await wait(60);
  eq("and nothing lands after signing out", g("S").history.length, 0);
  eq("nothing was written either", cloud.writes.length, n);
  win.close();
}

/* switching accounts on a shared machine */
{
  const cloud = makeCloud();
  cloud.docs["a"] = {state: stateWith(3), updatedAt: Date.now(), device:"x"};
  cloud.docs["b"] = {state: stateWith(14), updatedAt: Date.now(), device:"y"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("a", {});
  eq("first account", g("S").history.length, 3);
  await win.ironworkSignedIn("b", {});
  eq("second account", g("S").history.length, 14);
  eq("one watcher, not two", cloud.watchers, 1);
  win.close();
}

/* ================================================================
   9. with no connection at all the app still works
   ================================================================ */
console.log("\n9. no signal");
{
  const cloud = makeCloud({offline:true});
  const local = stateWith(8); local.updatedAt = 4000;
  const {win, g} = boot({cloud: cloud, local: local});
  await win.ironworkSignedIn("u1", {});
  eq("falls back to the device copy", g("S").history.length, 8);
  eq("and says it is offline", g("cloudOK"), false);
  ok("the screen still drew", win.document.getElementById("view").innerHTML.length > 100);
  ok("masthead says Offline", win.document.getElementById("mastSub").textContent.indexOf("Offline") === 0);
  win.eval("startSession()");
  await wait(900);
  ok("the session is still logged locally", !!g("S").current);
  eq("and cached on the device", !!JSON.parse(win.localStorage.getItem("ironwork:v1:u1")).current, true);
  cloud.offline = false;
  win.eval("save()");
  await wait(900);
  /* Nothing is written yet, and that is correct: the account has never been
     read in this session, and a write replaces the whole document. */
  ok("it does not write over an account it has never read", cloud.writes.length === 0,
     cloud.writes.length + " write(s)");
  win.dispatchEvent(new win.Event("online"));          // the network comes back
  await wait(900);
  ok("it reads first, then goes up", cloud.writes.length > 0, cloud.writes.length + " write(s)");
  ok("with the session on it", !!cloud.docs["u1"].state.current);
  win.close();
}

/* a slow account read does not hang the app */
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"phone"};
  const slow = Object.assign({}, cloud, {get: ()=> new Promise(()=>{})});
  slow.watch = cloud.watch; slow.set = cloud.set; slow.docs = cloud.docs;
  const local = stateWith(5); local.updatedAt = 1000;
  const {win, g} = boot({cloud: slow, local: local});
  const t = Date.now();
  await win.ironworkSignedIn("u1", {});
  ok("gave up after a few seconds", Date.now() - t < 9000, (Date.now()-t) + "ms");
  eq("and showed the cached copy", g("S").history.length, 5);
  win.close();
}

/* ================================================================
   10. the app itself still works
   ================================================================ */
console.log("\n10. nothing else broke");
{
  const cloud = makeCloud();
  cloud.docs["u1"] = {state: stateWith(5), updatedAt: Date.now(), device:"this"};
  const {win, g} = boot({cloud: cloud});
  await win.ironworkSignedIn("u1", {});
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  const v = ()=> win.document.getElementById("view").innerHTML;

  ["progress","library","settings","train"].forEach(name=>{
    const b = win.document.querySelector('.nav button[data-tab="' + name + '"]');
    ok(name + " tab exists", !!b);
    if(b){
      click(b);
      ok(name + " tab drew", v().length > 50);
      ok(name + " tab has no NaN", v().indexOf("NaN") === -1);
    }
  });

  click(win.document.querySelector('.nav button[data-tab="settings"]'));
  ok("Setup shows the account is online", v().indexOf("Online") > -1);
  ok("Setup says it is recorded against the account", v().indexOf("Recorded against your account") > -1);

  click(win.document.querySelector('.nav button[data-tab="train"]'));
  const start = Array.from(win.document.querySelectorAll("button")).filter(b => /start/i.test(b.textContent))[0];
  ok("there is a start button", !!start);
  if(start){ click(start); ok("tapping it opens a session", !!g("S").current); }
  ok("no fault bar appeared", !win.document.querySelector(".fault"));
  win.close();
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}

run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
