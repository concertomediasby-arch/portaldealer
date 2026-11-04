/* CAI Hub (Concerto Audio Indonesia) — js/news.js
   NEWS (3 Nov 2026, permintaan pemilik): berita PUBLIK (tanpa login) di headline paling atas Dashboard, satu kotak dengan
   Concerto Way (khusus login). Dealer yang login melihat dua tab 📰 News | ☕ Concerto Way yang berganti otomatis tiap
   NEWS_ROTATE_MS; pengunjung umum hanya melihat News. Ditulis HANYA oleh Editor. Data di tabel Supabase `cai_news`
   (RLS baca = publik untuk yang terbit, tulis = editor), gambar di Storage publik `showcase/news/`.
   JANGAN pernah memuat harga dealer/diskon/info internal di News — isinya bisa dibaca siapa saja.
   Dimuat setelah cway.js, sebelum main.js. */

const NEWS_TABLE = 'cai_news';
const NEWS_NEW_DAYS = 5;
const NEWS_ROTATE_MS = 8000;
const NEWS_HL_MAX = 3;                    // berita terbaru yang ikut bergantian di headline
// 4 Nov 2026 (permintaan pemilik): sempat dimatikan (false) lalu diaktifkan lagi di hari yang sama. false = News tidak tampil di headline Dashboard.
const NEWS_ON_DASH = true;
const NEWS_SEEN_KEY = 'cai-news-seen';
const NEWS_CATS = ['Product', 'Event', 'Promo', 'Info'];
const NEWS_SQL = `-- News (CAI Hub) — jalankan sekali di Supabase → SQL Editor → Run
create table if not exists public.cai_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  body text,
  category text,
  image text,
  link_url text,
  link_label text,
  post_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.cai_news enable row level security;
drop policy if exists "news read" on public.cai_news;
create policy "news read" on public.cai_news for select to anon, authenticated
  using (published or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
drop policy if exists "news write" on public.cai_news;
create policy "news write" on public.cai_news for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
grant select on public.cai_news to anon;
grant select, insert, update, delete on public.cai_news to authenticated;`;

let nwItems = null, nwMissing = false, nwErr = '', nwLoading = null, nwCur = null, nwPending = null, nwForm = null, nwQ = '', nwCat = '';
const nwImgCache = {};
// Posisi/zoom gambar sampul disimpan di kolom `image` yang sama: "news/123.webp#x,y,z" (x/y = titik fokus %, z = zoom 1–2,5)
// — tanpa kolom/SQL baru (3 Nov 2026, permintaan pemilik: atur posisi gambar).
const nwImgPath = v => String(v || '').split('#')[0];
function nwImgFr(v) {
  const m = String(v || '').split('#')[1]; const [x, y, z] = m ? m.split(',').map(s => s === '' ? NaN : Number(s)) : [];
  return { x: isFinite(x) ? x : 50, y: isFinite(y) ? y : 50, z: isFinite(z) && z >= 1 ? z : 1 };
}
const nwFrStyle = f => (f.x === 50 && f.y === 50 && f.z === 1) ? '' : ` style="object-position:${f.x}% ${f.y}%;transform-origin:${f.x}% ${f.y}%;scale:${f.z}"`;
const nwImgStyle = v => nwFrStyle(nwImgFr(v));
const nwImgUrl = p => { p = nwImgPath(p); return !p ? '' : /^https?:/i.test(p) ? p : dashPublicUrl(p); };
// Video YouTube di News (4 Nov 2026, permintaan pemilik): link YouTube di "Tombol link" otomatis jadi pemutar video di halaman baca
// (klik → iframe youtube-nocookie, dimuat hanya saat diputar) dan thumbnail-nya dipakai bila berita tanpa gambar sampul (+ ikon ▶).
function nwYt(u) {
  let x; try { x = new URL(String(u || '').trim()); } catch (e) { return ''; }
  const h = x.hostname.replace(/^(www|m|music)\./, '');
  let id = '';
  if (h === 'youtu.be') id = x.pathname.slice(1).split('/')[0];
  else if (/^youtube(-nocookie)?\.com$/.test(h)) id = x.searchParams.get('v') || (x.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/) || [])[1] || '';
  return /^[\w-]{11}$/.test(id) ? id : '';
}
const nwYtThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const nwThumb = it => nwImgUrl(it.image) || (nwYt(it.link_url) ? nwYtThumb(nwYt(it.link_url)) : '');
const nwPlayIc = it => nwYt(it.link_url) ? '<span class="nw-play" aria-label="Video"></span>' : '';
function nwYtPlay(el, id) {
  el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1" title="Video YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  el.classList.add('on'); el.onclick = null;
}
const nwSorted = () => (nwItems || []).slice().sort((a, b) => String(b.post_date).localeCompare(String(a.post_date)) || String(b.created_at).localeCompare(String(a.created_at)));
const nwLive = () => nwSorted().filter(x => x.published);
const nwShown = () => isEditor() ? nwSorted() : nwLive();
const nwLink = id => liveLink('n', id) || `${PORTAL_URL}/news/?news=${encodeURIComponent(id)}`;   // /n/<id>/ = kartu WA berita itu (bila sudah dibuat jadwal GitHub)   // /news/ = kartu pratinjau WA News, lalu diteruskan ke /?news=
const nwIsNew = it => it?.published && cwDaysAgo(it.post_date) < NEWS_NEW_DAYS && !cwLS(NEWS_SEEN_KEY)[it.id];
const nwDate = d => cwDate(d);

