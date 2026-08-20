/* Ironwork service worker.

   The app shell is NETWORK FIRST. That means a fresh upload is picked up the
   moment the device is online, and the cache is only used as a fallback when
   it is not. Cache-first was faster but meant a stale app could persist for
   days, which is worse.

   Exercise artwork stays cache-first — those files are large and there are 256
   of them. They CAN change under the same name when a diagram is redrawn, so
   bump ART below when that happens; activate then clears the old cache on every
   device without anyone pressing anything. */

const VERSION = "31";
const SHELL   = "ironwork-shell-v" + VERSION;
const ART     = "ironwork-art-v3";   /* bumped for the round 8 redraw — the
                                        activate handler deletes v1 automatically */

const PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", e=>{
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(PRECACHE))
      .then(()=> self.skipWaiting())
  );
});

self.addEventListener("activate", e=>{
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== ART).map(k => caches.delete(k))
      ))
      .then(()=> self.clients.claim())
  );
});

/* let the page force an update without reinstalling anything */
self.addEventListener("message", e=>{
  if(e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;          // auth, database, course lookup
  if(url.pathname.endsWith("firebase-config.js")) return;  // never cache the project config

  /* artwork: cache first, it is immutable and large */
  if(url.pathname.indexOf("/diagrams/") !== -1){
    e.respondWith(
      caches.open(ART).then(c =>
        c.match(req).then(hit => hit || fetch(req).then(res=>{
          if(res && res.status === 200) c.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  /* everything else: network first, fall back to cache when offline */
  e.respondWith(
    fetch(req)
      .then(res=>{
        if(res && res.status === 200 && res.type === "basic"){
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(()=> caches.match(req).then(hit => hit || caches.match("./index.html")))
  );
});
