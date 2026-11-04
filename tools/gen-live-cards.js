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
   Concerto Way & Panduan Partner TIDAK di sini (isinya khusus partner). Jangan memuat harga dealer/diskon di kartu. */
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
  const gallery = await rest('showcase_installs?select=id,car_make,car_model,car_year,dealer,city,products,photos,hof_id&published=eq.true');
  return { news, gallery };
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
.g .u{color:#d8b26a}`;
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
function videoFrame(url, out) {
  for (const ss of ['1.5', '0']) {
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
  for (const g of data.gallery || []) {
    const ph = (Array.isArray(g.photos) ? g.photos : []).filter(p => p?.path && !String(p.path).startsWith('pending/'));
    // Gambar kartu: foto "Tampak Luar" → cuplikan video sampul (cover) → foto pertama → cuplikan video pertama
    const outside = ph.find(p => !isVid(p) && /tampak luar/i.test(p.area || '')), cover = ph.find(p => isVid(p) && p.cover);
    const photo = outside || (!cover ? ph.find(p => !isVid(p)) : null), video = photo ? null : (cover || ph.find(isVid));
    const name = carName(g) || 'Instalasi audio mobil';
    items.push({ dir: 'g', id: g.id, target: `/?gl=${encodeURIComponent(g.id)}`,
      title: `${name}${g.dealer ? ' · Instalasi ' + g.dealer : ''}`,
      desc: clip(`Galeri Instalasi partner resmi Concerto Audio Indonesia${g.city ? ' — ' + g.city : ''}. Foto & video pemasangan di CAI Hub.`, 200),
      sig: [name, g.dealer, g.city, g.hof_id, photo?.path, photo?.pos, video?.path], g, photo, video });
  }
  const livePath = path.join(ROOT, 'share/live.json');
  const old = fs.existsSync(livePath) ? JSON.parse(fs.readFileSync(livePath, 'utf8')) : { n: {}, g: {} };
  const next = { n: {}, g: {} };
  // --check (dipakai GitHub Actions): hanya cek apakah ada kartu baru/berubah/terhapus — tanpa browser, supaya jadwal tetap ringan
  const ids = new Set(items.map(it => it.dir + '/' + it.id));
  const changed = items.some(it => old[it.dir]?.[it.id] !== hash(it.sig) || !fs.existsSync(path.join(ROOT, `share/img/${it.dir}-${it.id}.jpg`)))
    || ['n', 'g'].some(d => Object.keys(old[d] || {}).some(id => !ids.has(d + '/' + id)));
  if (process.argv.includes('--check')) {
    console.log(changed ? 'Ada kartu baru / berubah / terhapus' : 'Tidak ada perubahan');
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    return;
  }
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
        if (it.dir === 'n') html = it.html();
        else {
          let src = it.photo ? pub(it.photo.path) : '';
          if (it.photo?.pos) it.g._pos = String(it.photo.pos).split(' ').map(v => /%$/.test(v) ? v : v + '%').join(' ');
          if (!src && it.video && TEST_IMG) src = TEST_IMG;
          if (!src && it.video) { const f = path.join(tmp, it.id + '.jpg'); if (videoFrame(pub(it.video.path), f)) src = 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64'); }
          html = galleryCard(it.g, src, !!it.video);
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
  for (const dir of ['n', 'g']) {
    const base = path.join(ROOT, dir); if (!fs.existsSync(base)) continue;
    for (const id of fs.readdirSync(base)) if (!next[dir][id]) { fs.rmSync(path.join(base, id), { recursive: true, force: true }); fs.rmSync(path.join(ROOT, `share/img/${dir}-${id}.jpg`), { force: true }); }
  }
  const sorted = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  fs.writeFileSync(livePath, JSON.stringify({ n: sorted(next.n), g: sorted(next.g) }) + '\n');
  await browser.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`News ${Object.keys(next.n).length} · Galeri ${Object.keys(next.g).length} · ${drawn} kartu digambar · ${failed} gagal`);
})().catch(e => { console.error(e); process.exit(1); });
