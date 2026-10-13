/* v6.5 — the account refusing Ironwork (the Oct 11 rules), and the forced fix.
   Reproduces the real case: rules deny everything, the phone holds sessions the
   account has never seen, the rules are fixed, Reconnect now is tapped. */
const {makeCloud, boot, wait, stateWith} = require("./cloudharness");

let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}

/* a Firestore whose rules can be switched off and on, like the console */
function rulesCloud(docs){
  const api = {
    docs: docs, denied: true, writes: 0, live: [],
    async get(uid){
      if(api.denied) throw Object.assign(new Error("Missing or insufficient permissions."), {code:"permission-denied"});
      return docs[uid] ? JSON.parse(JSON.stringify(docs[uid].state)) : null;
    },
    async set(uid, st){
      if(api.denied) throw Object.assign(new Error("Missing or insufficient permissions."), {code:"permission-denied"});
      docs[uid] = {state: JSON.parse(JSON.stringify(st)), updatedAt: Date.now(), device: api.device || "me"};
      api.writes++;
      api.live.forEach(w => w.cb(JSON.parse(JSON.stringify(docs[uid].state)), {device: api.device || "me", updatedAt: Date.now(), fromCache:false}));
      return true;
    },
    watch(uid, cb){
      const w = {cb: cb};
      api.live.push(w);
      setTimeout(()=>{
        if(api.denied){ cb(null, {error:{code:"permission-denied"}}); const i = api.live.indexOf(w); if(i > -1) api.live.splice(i, 1); }
        else if(docs[uid]) cb(JSON.parse(JSON.stringify(docs[uid].state)), {device:"other", updatedAt:1, fromCache:false});
      }, 10);
      return ()=>{ const i = api.live.indexOf(w); if(i > -1) api.live.splice(i, 1); };
    },
    async probe(){
      return api.denied ? {online:true, read:"permission-denied", write:"permission-denied"}
                        : {online:true, read:"ok", exists:true, count:(docs.u1.state.history||[]).length, write:"ok"};
    }
  };
  return api;
}

