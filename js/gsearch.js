/* ═══════════ TAHAP 9 C — 🔍 SATU KOTAK PENCARIAN UNTUK SEMUA (4 Nov 2026, permintaan pemilik — pratinjau .mockup/tahap9/) ═══════════
   Kotak cari Dashboard (pengunjung umum #dash-q & partner #dash-q2) menampilkan hasil langsung saat mengetik, dikelompokkan:
     🚗 Mobil (carList) · 🏪 Partner (nama/kota/provinsi; bila cocok mobil → partner yang pernah mengerjakan mobil itu)
     🔊 Produk (searchProducts — sinonim & salah ketik; bila tak ada tapi cocok mobil → perangkat yang dipasang di mobil itu)
     🎓 Academy (judul materi yang sudah tayang) · 📰 News (berita terbit).
   Maks. 3 baris per kelompok + "Lihat semua ›". ↑↓ + Enter memilih; Enter tanpa memilih = buka mobil bila cocok, selain itu
   pencarian lama dashSearch() (Katalog / Authorized Partner). Concerto Way & Panduan Partner sengaja tidak dicari. Hanya SRP. */
const GS_MAX = 3;
let gsT = null, gsActs = [], gsSel = -1, gsLoadTried = false;
const gsN = s => (typeof SR_N === 'function' ? SR_N(s) : String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''));
// Cocok bila semua kata ada di teks (huruf kecil) atau bentuk rapat (tanpa spasi/tanda baca) termuat
function gsHit(text, q) {
  const t = String(text || '').toLowerCase(), ws = q.toLowerCase().split(/\s+/).filter(Boolean);
  return (ws.length && ws.every(w => t.includes(w))) || (gsN(q).length >= 2 && gsN(text).includes(gsN(q)));
}

