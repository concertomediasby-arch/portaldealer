// ── AJAKAN "PASANG CAI HUB" DI LAYAR UTAMA (4 Nov 2026, permintaan pemilik — pratinjau .mockup/install/ disetujui) ──
// Untuk pengunjung umum di HP: Android = tombol Instal asli Chrome (beforeinstallprompt), iPhone Safari = panduan 3 langkah + video,
// iPhone di browser lain = sarankan buka di Safari, Android tanpa tombol instal = langkah menu ⋮.
// Muncul setelah ada minat (2 produk / 1 materi Academy / 1 mobil Galeri / kunjungan ke-2), bukan di halaman pertama;
// ✕ / Nanti saja = tidak muncul otomatis 14 hari; maks. 1× per kunjungan; tidak muncul bila CAI Hub sudah dibuka dari ikonnya.
// Ajakan kecil di halaman produk (#ins-inline) & pil header (#ins-pill) tetap ada selama belum dipasang.
// Pengukuran (menu Pengunjung Portal): RPC log_app_event → tabel site_app_events; angka lewat app_event_stats (Admin/Editor). SQL: APP_SQL.
const INS_KEY = 'cai-ins', INS_SES = 'cai-ins-ses', INS_SNOOZE_DAYS = 14;
const INS_VIDEO = 'assets/intro/tutorial-layar-utama.mp4';
const APP_SQL = `-- Pengukuran pemasangan CAI Hub (ajakan "Pasang CAI Hub", 4 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run
create table if not exists public.site_app_events (
  day date not null,
  vid text not null,
  kind text not null,          -- standalone (dibuka dari ikon) | install (baru dipasang) | shown (ajakan tampil) | dismiss (ajakan ditutup) | qr (datang dari kartu QR toko partner, ?src=kartu)
  plat text,                   -- android | ios | other
  n int not null default 1,
  primary key (day, vid, kind)
);
alter table public.site_app_events enable row level security;

create or replace function public.log_app_event(p_vid text, p_kind text, p_plat text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 then return; end if;
  if p_kind not in ('standalone', 'install', 'shown', 'dismiss', 'qr') then return; end if;
  insert into site_app_events (day, vid, kind, plat)
  values ((now() at time zone 'Asia/Jakarta')::date, p_vid, p_kind, left(coalesce(p_plat, 'other'), 10))
  on conflict (day, vid, kind) do update set n = site_app_events.n + 1;
end $$;
grant execute on function public.log_app_event(text, text, text) to anon, authenticated;

create or replace function public.app_event_stats(p_days int default 30)
returns json language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jakarta')::date; nd int := least(greatest(coalesce(p_days, 30), 1), 366);
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('admin', 'editor') then raise exception 'not allowed'; end if;
  return json_build_object(
    'standalone', (select count(distinct vid) from site_app_events where kind = 'standalone' and day > today - nd),
    'install', (select count(distinct vid) from site_app_events where kind = 'install' and day > today - nd),
    'install_android', (select count(distinct vid) from site_app_events where kind = 'install' and plat = 'android' and day > today - nd),
    'install_ios', (select count(distinct vid) from site_app_events where kind = 'install' and plat = 'ios' and day > today - nd),
    'shown', (select count(distinct vid) from site_app_events where kind = 'shown' and day > today - nd),
    'dismiss', (select count(distinct vid) from site_app_events where kind = 'dismiss' and day > today - nd),
    'visitors', (select count(distinct vid) from site_visits where day > today - nd),
    'qr', (select count(distinct vid) from site_app_events where kind = 'qr' and day > today - nd),
    'qr_install', (select count(distinct e.vid) from site_app_events e where e.kind = 'install' and e.day > today - nd
                    and exists (select 1 from site_app_events q where q.vid = e.vid and q.kind = 'qr')),
    'total_install', (select count(distinct vid) from site_app_events where kind = 'install'));
end $$;
grant execute on function public.app_event_stats(int) to authenticated;`;

