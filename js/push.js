// ── NOTIFIKASI HP (Web Push, gratis) — 4 Nov 2026, permintaan pemilik ──
// Satu langganan per HP (tabel cway_push_subs), dengan pilihan:
//   staff = pengingat khusus Editor 5 menit SEBELUM Concerto Way terjadwal tayang (kotak "Pengingat tayang", js/cway.js)
//   cway  = partner: "Concerto Way Day n sudah tayang" saat tayang (tanpa judul) — hanya bisa dipilih yang login
//   news  = semua pengunjung: News baru diterbitkan
//   acad  = semua pengunjung: materi Concerto Academy baru tayang (4 Nov 2026)
//   guide = partner yang login: Panduan Partner baru tayang (tanpa judul di layar kunci)
//   stock = partner yang login: produk yang DIPANTAU HP ini sudah Ready lagi (tombol 🔔 di halaman produk / menu Stok; tabel stock_watch)
//   gallery = semua pengunjung: instalasi baru di Galeri tayang · product = semua: pengumuman produk baru dari Editor
//   (staff juga dipakai untuk pengingat Editor 5 menit sebelum Galeri / pengumuman produk / Academy / Panduan terjadwal — 4 Nov 2026)
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
alter table public.cway_push_subs add column if not exists acad boolean default false;   -- notifikasi materi Academy baru
create table if not exists public.academy_push (no int primary key, sent_at timestamptz default now());   -- materi Academy yang sudah dikirimi notifikasi
alter table public.academy_push enable row level security;
alter table public.cway_push_subs add column if not exists guide boolean default false;   -- notifikasi Panduan Partner baru (khusus partner login)

-- Panduan Partner terjadwal (4 Nov 2026): PDF disimpan dulu di folder tunggu guides/pending/ (hanya Editor yang bisa membaca),
-- lalu dipindah Edge Function cway-push ke folder kartunya pada jam tayang.
create table if not exists public.guide_schedule (
  id uuid primary key default gen_random_uuid(),
  folder text not null,
  src text not null,            -- pending/<folder>/<file>.pdf
  dest text not null,           -- <folder>/<file>.pdf
  title text,
  publish_at timestamptz not null,
  done_at timestamptz,
  error text,
  created_at timestamptz default now(),
  created_by uuid default auth.uid()
);
alter table public.guide_schedule enable row level security;
drop policy if exists "guide schedule editor" on public.guide_schedule;
create policy "guide schedule editor" on public.guide_schedule for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');

-- Storage bucket guides: aturan PEMBATAS (restrictive) — ditambahkan di atas izin yang sudah ada, tidak menggantinya.
-- 1) Folder tunggu pending/ hanya bisa dibaca Editor.  2) PDF panduan hanya bisa ditulis/dihapus Editor
--    (folder gathering/ (PKS, flier, lagu) & thumbs/ (sampul) tetap mengikuti izin lama Admin/Editor).
drop policy if exists "guides pending editor only" on storage.objects;
create policy "guides pending editor only" on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'guides' or name not like 'pending/%' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
drop policy if exists "guides insert editor only" on storage.objects;
create policy "guides insert editor only" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'guides' or name like 'gathering/%' or name like 'thumbs/%' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
drop policy if exists "guides update editor only" on storage.objects;
create policy "guides update editor only" on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'guides' or name like 'gathering/%' or name like 'thumbs/%' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  with check (bucket_id <> 'guides' or name like 'gathering/%' or name like 'thumbs/%' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
drop policy if exists "guides delete editor only" on storage.objects;
create policy "guides delete editor only" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'guides' or name like 'gathering/%' or name like 'thumbs/%' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');

-- ── 4 Nov 2026 (permintaan pemilik): 📦 Stok pantauan (partner) · 🚗 Galeri Instalasi baru · 🆕 Produk baru (publik)
--    + pengingat Editor 5 menit sebelum SEMUA konten terjadwal (Galeri, pengumuman produk, Academy, Panduan) ──
alter table public.cway_push_subs add column if not exists stock boolean default false;     -- 📦 produk pantauan HP ini sudah Ready
alter table public.cway_push_subs add column if not exists gallery boolean default false;   -- 🚗 Galeri Instalasi baru
alter table public.cway_push_subs add column if not exists product boolean default false;   -- 🆕 Produk baru (pengumuman Editor)

-- 📦 Daftar produk yang dipantau per HP (akun partner bersama → disimpan per HP, bukan per akun). Hanya lewat Edge Function.
create table if not exists public.stock_watch (
  endpoint text not null references public.cway_push_subs(endpoint) on delete cascade,
  product_id text not null,
  name text,
  created_at timestamptz default now(),
  primary key (endpoint, product_id)
);
alter table public.stock_watch enable row level security;
-- Antrian "baru Ready": diisi trigger tabel stok (sinkron Google Sheet, import, panel admin), dikirim jadwal cway-push tiap menit
create table if not exists public.stock_ready_q (product_id text primary key, at timestamptz default now());
alter table public.stock_ready_q enable row level security;
create or replace function public.stock_ready_mark() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if new.product_id not like 'v:%' and new.status = 'ready' and coalesce(new.qty, 1) > 0
     and (tg_op = 'INSERT' or old.status is distinct from 'ready' or coalesce(old.qty, 1) <= 0) then
    insert into public.stock_ready_q (product_id) values (new.product_id) on conflict (product_id) do update set at = now();
  end if;
  return new;
end $f$;
drop trigger if exists stock_ready_mark on public.stock;
create trigger stock_ready_mark after insert or update on public.stock for each row execute function public.stock_ready_mark();

-- 🚗 Galeri Instalasi: jadwal tayang + notifikasi. Sebelum publish_at, mobil dikunci (hanya Admin/Editor yang bisa membaca).
alter table public.showcase_installs add column if not exists publish_at timestamptz;
alter table public.showcase_installs add column if not exists notify boolean not null default true;
alter table public.showcase_installs add column if not exists push_at timestamptz;     -- notifikasi publik terkirim
alter table public.showcase_installs add column if not exists remind_at timestamptz;   -- pengingat Editor terkirim
drop policy if exists "showcase read" on public.showcase_installs;
create policy "showcase read" on public.showcase_installs for select
  using ((published and (publish_at is null or publish_at <= now())) or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));

