// ── NOTIFIKASI HP (Web Push, gratis) — 4 Nov 2026, permintaan pemilik ──
// Satu langganan per HP (tabel cway_push_subs), dengan pilihan:
//   staff = pengingat Editor/Admin 5 menit SEBELUM Concerto Way terjadwal tayang (kotak "Pengingat tayang", js/cway.js)
//   cway  = partner: "Concerto Way Day n sudah tayang" saat tayang (tanpa judul) — hanya bisa dipilih yang login
//   news  = semua pengunjung: News baru diterbitkan
// Semua lewat Edge Function supabase/functions/cway-push (aksi key/get/set/test/notify + jadwal pg_cron tiap menit).
// sw.js menampilkan notifikasi & membuka link-nya. iPhone: hanya bila CAI Hub dipasang di Layar Utama (iOS 16.4+).
const PUSH_FN = 'cway-push';
const CWAY_PUSH_SQL = `-- Notifikasi HP CAI Hub (Edge Function "cway-push"). 4 Nov 2026, permintaan pemilik:
-- pengingat Editor/Admin 5 menit sebelum Concerto Way tayang + notifikasi partner saat tayang + News baru (semua pengunjung).
-- Jalankan sekali di Supabase → SQL Editor → Run SETELAH fungsi cway-push di-deploy (Verify JWT dimatikan).
-- Sama dengan tombol "📋 Salin SQL Notifikasi" di menu Concerto Way (konstanta CWAY_PUSH_SQL di js/cway.js). Tidak berisi rahasia.
alter table public.concerto_way add column if not exists push_notified_at timestamptz;

create table if not exists public.cway_push_subs (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  user_id uuid default auth.uid(),
  ua text,
  created_at timestamptz default now()
);
-- Jenis notifikasi per HP. Baris lama (dibuat sebelum kolom ini ada) = pengingat Editor/Admin → staff true.
alter table public.cway_push_subs add column if not exists staff boolean default true;
alter table public.cway_push_subs alter column staff set default false;
alter table public.cway_push_subs add column if not exists cway boolean default false;
alter table public.cway_push_subs add column if not exists news boolean default false;
alter table public.concerto_way add column if not exists push_live_at timestamptz;   -- notifikasi partner "sudah tayang" terkirim
alter table if exists public.cai_news add column if not exists push_at timestamptz;   -- notifikasi News terkirim
alter table public.cway_push_subs enable row level security;
drop policy if exists "cway push own" on public.cway_push_subs;
create policy "cway push own" on public.cway_push_subs for all to authenticated
  using (user_id = auth.uid() and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'))
  with check (user_id = auth.uid() and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));

-- Kunci VAPID dibuat otomatis oleh fungsi; RLS tanpa policy = hanya fungsi (service role) yang bisa membaca
create table if not exists public.cway_push_config (id int primary key default 1 check (id = 1), public_key text, private_key text);
alter table public.cway_push_config enable row level security;

create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('cway-push') where exists (select 1 from cron.job where jobname = 'cway-push');
select cron.schedule('cway-push', '* * * * *', $$
  select net.http_post(
    url := 'https://cvffltbxsaiugccexmtf.supabase.co/functions/v1/cway-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);
-- Mematikan jadwal: select cron.unschedule('cway-push');`;
const PN_DISMISS_KEY = 'cai-pn-dismiss';
let pushSt = '?';          // ? | … | ok | unsupported | denied | nosql | nofn | busy
let pushFlags = null;      // { staff, cway, news } milik HP ini (null = belum diketahui)
let pushEp = null;         // endpoint langganan HP ini
let pnSel = null;          // pilihan centang sebelum diaktifkan
const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const pushIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const pushStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
const pushB64 = s => { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const pushKeyStr = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function pushReg() {
  let r = await navigator.serviceWorker.getRegistration();
  if (!r) r = await navigator.serviceWorker.register('sw.js');
  return r.active ? r : navigator.serviceWorker.ready;
}
async function pushCurSub() { try { const r = await navigator.serviceWorker.getRegistration(); return r ? await r.pushManager.getSubscription() : null; } catch (e) { return null; } }
async function pushFn(body) {
  if (typeof supabase === 'undefined' || !supabase) throw Object.assign(new Error('Tidak terhubung ke server'), { net: true });
  const { data, error } = await supabase.functions.invoke(PUSH_FN, { body });
  if (error) {
    const res = error.context, st = res?.status;
    let msg = error.message;
    try { const j = await res.clone().json(); if (j?.error) msg = j.error; } catch (e) {}
    throw Object.assign(new Error(msg), { status: st, nofn: !st || (st === 404 && !/belum terdaftar/.test(msg)) });
  }
  return data;
}
function pushErrState(e) {
  if (/does not exist|column|relation|schema cache|42P01|42703/i.test(e.message || '')) { pushSt = 'nosql'; return true; }
  if (e.nofn) { pushSt = 'nofn'; return true; }
  return false;
}
// Status HP ini: izin, langganan, pilihan di server
async function pushRefresh() {
  if (!pushOk()) { pushSt = 'unsupported'; pushFlags = {}; return pushPaint(); }
  if (Notification.permission === 'denied') { pushSt = 'denied'; pushFlags = {}; return pushPaint(); }
  const sub = await pushCurSub();
  pushEp = sub?.endpoint || null;
  if (!sub || Notification.permission !== 'granted') { pushSt = 'ok'; pushFlags = {}; return pushPaint(); }
  if (typeof supabase === 'undefined' || !supabase) { setTimeout(pushRefresh, 1500); return; }   // tunggu koneksi Supabase siap
  try { const r = await pushFn({ action: 'get', endpoint: sub.endpoint }); pushFlags = r?.flags || {}; pushSt = 'ok'; }
  catch (e) { if (!pushErrState(e)) pushSt = 'ok'; pushFlags = pushFlags || {}; }
  pushPaint();
}
// Pastikan HP berlangganan (izin harus sudah diberikan) → { endpoint, keys }
async function pushEnsureSub() {
  const reg = await pushReg();
  const { key } = await pushFn({ action: 'key' });
  if (!key) throw Object.assign(new Error('kunci kosong'), { nofn: true });
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options?.applicationServerKey && pushKeyStr(sub.options.applicationServerKey) !== key) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushB64(key) });
  const j = sub.toJSON(); pushEp = j.endpoint;
  return j;
}
// Ubah pilihan HP ini. needSub = minta izin & berlangganan dulu (dipanggil langsung dari klik)
async function pushSet(flags, needSub) {
  if (!pushOk()) { pushSt = 'unsupported'; return pushPaint(); }
  if (needSub) {
    const perm = await Notification.requestPermission();   // langsung dari klik (wajib di iPhone)
    if (perm !== 'granted') { pushSt = perm === 'denied' ? 'denied' : 'ok'; return pushPaint(); }
  }
  pushSt = 'busy'; pushPaint();
  try {
    const body = { action: 'set', flags, ua: navigator.userAgent };
    if (needSub || !pushEp) { const j = await pushEnsureSub(); body.endpoint = j.endpoint; body.keys = j.keys; }
    else body.endpoint = pushEp;
    const r = await pushFn(body);
    pushFlags = r?.flags || {}; pushSt = 'ok';
    if (r?.deleted) { const s = await pushCurSub(); if (s) { try { await s.unsubscribe(); } catch (e) {} } pushEp = null; }
    pushPaint();
    return r;
  } catch (e) {
    if (!pushErrState(e)) { pushSt = 'ok'; showToast('⚠ Gagal mengatur notifikasi: ' + (e.message || e), 7000); }
    else if (pushSt === 'nosql' && isAdmin()) pushCopySql();
    pushPaint();
  }
}
async function pushTest() {
  try { const r = await pushFn({ action: 'test', endpoint: pushEp });
    showToast(r?.ok ? '🔔 Tes terkirim — notifikasi muncul dalam beberapa detik' : '⚠ Tes gagal (status ' + (r?.status || '?') + ')', 6000);
  } catch (e) { showToast('⚠ Tes gagal: ' + (e.message || e), 7000); }
}
// Editor/Admin: kirim "sudah tayang"/berita baru setelah menyimpan (sekali per item, dicek server)
function pushNotify(type, id) { if (isAdmin()) pushFn({ action: 'notify', type, id }).catch(() => {}); }
function pushCopySql() {
  (navigator.clipboard?.writeText(CWAY_PUSH_SQL) || Promise.reject()).then(
    () => showToast('📋 SQL notifikasi disalin — tempel di Supabase → SQL Editor → Run', 7000),
    () => prompt('Jalankan SQL ini sekali di Supabase → SQL Editor → Run:', CWAY_PUSH_SQL));
}
function pushPaint() {
  document.querySelectorAll('[data-pn]').forEach(el => { el.outerHTML = pnHtml(el.dataset.pn); });
  const s = document.getElementById('cw-push'); if (s) s.outerHTML = cwPushHtml();
  const inv = document.getElementById('pn-invite'); if (inv) inv.innerHTML = pnHtml('dash');
}
function pushInit() { if (pushSt === '?') { pushSt = '…'; pushRefresh(); } }
const pushUnsupportedMsg = () => pushIos()
  ? 'Di iPhone, notifikasi hanya bisa bila CAI Hub <b>dipasang di Layar Utama</b> (Safari → Bagikan → <i>Tambah ke Layar Utama</i>) lalu dibuka dari ikonnya — iOS 16.4 ke atas.'
  : 'Browser ini belum mendukung notifikasi. Pakai Chrome terbaru, atau pasang CAI Hub di Layar Utama.';

