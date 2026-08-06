/* Ironwork service worker — cache-first for the shell, so the app
   opens instantly and works with no signal in a garage or basement. */
const CACHE = "ironwork-v22";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(()=> self.skipWaiting()));
});

self.addEventListener("activate", e=>{
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k !== CACHE && k !== CACHE + "-art")
        .map(k => caches.delete(k))))
      .then(()=> self.clients.claim())
  );
});

self.addEventListener("fetch", e=>{
  if(e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  /* auth and database traffic must always hit the network */
  if(url.origin !== self.location.origin) return;
  /* never serve a stale copy of the project config */
  if(url.pathname.endsWith("firebase-config.js")) return;
  /* exercise artwork: cache each file the first time it is opened, not up front */
  if(url.pathname.indexOf("/diagrams/") !== -1){
    e.respondWith(
      caches.open(CACHE + "-art").then(c =>
        c.match(e.request).then(hit => hit || fetch(e.request).then(res=>{
          if(res && res.status === 200) c.put(e.request, res.clone());
          return res;
        }))
      )
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit=>{
      if(hit) return hit;
      return fetch(e.request).then(res=>{
        if(res && res.status === 200 && res.type === "basic"){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(()=> caches.match("./index.html"));
    })
  );
});
