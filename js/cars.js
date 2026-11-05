/* ═══════════ TAHAP 7 — 🚗 CARI BERDASARKAN MOBIL + 🏪 PROFIL PARTNER (4 Nov 2026, permintaan pemilik — pratinjau .mockup/tahap7/) ═══════════
   Data mobil = Galeri Instalasi yang tayang (glLive()) + Hall of Fame (HALL_OF_FAME, field `car` "Merek Model").
   Nama disamakan lewat carKey(): huruf kecil tanpa spasi/tanda baca ("Xtrail" = "X-Trail") + alias CAR_ALIAS.
   Mobil Galeri yang ditautkan ke prestasi (hof_id) dihitung satu mobil dengan prestasi itu (hofCarKey).
   Profil partner = data Authorized Partner (adPublic()) + instalasi Galeri (field dealer) + prestasi Hall of Fame (hofDealer()).
   Link: /?mobil=<slug> · /?partner=<slug> (slug = shareSlug()). Hanya SRP, tanpa klaim garansi. */

// Model yang ditulis berbeda di data → satu kunci (kiri = kunci asal, kanan = kunci tujuan). Tambah di sini bila ada nama kembar.
const CAR_ALIAS = { 'mazda|hatchback3': 'mazda|3', 'mazda|mazda3': 'mazda|3', 'aion|hyptec': 'aion|hyptecht' };
// Nama tampilan untuk kunci tertentu (selain itu: nama terpanjang yang ditemukan di data, mis. "X-Trail" bukan "Xtrail")
const CAR_LABEL = { 'mazda|3': 'Mazda 3', 'aion|hyptecht': 'Aion Hyptec HT' };
const CAR_ICON = b => glIsEv(b) ? '⚡' : /mpv|van/i.test(b || '') ? '🚐' : /sedan|hatch/i.test(b || '') ? '🚗' : '🚙';
const carNorm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function carKey(make, model) { const k = carNorm(make) + '|' + carNorm(model); return CAR_ALIAS[k] || k; }
// "Toyota Innova Zenix" → { make: 'Toyota', model: 'Innova Zenix' } (merek dari GL_MAKES, selain itu kata pertama)
function carSplit(txt) {
  const t = String(txt || '').trim(); if (!t) return null;
  const mk = [...GL_MAKES].sort((a, b) => b.length - a.length).find(m => t.toLowerCase().startsWith(m.toLowerCase() + ' ') || t.toLowerCase() === m.toLowerCase());
  if (mk) return { make: mk, model: t.slice(mk.length).trim() };
  const i = t.indexOf(' '); return i < 0 ? { make: t, model: '' } : { make: t.slice(0, i), model: t.slice(i + 1) };
}
const carPartner = name => name ? hofDealer(name) : null;   // nama di data → baris Authorized Partner (alias Hall of Fame ikut)

