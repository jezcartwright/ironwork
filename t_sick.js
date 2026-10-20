/* v6.7 — sick days. A sick day rests that day and the next: the next session
   is due two days after it, everything after moves with it, nothing gets
   lighter, and a gap you were too ill to train through is not late. */
const fs = require("fs");
const {makeCloud, boot, wait} = require("./cloudharness");

let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}
function ago(n){
  const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate() - n);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
const EX = {A:["back-squat","squat"], B:["conv-deadlift","deadlift"], C:["archer-pullup","vpullHeavy"]};
function home(i, n){
  const k = ["A","B","C"][i % 3];
  return {key:k, index:i, open:false, day:ago(n), date:ago(n) + "T16:00:00.000Z", minutes:40, effort:7,
    entries:[{slot:EX[k][1], exId:EX[k][0], track:"load", sets:[{w:60,r:6,done:true},{w:60,r:6,done:true}]}]};
}
/* n home sessions every other day, the last one `last` days ago */
function st(n, last, extra){
  const h = []; for(let i = 0; i < n; i++) h.push(home(i, last + (n - 1 - i) * 2));
  return Object.assign({v:1, units:"kg", bar:20, figure:"m", courses:[], nudge:{}, custom:[], history:h,
    current:null, sessionIndex:n, roadIndex:0, sick:[], updatedAt:Date.now()}, extra || {});
}
async function up(state, cloud){
  cloud = cloud || makeCloud();
  cloud.docs.u1 = {state: JSON.parse(JSON.stringify(state)), updatedAt: Date.now(), device:"seed"};
  const b = boot({cloud: cloud});
  b.win.confirm = ()=> true; b.alerts = []; b.win.alert = (m)=> b.alerts.push(String(m));
  b.win.scrollTo = ()=>{};
  await b.win.ironworkSignedIn("u1", {});
  const D = b.win.document;
  b.click = (el)=> el.dispatchEvent(new b.win.MouseEvent("click", {bubbles:true}));
  b.v = ()=> D.getElementById("view").innerHTML;
  b.q = (s)=> D.querySelector(s);
  b.qa = (s)=> Array.from(D.querySelectorAll(s));
  b.cloud = cloud;
  b.due = ()=> b.g("dueDay(S.sessionIndex)");
  return b;
}