// ── Kotak Editor/Admin: Pengingat tayang (menu Concerto Way) ──
function cwPushHtml() {
  if (!isAdmin()) return '';
  pushInit();
  const st = pushSt, on = !!pushFlags?.staff && st === 'ok';
  const msg = on ? '<b>✅ Aktif di HP ini.</b> Notifikasi masuk 5 menit sebelum Day terjadwal tayang. Ketuk notifikasinya untuk membuka Day itu & membagikannya.'
    : ({ '?': 'Memeriksa…', '…': 'Memeriksa…', busy: 'Menyimpan…', unsupported: pushUnsupportedMsg(),
      denied: 'Izin notifikasi untuk CAI Hub <b>ditolak</b> di HP ini. Izinkan lewat pengaturan browser / HP (Notifikasi → CAI Hub), lalu muat ulang.',
      nosql: 'Tabel/kolom notifikasi belum lengkap. Klik <b>📋 Salin SQL Notifikasi</b>, jalankan sekali di Supabase → SQL Editor → Run, lalu coba lagi.',
      nofn: 'Edge Function <b>cway-push</b> belum di-deploy / belum versi terbaru di Supabase (lihat <code>supabase/functions/cway-push</code>; Verify JWT dimatikan), lalu coba lagi.' }[st]
      || 'Dapat notifikasi di HP ini <b>5 menit sebelum</b> setiap Day yang dijadwalkan tayang — walau CAI Hub sedang tertutup.');
  const btn = on ? `<button class="gt-btn ghost" onclick="pushTest()">🔔 Kirim tes</button><button class="gt-btn ghost" onclick="pushSet({ staff: false })">Matikan</button>`
    : ['ok', 'nosql', 'nofn'].includes(st) ? `<button class="gt-btn" onclick="pushSet({ staff: true }, true)">Aktifkan di HP ini</button>` : '';
  return `<div class="cw-push${on ? ' on' : ''}" id="cw-push"><div class="cw-push-tx"><b class="cw-push-h">🔔 Pengingat tayang <small>· Editor/Admin</small></b><span>${msg}</span></div>
    <div class="cw-push-b">${btn}${st === 'nosql' ? '<button class="gt-btn ghost" onclick="pushCopySql()">📋 Salin SQL Notifikasi</button>' : ''}</div></div>`;
}

