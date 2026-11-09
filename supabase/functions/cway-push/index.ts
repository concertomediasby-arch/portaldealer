// Supabase Edge Function: cway-push
// Notifikasi HP (Web Push, gratis — tanpa WhatsApp/layanan pihak ketiga). 4 Nov 2026, permintaan pemilik:
//  • Editor        : pengingat 5 menit SEBELUM Concerto Way terjadwal tayang (Day + judul). Khusus Editor (bukan Admin staff).
//  • Partner       : "Concerto Way Day n sudah tayang" TEPAT saat tayang — tanpa judul/isi (khusus partner, layar kunci).
//  • Semua (publik): "CAI Hub News" saat berita baru diterbitkan; "Concerto Academy" saat materi baru tayang.
//  • Partner       : "Panduan Partner baru tersedia" saat PDF panduan tayang — tanpa judul (khusus partner).
//  • Partner       : "Stok tersedia lagi" untuk produk yang dipantau HP itu (tabel stock_watch; antrian stock_ready_q dari trigger stok).
//  • Semua (publik): "Instalasi baru di Galeri" (jadwal tayang showcase_installs) & "Produk baru" (pengumuman Editor, tabel product_push).
//  • Editor        : pengingat sebelum SEMUA konten terjadwal (Concerto Way, Galeri, pengumuman produk, Academy, Panduan) — waktunya
//                    dipilih Editor per HP (4 Nov 2026, kolom remind jsonb: { all: [60, 5], live: true, cway?: [...], gallery?: [...], … };
//                    pilihan REMIND_LEADS = 1 hari · 3 jam · 1 jam · 30 · 15 · 5 menit; kosong = bawaan 5 menit) + opsional "✅ sudah tayang".
//                    Sekali per konten per waktu lewat tabel staff_remind_log. Pilihan IKUT AKUN (4 Nov 2026, permintaan pemilik):
//                    disimpan ke SEMUA HP yang pengingatnya aktif (kolom staff — hanya Editor yang bisa menyalakannya), dan HP Editor
//                    yang baru mengaktifkan pengingat otomatis memakai pilihan yang sama.
//  • Semua         : 🗓 Ringkasan mingguan — Senin 08.00 WIB, satu notifikasi: jumlah produk diperbarui, instalasi Galeri, materi Academy,
//                    berita 7 hari terakhir (+ jumlah Concerto Way & Panduan Partner TANPA judul bagi HP partner). Kolom weekly,
//                    sekali per minggu lewat tabel weekly_push; minggu tanpa isi = tidak dikirim. Ketuk = /?minggu (halaman "Minggu ini").
//  • Semua         : 📅 Kalender Acara (4 Nov 2026) — "Acara baru" saat acara pertama tayang (kolom event; acara 🔒 khusus partner
//                    TANPA judul & hanya ke HP partner) + pengingat H-1 untuk HP yang menekan "Ingatkan saya" (tabel event_watch).
// Tiap HP memilih sendiri (kolom staff / cway / news / acad / guide / stock / gallery / product / weekly / event di tabel cway_push_subs).
//
// Deploy: Supabase Dashboard → Edge Functions → cway-push → Code → tempel file ini → Deploy ("Verify JWT" tetap MATI).
// SQL: supabase/cway-push.sql (tabel + kolom + jadwal tiap menit). Tidak perlu secret: kunci VAPID dibuat otomatis
// & disimpan di tabel cway_push_config (RLS tanpa policy → hanya fungsi ini yang bisa membaca).
//
// Aksi (POST JSON; header Authorization = sesi login bila ada):
//   { action: 'key' }                                → { key } kunci publik VAPID
//   { action: 'get', endpoint }                      → { flags: {staff, cway, news} | null } pilihan HP ini
//   { action: 'set', endpoint, keys?, flags }        → simpan pilihan HP ini (staff hanya Editor, cway hanya yang login;
//                                                      semua false = langganan dihapus → { deleted: true })
//   { action: 'test', endpoint }                     → notifikasi uji ke HP itu
//   { action: 'notify', type: 'cway'|'news', id }   → kirim "sudah tayang"/berita baru sekarang (hanya Admin/Editor; sekali per item)
//   { action: 'notify', type: 'acad', id: [no…] }    → materi Academy baru tayang sekarang (hanya Editor; sekali per nomor, tabel academy_push)
//   { action: 'notify', type: 'guide', id: [path…] } → PDF Panduan Partner baru tayang sekarang (hanya Editor)
//   { action: 'notify', type: 'gallery', id }        → instalasi Galeri baru tayang sekarang (hanya Editor; sekali per mobil, kolom push_at)
//   { action: 'notify', type: 'product', id }        → kirim pengumuman produk (baris product_push) sekarang (hanya Editor)
//   { action: 'watch', endpoint, product_id, name, on } → pantau / batal pantau stok produk di HP ini (hanya yang login; maks. 30)
//   { action: 'watches', endpoint }                  → { items: [{product_id, name}] } produk yang dipantau HP ini
//   { action: 'remind', endpoint, remind }           → simpan pilihan waktu pengingat Editor untuk semua HP Editor (ikut akun; hanya Editor)
//   { action: 'ev_watch', endpoint, event_id, on }   → 📅 ingatkan / batal ingatkan acara di HP ini (maks. 50)
//   { action: 'ev_watches', endpoint }               → { items: [event_id…] } acara yang diingatkan di HP ini
//   { action: 'notify', type: 'event', id }          → "Acara baru" sekarang (hanya Editor; sekali per acara, kolom push_at)
//   { action: 'devices', endpoint }                  → daftar perangkat Editor yang pengingatnya aktif (hanya Editor)
//   { action: 'test_all', endpoint }                 → notifikasi uji ke SEMUA perangkat Editor → status per perangkat (hanya Editor)
//   { action: 'forget', endpoint, id }               → hapus langganan perangkat Editor lain dari daftar (hanya Editor)
//   {} (pg_cron tiap menit)                          → pengingat Editor sesuai pilihan waktunya + notifikasi partner saat jadwal tiba
//                                                      + materi Academy terjadwal (field `at` di showcase/academy/items.json) saat tiba
//                                                      + PDF Panduan terjadwal (tabel guide_schedule): dipindah dari folder tunggu `pending/`
//                                                        (hanya Editor yang bisa membaca) ke folder kartunya, lalu notifikasi
// Endpoint langganan = alamat acak dari browser (rahasia HP itu) — dipakai sebagai tanda pemilik untuk get/set/test.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const REMIND_LEADS = [1440, 180, 60, 30, 15, 5];   // menit sebelum tayang yang bisa dipilih Editor (pengingat tayang)
const REMIND_DEFAULT = [5];                         // HP Editor yang belum memilih = seperti dulu (5 menit)
const REMIND_KINDS = ['cway', 'gallery', 'acad', 'guide', 'product'] as const;
// Pilihan waktu pengingat bersama (ikut akun Editor): diambil dari HP pengingat mana pun yang sudah memilih
async function sharedRemind(): Promise<unknown> {
  const { data, error } = await db.from('cway_push_subs').select('remind').eq('staff', true).not('remind', 'is', null).limit(1);
  return error ? null : (data?.[0]?.remind ?? null);
}
const SUBJECT = 'https://hub.concerto.id/';
const SUBS = 'cway_push_subs';
const PUB_STORAGE = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/`;
const WATCH_MAX = 30;
const ACAD_MANIFEST = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/showcase/academy/items.json`;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
type Sub = { endpoint: string; p256dh: string; auth: string };
type Col = 'staff' | 'cway' | 'news' | 'acad' | 'guide' | 'stock' | 'gallery' | 'product' | 'weekly' | 'event' | 'rapor';
const FLAGS: Col[] = ['staff', 'cway', 'news', 'acad', 'guide', 'stock', 'gallery', 'product', 'weekly', 'event', 'rapor'];   // rapor = Rapor Bulanan untuk akun Ricky (manager)
type Key = { pub: string; priv: string };