async function run(){

console.log("\n1. the rules refuse Ironwork: the app says so, and says how to fix it");
const docs = {u1:{state: stateWith(45), updatedAt: Date.now(), device:"old"}};
const cloud = rulesCloud(docs);
const phone = stateWith(48);                     // three sessions the account has never seen
const {win, g} = boot({cloud: cloud, local: phone});
win.alert = (m)=> { win.__alerts = (win.__alerts || []).concat(String(m)); };
await win.ironworkSignedIn("u1", {name:"JC"});
await wait(200);
const D = win.document;
const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
const v = ()=> D.getElementById("view").innerHTML;

ok("it is Offline", g("cloudOK") === false);
ok("because of permission-denied", /permission-denied/.test(g("lastCloudError")), g("lastCloudError"));
ok("all 48 sessions are on the phone", g("S").history.length === 48);
ok("nothing was written over the account", cloud.writes === 0 && docs.u1.state.history.length === 45);

const bar = D.querySelector('#view .offbar');
ok("the Train screen shows a bar", !!bar);
ok("which names the real problem", bar && /refusing Ironwork/.test(bar.textContent), bar && bar.textContent);
click(bar);
ok("tapping it opens Setup", g("tab") === "settings");
ok("with the fix", v().indexOf("Your account is refusing Ironwork") > -1);
ok("showing the exact block", v().indexOf("match /ironwork/{ironUid}") > -1 &&
   v().indexOf("if signedIn() &amp;&amp; ironUid == uid();") > -1);
const link = D.querySelector('#view a[href*="console.firebase.google.com/project/performance-tracker-7415e/firestore/rules"]');
ok("and a link straight to the rules page", !!link);
ok("and a Reconnect now button", !!D.querySelector('#view [data-act="reconnect"]'));

let copied = null;
Object.defineProperty(win.navigator, "clipboard", {value:{writeText:(t)=>{ copied = t; return Promise.resolve(); }}, configurable:true});
click(D.querySelector('#view [data-act="copyRules"]'));
await wait(20);
ok("Copy the block puts the block on the clipboard", copied && copied.indexOf("match /ironwork/{ironUid}") > -1);

console.log("\n2. tapping Reconnect before the rules are fixed changes nothing and harms nothing");
click(D.querySelector('#view [data-act="reconnect"]'));
await wait(200);
ok("still Offline", g("cloudOK") === false);
ok("still nothing written", cloud.writes === 0);
ok("still 48 on the phone", g("S").history.length === 48);
ok("no fault", !D.getElementById("faultBox"));

console.log("\n3. the rules are published, Reconnect now");
cloud.denied = false;
click(D.querySelector('#view [data-act="reconnect"]'));
await wait(1200);
ok("it is Online", g("cloudOK") === true);
ok("the fix panel has gone", v().indexOf("refusing Ironwork") === -1);
ok("the account now has all 48", docs.u1.state.history.length === 48, String(docs.u1.state.history.length));
ok("the phone still has 48", g("S").history.length === 48);
ok("the listener is running again", cloud.live.length === 1, cloud.live.length + " listeners");
click(D.querySelector('.nav button[data-tab="train"]'));
ok("the Train bar has gone", !D.querySelector('#view .offbar'));

console.log("\n4. and it hears about changes from elsewhere again");
const elsewhere = JSON.parse(JSON.stringify(docs.u1.state));
elsewhere.history.push(stateWith(49).history[48]);
elsewhere.updatedAt = Date.now() + 1000;
docs.u1 = {state: elsewhere, updatedAt: Date.now(), device:"laptop"};
cloud.live.forEach(w => w.cb(JSON.parse(JSON.stringify(elsewhere)), {device:"laptop", updatedAt:Date.now(), fromCache:false}));
await wait(200);
ok("a session logged on the laptop arrives", g("S").history.length === 49, String(g("S").history.length));
win.close();

console.log("\n5. offline for an ordinary reason: no rules talk");
{
  /* a real outage: every call fails "unavailable" and the listener hears nothing */
  const d2 = {u1:{state: stateWith(5), updatedAt: Date.now(), device:"x"}};
  const c2 = {offline: true, docs: d2,
    get: async (u)=>{ if(c2.offline) throw Object.assign(new Error("x"), {code:"unavailable"}); return JSON.parse(JSON.stringify(d2[u].state)); },
    set: async (u, st)=>{ if(c2.offline) throw Object.assign(new Error("x"), {code:"unavailable"}); d2[u] = {state: st}; return true; },
    watch: ()=> ()=>{}};
  const b = boot({cloud: c2, local: stateWith(5)});
  await b.win.ironworkSignedIn("u1", {});
  await wait(100);
  const bar2 = b.win.document.querySelector('#view .offbar');
  ok("a bar, but not the rules one", bar2 && /Not syncing to your account/.test(bar2.textContent), bar2 && bar2.textContent);
  bar2.dispatchEvent(new b.win.MouseEvent("click", {bubbles:true}));
  const h = b.win.document.getElementById("view").innerHTML;
  ok("Setup offers Reconnect now", h.indexOf('data-act="reconnect"') > -1);
  ok("without the rules instructions", h.indexOf("match /ironwork") === -1);
  c2.offline = false;
  b.win.document.querySelector('#view [data-act="reconnect"]').dispatchEvent(new b.win.MouseEvent("click", {bubbles:true}));
  await wait(1200);
  ok("and Reconnect brings it back", b.g("cloudOK") === true);
  b.win.close();
}

console.log("\n6. online: none of it shows");
{
  const c3 = makeCloud(); c3.docs.u1 = {state: stateWith(5), updatedAt: Date.now(), device:"x"};
  const b = boot({cloud: c3});
  await b.win.ironworkSignedIn("u1", {});
  ok("no bar on Train", !b.win.document.querySelector('#view .offbar'));
  b.win.document.querySelector('.nav button[data-tab="settings"]').dispatchEvent(new b.win.MouseEvent("click", {bubbles:true}));
  ok("no fix panel in Setup", b.win.document.getElementById("view").innerHTML.indexOf("fixbox") === -1);
  b.win.close();
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
