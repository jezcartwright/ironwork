/* jsdom harness with a fake Firestore document, for the cloud-first work.
   Loads the real index.html, strips the Firebase module (which cannot run here),
   and installs a stand-in __cloud that behaves like onSnapshot: writes notify
   every watcher, including the one on the writing device. */
const fs = require("fs");
const { JSDOM } = require("jsdom");

function makeCloud(opts){
  opts = opts || {};
  const docs = {};                 // uid -> {state, updatedAt, device}
  const watchers = [];             // {uid, cb}
  const api = {
    docs: docs,
    writes: [],
    offline: !!opts.offline,
    async get(uid){
      if(api.offline) throw new Error("offline");
      api.reads = (api.reads || 0) + 1;
      return docs[uid] ? JSON.parse(JSON.stringify(docs[uid].state)) : null;
    },
    async set(uid, state){
      if(api.offline) throw new Error("offline");
      const body = JSON.parse(JSON.stringify(state));
      docs[uid] = {state: body, updatedAt: Date.now(), device: api.device || ""};
      api.writes.push({uid: uid, at: Date.now(), history: (body.history||[]).length,
                       current: !!body.current, updatedAt: body.updatedAt});
      api.notify(uid);
      return true;
    },
    watch(uid, cb){
      const w = {uid: uid, cb: cb};
      watchers.push(w);
      api.watchers = watchers.length;
      if(docs[uid]) setTimeout(()=> fire(w), 0);
      return ()=>{
        const i = watchers.indexOf(w);
        if(i >= 0) watchers.splice(i, 1);
        api.watchers = watchers.length;
      };
    },
    live: watchers,
    notify(uid){
      watchers.filter(w => w.uid === uid).forEach(fire);
    },
    /* a write made somewhere else entirely */
    remote(uid, state, device){
      docs[uid] = {state: JSON.parse(JSON.stringify(state)),
                   updatedAt: Date.now(), device: device || "other-machine"};
      api.notify(uid);
    }
  };
  function fire(w){
    if(watchers.indexOf(w) < 0) return;   // unsubscribed: Firestore would not fire
    const d = docs[w.uid];
    if(!d){ w.cb(null, {fromCache:false}); return; }
    w.cb(JSON.parse(JSON.stringify(d.state)),
         {device: d.device, updatedAt: d.updatedAt, fromCache: false});
  }
  return api;
}

function boot(opts){
  opts = opts || {};
  let html = fs.readFileSync(__dirname + "/index.html", "utf8");
  const m = html.indexOf('<script type="module">');
  const m2 = html.indexOf("</script>", m);
  html = html.slice(0, m) + html.slice(m2 + 9);          // drop the Firebase module

  /* Park the app script so the fake account can be installed first, then run it
     as a real script — a classic script's top-level `let` lives in the global
     lexical scope, which an eval can read; an eval'd copy's would not. */
  const a = html.indexOf("<script>"), b = html.indexOf("</script>", a);
  const src = html.slice(a + 8, b);
  html = html.slice(0, a) + html.slice(b + 9);

  const cloud = opts.cloud || makeCloud();
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://ironwork.progress-tracker.live/",
    pretendToBeVisual: true
  });
  const win = dom.window;
  win.__cloud = cloud;
  if(opts.local) win.localStorage.setItem("ironwork:v1:" + (opts.uid || "u1"), JSON.stringify(opts.local));
  if(opts.device) win.localStorage.setItem("ironwork:v1:device", opts.device);
  /* the signed-out copy, from before anyone signed in on this device */
  if(opts.anon) win.localStorage.setItem("ironwork:v1", JSON.stringify(opts.anon));
  /* who signed in here last time, which is what the app waits for on launch */
  if(opts.lastUid) win.localStorage.setItem("ironwork:v1:signedin", opts.lastUid);

  const tag = win.document.createElement("script");
  tag.textContent = src;
  win.document.body.appendChild(tag);

  cloud.device = win.__device;
  const g = (expr)=> win.eval(expr);
  /* a closed window is a closed browser: stop its listener, as a real one would */
  const realClose = win.close.bind(win);
  win.close = ()=>{ try{ win.eval("stopCloudWatch()"); }catch(e){} realClose(); };
  return {dom: dom, win: win, cloud: cloud, g: g};
}

const wait = (ms)=> new Promise(r => setTimeout(r, ms));

/* ---- a plausible state ---- */
function stateWith(n, extra){
  const S = {
    v:1, units:"kg", bar:20, figure:"m", courses:[],
    sessionIndex:n, nudge:{}, custom:[], history:[], current:null,
    updatedAt: Date.now()
  };
  for(let i = 0; i < n; i++){
    const d = new Date(Date.now() - (n - i) * 2 * 86400000);
    const key = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
    S.history.push({
      key: ["D","R","C"][i % 3], index:i, day:key, date:d.toISOString(),
      minutes:45, effort:"ok", entries:[{slot:"sq", exId:"bb-squat", track:"load",
        sets:[{w:80,r:8,done:true},{w:80,r:8,done:true}]}]
    });
  }
  return Object.assign(S, extra || {});
}

module.exports = {makeCloud, boot, wait, stateWith};
