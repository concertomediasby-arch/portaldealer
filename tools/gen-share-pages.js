#!/usr/bin/env node
/* CAI Hub — pembuat KARTU PRATINJAU LINK per item (3 Nov 2026, permintaan pemilik).
   WhatsApp/Facebook membuat kartu pratinjau dari meta Open Graph halaman TANPA menjalankan JavaScript, jadi portal
   (satu halaman) selalu tampil dengan kartu umum. Skrip ini membuat untuk setiap item:
     • gambar kartu 1200×630  → share/img/<jenis>-<id>.jpg
     • halaman kecil statis   → <jenis>/<id>/index.html (meta OG + langsung diteruskan ke portal)
   Jenis: p = produk (BRANDS) · h = Hall of Fame (HALL_OF_FAME) · a = Academy bawaan (ACADEMY) · k = Paket Audio (PAKET_AUDIO)
          · d = Authorized Dealer (AUTH_DEALERS — data cadangan di kode; dealer yang hanya diubah lewat portal tidak ikut).
   JALANKAN ULANG setiap kali produk/harga/foto, Hall of Fame, Academy, Paket, atau daftar dealer di kode berubah:
       node tools/gen-share-pages.js          (hanya kartu yang datanya berubah yang digambar ulang; --all = semua)
   Butuh Playwright (sudah ada di lingkungan Claude Code) + pdftoppm (poppler) untuk sampul Paket Audio.
   Hanya SRP yang boleh tampil — jangan pernah menambah harga dealer/diskon ke kartu. */
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://hub.concerto.id';
const ALL = process.argv.includes('--all');

/* ── Data dari katalog.js & js/core.js (literal data murni) ── */
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'katalog.js'), 'utf8') + ';this.BRANDS=BRANDS;this.HALL_OF_FAME=HALL_OF_FAME;', ctx);
const core = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8');
function literal(name) {
  const i = core.indexOf(`const ${name} = [`); if (i < 0) throw new Error('tidak ditemukan: ' + name);
  let j = core.indexOf('[', i), depth = 0, q = null;
  for (let k = j; k < core.length; k++) {
    const c = core[k];
    if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (!depth) return vm.runInNewContext('(' + core.slice(j, k + 1) + ')'); }
  }
}
const LOGO_WHITE = core.match(/const LOGO_WHITE = "([^"]+)"/)[1];
const ACADEMY = literal('ACADEMY'), PAKET_AUDIO = literal('PAKET_AUDIO'), AUTH_DEALERS = literal('AUTH_DEALERS');
// Sama dengan shareSlug() di js/core.js
const shareSlug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmtRp = n => 'Rp ' + Number(n).toLocaleString('id-ID');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const findProd = id => { for (const b of ctx.BRANDS) for (const l of b.lines) for (const p of l.products) if (p.id === id) return { b, l, p }; return null; };
const photoOf = p => p.photo || p.photos?.[0] || '';
const srp = p => {
  if (p.priceList) { const v = Object.values(p.priceList).filter(Number); return v.length ? 'mulai ' + fmtRp(Math.min(...v)) : ''; }
  return p.price ? fmtRp(p.price) + (p.priceUnit ? ' / ' + p.priceUnit : '') : '';
};