async function vapid(): Promise<Key> {
  const { data } = await db.from('cway_push_config').select('public_key, private_key').eq('id', 1).maybeSingle();
  if (data?.public_key) return { pub: data.public_key, priv: data.private_key };
  const k = webpush.generateVAPIDKeys();
  await db.from('cway_push_config').upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: 'id', ignoreDuplicates: true });
  const { data: d2 } = await db.from('cway_push_config').select('public_key, private_key').eq('id', 1).single();   // bila dua panggilan bersamaan, pakai yang tersimpan
  return { pub: d2!.public_key, priv: d2!.private_key };
}

// Siapa pemanggil: login? Admin/Editor?
async function caller(req: Request) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const none = { auth: false, staff: false, editor: false, manager: false };
  if (!t) return none;
  try {
    const { data } = await db.auth.getUser(t);
    const u = data?.user; if (!u) return none;
    const r = (u.app_metadata as Record<string, string> | undefined)?.role;
    return { auth: true, staff: r === 'admin' || r === 'editor', editor: r === 'editor', manager: r === 'manager' };
  } catch (_) { return none; }
}

// Kirim lewat fetch (bukan modul https Node) — web-push hanya dipakai untuk enkripsi & tanda tangan VAPID
async function send(sub: Sub, payload: unknown, key: Key) {
  const r = webpush.generateRequestDetails({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
    vapidDetails: { subject: SUBJECT, publicKey: key.pub, privateKey: key.priv }, TTL: 3600, urgency: 'high',
  });
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.headers)) if (k.toLowerCase() !== 'content-length') headers[k] = String(v);   // fetch menghitung panjang sendiri
  const res = await fetch(r.endpoint, { method: r.method, headers, body: r.body });
  if (res.status === 404 || res.status === 410) await db.from(SUBS).delete().eq('endpoint', sub.endpoint);   // langganan kedaluwarsa / dicabut
  return res.status;
}
async function sendAll(col: Col, payload: unknown, key: Key) {
  const { data: subs } = await db.from(SUBS).select('endpoint, p256dh, auth').eq(col, true);
  let sent = 0; const list = subs || [];
  for (let i = 0; i < list.length; i += 20) {   // 20 HP sekaligus
    const st = await Promise.all(list.slice(i, i + 20).map(s => send(s, payload, key).catch(() => 0)));
    sent += st.filter(s => s > 0 && s < 300).length;
  }
  return sent;
}

const wib = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace(':', '.');
const dayTxt = (d: number | null) => d != null ? `Day ${d} ` : '';

// Partner: tanpa judul/isi (layar kunci bisa dilihat siapa saja)
async function cwayLive(p: { id: string; day: number | null }, key: Key) {
  const { data: mark } = await db.from('concerto_way').update({ push_live_at: new Date().toISOString() }).eq('id', p.id).is('push_live_at', null).select('id');
  if (!mark?.length) return 0;   // sudah pernah dikirim
  return sendAll('cway', { title: `☕ Concerto Way ${dayTxt(p.day)}sudah tayang`, body: 'Materi harian baru untuk partner CAI. Ketuk untuk membaca.',
    url: `/?cw=${encodeURIComponent(p.id)}`, tag: `cwlive-${p.id}` }, key);
}

// Academy: tandai nomor yang belum pernah dikirimi (academy_push), lalu satu notifikasi untuk semuanya
type Acad = { no: number; title?: string; at?: string };
async function acadLive(items: Acad[], key: Key) {
  if (!items.length) return 0;
  const { data: mark } = await db.from('academy_push').upsert(items.map(a => ({ no: a.no })), { onConflict: 'no', ignoreDuplicates: true }).select('no');
  const fresh = items.filter(a => (mark || []).some((m: { no: number }) => m.no === a.no)).sort((x, y) => x.no - y.no);
  if (!fresh.length) return 0;
  const body = fresh.length === 1 ? `#${fresh[0].no} · ${fresh[0].title || 'Materi baru'} · ketuk untuk membaca`
    : `${fresh.length} materi baru: ${fresh.slice(0, 3).map(a => a.title || '#' + a.no).join(', ')}${fresh.length > 3 ? ', …' : ''}`;
  return sendAll('acad', { title: '🎓 Concerto Academy: materi baru', body, url: `/?acad=${fresh[0].no}`, tag: `acad-${fresh[0].no}` }, key);
}
async function acadItems(): Promise<Acad[]> {
  try { const r = await fetch(ACAD_MANIFEST + '?t=' + Date.now()); const j = r.ok ? await r.json() : null; return Array.isArray(j?.items) ? j.items : []; } catch (_) { return []; }
}

// Panduan Partner: tanpa judul (PDF khusus partner, notifikasi tampil di layar kunci)
async function guideLive(paths: string[], key: Key) {
  if (!paths.length) return 0;
  return sendAll('guide', { title: paths.length > 1 ? `📘 ${paths.length} Panduan Partner baru tersedia` : '📘 Panduan Partner baru tersedia',
    body: 'Khusus partner CAI. Ketuk untuk membuka.', url: `/?guide=${encodeURIComponent(paths[0])}`, tag: `guide-${paths[0]}` }, key);
}
// Pindahkan PDF terjadwal yang jamnya sudah tiba: pending/<folder>/<file> → <folder>/<file> (nama sama = menggantikan file lama)
async function guidePublishDue() {
  const { data: due, error } = await db.from('guide_schedule').select('id, src, dest').is('done_at', null).lte('publish_at', new Date().toISOString()).order('publish_at').limit(50);
  if (error || !due?.length) return [] as string[];
  const store = db.storage.from('guides'), moved: string[] = [];
  for (const g of due) {
    const { data: mark } = await db.from('guide_schedule').update({ done_at: new Date().toISOString() }).eq('id', g.id).is('done_at', null).select('id');
    if (!mark?.length) continue;   // sudah diproses panggilan lain
    let { error: e } = await store.move(g.src, g.dest);
    if (e && /exist|duplicate/i.test(e.message)) { await store.remove([g.dest]); ({ error: e } = await store.move(g.src, g.dest)); }
    if (e) { await db.from('guide_schedule').update({ done_at: null, error: e.message }).eq('id', g.id); continue; }
    await store.remove([`thumbs/${g.dest}.jpg`]);   // sampul lama (bila menggantikan file bernama sama) dibuat ulang
    await db.from('guide_schedule').update({ error: null }).eq('id', g.id);
    moved.push(g.dest);
  }
  return moved;
}


