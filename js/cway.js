/* CAI Hub (Concerto Audio Indonesia) — js/cway.js
   CONCERTO WAY (3 Nov 2026, permintaan pemilik): materi harian tim CAI untuk partner (yang juga dikirim ke grup WA partner).
   KHUSUS DEALER YANG LOGIN (Kode Akses): isi TIDAK disimpan di repo (situs publik) melainkan di tabel Supabase
   `concerto_way` (RLS baca = authenticated, tulis = admin/editor). Editor/Admin menempel teks persis seperti di WA →
   Day, seri, judul, resume & tugas dikenali otomatis (cwParse). Headline postingan terbaru di paling atas Dashboard.
   Dimuat setelah showcase.js, sebelum main.js. */

const CWAY_TABLE = 'concerto_way';
const CWAY_NEW_DAYS = 5;                 // label ★ BARU selama n hari (dan selama belum dibuka di perangkat itu)
const CWAY_SEEN_KEY = 'cai-cway-seen';   // { <id>: 1 } postingan yang sudah dibuka di browser ini
const CWAY_TASK_KEY = 'cai-cway-tasks';  // { <id>: [true,false,…] } centang tugas — hanya di perangkat masing-masing
const CWAY_SQL = `-- Concerto Way (CAI Hub) — jalankan sekali di Supabase → SQL Editor → Run
create table if not exists public.concerto_way (
  id uuid primary key default gen_random_uuid(),
  day int,
  series text,
  title text not null,
  subtitle text,
  body text not null,
  post_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.concerto_way enable row level security;
drop policy if exists "cway read" on public.concerto_way;
create policy "cway read" on public.concerto_way for select to authenticated
  using (published or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));
drop policy if exists "cway write" on public.concerto_way;
create policy "cway write" on public.concerto_way for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));
revoke all on public.concerto_way from anon;
grant select, insert, update, delete on public.concerto_way to authenticated;`;

let cwItems = null, cwMissing = false, cwErr = '', cwLoading = null;
let cwCur = null, cwQ = '', cwSer = '', cwForm = null, cwPending = null;
const cwImgCache = {};   // { <id>: File } gambar bagikan disiapkan saat postingan dibuka (navigator.share harus langsung dari klik)

