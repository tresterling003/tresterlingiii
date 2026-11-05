// Offline cache for North Pole Ops: game files are cached after the first visit.
const CACHE='npo-v7';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./manifest.webmanifest','./assets/elf.json','./assets/soldier.json','./assets/santa.json','./assets/king.json','./assets/holiday.json','./assets/nature.json']).catch(()=>{})))});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;
  e.respondWith(fetch(r).then(res=>{if(res.ok&&(r.url.startsWith(self.location.origin)||r.url.includes('cdnjs')||r.url.includes('jsdelivr'))){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp)).catch(()=>{})}return res}).catch(()=>caches.match(r).then(m=>m||Response.error())))});
