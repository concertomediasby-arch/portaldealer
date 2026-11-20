/* ══════════════════════════════════════════════════════════════════
   🗓 LANDING MINGGUAN — halaman pembuka yang berganti tiap minggu
   (20 Nov 2026, permintaan pemilik — pratinjau disetujui: 11 tema + mode bergeser otomatis).
   Data: Storage publik showcase/landing/weekly.json (diisi Editor di CAI Hub Studio #landing):
     { v, weeks: [{ id, start: 'YYYY-MM-DD' (Senin, WIB), mode: 'one'|'geser', dur: detik, draft?, slides: [slide] }], updated_at }
   Minggu aktif = start ≤ hari ini (WIB) < start + 7 hari, bukan draf. Tidak ada minggu aktif → landing biasa.
   Landing EMMA (js/landing-emma.js) selalu didahulukan bila sedang tampil.
   Slide: { t: produk|soon|build|academy|news|partner|paket|brand|promo|acara, title?, sub?, …field tema, snap? }
   produk/soon/paket/brand dihitung langsung dari katalog (SRP selalu terbaru); build/academy/news/partner memakai
   salinan (snap) yang dibuat Studio saat menyimpan. Hanya SRP. Salinan terakhir di localStorage cai-lw.
   Pratinjau dari Studio: /?landing=preview → minggu di localStorage cai-lw-draft.
   ══════════════════════════════════════════════════════════════════ */
const LW_FILE = 'landing/weekly.json', LW_KEY = 'cai-lw';
let lw = null, lwPrev = null, lwTm = null, lwIdx = 0, lwSig = '';

const lwEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lwGold = s => lwEsc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
const lwUrl = p => !p ? '' : /^(blob:|https?:|assets\/|share\/|media\/)/.test(p) ? p : (typeof dashPublicUrl === 'function' ? dashPublicUrl(p) : `${SUPA_URL}/storage/v1/object/public/showcase/${p}`);
const lwToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const lwAdd = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

function lwWeek() {
  if (lwPrev) return lwPrev;
  const t = lwToday();
  return (lw?.weeks || []).filter(w => !w.draft && w.start && w.start <= t && t < lwAdd(w.start, 7) && (w.slides || []).length)
    .sort((a, b) => b.start.localeCompare(a.start))[0] || null;
}