let insBip = null;   // event beforeinstallprompt (Android/Chrome)
const insUA = navigator.userAgent || '';
const insIos = () => /iP(hone|ad|od)/.test(insUA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const insAndroid = () => /Android/i.test(insUA);
const insPlat = () => insIos() ? 'ios' : insAndroid() ? 'android' : 'other';
const insIosSafari = () => insIos() && /Safari/i.test(insUA) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV|Line\/|TikTok|WhatsApp/i.test(insUA);
const insStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
function insState() { try { return JSON.parse(localStorage.getItem(INS_KEY) || '{}') || {}; } catch (e) { return {}; } }
function insSave(s) { try { localStorage.setItem(INS_KEY, JSON.stringify(s)); } catch (e) {} }
// Boleh ditawari: HP, belum dipasang di perangkat ini, bukan layar videotron
const insEligible = () => !QA_SCREEN_MODE && (insIos() || insAndroid()) && !insStandalone() && !insState().done;
function insLog(kind) {
  if (typeof supabase === 'undefined' || !supabase || QA_SCREEN_MODE || (typeof isAdmin === 'function' && isAdmin())) return;
  const vid = typeof visitId === 'function' ? visitId() : null; if (!vid) return;
  supabase.rpc('log_app_event', { p_vid: vid, p_kind: kind, p_plat: insPlat() }).then(() => {}, () => {});
}

// ── Mulai: catat kunjungan & pemakaian dari ikon ──
function insInit() {
  if (QA_SCREEN_MODE) return;
  const s = insState();
  if (s.v !== 2) { delete s.snooze; s.v = 2; }   // sekali: hapus penundaan dari versi awal (tutup kartu yang dibuka lewat pil ikut menunda)
  insSrcCheck();
  let ses = ''; try { ses = sessionStorage.getItem(INS_SES) || ''; } catch (e) {}
  if (!ses) { s.visits = (s.visits || 0) + 1; try { sessionStorage.setItem(INS_SES, '1'); } catch (e) {} }
  if (insStandalone()) {
    const first = !s.done; s.done = 1; insSave(s);
    setTimeout(() => { if (first && !s.logged) { s.logged = 1; insSave(s); insLog('install'); } const d = todayWIB(); if (s.sday !== d) { s.sday = d; insSave(s); insLog('standalone'); } }, 3000);
    return;
  }
  insSave(s);
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); insBip = e; insPaint(); });
  addEventListener('appinstalled', () => { const t = insState(); t.done = 1; if (!t.logged) { t.logged = 1; insLog('install'); } insSave(t); insClose(true); insPaint(); showToast('✅ CAI Hub terpasang — buka dari ikonnya di layar HP', 6000); });
  insPaint();
  if ((s.visits || 0) >= 2) setTimeout(() => insMaybe('visit'), 8000);   // kunjungan ke-2 dst.
}
// Kartu QR di toko partner (4 Nov 2026, permintaan pemilik): QR = https://hub.concerto.id/?src=kartu → dicatat 'qr' (sekali per sesi tab),
// lalu penanda dibuang dari alamat agar tidak ikut terbawa saat link dibagikan / ikon dipasang.
function insSrcCheck() {
  let q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
  if (q.get('src') !== 'kartu') return;
  q.delete('src');
  try { history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch (e) {}
  let done = ''; try { done = sessionStorage.getItem(INS_SES + '-qr'); sessionStorage.setItem(INS_SES + '-qr', '1'); } catch (e) {}
  if (!done) setTimeout(() => insLog('qr'), 3000);   // tunggu status login (akun Admin/Editor tidak dicatat)
}
// Tanda minat: dipanggil dari detail produk, materi Academy, detail Galeri
function insInterest(kind) {
  if (!insEligible()) return;
  const s = insState(); s[kind] = (s[kind] || 0) + 1; insSave(s);
  if ((s.prod || 0) >= 2 || (s.acad || 0) >= 1 || (s.gl || 0) >= 1) setTimeout(() => insMaybe(kind), 1500);
}
function insMaybe(kind, tries = 0) {
  if (!insEligible() || document.getElementById('ins-sheet')?.classList.contains('open')) return;
  // belum masuk portal / ada jendela lain terbuka → coba lagi nanti (maks. ±1 menit)
  const busy = (document.getElementById('landing') && !document.getElementById('landing').hidden)
    || document.querySelector('.rk-pick.open, .gl-ov.open, #gdr.open, #dash-video.open, .ins-video.open, #login-overlay.open');
  if (busy) { if (tries < 15) setTimeout(() => insMaybe(kind, tries + 1), 4000); return; }
  const s = insState();
  if (s.snooze && Date.now() < s.snooze) return;
  let shown = ''; try { shown = sessionStorage.getItem(INS_SES + '-shown'); } catch (e) {}
  if (shown) return;
  insOpen(false);
}

// ── Kartu ajakan (dari bawah layar) ──
function insSheetHtml() {
  const head = (t, sub) => `<button class="ins-x" onclick="insClose()" aria-label="Tutup">✕</button>
    <div class="ins-hd"><img src="assets/icons/icon-192.png" alt=""><div><b>${t}</b><span>${sub}</span></div></div>`;
  const ben = `<div class="ins-ben"><div>⚡ Buka katalog 1 ketuk dari layar HP</div><div>🔔 Kabar produk baru, galeri &amp; promo langsung masuk</div><div>📱 Layar penuh seperti aplikasi</div></div>`;
  const later = `<button class="ins-later" onclick="insClose()">Nanti saja</button>`;
  const vid = `<button class="ins-vbtn" onclick="insVideo()">▶ Tonton video (1 menit)</button>`;
  if (insBip) return head('Pasang CAI Hub di HP Anda', 'Gratis · tanpa download Play Store · ±1 MB') + ben + `<button class="ins-go" onclick="insInstall()">📲 Pasang CAI Hub</button>` + later;
  if (insIosSafari()) return head('Simpan CAI Hub di iPhone', 'Gratis · tanpa App Store · 3 langkah') + `<div class="ins-steps">
      <div><i>1</i><span>Ketuk <b>Bagikan</b> di bilah bawah Safari <small>(iOS terbaru: ⋯ → Bagikan)</small></span><em><svg viewBox="0 0 24 24" fill="none" stroke="#0a84ff" stroke-width="2" stroke-linecap="round"><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M8 10H6v11h12V10h-2"/></svg></em></div>
      <div><i>2</i><span>Pilih <b>Tambah ke Layar Utama</b></span><em><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg></em></div>
      <div><i>3</i><span>Ketuk <b>Tambah</b> di kanan atas</span><em class="t">Tambah</em></div></div>` + vid + later + `<span class="ins-arrow"></span>`;
  if (insIos()) return head('Simpan CAI Hub di iPhone', 'Gratis · tanpa App Store') + `<p class="ins-p">Di iPhone, CAI Hub hanya bisa disimpan ke Layar Utama dari <b>Safari</b>. Salin alamatnya, buka Safari, lalu ikuti 3 langkah: Bagikan → <b>Tambah ke Layar Utama</b> → Tambah.</p>
      <button class="ins-go" onclick="insCopyLink()">📋 Salin alamat hub.concerto.id</button>` + vid + later;
  return head('Pasang CAI Hub di HP Anda', 'Gratis · tanpa download Play Store') + ben + `<div class="ins-steps">
      <div><i>1</i><span>Ketuk menu <b>⋮</b> di kanan atas Chrome</span><em class="t">⋮</em></div>
      <div><i>2</i><span>Pilih <b>Tambahkan ke layar utama</b> / <b>Instal aplikasi</b></span><em><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg></em></div>
      <div><i>3</i><span>Ketuk <b>Tambahkan</b> / <b>Instal</b></span><em class="t">OK</em></div></div>` + later;
}
function insOpen(manual) {
  let el = document.getElementById('ins-sheet');
  if (!el) { el = document.createElement('div'); el.id = 'ins-sheet'; el.className = 'ins-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Pasang CAI Hub'); document.body.appendChild(el); }
  el.className = 'ins-sheet' + (insIosSafari() && !insBip ? ' ios' : '');
  el.dataset.auto = manual ? '' : '1';   // dibuka sendiri lewat pil/ajakan kecil → menutupnya tidak menunda ajakan otomatis
  el.innerHTML = insSheetHtml();
  requestAnimationFrame(() => el.classList.add('open'));
  try { sessionStorage.setItem(INS_SES + '-shown', '1'); } catch (e) {}
  if (!manual) insLog('shown');
}
function insClose(silent) {
  const el = document.getElementById('ins-sheet'); if (!el?.classList.contains('open')) return;
  el.classList.remove('open');
  if (silent || !el.dataset.auto) return;
  const s = insState(); s.snooze = Date.now() + INS_SNOOZE_DAYS * 864e5; insSave(s);
  insLog('dismiss');
}
async function insInstall() {
  if (!insBip) { insOpen(true); return; }
  const e = insBip; insBip = null;
  try { e.prompt(); const r = await e.userChoice; if (r?.outcome === 'accepted') insClose(true); } catch (x) {}
  insPaint();
}
function insCopyLink() {
  const u = 'https://hub.concerto.id/';
  (navigator.clipboard?.writeText(u) || Promise.reject()).then(() => showToast('📋 Alamat disalin — buka Safari lalu tempel di kolom alamat', 6000), () => prompt('Salin alamat ini lalu buka di Safari:', u));
}
// Video tutorial "Pasang di Layar Utama" (sudah ada di repo) di jendela kecil
function insVideo() {
  let ov = document.getElementById('ins-video');
  if (!ov) { ov = document.createElement('div'); ov.id = 'ins-video'; ov.className = 'ins-video'; ov.onclick = e => { if (e.target === ov) insVideoClose(); }; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="ins-vbox"><button class="ins-x" onclick="insVideoClose()" aria-label="Tutup">✕</button><video src="${INS_VIDEO}" controls autoplay playsinline></video></div>`;
  ov.classList.add('open');
}
function insVideoClose() { const ov = document.getElementById('ins-video'); if (!ov) return; ov.querySelector('video')?.pause(); ov.classList.remove('open'); ov.innerHTML = ''; }

// ── Ajakan kecil di halaman produk & pil header ──
function insInlineHtml() {
  if (!insEligible()) return '';
  return `<button class="ins-inl" onclick="insOpen(true)"><img src="assets/icons/icon-192.png" alt=""><span><b>Simpan CAI Hub di HP</b><small>Buka katalog 1 ketuk, kabar produk baru</small></span><em>📲 Pasang</em></button>`;
}
function insPaint() {
  const p = document.getElementById('ins-pill'); if (p) p.hidden = !insEligible();
  const i = document.getElementById('ins-inline'); if (i) i.innerHTML = insInlineHtml();
}

// ── Pengukuran di menu Pengunjung Portal ──
let appStats = null, appErr = '';
async function loadAppStats() {
  if (typeof supabase === 'undefined' || !supabase || !isAdmin()) return;
  try {
    const { data, error } = await supabase.rpc('app_event_stats', { p_days: typeof visitDays !== 'undefined' ? visitDays : 30 });
    if (error) throw error;
    appStats = typeof data === 'string' ? JSON.parse(data) : data; appErr = '';
  } catch (e) { const m = String(e.message || e); appStats = null; appErr = /function|does not exist|schema cache|404|relation/i.test(m) ? 'setup' : m; }
}
function appCopySql() { (navigator.clipboard?.writeText(APP_SQL) || Promise.reject()).then(() => showToast('✓ SQL disalin — tempel di Supabase → SQL Editor → Run.'), () => prompt('Salin SQL ini:', APP_SQL)); }
function appRecapHtml() {
  if (appErr === 'setup') return `<div class="vs-box"><h3>📲 Pemasangan CAI Hub</h3><div class="vs-note">Pengukuran pemasangan belum diaktifkan. Jalankan SQL ini sekali di Supabase → SQL Editor → Run (butuh SQL Pengunjung Portal sudah ada), lalu muat ulang.</div><button class="gt-btn" style="margin-top:10px" onclick="appCopySql()">📋 Salin SQL Pemasangan</button></div>`;
  if (!appStats) return '';
  const S = appStats, pct = (a, b) => b ? Math.round(a / b * 100) : 0, bar = p => `<div class="app-bar"><i style="width:${Math.min(100, p)}%"></i></div>`;
  const days = typeof visitDays !== 'undefined' ? visitDays : 30;
  return `<div class="vs-box"><h3>📲 Pemasangan CAI Hub · ${days} hari terakhir</h3><div class="vs-cards" style="margin:10px 0 0">
    <div class="vs-card"><div class="vs-k">Dibuka dari ikon</div><b>${fmtNum(S.standalone)}</b><div class="vs-sub">orang · ${pct(S.standalone, S.visitors)}% dari pengunjung</div>${bar(pct(S.standalone, S.visitors))}</div>
    <div class="vs-card"><div class="vs-k">Pasang baru</div><b>${fmtNum(S.install)}</b><div class="vs-sub">Android ${fmtNum(S.install_android)} · iPhone ${fmtNum(S.install_ios)}* · total ${fmtNum(S.total_install)}</div>${bar(pct(S.install, Math.max(S.shown, S.install)))}</div>
    <div class="vs-card"><div class="vs-k">Ajakan ditampilkan</div><b>${fmtNum(S.shown)}</b><div class="vs-sub">ditutup ✕ ${fmtNum(S.dismiss)} · pasang ${fmtNum(S.install)} (${pct(S.install, S.shown)}%)</div>${bar(pct(S.install, S.shown))}</div>
    ${S.qr != null ? `<div class="vs-card"><div class="vs-k">Dari kartu QR toko</div><b>${fmtNum(S.qr)}</b><div class="vs-sub">orang scan kartu · ${fmtNum(S.qr_install)} lalu memasang (${pct(S.qr_install, S.qr)}%)</div>${bar(pct(S.qr_install, S.qr))}</div>` : ''}
  </div><div class="vs-note" style="margin-top:8px">* iPhone tidak memberi tahu situs saat ikon ditambahkan — dihitung saat CAI Hub pertama kali dibuka dari ikonnya. Dihitung per perangkat; akun Admin/Editor tidak dihitung.</div></div>`;
}
