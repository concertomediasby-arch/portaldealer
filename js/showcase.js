/* CAI Hub (Concerto Audio Indonesia) — js/showcase.js
   SHOWCASE (31 Okt 2026, permintaan pemilik): 🏆 Hall of Fame (prestasi kompetisi per seri speaker, data HALL_OF_FAME
   di katalog.js) + 🚗 Galeri Instalasi (contoh pemasangan per mobil, tabel Supabase showcase_installs + Storage publik
   `showcase`). Dibuka untuk publik 31 Okt 2026 (SHOWCASE_PUBLIC = true; sebelumnya hanya Editor).
   Dimuat setelah videotron.js; dipanggil dari core.js (showProduct/renderProducts/productCard) & stock.js (updateAuthUI). */

const SHOWCASE_PUBLIC = true;   // dibuka untuk publik 31 Okt 2026 (permintaan pemilik); true = menu & bagian Showcase tampil untuk semua pengunjung
const scOn = () => SHOWCASE_PUBLIC || isEditor();
// 2 Nov 2026 (permintaan pemilik): kiriman foto/video dari dealer (dan akun Admin staff) DINONAKTIFKAN sementara —
// hanya Editor yang bisa menambah/mengubah media Galeri. Aktifkan lagi: GL_DEALER_SUBMIT = true.
const GL_DEALER_SUBMIT = false;
const glCanEdit = () => GL_DEALER_SUBMIT ? isAdmin() : isEditor();

/* ══════════════════════════════════════════
   HALL OF FAME
══════════════════════════════════════════ */
// Data contoh — HANYA tampil untuk Editor selama HALL_OF_FAME masih kosong (nama kompetisi sengaja placeholder)
const HOF_DEMO = [
  { id:'demo-1', event:'[Nama Kompetisi]', city:'Jakarta',  year:2026, cls:'SQ Pemula',  place:1, award:'Juara 1', brand:'audiocircle', line:'Stuttgart Line', car:'Toyota Fortuner', dealer:'[Nama Partner]' },
  { id:'demo-2', event:'[Nama Kompetisi]', city:'Surabaya', year:2025, cls:'Kelas 2-Way', place:0, award:'Best Sound Quality', brand:'audiocircle', line:'Stuttgart Line', car:'Honda HR-V', dealer:'[Nama Partner]' },
  { id:'demo-3', event:'[Nama Kompetisi]', city:'Bandung',  year:2025, cls:'SQ Entry',   place:2, award:'Juara 2', brand:'audiocircle', line:'Stuttgart Line', car:'Mitsubishi Pajero Sport', dealer:'[Nama Partner]' },
  { id:'demo-4', event:'[Nama Kompetisi]', city:'Semarang', year:2024, cls:'SQ Pemula',  place:3, award:'Juara 3', brand:'audiocircle', line:'Stuttgart Line', car:'Toyota Innova Zenix', dealer:'[Nama Partner]' },
  { id:'demo-5', event:'[Nama Kompetisi]', city:'Malang',   year:2025, cls:'SQ Entry',   place:1, award:'Juara 1', brand:'audiocircle', line:'Frankfurt Line', car:'Toyota Rush', dealer:'[Nama Partner]' },
  { id:'demo-6', event:'[Nama Kompetisi]', city:'Jakarta',  year:2024, cls:'SQ 2-Way',   place:2, award:'Juara 2', brand:'audiocircle', line:'Frankfurt Line' },
  { id:'demo-7', event:'[Nama Kompetisi]', city:'Surabaya', year:2026, cls:'SQ Expert',  place:1, award:'Juara 1', brand:'audiocircle', line:'Pro Line', car:'BMW 320i', dealer:'[Nama Partner]' },
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
    <div class="hof-dlhd"><div class="hof-lbl">Partner pemasang juara</div>
      <h3 class="gl-dt">${escHtml(d.n)} <span class="ad-badge">✓ Resmi</span></h3>
      <div class="gl-dc">📍 ${escHtml([d.c, d.r].filter(Boolean).join(', '))}</div>
      ${d.a ? `<div class="ad-addr">${escHtml(d.a)}</div>` : ''}
      <div class="ad-btns">${d.wa ? `<a class="ad-btn wa" href="https://wa.me/${d.wa}?text=${encodeURIComponent(`Halo ${d.n}, saya lihat prestasi kompetisi Anda di Hall of Fame CAI Hub (Concerto Audio Indonesia). Saya ingin bertanya.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${d.ig ? `<a class="ad-btn" href="https://www.instagram.com/${encodeURIComponent(d.ig)}/" target="_blank" rel="noopener">Instagram</a>` : ''}<a class="ad-btn" href="${adMaps(d)}" target="_blank" rel="noopener">Maps</a>${pfBtn(d, 'closeHofDealer()')}</div></div>
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
      <button class="gt-btn ghost hof-galwide" onclick="hofShare('${e.id}')">${SHARE_ICON} Bagikan</button>
      ${!GL_DEALER_SUBMIT ? '' : authUser && !isAdmin() ? `<button class="gt-btn confirm hof-galwide" onclick="openGlSubmit('${e.id}')">📤 Kirim foto / video mobil ini</button>`
        : !authUser ? `<button class="gt-btn ghost hof-galwide" onclick="openGlSubmit('${e.id}')">🔑 Partner pemasang? Login untuk kirim foto / video</button>` : ''}
      ${glCanEdit() ? (hofGallery(e) ? `<button class="gt-btn confirm hof-galwide" onclick="closeHofDealer();openGlForm('${hofGallery(e).id}')">✏️ Tambah / ubah foto &amp; video mobil ini</button>`
        : `<button class="gt-btn confirm hof-galwide" onclick="openGlForHof('${e.id}')">＋ Tambah foto / video mobil ini</button>`) : ''}
      ${GL_DEALER_SUBMIT && isAdmin() && !isEditor() ? '<div class="gl-hint">Foto/video dari akun Admin tampil setelah disetujui Editor.</div>' : ''}
      ${hofPendingFor(e).length ? `<div class="gl-hint">⏳ ${hofPendingFor(e).length} kiriman foto/video mobil ini menunggu persetujuan Editor.</div>` : ''}</div>
    ${prods.length || e.other?.length ? `<div class="hof-lbl" style="margin-top:16px">Perangkat yang dipakai</div>
      ${prods.map(r => { const p = r.product;
        return `<button class="gl-prod" onclick="closeHofDealer();showProduct('${r.brand.id}','${p.id}')">${p.photo ? `<img src="${p.photo}" alt="">` : `<span class="hof-ph">${p.emoji}</span>`}<span><b>${escHtml(p.name)}</b><small>${escHtml(r.brand.name)}${r.line ? ' · ' + escHtml(r.line) : ''}</small></span><em>Lihat →</em></button>`; }).join('')}
      ${(e.other || []).map(t => `<div class="gl-prod hof-oth"><span class="hof-ph">🔧</span><span><b>${escHtml(t)}</b><small>Belum ada di katalog</small></span></div>`).join('')}` : ''}
    ${e.dealer ? `<div class="gl-dcard"><div class="hof-lbl">Dipasang oleh</div><b>${escHtml(e.dealer)}${d ? ' <span class="ad-badge">✓ Resmi</span>' : ''}</b>${d ? `<div class="gl-dc">${escHtml([d.c, d.r].join(', '))}</div>
      <div class="ad-btns">${d.wa ? `<a class="ad-btn wa" href="https://wa.me/${d.wa}?text=${encodeURIComponent(`Halo ${d.n}, saya lihat ${e.car || 'mobil'} juara ${e.event} di Hall of Fame CAI Hub (Concerto Audio Indonesia). Saya ingin bertanya.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${d.ig ? `<a class="ad-btn" href="https://www.instagram.com/${encodeURIComponent(d.ig)}/" target="_blank" rel="noopener">Instagram</a>` : ''}<a class="ad-btn" href="${adMaps(d)}" target="_blank" rel="noopener">Maps</a>${pfBtn(d, 'closeHofDealer()')}</div>` : ''}</div>` : ''}`;
  document.getElementById('hof-dealer').classList.add('open');
  const g = hofGallery(e), ph = g && (g.photos || []).find(p => !glIsVid(p));
  if (ph) sharePrep('h:' + e.id, glUrl(ph.path), 'Hall-of-Fame-CAI');
}
/* ── Bagikan prestasi Hall of Fame (3 Nov 2026, permintaan pemilik): foto mobil dari Galeri (bila ada) + teks + link ?hof=<id> ── */
function hofShare(id) {
  const e = hofData().find(x => x.id === id); if (!e) return;
  const prods = (e.products || []).map(pid => findProductAny(pid).product?.name).filter(Boolean);
  const text = `🏆 *${e.award}${e.cls ? ' — ' + e.cls : ''}*\n${[e.event, e.city, e.year].filter(Boolean).join(' · ')}` +
    (e.car ? `\n🚗 ${e.car}${e.name ? ' (' + e.name + ')' : ''}` : '') +
    (e.dealer ? `\n🔧 Dipasang oleh ${e.dealer}` : '') +
    (prods.length ? `\nPerangkat: ${prods.slice(0, 6).join(', ')}${prods.length > 6 ? ', …' : ''}` : '') +
    `\n\nLihat Hall of Fame CAI Hub:\n${HALL_OF_FAME.some(x => x.id === e.id) ? sharePage('h', e.id) : PORTAL_URL + '/?hof=' + encodeURIComponent(e.id)}`;
  shareWa(text, 'h:' + e.id);
}
function hofOpenLinked(id) {
  openHallOfFame();
  if (hofData().some(x => x.id === id)) openHofWin(id); else showToast('Prestasi ini tidak ditemukan.');
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
      <div class="hof-tblw"><table class="hof-tbl"><thead><tr><th>Kelas</th><th>Juara</th><th>Peserta</th><th>Mobil</th><th>Partner pemasang</th></tr></thead>
        <tbody>${items.map(e => `<tr onclick="openHofWin('${e.id}')" class="link" title="Klik untuk detail mobil, foto &amp; video"><td>${escHtml(e.cls || '')}</td><td>${hofMedal(e.place)}</td><td>${escHtml(e.name || '—')}</td><td>${escHtml(e.car || '—')}${e.products?.length ? ' <span class="hof-gear">🔧 Lihat perangkat</span>' : ''}${hofGalBtn(e)}</td><td>${hofDealer(e.dealer) ? `<span class="hof-dl">${escHtml(e.dealer)} ›</span>` : escHtml(e.dealer || '—')}</td><td class="hof-mob">${e.products?.length || hofGalBtn(e) ? `${e.products?.length ? '<span class="hof-gear">🔧 Lihat perangkat</span>' : ''}${hofGalBtn(e)}<br>` : ''}${escHtml([e.name, e.car].filter(Boolean).join(' · '))}${e.dealer ? ' · ' + (hofDealer(e.dealer) ? `<span class="hof-dl">${escHtml(e.dealer)} ›</span>` : escHtml(e.dealer)) : ''}</td></tr>`).join('')}</tbody></table></div>
    </section>`;
  }).join('');
  const firsts = list.filter(e => e.place === 1).length;

  box.innerHTML = `
    ${hofIsDemo() ? `<div class="sc-demo">DATA CONTOH — HALL_OF_FAME masih kosong. Hanya Editor yang melihat halaman ini; isi dengan data kompetisi asli sebelum dibuka untuk publik.</div>` : ''}
    <div class="hof-stats"><div><b>${list.length}</b><span>Prestasi</span></div><div><b>${firsts}</b><span>Juara 1</span></div><div><b>${events}</b><span>Kompetisi</span></div>${dealers.length ? `<div><b>${dealers.length}</b><span>Partner pemasang</span></div>` : ''}</div>
    <div class="hof-filters">
      ${brands.length > 1 ? `<span class="hof-flbl">Brand</span>${chip('brand', 'all', 'Semua', hofBrand === 'all')}${brands.map(b => chip('brand', b, brandName(b), hofBrand === b)).join('')}` : ''}
      ${years.length > 1 ? `<span class="hof-flbl">Tahun</span>${chip('year', 'all', 'Semua', hofYear === 'all')}${years.map(y => chip('year', y, y, hofYear === String(y))).join('')}` : ''}
    </div>
    ${series.length ? `
    <!-- Klasemen Prestasi per Seri dihapus 2 Nov 2026 (permintaan pemilik) -->
    ${dealers.length ? `<div class="hof-h2">Partner Pemasang Juara</div><div class="hof-sub">Partner resmi yang memasang sistem pemenang — diurutkan dari jumlah Juara 1.</div>
    <div class="hof-board"><div class="hof-row head"><span>#</span><span>Partner</span><span class="hof-thumbs"></span><span class="hof-c">${hofMedal(1)}</span><span class="hof-c">${hofMedal(2)}</span><span class="hof-c">${hofMedal(3)}</span><span class="hof-tot">Total</span></div>${dboard}</div>` : ''}
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
// Keterangan foto/video (31 Okt 2026, permintaan pemilik — ditambah peredam, midbass, coaxial, RCA, fuse, dll.)
const GL_AREA_GROUPS = [
  ['Mobil', ['Tampak Luar', 'Interior', 'Dasbor', 'Pintu', 'Bagasi / Sub']],
  ['Speaker', ['Tweeter', 'Midrange', 'Midbass', 'Coaxial', 'Subwoofer', 'Box Subwoofer']],
  ['Perangkat', ['Head Unit', 'DSP', 'Amplifier', 'Remote / Controller']],
  ['Kabel & Instalasi', ['Kabel RCA', 'Kabel Power', 'Kabel Speaker', 'Fuse / Distribution Block', 'Aki / Kapasitor', 'Peredam', 'Rak / Panel Custom', 'Wiring / Kerapian']],
  ['', ['Lainnya']],
];
const GL_AREAS = GL_AREA_GROUPS.flatMap(g => g[1]);
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
  using (bucket_id = 'showcase' and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));