function lwInit() {
  if (typeof QA_SCREEN_MODE !== 'undefined' && QA_SCREEN_MODE) return;
  const q = new URLSearchParams(location.search);
  if (typeof mediaP !== 'undefined' && mediaP?.then) mediaP.then(() => lwApply(true));   // gambar dari salinan repo media/ bila sudah ada
  if (q.get('landing') === 'preview') {
    try { lwPrev = JSON.parse(localStorage.getItem('cai-lw-draft') || 'null'); } catch (e) {}
    lwApply(true); return;
  }
  try { const c = JSON.parse(localStorage.getItem(LW_KEY) || 'null'); if (c) { lw = c; lwApply(); } } catch (e) {}
  fetch(`${SUPA_URL}/storage/v1/object/public/showcase/${LW_FILE}?t=${Date.now()}`, { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null).then(j => {
      const s = JSON.stringify(j || null);
      try { if (j) localStorage.setItem(LW_KEY, s); else localStorage.removeItem(LW_KEY); } catch (e) {}
      if (s !== JSON.stringify(lw)) { lw = j; lwApply(true); }
    }).catch(() => {});
  setInterval(() => lwApply(), 60e3);   // ganti minggu tepat Senin 00.00 WIB walau halaman tetap terbuka
}

function lwOff() {
  clearTimeout(lwTm); lwTm = null; lwSig = '';
  const L = document.getElementById('landing'); L?.classList.remove('lw');
  document.getElementById('lw')?.remove();
}
function lwApply(force) {
  const L = document.getElementById('landing'); if (!L) return;
  const w = (L.classList.contains('emma') && !lwPrev) ? null : lwWeek();
  if (!w) return lwOff();
  const sig = JSON.stringify(w) + (typeof mediaMap !== 'undefined' && mediaMap ? 1 : 0);
  if (!force && sig === lwSig && document.getElementById('lw')) return;
  lwSig = sig;
  const slides = (w.mode === 'geser' ? w.slides : w.slides.slice(0, 1)).map(lwData).filter(Boolean);
  if (!slides.length) return lwOff();
  clearTimeout(lwTm);
  L.classList.add('lw');
  let box = document.getElementById('lw');
  if (!box) { box = document.createElement('div'); box.id = 'lw'; box.className = 'lw'; L.querySelector('.landing-hero').after(box); }
  const many = slides.length > 1;
  box.innerHTML = `<div class="lw-car${many ? ' many' : ''}" id="lw-car"><div class="lw-trk" id="lw-trk">${slides.map((d, i) => `<div class="lw-sl${i ? '' : ' cur'}">${lwHtml(d)}</div>`).join('')}</div>
    ${many ? `<button class="lw-arw l" type="button" aria-label="Sebelumnya" onclick="lwGoTo(lwIdx-1)">‹</button><button class="lw-arw r" type="button" aria-label="Berikutnya" onclick="lwGoTo(lwIdx+1)">›</button>
    <div class="lw-dts">${slides.map((d, i) => `<button type="button" aria-label="Slide ${i + 1}" onclick="lwGoTo(${i})"><i></i></button>`).join('')}</div>` : ''}</div>`;
  const car = document.getElementById('lw-car');
  car.style.setProperty('--lwdur', Math.max(3, +w.dur || 6) + 's');
  lwIdx = 0;
  if (many) { lwWire(car, Math.max(3, +w.dur || 6) * 1000); lwGoTo(0); }
  box.querySelectorAll('video').forEach(v => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) { v.removeAttribute('autoplay'); v.pause(); } else v.play?.().catch(() => {}); });
}

