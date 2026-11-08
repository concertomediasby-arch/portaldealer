/* ═══════════ 📅 KALENDER ACARA CAI (4 Nov 2026, permintaan pemilik — pratinjau .mockup/acara/ disetujui) ═══════════
   Menu publik "Kalender Acara": kompetisi · gathering · workshop/training · launching · acara partner.
   Data di tabel Supabase cai_events (SQL: supabase/events.sql = EV_SQL; RLS: publik membaca acara tayang & public,
   partner yang login juga membaca acara 🔒 khusus partner, Editor menulis). Poster di Storage publik showcase/events/.
   🔔 "Ingatkan saya" = pengingat H-1 lewat notifikasi HP (Edge Function cway-push: aksi ev_watch/ev_watches, tabel event_watch),
   📅 "Tambah ke kalender HP" = file .ics, Bagikan = teks + link (/e/<id>/ kartu WA bila sudah dibuat bot GitHub, selain itu /?acara=<id>).
   Notifikasi "Acara baru" (pilihan 📅 di Setting, kolom cway_push_subs.event) dikirim saat acara pertama tayang (pushNotify('event')). */
const EV_TABLE = 'cai_events';
const EV_SQL = `-- 📅 Kalender Acara CAI (4 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run (aman dijalankan ulang)
-- Acara: kompetisi · gathering · workshop/training · launching · acara partner. Publik membaca acara yang tayang & \`public\`;
-- partner yang login juga membaca acara 🔒 khusus partner (public = false); Editor membaca & menulis semua (termasuk draf).
create table if not exists public.cai_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'kompetisi',   -- kompetisi | gathering | workshop | launching | partner
  start_at timestamptz not null,
  end_at timestamptz,
  online boolean not null default false,
  city text,
  venue text,
  map_url text,
  partners text[] not null default '{}',    -- nama Authorized Partner terkait
  poster text,                               -- path Storage publik showcase/events/…
  body text,
  link_url text,
  link_label text,
  hof_event text,                            -- nama event di HALL_OF_FAME (arsip kompetisi → hasil di Hall of Fame)
  public boolean not null default true,      -- false = 🔒 khusus partner yang login
  published boolean not null default true,   -- false = draf (hanya Editor)
  notify boolean not null default true,      -- kirim notifikasi "Acara baru" saat pertama tayang
  push_at timestamptz,                       -- notifikasi "Acara baru" sudah dikirim
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists cai_events_start on public.cai_events (start_at);
alter table public.cai_events enable row level security;
drop policy if exists "events read public" on public.cai_events;
create policy "events read public" on public.cai_events for select to anon using (published and public);
drop policy if exists "events read login" on public.cai_events;
create policy "events read login" on public.cai_events for select to authenticated
  using (published or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
drop policy if exists "events write" on public.cai_events;
create policy "events write" on public.cai_events for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
grant select on public.cai_events to anon;
grant select, insert, update, delete on public.cai_events to authenticated;

-- 🔔 "Ingatkan saya": per HP (endpoint langganan notifikasi), hanya lewat Edge Function cway-push (RLS tanpa policy)
create table if not exists public.event_watch (
  endpoint text not null,
  event_id uuid not null references public.cai_events (id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at timestamptz,                       -- pengingat H-1 sudah dikirim
  primary key (endpoint, event_id)
);
alter table public.event_watch enable row level security;

-- 📅 pilihan notifikasi "Acara & kompetisi baru" (bawaan aktif, juga untuk HP yang sudah berlangganan)
alter table public.cway_push_subs add column if not exists event boolean not null default true;`;
const EV_KINDS = {
  kompetisi: ['🏆', 'Kompetisi', 'k'], gathering: ['🤝', 'Gathering', 'g'], workshop: ['🎓', 'Workshop / Training', 'w'],
  launching: ['🚀', 'Launching', 'l'], partner: ['🏪', 'Acara Partner', 'p'],
};
const EV_DASH_DAYS = 30;
let evItems = null, evMissing = false, evErr = '', evLoading = null, evPending = null;
let evDetailId = null, evTab = 'next', evKind = '', evQ = '', evDay = '', evMonth = null, evForm = null, evWatch = null, evWatchBusy = false;

