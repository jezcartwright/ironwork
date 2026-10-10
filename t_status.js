/* The online/offline indicator, and the connection test. The bug being pinned
   down here: a snapshot served from Firestore's own on-device copy was being
   read as proof of being offline. */
const {makeCloud, boot, wait, stateWith} = require("./cloudharness");

let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}

/* Firestore with persistence on: the first snapshot comes from the device copy,
   and the server one may be a while behind — or never come, for a quiet doc. */
function cacheFirstCloud(docs, opts){
  opts = opts || {};
  const api = {
    docs: docs, writes: 0, probes: 0, cbs: [],
    async get(uid){
      if(opts.readFails) throw Object.assign(new Error("denied"), {code:"permission-denied"});
      return docs[uid] ? JSON.parse(JSON.stringify(docs[uid].state)) : null;
    },
    async set(uid, state){
      if(opts.writeFails) throw Object.assign(new Error("denied"), {code:"permission-denied"});
      docs[uid] = {state: JSON.parse(JSON.stringify(state)), updatedAt: Date.now(), device: api.device || "me"};
      api.writes++;
      return true;
    },
    watch(uid, cb){
      api.cbs.push(cb);
      setTimeout(()=> cb(docs[uid] ? JSON.parse(JSON.stringify(docs[uid].state)) : null,
                         {device:"other", updatedAt:1, fromCache:true}), 0);
      return ()=>{ const i = api.cbs.indexOf(cb); if(i>=0) api.cbs.splice(i,1); };
    },
    /* the server catching up, later */
    serverSnapshot(uid){
      api.cbs.forEach(cb => cb(docs[uid] ? JSON.parse(JSON.stringify(docs[uid].state)) : null,
                               {device:"other", updatedAt:2, fromCache:false}));
    },
    async probe(uid){
      api.probes++;
      if(opts.probeRead) return {online:true, read: opts.probeRead, write: opts.probeWrite || "ok"};
      const d = docs[uid];
      return {online:true, read:"ok", exists:!!d, count: d ? (d.state.history||[]).length : 0,
              write: opts.probeWrite || "ok", updatedAt: d ? d.updatedAt : 0, device: d ? d.device : ""};
    }
  };
  return api;
}

const badge = (D)=>{
  const h = D.getElementById("view").innerHTML;
  return h.indexOf(">Online<") > -1 ? "Online" : h.indexOf(">Offline<") > -1 ? "Offline" : "?";
};

