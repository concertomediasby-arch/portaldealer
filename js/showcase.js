/* CAI Hub (Concerto Audio Indonesia) — js/showcase.js
   SHOWCASE (31 Okt 2026, permintaan pemilik): 🏆 Hall of Fame (prestasi kompetisi per seri speaker, data HALL_OF_FAME
   di katalog.js) + 🚗 Galeri Instalasi (contoh pemasangan per mobil, tabel Supabase showcase_installs + Storage publik
   `showcase`). Dibuka untuk publik 31 Okt 2026 (SHOWCASE_PUBLIC = true; sebelumnya hanya Editor).
   Dimuat setelah videotron.js; dipanggil dari core.js (showProduct/renderProducts/productCard) & stock.js (updateAuthUI). */

const SHOWCASE_PUBLIC = true;   // dibuka untuk publik 31 Okt 2026 (permintaan pemilik); true = menu & bagian Showcase tampil untuk semua pengunjung
const scOn = () => SHOWCASE_PUBLIC || isEditor();

/* ══════════════════════════════════════════
   HALL OF FAME
══════════════════════════════════════════ */
// Data contoh — HANYA tampil untuk Editor selama HALL_OF_FAME masih kosong (nama kompetisi sengaja placeholder)
const HOF_DEMO = [
  { id:'demo-1', event:'[Nama Kompetisi]', city:'Jakarta',  year:2026, cls:'SQ Pemula',  place:1, award:'Juara 1', brand:'audiocircle', line:'Stuttgart Line', car:'Toyota Fortuner', dealer:'[Nama Dealer]' },
  { id:'demo-2', event:'[Nama Kompetisi]', city:'Surabaya', year:2025, cls:'Kelas 2-Way', place:0, award:'Best Sound Quality', brand:'audiocircle', line:'Stuttgart Line', car:'Honda HR-V', dealer:'[Nama Dealer]' },
  { id:'demo-3', event:'[Nama Kompetisi]', city:'Bandung',  year:2025, cls:'SQ Entry',   place:2, award:'Juara 2', brand:'audiocircle', line:'Stuttgart Line', car:'Mitsubishi Pajero Sport', dealer:'[Nama Dealer]' },
  { id:'demo-4', event:'[Nama Kompetisi]', city:'Semarang', year:2024, cls:'SQ Pemula',  place:3, award:'Juara 3', brand:'audiocircle', line:'Stuttgart Line', car:'Toyota Innova Zenix', dealer:'[Nama Dealer]' },
  { id:'demo-5', event:'[Nama Kompetisi]', city:'Malang',   year:2025, cls:'SQ Entry',   place:1, award:'Juara 1', brand:'audiocircle', line:'Frankfurt Line', car:'Toyota Rush', dealer:'[Nama Dealer]' },
  { id:'demo-6', event:'[Nama Kompetisi]', city:'Jakarta',  year:2024, cls:'SQ 2-Way',   place:2, award:'Juara 2', brand:'audiocircle', line:'Frankfurt Line' },
  { id:'demo-7', event:'[Nama Kompetisi]', city:'Surabaya', year:2026, cls:'SQ Expert',  place:1, award:'Juara 1', brand:'audiocircle', line:'Pro Line', car:'BMW 320i', dealer:'[Nama Dealer]' },
  { id:'demo-8', event:'[Nama Kompetisi]', city:'Medan',    year:2025, cls:'SQ 3-Way',   place:3, award:'Juara 3', brand:'audiocircle', line:'Munich Line' },
];
let hofBrand = 'all', hofYear = 'all', hofOpen = {};
const hofIsDemo = () => !HALL_OF_FAME.length && isEditor();
const hofData = () => HALL_OF_FAME.length ? HALL_OF_FAME : (hofIsDemo() ? HOF_DEMO : []);
const hofKey = (b, l) => b + '|' + normKey(l);
// Brand yang dipakai: entri seri (brand+line) atau entri tim (team:[…], seri per mobil belum dicatat)
const hofBrands = e => e.team?.length ? e.team : [e.brand];
const hofGroupKey = e => e.line ? hofKey(e.brand, e.line) : 'team|' + hofBrands(e).join('-');
const hofBrandName = id => BRANDS.find(b => b.id === id)?.name || id;
const hofTeamLabel = s => s.line || 'Tim ' + s.team.map(hofBrandName).join(' · ');
const hofDomId = k => 'hof-' + k.replace(/[^a-z0-9]/gi, '-');
const hofMedal = (pl, n) => pl >= 1 && pl <= 3
  ? `<i class="hof-m ${['g', 's', 'b'][pl - 1]}">${n ?? pl}</i>`
  : `<i class="hof-m x">${n ?? '★'}</i>`;
const hofSort = (a, b) => (b.year || 0) - (a.year || 0) || (a.place || 9) - (b.place || 9);
function hofProducts(e) {
  const brand = BRANDS.find(b => b.id === e.brand);
  const line = brand?.lines.find(l => normKey(l.name) === normKey(e.line));
  const all = line ? line.products : [];
  return e.products?.length ? all.filter(p => e.products.includes(p.id)).concat(
    (brand ? brand.lines.flatMap(l => l.products) : []).filter(p => e.products.includes(p.id) && !all.includes(p))) : all;
}
// Prestasi yang berlaku untuk satu produk: entri yang menyebut produk itu, atau entri tanpa daftar produk di line yang sama
function hofForProduct(brandId, lineName, pid) {
  return hofData().filter(e => e.products?.length ? e.products.includes(pid) : e.brand === brandId && normKey(e.line) === normKey(lineName || ''));
}
function hofSeries(list) {
  const map = new Map();
  list.forEach(e => {
    const k = hofGroupKey(e);
    if (!map.has(k)) map.set(k, { key: k, brand: e.brand, line: e.line || '', team: hofBrands(e), items: [], g: 0, s: 0, b: 0 });
    const s = map.get(k);
    s.items.push(e);
    if (e.place === 1) s.g++; else if (e.place === 2) s.s++; else if (e.place === 3) s.b++;
  });
  return [...map.values()].sort((a, b) => b.items.length - a.items.length || b.g - a.g || b.s - a.s);
}
const hofLineCount = (brandId, lineName) => hofData().filter(e => e.brand === brandId && normKey(e.line) === normKey(lineName)).length;
// Lencana di judul line (halaman brand) & kartu produk — dipanggil core.js
function hofLineBadge(brandId, lineName) {
  if (!scOn()) return '';
  const n = hofLineCount(brandId, lineName);
  return n ? `<button class="hof-badge" onclick="event.stopPropagation();openHallOfFame('${hofKey(brandId, lineName)}')" title="Lihat prestasi seri ini di Hall of Fame">🏆 ${n} Prestasi</button>` : '';
}
function hofCardBadge(brandId, p) {
  if (!scOn()) return '';
  const line = BRANDS.find(b => b.id === brandId)?.lines.find(l => l.products.some(x => x.id === p.id))?.name;
  const n = hofForProduct(brandId, line, p.id).length;
  return n ? `<span class="hof-cbadge" title="${n} prestasi kompetisi">🏆 ${n}</span>` : '';
}

