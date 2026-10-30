/* CAI Hub (Concerto Audio Indonesia) — js/rundown.js
   Run Down Gathering (Admin & Editor).
   Dipisah dari index.html 30 Okt 2026 (tahap 3 pemecahan file). Semua file js/*.js adalah script klasik (bukan module):
   fungsi & const/let tingkat atas terbagi di satu lingkup global, URUTAN MUAT PENTING (lihat <script> di akhir index.html). */

/* ══════════════════════════════════════════
   RUN DOWN GATHERING 2026 — khusus Admin & Editor
   Tabel Supabase `gathering_rundown` (RLS: role admin/editor). Sesi dikelompokkan per tanggal & diurutkan per jam;
   sesi yang sedang berlangsung / berikutnya ditandai otomatis (waktu WIB).
══════════════════════════════════════════ */
const RUNDOWN_TABLE = 'gathering_rundown';
let rdItems = null, rdErr = '', rdEditId = null, rdTimer = null;

/* ── Pengunjung Portal (khusus Admin & Editor) ──
   Tiap browser diberi ID acak (localStorage VISIT_ID_KEY, tanpa data pribadi). Sekali per sesi tab dicatat lewat fungsi Postgres
   log_visit (SECURITY DEFINER, execute = anon & authenticated) ke tabel site_visits (1 baris per hari WIB per browser: jumlah kunjungan
   + tanda pernah login dealer). Angka dibaca lewat site_visit_stats (hanya role admin/editor). Akun Admin/Editor & layar videotron
   tidak dihitung. SQL: VISIT_SQL (tombol 📋 Salin SQL di menu Pengunjung Portal bila belum dijalankan). */
const VISIT_ID_KEY = 'cai-vid', VISIT_SES_KEY = 'cai-visit';
const VISIT_SQL = `create table if not exists public.site_visits (
  day date not null,
  vid text not null,
  visits int not null default 1,
  logged boolean not null default false,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (day, vid)
);
alter table public.site_visits enable row level security;

create or replace function public.log_visit(p_vid text, p_logged boolean default false, p_inc int default 1)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 then return; end if;
  insert into site_visits (day, vid, visits, logged)
  values ((now() at time zone 'Asia/Jakarta')::date, p_vid, 1, coalesce(p_logged, false))
  on conflict (day, vid) do update
    set visits = site_visits.visits + case when p_inc > 0 then 1 else 0 end,
        logged = site_visits.logged or coalesce(p_logged, false),
        last_at = now();
end $$;
grant execute on function public.log_visit(text, boolean, int) to anon, authenticated;

create or replace function public.site_visit_stats(p_days int default 30)
returns json language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jakarta')::date; n int := least(greatest(coalesce(p_days, 30), 1), 366);
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('admin', 'editor') then raise exception 'not allowed'; end if;
  return json_build_object(
    'today', today,
    'daily', (select coalesce(json_agg(d order by d.day), '[]'::json) from (
      select day, count(*) as visitors, sum(visits) as visits, count(*) filter (where logged) as logged
      from site_visits where day > today - n group by day) d),
    'v7', (select count(distinct vid) from site_visits where day > today - 7),
    'v30', (select count(distinct vid) from site_visits where day > today - 30),
    'total_visitors', (select count(distinct vid) from site_visits),
    'total_visits', (select coalesce(sum(visits), 0) from site_visits),
    'first_day', (select min(day) from site_visits));
end $$;
grant execute on function public.site_visit_stats(int) to authenticated;`;

function visitId() {
  try {
    let v = localStorage.getItem(VISIT_ID_KEY);
    if (!v || v.length < 8) { v = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); localStorage.setItem(VISIT_ID_KEY, v); }
    return v;
  } catch (e) { return null; }
}
// Dipanggil saat halaman dimuat dan tiap status login berubah: kunjungan dihitung sekali per sesi tab; login dealer di sesi yang sama hanya menandai "login".
let visitBusy = false;
async function visitLog() {
  if (!supabase || QA_SCREEN_MODE || visitBusy || isAdmin()) return;
  const vid = visitId(); if (!vid) return;
  const logged = !!authUser;
  let st = ''; try { st = sessionStorage.getItem(VISIT_SES_KEY) || ''; } catch (e) {}
  const day = todayWIB();
  const done = st.startsWith(day);
  if (done && (!logged || st.endsWith(':L'))) return;
  visitBusy = true;
  try {
    const { error } = await supabase.rpc('log_visit', { p_vid: vid, p_logged: logged, p_inc: done ? 0 : 1 });
    if (!error) try { sessionStorage.setItem(VISIT_SES_KEY, day + (logged ? ':L' : '')); } catch (e) {}
  } catch (e) {}
  visitBusy = false;
}