const evKind_ = e => EV_KINDS[e.kind] || EV_KINDS.kompetisi;
const evStart = e => Date.parse(e.start_at);
const evEnd = e => e.end_at ? Date.parse(e.end_at) : evStart(e) + 6 * 3600e3;
const evPast = e => evEnd(e) < Date.now();
const evWib = (iso, o) => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', ...o });
const evYmd = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const evHm = iso => evWib(iso, { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');
const evShown = () => (evItems || []).filter(e => e.published || isEditor());
const evUpcoming = () => evShown().filter(e => !evPast(e)).sort((a, b) => evStart(a) - evStart(b));
const evArchive = () => evShown().filter(evPast).sort((a, b) => evStart(b) - evStart(a));
const evPlace = e => e.online ? 'Online' : [e.venue, e.city].filter(Boolean).join(' · ');
const evMaps = e => e.map_url || (e.online ? '' : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.venue, e.city].filter(Boolean).join(', '))}`);
// Posisi sampul (5 Nov 2026, permintaan pemilik): disimpan di kolom `poster` yang sama sebagai akhiran —
// "events/1.webp#x,y,z" = isi bingkai (titik fokus x/y %, zoom z), "events/1.webp#fit" = tampilkan utuh (latar buram), tanpa akhiran = otomatis.
const evPosterPath = v => String(v || '').split('#')[0];
function evPosterFr(v) {
  const m = String(v || '').split('#')[1] || '';
  if (m === 'fit') return { mode: 'fit', x: 50, y: 50, z: 1 };
  const [x, y, z] = m ? m.split(',').map(Number) : [];
  return m ? { mode: 'cover', x: isFinite(x) ? x : 50, y: isFinite(y) ? y : 50, z: isFinite(z) && z >= 1 ? z : 1 } : { mode: 'auto', x: 50, y: 50, z: 1 };
}
const evFrSuffix = f => !f || f.mode === 'auto' ? '' : f.mode === 'fit' ? '#fit' : `#${f.x},${f.y},${f.z}`;
const evFrCss = f => `object-position:${f.x}% ${f.y}%;transform-origin:${f.x}% ${f.y}%;scale:${f.z}`;
// big = bingkai lebar (detail/headline): mode otomatis di sana = tampilkan utuh, di kartu kecil = isi bingkai
function evImgHtml(url, fr, big) {
  const fit = fr.mode === 'fit' || (fr.mode === 'auto' && big);
  return fit ? `<img class="ev-fbg" src="${escHtml(url)}" alt="" aria-hidden="true" draggable="false"><img class="ev-ffg" src="${escHtml(url)}" alt="" loading="lazy" draggable="false">`
    : `<img src="${escHtml(url)}" alt="" loading="lazy" draggable="false"${fr.mode === 'cover' ? ` style="${evFrCss(fr)}"` : ''}>`;
}
const evPoster = e => { const p = evPosterPath(e.poster); return p ? (/^https?:/i.test(p) ? p : dashPublicUrl(p)) : ''; };
const evLink = id => liveLink('e', id) || `${PORTAL_URL}/?acara=${encodeURIComponent(id)}`;
function evRange(e) {
  const s = e.start_at, en = e.end_at, sd = evYmd(s), ed = en ? evYmd(en) : sd;
  const wd = iso => evWib(iso, { weekday: 'short' }), dm = iso => evWib(iso, { day: 'numeric' });
  const my = iso => evWib(iso, { month: 'short', year: 'numeric' });
  if (sd === ed) return `${wd(s)}, ${dm(s)} ${my(s)} · ${evHm(s)}${en ? '–' + evHm(en) : ''} WIB`;
  const sameM = sd.slice(0, 7) === ed.slice(0, 7);
  return `${wd(s)}–${wd(en)}, ${dm(s)}${sameM ? '' : ' ' + evWib(s, { month: 'short' })}–${dm(en)} ${my(en)} · ${evHm(s)} WIB`;
}
function evCountdown(e) {
  const now = Date.now();
  if (evStart(e) <= now && now <= evEnd(e)) return '<span class="ev-cd live">● Sedang berlangsung</span>';
  if (evPast(e)) return '';
  const days = Math.round((Date.parse(evYmd(e.start_at)) - Date.parse(todayWIB())) / 864e5);
  return `<span class="ev-cd">⏳ ${days <= 0 ? 'Hari ini · ' + evHm(e.start_at) + ' WIB' : days === 1 ? 'Besok' : days + ' hari lagi'}</span>`;
}
function evPosterHtml(e, big) {
  const p = evPoster(e), k = evKind_(e);
  if (p) return `<div class="ev-pst${big ? ' big' : ''}">${evImgHtml(p, evPosterFr(e.poster), big)}</div>`;
  const words = e.title.split(/\s+/), cut = Math.ceil(words.length / 2);
  return `<div class="ev-pst ph k-${k[2]}${big ? ' big' : ''}"><b>${escHtml(words.slice(0, cut).join(' '))}</b><span>${escHtml(words.slice(cut).join(' '))}</span></div>`;
}
const evTag = e => { const k = evKind_(e); return `<span class="ev-tg k-${k[2]}">${k[0]} ${k[1]}</span>${e.public === false ? '<span class="ev-tg lock">🔒 Khusus partner</span>' : ''}${!e.published ? '<span class="ev-tg draft">DRAF</span>' : ''}`; };
const evHofCount = e => e.hof_event && typeof HALL_OF_FAME !== 'undefined' ? HALL_OF_FAME.filter(x => x.event === e.hof_event).length : 0;

async function loadEvents(force) {
  if (typeof supabase === 'undefined' || !supabase) return;
  if (evLoading && !force) return evLoading;
  evLoading = (async () => {
    try {
      await mediaP;
      const { data, error } = await supabase.from(EV_TABLE).select('*').order('start_at');
      if (error) throw error;
      evItems = data || []; evMissing = false; evErr = '';
    } catch (e) {
      const m = e?.message || String(e);
      evMissing = /does not exist|schema cache|42P01|PGRST205/i.test(m + ' ' + (e?.code || ''));
      evErr = m; evItems = [];
    }
    evLoading = null;
    evDashRender();
    if (typeof hlRender === 'function') hlRender();   // 📅 Acara di headline Dashboard
    if (document.getElementById('view-events')?.classList.contains('active')) renderEvents();
    if (evPending && evOn()) { const id = evPending; evPending = null; openEvents(id); }
  })();
  return evLoading;
}
/* ⛔ Kalender Acara khusus Editor (6 Nov 2026, permintaan pemilik): pengunjung, partner & Admin staff tidak melihat menu,
   slide 📅 Acara di headline Dashboard, hasil pencarian, pilihan notifikasi 📅, dan notifikasi "Acara baru" tidak dikirim.
   Tampilkan lagi untuk semua: EV_ON_ALL = true + hapus class editor-only dari nav-events/mnav-events (index.html). */
const EV_ON_ALL = false;
function evOn() { return EV_ON_ALL || (typeof isEditor === 'function' && isEditor()); }
function eventsAuthChanged() {
  if (typeof supabase !== 'undefined' && supabase) loadEvents(true); evWatch = null;
  if (!evOn() && document.getElementById('view-events')?.classList.contains('active')) showView('dashboard');
  if (evOn() && evPending) { const id = evPending; evPending = null; evOpenLinked(id); }
  if (typeof hlRender === 'function') hlRender();
}