// 🚗 Galeri Instalasi: satu notifikasi per mobil (kolom push_at)
type Gl = { id: string; car_make?: string; car_model?: string; car_year?: number; dealer?: string; city?: string; photos?: { path?: string; type?: string }[] };
const glName = (g: Gl) => [g.car_make, g.car_model, g.car_year].filter(Boolean).join(' ');
const glImg = (g: Gl) => { const f = (g.photos || []).find(p => p?.path && p.type !== 'video' && !/\.(mp4|m4v|mov|webm)$/i.test(p.path)); return f ? PUB_STORAGE + 'showcase/' + f.path : undefined; };
async function galleryLive(id: string, key: Key) {
  const now = new Date().toISOString();
  const { data: mark } = await db.from('showcase_installs').update({ push_at: now }).eq('id', id).eq('published', true).eq('notify', true).is('push_at', null)
    .or(`publish_at.is.null,publish_at.lte."${now}"`).select('id, car_make, car_model, car_year, dealer, city, photos');
  const g = mark?.[0] as Gl | undefined; if (!g) return 0;
  return sendAll('gallery', { title: '🚗 Instalasi baru di Galeri CAI Hub', body: `${glName(g)}${g.dealer ? ' · ' + g.dealer : ''}. Ketuk untuk melihat.`,
    url: `/?gl=${encodeURIComponent(g.id)}`, tag: `gl-${g.id}`, image: glImg(g) }, key);
}
// 🆕 Pengumuman produk: satu kali per baris product_push (kolom sent_at)
async function productLive(id: string, key: Key) {
  const now = new Date().toISOString();
  const { data: mark } = await db.from('product_push').update({ sent_at: now, remind_at: now }).eq('id', id).is('sent_at', null).lte('publish_at', now)
    .select('id, product_id, title, body, image');
  const r = mark?.[0]; if (!r) return 0;
  return sendAll('product', { title: r.title, body: r.body || 'Ketuk untuk melihat.', url: `/?p=${encodeURIComponent(r.product_id)}`, tag: `prod-${r.id}`, image: r.image || undefined }, key);
}
// 📦 Stok tersedia lagi: antrian dari trigger stok → HP yang memantau produk itu (pantauan selesai setelah dikabari)
async function stockLive(key: Key) {
  const { data: q } = await db.from('stock_ready_q').select('product_id').limit(300);
  if (!q?.length) return 0;
  const ids = q.map(x => x.product_id);
  await db.from('stock_ready_q').delete().in('product_id', ids);
  const { data: w } = await db.from('stock_watch').select('endpoint, product_id, name').in('product_id', ids);
  if (!w?.length) return 0;
  const byEp = new Map<string, { product_id: string; name: string }[]>();
  for (const x of w) { const a = byEp.get(x.endpoint) || []; a.push({ product_id: x.product_id, name: x.name || x.product_id }); byEp.set(x.endpoint, a); }
  const { data: subs } = await db.from(SUBS).select('endpoint, p256dh, auth').eq('stock', true).in('endpoint', [...byEp.keys()]);
  let sent = 0;
  for (const s of subs || []) {
    const items = byEp.get(s.endpoint)!;
    const one = items.length === 1;
    const payload = one
      ? { title: `📦 Stok tersedia lagi: ${items[0].name}`, body: 'Produk pantauan Anda sudah Ready. Ketuk untuk melihat.', url: `/?p=${encodeURIComponent(items[0].product_id)}`, tag: `stk-${items[0].product_id}` }
      : { title: `📦 ${items.length} produk pantauan Anda sudah Ready`, body: `${items.slice(0, 4).map(i => i.name).join(', ')}${items.length > 4 ? ', …' : ''}. Ketuk untuk melihat.`, url: `/?p=${encodeURIComponent(items[0].product_id)}`, tag: 'stk-multi' };
    const st = await send(s, payload, key).catch(() => 0);
    if (st > 0 && st < 300) sent++;
  }
  await db.from('stock_watch').delete().in('product_id', ids);   // pantauan selesai otomatis setelah produk Ready
  return sent;
}
// ⏰ Pengingat Editor sebelum konten terjadwal tayang — waktu dipilih per HP (kolom remind), sekali per konten per waktu (staff_remind_log)
type RKind = typeof REMIND_KINDS[number];
type RItem = { kind: RKind; ref: string; at: string; title: string; body: string; url: string };
type RSub = Sub & { remind?: Record<string, unknown> | null };
const leadsOf = (r: RSub['remind'], k: RKind): number[] => {
  const pick = (v: unknown) => Array.isArray(v) ? v.map(Number).filter(n => REMIND_LEADS.includes(n)) : null;
  return pick(r?.[k]) ?? pick(r?.all) ?? REMIND_DEFAULT;
};
const leadTxt = (m: number) => m >= 1380 ? `${Math.round(m / 1440)} hari lagi` : m >= 90 ? `${Math.round(m / 60)} jam lagi` : m >= 1 ? `${Math.round(m)} menit lagi` : 'sekarang';
const whenTxt = (iso: string) => {
  const d = new Date(iso), same = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  return (same ? '' : d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Asia/Jakarta' }) + ' ') + wib(iso) + ' WIB';
};
const KIND_LABEL: Record<RKind, string> = { cway: 'Concerto Way', gallery: 'Galeri', acad: 'Academy', guide: 'Panduan Partner', product: 'Pengumuman produk' };
// Konten terjadwal dalam rentang [from, to] (ISO) dari kelima menu
async function remindItems(from: string, to: string, acad: Acad[]): Promise<RItem[]> {
  const out: RItem[] = [];
  const { data: cw } = await db.from('concerto_way').select('id, day, title, publish_at').eq('published', true).gt('publish_at', from).lte('publish_at', to);
  for (const p of cw || []) out.push({ kind: 'cway', ref: p.id, at: p.publish_at, title: `Concerto Way ${dayTxt(p.day)}`.trim(), body: `"${p.title}"`, url: `/?cw=${encodeURIComponent(p.id)}` });
  const { data: gl } = await db.from('showcase_installs').select('id, car_make, car_model, car_year, dealer, publish_at').eq('published', true).gt('publish_at', from).lte('publish_at', to);
  for (const g of gl || []) out.push({ kind: 'gallery', ref: g.id, at: g.publish_at, title: `Galeri — ${glName(g)}`, body: g.dealer ? `Dipasang oleh ${g.dealer}` : 'Instalasi baru', url: `/?gl=${encodeURIComponent(g.id)}` });
  const { data: pp } = await db.from('product_push').select('id, product_id, title, publish_at').gt('publish_at', from).lte('publish_at', to);
  for (const r of pp || []) out.push({ kind: 'product', ref: r.id, at: r.publish_at, title: 'Pengumuman produk', body: `"${r.title}"`, url: `/?p=${encodeURIComponent(r.product_id)}` });
  const { data: gs } = await db.from('guide_schedule').select('id, title, dest, publish_at').gt('publish_at', from).lte('publish_at', to);
  for (const g of gs || []) out.push({ kind: 'guide', ref: g.id, at: g.publish_at, title: 'Panduan Partner', body: `"${g.title || String(g.dest).split('/').pop()}"`, url: '/' });
  for (const a of acad) if (a.at && Date.parse(a.at) > Date.parse(from) && Date.parse(a.at) <= Date.parse(to))
    out.push({ kind: 'acad', ref: String(a.no), at: a.at, title: `Materi Academy #${a.no}`, body: `"${a.title || 'Materi baru'}"`, url: `/?acad=${a.no}` });
  return out;
}
async function staffReminders(key: Key, acad: Acad[]) {
  const now = Date.now();
  let subs: RSub[] = [];
  const r1 = await db.from(SUBS).select('endpoint, p256dh, auth, remind').eq('staff', true);
  if (r1.error) { const r2 = await db.from(SUBS).select('endpoint, p256dh, auth').eq('staff', true); subs = (r2.data || []) as RSub[]; }   // kolom remind belum ada
  else subs = (r1.data || []) as RSub[];
  if (!subs.length) return 0;
  const items = await remindItems(new Date(now - 15 * 60e3).toISOString(), new Date(now + (Math.max(...REMIND_LEADS) + 1) * 60e3).toISOString(), acad);
  // Kelompokkan konten sejenis yang tayang di menit yang sama (mis. 3 materi Academy sekaligus) → satu notifikasi
  type Job = { lead: number; items: RItem[] };
  const jobs = new Map<string, Job>();
  for (const it of items) {
    const m = (Date.parse(it.at) - now) / 60e3;
    let lead = -1;
    if (m <= 0) lead = 0;   // sudah tayang (≤ 15 menit lalu) → "✅ sudah tayang" bagi yang memilih
    else for (const L of REMIND_LEADS) if (m <= L + 0.5 && m > Math.max(0, L - 10)) { lead = L; break; }
    if (lead < 0) continue;
    const { data: claim, error } = await db.from('staff_remind_log').upsert({ kind: it.kind, ref: it.ref, lead }, { onConflict: 'kind,ref,lead', ignoreDuplicates: true }).select('ref');
    if (error || !claim?.length) continue;   // sudah dikirim (atau tabel belum ada)
    const k = `${it.kind}|${lead}|${it.at.slice(0, 16)}`;
    const j = jobs.get(k) || { lead, items: [] }; j.items.push(it); jobs.set(k, j);
  }
  let n = 0;
  for (const j of jobs.values()) {
    const it = j.items[0], kind = it.kind, many = j.items.length > 1;
    const what = many ? `${j.items.length} ${KIND_LABEL[kind]}` : it.title;
    const payload = j.lead === 0
      ? { title: `✅ Sudah tayang: ${what}`, body: `${many ? j.items.map(x => x.body).slice(0, 3).join(', ') : it.body} · ${wib(it.at)} WIB${kind === 'cway' ? '. Ketuk untuk membuka & bagikan ke grup partner.' : ''}`, url: it.url, tag: `rlive-${kind}-${it.ref}` }
      : { title: `⏰ ${leadTxt((Date.parse(it.at) - now) / 60e3)}: ${what}`, body: `${many ? j.items.map(x => x.body).slice(0, 3).join(', ') : it.body} · tayang ${whenTxt(it.at)}. Ketuk untuk mengecek.`, url: it.url, tag: `rmd-${kind}-${it.ref}-${j.lead}` };
    const to = subs.filter(s => j.lead === 0 ? !!s.remind?.live : leadsOf(s.remind, kind).includes(j.lead));
    const st = await Promise.all(to.map(s => send(s, payload, key).catch(() => 0)));
    n += st.filter(x => x > 0 && x < 300).length;
  }
  if (Math.random() < 0.02) await db.from('staff_remind_log').delete().lt('at', new Date(now - 3 * 86400e3).toISOString());
  return n;
}

// 📅 Kalender Acara
type Ev = { id: string; title: string; kind?: string; start_at: string; end_at?: string | null; city?: string | null; venue?: string | null; online?: boolean; public?: boolean; poster?: string | null };
const EV_WATCH_MAX = 50;
const evDay = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
const evPlace = (e: Ev) => e.online ? 'Online' : (e.city || e.venue || '');
const evImg = (e: Ev) => e.poster ? (/^https?:/i.test(e.poster) ? e.poster : PUB_STORAGE + 'showcase/' + String(e.poster).split('#')[0]) : undefined;
// "Acara baru": publik = judul + tanggal + kota ke semua HP pemilih 📅; 🔒 khusus partner = tanpa judul, hanya HP partner (pilihan ☕/📘/📦 hanya bisa dinyalakan yang login)
async function eventLive(id: string, key: Key) {
  const { data: mark } = await db.from('cai_events').update({ push_at: new Date().toISOString() }).eq('id', id).eq('published', true).eq('notify', true).is('push_at', null)
    .select('id, title, kind, start_at, end_at, city, venue, online, public, poster');
  const e = mark?.[0] as Ev | undefined; if (!e) return 0;
  const url = `/?acara=${encodeURIComponent(e.id)}`;
  if (e.public) return sendAll('event', { title: '📅 Acara baru di CAI Hub', body: `${e.title} · ${evDay(e.start_at)}${evPlace(e) ? ' · ' + evPlace(e) : ''}. Ketuk untuk detail.`, url, tag: `ev-${e.id}`, image: evImg(e) }, key);
  const { data: subs } = await db.from(SUBS).select('endpoint, p256dh, auth').eq('event', true).or('cway.eq.true,guide.eq.true,stock.eq.true');
  const st = await Promise.all((subs || []).map(s => send(s, { title: '📅 Acara baru khusus partner CAI', body: `${evDay(e.start_at)}. Ketuk untuk detail (masuk dengan Kode Akses).`, url, tag: `ev-${e.id}` }, key).catch(() => 0)));
  return st.filter(x => x > 0 && x < 300).length;
}
// Pengingat H-1: tiap HP yang menekan "Ingatkan saya", sekali per acara (event_watch.sent_at); yang menekan < 24 jam sebelum acara langsung dikabari
async function eventReminders(key: Key) {
  const now = Date.now();
  const { data: w } = await db.from('event_watch').select('endpoint, event_id').is('sent_at', null).limit(500);
  if (!w?.length) return 0;
  const ids = [...new Set(w.map(x => x.event_id))];
  const { data: evs } = await db.from('cai_events').select('id, title, start_at, city, venue, online, public, poster, published').in('id', ids)
    .gt('start_at', new Date(now).toISOString()).lte('start_at', new Date(now + 24 * 3600e3 + 60e3).toISOString());
  const due = new Map<string, Ev>((evs || []).filter(e => e.published).map(e => [e.id, e as Ev] as [string, Ev]));
  if (!due.size) return 0;
  const todo = w.filter(x => due.has(x.event_id));
  const { data: subs } = await db.from(SUBS).select('endpoint, p256dh, auth').in('endpoint', [...new Set(todo.map(x => x.endpoint))]);
  const subOf = new Map<string, Sub>((subs || []).map(s => [s.endpoint, s as Sub] as [string, Sub]));
  const today = new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
  let sent = 0;
  for (const x of todo) {
    const { data: m } = await db.from('event_watch').update({ sent_at: new Date().toISOString() }).eq('endpoint', x.endpoint).eq('event_id', x.event_id).is('sent_at', null).select('event_id');
    const s = subOf.get(x.endpoint), e = due.get(x.event_id)!;
    if (!m?.length || !s) continue;
    const day = new Date(Date.parse(e.start_at) + 7 * 3600e3).toISOString().slice(0, 10);
    const when = day === today ? 'Hari ini' : 'Besok';
    const payload = e.public
      ? { title: `📅 ${when}: ${e.title}`, body: `${evDay(e.start_at)} · ${wib(e.start_at)} WIB${evPlace(e) ? ' · ' + evPlace(e) : ''}. Ketuk untuk detail.`, url: `/?acara=${encodeURIComponent(e.id)}`, tag: `evr-${e.id}`, image: evImg(e) }
      : { title: `📅 ${when}: acara khusus partner CAI`, body: `${evDay(e.start_at)} · ${wib(e.start_at)} WIB. Ketuk untuk detail.`, url: `/?acara=${encodeURIComponent(e.id)}`, tag: `evr-${e.id}` };
    const st = await send(s, payload, key).catch(() => 0);
    if (st > 0 && st < 300) sent++;
  }
  return sent;
}

// 🗓 Ringkasan mingguan — Senin 08.00–11.59 WIB (dicoba tiap menit sampai terkirim), sekali per minggu (weekly_push)
const CATALOG_JS = Deno.env.get('CATALOG_URL') || 'https://hub.concerto.id/katalog.js';
const GUIDE_SKIP = new Set(['gathering', 'thumbs', 'pending']);
async function weeklyDigest(key: Key, acadAll: Acad[]) {
  const nowMs = Date.now(), w = new Date(nowMs + 7 * 3600e3);   // jam WIB dibaca sebagai UTC
  if (w.getUTCDay() !== 1 || w.getUTCHours() < 8 || w.getUTCHours() >= 12) return 0;
  const week = w.toISOString().slice(0, 10);
  const { data: mark, error } = await db.from('weekly_push').upsert({ week }, { onConflict: 'week', ignoreDuplicates: true }).select('week');
  if (error || !mark?.length) return 0;   // sudah dikirim minggu ini (atau tabel belum dibuat)
  const since = nowMs - 7 * 864e5, sinceDay = new Date(since + 7 * 3600e3).toISOString().slice(0, 10), inWeek = (iso?: string | null) => !!iso && Date.parse(iso) > since && Date.parse(iso) <= nowMs;
  // Produk diperbarui: RECENT_UPDATES di katalog.js (data murni) + pengumuman produk yang terkirim
  const prods = new Set<string>();
  try {
    const txt = await (await fetch(CATALOG_JS + '?t=' + nowMs)).text(), i = txt.indexOf('const RECENT_UPDATES = ['), j = txt.indexOf('];', i);
    if (i >= 0) for (const m of txt.slice(i, j).matchAll(/date:\s*'(\d{4}-\d{2}-\d{2})'[^}]*?productId:\s*'([^']+)'/g)) if (m[1] >= sinceDay) prods.add(m[2]);
  } catch (_) { /* katalog tak terjangkau → lewati */ }
  const { data: pp } = await db.from('product_push').select('product_id').gte('sent_at', new Date(since).toISOString());
  (pp || []).forEach(r => prods.add(r.product_id));
  const { data: gl } = await db.from('showcase_installs').select('id, created_at, publish_at, photos, car_make, car_model, car_year').eq('published', true);
  const gals = (gl || []).filter(g => inWeek(g.publish_at || g.created_at)).sort((a, b) => Date.parse(b.publish_at || b.created_at) - Date.parse(a.publish_at || a.created_at));
  const { count: news } = await db.from('cai_news').select('id', { count: 'exact', head: true }).eq('published', true).gte('post_date', sinceDay);
  const acad = acadAll.filter(a => inWeek(a.at || (a as { date?: string }).date)).length;
  const { data: cw } = await db.from('concerto_way').select('id, publish_at, created_at').eq('published', true).gte('post_date', sinceDay);
  const cway = (cw || []).filter(p => !p.publish_at || Date.parse(p.publish_at) <= nowMs).length;
  let guides = 0;
  try {
    const store = db.storage.from('guides'), { data: root } = await store.list('', { limit: 1000 });
    for (const f of root || []) {
      if (f.id == null) { if (GUIDE_SKIP.has(f.name)) continue; const { data: sub } = await store.list(f.name, { limit: 1000 });
        guides += (sub || []).filter(x => /\.pdf$/i.test(x.name) && inWeek(x.updated_at || x.created_at)).length; }
      else if (/\.pdf$/i.test(f.name) && inWeek(f.updated_at || f.created_at)) guides++;
    }
  } catch (_) { /* lewati */ }
  const counts = { products: prods.size, gallery: gals.length, acad, news: news || 0, cway, guides };
  await db.from('weekly_push').update({ counts }).eq('week', week);
  const base = [prods.size && `${prods.size} produk baru/diperbarui`, gals.length && `${gals.length} instalasi Galeri`, acad && `${acad} materi Academy`, news && `${news} berita`].filter(Boolean).join(' · ');
  const extra = [cway && `☕ ${cway} Concerto Way`, guides && `📘 ${guides} Panduan Partner`].filter(Boolean).join(' · ');
  if (!base && !extra) return 0;
  const g0 = gals[0] as Gl | undefined, image = g0 ? glImg(g0) : undefined;
  const { data: subs } = await db.from(SUBS).select('endpoint, p256dh, auth, cway, guide').eq('weekly', true);
  let sent = 0;
  for (const s of subs || []) {
    const partner = s.cway || s.guide, body = [base, partner ? extra : ''].filter(Boolean).join('\n');
    if (!body) continue;
    const st = await send(s, { title: '🗓 Minggu ini di CAI Hub', body: body + '\nKetuk untuk melihat.', url: '/?minggu=1', tag: `weekly-${week}`, image }, key).catch(() => 0);
    if (st > 0 && st < 300) sent++;
  }
  return sent;
}

