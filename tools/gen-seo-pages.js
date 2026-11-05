#!/usr/bin/env node
/* CAI Hub — HALAMAN UNTUK GOOGLE (Tahap 3, 4 Nov 2026, permintaan pemilik — pratinjau .mockup/tahap3/ disetujui).
   Portal adalah satu halaman JavaScript, jadi isinya sulit dibaca mesin pencari. Skrip ini membuat halaman statis berisi
   teks asli (bisa diindeks Google, BUKAN noindex & tanpa pengalihan otomatis):
     • /brand/<id>/          — produk per line + harga SRP            → tombol "Buka di CAI Hub" = /?brand=<id>
     • /kategori/<slug>/     — produk semua brand di kategori itu     → /?kat=<slug>
     • /partner/             — daftar provinsi & kota partner resmi
     • /partner/<slug>/      — partner per kota DAN per provinsi      → /?kota=<slug>
     • /mobil/ & /mobil/<slug>/ (Tahap 8 B) — contoh pemasangan per model mobil (Galeri + Hall of Fame) → /?mobil=<slug>
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
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'katalog.js'), 'utf8') + ';this.BRANDS=BRANDS;', ctx);
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
const ptx = d => { const x = CD.partnerData(d); return (x.hof.length || x.gl.length) ? `<div class="x">${x.hof.length ? `🏆 ${x.hof.length} prestasi kompetisi${x.j1 ? ` (${x.j1} Juara 1)` : ''}` : ''}${x.hof.length && x.gl.length ? ' · ' : ''}${x.gl.length ? `${x.gl.length} instalasi di Galeri` : ''}${x.cars.length ? `<br>Mobil: ${x.cars.slice(0, 5).map(c => `<a href="/mobil/${c.slug}/">${esc(c.name)}</a>`).join(', ')}` : ''}</div>` : ''; };
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
for (const c of CD.cars) {
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
if (CD.cars.length) {
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

// ── Tulis: hapus halaman lama di folder milik skrip ini, lalu tulis semua ──
// lastmod sitemap hanya berubah untuk halaman yang isinya berubah (skrip ini juga dijalankan bot tiap ±15 menit)
const oldHtml = new Map(), oldMod = new Map();
try { for (const m of fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)) oldMod.set(m[1].replace(SITE, ''), m[2]); } catch (e) {}
for (const pg of pages) { try { oldHtml.set(pg.url, fs.readFileSync(path.join(ROOT, pg.url, 'index.html'), 'utf8')); } catch (e) {} }
for (const dir of ['brand', 'kategori', 'partner', 'mobil', 'produk']) fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
for (const pg of pages) { const d = path.join(ROOT, pg.url); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'index.html'), pg.html); }
const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${oldMod.get('/') || today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
${pages.map(pg => `  <url><loc>${SITE}${pg.url}</loc><lastmod>${oldHtml.get(pg.url) === pg.html && oldMod.get(pg.url) ? oldMod.get(pg.url) : today}</lastmod><changefreq>weekly</changefreq><priority>${/^\/(brand|kategori|mobil)\//.test(pg.url) ? '0.8' : /^\/produk\//.test(pg.url) ? '0.7' : '0.6'}</priority></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sm);
console.log(`${pages.length} halaman: ${pages.filter(p => p.url.startsWith('/brand/')).length} brand · ${pages.filter(p => p.url.startsWith('/kategori/')).length} kategori · ${pages.filter(p => p.url.startsWith('/partner/')).length} partner (index + provinsi + kota) · ${pages.filter(p => p.url.startsWith('/mobil/')).length} mobil · ${pages.filter(p => p.url.startsWith('/produk/')).length} produk · sitemap.xml diperbarui (${PARTNERS.length} partner)`);
