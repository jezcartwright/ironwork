/* v6.6 — chest fly and the power clean. The question these answer: are the two
   new lifts where they should be, prescribed right, and has nothing else in the
   programme moved? Plus: exercises taken out of the programme keep their names. */
const fs = require("fs");
const {makeCloud, boot, wait, stateWith} = require("./cloudharness");

let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}

/* the v6.5 programme, slot by slot — everything but the deadlift's third
   variation and the new fly slot must be exactly as it was */
const V65 = {"squat":["back-squat","front-squat","paused-squat","landmine-squat"],"bench":["bb-bench","db-bench","floor-press","weighted-pressup"],"vpull":["pullup","lat-pulldown","neutral-chin","sa-pulldown"],"rdl":["bb-rdl","db-rdl","sl-rdl","landmine-rdl"],"antirot":["suitcase-carry","renegade-row","landmine-antirot","landmine-rainbow"],"deadlift":["conv-deadlift","rack-pull","deficit-deadlift","paused-deadlift"],"press":["bb-ohp","db-shoulder","landmine-press","arnold"],"hrow":["bb-row","cs-row","seated-cable-row","landmine-row"],"unilateral":["bstance-rdl","sl-glute-bridge","low-step-up","sl-hip-thrust-u"],"antiext":["hanging-knee","cable-crunch","deadbug","hollow"],"vpullHeavy":["archer-pullup","heavy-pulldown","db-pullover","eccentric-pullup"],"vpush2":["incline-bb","incline-db","standing-landmine","sa-db-press"],"glute":["hip-thrust","good-morning","pull-through","bridge-march"],"triceps":["pushdown","overhead-ext","skullcrusher","close-grip"],"biceps":["db-curl","hammer-curl","cable-curl","bb-curl"],"finisher":["farmers","thruster","bb-complex","landmine-rot-press"]};

function blank(n){
  return Object.assign(stateWith(0), {sessionIndex: n, history: [], updatedAt: Date.now()});
}
async function at(n){
  const cloud = makeCloud();
  cloud.docs.u1 = {state: blank(n), updatedAt: Date.now(), device: "seed"};
  const b = boot({cloud: cloud});
  b.win.confirm = ()=> true; b.win.alert = ()=>{};
  await b.win.ironworkSignedIn("u1", {});
  const D = b.win.document;
  b.click = (el)=> el.dispatchEvent(new b.win.MouseEvent("click", {bubbles:true}));
  b.v = ()=> D.getElementById("view").innerHTML;
  b.q = (s)=> D.querySelector(s);
  return b;
}