function gsCompute(q) {
  const R = { car: null, cars: [], partners: [], prods: [], prodN: 0, prodFrom: '', acad: [], news: [] };
  // Mobil
  const cars = typeof carList === 'function' ? carList() : [];
  R.cars = cars.filter(c => gsHit(c.name, q) || gsHit(c.make + ' ' + (c.name || ''), q));
  R.car = R.cars[0] || null;
  // Partner: nama / kota / provinsi, lalu partner yang pernah mengerjakan mobil itu
  const ds = typeof adPublic === 'function' ? adPublic() : [];
  const byName = ds.filter(d => gsHit([d.n, d.c, d.r].join(' '), q));
  const byCar = R.car ? R.car.partners.map(n => ds.find(d => d.n === n)).filter(Boolean) : [];
  R.partners = [...new Map([...byCar, ...byName].map(d => [d.n, d])).values()];
  R.byCar = new Set(byCar.map(d => d.n));
  // Produk
  const rows = BRANDS.flatMap(b => b.lines.flatMap(l => l.products.map(p => ({ b, l, p }))));
  const sr = searchProducts(rows, q);
  // Urutan: cocok kategori / nama / model dulu, baru yang hanya cocok di deskripsi
  const sc = r => (gsHit(r.p.category, q) ? 4 : 0) + (gsHit(`${r.b.name} ${r.p.name} ${r.p.model || ''}`, q) ? 2 : 0) + (gsHit(r.l?.name, q) ? 1 : 0);
  if (sr.list.length) { R.prods = sr.list.map((r, i) => ({ r, i, s: sc(r) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.r.p.id); R.prodFrom = sr.syn ? 'syn' : sr.fuzzy ? 'fuzzy' : ''; }
  else if (R.car && typeof carProds === 'function') { R.prods = carProds(R.car).prods; R.prodFrom = 'car'; }
  R.prodN = R.prods.length;
  // Academy & News (yang sudah tayang)
  R.acad = (typeof acadReleased === 'function' ? acadReleased() : []).filter(a => gsHit([a.title, a.series].join(' '), q));
  R.news = (typeof nwLive === 'function' && nwItems ? nwLive() : []).filter(n => gsHit([n.title, n.summary, n.category].join(' '), q));
  R.any = !!(R.cars.length || R.partners.length || R.prods.length || R.acad.length || R.news.length);
  return R;
}

function gsInput(el) {
  clearTimeout(gsT);
  gsT = setTimeout(() => gsRender(el), 120);
}
function gsRender(el) {
  const box = document.getElementById(el.id + '-res'); if (!box) return;
  const q = el.value.trim();
  gsActs = []; gsSel = -1;
  if (q.length < 2) { box.innerHTML = ''; box.classList.remove('open'); return; }
  // Data Galeri (mobil) & daftar partner terbaru dimuat di latar sekali, lalu hasil digambar ulang
  if (!gsLoadTried) {
    gsLoadTried = true;
    const ps = [];
    if (typeof glItems !== 'undefined' && !glItems && typeof loadGaleri === 'function') ps.push(loadGaleri());
    if (typeof adEnsure === 'function') adEnsure();
    if (ps.length) Promise.all(ps).then(() => { if (document.activeElement === el || box.classList.contains('open')) gsRender(el); }).catch(() => {});
  }
  const R = gsCompute(q);
  if (typeof intSearch === 'function') intSearch(q, R.any);
  const act = fn => { gsActs.push(fn); return gsActs.length - 1; };
  const it = (i, ic, title, sub, right = '') => `<div class="gs-it" data-gi="${i}" role="option" onmousedown="event.preventDefault()" onclick="gsRun(${i})">
      <span class="gs-ic">${ic}</span><span class="gs-tx"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${right}</div>`;
  const head = (t, more) => `<div class="gs-gh"><span>${t}</span>${more || ''}</div>`;
  const moreBtn = (txt, fn) => `<button type="button" onmousedown="event.preventDefault()" onclick="gsRun(${act(fn)})">${txt} ›</button>`;
  let h = '';
  if (R.cars.length) {
    h += head('🚗 Mobil', R.cars.length > GS_MAX ? moreBtn(`Lihat semua ${R.cars.length}`, () => openCars(q)) : '');
    h += R.cars.slice(0, GS_MAX).map(c => it(act(() => openCar(c.slug)), CAR_ICON(c.body), escHtml(c.name),
      escHtml([c.wins ? `🏆 ${c.wins} prestasi` : '', `${c.cars} mobil`, c.partners.length ? `${c.partners.length} partner pernah mengerjakan` : ''].filter(Boolean).join(' · ')),
      '<em class="gs-go">Lihat mobil ›</em>')).join('');
  }
  if (R.partners.length) {
    const carName = R.car ? R.car.name : '';
    h += head(R.byCar.size && R.car ? `🏪 Partner · termasuk yang mengerjakan ${escHtml(carName)}` : '🏪 Partner resmi',
      R.partners.length > GS_MAX ? moreBtn(`Lihat semua ${R.partners.length}`, () => gsPartners(q)) : '');
    h += R.partners.slice(0, GS_MAX).map(d => {
      const wins = R.car && R.byCar.has(d.n) ? R.car.hof.filter(e => (typeof hofDealer === 'function' ? hofDealer(e.dealer)?.n : e.dealer) === d.n) : [];
      const sub = [d.c || d.r, wins.length ? `🏆 ${wins.length}× prestasi dengan ${carName}` : (R.byCar.has(d.n) ? `pernah mengerjakan ${carName}` : '')].filter(Boolean).join(' · ');
      const msg = R.byCar.has(d.n) ? `Halo ${d.n}, saya lihat contoh pemasangan audio ${carName} di CAI Hub (Concerto Audio Indonesia). Mobil saya juga ${carName}, saya ingin bertanya.`
        : `Halo ${d.n}, saya dapat info dari CAI Hub (Concerto Audio Indonesia), saya ingin bertanya.`;
      const wa = d.wa ? `<a class="gs-wa" href="https://wa.me/${d.wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener" onmousedown="event.preventDefault()" onclick="event.stopPropagation()">💬 Tanya</a>` : '';
      return it(act(() => openPartner(shareSlug(d.n))), `<i class="gs-av">${escHtml(typeof pfInit === 'function' ? pfInit(d.n) : d.n.slice(0, 2))}</i>`, escHtml(d.n), escHtml(sub), wa);
    }).join('');
  }
  if (R.prods.length) {
    const t = R.prodFrom === 'car' ? `🔊 Dipasang di ${escHtml(R.car.name)}` : '🔊 Produk' + (R.prodFrom === 'syn' ? ' · nama lain dikenali' : R.prodFrom === 'fuzzy' ? ' · mungkin maksud Anda' : '');
    h += head(t, R.prodN > GS_MAX ? moreBtn(`Lihat semua ${R.prodN}`, R.prodFrom === 'car' ? () => openCar(R.car.slug) : () => dashSearch(q)) : '');
    h += R.prods.slice(0, GS_MAX).map(id => {
      const { brand: b, product: p, line: l } = findProductAny(id); if (!p) return '';
      const ph = p.photo || p.photos?.[0];
      return it(act(() => showProduct(b.id, p.id)), ph ? `<img src="${escHtml(ph)}" alt="" loading="lazy">` : `<i>${p.emoji || '🔊'}</i>`,
        escHtml(`${b.name} ${p.name}`), escHtml([p.category, l?.name, typeof hasPrice === 'function' && hasPrice(p) ? srpText(p) : ''].filter(Boolean).join(' · ')));
    }).join('');
  }
  if (R.acad.length) {
    h += head('🎓 Concerto Academy', R.acad.length > GS_MAX ? moreBtn(`Lihat semua ${R.acad.length}`, () => openAcademy()) : '');
    h += R.acad.slice(0, GS_MAX).map(a => it(act(() => { openAcademy(); openAcademyItem(a.no); }), `<img src="${escHtml(acadImg(a, true))}" alt="" loading="lazy">`,
      escHtml(a.title), escHtml(`${a.series || 'Fundamental'} #${a.no}`))).join('');
  }
  if (R.news.length) {
    h += head('📰 News', R.news.length > GS_MAX ? moreBtn(`Lihat semua ${R.news.length}`, () => { nwQ = q; openNews(); }) : '');
    h += R.news.slice(0, GS_MAX).map(n => { const th = typeof nwThumb === 'function' ? nwThumb(n) : '';
      return it(act(() => openNews(n.id)), th ? `<img src="${escHtml(th)}" alt="" loading="lazy">` : '<i>📰</i>', escHtml(n.title),
        escHtml(['News', n.category, n.post_date ? new Date(n.post_date + 'T00:00:00Z').toLocaleDateString('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : ''].filter(Boolean).join(' · '))); }).join('');
  }
  if (!R.any) {
    h = `<div class="gs-empty"><b>Belum ketemu untuk “${escHtml(q)}”.</b><span>Coba kata lain, atau biarkan kami bantu memilihkan.</span>
      <div><button type="button" onmousedown="event.preventDefault()" onclick="gsRun(${act(() => openFinder(''))})">🎯 Temukan sistem yang cocok</button>
      <button type="button" onmousedown="event.preventDefault()" onclick="gsRun(${act(() => openAuthDealers())})">📍 Tanya partner resmi</button></div></div>`;
  } else if (R.car) gsSel = 0;   // Enter = buka mobil teratas
  box.innerHTML = h; box.classList.add('open');
  gsPaintSel(box);
}
function gsPartners(q) {
  openAuthDealers();
  const s = document.getElementById('ad-search'); if (s) { s.value = q; renderAuthDealers(); }
}
function gsPaintSel(box) {
  box.querySelectorAll('.gs-it').forEach(e => e.classList.toggle('sel', +e.dataset.gi === gsSel));
  box.querySelector('.gs-it.sel')?.scrollIntoView?.({ block: 'nearest' });
}
function gsRun(i) {
  const fn = gsActs[i]; if (!fn) return;
  gsCloseAll();
  fn();
}
function gsCloseAll() { document.querySelectorAll('.gs-res.open').forEach(b => { b.classList.remove('open'); b.innerHTML = ''; }); gsActs = []; gsSel = -1; }
function gsKey(e, el) {
  const box = document.getElementById(el.id + '-res');
  if (e.key === 'Escape') { gsCloseAll(); return; }
  if (!box || !box.classList.contains('open')) return;
  const ids = [...box.querySelectorAll('.gs-it')].map(x => +x.dataset.gi); if (!ids.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const pos = ids.indexOf(gsSel), n = e.key === 'ArrowDown' ? (pos < 0 ? 0 : Math.min(ids.length - 1, pos + 1)) : Math.max(-1, pos - 1);
    gsSel = n < 0 ? -1 : ids[n]; gsPaintSel(box);
  }
}
// Enter / tombol Cari
function gsSubmit(form) {
  const q = form.q.value;
  clearTimeout(gsT);
  if (gsSel >= 0 && gsActs[gsSel] && document.getElementById(form.q.id + '-res')?.classList.contains('open')) { gsRun(gsSel); return; }
  gsCloseAll(); dashSearch(q);
}
document.addEventListener('click', e => { if (!e.target.closest?.('.gs-wrap')) gsCloseAll(); });