/* ── View Kalender Acara ── */
function openEvents(id) {
  if (!evOn()) { showView('dashboard'); return; }
  showView('events');
  document.getElementById('nav-events')?.classList.add('active');
  document.getElementById('mnav-events')?.classList.add('active');
  window.scrollTo(0, 0); document.querySelector('.main')?.scrollTo?.(0, 0);
  renderEvents();
  if (!evItems) loadEvents();
  evLoadWatch();
  if (id && id !== '1') {
    const e = evItems?.find(x => x.id === id);
    if (e) openEvDetail(id);
    else if (!evItems) evPending = id;
    else showToast('Acara tidak ditemukan — mungkin khusus partner (masuk dengan Kode Akses) atau sudah dihapus.', 6000);
  }
}
function evOpenLinked(id) { if (!evOn()) { evPending = id || '1'; return; } if (!evItems) { evPending = id || '1'; openEvents(); } else openEvents(id); }
function setEvTab(t) { evTab = t; evDay = ''; renderEvents(); }
function setEvKind(k) { evKind = k; renderEvents(); }
function evSearch(v) { evQ = v; renderEvents(true); }
function evPickDay(d) { evDay = evDay === d ? '' : d; if (evDay) evTab = Date.parse(d + 'T23:59:59+07:00') < Date.now() ? 'arc' : 'next'; renderEvents(); }
function evMonthStep(d) { const [y, m] = evMonth.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + d, 1)); evMonth = t.toISOString().slice(0, 7); renderEvents(); }
function renderEvents(keepFocus) {
  const el = document.getElementById('events-body'); if (!el) return;
  if (!evItems) { el.innerHTML = '<div class="stock-empty">Memuat acara…</div>'; return; }
  if (evMissing) {
    el.innerHTML = isEditor() ? `<div class="vs-warn">Kalender Acara belum diaktifkan. Jalankan SQL ini sekali di Supabase → SQL Editor → Run, lalu muat ulang portal.<br><br><button class="gt-btn" onclick="evCopySql()">📋 Salin SQL Kalender Acara</button></div>`
      : '<div class="stock-empty">📅 Kalender Acara segera hadir.</div>';
    return;
  }
  const up = evUpcoming(), arc = evArchive();
  if (!evMonth) evMonth = (up[0] ? evYmd(up[0].start_at) : todayWIB()).slice(0, 7);
  const q = evQ.trim().toLowerCase();
  const match = e => (!evKind || e.kind === evKind) && (!q || [e.title, e.city, e.venue, (e.partners || []).join(' '), evKind_(e)[1]].join(' ').toLowerCase().includes(q))
    && (!evDay || (evYmd(e.start_at) <= evDay && evYmd(e.end_at || e.start_at) >= evDay));
  const list = (evTab === 'arc' ? arc : up).filter(match);
  const kinds = Object.entries(EV_KINDS).filter(([k]) => evShown().some(e => e.kind === k));
  const tools = `<div class="ev-tools"><input type="search" id="ev-q" class="ev-srch" placeholder="Cari acara, kota, partner…" value="${escHtml(evQ)}" oninput="evSearch(this.value)" autocomplete="off">
      <div class="chips-row ev-chips"><button class="filter-chip${!evKind ? ' active' : ''}" onclick="setEvKind('')">Semua</button>${kinds.map(([k, v]) => `<button class="filter-chip${evKind === k ? ' active' : ''}" onclick="setEvKind('${k}')">${v[0]} ${escHtml(v[1].split(' /')[0])}</button>`).join('')}</div>
      <div class="ev-tabs"><button class="${evTab === 'next' ? 'on' : ''}" onclick="setEvTab('next')">Akan datang · ${up.length}</button><button class="${evTab === 'arc' ? 'on' : ''}" onclick="setEvTab('arc')">Arsip · ${arc.length}</button></div>
      ${isEditor() ? '<button class="gt-btn ev-add" onclick="openEvForm()">＋ Tambah Acara</button>' : ''}</div>
    ${evDay ? `<div class="ev-dayf">Acara pada <b>${escHtml(evWib(evDay + 'T12:00:00+07:00', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</b> <button onclick="evPickDay('${evDay}')">✕ semua tanggal</button></div>` : ''}`;
  let body = '';
  if (!list.length) body = `<div class="stock-empty">${evTab === 'arc' ? 'Belum ada acara di arsip.' : (q || evKind || evDay) ? 'Tidak ada acara yang cocok.' : 'Belum ada acara terjadwal — pantau terus, atau aktifkan notifikasi 📅 Acara di menu Setting.'}</div>`;
  else {
    let mon = '';
    for (const e of list) {
      const m = evWib(e.start_at, { month: 'long', year: 'numeric' });
      if (m !== mon) { body += `<div class="ev-mon">${escHtml(m)}</div>`; mon = m; }
      body += evCardHtml(e, evTab === 'next' && e === up[0]);
    }
  }
  el.innerHTML = `<div class="ev-layout"><div class="ev-main">${tools}${body}</div><aside class="ev-side">${evCalHtml()}${evArcHtml(arc)}</aside></div>`;
  if (keepFocus) { const i = document.getElementById('ev-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
function evCardHtml(e, next) {
  const past = evPast(e), hof = evHofCount(e);
  return `<div class="ev-card${next ? ' next' : ''}${past ? ' past' : ''}" onclick="openEvDetail('${e.id}')">
    <div class="ev-dt"><small>${escHtml(evWib(e.start_at, { weekday: 'short' }).toUpperCase())}</small><b>${evWib(e.start_at, { day: 'numeric' })}</b><i>${escHtml(evWib(e.start_at, { month: 'short' }))}</i></div>
    ${evPosterHtml(e)}
    <div class="ev-info"><div>${evTag(e)}${next ? '<span class="ev-tg near">Paling dekat</span>' : ''}</div>
      <h3>${escHtml(e.title)}</h3><p>📍 ${escHtml(evPlace(e) || '—')} · ${escHtml(evRange(e))}</p>${evCountdown(e)}
      <div class="ev-acts" onclick="event.stopPropagation()">${past ? (hof && HOF_ON ? `<button class="ev-btn" onclick="openHallOfFame()">🏆 ${hof} prestasi ›</button>` : '') : evRemindBtn(e)}
        ${!past && e.link_url ? `<a class="ev-btn${/wa\.me/.test(e.link_url) ? ' wa' : ''}" href="${escHtml(e.link_url)}" target="_blank" rel="noopener">${escHtml(e.link_label || (/wa\.me/.test(e.link_url) ? '💬 Daftar via WA' : '🔗 Info & daftar'))}</a>` : ''}
        ${!past && evMaps(e) ? `<a class="ev-btn" href="${escHtml(evMaps(e))}" target="_blank" rel="noopener">📍 Lokasi</a>` : ''}
        <button class="ev-btn" onclick="evShare('${e.id}')">${SHARE_ICON} Bagikan</button></div></div></div>`;
}
function evCalHtml() {
  const [y, m] = evMonth.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (first.getUTCDay() + 6) % 7;
  const has = new Set();
  for (const e of evShown()) { let d = Date.parse(evYmd(e.start_at)); const end = Date.parse(evYmd(e.end_at || e.start_at)); for (let i = 0; d <= end && i < 14; d += 864e5, i++) has.add(new Date(d).toISOString().slice(0, 10)); }
  const today = todayWIB();
  let cells = ['S', 'S', 'R', 'K', 'J', 'S', 'M'].map(x => `<i>${x}</i>`).join('') + '<span class="x"></span>'.repeat(lead);
  for (let d = 1; d <= days; d++) {
    const ymd = `${evMonth}-${String(d).padStart(2, '0')}`;
    cells += has.has(ymd) ? `<button class="e${ymd === today ? ' t' : ''}${ymd === evDay ? ' sel' : ''}" onclick="evPickDay('${ymd}')">${d}</button>` : `<span class="${ymd === today ? 't' : ''}">${d}</span>`;
  }
  return `<div class="ev-box"><div class="ev-calh"><button onclick="evMonthStep(-1)" aria-label="Bulan sebelumnya">‹</button><b>${escHtml(new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }))}</b><button onclick="evMonthStep(1)" aria-label="Bulan berikutnya">›</button></div>
    <div class="ev-cal">${cells}</div><p class="ev-note">Tanggal emas = ada acara. Ketuk untuk melihatnya.</p></div>`;
}
function evArcHtml(arc) {
  if (!arc.length) return '';
  return `<div class="ev-box"><h4>📦 Arsip acara</h4>${arc.slice(0, 5).map(e => { const hof = evHofCount(e);
    return `<button class="ev-arc" onclick="openEvDetail('${e.id}')"><span>${evKind_(e)[0]}</span><div><b>${escHtml(e.title)}</b><small>${escHtml(evWib(e.start_at, { day: 'numeric', month: 'short', year: 'numeric' }))}${e.city ? ' · ' + escHtml(e.city) : ''}</small></div>${hof ? `<em>🏆 ${hof}</em>` : ''}</button>`; }).join('')}
    ${arc.length > 5 ? `<button class="ev-more" onclick="setEvTab('arc')">Lihat semua arsip (${arc.length}) ›</button>` : ''}</div>`;
}

/* ── Detail acara (jendela) ── */
function openEvDetail(id) {
  const e = evItems?.find(x => x.id === id); if (!e) return;
  evDetailId = id;
  if (e.published) if (typeof intLog === 'function') intLog('open', 'ev:' + id, '', true);   // ⭐ Konten paling dibuka (Rapor Bulanan)
  let ov = document.getElementById('ev-detail');
  if (!ov) { ov = document.createElement('div'); ov.id = 'ev-detail'; ov.className = 'ev-ov'; ov.onclick = ev => { if (ev.target === ov) closeEvDetail(); }; document.body.appendChild(ov); }
  const past = evPast(e), hof = evHofCount(e), ds = typeof adPublic === 'function' ? adPublic() : [];
  const parts = (e.partners || []).map(n => { const d = ds.find(x => x.n === n);
    return d ? `<button class="ev-pt" onclick="closeEvDetail();openPartner('${shareSlug(d.n)}')">🏪 ${escHtml(d.n)} <small>${escHtml(d.c || d.r || '')} · Profil ›</small></button>` : `<span class="ev-pt">🏪 ${escHtml(n)}</span>`; }).join('');
  const body = (e.body || '').trim() ? `<div class="ev-body">${escHtml(e.body).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}</div>` : '';
  ov.innerHTML = `<div class="ev-dlg" role="dialog" aria-label="${escHtml(e.title)}"><button class="ev-x" onclick="closeEvDetail()" aria-label="Tutup">✕</button>
    ${evPosterHtml(e, true)}<div class="ev-dbody"><div>${evTag(e)}</div><h2>${escHtml(e.title)}</h2>${evCountdown(e)}
    <div class="ev-rows"><span>🗓</span><span><b>${escHtml(evRange(e))}</b></span>
      <span>📍</span><span>${escHtml(evPlace(e) || '—')}${evMaps(e) ? ` — <a href="${escHtml(evMaps(e))}" target="_blank" rel="noopener">buka di Maps</a>` : ''}</span>
      ${e.link_url ? `<span>🔗</span><span><a href="${escHtml(e.link_url)}" target="_blank" rel="noopener">${escHtml(e.link_label || 'Info & pendaftaran')}</a></span>` : ''}</div>
    ${parts ? `<div class="ev-pts"><small>Partner CAI terkait</small>${parts}</div>` : ''}${body}
    <div class="ev-acts">${past ? '' : evRemindBtn(e, true)}${past ? '' : `<button class="ev-btn" onclick="evIcs('${e.id}')">📅 Tambah ke kalender HP</button>`}
      ${past && hof && HOF_ON ? `<button class="ev-btn g" onclick="closeEvDetail();openHallOfFame()">🏆 Lihat ${hof} prestasi di Hall of Fame ›</button>` : ''}
      ${past ? `<button class="ev-btn" onclick="closeEvDetail();openGaleri()">📷 Galeri Instalasi ›</button>` : ''}
      <button class="ev-btn" onclick="evShare('${e.id}')">${SHARE_ICON} Bagikan</button>
      ${isEditor() ? `<button class="ev-btn" onclick="closeEvDetail();openEvForm('${e.id}')">✏️ Edit</button><button class="ev-btn del" onclick="deleteEv('${e.id}')">🗑 Hapus</button>` : ''}</div></div></div>`;
  ov.classList.add('open'); document.body.classList.add('modal-open');
  if (!history.state?.evd) history.pushState({ evd: 1 }, '');
}
function closeEvDetail(fromPop) {
  const ov = document.getElementById('ev-detail'); if (!ov || !ov.classList.contains('open')) return;
  ov.classList.remove('open'); document.body.classList.remove('modal-open'); evDetailId = null;
  if (!fromPop && history.state?.evd) history.back();
}
window.addEventListener('popstate', () => closeEvDetail(true));
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { closeEvDetail(); if (evForm) closeEvForm(); } });

/* ── 🔔 Ingatkan saya (H-1, notifikasi HP) ── */
function evRemindBtn(e, big) {
  const on = evWatch?.has(e.id);
  return `<button class="ev-btn${on ? ' on' : ' g'}" onclick="event.stopPropagation(); evToggleRemind('${e.id}')" ${evWatchBusy ? 'disabled' : ''}>${on ? '🔔 Diingatkan' + (big ? ' · H-1 · batal' : '') : '🔔 Ingatkan saya'}</button>`;
}
async function evLoadWatch(tries = 0) {
  if (typeof pushInit !== 'function') return;
  pushInit();
  if (['?', '…', 'busy'].includes(pushSt) && tries < 8) { setTimeout(() => evLoadWatch(tries + 1), 1000); return; }
  if (pushSt !== 'ok' || !pushEp) { evWatch = evWatch || new Set(); return; }
  try { const r = await pushFn({ action: 'ev_watches', endpoint: pushEp }); evWatch = new Set(r?.items || []); } catch (e) { evWatch = evWatch || new Set(); }
  evRepaint();
}
function evRepaint() {
  if (typeof hlRender === 'function' && document.querySelector('#cway-hl .ev-hl')) hlRender();
  if (document.getElementById('view-events')?.classList.contains('active')) renderEvents();
  if (evDetailId && document.getElementById('ev-detail')?.classList.contains('open')) openEvDetail(evDetailId);
}
async function evToggleRemind(id) {
  const e = evItems?.find(x => x.id === id); if (!e || evWatchBusy) return;
  const on = !evWatch?.has(id);
  if (on && !pushOk()) {
    if (confirm((pushIos() ? 'Di iPhone, notifikasi hanya bisa dipakai bila CAI Hub dipasang di Layar Utama lalu dibuka dari ikonnya.' : 'Browser ini belum mendukung notifikasi.') + '\n\nTambahkan acara ini ke kalender HP saja?')) evIcs(id);
    return;
  }
  evWatchBusy = true; evRepaint();
  try {
    const hasRow = pushSt === 'ok' && pushEp && pushFlags && Object.values(pushFlags).some(Boolean);
    if (on && !hasRow) {
      const r = await pushSet({ event: true }, true);   // minta izin & berlangganan (langsung dari klik)
      if (!r || !pushEp) { if (pushSt === 'denied') showToast('Izin notifikasi ditolak — izinkan lewat pengaturan HP, lalu coba lagi. Atau pakai “📅 Tambah ke kalender HP”.', 8000); return; }
    }
    const r = await pushFn({ action: 'ev_watch', endpoint: pushEp, event_id: id, on });
    evWatch = new Set(r?.items || []);
    showToast(on ? `🔔 Anda akan diingatkan sehari sebelum “${e.title}”` : 'Pengingat acara dibatalkan', 5000);
  } catch (err) {
    if (typeof pushErrState === 'function' && pushErrState(err)) { if (isEditor()) evCopySql(); else showToast('Fitur pengingat sedang disiapkan — coba lagi nanti.', 6000); }
    else showToast('⚠ ' + (err.message || err), 7000);
  } finally { evWatchBusy = false; evRepaint(); }
}

/* ── 📅 Tambah ke kalender HP (.ics) & Bagikan ── */
function evIcs(id) {
  const e = evItems?.find(x => x.id === id); if (!e) return;
  const t = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
  const end = e.end_at ? Date.parse(e.end_at) : evStart(e) + 2 * 3600e3;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CAI Hub//Kalender Acara//ID', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${e.id}@hub.concerto.id`, `DTSTAMP:${t(Date.now())}`, `DTSTART:${t(evStart(e))}`, `DTEND:${t(end)}`,
    `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(evPlace(e))}`, `DESCRIPTION:${esc([(e.body || '').slice(0, 500), 'Detail: ' + evLink(e.id)].filter(Boolean).join('\n\n'))}`,
    `URL:${evLink(e.id)}`, 'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  a.download = `Acara-${shareSlug(e.title) || 'CAI'}.ics`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  showToast('📅 File kalender diunduh — buka file itu untuk menambahkan acara ke kalender HP.', 6000);
}
function evShare(id) {
  const e = evItems?.find(x => x.id === id); if (!e) return;
  const t = `📅 *${e.title}*\n${evRange(e)}${evPlace(e) ? '\n📍 ' + evPlace(e) : ''}${e.public === false ? '\n🔒 Khusus partner CAI — buka dengan Kode Akses' : ''}\nDetail & pengingat di CAI Hub:\n${evLink(e.id)}`;
  window.open(`https://wa.me/?text=${waText(t)}`, '_blank', 'noopener');
}

/* ── Dashboard: 📅 Acara terdekat (30 hari) ── */
function evDashHtml() {
  const lim = Date.now() + EV_DASH_DAYS * 864e5;
  const list = (evItems || []).filter(e => e.published && !evPast(e) && evStart(e) <= lim).sort((a, b) => evStart(a) - evStart(b)).slice(0, 3);
  if (!list.length) return '';
  return `<div class="ev-dash"><div class="ev-dash-h"><b>📅 Acara terdekat</b><button onclick="openEvents()">Lihat kalender ›</button></div>
    <div class="ev-dash-g">${list.map(e => { const days = Math.round((Date.parse(evYmd(e.start_at)) - Date.parse(todayWIB())) / 864e5);
      return `<button onclick="openEvents();openEvDetail('${e.id}')"><small>${escHtml(evWib(e.start_at, { day: 'numeric', month: 'short' }).toUpperCase())}${days > 0 ? ` · ${days === 1 ? 'BESOK' : days + ' HARI'}` : evStart(e) <= Date.now() ? ' · BERLANGSUNG' : ' · HARI INI'}</small>
        <b>${escHtml(e.title)}</b><span>${evKind_(e)[0]} ${escHtml(e.online ? 'Online' : (e.city || e.venue || ''))}${e.public === false ? ' · 🔒' : ''}</span></button>`; }).join('')}</div></div>`;
}
// Kotak "📅 Acara terdekat" disembunyikan sejak acara tampil di headline Dashboard (5 Nov 2026, permintaan pemilik); true = tampil lagi.
const EV_DASH_BOX = false;
function evDashRender() { const el = document.getElementById('dash-ev'); if (el) el.innerHTML = EV_DASH_BOX ? evDashHtml() : ''; }

/* ── 📅 Acara di headline Dashboard (#cway-hl, js/news.js hlSlides) — 5 Nov 2026, permintaan pemilik ── */
const EV_HL_MAX = 2;
function evHlList() {
  if (!evOn()) return [];
  const lim = Date.now() + EV_DASH_DAYS * 864e5;
  return (evItems || []).filter(e => e.published && !evPast(e) && evStart(e) <= lim && (e.public !== false || authUser))
    .sort((a, b) => evStart(a) - evStart(b)).slice(0, EV_HL_MAX);
}
function evHlCd(e) {
  const now = Date.now();
  if (evStart(e) <= now && now <= evEnd(e)) return '● Sedang berlangsung';
  const days = Math.round((Date.parse(evYmd(e.start_at)) - Date.parse(todayWIB())) / 864e5);
  return days <= 0 ? '● Hari ini' : days === 1 ? 'Besok' : days + ' hari lagi';
}
function evHlHtml(e) {
  const p = evPoster(e), k = evKind_(e), live = evStart(e) <= Date.now();
  const pt = (e.partners || []).length;
  return `<div class="nw-hl ev-hl" role="button" tabindex="0" onclick="openEvents();openEvDetail('${e.id}')" onkeydown="if(event.key==='Enter'){openEvents();openEvDetail('${e.id}')}">
    <div class="nw-img${p ? '' : ' ph'}">${p ? (h => /ev-fbg/.test(h) ? `<span class="ev-fw">${h}</span>` : h)(evImgHtml(p, evPosterFr(e.poster), true)) : `<span>${k[0]}</span>`}</div>
    <div class="nw-main"><div class="nw-top">📅 Acara <span class="ev-hl-cd${live ? ' live' : ''}">${evHlCd(e)}</span><span class="nw-cat">${k[0]} ${escHtml(k[1])}</span>${e.public === false ? '<span class="nw-cat">🔒 Partner</span>' : ''}</div>
      <div class="nw-t">${escHtml(e.title)}</div>
      <div class="nw-s">${escHtml(evRange(e))}${evPlace(e) ? `<br>📍 ${escHtml(evPlace(e))}` : ''}</div>
      <div class="nw-foot"><span class="nw-date">${pt ? `🏪 ${pt} partner CAI terkait` : ''}</span>${!evPast(e) && !live ? evRemindBtn(e) : ''}<span class="nw-btn">Lihat detail ›</span></div></div></div>`;
}

/* ── Form Editor ── */
const evDate = iso => iso ? evYmd(iso) : '';
const evTime = iso => iso ? evWib(iso, { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':') : '';   // <input type=time> butuh HH:MM
function openEvForm(id) {
  if (!isEditor()) return;
  const e = id ? evItems?.find(x => x.id === id) : null;
  const tom = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  evForm = e ? { id: e.id, title: e.title, kind: e.kind, sd: evDate(e.start_at), st: evTime(e.start_at), ed: evDate(e.end_at), et: evTime(e.end_at), online: !!e.online,
      city: e.city || '', venue: e.venue || '', map_url: e.map_url || '', partners: [...(e.partners || [])], poster: evPosterPath(e.poster), fr: evPosterFr(e.poster), file: null, prev: '', body: e.body || '',
      link_url: e.link_url || '', link_label: e.link_label || '', hof_event: e.hof_event || '', public: e.public !== false, published: !!e.published, notify: !!e.notify, busy: false }
    : { id: null, title: '', kind: 'kompetisi', sd: tom, st: '09:00', ed: '', et: '', online: false, city: '', venue: '', map_url: '', partners: [], poster: '', fr: evPosterFr(''), file: null, prev: '', body: '',
      link_url: '', link_label: '', hof_event: '', public: true, published: true, notify: true, busy: false };
  let ov = document.getElementById('ev-form');
  if (!ov) { ov = document.createElement('div'); ov.id = 'ev-form'; ov.className = 'ev-ov'; document.body.appendChild(ov); }
  ov.classList.add('open'); document.body.classList.add('modal-open');
  renderEvForm();
}
function closeEvForm() { evForm = null; const ov = document.getElementById('ev-form'); if (ov) { ov.classList.remove('open'); ov.innerHTML = ''; } document.body.classList.remove('modal-open'); }
function evF(k, v) { if (evForm) evForm[k] = v; }
function evFr(k, v) { if (evForm) { evForm[k] = v; renderEvForm(); } }
function evAddPartner(v) { v = String(v || '').trim(); if (!v || !evForm || evForm.partners.includes(v)) return; evForm.partners.push(v); renderEvForm(); }
function evDelPartner(i) { evForm.partners.splice(i, 1); renderEvForm(); }
function evPosterPick(inp) { const f = inp.files?.[0]; if (!f || !evForm) return; evForm.file = f; if (evForm.prev) URL.revokeObjectURL(evForm.prev); evForm.prev = URL.createObjectURL(f); evForm.fr = evPosterFr(''); renderEvForm(); }
function evPosterDel() { if (!evForm) return; evForm.file = null; evForm.poster = ''; evForm.prev = ''; evForm.fr = evPosterFr(''); renderEvForm(); }
// Atur posisi sampul: geser di bingkai 16:9 (titik fokus), zoom 1–2,5×, atau "Tampilkan utuh"
function evFrMode(m) { if (!evForm) return; const f = evForm.fr; f.mode = m; if (m !== 'cover') { f.x = 50; f.y = 50; f.z = 1; } renderEvForm(); }
function evFrApply() {
  const im = document.querySelector('#ev-form .ev-fr img'), f = evForm?.fr; if (!im || !f) return;
  im.style.cssText = evFrCss(f);
  const z = document.getElementById('ev-fr-zv'); if (z) z.textContent = f.z.toFixed(2).replace('.', ',') + '×';
}
function evFrDrag(e) {
  const box = e.currentTarget, f = evForm?.fr; if (!f || e.button > 0 || f.mode === 'fit') return;
  if (f.mode === 'auto') f.mode = 'cover';
  e.preventDefault(); box.setPointerCapture?.(e.pointerId); box.classList.add('drag');
  const r = box.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, fx = f.x, fy = f.y;
  const mv = ev => {   // gambar ikut jari
    const k = 100 / Math.max(1, f.z - 1 + .6);
    f.x = Math.round(Math.min(100, Math.max(0, fx - (ev.clientX - x0) / r.width * k)));
    f.y = Math.round(Math.min(100, Math.max(0, fy - (ev.clientY - y0) / r.height * k)));
    evFrApply();
  };
  const up = () => { box.classList.remove('drag'); box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up); renderEvForm(); };
  box.addEventListener('pointermove', mv); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
}
function evFrZoom(v) { const f = evForm?.fr; if (!f) return; f.mode = 'cover'; f.z = Math.round(Number(v) * 100) / 100; evFrApply(); }
function evFrReset() { if (!evForm) return; evForm.fr = evPosterFr(''); renderEvForm(); }
function evFrHtml(img, f) {
  const fit = f.mode === 'fit';
  return `<div class="ev-fr${fit ? ' fit' : ' adj'}"${fit ? '' : ' onpointerdown="evFrDrag(event)"'}>${fit ? evImgHtml(img, f, true) : `<img src="${escHtml(img)}" alt="" draggable="false" style="${evFrCss(f)}">`}
      ${fit ? '' : '<span class="ev-fhint">✥ Geser foto untuk mengatur bagian yang tampil</span>'}</div>
    <div class="ev-frc"><span class="ev-seg"><button type="button" class="${fit ? '' : 'on'}" onclick="evFrMode('cover')">▣ Isi bingkai</button><button type="button" class="${fit ? 'on' : ''}" onclick="evFrMode('fit')">▢ Tampilkan utuh</button></span>
      ${fit ? '' : `<label class="ev-zoom">🔍 Zoom <input type="range" min="1" max="2.5" step="0.05" value="${f.z}" oninput="evFrZoom(this.value)"> <b id="ev-fr-zv">${f.z.toFixed(2).replace('.', ',')}×</b></label>`}
      <button type="button" class="ev-btn" onclick="evFrReset()">⊙ Reset</button></div>
    <p class="ev-note">${fit ? 'Poster tampil utuh tanpa terpotong; sisi kosong diisi versi buram dari poster yang sama — cocok untuk poster tegak berisi tulisan.' : f.mode === 'auto' ? 'Belum diatur: kartu memotong di tengah, jendela detail menampilkan utuh. Geser / zoom untuk mengatur sendiri.' : 'Posisi ini dipakai di kartu Kalender Acara, jendela detail & headline Dashboard.'}</p>`;
}
function renderEvForm() {
  const f = evForm, ov = document.getElementById('ev-form'); if (!f || !ov) return;
  const ds = typeof adPublic === 'function' ? adPublic() : [];
  const hofEvents = typeof HALL_OF_FAME !== 'undefined' ? [...new Set(HALL_OF_FAME.map(x => x.event).filter(Boolean))] : [];
  const img = f.prev || (f.poster ? evPoster(f) : '');
  const wasLive = f.id && evItems?.find(x => x.id === f.id)?.push_at;
  ov.innerHTML = `<div class="ev-dlg ev-fdlg"><button class="ev-x" onclick="closeEvForm()" aria-label="Tutup">✕</button>
    <h3>${f.id ? '✏️ Edit Acara' : '＋ Tambah Acara'} <small>· khusus Editor</small></h3>
    <label class="ev-fl">Judul</label><input class="ev-in" value="${escHtml(f.title)}" oninput="evF('title', this.value)" placeholder="mis. EMMA Indonesia — Heat 03">
    <label class="ev-fl">Jenis</label><div class="ev-sel">${Object.entries(EV_KINDS).map(([k, v]) => `<button type="button" class="${f.kind === k ? 'on' : ''}" onclick="evFr('kind', '${k}')">${v[0]} ${v[1]}</button>`).join('')}</div>
    <div class="ev-r2"><div><label class="ev-fl">Mulai (WIB)</label><div class="ev-r2 t"><input type="date" class="ev-in" value="${f.sd}" onchange="evF('sd', this.value)"><input type="time" class="ev-in" value="${f.st}" onchange="evF('st', this.value)"></div></div>
      <div><label class="ev-fl">Selesai <small>(opsional)</small></label><div class="ev-r2 t"><input type="date" class="ev-in" value="${f.ed}" onchange="evF('ed', this.value)"><input type="time" class="ev-in" value="${f.et}" onchange="evF('et', this.value)"></div></div></div>
    <label class="ev-chk"><input type="checkbox" ${f.online ? 'checked' : ''} onchange="evFr('online', this.checked)"> Acara online (live / Zoom)</label>
    ${f.online ? '' : `<div class="ev-r2"><div><label class="ev-fl">Kota</label><input class="ev-in" value="${escHtml(f.city)}" oninput="evF('city', this.value)" placeholder="Jakarta"></div>
      <div><label class="ev-fl">Tempat</label><input class="ev-in" value="${escHtml(f.venue)}" oninput="evF('venue', this.value)" placeholder="nama gedung / toko"></div></div>`}
    <label class="ev-fl">${f.online ? 'Link live / Zoom (opsional)' : 'Link Google Maps (opsional — kosong = cari otomatis dari tempat + kota)'}</label><input class="ev-in" value="${escHtml(f.map_url)}" oninput="evF('map_url', this.value)" placeholder="https://maps.app.goo.gl/…">
    <label class="ev-fl">Partner CAI terkait</label><div class="ev-ptags">${f.partners.map((p, i) => `<span>${escHtml(p)} <button type="button" onclick="evDelPartner(${i})">✕</button></span>`).join('')}
      <input class="ev-in sm" list="ev-dl-pt" placeholder="ketik / pilih nama partner lalu Enter" onkeydown="if(event.key==='Enter'){event.preventDefault();evAddPartner(this.value)}" onchange="evAddPartner(this.value)"></div>
    <datalist id="ev-dl-pt">${ds.map(d => `<option value="${escHtml(d.n)}">`).join('')}</datalist>
    <label class="ev-fl">Poster <small>(opsional — JPG/PNG/WebP, diperkecil otomatis)</small></label>
    ${img ? evFrHtml(img, f.fr) : ''}
    <div class="ev-pick">${img ? `<button type="button" class="ev-btn del" onclick="evPosterDel()">🗑 Hapus poster</button>` : ''}<label class="ev-btn">⬆ ${img ? 'Ganti' : 'Pilih'} poster<input type="file" accept="image/*" hidden onchange="evPosterPick(this)"></label></div>
    <label class="ev-fl">Keterangan</label><textarea class="ev-in" rows="4" oninput="evF('body', this.value)" placeholder="Agenda, siapa yang diundang, apa yang didapat…">${escHtml(f.body)}</textarea>
    <div class="ev-r2"><div><label class="ev-fl">Link info / daftar <small>(opsional; wa.me = tombol Daftar via WA)</small></label><input class="ev-in" value="${escHtml(f.link_url)}" oninput="evF('link_url', this.value)" placeholder="https://…"></div>
      <div><label class="ev-fl">Teks tombol <small>(opsional)</small></label><input class="ev-in" value="${escHtml(f.link_label)}" oninput="evF('link_label', this.value)" placeholder="Info & daftar"></div></div>
    ${f.kind === 'kompetisi' ? `<label class="ev-fl">Hasil di Hall of Fame <small>(opsional — nama event persis, untuk arsip)</small></label><input class="ev-in" list="ev-dl-hof" value="${escHtml(f.hof_event)}" oninput="evF('hof_event', this.value)" placeholder="mis. EMMA Heat 02"><datalist id="ev-dl-hof">${hofEvents.map(x => `<option value="${escHtml(x)}">`).join('')}</datalist>` : ''}
    <label class="ev-chk"><input type="checkbox" ${f.public ? 'checked' : ''} onchange="evFr('public', this.checked)"> Tampil untuk publik <small>(kosong = 🔒 khusus partner yang login)</small></label>
    <label class="ev-chk"><input type="checkbox" ${f.published ? 'checked' : ''} onchange="evFr('published', this.checked)"> Tayang <small>(kosong = draf, hanya Editor)</small></label>
    ${!EV_ON_ALL ? '<p class="ev-note">🔒 Kalender Acara sedang khusus Editor — notifikasi “Acara baru” tidak dikirim.</p>' : wasLive ? '<p class="ev-note">🔔 Notifikasi “Acara baru” untuk acara ini sudah pernah dikirim.</p>' : `<label class="ev-chk"><input type="checkbox" ${f.notify ? 'checked' : ''} onchange="evFr('notify', this.checked)"> Kirim notifikasi “📅 Acara baru” ke HP pengunjung saat tayang${f.public ? '' : ' <small>(khusus partner: tanpa judul)</small>'}</label>`}
    <div class="ev-acts"><button class="gt-btn" onclick="saveEv()" ${f.busy ? 'disabled' : ''}>${f.busy ? 'Menyimpan…' : 'Simpan Acara'}</button><button class="gt-btn ghost" onclick="closeEvForm()">Batal</button></div></div>`;
}
const evIso = (d, t) => d ? new Date(`${d}T${t || '00:00'}:00+07:00`).toISOString() : null;
async function saveEv() {
  const f = evForm; if (!f || f.busy || !isEditor()) return;
  if (!f.title.trim()) return showToast('Judul belum terisi.');
  if (!f.sd) return showToast('Tanggal mulai belum diisi.');
  const start = evIso(f.sd, f.st || '00:00'), end = f.ed ? evIso(f.ed, f.et || f.st || '00:00') : (f.et ? evIso(f.sd, f.et) : null);
  if (end && Date.parse(end) < Date.parse(start)) return showToast('Waktu selesai lebih awal dari waktu mulai.');
  f.busy = true; renderEvForm();
  const old = f.id ? evItems?.find(x => x.id === f.id) : null;
  let uploaded = null;
  try {
    let poster = evPosterPath(f.poster) || null;
    if (f.file) {
      const blob = await glResize(f.file, 1600);
      uploaded = `events/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
      const { error } = await supabase.storage.from('showcase').upload(uploaded, blob, { contentType: blob.type, cacheControl: '3600' });
      if (error) throw error;
      poster = uploaded;
    }
    if (poster) poster += evFrSuffix(f.fr);
    const row = { title: f.title.trim(), kind: f.kind, start_at: start, end_at: end, online: !!f.online, city: f.online ? null : (f.city.trim() || null), venue: f.online ? null : (f.venue.trim() || null),
      map_url: f.map_url.trim() || null, partners: f.partners, poster, body: f.body.trim() || null, link_url: f.link_url.trim() || null, link_label: f.link_label.trim() || null,
      hof_event: f.kind === 'kompetisi' ? (f.hof_event.trim() || null) : null, public: !!f.public, published: !!f.published, notify: !!f.notify, updated_at: new Date().toISOString() };
    const q = f.id ? supabase.from(EV_TABLE).update(row).eq('id', f.id).select().single() : supabase.from(EV_TABLE).insert(row).select().single();
    const { data, error } = await q; if (error) throw error;
    if (EV_ON_ALL && data.published && data.notify && !data.push_at && typeof pushNotify === 'function') pushNotify('event', data.id);   // "📅 Acara baru" (sekali per acara, dicek server)
    const oldP = evPosterPath(old?.poster);
    if (oldP && oldP !== evPosterPath(poster) && /^events\//.test(oldP)) supabase.storage.from('showcase').remove([oldP]).catch(() => {});
    if (f.prev) URL.revokeObjectURL(f.prev);
    closeEvForm(); showToast(f.id ? '✓ Acara diperbarui' : (data.published ? '✓ Acara ditambahkan' : '✓ Disimpan sebagai draf'));
    await loadEvents(true); evTab = evPast(data) ? 'arc' : 'next'; openEvents(); openEvDetail(data.id);
  } catch (e) {
    if (uploaded) supabase.storage.from('showcase').remove([uploaded]).catch(() => {});
    f.busy = false; renderEvForm();
    const m = e?.message || String(e);
    if (/does not exist|schema cache|42P01/i.test(m)) { evMissing = true; evCopySql(); }
    else if (typeof dashErr === 'function') dashErr(e, 'menyimpan acara'); else showToast('⚠ ' + m, 8000);
  }
}
async function deleteEv(id) {
  const e = evItems?.find(x => x.id === id); if (!e || !isEditor()) return;
  if (!confirm(`Hapus acara "${e.title}"?\n\nPengingat yang sudah dipasang pengunjung ikut terhapus.`)) return;
  const { error } = await supabase.from(EV_TABLE).delete().eq('id', id);
  if (error) return showToast('⚠ Gagal menghapus: ' + error.message, 7000);
  if (e.poster && /^events\//.test(evPosterPath(e.poster))) supabase.storage.from('showcase').remove([evPosterPath(e.poster)]).catch(() => {});
  closeEvDetail(); showToast('Acara dihapus'); await loadEvents(true);
}
function evCopySql() {
  (navigator.clipboard?.writeText(EV_SQL) || Promise.reject()).then(
    () => showToast('📋 SQL Kalender Acara DISALIN — tempel di Supabase → SQL Editor → Run, lalu muat ulang portal.', 9000),
    () => prompt('Jalankan SQL ini sekali di Supabase → SQL Editor → Run:', EV_SQL));
}