async function run(){

console.log("\n1. nothing else in the programme moved");
{
  const b = await at(0);
  const now = JSON.parse(b.g("JSON.stringify(Object.fromEntries(Object.entries(SLOTS).map(([k,v])=>[k,v.pool.map(x=>x.id)])))"));
  const moved = [];
  Object.keys(V65).forEach(k=>{
    const want = V65[k].slice();
    if(k === "deadlift") want[2] = "power-clean";
    if(JSON.stringify(now[k]) !== JSON.stringify(want)) moved.push(k);
  });
  ok("every v6.5 slot is unchanged but the one swap", moved.length === 0, moved.join(","));
  ok("the power clean took the deficit deadlift's place", now.deadlift[2] === "power-clean" && now.deadlift.length === 4);
  ok("one new slot, the fly, with four variations", now.fly && now.fly.length === 4 &&
     Object.keys(now).length === Object.keys(V65).length + 1);
  ok("every slot still has four variations", Object.values(now).every(p => p.length === 4));
  ok("every exercise id is unique", (function(){ const all = [].concat(...Object.values(now)); return all.length === new Set(all).size; })());
  b.win.close();
}

console.log("\n2. the chest fly closes Drive");
{
  const b = await at(45);
  const drive = b.g("SESSIONS[0]");
  const last = drive.blocks[drive.blocks.length - 1];
  ok("Drive has a fourth block", drive.blocks.length === 4);
  ok("it is the fly, 3 × 10–14, 60s rest", last.items.length === 1 && last.items[0].slot === "fly" &&
     last.items[0].sets === 3 && last.items[0].lo === 10 && last.items[0].hi === 14 && last.rest === 60);
  ok("Drive still fits in 45 minutes", b.g("estimateMinutes(SESSIONS[0])") <= 45, b.g("estimateMinutes(SESSIONS[0])") + " min");
  ok("Root and Reach are unchanged in length", b.g("SESSIONS[1].blocks.length") === 3 && b.g("SESSIONS[2].blocks.length") === 4);
  ok("the home card lists it", /fly/.test(b.q("#view .contents").textContent), b.q("#view .contents").textContent);
  b.click(b.q('#view [data-act="start"]'));
  const fly = b.g("S").current.entries.find(e => e.slot === "fly");
  ok("starting Drive puts a fly in the session", !!fly && /fly/.test(b.g("findEx('" + fly.exId + "').ex.name")));
  ok("with three sets prefilled at 14 reps", fly.sets.length === 3 && fly.sets.every(s => s.r === 14));
  ok("and a weight box, because it is loaded", b.v().indexOf('data-done="' + fly.exId) > -1);
  const swap = b.q('#view [data-swap="fly"]');
  ok("it can be swapped", !!swap);
  const before = fly.exId;
  b.click(swap);
  const after = b.g("S").current.entries.find(e => e.slot === "fly").exId;
  ok("swap moves to the next fly", after !== before && /fly/.test(after), before + " -> " + after);
  ok("no fault", !b.q("#faultBox"));
  b.win.close();
}

console.log("\n3. the power clean, when Root reaches its third variation");
{
  const b = await at(55);
  ok("session 56 is Root", b.g("sessionAt(55).title") === "Root");
  ok("and its primary hinge is the power clean", b.g("variantFor('deadlift', 55).id") === "power-clean");
  b.click(b.q('#view [data-act="preview"]'));
  ok("the preview prescribes 4 × 3–5, not the slot's 3–6", b.v().indexOf("4 × 3–5") > -1 && b.v().indexOf("Power clean") > -1);
  b.click(b.q('#view .btn[data-act="start"]'));
  const pc = b.g("S").current.entries.find(e => e.slot === "deadlift");
  ok("the session opens on the power clean", pc.exId === "power-clean");
  ok("four sets prefilled at 5 reps", pc.sets.length === 4 && pc.sets.every(s => s.r === 5), JSON.stringify(pc.sets));
  ok("the screen says 4 × 3–5", b.v().indexOf("4 × 3–5") > -1);
  ok("first time: find a load", b.v().indexOf("load to find") > -1);
  ok("the cue says out in front of the cage", b.v().indexOf("out in front of the cage") > -1);
  b.win.close();
}
{
  /* progression reads the clean's own range: 5 on every set is the top */
  const b = await at(58);
  const st = b.g("S");
  b.win.eval("S.history.push({key:'B', index:55, open:false, day:'2026-10-01', date:'2026-10-01T16:00:00.000Z', minutes:40," +
    "entries:[{slot:'deadlift', exId:'power-clean', track:'load', sets:[{w:60,r:5,done:true},{w:60,r:5,done:true},{w:60,r:5,done:true},{w:60,r:5,done:true}]}]});");
  const sug = b.g("suggest(variantFor('deadlift',58), rxFor({slot:'deadlift',sets:4,lo:3,hi:6}, variantFor('deadlift',58)), 58)");
  ok("five on every set earns more load", sug.w === 62.5, JSON.stringify(sug));
  b.win.close();
}
{
  const b = await at(46);
  ok("until then Root keeps the rack pull", b.g("variantFor('deadlift', 46).id") === "rack-pull");
  ok("which still uses the slot's own 3–6", JSON.stringify(b.g("rxFor({slot:'deadlift',sets:4,lo:3,hi:6}, variantFor('deadlift',46))")) ===
     JSON.stringify({slot:"deadlift", sets:4, lo:3, hi:6}));
  b.win.close();
}

console.log("\n4. the Library");
{
  const b = await at(45);
  b.click(b.q('.nav button[data-tab="library"]'));
  ok("lists the power clean", b.v().indexOf("Power clean") > -1);
  ok("and all four flies", ["Dumbbell chest fly","Incline dumbbell fly","Single-arm low-to-high cable fly","Dumbbell floor fly"].every(n => b.v().indexOf(n) > -1));
  ok("no longer offers the deficit deadlift", b.v().indexOf("Deficit deadlift") === -1);
  ok("counts 68 exercises", /68 exercises in the programme/.test(b.v()));
  b.win.close();
}

console.log("\n5. artwork is wired in ahead of the drawings");
{
  const b = await at(55);
  ok("the power clean has three frames", b.g("SHOT_FRAMES['power-clean']") === 3 && b.g("SHOT_CAPS['power-clean'].length") === 3);
  ok("each fly has two", ["db-fly","incline-fly","cable-fly","floor-fly"].every(id => b.g("(SHOT_CAPS['" + id + "']||[]).length") === 2));
  const html = b.g("diagram('power-clean')");
  ok("it asks for diagrams/power-clean-1-m.png and the rest", /diagrams\/power-clean-1-m\.png/.test(html) && /power-clean-3-m\.png/.test(html));
  ok("a missing file hides itself rather than breaking", /onerror="this.closest\('.shots'\).dataset.failed=1"/.test(html));
  b.win.close();
}

console.log("\n6. retired exercises keep their names, against the real 45-session history");
{
  const path = "/tmp/claude-0/data/iphone.json";
  if(!fs.existsSync(path)){ console.log("  (the exported file is not here — skipping)"); }
  else{
    const hist = JSON.parse(fs.readFileSync(path, "utf8"));
    const st = Object.assign(stateWith(0), {history: hist, sessionIndex: 39, updatedAt: Date.now()});
    const cloud = makeCloud(); cloud.docs.u1 = {state: st, updatedAt: Date.now(), device: "seed"};
    const b = boot({cloud: cloud}); await b.win.ironworkSignedIn("u1", {});
    b.win.document.querySelector('.nav button[data-tab="progress"]').dispatchEvent(new b.win.MouseEvent("click", {bubbles:true}));
    const v = b.win.document.getElementById("view").innerHTML;
    ok("no exercise shows as Removed exercise", v.indexOf("Removed exercise") === -1);
    ok("the deficit deadlift keeps its name", v.indexOf("Deficit deadlift") > -1);
    ok("so do the weighted pull-up, chop, Pallof and Bulgarian",
       ["Weighted pull-up","Cable chop","Half-kneeling Pallof press","Bulgarian split squat"].every(n => v.indexOf(n) > -1));
    const idx = hist.findIndex(h => h.entries.some(e => e.exId === "deficit-deadlift"));
    b.win.eval("histIdx = " + idx + "; render();");
    ok("an old session with one opens cleanly", b.win.document.getElementById("view").innerHTML.indexOf("Deficit deadlift") > -1 &&
       !b.win.document.getElementById("faultBox"));
    ok("no NaN anywhere", b.win.document.getElementById("view").innerHTML.indexOf("NaN") === -1);
    b.win.close();
  }
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