-- 🆕 Pengumuman produk (Editor): kirim sekarang / terjadwal
create table if not exists public.product_push (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  kind text,                    -- new | soon | avail
  title text not null,
  body text,
  image text,
  publish_at timestamptz not null default now(),
  sent_at timestamptz,
  remind_at timestamptz,
  created_at timestamptz default now(),
  created_by uuid default auth.uid()
);
alter table public.product_push enable row level security;
drop policy if exists "product push editor" on public.product_push;
create policy "product push editor" on public.product_push for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');

-- ⏰ Pengingat Editor 5 menit sebelum tayang: Panduan & Academy
alter table public.guide_schedule add column if not exists remind_at timestamptz;
create table if not exists public.academy_remind (no int primary key, sent_at timestamptz default now());
alter table public.academy_remind enable row level security;

-- 🗓 Ringkasan mingguan (Tahap 6 C, 4 Nov 2026): Senin 08.00 WIB, satu notifikasi berisi semua yang baru 7 hari terakhir.
-- Bawaan aktif — termasuk HP yang sudah berlangganan (pilihan pemilik "a"); bisa dimatikan di menu Setting.
alter table public.cway_push_subs add column if not exists weekly boolean not null default true;
-- ⏰ Pengingat Editor: waktu dipilih per HP (4 Nov 2026) — { all: [60, 5], live: true, cway?: [...], gallery?: [...], acad?, guide?, product? }
alter table public.cway_push_subs add column if not exists remind jsonb;
create table if not exists public.staff_remind_log (kind text not null, ref text not null, lead int not null, at timestamptz not null default now(), primary key (kind, ref, lead));
alter table public.staff_remind_log enable row level security;   -- tanpa policy: hanya Edge Function

create table if not exists public.weekly_push (week date primary key, sent_at timestamptz default now(), counts jsonb);
alter table public.weekly_push enable row level security;

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
let pushFlags = null;      // { staff, cway, news, acad, guide } milik HP ini (null = belum diketahui)
let pushEp = null;         // endpoint langganan HP ini
let pushRemind = null, pushRemindCol = true;   // ⏰ pilihan waktu pengingat Editor di HP ini (kolom remind) · false = SQL belum dijalankan
let pnSel = null;          // pilihan centang sebelum diaktifkan
const PN_KEYS = ['weekly', 'cway', 'guide', 'stock', 'news', 'acad', 'product', 'gallery'];   // weekly = 🗓 Ringkasan mingguan (Tahap 6 C)   // pilihan kotak 🔔 Notifikasi (selain staff)
const PN_DEF = () => Object.fromEntries(PN_KEYS.map(k => [k, true]));
const pnActive = f => pushSt === 'ok' && PN_KEYS.some(k => f?.[k]);
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
  try { const r = await pushFn({ action: 'get', endpoint: sub.endpoint }); pushFlags = r?.flags || {}; pushRemind = r?.remind || null; pushRemindCol = r?.remindCol !== false; pushSt = 'ok'; if (authUser) swLoad(true); }
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
function pushNotify(type, id) { if (isEditor()) pushFn({ action: 'notify', type, id }).catch(() => {}); }   // id = array nomor materi untuk 'acad'
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