// Nama dealer di data kompetisi → kartu Authorized Dealer (nama di daftar resmi bisa berbeda)
const HOF_DEALER_ALIAS = { westaudioworks: 'West Garage', vinaudioworks: 'Vin Audiowork' };   // VIN Audioworks = Vin Audiowork (konfirmasi pemilik 31 Okt 2026)
function hofDealer(name) {
  const k = normKey(name || ''); if (!k) return null;
  const n = normKey(HOF_DEALER_ALIAS[k] || name);
  return adPublic().find(d => normKey(d.n) === n) || null;
}
const hofDlAttr = name => hofDealer(name) ? ` onclick="openHofDealer('${escHtml(name).replace(/'/g, '')}')"` : '';
function openHofDealer(name) {
  const d = hofDealer(name); if (!d) return;
  const wins = hofData().filter(e => normKey(e.dealer || '') === normKey(name)).sort((a, b) => (a.place || 9) - (b.place || 9));
  const cnt = pl => wins.filter(e => e.place === pl).length;
  document.querySelector('#hof-dealer .gl-dbox').innerHTML = `
    <button class="rk-pick-x gl-x" onclick="closeHofDealer()" aria-label="Tutup">✕</button>
    <div class="hof-dlhd"><div class="hof-lbl">Dealer pemasang juara</div>
      <h3 class="gl-dt">${escHtml(d.n)} <span class="ad-badge">✓ Resmi</span></h3>
      <div class="gl-dc">📍 ${escHtml([d.c, d.r].filter(Boolean).join(', '))}</div>
      ${d.a ? `<div class="ad-addr">${escHtml(d.a)}</div>` : ''}
      <div class="ad-btns">${d.wa ? `<a class="ad-btn wa" href="https://wa.me/${d.wa}?text=${encodeURIComponent(`Halo ${d.n}, saya lihat prestasi kompetisi Anda di Hall of Fame CAI Hub (Concerto Audio Indonesia). Saya ingin bertanya.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${d.ig ? `<a class="ad-btn" href="https://www.instagram.com/${encodeURIComponent(d.ig)}/" target="_blank" rel="noopener">Instagram</a>` : ''}<a class="ad-btn" href="${adMaps(d)}" target="_blank" rel="noopener">Maps</a></div></div>
    <div class="hof-lbl" style="margin-top:18px">${wins.length} prestasi <span class="hof-ms">${[1, 2, 3].map(pl => cnt(pl) ? hofMedal(pl, cnt(pl)) : '').join('')}</span></div>
    ${wins.map(e => `<div class="hof-win${e.products?.length ? ' link' : ''}"${e.products?.length ? hofWinAttr(e) : ''}>${hofMedal(e.place)}<div><b>${escHtml(e.award)}${e.cls ? ' · ' + escHtml(e.cls) : ''}</b>
      <div class="hof-meta">${escHtml([e.event, e.city].filter(Boolean).join(' · '))}</div>
      ${e.name || e.car ? `<div class="hof-car">${escHtml([e.name, e.car].filter(Boolean).join(' · '))}</div>` : ''}</div>${e.year ? `<span class="hof-yr">${e.year}</span>` : ''}</div>`).join('')}`;
  document.getElementById('hof-dealer').classList.add('open');
}
// Detail satu prestasi: mobil, perangkat yang dipakai (→ katalog), dealer pemasang
const hofWinAttr = e => e.products?.length || e.other?.length ? ` onclick="event.stopPropagation();openHofWin('${e.id}')"` : hofDlAttr(e.dealer);
function openHofWin(id) {
  const e = hofData().find(x => x.id === id); if (!e) return;
  const d = hofDealer(e.dealer);
  const prods = (e.products || []).map(pid => findProductAny(pid)).filter(r => r.product);
  document.querySelector('#hof-dealer .gl-dbox').innerHTML = `
    <button class="rk-pick-x gl-x" onclick="closeHofDealer()" aria-label="Tutup">✕</button>
    <div class="hof-dlhd"><div class="hof-lbl">${escHtml([e.event, e.date || e.year, e.city].filter(Boolean).join(' · '))}</div>
      <div class="hof-wtop">${hofMedal(e.place)}<div><h3 class="gl-dt">${escHtml(e.car || e.cls || '')}</h3>
        <div class="gl-dc">${escHtml(e.award)}${e.cls ? ' · ' + escHtml(e.cls) : ''}${e.name ? ' · ' + escHtml(e.name) : ''}</div></div></div>
      ${hofGallery(e) ? `<button class="gt-btn hof-galwide" onclick="hofOpenGallery('${hofGallery(e).id}')">📷 Lihat foto pemasangan di Galeri Instalasi</button>` : ''}
      ${authUser && !isAdmin() ? `<button class="gt-btn confirm hof-galwide" onclick="openGlSubmit('${e.id}')">📤 Kirim foto / video mobil ini</button>`
        : !authUser ? `<button class="gt-btn ghost hof-galwide" onclick="openGlSubmit('${e.id}')">🔑 Dealer pemasang? Login untuk kirim foto / video</button>` : ''}
      ${isAdmin() ? (hofGallery(e) ? `<button class="gt-btn confirm hof-galwide" onclick="closeHofDealer();openGlForm('${hofGallery(e).id}')">✏️ Tambah / ubah foto &amp; video mobil ini</button>`
        : `<button class="gt-btn confirm hof-galwide" onclick="openGlForHof('${e.id}')">＋ Tambah foto / video mobil ini</button>`) : ''}
      ${isAdmin() && !isEditor() ? '<div class="gl-hint">Foto/video dari akun Admin tampil setelah disetujui Editor.</div>' : ''}
      ${hofPendingFor(e).length ? `<div class="gl-hint">⏳ ${hofPendingFor(e).length} kiriman foto/video mobil ini menunggu persetujuan Editor.</div>` : ''}</div>
    ${prods.length || e.other?.length ? `<div class="hof-lbl" style="margin-top:16px">Perangkat yang dipakai</div>
      ${prods.map(r => { const p = r.product;
        return `<button class="gl-prod" onclick="closeHofDealer();showProduct('${r.brand.id}','${p.id}')">${p.photo ? `<img src="${p.photo}" alt="">` : `<span class="hof-ph">${p.emoji}</span>`}<span><b>${escHtml(p.name)}</b><small>${escHtml(r.brand.name)}${r.line ? ' · ' + escHtml(r.line) : ''}</small></span><em>Lihat →</em></button>`; }).join('')}
      ${(e.other || []).map(t => `<div class="gl-prod hof-oth"><span class="hof-ph">🔧</span><span><b>${escHtml(t)}</b><small>Belum ada di katalog</small></span></div>`).join('')}` : ''}
    ${e.dealer ? `<div class="gl-dcard"><div class="hof-lbl">Dipasang oleh</div><b>${escHtml(e.dealer)}${d ? ' <span class="ad-badge">✓ Resmi</span>' : ''}</b>${d ? `<div class="gl-dc">${escHtml([d.c, d.r].join(', '))}</div>
      <div class="ad-btns">${d.wa ? `<a class="ad-btn wa" href="https://wa.me/${d.wa}?text=${encodeURIComponent(`Halo ${d.n}, saya lihat ${e.car || 'mobil'} juara ${e.event} di Hall of Fame CAI Hub (Concerto Audio Indonesia). Saya ingin bertanya.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${d.ig ? `<a class="ad-btn" href="https://www.instagram.com/${encodeURIComponent(d.ig)}/" target="_blank" rel="noopener">Instagram</a>` : ''}<a class="ad-btn" href="${adMaps(d)}" target="_blank" rel="noopener">Maps</a></div>` : ''}</div>` : ''}`;
  document.getElementById('hof-dealer').classList.add('open');
}
// Kiriman yang belum disetujui untuk mobil ini (hanya terlihat oleh Admin/Editor — RLS)
function hofPendingFor(e) {
  if (!isAdmin() || !glItems) return [];
  const k = hofCarKey(e);
  return glItems.filter(it => glPending(it) && it.hof_id && (() => { const h = hofData().find(x => x.id === it.hof_id); return h && hofCarKey(h) === k; })());
}
// Prestasi → mobil di Galeri Instalasi: instalasi yang hof_id-nya menunjuk prestasi ini, atau prestasi lain dari mobil yang sama
// (peserta + mobil + dealer sama; satu mobil bisa juara di beberapa kelas, cukup ditautkan sekali di form Galeri)
const hofCarKey = e => normKey([e.name, e.car, e.dealer].join('|'));
function hofGallery(e) {
  if (!glItems?.length || !e) return null;
  const k = hofCarKey(e);
  return glLive().find(it => it.hof_id && (it.hof_id === e.id || (() => { const h = hofData().find(x => x.id === it.hof_id); return h && hofCarKey(h) === k; })())) || null;
}
const hofGalBtn = e => { const it = hofGallery(e); return it ? `<button class="hof-galbtn" onclick="event.stopPropagation();hofOpenGallery('${it.id}')" title="Lihat foto pemasangan mobil ini di Galeri Instalasi">📷 Galeri</button>`
  : ''; };
async function hofOpenGallery(id) { closeHofDealer(); await openGaleri(); openGlDetail(id); }
function closeHofDealer() { document.getElementById('hof-dealer')?.classList.remove('open'); }

function openHallOfFame(focusKey) {
  if (!scOn()) return;
  showView('halloffame');
  renderHallOfFame();
  adEnsure();
  const main = document.querySelector('.main');
  if (focusKey) {
    hofOpen[focusKey] = true; renderHallOfFame();
    setTimeout(() => document.getElementById(hofDomId(focusKey))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  } else main?.scrollTo(0, 0);
}
function setHofFilter(kind, v) { if (kind === 'brand') hofBrand = v; else hofYear = v; renderHallOfFame(); }
function hofToggle(k) { hofOpen[k] = !hofOpen[k]; renderHallOfFame(); }
function renderHallOfFame() {
  const box = document.getElementById('hof-body'); if (!box) return;
  if (!glItems && !glLoading && supabase) loadGaleri().then(() => { if (document.getElementById('view-halloffame')?.classList.contains('active')) renderHallOfFame(); });
  const all = hofData();
  const list = all.filter(e => (hofBrand === 'all' || hofBrands(e).includes(hofBrand)) && (hofYear === 'all' || String(e.year) === hofYear));
  const series = hofSeries(list);
  const brands = [...new Set(all.flatMap(hofBrands))].filter(id => BRANDS.some(b => b.id === id));
  const years = [...new Set(all.map(e => e.year).filter(Boolean))].sort((a, b) => b - a);
  const brandName = id => BRANDS.find(b => b.id === id)?.name || id;
  const events = new Set(list.map(e => [e.event, e.city, e.year].join('|'))).size;
  const chip = (kind, v, label, on) => `<button class="filter-chip${on ? ' active' : ''}" onclick="setHofFilter('${kind}','${escHtml(String(v))}')">${escHtml(label)}</button>`;

  if (!all.length) {
    box.innerHTML = `<div class="stock-empty">Belum ada data prestasi. Isi <b>HALL_OF_FAME</b> di katalog.js dengan data kompetisi asli.</div>`;
    return;
  }
  const max = Math.max(1, ...series.map(s => s.items.length));
  const thumbs = s => (s.line ? hofProducts({ brand: s.brand, line: s.line }) : []).slice(0, 3)
    .map(p => p.photo ? `<img src="${p.photo}" alt="" loading="lazy">` : `<span class="hof-ph">${p.emoji}</span>`).join('');
  const board = series.map((s, i) => `
    <button class="hof-row${i === 0 ? ' top' : ''}" onclick="openHallOfFame('${s.key}')">
      <span class="hof-rk">${String(i + 1).padStart(2, '0')}</span>
      <span class="hof-ser"><b>${escHtml(hofTeamLabel(s))}${i === 0 && series.length > 1 ? '<span class="hof-flag">PALING BANYAK JUARA</span>' : ''}</b><small>${s.line ? escHtml(brandName(s.brand)) : 'Seri speaker per mobil menyusul'}</small></span>
      <span class="hof-thumbs">${thumbs(s)}</span>
      <span class="hof-c">${s.g}</span><span class="hof-c">${s.s}</span><span class="hof-c">${s.b}</span>
      <span class="hof-tot"><b>${s.items.length}</b><i class="hof-bar"><i style="width:${Math.round(s.items.length / max * 100)}%"></i></i></span>
    </button>`).join('');

  const winRow = e => `<div class="hof-win${e.products?.length ? ' link' : ''}"${e.products?.length ? hofWinAttr(e) : ''}>${hofMedal(e.place)}
      <div><b>${escHtml(e.award)}${e.cls ? ' · ' + escHtml(e.cls) : ''}</b>
      <div class="hof-meta">${escHtml(e.event)}${e.city ? ' · ' + escHtml(e.city) : ''}</div>
      ${e.name || e.car || e.dealer ? `<div class="hof-car">${escHtml([e.name, e.car, e.dealer ? 'dipasang oleh ' + e.dealer : ''].filter(Boolean).join(' · '))}</div>` : ''}</div>
      ${e.year ? `<span class="hof-yr">${e.year}</span>` : ''}</div>`;
  const cards = series.map(s => {
    const brand = BRANDS.find(b => b.id === s.brand);
    const prods = s.line ? hofProducts({ brand: s.brand, line: s.line }) : [];
    const logos = s.team.map(id => BRANDS.find(b => b.id === id)).filter(Boolean);
    const items = [...s.items].sort(hofSort);
    const open = hofOpen[s.key];
    const shown = open ? items : items.slice(0, 5);
    const photos = items.filter(e => e.photo);
    const special = s.items.length - s.g - s.s - s.b;
    return `<section class="hof-card" id="${hofDomId(s.key)}">
      <div class="hof-hd">
        ${s.line ? (brand?.logo ? `<img class="hof-logo" src="${brand.logo}" alt="${escHtml(brand.name)}">` : `<span class="hof-bn">${escHtml(brandName(s.brand))}</span>`)
          : `<span class="hof-logos">${logos.map(b => b.logo ? `<img class="hof-logo" src="${b.logo}" alt="${escHtml(b.name)}">` : `<span class="hof-bn">${escHtml(b.name)}</span>`).join('')}</span>`}
        <div class="hof-ttl"><h3>${escHtml(hofTeamLabel(s))}</h3><div class="hof-note">${s.line ? prods.map(p => escHtml(p.name)).slice(0, 4).join(' · ') : 'Rangkaian sistem audio memakai brand ini'}</div></div>
        <div class="hof-pill"><b>${s.items.length}</b><span>PRESTASI</span><span class="hof-ms">${s.g ? hofMedal(1, s.g) : ''}${s.s ? hofMedal(2, s.s) : ''}${s.b ? hofMedal(3, s.b) : ''}${special ? hofMedal(0, special) : ''}</span></div>
      </div>
      <div class="hof-bd">
        <div class="hof-prods${s.line ? '' : ' team'}"><div class="hof-lbl">${s.line ? 'Produk di seri ini' : 'Brand yang dipakai'}</div>
          ${!s.line ? logos.map(b => `<button class="hof-prod" onclick="showBrand('${b.id}')"><span class="hof-ph">🏷️</span><span><b>${escHtml(b.name)}</b><small>Lihat produk brand →</small></span></button>`).join('') + '<div class="hof-meta hof-pend">Seri speaker yang dipakai tiap mobil menyusul.</div>' : ''}
          ${prods.map(p => `<button class="hof-prod" onclick="showProduct('${s.brand}','${p.id}')">${p.photo ? `<img src="${p.photo}" alt="" loading="lazy">` : `<span class="hof-ph">${p.emoji}</span>`}<span><b>${escHtml(p.name)}</b><small>Lihat produk →</small></span></button>`).join('') || (s.line ? '<div class="hof-meta">—</div>' : '')}
        </div>
        <div class="hof-wins"><div class="hof-lbl">Daftar Prestasi</div>
          ${shown.map(winRow).join('')}
          ${items.length > 5 ? `<button class="hof-more" onclick="hofToggle('${s.key}')">${open ? 'Tampilkan lebih sedikit ▴' : `+ ${items.length - 5} prestasi lainnya ▾`}</button>` : ''}
          ${photos.length ? `<div class="hof-gal">${photos.map(e => `<img src="${e.photo}" alt="${escHtml(e.award)}" loading="lazy">`).join('')}</div>` : ''}
        </div>
      </div>
    </section>`;
  }).join('');

  // Klasemen dealer pemasang
  const dmap = new Map();
  list.filter(e => e.dealer).forEach(e => {
    const k = normKey(e.dealer);
    if (!dmap.has(k)) dmap.set(k, { name: e.dealer, n: 0, g: 0, s: 0, b: 0 });
    const d = dmap.get(k); d.n++;
    if (e.place === 1) d.g++; else if (e.place === 2) d.s++; else if (e.place === 3) d.b++;
  });
  const dealers = [...dmap.values()].sort((a, b) => b.g - a.g || b.n - a.n || b.s - a.s);
  const dmax = Math.max(1, ...dealers.map(d => d.n));
  const dboard = dealers.map((d, i) => `<div class="hof-row${i === 0 ? ' top' : ''}${hofDealer(d.name) ? ' link' : ''}"${hofDlAttr(d.name)}>
      <span class="hof-rk">${String(i + 1).padStart(2, '0')}</span>
      <span class="hof-ser"><b>${escHtml(d.name)}</b><small>${hofDealer(d.name) ? `✓ Resmi · ${escHtml(hofDealer(d.name).c)} · kontak ›` : `${d.n} prestasi`}</small></span><span class="hof-thumbs"></span>
      <span class="hof-c">${d.g}</span><span class="hof-c">${d.s}</span><span class="hof-c">${d.b}</span>
      <span class="hof-tot"><b>${d.n}</b><i class="hof-bar"><i style="width:${Math.round(d.n / dmax * 100)}%"></i></i></span></div>`).join('');
  // Hasil per kompetisi
  const emap = new Map();
  list.forEach(e => { const k = [e.event, e.city, e.year].join('|'); if (!emap.has(k)) emap.set(k, []); emap.get(k).push(e); });
  const evCards = [...emap.values()].sort((a, b) => (b[0].year || 0) - (a[0].year || 0)).map(items => {
    const e0 = items[0], cnt = pl => items.filter(e => e.place === pl).length;
    return `<section class="hof-card hof-ev">
      <div class="hof-hd"><div class="hof-ttl"><h3>${escHtml(e0.event)}</h3><div class="hof-note">${escHtml([e0.date || e0.year, e0.venue, e0.city].filter(Boolean).join(' · '))}</div></div>
        <div class="hof-pill"><b>${items.length}</b><span>PRESTASI</span><span class="hof-ms">${[1, 2, 3].map(pl => cnt(pl) ? hofMedal(pl, cnt(pl)) : '').join('')}</span></div></div>
      <div class="hof-tblw"><table class="hof-tbl"><thead><tr><th>Kelas</th><th>Juara</th><th>Peserta</th><th>Mobil</th><th>Dealer pemasang</th></tr></thead>
        <tbody>${items.map(e => `<tr onclick="openHofWin('${e.id}')" class="link" title="Klik untuk detail mobil, foto &amp; video"><td>${escHtml(e.cls || '')}</td><td>${hofMedal(e.place)}</td><td>${escHtml(e.name || '—')}</td><td>${escHtml(e.car || '—')}${e.products?.length ? ' <span class="hof-gear">🔧 Lihat perangkat</span>' : ''}${hofGalBtn(e)}</td><td>${hofDealer(e.dealer) ? `<span class="hof-dl">${escHtml(e.dealer)} ›</span>` : escHtml(e.dealer || '—')}</td><td class="hof-mob">${e.products?.length || hofGalBtn(e) ? `${e.products?.length ? '<span class="hof-gear">🔧 Lihat perangkat</span>' : ''}${hofGalBtn(e)}<br>` : ''}${escHtml([e.name, e.car].filter(Boolean).join(' · '))}${e.dealer ? ' · ' + (hofDealer(e.dealer) ? `<span class="hof-dl">${escHtml(e.dealer)} ›</span>` : escHtml(e.dealer)) : ''}</td></tr>`).join('')}</tbody></table></div>
    </section>`;
  }).join('');
  const firsts = list.filter(e => e.place === 1).length;

  box.innerHTML = `
    ${hofIsDemo() ? `<div class="sc-demo">DATA CONTOH — HALL_OF_FAME masih kosong. Hanya Editor yang melihat halaman ini; isi dengan data kompetisi asli sebelum dibuka untuk publik.</div>` : ''}
    <div class="hof-stats"><div><b>${list.length}</b><span>Prestasi</span></div><div><b>${firsts}</b><span>Juara 1</span></div><div><b>${events}</b><span>Kompetisi</span></div>${dealers.length ? `<div><b>${dealers.length}</b><span>Dealer pemasang</span></div>` : ''}</div>
    <div class="hof-filters">
      ${brands.length > 1 ? `<span class="hof-flbl">Brand</span>${chip('brand', 'all', 'Semua', hofBrand === 'all')}${brands.map(b => chip('brand', b, brandName(b), hofBrand === b)).join('')}` : ''}
      ${years.length > 1 ? `<span class="hof-flbl">Tahun</span>${chip('year', 'all', 'Semua', hofYear === 'all')}${years.map(y => chip('year', y, y, hofYear === String(y))).join('')}` : ''}
    </div>
    ${series.length ? `
    <div class="hof-h2">Klasemen Prestasi per Seri</div><div class="hof-sub">Diurutkan berdasarkan jumlah prestasi — bukan harga.</div>
    <div class="hof-board"><div class="hof-row head"><span>#</span><span>Seri</span><span class="hof-thumbs"></span><span class="hof-c">${hofMedal(1)}</span><span class="hof-c">${hofMedal(2)}</span><span class="hof-c">${hofMedal(3)}</span><span class="hof-tot">Total</span></div>${board}</div>
    ${dealers.length ? `<div class="hof-h2">Dealer Pemasang Juara</div><div class="hof-sub">Dealer resmi yang memasang sistem pemenang — diurutkan dari jumlah Juara 1.</div>
    <div class="hof-board"><div class="hof-row head"><span>#</span><span>Dealer</span><span class="hof-thumbs"></span><span class="hof-c">${hofMedal(1)}</span><span class="hof-c">${hofMedal(2)}</span><span class="hof-c">${hofMedal(3)}</span><span class="hof-tot">Total</span></div>${dboard}</div>` : ''}
    ${isEditor() && glItems?.some(glPending) ? `<div class="gl-pbanner">📥 <b>${glItems.filter(glPending).length} kiriman foto/video</b> menunggu persetujuan. <button class="gt-btn" onclick="openGaleri()">Tinjau di Galeri →</button></div>` : ''}
    <div class="hof-h2">Hasil per Kompetisi</div><div class="hof-sub">Daftar lengkap kelas yang dimenangkan — klik baris untuk detail mobil, foto &amp; video.</div>
    ${evCards}
    <div class="hof-h2">Prestasi per Seri</div>
    ${cards}` : '<div class="stock-empty">Tidak ada prestasi untuk filter ini.</div>'}`;
}

/* ══════════════════════════════════════════
   GALERI INSTALASI (Supabase: tabel showcase_installs + bucket publik `showcase`)
══════════════════════════════════════════ */
const GL_TABLE = 'showcase_installs', GL_BUCKET = 'showcase';
const GL_MAKES = ['Toyota', 'Honda', 'Mitsubishi', 'Suzuki', 'Daihatsu', 'Nissan', 'Mazda', 'Hyundai', 'Kia', 'Wuling', 'Chery', 'BYD', 'Isuzu', 'Subaru', 'Lexus', 'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Porsche', 'Mini', 'Volvo', 'Ford',
  // merek mobil listrik / baru (31 Okt 2026, permintaan pemilik)
  'Aion', 'Denza', 'Geely', 'GWM', 'Jaecoo', 'MG', 'Neta', 'Omoda', 'Polytron', 'Seres', 'Tesla', 'VinFast', 'Xpeng', 'Zeekr', 'Lainnya'];
const GL_BODY_GROUPS = [
  ['Bensin / Diesel', ['SUV', 'MPV', 'Sedan', 'Hatchback', 'Double Cabin', 'Coupe']],
  ['Mobil Listrik & Hybrid', ['SUV Listrik (EV)', 'MPV Listrik (EV)', 'Sedan Listrik (EV)', 'Hatchback Listrik (EV)', 'Hybrid (HEV)', 'Plug-in Hybrid (PHEV)']],   // 31 Okt 2026, permintaan pemilik
  ['', ['Lainnya']],
];
const GL_BODIES = GL_BODY_GROUPS.flatMap(g => g[1]);
const glIsEv = b => /listrik|hybrid|\bev\b/i.test(b || '');
const GL_AREAS = ['Dasbor', 'Pintu', 'Tweeter', 'Midrange', 'Bagasi / Sub', 'Amplifier', 'DSP', 'Lainnya'];
const SHOWCASE_SQL = `-- Galeri Instalasi (Showcase) — jalankan sekali di Supabase → SQL Editor → Run
create table if not exists public.showcase_installs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  car_make text not null,
  car_model text not null,
  car_year int,
  body text,
  dealer text,
  city text,
  note text,
  products text[] not null default '{}',
  photos jsonb not null default '[]'::jsonb,
  hof_id text,
  published boolean not null default false,
  sort int not null default 0,
  created_by uuid default auth.uid()
);
alter table public.showcase_installs enable row level security;
create policy "showcase read" on public.showcase_installs for select
  using (published or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));
create policy "showcase write" on public.showcase_installs for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));
insert into storage.buckets (id, name, public) values ('showcase', 'showcase', true) on conflict (id) do nothing;
create policy "showcase upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'showcase' and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));
create policy "showcase update" on storage.objects for update to authenticated
  using (bucket_id = 'showcase' and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));
create policy "showcase delete" on storage.objects for delete to authenticated
  using (bucket_id = 'showcase' and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));`;
let glItems = null, glErr = '', glLoading = null, glMake = 'all', glBody = 'all', glHofOnly = false, glQ = '';
let glEdit = null;   // { id?, …field, photos:[{path?, area, blob?, url}], removed:[path] }

// Video instalasi (31 Okt 2026, permintaan pemilik): disimpan di array photos yang sama dengan type:'video'.
// File sudah dikonversi pemilik — tidak diolah di browser, hanya dibatasi ukurannya (batas unggah Supabase paket gratis 50 MB per file).
const GL_VIDEO_MAX_MB = 50;
/* Kiriman dealer (31 Okt 2026, permintaan pemilik): dealer yang login mengirim foto/video instalasinya → masuk sebagai
   baris source='dealer', published=false (file di Storage `pending/<id>/…`) → tampil hanya setelah Editor menyetujui. */
const GL_SUB_MAX_PHOTOS = 20, GL_SUB_MAX_VIDEOS = 3;
// Menunggu persetujuan Editor: kiriman dealer & simpanan akun Admin staff (31 Okt 2026, permintaan pemilik)
const glPending = it => (it?.source === 'dealer' || it?.source === 'admin') && !it.published;
const glLive = () => (glItems || []).filter(it => !glPending(it));
const GL_SUBMIT_SQL = `-- Kiriman foto/video dari dealer (menunggu persetujuan Editor) — jalankan sekali di Supabase → SQL Editor → Run
alter table public.showcase_installs add column if not exists source text not null default 'editor';
alter table public.showcase_installs add column if not exists submitter text;
alter table public.showcase_installs add column if not exists submitted_at timestamptz;
grant insert on public.showcase_installs to authenticated;
drop policy if exists "showcase dealer submit" on public.showcase_installs;
create policy "showcase dealer submit" on public.showcase_installs for insert to authenticated
  with check (source = 'dealer' and published = false and jsonb_array_length(photos) between 1 and ${GL_SUB_MAX_PHOTOS + GL_SUB_MAX_VIDEOS});
drop policy if exists "showcase dealer upload" on storage.objects;
create policy "showcase dealer upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'showcase' and name like 'pending/%');`;
let glSubmitReady = null;   // null = belum dicek, true/false = kolom kiriman dealer sudah/belum ada
function glSubCopySql() { (navigator.clipboard?.writeText(GL_SUBMIT_SQL) || Promise.reject()).then(() => showToast('✓ SQL disalin — tempel di Supabase → SQL Editor → Run.'), () => prompt('Salin SQL ini:', GL_SUBMIT_SQL)); }
async function glCheckSubmit() {
  if (!supabase || glSubmitReady !== null) return;
  const { error } = await supabase.from('showcase_installs').select('source').limit(1);
  glSubmitReady = !error;
}
const glIsVid = p => p?.type === 'video' || /\.(mp4|m4v|mov|webm)$/i.test(p?.path || '');
const glVidTag = (src, cls = '') => `<video class="${cls}" src="${src}#t=0.5" muted playsinline preload="metadata"></video>`;
const glUrl = path => supabase ? supabase.storage.from(GL_BUCKET).getPublicUrl(path).data.publicUrl : '';
const glTitle = it => [it.car_make, it.car_model].filter(Boolean).join(' ');
const glProd = pid => findProductAny(pid);
function glCopySql() { (navigator.clipboard?.writeText(SHOWCASE_SQL) || Promise.reject()).then(() => showToast('✓ SQL disalin — tempel di Supabase → SQL Editor → Run.'), () => { prompt('Salin SQL ini:', SHOWCASE_SQL); }); }

function loadGaleri(force) {
  if (!supabase) { glErr = 'Koneksi database belum siap.'; return Promise.resolve(); }
  if (glLoading && !force) return glLoading;
  glLoading = (async () => {
    try {
      const { data, error } = await supabase.from(GL_TABLE).select('*').order('sort', { ascending: true }).order('created_at', { ascending: false });
      if (error) throw error;
      glItems = data || []; glErr = '';
    } catch (e) {
      const m = String(e.message || e);
      glItems = [];
      glErr = /relation|does not exist|schema cache|404|PGRST205/i.test(m) ? 'setup' : 'Galeri tidak bisa dimuat: ' + m;
    }
    glLoading = null;
  })();
  return glLoading;
}
async function openGaleri() {
  if (!scOn()) return;
  showView('galeri');
  document.querySelector('.main')?.scrollTo(0, 0);
  adEnsure();
  if (!glItems) { renderGaleri(); await loadGaleri(); }
  renderGaleri();
}
function setGlFilter(kind, v) {
  if (kind === 'make') glMake = v; else if (kind === 'body') glBody = v; else if (kind === 'hof') glHofOnly = !glHofOnly;
  renderGaleri();
}
const glCarSvg = '<svg class="gl-car" viewBox="0 0 200 80" fill="none"><path d="M14 58c0-8 4-12 12-13l26-4 22-17c4-3 9-4 14-4h44c6 0 11 2 15 6l18 17 18 3c7 1 11 6 11 12v4H14v-4Z" fill="rgba(255,255,255,.08)" stroke="currentColor" stroke-width="1.6"/><circle cx="54" cy="64" r="11" fill="#0b0c0e" stroke="currentColor" stroke-width="2"/><circle cx="150" cy="64" r="11" fill="#0b0c0e" stroke="currentColor" stroke-width="2"/></svg>';
function glCard(it) {
  const ph = (it.photos || []).find(p => !glIsVid(p)) || it.photos?.[0];
  const nVid = (it.photos || []).filter(glIsVid).length, nImg = (it.photos || []).length - nVid;
  const prods = (it.products || []).map(pid => glProd(pid).product?.name).filter(Boolean);
  return `<button class="gl-card" onclick="openGlDetail('${it.id}')">
    <span class="gl-ph">${ph ? (glIsVid(ph) ? glVidTag(glUrl(ph.path)) : `<img src="${glUrl(ph.path)}" alt="${escHtml(glTitle(it))}" loading="lazy">`) : glCarSvg}
      ${it.photos?.length ? `<span class="gl-cnt">${[nImg ? `📷 ${nImg}` : '', nVid ? `🎬 ${nVid}` : ''].filter(Boolean).join(' · ')}</span>` : ''}
      ${it.hof_id ? '<span class="gl-tro">🏆 Juara</span>' : ''}
      ${glPending(it) ? '<span class="gl-draft pend">MENUNGGU</span>' : !it.published ? '<span class="gl-draft">DRAF</span>' : ''}</span>
    <span class="gl-bd"><span class="gl-mk">${escHtml(it.car_make || '')}</span>
      <b>${escHtml(it.car_model || '')}${it.car_year ? ` <small>${it.car_year}</small>` : ''}</b>
      ${it.dealer || it.city ? `<span class="gl-dl">🛠 ${escHtml([it.dealer, it.city].filter(Boolean).join(' · '))}</span>` : ''}
      ${prods.length ? `<span class="gl-chips">${prods.slice(0, 4).map(n => `<span>${escHtml(n)}</span>`).join('')}${prods.length > 4 ? `<span>+${prods.length - 4}</span>` : ''}</span>` : ''}
    </span></button>`;
}
function renderGaleri() {
  const box = document.getElementById('gl-body'); if (!box) return;
  const add = isAdmin() ? `<button class="gt-btn confirm" onclick="openGlForm()">＋ Tambah Instalasi</button>`
    : authUser ? `<button class="gt-btn confirm" onclick="openGlSubmit()">📤 Kirim Foto / Video Instalasi Anda</button>`
    : `<button class="gt-btn ghost" onclick="openGlSubmit()">🔑 Dealer resmi? Login untuk kirim foto / video</button>`;
  document.getElementById('gl-tools').innerHTML = add;
  if (isAdmin() && glSubmitReady === null) glCheckSubmit().then(() => { if (document.getElementById('view-galeri')?.classList.contains('active')) renderGaleri(); });
  if (!glItems) { box.innerHTML = '<div class="stock-empty">⏳ Memuat galeri…</div>'; return; }
  if (glErr === 'setup' && !isAdmin()) { box.innerHTML = '<div class="stock-empty">Galeri Instalasi segera hadir.</div>'; document.getElementById('gl-tools').innerHTML = ''; return; }
  if (glErr === 'setup') {
    box.innerHTML = `<div class="vs-warn">Galeri Instalasi belum disiapkan di database. Jalankan SQL ini sekali di Supabase → SQL Editor → Run (membuat tabel <b>showcase_installs</b> + folder foto publik <b>showcase</b>), lalu buka menu ini lagi.<br><br><button class="gt-btn" onclick="glCopySql()">📋 Salin SQL</button></div>`;
    document.getElementById('gl-tools').innerHTML = '';
    return;
  }
  if (glErr) { box.innerHTML = `<div class="vs-warn">${escHtml(isAdmin() ? glErr : 'Galeri belum bisa dimuat. Periksa koneksi internet lalu muat ulang halaman.')}</div>`; return; }
  const pend = isAdmin() ? glItems.filter(glPending) : [];
  // Jalan tengah (31 Okt 2026): mobil juara (ber-hof_id) tidak tampil di daftar Galeri — tempatnya di Hall of Fame;
  // Galeri hanya memberi banner + petunjuk saat pencarian cocok dengan mobil juara
  const all = glLive(), champ = all.filter(it => it.hof_id), live = all.filter(it => !it.hof_id);
  const q = normKey(glQ);
  const hay = it => normKey([it.car_make, it.car_model, it.car_year, it.body, it.dealer, it.city, ...(it.products || []).map(pid => glProd(pid).product?.name)].join(' '));
  const base = live.filter(it => (glBody === 'all' || (glBody === 'ev' ? glIsEv(it.body) : it.body === glBody)) && (!q || hay(it).includes(q)));
  const rows = base.filter(it => glMake === 'all' || it.car_make === glMake);
  const makes = [...new Set(live.map(it => it.car_make).filter(Boolean))].sort();
  const bodies = [...new Set(live.map(it => it.body).filter(Boolean))];
  const hint = glChampHint(champ, q, hay);
  const cnt = m => base.filter(it => m === 'all' || it.car_make === m).length;
  box.innerHTML = `
    ${!SHOWCASE_PUBLIC ? '<div class="sc-demo">PRATINJAU EDITOR — menu Showcase belum tampil untuk publik.</div>' : ''}
    ${isAdmin() && glSubmitReady === false ? `<div class="vs-warn">Kiriman foto/video dari dealer belum aktif. Jalankan SQL ini sekali di Supabase → SQL Editor → Run (menambah kolom kiriman + izin unggah dealer ke folder <b>pending/</b>).<br><br><button class="gt-btn" onclick="glSubCopySql()">📋 Salin SQL Kiriman Dealer</button></div>` : ''}
    ${pend.length ? `<div class="gl-pend"><div class="hof-h2">📥 Kiriman foto/video menunggu persetujuan <span class="gl-pcount">${pend.length}</span></div>
      <div class="hof-sub">Belum terlihat oleh pengunjung. Periksa foto (plat nomor harus diburamkan), lalu setujui atau tolak.</div>
      <div class="gl-grid">${pend.map(it => `<div class="gl-pitem">${glCard(it)}<div class="gl-pby">Dikirim oleh <b>${escHtml(it.submitter || it.dealer || '—')}</b>${it.submitted_at ? ' · ' + escHtml(new Date(it.submitted_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : ''}</div>
        ${isEditor() ? `<div class="gl-pact"><button class="gt-btn confirm" onclick="approveGlItem('${it.id}')">✓ Setujui</button><button class="gt-btn" onclick="openGlForm('${it.id}')">✏️ Edit</button><button class="gt-btn ghost gt-del" onclick="deleteGlItem('${it.id}', true)">✕ Tolak</button></div>` : '<div class="gl-hint">Menunggu persetujuan Editor.</div>'}</div>`).join('')}</div></div>` : ''}
    ${glChampBanner()}
    <div class="gl-search"><span>🔎</span><input type="search" placeholder="Cari mobil Anda — mis. Fortuner, HR-V, Pajero…" value="${escHtml(glQ)}" oninput="glQ=this.value;clearTimeout(window.glQt);window.glQt=setTimeout(()=>{renderGaleri();const i=document.querySelector('.gl-search input');i?.focus();i?.setSelectionRange(i.value.length,i.value.length)},250)"></div>
    ${live.length ? `<div class="gl-makes">${['all', ...makes].map(m => `<button class="gl-make${glMake === m ? ' on' : ''}" onclick="setGlFilter('make','${escHtml(m)}')">${m === 'all' ? 'SEMUA' : escHtml(m.toUpperCase())}<small>${cnt(m)} mobil</small></button>`).join('')}</div>
    <div class="hof-filters">${bodies.length > 1 ? `<button class="filter-chip${glBody === 'all' ? ' active' : ''}" onclick="setGlFilter('body','all')">Semua tipe</button>${bodies.map(b => `<button class="filter-chip${glBody === b ? ' active' : ''}" onclick="setGlFilter('body','${escHtml(b)}')">${escHtml(b)}</button>`).join('')}` : ''}
      ${live.some(it => glIsEv(it.body)) ? `<button class="filter-chip${glBody === 'ev' ? ' active' : ''}" onclick="setGlFilter('body','ev')">⚡ Mobil listrik &amp; hybrid</button>` : ''}
</div>` : ''}
    ${hint}
    ${rows.length ? `<div class="gl-grid">${rows.map(glCard).join('')}</div>` : hint ? ''
      : `<div class="stock-empty">${live.length ? 'Tidak ada instalasi yang cocok. Coba kata kunci lain.' : 'Belum ada instalasi. ' + (isAdmin() ? 'Tekan <b>＋ Tambah Instalasi</b> untuk menambahkan yang pertama.' : '')}</div>`}`;
}

// Banner ke Hall of Fame: jumlah mobil juara (peserta + mobil + dealer berbeda) di data Hall of Fame
function glChampBanner() {
  if (hofIsDemo()) return '';
  const n = new Set(hofData().map(hofCarKey)).size;
  return n ? `<button class="gl-hofban" onclick="openHallOfFame()"><span>🏆</span><b>Lihat mobil juara di Hall of Fame</b><small>${n} mobil</small><em>→</em></button>` : '';
}
// Pencarian / filter merek yang cocok dengan mobil juara di Galeri → petunjuk kecil (mobil itu tidak tampil di daftar)
function glChampHint(champ, q, hay) {
  if (!champ.length || (!q && glMake === 'all')) return '';
  const m = champ.filter(it => (glMake === 'all' || it.car_make === glMake) && (glBody === 'all' || (glBody === 'ev' ? glIsEv(it.body) : it.body === glBody)) && (!q || hay(it).includes(q)));
  if (!m.length) return '';
  const what = q ? `“${escHtml(glQ.trim())}”` : escHtml(glMake);
  return `<div class="gl-champhint">🏆 Ada juga <b>${m.length} mobil juara</b> ${what}: ${m.map(it => `<button onclick="openGlDetail('${it.id}')">${escHtml(glTitle(it))}</button>`).join('')} <button class="lnk" onclick="openHallOfFame()">Hall of Fame →</button></div>`;
}

/* ── Detail instalasi ── */
function glDealer(name) { const n = normKey(name); return n ? adPublic().find(d => normKey(d.n) === n) : null; }
function openGlDetail(id, photoIdx = 0) {
  const it = glItems?.find(x => x.id === id); if (!it) return;
  const ov = document.getElementById('gl-detail');
  const photos = it.photos || [];
  const cur = photos[photoIdx];
  const d = glDealer(it.dealer);
  const hof = it.hof_id ? hofData().find(e => e.id === it.hof_id) : null;
  ov.querySelector('.gl-dbox').innerHTML = `
    <button class="rk-pick-x gl-x" onclick="closeGlDetail()" aria-label="Tutup">✕</button>
    <div class="gl-dgrid">
      <div>
        <div class="gl-big">${cur ? (glIsVid(cur) ? `<video src="${glUrl(cur.path)}" controls playsinline preload="metadata"></video>` : `<img src="${glUrl(cur.path)}" alt="">`) : glCarSvg}${cur?.area ? `<span class="gl-area${glIsVid(cur) ? ' top' : ''}">${escHtml(cur.area)}</span>` : ''}</div>
        ${photos.length > 1 ? `<div class="gl-th">${photos.map((p, i) => `<button class="${i === photoIdx ? 'on' : ''}" onclick="openGlDetail('${it.id}',${i})">${glIsVid(p) ? glVidTag(glUrl(p.path)) + '<i class="gl-play">▶</i>' : `<img src="${glUrl(p.path)}" alt="" loading="lazy">`}${p.area ? `<span>${escHtml(p.area)}</span>` : ''}</button>`).join('')}</div>` : ''}
      </div>
      <div>
        <div class="gl-mk">${escHtml(it.car_make || '')}</div>
        <h3 class="gl-dt">${escHtml(it.car_model || '')}${it.car_year ? ' ' + it.car_year : ''}</h3>
        <div class="gl-tags">${hof ? `<button class="gl-tag g" onclick="closeGlDetail();openHallOfFame('${hofGroupKey(hof)}')">🏆 ${escHtml(hof.award)}${hof.cls ? ' · ' + escHtml(hof.cls) : ''}</button>` : ''}${it.body ? `<span class="gl-tag">${escHtml(it.body)}</span>` : ''}${it.city ? `<span class="gl-tag">${escHtml(it.city)}</span>` : ''}${glPending(it) ? `<span class="gl-tag dr">Kiriman ${escHtml(it.submitter || 'dealer')} — menunggu persetujuan</span>` : !it.published ? '<span class="gl-tag dr">Draf — belum tampil</span>' : ''}</div>
        ${it.note ? `<p class="gl-note">${escHtml(it.note)}</p>` : ''}
        ${(it.products || []).length ? `<div class="hof-lbl">Produk yang dipasang</div>${it.products.map(pid => { const r = glProd(pid); if (!r.product) return ''; const p = r.product;
          return `<button class="gl-prod" onclick="closeGlDetail();showProduct('${r.brand.id}','${p.id}')">${p.photo ? `<img src="${p.photo}" alt="">` : `<span class="hof-ph">${p.emoji}</span>`}<span><b>${escHtml(p.name)}</b><small>${escHtml(r.brand.name)}${r.line ? ' · ' + escHtml(r.line) : ''}</small></span><em>Lihat →</em></button>`; }).join('')}` : ''}
        ${it.dealer ? `<div class="gl-dcard"><div class="hof-lbl">Dipasang oleh</div><b>${escHtml(it.dealer)}${d ? ' <span class="ad-badge">✓ Resmi</span>' : ''}</b><div class="gl-dc">${escHtml(d ? [d.c, d.r].join(', ') : it.city || '')}</div>
          ${d ? `<div class="ad-btns">${d.wa ? `<a class="ad-btn wa" href="https://wa.me/${d.wa}?text=${encodeURIComponent(`Halo ${d.n}, saya lihat contoh instalasi ${glTitle(it)} di CAI Hub (Concerto Audio Indonesia). Saya ingin bertanya.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${d.ig ? `<a class="ad-btn" href="https://www.instagram.com/${encodeURIComponent(d.ig)}/" target="_blank" rel="noopener">Instagram</a>` : ''}<a class="ad-btn" href="${adMaps(d)}" target="_blank" rel="noopener">Maps</a></div>` : ''}</div>` : ''}
        ${isAdmin() ? `<div class="gl-adm"><button class="gt-btn" onclick="closeGlDetail();openGlForm('${it.id}')">✏️ Edit</button><button class="gt-btn ghost gt-del" onclick="deleteGlItem('${it.id}')">🗑 Hapus</button></div>` : ''}
      </div>
    </div>`;
  ov.classList.add('open');
}
function closeGlDetail() { document.getElementById('gl-detail')?.classList.remove('open'); }

/* ── Form tambah / edit (Admin & Editor) ── */
function openGlForm(id) {
  if (!isAdmin()) return;
  const it = id ? glItems?.find(x => x.id === id) : null;
  glEdit = it ? { ...it, products: [...(it.products || [])], photos: (it.photos || []).map(p => ({ ...p, url: glUrl(p.path) })), removed: [] }
    : { car_make: '', car_model: '', car_year: '', body: '', dealer: '', city: '', note: '', products: [], photos: [], hof_id: '', published: false, sort: 0, removed: [] };
  renderGlForm();
  document.getElementById('gl-form').classList.add('open');
}
// Isian awal dari entri Hall of Fame (mobil, dealer, kota, perangkat, prestasi)
function glFromHof(hofId) {
  const h = hofId ? hofData().find(e => e.id === hofId) : null;
  let make = '', model = '';
  if (h?.car) {
    const m = GL_MAKES.find(x => normKey(h.car).startsWith(normKey(x)) && x !== 'Lainnya');
    make = m || ''; model = m ? h.car.slice(m.length).trim() : h.car;
  }
  const d = h ? hofDealer(h.dealer) : null;
  return { car_make: make, car_model: model, car_year: '', body: '', dealer: d?.n || h?.dealer || '', city: d?.c || '', note: '', products: [...(h?.products || [])], photos: [], hof_id: h?.id || '', published: false, sort: 0, removed: [] };
}
// Editor: tambah foto/video mobil juara langsung dari Hall of Fame (form Galeri biasa, prestasi sudah tertaut, langsung tampil)
function openGlForHof(hofId) {
  if (!isAdmin()) return;
  glEdit = { ...glFromHof(hofId), published: isEditor() };
  closeHofDealer();
  renderGlForm();
  document.getElementById('gl-form').classList.add('open');
}
// Dealer: buka form kiriman (hofId = prestasi yang dipilih dari Hall of Fame, diisi otomatis)
function openGlSubmit(hofId) {
  if (!authUser) { requireLogin(() => openGlSubmit(hofId)); return; }
  const g = glFromHof(hofId);
  if (g.dealer && !adPublic().some(d => d.n === g.dealer)) g.dealer = '';
  glEdit = { submit: true, agree: false, ...g };
  closeHofDealer?.();
  renderGlForm();
  document.getElementById('gl-form').classList.add('open');
}
async function submitGlItem() {
  const e = glEdit; if (!e?.submit || !supabase) return;
  if (!e.dealer) { showToast('⚠ Pilih nama dealer Anda dulu.'); return; }
  if (!e.car_make || !String(e.car_model || '').trim()) { showToast('⚠ Isi merek & model mobil.'); return; }
  if (!e.photos.length) { showToast('⚠ Tambahkan minimal 1 foto atau video.'); return; }
  if (!e.agree) { showToast('⚠ Centang pernyataan di bawah (plat nomor diburamkan) dulu.'); return; }
  const btn = document.getElementById('glf-save'); btn.disabled = true;
  const id = crypto.randomUUID(), photos = [];
  try {
    for (let i = 0; i < e.photos.length; i++) {
      const p = e.photos[i];
      const ext = p.video ? ((p.blob.name?.match(/\.(mp4|m4v|mov|webm)$/i)?.[1] || 'mp4').toLowerCase()) : p.blob.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `pending/${id}/${Date.now()}-${i}.${ext}`;
      btn.textContent = `⏳ Mengunggah ${i + 1}/${e.photos.length}…`;
      const type = p.blob.type || (ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4');
      const { error } = await supabase.storage.from(GL_BUCKET).upload(path, p.blob, { contentType: type, cacheControl: '31536000', upsert: false });
      if (error) throw error;
      photos.push(p.video ? { path, area: p.area || '', type: 'video' } : { path, area: p.area || '' });
    }
    btn.textContent = '⏳ Mengirim…';
    const row = { id, car_make: e.car_make, car_model: String(e.car_model).trim(), car_year: e.car_year ? +e.car_year : null, body: e.body || null,
      dealer: e.dealer, city: (e.city || '').trim() || null, note: (e.note || '').trim() || null, products: e.products, photos,
      hof_id: e.hof_id || null, published: false, sort: 0, source: 'dealer', submitter: e.dealer, submitted_at: new Date().toISOString() };
    const { error } = await supabase.from(GL_TABLE).insert(row);   // tanpa .select(): dealer tidak boleh membaca baris yang belum disetujui
    if (error) throw error;
    closeGlForm();
    showToast('✓ Terima kasih! Kiriman Anda diterima & akan tampil setelah disetujui tim CAI.', 7000);
    if (isAdmin()) { await loadGaleri(true); renderGaleri(); }
  } catch (err) {
    const m = String(err.message || err);
    showToast(/row-level|policy|permission|column|schema cache|403|42501|PGRST/i.test(m) ? '⚠ Fitur kiriman dealer belum aktif. Mohon hubungi tim CAI.' : '⚠ Gagal mengirim: ' + m, 7000);
    btn.disabled = false; btn.textContent = '📤 Kirim untuk Ditinjau';
  }
}
function closeGlForm() { document.getElementById('gl-form')?.classList.remove('open'); glEdit?.photos.forEach(p => p.blob && URL.revokeObjectURL(p.url)); glEdit = null; }
const glProdLabel = r => `${r.brand.name} · ${r.product.name}`;
function glProdOptions() {
  return BRANDS.flatMap(b => b.lines.flatMap(l => l.products.map(p => `<option value="${escHtml(b.name + ' · ' + p.name)}"></option>`))).join('');
}
function glField(k, v) { if (glEdit) glEdit[k] = v; }
function glPickDealer(v) {
  glField('dealer', v);
  const d = glDealer(v);
  if (d && !glEdit.city) { glEdit.city = d.c; const c = document.getElementById('glf-city'); if (c) c.value = d.c; }
}
function glAddProduct(input) {
  const v = input.value.trim(); if (!v) return;
  for (const b of BRANDS) for (const l of b.lines) for (const p of l.products)
    if (b.name + ' · ' + p.name === v) { if (!glEdit.products.includes(p.id)) glEdit.products.push(p.id); input.value = ''; renderGlProducts(); return; }
}
function glDelProduct(i) { glEdit.products.splice(i, 1); renderGlProducts(); }
function renderGlProducts() {
  const el = document.getElementById('glf-prods'); if (!el) return;
  el.innerHTML = glEdit.products.map((pid, i) => { const r = glProd(pid); return r.product ? `<span class="gl-pchip">${escHtml(glProdLabel(r))}<button onclick="glDelProduct(${i})" aria-label="Hapus">✕</button></span>` : ''; }).join('') || '<span class="gl-hint">Belum ada produk.</span>';
}
// Foto diperkecil di browser (sisi terpanjang 1600 px, WebP/JPEG) sebelum diunggah
function glResize(file, max = 1600) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b && b.type === 'image/webp' ? res(b) : c.toBlob(j => j ? res(j) : rej(new Error('Gagal memproses foto')), 'image/jpeg', .85), 'image/webp', .82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('File bukan gambar: ' + file.name)); };
    img.src = url;
  });
}
const glCountMedia = vid => glEdit.photos.filter(p => !!(p.video || glIsVid(p)) === vid).length;
async function glAddPhotos(input) {
  const files = [...input.files]; input.value = '';
  for (const f of files) {
    if (glEdit.submit && glCountMedia(false) >= GL_SUB_MAX_PHOTOS) { showToast(`⚠ Maksimal ${GL_SUB_MAX_PHOTOS} foto per kiriman.`); break; }
    try { const blob = await glResize(f); glEdit.photos.push({ blob, url: URL.createObjectURL(blob), area: GL_AREAS[Math.min(glEdit.photos.length, GL_AREAS.length - 1)] }); }
    catch (e) { showToast('⚠ ' + e.message); }
  }
  renderGlPhotos();
}
function glAddVideos(input) {
  const files = [...input.files]; input.value = '';
  for (const f of files) {
    if (glEdit.submit && glCountMedia(true) >= GL_SUB_MAX_VIDEOS) { showToast(`⚠ Maksimal ${GL_SUB_MAX_VIDEOS} video per kiriman.`); break; }
    if (!/^video\//.test(f.type) && !/\.(mp4|m4v|mov|webm)$/i.test(f.name)) { showToast('⚠ Bukan file video: ' + f.name); continue; }
    const mb = f.size / 1048576;
    if (mb > GL_VIDEO_MAX_MB) { showToast(`⚠ ${f.name} ${mb.toFixed(1)} MB — maksimal ${GL_VIDEO_MAX_MB} MB per video. Kompres dulu lalu unggah lagi.`, 7000); continue; }
    glEdit.photos.push({ blob: f, video: true, url: URL.createObjectURL(f), size: f.size, area: 'Lainnya' });
  }
  renderGlPhotos();
}
function glPhotoArea(i, v) { glEdit.photos[i].area = v; }
function glPhotoMove(i, d) { const a = glEdit.photos, j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; renderGlPhotos(); }
function glPhotoDel(i) { const [p] = glEdit.photos.splice(i, 1); if (p.path) glEdit.removed.push(p.path); if (p.blob) URL.revokeObjectURL(p.url); renderGlPhotos(); }
function renderGlPhotos() {
  const el = document.getElementById('glf-photos'); if (!el) return;
  const first = glEdit.photos.findIndex(p => !(p.video || glIsVid(p)));
  el.innerHTML = glEdit.photos.map((p, i) => `<div class="gl-fph">${p.video || glIsVid(p) ? `<div class="gl-fvid"><video src="${p.url}${p.blob ? '' : '#t=0.5'}" muted playsinline preload="metadata"></video><i class="gl-play">▶</i>${p.size ? `<span class="gl-vsz">${(p.size / 1048576).toFixed(1)} MB</span>` : ''}</div>` : `<img src="${p.url}" alt="">`}
      <select onchange="glPhotoArea(${i},this.value)">${GL_AREAS.map(a => `<option${a === p.area ? ' selected' : ''}>${a}</option>`).join('')}</select>
      <div class="gl-fpb"><button onclick="glPhotoMove(${i},-1)" title="Geser kiri">◀</button>${i === first ? '<span>Utama</span>' : ''}<button onclick="glPhotoMove(${i},1)" title="Geser kanan">▶</button><button onclick="glPhotoDel(${i})" title="Hapus">🗑</button></div></div>`).join('')
    || '<span class="gl-hint">Belum ada foto/video. Foto pertama = foto utama. Pastikan plat nomor sudah diburamkan.</span>';
}
function renderGlForm() {
  const e = glEdit, box = document.querySelector('#gl-form .gl-fbox');
  const opt = (arr, v) => arr.map(a => `<option${a === v ? ' selected' : ''}>${escHtml(a)}</option>`).join('');
  const hofs = HALL_OF_FAME;
  box.innerHTML = `
    <div class="rk-pick-hd"><div class="rk-pick-t">${e.submit ? '📤 Kirim Foto / Video Instalasi' : (e.id ? 'Edit' : 'Tambah') + ' Instalasi'}</div><button class="rk-pick-x" onclick="closeGlForm()" aria-label="Tutup">✕</button></div>
    ${e.submit ? `<div class="gl-subnote">Kiriman Anda <b>ditinjau dulu oleh tim CAI</b> sebelum tampil di Galeri Instalasi${hofs.length ? ' & Hall of Fame' : ''}. Maksimal ${GL_SUB_MAX_PHOTOS} foto + ${GL_SUB_MAX_VIDEOS} video.</div>` : ''}
    <div class="gl-fgrid">
      <label>Merek mobil<select onchange="glField('car_make',this.value)"><option value="">— pilih —</option>${opt(GL_MAKES, e.car_make)}</select></label>
      <label>Model<input value="${escHtml(e.car_model)}" placeholder="mis. Fortuner VRZ" oninput="glField('car_model',this.value)"></label>
      <label>Tahun<input type="number" min="1980" max="2100" value="${escHtml(e.car_year ?? '')}" oninput="glField('car_year',this.value)"></label>
      <label>Tipe<select onchange="glField('body',this.value)"><option value="">—</option>${GL_BODY_GROUPS.map(([g, arr]) => g ? `<optgroup label="${g}">${opt(arr, e.body)}</optgroup>` : opt(arr, e.body)).join('')}</select></label>
      ${e.submit ? `<label class="w2">Nama dealer Anda *<select onchange="glPickDealer(this.value)"><option value="">— pilih dealer —</option>${opt([...new Set(adPublic().map(d => d.n))].sort(), e.dealer)}</select></label>`
        : `<label class="w2">Dealer pemasang<input list="glf-dealers" value="${escHtml(e.dealer)}" placeholder="Ketik / pilih dealer resmi" oninput="glPickDealer(this.value)"><datalist id="glf-dealers">${[...new Set(adPublic().map(d => d.n))].map(n => `<option value="${escHtml(n)}"></option>`).join('')}</datalist></label>`}
      <label${e.submit ? ' class="w2"' : ''}>Kota<input id="glf-city" value="${escHtml(e.city)}" oninput="glField('city',this.value)"></label>
      ${e.submit ? '' : `<label>Urutan<input type="number" value="${escHtml(e.sort ?? 0)}" title="Angka kecil tampil lebih dulu" oninput="glField('sort',this.value)"></label>`}
      <label class="w4">Catatan singkat<textarea rows="2" placeholder="mis. Upgrade full system dengan DSP — vokal jernih, bass rapi." oninput="glField('note',this.value)">${escHtml(e.note)}</textarea></label>
      <div class="w4"><div class="gl-flbl">Produk yang dipasang</div>
        <input list="glf-plist" placeholder="Ketik nama produk lalu pilih…" onchange="glAddProduct(this)"><datalist id="glf-plist">${glProdOptions()}</datalist>
        <div class="gl-pchips" id="glf-prods"></div></div>
      <label class="w2">Prestasi (Hall of Fame)<select onchange="glField('hof_id',this.value)"><option value="">— tidak ada —</option>${hofs.map(h => `<option value="${escHtml(h.id)}"${h.id === e.hof_id ? ' selected' : ''}>${escHtml([`${h.award} · ${h.cls || ''}`, h.name, h.car, `${h.event} ${h.year || ''}`].filter(Boolean).join(' · '))}</option>`).join('')}</select></label>
      ${e.submit ? '' : !isEditor() ? '<div class="w2 gl-hint">⏳ Setelah disimpan, foto/video menunggu persetujuan Editor sebelum tampil.</div>' : `<label class="w2 gl-pub"><input type="checkbox"${e.published ? ' checked' : ''} onchange="glField('published',this.checked)"> ${glPending(e) ? 'Setujui &amp; tampilkan' : 'Tampilkan (bukan draf)'}</label>`}
      <div class="w4"><div class="gl-flbl">Foto & Video <small>(foto otomatis diperkecil; video diunggah apa adanya)</small></div>
        <div class="gl-upr"><label class="gt-btn gl-up">📷 Tambah Foto<input type="file" accept="image/*" multiple hidden onchange="glAddPhotos(this)"></label><label class="gt-btn gl-up">🎬 Tambah Video<input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" multiple hidden onchange="glAddVideos(this)"></label></div>
        <div class="gl-hint gl-vhint">Video: MP4 (H.264), maksimal ${GL_VIDEO_MAX_MB} MB per file — disarankan ≤ 30 MB agar cepat diputar di HP. Video tidak dikompres ulang di sini.</div>
        <div class="gl-fphotos" id="glf-photos"></div></div>
      ${e.submit ? `<label class="w4 gl-pub gl-agree"><input type="checkbox"${e.agree ? ' checked' : ''} onchange="glField('agree',this.checked)"> Foto/video ini milik dealer kami, <b>plat nomor sudah diburamkan</b>, dan pemilik mobil tidak keberatan ditampilkan.</label>` : ''}
    </div>
    <div class="gl-factions"><button class="gt-btn ghost" onclick="closeGlForm()">Batal</button>${e.submit ? '<button class="gt-btn confirm" id="glf-save" onclick="submitGlItem()">📤 Kirim untuk Ditinjau</button>' : '<button class="gt-btn confirm" id="glf-save" onclick="saveGlItem()">💾 Simpan</button>'}</div>`;
  renderGlProducts(); renderGlPhotos();
}
async function saveGlItem() {
  const e = glEdit; if (!e || !supabase) return;
  if (!e.car_make || !String(e.car_model || '').trim()) { showToast('⚠ Isi merek & model mobil dulu.'); return; }
  const btn = document.getElementById('glf-save'); btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
  try {
    const row = { car_make: e.car_make, car_model: String(e.car_model).trim(), car_year: e.car_year ? +e.car_year : null, body: e.body || null,
      dealer: (e.dealer || '').trim() || null, city: (e.city || '').trim() || null, note: (e.note || '').trim() || null, products: e.products,
      hof_id: e.hof_id || null, published: !!e.published, sort: +e.sort || 0, updated_at: new Date().toISOString() };
    if (!isEditor()) Object.assign(row, { published: false, source: 'admin', submitter: 'Admin staff', submitted_at: new Date().toISOString() });
    let id = e.id;
    if (!id) {
      const { data, error } = await supabase.from(GL_TABLE).insert({ ...row, photos: [] }).select('id').single();
      if (error) throw error; id = data.id;
    }
    const photos = [];
    for (let i = 0; i < e.photos.length; i++) {
      const p = e.photos[i];
      if (p.blob) {
        const ext = p.video ? ((p.blob.name.match(/\.(mp4|m4v|mov|webm)$/i)?.[1] || 'mp4').toLowerCase()) : p.blob.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${id}/${Date.now()}-${i}.${ext}`;
        btn.textContent = `⏳ Mengunggah ${p.video ? 'video' : 'foto'} ${i + 1}/${e.photos.length}…`;
        const type = p.blob.type || (ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4');
        const { error } = await supabase.storage.from(GL_BUCKET).upload(path, p.blob, { contentType: type, cacheControl: '31536000', upsert: false });
        if (error) throw new Error(/exceeded|too large|413|maximum/i.test(error.message || '') ? `${p.video ? 'Video' : 'Foto'} terlalu besar untuk batas unggah Supabase (${error.message})` : error.message);
        photos.push(p.video ? { path, area: p.area || '', type: 'video' } : { path, area: p.area || '' });
      } else photos.push(glIsVid(p) ? { path: p.path, area: p.area || '', type: 'video' } : { path: p.path, area: p.area || '' });
    }
    const { error } = await supabase.from(GL_TABLE).update({ ...row, photos }).eq('id', id);
    if (error) throw error;
    if (e.removed.length) await supabase.storage.from(GL_BUCKET).remove(e.removed);
    closeGlForm();
    showToast(isEditor() ? '✓ Instalasi disimpan' : '✓ Disimpan — tampil setelah disetujui Editor', 5000);
    await loadGaleri(true); renderGaleri(); refreshProductShowcase();
    if (document.getElementById('view-halloffame')?.classList.contains('active')) renderHallOfFame();
  } catch (err) {
    showToast('⚠ Gagal menyimpan: ' + (err.message || err), 6000);
    btn.disabled = false; btn.textContent = '💾 Simpan';
  }
}
async function approveGlItem(id) {
  const it = glItems?.find(x => x.id === id); if (!it || !isEditor()) return;
  const { error } = await supabase.from(GL_TABLE).update({ published: true, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('⚠ Gagal menyetujui: ' + error.message, 6000); return; }
  showToast(`✓ ${glTitle(it)} disetujui — kini tampil di Galeri${it.hof_id ? ' & Hall of Fame' : ''}`);
  await loadGaleri(true); renderGaleri(); refreshProductShowcase();
}
async function deleteGlItem(id, reject) {
  const it = glItems?.find(x => x.id === id); if (!it || !isAdmin()) return;
  if (!confirm(reject ? `Tolak kiriman ${glTitle(it)} dari ${it.submitter || 'dealer'}?\n\nKiriman & semua foto/videonya dihapus permanen.` : `Hapus instalasi ${glTitle(it)}${it.car_year ? ' ' + it.car_year : ''} beserta fotonya?`)) return;
  try {
    const { error } = await supabase.from(GL_TABLE).delete().eq('id', id);
    if (error) throw error;
    const paths = (it.photos || []).map(p => p.path).filter(Boolean);
    if (paths.length) await supabase.storage.from(GL_BUCKET).remove(paths);
    closeGlDetail(); showToast(reject ? '✓ Kiriman ditolak & dihapus' : '✓ Instalasi dihapus');
    await loadGaleri(true); renderGaleri(); refreshProductShowcase();
  } catch (err) { showToast('⚠ Gagal menghapus: ' + (err.message || err), 6000); }
}

/* ══════════════════════════════════════════
   HALAMAN PRODUK — Achievement + Contoh pemasangan (dipanggil showProduct di core.js)
══════════════════════════════════════════ */
let scProduct = null;
function renderProductShowcase(product, lineName, brand) {
  scProduct = { product, lineName, brand };
  const el = document.getElementById('product-showcase'); if (!el) return;
  if (!scOn()) { el.innerHTML = ''; return; }
  const hof = hofForProduct(brand.id, lineName, product.id).sort(hofSort);
  const lineTotal = lineName ? hofLineCount(brand.id, lineName) : 0;
  const key = hof[0] && !hof[0].line ? hofGroupKey(hof[0]) : hofKey(brand.id, lineName || '');
  const ach = hof.length ? `<div class="psc-ach">
      <div class="psc-t">🏆 Achievement — <b>${hof.length} prestasi</b>${lineName && lineTotal ? ` bersama ${escHtml(lineName)}` : ''}${hofIsDemo() ? ' <span class="sc-tag">DATA CONTOH</span>' : ''}</div>
      <ul>${hof.slice(0, 3).map(e => `<li${e.products?.length ? ` class="link" onclick="openHallOfFame();openHofWin('${e.id}')"` : ''}>${hofMedal(e.place)}<span><b>${escHtml(e.award)}${e.cls ? ' · ' + escHtml(e.cls) : ''}</b> — ${escHtml([e.event, e.city, e.year].filter(Boolean).join(' '))}${e.car ? ` · ${escHtml(e.car)}` : ''}</span></li>`).join('')}</ul>
      <button class="psc-link" onclick="openHallOfFame('${key}')">Lihat semua prestasi di Hall of Fame →</button></div>` : '';
  if (!glItems && !glLoading && supabase) loadGaleri().then(() => { if (scProduct?.product === product) renderProductShowcase(product, lineName, brand); });
  const inst = glLive().filter(it => (it.products || []).includes(product.id)).sort((a, b) => (b.hof_id ? 1 : 0) - (a.hof_id ? 1 : 0));   // mobil juara di depan
  const gal = inst.length ? `<div class="psc-gal"><div class="psc-t">🚗 Contoh pemasangan <span>— ${inst.length} mobil memakai produk ini</span></div>
      <div class="gl-grid psc-grid">${inst.slice(0, 4).map(glCard).join('')}</div>
      ${inst.length > 4 ? `<button class="psc-link" onclick="glQ='${escHtml(product.name).replace(/'/g, '')}';openGaleri()">Lihat semua di Galeri Instalasi →</button>` : ''}</div>` : '';
  el.innerHTML = ach + gal;
}
function refreshProductShowcase() {
  if (scProduct && document.getElementById('view-product')?.classList.contains('active')) renderProductShowcase(scProduct.product, scProduct.lineName, scProduct.brand);
}
// Dipanggil updateAuthUI() (stock.js) tiap status login berubah
function scAuthChanged() {
  if (!scOn() && ['view-halloffame', 'view-galeri'].some(id => document.getElementById(id)?.classList.contains('active'))) showView('dashboard');
  glItems = null;   // muat ulang sesuai hak akun baru (draf hanya untuk Admin/Editor)
  if (typeof adAuthChanged === 'function') adAuthChanged();
  refreshProductShowcase();
}