async function run(){

console.log("\n1. the bug: a cached snapshot is not evidence of being offline");
{
  const docs = {u1:{state: stateWith(23), updatedAt: Date.now(), device:"other"}};
  const cloud = cacheFirstCloud(docs);
  const {win, g} = boot({cloud: cloud, local: stateWith(45)});
  await win.ironworkSignedIn("u1", {name:"JC"});
  await wait(300);
  const D = win.document;
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  ok("it says Online, because the read worked", g("cloudOK") === true && badge(D) === "Online", badge(D));
  ok("the masthead does not say Offline",
     D.getElementById("mastSub").textContent.indexOf("Offline") === -1,
     D.getElementById("mastSub").textContent);
  ok("all 45 are on show", g("S").history.length === 45, String(g("S").history.length));
  await wait(900);
  ok("and the 45 went up", (docs.u1.state.history || []).length === 45,
     String((docs.u1.state.history || []).length));
  cloud.serverSnapshot("u1");
  await wait(60);
  ok("a server snapshot keeps it Online", g("cloudOK") === true);
  win.close();
}

console.log("\n2. genuinely offline still says so, with the reason");
{
  const docs = {u1:{state: stateWith(23), updatedAt: Date.now(), device:"other"}};
  const cloud = cacheFirstCloud(docs, {readFails:true, writeFails:true});
  const {win, g} = boot({cloud: cloud, local: stateWith(45)});
  await win.ironworkSignedIn("u1", {});
  await wait(900);
  const D = win.document;
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  ok("it says Offline", g("cloudOK") === false && badge(D) === "Offline", badge(D));
  ok("and names the reason", D.getElementById("view").innerHTML.indexOf("permission-denied") > -1,
     g("lastCloudError"));
  ok("the sessions are still there", g("S").history.length === 45);
  win.close();
}

console.log("\n3. the two counts, side by side");
{
  const docs = {u1:{state: stateWith(23), updatedAt: Date.now(), device:"other"}};
  const cloud = cacheFirstCloud(docs);
  const {win, g} = boot({cloud: cloud, local: stateWith(45)});
  await win.ironworkSignedIn("u1", {});
  const D = win.document;
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  const h = D.getElementById("view").innerHTML;
  ok("this device's count is shown", h.indexOf("This device: 45 sessions") > -1);
  ok("the account's count is shown", /Your account: (23|45)/.test(h),
     (h.match(/Your account: [^<]*/) || [""])[0]);
  await wait(900);
  click(D.querySelector('.nav button[data-tab="train"]'));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  const h2 = D.getElementById("view").innerHTML;
  ok("once the push lands they agree", h2.indexOf("Your account: 45") > -1 && h2.indexOf("in step.") > -1,
     (h2.match(/Your account: [^<]*/) || [""])[0]);
  win.close();
}

console.log("\n4. the Check the connection button");
{
  const docs = {u1:{state: stateWith(45), updatedAt: Date.now(), device:"other"}};
  const cloud = cacheFirstCloud(docs);
  const {win, g} = boot({cloud: cloud, local: stateWith(45)});
  await win.ironworkSignedIn("u1", {});
  const D = win.document;
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  const btn = D.querySelector('#view [data-act="cloudTest"]');
  ok("the button is there", !!btn);
  click(btn);
  await wait(120);
  const h = D.getElementById("view").innerHTML;
  ok("it ran the probe", cloud.probes === 1, String(cloud.probes));
  ok("it reports the read worked", h.indexOf("Read from your account: worked") > -1);
  ok("with the count up there", h.indexOf("45 sessions up there") > -1);
  ok("it reports the write worked", h.indexOf("Write to your account: worked") > -1);
  ok("and no fault", !D.querySelector(".fault"));
  win.close();
}

console.log("\n5. the button when the rules say no");
{
  const docs = {u1:{state: stateWith(45), updatedAt: Date.now(), device:"other"}};
  const cloud = cacheFirstCloud(docs, {probeRead:"permission-denied", probeWrite:"permission-denied"});
  const {win, g} = boot({cloud: cloud, local: stateWith(45)});
  await win.ironworkSignedIn("u1", {});
  const D = win.document;
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  click(D.querySelector('#view [data-act="cloudTest"]'));
  await wait(120);
  const h = D.getElementById("view").innerHTML;
  ok("the read failure is named", h.indexOf("Read from your account: FAILED — permission-denied") > -1);
  ok("the write failure is named", h.indexOf("Write to your account: FAILED — permission-denied") > -1);
  ok("and it flips to Offline", badge(D) === "Offline", badge(D));
  ok("no fault", !D.querySelector(".fault"));
  win.close();
}

console.log("\n6. the button with nothing stored up there yet");
{
  const cloud = cacheFirstCloud({});
  const {win, g} = boot({cloud: cloud, local: stateWith(45)});
  await win.ironworkSignedIn("u1", {});
  const D = win.document;
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  click(D.querySelector('#view [data-act="cloudTest"]'));
  await wait(120);
  ok("it says nothing is stored yet",
     D.getElementById("view").innerHTML.indexOf("nothing stored yet") > -1 ||
     D.getElementById("view").innerHTML.indexOf("sessions up there") > -1);
  ok("no fault", !D.querySelector(".fault"));
  win.close();
}


console.log("\n7. a slow first read is not a verdict, and it heals itself");
{
  /* the account answers, eventually — longer than the first paint waits for */
  let release;
  const slow = new Promise(res=> release = res);
  const docs = {u1:{state: stateWith(45), updatedAt: Date.now(), device:"other"}};
  const cloud = {
    docs: docs, writes: 0,
    get: ()=> slow,
    set: async (uid, st)=>{ docs[uid] = {state: st, updatedAt: Date.now(), device:"me"}; cloud.writes++; return true; },
    watch: ()=> ()=>{}
  };
  const upThere = JSON.parse(JSON.stringify(docs.u1.state));   // 45, before anything touches it
  const {win, g} = boot({cloud: cloud, local: stateWith(23)});
  const t = Date.now();
  await win.ironworkSignedIn("u1", {});
  ok("it drew without waiting forever", Date.now() - t < 9000, (Date.now()-t) + "ms");
  ok("on the device copy meanwhile", g("S").history.length === 23, String(g("S").history.length));
  ok("and did NOT call that offline", g("cloudOK") === true, "cloudOK=" + g("cloudOK"));
  await wait(900);
  ok("nothing was written while the account was still unread", cloud.writes === 0,
     cloud.writes + " write(s)");
  release(upThere);
  await wait(200);
  ok("when the read lands it is used", g("S").history.length === 45, String(g("S").history.length));
  ok("and it is Online", g("cloudOK") === true);
  await wait(900);
  ok("the held-back write goes up, merged", cloud.writes > 0 &&
     (docs.u1.state.history || []).length === 45,
     cloud.writes + " write(s), account " + (docs.u1.state.history || []).length);
  win.close();
}

console.log("\n8. coming back from a real outage without being asked");
{
  const docs = {u1:{state: stateWith(45), updatedAt: Date.now(), device:"other"}};
  let down = true;
  const cloud = {
    docs: docs, writes: 0,
    get: async ()=>{ if(down) throw Object.assign(new Error("x"), {code:"unavailable"});
                     return JSON.parse(JSON.stringify(docs.u1.state)); },
    set: async (uid, st)=>{ if(down) throw Object.assign(new Error("x"), {code:"unavailable"});
                            docs[uid] = {state: st, updatedAt: Date.now(), device:"me"}; cloud.writes++; return true; },
    watch: ()=> ()=>{}
  };
  const {win, g} = boot({cloud: cloud, local: stateWith(23)});
  await win.ironworkSignedIn("u1", {});
  await wait(200);
  ok("it says Offline while it is", g("cloudOK") === false);
  ok("and names it", /unavailable/.test(g("lastCloudError")), g("lastCloudError"));
  down = false;
  /* the browser announcing the network is back */
  win.dispatchEvent(new win.Event("online"));
  await wait(200);
  ok("it comes back on its own", g("cloudOK") === true);
  ok("and picks up the 45", g("S").history.length === 45, String(g("S").history.length));
  win.close();
}

console.log("\n9. the Offline badge is the connection check");
{
  const docs = {u1:{state: stateWith(45), updatedAt: Date.now(), device:"other"}};
  const cloud = cacheFirstCloud(docs, {probeRead:"unavailable", probeWrite:"unavailable"});
  const {win, g} = boot({cloud: cloud, local: stateWith(45)});
  await win.ironworkSignedIn("u1", {});
  const D = win.document;
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  const b = D.querySelector('#view .sync');
  ok("the badge is tappable", !!b && b.tagName === "BUTTON", b ? b.tagName : "missing");
  click(b);
  await wait(120);
  ok("tapping it runs the check", cloud.probes === 1, String(cloud.probes));
  ok("and reports the reason", D.getElementById("view").innerHTML.indexOf("FAILED \u2014 unavailable") > -1);
  ok("no fault", !D.querySelector(".fault"));
  win.close();
}


console.log("\n10. permission-denied: the exact case on the Mac");
{
  /* rules deny everything, but Firestore still hands over its cached copy */
  const docs = {u1:{state: stateWith(23), updatedAt: Date.now(), device:"old"}};
  let denied = true;
  const live = [];
  const cloud = {
    docs: docs, writes: 0, probes: 0,
    get: async ()=>{ if(denied) throw Object.assign(new Error("x"), {code:"permission-denied"});
                     return JSON.parse(JSON.stringify(docs.u1.state)); },
    set: async (u, st)=>{ if(denied) throw Object.assign(new Error("x"), {code:"permission-denied"});
                          docs[u] = {state: st, updatedAt: Date.now(), device:"me"}; cloud.writes++; return true; },
    watch: (u, cb)=>{
      live.push(cb);
      /* the cached copy arrives, then the listener is killed by the rules */
      setTimeout(()=> cb(JSON.parse(JSON.stringify(docs.u1.state)),
                         {device:"old", updatedAt:1, fromCache:true}), 0);
      setTimeout(()=>{ if(denied) cb(null, {error:{code:"permission-denied"}}); }, 20);
      return ()=>{ const i = live.indexOf(cb); if(i>=0) live.splice(i,1); };
    },
    async probe(){ return denied
      ? {online:true, read:"permission-denied", write:"permission-denied"}
      : {online:true, read:"ok", exists:true, count:(docs.u1.state.history||[]).length, write:"ok"}; }
  };
  const {win, g} = boot({cloud: cloud, local: stateWith(23)});
  await win.ironworkSignedIn("u1", {name:"Jez Cartwright"});
  await wait(300);
  const D = win.document;
  const click = (el)=> el.dispatchEvent(new win.MouseEvent("click", {bubbles:true}));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  let h = D.getElementById("view").innerHTML;
  ok("it says Offline", g("cloudOK") === false);
  ok("and names permission-denied", h.indexOf("permission-denied") > -1);
  ok("it does NOT claim the account was read", h.indexOf("could not be read") > -1,
     (h.match(/Your account: [^<]*/) || [""])[0]);
  ok("and does NOT claim to be in step", h.indexOf("in step.") === -1);
  ok("nothing was written over the account", cloud.writes === 0, String(cloud.writes));

  /* the rules are fixed in the console */
  denied = false;
  win.eval("lastResync = 0; resyncCloud();");
  await wait(200);
  ok("it comes back on its own once the rules allow it", g("cloudOK") === true);
  click(D.querySelector('.nav button[data-tab="train"]'));
  click(D.querySelector('.nav button[data-tab="settings"]'));
  h = D.getElementById("view").innerHTML;
  ok("and now reports the real account count", /Your account: 23/.test(h),
     (h.match(/Your account: [^<]*/) || [""])[0]);
  win.close();
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