// ── Kotak Editor: Pengingat tayang (menu Concerto Way) — khusus Editor (4 Nov 2026, permintaan pemilik; Admin staff tidak) ──
function cwPushHtml() {
  if (!isEditor()) return '';
  pushInit();
  const st = pushSt, on = !!pushFlags?.staff && st === 'ok';
  const msg = on ? `<b>✅ Aktif di HP ini</b> — diingatkan ${rmSummary()} sebelum konten terjadwal tayang (Concerto Way, Galeri, pengumuman produk, Academy & Panduan Partner). Ketuk notifikasinya untuk membuka & mengecek.`
    : ({ '?': 'Memeriksa…', '…': 'Memeriksa…', busy: 'Menyimpan…', unsupported: pushUnsupportedMsg(),
      denied: 'Izin notifikasi untuk CAI Hub <b>ditolak</b> di HP ini. Izinkan lewat pengaturan browser / HP (Notifikasi → CAI Hub), lalu muat ulang.',
      nosql: 'Tabel/kolom notifikasi belum lengkap. Klik <b>📋 Salin SQL Notifikasi</b>, jalankan sekali di Supabase → SQL Editor → Run, lalu coba lagi.',
      nofn: 'Edge Function <b>cway-push</b> belum di-deploy / belum versi terbaru di Supabase (lihat <code>supabase/functions/cway-push</code>; Verify JWT dimatikan), lalu coba lagi.' }[st]
      || 'Dapat notifikasi di HP ini sebelum setiap konten terjadwal tayang (Concerto Way, Galeri, pengumuman produk, Academy, Panduan) — waktunya bisa Anda pilih (1 hari sampai 5 menit sebelumnya), walau CAI Hub sedang tertutup.');
  const btn = on ? `<button class="gt-btn ghost" onclick="pushTest()">🔔 Kirim tes</button><button class="gt-btn ghost" onclick="pushSet({ staff: false })">Matikan</button>`
    : ['ok', 'nosql', 'nofn'].includes(st) ? `<button class="gt-btn" onclick="pushSet({ staff: true }, true)">Aktifkan di HP ini</button>` : '';
  return `<div class="cw-push${on ? ' on' : ''}" id="cw-push"><div class="cw-push-tx"><b class="cw-push-h">🔔 Pengingat tayang <small>· khusus Editor</small></b><span>${msg}</span></div>
    <div class="cw-push-b">${btn}${st === 'nosql' ? '<button class="gt-btn ghost" onclick="pushCopySql()">📋 Salin SQL Notifikasi</button>' : ''}</div>${on ? rmHtml() : ''}</div>`;
}

/* ⏰ Waktu pengingat tayang Editor (4 Nov 2026, permintaan pemilik — pratinjau .mockup/remind/, cara 1): dipilih per HP, boleh lebih dari satu,
   + "✅ sudah tayang", + opsional berbeda per menu. Disimpan lewat aksi Edge Function `remind` (kolom cway_push_subs.remind). */
