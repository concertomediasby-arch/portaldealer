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
  const prodHit = searchProducts(BRANDS.flatMap(b => b.lines.flatMap(l => l.products.map(p => ({ b, l, p })))), q).list.length > 0;   // pencarian pintar (js/core.js)
  const dlHit = adPublic().some(d => [d.n, d.c, d.r, d.a].join(' ').toLowerCase().includes(k));
  if (!prodHit && dlHit) {
    if (typeof intCity === 'function') intCity(q);
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
// Hasil langsung saat mengetik (produk · mobil · partner · Academy · News) — js/gsearch.js (Tahap 9 C)
const dashSearchBox = (id, ph) => `<div class="gs-wrap"><form class="dash-search" onsubmit="event.preventDefault(); gsSubmit(this)">
  ${DASH_SEARCH_ICON}<input name="q" id="${id}" type="search" enterkeyhint="search" placeholder="${ph}" autocomplete="off"
    oninput="gsInput(this)" onkeydown="gsKey(event, this)" onfocus="if (this.value.trim().length > 1) gsInput(this)" role="combobox" aria-controls="${id}-res">
  <button type="submit" aria-label="Cari">Cari</button></form><div class="gs-res" id="${id}-res" role="listbox"></div></div>`;

/* ── Pengunjung umum ── */
function dashHeroHtml() {
  return `<div class="dash-hero-k">CAI HUB · OFFICIAL BRAND HUB</div>
    <h1 class="dash-hero-h">Temukan sistem audio mobil <br>yang <em>tepat untuk Anda.</em></h1>
    <p class="dash-hero-p">${BRANDS.length} brand resmi Concerto Audio Indonesia — spesifikasi lengkap, harga SRP, dan partner resmi terdekat.</p>
    ${dashSearchBox('dash-q', 'Cari produk, mobil, partner, materi…')}
    <div class="dash-chips">${DASH_CATS.map(([t, c]) => `<button onclick="dashSearch('${c}')">${t}</button>`).join('')}</div>`;
}
function dashCtaHtml() {
  const ads = adPublic(), regions = new Set(ads.map(d => d.r).filter(Boolean)).size;
  const card = (ic, t, s, fn) => `<button class="dash-cta-c" onclick="${fn}"><span class="dash-cta-i">${ic}</span><span class="dash-cta-t"><b>${t}</b><span>${s}</span></span><span class="dash-cta-ar">›</span></button>`;
  return card('📍', 'Cari partner resmi', `${ads.length} partner · ${regions} provinsi`, 'openAuthDealers()')
    + card('🎛', 'System Simulator', 'Rakit sistem, lihat total SRP', 'openRakit()')
    + card('🧩', 'Paket Audio', 'Paket siap pasang', 'openPaketAudio()')
    + card('🎯', 'Temukan sistem yang cocok', '4 pertanyaan · rekomendasi', 'openFinder()');
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
    ${dashSearchBox('dash-q2', 'Cari produk, mobil, partner…')}`;
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
  dashSet('dash-trust', trustHtml());
  dashSet('dash-cta', dashCtaHtml());
  dashSet('dash-check', cpHtml());
  if (typeof carDashHtml === 'function') dashSet('dash-car', carDashHtml());
  dashSet('dash-pair', dashPairHtml());
  document.getElementById('dash-pair')?.classList.toggle('one', !DASH_HOF);
  dashSet('dash-paket', dashPaketHtml());
  dashSet('dash-hello', dashHelloHtml());
  if (typeof pnHtml === 'function') dashSet('pn-invite', pnHtml('dash'));   // ajakan notifikasi HP (js/push.js)
  dashSet('dashboard-brands', dashBrandsHtml());
  if (typeof evDashRender === 'function') evDashRender();   // 📅 Acara terdekat (js/events.js)
  dashNewRender();
  if (typeof favRenderDash === 'function') favRenderDash();   // Terakhir dilihat · Favorit · Baru minggu ini (js/fav.js)
  ['dash-q', 'dash-q2'].forEach((id, i) => { const el = document.getElementById(id); if (el && keepQ[i]) el.value = keepQ[i]; });
}
// Dipanggil onAuthChanged(): sapaan & "Baru untuk Anda" (Galeri dimuat di latar untuk menghitung mobil baru)
function dashAuthChanged() {
  dashRender();
  if (typeof dashShareSync === 'function') setTimeout(() => dashShareSync(), 4000);   // Editor: sampul pratinjau WA Sorotan Brand
  if (authUser && typeof loadGaleri === 'function' && !glItems) Promise.resolve(loadGaleri()).then(dashNewRender, () => {});
}


/* ── TAHAP 1 KEPERCAYAAN (4 Nov 2026, permintaan pemilik — pratinjau .mockup/tahap1/ disetujui) ──
   1) Bukti kepercayaan di Dashboard pengunjung (angka otomatis dari data) · 2) Cek Partner Resmi
   3) "Beli & pasang di partner resmi" di halaman produk — urutan partner DIACAK tiap kali tampil (agar semua partner bergiliran di atas). */
function trustHtml() {
  const parts = adPublic(), provs = new Set(parts.map(d => d.r));
  const nProd = BRANDS.reduce((a, b) => a + brandProducts(b).length, 0);
  const wins = (typeof HALL_OF_FAME !== 'undefined' ? HALL_OF_FAME : []).filter(e => e.place === 1);
  const evs = [...new Set(wins.map(e => e.event || ''))], yr = Math.max(0, ...wins.map(e => +e.year || 0));
  const winLbl = evs.length && evs.every(e => /EMMA/i.test(e)) ? `Juara 1 EMMA${yr ? ' ' + yr : ''}` : 'Juara 1 kompetisi';
  const n = (v, l) => `<div class="tr-n"><b>${v}</b><span>${l}</span></div>`;
  return `<div class="tr-nums${wins.length ? '' : ' c3'}">${n(BRANDS.length, 'brand resmi')}${n(nProd, 'produk')}${n(parts.length, `partner di ${provs.size} provinsi`)}${wins.length ? n(wins.length + '×', winLbl) : ''}</div>
    <div class="tr-prom"><span>Produk resmi distributor</span><span>Harga SRP transparan</span><span>Partner resmi terdaftar</span></div>`;
}
function trustRefresh() {
  dashSet('dash-trust', trustHtml());
  const cta = document.getElementById('dash-cta'); if (cta && typeof dashCtaHtml === 'function') cta.innerHTML = dashCtaHtml();
  if (cpQ) cpRun(true);
  if (document.getElementById('view-product')?.classList.contains('active')) pdNearRender(false);
}

// ── Cek Partner Resmi ──
let cpQ = '', cpRes = null;
const cpWaMsg = d => `Halo ${d.n}, saya dapat info dari CAI Hub (Concerto Audio Indonesia). Saya ingin bertanya tentang produk Concerto Audio Indonesia.`;
function cpResHtml() {
  let res = '';
  if (cpRes && cpRes.length) res = cpRes.map(d => `<div class="cp-res ok"><b class="t ok-t">✅ ${escHtml(d.n)} — Partner Resmi CAI</b>
      <span class="meta">📍 ${escHtml([d.c, d.r].filter(Boolean).join(', '))}${d.a ? ' · ' + escHtml(d.a) : ''}</span>
      <div class="cp-acts">${d.wa ? `<a class="wa" href="https://wa.me/${d.wa}?text=${encodeURIComponent(cpWaMsg(d))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<a href="${adMaps(d)}" target="_blank" rel="noopener">Maps</a><button onclick='adOpenLinked(${escHtml(JSON.stringify(d.n))})'>Lihat di Authorized Partner ›</button></div></div>`).join('');
  else if (cpRes) res = `<div class="cp-res no"><b class="t no-t">Nama “${escHtml(cpQ)}” belum ada di daftar partner resmi CAI</b>
      <span class="meta">Bisa jadi namanya berbeda. Agar dapat produk resmi &amp; harga sesuai, belanja di partner resmi terdekat.</span>
      <div class="cp-acts"><button onclick="openAuthDealers()">Lihat partner resmi terdekat ›</button></div></div>`;
  return res;
}
function cpHtml() {
  return `<div class="cp-box"><div class="cp-h"><i>🛡️</i><div><b>Cek Partner Resmi</b><small>Toko ini partner resmi Concerto Audio Indonesia? Cek di sini.</small></div></div>
    <form class="cp-in" onsubmit="event.preventDefault(); cpRun()"><input id="cp-q" value="${escHtml(cpQ)}" placeholder="Ketik nama toko…" autocomplete="off" enterkeyhint="search"><button type="submit">Cek</button></form>
    <div id="cp-out">${cpResHtml()}</div></div>`;
}
function cpRun(silent) {
  const inp = document.getElementById('cp-q');
  if (inp && !silent) cpQ = inp.value.trim();
  const q = normKey(cpQ);
  if (q.length < 3) { if (!silent) showToast('Ketik minimal 3 huruf nama toko.'); cpRes = null; }
  else {
    const list = adPublic().map(d => ({ d, k: normKey(d.n) }));
    cpRes = list.filter(x => x.k === q).map(x => x.d);
    if (!cpRes.length) cpRes = list.filter(x => x.k.includes(q) || (x.k.length >= 4 && q.includes(x.k))).map(x => x.d).slice(0, 3);
  }
  const out = document.getElementById('cp-out');
  if (out) out.innerHTML = cpResHtml();
  if (!silent) adEnsure();   // pakai daftar terbaru dari database (hasil diperbarui otomatis setelah dimuat)
}

// Ajakan "Cek dulu" di Authorized Partner → kotak Cek Partner Resmi di Dashboard (Langkah 2, 4 Nov 2026)
function cpGo() {
  showView('dashboard');
  setTimeout(() => { const b = document.getElementById('dash-check'); b?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => document.getElementById('cp-q')?.focus({ preventScroll: true }), 450); }, 60);
}