// Semua mobil: [{ key, slug, make, name, body, ev, gl: [...], hof: [...], cars: n, partners: [names] }]
let carCache = null, carCacheSig = '';
function carList() {
  const gl = typeof glLive === 'function' && glItems ? glLive() : [], hof = typeof hofData === 'function' ? hofData() : [];
  const sig = gl.length + '|' + hof.length + '|' + (glItems ? glItems.length : -1);
  if (carCache && carCacheSig === sig) return carCache;
  const map = new Map(), names = new Map();
  const get = (make, model) => {
    const key = carKey(make, model);
    if (!map.has(key)) map.set(key, { key, make, body: '', ev: false, gl: [], hof: [], dealers: new Set() });
    const nm = `${make} ${model}`.trim(), cur = names.get(key);
    if (!cur || nm.length > cur.length) names.set(key, nm);
    return map.get(key);
  };
  for (const g of gl) {
    if (!g.car_make) continue;
    const c = get(g.car_make, g.car_model || ''); c.gl.push(g);
    if (!c.body) c.body = g.body || ''; if (glIsEv(g.body)) c.ev = true;
    if (g.dealer) c.dealers.add(g.dealer);
  }
  for (const e of hof) {
    const s = carSplit(e.car); if (!s) continue;
    const c = get(s.make, s.model); c.hof.push(e); if (e.dealer) c.dealers.add(e.dealer);
  }
  carCache = [...map.values()].map(c => {
    const linked = new Set(c.gl.filter(g => g.hof_id).map(g => { const e = hof.find(x => x.id === g.hof_id); return e ? hofCarKey(e) : ''; }).filter(Boolean));
    const hofCars = new Set(c.hof.map(hofCarKey).filter(k => !linked.has(k)));
    const name = CAR_LABEL[c.key] || names.get(c.key);
    const partners = [...new Map([...c.dealers].map(n => { const d = carPartner(n); return [d ? d.n : n, d ? d.n : n]; })).values()];
    return { ...c, name, slug: shareSlug(name), cars: c.gl.length + hofCars.size, partners, wins: c.hof.length,
      j1: c.hof.filter(e => e.place === 1).length };
  }).sort((a, b) => b.wins - a.wins || b.cars - a.cars || b.gl.length - a.gl.length || a.name.localeCompare(b.name));
  carCacheSig = sig;
  return carCache;
}
const carBySlug = slug => carList().find(c => c.slug === slug || c.key === slug);
const carGlPhoto = g => { const ps = g.photos || [], ok = p => p && !glIsVid(p);
  return ps.find(p => p.wa && ok(p)) || ps.find(p => ok(p) && /tampak luar/i.test(p.area || '')) || ps.find(ok) || null; };
// Sampul: foto (pilihan kartu WA → Tampak Luar → pertama); mobil yang hanya punya video → cuplikan video (adegan kartu WA bila dipilih Editor)
function carMedia(g, fallbackIc) {
  const p = g && carGlPhoto(g);
  if (p) return `<img src="${glUrl(p.path)}" alt="" loading="lazy"${glFrAttr(p)}>`;
  const ps = g?.photos || [], v = ps.find(x => x.wa && glIsVid(x)) || ps.find(x => x.cover && glIsVid(x)) || ps.find(glIsVid);
  if (v) return `<video src="${glUrl(v.path)}#t=${v.waT ?? 1.5}" muted playsinline preload="metadata"${glFrAttr(v)}></video>`;
  return `<span class="car-hero-ic">${fallbackIc}</span>`;
}