const RM_LEADS = [[1440, '1 hari', '1 hari'], [180, '3 jam', '3 jam'], [60, '1 jam', '1 jam'], [30, '30 menit', '30 mnt'], [15, '15 menit', '15 mnt'], [5, '5 menit', '5 mnt']];
const RM_KINDS = [['cway', '☕ Concerto Way'], ['gallery', '🚗 Galeri'], ['acad', '🎓 Academy'], ['guide', '📘 Panduan'], ['product', '🆕 Produk']];
let rmOpen = false;
const rmCur = () => ({ all: [5], live: false, ...(pushRemind || {}) });
const rmLeads = (r, k) => Array.isArray(r[k]) ? r[k] : r.all;
function rmSummary() {
  const r = rmCur(), t = r.all.length ? RM_LEADS.filter(x => r.all.includes(x[0])).map(x => `<b>${x[1]}</b>`).join(' &amp; ') : '<b>tidak</b>';
  return t + (RM_KINDS.some(([k]) => Array.isArray(r[k])) ? ' (beberapa menu diatur berbeda)' : '');
}
function rmHtml() {
  if (!pushRemindCol) return `<div class="rm-box"><div class="rm-note">Untuk memilih waktu pengingat (1 hari · 3 jam · 1 jam · 30 · 15 · 5 menit), jalankan dulu SQL notifikasi terbaru sekali di Supabase → SQL Editor → Run, lalu deploy ulang Edge Function <b>cway-push</b>. Sampai itu, pengingat tetap 5 menit sebelum tayang.<br><button class="gt-btn ghost" onclick="pushCopySql()">📋 Salin SQL Notifikasi</button></div></div>`;
  const r = rmCur();
  const chip = (k, L, label) => { const on = rmLeads(r, k).includes(L);
    return `<button type="button" class="rm-chip${on ? ' sel' : ''}" onclick="rmToggle('${k}', ${L})" aria-pressed="${on}"><i>${on ? '✓' : ''}</i>${label}</button>`; };
  const per = RM_KINDS.map(([k, n]) => `<div class="rm-row"><span>${n}${Array.isArray(r[k]) ? '' : ' <small>ikut umum</small>'}</span><div>${RM_LEADS.map(([L, , s]) => chip(k, L, s)).join('')}
      ${Array.isArray(r[k]) ? `<button type="button" class="rm-reset" onclick="rmReset('${k}')" title="Kembali ikut pilihan umum">↺</button>` : ''}</div></div>`).join('');
  return `<div class="rm-box">
    <div class="rm-lbl">Ingatkan saya</div>
    <div class="rm-chips">${RM_LEADS.map(([L, t]) => chip('all', L, t + (L === 1440 ? ' sebelum' : ''))).join('')}</div>
    <label class="rm-live"><input type="checkbox" ${r.live ? 'checked' : ''} onchange="rmLive(this.checked)"> Juga kabari saya <b>saat sudah tayang</b> ✅</label>
    <details class="rm-per" ${rmOpen ? 'open' : ''} ontoggle="rmOpen = this.open"><summary>Atur berbeda per menu <small>(opsional)</small></summary>${per}</details>
    <div class="rm-note">Tersimpan langsung saat diklik dan <b>ikut akun</b> — berlaku untuk semua HP/perangkat Editor yang pengingatnya aktif${rmDevices > 1 ? ` (${rmDevices} perangkat)` : ''}; perangkat Editor yang baru mengaktifkan pengingat otomatis memakai pilihan ini. Konten yang dijadwalkan lebih dekat dari waktu pengingat (mis. tayang 20 menit lagi, pengingat 1 jam) → pengingat itu dilewati; yang lebih dekat tetap dikirim.</div></div>`;
}
let rmBusy = null, rmDevices = 0;
async function rmSave(next) {
  const prev = pushRemind; pushRemind = next; pushPaint();
  const my = rmBusy = {};
  try { const r = await pushFn({ action: 'remind', endpoint: pushEp, remind: next }); if (rmBusy === my && r?.remind) { pushRemind = r.remind; rmDevices = r.devices || 0; pushPaint(); } }
  catch (e) { pushRemind = prev; if (/remind|column/i.test(e.message || '')) pushRemindCol = false; else showToast('⚠ Gagal menyimpan pengingat: ' + (e.message || e), 6000); pushPaint(); }
}
function rmToggle(k, L) {
  const r = rmCur(), cur = [...rmLeads(r, k)], i = cur.indexOf(L);
  if (i >= 0) cur.splice(i, 1); else cur.push(L);
  rmSave({ ...r, [k]: cur.sort((a, b) => b - a) });
}
function rmReset(k) { const r = { ...rmCur() }; delete r[k]; rmSave(r); }
function rmLive(on) { rmSave({ ...rmCur(), live: !!on }); }