-- izin baca daftar file untuk Admin/Editor (dibutuhkan saat menimpa file — upsert — & menghapus file)
create policy "showcase staff read" on storage.objects for select to authenticated
  using (bucket_id = 'showcase' and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));`;
let glItems = null, glErr = '', glLoading = null, glMake = 'all', glBody = 'all', glHofOnly = false, glQ = '';
let glLoadedAt = 0, glSchedT = null;
// Muat ulang Galeri tepat saat mobil terjadwal tayang (Editor melihat kartunya pindah dari antrian ke daftar)
function glSchedTimer() {
  clearTimeout(glSchedT);
  const next = (glItems || []).filter(glSched).map(it => Date.parse(it.publish_at)).sort((a, b) => a - b)[0];
  if (next) glSchedT = setTimeout(() => { if (document.getElementById('view-galeri')?.classList.contains('active')) renderGaleri(); glSchedTimer(); }, Math.min(next - Date.now() + 1500, 2 ** 31 - 1));
}
let glEdit = null;   // { id?, …field, photos:[{path?, area, blob?, url}], removed:[path] }

// Video instalasi (31 Okt 2026, permintaan pemilik): disimpan di array photos yang sama dengan type:'video'.
// File sudah dikonversi pemilik — tidak diolah di browser, hanya dibatasi ukurannya (batas unggah Supabase paket gratis 50 MB per file).
const GL_VIDEO_MAX_MB = 50;
/* Kiriman dealer (31 Okt 2026, permintaan pemilik): dealer yang login mengirim foto/video instalasinya → masuk sebagai
   baris source='dealer', published=false (file di Storage `pending/<id>/…`) → tampil hanya setelah Editor menyetujui. */
const GL_SUB_MAX_PHOTOS = 10, GL_SUB_MAX_VIDEOS = 2;   // 31 Okt 2026, permintaan pemilik (sempat 20 foto + 3 video)
// Menunggu persetujuan Editor: kiriman dealer & simpanan akun Admin staff (31 Okt 2026, permintaan pemilik)
const glPending = it => (it?.source === 'dealer' || it?.source === 'admin') && !it.published;
// Jadwal tayang Galeri (4 Nov 2026, permintaan pemilik): published + publish_at di masa depan = terjadwal. Sebelum jamnya
// RLS hanya mengizinkan Admin/Editor membaca baris itu; notifikasi 🚗 dikirim jadwal cway-push tepat pada jamnya.
const glSched = it => !!(it?.published && it.publish_at && Date.parse(it.publish_at) > Date.now());
const glWhen = iso => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':') + ' WIB';
const glLive = () => (glItems || []).filter(it => !glPending(it) && !glSched(it));
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
const glVidTag = (src, cls = '', p = null) => `<video class="${cls}" src="${src}#t=0.5" muted playsinline preload="metadata"${p ? glFrAttr(p) : ''}></video>`;
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
      glItems = data || []; glErr = ''; glLoadedAt = Date.now(); glSchedTimer();
    } catch (e) {
      const m = String(e.message || e);
      glItems = [];
      glErr = /relation|does not exist|schema cache|404|PGRST205/i.test(m) ? 'setup' : 'Galeri tidak bisa dimuat: ' + m;
    }
    glLoading = null;
    if (typeof carsRerender === 'function') carsRerender();   // Cari per Mobil / Profil Partner / kotak Dashboard (js/cars.js)
  })();
  return glLoading;
}
async function openGaleri() {
  if (!scOn()) return;
  showView('galeri');
  document.querySelector('.main')?.scrollTo(0, 0);
  adEnsure();
  if (!glItems) { renderGaleri(); await loadGaleri(); }
  else if (Date.now() - glLoadedAt > 120e3) loadGaleri(true).then(() => { if (document.getElementById('view-galeri')?.classList.contains('active')) renderGaleri(); });
  renderGaleri();
}
function setGlFilter(kind, v) {
  if (kind === 'make') glMake = v; else if (kind === 'body') glBody = v; else if (kind === 'hof') glHofOnly = !glHofOnly;
  renderGaleri();
}
const glCarSvg = '<svg class="gl-car" viewBox="0 0 200 80" fill="none"><path d="M14 58c0-8 4-12 12-13l26-4 22-17c4-3 9-4 14-4h44c6 0 11 2 15 6l18 17 18 3c7 1 11 6 11 12v4H14v-4Z" fill="rgba(255,255,255,.08)" stroke="currentColor" stroke-width="1.6"/><circle cx="54" cy="64" r="11" fill="#0b0c0e" stroke="currentColor" stroke-width="2"/><circle cx="150" cy="64" r="11" fill="#0b0c0e" stroke="currentColor" stroke-width="2"/></svg>';
function glCard(it) {
  const cov = (it.photos || []).find(p => glIsVid(p) && p.cover);   // video dipilih Editor sebagai sampul loop
  const ph = cov || (it.photos || []).find(p => !glIsVid(p)) || it.photos?.[0];
  const nVid = (it.photos || []).filter(glIsVid).length, nImg = (it.photos || []).length - nVid;
  const prods = (it.products || []).map(pid => glProd(pid).product?.name).filter(Boolean);
  return `<button class="gl-card" onclick="openGlDetail('${it.id}')">
    <span class="gl-ph">${ph ? (cov ? `<video class="gl-cover" src="${glUrl(cov.path)}"${glCovPoster(it)} muted loop autoplay playsinline webkit-playsinline preload="auto"${glFrAttr(cov)}></video>` : glIsVid(ph) ? glVidTag(glUrl(ph.path), '', ph) : `<img src="${glUrl(ph.path)}" alt="${escHtml(glTitle(it))}" loading="lazy"${glFrAttr(ph)}>`) : glCarSvg}
      ${it.photos?.length ? `<span class="gl-cnt">${[nImg ? `📷 ${nImg}` : '', nVid ? `🎬 ${nVid}` : ''].filter(Boolean).join(' · ')}</span>` : ''}
      ${it.hof_id ? '<span class="gl-tro">🏆 Juara</span>' : ''}
      ${glPending(it) ? '<span class="gl-draft pend">MENUNGGU</span>' : !it.published ? '<span class="gl-draft">DRAF</span>' : glSched(it) ? `<span class="gl-draft sched">⏰ ${escHtml(glWhen(it.publish_at))}</span>` : ''}</span>
    <span class="gl-bd"><span class="gl-mk">${escHtml(it.car_make || '')}</span>
      <b>${escHtml(it.car_model || '')}${it.car_year ? ` <small>${it.car_year}</small>` : ''}</b>
      ${it.dealer || it.city ? `<span class="gl-dl">🛠 ${escHtml([it.dealer, it.city].filter(Boolean).join(' · '))}</span>` : ''}
      ${prods.length ? `<span class="gl-chips">${prods.slice(0, 4).map(n => `<span>${escHtml(n)}</span>`).join('')}${prods.length > 4 ? `<span>+${prods.length - 4}</span>` : ''}</span>` : ''}
    </span></button>`;
}
// Sampul video loop (2 Nov 2026, permintaan pemilik — dicoba dulu per mobil, dipilih Editor): diputar bisu berulang hanya saat terlihat.
// Langsung diputar saat Galeri dibuka (2 Nov 2026, permintaan pemilik): play() dipanggil seketika untuk kartu yang terlihat; bila HP
// memblokir (mis. iPhone mode Hemat Daya), sentuhan/klik/tombol pertama di halaman memutar semuanya. Poster = foto pertama mobil itu
// agar kartu tidak hitam selama video dimuat / diblokir.
const glCovPoster = it => { const f = (it.photos || []).find(p => !glIsVid(p)), u = f && glUrl(f.path); return u ? ` poster="${u}"` : ''; };
let glCovIO = null, glCovUnlock = false;
const glCovVis = v => { const r = v.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; };
const glCovPlay = v => { v.muted = true; v.defaultMuted = true; const p = v.play?.(); p?.catch?.(() => glCovArm()); };
function glCovArm() {   // pasang sekali: interaksi pertama pengguna memutar sampul yang terlihat
  if (glCovUnlock) return; glCovUnlock = true;
  const go = () => { ['pointerdown', 'touchstart', 'keydown'].forEach(t => document.removeEventListener(t, go, true)); glCovUnlock = false;
    document.querySelectorAll('video.gl-cover').forEach(v => { if (glCovVis(v) && v.paused) v.play?.().catch(() => {}); }); };
  ['pointerdown', 'touchstart', 'keydown'].forEach(t => document.addEventListener(t, go, { capture: true, passive: true }));
}
function glCoverObs() {
  const vids = document.querySelectorAll('video.gl-cover'); if (!vids.length) return;
  // Sengaja TIDAK lagi berhenti saat 'Kurangi Gerakan' aktif (2 Nov 2026, permintaan pemilik — loop tidak berjalan di perangkatnya):
  // video sampul bisu & dipilih Editor, jadi tetap diputar. Coba lagi setelah data video siap (canplay).
  glCovIO = glCovIO || ('IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? glCovPlay(e.target) : e.target.pause()), { rootMargin: '120px 0px' }) : null);
  vids.forEach(v => {
    v.muted = true; v.defaultMuted = true; glCovIO?.observe(v);
    v.addEventListener('canplay', () => { if (v.paused && glCovVis(v)) glCovPlay(v); }, { once: true });
    if (!glCovIO || glCovVis(v)) glCovPlay(v);
  });
}
function renderGaleri() {
  const box = document.getElementById('gl-body'); if (!box) return;
  const add = glCanEdit() ? `<button class="gt-btn confirm" onclick="openGlForm()">＋ Tambah Instalasi</button>`
    : !GL_DEALER_SUBMIT ? ''
    : authUser ? `<button class="gt-btn confirm" onclick="openGlSubmit()">📤 Kirim Foto / Video Instalasi Anda</button>`
    : `<button class="gt-btn ghost" onclick="openGlSubmit()">🔑 Partner resmi? Login untuk kirim foto / video</button>`;
  document.getElementById('gl-tools').innerHTML = add;
  renderGlGuide();
  if (GL_DEALER_SUBMIT && isAdmin() && glSubmitReady === null) glCheckSubmit().then(() => { if (document.getElementById('view-galeri')?.classList.contains('active')) renderGaleri(); });
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
    ${GL_DEALER_SUBMIT && isAdmin() && glSubmitReady === false ? `<div class="vs-warn">Kiriman foto/video dari partner belum aktif. Jalankan SQL ini sekali di Supabase → SQL Editor → Run (menambah kolom kiriman + izin unggah partner ke folder <b>pending/</b>).<br><br><button class="gt-btn" onclick="glSubCopySql()">📋 Salin SQL Kiriman Partner</button></div>` : ''}
    ${pend.length ? `<div class="gl-pend"><div class="hof-h2">📥 Kiriman foto/video menunggu persetujuan <span class="gl-pcount">${pend.length}</span></div>
      <div class="hof-sub">Belum terlihat oleh pengunjung. Periksa foto (plat nomor harus diburamkan), lalu setujui atau tolak.</div>
      <div class="gl-grid">${pend.map(it => `<div class="gl-pitem">${glCard(it)}<div class="gl-pby">Dikirim oleh <b>${escHtml(it.submitter || it.dealer || '—')}</b>${it.submitted_at ? ' · ' + escHtml(new Date(it.submitted_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : ''}</div>
        ${isEditor() ? `<div class="gl-pact"><button class="gt-btn confirm" onclick="approveGlItem('${it.id}')">✓ Setujui</button><button class="gt-btn" onclick="openGlForm('${it.id}')">✏️ Edit</button><button class="gt-btn ghost gt-del" onclick="deleteGlItem('${it.id}', true)">✕ Tolak</button></div>` : '<div class="gl-hint">Menunggu persetujuan Editor.</div>'}</div>`).join('')}</div></div>` : ''}
    ${glQueueHtml()}
    ${glChampBanner()}
    <div class="gl-search"><span>🔎</span><input type="search" placeholder="Cari mobil Anda — mis. Fortuner, HR-V, Pajero…" value="${escHtml(glQ)}" oninput="glQ=this.value;clearTimeout(window.glQt);window.glQt=setTimeout(()=>{renderGaleri();const i=document.querySelector('.gl-search input');i?.focus();i?.setSelectionRange(i.value.length,i.value.length)},250)"></div>
    ${live.length ? `<div class="gl-makes">${['all', ...makes].map(m => `<button class="gl-make${glMake === m ? ' on' : ''}" onclick="setGlFilter('make','${escHtml(m)}')">${m === 'all' ? 'SEMUA' : escHtml(m.toUpperCase())}<small>${cnt(m)} mobil</small></button>`).join('')}</div>
    <div class="hof-filters">${bodies.length > 1 ? `<button class="filter-chip${glBody === 'all' ? ' active' : ''}" onclick="setGlFilter('body','all')">Semua tipe</button>${bodies.map(b => `<button class="filter-chip${glBody === b ? ' active' : ''}" onclick="setGlFilter('body','${escHtml(b)}')">${escHtml(b)}</button>`).join('')}` : ''}
      ${live.some(it => glIsEv(it.body)) ? `<button class="filter-chip${glBody === 'ev' ? ' active' : ''}" onclick="setGlFilter('body','ev')">⚡ Mobil listrik &amp; hybrid</button>` : ''}