// ── Partner resmi terdekat untuk produk ini (urutan diacak) ──
const PD_PROV_KEY = 'cai-prov';
let pdOrder = null;
function pdProv() { try { return localStorage.getItem(PD_PROV_KEY) || ''; } catch (e) { return ''; } }
function pdShuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pdNearRender(reshuffle) {
  const el = document.getElementById('pd-near'); if (!el) return;
  const { brand, product: p } = findProduct(currentBrandId, currentProductId); if (!p) { el.innerHTML = ''; return; }
  const parts = adPublic(), provs = [...new Set(parts.map(d => d.r))], prov = provs.includes(pdProv()) ? pdProv() : '';
  if (reshuffle || !pdOrder) pdOrder = pdShuffle(parts.map(d => d.n));
  const rank = n => { const i = pdOrder.indexOf(n); return i < 0 ? 1e9 : i; };
  const list = prov ? parts.filter(d => d.r === prov).sort((a, b) => rank(a.n) - rank(b.n)) : [], show = list.slice(0, 3);
  const msg = d => `Halo ${d.n}, saya lihat ${brand.name} ${p.name} di CAI Hub. Apakah tersedia dan bisa bantu pemasangan?`;
  el.innerHTML = `<div class="pd-near-h"><b>📍 Beli &amp; pasang di partner resmi</b>
      <select onchange="pdSetProv(this.value)" aria-label="Pilih provinsi"><option value="">Pilih provinsi Anda…</option>${provs.map(r => `<option ${r === prov ? 'selected' : ''}>${escHtml(r)}</option>`).join('')}</select></div>
    ${prov ? `<div class="pd-near-l">${show.map(d => `<div class="pd-it"><div><b class="pd-pf" onclick="openPartner('${shareSlug(d.n)}')" title="Lihat profil partner">${escHtml(d.n)} ›</b><small>📍 ${escHtml(d.c || d.r)}</small></div>${d.wa
      ? `<a href="https://wa.me/${d.wa}?text=${encodeURIComponent(msg(d))}" target="_blank" rel="noopener">💬 Tanya</a>` : `<a class="mp" href="${adMaps(d)}" target="_blank" rel="noopener">Maps</a>`}</div>`).join('')}</div>
    <div class="pd-near-f">${list.length > 3 ? `<button onclick="pdAll()">Lihat semua ${list.length} partner di ${escHtml(prov)} ›</button> · ` : ''}Pesan WA otomatis menyebut produk ini.</div>`
    : `<div class="pd-near-f">Pilih provinsi untuk melihat partner resmi CAI terdekat yang bisa menjual &amp; memasang produk ini.</div>`}`;
  if (reshuffle) adEnsure();   // hanya saat dibuka/diganti (adRerender → trustRefresh memanggil ulang tanpa adEnsure — cegah putaran)
}
function pdSetProv(v) { try { localStorage.setItem(PD_PROV_KEY, v); } catch (e) {} pdNearRender(true); if (typeof intCity === 'function') intCity(v); }
function pdAll() { const prov = pdProv(); openAuthDealers(); if (prov) setAdRegion(prov); }