async function loadNews(force) {
  if (!supabase) return;
  if (nwLoading && !force) return nwLoading;
  nwLoading = (async () => {
    try {
      const { data, error } = await supabase.from(NEWS_TABLE).select('*');
      if (error) throw error;
      nwItems = data || []; nwMissing = false; nwErr = '';
    } catch (e) {
      const m = e?.message || String(e);
      nwMissing = /does not exist|schema cache|42P01|PGRST205/i.test(m + ' ' + (e?.code || ''));
      nwErr = m; nwItems = [];
    }
    nwLoading = null;
    hlRender(); nwStar();
    if (document.getElementById('view-news')?.classList.contains('active')) renderNews();
    if (nwPending) { const id = nwPending; nwPending = null; openNews(id); }
  })();
  return nwLoading;
}
function newsAuthChanged() { if (supabase) loadNews(true); }   // draf terlihat/tersembunyi saat Editor login/logout
function nwStar() {
  const on = nwLive().some(nwIsNew);
  ['nav-news-star', 'mnav-news-star'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = !on; });
}

/* ── Headline gabungan (News publik + Concerto Way khusus login) ── */
let hlIdx = 0, hlTimer = null, hlPause = 0;
function hlSlides() {
  const s = [];
  if (typeof cwHlHtml === 'function' && authUser && cwLive().length) s.push({ t: 'cw' });
  if (NEWS_ON_DASH) nwLive().slice(0, NEWS_HL_MAX).forEach(n => s.push({ t: 'news', n }));
  return s;
}
function nwHlHtml(n) {
  const img = nwThumb(n);
  return `<div class="nw-hl" role="button" tabindex="0" onclick="openNews('${n.id}')" onkeydown="if(event.key==='Enter')openNews('${n.id}')">
    <div class="nw-img${img ? '' : ' ph'}">${img ? `<img src="${escHtml(img)}" alt="" decoding="async" draggable="false"${nwImgStyle(n.image)}>` : '<span>📰</span>'}${nwPlayIc(n)}</div>
    <div class="nw-main"><div class="nw-top">📰 News${nwIsNew(n) ? ' <span class="nw-new">BARU</span>' : ''}${n.category ? ` <span class="nw-cat">${escHtml(n.category)}</span>` : ''}</div>
      <div class="nw-t">${escHtml(n.title)}</div>${n.summary ? `<div class="nw-s">${escHtml(n.summary)}</div>` : ''}
      <div class="nw-foot"><span class="nw-date">${escHtml(nwDate(n.post_date))}</span>
        <span class="nw-btn">Baca selengkapnya ›</span></div></div></div>`;
}
/* Carousel: semua slide berjajar di satu "track" (+ salinan slide terakhir di depan & slide pertama di belakang
   agar geser berputar mulus). Geser = memindah track (GPU), tanpa merender ulang. Titik di bawah kotak, tetap. */