</div>` : ''}
    ${hint}
    ${rows.length ? `<div class="gl-grid">${rows.map(glCard).join('')}</div>` : hint ? ''
      : `<div class="stock-empty">${live.length ? 'Tidak ada instalasi yang cocok. Coba kata kunci lain.' : 'Belum ada instalasi. ' + (glCanEdit() ? 'Tekan <b>＋ Tambah Instalasi</b> untuk menambahkan yang pertama.' : '')}</div>`}`;
  glCoverObs();
}

// ⏰ Antrian tayang Galeri (Admin/Editor): mobil terjadwal, urut jam tayang
function glQueueHtml() {
  if (!isAdmin()) return '';
  const q = (glItems || []).filter(glSched).sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at));
  if (!q.length) return '';
  return `<div class="cw-queue gl-queue"><div class="cw-queue-h">⏰ Antrian tayang <span>${q.length} mobil · tampil otomatis untuk pengunjung pada jamnya${q.some(it => it.notify !== false) ? ' + notifikasi 🚗' : ''}</span></div>
    <div class="gl-grid">${q.map(glCard).join('')}</div></div>`;
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
  if (!photoIdx && typeof insInterest === 'function') insInterest('gl');
  const ov = document.getElementById('gl-detail');
  const photos = it.photos || [];
  const cur = photos[photoIdx];
  const d = glDealer(it.dealer);
  const hof = it.hof_id ? hofData().find(e => e.id === it.hof_id) : null;
  ov.querySelector('.gl-dbox').innerHTML = `
    <button class="rk-pick-x gl-x" onclick="closeGlDetail()" aria-label="Tutup">✕</button>
    <div class="gl-dgrid">
      <div>
        <div class="gl-big">${cur ? glBigMedia(it, cur, photoIdx) : glCarSvg}${cur?.area ? `<span class="gl-area">${escHtml(cur.area)}</span>` : ''}</div>
        ${photos.length > 1 ? `<div class="gl-th">${photos.map((p, i) => `<button class="${i === photoIdx ? 'on' : ''}" onclick="openGlDetail('${it.id}',${i})">${glIsVid(p) ? glVidTag(glUrl(p.path), '', p) + '<i class="gl-play">▶</i>' : `<img src="${glUrl(p.path)}" alt="" loading="lazy"${glFrAttr(p)}>`}${p.area ? `<span>${escHtml(p.area)}</span>` : ''}</button>`).join('')}</div>` : ''}
      ${cur && isEditor() ? (() => { let vid = glIsVid(cur), what = vid ? 'video' : 'foto', rot = vid ? `<button class="${cur.cover ? 'on' : ''}" onclick="glAdjCover('${it.id}',${photoIdx})" title="Video ini diputar berulang (tanpa suara) sebagai sampul kartu Galeri">${cur.cover ? '🎞 Sampul loop · lepas' : '🎞 Jadikan sampul loop'}</button>`+`<button class="${cur.mute ? 'on' : ''}" onclick="glAdjMute('${it.id}',${photoIdx})" title="Atur suara video untuk semua yang menonton">${cur.mute ? '🔇 Tayang tanpa suara · ubah' : '🔊 Tayang dengan suara · ubah'}</button>` : `<button onclick="glAdjRotate('${it.id}',${photoIdx})">⟳ Putar 90°</button>`;
        // Sampul kartu WA (Tahap 5 C, 4 Nov 2026 — opsi 1 pemilik): Editor memilih foto / adegan video yang aman (tanpa plat nomor)
        rot += `<button class="gl-wa${cur.wa ? ' on' : ''}" onclick="glAdjWa('${it.id}',${photoIdx})" title="${vid ? 'Putar lalu jeda video di adegan yang aman (tanpa plat nomor), lalu tekan — adegan itu jadi gambar kartu WhatsApp mobil ini' : 'Foto ini jadi gambar kartu WhatsApp saat mobil ini dibagikan'}">${cur.wa ? `📲 Sampul kartu WA${vid && cur.waT != null ? ' (detik ' + cur.waT + ')' : ''} · lepas` : '📲 Jadikan sampul kartu WA'}</button>`;
        return `<div class="gl-adjbar${glAdj ? ' on' : ''}">${glAdj
        ? `<span>✥ Geser ${what} di atas & atur zoom — bingkai itu sama dengan sampul kartu Galeri.</span><label class="gl-zm">🔍 Zoom <input type="range" min="1" max="3" step="0.05" value="${glFr(cur).z}" oninput="glZoomLive(this.value)" onchange="glZoomCommit()"><b id="gl-zmv">${glFr(cur).z.toFixed(1)}×</b></label><button onclick="glAdjSet('${it.id}',${photoIdx},null)">⊙ Reset</button>${rot}<button class="pri" onclick="glAdj=false;openGlDetail('${it.id}',${photoIdx})">✓ Selesai</button>`
        : `<button onclick="glAdj=true;openGlDetail('${it.id}',${photoIdx})">🎯 Atur posisi & zoom ${what} ini</button>${rot}`}</div>`; })() : ''}
      </div>
      <div>
        <div class="gl-mk">${escHtml(it.car_make || '')}</div>
        <h3 class="gl-dt">${escHtml(it.car_model || '')}${it.car_year ? ' ' + it.car_year : ''}</h3>
        <div class="gl-tags">${hof ? `<button class="gl-tag g" onclick="closeGlDetail();openHallOfFame('${hofGroupKey(hof)}')">🏆 ${escHtml(hof.award)}${hof.cls ? ' · ' + escHtml(hof.cls) : ''}</button>` : ''}${it.body ? `<span class="gl-tag">${escHtml(it.body)}</span>` : ''}${it.city ? `<span class="gl-tag">${escHtml(it.city)}</span>` : ''}${glPending(it) ? `<span class="gl-tag dr">Kiriman ${escHtml(it.submitter || 'dealer')} — menunggu persetujuan</span>` : !it.published ? '<span class="gl-tag dr">Draf — belum tampil</span>' : glSched(it) ? `<span class="gl-tag sc">⏰ Tayang ${escHtml(glWhen(it.publish_at))}</span>` : ''}</div>
        ${it.note ? `<p class="gl-note">${escHtml(it.note)}</p>` : ''}
        ${it.published && !glPending(it) && !glSched(it) ? `<div class="gl-share"><button class="gt-btn ghost" onclick="glShare('${it.id}')">${SHARE_ICON} Bagikan</button></div>` : ''}
        ${(it.products || []).length ? `<div class="hof-lbl">Produk yang dipasang</div>${it.products.map(pid => { const r = glProd(pid); if (!r.product) return ''; const p = r.product;
          return `<button class="gl-prod" onclick="closeGlDetail();showProduct('${r.brand.id}','${p.id}')">${p.photo ? `<img src="${p.photo}" alt="">` : `<span class="hof-ph">${p.emoji}</span>`}<span><b>${escHtml(p.name)}</b><small>${escHtml(r.brand.name)}${r.line ? ' · ' + escHtml(r.line) : ''}</small></span><em>Lihat →</em></button>`; }).join('')}` : ''}
        ${it.dealer ? `<div class="gl-dcard"><div class="hof-lbl">Dipasang oleh</div><b>${escHtml(it.dealer)}${d ? ' <span class="ad-badge">✓ Resmi</span>' : ''}</b><div class="gl-dc">${escHtml(d ? [d.c, d.r].join(', ') : it.city || '')}</div>
          ${d ? `<div class="ad-btns">${d.wa ? `<a class="ad-btn wa" href="https://wa.me/${d.wa}?text=${encodeURIComponent(`Halo ${d.n}, saya lihat contoh instalasi ${glTitle(it)} di CAI Hub (Concerto Audio Indonesia). Saya ingin bertanya.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${d.ig ? `<a class="ad-btn" href="https://www.instagram.com/${encodeURIComponent(d.ig)}/" target="_blank" rel="noopener">Instagram</a>` : ''}<a class="ad-btn" href="${adMaps(d)}" target="_blank" rel="noopener">Maps</a>${pfBtn(d, 'closeGlDetail()')}</div>` : ''}</div>` : ''}
        ${glCanEdit() ? `<div class="gl-adm"><button class="gt-btn" onclick="closeGlDetail();openGlForm('${it.id}')">✏️ Edit</button><button class="gt-btn ghost gt-del" onclick="deleteGlItem('${it.id}')">🗑 Hapus</button></div>` : ''}
      </div>
    </div>`;
  ov.classList.add('open');
  if (it.published && !glSched(it)) glPrepShare(it);
}
function closeGlDetail() { glAdj = false; glAdjCtx = null; document.querySelectorAll('#gl-detail video').forEach(v => v.pause()); document.getElementById('gl-detail')?.classList.remove('open'); }
// Atur posisi / putar foto langsung dari jendela detail (Editor, 2 Nov 2026 — permintaan pemilik): disimpan langsung ke tabel.
let glAdj = false;
function glPosCss(p) { const xy = glPosXY(p) || [50, 50]; return `${xy[0]}% ${xy[1]}%`; }
// Geser foto (drag) untuk mengatur bagian yang tampil pada bingkai object-fit: cover; onEnd(pos "x y") setelah dilepas.
function glDragStart(ev, onEnd) {
  const el = ev.currentTarget; if (!el || ev.button > 0) return;
  ev.preventDefault();
  const f = glFrOf(el), sx = ev.clientX, sy = ev.clientY, x0 = f.x, y0 = f.y;
  const box = el.parentElement.getBoundingClientRect(), W = box.width, H = box.height;
  const nw = el.naturalWidth || el.videoWidth || W, nh = el.naturalHeight || el.videoHeight || H;
  const sc = Math.max(W / nw, H / nh), ox = nw * sc - W, oy = nh * sc - H;
  const rx = f.z * ox + (f.z - 1) * W, ry = f.z * oy + (f.z - 1) * H;   // rentang geser total (piksel) per sumbu
  let moved = false;
  el.setPointerCapture?.(ev.pointerId); el.classList.add('dragging');
  const mv = e => {
    moved = true;
    if (rx > 1) f.x = Math.max(0, Math.min(100, x0 - (e.clientX - sx) / rx * 100));
    if (ry > 1) f.y = Math.max(0, Math.min(100, y0 - (e.clientY - sy) / ry * 100));
    glApplyFr(el, f);
  };
  const up = () => {
    el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    el.classList.remove('dragging');
    if (moved) onEnd(f);
  };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
async function glSavePhotos(id, photos, msg) {
  const { error } = await supabase.from(GL_TABLE).update({ photos }).eq('id', id);
  if (error) { showToast('⚠ Gagal menyimpan: ' + error.message, 6000); return false; }
  const it = glItems.find(x => x.id === id); if (it) it.photos = photos;
  if (msg) showToast(msg, 2500);
  if (document.getElementById('view-galeri')?.classList.contains('active')) renderGaleri();
  return true;
}
async function glAdjSet(id, idx, fr) {
  if (!isEditor()) return;
  const it = glItems.find(x => x.id === id); if (!it) return;
  const photos = (it.photos || []).map((p, i) => i !== idx ? p : glSetFr({ ...p }, fr));
  if (await glSavePhotos(id, photos, fr ? '✓ Posisi & zoom disimpan' : '✓ Posisi & zoom direset')) openGlDetail(id, idx);
}
// Media besar di jendela detail: bingkai 4:3 sama dengan thumbnail & sampul (posisi + zoom); mode atur = bisa digeser
function glBigMedia(it, cur, idx) {
  const url = glUrl(cur.path), vid = glIsVid(cur);
  glAdjCtx = glAdj ? { id: it.id, idx } : null;
  if (glAdj) return `${vid ? `<video class="gl-drag" src="${url}" muted loop autoplay playsinline preload="auto"${glFrAttr(cur)} onpointerdown="glDragStart(event, glAdjSave)" onwheel="glWheel(event)"></video>`
      : `<img class="gl-drag" src="${url}" alt="" draggable="false"${glFrAttr(cur)} onpointerdown="glDragStart(event, glAdjSave)" onwheel="glWheel(event)">`}<span class="gl-draghint">✥ Geser · 🔍 zoom</span>`;
  if (vid) { const ns = !!cur.mute;   // ns = video diset Editor tanpa suara → selalu bisu untuk semua yang menonton
    return `<video src="${url}#t=0.5" playsinline preload="metadata"${ns ? ' muted data-nosound="1"' : ''}${glFrAttr(cur)} onclick="glVidToggle(this)" onplay="this.parentNode.classList.add('playing');glMuteIcon(this)" onpause="this.parentNode.classList.remove('playing')" onvolumechange="glMuteIcon(this)"></video>${ns ? '<span class="gl-vmute ns" title="Video ini ditayangkan tanpa suara">🔇</span>' : '<button class="gl-vmute" onclick="glVidMute(this.parentNode.querySelector(\'video\'))" aria-label="Matikan suara" title="Matikan / nyalakan suara">🔊</button>'}<button class="gl-vplay" onclick="glVidToggle(this.parentNode.querySelector('video'))" aria-label="Putar">▶</button><button class="gl-zoom" onclick="glZoom('${url}', true${ns ? ', true' : ''})" aria-label="Lihat video penuh">⤢</button>`; }
  return `<img src="${url}" alt=""${glFrAttr(cur)} onclick="glZoom(this.src)" title="Ketuk untuk melihat foto utuh"><button class="gl-zoom" onclick="glZoom('${url}')" aria-label="Lihat penuh">⤢</button>`;
}
function glVidMute(v) { if (!v || v.dataset.nosound) return; v.muted = !v.muted; v.dataset.muteSet = 1; glMuteIcon(v); }
function glMuteIcon(v) { if (v?.dataset?.nosound && !v.muted) v.muted = true; const b = v?.parentNode?.querySelector('.gl-vmute'); if (b) { b.textContent = v.muted ? '🔇' : '🔊'; b.title = b.ariaLabel = v.muted ? 'Nyalakan suara' : 'Matikan suara'; } }
function glVidToggle(v) { if (!v) return; if (v.paused) { if (v.dataset.nosound) v.muted = true; else if (!v.dataset.muteSet) { v.muted = false; v.dataset.muteSet = 1; } v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); } else v.pause(); }
let glAdjCtx = null, glZoomT = null;
const glAdjSave = fr => glAdjCtx && glAdjSet(glAdjCtx.id, glAdjCtx.idx, fr);
const glAdjEl = () => document.querySelector('#gl-detail .gl-big .gl-drag');
function glZoomLive(v) {
  const el = glAdjEl(); if (!el) return;
  glApplyFr(el, { x: +el.dataset.x, y: +el.dataset.y, z: +v });
  const b = document.getElementById('gl-zmv'); if (b) b.textContent = (+v).toFixed(1) + '×';
}
function glZoomCommit() { const el = glAdjEl(); if (el) glAdjSave(glFrOf(el)); }
function glWheel(ev) {
  ev.preventDefault();
  const el = ev.currentTarget, z = Math.min(3, Math.max(1, +el.dataset.z - ev.deltaY * 0.0015));
  glZoomLive(z);
  const r = document.querySelector('.gl-zm input'); if (r) r.value = z;
  clearTimeout(glZoomT); glZoomT = setTimeout(glZoomCommit, 600);
}
async function glAdjCover(id, idx) {
  if (!isEditor()) return;
  const it = glItems.find(x => x.id === id); if (!it) return;
  const on = !it.photos?.[idx]?.cover;
  const photos = (it.photos || []).map((p, i) => { const q = { ...p }; delete q.cover; if (i === idx && on) q.cover = true; return q; });
  if (await glSavePhotos(id, photos, on ? '🎞 Video ini kini jadi sampul loop di Galeri' : 'Sampul kembali ke foto pertama')) openGlDetail(id, idx);
}
async function glAdjWa(id, idx) {
  if (!isEditor()) return;
  const it = glItems.find(x => x.id === id); if (!it) return;
  const cur = it.photos?.[idx]; if (!cur) return;
  let t = null;
  if (glIsVid(cur)) {
    const v = document.querySelector('#gl-detail .gl-big video');
    // Wajib diputar lalu dijeda dulu (4 Nov 2026): detik bawaan 1,5 = adegan pembuka yang sering memperlihatkan plat nomor
    if (cur.wa) t = cur.waT ?? null;
    if (v && v.currentTime > 0.2) t = Math.round(v.currentTime * 10) / 10;
    else if (!cur.wa) { showToast('▶ Putar video ini, lalu JEDA di adegan yang aman (tanpa plat nomor) — baru tekan 📲 Jadikan sampul kartu WA.', 6000); return; }
    if (cur.wa && cur.waT === t) { if (!confirm('Lepas sampul kartu WA dari video ini?')) return; }
  }
  const unset = cur.wa && (!glIsVid(cur) || cur.waT === t);
  const photos = (it.photos || []).map((p, i) => { const q = { ...p }; delete q.wa; delete q.waT; if (i === idx && !unset) { q.wa = true; if (t != null) q.waT = t; } return q; });
  if (await glSavePhotos(id, photos, unset ? 'Sampul kartu WA dilepas — kembali otomatis' : `📲 ${glIsVid(cur) ? 'Adegan detik ' + t : 'Foto ini'} jadi sampul kartu WA — kartu diperbarui otomatis ±15–25 menit`)) openGlDetail(id, idx);
}
async function glAdjMute(id, idx) {
  if (!isEditor()) return;
  const it = glItems.find(x => x.id === id); if (!it) return;
  const photos = (it.photos || []).map((p, i) => { if (i !== idx) return p; const q = { ...p }; if (q.mute) delete q.mute; else q.mute = true; return q; });
  const now = photos[idx]?.mute;
  if (await glSavePhotos(id, photos, now ? '🔇 Video ini kini tayang tanpa suara' : '🔊 Video ini kini tayang dengan suara')) openGlDetail(id, idx);
}
async function glAdjRotate(id, idx) {
  if (!isEditor()) return;
  const it = glItems.find(x => x.id === id), p = it?.photos?.[idx]; if (!p || glIsVid(p)) return;
  showToast('⏳ Memutar foto…', 15000);
  try {
    const blob = await glRotBlob(await (await fetch(glUrl(p.path), { cache: 'no-store' })).blob());
    const path = p.path.replace(/[^/]+$/, `${Date.now()}-r.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`);
    const up = await supabase.storage.from(GL_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
    if (up.error) throw up.error;
    const xy = glPosXY(p), q = { ...p, path }; if (xy) q.pos = `${100 - xy[1]} ${xy[0]}`;
    const photos = it.photos.map((x, i) => i === idx ? q : x);
    if (await glSavePhotos(id, photos, '✓ Foto diputar')) { supabase.storage.from(GL_BUCKET).remove([p.path]); openGlDetail(id, idx); }
    else supabase.storage.from(GL_BUCKET).remove([path]);
  } catch (e) { showToast('⚠ Foto tidak bisa diputar: ' + (e.message || e), 6000); }
}

/* ── Form tambah / edit (Admin & Editor) ── */
function openGlForm(id) {
  if (!glCanEdit()) return;
  const it = id ? glItems?.find(x => x.id === id) : null;
  glEdit = it ? { ...it, products: [...(it.products || [])], photos: (it.photos || []).map(p => ({ ...p, url: glUrl(p.path) })), removed: [] }
    : { car_make: '', car_model: '', car_year: '', body: '', dealer: '', city: '', note: '', products: [], photos: [], hof_id: '', published: false, sort: 0, removed: [] };
  glSchedInit(glEdit, it);
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
  if (!glCanEdit()) return;
  glEdit = { ...glFromHof(hofId), published: isEditor() };
  glSchedInit(glEdit, null);
  closeHofDealer();
  renderGlForm();
  document.getElementById('gl-form').classList.add('open');
}
// Dealer: buka form kiriman (hofId = prestasi yang dipilih dari Hall of Fame, diisi otomatis)
function openGlSubmit(hofId) {
  if (!GL_DEALER_SUBMIT) { showToast('Pengiriman foto/video Galeri sementara ditutup. Hubungi tim CAI bila ingin mobil Anda ditampilkan.', 6000); return; }
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
  if (!GL_DEALER_SUBMIT) { showToast('Pengiriman foto/video Galeri sementara ditutup.'); return; }
  if (!e.dealer) { showToast('⚠ Pilih nama partner Anda dulu.'); return; }
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
      photos.push(glPhotoRow(path, p, !!p.video));
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
    showToast(/row-level|policy|permission|column|schema cache|403|42501|PGRST/i.test(m) ? '⚠ Fitur kiriman partner belum aktif. Mohon hubungi tim CAI.' : '⚠ Gagal mengirim: ' + m, 7000);
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
    try { const blob = await glResize(f); glEdit.photos.push({ blob, url: URL.createObjectURL(blob), area: '' }); }
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
    glEdit.photos.push({ blob: f, video: true, url: URL.createObjectURL(f), size: f.size, area: '' });
  }
  renderGlPhotos();
}
function glPhotoArea(i, v) { glEdit.photos[i].area = v; }
function glPhotoMove(i, d) { const a = glEdit.photos, j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; renderGlPhotos(); }
function glPhotoDel(i) { const [p] = glEdit.photos.splice(i, 1); if (p.path) glEdit.removed.push(p.path); if (p.blob) URL.revokeObjectURL(p.url); renderGlPhotos(); }
// Penyesuaian foto (2 Nov 2026, permintaan pemilik — foto terpotong di kotak kecil/sampul):
// pos = titik fokus "x y" (%) untuk object-position kotak kecil & sampul; ⟳ memutar foto 90° (dibuat ulang lewat canvas, diunggah sebagai file baru);
// ⤢ / ketuk foto besar = lihat penuh (glZoom).
function glPosXY(p) { const m = String(p?.pos || '').match(/^(\d{1,3}) (\d{1,3})$/); return m ? [Math.min(100, +m[1]), Math.min(100, +m[2])] : null; }
// Bingkai media: pos "x y" (%) + zoom 1–3. Media diperbesar (width/height = zoom×) & digeser lewat left/top, object-fit cover + object-position
// (tanpa transform agar kontrol video tidak ikut membesar). Dipakai sampul kartu, thumbnail, foto/video besar & form.
const glFr = p => { const xy = glPosXY(p) || [50, 50], z = Math.min(3, Math.max(1, +p?.zoom || 1)); return { x: xy[0], y: xy[1], z }; };
const glFrCss = ({ x, y, z }) => `position:absolute;left:${((1 - z) * x).toFixed(2)}%;top:${((1 - z) * y).toFixed(2)}%;width:${(z * 100).toFixed(1)}%;height:${(z * 100).toFixed(1)}%;max-width:none;object-fit:cover;object-position:${x}% ${y}%`;
const glFrAttr = p => { const f = glFr(p); return ` style="${glFrCss(f)}" data-x="${f.x}" data-y="${f.y}" data-z="${f.z}"`; };
const glFrOf = el => ({ x: +el.dataset.x, y: +el.dataset.y, z: +el.dataset.z || 1 });
function glApplyFr(el, f) { el.style.cssText = glFrCss(f); el.dataset.x = f.x; el.dataset.y = f.y; el.dataset.z = f.z; }
function glSetFr(q, f) {
  if (!f) { delete q.pos; delete q.zoom; return q; }
  if (Math.round(f.x) === 50 && Math.round(f.y) === 50) delete q.pos; else q.pos = `${Math.round(f.x)} ${Math.round(f.y)}`;
  if (f.z > 1.01) q.zoom = Math.round(f.z * 100) / 100; else delete q.zoom;
  return q;
}
function glPosAttr(p) { return glFrAttr(p); }
function glPhotoRow(path, p, vid) { const r = { path, area: p.area || '' }; if (vid) r.type = 'video'; if (glPosXY(p)) r.pos = p.pos; if (+p.zoom > 1) r.zoom = +p.zoom; if (vid && p.mute) r.mute = true; if (vid && p.cover) r.cover = true; if (p.wa) { r.wa = true; if (vid && p.waT != null) r.waT = +p.waT; } return r; }
function glSetPos(i) { const p = glEdit.photos[i]; if (!p) return; delete p.pos; delete p.zoom; renderGlPhotos(); }
function glFormFr(i, f) { const p = glEdit.photos[i]; if (!p) return; glSetFr(p, f); renderGlPhotos(); }
function glFormZoom(i, inp) {
  const p = glEdit.photos[i], el = inp.closest('.gl-fph')?.querySelector('.gl-drag'); if (!p || !el) return;
  const f = { ...glFrOf(el), z: +inp.value }; glApplyFr(el, f); glSetFr(p, f);
}
async function glRotBlob(src) {
  const bmp = await createImageBitmap(src);
  const c = document.createElement('canvas'); c.width = bmp.height; c.height = bmp.width;
  const g = c.getContext('2d'); g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(bmp, 0, 0);
  return new Promise((res, rej) => c.toBlob(b => b && b.type === 'image/webp' ? res(b) : c.toBlob(j => j ? res(j) : rej(new Error('Gagal memutar foto')), 'image/jpeg', .88), 'image/webp', .85));
}
async function glRotate(i) {
  const p = glEdit.photos[i]; if (!p || p.video || glIsVid(p) || p._rot) return;
  p._rot = true; showToast('⏳ Memutar foto…', 8000);
  try {
    const blob = await glRotBlob(p.blob || await (await fetch(p.url, { cache: 'no-store' })).blob());
    if (p.path) { glEdit.removed.push(p.path); delete p.path; }
    if (p.blob) URL.revokeObjectURL(p.url);
    const xy = glPosXY(p); if (xy) p.pos = `${100 - xy[1]} ${xy[0]}`;
    p.blob = blob; p.url = URL.createObjectURL(blob);
    showToast('✓ Foto diputar — tersimpan setelah klik Simpan', 3000);
  } catch (e) { showToast('⚠ Foto tidak bisa diputar: ' + (e.message || e), 5000); }
  delete p._rot; renderGlPhotos();
}
function glZoom(src, vid, nosound) {
  if (!src) return;
  let z = document.getElementById('gl-zoom');
  if (!z) {
    z = document.createElement('div'); z.id = 'gl-zoom'; z.className = 'gl-zoomov';
    z.onclick = e => { if (e.target.tagName !== 'VIDEO') glZoomClose(); };
    document.body.appendChild(z);
  }
  document.querySelectorAll('#gl-detail video').forEach(v => v.pause());
  z.innerHTML = (vid ? `<video src="${src}" controls autoplay playsinline${nosound ? ' muted data-nosound="1" onvolumechange="if(!this.muted)this.muted=true"' : ''}></video>` : `<img src="${src}" alt="">`) + '<button aria-label="Tutup">✕</button>';
  z.classList.add('open');
}
function glZoomClose() { const z = document.getElementById('gl-zoom'); if (!z) return; z.querySelector('video')?.pause(); z.classList.remove('open'); z.innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') glZoomClose(); });
function renderGlPhotos() {
  const el = document.getElementById('glf-photos'); if (!el) return;
  const first = glEdit.photos.findIndex(p => !(p.video || glIsVid(p)));
  el.innerHTML = glEdit.photos.map((p, i) => { const vid = !!(p.video || glIsVid(p));
    return `<div class="gl-fph"><div class="gl-fimg${vid ? ' vid' : ''}" title="Geser untuk mengatur bagian yang tampil di sampul">${vid
      ? `<video class="gl-drag" src="${p.url}${p.blob ? '' : '#t=0.5'}" muted playsinline preload="metadata"${glFrAttr(p)} onpointerdown="glDragStart(event, f => glFormFr(${i}, f))"></video><i class="gl-play">▶</i>${p.size ? `<span class="gl-vsz">${(p.size / 1048576).toFixed(1)} MB</span>` : ''}`
      : `<img class="gl-drag" src="${p.url}" alt="" draggable="false"${glFrAttr(p)} onpointerdown="glDragStart(event, f => glFormFr(${i}, f))">`}</div>
      <label class="gl-fzm" title="Zoom">🔍<input type="range" min="1" max="3" step="0.05" value="${glFr(p).z}" oninput="glFormZoom(${i}, this)"></label>${vid ? `<label class="gl-fmute"><input type="checkbox"${p.mute ? ' checked' : ''} onchange="glEdit.photos[${i}].mute = this.checked || undefined"> 🔇 Tayang tanpa suara</label>` : ''}
      <select onchange="glPhotoArea(${i},this.value)"><option value=""${p.area ? '' : ' selected'}>— Keterangan —</option>${p.area && !GL_AREAS.includes(p.area) ? `<option selected>${escHtml(p.area)}</option>` : ''}${GL_AREA_GROUPS.map(([g, l]) => { const o = l.map(a => `<option${a === p.area ? ' selected' : ''}>${a}</option>`).join(''); return g ? `<optgroup label="${g}">${o}</optgroup>` : o; }).join('')}</select>
      <div class="gl-fpb"><button onclick="glPhotoMove(${i},-1)" title="Geser kiri">◀</button>${i === first ? '<span>Utama</span>' : ''}<button onclick="glPhotoMove(${i},1)" title="Geser kanan">▶</button>${vid ? '' : `<button onclick="glRotate(${i})" title="Putar 90°">⟳</button>`}${p.pos || +p.zoom > 1 ? `<button onclick="glSetPos(${i})" title="Reset posisi & zoom">⊙</button>` : ''}<button onclick="glZoom('${p.url}'${vid ? ', true' : ''})" title="Lihat penuh">⤢</button><button onclick="glPhotoDel(${i})" title="Hapus">🗑</button></div></div>`; }).join('')
    || '<span class="gl-hint">Belum ada foto/video. Foto pertama = foto utama. Pastikan plat nomor sudah diburamkan.</span>';
  if (glEdit.photos.some(p => !(p.video || glIsVid(p)))) el.insertAdjacentHTML('beforeend', '<span class="gl-hint">Foto selalu tampil utuh di tampilan besar. Untuk kotak kecil &amp; sampul, <b>geser foto/video</b> di kotaknya & atur 🔍 zoom; ⟳ memutar foto 90°, ⤢ melihat foto penuh.</span>');
}
// Panduan video cinematic: 1 mobil = 1 video (2 Nov 2026, dari pemilik) — tab Alur video & Perangkat
const GL_ACTS = [
  ['Pembuka', '3–5', ['Garasi gelap, lampu mobil menyala perlahan / siluet mobil dengan cahaya samping', 'Detik pertama = sampul kartu Galeri — buat semenarik mungkin']],
  ['Mobil', '6–10', ['Orbit pelan sudut ¾ depan, kamera rendah', 'Detail singkat: lampu, velg, garis bodi']],
  ['Masuk kabin', '5–8', ['Pintu dibuka (slow motion)', 'Interior dashboard dari dalam mobil — kamera di kursi belakang, geser pelan kiri → kanan, ambient & layar menyala']],
  ['Detail sistem', '15–20', ['Close-up latar buram (mode Sinematik/Portrait), 2–3 dtk per shot', 'Pilar A / tweeter → midrange → midbass pintu → controller DSP — produk brand CAI saja']],
  ['Bagasi', '10–15', ['Pintu bagasi terangkat perlahan → box subwoofer', 'Amplifier & DSP (logo terbaca) → slide jalur kabel yang rapi']],
  ['Hero shot', '3–5', ['Mobil utuh dari sudut ¾ depan / belakang — lampu, ambient & bagasi terbuka menyala', 'Kamera diam atau pull-out pelan menjauh sebagai penutup video']],
];
// Hanya perangkat dari brand CAI (Audiocircle, STEG, Zelos, Diosdela Musica, OG One Sound, Audio System) — permintaan pemilik 2 Nov 2026
const GL_GEAR = [
  ['🔊 Speaker depan', [
    ['Tweeter / super tweeter', 1, 'Posisi di pilar A / dasbor + finishing, kiri & kanan', 'Audiocircle PRO-T28, BL-T26 · STEG MSS1 PRO, SST90, SST50'],
    ['Midrange', 0, 'Posisi di dasbor / pilar / pintu atas', 'Audiocircle PRO-M3C, BL-M3 · STEG MSS3, K3C'],
    ['Midbass / speaker komponen', 1, 'Panel pintu utuh, lalu close-up speaker', 'Audiocircle PRO-W6C NEO, HL-W6 · STEG MSS6, K6C · Audio System AY65C'],
    ['Passive crossover', 0, 'Posisi pemasangan + logo', 'Audiocircle Passive 2 Way / 3 Way']]],
  ['🔉 Subwoofer', [
    ['Subwoofer', 1, 'Cone & logo, lalu box utuh + finishing', 'Audiocircle BL-S10, ML-S10 · STEG SQW-8, SS-10 · Audio System AS10'],
    ['Active / spare tire subwoofer', 0, 'Posisi pemasangan + logo', 'Audiocircle IQ-LES10A · STEG S10, SA-8W, SA-55W']]],
  ['⚡ Amplifier & DSP', [
    ['Power amplifier', 1, 'Logo & model terbaca, tiap unit', 'Zelos · STEG DK / QK · Audiocircle BL AMP · Audio System AS500.1'],
    ['DSP / DSP amplifier', 1, 'Logo & model terbaca jelas', 'STEG DSP-S12, SS-DSP16 · Zelos ZLS-HD5.4 · Audio System DSP-AS6'],
    ['Controller / remote DSP', 0, 'Posisi + layar menyala', 'STEG DRC V4, DRC V5, BT1']]],
  ['🔌 Kabel & kelistrikan', [
    ['Kabel RCA', 1, 'Jalur rapi + close-up konektor berlogo', 'OG One Sound Red Dragon, Reference · Diosdela RCA Quadruple'],
    ['Kabel power & speaker', 0, 'Jalur rapi, terikat, tidak semrawut', 'Diosdela Septuple, Cable Quadruple, DM-16AW'],
    ['Fuse', 0, 'Close-up holder fuse', 'Diosdela Fuse ANL / Mini ANL']]],
  ['🧱 Peredam', [
    ['Peredam pintu / kabin / kap', 0, 'Saat panel terbuka (dokumentasi proses)', 'STEG X3, S-8, S-15, Hoodliner · Audiocircle / Diosdela Sound Deadening']]],
];
const GL_TEK = () => ['HP <b>horizontal</b> (16:9) · 4K/1080p 30fps — 60fps untuk slow motion', 'Pakai gimbal, gerak pelan satu arah: maju · mundur · geser · orbit', '<b>Reveal</b>: mulai dari objek di depan, lalu buka ke perangkat', 'Ruang agak gelap + lampu LED samping; bodi & kaca dilap'];
const GL_EDIT = () => ['Potongan mengikuti ketukan musik, transisi cut / whip', 'Color grading seragam, teks seminimal mungkin', 'Musik <b>wajib bebas royalti</b> — tanpa musik = set tayang tanpa suara', `Ekspor MP4 (H.264) 1080p · maks. ${GL_VIDEO_MAX_MB} MB`];
const GL_TIP = '📌 <b>Fokus hanya pada produk brand CAI</b> (Audiocircle · STEG · Zelos · Diosdela Musica · OG One Sound · Audio System) — perangkat merek lain (head unit, dll.) jangan di-close-up. Logo & model harus terbaca · 2–3 dtk per perangkat · bersihkan debu & sidik jari dulu.';
const GL_WARN = '⚠️ <b>Wajib:</b> plat nomor ditutup / diburamkan · STNK, kartu tol & barang pribadi tidak terlihat · wajah pemilik mobil hanya dengan izin';
// Unduh panduan (kedua tab) sebagai PNG landscape 16:9 — 4 kolom, digambar langsung ke canvas tanpa library (2 Nov 2026, permintaan pemilik)
async function glGuidePng(btn) {
  const old = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = '⏳ Membuat…'; }
  try {
    await document.fonts?.ready;
    const logo = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = LOGO_WHITE; });
    const W = 1920, P = 56, GAP = 40, NC = 4, CW = (W - P * 2 - GAP * (NC - 1)) / NC, S = 2, TOP = 190;
    const plain = h => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
    const F = (w, sz, fam) => `${w} ${sz}px ${fam === 'd' ? 'Sora, Inter' : fam === 'm' ? '"JetBrains Mono", monospace' : 'Inter'}, system-ui, sans-serif`;
    const GOLD = '#d8b45f', TXT = '#eef0f4', DIM = '#a9afbd', LINE = 'rgba(255,255,255,.12)';
    const half = 1;   // kolom 3: Speaker depan + Subwoofer · kolom 4: Amplifier & DSP, Kabel, Peredam
    const draw = (ctx, on, H) => {
      let y = 0;
      const wrap = (t, x, w, font, color, lh) => {
        ctx.font = font; const words = plain(t).split(' '); let line = '';
        const out = l => { if (on) { ctx.fillStyle = color; ctx.fillText(l, x, y + lh * 0.78); } y += lh; };
        for (const wd of words) { const tst = line ? line + ' ' + wd : wd; if (ctx.measureText(tst).width > w && line) { out(line); line = wd; } else line = tst; }
        if (line) out(line);
      };
      const rr = (x, yy, w, h, r, fill, stroke) => { if (!on) return; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, yy, w, h, r) : ctx.rect(x, yy, w, h); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } };
      const dot = (x) => { if (on) { ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(x, y + 13, 3.5, 0, Math.PI * 2); ctx.fill(); } };
      const head = (x, t) => { wrap(t, x, CW, F(700, 26, 'd'), TXT, 36); if (on) { ctx.fillStyle = GOLD; ctx.fillRect(x, y + 2, 44, 3); } y += 18; };
      const note = (x, t, fill, stroke) => { const s0 = y, on0 = on; on = false; wrap(t, x + 16, CW - 32, F(500, 17), TXT, 25); const h = y - s0; y = s0; on = on0; rr(x, y, CW, h + 28, 12, fill, stroke); y += 14; wrap(t, x + 16, CW - 32, F(500, 17), TXT, 25); y += 14 + 14; };
      // header
      if (on) { const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, GOLD); g.addColorStop(1, '#8a6a2a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 7); }
      if (on && logo) { const h = 50, w = logo.width * h / logo.height; ctx.drawImage(logo, P, 44, w, h); }
      y = 40; wrap('Panduan Video Cinematic', P + 230, 900, F(700, 46, 'd'), TXT, 58);
      wrap('1 mobil = 1 video · 50–65 detik · produk brand CAI', P + 232, 900, F(500, 21), GOLD, 30);
      if (on) { ctx.font = F(600, 16, 'm'); ctx.fillStyle = GOLD; ctx.textAlign = 'right'; ctx.fillText('CAI HUB · GALERI INSTALASI', W - P, 70); ctx.fillStyle = DIM; ctx.fillText('hub.concerto.id', W - P, 98); ctx.textAlign = 'left'; ctx.fillStyle = LINE; ctx.fillRect(P, TOP - 26, W - P * 2, 2); }
      const xs = [0, 1, 2, 3].map(i => P + i * (CW + GAP)), ends = [];
      // kolom 1: alur video
      y = TOP; head(xs[0], '🎬 Alur video');
      GL_ACTS.forEach(([t, d, pts], i) => {
        const x = xs[0], y0 = y;
        if (on) { ctx.beginPath(); ctx.arc(x + 16, y + 16, 16, 0, Math.PI * 2); ctx.fillStyle = GOLD; ctx.fill(); ctx.font = F(700, 16, 'm'); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x + 16, y + 22); ctx.textAlign = 'right'; ctx.font = F(600, 15, 'm'); ctx.fillStyle = DIM; ctx.fillText(d + ' dtk', x + CW, y + 21); ctx.textAlign = 'left'; }
        wrap(t, x + 44, CW - 130, F(700, 20), TXT, 30);
        pts.forEach(pt => { dot(x + 50); wrap(pt, x + 62, CW - 62, F(400, 16), DIM, 24); });
        y = Math.max(y, y0 + 34) + 12;
      });
      ends.push(y);
      // kolom 2: teknik, editing, catatan
      y = TOP;
      [['🎥 Teknik pengambilan', GL_TEK()], ['✂️ Editing', GL_EDIT()]].forEach(([h, arr]) => {
        head(xs[1], h);
        arr.forEach(pt => { dot(xs[1] + 6); wrap(pt, xs[1] + 18, CW - 18, F(400, 17), DIM, 25); y += 4; });
        y += 18;
      });
      note(xs[1], GL_TIP, 'rgba(216,180,95,.12)', 'rgba(216,180,95,.4)');
      note(xs[1], GL_WARN, 'rgba(240,160,32,.12)', 'rgba(240,160,32,.45)');
      ends.push(y);
      // kolom 3–4: perangkat
      const gear = (x, groups, title) => {
        y = TOP; head(x, title);
        groups.forEach(([g, items]) => {
          wrap(g, x, CW, F(700, 19), GOLD, 28); y += 2;
          items.forEach(([n, req, d, ex]) => {
            const y0 = y;
            if (on) { rr(x, y + 2, 76, 24, 12, req ? 'rgba(216,180,95,.16)' : null, req ? GOLD : 'rgba(255,255,255,.28)'); ctx.font = F(700, 13); ctx.fillStyle = req ? GOLD : DIM; ctx.textAlign = 'center'; ctx.fillText(req ? 'Wajib' : 'Bila ada', x + 38, y + 19); ctx.textAlign = 'left'; }
            wrap(n, x + 88, CW - 88, F(700, 17), TXT, 24);
            wrap(d, x + 88, CW - 88, F(400, 15), DIM, 21);
            if (ex) wrap(ex, x + 88, CW - 88, F(500, 14), GOLD, 20);
            y = Math.max(y, y0 + 30) + 9;
          });
          y += 10;
        });
        ends.push(y);
      };
      gear(xs[2], GL_GEAR.slice(0, half + 1), '🔧 Perangkat');
      gear(xs[3], GL_GEAR.slice(half + 1), '🔧 Perangkat (lanjutan)');
      if (on) { [1, 2, 3].forEach(i => { ctx.fillStyle = LINE; ctx.fillRect(xs[i] - GAP / 2, TOP, 1.5, H - TOP - P); }); }
      return Math.max(...ends) + P;
    };
    const tmp = document.createElement('canvas').getContext('2d');
    const H = Math.max(1080, Math.ceil(draw(tmp, false, 0)));
    const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
    const ctx = cv.getContext('2d'); ctx.scale(S, S);
    const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#12151d'); bg.addColorStop(1, '#08090d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    draw(ctx, true, H);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Panduan-Video-Cinematic-CAI.png';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('✓ Panduan diunduh sebagai PNG');
  } catch (e) { showToast('⚠ Gagal membuat PNG: ' + (e.message || e), 6000); }
  finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
}
const glGuideHtml = () => {
  const tab = glGuideTab, li = a => `<ul>${a.map(x => `<li>${x}</li>`).join('')}</ul>`;
  const alur = `<ol class="gl-gacts">${GL_ACTS.map(([t, d, pts]) => `<li><div><b>${t}</b><span>${d} dtk</span></div>${li(pts)}</li>`).join('')}</ol>
    <div class="gl-gcols">
      <div><div class="gl-gh">🎥 Teknik pengambilan</div>${li(GL_TEK())}</div>
      <div><div class="gl-gh">✂️ Editing</div>${li(GL_EDIT())}</div>
    </div>`;
  const gear = `<div class="gl-ggear">${GL_GEAR.map(([g, items]) => `<div class="gl-gg"><div class="gl-gh">${g}</div>${items.map(([n, req, x, ex]) => `<div class="gl-gi"><span class="gl-gtag${req ? ' req' : ''}">${req ? 'Wajib' : 'Bila ada'}</span><div><b>${n}</b><small>${x}</small>${ex ? `<i>${ex}</i>` : ''}</div></div>`).join('')}</div>`).join('')}</div>
    <div class="gl-gtip">${GL_TIP}</div>`;
  return `<details class="gl-guide"${glGuideOpen ? ' open' : ''} ontoggle="glGuideOpen=this.open">
  <summary>🎬 Panduan video cinematic — <b>1 mobil = 1 video</b> <small>50–65 detik</small></summary>
  <div class="gl-gtabs"><button type="button" class="${tab === 'alur' ? 'on' : ''}" onclick="glGuideSet('alur')">🎬 Alur video</button><button type="button" class="${tab === 'gear' ? 'on' : ''}" onclick="glGuideSet('gear')">🔧 Perangkat</button><button type="button" class="gl-gpng" onclick="glGuidePng(this)" title="Unduh panduan lengkap (Alur video + Perangkat) sebagai gambar PNG">⬇ Unduh PNG</button></div>
  <div class="gl-gbody">${tab === 'alur' ? alur : gear}</div>
  <div class="gl-gwarn">${GL_WARN}</div>
</details>`;
};
let glGuideTab = 'alur';
function glGuideSet(t) { glGuideTab = t; renderGlGuide(); }
let glGuideOpen = false;   // tertutup bawaan — dibuka dengan klik judul (2 Nov 2026, permintaan pemilik)
// Panduan tampil di depan halaman Galeri (2 Nov 2026, permintaan pemilik — dipindah dari form): untuk yang bisa menambah media
const glGuideFor = () => glCanEdit() || (GL_DEALER_SUBMIT && !!authUser);
function renderGlGuide() {
  const el = document.getElementById('gl-guide-box'); if (!el) return;
  el.innerHTML = glGuideFor() ? glGuideHtml() : '';
}
// Tayang: draf / sekarang / ⏰ jadwal (tanggal + jam WIB, bawaan besok 19.00) + kirim notifikasi 🚗 (4 Nov 2026, permintaan pemilik)
function glSchedInit(e, it) {
  e.wasLive = !!(it && it.published && !glPending(it) && !glSched(it));
  e.notify = it ? it.notify !== false : true;
  if (it && glSched(it)) { const w = new Date(Date.parse(it.publish_at) + 7 * 3600e3).toISOString(); Object.assign(e, { mode: 'sched', sd: w.slice(0, 10), st: w.slice(11, 16) }); return; }
  Object.assign(e, { mode: e.published ? 'now' : 'draft', sd: new Date(Date.parse(todayWIB() + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10), st: '19:00' });
}
const glSchedIso = e => e.mode === 'sched' && e.sd && e.st ? new Date(`${e.sd}T${e.st}:00+07:00`).toISOString() : null;
function glSchedSet(k, v) {
  if (!glEdit) return; glEdit[k] = v;
  if (k === 'mode') { glEdit.published = v !== 'draft'; document.getElementById('glf-sched').outerHTML = glSchedHtml(); }
  glSchedNote();
}
function glSchedHtml() {
  const e = glEdit, seg = (m, t) => `<button type="button" class="${e.mode === m ? 'on' : ''}" onclick="glSchedSet('mode','${m}')">${t}</button>`;
  return `<div class="w4 cwf-sched gl-sched" id="glf-sched"><div class="cwf-h">Tayang</div>
    <div class="cwf-seg">${seg('draft', glPending(e) ? 'Belum disetujui' : 'Draf')}${seg('now', glPending(e) ? 'Setujui &amp; tampilkan' : 'Tayang sekarang')}${seg('sched', '⏰ Jadwalkan')}</div>
    ${e.mode === 'sched' ? `<div class="cwf-row"><label>Tanggal<input type="date" value="${escHtml(e.sd)}" min="${todayWIB()}" oninput="glSchedSet('sd',this.value)"></label><label>Jam (WIB)<input type="time" value="${escHtml(e.st)}" step="300" oninput="glSchedSet('st',this.value)"></label></div>` : ''}
    ${e.mode !== 'draft' && !e.wasLive && !e.push_at ? `<label class="cwf-chk"><input type="checkbox"${e.notify ? ' checked' : ''} onchange="glEdit.notify=this.checked;glSchedNote()"> 🔔 Kirim notifikasi “Instalasi baru” ke HP pengunjung saat tayang</label>` : ''}
    <div class="cwf-snote" id="glf-snote"></div></div>`;
}
function glSchedNote() {
  const e = glEdit, el = document.getElementById('glf-snote'), btn = document.getElementById('glf-save'); if (!e) return;
  const iso = glSchedIso(e), past = iso && Date.parse(iso) <= Date.now(), ntf = e.notify && !e.wasLive && !e.push_at;
  if (el) el.innerHTML = e.mode === 'draft' ? 'Belum terlihat oleh pengunjung — hanya Admin/Editor.'
    : e.mode === 'now' || past ? `${past ? '⚠ Waktu ini sudah lewat — ' : ''}Tampil untuk pengunjung begitu disimpan${ntf ? ' + notifikasi 🚗 terkirim' : ''}.`
    : `Otomatis tampil <b>${escHtml(glWhen(iso))}</b>${ntf ? ' + notifikasi 🚗 ke HP pengunjung' : ''}. Sebelum itu hanya Admin/Editor yang bisa melihatnya; Editor mendapat pengingat sesuai pilihan di Setting.`;
  if (btn && !btn.disabled) btn.textContent = e.mode === 'sched' && !past ? '⏰ Simpan Jadwal' : '💾 Simpan';
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
      ${e.submit ? `<label class="w2">Nama partner Anda *<select onchange="glPickDealer(this.value)"><option value="">— pilih partner —</option>${opt([...new Set(adPublic().map(d => d.n))].sort(), e.dealer)}</select></label>`
        : `<label class="w2">Partner pemasang<input list="glf-dealers" value="${escHtml(e.dealer)}" placeholder="Ketik / pilih partner resmi" oninput="glPickDealer(this.value)"><datalist id="glf-dealers">${[...new Set(adPublic().map(d => d.n))].map(n => `<option value="${escHtml(n)}"></option>`).join('')}</datalist></label>`}
      <label${e.submit ? ' class="w2"' : ''}>Kota<input id="glf-city" value="${escHtml(e.city)}" oninput="glField('city',this.value)"></label>
      ${e.submit ? '' : `<label>Urutan<input type="number" value="${escHtml(e.sort ?? 0)}" title="Angka kecil tampil lebih dulu" oninput="glField('sort',this.value)"></label>`}
      <label class="w4">Catatan singkat<textarea rows="2" placeholder="mis. Upgrade full system dengan DSP — vokal jernih, bass rapi." oninput="glField('note',this.value)">${escHtml(e.note)}</textarea></label>
      <div class="w4"><div class="gl-flbl">Produk yang dipasang</div>
        <input list="glf-plist" placeholder="Ketik nama produk lalu pilih…" onchange="glAddProduct(this)"><datalist id="glf-plist">${glProdOptions()}</datalist>
        <div class="gl-pchips" id="glf-prods"></div></div>
      <label class="w2">Prestasi (Hall of Fame)<select onchange="glField('hof_id',this.value)"><option value="">— tidak ada —</option>${hofs.map(h => `<option value="${escHtml(h.id)}"${h.id === e.hof_id ? ' selected' : ''}>${escHtml([`${h.award} · ${h.cls || ''}`, h.name, h.car, `${h.event} ${h.year || ''}`].filter(Boolean).join(' · '))}</option>`).join('')}</select></label>
      ${e.submit ? '' : !isEditor() ? '<div class="w2 gl-hint">⏳ Setelah disimpan, foto/video menunggu persetujuan Editor sebelum tampil.</div>' : glSchedHtml()}
      <div class="w4"><div class="gl-flbl">Foto & Video <small>(foto otomatis diperkecil; video diunggah apa adanya)</small></div>
        <div class="gl-upr"><label class="gt-btn gl-up">📷 Tambah Foto<input type="file" accept="image/*" multiple hidden onchange="glAddPhotos(this)"></label><label class="gt-btn gl-up">🎬 Tambah Video<input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" multiple hidden onchange="glAddVideos(this)"></label></div>
        <div class="gl-hint gl-vhint">Video: MP4 (H.264), maksimal ${GL_VIDEO_MAX_MB} MB per file — disarankan ≤ 30 MB agar cepat diputar di HP. Video tidak dikompres ulang di sini.</div>
        <div class="gl-fphotos" id="glf-photos"></div></div>
      ${e.submit ? `<label class="w4 gl-pub gl-agree"><input type="checkbox"${e.agree ? ' checked' : ''} onchange="glField('agree',this.checked)"> Foto/video ini milik partner kami, <b>plat nomor sudah diburamkan</b>, dan pemilik mobil tidak keberatan ditampilkan.</label>` : ''}
    </div>
    <div class="gl-factions"><button class="gt-btn ghost" onclick="closeGlForm()">Batal</button>${e.submit ? '<button class="gt-btn confirm" id="glf-save" onclick="submitGlItem()">📤 Kirim untuk Ditinjau</button>' : '<button class="gt-btn confirm" id="glf-save" onclick="saveGlItem()">💾 Simpan</button>'}</div>`;
  renderGlProducts(); renderGlPhotos(); if (!e.submit && isEditor()) glSchedNote();
}
async function saveGlItem() {
  const e = glEdit; if (!e || !supabase) return;
  if (!e.car_make || !String(e.car_model || '').trim()) { showToast('⚠ Isi merek & model mobil dulu.'); return; }
  const btn = document.getElementById('glf-save'); btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
  try {
    const row = { car_make: e.car_make, car_model: String(e.car_model).trim(), car_year: e.car_year ? +e.car_year : null, body: e.body || null,
      dealer: (e.dealer || '').trim() || null, city: (e.city || '').trim() || null, note: (e.note || '').trim() || null, products: e.products,
      hof_id: e.hof_id || null, published: !!e.published, sort: +e.sort || 0, updated_at: new Date().toISOString() };
    if (isEditor() && e.mode) {   // jadwal tayang + notifikasi
      const iso = glSchedIso(e);
      row.publish_at = e.mode === 'sched' ? iso : e.mode === 'now' && e.publish_at && Date.parse(e.publish_at) <= Date.now() ? e.publish_at : null;
      row.notify = !!e.notify;
      if (iso && iso !== e.publish_at) row.remind_at = null;   // jadwal berubah → pengingat Editor dikirim lagi
    }
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
        photos.push(glPhotoRow(path, p, !!p.video));
      } else photos.push(glPhotoRow(p.path, p, glIsVid(p)));
    }
    const { error } = await supabase.from(GL_TABLE).update({ ...row, photos }).eq('id', id);
    if (error) throw error;
    if (e.removed.length) await supabase.storage.from(GL_BUCKET).remove(e.removed);
    const goLive = isEditor() && e.mode === 'now' && !e.wasLive, sched = isEditor() && e.mode === 'sched' && Date.parse(row.publish_at || 0) > Date.now();
    if (goLive && row.notify && typeof pushNotify === 'function') pushNotify('gallery', id);   // sekali per mobil (dicek server)
    closeGlForm();
    showToast(!isEditor() ? '✓ Disimpan — tampil setelah disetujui Editor' : sched ? `⏰ Dijadwalkan tayang ${glWhen(row.publish_at)}` : goLive && row.notify ? '✓ Instalasi tayang — notifikasi 🚗 dikirim' : '✓ Instalasi disimpan', 5000);
    await loadGaleri(true); renderGaleri(); refreshProductShowcase();
    if (document.getElementById('view-halloffame')?.classList.contains('active')) renderHallOfFame();
  } catch (err) {
    const m = String(err.message || err);
    if (/publish_at|remind_at|notify|schema cache/i.test(m) && typeof pushCopySql === 'function') { pushCopySql(); showToast('⚠ Jadwal tayang Galeri butuh SQL sekali — SQL notifikasi disalin, jalankan di Supabase → SQL Editor.', 9000); }
    else showToast('⚠ Gagal menyimpan: ' + m, 6000);
    btn.disabled = false; btn.textContent = '💾 Simpan';
  }
}
async function approveGlItem(id) {
  const it = glItems?.find(x => x.id === id); if (!it || !isEditor()) return;
  const { error } = await supabase.from(GL_TABLE).update({ published: true, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('⚠ Gagal menyetujui: ' + error.message, 6000); return; }
  showToast(`✓ ${glTitle(it)} disetujui — kini tampil di Galeri${it.hof_id ? ' & Hall of Fame' : ''}`);
  if (typeof pushNotify === 'function') pushNotify('gallery', id);
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
/* ── 🔧 Sering dipasang bersama + ⇄ Produk serupa (Tahap 6 A, 4 Nov 2026, permintaan pemilik — pratinjau .mockup/tahap6/) ──
   Data instalasi asli: perangkat (products) mobil Galeri yang tayang (glLive) + entri Hall of Fame ber-products; mobil yang sama
   di keduanya (daftar perangkat identik) dihitung sekali. Tampil bila produk ini ada di ≥ CO_MIN instalasi; produk lain dihitung
   "di n dari m mobil" (≥ 2). Produk serupa = kategori sama, seri lain, SRP ±50% (tanpa SRP: kategori sama, seri lain). */
const CO_MIN = 2, CO_MAX = 6, SIM_MAX = 4;
function coInstalls() {
  const sets = new Map();
  const add = arr => { const a = [...new Set((arr || []).filter(Boolean))]; if (a.length > 1) sets.set(a.slice().sort().join('|'), a); };
  (typeof glLive === 'function' ? glLive() : []).forEach(it => add(it.products));
  (typeof HALL_OF_FAME !== 'undefined' ? HALL_OF_FAME : []).forEach(e => add(e.products));
  return [...sets.values()];
}
function coHtml(product, brand, lineName) {
  const ins = coInstalls().filter(a => a.includes(product.id)), m = ins.length;
  const cnt = new Map(); ins.forEach(a => a.forEach(id => { if (id !== product.id) cnt.set(id, (cnt.get(id) || 0) + 1); }));
  const top = [...cnt].filter(([id, n]) => n >= 2 && findProductAny(id)?.product).sort((a, b) => b[1] - a[1]).slice(0, CO_MAX);
  const card = (id, n) => { const { brand: b, product: p } = findProductAny(id);
    return `<div class="co-w">${productCard(b, p)}${n ? `<div class="co-n">🔧 di ${n} dari ${m} mobil</div>` : ''}</div>`; };
  let out = '';
  if (m >= CO_MIN && top.length) out += `<div class="co-sec"><div class="co-h"><b>🔧 Sering dipasang bersama ${escHtml(product.name)}</b><small>dari ${m} instalasi partner resmi di Galeri &amp; Hall of Fame</small></div>
    <div class="line-grid co-grid">${top.map(([id, n]) => card(id, n)).join('')}</div>
    <div class="co-bar"><button onclick="coRakit(${escHtml(JSON.stringify([product.id, ...top.slice(0, 3).map(x => x[0])]))})">＋ Rakit sistem dengan ${escHtml(product.name)} + ${Math.min(3, top.length)} teratas</button><span>membuka System Simulator berisi produk-produk ini</span></div></div>`;
  const all = BRANDS.flatMap(b => b.lines.flatMap(l => l.products.map(p => ({ b, l, p }))));
  const sim = all.filter(x => x.p.category === product.category && x.p.id !== product.id && x.l.name !== lineName && !cnt.has(x.p.id)
      && (!product.price || (x.p.price && Math.abs(x.p.price - product.price) / product.price <= .5)))
    .sort((a, b) => product.price ? Math.abs(a.p.price - product.price) - Math.abs(b.p.price - product.price) : 0).slice(0, SIM_MAX);
  if (sim.length) out += `<div class="co-sec"><div class="co-h"><b>⇄ Produk serupa</b><small>${escHtml(product.category)}${product.price ? ' · kisaran SRP mirip' : ''} · seri / brand lain</small></div>
    <div class="line-grid co-grid">${sim.map(x => card(x.p.id, 0)).join('')}</div></div>`;
  return out;
}
function coRakit(ids) {
  rkLoad();
  let n = 0;
  ids.forEach(pid => { const { product: p } = findProductAny(pid); if (!p || rk.items.some(it => it.pid === pid)) return;
    const v = p.priceList ? Object.keys(p.priceList)[0] : undefined; rk.items.push({ pid, qty: 1, ...(v ? { v } : {}) }); n++;
    if (typeof intLog === 'function') intLog('rk', pid); });
  rkSave(); openRakit();
  showToast(n ? `✓ ${n} produk ditambahkan ke System Simulator` : 'Produk-produk ini sudah ada di System Simulator');
}
function renderProductShowcase(product, lineName, brand) {
  scProduct = { product, lineName, brand };
  const coEl = document.getElementById('pd-co'); if (coEl) coEl.innerHTML = coHtml(product, brand, lineName);
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

/* ── 📤 Bagikan project Galeri ke WA (3 Nov 2026, permintaan pemilik): foto pertama + teks + link publik ?gl=<id> ── */
let glLinkPending = null;   // link ?gl=<id> dibuka setelah Supabase siap (js/main.js)
const glLink = id => liveLink('g', id) || `${PORTAL_URL}/galeri/?gl=${encodeURIComponent(id)}`;   // /g/<id>/ = kartu WA mobil itu (bila sudah dibuat jadwal GitHub)   // /galeri/ = kartu pratinjau WA Galeri, lalu diteruskan ke /?gl=
const glShareCache = {};
function glPrepShare(it) {
  const ph = (it.photos || []).find(p => !glIsVid(p)); const src = ph ? glUrl(ph.path) : '';
  if (!src || glShareCache[it.id]?.src === src) return;
  glShareCache[it.id] = { src, file: null };
  fetch(src).then(r => r.ok ? r.blob() : null).then(b => { if (b && glShareCache[it.id]?.src === src) glShareCache[it.id].file = new File([b], 'Instalasi-CAI.' + (b.type.includes('png') ? 'png' : b.type.includes('webp') ? 'webp' : 'jpg'), { type: b.type }); }).catch(() => {});
}
async function glShare(id) {
  const it = glItems?.find(x => x.id === id); if (!it) return;
  const prods = (it.products || []).map(pid => { const r = glProd(pid); return r.product ? r.product.name : ''; }).filter(Boolean);
  const text = `🚗 *Instalasi ${glTitle(it)}${it.car_year ? ' ' + it.car_year : ''}*` +
    (it.dealer ? `\nDipasang oleh ${it.dealer}${it.city ? ' — ' + it.city : ''}` : '') +
    (prods.length ? `\nPerangkat: ${prods.slice(0, 6).join(', ')}${prods.length > 6 ? ', …' : ''}` : '') +
    `\n\nLihat foto & video lengkapnya di CAI Hub:\n${glLink(it.id)}`;
  const file = glShareCache[it.id]?.file;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  window.open(`https://wa.me/?text=${waText(text)}`, '_blank', 'noopener');
}
async function glOpenLinked(id) {
  await openGaleri();
  const it = glItems?.find(x => x.id === id && x.published && !glPending(x) && (!glSched(x) || isAdmin()));
  if (it) openGlDetail(id); else showToast('Instalasi ini tidak ditemukan atau belum ditampilkan.');
}