const cwLS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || '{}') || {}; localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return {}; } };
// Format WhatsApp: *tebal* _miring_ ~coret~
const cwWa = s => escHtml(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<i>$2</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>');
const cwPlain = s => String(s || '').replace(/[*_~]/g, '');
const cwLink = id => `${PORTAL_URL}/?cw=${encodeURIComponent(id)}`;
const cwDate = d => d ? new Date(d + 'T12:00:00+07:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '';
const cwSorted = () => (cwItems || []).slice().sort((a, b) => String(b.post_date).localeCompare(String(a.post_date)) || (b.day || 0) - (a.day || 0) || String(b.created_at).localeCompare(String(a.created_at)));
const cwLive = () => cwSorted().filter(x => x.published);
const cwShown = () => isAdmin() ? cwSorted() : cwLive();
const cwDaysAgo = d => Math.round((Date.parse(todayWIB() + 'T00:00:00Z') - Date.parse(String(d) + 'T00:00:00Z')) / 864e5);
const cwIsNew = it => it?.published && cwDaysAgo(it.post_date) < CWAY_NEW_DAYS && !cwLS(CWAY_SEEN_KEY)[it.id];

/* ── Teks WA → struktur postingan ──
   Pola contoh pemilik: CONCERTO WAY · DAY n · <SERI: …> · judul (+ subjudul) · paragraf … · "Resume hari ini:" · "Tugas Hari Ini" · penutup.
   Bagian yang tak dikenali tetap tampil sebagai paragraf biasa. */
function cwParse(raw) {
  const L = String(raw || '').replace(/\r/g, '').split('\n').map(s => s.trim());
  let i = 0; const skip = () => { while (i < L.length && !L[i]) i++; };
  const out = { day: null, series: '', title: '', subtitle: '', blocks: [] };
  skip(); if (/^\*?concerto\s*way\*?$/i.test(L[i] || '')) { i++; skip(); }
  const d = /^\*?day\s*(\d+)/i.exec(L[i] || ''); if (d) { out.day = +d[1]; i++; skip(); }
  if (/^\*?[A-Z][A-Z0-9 &]{1,24}:\s*\S/.test(L[i] || '')) { out.series = cwPlain(L[i]); i++; skip(); }
  const head = []; while (i < L.length && L[i]) head.push(L[i++]);
  out.title = cwPlain(head[0] || ''); out.subtitle = cwPlain(head.slice(1).join(' '));
  const paras = []; let cur = [];
  for (; i <= L.length; i++) { const s = L[i]; if (s) cur.push(s); else if (cur.length) { paras.push(cur); cur = []; } }
  for (let k = 0; k < paras.length; k++) {
    const p = paras[k], t = p.join(' '), h = cwPlain(p[0]);
    if (/^resume hari ini\s*:?$/i.test(h)) { out.blocks.push({ t: 'resume', v: p.length > 1 ? p.slice(1).join(' ') : (paras[++k] || []).join(' ') }); continue; }
    if (/^resume hari ini\s*:/i.test(h)) { out.blocks.push({ t: 'resume', v: t.replace(/^\W*resume hari ini\s*:\s*/i, '') }); continue; }
    if (/^tugas hari ini\s*:?$/i.test(h)) { out.blocks.push({ t: 'task', v: p.length > 1 ? p.slice(1) : (paras[++k] || []) }); continue; }
    if (/^\d+([.,]\d+)?\s?%/.test(t)) {
      const last = out.blocks[out.blocks.length - 1], st = { n: t.match(/^\S+/)[0], v: t.replace(/^\S+\s*/, '') };
      if (last?.t === 'stats') last.v.push(st); else out.blocks.push({ t: 'stats', v: [st] });
      continue;
    }
    if (/^sumber\s*:/i.test(h)) { out.blocks.push({ t: 'src', v: t }); continue; }
    out.blocks.push({ t: k === paras.length - 1 && paras.length > 2 ? 'close' : 'p', v: p });
  }
  return out;
}
function cwBodyHtml(it, interactive = true) {
  const done = cwLS(CWAY_TASK_KEY)[it.id] || [];
  return cwParse(it.body).blocks.map(b => {
    if (b.t === 'p') return `<p>${b.v.map(cwWa).join('<br>')}</p>`;
    if (b.t === 'close') return `<p class="cw-close">${b.v.map(cwWa).join('<br>')}</p>`;
    if (b.t === 'src') return `<p class="cw-src">${cwWa(b.v)}</p>`;
    if (b.t === 'stats') return `<div class="cw-stats">${b.v.map(s => `<div class="cw-stat"><b>${escHtml(s.n)}</b><div>${cwWa(s.v)}</div></div>`).join('')}</div>`;
    if (b.t === 'resume') return `<div class="cw-resume"><div class="cw-h">📌 Resume hari ini</div><p>${cwWa(b.v)}</p></div>`;
    if (b.t === 'task') {
      const n = b.v.filter((x, j) => done[j]).length;
      return `<div class="cw-task"><div class="cw-h">✅ Tugas hari ini</div>${b.v.map((x, j) => `<label><input type="checkbox"${done[j] ? ' checked' : ''}${interactive ? ` onchange="cwTask('${it.id}',${j},this.checked)"` : ' disabled'}><span>${cwWa(x)}</span></label>`).join('')}<div class="cw-prog">${n} dari ${b.v.length} selesai · centang tersimpan di perangkat ini</div></div>`;
    }
    return '';
  }).join('');
}
const cwTaskCount = it => (cwParse(it.body).blocks.find(b => b.t === 'task')?.v || []).length;
function cwTask(id, j, on) {
  const all = cwLS(CWAY_TASK_KEY), a = all[id] || []; a[j] = on; all[id] = a; cwLS(CWAY_TASK_KEY, all);
  const box = document.querySelector('#view-cway .cw-task'), n = a.filter(Boolean).length, tot = box ? box.querySelectorAll('input').length : 0;
  if (box) box.querySelector('.cw-prog').textContent = `${n} dari ${tot} selesai · centang tersimpan di perangkat ini`;
  renderCwayHl();
}

/* ── Data ── */
async function loadCway(force) {
  if (!supabase || !authUser) { cwItems = null; return; }
  if (cwLoading && !force) return cwLoading;
  cwLoading = (async () => {
    try {
      const { data, error } = await supabase.from(CWAY_TABLE).select('*');
      if (error) throw error;
      cwItems = data || []; cwMissing = false; cwErr = '';
    } catch (e) {
      const m = e?.message || String(e);
      cwMissing = /does not exist|schema cache|42P01|PGRST205/i.test(m + ' ' + (e?.code || ''));
      cwErr = m; cwItems = [];
    }
    cwLoading = null;
    cwRefresh();
  })();
  return cwLoading;
}
function cwRefresh() {
  renderCwayHl(); cwStar();
  if (document.getElementById('view-cway')?.classList.contains('active')) renderCway();
}
function cwayAuthChanged() {
  if (authUser) loadCway(true).then(() => { if (cwPending) { const id = cwPending; cwPending = null; openCway(id); } });
  else {
    cwItems = null; cwCur = null; renderCwayHl(); cwStar();
    if (document.getElementById('view-cway')?.classList.contains('active')) showView('dashboard');
    if (cwPending) { const id = cwPending; cwPending = null; openCway(id); }   // link ?cw= tanpa sesi → minta Kode Akses
  }
}
function cwStar() {
  const on = !!authUser && cwLive().some(cwIsNew);
  ['nav-cway-star', 'mnav-cway-star'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = !on; });
}

/* ── Headline Dashboard (postingan terbaru) — digabung dengan News di js/news.js (hlRender) ── */
function cwHlHtml() {
  const list = authUser ? cwLive() : [], it = list[0];
  if (!it) return '';
  const res = cwParse(it.body).blocks.find(b => b.t === 'resume');
  const tot = cwTaskCount(it), done = (cwLS(CWAY_TASK_KEY)[it.id] || []).filter(Boolean).length, prev = list[1];
  return `<div class="cw-hl" role="button" tabindex="0" onclick="openCway('${it.id}')" onkeydown="if(event.key==='Enter')openCway('${it.id}')">
    <div class="cw-hl-day"><span>DAY</span><b>${it.day ?? '•'}</b></div>
    <div class="cw-hl-main"><div class="cw-hl-top">☕ Concerto Way ${it.post_date === todayWIB() ? 'hari ini' : 'terbaru'}${cwIsNew(it) ? ' <span class="cw-new">★ BARU</span>' : ''}${it.series ? ` <span class="cw-hl-ser">${escHtml(it.series)}</span>` : ''}</div>
      <div class="cw-hl-t">${escHtml(it.title)}</div>${it.subtitle ? `<div class="cw-hl-s">${escHtml(it.subtitle)}</div>` : ''}
      ${res ? `<div class="cw-hl-res"><b>RESUME</b>${cwWa(res.v)}</div>` : ''}</div>
    <div class="cw-hl-side">${tot ? `<div class="cw-hl-prog">Tugas hari ini: ${done} dari ${tot} selesai<div class="cw-hl-bar"><i style="width:${Math.round(done / tot * 100)}%"></i></div></div>` : ''}
      <span class="cw-hl-btn">Baca sekarang ›</span>
      ${prev ? `<button class="cw-hl-prev" onclick="event.stopPropagation();openCway('${prev.id}')">Terlewat? Lihat ${prev.day != null ? 'Day ' + prev.day : 'sebelumnya'} ›</button>` : ''}</div>
  </div>`;
}
function renderCwayHl() { if (typeof hlRender === 'function') hlRender(); }

/* ── View Concerto Way ── */
function openCway(id) {
  if (!requireLogin(() => openCway(id))) return;
  cwCur = id || null;
  showView('cway');
  document.getElementById('nav-cway')?.classList.add('active');
  document.getElementById('mnav-cway')?.classList.add('active');
  window.scrollTo(0, 0); document.querySelector('.main')?.scrollTo?.(0, 0);
  renderCway();
  if (!cwItems) loadCway();
}
function cwBack() { cwCur = null; renderCway(); window.scrollTo(0, 0); document.querySelector('.main')?.scrollTo?.(0, 0); }
function renderCway() {
  const body = document.getElementById('cway-body'), tools = document.getElementById('cway-tools'), hd = document.getElementById('cway-head');
  if (!body) return;
  if (hd) hd.hidden = !!cwCur;
  if (tools) tools.innerHTML = isAdmin() ? `<button class="gt-btn" onclick="openCwForm()">＋ Tambah Concerto Way</button>${cwMissing ? ' <button class="gt-btn ghost" onclick="cwCopySql()">📋 Salin SQL</button>' : ''}` : '';
  if (!cwItems) { body.innerHTML = '<div class="stock-empty">Memuat…</div>'; return; }
  if (cwMissing) { body.innerHTML = `<div class="stock-empty">${isAdmin() ? 'Tabel <b>concerto_way</b> belum dibuat. Klik <b>📋 Salin SQL</b>, jalankan sekali di Supabase → SQL Editor → Run, lalu muat ulang halaman.' : 'Concerto Way segera hadir.'}</div>`; return; }
  if (cwErr && !cwItems.length) { body.innerHTML = `<div class="stock-empty">Concerto Way belum bisa dimuat. Coba lagi sebentar.${isAdmin() ? `<br><small>${escHtml(cwErr)}</small>` : ''}</div>`; return; }
  const it = cwCur && cwShown().find(x => x.id === cwCur);
  if (cwCur && !it) { cwCur = null; showToast('Postingan Concerto Way tidak ditemukan.'); }
  if (it) return renderCwPost(body, it);
  const list = cwShown();
  const q = cwQ.trim().toLowerCase();
  const sers = [...new Set(list.map(x => x.series).filter(Boolean))];
  const shown = list.filter(x => (!cwSer || x.series === cwSer) && (!q || [x.title, x.subtitle, x.series, x.body, 'day ' + x.day].join(' ').toLowerCase().includes(q)));
  const groups = [];
  shown.forEach(x => { const k = x.series || 'Concerto Way'; let g = groups.find(g => g.k === k); if (!g) groups.push(g = { k, items: [] }); g.items.push(x); });
  body.innerHTML = `<div class="cw-tools"><input type="search" class="cw-search" placeholder="Cari topik, mis. papan nama…" value="${escHtml(cwQ)}" oninput="cwQ=this.value;cwRenderListOnly()">
      ${sers.length > 1 ? `<div class="cw-chips"><button class="cw-chip${cwSer ? '' : ' on'}" onclick="cwSer='';renderCway()">Semua</button>${sers.map(s => `<button class="cw-chip${cwSer === s ? ' on' : ''}" onclick="cwSer=${escHtml(JSON.stringify(s))};renderCway()">${escHtml(s)}</button>`).join('')}</div>` : ''}</div>
    <div id="cw-list">${cwListHtml(groups, list.length)}</div>`;
}
function cwRenderListOnly() {   // pencarian: jangan render ulang kotak input (fokus & kursor tetap)
  const q = cwQ.trim().toLowerCase(), list = cwShown(), groups = [];
  list.filter(x => (!cwSer || x.series === cwSer) && (!q || [x.title, x.subtitle, x.series, x.body, 'day ' + x.day].join(' ').toLowerCase().includes(q)))
    .forEach(x => { const k = x.series || 'Concerto Way'; let g = groups.find(g => g.k === k); if (!g) groups.push(g = { k, items: [] }); g.items.push(x); });
  const el = document.getElementById('cw-list'); if (el) el.innerHTML = cwListHtml(groups, list.length);
}
function cwListHtml(groups, total) {
  if (!total) return `<div class="stock-empty">${isAdmin() ? 'Belum ada postingan. Klik <b>＋ Tambah Concerto Way</b> lalu tempel teks dari grup WA.' : 'Belum ada postingan Concerto Way.'}</div>`;
  if (!groups.length) return '<div class="stock-empty">Tidak ada postingan yang cocok.</div>';
  return groups.map(g => `<div class="cw-series">${escHtml(g.k)}</div><div class="cw-grid">${g.items.map(x => {
    const tot = cwTaskCount(x), done = (cwLS(CWAY_TASK_KEY)[x.id] || []).filter(Boolean).length;
    return `<button class="cw-card${x.published ? '' : ' draft'}" onclick="openCway('${x.id}')">${cwIsNew(x) ? '<span class="cw-new abs">★ BARU</span>' : ''}${x.published ? '' : '<span class="cw-draft">DRAF</span>'}
      <div class="cw-card-day"><span>DAY</span><b>${x.day ?? '•'}</b></div>
      <div class="cw-card-t">${escHtml(x.title)}</div>${x.subtitle ? `<div class="cw-card-s">${escHtml(x.subtitle)}</div>` : ''}
      <div class="cw-card-m"><span>${escHtml(cwDate(x.post_date))}</span>${tot ? `<span>${done === tot ? '✅' : '☐'} ${done}/${tot} tugas</span>` : ''}</div></button>`;
  }).join('')}</div>`).join('');
}
function renderCwPost(body, it) {
  const s = cwLS(CWAY_SEEN_KEY); if (it.published && !s[it.id]) { s[it.id] = 1; cwLS(CWAY_SEEN_KEY, s); renderCwayHl(); cwStar(); }
  const asc = cwShown().slice().reverse(), i = asc.findIndex(x => x.id === it.id), prev = asc[i - 1], next = asc[i + 1];
  const lbl = x => x.day != null ? 'Day ' + x.day : 'Sebelumnya';
  cwPrepImage(it);
  body.innerHTML = `<div class="cw-reader">
    <button class="cw-back" onclick="cwBack()">← Semua Concerto Way</button>
    <div class="cw-hero"><div class="cw-hero-top"><span class="cw-badge">☕ CONCERTO WAY</span>${it.day != null ? `<span class="cw-dnum">DAY ${it.day}</span>` : ''}</div>
      ${it.series ? `<div class="cw-ser">${escHtml(it.series)}</div>` : ''}<h2 class="cw-title">${escHtml(it.title)}</h2>${it.subtitle ? `<p class="cw-sub">${escHtml(it.subtitle)}</p>` : ''}
      ${it.published ? '' : '<div class="cw-draft-note">DRAF — belum tampil untuk dealer</div>'}</div>
    <div class="cw-body">${cwBodyHtml(it)}</div>
    <div class="cw-foot"><span class="cw-date">${escHtml(cwDate(it.post_date))}</span>
      <div class="cw-acts"><button class="gt-btn ghost" onclick="cwShare('${it.id}')">${SHARE_ICON} Bagikan</button><button class="gt-btn ghost" onclick="cwPngDownload('${it.id}', this)">⬇ Unduh PNG</button>
        ${isAdmin() ? `<button class="gt-btn ghost" onclick="openCwForm('${it.id}')">✏️ Edit</button><button class="gt-btn ghost" onclick="deleteCw('${it.id}')">🗑 Hapus</button>` : ''}</div></div>
    <div class="cw-nav">${prev ? `<button class="gt-btn ghost" onclick="openCway('${prev.id}')">‹ ${lbl(prev)}</button>` : '<span></span>'}${next ? `<button class="gt-btn ghost" onclick="openCway('${next.id}')">${next.day != null ? 'Day ' + next.day : 'Berikutnya'} ›</button>` : ''}</div>
  </div>`;
}

/* ── Form Editor/Admin: tempel teks WA ── */
function openCwForm(id) {
  if (!isAdmin()) return;
  if (cwMissing) { cwCopySql(); return; }
  const it = id && cwItems?.find(x => x.id === id);
  cwForm = it ? { id: it.id, body: it.body, day: it.day ?? '', series: it.series || '', title: it.title, subtitle: it.subtitle || '', post_date: it.post_date, published: it.published, touched: {}, busy: false }
    : { id: null, body: '', day: '', series: '', title: '', subtitle: '', post_date: todayWIB(), published: true, touched: {}, busy: false };
  if (it) Object.assign(cwForm.touched, { day: 1, series: 1, title: 1, subtitle: 1 });
  let ov = document.getElementById('cw-form');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'cw-form'; ov.className = 'rk-pick gl-ov';
    ov.onclick = e => { if (e.target === ov) closeCwForm(); };
    ov.innerHTML = '<div class="rk-pick-box gl-fbox cw-fbox" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(ov);
  }
  renderCwForm(); ov.classList.add('open');
  setTimeout(() => document.getElementById('cwf-body')?.focus(), 50);
}
function closeCwForm() { cwForm = null; document.getElementById('cw-form')?.classList.remove('open'); }
function renderCwForm() {
  const f = cwForm, box = document.querySelector('#cw-form .rk-pick-box'); if (!f || !box) return;
  box.innerHTML = `<div class="rk-pick-hd"><div class="rk-pick-t">${f.id ? '✏️ Edit' : '＋ Tambah'} Concerto Way</div><button class="rk-pick-x" onclick="closeCwForm()" aria-label="Tutup">✕</button></div>
    <div class="cwf">
      <div class="cwf-col">
        <label class="cwf-l">1 · Tempel teks persis seperti yang dikirim ke grup WA
          <textarea id="cwf-body" placeholder="CONCERTO WAY&#10;DAY 3&#10;&#10;BASIC: …&#10;&#10;Judul…" oninput="cwFormBody(this.value)">${escHtml(f.body)}</textarea></label>
        <div class="gl-hint">Day, seri, judul, <b>Resume hari ini</b> & <b>Tugas Hari Ini</b> dikenali otomatis. Format WA *tebal* dan _miring_ ikut terbaca.</div>
      </div>
      <div class="cwf-col">
        <div class="cwf-h">2 · Periksa hasil</div>
        <div class="cwf-row"><label>Day<input type="number" min="0" value="${escHtml(f.day)}" oninput="cwFormSet('day',this.value)"></label><label>Tanggal<input type="date" value="${escHtml(f.post_date)}" oninput="cwFormSet('post_date',this.value)"></label></div>
        <label class="cwf-l">Seri<input value="${escHtml(f.series)}" placeholder="mis. BASIC: Kalau Saya Jadi Customer" oninput="cwFormSet('series',this.value)"></label>
        <label class="cwf-l">Judul<input value="${escHtml(f.title)}" oninput="cwFormSet('title',this.value)"></label>
        <label class="cwf-l">Subjudul<input value="${escHtml(f.subtitle)}" oninput="cwFormSet('subtitle',this.value)"></label>
        <label class="cwf-chk"><input type="checkbox"${f.published ? ' checked' : ''} onchange="cwForm.published=this.checked"> Tampilkan untuk dealer (hapus centang = simpan sebagai draf)</label>
        <div class="cwf-h">Pratinjau</div>
        <div class="cwf-prev" id="cwf-prev"></div>
      </div>
    </div>
    <div class="acf-foot"><button class="gt-btn ghost" onclick="closeCwForm()">Batal</button><button class="gt-btn" id="cwf-save" onclick="saveCw()"${f.busy ? ' disabled' : ''}>${f.busy ? '⏳ Menyimpan…' : '💾 Simpan & Terbitkan'}</button></div>`;
  cwFormPreview();
}
function cwFormBody(v) {
  const f = cwForm; if (!f) return; f.body = v;
  const p = cwParse(v), box = document.querySelector('#cw-form .cwf');
  const set = (k, val) => { if (f.touched[k]) return; f[k] = val ?? ''; const inp = box?.querySelector(`[oninput*="'${k}'"]`); if (inp) inp.value = f[k]; };
  set('day', p.day); set('series', p.series); set('title', p.title); set('subtitle', p.subtitle);
  cwFormPreview();
}
function cwFormSet(k, v) { if (!cwForm) return; cwForm[k] = v; cwForm.touched[k] = 1; cwFormPreview(); }
function cwFormPreview() {
  const f = cwForm, el = document.getElementById('cwf-prev'); if (!f || !el) return;
  el.innerHTML = `<div class="cw-hero sm"><div class="cw-hero-top"><span class="cw-badge">☕ CONCERTO WAY</span>${f.day !== '' ? `<span class="cw-dnum">DAY ${escHtml(f.day)}</span>` : ''}</div>
    ${f.series ? `<div class="cw-ser">${escHtml(f.series)}</div>` : ''}<div class="cw-title">${escHtml(f.title || '(judul)')}</div>${f.subtitle ? `<p class="cw-sub">${escHtml(f.subtitle)}</p>` : ''}</div>
    <div class="cw-body">${cwBodyHtml({ id: 'preview', body: f.body }, false) || '<p class="cw-src">Isi postingan tampil di sini.</p>'}</div>`;
}
async function saveCw() {
  const f = cwForm; if (!f || f.busy || !isAdmin()) return;
  if (!f.body.trim()) return showToast('Tempel teks Concerto Way dulu.');
  if (!f.title.trim()) return showToast('Judul belum terisi.');
  const row = { body: f.body.trim(), day: f.day === '' ? null : parseInt(f.day, 10), series: f.series.trim() || null, title: f.title.trim(), subtitle: f.subtitle.trim() || null,
    post_date: f.post_date || todayWIB(), published: !!f.published, updated_at: new Date().toISOString() };
  f.busy = true; renderCwForm();
  try {
    const q = f.id ? supabase.from(CWAY_TABLE).update(row).eq('id', f.id).select().single() : supabase.from(CWAY_TABLE).insert(row).select().single();
    const { data, error } = await q; if (error) throw error;
    closeCwForm(); showToast(f.id ? '✓ Concerto Way diperbarui' : '✓ Concerto Way diterbitkan');
    await loadCway(true);
    openCway(data.id);
  } catch (e) {
    f.busy = false; renderCwForm();
    const m = e?.message || String(e);
    if (/does not exist|schema cache/i.test(m)) { cwMissing = true; cwCopySql(); } else showToast('⚠ Gagal menyimpan: ' + m, 7000);
  }
}
async function deleteCw(id) {
  const it = cwItems?.find(x => x.id === id); if (!it || !isAdmin()) return;
  if (!confirm(`Hapus Concerto Way ${it.day != null ? 'Day ' + it.day + ' — ' : ''}"${it.title}"?\n\nPostingan hilang dari portal untuk semua dealer.`)) return;
  const { error } = await supabase.from(CWAY_TABLE).delete().eq('id', id);
  if (error) return showToast('⚠ Gagal menghapus: ' + error.message, 7000);
  showToast('Postingan dihapus'); cwCur = null; await loadCway(true);
}
function cwCopySql() {
  (navigator.clipboard?.writeText(CWAY_SQL) || Promise.reject()).then(
    () => showToast('📋 SQL Concerto Way DISALIN — tempel di Supabase → SQL Editor → Run, lalu muat ulang portal.', 9000),
    () => prompt('Jalankan SQL ini sekali di Supabase → SQL Editor → Run:', CWAY_SQL));
}

