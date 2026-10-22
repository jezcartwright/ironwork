/* v6.8 — the app shell. Nothing is pinned to the window, so iOS cannot strand
   the rest bar or the tab bar mid-screen; and the rest bar is built once, not
   rebuilt every second. Geometry was also checked in Chromium at iPhone size. */
const fs = require("fs");
const {makeCloud, boot, wait, stateWith} = require("./cloudharness");
let pass = 0, fail = 0;
function ok(name, cond, note){
  if(cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (note ? "  — " + note : "")); }
}
async function run(){
const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const rule = (sel)=>{ const i = css.indexOf("\n" + sel + "{"); return i < 0 ? "" : css.slice(i, css.indexOf("}", i)); };

console.log("\n1. nothing that scrolls past is pinned to the window");
ok("the rest bar is not position:fixed", rule(".rest").length > 0 && !/position:fixed/.test(rule(".rest")), rule(".rest"));
ok("the tab bar is not position:fixed", rule(".nav").length > 0 && !/position:fixed/.test(rule(".nav")), rule(".nav"));
ok("the page itself does not scroll", /html,body\{height:100%;overflow:hidden/.test(css));
ok("the body is a full-height column", /body\{display:flex;flex-direction:column;height:100vh;height:100dvh\}/.test(css));

const cloud = makeCloud(); cloud.docs.u1 = {state: stateWith(20), updatedAt: Date.now(), device:"x"};
const {win, g} = boot({cloud: cloud});
await win.ironworkSignedIn("u1", {});
const D = win.document;

console.log("\n2. the shell");
const sc = D.getElementById("scroller");
ok("a scrolling area exists", !!sc);
ok("holding the masthead and the content", sc && sc.querySelector(".masthead") && sc.querySelector("#view"));
ok("the rest bar and tab bar sit after it, outside it", sc && sc.nextElementSibling && sc.nextElementSibling.id === "restHost" &&
   D.getElementById("restHost").nextElementSibling.classList.contains("nav"));
sc.scrollTop = 500;
win.eval("scrollToTop()");
ok("scrollToTop scrolls the content area", sc.scrollTop === 0);

console.log("\n3. the rest bar is built once");
win.eval("startSession()");
win.eval("startRest(90, 'Rest · Test')");
const bar = D.querySelector("#restHost .rest");
ok("it appears", !!bar && /1:30/.test(bar.textContent), bar && bar.textContent);
await wait(2300);
ok("two seconds later it is the same element", D.querySelector("#restHost .rest") === bar);
ok("and the clock has moved", /1:2[6-8]/.test(D.querySelector("#restHost .rest-t").textContent), D.querySelector("#restHost .rest-t").textContent);
win.eval("restLeft += 30; drawRest()");
ok("+30s updates it in place", D.querySelector("#restHost .rest") === bar && /1:5|1:5/.test(D.querySelector("#restHost .rest-t").textContent));
ok("the label is text, never markup", (win.eval("startRest(60, '<b>x</b>')"), D.querySelector("#restHost .rest-l").innerHTML === "&lt;b&gt;x&lt;/b&gt;"));
win.eval("stopRest()");
ok("Skip clears it", D.getElementById("restHost").innerHTML === "");
ok("no fault", !D.getElementById("faultBox"));
win.close();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
}
run().catch(e=>{ console.error("harness blew up:", e); process.exit(2); });