// ── Kotak partner/pengunjung: Concerto Way baru tayang + News (Dashboard = ajakan, menu Concerto Way & News = pengaturan) ──
function pnHtml(where) {
  const wrap = h => where === 'dash' ? h : `<div data-pn="${where}">${h}</div>`;
  if (where !== 'dash' && where !== 'settings') return wrap(pnLinkHtml(where));   // menu lain: tautan kecil ke menu Setting (4 Nov 2026)
  if ((where === 'cway' && (!authUser || isEditor())) || ((where === 'guides' || where === 'stock') && !authUser)) return wrap('');   // Concerto Way: Editor memakai kotak Pengingat tayang (Admin staff = seperti partner)
  pushInit();
  const st = pushSt, f = pushFlags || {}, active = pnActive(f);
  const canCw = !!authUser && !isEditor();   // Editor sudah punya Pengingat tayang 5 menit
  const canGd = !!authUser;                   // 📘 Panduan: partner yang login + Editor (permintaan pemilik 4 Nov 2026)
  if (where === 'dash') {   // ajakan: hanya di CAI Hub yang dibuka dari Layar Utama, belum aktif, belum ditutup
    let dis = false; try { dis = localStorage.getItem(PN_DISMISS_KEY) === '1'; } catch (e) {}
    if (dis || !pushOk() || !pushStandalone() || st !== 'ok' || active || Notification.permission === 'denied') return '';
  }
  if (!pnSel) pnSel = PN_DEF();
  const sel = active ? Object.fromEntries(PN_KEYS.map(k => [k, !!f[k]])) : pnSel;
  const chk = (k, ico, lbl, sub) => `<label class="pn-chk"><input type="checkbox" ${sel[k] ? 'checked' : ''} ${st === 'busy' ? 'disabled' : ''} onchange="pnToggle('${k}', this.checked)"><span>${ico} ${lbl}${sub ? ` <small>· ${sub}</small>` : ''}</span></label>`;
  const opts = chk('weekly', '🗓', 'Ringkasan mingguan', 'Senin 08.00 · semua yang baru dalam satu notifikasi') + (canCw ? chk('cway', '☕', 'Concerto Way baru tayang', 'khusus partner') : '') + (canGd ? chk('guide', '📘', 'Panduan Partner baru', 'khusus partner') + chk('stock', '📦', 'Stok produk pantauan', 'khusus partner') : '')
    + chk('news', '📰', 'News CAI terbaru') + chk('acad', '🎓', 'Materi Academy baru') + chk('product', '🆕', 'Produk baru') + chk('gallery', '🚗', 'Galeri Instalasi baru');
  let title, text = '', btn = '';
  if (st === 'unsupported') { if (where === 'dash') return ''; title = '🔔 Notifikasi'; text = pushUnsupportedMsg(); }
  else if (st === 'denied') { if (where === 'dash') return ''; title = '🔔 Notifikasi'; text = 'Izin notifikasi untuk CAI Hub <b>ditolak</b> di HP ini. Izinkan lewat pengaturan browser / HP, lalu muat ulang.'; }
  else if (st === 'nofn' || st === 'nosql') { if (where === 'dash' || !isAdmin()) return wrap(''); title = '🔔 Notifikasi'; text = st === 'nosql' ? 'SQL notifikasi belum dijalankan.' : 'Edge Function cway-push belum versi terbaru.'; }
  else if (st === '…' || st === '?') return wrap('');
  else if (active) { title = '🔔 Notifikasi · ✅ aktif di HP ini'; btn = `<button class="gt-btn ghost" onclick="pnOff()">Matikan di HP ini</button>`; }
  else { title = where === 'dash' ? '🔔 Jangan lewatkan materi baru' : '🔔 Notifikasi'; text = 'Dapat notifikasi di HP ini saat ada yang baru — walau CAI Hub sedang tertutup.';
    btn = `<button class="gt-btn" onclick="pnOn()" ${st === 'busy' ? 'disabled' : ''}>${st === 'busy' ? 'Mengaktifkan…' : 'Aktifkan notifikasi'}</button>`; }
  const showOpts = !['unsupported', 'denied', 'nofn', 'nosql'].includes(st);
  return wrap(`<div class="pn-box${active ? ' on' : ''}${where === 'dash' ? ' invite' : ''}">${where === 'dash' ? '<button class="pn-x" onclick="pnDismiss()" aria-label="Tutup">✕</button>' : ''}
    <b class="pn-h">${title}</b>${text ? `<p>${text}</p>` : ''}${showOpts ? `<div class="pn-opts">${opts}</div>` : ''}${btn ? `<div class="pn-b">${btn}</div>` : ''}</div>${where === 'settings' ? swListHtml() : ''}`);
}
// Tautan kecil di News / Academy / Concerto Way / Panduan / Stok → menu Setting (semua pengaturan notifikasi di satu tempat)
function pnLinkHtml(where) {
  pushInit();
  const on = pushSt === 'ok' && (pnActive(pushFlags) || (isEditor() && !!pushFlags?.staff));
  // Sudah aktif → tautan disembunyikan (atur lewat menu Setting); belum aktif → ajakan kecil (4 Nov 2026, permintaan pemilik)
  const h = on || ['?', '…'].includes(pushSt) ? '' : `<button class="pn-link" onclick="openSettings()"><span>🔔</span><b>Mau dikabari saat ada yang baru?</b><em>Aktifkan di Setting ›</em></button>`;
  return h + (where === 'stock' ? swListHtml() : '');
}
function pnToggle(k, v) {
  if (pnActive(pushFlags)) pushSet({ [k]: v });
  else { pnSel = { ...(pnSel || PN_DEF()), [k]: v }; }
}
function pnOn() {
  const s = pnSel || PN_DEF();
  const part = !!authUser && !isEditor();
  const flags = { ...Object.fromEntries(PN_KEYS.map(k => [k, !!s[k]])), cway: part && s.cway, guide: !!authUser && s.guide, stock: !!authUser && s.stock };
  if (!PN_KEYS.some(k => flags[k])) return showToast('Centang minimal satu jenis notifikasi.');
  pushSet(flags, true).then(r => { if (r && !r.deleted) showToast('✅ Notifikasi aktif di HP ini'); });
}
function pnOff() { pushSet(Object.fromEntries(PN_KEYS.map(k => [k, false]))).then(r => { if (r) showToast('Notifikasi dimatikan di HP ini'); }); }
function pnDismiss() { try { localStorage.setItem(PN_DISMISS_KEY, '1'); } catch (e) {} const el = document.getElementById('pn-invite'); if (el) el.innerHTML = ''; }