/* ── Bagikan ke WA: gambar 1080×1080 (Day · seri · judul) + teks + link ── */
function cwWrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = []; let l = '';
  words.forEach(w => { const t = l ? l + ' ' + w : w; if (ctx.measureText(t).width > maxW && l) { lines.push(l); l = w; } else l = t; });
  if (l) lines.push(l); return lines;
}
async function cwImage(it) {
  try { await document.fonts.load('800 80px Sora'); await document.fonts.load('600 24px Sora'); await document.fonts.load('400 30px Inter'); } catch (e) {}
  const S = 1080, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, '#16130c'); g.addColorStop(.6, '#08090b'); g.addColorStop(1, '#08090b');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  g = x.createRadialGradient(S * .85, S * .1, 0, S * .85, S * .1, S * .7); g.addColorStop(0, 'rgba(216,178,106,.30)'); g.addColorStop(1, 'rgba(216,178,106,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(216,178,106,.38)'; x.lineWidth = 2; x.beginPath(); (x.roundRect ? x.roundRect(36, 36, S - 72, S - 72, 34) : x.rect(36, 36, S - 72, S - 72)); x.stroke();
  const L = 96;
  await new Promise(r => { const im = new Image(); im.onload = () => { const h = 58; x.drawImage(im, L, 92, im.width * h / im.height, h); r(); }; im.onerror = r; im.src = LOGO_WHITE; });
  x.textBaseline = 'alphabetic'; x.fillStyle = '#d8b26a'; x.font = '700 22px Sora'; x.textAlign = 'right';
  if ('letterSpacing' in x) x.letterSpacing = '6px';
  x.fillText('CONCERTO WAY', S - L, 130);
  x.textAlign = 'left';
  let y = 420;
  if (it.day != null) {
    x.font = '700 34px Sora'; x.fillText('DAY', L, 400); const dw = x.measureText('DAY').width;
    if ('letterSpacing' in x) x.letterSpacing = '0px';
    x.fillStyle = '#f0cf8a'; x.font = '800 230px Sora'; x.fillText(String(it.day), L + dw + 26, 410);
    y = 490;
  }
  if ('letterSpacing' in x) x.letterSpacing = '3px';
  if (it.series) { x.fillStyle = '#9aa0ad'; x.font = '600 24px Sora'; cwWrap(x, it.series.toUpperCase(), S - 2 * L).slice(0, 2).forEach(l => { x.fillText(l, L, y); y += 34; }); y += 22; }
  if ('letterSpacing' in x) x.letterSpacing = '0px';
  x.fillStyle = '#eceef2'; x.font = '800 74px Sora';
  let tl = cwWrap(x, it.title, S - 2 * L); if (tl.length > 3) { x.font = '800 58px Sora'; tl = cwWrap(x, it.title, S - 2 * L).slice(0, 4); }
  const lh = parseInt(x.font.match(/(\d+)px/)[1], 10) * 1.1;
  tl.forEach(l => { y += lh; x.fillText(l, L, y - lh * .22); }); y += 20;
  if (it.subtitle) { x.fillStyle = '#f0cf8a'; x.font = '400 34px Inter'; cwWrap(x, it.subtitle, S - 2 * L).slice(0, 3).forEach(l => { y += 46; x.fillText(l, L, y); }); }
  x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 1; x.beginPath(); x.moveTo(L, 920); x.lineTo(S - L, 920); x.stroke();
  x.font = '400 24px Inter'; x.fillStyle = '#9aa0ad'; x.fillText('Baca lengkap di', L, 978); const bw = x.measureText('Baca lengkap di').width;
  x.fillStyle = '#d8b26a'; x.font = '700 26px Sora'; x.fillText('hub.concerto.id', L + bw + 10, 978);
  x.font = '500 23px Inter'; const pill = '🔒 Khusus partner CAI', pw = x.measureText(pill).width + 44;
  x.strokeStyle = 'rgba(216,178,106,.5)'; x.beginPath(); (x.roundRect ? x.roundRect(S - L - pw, 944, pw, 50, 25) : x.rect(S - L - pw, 944, pw, 50)); x.stroke();
  x.fillStyle = '#f0cf8a'; x.fillText(pill, S - L - pw + 22, 977);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
const cwImgName = it => `Concerto-Way-${it.day != null ? 'Day-' + it.day : 'CAI'}.png`;
const cwImgKey = it => [it.id, it.day, it.series, it.title, it.subtitle].join('|');
function cwPrepImage(it) {
  const k = cwImgKey(it); if (cwImgCache[it.id]?.k === k) return;
  cwImgCache[it.id] = { k, file: null };
  cwImage(it).then(b => { if (b && cwImgCache[it.id]?.k === k) cwImgCache[it.id].file = new File([b], cwImgName(it), { type: 'image/png' }); }).catch(() => {});
}
async function cwShare(id) {
  const it = cwItems?.find(x => x.id === id); if (!it) return;
  const text = `☕ *CONCERTO WAY${it.day != null ? ' — DAY ' + it.day : ''}*\n${it.series ? `_${it.series}_\n` : ''}\n*${it.title}*${it.subtitle ? '\n' + it.subtitle : ''}\n\nBaca lengkap di CAI Hub (khusus partner CAI, masuk dengan Kode Akses):\n${cwLink(it.id)}`;
  let file = cwImgCache[it.id]?.k === cwImgKey(it) ? cwImgCache[it.id].file : null;
  if (!file) try { const b = await cwImage(it); if (b) file = new File([b], cwImgName(it), { type: 'image/png' }); } catch (e) {}
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return; }
    catch (e) { if (e?.name === 'AbortError') return; }
  }
  if (file) { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  showToast(file ? 'Gambar diunduh — lampirkan di WhatsApp yang terbuka (teks & link sudah terisi).' : 'WhatsApp dibuka dengan teks & link.', 7000);
}