// 📊 Rapor Bulanan: tanggal 1 pukul 08.00–11.59 WIB, sekali per bulan (tabel monthly_push), hanya ke HP Editor (staff = true).
const RP_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
async function monthlyReport(key: Key) {
  const w = new Date(Date.now() + 7 * 3600e3);   // jam WIB dibaca sebagai UTC
  if (w.getUTCDate() !== 1 || w.getUTCHours() < 8 || w.getUTCHours() >= 12) return 0;
  const from = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() - 1, 1)), to = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), 0));
  const f = from.toISOString().slice(0, 10), t = to.toISOString().slice(0, 10), ym = f.slice(0, 7);
  const { data: mark, error } = await db.from('monthly_push').upsert({ month: f }, { onConflict: 'month', ignoreDuplicates: true }).select('month');
  if (error || !mark?.length) return 0;   // sudah dikirim bulan ini (atau SQL rapor belum dijalankan)
  const { data: r, error: e2 } = await db.rpc('monthly_report', { p_from: f, p_to: t });
  if (e2 || !r) { await db.from('monthly_push').delete().eq('month', f); return 0; }   // dicoba lagi menit berikutnya
  const v = r.vis || {}, c = r.click || {}, people = v.people || 0, clicks = (c.wa || 0) + (c.maps || 0) + (c.ig || 0), install = r.app?.install || 0;
  const pct = v.people0 ? Math.round((people - v.people0) / v.people0 * 100) : null, nf = (n: number) => n.toLocaleString('id-ID');
  await db.from('monthly_push').update({ counts: { people, people0: v.people0 || 0, clicks, install } }).eq('month', f);
  const base = `${nf(people)} pengunjung${pct == null ? '' : ` (${pct >= 0 ? '▲' : '▼'}${Math.abs(pct)}%)`} · ${nf(clicks)} klik ke partner · ${nf(install)} pasang di HP\nKetuk untuk lihat rapor lengkap.`;
  // HP Editor (staff) + HP akun Ricky yang memilih 📊 Rapor Bulanan (kolom rapor)
  let { data: subs, error: e3 } = await db.from(SUBS).select('endpoint, p256dh, auth, staff').or('staff.eq.true,rapor.eq.true');
  if (e3) ({ data: subs } = await db.from(SUBS).select('endpoint, p256dh, auth, staff').eq('staff', true));   // kolom rapor belum ada
  let sent = 0;
  for (const s of subs || []) {
    const body = s.staff ? base + ' Jangan lupa isi angka Google Search di Rapor (mulai tgl 3).' : base;
    const st = await send(s, { title: `📊 Rapor CAI Hub · ${RP_MONTHS[from.getUTCMonth()]} ${from.getUTCFullYear()}`, body, url: `/?rapor=${ym}`, tag: `rapor-${ym}` }, key).catch(() => 0);
    if (st > 0 && st < 300) sent++;
  }
  return sent;
}

