/* Two browsers, one account, one fake Firestore document between them. */
const {makeCloud, boot, wait, stateWith} = require("./cloudharness");

let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}

/* each window stamps its own device onto its writes, as the Firebase module does */
function perDevice(cloud, win){
  return {
    get: (uid)=> cloud.get(uid),
    set: (uid, state)=>{ cloud.device = win.__device; return cloud.set(uid, state); },
    watch: (uid, cb)=> cloud.watch(uid, cb)
  };
}

async function run(){
const cloud = makeCloud();
cloud.docs["u1"] = {state: stateWith(6), updatedAt: Date.now(), device:"seed"};

/* the phone */
const A = boot({cloud: cloud});
A.win.__cloud = perDevice(cloud, A.win);
A.win.confirm = ()=> true;
await A.win.ironworkSignedIn("u1", {});

/* the laptop */
const B = boot({cloud: cloud});
B.win.__cloud = perDevice(cloud, B.win);
B.win.confirm = ()=> true;
await B.win.ironworkSignedIn("u1", {});

ok("two different devices", A.win.__device !== B.win.__device);
ok("both start at 6 sessions", A.g("S").history.length === 6 && B.g("S").history.length === 6);
ok("both are watching", cloud.live.length === 2, cloud.live.length + " watchers");

console.log("\nstart a session on the phone");
A.win.eval("startSession()");
await wait(80);
ok("the phone has it open", !!A.g("S").current);
ok("the laptop sees it in progress too", !!B.g("S").current);
ok("the laptop masthead says so",
   B.win.document.getElementById("mastSub").textContent.indexOf("Session in progress") === 0,
   B.win.document.getElementById("mastSub").textContent);
ok("the same exercises, in the same order",
   JSON.stringify(A.g("S").current.entries.map(e=>e.exId)) ===
   JSON.stringify(B.g("S").current.entries.map(e=>e.exId)));

console.log("\nlog a set on the phone");
const D = A.win.document;
const tick = D.querySelector('#view [data-done]');
ok("there is a set to tick", !!tick);
tick.dispatchEvent(new A.win.MouseEvent("click", {bubbles:true}));
await wait(900);
const doneA = A.g("S").current.entries.reduce((n,e)=> n + (e.sets||[]).filter(s=>s.done).length, 0);
const doneB = B.g("S").current.entries.reduce((n,e)=> n + (e.sets||[]).filter(s=>s.done).length, 0);
ok("the phone recorded it", doneA === 1, "phone " + doneA);
ok("the laptop has it too", doneB === 1, "laptop " + doneB);
ok("the laptop shows the rest clock the phone started",
   B.g("restLeft") > 0, "restLeft=" + B.g("restLeft"));

console.log("\npick the session up on the laptop and finish it");
const nBefore = A.g("S").history.length;
B.win.eval("finishSession()");
await wait(120);
ok("the laptop logged it", B.g("S").history.length === nBefore + 1);
ok("the phone agrees", A.g("S").history.length === nBefore + 1, A.g("S").history.length + " on the phone");
ok("nothing is in progress on either", !A.g("S").current && !B.g("S").current);
ok("the counters match", A.g("S").sessionIndex === B.g("S").sessionIndex,
   A.g("S").sessionIndex + " vs " + B.g("S").sessionIndex);
ok("the phone's rest clock stopped with it", A.g("restLeft") === 0, "restLeft=" + A.g("restLeft"));

console.log("\nthe last one to touch it wins, and neither loses sessions");
A.win.eval("S.units = 'lb'; save();");
await wait(900);
ok("a setting changed on the phone reaches the laptop", B.g("S").units === "lb", B.g("S").units);
B.win.eval("S.bar = 15; save();");
await wait(900);
ok("and back the other way", A.g("S").bar === 15, String(A.g("S").bar));
ok("no sessions were lost either way",
   A.g("S").history.length === nBefore + 1 && B.g("S").history.length === nBefore + 1,
   A.g("S").history.length + " / " + B.g("S").history.length);

console.log("\nthe phone goes offline, logs, and comes back");
cloud.offline = true;
A.win.eval("startOpen()");
await wait(900);
ok("the phone still opened a session", !!A.g("S").current);
ok("the laptop has not seen it", !B.g("S").current);
cloud.offline = false;
A.win.eval("save()");
await wait(900);
ok("it arrives the moment there is signal", !!B.g("S").current);

console.log("\nno fault bar on either device");
ok("phone clean", !A.win.document.querySelector(".fault"),
   A.win.document.querySelector(".fault") ? A.win.document.querySelector(".fault").textContent.slice(0,100) : "");
ok("laptop clean", !B.win.document.querySelector(".fault"),
   B.win.document.querySelector(".fault") ? B.win.document.querySelector(".fault").textContent.slice(0,100) : "");

A.win.close(); B.win.close();
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