/* ── ⬇ Unduh PNG: materi lengkap sebagai satu gambar memanjang (lebar 1080 px, dibuat 2×) — 3 Nov 2026, permintaan pemilik ── */
async function cwPng(it) {
  try { await Promise.all(['800 60px Sora', '700 22px Sora', '600 30px Sora', '400 30px Inter', 'italic 400 30px Inter', '600 30px Inter'].map(f => document.fonts.load(f))); } catch (e) {}
  const logo = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = LOGO_WHITE; });
  const W = 1080, P = 84, CW = W - 2 * P, SC = 2;
  const blocks = cwParse(it.body).blocks;
  const clean = s => cwPlain(s).replace(/\s+/g, ' ').trim();
  const draw = (x, H) => {
    const ls = v => { if ('letterSpacing' in x) x.letterSpacing = v; };
    const lines = (text, font, maxW) => { x.font = font; return cwWrap(x, text, maxW); };
    const rr = (X, Y, w, h, r) => { x.beginPath(); x.roundRect ? x.roundRect(X, Y, w, h, r) : x.rect(X, Y, w, h); };
    if (H) {
      let g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#15120b'); g.addColorStop(.18, '#0b0c0f'); g.addColorStop(1, '#08090b');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      g = x.createRadialGradient(W * .9, 0, 0, W * .9, 0, 700); g.addColorStop(0, 'rgba(216,178,106,.28)'); g.addColorStop(1, 'rgba(216,178,106,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, 800);
      x.strokeStyle = 'rgba(216,178,106,.35)'; x.lineWidth = 2; rr(28, 28, W - 56, H - 56, 30); x.stroke();
    }
    let y = 84;
    if (H && logo) x.drawImage(logo, P, y, logo.width * 52 / logo.height, 52);
    if (H) { ls('6px'); x.font = '700 20px Sora'; x.fillStyle = '#d8b26a'; x.textAlign = 'right'; x.fillText('CONCERTO WAY', W - P, y + 34); x.textAlign = 'left'; ls('0px'); }
    y += 100;
    // kotak DAY + seri
    if (it.day != null) {
      if (H) { x.fillStyle = 'rgba(216,178,106,.10)'; rr(P, y, 150, 150, 26); x.fill(); x.strokeStyle = 'rgba(216,178,106,.6)'; x.lineWidth = 2; x.stroke();
        ls('5px'); x.font = '700 20px Sora'; x.fillStyle = '#d8b26a'; x.textAlign = 'center'; x.fillText('DAY', P + 78, y + 46); ls('0px');
        x.font = '800 80px Sora'; x.fillStyle = '#f0cf8a'; x.fillText(String(it.day), P + 75, y + 124); x.textAlign = 'left'; }
      y += 182;
    }
    if (it.series) { ls('3px'); lines(it.series.toUpperCase(), '600 22px Sora', CW).forEach(l => { y += 30; if (H) { x.fillStyle = '#9aa0ad'; x.fillText(l, P, y); } }); ls('0px'); y += 18; }
    lines(it.title, '800 56px Sora', CW).forEach(l => { y += 64; if (H) { x.fillStyle = '#ffffff'; x.font = '800 56px Sora'; x.fillText(l, P, y); } }); y += 8;
    if (it.subtitle) lines(it.subtitle, '400 30px Inter', CW).forEach(l => { y += 42; if (H) { x.fillStyle = '#f0cf8a'; x.font = '400 30px Inter'; x.fillText(l, P, y); } });
    y += 34; if (H) { x.fillStyle = '#d8b26a'; x.fillRect(P, y, 90, 4); } y += 40;
    // isi
    const para = (rows, font, color, lh, ind = 0) => rows.forEach(r => lines(clean(r), font, CW - ind).forEach(l => { y += lh; if (H) { x.font = font; x.fillStyle = color; x.fillText(l, P + ind, y); } }));
    blocks.forEach(b => {
      if (b.t === 'p') { para(b.v, '400 30px Inter', '#e6e8ec', 46); y += 26; }
      else if (b.t === 'close') { const y0 = y + 12; para(b.v, 'italic 400 30px Inter', '#d6d9df', 46, 28); if (H) { x.fillStyle = '#d8b26a'; x.fillRect(P, y0, 5, y - y0 + 14); } y += 30; }
      else if (b.t === 'src') { const y0 = y + 8; para([b.v], '400 22px Inter', '#9aa0ad', 34, 22); if (H) { x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(P, y0, 3, y - y0 + 12); } y += 32; }
      else if (b.t === 'stats') {
        const cols = Math.min(2, b.v.length), gap = 20, cw = (CW - gap * (cols - 1)) / cols;
        for (let r = 0; r < b.v.length; r += cols) {
          const row = b.v.slice(r, r + cols), hs = row.map(s => 90 + lines(clean(s.v), '400 24px Inter', cw - 48).length * 34 + 28), rh = Math.max(...hs);
          row.forEach((s, j) => { const X = P + j * (cw + gap);
            if (H) { x.fillStyle = 'rgba(255,255,255,.05)'; rr(X, y, cw, rh, 22); x.fill(); x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 2; x.stroke();
              x.font = '800 60px Sora'; x.fillStyle = '#d8b26a'; x.fillText(s.n, X + 24, y + 80);
              let yy = y + 90; lines(clean(s.v), '400 24px Inter', cw - 48).forEach(l => { yy += 34; x.font = '400 24px Inter'; x.fillStyle = '#d6d9df'; x.fillText(l, X + 24, yy); }); } });
          y += rh + gap;
        }
        y += 16;
      } else if (b.t === 'resume') {
        const ln = lines(clean(b.v), '600 32px Sora', CW - 64), h = 76 + ln.length * 46 + 28;
        if (H) { const g = x.createLinearGradient(P, y, P + CW, y + h); g.addColorStop(0, 'rgba(216,178,106,.20)'); g.addColorStop(1, 'rgba(216,178,106,.05)');
          x.fillStyle = g; rr(P, y, CW, h, 24); x.fill(); x.strokeStyle = 'rgba(216,178,106,.55)'; x.lineWidth = 2; x.stroke();
          ls('4px'); x.font = '700 20px Sora'; x.fillStyle = '#d8b26a'; x.fillText('📌 RESUME HARI INI', P + 32, y + 52); ls('0px');
          ln.forEach((l, k) => { x.font = '600 32px Sora'; x.fillStyle = '#ffffff'; x.fillText(l, P + 32, y + 76 + 38 + k * 46); }); }
        y += h + 34;
      } else if (b.t === 'task') {
        const items = b.v.map(t => lines(clean(t), '400 29px Inter', CW - 120)), h = 82 + items.reduce((a, l) => a + l.length * 42 + 30, 0) + 10;
        if (H) { x.fillStyle = 'rgba(255,255,255,.04)'; rr(P, y, CW, h, 24); x.fill(); x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 2; x.stroke();
          ls('4px'); x.font = '700 20px Sora'; x.fillStyle = '#d8b26a'; x.fillText('✅ TUGAS HARI INI', P + 32, y + 52); ls('0px');
          let yy = y + 82; items.forEach((ln, k) => {
            if (k) { x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(P + 32, yy - 4, CW - 64, 2); }
            x.strokeStyle = '#d8b26a'; x.lineWidth = 3; rr(P + 34, yy + 14, 30, 30, 7); x.stroke();
            ln.forEach((l, j) => { x.font = '400 29px Inter'; x.fillStyle = '#e6e8ec'; x.fillText(l, P + 88, yy + 40 + j * 42); });
            yy += ln.length * 42 + 30; }); }
        y += h + 34;
      }
    });
    // kaki
    y += 30; if (H) { x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(P, y, CW, 2); }
    y += 62;
    if (H) { x.font = '400 24px Inter'; x.fillStyle = '#9aa0ad'; x.fillText('Baca semua Concerto Way di', P, y); const bw = x.measureText('Baca semua Concerto Way di').width;
      x.font = '700 26px Sora'; x.fillStyle = '#d8b26a'; x.fillText('hub.concerto.id', P + bw + 10, y);
      x.font = '500 22px Inter'; x.fillStyle = '#f0cf8a'; x.textAlign = 'right'; x.fillText('🔒 Khusus partner CAI', W - P, y); x.textAlign = 'left'; }
    return y + 70;
  };
  const m = document.createElement('canvas').getContext('2d');
  const H = Math.ceil(Math.max(1350, draw(m, 0)));
  const c = document.createElement('canvas'); c.width = W * SC; c.height = H * SC;
  const x = c.getContext('2d'); x.scale(SC, SC); x.textBaseline = 'alphabetic'; draw(x, H);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
async function cwPngDownload(id, btn) {
  const it = cwItems?.find(x => x.id === id); if (!it) return;
  const t = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = '⏳ Membuat PNG…'; }
  try {
    const b = await cwPng(it); if (!b) throw new Error('gambar gagal dibuat');
    const a = document.createElement('a'); a.href = URL.createObjectURL(b);
    a.download = `Concerto-Way-${it.day != null ? 'Day-' + it.day + '-' : ''}${cwPlain(it.title).replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}.png`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showToast('✓ PNG diunduh');
  } catch (e) { showToast('⚠ Gagal membuat PNG: ' + (e?.message || e), 6000); }
  if (btn) { btn.disabled = false; btn.textContent = t; }
}