// ── data tampilan per tema (judul/sub dari Studio menimpa bawaan) ──
function lwProd(pid) { for (const b of (typeof BRANDS !== 'undefined' ? BRANDS : [])) for (const l of b.lines) { const p = l.products.find(x => x.id === pid); if (p) return { b, l, p }; } return null; }
const lwSpecs = p => Object.entries(p.specs || {}).slice(0, 4).map(([k, v]) => String(v).length > 28 ? k : v);
function lwData(s) {
  if (!s?.t) return null;
  const d = { t: s.t, tag: '', title: '', sub: '', chips: [], price: '', img: '', kind: 'photo', logo: '', b1: null, b2: null, center: false };
  const P = x => `/?${x}`;
  if (s.t === 'produk' || s.t === 'soon') {
    const r = lwProd(s.pid); if (!r) return null; const { b, l, p } = r;
    Object.assign(d, { tag: s.t === 'soon' ? 'Segera hadir' : 'Produk minggu ini', title: `${p.name}`, sub: p.desc && !/menyusul/i.test(p.desc) ? p.desc : `${b.name} · ${p.category} · ${l.name}`,
      chips: lwSpecs(p), price: typeof srpText === 'function' ? srpText(p) : '', img: (p.photos || [])[0] || p.photo || '', kind: 'card', logo: b.logo || '', soon: s.t === 'soon' || p.soon,
      b1: { l: 'Lihat produk', h: P('p=' + encodeURIComponent(p.id)) }, b2: s.t === 'soon' ? { l: `Produk ${b.name} lainnya`, h: P('brand=' + b.id) } : { l: 'Cari partner resmi', h: P('kota=semua') } });
  } else if (s.t === 'paket') {
    const k = (typeof PAKET_AUDIO !== 'undefined' ? PAKET_AUDIO : []).find(x => x.id === s.pk); if (!k) return null;
    Object.assign(d, { tag: 'Paket Audio', title: k.title, sub: k.desc, chips: (k.products || []).slice(0, 4), img: `share/img/k-${k.id}-cover.jpg`,
      b1: { l: 'Lihat paket', h: P('paket=' + k.id) }, b2: { l: 'Tanya partner resmi', h: P('kota=semua') } });
  } else if (s.t === 'brand') {
    const b = (typeof BRANDS !== 'undefined' ? BRANDS : []).find(x => x.id === s.b); if (!b) return null;
    const tile = (typeof DASH_TILES !== 'undefined' ? DASH_TILES : []).find(x => x.id === s.b || x.id === s.b.replace('-', ''));
    Object.assign(d, { tag: 'Brand minggu ini', title: b.name, sub: b.tagline || '', logo: b.logo || '', img: tile?.poster || b.logo || '', video: tile?.video || '', kind: tile?.video ? 'video' : 'card',
      chips: [`${typeof brandProducts === 'function' ? brandProducts(b).length : ''} produk`.trim(), ...(typeof brandCategories === 'function' ? brandCategories(b).slice(0, 3) : [])],
      b1: { l: `Lihat produk ${b.name}`, h: P('brand=' + b.id) }, b2: tile ? { l: '▶ Tonton video', h: P('sorotan=' + tile.id) } : null });
  } else if (s.t === 'build') {
    const n = s.snap || {}; if (!n.car) return null;
    Object.assign(d, { tag: 'Build minggu ini', title: n.car, sub: [n.award, n.partner && `Dikerjakan oleh partner resmi ${n.partner}${n.city ? ' · ' + n.city : ''}`].filter(Boolean).join(' · '),
      chips: (n.prods || []).slice(0, 6), img: n.photo || '', badge: n.award ? '🏆 ' + n.award : '',
      b1: { l: 'Lihat build', h: P('gl=' + encodeURIComponent(s.gl)) }, b2: n.partner ? { l: '🏪 Profil partner', h: P('partner=' + (typeof shareSlug === 'function' ? shareSlug(n.partner) : '')) } : null });
  } else if (s.t === 'academy') {
    const n = s.snap || {}; if (!n.title) return null;
    Object.assign(d, { tag: `Concerto Academy · ${n.series || 'Materi'} #${s.no}`, title: n.title, sub: n.intro || '', img: n.img || '', kind: 'tall',
      b1: { l: 'Baca materi', h: P('acad=' + s.no) }, b2: { l: 'Semua materi Academy', h: P('acad=') } });
  } else if (s.t === 'news') {
    const n = s.snap || {}; if (!n.title) return null;
    Object.assign(d, { tag: 'CAI Hub News' + (n.cat ? ' · ' + n.cat : ''), title: n.title, sub: n.summary || '', img: n.img || '', kind: 'wide',
      b1: { l: 'Baca berita', h: P('news=' + encodeURIComponent(s.id)) }, b2: null });
  } else if (s.t === 'partner') {
    const n = s.snap || {}; if (!n.n) return null;
    Object.assign(d, { tag: 'Partner minggu ini', title: `Kenalan dengan *${n.n}*`, sub: `Partner resmi CAI di ${n.c || n.r || ''}. Lihat hasil pemasangannya, lalu tanya langsung lewat WhatsApp.`, kind: 'partner', pt: n,
      b1: { l: 'Lihat profil partner', h: P('partner=' + (typeof shareSlug === 'function' ? shareSlug(n.n) : '')) }, b2: { l: 'Semua Enthusiast Partner', h: P('kota=semua') } });
  } else if (s.t === 'promo') {
    if (!s.title && !s.img) return null;
    Object.assign(d, { tag: s.tag || 'Promo', title: s.title || '', sub: s.sub || '', img: s.img || '', center: !s.img,
      b1: s.b1l ? { l: s.b1l, h: s.b1u || '' } : null, b2: s.b2l ? { l: s.b2l, h: s.b2u || '' } : null });
  } else if (s.t === 'acara') {
    if (!s.title) return null;
    Object.assign(d, { tag: 'Acara' + (s.kind ? ' · ' + s.kind : ''), title: s.title, sub: s.sub || '', img: s.img || '', center: !s.img, at: s.at || '', place: s.place || '',
      b1: s.b1l ? { l: s.b1l, h: s.b1u || '' } : null, b2: null });
  } else return null;
  if (s.title && s.t !== 'promo' && s.t !== 'acara') d.title = s.title;
  if (s.sub && s.t !== 'promo' && s.t !== 'acara') d.sub = s.sub;
  if (s.tagline) d.tag = s.tagline;
  return d;
}