/* ── Daftar kartu ── */
const items = [];
for (const b of ctx.BRANDS) for (const l of b.lines) for (const p of l.products) {
  const specs = Object.values(p.specs || {}).filter(v => String(v).length < 28).slice(0, 3).join(' · ');
  items.push({ kind: 'p', id: p.id, target: `/?p=${encodeURIComponent(p.id)}`,
    title: `${b.name} ${p.name}${srp(p) ? ' — SRP ' + srp(p) : ''}`,
    desc: clip([p.soon ? 'COMING SOON.' : '', p.desc, 'Spesifikasi, foto & video lengkap di CAI Hub.'].filter(Boolean).join(' '), 200),
    card: { t: 'p', brand: b.name, logo: b.logo || '', color: b.color, cat: [p.category, l.name].filter(Boolean).join(' · '), name: p.name,
      model: p.model && p.model !== p.name ? p.model : '', specs, srp: srp(p), soon: !!p.soon, photo: photoOf(p), emoji: p.emoji || '🔊' } });
}
const placeTxt = e => e.place >= 1 && e.place <= 3 ? `Juara ${e.place}` : (e.award || 'Penghargaan');
for (const e of ctx.HALL_OF_FAME) {
  const prods = (e.products || []).map(findProd).filter(Boolean);
  items.push({ kind: 'h', id: e.id, target: `/?hof=${encodeURIComponent(e.id)}`,
    title: `${e.award || placeTxt(e)}${e.cls ? ' ' + e.cls : ''} — ${e.event}${e.city ? ' ' + e.city : ''}`,
    desc: clip([e.car && `${e.car}${e.name ? ' (' + e.name + ')' : ''}`, e.dealer && `dipasang oleh ${e.dealer}`, 'Hall of Fame CAI Hub.'].filter(Boolean).join(' · '), 200),
    card: { t: 'h', place: e.place, award: e.award || placeTxt(e), cls: e.cls || '', ev: [e.event, [e.venue, e.city].filter(Boolean).join(', '), e.date || e.year].filter(Boolean).join(' · '),
      car: e.car || '', who: e.name || '', dealer: e.dealer || '', photos: prods.map(r => photoOf(r.p)).filter(Boolean).slice(0, 5), more: Math.max(0, prods.length + (e.other || []).length - 5) } });
}
const pad = n => String(n).padStart(2, '0');
for (const a of ACADEMY) items.push({ kind: 'a', id: String(a.no), target: `/?acad=${a.no}`,
  title: `Concerto Academy #${a.no}: ${a.title}`, desc: 'Ilmu dari lapangan, bukan dari brosur. Baca materinya gratis di CAI Hub.',
  card: { t: 'a', no: a.no, title: a.title, img: `assets/academy/fundamental-${pad(a.no)}.webp` } });
for (const k of PAKET_AUDIO) items.push({ kind: 'k', id: k.id, target: `/?paket=${encodeURIComponent(k.id)}`,
  title: k.title, desc: clip(`${k.segment} · Komponen: ${k.products.join(', ')}. Lihat detail & unduh PDF paket di CAI Hub.`, 200),
  card: { t: 'k', title: k.title, seg: k.segment, prods: k.products, icon: k.icon, file: k.available ? k.file : '' } });
for (const d of AUTH_DEALERS) items.push({ kind: 'd', id: shareSlug(d.n), target: `/?dealer=${encodeURIComponent(d.n)}`,
  title: `${d.n} — Authorized Dealer Concerto Audio Indonesia`, desc: clip([[d.c, d.r].filter(Boolean).join(', '), d.a, 'Dealer resmi Audiocircle · STEG · Zelos · Diosdela · OG One Sound · Audio System.'].filter(Boolean).join(' · '), 200),
  card: { t: 'd', name: d.n, city: d.c || '', region: d.r || '', addr: d.a || '', ig: d.ig || '' } });