// ── 📦 Kabari saya bila stok ready (4 Nov 2026, permintaan pemilik — khusus partner yang login) ──
// Daftar pantauan disimpan per HP di tabel stock_watch lewat Edge Function (aksi watch / watches). Trigger tabel stok mengisi
// antrian stock_ready_q saat produk berubah menjadi Ready; jadwal cway-push tiap menit mengirim notifikasi lalu menghapus pantauannya.
let swList = null, swLoading = null;
const swHas = pid => !!swList?.some(x => x.product_id === pid);
const swEligible = s => !!s && (s.status === 'habis' || s.status === 'indent');
function swLoad(force) {
  if (!authUser || !pushEp || typeof supabase === 'undefined' || !supabase) { if (!pushEp) swList = []; return Promise.resolve(); }
  if (swLoading && !force) return swLoading;
  swLoading = pushFn({ action: 'watches', endpoint: pushEp }).then(r => { swList = r?.items || []; }, () => { swList = swList || []; })
    .finally(() => { swLoading = null; swPaint(); });
  return swLoading;
}
function swName(pid) { const r = findProductAny(pid); return r.product ? `${r.brand.name} ${r.product.name}` : pid; }
async function swToggle(pid) {
  if (!authUser) { requireLogin(() => swToggle(pid)); return; }
  const on = !swHas(pid);
  if (on && !(pushSt === 'ok' && pushEp && pushFlags?.stock)) {
    if (!pushOk()) { showToast(pushIos() ? 'Di iPhone, pasang CAI Hub di Layar Utama lalu buka dari ikonnya untuk memakai notifikasi.' : 'Browser ini belum mendukung notifikasi.', 7000); return; }
    const r = await pushSet({ stock: true }, true);   // minta izin & berlangganan (langsung dari klik)
    if (!r || !pushFlags?.stock) { if (pushSt === 'denied') showToast('Izin notifikasi ditolak — izinkan lewat pengaturan HP, lalu coba lagi.', 7000); return; }
  }
  try {
    const r = await pushFn({ action: 'watch', endpoint: pushEp, product_id: pid, name: swName(pid), on });
    swList = r?.items || [];
    showToast(on ? `🔔 Anda akan dikabari begitu ${swName(pid)} Ready` : `Pantauan ${swName(pid)} dibatalkan`, 5000);
  } catch (e) { if (!pushErrState(e)) showToast('⚠ ' + (e.message || e), 7000); else if (isAdmin()) pushCopySql(); }
  swPaint();
}
function swBtnHtml(pid) {
  if (!authUser || pid.startsWith(EXTRA_PREFIX)) return '';
  const on = swHas(pid);
  if (!on && !swEligible(stockShown(pid))) return '';
  return `<button class="sw-btn${on ? ' on' : ''}" onclick="event.stopPropagation(); swToggle('${pid}')">${on ? '✓ Dipantau — dikabari bila Ready <small>· batal</small>' : '🔔 Kabari saya bila ready'}</button>
    <div class="sw-hint">${on ? 'Lihat semua pantauan di menu Stok Produk → 🔔 Dipantau.' : 'Notifikasi dikirim ke HP ini begitu stok tersedia.'}</div>`;
}
function swBellHtml(pid) {
  if (!authUser || pid.startsWith(EXTRA_PREFIX)) return '';
  const on = swHas(pid);
  if (!on && !swEligible(stockShown(pid))) return '';
  return `<button class="sw-bell${on ? ' on' : ''}" title="${on ? 'Dipantau — ketuk untuk batal' : 'Kabari saya bila ready'}" onclick="event.stopPropagation(); swToggle('${pid}')">🔔</button>`;
}
function swListHtml() {
  if (!authUser || !swList?.length) return '';
  return `<div class="sw-list"><b>🔔 Produk dipantau <small>· ${swList.length}</small></b>${swList.map(x => { const r = findProductAny(x.product_id), s = stockShown(x.product_id);
    return `<div class="sw-it">${r.product?.photo ? `<img src="${r.product.photo}" alt="">` : `<span class="sw-em">${r.product?.emoji || '📦'}</span>`}<div>${escHtml(r.product?.name || x.name || x.product_id)}<small>${escHtml([r.brand?.name, s ? (STOCK_LABEL[s.status] || s.status) : ''].filter(Boolean).join(' · '))}</small></div><button onclick="swToggle('${x.product_id}')" aria-label="Hapus">✕</button></div>`; }).join('')}
    <div class="sw-note">Pantauan selesai otomatis setelah Anda dikabari.</div></div>`;
}
function swPaint() {
  if (typeof currentProductId !== 'undefined' && currentProductId && document.getElementById('panel-stock-badge')) renderProductStockBadge(currentProductId);
  if (document.getElementById('view-stock')?.classList.contains('active')) renderStockView();
  document.querySelectorAll('[data-pn="stock"], [data-pn="settings"]').forEach(el => { el.outerHTML = pnHtml(el.dataset.pn); });
}