// 💬 Komentar baru di Galeri (6 Nov 2026, permintaan pemilik): komentar langsung tampil tanpa persetujuan, jadi Editor
// dikabari (HP ber-pengingat Editor, kolom staff) agar bisa menghapus yang tidak pantas. Komentar Tim CAI sendiri tidak dikabari.
// Satu notifikasi per mobil; ditandai notified_at. Tabel gl_comments dari SQL supabase/gallery-social.sql.
async function glComments(key: Key) {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { data, error } = await db.from('gl_comments').update({ notified_at: new Date().toISOString() }).is('notified_at', null).gt('created_at', since)
    .select('install_id, name, body, badge');
  if (error || !data?.length) return 0;
  const rows = (data as { install_id: string; name: string; body: string; badge: string | null }[]).filter(r => r.badge !== 'cai');
  if (!rows.length) return 0;
  const byCar = new Map<string, typeof rows>();
  for (const r of rows) byCar.set(r.install_id, [...(byCar.get(r.install_id) || []), r]);
  const { data: cars } = await db.from('showcase_installs').select('id, car_make, car_model, car_year').in('id', [...byCar.keys()]);
  const { data: subs } = await db.from(SUBS).select('endpoint, p256dh, auth').eq('staff', true);
  let sent = 0;
  for (const [id, list] of byCar) {
    const g = (cars || []).find(c => c.id === id) as Gl | undefined, r = list[list.length - 1];
    const snip = r.body.length > 90 ? r.body.slice(0, 88) + '…' : r.body;
    const payload = { title: `💬 Komentar baru di Galeri${list.length > 1 ? ` (${list.length})` : ''}`,
      body: `${g ? glName(g) + ' — ' : ''}${r.name}${r.badge === 'partner' ? ' (partner)' : ''}: "${snip}"`, url: `/?gl=${encodeURIComponent(id)}`, tag: `glc-${id}` };
    for (const s of subs || []) { const st = await send(s, payload, key).catch(() => 0); if (st > 0 && st < 300) sent++; }
  }
  return sent;
}

