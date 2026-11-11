#!/usr/bin/env node
/* CAI Hub — HALAMAN UNTUK GOOGLE (Tahap 3, 4 Nov 2026, permintaan pemilik — pratinjau .mockup/tahap3/ disetujui).
   Portal adalah satu halaman JavaScript, jadi isinya sulit dibaca mesin pencari. Skrip ini membuat halaman statis berisi
   teks asli (bisa diindeks Google, BUKAN noindex & tanpa pengalihan otomatis):
     • /brand/<id>/          — produk per line + harga SRP            → tombol "Buka di CAI Hub" = /?brand=<id>
     • /kategori/<slug>/     — produk semua brand di kategori itu     → /?kat=<slug>
     • /partner/             — daftar provinsi & kota partner resmi
     • /partner/<slug>/      — partner per kota DAN per provinsi      → /?kota=<slug>
     • /mobil/ & /mobil/<slug>/ (Tahap 8 B) — contoh pemasangan per model mobil (Galeri + Hall of Fame) → /?mobil=<slug>
     • /hall-of-fame/ & /hall-of-fame/<event-tahun>/ (5 Nov 2026, pratinjau .mockup/seo-hof/) — hasil kompetisi dari HALL_OF_FAME:
       mobil juara, tabel per kelas, partner pemasang, JSON-LD Event  → /?hof=
     • /academy/ & /academy/<no>/ (5 Nov 2026, pratinjau .mockup/seo-academy/) — materi Concerto Academy: teks infografis disalin
       kata per kata (tools/data/academy-text.json) + gambar, Solusi Concerto → produk, JSON-LD Article  → /?acad=<no>
     • /produk/<id>/ (5 Nov 2026, pratinjau .mockup/seo-produk/) — halaman per produk: foto, spesifikasi, SRP, partner resmi per
       provinsi, prestasi Hall of Fame, sering dipasang bersama, produk serupa + JSON-LD Product (Offer = SRP)  → /?p=<id>
   lalu menulis ulang sitemap.xml (beranda + semua halaman ini; lastmod hanya berubah bila isi halaman berubah).
   Kartu partner di /partner/ memuat prestasi, instalasi & mobil yang dikerjakan + link profil /?partner=<slug>.
   Data Galeri dari tools/data/galeri.json (ditulis bot GitHub tools/gen-live-cards.js); workflow live-cards menjalankan skrip ini
   setelah kartu WA, jadi halaman mobil & partner ikut terbarui otomatis.
   Data: BRANDS dari katalog.js; partner dari tools/data/partners.json (salinan tabel Supabase auth_dealers — pilihan pemilik:
   diperbarui Claude setiap ada perubahan partner), cadangan AUTH_DEALERS di js/core.js bila file itu tidak ada.
   JALANKAN ULANG setiap produk/harga/foto atau daftar partner berubah:   node tools/gen-seo-pages.js
   Hanya SRP — jangan pernah menambah harga dealer/diskon. Tanpa klaim garansi. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://hub.concerto.id';
const ctx = require('./lib/katalog.js')();   // katalog.js + katalog-edit.js (Kelola Katalog portal)
const BRANDS = ctx.BRANDS;
let PARTNERS;
try { PARTNERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/data/partners.json'), 'utf8')).partners; }
catch (e) {
  const core = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8'), m = core.match(/const AUTH_DEALERS = (\[[\s\S]*?\n\]);/);
  PARTNERS = vm.runInNewContext('(' + m[1] + ')');
  console.log('⚠ tools/data/partners.json tidak ada — memakai AUTH_DEALERS di js/core.js');
}
// Klik WA/IG/Maps partner di halaman /partner/ ikut Laporan Minat Pengunjung (sumber "google"; RPC log_interest, ID browser sama
// dengan portal = localStorage cai-vid — domain sama). Key Supabase = publishable (publik, sama dengan js/stock.js).
const SUPA_URL = 'https://cvffltbxsaiugccexmtf.supabase.co', SUPA_KEY = 'sb_publishable_Y4AMvOdGfunEZhvvpsMzbg_NBbxNqGW';
const LOG_JS = `document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-k]');if(!a)return;var v;
try{v=localStorage.getItem('cai-vid');if(!v||v.length<8){v=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));localStorage.setItem('cai-vid',v);}}catch(x){return;}
fetch('${SUPA_URL}/rest/v1/rpc/log_interest',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',apikey:'${SUPA_KEY}',Authorization:'Bearer ${SUPA_KEY}'},
body:JSON.stringify({p_vid:v,p_kind:a.dataset.k,p_ref:a.dataset.n,p_src:'google'})}).catch(function(){});},true);`;
const shareSlug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtRp = n => 'Rp ' + Number(n).toLocaleString('id-ID');
const srp = p => {
  if (p.priceList) { const v = Object.values(p.priceList).filter(Number); return v.length ? 'mulai ' + fmtRp(Math.min(...v)) : ''; }
  return p.price ? fmtRp(p.price) + (p.priceUnit ? ' / ' + p.priceUnit : '') : '';
};
const photo = p => p.photo || p.photos?.[0] || '';
const abs = u => !u ? '' : /^https?:/.test(u) ? u : '/' + u.replace(/^\//, '');
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const CARS = require('./lib/cars-data.js');
let GALLERY = []; try { GALLERY = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/data/galeri.json'), 'utf8')).gallery || []; } catch (e) { console.log('ℹ tools/data/galeri.json belum ada — halaman mobil hanya dari Hall of Fame'); }
const CD = CARS.build(GALLERY, PARTNERS);
const medal = pl => ['🥇', '🥈', '🥉'][pl - 1] || '🏅';
const hofLine = e => `${medal(e.place)} ${e.place >= 1 && e.place <= 3 ? 'Juara ' + e.place : esc(e.award || 'Penghargaan')}${e.cls ? ' · ' + esc(e.cls) : ''}`;
// Sama dengan KAT_SLUGS di js/fav.js
const KAT = [
  { slug: 'speaker', cat: 'Speaker', h: 'Speaker Mobil', d: 'speaker komponen & coaxial' },
  { slug: 'subwoofer', cat: 'Subwoofer', h: 'Subwoofer Mobil', d: 'subwoofer pasif & aktif' },
  { slug: 'amplifier', cat: 'Amplifier', h: 'Power Amplifier Mobil', d: 'power amplifier mobil' },
  { slug: 'dsp', cat: 'DSP', h: 'DSP Audio Mobil', d: 'digital sound processor (DSP) & DSP amplifier' },
  { slug: 'tweeter', cat: 'Tweeter', h: 'Tweeter Mobil', d: 'tweeter' },
  { slug: 'midrange', cat: 'Midrange', h: 'Midrange Mobil', d: 'midrange' },
  { slug: 'kabel', cat: 'Cable', h: 'Kabel Audio Mobil', d: 'kabel RCA, power & speaker' },
  { slug: 'aksesoris', cat: 'Accessories', h: 'Aksesoris Audio Mobil', d: 'aksesoris & peredam' },
];
const BRAND_NAMES = BRANDS.map(b => b.name).join(', ').replace(/, ([^,]*)$/, ' & $1');

const CSS = `*{box-sizing:border-box}body{margin:0;background:#07080a;color:#eceef2;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.55}
a{color:inherit}.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;padding:12px 20px;background:rgba(9,10,13,.92);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.08)}
.top img{height:22px}.top span{flex:1;font:700 12px/1 Sora,sans-serif;letter-spacing:.14em;color:#d8b26a}
.btn{display:inline-block;background:#d8b26a;color:#111;border-radius:10px;padding:9px 14px;font:700 13.5px Inter,sans-serif;text-decoration:none;white-space:nowrap}
.btn.ghost{background:none;border:1px solid #d8b26a;color:#d8b26a}
main{max-width:1180px;margin:0 auto;padding:22px 20px 60px}
.bc{font-size:12.5px;color:#8b92a1}.bc a{color:#8b92a1;text-decoration:none}.bc a:hover{color:#d8b26a}
h1{font:800 clamp(26px,4.4vw,40px)/1.15 Sora,sans-serif;margin:10px 0 8px}h2{font:700 19px Sora,sans-serif;margin:28px 0 12px;display:flex;align-items:center;gap:10px}
h2 small{font:600 12px Inter;color:#8b92a1;border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:2px 9px}
.lead{color:#c6cad2;max-width:820px;margin:0 0 6px}.blogo{height:40px;margin:6px 0 4px;display:block}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:12px}
.card{display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:#111317;overflow:hidden;text-decoration:none}
.card:hover{border-color:#d8b26a}.card .ph{aspect-ratio:4/3;background:#fff;display:flex;align-items:center;justify-content:center}
.card .ph img{max-width:88%;max-height:88%;object-fit:contain}.card .ph span{font-size:46px}
.card .in{padding:10px 12px 12px;display:flex;flex-direction:column;gap:2px;flex:1}.card small{font:600 10.5px Inter;letter-spacing:.06em;color:#8b92a1;text-transform:uppercase}
.card b{font:700 14.5px Sora,sans-serif}.card .m{font-size:12px;color:#d8b26a;opacity:.85}.card .pr{margin-top:auto;padding-top:6px;font:700 14px Sora,sans-serif;color:#d8b26a}
.card .pr.no{font:500 12px Inter;color:#8b92a1}.soon{display:inline-block;margin-left:6px;background:#2f6bff;color:#fff;border-radius:5px;padding:1px 6px;font:700 9.5px Inter;letter-spacing:.06em;vertical-align:2px}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chips a{border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:6px 12px;font-size:13px;text-decoration:none;color:#cfd3da}.chips a:hover{border-color:#d8b26a;color:#d8b26a}
.pl{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.pt{border:1px solid rgba(255,255,255,.09);border-radius:14px;background:#111317;padding:14px 16px}.pt b{display:block;font:700 16px Sora,sans-serif}
.pt .c{color:#8b92a1;font-size:13px;margin:2px 0 6px}.pt .a{font-size:13.5px;color:#cfd3da}.pt .ok{color:#52c38a;font:600 11.5px Inter;margin-left:6px}
.pt .bt{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.pt .bt a{border:1px solid rgba(255,255,255,.14);border-radius:9px;padding:6px 11px;font:600 12.5px Inter;text-decoration:none}
.pt .bt a.wa{background:#1f9d55;border-color:#1f9d55;color:#fff}
.pt .x{margin-top:8px;font-size:13px;color:#e9c98a}.pt .x a{color:#e9c98a}
.st{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0 4px}.st span{border:1px solid rgba(216,178,106,.35);border-radius:12px;padding:8px 14px;font:600 13px Inter;color:#cfd3da}.st b{font:800 20px Sora;color:#d8b26a;margin-right:6px}
.hl{list-style:none;padding:0;margin:0;display:grid;gap:8px}.hl li{border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#111317;padding:10px 14px;font-size:14px}.hl li small{display:block;color:#8b92a1;font-size:12.5px}
.cta{margin-top:34px;border:1px solid rgba(216,178,106,.4);border-radius:16px;padding:18px;background:linear-gradient(160deg,rgba(216,178,106,.12),rgba(216,178,106,.02));display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.cta p{margin:0;max-width:640px;color:#d6d9df}
footer{border-top:1px solid rgba(255,255,255,.08);padding:20px;text-align:center;color:#8b92a1;font-size:12.5px}
@media(max-width:560px){.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.top span{display:none}main{padding:16px 14px 50px}}`;

function page({ url, title, desc, crumbs, open, body, log, ld2, css2, img }) {
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1] })) };
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="CAI Hub">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${url}"><meta property="og:image" content="${img ? esc(img) : SITE + '/assets/og-cover.jpg'}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>${ld2 ? `\n<script type="application/ld+json">${JSON.stringify(ld2).replace(/</g, '\\u003c')}</script>` : ''}
<style>${CSS}${css2 || ''}</style></head><body>
<header class="top"><a href="/"><img src="/assets/intro/logo-white.png" alt="CAI — Concerto Audio Indonesia"></a><span>CAI HUB</span><a class="btn" href="${esc(open)}">Buka di CAI Hub ›</a></header>
<main><nav class="bc">${crumbs.map((c, i) => i < crumbs.length - 1 ? `<a href="${esc(c[1])}">${esc(c[0])}</a>` : esc(c[0])).join(' › ')}</nav>
${body}
<div class="cta"><p><b>Cari partner resmi terdekat?</b> Beli &amp; pasang produk resmi Concerto Audio Indonesia di partner resmi di kota Anda.</p><a class="btn ghost" href="/partner/">Partner resmi per kota ›</a></div>
</main>${log ? `<script>${LOG_JS}</script>` : ''}<footer>© ${today.slice(0, 4)} Concerto Audio Indonesia · <a href="/">hub.concerto.id</a> · Harga = SRP (harga jual resmi yang disarankan)</footer>
</body></html>`;
}
const card = (b, p) => `<a class="card" href="/produk/${encodeURIComponent(p.id)}/"><div class="ph">${photo(p) ? `<img src="${esc(abs(photo(p)))}" alt="${esc(b.name + ' ' + p.name)}" loading="lazy">` : `<span>${p.emoji || '🔊'}</span>`}</div>
  <div class="in"><small>${esc(b.name)} · ${esc(p.category)}</small><b>${esc(p.name)}${p.soon ? '<span class="soon">COMING SOON</span>' : ''}</b>${p.model && p.model !== p.name ? `<span class="m">${esc(p.model)}</span>` : ''}
  ${srp(p) ? `<span class="pr">${esc(srp(p))}</span>` : '<span class="pr no">Harga: hubungi partner resmi</span>'}</div></a>`;
const brandChips = cur => `<div class="chips">${BRANDS.filter(b => b.id !== cur).map(b => `<a href="/brand/${b.id}/">${esc(b.name)}</a>`).join('')}</div>`;
const katChips = cur => `<div class="chips">${KAT.filter(k => k.slug !== cur && count(k.cat)).map(k => `<a href="/kategori/${k.slug}/">${esc(k.h)}</a>`).join('')}</div>`;
const allProds = BRANDS.flatMap(b => b.lines.flatMap(l => l.products.map(p => ({ b, l, p }))));
const count = cat => allProds.filter(x => x.p.category === cat).length;

const pages = [];   // { dir, html, url }
// ── Brand ──
for (const b of BRANDS) {
  const ps = b.lines.flatMap(l => l.products), cats = [...new Set(ps.map(p => p.category))];
  const url = `/brand/${b.id}/`;
  const body = `<h1>${esc(b.name)} — Katalog Resmi</h1>${b.logo ? `<img class="blogo" src="${esc(abs(b.logo))}" alt="Logo ${esc(b.name)}">` : ''}
    <p class="lead">${esc(b.desc || b.tagline || '')}</p><p class="lead">${ps.length} produk resmi ${esc(b.name)} (${esc(cats.join(', '))}) yang didistribusikan Concerto Audio Indonesia — spesifikasi lengkap & harga SRP.</p>
    ${b.lines.filter(l => l.products.length).map(l => `<h2>${esc(l.name)} <small>${l.products.length}</small></h2><div class="grid">${l.products.map(p => card(b, p)).join('')}</div>`).join('')}
    <h2>Brand resmi lainnya</h2>${brandChips(b.id)}<h2>Kategori</h2>${katChips('')}`;
  pages.push({ url, html: page({ url, title: `${b.name} — Katalog Resmi ${cats.slice(0, 3).join(', ')} | CAI Hub`,
    desc: `${ps.length} produk ${b.name} resmi: ${cats.join(', ').toLowerCase()} — spesifikasi lengkap & harga SRP. Distributor resmi Concerto Audio Indonesia.`,
    crumbs: [['CAI Hub', '/'], ['Brand', '/brand/' + b.id + '/'], [b.name, url]], open: `/?brand=${b.id}`, body }) });
}
// ── Kategori ──
for (const k of KAT) {
  const xs = allProds.filter(x => x.p.category === k.cat); if (!xs.length) continue;
  const bs = BRANDS.filter(b => xs.some(x => x.b === b)), url = `/kategori/${k.slug}/`;
  const body = `<h1>${esc(k.h)} — Katalog Resmi</h1><p class="lead">${xs.length} ${esc(k.d)} resmi dari ${bs.length} brand (${esc(bs.map(b => b.name).join(', '))}) — spesifikasi lengkap & harga SRP. Bandingkan berdampingan & cari partner pemasang terdekat di CAI Hub.</p>
    ${bs.map(b => { const ps = xs.filter(x => x.b === b); return `<h2>${esc(b.name)} <small>${ps.length}</small></h2><div class="grid">${ps.map(x => card(b, x.p)).join('')}</div>`; }).join('')}
    <h2>Kategori lainnya</h2>${katChips(k.slug)}<h2>Brand resmi</h2>${brandChips('')}`;
  pages.push({ url, html: page({ url, title: `${k.h} — Katalog Resmi ${bs.length} Brand | CAI Hub`,
    desc: `${xs.length} ${k.d} resmi dari ${bs.map(b => b.name).join(', ')} — spesifikasi & harga SRP, cari partner pemasang terdekat.`,
    crumbs: [['CAI Hub', '/'], ['Kategori', url], [k.h, url]], open: `/?kat=${k.slug}`, body }) });
}
// ── Partner ──
const ptx = d => { const x = CD.partnerData(d); return (x.hof.length || x.gl.length) ? `<div class="x">${x.hof.length ? `🏆 ${x.hof.length} prestasi kompetisi${x.j1 ? ` (${x.j1} Juara 1)` : ''}` : ''}${x.hof.length && x.gl.length ? ' · ' : ''}${x.gl.length ? `${x.gl.length} instalasi di Galeri` : ''}${x.cars.length && CARS.CARS_ON ? `<br>Mobil: ${x.cars.slice(0, 5).map(c => `<a href="/mobil/${c.slug}/">${esc(c.name)}</a>`).join(', ')}` : ''}</div>` : ''; };
const pt = d => `<div class="pt"><b>${esc(d.n)}<span class="ok">✓ Partner resmi</span></b><div class="c">📍 ${esc([d.c, d.r].filter(Boolean).join(', '))}</div>${d.a ? `<div class="a">${esc(d.a)}</div>` : ''}${ptx(d)}
  <div class="bt">${d.wa ? `<a class="wa" data-k="wa" data-n="${esc(d.n)}" href="https://wa.me/${esc(d.wa)}?text=${encodeURIComponent(`Halo ${d.n}, saya dapat info dari CAI Hub (Concerto Audio Indonesia). Saya ingin bertanya tentang produk Concerto Audio Indonesia.`)}" rel="nofollow">WhatsApp</a>` : ''}
  ${d.ig ? `<a data-k="ig" data-n="${esc(d.n)}" href="https://www.instagram.com/${encodeURIComponent(d.ig)}/" rel="nofollow">Instagram</a>` : ''}
  <a data-k="maps" data-n="${esc(d.n)}" href="${esc(d.map || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([d.n, d.a, d.c].filter(Boolean).join(', ')))}" rel="nofollow">Maps</a>
  <a href="/?partner=${CARS.shareSlug(d.n)}">Profil di CAI Hub ›</a></div></div>`;
const provs = [...new Set(PARTNERS.map(d => d.r))];
const cities = [...new Set(PARTNERS.map(d => d.c).filter(Boolean))];
const citySlug = c => shareSlug(c), provSlug = r => shareSlug(r);
const used = new Set(cities.map(citySlug));
const provUrl = r => `/partner/${used.has(provSlug(r)) ? 'provinsi-' + provSlug(r) : provSlug(r)}/`;
pages.push({ url: '/partner/', html: page({ url: '/partner/', title: `Partner Car Audio Resmi di ${provs.length} Provinsi | CAI Hub`,
  desc: `${PARTNERS.length} partner resmi Concerto Audio Indonesia di ${cities.length} kota — beli & pasang ${BRAND_NAMES}.`,
  crumbs: [['CAI Hub', '/'], ['Partner resmi', '/partner/']], open: '/?kota=semua',
  body: `<h1>Partner Car Audio Resmi Concerto Audio Indonesia</h1><p class="lead">${PARTNERS.length} partner resmi di ${cities.length} kota, ${provs.length} provinsi — beli & pasang produk ${esc(BRAND_NAMES)}.</p>
  ${provs.map(r => { const cs = [...new Set(PARTNERS.filter(d => d.r === r).map(d => d.c).filter(Boolean))];
    return `<h2><a href="${provUrl(r)}" style="text-decoration:none">${esc(r)}</a> <small>${PARTNERS.filter(d => d.r === r).length}</small></h2><div class="chips">${cs.map(c => `<a href="/partner/${citySlug(c)}/">${esc(c)} (${PARTNERS.filter(d => d.c === c).length})</a>`).join('')}</div>`; }).join('')}` }) });
for (const r of provs) {
  const ds = PARTNERS.filter(d => d.r === r), url = provUrl(r);
  pages.push({ url, html: page({ url, title: `Partner Car Audio Resmi di ${r} | CAI Hub`,
    desc: `${ds.length} partner resmi Concerto Audio Indonesia di ${r}: ${ds.slice(0, 6).map(d => d.n).join(', ')}${ds.length > 6 ? ' dan lainnya' : ''} — alamat, WhatsApp & Maps.`,
    crumbs: [['CAI Hub', '/'], ['Partner resmi', '/partner/'], [r, url]], open: `/?kota=${provSlug(r)}`, log: true,
    body: `<h1>Partner Car Audio Resmi di ${esc(r)}</h1><p class="lead">${ds.length} partner resmi Concerto Audio Indonesia — beli & pasang produk ${esc(BRAND_NAMES)}.</p>
      <div class="pl">${ds.map(pt).join('')}</div>` }) });
}
for (const c of cities) {
  const ds = PARTNERS.filter(d => d.c === c), r = ds[0].r, url = `/partner/${citySlug(c)}/`;
  const near = [...new Set(PARTNERS.filter(d => d.r === r && d.c !== c).map(d => d.c).filter(Boolean))];
  pages.push({ url, html: page({ url, title: `Partner Car Audio Resmi di ${c} | CAI Hub`,
    desc: `${ds.length} partner resmi Concerto Audio Indonesia di ${c}: ${ds.map(d => d.n).join(', ')} — alamat, WhatsApp & Maps.`,
    crumbs: [['CAI Hub', '/'], ['Partner resmi', '/partner/'], [r, provUrl(r)], [c, url]], open: `/?kota=${citySlug(c)}`, log: true,
    body: `<h1>Partner Car Audio Resmi di ${esc(c)}</h1><p class="lead">${ds.length} partner resmi Concerto Audio Indonesia di ${esc(c)}, ${esc(r)} — beli & pasang produk ${esc(BRAND_NAMES)}.</p>
      <div class="pl">${ds.map(pt).join('')}</div>${near.length ? `<h2>Kota lain di ${esc(r)}</h2><div class="chips">${near.map(x => `<a href="/partner/${citySlug(x)}/">${esc(x)}</a>`).join('')}</div>` : ''}` }) });
}

// ── Mobil (Tahap 8 B) ──
const glName = g => [g.car_make, g.car_model, g.car_year].filter(Boolean).join(' ');
for (const c of CARS.CARS_ON ? CD.cars : []) {
  const url = `/mobil/${c.slug}/`, ps = c.products.map(id => CARS.prod(id)).filter(Boolean);
  const parts = c.partners.filter(d => d.r || d.c);
  const brandsUsed = [...new Set(ps.map(x => x.b.name))];
  const body = `<h1>Audio Mobil ${esc(c.name)} — Contoh Pemasangan &amp; Partner Resmi</h1>
    <p class="lead">${c.cars} mobil ${esc(c.name)} dikerjakan partner resmi Concerto Audio Indonesia${c.wins ? `, dengan ${c.wins} prestasi kompetisi` : ''}${brandsUsed.length ? ` — memakai perangkat ${esc(brandsUsed.join(', '))}` : ''}.</p>
    <div class="st"><span><b>${c.cars}</b>mobil</span><span><b>${c.wins}</b>prestasi</span><span><b>${c.partners.length}</b>partner</span></div>
    ${c.hof.length ? `<h2>Prestasi kompetisi ${esc(c.name)} <small>${c.hof.length}</small></h2><ul class="hl">${c.hof.map(e => `<li>${hofLine(e)}<small>${esc([e.event, e.city, e.year, e.name, e.dealer].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>` : ''}
    ${c.gl.length ? `<h2>Contoh pemasangan di Galeri <small>${c.gl.length}</small></h2><ul class="hl">${c.gl.map(g => `<li><a href="/?gl=${encodeURIComponent(g.id)}">${esc(glName(g))}</a><small>Dipasang oleh ${esc(g.dealer || 'partner resmi')}${g.city ? ' · ' + esc(g.city) : ''} · ${(g.products || []).length} produk CAI · ${(g.photos || []).length} foto/video</small></li>`).join('')}</ul>` : ''}
    ${ps.length ? `<h2>Perangkat yang dipasang di ${esc(c.name)} <small>${ps.length}</small></h2><div class="grid">${ps.slice(0, 16).map(x => card(x.b, x.p)).join('')}</div>` : ''}
    ${parts.length ? `<h2>Partner resmi yang pernah mengerjakan</h2><div class="pl">${parts.map(pt).join('')}</div>` : ''}
    <h2>Mobil lainnya</h2><div class="chips">${CD.cars.filter(x => x !== c).slice(0, 24).map(x => `<a href="/mobil/${x.slug}/">${esc(x.name)}</a>`).join('')}</div>`;
  pages.push({ url, html: page({ url, title: `Audio Mobil ${c.name} — Contoh Pemasangan & Partner Resmi | CAI Hub`,
    desc: `${c.cars} contoh pemasangan sistem audio di ${c.name} oleh partner resmi Concerto Audio Indonesia${c.wins ? ` · ${c.wins} prestasi kompetisi` : ''}${brandsUsed.length ? ` · perangkat ${brandsUsed.join(', ')}` : ''}.`,
    crumbs: [['CAI Hub', '/'], ['Cari per mobil', '/mobil/'], [c.name, url]], open: `/?mobil=${c.slug}`, log: true, body }) });
}
if (CARS.CARS_ON && CD.cars.length) {
  const makes = [...new Set(CD.cars.map(c => c.make))].sort();
  pages.push({ url: '/mobil/', html: page({ url: '/mobil/', title: `Audio Mobil per Model — ${CD.cars.length} Contoh Pemasangan Partner Resmi | CAI Hub`,
    desc: `Contoh pemasangan sistem audio di ${CD.cars.length} model mobil (${makes.slice(0, 8).join(', ')}…) oleh partner resmi Concerto Audio Indonesia — prestasi, perangkat & partner.`,
    crumbs: [['CAI Hub', '/'], ['Cari per mobil', '/mobil/']], open: '/?mobil=',
    body: `<h1>Audio Mobil per Model — Contoh Pemasangan Partner Resmi</h1><p class="lead">${CD.cars.length} model mobil dengan contoh pemasangan sistem audio oleh partner resmi Concerto Audio Indonesia — lihat prestasi kompetisi, perangkat yang dipakai & partner yang mengerjakan.</p>
      ${makes.map(m => `<h2>${esc(m)}</h2><div class="chips">${CD.cars.filter(c => c.make === m).map(c => `<a href="/mobil/${c.slug}/">${esc(c.name)}${c.wins ? ' · 🏆 ' + c.wins : ''}</a>`).join('')}</div>`).join('')}` }) });
}

// ── Produk (5 Nov 2026, permintaan pemilik — pratinjau .mockup/seo-produk/ disetujui) ──
// Satu halaman per produk yang BISA diindeks (beda dengan /p/<id>/ = kartu WA noindex). Hanya SRP; tanpa klaim garansi.
const HOF = CARS.HALL_OF_FAME || [];
const PCSS = `.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:26px;margin-top:14px;align-items:start}
.gal{display:grid;gap:10px}.gal .main{aspect-ratio:4/3;background:#fff;border-radius:16px;display:flex;align-items:center;justify-content:center;overflow:hidden}.gal .main img{max-width:90%;max-height:90%;object-fit:contain}.gal .main span{font-size:90px}
.gal .th{display:flex;gap:8px;flex-wrap:wrap}.gal .th button{width:68px;aspect-ratio:1;background:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;border:2px solid transparent;padding:0;cursor:pointer}.gal .th button.on{border-color:#d8b26a}.gal .th img{max-width:86%;max-height:86%}
.kick{font:700 11.5px Sora,sans-serif;letter-spacing:.14em;color:#d8b26a;text-transform:uppercase}
.price{margin:14px 0 4px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.price b{font:800 30px Sora,sans-serif;color:#d8b26a}.price small{color:#8b92a1;font-size:12.5px}.price b.no{font:600 16px Inter;color:#cfd3da}
.plist{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.plist span{border:1px solid rgba(216,178,106,.35);border-radius:10px;padding:6px 11px;font-size:13px}.plist b{color:#d8b26a}
.ok2{color:#52c38a;font:600 12.5px Inter;margin:6px 0 14px}.acts{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 6px}
.sp{width:100%;border-collapse:collapse;font-size:14px;border:1px solid rgba(255,255,255,.09)}.sp td{padding:9px 14px;border-bottom:1px solid rgba(255,255,255,.07);vertical-align:top}.sp td:first-child{color:#8b92a1;width:42%}.sp tr:nth-child(odd) td{background:#0e1014}
.prov{display:grid;gap:8px}.prov details{border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#111317}.prov summary{cursor:pointer;padding:11px 14px;font:600 14px Inter;display:flex;justify-content:space-between;gap:10px}.prov summary small{color:#8b92a1;font-weight:500}.prov .pl{padding:0 12px 12px}
.why{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.why div{border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#111317;padding:12px 14px;font-size:13px;color:#cfd3da}.why b{display:block;font:700 14px Sora,sans-serif;color:#eceef2;margin-bottom:2px}
@media(max-width:820px){.hero{grid-template-columns:1fr}.why{grid-template-columns:1fr}}`;
const katOf = cat => KAT.find(k => k.cat === cat);
const photos = p => [...new Set([p.photo, ...(p.photos || [])].filter(Boolean))];
const priceN = p => p.priceList ? Math.min(...Object.values(p.priceList).filter(Number)) : (p.price || 0);
// 3 angka utama dari spesifikasi (urut prioritas kunci)
const KEY_SPEC = [/^rms|rms power|^power|output|daya/i, /^size|ukuran|diameter$/i, /channel/i, /freq/i, /impedan/i, /sensitiv/i];
function keySpecs(p) {
  const e = Object.entries(p.specs || {}).filter(([, v]) => String(v).length <= 18), out = [];
  for (const re of KEY_SPEC) { const f = e.find(([k]) => re.test(k) && !out.some(o => o[0] === k)); if (f) out.push(f); if (out.length === 3) break; }
  return out;
}
// Instalasi nyata (Galeri tayang + Hall of Fame ber-products), daftar perangkat identik dihitung sekali — sama dengan coInstalls() portal
const INSTALLS = (() => { const seen = new Set(), out = [];
  for (const l of [...GALLERY.map(g => g.products || []), ...HOF.map(e => e.products || [])]) { if (!l.length) continue; const k = [...l].sort().join('|'); if (seen.has(k)) continue; seen.add(k); out.push(l); }
  return out; })();
const hofForProd = (b, l, p) => HOF.filter(e => (e.products || []).includes(p.id) || (e.brand === b.id && e.line === l.name && !(e.products || []).length));
const ptP = (d, b, p) => `<div class="pt"><b>${esc(d.n)}<span class="ok">✓ Partner resmi</span></b><div class="c">📍 ${esc([d.c, d.r].filter(Boolean).join(', '))}</div>${d.a ? `<div class="a">${esc(d.a)}</div>` : ''}${ptx(d)}
  <div class="bt">${d.wa ? `<a class="wa" data-k="wa" data-n="${esc(d.n)}" href="https://wa.me/${esc(d.wa)}?text=${encodeURIComponent(`Halo ${d.n}, saya dapat info dari CAI Hub (Concerto Audio Indonesia). Saya ingin bertanya tentang ${b.name} ${p.name}.`)}" rel="nofollow">💬 Tanya ${esc(p.name)} via WhatsApp</a>` : ''}
  <a data-k="maps" data-n="${esc(d.n)}" href="${esc(d.map || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([d.n, d.a, d.c].filter(Boolean).join(', ')))}" rel="nofollow">Maps</a>
  <a href="/?partner=${CARS.shareSlug(d.n)}">Profil ›</a></div></div>`;
const PROVS_SORTED = [...provs].sort((a, c) => PARTNERS.filter(d => d.r === c).length - PARTNERS.filter(d => d.r === a).length || a.localeCompare(c));
for (const { b, l, p } of allProds) {
  const url = `/produk/${encodeURIComponent(p.id)}/`, full = `${b.name} ${p.name}`, k = katOf(p.category), ph = photos(p), ks = keySpecs(p), pr = srp(p);
  // sering dipasang bersama
  const mine = INSTALLS.filter(x => x.includes(p.id)), cnt = new Map();
  if (mine.length >= 2) for (const x of mine) for (const id of new Set(x)) if (id !== p.id) cnt.set(id, (cnt.get(id) || 0) + 1);
  const co = [...cnt.entries()].filter(([, n]) => n >= 2).sort((a, c) => c[1] - a[1]).slice(0, 6).map(([id, n]) => ({ x: CARS.prod(id), n })).filter(o => o.x);
  // produk serupa: kategori sama, seri lain, SRP ±50% (tanpa SRP: kategori sama), urut SRP terdekat
  const pn = priceN(p), coIds = new Set(co.map(o => o.x.p.id));
  const sim = allProds.filter(x => x.p.category === p.category && x.l !== l && !coIds.has(x.p.id) && x.p.id !== p.id && (!pn || !priceN(x.p) || (priceN(x.p) >= pn * .5 && priceN(x.p) <= pn * 1.5)))
    .sort((a, c) => Math.abs((priceN(a.p) || 9e9) - pn) - Math.abs((priceN(c.p) || 9e9) - pn)).slice(0, 4);
  const hof = hofForProd(b, l, p).sort((a, c) => (a.place || 9) - (c.place || 9));
  const plist = p.priceList ? `<div class="plist">${Object.entries(p.priceList).filter(([, v]) => Number(v)).map(([k2, v]) => `<span>${esc(k2)} · <b>${esc(fmtRp(v))}</b></span>`).join('')}</div>` : '';
  const body = `<div class="hero"><div class="gal"><div class="main">${ph.length ? `<img id="pm" src="${esc(abs(ph[0]))}" alt="${esc(full)}">` : `<span>${p.emoji || '🔊'}</span>`}</div>
    ${ph.length > 1 ? `<div class="th">${ph.map((u, i) => `<button class="${i ? '' : 'on'}" onclick="document.getElementById('pm').src='${esc(abs(u))}';[...this.parentNode.children].forEach(x=>x.classList.toggle('on',x===this))" aria-label="Foto ${i + 1}"><img src="${esc(abs(u))}" alt="${esc(full)} foto ${i + 1}" loading="lazy"></button>`).join('')}</div>` : ''}</div>
    <div>${b.logo ? `<img class="blogo" src="${esc(abs(b.logo))}" alt="${esc(b.name)}">` : ''}<div class="kick">${esc(p.category)} · ${esc(l.name)}</div>
    <h1>${esc(full)}${p.soon ? '<span class="soon">COMING SOON</span>' : ''}</h1>${p.model && p.model !== p.name ? `<div class="kick" style="color:#cfd3da">Model ${esc(p.model)}</div>` : ''}
    <p class="lead">${esc(p.desc || '')}${p.desc ? ' ' : ''}Produk resmi distributor Concerto Audio Indonesia.</p>
    <div class="price">${pr ? `<b>${esc(pr)}</b><small>SRP · harga jual resmi yang disarankan</small>` : '<b class="no">Harga: hubungi partner resmi</b>'}</div>${plist}
    <div class="ok2">✓ Produk resmi CAI · spesifikasi &amp; harga resmi</div>
    <div class="acts"><a class="btn" href="/?p=${encodeURIComponent(p.id)}">Lihat foto, video &amp; stok di CAI Hub ›</a><a class="btn ghost" href="#partner">📍 Partner resmi</a><a class="btn ghost" href="/?rk=${encodeURIComponent(p.id)}*1">🔧 Rakit sistem</a></div>
    ${ks.length ? `<div class="st">${ks.map(([k2, v]) => `<span><b>${esc(v)}</b>${esc(k2)}</span>`).join('')}</div>` : ''}</div></div>
    ${Object.keys(p.specs || {}).length ? `<h2>Spesifikasi ${esc(full)}</h2><table class="sp">${Object.entries(p.specs).map(([k2, v]) => `<tr><td>${esc(k2)}</td><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}
    <h2 id="partner">Beli &amp; pasang di partner resmi <small>${PARTNERS.length} partner · ${provs.length} provinsi</small></h2>
    <div class="prov">${PROVS_SORTED.map((r, ri) => { const ds = PARTNERS.filter(d => d.r === r); return `<details${ri ? "" : " open"}><summary>${esc(r)} <small>${ds.length} partner</small></summary><div class="pl">${ds.map(d => ptP(d, b, p)).join('')}</div></details>`; }).join('')}</div>
    ${hof.length ? `<h2>🏆 Prestasi kompetisi <small>${hof.length}</small></h2><ul class="hl">${hof.slice(0, 8).map(e => `<li>${hofLine(e)}<small>${esc([e.event, e.city, e.year, e.car, e.dealer].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>` : ''}
    ${co.length ? `<h2>🔧 Sering dipasang bersama ${esc(p.name)} <small>dari ${mine.length} instalasi nyata</small></h2><div class="grid">${co.map(o => card(o.x.b, o.x.p)).join('')}</div>` : ''}
    ${sim.length ? `<h2>Produk serupa</h2><div class="grid">${sim.map(x => card(x.b, x.p)).join('')}</div>` : ''}
    <h2>Lainnya dari ${esc(b.name)} ${esc(l.name)}</h2><div class="grid">${l.products.filter(x => x !== p).slice(0, 8).map(x => card(b, x)).join('') || '<p class="lead">—</p>'}</div>
    <h2>Kenapa beli di partner resmi CAI?</h2><div class="why"><div><b>Produk resmi</b>Didistribusikan langsung oleh Concerto Audio Indonesia.</div><div><b>Harga SRP transparan</b>Harga jual resmi yang disarankan untuk semua partner.</div><div><b>Dipasang partner terdaftar</b>Partner resmi yang terdaftar di CAI Hub.</div></div>
    <h2>Brand &amp; kategori</h2>${brandChips('')}<div style="height:8px"></div>${katChips('')}`;
  const spTxt = ks.map(([, v]) => v).join(', ');
  const desc = `${p.desc ? p.desc.replace(/\s+/g, ' ').replace(/\.$/, '') + '. ' : ''}${spTxt ? spTxt + '. ' : ''}${pr ? 'Harga SRP ' + pr + '. ' : ''}Beli & pasang di ${PARTNERS.length} partner resmi Concerto Audio Indonesia di ${provs.length} provinsi.`.slice(0, 300);
  const offers = p.priceList ? { '@type': 'AggregateOffer', priceCurrency: 'IDR', lowPrice: Math.min(...Object.values(p.priceList).filter(Number)), highPrice: Math.max(...Object.values(p.priceList).filter(Number)), offerCount: Object.values(p.priceList).filter(Number).length }
    : p.price ? { '@type': 'Offer', priceCurrency: 'IDR', price: p.price } : null;
  if (offers) Object.assign(offers, { url: SITE + url, availability: p.soon ? 'https://schema.org/PreOrder' : 'https://schema.org/InStoreOnly', itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: 'Concerto Audio Indonesia' } });
  const ld2 = { '@context': 'https://schema.org', '@type': 'Product', name: full, sku: p.id, ...(p.model ? { mpn: p.model } : {}), brand: { '@type': 'Brand', name: b.name },
    category: p.category, description: (p.desc || full) + ' — produk resmi distributor Concerto Audio Indonesia.', url: SITE + url,
    ...(ph.length ? { image: ph.map(u => SITE + abs(u)) } : {}), ...(offers ? { offers } : {}),
    ...(Object.keys(p.specs || {}).length ? { additionalProperty: Object.entries(p.specs).slice(0, 20).map(([n, v]) => ({ '@type': 'PropertyValue', name: n, value: String(v) })) } : {}) };
  pages.push({ url, html: page({ url, title: `${full} — ${p.category}${ks.find(([k2]) => /size|ukuran/i.test(k2)) ? ' ' + ks.find(([k2]) => /size|ukuran/i.test(k2))[1] : ''} · Spesifikasi & Harga SRP | CAI Hub`, desc,
    crumbs: [['CAI Hub', '/'], [b.name, `/brand/${b.id}/`], ...(k ? [[k.h, `/kategori/${k.slug}/`]] : []), [p.name, url]], open: `/?p=${encodeURIComponent(p.id)}`, log: true,
    ld2, css2: PCSS, img: ph.length ? SITE + abs(ph[0]) : '', body }) });
}

// ── Hall of Fame (5 Nov 2026, permintaan pemilik — pratinjau .mockup/seo-hof/ disetujui) ──
// /hall-of-fame/ + /hall-of-fame/<event-tahun>/ : hasil kompetisi ASLI dari HALL_OF_FAME (katalog.js) — kelas, juara, peserta, mobil,
// partner pemasang; foto mobil HANYA sampul kartu WA pilihan Editor (aman plat nomor). Tanpa harga.
const HCSS = `.kick{font:700 11.5px Sora,sans-serif;letter-spacing:.14em;color:#d8b26a;text-transform:uppercase}
.ev{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:26px;align-items:start}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 6px}.meta span{border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:5px 12px;font-size:13px;color:#cfd3da}
table.res{width:100%;border-collapse:collapse;font-size:14px;border:1px solid rgba(255,255,255,.09)}
.res th{text-align:left;font:600 11px Inter;letter-spacing:.08em;text-transform:uppercase;color:#8b92a1;padding:10px 12px;background:#0e1014;border-bottom:1px solid rgba(255,255,255,.08)}
.res td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top}.res td small{display:block;color:#8b92a1;font-size:12px;margin-top:2px}
.res a{color:#e9c98a;text-decoration:none}.res a:hover{text-decoration:underline}.res .gl{display:inline-block;margin-top:4px;font:600 11.5px Inter;border:1px solid rgba(216,178,106,.5);border-radius:8px;padding:2px 7px;color:#d8b26a}
.res tr.cl td{background:#141109;font:700 13px Sora,sans-serif;color:#d8b26a;padding:8px 12px}
.side .bx{border:1px solid rgba(255,255,255,.09);border-radius:14px;background:#111317;padding:14px 16px;margin-bottom:14px}.side h3{margin:0 0 10px;font:700 15px Sora,sans-serif}
.rk{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 0;border-top:1px solid rgba(255,255,255,.06);font-size:13.5px}.rk:first-of-type{border-top:0}.rk i{font-style:normal;color:#8b92a1;font:700 12px Sora,sans-serif}.rk a{text-decoration:none}.rk em{font-style:normal;font-size:12.5px;color:#d8b26a;white-space:nowrap}
.cars{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.cr{border:1px solid rgba(255,255,255,.09);border-radius:14px;background:#111317;overflow:hidden;text-decoration:none;display:block}.cr:hover{border-color:#d8b26a}
.cr .ph{aspect-ratio:16/9;background:linear-gradient(135deg,#1b1e24,#0f1115);display:flex;align-items:center;justify-content:center;font-size:40px;position:relative;overflow:hidden}.cr .ph img{width:100%;height:100%;object-fit:cover}.cr .ph b{position:absolute;left:10px;top:10px;font:700 11px Inter;background:#d8b26a;color:#111;border-radius:6px;padding:2px 7px}
.cr .in{padding:10px 12px}.cr .in b{display:block;font:700 15px Sora,sans-serif}.cr .in small{color:#8b92a1;font-size:12.5px}.cr .in em{display:block;font-style:normal;color:#e9c98a;font-size:12.5px;margin-top:4px}
.evc{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}.evc a{border:1px solid rgba(216,178,106,.4);border-radius:16px;background:linear-gradient(160deg,rgba(216,178,106,.12),rgba(216,178,106,.02));padding:16px 18px;text-decoration:none;display:block}
.evc b{display:block;font:800 20px Sora,sans-serif}.evc small{color:#aab0bc;font-size:13px}.evc .m{margin-top:10px;font-size:14px}
@media(max-width:900px){.ev{grid-template-columns:1fr}.res th:nth-child(4),.res td:nth-child(4){display:none}}`;
const STORE = SUPA_URL + '/storage/v1/object/public/showcase/';
const HOF_ALL = HOF.filter(e => e.event && e.year);
const hofEvKey = e => `${e.event} ${e.year}`;
const hofEvUrl = e => `/hall-of-fame/${shareSlug(hofEvKey(e))}/`;
const hofEvents = [...new Map(HOF_ALL.map(e => [hofEvKey(e), e])).values()];
const HMON = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
function hofDates(e) {   // "17–18 Okt 2026" → ['2026-10-17', '2026-10-18']
  const m = String(e.date || '').match(/(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/); if (!m || !HMON[m[3].toLowerCase()]) return null;
  const d = n => `${m[4]}-${String(HMON[m[3].toLowerCase()]).padStart(2, '0')}-${String(n).padStart(2, '0')}`; return [d(m[1]), d(m[2] || m[1])];
}
const hofPartner = n => CD.partnerOf(n);
const hofPLink = n => { const d = hofPartner(n); return d && d.c ? `<a href="/partner/${citySlug(d.c)}/">${esc(d.n)}</a>` : esc(n || '—'); };
const hofCarOf = e => { const sp = CARS.carSplit(e.car); if (!sp) return null; const k = CARS.carKey(sp.make, sp.model); return CD.cars.find(c => c.key === k) || null; };
const hofGl = e => GALLERY.find(g => g.hof_id === e.id || HOF.some(x => x.id === g.hof_id && CARS.hofCarKey(x) === CARS.hofCarKey(e)));
const hofWaPhoto = g => { const p = (g?.photos || []).find(x => x.wa && x.type !== 'video' && x.path && !String(x.path).startsWith('pending/')); return p ? STORE + String(p.path).split('#')[0] : ''; };
const hofPlace = e => e.place >= 1 && e.place <= 3 ? 'Juara ' + e.place : (e.award || 'Penghargaan');
function hofCarCards(es) {
  const m = new Map(); for (const e of es) { const k = CARS.hofCarKey(e); if (!m.has(k)) m.set(k, { e, n: 0, best: 9 }); const o = m.get(k); o.n++; if ((e.place || 9) < o.best) { o.best = e.place || 9; o.e = e; } }
  return [...m.values()].sort((a, b) => a.best - b.best || b.n - a.n).map(o => { const c = hofCarOf(o.e), g = hofGl(o.e), ph = hofWaPhoto(g);
    const ps = (o.e.products || []).map(id => CARS.prod(id)?.p.name).filter(Boolean);
    return `<a class="cr" href="${c ? `/mobil/${c.slug}/` : `/?hof=${encodeURIComponent(o.e.id)}`}"><div class="ph">${ph ? `<img src="${esc(ph)}" alt="${esc(o.e.car)}" loading="lazy">` : (g ? '📷' : '🚗')}<b>${medal(o.best)} ${esc(o.best <= 3 ? 'Juara ' + o.best : hofPlace(o.e))}${o.n > 1 ? ' · ' + o.n + ' prestasi' : ''}</b></div>
      <div class="in"><b>${esc(o.e.car || '—')}</b><small>${esc([o.e.name, o.e.dealer].filter(Boolean).join(' · '))}</small><em>${ps.length ? '🔧 ' + esc(ps.slice(0, 3).join(', ')) + (ps.length > 3 ? '…' : '') : o.e.team ? 'Tim ' + esc(o.e.team.map(id => BRANDS.find(b => b.id === id)?.name || id).join(' · ')) : ''}</em></div></a>`; });
}
const hofRank = es => { const by = new Map(); for (const e of es) { const d = hofPartner(e.dealer), k = d ? d.n : (e.dealer || '—'); if (!by.has(k)) by.set(k, { n: k, j: [0, 0, 0, 0], t: 0 }); const o = by.get(k); o.t++; o.j[(e.place >= 1 && e.place <= 3 ? e.place : 4) - 1]++; }
  return [...by.values()].sort((a, b) => b.j[0] - a.j[0] || b.j[1] - a.j[1] || b.t - a.t || a.n.localeCompare(b.n)); };
const hofRankHtml = es => hofRank(es).map((d, i) => `<div class="rk"><i>${i + 1}</i>${hofPLink(d.n)}<em>${[['🥇', d.j[0]], ['🥈', d.j[1]], ['🥉', d.j[2]]].filter(x => x[1]).map(x => x[0] + x[1]).join(' ')}</em></div>`).join('');
for (const e0 of CARS.HOF_ON ? hofEvents : []) {
  const es = HOF_ALL.filter(e => hofEvKey(e) === hofEvKey(e0)), url = hofEvUrl(e0), cls = [...new Set(es.map(e => e.cls || '—'))];
  const j1 = es.filter(e => e.place === 1).length, cards = hofCarCards(es), brandsUsed = [...new Set(es.flatMap(e => e.team || (e.brand ? [e.brand] : [])))].map(id => BRANDS.find(b => b.id === id)).filter(Boolean);
  const where = [e0.venue, e0.city].filter(Boolean).join(', ');
  const rows = cls.map(c => `<tr class="cl"><td colspan="4">${esc(c)}</td></tr>` + es.filter(e => (e.cls || '—') === c).sort((a, b) => (a.place || 9) - (b.place || 9)).map(e => { const car = hofCarOf(e), g = hofGl(e);
    return `<tr><td>${medal(e.place)} <b>${esc(hofPlace(e))}</b></td><td><b>${esc(e.name || '—')}</b></td><td>${car ? `<a href="/mobil/${car.slug}/">${esc(e.car)}</a>` : esc(e.car || '—')}${g ? `<br><a class="gl" href="/?gl=${encodeURIComponent(g.id)}">📷 Foto di Galeri</a>` : ''}${(e.products || []).length ? `<small>🔧 ${e.products.length} perangkat CAI</small>` : ''}</td><td>${hofPLink(e.dealer)}</td></tr>`; }).join('')).join('');
  const body = `<div class="kick">Hall of Fame · Kompetisi Car Audio</div><h1>Hasil ${esc(hofEvKey(e0))}${e0.city ? ' — ' + esc(e0.city) : ''}</h1>
    <div class="meta">${e0.date ? `<span>📅 ${esc(e0.date)}</span>` : ''}${where ? `<span>📍 ${esc(where)}</span>` : ''}<span>🏆 ${es.length} prestasi</span><span>🥇 ${j1} Juara 1</span><span>${cls.length} kelas</span></div>
    <p class="lead">Daftar mobil juara ${esc(hofEvKey(e0))}${e0.city ? ' di ' + esc(e0.city) : ''} yang dipasang partner resmi Concerto Audio Indonesia${brandsUsed.length ? ' dengan perangkat ' + esc(brandsUsed.map(b => b.name).join(', ').replace(/, ([^,]*)$/, ' & $1')) : ''} — kelas, peringkat, peserta, mobil, dan partner pemasangnya.</p>
    <div class="ev"><div><h2>Mobil juara <small>${cards.length} mobil</small></h2><div class="cars">${cards.join('')}</div>
      <h2>Hasil per kelas <small>${cls.length} kelas</small></h2><table class="res"><thead><tr><th>Peringkat</th><th>Peserta</th><th>Mobil</th><th>Partner pemasang</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="side"><div class="bx"><h3>🏪 Partner pemasang juara</h3>${hofRankHtml(es)}</div>
      ${brandsUsed.length ? `<div class="bx"><h3>🔊 Brand tim juara</h3><div class="chips">${brandsUsed.map(b => `<a href="/brand/${b.id}/">${esc(b.name)}</a>`).join('')}</div></div>` : ''}
      <div class="bx"><h3>🏆 Kompetisi lainnya</h3>${hofEvents.filter(x => x !== e0).map(x => `<div class="rk"><i>›</i><a href="${hofEvUrl(x)}">${esc(hofEvKey(x))}</a><em></em></div>`).join('') || '<p style="margin:0;color:#8b92a1;font-size:13px">Bertambah otomatis saat hasil kompetisi berikutnya dimasukkan.</p>'}<p style="margin:10px 0 0"><a href="/hall-of-fame/" style="color:#d8b26a;font-size:13px">Semua Hall of Fame ›</a></p></div></div></div>`;
  const dt = hofDates(e0);
  const ld2 = dt ? { '@context': 'https://schema.org', '@type': 'Event', name: hofEvKey(e0) + (e0.city ? ' — ' + e0.city : ''), startDate: dt[0], endDate: dt[1],
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', url: SITE + url,
    location: { '@type': 'Place', name: e0.venue || e0.city || 'Indonesia', address: { '@type': 'PostalAddress', addressLocality: e0.city || '', addressCountry: 'ID' } },
    description: `Hasil ${hofEvKey(e0)}: ${es.length} prestasi (${j1} Juara 1) mobil yang dipasang partner resmi Concerto Audio Indonesia.`,
    organizer: { '@type': 'Organization', name: String(e0.event).split(' ')[0] } } : null;
  pages.push({ url, html: page({ url, title: `Hasil ${hofEvKey(e0)}${e0.city ? ' ' + e0.city : ''} — Mobil Juara & Partner Pemasang | CAI Hub`,
    desc: `Hasil ${hofEvKey(e0)}${e0.city ? ' di ' + e0.city : ''}${e0.date ? ' (' + e0.date + ')' : ''}: ${es.length} prestasi, ${j1} Juara 1 di ${cls.length} kelas — mobil juara, peserta & partner pemasang resmi Concerto Audio Indonesia.`,
    crumbs: [['CAI Hub', '/'], ['Hall of Fame', '/hall-of-fame/'], [hofEvKey(e0), url]], open: `/?hof=${encodeURIComponent(es[0].id)}`, ld2, css2: HCSS, log: true, body }) });
}
if (CARS.HOF_ON && hofEvents.length) {
  const j1 = HOF_ALL.filter(e => e.place === 1).length, rk = hofRank(HOF_ALL);
  pages.push({ url: '/hall-of-fame/', html: page({ url: '/hall-of-fame/', title: `Hall of Fame — Mobil Juara Kompetisi Car Audio | CAI Hub`,
    desc: `${HOF_ALL.length} prestasi kompetisi (${j1} Juara 1) mobil yang dipasang partner resmi Concerto Audio Indonesia: ${hofEvents.map(hofEvKey).join(', ')}.`,
    crumbs: [['CAI Hub', '/'], ['Hall of Fame', '/hall-of-fame/']], open: '/?hof=', css2: HCSS,
    body: `<div class="kick">Hall of Fame</div><h1>Hall of Fame — Mobil Juara Kompetisi Car Audio</h1>
      <p class="lead">Prestasi kompetisi mobil yang dipasang partner resmi Concerto Audio Indonesia — lihat hasil per kompetisi, mobil juara, dan partner pemasangnya.</p>
      <div class="st"><span><b>${HOF_ALL.length}</b>prestasi</span><span><b>${j1}</b>Juara 1</span><span><b>${hofEvents.length}</b>kompetisi</span><span><b>${rk.length}</b>partner pemasang</span></div>
      <h2>Kompetisi</h2><div class="evc">${hofEvents.map(e0 => { const es = HOF_ALL.filter(e => hofEvKey(e) === hofEvKey(e0)); return `<a href="${hofEvUrl(e0)}"><small>${esc([e0.date, [e0.venue, e0.city].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</small><b>${esc(hofEvKey(e0))}</b><div class="m">🏆 ${es.length} prestasi · 🥇 ${es.filter(e => e.place === 1).length} Juara 1 · ${new Set(es.map(e => e.cls)).size} kelas</div><div class="m" style="color:#d8b26a">Lihat hasil lengkap ›</div></a>`; }).join('')}</div>
      <h2>Mobil juara</h2><div class="cars">${hofCarCards(HOF_ALL).slice(0, 12).join('')}</div>
      <h2>Partner pemasang juara</h2><div class="side"><div class="bx">${hofRankHtml(HOF_ALL)}</div></div>` }) });
}

// ── Concerto Academy (5 Nov 2026, permintaan pemilik — pratinjau .mockup/seo-academy/ disetujui) ──
// /academy/ (daftar per seri) + /academy/<no>/ : teks infografis disalin kata per kata di tools/data/academy-text.json
// (materi bawaan repo) — materi tambahan dari portal (tools/data/academy-extra.json, ditulis bot) tampil dengan judul + gambar saja.
const ACAD_BASE = vm.runInNewContext('(' + fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf8').match(/const ACADEMY = (\[[\s\S]*?\n\]);/)[1] + ')');
let ACAD_TXT = {}; try { ACAD_TXT = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/data/academy-text.json'), 'utf8')).items || {}; } catch (e) {}
let ACAD_EXTRA = []; try { ACAD_EXTRA = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/data/academy-extra.json'), 'utf8')).items || []; } catch (e) {}
const pad2 = n => String(n).padStart(2, '0');
const ACAD = [...ACAD_BASE.filter(a => (a.date || '') <= today).map(a => ({ no: a.no, title: a.title, series: a.series || 'Fundamental', img: `/assets/academy/fundamental-${pad2(a.no)}.webp`, thumb: `/assets/academy/fundamental-${pad2(a.no)}-thumb.webp` })),
  ...ACAD_EXTRA.filter(x => !ACAD_BASE.some(a => a.no === x.no)).map(a => ({ no: a.no, title: a.title, series: a.series || 'Fundamental', img: STORE + a.img, thumb: STORE + (a.thumb || a.img) }))]
  .sort((a, b) => a.no - b.no);
const ACSS = `.ac{display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr);gap:30px;margin-top:16px;align-items:start}
.ac .pic{position:sticky;top:70px}.ac .pic img{width:100%;border-radius:16px;border:1px solid rgba(255,255,255,.1);display:block}
.ac .pic small{display:block;color:#8b92a1;font-size:12px;margin-top:8px;text-align:center}
.kick{font:700 11.5px Sora,sans-serif;letter-spacing:.14em;color:#d8b26a;text-transform:uppercase}
.intro{font-size:17px;color:#d6d9df;line-height:1.7}
.pts{display:grid;gap:12px;margin:18px 0}.pts div{border:1px solid rgba(255,255,255,.09);border-radius:14px;background:#111317;padding:14px 16px}
.pts h3{margin:0 0 4px;font:700 17px Sora,sans-serif}.pts p{margin:0;color:#c6cad2}
.sol{border:1px solid rgba(216,178,106,.55);border-radius:16px;padding:16px 18px;background:linear-gradient(160deg,rgba(216,178,106,.1),transparent);margin:18px 0}
.sol .k2{font:700 11.5px Sora;letter-spacing:.14em;color:#d8b26a}.sol b{display:block;font:700 17px Sora;margin:4px 0}.sol p{margin:0 0 12px;color:#cfd3da}
.sol ul{margin:6px 0 12px;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px}.sol li{border:1px solid rgba(216,178,106,.35);border-radius:10px;padding:6px 11px;font-size:13.5px}
.quote{border-left:3px solid #6fd3e6;background:#0f1a22;border-radius:0 14px 14px 0;padding:14px 18px;margin:18px 0}.quote .k2{font:700 11.5px Sora;letter-spacing:.14em;color:#6fd3e6}.quote p{margin:6px 0 0;font-style:italic;font-size:16px;color:#e2e6ea}
.nav2{display:flex;justify-content:space-between;gap:10px;margin:22px 0 0}.nav2 a{flex:1;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px 14px;text-decoration:none;font-size:13.5px}.nav2 a small{display:block;color:#8b92a1;font-size:11.5px}.nav2 a:last-child{text-align:right}
.mg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.mg a{border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#111317;overflow:hidden;text-decoration:none}.mg img{width:100%;aspect-ratio:3/2;object-fit:cover;display:block}.mg span{display:block;padding:8px 10px;font-size:12.5px}.mg small{display:block;color:#d8b26a;font:700 10px Sora;letter-spacing:.1em}
@media(max-width:820px){.ac{grid-template-columns:1fr}.ac .pic{position:static;max-width:420px;margin:0 auto}}`;
const acadUrl = a => `/academy/${a.no}/`;
const acadTile = a => `<a href="${acadUrl(a)}"><img src="${esc(a.thumb)}" alt="${esc(a.title)}" loading="lazy"><span><small>${esc(a.series.toUpperCase())} #${a.no}</small>${esc(a.title)}</span></a>`;
for (const [i, a] of ACAD.entries()) {
  const t = ACAD_TXT[a.no] || null, url = acadUrl(a), prev = ACAD[i - 1], next = ACAD[i + 1];
  const sol = t?.solution, prods = (t?.products || []).map(id => allProds.find(x => x.p.id === id)).filter(Boolean);
  const bs = (t?.brands || []).map(id => BRANDS.find(b => b.id === id)).filter(Boolean);
  const plain = t ? [t.intro, ...t.points.map(p => `${p.h} ${p.t}`), sol?.label, sol?.h, sol?.t, ...(sol?.items || []), t.quote].filter(Boolean).join(' ') : '';
  const body = `<div class="ac"><div class="pic"><img src="${esc(a.img)}" alt="${esc(a.title + (t ? ' — ' + t.intro : ''))}"><small>Infografis asli Concerto Academy #${a.no}</small></div><div>
    <div class="kick">Concerto Academy · ${esc(a.series)} #${a.no}</div><h1>${esc(a.title)}</h1>
    ${t ? `<p class="intro">${esc(t.intro)}</p>
    <div class="pts">${t.points.map(p => `<div>${p.h ? `<h3>${esc(p.h)}</h3>` : ''}<p>${esc(p.t)}</p></div>`).join('')}</div>
    ${sol ? `<div class="sol"><div class="k2">${esc(sol.label || 'SOLUSI CONCERTO')}</div>${sol.h ? `<b>${esc(sol.h)}</b>` : ''}${sol.t ? `<p>${esc(sol.t)}</p>` : ''}${sol.items ? `<ul>${sol.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${prods.length ? `<div class="grid">${prods.map(x => card(x.b, x.p)).join('')}</div>` : bs.length ? `<div class="chips">${bs.map(b => `<a href="/brand/${b.id}/">Katalog ${esc(b.name)} ›</a>`).join('')}</div>` : ''}</div>` : ''}
    ${t.quote ? `<div class="quote"><div class="k2">OOO… JADI BEGINI</div><p>“${esc(t.quote)}”</p></div>` : ''}`
    : `<p class="intro">Materi Concerto Academy #${a.no} dari Concerto Audio Indonesia — baca infografis lengkapnya di gambar atau di CAI Hub.</p>`}
    <div class="acts" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px"><a class="btn" href="/?acad=${a.no}">Baca di CAI Hub ›</a><a class="btn ghost" href="/partner/">📍 Tanya partner resmi</a></div>
    <div class="nav2">${prev ? `<a href="${acadUrl(prev)}"><small>‹ Sebelumnya · #${prev.no}</small>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="${acadUrl(next)}"><small>Berikutnya · #${next.no} ›</small>${esc(next.title)}</a>` : '<span></span>'}</div>
    </div></div>
    <h2>Materi Concerto Academy lainnya</h2><div class="mg">${ACAD.filter(x => x !== a).slice(Math.max(0, i - 4), Math.max(0, i - 4) + 8).map(acadTile).join('')}</div>`;
  const desc = (t ? t.intro : `Concerto Academy ${a.series} #${a.no}: ${a.title} — materi edukasi audio mobil dari Concerto Audio Indonesia.`).slice(0, 300);
  const ld2 = { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: desc, image: [/^https?:/.test(a.img) ? a.img : SITE + a.img],
    inLanguage: 'id', url: SITE + url, isPartOf: { '@type': 'CreativeWorkSeries', name: 'Concerto Academy — ' + a.series },
    author: { '@type': 'Organization', name: 'Concerto Audio Indonesia' }, publisher: { '@type': 'Organization', name: 'Concerto Audio Indonesia', logo: { '@type': 'ImageObject', url: SITE + '/assets/icons/icon-512.png' } },
    learningResourceType: 'Infographic', ...(plain ? { articleBody: plain } : {}) };
  pages.push({ url, html: page({ url, title: `${a.title} — Concerto Academy #${a.no} | CAI Hub`, desc,
    crumbs: [['CAI Hub', '/'], ['Concerto Academy', '/academy/'], [`#${a.no}`, url]], open: `/?acad=${a.no}`, ld2, css2: ACSS,
    img: /^https?:/.test(a.img) ? a.img : SITE + a.img, body }) });
}
if (ACAD.length) {
  const series = [...new Set(ACAD.map(a => a.series))];
  pages.push({ url: '/academy/', html: page({ url: '/academy/', title: `Concerto Academy — ${ACAD.length} Materi Edukasi Audio Mobil | CAI Hub`,
    desc: `${ACAD.length} materi Concerto Academy dari Concerto Audio Indonesia: ${ACAD.slice(0, 4).map(a => a.title).join(' · ')} — dan lainnya.`.slice(0, 300),
    crumbs: [['CAI Hub', '/'], ['Concerto Academy', '/academy/']], open: '/?acad=', css2: ACSS,
    body: `<h1>Concerto Academy — Edukasi Audio Mobil</h1><p class="lead">${ACAD.length} materi singkat dari Concerto Audio Indonesia untuk memahami audio mobil: ruang dengar kabin, speaker, peredam, DSP, kabel, hingga kelistrikan.</p>
      ${series.map(sr => `<h2>${esc(sr)} <small>${ACAD.filter(a => a.series === sr).length}</small></h2><div class="mg">${ACAD.filter(a => a.series === sr).map(acadTile).join('')}</div>`).join('')}` }) });
}

// ── Tulis: hapus halaman lama di folder milik skrip ini, lalu tulis semua ──
// lastmod sitemap hanya berubah untuk halaman yang isinya berubah (skrip ini juga dijalankan bot tiap ±15 menit)
const oldHtml = new Map(), oldMod = new Map();
try { for (const m of fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)) oldMod.set(m[1].replace(SITE, ''), m[2]); } catch (e) {}
for (const pg of pages) { try { oldHtml.set(pg.url, fs.readFileSync(path.join(ROOT, pg.url, 'index.html'), 'utf8')); } catch (e) {} }
for (const dir of ['brand', 'kategori', 'partner', 'mobil', 'produk', 'academy', 'hall-of-fame']) fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
for (const pg of pages) { const d = path.join(ROOT, pg.url); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'index.html'), pg.html); }
const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${oldMod.get('/') || today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
${pages.map(pg => `  <url><loc>${SITE}${pg.url}</loc><lastmod>${oldHtml.get(pg.url) === pg.html && oldMod.get(pg.url) ? oldMod.get(pg.url) : today}</lastmod><changefreq>weekly</changefreq><priority>${/^\/(brand|kategori|mobil|hall-of-fame)\//.test(pg.url) ? '0.8' : /^\/(produk|academy)\//.test(pg.url) ? '0.7' : '0.6'}</priority></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sm);
console.log(`${pages.length} halaman: ${pages.filter(p => p.url.startsWith('/brand/')).length} brand · ${pages.filter(p => p.url.startsWith('/kategori/')).length} kategori · ${pages.filter(p => p.url.startsWith('/partner/')).length} partner (index + provinsi + kota) · ${pages.filter(p => p.url.startsWith('/mobil/')).length} mobil · ${pages.filter(p => p.url.startsWith('/produk/')).length} produk · ${pages.filter(p => p.url.startsWith('/academy/')).length} academy · ${pages.filter(p => p.url.startsWith('/hall-of-fame/')).length} hall-of-fame · sitemap.xml diperbarui (${PARTNERS.length} partner)`);
