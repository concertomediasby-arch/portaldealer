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
const nwImgUrl = p => !p ? '' : /^https?:/i.test(p) ? p : dashPublicUrl(p);
const nwSorted = () => (nwItems || []).slice().sort((a, b) => String(b.post_date).localeCompare(String(a.post_date)) || String(b.created_at).localeCompare(String(a.created_at)));
const nwLive = () => nwSorted().filter(x => x.published);
const nwShown = () => isEditor() ? nwSorted() : nwLive();
const nwLink = id => `${PORTAL_URL}/?news=${encodeURIComponent(id)}`;
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
let hlIdx = 0, hlTimer = null, hlPause = 0, hlSig = '';
function hlSlides() {
  const s = [];
  if (typeof cwHlHtml === 'function' && authUser && cwLive().length) s.push({ t: 'cw' });
  nwLive().slice(0, NEWS_HL_MAX).forEach(n => s.push({ t: 'news', n }));
  return s;
}
function nwHlHtml(n, pos, tot) {
  const img = nwImgUrl(n.image);
  return `<div class="nw-hl${img ? '' : ' noimg'}" role="button" tabindex="0" onclick="openNews('${n.id}')" onkeydown="if(event.key==='Enter')openNews('${n.id}')">
    ${img ? `<div class="nw-img"><img src="${escHtml(img)}" alt="" loading="lazy"></div>` : ''}
    <div class="nw-main"><div class="nw-top">📰 News${nwIsNew(n) ? ' <span class="nw-new">BARU</span>' : ''}${n.category ? ` <span class="nw-cat">${escHtml(n.category)}</span>` : ''}</div>
      <div class="nw-t">${escHtml(n.title)}</div>${n.summary ? `<div class="nw-s">${escHtml(n.summary)}</div>` : ''}
      <div class="nw-foot"><span class="nw-date">${escHtml(nwDate(n.post_date))}</span>
        ${tot > 1 ? `<span class="nw-dots">${Array.from({ length: tot }, (_, i) => `<i class="${i === pos ? 'on' : ''}" onclick="event.stopPropagation();hlGo('n${i}')"></i>`).join('')}</span>` : ''}
        <span class="nw-btn">Baca selengkapnya ›</span></div></div></div>`;
}
function hlRender() {
  const el = document.getElementById('cway-hl'); if (!el) return;
  const slides = hlSlides();
  if (!slides.length) { el.hidden = true; el.innerHTML = ''; hlSig = ''; return; }
  if (hlIdx >= slides.length) hlIdx = 0;
  const cur = slides[hlIdx], hasCw = slides.some(s => s.t === 'cw'), news = slides.filter(s => s.t === 'news');
  const tabs = hasCw && news.length
    ? `<div class="hl-tabs" role="tablist"><button class="hl-tab${cur.t === 'news' ? ' on' : ''}" onclick="hlGo('news')">${news.some(s => nwIsNew(s.n)) ? '<i class="dot"></i>' : ''}📰 News</button><button class="hl-tab${cur.t === 'cw' ? ' on' : ''}" onclick="hlGo('cw')">☕ Concerto Way <span class="lk">· khusus partner</span></button></div>` : '';
  const body = cur.t === 'cw' ? cwHlHtml() : nwHlHtml(cur.n, news.indexOf(cur), news.length);
  el.hidden = false;
  el.innerHTML = `${tabs}<div class="hl-slide">${body}</div>`;
  hlArm(slides.length);
}
function hlGo(k) {
  const s = hlSlides(); let i = -1;
  if (k === 'cw') i = s.findIndex(x => x.t === 'cw');
  else if (k === 'news') i = s.findIndex(x => x.t === 'news');
  else if (/^n\d+$/.test(k)) { const ns = s.map((x, j) => x.t === 'news' ? j : -1).filter(j => j >= 0); i = ns[+k.slice(1)] ?? -1; }
  if (i < 0) return;
  hlIdx = i; hlPause = Date.now() + 15000; hlRender();
}
function hlArm(n) {
  const el = document.getElementById('cway-hl');
  if (el && !el._hlBound) {
    el._hlBound = true;
    el.addEventListener('mouseenter', () => { hlPause = Infinity; });
    el.addEventListener('mouseleave', () => { hlPause = Date.now() + 2000; });
    el.addEventListener('touchstart', () => { hlPause = Date.now() + 15000; }, { passive: true });
    el.addEventListener('focusin', () => { hlPause = Date.now() + 15000; });
  }
  clearInterval(hlTimer); hlTimer = null;
  if (n < 2) return;
  hlTimer = setInterval(() => {
    if (document.hidden || Date.now() < hlPause || !document.getElementById('view-dashboard')?.classList.contains('active')) return;
    const s = hlSlides(); if (s.length < 2) return;
    hlIdx = (hlIdx + 1) % s.length;
    hlRender();
    document.querySelector('#cway-hl .hl-slide')?.classList.add('in');
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
    <div id="nw-list">${nwListHtml()}</div>`;
}
function nwListOnly() { const el = document.getElementById('nw-list'); if (el) el.innerHTML = nwListHtml(); }
function nwListHtml() {
  const all = nwShown(); if (!all.length) return `<div class="stock-empty">${isEditor() ? 'Belum ada berita. Klik <b>＋ Tambah Berita</b>.' : 'Belum ada berita.'}</div>`;
  const q = nwQ.trim().toLowerCase();
  const list = all.filter(x => (!nwCat || x.category === nwCat) && (!q || [x.title, x.summary, x.body, x.category].join(' ').toLowerCase().includes(q)));
  if (!list.length) return '<div class="stock-empty">Tidak ada berita yang cocok.</div>';
  return `<div class="nw-grid">${list.map(x => { const img = nwImgUrl(x.image); return `<button class="nw-card${x.published ? '' : ' draft'}" onclick="openNews('${x.id}')">
    <div class="nw-cimg">${img ? `<img src="${escHtml(img)}" alt="" loading="lazy">` : '<span>📰</span>'}${nwIsNew(x) ? '<span class="nw-new abs">BARU</span>' : ''}${x.published ? '' : '<span class="cw-draft">DRAF</span>'}</div>
    <div class="nw-cb"><div class="nw-cm">${x.category ? `<span class="nw-cat">${escHtml(x.category)}</span>` : ''}<span>${escHtml(nwDate(x.post_date))}</span></div>
      <div class="nw-ct">${escHtml(x.title)}</div>${x.summary ? `<div class="nw-cs">${escHtml(x.summary)}</div>` : ''}</div></button>`; }).join('')}</div>`;
}
function renderNwPost(body, it) {
  const s = cwLS(NEWS_SEEN_KEY); if (it.published && !s[it.id]) { s[it.id] = 1; cwLS(NEWS_SEEN_KEY, s); hlRender(); nwStar(); }
  nwPrepImage(it);
  const img = nwImgUrl(it.image);
  const paras = String(it.body || '').replace(/\r/g, '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  body.innerHTML = `<div class="cw-reader nw-reader">
    <button class="cw-back" onclick="nwBack()">← Semua berita</button>
    ${img ? `<div class="nw-hero-img"><img src="${escHtml(img)}" alt=""></div>` : ''}
    <div class="nw-meta">📰 News${it.category ? ` · <b>${escHtml(it.category)}</b>` : ''} · ${escHtml(nwDate(it.post_date))}${it.published ? '' : ' · <span class="cw-draft-note">DRAF — belum tampil untuk publik</span>'}</div>
    <h2 class="nw-title">${escHtml(it.title)}</h2>
    ${it.summary ? `<p class="nw-lead">${escHtml(it.summary)}</p>` : ''}
    <div class="cw-body">${paras.map(p => `<p>${p.split('\n').map(cwWa).join('<br>')}</p>`).join('')}</div>
    ${it.link_url ? `<div class="nw-cta"><button class="gt-btn" onclick="nwOpenLink('${it.id}')">${escHtml(it.link_label || 'Lihat selengkapnya')} ›</button></div>` : ''}
    <div class="cw-foot"><span class="cw-date">CAI Hub · Concerto Audio Indonesia</span>
      <div class="cw-acts"><button class="gt-btn ghost" onclick="nwShare('${it.id}')">${SHARE_ICON} Bagikan</button>
        ${isEditor() ? `<button class="gt-btn ghost" onclick="openNwForm('${it.id}')">✏️ Edit</button><button class="gt-btn ghost" onclick="deleteNw('${it.id}')">🗑 Hapus</button>` : ''}</div></div>
  </div>`;
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
  nwForm = it ? { id: it.id, title: it.title, summary: it.summary || '', body: it.body || '', category: it.category || '', image: it.image || '', file: null, preview: '', link_url: it.link_url || '', link_label: it.link_label || '', post_date: it.post_date, published: it.published, busy: false }
    : { id: null, title: '', summary: '', body: '', category: NEWS_CATS[0], image: '', file: null, preview: '', link_url: '', link_label: '', post_date: todayWIB(), published: true, busy: false };
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
          <div class="nw-fimg">${img ? `<img src="${escHtml(img)}" alt="">` : '<span>Belum ada gambar</span>'}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="gt-btn ghost">🖼 Pilih gambar<input type="file" accept="image/jpeg,image/png,image/webp" hidden onchange="nwPickImg(this)"></label>${img ? '<button class="gt-btn ghost" onclick="nwDropImg()">Hapus gambar</button>' : ''}</div></div>
        <div class="cwf-row"><label>Kategori<input list="nw-cats" value="${escHtml(f.category)}" oninput="nwForm.category=this.value"><datalist id="nw-cats">${NEWS_CATS.map(c => `<option value="${c}">`).join('')}</datalist></label>
          <label>Tanggal<input type="date" value="${escHtml(f.post_date)}" oninput="nwForm.post_date=this.value"></label></div>
        <label class="cwf-l">Tombol link (opsional)
          <select onchange="nwPickProduct(this.value)"><option value="">— Pilih produk katalog —</option>${prods}</select>
          <input value="${escHtml(f.link_url)}" placeholder="atau tempel link, mis. https://…" oninput="nwForm.link_url=this.value"></label>
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
  nwForm.file = file; nwForm.preview = URL.createObjectURL(file); renderNwForm();
}
function nwDropImg() { if (!nwForm) return; if (nwForm.preview) URL.revokeObjectURL(nwForm.preview); nwForm.file = null; nwForm.preview = ''; nwForm.image = ''; renderNwForm(); }
async function saveNw() {
  const f = nwForm; if (!f || f.busy || !isEditor()) return;
  if (!f.title.trim()) return showToast('Judul belum terisi.');
  f.busy = true; renderNwForm();
  const old = f.id && nwItems?.find(x => x.id === f.id)?.image;
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
    const row = { title: f.title.trim(), summary: f.summary.trim() || null, body: f.body.trim() || null, category: f.category.trim() || null, image,
      link_url: f.link_url.trim() || null, link_label: f.link_label.trim() || null, post_date: f.post_date || todayWIB(), published: !!f.published, updated_at: new Date().toISOString() };
    const q = f.id ? supabase.from(NEWS_TABLE).update(row).eq('id', f.id).select().single() : supabase.from(NEWS_TABLE).insert(row).select().single();
    const { data, error } = await q; if (error) throw error;
    if (old && old !== image && /^news\//.test(old)) supabase.storage.from('showcase').remove([old]).catch(() => {});
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
  if (it.image && /^news\//.test(it.image)) supabase.storage.from('showcase').remove([it.image]).catch(() => {});
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
async function nwShare(id) {
  const it = nwItems?.find(x => x.id === id); if (!it) return;
  const text = `📰 *${it.title}*${it.summary ? '\n' + it.summary : ''}\n\nBaca selengkapnya di CAI Hub:\n${nwLink(it.id)}`;
  const file = nwImgCache[it.id]?.src === nwImgUrl(it.image) ? nwImgCache[it.id].file : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  window.open(`https://wa.me/?text=${waText(text)}`, '_blank', 'noopener');
}
