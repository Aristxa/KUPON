// Kupon service worker: network first for our own files, cache as the offline fallback.
const CACHE = 'kupon-v7';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/i18n.js', 'js/icons.js', 'js/portal.js', 'js/qr.js', 'js/store.js', 'js/ocr.js', 'js/sync.js', 'js/config.js', 'js/remind.js',
  'vendor/jsQR.js', 'fonts/archivo-normal.woff2', 'fonts/newsreader-normal.woff2', 'fonts/newsreader-italic.woff2', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  // 'reload' skips the browser's HTTP cache, so a new version never stores yesterday's files.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    // 'no-cache' asks the server every time (a cheap 304 when nothing changed), so files from
    // two different releases are never mixed.
    fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
    )
  );
});

// ---------- reminders ----------
// The server sends an empty push on mornings that have a reminder; the texts are on this phone.
function kv(key) {
  return new Promise(resolve => {
    const req = indexedDB.open('kupon', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => resolve(undefined);
    req.onsuccess = () => {
      const g = req.result.transaction('kv').objectStore('kv').get(key);
      g.onsuccess = () => resolve(g.result);
      g.onerror = () => resolve(undefined);
    };
  });
}
function kvPut(key, value) {
  return new Promise(resolve => {
    const req = indexedDB.open('kupon', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => resolve();
    req.onsuccess = () => { const tx = req.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(value, key); tx.oncomplete = resolve; tx.onerror = resolve; };
  });
}
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function showDue() {
  const list = (await kv('reminders')) || [];
  const shown = new Set((await kv('shown')) || []);
  const due = list.filter(r => r.date <= localDay() && !shown.has(r.id));
  const opts = { icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
  if (!due.length) {
    // A push must always show something; this only happens if the dates moved since the server last heard.
    const en = (await kv('lang')) === 'en';
    return self.registration.showNotification('Kupon', { ...opts, tag: 'kupon', body: en ? 'Open Kupon to see what is new.' : 'Hape Kuponin për të parë çfarë ka të re.', data: { url: '#home' } });
  }
  for (const r of due.slice(0, 3)) await self.registration.showNotification(r.title, { ...opts, tag: r.id, body: r.body, data: { url: r.url } });
  due.forEach(r => shown.add(r.id));
  await kvPut('shown', [...shown].slice(-400));
}

self.addEventListener('push', e => { e.waitUntil(showDue()); });

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '#home', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
    for (const w of wins) if ('focus' in w) { if (w.navigate) w.navigate(url).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