// ── Kotak partner/pengunjung: Concerto Way baru tayang + News (Dashboard = ajakan, menu Concerto Way & News = pengaturan) ──
function pnHtml(where) {
  const wrap = h => where === 'dash' ? h : `<div data-pn="${where}">${h}</div>`;
  if (where === 'cway' && (!authUser || isAdmin())) return wrap('');   // Editor/Admin memakai kotak Pengingat tayang
  pushInit();
  const st = pushSt, f = pushFlags || {}, active = st === 'ok' && (f.cway || f.news);
  const canCw = !!authUser;
  if (where === 'dash') {   // ajakan: hanya di CAI Hub yang dibuka dari Layar Utama, belum aktif, belum ditutup
    let dis = false; try { dis = localStorage.getItem(PN_DISMISS_KEY) === '1'; } catch (e) {}
    if (dis || !pushOk() || !pushStandalone() || st !== 'ok' || active || Notification.permission === 'denied') return '';
  }
  if (!pnSel) pnSel = { cway: true, news: true };
  const sel = active ? { cway: !!f.cway, news: !!f.news } : pnSel;
  const chk = (k, ico, lbl, sub) => `<label class="pn-chk"><input type="checkbox" ${sel[k] ? 'checked' : ''} ${st === 'busy' ? 'disabled' : ''} onchange="pnToggle('${k}', this.checked)"><span>${ico} ${lbl}${sub ? ` <small>· ${sub}</small>` : ''}</span></label>`;
  const opts = (canCw ? chk('cway', '☕', 'Concerto Way baru tayang', 'khusus partner') : '') + chk('news', '📰', 'News CAI terbaru');
  let title, text = '', btn = '';
  if (st === 'unsupported') { if (where === 'dash') return ''; title = '🔔 Notifikasi'; text = pushUnsupportedMsg(); }
  else if (st === 'denied') { if (where === 'dash') return ''; title = '🔔 Notifikasi'; text = 'Izin notifikasi untuk CAI Hub <b>ditolak</b> di HP ini. Izinkan lewat pengaturan browser / HP, lalu muat ulang.'; }
  else if (st === 'nofn' || st === 'nosql') { if (where === 'dash' || !isAdmin()) return wrap(''); title = '🔔 Notifikasi'; text = st === 'nosql' ? 'SQL notifikasi belum dijalankan.' : 'Edge Function cway-push belum versi terbaru.'; }
  else if (st === '…' || st === '?') return wrap('');
  else if (active) { title = '🔔 Notifikasi · ✅ aktif di HP ini'; btn = `<button class="gt-btn ghost" onclick="pnOff()">Matikan di HP ini</button>`; }
  else { title = where === 'dash' ? '🔔 Jangan lewatkan materi baru' : '🔔 Notifikasi'; text = `Dapat notifikasi di HP ini saat ${canCw ? 'ada yang baru' : 'ada berita baru'} — walau CAI Hub sedang tertutup.`;
    btn = `<button class="gt-btn" onclick="pnOn()" ${st === 'busy' ? 'disabled' : ''}>${st === 'busy' ? 'Mengaktifkan…' : 'Aktifkan notifikasi'}</button>`; }
  const showOpts = !['unsupported', 'denied', 'nofn', 'nosql'].includes(st);
  return wrap(`<div class="pn-box${active ? ' on' : ''}${where === 'dash' ? ' invite' : ''}">${where === 'dash' ? '<button class="pn-x" onclick="pnDismiss()" aria-label="Tutup">✕</button>' : ''}
    <b class="pn-h">${title}</b>${text ? `<p>${text}</p>` : ''}${showOpts ? `<div class="pn-opts">${opts}</div>` : ''}${btn ? `<div class="pn-b">${btn}</div>` : ''}</div>`);
}
function pnToggle(k, v) {
  if (pushSt === 'ok' && (pushFlags?.cway || pushFlags?.news)) pushSet({ [k]: v });
  else { pnSel = { ...(pnSel || { cway: true, news: true }), [k]: v }; }
}
function pnOn() {
  const s = pnSel || { cway: true, news: true };
  const flags = { cway: !!authUser && s.cway, news: s.news };
  if (!flags.cway && !flags.news) return showToast('Centang minimal satu jenis notifikasi.');
  pushSet(flags, true).then(r => { if (r && !r.deleted) showToast('✅ Notifikasi aktif di HP ini'); });
}
function pnOff() { pushSet({ cway: false, news: false }).then(r => { if (r) showToast('Notifikasi dimatikan di HP ini'); }); }
function pnDismiss() { try { localStorage.setItem(PN_DISMISS_KEY, '1'); } catch (e) {} const el = document.getElementById('pn-invite'); if (el) el.innerHTML = ''; }