// 🃏 Picu bot kartu WA (6 Nov 2026, permintaan pemilik): jadwal GitHub Actions sering molor berjam-jam, jadi kartu WA berita/Galeri
// baru telat. Tiap menit fungsi ini menghitung "sidik" data publik yang dipakai bot (berita & mobil Galeri tayang, acara publik,
// partner, materi Academy yang sudah tayang); bila berubah → panggil workflow live-cards.yml lewat GitHub API (workflow_dispatch).
// Butuh secret GH_DISPATCH_TOKEN (token GitHub fine-grained: hanya repo portaldealer, izin Actions = Read and write) — tanpa
// secret = dilewati. Sidik terakhir disimpan di tabel card_dispatch (SQL supabase/cway-push.sql). Jeda min. 3 menit antar-panggilan.
const GH_REPO = 'concertomediasby-arch/portaldealer', GH_WORKFLOW = 'live-cards.yml';
async function cardsDispatch(acadAll: Acad[]) {
  const token = Deno.env.get('GH_DISPATCH_TOKEN'); if (!token) return 'no-token';
  const nowIso = new Date().toISOString();
  const [nw, gl, ev, ad] = await Promise.all([
    db.from('cai_news').select('id, updated_at, title, image, category, post_date, link_url').eq('published', true),
    db.from('showcase_installs').select('id, updated_at, publish_at, photos, car_make, car_model, car_year, dealer, city, hof_id').eq('published', true),
    db.from('cai_events').select('id, updated_at, title, poster, start_at, end_at').eq('published', true).eq('public', true),
    db.from('auth_dealers').select('id, updated_at').eq('hidden', false),
  ]);
  const gal = (gl.data || []).filter(g => !g.publish_at || g.publish_at <= nowIso);
  const acad = acadAll.filter(a => !a.at || Date.parse(a.at) <= Date.now()).map(a => [a.no, a.title, (a as { img?: string }).img]);
  const raw = JSON.stringify([nw.data || [], gal, ev.data || [], ad.data || [], acad]);
  const sig = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
  const { data: st, error: stErr } = await db.from('card_dispatch').select('sig, sent_at').eq('id', 1).maybeSingle();
  if (stErr) return 'no-table';
  if (st?.sig === sig) return 'same';
  if (!st) { await db.from('card_dispatch').upsert({ id: 1, sig, sent_at: nowIso }); return 'init'; }   // pertama kali: simpan saja
  if (st.sent_at && Date.now() - Date.parse(st.sent_at) < 3 * 60e3) return 'wait';
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'cai-hub-cards', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (r.status !== 204) return 'gh-' + r.status;
  await db.from('card_dispatch').upsert({ id: 1, sig, sent_at: nowIso });
  return 'sent';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch (_) { /* cron: badan kosong */ }
  try {
    const key = await vapid();
    const a = body.action;
    if (a === 'key') return json({ key: key.pub });

    if (a === 'get') {
      const ep = String(body.endpoint || '');
      let { data, error } = await db.from(SUBS).select(FLAGS.join(', ') + ', remind').eq('endpoint', ep).maybeSingle();
      if (error && /remind/.test(error.message)) ({ data, error } = await db.from(SUBS).select(FLAGS.join(', ')).eq('endpoint', ep).maybeSingle());   // kolom remind belum ada
      if (error) return json({ error: error.message }, 500);
      const d = data as Record<string, unknown> | null;
      const remind = d?.remind ?? (d?.staff && 'remind' in d ? await sharedRemind() : null);
      return json({ flags: d ? Object.fromEntries(FLAGS.map(k => [k, d[k]])) : null, remind, remindCol: !!d && 'remind' in d });
    }

    if (a === 'set') {
      const ep = String(body.endpoint || '');
      if (!/^https:\/\//.test(ep) || ep.length > 1000) return json({ error: 'endpoint tidak valid' }, 400);
      const who = await caller(req);
      const { data: cur, error: e1 } = await db.from(SUBS).select('endpoint, ' + FLAGS.join(', ')).eq('endpoint', ep).maybeSingle();
      if (e1) return json({ error: e1.message }, 500);
      const c = (cur || {}) as Record<string, unknown>;
      const f = Object.fromEntries(FLAGS.map(k => [k, !!c[k]])) as Record<Col, boolean>;
      const want = body.flags || {};
      for (const k of FLAGS) if (k in want) f[k] = !!want[k];
      if (want.staff && !who.editor) f.staff = !!cur?.staff;  // pengingat 5 menit hanya untuk Editor
      if (want.rapor && !(who.editor || who.manager)) f.rapor = !!cur?.rapor;   // Rapor Bulanan hanya Editor / Ricky
      if (want.cway && !who.auth) f.cway = !!cur?.cway;       // Concerto Way hanya untuk yang login (partner)
      if (want.guide && !who.auth) f.guide = !!cur?.guide;    // Panduan Partner hanya untuk yang login (partner)
      if (want.stock && !who.auth) f.stock = !!cur?.stock;    // Stok pantauan hanya untuk yang login (partner)
      if (!FLAGS.some(k => f[k])) {
        if (cur) await db.from(SUBS).delete().eq('endpoint', ep);
        return json({ flags: f, deleted: true });
      }
      const k = body.keys || {};
      if (!cur && !(k.p256dh && k.auth)) return json({ error: 'kunci langganan kosong' }, 400);
      const row: Record<string, unknown> = { endpoint: ep, ...f };
      if (k.p256dh && k.auth) { row.p256dh = String(k.p256dh); row.auth = String(k.auth); }
      if (body.ua) row.ua = String(body.ua).slice(0, 200);
      if (f.staff && !cur?.staff) { const r = await sharedRemind(); if (r) row.remind = r; }   // HP Editor baru: ikut pilihan waktu akun
      const { error: e2 } = cur ? await db.from(SUBS).update(row).eq('endpoint', ep) : await db.from(SUBS).insert(row);
      if (e2) return json({ error: e2.message }, 500);
      return json({ flags: f });
    }

    if (a === 'remind') {
      const who = await caller(req);
      if (!who.editor) return json({ error: 'khusus Editor' }, 403);
      const ep = String(body.endpoint || ''), r = body.remind || {};
      const clean = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(Number).filter(n => REMIND_LEADS.includes(n)))].sort((x, y) => y - x) : undefined;
      const out: Record<string, unknown> = { all: clean(r.all) ?? REMIND_DEFAULT, live: !!r.live };
      for (const k of REMIND_KINDS) { const v = clean(r[k]); if (v) out[k] = v; }
      const { data: me } = await db.from(SUBS).select('staff').eq('endpoint', ep).maybeSingle();
      if (!me) return json({ error: 'HP ini belum terdaftar' }, 404);
      // Ikut akun: semua HP yang pengingat tayangnya aktif (hanya Editor yang bisa menyalakan kolom staff) + HP ini
      const { error: e0 } = await db.from(SUBS).update({ remind: out }).eq('endpoint', ep);
      if (e0) return json({ error: e0.message, nosql: /remind/.test(e0.message) }, 500);
      const { data } = await db.from(SUBS).update({ remind: out }).eq('staff', true).select('endpoint');
      return json({ remind: out, devices: Math.max(1, data?.length || 0) });
    }

    // ── 📅 Ingatkan saya (Kalender Acara) ──
    if (a === 'ev_watches') {
      const { data, error } = await db.from('event_watch').select('event_id').eq('endpoint', String(body.endpoint || ''));
      if (error) return json({ error: error.message }, 500);
      return json({ items: (data || []).map(x => x.event_id) });
    }
    if (a === 'ev_watch') {
      const ep = String(body.endpoint || ''), id = String(body.event_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'acara tidak valid' }, 400);
      const { data: sub } = await db.from(SUBS).select('endpoint').eq('endpoint', ep).maybeSingle();
      if (!sub) return json({ error: 'HP ini belum terdaftar' }, 404);
      if (body.on === false) await db.from('event_watch').delete().eq('endpoint', ep).eq('event_id', id);
      else {
        const { count } = await db.from('event_watch').select('event_id', { count: 'exact', head: true }).eq('endpoint', ep);
        if ((count || 0) >= EV_WATCH_MAX) return json({ error: `maksimal ${EV_WATCH_MAX} acara diingatkan per HP` }, 400);
        const { error } = await db.from('event_watch').upsert({ endpoint: ep, event_id: id }, { onConflict: 'endpoint,event_id', ignoreDuplicates: true });
        if (error) return json({ error: error.message }, 500);
      }
      const { data } = await db.from('event_watch').select('event_id').eq('endpoint', ep);
      return json({ items: (data || []).map(x => x.event_id) });
    }

    // ── Perangkat Editor (ikut akun): daftar · tes ke semua · hapus ──
    if (a === 'devices' || a === 'test_all' || a === 'forget') {
      const who = await caller(req);
      if (!who.editor) return json({ error: 'khusus Editor' }, 403);
      const ep = String(body.endpoint || '');
      const devId = async (e: string) => { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(e));
        return [...new Uint8Array(h)].slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join(''); };
      const { data: rows, error } = await db.from(SUBS).select('endpoint, p256dh, auth, ua, created_at').eq('staff', true).order('created_at');
      if (error) return json({ error: error.message }, 500);
      const list = await Promise.all((rows || []).map(async r => ({ r, id: await devId(r.endpoint) })));
      if (a === 'forget') {
        const t = list.find(x => x.id === String(body.id || ''));
        if (!t) return json({ error: 'perangkat tidak ditemukan' }, 404);
        if (t.r.endpoint === ep) return json({ error: 'perangkat ini dimatikan lewat tombol Matikan' }, 400);
        await db.from(SUBS).delete().eq('endpoint', t.r.endpoint);
        await db.from('stock_watch').delete().eq('endpoint', t.r.endpoint);
        return json({ ok: true });
      }
      const status: Record<string, number> = {};
      if (a === 'test_all') {
        const st = await Promise.all(list.map(x => send(x.r, { title: '🔔 Tes pengingat CAI Hub', body: 'Perangkat Editor ini menerima notifikasi pengingat tayang.', url: '/', tag: 'cai-test-all' }, key).catch(() => 0)));
        list.forEach((x, i) => { status[x.id] = st[i]; });
      }
      return json({ devices: list.map(x => ({ id: x.id, ua: x.r.ua || '', since: x.r.created_at, me: x.r.endpoint === ep,
        ...(a === 'test_all' ? { status: status[x.id] } : {}) })) });
    }

    if (a === 'test') {
      const { data: sub } = await db.from(SUBS).select('endpoint, p256dh, auth').eq('endpoint', String(body.endpoint || '')).maybeSingle();
      if (!sub) return json({ error: 'HP ini belum terdaftar' }, 404);
      const st = await send(sub, { title: '🔔 Tes notifikasi CAI Hub', body: 'Notifikasi aktif di HP ini.', url: '/', tag: 'cai-test' }, key);
      return json({ ok: st < 300, status: st });
    }

    if (a === 'watches') {
      const { data, error } = await db.from('stock_watch').select('product_id, name').eq('endpoint', String(body.endpoint || '')).order('created_at');
      if (error) return json({ error: error.message }, 500);
      return json({ items: data || [] });
    }

    if (a === 'watch') {
      const who = await caller(req);
      if (!who.auth) return json({ error: 'khusus partner yang login' }, 403);
      const ep = String(body.endpoint || ''), pid = String(body.product_id || '').slice(0, 120);
      if (!pid || pid.startsWith('v:')) return json({ error: 'produk tidak valid' }, 400);
      const { data: sub } = await db.from(SUBS).select('endpoint').eq('endpoint', ep).maybeSingle();
      if (!sub) return json({ error: 'HP ini belum terdaftar' }, 404);
      if (body.on === false) { await db.from('stock_watch').delete().eq('endpoint', ep).eq('product_id', pid); }
      else {
        const { count } = await db.from('stock_watch').select('product_id', { count: 'exact', head: true }).eq('endpoint', ep);
        if ((count || 0) >= WATCH_MAX) return json({ error: `maksimal ${WATCH_MAX} produk dipantau per HP` }, 400);
        const { error } = await db.from('stock_watch').upsert({ endpoint: ep, product_id: pid, name: String(body.name || '').slice(0, 120) || null }, { onConflict: 'endpoint,product_id' });
        if (error) return json({ error: error.message }, 500);
      }
      const { data } = await db.from('stock_watch').select('product_id, name').eq('endpoint', ep).order('created_at');
      return json({ items: data || [] });
    }

    if (a === 'notify') {
      const who = await caller(req);
      if (!who.staff && !(who.manager && body.type === 'news')) return json({ error: 'khusus Admin/Editor' }, 403);   // Ricky: hanya News
      const id = String(body.id || '');
      if (body.type === 'cway') {
        const { data: p } = await db.from('concerto_way').select('id, day, published, publish_at').eq('id', id).maybeSingle();
        if (!p?.published || (p.publish_at && Date.parse(p.publish_at) > Date.now())) return json({ sent: 0, skip: 'belum tayang' });
        return json({ sent: await cwayLive(p, key) });
      }
      if (body.type === 'news') {
        const { data: mark } = await db.from('cai_news').update({ push_at: new Date().toISOString() }).eq('id', id).eq('published', true).is('push_at', null).select('id, title');
        if (!mark?.length) return json({ sent: 0, skip: 'sudah dikirim / belum terbit' });
        return json({ sent: await sendAll('news', { title: '📰 CAI Hub News', body: `${mark[0].title} · ketuk untuk membaca`,
          url: `/?news=${encodeURIComponent(id)}`, tag: `news-${id}` }, key) });
      }
      if (body.type === 'acad') {
        if (!who.editor) return json({ error: 'khusus Editor' }, 403);
        const nos = (Array.isArray(body.id) ? body.id : [body.id]).map(Number).filter(n => n > 0);
        const now = Date.now();
        const items = (await acadItems()).filter(a => nos.includes(+a.no) && (!a.at || Date.parse(a.at) <= now));
        return json({ sent: await acadLive(items, key) });
      }
      if (body.type === 'guide') {
        if (!who.editor) return json({ error: 'khusus Editor' }, 403);
        const paths = (Array.isArray(body.id) ? body.id : [body.id]).map(String).filter(p => /\.pdf$/i.test(p) && !p.startsWith('pending/'));
        return json({ sent: await guideLive(paths, key) });
      }
      if (body.type === 'gallery') {
        if (!who.editor) return json({ error: 'khusus Editor' }, 403);
        return json({ sent: await galleryLive(id, key) });
      }
      if (body.type === 'event') {
        if (!who.editor) return json({ error: 'khusus Editor' }, 403);
        return json({ sent: await eventLive(id, key) });
      }
      if (body.type === 'product') {
        if (!who.editor) return json({ error: 'khusus Editor' }, 403);
        return json({ sent: await productLive(id, key) });
      }
      return json({ error: 'type tidak dikenal' }, 400);
    }

    // ── Jadwal tiap menit ──
    const now = Date.now();
    let staffSent = 0, liveSent = 0;
    // 1) Pengingat Editor: lihat staffReminders() di langkah 8 (semua menu, waktu sesuai pilihan tiap HP)
    // 2) Partner: jadwal sudah tiba (≤ 15 menit lalu), sekali per postingan (push_live_at)
    const { data: live } = await db.from('concerto_way').select('id, day').eq('published', true).is('push_live_at', null)
      .lte('publish_at', new Date(now).toISOString()).gt('publish_at', new Date(now - 15 * 60e3).toISOString());
    for (const p of live || []) liveSent += await cwayLive(p, key);
    // 3) Academy terjadwal: jam tayang sudah tiba (≤ 15 menit lalu), sekali per nomor
    const acadAll = await acadItems();
    const acadDue = acadAll.filter(a => a.at && Date.parse(a.at) <= now && Date.parse(a.at) > now - 15 * 60e3);
    const acadSent = await acadLive(acadDue, key);
    // 4) Panduan Partner terjadwal: pindahkan PDF yang jamnya tiba, lalu satu notifikasi
    const guideSent = await guideLive(await guidePublishDue(), key);
    // 5) Galeri terjadwal: jam tayang tiba (≤ 15 menit lalu), sekali per mobil
    let gallerySent = 0, productSent = 0;
    const { data: gl } = await db.from('showcase_installs').select('id').eq('published', true).eq('notify', true).is('push_at', null)
      .lte('publish_at', new Date(now).toISOString()).gt('publish_at', new Date(now - 15 * 60e3).toISOString());
    for (const g of gl || []) gallerySent += await galleryLive(g.id, key);
    // 6) Pengumuman produk terjadwal
    const { data: pp } = await db.from('product_push').select('id').is('sent_at', null).lte('publish_at', new Date(now).toISOString()).gt('publish_at', new Date(now - 15 * 60e3).toISOString());
    for (const r of pp || []) productSent += await productLive(r.id, key);
    // 7) Stok pantauan yang baru Ready  8) Pengingat Editor untuk konten terjadwal lain
    const stockSent = await stockLive(key);
    staffSent += await staffReminders(key, acadAll);
    // 9) Ringkasan mingguan (Senin pagi)  10) 📅 Pengingat acara H-1
    const weeklySent = await weeklyDigest(key, acadAll);
    let eventSent = 0; try { eventSent = await eventReminders(key); } catch (_) { /* tabel acara belum dibuat */ }
    // 11) 📊 Rapor Bulanan untuk Editor (tanggal 1 pagi)
    let raporSent = 0; try { raporSent = await monthlyReport(key); } catch (_) { /* SQL rapor belum dijalankan */ }
    // 12) 💬 Komentar baru di Galeri → HP Editor
    let commentSent = 0; try { commentSent = await glComments(key); } catch (_) { /* SQL komentar belum dijalankan */ }
    // 13) 🃏 Kartu WA: picu bot GitHub bila data publik berubah
    let cards = ''; try { cards = await cardsDispatch(acadAll); } catch (e) { cards = 'err: ' + String((e as Error)?.message || e); }
    return json({ staffSent, liveSent, acadSent, guideSent, gallerySent, productSent, stockSent, weeklySent, eventSent, raporSent, commentSent, cards });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