/* ── Tampilan kartu (HTML → screenshot) ── */
const CSS = `*{box-sizing:border-box}body{margin:0;background:#000}
.c{width:1200px;height:630px;position:relative;overflow:hidden;font-family:Inter,sans-serif;color:#eceef2}
.ft{display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,.12);padding-top:18px}
.ft img{height:30px}.u{font:700 19px Sora;color:#d8b26a}
.pr{display:grid;grid-template-columns:600px 600px;background:#0b0c10}
.pr .ph{background:#fff;display:flex;align-items:center;justify-content:center;position:relative}
.pr .ph img{max-width:86%;max-height:86%;object-fit:contain}.pr .ph .emo{font-size:200px;opacity:.6}
.pr .ph .bar{position:absolute;left:0;right:0;bottom:0;height:8px}
.pr .in{padding:54px 56px 44px;display:flex;flex-direction:column;background:linear-gradient(160deg,#101216,#08090b)}
.pr .bl{height:46px;object-fit:contain;object-position:left;max-width:240px}.pr .bn{font:800 34px Sora}
.pr .cat{margin-top:34px;font:700 16px Sora;letter-spacing:.22em;color:#9aa0ad;text-transform:uppercase}
.pr h1{font:800 60px/1.04 Sora;margin:10px 0 8px;color:#fff}.pr h1.sm{font-size:46px}
.pr .ln{font-size:20px;color:#b9bec9}.pr .soon{display:inline-block;margin-top:14px;font:800 15px Sora;letter-spacing:.14em;background:#2f6bff;color:#fff;border-radius:8px;padding:6px 12px}
.pr .srp{margin-top:auto;margin-bottom:22px;display:flex;align-items:baseline;gap:14px}.pr .srp b{font:800 44px Sora;color:#f0cf8a;white-space:nowrap}.pr .srp span{font:700 15px Sora;letter-spacing:.2em;color:#d8b26a}
.pr .nos{margin-top:auto;margin-bottom:22px;font-size:20px;color:#b9bec9}
.gold{background:radial-gradient(70% 90% at 90% 0%,rgba(216,178,106,.32),transparent 60%),linear-gradient(150deg,#16130c,#07080a 62%)}
.hof{padding:52px 64px 44px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center}.top img{height:44px}.top .k{font:700 16px Sora;letter-spacing:.3em;color:#d8b26a}
.hof .row{display:flex;align-items:center;gap:34px;margin-top:46px}
.med{width:170px;height:170px;border-radius:50%;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.med small{font:800 16px Sora;letter-spacing:.2em}.med b{font:800 70px/1 Sora}.med.m1{background:radial-gradient(circle at 35% 30%,#fff1b8,#d8a93a 55%,#7a5512);color:#2a1d02}
.med.m2{background:radial-gradient(circle at 35% 30%,#ffffff,#b9c0c8 55%,#5f666e);color:#1d2228}.med.m3{background:radial-gradient(circle at 35% 30%,#f3c9a0,#b06a33 55%,#6d3b17);color:#2a1406}
.med.m0{background:radial-gradient(circle at 35% 30%,#fff1b8,#d8a93a 55%,#7a5512);color:#2a1d02}.med.m0 b{font-size:64px}
.hof .aw{font:800 58px/1.05 Sora;color:#fff}.hof .aw.sm{font-size:44px}.hof .ev{font-size:20px;color:#b9bec9;margin-top:10px}
.hof .car{margin-top:40px;display:flex;gap:44px}.hof .car span{display:block;font:700 13px Sora;letter-spacing:.2em;color:#9aa0ad;margin-bottom:6px}.hof .car b{font:700 25px Sora;color:#fff}.hof .car i{font-style:normal;font-size:20px;color:#b9bec9}
.hof .prods{margin-top:auto;display:flex;gap:12px;align-items:center}.hof .prods img{width:78px;height:78px;border-radius:12px;background:#fff;object-fit:contain;padding:5px}
.hof .prods .more{font:700 18px Sora;color:#9aa0ad;margin-left:6px}.hof .prods .u{margin-left:auto}
.split{display:grid;grid-template-columns:520px 680px}
.split .im{position:relative;overflow:hidden;background:#0b1830}.split .im img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top}
.split .im::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent 70%,#0b0c10)}
.split .in{padding:54px 56px 44px;display:flex;flex-direction:column;background:linear-gradient(160deg,#101216,#08090b)}
.split .in>img.lg{height:42px;align-self:flex-start}.split .kk{margin-top:36px;font:700 16px Sora;letter-spacing:.24em;color:#d8b26a;text-transform:uppercase}
.split h1{font:800 46px/1.12 Sora;margin:12px 0 12px;color:#fff}.split .sub{font-size:21px;color:#b9bec9;line-height:1.45}
.split ul{list-style:none;padding:0;margin:10px 0 0;font-size:20px;color:#d6d9df}.split li{padding:5px 0}.split li::before{content:'▸ ';color:#d8b26a}
.split .ft{margin-top:auto}
.dl{padding:56px 64px 44px;display:flex;flex-direction:column}
.dl .badge{display:inline-flex;gap:10px;align-items:center;font:700 17px Sora;letter-spacing:.18em;color:#d8b26a;text-transform:uppercase;margin-top:48px}
.dl .badge i{font-style:normal;border:1.5px solid #d8b26a;border-radius:999px;padding:4px 12px;letter-spacing:.08em;font-size:15px}
.dl h1{font:800 66px/1.05 Sora;margin:14px 0 10px;color:#fff}.dl h1.sm{font-size:52px}
.dl .city{font:700 28px Sora;color:#f0cf8a}.dl .addr{font-size:21px;color:#b9bec9;margin-top:10px;max-width:980px}
.dl .brands{margin-top:auto;margin-bottom:22px;font:600 17px Inter;color:#9aa0ad;letter-spacing:.04em}`;
const LOGO = `<img src="${LOGO_WHITE}">`;
function cardHtml(c) {
  if (c.t === 'p') return `<div class="c pr" id="c"><div class="ph">${c.photo ? `<img src="/${esc(c.photo)}">` : `<span class="emo">${c.emoji}</span>`}<div class="bar" style="background:${esc(c.color)}"></div></div>
    <div class="in" style="background:radial-gradient(80% 70% at 100% 0%,${esc(c.color)}55,transparent 60%),linear-gradient(160deg,#101216,#08090b)">
      ${c.logo ? `<img class="bl" src="/${esc(c.logo)}">` : `<div class="bn">${esc(c.brand)}</div>`}
      <div class="cat">${esc(c.cat)}</div><h1${c.name.length > 14 ? ' class="sm"' : ''}>${esc(c.name)}</h1>
      ${c.model ? `<div class="ln">${esc(c.model)}</div>` : c.specs ? `<div class="ln">${esc(c.specs)}</div>` : ''}${c.soon ? '<div><span class="soon">COMING SOON</span></div>' : ''}
      ${c.srp ? `<div class="srp"><span>SRP</span><b style="font-size:${c.srp.length > 24 ? 30 : c.srp.length > 16 ? 36 : 44}px">${esc(c.srp)}</b></div>` : '<div class="nos">Harga: hubungi dealer resmi</div>'}
      <div class="ft">${LOGO}<span class="u">hub.concerto.id</span></div></div></div>`;
  if (c.t === 'h') return `<div class="c gold hof" id="c"><div class="top">${LOGO}<span class="k">🏆 HALL OF FAME</span></div>
    <div class="row"><div class="med m${c.place >= 1 && c.place <= 3 ? c.place : 0}">${c.place >= 1 && c.place <= 3 ? `<small>JUARA</small><b>${c.place}</b>` : '<b>★</b>'}</div>
      <div><div class="aw${(c.cls || c.award).length > 22 ? ' sm' : ''}">${esc(c.cls || c.award)}</div><div class="ev">${c.cls ? esc(c.award) + ' · ' : ''}${esc(c.ev)}</div></div></div>
    <div class="car">${c.car ? `<div><span>MOBIL</span><b>${esc(c.car)}</b>${c.who ? ` <i>· ${esc(c.who)}</i>` : ''}</div>` : ''}${c.dealer ? `<div><span>DIPASANG OLEH</span><b>${esc(c.dealer)}</b></div>` : ''}</div>
    <div class="prods">${c.photos.map(p => `<img src="/${esc(p)}">`).join('')}${c.more ? `<span class="more">+${c.more} perangkat</span>` : ''}<span class="u">hub.concerto.id</span></div></div>`;
  if (c.t === 'a') return `<div class="c split" id="c"><div class="im"><img src="/${esc(c.img)}"></div><div class="in">
    <img class="lg" src="${LOGO_WHITE}"><div class="kk">Concerto Academy · #${c.no}</div><h1>${esc(c.title)}</h1>
    <div class="sub">Ilmu dari lapangan, bukan dari brosur.</div><div class="ft"><span style="font-size:18px;color:#9aa0ad">Gratis untuk dibaca</span><span class="u">hub.concerto.id</span></div></div></div>`;
  if (c.t === 'k') return `<div class="c split" id="c"><div class="im">${c.cover ? `<img src="/${esc(c.cover)}" style="object-position:left top">` : `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:160px">${c.icon}</span>`}</div><div class="in">
    <img class="lg" src="${LOGO_WHITE}"><div class="kk">Paket Audio · ${esc(c.seg)}</div><h1 style="font-size:40px">${esc(c.title)}</h1>
    <ul>${c.prods.slice(0, 4).map(p => `<li>${esc(p)}</li>`).join('')}</ul><div class="ft"><span style="font-size:18px;color:#9aa0ad">PDF paket di CAI Hub</span><span class="u">hub.concerto.id</span></div></div></div>`;
  if (c.t === 'd') return `<div class="c gold dl" id="c"><div class="top">${LOGO}<span class="k">AUTHORIZED DEALER</span></div>
    <div class="badge">Dealer Resmi Concerto Audio Indonesia <i>✓ Resmi</i></div><h1${c.name.length > 22 ? ' class="sm"' : ''}>${esc(c.name)}</h1>
    <div class="city">📍 ${esc([c.city, c.region].filter(Boolean).join(', '))}</div>${c.addr ? `<div class="addr">${esc(clip(c.addr, 110))}</div>` : ''}
    <div class="brands">Audiocircle · STEG · Zelos · Diosdela Musica · OG One Sound · Audio System</div>
    <div class="ft"><span style="font-size:18px;color:#9aa0ad">${c.ig ? 'Instagram @' + esc(c.ig) : 'Lihat kontak & lokasi di CAI Hub'}</span><span class="u">hub.concerto.id</span></div></div>`;
}
function pageHtml(it, imgUrl) {
  const url = `${SITE}/${it.kind}/${encodeURIComponent(it.id)}/`;
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>${esc(it.title)} · CAI Hub</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="description" content="${esc(it.desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="CAI Hub">
<meta property="og:locale" content="id_ID">
<meta property="og:title" content="${esc(it.title)}">
<meta property="og:description" content="${esc(it.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${imgUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(it.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(it.title)}">
<meta name="twitter:description" content="${esc(it.desc)}">
<meta name="twitter:image" content="${imgUrl}">
<link rel="icon" href="/favicon.ico">
<meta http-equiv="refresh" content="0; url=${esc(it.target)}">
<script>location.replace(${JSON.stringify(it.target)} + (location.search ? '&' + location.search.slice(1) : '') + location.hash);</script>
</head><body style="background:#07080a;color:#eceef2;font-family:sans-serif;text-align:center;padding:40px">
<p>Membuka CAI Hub…</p><p><a style="color:#d8b26a" href="${esc(it.target)}">${esc(it.title)}</a></p>
</body></html>
`;
}

