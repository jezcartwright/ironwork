/* v6.9 — Drive and Reach never share a movement in the same block. Checked for
   every block of a full lap, so a later edit to either rotation cannot quietly
   put two pulldowns, or two bar pull-ups, two days apart again. */
const {boot} = require("./cloudharness");
let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}
/* how each vertical pull is done */
const HOW = {"pullup":"bar", "neutral-chin":"bar", "archer-pullup":"bar", "eccentric-pullup":"bar",
             "lat-pulldown":"cable", "sa-pulldown":"cable", "heavy-pulldown":"cable", "db-pullover":"dumbbell"};
async function run(){
const b = boot({}); b.win.eval("S = blankState()");
const v = (slot, i)=> b.g("variantFor('" + slot + "', " + i + ").id");
console.log("\nevery block of a full lap");
for(let blk = 0; blk < 4; blk++){
  const d = blk * 9, r = d + 2;                       // Drive at 0 mod 3, Reach at 2 mod 3
  const dp = v("vpull", d), rp = v("vpullHeavy", r);
  ok("block " + (blk + 1) + ": Drive's pull (" + dp + ") and Reach's (" + rp + ") are done differently",
     HOW[dp] && HOW[rp] && HOW[dp] !== HOW[rp], HOW[dp] + " vs " + HOW[rp]);
  const fly = v("fly", d), press = v("vpush2", r);
  ok("block " + (blk + 1) + ": no incline fly against an incline press (" + fly + " / " + press + ")",
     !(fly === "incline-fly" && /incline/.test(press)));
  const drive = b.g("SESSIONS[0]").blocks.flatMap(x => x.items).map(it => v(it.slot, d));
  const reach = b.g("SESSIONS[2]").blocks.flatMap(x => x.items).map(it => v(it.slot, r));
  ok("block " + (blk + 1) + ": no exercise in both", !drive.some(id => reach.includes(id)));
}
console.log("\nthe current block, sessions 46–54");
ok("Drive pulls on the bar", v("vpull", 48) === "pullup");
ok("Reach pulls on the cable", v("vpullHeavy", 47) === "heavy-pulldown");
ok("Drive's fly is the floor fly", v("fly", 48) === "floor-fly");
ok("Drive's other exercises are untouched", v("squat", 48) === "front-squat" && v("bench", 48) === "db-bench" &&
   v("rdl", 48) === "db-rdl" && v("antirot", 48) === "renegade-row");
b.win.close();
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
