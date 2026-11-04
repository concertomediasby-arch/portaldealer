/* ══════════════════════════════════════════
   DASHBOARD BARU (3 Nov 2026, permintaan pemilik — pratinjau .mockup/dash/ disetujui)
   Dua tampilan:
   · Pengunjung umum (belum login, class .guest-only): bar "Temukan sistem audio mobil…" + pencarian + chip kategori,
     3 tombol utama (Cari partner resmi · System Simulator · Paket Audio), Hall of Fame + Academy, Paket Audio pilihan,
     ajakan "Partner resmi CAI? Masuk dengan Kode Akses".
   · Partner yang login (class .login-only; Admin/Editor juga): sapaan + pencarian, "Baru untuk Anda"
     (Panduan Partner · Galeri Instalasi · Academy · Hall of Fame).
   Keduanya: headline News/Concerto Way paling atas (#cway-hl, js/news.js), Sorotan brand (#dash-tiles), brand ringkas.
══════════════════════════════════════════ */
const DASH_CATS = [['Speaker', 'Speaker'], ['Subwoofer', 'Subwoofer'], ['Amplifier', 'Amplifier'], ['DSP', 'DSP'], ['Kabel', 'Cable']];
const DASH_NEW_DAYS = 5;   // label BARU di "Baru untuk Anda" (sama dengan ★ menu)
const DASH_SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

const dashGreet = () => {
  const h = +new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }) % 24;
  return h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam';
};

// Pencarian Dashboard → Katalog (produk/model/kategori); bila tak ada produk tapi cocok dengan partner/kota → Authorized Partner
function dashSearch(q) {
  q = String(q || '').trim();
  if (!q) { openCatalog(); return; }
  const k = q.toLowerCase();
  const prodHit = BRANDS.some(b => b.lines.some(l => l.products.some(p =>
    (p.name + ' ' + p.model + ' ' + p.category + ' ' + b.name + ' ' + (p.desc || '')).toLowerCase().includes(k))));
  const dlHit = adPublic().some(d => [d.n, d.c, d.r, d.a].join(' ').toLowerCase().includes(k));
  if (!prodHit && dlHit) {
    openAuthDealers();
    const s = document.getElementById('ad-search');
    if (s) { s.value = q; renderAuthDealers(); }
    return;
  }
  openCatalog();
  const s = document.getElementById('catalog-search');
  if (s) { s.value = q; renderCatalog(); }
}
function dashSearchKey(e, el) { if (e.key === 'Enter') { e.preventDefault(); dashSearch(el.value); } }
const dashSearchBox = (id, ph) => `<form class="dash-search" onsubmit="event.preventDefault(); dashSearch(this.q.value)">
  ${DASH_SEARCH_ICON}<input name="q" id="${id}" type="search" enterkeyhint="search" placeholder="${ph}" autocomplete="off">
  <button type="submit" aria-label="Cari">Cari</button></form>`;

/* ── Pengunjung umum ── */
function dashHeroHtml() {
  return `<div class="dash-hero-k">CAI HUB · OFFICIAL BRAND HUB</div>
    <h1 class="dash-hero-h">Temukan sistem audio mobil <br>yang <em>tepat untuk Anda.</em></h1>
    <p class="dash-hero-p">${BRANDS.length} brand resmi Concerto Audio Indonesia — spesifikasi lengkap, harga SRP, dan partner resmi terdekat.</p>
    ${dashSearchBox('dash-q', 'Cari produk, model, atau kota partner…')}
    <div class="dash-chips">${DASH_CATS.map(([t, c]) => `<button onclick="dashSearch('${c}')">${t}</button>`).join('')}</div>`;
}
function dashCtaHtml() {
  const ads = adPublic(), regions = new Set(ads.map(d => d.r).filter(Boolean)).size;
  const card = (ic, t, s, fn) => `<button class="dash-cta-c" onclick="${fn}"><span class="dash-cta-i">${ic}</span><span class="dash-cta-t"><b>${t}</b><span>${s}</span></span><span class="dash-cta-ar">›</span></button>`;
  return card('📍', 'Cari partner resmi', `${ads.length} partner · ${regions} provinsi`, 'openAuthDealers()')
    + card('🎛', 'System Simulator', 'Rakit sistem, lihat total SRP', 'openRakit()')
    + card('🧩', 'Paket Audio', 'Paket siap pasang', 'openPaketAudio()');
}
function dashHofStats() {
  const list = typeof HALL_OF_FAME !== 'undefined' ? HALL_OF_FAME : [];
  if (!list.length) return null;
  const e = list[0];
  return { n: list.length, win: list.filter(x => x.place === 1).length, ev: [e.event, e.city, e.date].filter(Boolean).join(' · ') };
}
// Hall of Fame tidak ditampilkan di Dashboard (4 Nov 2026, permintaan pemilik) — tetap di menu Showcase. Tampilkan lagi: true.
const DASH_HOF = false;
function dashPairHtml() {
  const h = DASH_HOF && dashHofStats(), a = acadReleased()[0];
  return (h ? `<button class="dash-hof" onclick="openHallOfFame()">
      <span class="dash-hof-k">🏆 HALL OF FAME</span>
      <span class="dash-hof-n"><span><b>${h.win}</b>Juara 1</span><span><b>${h.n}</b>Prestasi</span></span>
      <span class="dash-hof-e">${escHtml(h.ev)}</span><span class="dash-hof-go">Lihat mobil juara ›</span></button>` : '')
    + (a ? `<button class="dash-acad" onclick="openAcademyItem(${a.no})">
      <img src="${acadImg(a, true)}" alt="" loading="lazy">
      <span><small>CONCERTO ACADEMY #${a.no}${acadIsNew(a) ? ' <i>★ BARU</i>' : ''}</small><b>${escHtml(a.title || 'Materi terbaru')}</b><span>Materi terbaru — baca gratis ›</span></span></button>` : '');
}
function dashPaketHtml() {
  return PAKET_AUDIO.filter(p => p.available).slice(0, 3).map(p => `<button class="dash-pk" onclick="paketOpenLinked('${p.id}')">
    <small>${escHtml(p.segment || '')}</small><b>${escHtml(p.title)}</b><span>Lihat isi paket ›</span></button>`).join('');
}