/* ── Jalankan ── */
(async () => {
  // Sampul Paket Audio = halaman 1 PDF (pdftoppm)
  fs.mkdirSync(path.join(ROOT, 'share/img'), { recursive: true });
  for (const it of items.filter(x => x.kind === 'k' && x.card.file)) {
    const out = `share/img/k-${it.id}-cover`;
    if (ALL || !fs.existsSync(path.join(ROOT, out + '.jpg')) || fs.statSync(path.join(ROOT, it.card.file)).mtimeMs > fs.statSync(path.join(ROOT, out + '.jpg')).mtimeMs) {
      try { execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to', '900', '-jpeg', '-jpegopt', 'quality=82', path.join(ROOT, it.card.file), path.join(ROOT, out)]); }
      catch (e) { console.warn('pdftoppm gagal untuk', it.card.file, e.message); }
    }
    if (fs.existsSync(path.join(ROOT, out + '.jpg'))) it.card.cover = out + '.jpg';
  }
  const manPath = path.join(ROOT, 'share/manifest.json');
  const man = !ALL && fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : {};
  const next = {};
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    const ext = path.extname(f).toLowerCase();
    res.writeHead(200, { 'content-type': { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const { chromium } = require('playwright');
  const browser = await chromium.launch(); const pg = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await pg.goto(base + '/favicon.ico').catch(() => {});
  let drawn = 0;
  for (const it of items) {
    const key = `${it.kind}-${it.id}`, html = cardHtml(it.card);
    let fileHash = '';
    for (const m of html.matchAll(/src="\/([^"]+)"/g)) { const f = path.join(ROOT, m[1]); if (fs.existsSync(f)) fileHash += fs.statSync(f).size + ':' + Math.round(fs.statSync(f).mtimeMs / 1000); }
    const h = crypto.createHash('md5').update(html + fileHash).digest('hex').slice(0, 8);
    const img = path.join(ROOT, `share/img/${key}.jpg`);
    if (man[key] !== h || !fs.existsSync(img)) {
      await pg.setContent(`<!doctype html><html><head><base href="${base}/"><link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
      await pg.evaluate(() => document.fonts.ready);
      await (await pg.$('#c')).screenshot({ path: img, type: 'jpeg', quality: 84 });
      drawn++;
    }
    next[key] = h;
    const dir = path.join(ROOT, it.kind, it.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pageHtml(it, `${SITE}/share/img/${key}.jpg?v=${h}`));
  }
  // Hapus halaman & gambar item yang sudah tidak ada
  const keep = new Set(items.map(it => `${it.kind}/${it.id}`));
  for (const k of ['p', 'h', 'a', 'k', 'd']) {
    const d = path.join(ROOT, k); if (!fs.existsSync(d)) continue;
    for (const id of fs.readdirSync(d)) if (!keep.has(`${k}/${id}`)) { fs.rmSync(path.join(d, id), { recursive: true }); fs.rmSync(path.join(ROOT, `share/img/${k}-${id}.jpg`), { force: true }); }
  }
  fs.writeFileSync(manPath, JSON.stringify(next, null, 0) + '\n');
  await browser.close(); srv.close();
  console.log(`${items.length} item · ${drawn} kartu digambar ulang · ${items.length - drawn} tidak berubah`);
})().catch(e => { console.error(e); process.exit(1); });
