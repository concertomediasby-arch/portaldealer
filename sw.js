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