function lwBtn(b, cls) {
  if (!b?.l) return '';
  const h = String(b.h || '');
  return `<button class="${cls}" type="button" onclick="lwGoUrl(this.dataset.h)" data-h="${lwEsc(h)}">${lwEsc(b.l)}${cls === 'lw-b1' ? ' ›' : ''}</button>`;
}
function lwGoUrl(h) {
  if (!h) return enterPortal();
  if (/^https?:/i.test(h) && !h.startsWith(location.origin)) return window.open(h, '_blank', 'noopener');
  location.href = h;
}
function lwWhen(at, place) {
  const t = Date.parse(at || ''); if (!t) return lwEsc(place || '');
  const s = new Date(t).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace('.', ':');
  return lwEsc(s + ' WIB' + (place ? ' · ' + place : ''));
}
function lwCd(at) {
  const ms = Date.parse(at || '') - Date.now(); if (!(ms > 0)) return '';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
  return `<div class="lw-cd"><div><b>${d}</b><small>Hari</small></div><div><b>${String(h).padStart(2, '0')}</b><small>Jam</small></div><div><b>${String(m).padStart(2, '0')}</b><small>Menit</small></div></div>`;
}
function lwVis(d) {
  if (d.kind === 'partner') {
    const n = d.pt, ini = n.n.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(), lg = n.logo ? lwUrl(String(n.logo).split('#')[0]) : '';
    const wa = n.wa ? `https://wa.me/${n.wa}?text=${encodeURIComponent(`Halo ${n.n}, saya dapat info dari CAI Hub.`)}` : '';
    return `<div class="lw-pc"><div class="lw-pch"><div class="lw-av${/#dark$/.test(n.logo || '') ? ' dk' : ''}">${lg ? `<img src="${lwEsc(lg)}" alt="">` : lwEsc(ini)}</div><div><b>${lwEsc(n.n)}</b><span>${lwEsc([n.c, n.r].filter(Boolean).join(' · '))}</span><i>✓ Partner resmi CAI</i></div></div>
      ${n.a ? `<p>${lwEsc(n.a)}</p>` : ''}<div class="lw-pcb">${wa ? `<a class="wa" href="${lwEsc(wa)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}${n.map ? `<a href="${lwEsc(n.map)}" target="_blank" rel="noopener">📍 Maps</a>` : ''}${n.ig ? `<a href="https://instagram.com/${lwEsc(n.ig)}" target="_blank" rel="noopener">Instagram</a>` : ''}</div></div>`;
  }
  if (d.kind === 'video' && d.video) return `<div class="lw-vid"><video src="${lwEsc(d.video)}" poster="${lwEsc(lwUrl(d.img))}" autoplay muted loop playsinline preload="metadata"></video></div>`;
  if (!d.img) return '';
  return `<div class="lw-${d.kind === 'card' ? 'card' : d.kind === 'tall' ? 'tall' : 'ph'}${d.kind === 'wide' ? ' wide' : ''}"><img src="${lwEsc(lwUrl(d.img))}" alt=""></div>${d.badge ? `<span class="lw-badge">${lwEsc(d.badge)}</span>` : ''}`;
}
function lwHtml(d) {
  const vis = lwVis(d), center = d.center || !vis;
  return `<div class="lw-hero${center ? ' center' : ''}"><div class="lw-tx">
      <span class="lw-tag"><i></i>${lwEsc(d.tag)}</span>
      ${d.logo && d.t !== 'brand' ? `<img class="lw-logo" src="${lwEsc(d.logo)}" alt="">` : d.t === 'brand' && d.logo ? `<img class="lw-logo big" src="${lwEsc(d.logo)}" alt="${lwEsc(d.title)}">` : ''}
      <h2 class="lw-h">${lwGold(d.title)}${d.soon ? ' <span class="lw-soon">COMING SOON</span>' : ''}</h2>
      ${d.sub ? `<p class="lw-sub">${lwEsc(d.sub)}</p>` : ''}
      ${d.at ? lwCd(d.at) + `<div class="lw-when">${lwWhen(d.at, d.place)}</div>` : d.place ? `<div class="lw-when">${lwEsc(d.place)}</div>` : ''}
      ${d.chips.length ? `<div class="lw-chips">${d.chips.map(c => `<span>${lwEsc(c)}</span>`).join('')}</div>` : ''}
      ${d.price ? `<div class="lw-price"><small>SRP</small><b>${lwEsc(d.price)}</b></div>` : ''}
      <div class="lw-cta">${lwBtn(d.b1 || { l: 'Masuk Portal', h: '' }, 'lw-b1')}${lwBtn(d.b2, 'lw-b2')}</div>
    </div>${vis ? `<div class="lw-vis">${vis}</div>` : ''}</div>`;
}