// ── Daftar mobil ──
let carQ = '', carMake = 'all', carSel = null;
function openCars(q) {
  if (!CARS_ON) { showView('dashboard'); return; }   // disembunyikan (CARS_ON, js/core.js)
  if (typeof q === 'string') carQ = q;
  carSel = null; showView('mobil'); document.querySelector('.main')?.scrollTo(0, 0);
  renderCars(); carEnsure();
}
function carEnsure() {
  if (typeof supabase !== 'undefined' && supabase && typeof loadGaleri === 'function' && !glItems) loadGaleri().then(carsRerender, () => {});
  if (typeof adEnsure === 'function') adEnsure();
}
function carsRerender() {
  carCache = null;
  const v = document.body.dataset.view;
  const dc = document.getElementById('dash-car'); if (dc) dc.innerHTML = carDashHtml();
  if (v === 'mobil') renderCars();
  if (v === 'finder' && typeof renderFinder === 'function') { if (fd.step >= 4 && fd.stage) fdCompute(); renderFinder(); }
  if (v === 'partner' && pfSel) renderPartner();
}
function setCarMake(m) { carMake = m; renderCars(); }
function carSearch(v) { carQ = v; renderCars(true); carSearchLog(v); }
// Laporan Minat: kata di kotak Cari per Mobil (1,5 dtk setelah berhenti mengetik) — hit = ada mobilnya, miss = belum ada (calon konten Galeri)
let carSearchT = null;
function carSearchLog(v) {
  clearTimeout(carSearchT); const q = String(v || '').trim(); if (q.length < 3 || typeof intLog !== 'function') return;
  carSearchT = setTimeout(() => { const k = normKey(q); intLog('carq', q, carList().some(c => normKey(c.name).includes(k)) ? 'hit' : 'miss', true); }, 1500);
}
function renderCars(keepFocus) {
  const el = document.getElementById('mobil-body'); if (!el) return;
  if (carSel) return renderCar();
  const all = carList(), q = normKey(carQ);
  const makes = [...new Map(all.map(c => [c.make, (all.filter(x => x.make === c.make).length)])).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const hasEv = all.some(c => c.ev);
  const rows = all.filter(c => (carMake === 'all' || (carMake === 'ev' ? c.ev : c.make === carMake)) && (!q || normKey(c.name + ' ' + c.partners.join(' ')).includes(q)));
  const loading = !glItems && typeof supabase !== 'undefined' && supabase;
  const head = `<div class="car-intro"><b>Mobil Anda apa?</b><span>Lihat contoh pemasangan, prestasi kompetisi & perangkat yang dipakai di mobil yang sama — dikerjakan partner resmi CAI.</span></div>
    <div class="car-srch"><input id="car-q" type="search" placeholder="Ketik merek / model, mis. “Innova”" value="${escHtml(carQ)}" oninput="carSearch(this.value)" autocomplete="off"></div>
    <div class="chips-row car-chips"><button class="filter-chip${carMake === 'all' ? ' active' : ''}" onclick="setCarMake('all')">Semua</button>${makes.map(([m, n]) =>
      `<button class="filter-chip${carMake === m ? ' active' : ''}" onclick="setCarMake(${escHtml(JSON.stringify(m))})">${escHtml(m)}${n > 1 ? ' ' + n : ''}</button>`).join('')}${hasEv ? `<button class="filter-chip${carMake === 'ev' ? ' active' : ''}" onclick="setCarMake('ev')">⚡ Listrik</button>` : ''}</div>`;
  const row = c => `<button class="car-it" onclick="openCar('${c.slug}')"><span class="car-ic">${CAR_ICON(c.body)}</span><div>
      <b>${escHtml(c.name)}${c.wins ? ` <span class="car-tag">🏆 ${c.wins}</span>` : ''}</b>
      <small>${c.cars} mobil${c.gl.length ? ' · 📷 Galeri' : ''}${c.partners.length ? ' · ' + escHtml(c.partners.slice(0, 2).join(', ')) + (c.partners.length > 2 ? ' +' + (c.partners.length - 2) : '') : ''}</small></div><i>›</i></button>`;
  const list = rows.length ? `<div class="car-h">Mobil dengan contoh pemasangan <span>${rows.length} model</span></div><div class="car-list">${rows.map(row).join('')}</div>`
    : `<div class="stock-empty">${loading ? 'Memuat data mobil…' : `Belum ada contoh pemasangan untuk “${escHtml(carQ)}”. Tanyakan langsung ke partner resmi terdekat.`}</div>${loading ? '' : `<button class="car-btn o" onclick="openAuthDealers()">📍 Cari partner resmi terdekat</button>`}`;
  el.innerHTML = head + list;
  if (keepFocus) { const i = document.getElementById('car-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}

// Perangkat per mobil: { sets: Map daftar perangkat unik, prods: id produk urut paling sering } — dipakai halaman mobil & pencarian Dashboard
function carProds(c) {
  const sets = new Map();
  for (const g of c.gl) if ((g.products || []).length) sets.set([...g.products].sort().join(','), g.products);
  for (const e of c.hof) if ((e.products || []).length) sets.set([...e.products].sort().join(','), e.products);
  const cnt = new Map(); for (const ps of sets.values()) for (const id of new Set(ps)) if (findProductAny(id).product) cnt.set(id, (cnt.get(id) || 0) + 1);
  return { sets, prods: [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]) };
}

// ── Halaman satu mobil ──
function openCar(slug) {
  if (!CARS_ON) { showView('dashboard'); return; }
  carSel = slug; showView('mobil'); document.querySelector('.main')?.scrollTo(0, 0);
  renderCar(); carEnsure();
  if (typeof intLog === 'function') intLog('car', slug, '', true);
}
function carBack() { carSel = null; renderCars(); document.querySelector('.main')?.scrollTo(0, 0); }
function renderCar() {
  const el = document.getElementById('mobil-body'); if (!el) return;
  const c = carBySlug(carSel);
  if (!c) { el.innerHTML = `<button class="car-back" onclick="carBack()">‹ Cari berdasarkan mobil</button><div class="stock-empty">${!glItems && typeof supabase !== 'undefined' && supabase ? 'Memuat data mobil…' : 'Mobil ini belum ada contoh pemasangannya.'}</div>`; return; }
  const g0 = [...c.gl].sort((a, b) => (b.photos || []).length - (a.photos || []).length)[0];
  const hof = [...c.hof].sort((a, b) => (a.place || 9) - (b.place || 9) || (b.year || 0) - (a.year || 0));
  // Perangkat: dihitung per mobil (Galeri + prestasi yang punya daftar perangkat; daftar identik dihitung sekali)
  const { sets, prods } = carProds(c);
  const rich = [...sets.values()].sort((a, b) => b.length - a.length)[0] || [];
  const medal = e => hofMedal(e.place);
  const partners = c.partners.map(n => adPublic().find(d => d.n === n) || null);
  const msg = d => `Halo ${d.n}, saya lihat contoh pemasangan audio di ${c.name} di CAI Hub (Concerto Audio Indonesia). Mobil saya juga ${c.name}, saya ingin bertanya.`;
  el.innerHTML = `<button class="car-back" onclick="carBack()">‹ Cari berdasarkan mobil</button>
    <div class="car-hero">${carMedia(g0, CAR_ICON(c.body))}${g0?.dealer ? `<em>Foto Galeri · ${escHtml(g0.dealer)}</em>` : ''}
      <div class="car-hero-t"><h2>${escHtml(c.name)}</h2><small>${[c.body, `${c.cars} mobil dikerjakan partner resmi CAI`].filter(Boolean).map(escHtml).join(' · ')}</small></div>
      <button class="car-share" onclick="carShare('${c.slug}')" title="Bagikan ke WhatsApp" aria-label="Bagikan">${SHARE_ICON}</button></div>
    <div class="car-stats"><div><b>${c.cars}</b><small>mobil</small></div><div><b>${c.wins}</b><small>prestasi</small></div><div><b>${c.partners.length}</b><small>partner</small></div></div>
    ${hof.length ? `<div class="car-h">🏆 Prestasi di ${escHtml(c.name)}</div><div class="car-list">${hof.map(e => `<button class="car-it" onclick="openHofWin('${e.id}')">${medal(e)}<div>
      <b>${e.place >= 1 && e.place <= 3 ? 'Juara ' + e.place : escHtml(e.award || 'Penghargaan')}${e.cls ? ' · ' + escHtml(e.cls) : ''}</b>
      <small>${escHtml([e.event, e.name, e.dealer].filter(Boolean).join(' · '))}</small></div><i>›</i></button>`).join('')}</div>` : ''}
    ${c.gl.length ? `<div class="car-h">📷 Contoh pemasangan <span>Galeri</span></div><div class="car-gal">${c.gl.map(g => {
      return `<button onclick="openGlDetail('${g.id}')"><span class="car-mw">${carMedia(g, CAR_ICON(g.body))}</span><div><b>${escHtml(glTitle(g))}${g.car_year ? ' · ' + g.car_year : ''}</b><small>${escHtml([g.dealer, g.city].filter(Boolean).join(' · '))} · ${(g.photos || []).length} foto/video</small></div></button>`; }).join('')}</div>` : ''}
    ${prods.length ? `<div class="car-h">🔧 Perangkat yang dipasang di ${escHtml(c.name)}${sets.size > 1 ? ` <span>dari ${sets.size} mobil</span>` : ''}</div><div class="d-row car-prods">${prods.slice(0, 12).map(favMini).join('')}</div>
      <button class="car-btn g" onclick="carRakit('${c.slug}')">🔧 Rakit sistem seperti ${escHtml(c.name)} ini</button>` : ''}
    <button class="car-btn o" onclick="openFinder('${c.slug}')">🎯 Rekomendasi sistem untuk ${escHtml(c.name)} sesuai anggaran</button>
    ${c.partners.length ? `<div class="car-h">🏪 Partner yang pernah mengerjakan</div><div class="car-list">${c.partners.map((n, i) => { const d = partners[i];
      return `<div class="car-pp"><button class="car-pp-m" onclick="${d ? `openPartner('${shareSlug(d.n)}')` : ''}" ${d ? '' : 'disabled'}><span class="pf-av sm">${escHtml(pfInit(n))}</span><div><b>${escHtml(n)}</b><small>${d ? '📍 ' + escHtml(d.c || d.r) + ' · ' : ''}${pfStats(n).wins ? '🏆 ' + pfStats(n).wins + ' prestasi' : (pfStats(n).gl ? pfStats(n).gl + ' instalasi Galeri' : '')}</small></div>${d ? '<i>Profil ›</i>' : ''}</button>
        ${d?.wa ? `<a class="car-wa" href="https://wa.me/${d.wa}?text=${encodeURIComponent(msg(d))}" target="_blank" rel="noopener">💬 Tanya</a>` : ''}</div>`; }).join('')}</div>` : ''}
    <div class="car-foot">Mobil Anda belum ada di daftar? Partner resmi CAI tetap bisa membantu. <button onclick="openAuthDealers()">Cari partner terdekat ›</button></div>`;
  el.dataset.rich = rich.join(',');
}
function carRakit(slug) {
  const c = carBySlug(slug); if (!c) return;
  const el = document.getElementById('mobil-body'); const ids = (el?.dataset.rich || '').split(',').filter(id => findProductAny(id).product);
  if (ids.length && typeof coRakit === 'function') coRakit(ids);
}
// Link berbagi: kartu WA per mobil (/m/<slug>/, dibuat bot GitHub tools/gen-live-cards.js) bila sudah ada, selain itu /?mobil=
const carLink = slug => (typeof liveLink === 'function' && liveLink('m', slug)) || location.origin + '/?mobil=' + encodeURIComponent(slug);
const pfLink = slug => (typeof liveLink === 'function' && liveLink('pp', slug)) || location.origin + '/?partner=' + encodeURIComponent(slug);
function pfShare(slug) {
  const d = pfFind(slug); if (!d) return;
  const x = pfData(d.n), j1 = x.hof.filter(e => e.place === 1).length;
  const t = `🏪 ${d.n} — Partner Resmi Concerto Audio Indonesia\n📍 ${[d.c, d.r].filter(Boolean).join(', ')}` +
    (x.hof.length ? `\n🏆 ${x.hof.length} prestasi kompetisi${j1 ? ` (${j1} Juara 1)` : ''}` : '') + (x.gl.length ? `\n📷 ${x.gl.length} instalasi di Galeri CAI Hub` : '') +
    `\n\nLihat profil, hasil pemasangan & kontaknya:\n${pfLink(slug)}`;
  window.open('https://wa.me/?text=' + waText(t), '_blank', 'noopener');
}
function carShare(slug) {
  const c = carBySlug(slug); if (!c) return;
  const t = `🚗 ${c.name} — contoh pemasangan audio di CAI Hub\n${c.cars} mobil dikerjakan partner resmi Concerto Audio Indonesia${c.wins ? ` · 🏆 ${c.wins} prestasi kompetisi` : ''}\n\nLihat foto, perangkat & partnernya:\n${carLink(slug)}`;
  window.open('https://wa.me/?text=' + waText(t), '_blank', 'noopener');
}
// Link /?mobil=… · /?partner=…: buka langsung; Supabase siap beberapa saat setelah halaman dimuat → coba muat Galeri sampai bisa
// (setelah Galeri / daftar partner termuat, carsRerender() menggambar ulang halaman yang sedang terbuka)
function carOpenLinked(slug) { if (slug) openCar(slug); else openCars(); carEnsureLater(); }
function carEnsureLater(n = 0) { if (glItems || n > 20) return; carEnsure(); setTimeout(() => carEnsureLater(n + 1), 500); }
// ── 🏪 Profil partner ──
let pfSel = null;
const pfInit = n => String(n || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(w => !/^(the|dan|and)$/i.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '★';
const pfFind = slug => adPublic().find(d => shareSlug(d.n) === slug) || null;
// Instalasi & prestasi milik partner (nama di data dicocokkan lewat hofDealer — alias Hall of Fame ikut)
function pfData(name) {
  const k = normKey(name), own = n => { const d = carPartner(n); return d ? normKey(d.n) === k : normKey(n || '') === k; };
  const gl = (typeof glLive === 'function' && glItems ? glLive() : []).filter(g => own(g.dealer));
  const hof = (typeof hofData === 'function' ? hofData() : []).filter(e => own(e.dealer)).sort((a, b) => (a.place || 9) - (b.place || 9) || (b.year || 0) - (a.year || 0));
  return { gl, hof };
}
const pfStats = name => { const r = pfData(name); return { gl: r.gl.length, wins: r.hof.length }; };
function openPartner(slug) {
  pfSel = slug; showView('partner'); document.querySelector('.main')?.scrollTo(0, 0);
  renderPartner(); carEnsure();
}
function renderPartner() {
  const el = document.getElementById('partner-body'); if (!el) return;
  const d = pfFind(pfSel);
  if (!d) { el.innerHTML = `<button class="car-back" onclick="openAuthDealers()">‹ Authorized Partner</button><div class="stock-empty">${adRows || adTried ? 'Partner ini tidak ada di daftar partner resmi CAI.' : 'Memuat data partner…'}</div>`; return; }
  const { gl } = pfData(d.n), hof = HOF_ON ? pfData(d.n).hof : [], cnt = pl => hof.filter(e => e.place === pl).length;
  const cars = new Set([...gl.map(g => carKey(g.car_make, g.car_model)), ...hof.map(e => { const s = carSplit(e.car); return s ? carKey(s.make, s.model) : ''; }).filter(Boolean)]);
  const brands = new Map(); for (const g of gl) for (const bid of new Set((g.products || []).map(id => findProductAny(id).brand?.id).filter(Boolean))) brands.set(bid, (brands.get(bid) || 0) + 1);
  const msg = `Halo ${d.n}, saya lihat profil & hasil pemasangan Anda di CAI Hub (Concerto Audio Indonesia). Saya ingin bertanya.`;
  const carChips = CARS_ON ? [...cars].map(k => carList().find(c => c.key === k)).filter(Boolean) : [];
  el.innerHTML = `<button class="car-back" onclick="openAuthDealers()">‹ Authorized Partner</button>
    <div class="pf-hd"><span class="pf-av">${escHtml(pfInit(d.n))}</span><div><h2>${escHtml(d.n)}</h2>
      <small>📍 ${escHtml([d.c, d.r].filter(Boolean).join(', '))}${d.a ? ' · ' + escHtml(d.a) : ''}</small>
      <div class="pf-badges"><span class="pf-ok">✓ Partner resmi CAI</span>${hof.length ? `<span class="pf-tr">🏆 ${hof.length} prestasi${cnt(1) ? ' · ' + cnt(1) + ' Juara 1' : ''}</span>` : ''}</div></div>
      <button class="car-share" onclick="pfShare('${pfSel}')" title="Bagikan ke WhatsApp" aria-label="Bagikan">${SHARE_ICON}</button></div>
    <div class="pf-acts">${d.wa ? `<a class="wa" href="https://wa.me/${d.wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}<a href="${adMaps(d)}" target="_blank" rel="noopener">📍 Maps</a>${d.ig ? `<a href="https://www.instagram.com/${encodeURIComponent(d.ig)}/" target="_blank" rel="noopener">📸 Instagram</a>` : ''}</div>
    <div class="car-stats"><div><b>${gl.length}</b><small>instalasi Galeri</small></div><div><b>${hof.length}</b><small>prestasi kompetisi</small></div><div><b>${cars.size}</b><small>model mobil</small></div></div>
    ${gl.length ? `<div class="car-h">📷 Hasil pemasangan <span>Galeri</span></div><div class="car-gal">${gl.map(g => {
      return `<button onclick="openGlDetail('${g.id}')"><span class="car-mw">${carMedia(g, CAR_ICON(g.body))}</span><div><b>${escHtml(glTitle(g))}${g.car_year ? ' · ' + g.car_year : ''}</b><small>${(g.photos || []).length} foto/video${g.hof_id ? ' · 🏆 Juara' : ''}</small></div></button>`; }).join('')}</div>` : ''}
    ${hof.length ? `<div class="car-h">🏆 Prestasi <span class="hof-ms">${[1, 2, 3].map(pl => cnt(pl) ? hofMedal(pl, cnt(pl)) : '').join('')}</span></div><div class="car-list">${hof.map(e => `<button class="car-it" onclick="openHofWin('${e.id}')">${hofMedal(e.place)}<div>
      <b>${e.place >= 1 && e.place <= 3 ? 'Juara ' + e.place : escHtml(e.award || 'Penghargaan')}${e.cls ? ' · ' + escHtml(e.cls) : ''}</b><small>${escHtml([e.event, e.car, e.name].filter(Boolean).join(' · '))}</small></div><i>›</i></button>`).join('')}</div>` : ''}
    ${carChips.length ? `<div class="car-h">🚗 Mobil yang pernah dikerjakan</div><div class="chips-row">${carChips.map(c => `<button class="filter-chip" onclick="openCar('${c.slug}')">${CAR_ICON(c.body)} ${escHtml(c.name)}</button>`).join('')}</div>` : ''}
    ${brands.size ? `<div class="car-h">🔊 Brand CAI yang dipasang <span>dari ${gl.length} instalasi</span></div><div class="pf-bars">${[...brands.entries()].sort((a, b) => b[1] - a[1]).map(([bid, n]) => { const b = BRANDS.find(x => x.id === bid);
      return `<button onclick="showBrand('${bid}')"><span>${escHtml(b?.name || bid)}</span><em style="--w:${Math.round(n / gl.length * 100)}%"></em><b>${n}/${gl.length}</b></button>`; }).join('')}</div>` : ''}
    ${!gl.length && !hof.length ? `<div class="stock-empty">Hasil pemasangan ${escHtml(d.n)} belum ada di Galeri CAI Hub. Hubungi langsung lewat tombol di atas untuk melihat contoh kerjanya.</div>` : ''}`;
}
function partnerOpenLinked(slug) { if (slug) openPartner(slug); else openAuthDealers(); carEnsureLater(); }
// Tombol "Profil" kecil untuk kartu partner di menu lain
const pfBtn = (d, close) => d ? `<button class="ad-btn pf" onclick="${close ? close + ';' : ''}openPartner('${shareSlug(d.n)}')">🏪 Profil</button>` : '';

// Kotak Dashboard pengunjung umum: "🚗 Mobil Anda apa?" + 4 mobil teratas
function carDashHtml() {
  if (!CARS_ON) return '';
  const top = carList().slice(0, 4);
  return `<div class="car-dash"><div class="car-dash-t"><b>🚗 Mobil Anda apa?</b><span>Lihat contoh pemasangan & perangkat yang dipakai di mobil yang sama.</span></div>
    <form class="car-dash-f" onsubmit="event.preventDefault();openCars(this.q.value)"><input name="q" type="search" placeholder="Ketik merek / model mobil, mis. “Innova”" autocomplete="off"><button>Cari</button></form>
    ${top.length ? `<div class="chips-row">${top.map(c => `<button class="filter-chip" onclick="openCar('${c.slug}')">${CAR_ICON(c.body)} ${escHtml(c.name)}${c.wins ? ' · 🏆 ' + c.wins : ''}</button>`).join('')}<button class="filter-chip" onclick="openCars('')">Semua mobil ›</button></div>` : ''}
    <button class="car-dash-fd" onclick="openFinder()">🎯 Belum tahu pilih apa? <b>Temukan sistem yang cocok ›</b></button></div>`;
}