let hlPos = 1, hlN = 0, hlBusy = false, hlFixT = null;
const hlReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const HL_EASE = 'transform .5s cubic-bezier(.22,.61,.36,1)';
function hlRender() {
  const el = document.getElementById('cway-hl'); if (!el) return;
  const slides = hlSlides();
  if (!slides.length) { el.hidden = true; el.innerHTML = ''; hlN = 0; return; }
  if (hlIdx >= slides.length) hlIdx = 0;
  hlN = slides.length;
  const hasCw = slides.some(x => x.t === 'cw'), news = slides.filter(x => x.t === 'news');
  const tabs = hasCw && news.length
    ? `<div class="hl-tabs" role="tablist"><button class="hl-tab" data-hlt="news" onclick="hlGo('news')">${news.some(x => nwIsNew(x.n)) ? '<i class="dot"></i>' : ''}📰 News</button><button class="hl-tab" data-hlt="cw" onclick="hlGo('cw')">☕ Concerto Way <span class="lk">· khusus partner</span>${typeof cwIsNew === 'function' && cwLive().some(cwIsNew) ? '<i class="hl-star" title="Ada materi baru">★</i>' : ''}</button></div>` : '';
  const html = slides.map(x => x.t === 'cw' ? cwHlHtml() : nwHlHtml(x.n));
  const items = hlN > 1 ? [html[hlN - 1], ...html, html[0]] : html;
  const dots = hlN > 1 ? `<div class="hl-dots">${slides.map((x, i) => `<button class="hl-dot${x.t === 'cw' ? ' cw' : ''}" aria-label="Slide ${i + 1}" onclick="hlGoIdx(${i})"></button>`).join('')}</div>` : '';
  el.hidden = false;
  el.innerHTML = `${tabs}<div class="hl-view"><div class="hl-track">${items.map((h, i) => {
    const clone = hlN > 1 && (i === 0 || i === items.length - 1);
    return `<div class="hl-slide"${clone ? ' aria-hidden="true" inert' : ''}>${h}</div>`; }).join('')}</div></div>${dots}`;
  hlBusy = false; hlTarget = -1; clearTimeout(hlFixT);
  hlPos = hlN > 1 ? hlIdx + 1 : 0;
  hlSet(0, false); hlMark();
  slides.forEach(x => { const u = x.t === 'news' && nwThumb(x.n); if (u && !hlPre[u]) { hlPre[u] = new Image(); hlPre[u].src = u; } });
  hlArm(slides.length);
}
const hlPre = {};
function hlTrack() { return document.querySelector('#cway-hl .hl-track'); }
// Posisi track sebagai bilangan pecahan (pf = indeks slide yang tampil, termasuk salinan).
// Parallax (opsi A, pilihan pemilik): foto bergerak berlawanan 55% (lebih lambat dari kotak), teks ikut bergeser
// 18% & memudar; slide tujuan: teks disembunyikan selama meluncur lalu muncul berurutan dari bawah (.hl-arrive).
let hlTarget = -1;
const HL_FX = 'transform .5s cubic-bezier(.22,.61,.36,1), opacity .35s ease';
function hlParts() {
  return [...document.querySelectorAll('#cway-hl .hl-track > .hl-slide')].map(sl => sl._p || (sl._p = {
    sl, img: sl.querySelector('.nw-img img, .nw-img > span, .cw-hl-day'),
    txt: [...sl.querySelectorAll('.nw-main > *, .cw-hl-main > *, .cw-hl-side')] }));
}
function hlSetF(pf, anim) {
  const t = hlTrack(); if (!t) return;
  const on = anim && !hlReduced();
  t.style.transition = on ? HL_EASE : 'none';
  t.style.transform = `translate3d(${-pf * 100}%,0,0)`;
  if (hlReduced()) return;
  hlParts().forEach((p, j) => {
    const o = j - pf, a = Math.abs(o);
    if (p.img) { p.img.style.transition = on ? HL_EASE : 'none'; p.img.style.transform = `translate3d(${(-o * 55).toFixed(3)}%,0,0)`; }
    const hide = j === hlTarget && on;
    p.txt.forEach(x => {
      x.style.transition = on ? HL_FX : 'none';
      x.style.transform = `translate3d(${(o * 18).toFixed(3)}%,0,0)`;
      x.style.opacity = hide ? '0' : String(Math.max(0, 1 - a * 1.6));
    });
  });
}
function hlSet(dx, anim) { const w = document.querySelector('#cway-hl .hl-view')?.offsetWidth || 1; hlSetF(hlPos - (dx || 0) / w, anim); }
function hlMark() {   // tab & titik aktif mengikuti slide yang tampil
  const s = hlSlides(), cur = s[hlIdx]; if (!cur) return;
  document.querySelectorAll('#cway-hl .hl-tab').forEach(b => b.classList.toggle('on', b.dataset.hlt === cur.t));
  document.querySelectorAll('#cway-hl .hl-dot').forEach((d, i) => d.classList.toggle('on', i === hlIdx));
}
function hlArrive(j) {   // teks slide yang baru tiba muncul berurutan dari bawah
  const p = hlParts()[j]; if (!p || hlReduced()) return;
  p.txt.forEach((x, k) => {
    x.style.transition = 'none'; x.style.transform = 'translate3d(0,14px,0)'; x.style.opacity = '0'; x.offsetWidth;
    x.style.transition = `transform .42s cubic-bezier(.22,.61,.36,1) ${k * 70}ms, opacity .42s ease ${k * 70}ms`;
    x.style.transform = 'translate3d(0,0,0)'; x.style.opacity = '1';
  });
}
function hlMoveTo(pos, dx) {   // dx = geseran jari terhadap posisi lama; pindah ke posisi track (boleh salinan), lalu lompat diam-diam ke slide asli
  if (hlN < 2) return;
  const w = document.querySelector('#cway-hl .hl-view')?.offsetWidth || 1, from = hlPos - (dx || 0) / w;
  hlPos = pos; hlIdx = ((pos - 1) % hlN + hlN) % hlN; hlMark();
  hlTarget = pos;
  hlSetF(from, false); hlTrack()?.offsetWidth;
  hlSetF(pos, true); hlBusy = true; clearTimeout(hlFixT);
  hlFixT = setTimeout(() => {
    hlBusy = false; hlTarget = -1;
    if (hlPos === 0 || hlPos === hlN + 1) { hlPos = hlIdx + 1; hlSetF(hlPos, false); }
    hlArrive(hlPos);
  }, hlReduced() ? 0 : 500);
}
function hlStep(d, fromDx) { if (hlN < 2) return; if (hlBusy) { hlTarget = -1; hlPos = hlIdx + 1; hlSet(0, false); } hlMoveTo(hlPos + d, fromDx); }
function hlGoIdx(i) { hlPause = Date.now() + 15000; if (i !== hlIdx) hlMoveTo(i + 1); }
function hlGo(k) {
  const s = hlSlides(); let i = -1;
  if (k === 'cw') i = s.findIndex(x => x.t === 'cw');
  else if (k === 'news') i = s.findIndex(x => x.t === 'news');
  else if (/^n\d+$/.test(k)) { const ns = s.map((x, j) => x.t === 'news' ? j : -1).filter(j => j >= 0); i = ns[+k.slice(1)] ?? -1; }
  if (i < 0) return;
  hlGoIdx(i);
}
/* Geser (swipe HP / seret mouse): track mengikuti jari 1:1; dilepas > 80 px (atau 15% lebar) atau dikibas cepat → pindah */
function hlSwipeBind(el) {
  let x0 = null, y0 = 0, t0 = 0, id = null, drag = false, lastX = 0, lastT = 0, vx = 0, swiped = 0, w = 1;
  el.addEventListener('pointerdown', e => {
    if (e.button > 0 || hlN < 2 || !e.target.closest('.hl-view')) return;
    if (hlBusy) { hlBusy = false; hlTarget = -1; clearTimeout(hlFixT); if (hlPos === 0 || hlPos === hlN + 1) hlPos = hlIdx + 1; hlSet(0, false); }
    x0 = lastX = e.clientX; y0 = e.clientY; t0 = lastT = performance.now(); id = e.pointerId; drag = false; vx = 0;
    w = el.querySelector('.hl-view')?.offsetWidth || 1;
  });
  el.addEventListener('pointermove', e => {
    if (x0 === null || e.pointerId !== id) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!drag) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { x0 = null; return; }   // gulir vertikal → biarkan
      if (Math.abs(dx) < 8) return;
      drag = true; try { el.setPointerCapture(id); } catch (_) {}
      hlPause = Date.now() + 15000; el.classList.add('dragging');
    }
    const now = performance.now(); vx = (e.clientX - lastX) / Math.max(1, now - lastT); lastX = e.clientX; lastT = now;
    hlSet(dx, false);
  });
  const end = e => {
    if (x0 === null || e.pointerId !== id) return;
    const dx = e.clientX - x0; x0 = null; id = null;
    if (!drag) return;
    drag = false; swiped = Date.now(); el.classList.remove('dragging');
    const fling = Math.abs(vx) > .3 && Math.sign(vx) === Math.sign(dx);
    if (e.type === 'pointerup' && (Math.abs(dx) > Math.min(w * .15, 80) || (fling && Math.abs(dx) > 20))) hlMoveTo(hlPos + (dx < 0 ? 1 : -1), dx);
    else { hlSet(dx, false); hlTrack()?.offsetWidth; hlSet(0, true); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // klik setelah menggeser jangan membuka berita
  el.addEventListener('click', e => { if (Date.now() - swiped < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
  el.addEventListener('dragstart', e => { if (e.target.closest('.hl-view')) e.preventDefault(); });
}
function hlArm(n) {
  const el = document.getElementById('cway-hl');
  if (el && !el._hlBound) {
    el._hlBound = true;
    el.addEventListener('mouseenter', () => { hlPause = Infinity; });
    el.addEventListener('mouseleave', () => { hlPause = Date.now() + 2000; });
    el.addEventListener('touchstart', () => { hlPause = Date.now() + 15000; }, { passive: true });
    el.addEventListener('focusin', () => { hlPause = Date.now() + 15000; });
    hlSwipeBind(el);
  }
  clearInterval(hlTimer); hlTimer = null;
  if (n < 2) return;
  hlTimer = setInterval(() => {
    if (document.hidden || Date.now() < hlPause || !document.getElementById('view-dashboard')?.classList.contains('active')) return;
    hlStep(1);
  }, NEWS_ROTATE_MS);
}

/* ── View News (publik) ── */
function openNews(id) {
  nwCur = id || null;
  showView('news');
  document.getElementById('nav-news')?.classList.add('active');
  document.getElementById('mnav-news')?.classList.add('active');
  window.scrollTo(0, 0); document.querySelector('.main')?.scrollTo?.(0, 0);
  renderNews();
  if (!nwItems) loadNews();
}
function nwBack() { nwCur = null; renderNews(); window.scrollTo(0, 0); document.querySelector('.main')?.scrollTo?.(0, 0); }
function renderNews() {
  const body = document.getElementById('news-body'), tools = document.getElementById('news-tools'), hd = document.getElementById('news-head');
  if (!body) return;
  if (hd) hd.hidden = !!nwCur;
  if (tools) tools.innerHTML = isEditor() ? `<button class="gt-btn" onclick="openNwForm()">＋ Tambah Berita</button>${nwMissing ? ' <button class="gt-btn ghost" onclick="nwCopySql()">📋 Salin SQL</button>' : ''}` : '';
  if (!nwItems) { body.innerHTML = '<div class="stock-empty">Memuat…</div>'; return; }
  if (nwMissing) { body.innerHTML = `<div class="stock-empty">${isEditor() ? 'Tabel <b>cai_news</b> belum dibuat. Klik <b>📋 Salin SQL</b>, jalankan sekali di Supabase → SQL Editor → Run, lalu muat ulang halaman.' : 'Belum ada berita.'}</div>`; return; }
  const it = nwCur && nwShown().find(x => x.id === nwCur);
  if (nwCur && !it) { nwCur = null; showToast('Berita tidak ditemukan.'); }
  if (it) return renderNwPost(body, it);
  const list = nwShown(), cats = [...new Set(list.map(x => x.category).filter(Boolean))];
  body.innerHTML = `<div class="cw-tools"><input type="search" class="cw-search" placeholder="Cari berita…" value="${escHtml(nwQ)}" oninput="nwQ=this.value;nwListOnly()">
    ${cats.length > 1 ? `<div class="cw-chips"><button class="cw-chip${nwCat ? '' : ' on'}" onclick="nwCat='';renderNews()">Semua</button>${cats.map(c => `<button class="cw-chip${nwCat === c ? ' on' : ''}" onclick="nwCat=${escHtml(JSON.stringify(c))};renderNews()">${escHtml(c)}</button>`).join('')}</div>` : ''}</div>
    ${pnHtml('news')}<div id="nw-list">${nwListHtml()}</div>`;
}
function nwListOnly() { const el = document.getElementById('nw-list'); if (el) el.innerHTML = nwListHtml(); }
function nwListHtml() {
  const all = nwShown(); if (!all.length) return `<div class="stock-empty">${isEditor() ? 'Belum ada berita. Klik <b>＋ Tambah Berita</b>.' : 'Belum ada berita.'}</div>`;
  const q = nwQ.trim().toLowerCase();
  const list = all.filter(x => (!nwCat || x.category === nwCat) && (!q || [x.title, x.summary, x.body, x.category].join(' ').toLowerCase().includes(q)));
  if (!list.length) return '<div class="stock-empty">Tidak ada berita yang cocok.</div>';
  return `<div class="nw-grid">${list.map(x => { const img = nwThumb(x); return `<button class="nw-card${x.published ? '' : ' draft'}" onclick="openNews('${x.id}')">
    <div class="nw-cimg">${img ? `<img src="${escHtml(img)}" alt="" loading="lazy"${nwImgStyle(x.image)}>` : '<span>📰</span>'}${nwPlayIc(x)}${nwIsNew(x) ? '<span class="nw-new abs">BARU</span>' : ''}${x.published ? '' : '<span class="cw-draft">DRAF</span>'}</div>
    <div class="nw-cb"><div class="nw-cm">${x.category ? `<span class="nw-cat">${escHtml(x.category)}</span>` : ''}<span>${escHtml(nwDate(x.post_date))}</span></div>
      <div class="nw-ct">${escHtml(x.title)}</div>${x.summary ? `<div class="nw-cs">${escHtml(x.summary)}</div>` : ''}</div></button>`; }).join('')}</div>`;
}
function renderNwPost(body, it) {
  const s = cwLS(NEWS_SEEN_KEY); if (it.published && !s[it.id]) { s[it.id] = 1; cwLS(NEWS_SEEN_KEY, s); hlRender(); nwStar(); }
  const img = nwImgUrl(it.image), yt = nwYt(it.link_url);
  const lbl = escHtml(it.link_label || (yt ? 'Tonton di YouTube' : 'Lihat selengkapnya'));
  const paras = String(it.body || '').replace(/\r/g, '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const others = nwLive().filter(x => x.id !== it.id).slice(0, 5);
  const acts = `<button class="gt-btn ghost" onclick="nwShare('${it.id}')">${SHARE_ICON} Bagikan</button>
        ${isEditor() ? `<button class="gt-btn ghost" onclick="openNwForm('${it.id}')">✏️ Edit</button><button class="gt-btn ghost" onclick="deleteNw('${it.id}')">🗑 Hapus</button>` : ''}`;
  body.innerHTML = `<div class="cw-reader nw-reader">
    <button class="cw-back" onclick="nwBack()">← Semua berita</button>
    <div class="nw-layout">
    <article class="nw-art">
    ${yt ? `<div class="nw-yt" role="button" tabindex="0" aria-label="Putar video" onclick="nwYtPlay(this,'${yt}')"><img src="${escHtml(nwYtThumb(yt))}" alt=""><span class="nw-ytbtn"></span><span class="nw-ytlbl">▶ Putar video</span></div>`
      : img ? `<div class="nw-hero-img"><img src="${escHtml(img)}" alt=""${nwImgStyle(it.image)}></div>` : ''}
    <div class="nw-meta">📰 News${it.category ? ` · <b>${escHtml(it.category)}</b>` : ''} · ${escHtml(nwDate(it.post_date))}${it.published ? '' : ' · <span class="cw-draft-note">DRAF — belum tampil untuk publik</span>'}</div>
    <h2 class="nw-title">${escHtml(it.title)}</h2>
    ${it.summary ? `<p class="nw-lead">${escHtml(it.summary)}</p>` : ''}
    <div class="cw-body">${paras.map(p => `<p>${p.split('\n').map(cwWa).join('<br>')}</p>`).join('')}</div>
    ${it.link_url ? `<div class="nw-cta"><button class="gt-btn" onclick="nwOpenLink('${it.id}')">${lbl} ›</button></div>` : ''}
    <div class="cw-foot"><span class="cw-date">CAI Hub · Concerto Audio Indonesia</span>
      <div class="cw-acts">${acts}</div></div>
    </article>
    <aside class="nw-side">
      <div class="nw-sbox nw-sact">
        <div class="nw-sh">Berita ini</div>
        <div class="nw-sinfo">${it.category ? `<b>${escHtml(it.category)}</b> · ` : ''}${escHtml(nwDate(it.post_date))}</div>
        ${it.link_url ? `<button class="gt-btn" onclick="nwOpenLink('${it.id}')">${lbl} ›</button>` : ''}
        <div class="nw-sbtns">${acts}</div>
      </div>
      ${others.length ? `<div class="nw-sbox"><div class="nw-sh">Berita lainnya</div>
        ${others.map(x => { const im = nwThumb(x); return `<button class="nw-oth" onclick="openNews('${x.id}')">
          <span class="nw-oimg${im ? '' : ' ph'}">${im ? `<img src="${escHtml(im)}" alt="" loading="lazy"${nwImgStyle(x.image)}>` : '📰'}${nwPlayIc(x)}</span>
          <span class="nw-otx"><b>${escHtml(x.title)}</b><small>${x.category ? escHtml(x.category) + ' · ' : ''}${escHtml(nwDate(x.post_date))}</small></span></button>`; }).join('')}
        <button class="nw-sall" onclick="nwBack()">Lihat semua berita ›</button></div>` : ''}
    </aside>
    </div>
  </div>`;
  document.querySelector('.main')?.scrollTo?.({ top: 0 }); window.scrollTo({ top: 0 });
}
// Tombol link: link produk portal (?p=… / ?news=… / ?cw=…) dibuka di dalam portal, selain itu tab baru
function nwOpenLink(id) {
  const it = nwItems?.find(x => x.id === id); if (!it?.link_url) return;
  let u; try { u = new URL(it.link_url, location.href); } catch (e) { return; }
  const own = u.origin === location.origin || /(^|\.)concerto\.id$/i.test(u.hostname) && /^(hub|dealer)\./i.test(u.hostname);
  if (own) {
    const p = u.searchParams.get('p'), n = u.searchParams.get('news'), c = u.searchParams.get('cw');
    if (p) { const r = findProductAny(p); if (r.product) return showProduct(r.brand.id, r.product.id); }
    if (n) return openNews(n);
    if (c) return openCway(c);
  }
  window.open(u.href, '_blank', 'noopener');
}

/* ── Form Editor ── */
function openNwForm(id) {
  if (!isEditor()) return;
  if (nwMissing) { nwCopySql(); return; }
  const it = id && nwItems?.find(x => x.id === id);
  nwForm = it ? { id: it.id, title: it.title, summary: it.summary || '', body: it.body || '', category: it.category || '', image: nwImgPath(it.image), fr: nwImgFr(it.image), file: null, preview: '', link_url: it.link_url || '', link_label: it.link_label || '', post_date: it.post_date, published: it.published, busy: false }
    : { id: null, title: '', summary: '', body: '', category: NEWS_CATS[0], image: '', fr: { x: 50, y: 50, z: 1 }, file: null, preview: '', link_url: '', link_label: '', post_date: todayWIB(), published: true, busy: false };
  let ov = document.getElementById('nw-form');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'nw-form'; ov.className = 'rk-pick gl-ov';
    ov.onclick = e => { if (e.target === ov) closeNwForm(); };
    ov.innerHTML = '<div class="rk-pick-box gl-fbox cw-fbox" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(ov);
  }
  renderNwForm(); ov.classList.add('open');
}
function closeNwForm() { if (nwForm?.preview) URL.revokeObjectURL(nwForm.preview); nwForm = null; document.getElementById('nw-form')?.classList.remove('open'); }
function renderNwForm() {
  const f = nwForm, box = document.querySelector('#nw-form .rk-pick-box'); if (!f || !box) return;
  const img = f.preview || nwImgUrl(f.image);
  const prods = BRANDS.flatMap(b => b.lines.flatMap(l => l.products.map(p => `<option value="${escHtml(p.id)}">${escHtml(b.name + ' · ' + p.name)}</option>`))).join('');
  box.innerHTML = `<div class="rk-pick-hd"><div class="rk-pick-t">${f.id ? '✏️ Edit' : '＋ Tambah'} Berita</div><button class="rk-pick-x" onclick="closeNwForm()" aria-label="Tutup">✕</button></div>
    <div class="cwf">
      <div class="cwf-col">
        <label class="cwf-l">Judul<input value="${escHtml(f.title)}" maxlength="140" oninput="nwForm.title=this.value"></label>
        <label class="cwf-l">Ringkasan (1–2 kalimat, tampil di headline)<textarea class="nw-sum" maxlength="260" oninput="nwForm.summary=this.value">${escHtml(f.summary)}</textarea></label>
        <label class="cwf-l">Isi berita<textarea class="nw-body" placeholder="Pisahkan paragraf dengan baris kosong. Format WA *tebal* _miring_ ikut terbaca." oninput="nwForm.body=this.value">${escHtml(f.body)}</textarea></label>
        <div class="gl-hint">⚠️ Berita bisa dibaca semua orang — jangan masukkan harga dealer, diskon, atau info internal.</div>
      </div>
      <div class="cwf-col">
        <div class="cwf-l">Gambar sampul (disarankan landscape 16:9)
          <div class="nw-fimg${img ? ' adj' : ''}"${img ? ' onpointerdown="nwFrDrag(event)"' : ''}>${img ? `<img src="${escHtml(img)}" alt="" draggable="false"${nwFrStyle(f.fr)}><span class="nw-fhint">✥ Geser gambar untuk mengatur bagian yang tampil</span>` : '<span>Belum ada gambar</span>'}</div>
          ${img ? `<div class="nw-fz"><span>🔍 Zoom</span><input type="range" min="1" max="2.5" step="0.05" value="${f.fr.z}" oninput="nwFrZoom(this.value)" aria-label="Zoom gambar"><button type="button" class="gt-btn ghost" onclick="nwFrReset()">⊙ Reset</button></div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="gt-btn ghost">🖼 Pilih gambar<input type="file" accept="image/jpeg,image/png,image/webp" hidden onchange="nwPickImg(this)"></label>${img ? '<button class="gt-btn ghost" onclick="nwDropImg()">Hapus gambar</button>' : ''}</div></div>
        <div class="cwf-row"><label>Kategori<input list="nw-cats" value="${escHtml(f.category)}" oninput="nwForm.category=this.value"><datalist id="nw-cats">${NEWS_CATS.map(c => `<option value="${c}">`).join('')}</datalist></label>
          <label>Tanggal<input type="date" value="${escHtml(f.post_date)}" oninput="nwForm.post_date=this.value"></label></div>
        <label class="cwf-l">Tombol link (opsional)
          <select onchange="nwPickProduct(this.value)"><option value="">— Pilih produk katalog —</option>${prods}</select>
          <input value="${escHtml(f.link_url)}" placeholder="atau tempel link, mis. https://… / link YouTube" oninput="nwForm.link_url=this.value"><small class="nw-ythint">▶ Link YouTube otomatis jadi video di halaman berita (thumbnail-nya dipakai bila tanpa gambar sampul).</small></label>
        <label class="cwf-l">Teks tombol<input value="${escHtml(f.link_label)}" placeholder="mis. Lihat Produk" oninput="nwForm.link_label=this.value"></label>
        <label class="cwf-chk"><input type="checkbox"${f.published ? ' checked' : ''} onchange="nwForm.published=this.checked"> Tampilkan untuk publik (hapus centang = draf)</label>
      </div>
    </div>
    <div class="acf-foot"><button class="gt-btn ghost" onclick="closeNwForm()">Batal</button><button class="gt-btn" onclick="saveNw()"${f.busy ? ' disabled' : ''}>${f.busy ? '⏳ Menyimpan…' : '💾 Simpan & Terbitkan'}</button></div>`;
}
function nwPickProduct(pid) {
  if (!pid || !nwForm) return;
  nwForm.link_url = `${PORTAL_URL}/?p=${encodeURIComponent(pid)}`;
  if (!nwForm.link_label) nwForm.link_label = 'Lihat Produk';
  renderNwForm();
}
function nwPickImg(input) {
  const file = input.files?.[0]; input.value = ''; if (!file || !nwForm) return;
  if (nwForm.preview) URL.revokeObjectURL(nwForm.preview);
  nwForm.file = file; nwForm.preview = URL.createObjectURL(file); nwForm.fr = { x: 50, y: 50, z: 1 }; renderNwForm();
}
function nwDropImg() { if (!nwForm) return; if (nwForm.preview) URL.revokeObjectURL(nwForm.preview); nwForm.file = null; nwForm.preview = ''; nwForm.image = ''; nwForm.fr = { x: 50, y: 50, z: 1 }; renderNwForm(); }
// Atur posisi: geser gambar di kotak pratinjau (titik fokus x/y %), slider zoom 1–2,5×
function nwFrApply() {
  const im = document.querySelector('#nw-form .nw-fimg img'); if (!im || !nwForm) return;
  const f = nwForm.fr; im.style.objectPosition = `${f.x}% ${f.y}%`; im.style.transformOrigin = `${f.x}% ${f.y}%`; im.style.scale = f.z;
}
function nwFrDrag(e) {
  const box = e.currentTarget, f = nwForm?.fr; if (!f || e.button > 0) return;
  e.preventDefault(); box.setPointerCapture?.(e.pointerId); box.classList.add('drag');
  const r = box.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, fx = f.x, fy = f.y;
  const mv = ev => {   // gambar ikut jari: geser kanan = bagian kiri gambar terlihat
    const k = 100 / Math.max(1, f.z - 1 + .6);
    f.x = Math.round(Math.min(100, Math.max(0, fx - (ev.clientX - x0) / r.width * k)));
    f.y = Math.round(Math.min(100, Math.max(0, fy - (ev.clientY - y0) / r.height * k)));
    nwFrApply();
  };
  const up = () => { box.classList.remove('drag'); box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up); };
  box.addEventListener('pointermove', mv); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
}
function nwFrZoom(v) { if (!nwForm) return; nwForm.fr.z = Math.round(Number(v) * 100) / 100; nwFrApply(); }
function nwFrReset() { if (!nwForm) return; nwForm.fr = { x: 50, y: 50, z: 1 }; renderNwForm(); }
const nwFrSuffix = f => (f && (f.x !== 50 || f.y !== 50 || f.z !== 1)) ? `#${f.x},${f.y},${f.z}` : '';
async function saveNw() {
  const f = nwForm; if (!f || f.busy || !isEditor()) return;
  if (!f.title.trim()) return showToast('Judul belum terisi.');
  f.busy = true; renderNwForm();
  const old = f.id && nwImgPath(nwItems?.find(x => x.id === f.id)?.image);
  let uploaded = null;
  try {
    let image = f.image || null;
    if (f.file) {
      const blob = await glResize(f.file, 1600);
      uploaded = `news/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
      const { error } = await supabase.storage.from('showcase').upload(uploaded, blob, { contentType: blob.type, cacheControl: '3600' });
      if (error) throw error;
      image = uploaded;
    }
    const path = image;
    if (image) image += nwFrSuffix(f.fr);
    const row = { title: f.title.trim(), summary: f.summary.trim() || null, body: f.body.trim() || null, category: f.category.trim() || null, image,
      link_url: f.link_url.trim() || null, link_label: f.link_label.trim() || null, post_date: f.post_date || todayWIB(), published: !!f.published, updated_at: new Date().toISOString() };
    const wasPub = !!(f.id && nwItems?.find(x => x.id === f.id)?.published);
    const q = f.id ? supabase.from(NEWS_TABLE).update(row).eq('id', f.id).select().single() : supabase.from(NEWS_TABLE).insert(row).select().single();
    const { data, error } = await q; if (error) throw error;
    if (data.published && !wasPub) pushNotify('news', data.id);   // notifikasi HP "CAI Hub News" (sekali per berita, js/push.js)
    if (old && old !== path && /^news\//.test(old)) supabase.storage.from('showcase').remove([old]).catch(() => {});
    closeNwForm(); showToast(f.id ? '✓ Berita diperbarui' : '✓ Berita diterbitkan');
    await loadNews(true); openNews(data.id);
  } catch (e) {
    if (uploaded) supabase.storage.from('showcase').remove([uploaded]).catch(() => {});
    f.busy = false; renderNwForm();
    const m = e?.message || String(e);
    if (/does not exist|schema cache/i.test(m)) { nwMissing = true; nwCopySql(); }
    else dashErr(e, 'menyimpan berita');   // izin Storage `showcase` kurang → SQL perbaikan disalin otomatis
  }
}
async function deleteNw(id) {
  const it = nwItems?.find(x => x.id === id); if (!it || !isEditor()) return;
  if (!confirm(`Hapus berita "${it.title}"?`)) return;
  const { error } = await supabase.from(NEWS_TABLE).delete().eq('id', id);
  if (error) return showToast('⚠ Gagal menghapus: ' + error.message, 7000);
  if (it.image && /^news\//.test(it.image)) supabase.storage.from('showcase').remove([nwImgPath(it.image)]).catch(() => {});
  showToast('Berita dihapus'); nwCur = null; await loadNews(true); renderNews();
}
function nwCopySql() {
  (navigator.clipboard?.writeText(NEWS_SQL) || Promise.reject()).then(
    () => showToast('📋 SQL News DISALIN — tempel di Supabase → SQL Editor → Run, lalu muat ulang portal.', 9000),
    () => prompt('Jalankan SQL ini sekali di Supabase → SQL Editor → Run:', NEWS_SQL));
}

/* ── Bagikan ke WA: gambar sampul berita (bila ada) + teks + link ?news=<id> ── */
function nwPrepImage(it) {
  const src = nwImgUrl(it.image); if (!src || nwImgCache[it.id]?.src === src) return;
  nwImgCache[it.id] = { src, file: null };
  fetch(src).then(r => r.ok ? r.blob() : null).then(b => { if (b && nwImgCache[it.id]?.src === src) nwImgCache[it.id].file = new File([b], 'CAI-Hub-News.' + (b.type.includes('png') ? 'png' : b.type.includes('webp') ? 'webp' : 'jpg'), { type: b.type }); }).catch(() => {});
}
// Bagikan = teks + link saja (4 Nov 2026, permintaan pemilik — sama seperti Concerto Way & Panduan Partner): WhatsApp lalu
// menampilkan kartu pratinjau link /news/ (CAI Hub News). Dulu gambar sampul ikut dilampirkan sehingga WA tidak menampilkan kartu.
function nwShare(id) {
  const it = nwItems?.find(x => x.id === id); if (!it) return;
  const text = `📰 *CAI Hub News: ${it.title}*${it.summary ? '\n' + it.summary : ''}\nBaca selengkapnya di CAI Hub:\n${nwLink(it.id)}`;
  window.open(`https://wa.me/?text=${waText(text)}`, '_blank', 'noopener');
}