// ── bergeser otomatis ──
function lwGoTo(i) {
  const car = document.getElementById('lw-car'), trk = document.getElementById('lw-trk'); if (!car || !trk) return;
  const n = trk.children.length; lwIdx = (i + n) % n;
  trk.style.transform = `translateX(${-100 * lwIdx}%)`;
  [...trk.children].forEach((e, j) => e.classList.toggle('cur', j === lwIdx));
  car.querySelectorAll('.lw-dts button').forEach((b, j) => { b.classList.remove('cur'); b.classList.toggle('done', j < lwIdx); void b.offsetWidth; if (j === lwIdx) b.classList.add('cur'); });
  lwArm();
}
function lwArm() {
  clearTimeout(lwTm);
  const car = document.getElementById('lw-car');
  if (!car || car.classList.contains('pause') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  lwTm = setTimeout(() => { if (document.hidden || document.getElementById('landing')?.classList.contains('hidden-landing')) return lwArm(); lwGoTo(lwIdx + 1); }, car._dur || 6000);
}
function lwWire(car, dur) {
  car._dur = dur;
  const trk = document.getElementById('lw-trk');
  const pause = on => { car.classList.toggle('pause', on); if (on) clearTimeout(lwTm); else lwGoTo(lwIdx); };
  car.addEventListener('mouseenter', () => pause(true)); car.addEventListener('mouseleave', () => pause(false));
  let x0 = null, y0 = 0, moved = false;
  car.addEventListener('pointerdown', e => { if (e.target.closest('button,a')) return; x0 = e.clientX; y0 = e.clientY; moved = false; clearTimeout(lwTm); });
  car.addEventListener('pointermove', e => { if (x0 === null) return; const dx = e.clientX - x0; if (!moved && Math.abs(dx) < 8) return; if (!moved && Math.abs(e.clientY - y0) > Math.abs(dx)) { x0 = null; return; } moved = true; trk.classList.add('drag'); trk.style.transform = `translateX(calc(${-100 * lwIdx}% + ${dx}px))`; });
  const up = e => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; trk.classList.remove('drag'); lwGoTo(moved && dx < -50 ? lwIdx + 1 : moved && dx > 50 ? lwIdx - 1 : lwIdx); };
  car.addEventListener('pointerup', up); car.addEventListener('pointercancel', up); car.addEventListener('pointerleave', e => { if (x0 !== null && e.pointerType === 'mouse') up(e); });
  car.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') lwGoTo(lwIdx - 1); if (e.key === 'ArrowRight') lwGoTo(lwIdx + 1); });
}