// ── 🆕 Umumkan produk (4 Nov 2026, permintaan pemilik — khusus Editor) ──
// Data katalog ada di repo, jadi produk tidak dijadwalkan dari portal; yang dijadwalkan adalah PENGUMUMANNYA (tabel product_push).
// Kirim sekarang = Edge Function langsung mengirim; ⏰ Jadwalkan = jadwal cway-push tiap menit (Editor dapat pengingat 5 menit sebelumnya).
// Isi hanya nama, brand, kategori, status & SRP — tidak pernah harga dealer.
let paForm = null;
const paWhen = iso => new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':') + ' WIB';
function paText(kind, r) {
  const p = r.product, b = r.brand;
  const title = kind === 'avail' ? `✅ Kini tersedia: ${b.name} ${p.name}` : `🆕 Produk baru ${b.name}: ${p.name}`;
  const body = [p.category, r.line, p.soon && kind !== 'avail' ? 'Coming Soon' : '', hasPrice(p) ? 'SRP ' + srpText(p) : ''].filter(Boolean).join(' · ') + '. Ketuk untuk melihat.';
  return { title, body };
}
async function openProdAnn() {
  if (!isEditor() || !currentProductId) return;
  const r = findProductAny(currentProductId); if (!r.product) return;
  const kind = 'new', t = paText(kind, r), tom = new Date(Date.parse(todayWIB() + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
  paForm = { pid: r.product.id, r, kind, ...t, mode: 'now', sd: tom, st: '10:00', list: null, busy: false };
  let ov = document.getElementById('pa-form');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'pa-form'; ov.className = 'rk-pick gl-ov';
    ov.onclick = e => { if (e.target === ov) closeProdAnn(); };
    ov.innerHTML = '<div class="rk-pick-box pa-box" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(ov);
  }
  renderProdAnn(); ov.classList.add('open');
  try { const { data, error } = await supabase.from('product_push').select('id, kind, title, publish_at, sent_at').eq('product_id', paForm.pid).order('publish_at', { ascending: false });
    if (paForm) { paForm.list = error ? [] : data || []; paForm.missing = !!error; renderProdAnn(); } } catch (e) {}
}
function closeProdAnn() { paForm = null; document.getElementById('pa-form')?.classList.remove('open'); }
const paIso = f => f.mode === 'sched' && f.sd && f.st ? new Date(`${f.sd}T${f.st}:00+07:00`).toISOString() : null;
function paSet(k, v) {
  const f = paForm; if (!f) return; f[k] = v;
  if (k === 'kind') Object.assign(f, paText(v, f.r));
  if (k === 'kind' || k === 'mode') renderProdAnn(); else paPrev();
}
function paPrev() {
  const f = paForm; if (!f) return;
  const pv = document.getElementById('pa-prev'); if (pv) pv.innerHTML = `<img src="assets/icons/icon-192.png" alt=""><div><b>${escHtml(f.title)}</b>${escHtml(f.body)}</div>`;
  const iso = paIso(f), past = iso && Date.parse(iso) <= Date.now(), n = document.getElementById('pa-note'), btn = document.getElementById('pa-save');
  if (n) n.innerHTML = f.mode === 'now' || past ? `${past ? '⚠ Waktu ini sudah lewat — ' : ''}Dikirim ke semua HP yang mencentang <b>🆕 Produk baru</b> begitu Anda menekan Kirim.`
    : `Dikirim otomatis <b>${escHtml(paWhen(iso))}</b>. Editor mendapat pengingat sesuai pilihan di Setting.`;
  if (btn && !f.busy) btn.textContent = f.mode === 'sched' && !past ? '⏰ Jadwalkan' : '📣 Kirim sekarang';
}
function renderProdAnn() {
  const f = paForm, box = document.querySelector('#pa-form .rk-pick-box'); if (!f || !box) return;
  const p = f.r.product, seg = (k, v, t) => `<button type="button" class="${f[k] === v ? 'on' : ''}" onclick="paSet('${k}','${v}')">${t}</button>`;
  const sent = (f.list || []).filter(x => x.sent_at), wait = (f.list || []).filter(x => !x.sent_at);
  box.innerHTML = `<div class="rk-pick-hd"><div class="rk-pick-t">📣 Umumkan produk</div><button class="rk-pick-x" onclick="closeProdAnn()" aria-label="Tutup">✕</button></div>
    <div class="pa">
      <div class="pa-sub">${escHtml(p.name)} · ${escHtml(f.r.brand.name)}${p.soon ? ' · <span class="eol-tag soon-tag">COMING SOON</span>' : ''}</div>
      ${f.missing ? `<div class="vs-warn">Tabel pengumuman produk belum ada. <button class="gt-btn ghost" onclick="pushCopySql()">📋 Salin SQL Notifikasi</button> — jalankan sekali di Supabase → SQL Editor.</div>` : ''}
      ${sent.length ? `<div class="pa-warn">⚠ Produk ini sudah pernah diumumkan: ${sent.map(x => `<b>${escHtml(x.title)}</b> (${escHtml(paWhen(x.sent_at))})`).join(', ')}.</div>` : ''}
      ${wait.length ? `<div class="pa-queue"><b>⏰ Terjadwal</b>${wait.map(x => `<div class="pa-qi"><span>${escHtml(paWhen(x.publish_at))}</span><span>${escHtml(x.title)}</span><button class="gt-btn ghost gt-del" onclick="paDelete('${x.id}')">🗑</button></div>`).join('')}</div>` : ''}
      <div class="cwf-h">Jenis</div><div class="cwf-seg">${seg('kind', 'new', '🆕 Produk baru')}${seg('kind', 'avail', '✅ Kini tersedia')}</div>
      <label class="cwf-l">Judul notifikasi<input value="${escHtml(f.title)}" maxlength="80" oninput="paSet('title',this.value)"></label>
      <label class="cwf-l">Isi<textarea rows="2" maxlength="160" oninput="paSet('body',this.value)">${escHtml(f.body)}</textarea></label>
      <div class="cwf-h">Kirim</div><div class="cwf-seg">${seg('mode', 'now', 'Sekarang')}${seg('mode', 'sched', '⏰ Jadwalkan')}</div>
      ${f.mode === 'sched' ? `<div class="cwf-row"><label>Tanggal<input type="date" value="${escHtml(f.sd)}" min="${todayWIB()}" oninput="paSet('sd',this.value)"></label><label>Jam (WIB)<input type="time" value="${escHtml(f.st)}" step="300" oninput="paSet('st',this.value)"></label></div>` : ''}
      <div class="cwf-snote" id="pa-note"></div>
      <div class="cwf-h">Pratinjau</div><div class="pa-prev" id="pa-prev"></div>
      <div class="gl-hint">Hanya SRP & status — jangan menulis harga dealer / diskon. Android ikut menampilkan foto produk.</div>
    </div>
    <div class="acf-foot"><button class="gt-btn ghost" onclick="closeProdAnn()">Batal</button><button class="gt-btn" id="pa-save" onclick="saveProdAnn()"${f.busy ? ' disabled' : ''}>📣 Kirim sekarang</button></div>`;
  paPrev();
}
async function saveProdAnn() {
  const f = paForm; if (!f || f.busy || !isEditor()) return;
  if (!f.title.trim()) { showToast('Isi judul notifikasi dulu.'); return; }
  const iso = paIso(f), later = iso && Date.parse(iso) > Date.now() + 30e3;
  if (f.list?.some(x => x.sent_at) && !confirm('Produk ini sudah pernah diumumkan. Kirim pengumuman lagi?')) return;
  const p = f.r.product, ph = p.photo || p.photos?.[0];
  const row = { product_id: f.pid, kind: f.kind, title: f.title.trim(), body: f.body.trim(), image: ph ? new URL(ph, 'https://hub.concerto.id/').href : null,
    publish_at: later ? iso : new Date().toISOString(), remind_at: later ? null : new Date().toISOString() };
  f.busy = true; const btn = document.getElementById('pa-save'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyimpan…'; }
  try {
    const { data, error } = await supabase.from('product_push').insert(row).select('id').single();
    if (error) throw error;
    if (later) { showToast(`⏰ Pengumuman dijadwalkan ${paWhen(iso)}`, 6000); closeProdAnn(); return; }
    const r = await pushFn({ action: 'notify', type: 'product', id: data.id });
    showToast(`📣 Pengumuman terkirim ke ${r?.sent ?? 0} HP`, 6000); closeProdAnn();
  } catch (e) {
    f.busy = false; if (btn) btn.disabled = false; paPrev();
    if (/relation|does not exist|schema cache|42P01/i.test(e.message || '')) { pushCopySql(); showToast('⚠ Tabel pengumuman produk belum ada — SQL notifikasi disalin, jalankan di Supabase → SQL Editor.', 9000); }
    else showToast('⚠ Gagal: ' + (e.message || e), 7000);
  }
}
async function paDelete(id) {
  if (!paForm || !confirm('Batalkan pengumuman terjadwal ini?')) return;
  const { error } = await supabase.from('product_push').delete().eq('id', id).is('sent_at', null);
  if (error) { showToast('⚠ ' + error.message, 6000); return; }
  paForm.list = paForm.list.filter(x => x.id !== id); renderProdAnn(); showToast('Pengumuman terjadwal dibatalkan');
}