let visitStats = null, visitErr = '', visitDays = 30, visitAt = null;
const fmtNum = n => Number(n || 0).toLocaleString('id-ID');
function openVisitors() {
  if (!requireLogin(() => openVisitors())) return;
  if (!isAdmin()) { showToast('Menu Pengunjung Portal khusus akun Admin & Editor.'); return; }
  showView('visitors');
  document.querySelector('.main')?.scrollTo(0, 0);
  renderVisitors();
  loadVisitStats();
}
function setVisitDays(n) {
  visitDays = n;
  document.querySelectorAll('[data-vsdays]').forEach(b => b.classList.toggle('active', +b.dataset.vsdays === n));
  loadVisitStats();
}
async function loadVisitStats(quiet) {
  if (!supabase || !isAdmin()) return;
  try {
    const { data, error } = await supabase.rpc('site_visit_stats', { p_days: visitDays });
    if (error) throw error;
    visitStats = typeof data === 'string' ? JSON.parse(data) : data; visitErr = ''; visitAt = new Date();
  } catch (e) {
    const m = String(e.message || e);
    visitStats = null;
    visitErr = /function|does not exist|schema cache|404|relation/i.test(m) ? 'setup' : 'Data pengunjung tidak bisa dimuat: ' + m;
  }
  renderVisitStat();
  if (!quiet || document.getElementById('view-visitors')?.classList.contains('active')) { renderVisitors(); loadAcadViews().then(() => { if (document.getElementById('view-visitors')?.classList.contains('active')) renderVisitors(); }); }
}
function visitToday() {
  const d = visitStats?.daily?.find(x => x.day === visitStats.today);
  return { visitors: +(d?.visitors || 0), visits: +(d?.visits || 0), logged: +(d?.logged || 0) };
}
function renderVisitStat() {
  const el = document.getElementById('stat-visitors'), sub = document.getElementById('stat-visitors-sub');
  if (!el) return;
  if (!visitStats) { el.textContent = '—'; sub.textContent = visitErr === 'setup' ? 'belum diaktifkan — buka untuk setup' : 'khusus Admin & Editor'; return; }
  const t = visitToday();
  el.textContent = fmtNum(t.visitors);
  sub.textContent = `${fmtNum(t.visits)} kunjungan · 7 hari: ${fmtNum(visitStats.v7)} orang`;
}
function visitCopySql() { (navigator.clipboard?.writeText(VISIT_SQL) || Promise.reject()).then(() => showToast('✓ SQL disalin — tempel di Supabase → SQL Editor → Run.'), () => { prompt('Salin SQL ini:', VISIT_SQL); }); }
function renderVisitors() {
  const box = document.getElementById('vs-body'); if (!box) return;
  const sub = document.getElementById('vs-subtitle');
  if (sub) sub.textContent = 'Jumlah orang yang membuka portal — khusus Admin & Editor.' + (visitAt ? ` Diperbarui pukul ${visitAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}.` : '');
  if (visitErr === 'setup') {
    box.innerHTML = `<div class="vs-warn">Penghitung pengunjung belum diaktifkan. Jalankan SQL ini sekali di Supabase → SQL Editor → Run, lalu tekan ↻ Muat ulang. Kunjungan mulai dihitung setelah SQL dijalankan.<br><br><button class="gt-btn" onclick="visitCopySql()">📋 Salin SQL</button></div>`;
    return;
  }
  if (visitErr) { box.innerHTML = `<div class="vs-warn">${escHtml(visitErr)}</div>`; return; }
  if (!visitStats) { box.innerHTML = '<div class="vs-note">⏳ Memuat…</div>'; return; }
  const S = visitStats, t = visitToday();
  // Isi hari tanpa kunjungan dengan 0 agar grafik berurutan
  const map = new Map((S.daily || []).map(d => [d.day, d]));
  const days = [];
  const base = new Date(S.today + 'T00:00:00Z');
  for (let i = visitDays - 1; i >= 0; i--) {
    const k = new Date(base.getTime() - i * 864e5).toISOString().slice(0, 10);
    const d = map.get(k);
    days.push({ day: k, visitors: +(d?.visitors || 0), visits: +(d?.visits || 0), logged: +(d?.logged || 0) });
  }
  const max = Math.max(1, ...days.map(d => d.visitors));
  const sumV = days.reduce((a, d) => a + d.visits, 0);
  const fmtD = (k, o) => new Date(k + 'T00:00:00Z').toLocaleDateString('id-ID', Object.assign({ timeZone: 'UTC' }, o || { day: 'numeric', month: 'short' }));
  const bars = days.map(d => `<div class="vs-bar${d.day === S.today ? ' today' : ''}" title="${fmtD(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}: ${d.visitors} orang · ${d.visits} kunjungan · ${d.logged} login dealer">
      <div class="a" style="height:${(d.visitors - d.logged) / max * 100}%"></div><div class="d" style="height:${d.logged / max * 100}%"></div></div>`).join('');
  const rows = days.slice().reverse().filter(d => d.visits).map(d => `<tr><td>${fmtD(d.day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td><td>${fmtNum(d.visitors)}</td><td>${fmtNum(d.logged)}</td><td>${fmtNum(d.visits)}</td></tr>`).join('');
  box.innerHTML = `<div class="vs-cards">
      <div class="vs-card"><div class="vs-k">Hari ini</div><b>${fmtNum(t.visitors)}</b><div class="vs-sub">orang · ${fmtNum(t.visits)} kunjungan · ${fmtNum(t.logged)} login dealer</div></div>
      <div class="vs-card"><div class="vs-k">7 hari terakhir</div><b>${fmtNum(S.v7)}</b><div class="vs-sub">orang berbeda</div></div>
      <div class="vs-card"><div class="vs-k">30 hari terakhir</div><b>${fmtNum(S.v30)}</b><div class="vs-sub">orang berbeda</div></div>
      <div class="vs-card"><div class="vs-k">Total</div><b>${fmtNum(S.total_visitors)}</b><div class="vs-sub">orang · ${fmtNum(S.total_visits)} kunjungan${S.first_day ? ' sejak ' + fmtD(S.first_day, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</div></div>
    </div>
    <div class="vs-box"><h3>Pengunjung per hari · ${visitDays} hari terakhir</h3>
      <div class="vs-legend"><span><i style="background:var(--accent)"></i>Login dealer</span><span><i style="background:color-mix(in srgb, var(--accent) 45%, transparent)"></i>Pengunjung umum</span><span>${fmtNum(sumV)} kunjungan dalam periode ini</span></div>
      <div class="vs-chart">${bars}</div>
      <div class="vs-axis"><span>${fmtD(days[0].day)}</span><span>${fmtD(days[days.length - 1].day)}</span></div>
    </div>
    <div class="vs-box"><h3>Rincian harian</h3>
      ${rows ? `<table class="vs-table"><thead><tr><th>Tanggal</th><th>Orang</th><th>Login dealer</th><th>Kunjungan</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="vs-note">Belum ada kunjungan tercatat di periode ini.</div>'}
    </div>
    ${acadRecapHtml()}
    <div class="vs-note"><b>Orang</b> = browser/perangkat berbeda (satu orang yang membuka dari HP dan laptop terhitung 2; mode incognito / hapus data browser = orang baru). <b>Kunjungan</b> = berapa kali portal dibuka (sekali per tab). <b>Login dealer</b> = pengunjung yang masuk dengan Kode Akses hari itu. Akun Admin/Editor dan layar videotron tidak dihitung. Hari dihitung dalam WIB.</div>`;
}

function openRundown(tab) {
  if (!requireLogin(() => openRundown(tab))) return;
  if (!isAdmin()) { showToast('Menu Gathering 2026 khusus akun Admin & Editor.'); return; }
  showView('rundown');
  document.querySelector('.main')?.scrollTo(0, 0);
  setRdTab(tab === 'qa' ? 'qa' : 'rundown');
  renderRundown();
  loadRundown();
  clearInterval(rdTimer);
  rdTimer = setInterval(() => { if (document.getElementById('view-rundown')?.classList.contains('active')) renderRundown(); else clearInterval(rdTimer); }, 60000);
}

async function loadRundown() {
  if (!supabase || !isAdmin()) return;
  try {
    const { data, error } = await supabase.from(RUNDOWN_TABLE).select('*').order('day').order('start_time');
    if (error) throw error;
    rdItems = data || []; rdErr = '';
  } catch (e) {
    const m = String(e.message || e);
    rdItems = [];
    rdErr = /does not exist|relation|schema cache/i.test(m) ? 'Tabel run down belum dibuat. Jalankan SQL "gathering_rundown" di Supabase.' : 'Run down tidak bisa dimuat: ' + m;
  }
  renderRundown();
  loadScreenRow();
}

const rdT = t => (t || '').slice(0, 5);
const rdNowWIB = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
};
const fmtRdDay = d => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function renderRundown() {
  const el = document.getElementById('rd-list');
  if (!el) return;
  if (rdItems === null) { el.innerHTML = '<div class="stock-empty">Memuat…</div>'; return; }
  if (rdErr) { el.innerHTML = `<div class="stock-empty">${escHtml(rdErr)}</div>`; return; }
  const now = rdNowWIB();
  const items = [...rdItems].sort(rdCmp);
  // sesi berlangsung = hari ini & mulai ≤ sekarang < selesai (atau < mulai sesi berikutnya bila jam selesai kosong)
  const today = items.filter(x => x.day === now.day);
  const live = today.find((x, i) => { const end = rdT(x.end_time) || rdT(today[i + 1]?.start_time) || '23:59'; return rdT(x.start_time) <= now.time && now.time < end; });
  const next = items.find(x => (x.day > now.day || (x.day === now.day && rdT(x.start_time) > now.time)) && !x.done);
  const nowEl = document.getElementById('rd-now');
  nowEl.hidden = !(live || next);
  nowEl.innerHTML = [live ? `<div class="rd-chip live"><span>● Sedang berlangsung</span><b>${escHtml(live.title)}</b><small>${rdT(live.start_time)}${live.end_time ? '–' + rdT(live.end_time) : ''}${live.location ? ' · ' + escHtml(live.location) : ''}</small></div>` : '',
    next ? `<div class="rd-chip"><span>⏭ Berikutnya</span><b>${escHtml(next.title)}</b><small>${next.day !== now.day ? fmtRdDay(next.day) + ', ' : ''}${rdT(next.start_time)}${next.pic ? ' · PIC ' + escHtml(next.pic) : ''}</small></div>` : ''].join('');
  if (!items.length) { el.innerHTML = '<div class="stock-empty">Belum ada sesi. Klik <b>＋ Tambah Sesi</b> untuk mulai menyusun run down.</div>'; return; }
  const days = [...new Set(items.map(x => x.day))];
  el.innerHTML = days.map((d, n) => {
    const rows = items.filter(x => x.day === d);
    const done = rows.filter(x => x.done).length;
    return `<div class="rd-day">
      <div class="line-header"><span class="line-name">Hari ${n + 1} · ${fmtRdDay(d)}</span><span class="line-count">${rows.length}</span><span class="gt-sub">${done}/${rows.length} selesai</span></div>
      <div class="rd-table">${rows.map((x, i) => `${x.segment && x.segment !== rows[i - 1]?.segment ? `<div class="rd-seg">◆ ${escHtml(x.segment)}<span>${rows.filter(r => r.segment === x.segment).length} sesi</span></div>` : ''}
        <div class="rd-row${x.done ? ' done' : ''}${live && live.id === x.id ? ' live' : ''}${x.segment ? ' in-seg' : ''}">
          <label class="rd-check" title="Tandai selesai"><input type="checkbox"${x.done ? ' checked' : ''} onchange="toggleRdDone(${x.id}, this.checked)"></label>
          <div class="rd-time">${x.flexible ? '± ' : ''}${rdT(x.start_time)}${x.end_time ? `<small>– ${rdT(x.end_time)}</small>` : ''}${x.flexible ? '<small class="rd-flex">menyesuaikan</small>' : ''}</div>
          <div class="rd-main"><div class="rd-title">${escHtml(x.title)}${live && live.id === x.id ? ' <span class="rd-live-tag">LIVE</span>' : ''}</div>
            <div class="rd-meta">${[x.pic ? '👤 ' + escHtml(x.pic) : '', x.location ? '📍 ' + escHtml(x.location) : ''].filter(Boolean).join('  ·  ')}</div>
            ${x.notes ? `<div class="rd-notes">${escHtml(x.notes)}</div>` : ''}</div>
          <div class="rd-btns">${QA_SESSION_RE.test(x.title) ? `<button class="gt-btn ghost" onclick="setScene(null); setRdTab('qa')" title="Buka ${QA_NAME}">🎤 Open Mic</button>` : ''}${sceneForTitle(x.title) ? `<button class="gt-btn ghost${scrRow?.scene === sceneForTitle(x.title) ? ' scr-on' : ''}" onclick="setScene('${sceneForTitle(x.title)}')" title="Tampilkan desain sesi ini di videotron">🖥 Layar</button>` : ''}<button class="gt-btn ghost" onclick="openRdForm(${x.id})" title="Edit">✏️</button><button class="gt-btn ghost gt-del" onclick="deleteRdItem(${x.id})" title="Hapus">🗑</button></div>
        </div>`).join('')}</div></div>`;
  }).join('');
}

function openRdForm(id) {
  const x = id ? rdItems?.find(r => r.id === id) : null;
  rdEditId = x ? x.id : null;
  const last = rdItems?.length ? [...rdItems].sort((a, b) => (b.day + rdT(b.start_time)).localeCompare(a.day + rdT(a.start_time)))[0] : null;
  document.getElementById('rd-form-title').textContent = x ? 'Edit sesi' : 'Tambah sesi';
  document.getElementById('rd-day').value = x?.day || last?.day || rdNowWIB().day;
  document.getElementById('rd-start').value = rdT(x?.start_time) || rdT(last?.end_time) || '';
  document.getElementById('rd-end').value = rdT(x?.end_time);
  ['title', 'pic', 'location', 'notes'].forEach(k => { document.getElementById('rd-' + k).value = x?.[k] || ''; });
  document.getElementById('rd-segment').value = x ? (x.segment || '') : (last?.segment || '');
  document.getElementById('rd-flexible').checked = !!x?.flexible;
  document.getElementById('rd-segment-list').innerHTML = [...new Set((rdItems || []).map(r => r.segment).filter(Boolean).concat(SEG_PAGI, SEG_MALAM))].map(n => `<option value="${escHtml(n)}">`).join('');
  const f = document.getElementById('rd-form'); f.hidden = false;
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('rd-title').focus();
}
function closeRdForm() { document.getElementById('rd-form').hidden = true; rdEditId = null; }

async function saveRdItem() {
  const v = k => document.getElementById('rd-' + k).value.trim();
  const row = { day: v('day'), start_time: v('start'), end_time: v('end') || null, title: v('title'), pic: v('pic') || null, location: v('location') || null, notes: v('notes') || null,
    segment: v('segment') || null, flexible: document.getElementById('rd-flexible').checked, updated_at: new Date().toISOString() };
  if (!row.day || !row.start_time || !row.title) { showToast('Isi tanggal, jam mulai, dan nama acara.'); return; }
  if (row.end_time && row.end_time <= row.start_time) { showToast('Jam selesai harus setelah jam mulai.'); return; }
  const btn = document.getElementById('rd-save'); btn.disabled = true;
  try {
    const q = rdEditId ? supabase.from(RUNDOWN_TABLE).update(row).eq('id', rdEditId) : supabase.from(RUNDOWN_TABLE).insert(row);
    const { error } = await q;
    if (error) throw error;
    showToast(rdEditId ? '✓ Sesi diperbarui.' : '✓ Sesi ditambahkan.');
    closeRdForm(); loadRundown();
  } catch (e) { showToast('Gagal menyimpan: ' + rdColHint(e), 9000); }
  finally { btn.disabled = false; }
}
const rdColHint = e => { const m = String(e?.message || e); return /segment|flexible/.test(m) ? m + ' — jalankan SQL kolom segment & flexible.' : m; };

// Template susunan sesi "Listening and Understanding Partner" (jam ± = waktu menyesuaikan, bisa diubah lewat ✏️)
// Nama sesi tanya-jawab dealer (dulu "Tanya Jawab Partner"); QA_SHORT dipakai di menu/tab/kartu yang sempit.
const QA_NAME = 'Open Mic Partner: Curhat Bebas', QA_SHORT = 'Open Mic Partner';
// Susunan acara Gathering CAI 2026 (revisi pemilik 22 Okt 2026): Acara Pagi 08:30–16:00 + Acara Malam mulai 18:00 (Coffee Break 2 → Opening Speech → Dinner 19:00 → Awarding).
// Jam bertanda flexible = estimasi (tampil ± dan "menyesuaikan"). Acara malam selain Opening Speech: jam perkiraan, ubah di form.
const SEG_PAGI = 'Acara Pagi', SEG_MALAM = 'Acara Malam';
const GATHERING_DAY = '2026-10-28';   // tanggal acara Gathering CAI 2026 (Rabu, 28 Okt) — tanggal bawaan template Run Down
const RD_TEMPLATE = [
  { title: 'Partner Masuk Ballroom', start_time: '08:00', end_time: '08:30', segment: SEG_PAGI, flexible: true, notes: 'Partner & distributor masuk ballroom · videotron: backdrop "Tidak Ada Zona Nyaman" (berulang, dengan suara).' },
  { title: 'Menyanyikan Lagu Kebangsaan Indonesia Raya', start_time: '08:30', end_time: '08:35', segment: SEG_PAGI, notes: 'Hadirin dimohon berdiri · video Indonesia Raya di videotron.' },
  { title: 'Meeting Dealer (Tanya Jawab Partner CAI)', start_time: '08:35', end_time: '10:40', segment: SEG_PAGI, notes: 'Pertanyaan dealer diketik admin/editor & tampil di videotron.' },
  { title: 'Coffee Break 1', start_time: '10:40', end_time: '11:00', segment: SEG_PAGI, notes: '20 menit' },
  { title: 'Product Launch', start_time: '11:00', end_time: '11:30', segment: SEG_PAGI, notes: 'Brand Audiocircle, STEG & Audio System. Audiocircle: Köln Series · IQ-LES10A. STEG: SEC650C · K Series 136 · DSP S12 · DSP S6. Audio System: AY65C · AY65 · AS500.1 · AS10 · DSP AS6.' },
  { title: 'Perkenalan Caelum', start_time: '11:30', end_time: '12:00', segment: SEG_PAGI, notes: 'Muncul video Caelum (brand baru Power Amplifier) di videotron.' },
  { title: 'Presentasi Fun Marketing (Opsional)', start_time: '12:00', end_time: '12:30', segment: SEG_PAGI, flexible: true, notes: 'Opsional · 30 menit, menyesuaikan waktu. ISHOMA tetap dimulai 12:00.' },
  { title: 'ISHOMA (Istirahat, Sholat, Makan Siang)', start_time: '12:00', end_time: '13:00', segment: SEG_PAGI, notes: 'Lunch · 1 jam' },
  { title: 'Kick Off 2027 & PKS', start_time: '13:00', end_time: '16:00', segment: SEG_PAGI, notes: 'Membahas Portal Dealer CAI (dealer.concerto.id) & PKS Dealer 2027. Penutup acara pagi, selesai 16:00.' },
  { title: 'Coffee Break 2', start_time: '18:00', end_time: '18:20', segment: SEG_MALAM, notes: '20 menit · sebelum acara malam dimulai.' },
  { title: 'Opening Speech', start_time: '18:20', end_time: '19:00', segment: SEG_MALAM, notes: 'Brand partner: Audiocircle → STEG → Zelos → Harrison Lab → Amo Plus → Sound Addict.' },
  { title: 'Makan Malam (Dinner)', start_time: '19:00', end_time: '20:00', segment: SEG_MALAM },
  { title: 'Awarding', start_time: '20:00', segment: SEG_MALAM, flexible: true, notes: 'Puncak acara: Best Distributor & Best Dealer (peringkat 10 besar).' },
  { title: 'Healthy Drink', start_time: '21:00', segment: SEG_MALAM, flexible: true, notes: 'Penutup acara.' },
];
// urutan Run Down: tanggal → jam mulai → jam selesai (sesi yang lebih pendek dulu bila mulai bersamaan, mis. Fun Marketing opsional sebelum ISHOMA)
const rdCmp = (a, b) => (a.day + rdT(a.start_time)).localeCompare(b.day + rdT(b.start_time)) || (rdT(a.end_time) || '99').localeCompare(rdT(b.end_time) || '99');
async function addRdTemplate() {
  const def = GATHERING_DAY;
  const day = (prompt('Tanggal acara untuk template Acara Pagi + Malam (format TTTT-BB-HH):', def) || '').trim();
  if (!day) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(new Date(day + 'T00:00:00'))) { showToast('Format tanggal salah, contoh: ' + GATHERING_DAY); return; }
  // Coffee Break ada 2x (pagi & sebelum acara malam) — keduanya scene 'coffee', dibedakan angka/“kedua” di judul
  const rdKey = t => (sceneForTitle(t) || (QA_SESSION_RE.test(t) ? 'qa' : String(t).toLowerCase())) + (/\b2\b|kedua|\bii\b/i.test(t) && /coffee/i.test(t) ? '#2' : '');
  const have = new Set((rdItems || []).filter(r => r.day === day).map(r => rdKey(r.title)));
  const now = new Date().toISOString();
  const rows = RD_TEMPLATE.filter(t => !have.has(rdKey(t.title)))
    .map(t => ({ day, end_time: null, notes: null, flexible: false, ...t, updated_at: now }));
  if (!rows.length) { showToast('Semua sesi template sudah ada di tanggal itu.'); return; }
  const { error } = await supabase.from(RUNDOWN_TABLE).insert(rows);
  if (error) { showToast('Gagal menambah template: ' + rdColHint(error), 9000); return; }
  showToast(`✓ ${rows.length} sesi acara ditambahkan.`);
  loadRundown();
}

// Ganti seluruh sesi di satu tanggal dengan RD_TEMPLATE terbaru (sesi lama yang tidak ada di template ikut terhapus; centang selesai dipertahankan)
async function resetRdTemplate() {
  const day = (prompt('Samakan Run Down tanggal berapa dengan rencana terbaru? (TTTT-BB-HH)', GATHERING_DAY) || '').trim();
  if (!day) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(new Date(day + 'T00:00:00'))) { showToast('Format tanggal salah, contoh: ' + GATHERING_DAY); return; }
  const old = (rdItems || []).filter(r => r.day === day);
  if (!confirm(`Semua ${old.length} sesi di ${day} akan diganti dengan ${RD_TEMPLATE.length} sesi rencana terbaru:\n\n${RD_TEMPLATE.map(t => `${t.flexible ? '± ' : ''}${t.start_time}  ${t.title}`).join('\n')}\n\nLanjutkan?`)) return;
  const rdKey = t => (sceneForTitle(t) || (QA_SESSION_RE.test(t) ? 'qa' : String(t).toLowerCase())) + (/\b2\b|kedua|\bii\b/i.test(t) && /coffee/i.test(t) ? '#2' : '');
  const done = new Set(old.filter(r => r.done).map(r => rdKey(r.title)));
  const now = new Date().toISOString();
  const rows = RD_TEMPLATE.map(t => ({ day, end_time: null, notes: null, flexible: false, ...t, done: done.has(rdKey(t.title)), updated_at: now }));
  if (old.length) {
    const { error } = await supabase.from(RUNDOWN_TABLE).delete().in('id', old.map(r => r.id));
    if (error) { showToast('Gagal menghapus sesi lama: ' + error.message, 9000); return; }
  }
  const { error } = await supabase.from(RUNDOWN_TABLE).insert(rows);
  if (error) { showToast('Gagal menyimpan rencana terbaru: ' + rdColHint(error), 9000); loadRundown(); return; }
  showToast(`✓ Run Down ${day} disamakan dengan rencana terbaru (${rows.length} sesi).`);
  loadRundown();
}

async function toggleRdDone(id, done) {
  const x = rdItems?.find(r => r.id === id); if (!x) return;
  x.done = done; renderRundown();
  const { error } = await supabase.from(RUNDOWN_TABLE).update({ done, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { x.done = !done; renderRundown(); showToast('Gagal mengubah status: ' + error.message, 8000); }
}

async function deleteRdItem(id) {
  const x = rdItems?.find(r => r.id === id);
  if (!x || !confirm(`Hapus sesi "${x.title}" (${rdT(x.start_time)})?`)) return;
  const { error } = await supabase.from(RUNDOWN_TABLE).delete().eq('id', id);
  if (error) { showToast('Gagal menghapus: ' + error.message, 8000); return; }
  rdItems = rdItems.filter(r => r.id !== id); renderRundown(); showToast('Sesi dihapus.');
}

function printRundown() {
  if (!rdItems?.length) { showToast('Belum ada sesi untuk dicetak.'); return; }
  let el = document.getElementById('gt-print');
  if (!el) { el = document.createElement('div'); el.id = 'gt-print'; document.body.appendChild(el); }
  const items = [...rdItems].sort(rdCmp);
  const days = [...new Set(items.map(x => x.day))];
  const hasPic = items.some(x => x.pic), hasLoc = items.some(x => x.location);   // kolom kosong tidak dicetak
  const cols = [['Waktu', 17], ['Acara / Sesi', 30], ...(hasPic ? [['PIC', 14]] : []), ...(hasLoc ? [['Lokasi', 14]] : []), ['Catatan', 0]];
  const fixed = cols.reduce((n, c) => n + c[1], 0); cols[cols.length - 1][1] = 100 - fixed;
  const timeTxt = x => `${x.flexible ? '± ' : ''}${rdT(x.start_time)}${x.end_time ? '–' + rdT(x.end_time) : ''}${x.flexible ? '<small>menyesuaikan</small>' : ''}`;
  const row = x => `<tr><td class="rd-t">${timeTxt(x)}</td><td class="rd-n">${escHtml(x.title)}</td>${hasPic ? `<td>${escHtml(x.pic || '')}</td>` : ''}${hasLoc ? `<td>${escHtml(x.location || '')}</td>` : ''}<td>${escHtml(x.notes || '')}</td></tr>`;
  const printed = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long', timeStyle: 'short' });
  el.innerHTML = `<div class="rd-wrap"><div class="gp-head"><img src="${LOGO_NAVY}" alt="CAI"><div><h1>RUN DOWN ACARA</h1><p>GATHERING CAI 2026 · Concerto Audio Indonesia</p></div></div>
    ${days.map((d, n) => `<h2>Hari ${n + 1} — ${fmtRdDay(d)}</h2>
      <table class="gp-items rd-print"><colgroup>${cols.map(c => `<col style="width:${c[1]}%">`).join('')}</colgroup><thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>
      ${items.filter(x => x.day === d).map((x, i, a) => `${x.segment && x.segment !== a[i - 1]?.segment ? `<tr class="gp-seg"><td colspan="${cols.length}">◆ ${escHtml(x.segment)}</td></tr>` : ''}${row(x)}`).join('')}
      </tbody></table>`).join('')}
    <p class="rd-foot">Dicetak ${printed} WIB · dealer.concerto.id</p></div>`;
  const prevTitle = document.title;
  document.title = 'Run Down Gathering CAI 2026';   // nama file PDF bawaan
  window.addEventListener('afterprint', () => { document.title = prevTitle; }, { once: true });
  window.print();
}
