#!/usr/bin/env node
/* CAI Hub — KARTU PRATINJAU WA PER BERITA & PER MOBIL GALERI (Tahap 5 C, 4 Nov 2026, permintaan pemilik — pratinjau .mockup/tahap5c/).
   Isi News & Galeri ada di database (bukan di repo), jadi kartu per item dibuat oleh jadwal GitHub Actions
   (.github/workflows/live-cards.yml, tiap ±15 menit) yang menjalankan skrip ini:
     • membaca berita (cai_news) & mobil Galeri (showcase_installs) yang SUDAH TAYANG lewat REST Supabase dengan
       publishable key (data publik saja — RLS yang sama dengan pengunjung tanpa login; tidak ada kunci rahasia)
     • menggambar kartu 1200×630 → share/img/n-<id>.jpg / g-<id>.jpg (Galeri tanpa foto → cuplikan video lewat ffmpeg)
     • menulis halaman kecil n/<id>/index.html → /?news=<id>  dan  g/<id>/index.html → /?gl=<id>  (meta OG + diteruskan ke portal)
     • menulis share/live.json = { n: {id: hash}, g: {id: hash} } → dipakai nwLink()/glLink() di portal: link /n/<id>/?v=<hash>
       hanya bila kartunya sudah ada (sebelum itu tetap link lama /news/?news= · /galeri/?gl= = kartu umum)
   Item yang dihapus / dijadikan draf → halaman & gambarnya ikut dihapus. Hanya kartu yang datanya berubah yang digambar ulang.
   Uji lokal tanpa internet ke Supabase: LIVE_FIXTURE=file.json node tools/gen-live-cards.js  (file = { news: [...], gallery: [...] }).
   Concerto Way & Panduan Partner TIDAK di sini (isinya khusus partner). Jangan memuat harga dealer/diskon di kartu.
   Tahap 8 B (4 Nov 2026): juga kartu per MOBIL (m/<slug>/ → /?mobil=, share/img/m-<slug>.jpg) & per PARTNER (pp/<slug>/ → /?partner=,
   share/img/pp-<slug>.jpg) dari Galeri + Hall of Fame + daftar partner (logika sama dengan js/cars.js lewat tools/lib/cars-data.js).
   Foto kartu mobil HANYA sampul kartu WA pilihan Editor (field wa, aman plat nomor); tanpa pilihan → ikon mobil.
   Data publik juga disalin ke tools/data/galeri.json & tools/data/partners.json (bila berubah) → dipakai tools/gen-seo-pages.js
   (halaman Google /mobil/ & profil di /partner/), yang dijalankan workflow setelah skrip ini. */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://hub.concerto.id';