async function run(){

console.log("\n1. the tile, under Aerobic session, in red");
{
  const b = await up(st(46, 2));                       // trained 2 days ago: due today
  const tile = b.q('#view .sick-tile');
  ok("there is a Sick day tile", !!tile && /Sick day/.test(tile.textContent));
  ok("it sits after the Aerobic tile, in the same panel", !!tile && tile.previousElementSibling &&
     tile.previousElementSibling.classList.contains("aero-tile"));
  ok("due today before anything is logged", b.due() === ago(0), b.due());
  b.click(tile);
  ok("tapping it asks which day", b.v().indexOf("Which day were you ill?") > -1 &&
     !!b.q('#view [data-act="sickLog:' + ago(0) + '"]') && !!b.q('#view [data-act="sickLog:' + ago(1) + '"]') && !!b.q('#sickDate'));
  ok("the date box stops at today", b.q('#sickDate').getAttribute("max") === ago(0));
  b.click(b.q('#view [data-act="sickClose"]'));
  ok("Cancel closes it with nothing logged", !b.q('#sickDate') && b.g("sickDays().length") === 0);
  b.win.close();
}

console.log("\n2. sick on a training day");
{
  const b = await up(st(46, 2));                       // Reach due today
  b.click(b.q('#view .sick-tile'));
  b.click(b.q('#view [data-act="sickLog:' + ago(0) + '"]'));
  ok("today is logged", b.g("isSick(dayKey(new Date()))") === true);
  ok("the session moves two days on", b.due() === ago(-2), b.due() + " vs " + ago(-2));
  ok("the red block says so", !!b.q('#view .sickblock') && /Sick day logged/.test(b.q('#view .sickblock').textContent) &&
     b.q('#view .sickblock').textContent.indexOf(b.g("niceDay('" + ago(-2) + "')")) > -1);
  ok("the masthead says Sick day", /^Sick day/.test(b.win.document.getElementById("mastSub").textContent));
  const start = b.q('#view [data-act="start"]');
  ok("Start becomes quiet and says anyway", start.classList.contains("btn-quiet") && /anyway/.test(start.textContent), start.textContent);
  ok("the rotation and counter are untouched", b.g("S").sessionIndex === 46 && b.g("S").history.length === 46);
  const boxes = b.qa('#view .rgrid .rbx.next');
  ok("the grid no longer says Today", boxes.length === 1 && boxes[0].textContent !== "Today", boxes[0] && boxes[0].textContent);
  ok("everything after moves with it", b.g("dayGap(dueDay(S.sessionIndex), dueDay(S.sessionIndex + 1))") === 2);
  ok("no fault, no NaN", !b.q("#faultBox") && b.v().indexOf("NaN") === -1);
  b.win.close();
}

console.log("\n3. sick on a rest day takes the next day off too");
{
  const b = await up(st(46, 1));                       // trained yesterday: due tomorrow
  ok("due tomorrow first", b.due() === ago(-1), b.due());
  b.win.eval("logSick(dayKey(new Date()))");
  ok("sick today: due the day after tomorrow", b.due() === ago(-2), b.due());
  b.win.close();
}

console.log("\n4. ill two days running");
{
  const b = await up(st(46, 3));
  b.win.eval("logSick('" + ago(1) + "'); logSick('" + ago(0) + "')");
  ok("due two days after the last sick day", b.due() === ago(-2), b.due());
  ok("the block counts both", /2 sick days logged/.test(b.q('#view .sickblock').textContent));
  ok("each has its own Undo", b.qa('#view .sickblock [data-act^="unsick:"]').length === 2);
  b.win.close();
}

console.log("\n5. logging after the fact");
{
  const b = await up(st(46, 3));
  b.click(b.q('#view .sick-tile'));
  b.click(b.q('#view [data-act="sickLog:' + ago(1) + '"]'));
  ok("Yesterday logs yesterday", b.g("isSick('" + ago(1) + "')") === true && b.g("isSick('" + ago(0) + "')") === false);
  ok("and the session is due tomorrow", b.due() === ago(-1), b.due());
  b.click(b.q('#view .sick-tile'));
  b.q('#sickDate').value = ago(2);
  b.click(b.q('#view [data-act="sickLog:pick"]'));
  ok("a picked date logs that date", b.g("isSick('" + ago(2) + "')") === true);
  b.click(b.q('#view .sick-tile'));
  b.q('#sickDate').value = ago(-3);
  b.click(b.q('#view [data-act="sickLog:pick"]'));
  ok("a future date is refused", b.g("isSick('" + ago(-3) + "')") === false && b.alerts.some(a => /up to today/.test(a)));
  b.win.close();
}

console.log("\n6. Undo");
{
  const b = await up(st(46, 2));
  b.win.eval("logSick(dayKey(new Date()))");
  b.click(b.q('#view [data-act="unsick:' + ago(0) + '"]'));
  ok("the day is no longer sick", b.g("isSick(dayKey(new Date()))") === false);
  ok("the session is due today again", b.due() === ago(0), b.due());
  ok("the block has gone and Start is orange again", !b.q('#view .sickblock') &&
     !b.q('#view [data-act="start"]').classList.contains("btn-quiet"));
  /* another device still holds the older copy with the sick day on */
  const older = JSON.parse(JSON.stringify(b.g("S")));
  older.sick = [{day: ago(0), at: 1}];
  const m = b.win.mergeStates(older, b.g("S"));
  ok("an older copy cannot bring an undone day back", !m.sick.some(x => x.day === ago(0) && !x.off));
  b.win.close();
}

console.log("\n7. two devices");
{
  const cloud = makeCloud();
  cloud.docs.u1 = {state: st(46, 2), updatedAt: Date.now(), device:"seed"};
  const per = (w)=> ({get:(u)=>cloud.get(u), set:(u,s)=>{ cloud.device = w.__device; return cloud.set(u,s); }, watch:(u,cb)=>cloud.watch(u,cb)});
  const A = boot({cloud: cloud}); A.win.__cloud = per(A.win); await A.win.ironworkSignedIn("u1", {});
  const B = boot({cloud: cloud}); B.win.__cloud = per(B.win); await B.win.ironworkSignedIn("u1", {});
  A.win.eval("logSick(dayKey(new Date()))");
  await wait(150);
  ok("a sick day logged on the phone reaches the laptop", B.g("isSick(dayKey(new Date()))") === true);
  ok("and moves its due date too", B.g("dueDay(S.sessionIndex)") === ago(-2));
  const m = A.win.mergeStates(
    Object.assign(st(46, 2), {sick:[{day:ago(5), at:5}]}),
    Object.assign(st(46, 2), {sick:[{day:ago(4), at:6}]}));
  ok("two copies' sick days unite", m.sick.map(x => x.day).join(",") === [ago(5), ago(4)].join(","));
  A.win.close(); B.win.close();
}

console.log("\n8. the rhythm grid: a gap you were too ill to train through is not late, and it is red");
{
  /* block 45–53: 45 and 46 done, then ill, then 47 six days after 46 */
  const s8 = st(47, 6);
  s8.history.push(home(47, 0)); s8.sessionIndex = 48;
  s8.sick = [{day: ago(4), at: 1}, {day: ago(2), at: 2}];
  const b = await up(s8);
  const box = b.qa('#view .rgrid .rbx').find(x => /sick day/.test(x.textContent));
  ok("the session after it is on time, not late", !!box && box.classList.contains("on"), box && box.className);
  ok("with a red '2 sick days' tag", !!box && !!box.querySelector(".sk") && /2 sick days/.test(box.textContent));
  ok("no box says +4 days", !b.qa('#view .rgrid .rbx').some(x => /\+4 days/.test(x.textContent)));
  const tile = b.q('#view .rgrid .rgb.sick');
  ok("a red Sick tile in the Also row", !!tile && /Sick 2/.test(tile.textContent));
  ok("the header counts them in red", /<span class="redtxt">2 sick days<\/span>/.test(b.v()));
  ok("the key shows Sick", /redtxt"><i style="background:var\(--red\)"><\/i>Sick/.test(b.v()));
  ok("sick days are not counted as alongside", !/alongside/.test(b.q('#view h2.head') ? Array.from(b.win.document.querySelectorAll('#view h2.head')).map(h=>h.textContent).join(" ") : ""));
  b.win.close();
}
{
  const s8 = st(47, 6); s8.history.push(home(47, 0)); s8.sessionIndex = 48;
  const b = await up(s8);
  ok("the same gap with no sick days is still late", b.qa('#view .rgrid .rbx.late').some(x => /\+4 days/.test(x.textContent)));
  b.win.close();
}

console.log("\n9. being ill never makes it lighter");
{
  const s9 = st(46, 9);                                  // last session 9 days ago
  s9.sick = [{day: ago(7), at:1}, {day: ago(5), at:2}, {day: ago(3), at:3}];
  const b = await up(s9);
  ok("no 90% barbell ramp", b.g("rampDue()") === false);
  ok("no 'take 10% off' advice", b.v().indexOf("Take 10% off") === -1 && b.v().indexOf("at 90%") === -1);
  ok("it says train at your usual loads", b.v().indexOf("Train at your usual loads") > -1);
  b.click(b.q('#view [data-act="start"]'));
  ok("the session is not marked as a lighter first-back session", !b.g("S").current.ramp);
  ok("and no exercise says 90% today", b.v().indexOf("90% today") === -1);
  b.win.close();
}
{
  /* the travel rule is untouched when there was no illness */
  const b = await up(st(46, 9));
  ok("nine days away with no sick days still ramps", b.g("rampDue()") === true);
  b.win.close();
}

console.log("\n10. every screen, and the house rules");
{
  const s10 = st(46, 3); s10.sick = [{day: ago(1), at:1}];
  const b = await up(s10);
  const bad = [];
  ["progress","library","settings","train"].forEach(t=>{
    b.click(b.q('.nav button[data-tab="' + t + '"]'));
    if(b.v().indexOf("NaN") > -1 || b.v().indexOf("undefined") > -1) bad.push(t);
    if(b.q("#faultBox")) bad.push(t + " fault");
  });
  [1,2,3].forEach(k=>{ b.click(b.qa('#view .kits button')[k]); if(!b.q('#view .sick-tile') || b.v().indexOf("NaN") > -1) bad.push("kit " + k); });
  ok("clean everywhere, and the tile is there for every kit", bad.length === 0, bad.join(","));
  const html = fs.readFileSync(__dirname + "/index.html", "utf8");
  ok("no opacity or rgba", !/opacity|rgba\(/.test(html));
  ok("the build is 67 or later", Number((html.match(/const BUILD = "(\d+)"/) || [])[1]) >= 67);
  b.win.close();
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