/* ── Partner yang login ── */
function dashHelloHtml() {
  return `<div class="dash-hello-t"><h1>Selamat ${dashGreet()}, Partner 👋</h1><p>Ringkasan hari ini untuk partner resmi CAI.</p></div>
    <span class="dash-badge">🔓 MASUK · KODE AKSES</span>
    ${dashSearchBox('dash-q2', 'Cari produk / cek stok…')}`;
}
const dashDays = d => (Date.now() - new Date(d)) / 864e5;
function dashNewHtml() {
  const gNew = guideFiles ? [...guideFiles.values()].flat().filter(guideIsNew).length : 0;
  const glNew = glItems ? glLive().filter(it => it.published && it.created_at && dashDays(it.created_at) < DASH_NEW_DAYS).length : 0;
  const a = acadReleased()[0], h = DASH_HOF && dashHofStats();
  const item = (ic, t, s, isNew, fn) => `<button class="dash-new-c" onclick="${fn}"><span class="dash-new-i">${ic}</span>
    <span class="dash-new-t"><b>${t}</b><span>${s}</span></span>${isNew ? '<em>BARU</em>' : ''}</button>`;
  return item('📘', 'Panduan Partner', gNew ? `${gNew} file baru diunggah` : 'Materi penjualan & produk', gNew > 0, 'openGuides()')
    + item('🚗', 'Galeri Instalasi', glNew ? `${glNew} mobil baru` : 'Contoh pemasangan partner', glNew > 0, 'openGaleri()')
    + (a ? item('🎓', `Academy #${a.no}`, escHtml(a.title || 'Materi terbaru'), acadIsNew(a), `openAcademyItem(${a.no})`) : '')
    + (h ? item('🏆', 'Hall of Fame', `${escHtml(h.ev.split(' · ')[0])} · ${h.win} Juara 1`, false, 'openHallOfFame()') : '');
}

/* ── Bersama ── */
function dashBrandsHtml() {
  return BRANDS.map(b => `<button class="dash-brand" style="--bc:${b.color}" onclick="showBrand('${b.id}')">
    <span class="dash-brand-lo">${b.logo ? brandMark(b, 30) : `<span class="dash-brand-tx">${escHtml(b.name)}</span>`}</span>
    <span class="dash-brand-in"><b>${escHtml(b.name)}</b><span>${brandProducts(b).length} produk</span></span></button>`).join('');
}

const dashSet = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
function dashNewRender() { if (authUser) dashSet('dash-new', dashNewHtml()); }
function dashRender() {
  const keepQ = ['dash-q', 'dash-q2'].map(id => document.getElementById(id)?.value || '');
  dashSet('dash-hero', dashHeroHtml());
  dashSet('dash-cta', dashCtaHtml());
  dashSet('dash-pair', dashPairHtml());
  document.getElementById('dash-pair')?.classList.toggle('one', !DASH_HOF);
  dashSet('dash-paket', dashPaketHtml());
  dashSet('dash-hello', dashHelloHtml());
  dashSet('dashboard-brands', dashBrandsHtml());
  dashNewRender();
  ['dash-q', 'dash-q2'].forEach((id, i) => { const el = document.getElementById(id); if (el && keepQ[i]) el.value = keepQ[i]; });
}
// Dipanggil onAuthChanged(): sapaan & "Baru untuk Anda" (Galeri dimuat di latar untuk menghitung mobil baru)
function dashAuthChanged() {
  dashRender();
  if (authUser && typeof loadGaleri === 'function' && !glItems) Promise.resolve(loadGaleri()).then(dashNewRender, () => {});
}