const stockJs = fs.readFileSync(path.join(ROOT, 'js/stock.js'), 'utf8');
const SUPA_URL = stockJs.match(/const SUPA_URL\s*=\s*'([^']+)'/)[1], SUPA_KEY = stockJs.match(/const SUPA_KEY\s*=\s*'([^']+)'/)[1];
const LOGO_WHITE = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8').match(/const LOGO_WHITE = "([^"]+)"/)[1];
const VER = 1;   // naikkan bila tampilan kartu (CSS/HTML) diubah → semua kartu digambar ulang
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const TEST_IMG = process.env.LIVE_TEST_IMG ? 'data:image/jpeg;base64,' + fs.readFileSync(process.env.LIVE_TEST_IMG).toString('base64') : '';   // uji lokal tanpa Storage
const pub = p => TEST_IMG || `${SUPA_URL}/storage/v1/object/public/showcase/${String(p).split('#')[0].split('/').map(encodeURIComponent).join('/')}`;
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tgl = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]} ${BULAN[+m[2] - 1]} ${m[1]}` : ''; };
const ytId = u => (String(u || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/) || [])[1] || '';
const isVid = p => p?.type === 'video' || /\.(mp4|mov|webm|m4v)$/i.test(p?.path || '');
const CARS = require('./lib/cars-data.js');
const hash = o => crypto.createHash('md5').update(VER + JSON.stringify(o)).digest('hex').slice(0, 8);

async function rest(q) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${q}`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
  if (!r.ok) throw new Error(`${q.split('?')[0]}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}
async function loadData() {
  if (process.env.LIVE_FIXTURE) return JSON.parse(fs.readFileSync(process.env.LIVE_FIXTURE, 'utf8'));
  const news = await rest('cai_news?select=id,title,summary,category,image,link_url,post_date&published=eq.true&order=post_date.desc');
  // RLS publik sudah menyaring draf, kiriman tertunda & yang masih terjadwal
  const gallery = await rest('showcase_installs?select=id,car_make,car_model,car_year,body,dealer,city,products,photos,hof_id,created_at&published=eq.true&order=created_at.desc');
  const partners = (await rest('auth_dealers?select=region,name,city,address,wa,ig,map,sort&order=region,sort,name'))
    .map(r => Object.fromEntries(Object.entries({ r: r.region, n: r.name, c: r.city, a: r.address, wa: r.wa, ig: r.ig, map: r.map }).filter(([, v]) => v)));
  // 📅 Kalender Acara: hanya acara publik yang tayang (RLS anon); tabel belum dibuat → dilewati
  let events = []; try { events = await rest('cai_events?select=id,title,kind,start_at,end_at,online,city,venue,poster,body&order=start_at'); } catch (e) { console.warn('acara dilewati:', e.message); }
  return { news, gallery, partners, events };
}

const CSS = `*{box-sizing:border-box}body{margin:0;background:#000}
.c{width:1200px;height:630px;position:relative;overflow:hidden;font-family:Inter,sans-serif;color:#fff;background:#07080a}
.foot{position:absolute;left:64px;right:64px;bottom:44px;display:flex;align-items:center;gap:16px;font:600 21px Inter;color:#aab0bc}
.foot img{height:32px}.foot .u{margin-left:auto;font:700 20px Sora}
.pill{display:inline-block;font:700 19px Inter;letter-spacing:.14em;padding:8px 18px;border-radius:30px}
.n .img{position:absolute;top:0;bottom:0;right:0;width:58%;overflow:hidden;background:#0c1520}
.n .img img{width:100%;height:100%;object-fit:cover}.n .img .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:180px;opacity:.35}
.n .img::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#07080a 0%,rgba(7,8,10,.6) 26%,transparent 55%)}
.n .play{position:absolute;right:16%;top:50%;margin-top:-50px;width:100px;height:100px;border-radius:50%;background:rgba(229,0,0,.88);display:flex;align-items:center;justify-content:center}
.n .play::after{content:"";border-left:32px solid #fff;border-top:20px solid transparent;border-bottom:20px solid transparent;margin-left:8px}
.n .l{position:absolute;left:64px;top:58px;width:640px}
.n .pill{background:rgba(111,211,230,.14);color:#6fd3e6;border:2px solid rgba(111,211,230,.5)}.n .meta{font:600 21px Inter;color:#aab0bc;margin-left:14px}
.n h1{font:800 50px/1.14 Sora;margin:28px 0 0;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.n h1.sm{font-size:42px}.n .u{color:#6fd3e6}
.g .img{position:absolute;inset:0;background:linear-gradient(135deg,#2a2f38,#11141a)}.g .img img{width:100%;height:100%;object-fit:cover}
.g .img::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(7,8,10,.96) 0%,rgba(7,8,10,.6) 40%,rgba(7,8,10,.05) 72%)}
.g .top{position:absolute;left:64px;top:46px}.g .top img{height:40px}
.g .l{position:absolute;left:64px;right:64px;bottom:112px}
.g .pill{background:rgba(216,178,106,.18);color:#e9c98a;border:2px solid rgba(216,178,106,.6)}.g .hof{margin-left:10px;background:rgba(255,215,90,.2);color:#ffe08a;border-color:rgba(255,215,90,.6)}
.g h1{font:800 66px/1.06 Sora;margin:20px 0 10px;text-shadow:0 2px 18px rgba(0,0,0,.5)}.g h1.sm{font-size:52px}
.g p{margin:0;font:600 27px Inter;color:#e3e6eb}.g p b{color:#f0cf8a}
.g .play{position:absolute;right:70px;bottom:118px;width:96px;height:96px;border-radius:50%;background:rgba(0,0,0,.4);border:3px solid rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center}
.g .play::after{content:"";border-left:30px solid #fff;border-top:19px solid transparent;border-bottom:19px solid transparent;margin-left:7px}
.g .u{color:#d8b26a}
.m .img,.pp .img{position:absolute;top:0;bottom:0;left:0;width:54%;overflow:hidden;background:radial-gradient(circle at 45% 45%,#3d3527,#101114 75%);display:flex;align-items:center;justify-content:center}
.m .img img{width:100%;height:100%;object-fit:cover}.m .img .ic{font-size:210px;opacity:.9}
.m .img::after,.pp .img::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 45%,#07080a 98%)}
.pp .img .in{font:800 210px Sora;color:#d8b26a;letter-spacing:-6px}
.m .l,.pp .l{position:absolute;left:52%;right:56px;top:60px}
.m .pill,.pp .pill{background:rgba(216,178,106,.16);color:#e9c98a;border:2px solid rgba(216,178,106,.55);font-size:16px}
.m h1,.pp h1{font:800 60px/1.06 Sora;margin:22px 0 10px}.m h1.sm,.pp h1.sm{font-size:46px}
.m p,.pp p{margin:0;font:600 24px Inter;color:#c9ced6}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.chips span{font:700 20px Inter;border-radius:30px;padding:8px 16px;background:rgba(216,178,106,.16);color:#f0cf8a}
.chips span.ok{background:rgba(62,207,142,.16);color:#5fe0a6}
.m .foot,.pp .foot{left:52%}.m .u,.pp .u{color:#d8b26a}
.e .img{position:absolute;top:0;bottom:0;right:0;width:46%;overflow:hidden;background:radial-gradient(circle at 50% 40%,#3a2c10,#0b0c0f 75%);display:flex;align-items:center;justify-content:center}
.e .img img{width:100%;height:100%;object-fit:cover}.e .img .ic{font-size:200px}
.e .img::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#07080a 0%,rgba(7,8,10,.5) 22%,transparent 50%)}
.e .l{position:absolute;left:64px;top:56px;width:690px}
.e .pill{background:rgba(216,178,106,.16);color:#e9c98a;border:2px solid rgba(216,178,106,.55);font-size:17px}
.e .dt{display:flex;align-items:center;gap:20px;margin-top:30px}.e .dt .b{width:118px;text-align:center;border:2px solid rgba(216,178,106,.5);border-radius:20px;padding:10px 0}
.e .dt small{display:block;font:700 18px Inter;letter-spacing:.14em;color:#d8b26a}.e .dt b{display:block;font:800 58px/1 Sora}.e .dt i{font-style:normal;font:600 18px Inter;color:#aab0bc}
.e h1{font:800 50px/1.1 Sora;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.e h1.sm{font-size:40px}
.e p{margin:22px 0 0;font:600 25px Inter;color:#e3e6eb}.e .u{color:#d8b26a}`;
const LOGO = `<img src="${LOGO_WHITE}">`;
function newsCard(n) {
  const yt = !n.image && ytId(n.link_url), img = n.image ? pub(n.image) : yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : '';
  const fr = String(n.image || '').split('#')[1]?.split(',').map(Number) || [];
  const pos = fr.length >= 2 ? `object-position:${fr[0]}% ${fr[1]}%;` : '';
  return `<div class="c n" id="c"><div class="img">${img ? `<img src="${esc(img)}" style="${pos}">` : '<span class="ph">📰</span>'}${yt ? '<span class="play"></span>' : ''}</div>
    <div class="l"><span class="pill">CAI HUB NEWS</span><span class="meta">${esc([n.category, tgl(n.post_date)].filter(Boolean).join(' · '))}</span>
      <h1${n.title.length > 70 ? ' class="sm"' : ''}>${esc(n.title)}</h1></div>
    <div class="foot">${LOGO}<b>CAI Hub</b> · Concerto Audio Indonesia<span class="u">hub.concerto.id</span></div></div>`;
}
const EV_IC = { kompetisi: ['🏆', 'KOMPETISI'], gathering: ['🤝', 'GATHERING'], workshop: ['🎓', 'WORKSHOP'], launching: ['🚀', 'LAUNCHING'], partner: ['🏪', 'ACARA PARTNER'] };
const evW = (iso, o) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', ...o });
const evYmd = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
function evRange(e) {
  const hm = iso => evW(iso, { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');
  const s = e.start_at, en = e.end_at, same = !en || evYmd(s) === evYmd(en);
  return same ? `${evW(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${hm(s)} WIB`
    : `${evW(s, { day: 'numeric', month: 'short' })} – ${evW(en, { day: 'numeric', month: 'short', year: 'numeric' })} · ${hm(s)} WIB`;
}
function eventCard(e) {
  const k = EV_IC[e.kind] || EV_IC.kompetisi, place = e.online ? 'Online' : [e.venue, e.city].filter(Boolean).join(' · ');
  return `<div class="c e" id="c"><div class="img">${e.poster ? `<img src="${esc(pub(e.poster))}">` : `<span class="ic">${k[0]}</span>`}</div>
    <div class="l"><span class="pill">📅 KALENDER ACARA · ${k[1]}</span>
      <div class="dt"><div class="b"><small>${esc(evW(e.start_at, { weekday: 'short' }).toUpperCase())}</small><b>${evW(e.start_at, { day: 'numeric' })}</b><i>${esc(evW(e.start_at, { month: 'short', year: 'numeric' }))}</i></div>
        <h1${e.title.length > 48 ? ' class="sm"' : ''}>${esc(e.title)}</h1></div>
      <p>${esc(evRange(e))}${place ? '<br>📍 ' + esc(place) : ''}</p></div>
    <div class="foot">${LOGO}<b>CAI Hub</b> · Concerto Audio Indonesia<span class="u">hub.concerto.id</span></div></div>`;
}
const carName = g => [g.car_make, g.car_model, g.car_year].filter(Boolean).join(' ');
function galleryCard(g, imgSrc, video) {
  const name = carName(g) || 'Instalasi audio mobil';
  return `<div class="c g" id="c"><div class="img">${imgSrc ? `<img src="${esc(imgSrc)}" style="object-position:${esc(g._pos || '50% 50%')}">` : ''}</div>
    <div class="top">${LOGO}</div>
    <div class="l"><span class="pill">GALERI INSTALASI</span>${g.hof_id ? '<span class="pill hof">🏆 MOBIL JUARA</span>' : ''}
      <h1${name.length > 24 ? ' class="sm"' : ''}>${esc(name)}</h1>${g.dealer ? `<p>Dipasang oleh <b>${esc(g.dealer)}</b>${g.city ? ' · ' + esc(g.city) : ''}</p>` : ''}</div>
    ${video ? '<span class="play"></span>' : ''}
    <div class="foot"><b>CAI Hub</b> · Partner resmi Concerto Audio Indonesia<span class="u">hub.concerto.id</span></div></div>`;
}
const CAR_IC = b => /listrik|hybrid|\bev\b/i.test(b || '') ? '⚡' : /mpv|van/i.test(b || '') ? '🚐' : /sedan|hatch/i.test(b || '') ? '🚗' : '🚙';
const initials = n => String(n || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(w => !/^(the|dan|and)$/i.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '★';
function carCard(c, imgSrc) {
  return `<div class="c m" id="c"><div class="img">${imgSrc ? `<img src="${esc(imgSrc)}" style="object-position:${esc(c._pos || '50% 50%')}">` : `<span class="ic">${CAR_IC(c.body)}</span>`}</div>
    <div class="l"><span class="pill">CARI PER MOBIL · CAI HUB</span><h1${c.name.length > 18 ? ' class="sm"' : ''}>${esc(c.name)}</h1><p>Contoh pemasangan audio oleh partner resmi CAI</p>
      <div class="chips">${c.wins ? `<span>🏆 ${c.wins} prestasi</span>` : ''}<span>${c.cars} mobil</span>${c.partners.length ? `<span class="ok">${c.partners.length} partner resmi</span>` : ''}</div></div>
    <div class="foot">${LOGO}<span class="u">hub.concerto.id</span></div></div>`;
}
function partnerCard(d, x) {
  return `<div class="c pp" id="c"><div class="img"><span class="in">${esc(initials(d.n))}</span></div>
    <div class="l"><span class="pill">PROFIL PARTNER · CAI HUB</span><h1${d.n.length > 18 ? ' class="sm"' : ''}>${esc(d.n)}</h1><p>${esc([d.c, d.r].filter(Boolean).join(', '))}</p>
      <div class="chips"><span class="ok">✓ Partner resmi CAI</span>${x.hof.length ? `<span>🏆 ${x.hof.length} prestasi${x.j1 ? ' · ' + x.j1 + ' Juara 1' : ''}</span>` : ''}${x.gl.length ? `<span>${x.gl.length} instalasi Galeri</span>` : ''}</div></div>
    <div class="foot">${LOGO}<span class="u">hub.concerto.id</span></div></div>`;
}
function pageHtml({ dir, id, title, desc, img, target }) {
  const url = `${SITE}/${dir}/${encodeURIComponent(id)}/`;
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>${esc(title)} · CAI Hub</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="CAI Hub">
<meta property="og:locale" content="id_ID">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<link rel="icon" href="/favicon.ico">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)} + location.hash);</script>
</head><body style="background:#07080a;color:#eceef2;font-family:sans-serif;text-align:center;padding:40px">
<p>Membuka CAI Hub…</p><p><a style="color:#d8b26a" href="${esc(target)}">${esc(title)}</a></p>
</body></html>
`;
}
// Cuplikan video (Galeri tanpa foto) → JPEG lokal; ffmpeg membaca langsung dari URL publik (detik ke-1,5 bila ada)
function videoFrame(url, out, at) {
  for (const ss of [...(at != null ? [String(at)] : []), '1.5', '0']) {
    try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss, '-i', url, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', out], { timeout: 90000 }); if (fs.existsSync(out) && fs.statSync(out).size > 2000) return true; }
    catch (e) { /* coba lagi dari awal */ }
  }
  return false;
}

(async () => {
  const data = await loadData();
  const items = [];
  for (const n of data.news || []) {
    if (!n.id || !n.title) continue;
    items.push({ dir: 'n', id: n.id, target: `/?news=${encodeURIComponent(n.id)}`, title: n.title,
      desc: clip(n.summary || 'Berita terbaru Concerto Audio Indonesia di CAI Hub.', 200),
      sig: [n.title, n.category, n.post_date, n.image, n.link_url], html: () => newsCard(n) });
  }
  for (const e of data.events || []) {
    if (!e.id || !e.title || !e.start_at) continue;
    items.push({ dir: 'e', id: e.id, target: `/?acara=${encodeURIComponent(e.id)}`, title: `${e.title} — Kalender Acara CAI`,
      desc: clip(`${evRange(e)}${e.online ? ' · Online' : e.city ? ' · ' + e.city : ''}. ${e.body || 'Detail & pengingat di CAI Hub.'}`, 200),
      sig: ['e', e.title, e.kind, e.start_at, e.end_at, e.online, e.city, e.venue, e.poster], html: () => eventCard(e) });
  }
  for (const g of data.gallery || []) {
    const ph = (Array.isArray(g.photos) ? g.photos : []).filter(p => p?.path && !String(p.path).startsWith('pending/'));
    // Gambar kartu: pilihan Editor "📲 Sampul kartu WA" (wa, video + detik waT) → foto "Tampak Luar" → cuplikan video sampul (cover)
    // → foto pertama → cuplikan video pertama
    const pick = ph.find(p => p.wa);
    const outside = ph.find(p => !isVid(p) && /tampak luar/i.test(p.area || '')), cover = ph.find(p => isVid(p) && p.cover);
    const photo = pick ? (isVid(pick) ? null : pick) : outside || (!cover ? ph.find(p => !isVid(p)) : null);
    const video = photo ? null : (pick || cover || ph.find(isVid));
    const name = carName(g) || 'Instalasi audio mobil';
    items.push({ dir: 'g', id: g.id, target: `/?gl=${encodeURIComponent(g.id)}`,
      title: `${name}${g.dealer ? ' · Instalasi ' + g.dealer : ''}`,
      desc: clip(`Galeri Instalasi partner resmi Concerto Audio Indonesia${g.city ? ' — ' + g.city : ''}. Foto & video pemasangan di CAI Hub.`, 200),
      sig: [name, g.dealer, g.city, g.hof_id, photo?.path, photo?.pos, video?.path, video?.waT], g, photo, video });
  }
  // ── Mobil & partner (Tahap 8 B) ──
  const partners = Array.isArray(data.partners) && data.partners.length ? data.partners
    : JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/data/partners.json'), 'utf8')).partners;
  const glPub = (data.gallery || []).filter(g => g.id && g.car_make);
  const { cars, partnerData } = CARS.build(glPub, partners);
  for (const c of cars) {
    // foto kartu: hanya sampul kartu WA pilihan Editor (aman plat nomor)
    let pick = null; for (const g of c.gl) { const p = (g.photos || []).find(x => x?.wa && x.path && !String(x.path).startsWith('pending/')); if (p) { pick = p; break; } }
    items.push({ dir: 'm', id: c.slug, target: `/?mobil=${encodeURIComponent(c.slug)}`, title: `${c.name} — contoh pemasangan audio`,
      desc: clip(`${c.cars} mobil ${c.name} dikerjakan partner resmi Concerto Audio Indonesia${c.wins ? ` · ${c.wins} prestasi kompetisi` : ''}. Lihat foto, perangkat & partnernya di CAI Hub.`, 200),
      sig: ['m', c.name, c.body, c.cars, c.wins, c.partners.length, pick?.path, pick?.pos, pick?.waT], c,
      photo: pick && !isVid(pick) ? pick : null, video: pick && isVid(pick) ? pick : null });
  }
  for (const d of partners) {
    const x = partnerData(d), slug = CARS.shareSlug(d.n); if (!slug) continue;
    items.push({ dir: 'pp', id: slug, target: `/?partner=${encodeURIComponent(slug)}`, title: `${d.n} — Partner Resmi CAI${d.c ? ' di ' + d.c : ''}`,
      desc: clip(`Partner resmi Concerto Audio Indonesia${d.c ? ' di ' + d.c : ''}${x.hof.length ? ` · ${x.hof.length} prestasi kompetisi` : ''}${x.gl.length ? ` · ${x.gl.length} instalasi di Galeri` : ''}. Kontak, hasil pemasangan & prestasi di CAI Hub.`, 200),
      sig: ['pp', d.n, d.c, d.r, x.gl.length, x.hof.length, x.j1], d, x });
  }
  // Salinan data publik untuk halaman Google (tools/gen-seo-pages.js) — ditulis hanya bila isinya berubah
  const dataFiles = [
    ['tools/data/galeri.json', { _note: 'Salinan Galeri Instalasi yang tayang (data publik) — ditulis otomatis oleh tools/gen-live-cards.js (GitHub Actions). Jangan diedit manual.',
      gallery: glPub.map(g => ({ id: g.id, car_make: g.car_make, car_model: g.car_model, car_year: g.car_year, body: g.body, dealer: g.dealer, city: g.city, products: g.products || [], hof_id: g.hof_id || null,
        photos: (g.photos || []).filter(p => p?.path && !String(p.path).startsWith('pending/')).map(p => Object.fromEntries(Object.entries({ path: p.path, type: p.type, area: p.area, wa: p.wa, waT: p.waT, pos: p.pos }).filter(([, v]) => v != null && v !== '' && v !== false))) })) }, 'gallery'],
    ['tools/data/partners.json', { _note: 'Salinan daftar Authorized Partner dari tabel Supabase auth_dealers (tidak disembunyikan) — diperbarui otomatis oleh tools/gen-live-cards.js (GitHub Actions); dipakai tools/gen-seo-pages.js.',
      updated: new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10), partners }, 'partners'],
  ].filter(() => !process.env.LIVE_FIXTURE || process.env.LIVE_WRITE_DATA);
  const dataChanged = dataFiles.filter(([f, obj, key]) => { try { return JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))[key]) !== JSON.stringify(obj[key]); } catch (e) { return true; } });
  const livePath = path.join(ROOT, 'share/live.json');
  const old = fs.existsSync(livePath) ? JSON.parse(fs.readFileSync(livePath, 'utf8')) : {};
  const DIRS = ['n', 'g', 'm', 'pp', 'e'], next = Object.fromEntries(DIRS.map(d => [d, {}]));
  // --check (dipakai GitHub Actions): hanya cek apakah ada kartu baru/berubah/terhapus — tanpa browser, supaya jadwal tetap ringan
  const ids = new Set(items.map(it => it.dir + '/' + it.id));
  const changed = items.some(it => old[it.dir]?.[it.id] !== hash(it.sig) || !fs.existsSync(path.join(ROOT, `share/img/${it.dir}-${it.id}.jpg`)))
    || DIRS.some(d => Object.keys(old[d] || {}).some(id => !ids.has(d + '/' + id))) || dataChanged.length > 0;
  if (process.argv.includes('--check')) {
    console.log(changed ? 'Ada kartu baru / berubah / terhapus' : 'Tidak ada perubahan');
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    return;
  }
  for (const [f, obj] of dataChanged) fs.writeFileSync(path.join(ROOT, f), JSON.stringify(obj, null, 1) + '\n');
  fs.mkdirSync(path.join(ROOT, 'share/img'), { recursive: true });
  const { chromium } = require('playwright');
  const browser = await chromium.launch(); const pg = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cai-live-'));
  let drawn = 0, failed = 0;
  for (const it of items) {
    const h = hash(it.sig), img = path.join(ROOT, `share/img/${it.dir}-${it.id}.jpg`);
    try {
      if (old[it.dir]?.[it.id] !== h || !fs.existsSync(img)) {
        let html;
        if (it.dir === 'n' || it.dir === 'e') html = it.html();
        else if (it.dir === 'pp') html = partnerCard(it.d, it.x);
        else {
          let src = it.photo ? pub(it.photo.path) : '';
          if (it.photo?.pos) (it.g || (it.g = {}))._pos = String(it.photo.pos).split(' ').map(v => /%$/.test(v) ? v : v + '%').join(' ');
          if (!src && it.video && TEST_IMG) src = TEST_IMG;
          if (!src && it.video) { const f = path.join(tmp, it.id + '.jpg'); if (videoFrame(pub(it.video.path), f, it.video.waT)) src = 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64'); }
          html = it.dir === 'm' ? carCard(Object.assign(it.c, { _pos: it.g?._pos }), src) : galleryCard(it.g, src, !!it.video);
        }
        await pg.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle', timeout: 60000 });
        await pg.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))]));
        await (await pg.$('#c')).screenshot({ path: img, type: 'jpeg', quality: 84 });
        drawn++;
      }
      next[it.dir][it.id] = h;
      const d = path.join(ROOT, it.dir, it.id); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'index.html'), pageHtml({ ...it, img: `${SITE}/share/img/${it.dir}-${encodeURIComponent(it.id)}.jpg?v=${h}` }));
    } catch (e) { failed++; console.warn('gagal', it.dir, it.id, e.message); if (old[it.dir]?.[it.id] && fs.existsSync(img)) next[it.dir][it.id] = old[it.dir][it.id]; }
  }
  // Hapus halaman & gambar item yang sudah tidak tayang
  for (const dir of DIRS) {
    const base = path.join(ROOT, dir); if (!fs.existsSync(base)) continue;
    for (const id of fs.readdirSync(base)) if (!next[dir][id]) { fs.rmSync(path.join(base, id), { recursive: true, force: true }); fs.rmSync(path.join(ROOT, `share/img/${dir}-${id}.jpg`), { force: true }); }
  }
  const sorted = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  fs.writeFileSync(livePath, JSON.stringify(Object.fromEntries(DIRS.map(d => [d, sorted(next[d])]))) + '\n');
  await browser.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`News ${Object.keys(next.n).length} · Galeri ${Object.keys(next.g).length} · Mobil ${Object.keys(next.m).length} · Partner ${Object.keys(next.pp).length} · Acara ${Object.keys(next.e).length} · ${drawn} kartu digambar · ${failed} gagal${dataChanged.length ? ' · data: ' + dataChanged.map(x => x[0]).join(', ') : ''}`);
})().catch(e => { console.error(e); process.exit(1); });
