// Service worker CAI Hub (Concerto Audio Indonesia) — mode offline layar videotron (27 Okt 2026).
// Halaman: jaringan dulu, cadangan salinan terakhir bila offline. Aset & pustaka CDN: salinan lokal dulu.
// Video (.mp4) tidak disimpan di sini — sudah disimpan halaman videotron di Cache Storage 'cai-videotron-v1'.
// Data Supabase selalu lewat jaringan.
const CACHE = 'cai-portal-v1';   // v2 (28 Okt 2026): halaman selalu dicek ulang ke server
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || /supabase\.co$/.test(url.hostname) || /\.mp4$/i.test(url.pathname) || req.headers.has('range') || url.searchParams.has('build')) return;
  if (req.mode === 'navigate') {
    // cache: 'no-cache' → selalu cek versi terbaru ke server (GitHub Pages memberi max-age 10 menit pada halaman)
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(url.pathname === '/' ? '/index.html' : req, c)); return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('/index.html'))));
    return;
  }
  const local = url.origin === location.origin, cdn = /(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com)$/.test(url.hostname);
  if (!local && !cdn) return;
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); } return r; });
    return hit || net;
  }));
});
// Notifikasi HP Concerto Way (4 Nov 2026): Edge Function cway-push mengirim pengingat 5 menit sebelum tayang (khusus Editor/Admin)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'CAI Hub', {
    body: d.body || '', icon: '/assets/icons/icon-192.png', badge: '/assets/icons/badge-96.png',   // badge = ikon kecil status bar Android (wajib putih transparan)
    ...(d.image ? { image: d.image } : {}),   // foto besar (Android) — Galeri & Produk baru
    tag: d.tag || 'cai', renotify: true, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(c => c.url.startsWith(self.location.origin));
    if (c && c.navigate) return c.navigate(url).then(w => (w || c).focus()).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
