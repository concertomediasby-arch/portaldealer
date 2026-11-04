// Supabase Edge Function: cway-push
// Notifikasi HP (Web Push, gratis — tanpa WhatsApp/layanan pihak ketiga). 4 Nov 2026, permintaan pemilik:
//  • Editor        : pengingat 5 menit SEBELUM Concerto Way terjadwal tayang (Day + judul). Khusus Editor (bukan Admin staff).
//  • Partner       : "Concerto Way Day n sudah tayang" TEPAT saat tayang — tanpa judul/isi (khusus partner, layar kunci).
//  • Semua (publik): "CAI Hub News" saat berita baru diterbitkan; "Concerto Academy" saat materi baru tayang.
//  • Partner       : "Panduan Partner baru tersedia" saat PDF panduan tayang — tanpa judul (khusus partner).
//  • Partner       : "Stok tersedia lagi" untuk produk yang dipantau HP itu (tabel stock_watch; antrian stock_ready_q dari trigger stok).
//  • Semua (publik): "Instalasi baru di Galeri" (jadwal tayang showcase_installs) & "Produk baru" (pengumuman Editor, tabel product_push).
//  • Editor        : pengingat 5 menit sebelum SEMUA konten terjadwal (Concerto Way, Galeri, pengumuman produk, Academy, Panduan).
//  • Semua         : 🗓 Ringkasan mingguan — Senin 08.00 WIB, satu notifikasi: jumlah produk diperbarui, instalasi Galeri, materi Academy,
//                    berita 7 hari terakhir (+ jumlah Concerto Way & Panduan Partner TANPA judul bagi HP partner). Kolom weekly,
//                    sekali per minggu lewat tabel weekly_push; minggu tanpa isi = tidak dikirim. Ketuk = /?minggu (halaman "Minggu ini").
// Tiap HP memilih sendiri (kolom staff / cway / news / acad / guide / stock / gallery / product di tabel cway_push_subs).
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
//   {} (pg_cron tiap menit)                          → pengingat staf 5 menit sebelum tayang + notifikasi partner saat jadwal tiba
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
const LEAD_MIN = 5;                       // menit sebelum tayang (pengingat staf)
const SUBJECT = 'https://hub.concerto.id/';
const SUBS = 'cway_push_subs';
const PUB_STORAGE = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/`;
const WATCH_MAX = 30;
const ACAD_MANIFEST = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/showcase/academy/items.json`;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
type Sub = { endpoint: string; p256dh: string; auth: string };
type Col = 'staff' | 'cway' | 'news' | 'acad' | 'guide' | 'stock' | 'gallery' | 'product' | 'weekly';
const FLAGS: Col[] = ['staff', 'cway', 'news', 'acad', 'guide', 'stock', 'gallery', 'product', 'weekly'];
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
  const none = { auth: false, staff: false, editor: false };
  if (!t) return none;
  try {
    const { data } = await db.auth.getUser(t);
    const u = data?.user; if (!u) return none;
    const r = (u.app_metadata as Record<string, string> | undefined)?.role;
    return { auth: true, staff: r === 'admin' || r === 'editor', editor: r === 'editor' };
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

// Menit tersisa sebelum tayang (pengingat Editor)
const minsTo = (iso: string) => Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60e3));
const remindTitle = (what: string, iso: string) => `⏰ ${what} tayang ${minsTo(iso) ? minsTo(iso) + ' menit lagi' : 'sekarang'}`;

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
// ⏰ Pengingat Editor 5 menit sebelum konten terjadwal tayang (selain Concerto Way)
async function staffReminders(key: Key, acad: Acad[]) {
  const now = Date.now(), lo = new Date(now).toISOString(), hi = new Date(now + LEAD_MIN * 60e3 + 30e3).toISOString();
  const send1 = (payload: unknown) => sendAll('staff', payload, key);
  let n = 0;
  // Galeri
  const { data: gl } = await db.from('showcase_installs').select('id, car_make, car_model, car_year, dealer, publish_at').eq('published', true).is('remind_at', null).is('push_at', null)
    .gt('publish_at', lo).lte('publish_at', hi);
  for (const g of gl || []) {
    const { data: m } = await db.from('showcase_installs').update({ remind_at: new Date().toISOString() }).eq('id', g.id).is('remind_at', null).select('id');
    if (!m?.length) continue;
    n += await send1({ title: remindTitle('Galeri', g.publish_at), body: `${glName(g)}${g.dealer ? ' · ' + g.dealer : ''} · ${wib(g.publish_at)} WIB. Ketuk untuk mengecek.`, url: `/?gl=${encodeURIComponent(g.id)}`, tag: `rgl-${g.id}` });
  }
  // Pengumuman produk
  const { data: pp } = await db.from('product_push').select('id, product_id, title, publish_at').is('sent_at', null).is('remind_at', null).gt('publish_at', lo).lte('publish_at', hi);
  for (const r of pp || []) {
    const { data: m } = await db.from('product_push').update({ remind_at: new Date().toISOString() }).eq('id', r.id).is('remind_at', null).select('id');
    if (!m?.length) continue;
    n += await send1({ title: remindTitle('Pengumuman produk', r.publish_at), body: `"${r.title}" · ${wib(r.publish_at)} WIB. Ketuk untuk mengecek.`, url: `/?p=${encodeURIComponent(r.product_id)}`, tag: `rpp-${r.id}` });
  }
  // Panduan Partner
  const { data: gs } = await db.from('guide_schedule').select('id, title, dest, publish_at').is('done_at', null).is('remind_at', null).gt('publish_at', lo).lte('publish_at', hi);
  if (gs?.length) {
    const ids: string[] = [];
    for (const g of gs) { const { data: m } = await db.from('guide_schedule').update({ remind_at: new Date().toISOString() }).eq('id', g.id).is('remind_at', null).select('id'); if (m?.length) ids.push(g.id); }
    const list = gs.filter(g => ids.includes(g.id));
    if (list.length) n += await send1({ title: remindTitle(list.length > 1 ? `${list.length} Panduan Partner` : 'Panduan Partner', list[0].publish_at),
      body: `${list.map(g => g.title || g.dest.split('/').pop()).slice(0, 3).join(', ')} · ${wib(list[0].publish_at)} WIB.`, url: '/', tag: `rgd-${list[0].id}` });
  }
  // Academy
  const soon = acad.filter(a => a.at && Date.parse(a.at) > now && Date.parse(a.at) <= now + LEAD_MIN * 60e3 + 30e3);
  if (soon.length) {
    const { data: m } = await db.from('academy_remind').upsert(soon.map(a => ({ no: a.no })), { onConflict: 'no', ignoreDuplicates: true }).select('no');
    const fresh = soon.filter(a => (m || []).some((x: { no: number }) => x.no === a.no)).sort((x, y) => x.no - y.no);
    if (fresh.length) n += await send1({ title: remindTitle(fresh.length > 1 ? `${fresh.length} materi Academy` : 'Materi Academy', fresh[0].at!),
      body: `${fresh.slice(0, 3).map(a => '#' + a.no + ' ' + (a.title || '')).join(', ')} · ${wib(fresh[0].at!)} WIB.`, url: `/?acad=${fresh[0].no}`, tag: `rac-${fresh[0].no}` });
  }
  return n;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch (_) { /* cron: badan kosong */ }
  try {
    const key = await vapid();
    const a = body.action;
    if (a === 'key') return json({ key: key.pub });

    if (a === 'get') {
      const { data, error } = await db.from(SUBS).select(FLAGS.join(', ')).eq('endpoint', String(body.endpoint || '')).maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ flags: data || null });
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
      const { error: e2 } = cur ? await db.from(SUBS).update(row).eq('endpoint', ep) : await db.from(SUBS).insert(row);
      if (e2) return json({ error: e2.message }, 500);
      return json({ flags: f });
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
      if (!who.staff) return json({ error: 'khusus Admin/Editor' }, 403);
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
      if (body.type === 'product') {
        if (!who.editor) return json({ error: 'khusus Editor' }, 403);
        return json({ sent: await productLive(id, key) });
      }
      return json({ error: 'type tidak dikenal' }, 400);
    }

    // ── Jadwal tiap menit ──
    const now = Date.now();
    let staffSent = 0, liveSent = 0;
    // 1) Pengingat staf: tayang ≤ 5 menit lagi (atau baru lewat ≤ 10 menit), sekali per postingan (push_notified_at)
    const { data: due, error } = await db.from('concerto_way').select('id, day, title, publish_at').eq('published', true).is('push_notified_at', null)
      .gt('publish_at', new Date(now - 10 * 60e3).toISOString()).lte('publish_at', new Date(now + LEAD_MIN * 60e3 + 30e3).toISOString());
    if (error) return json({ error: error.message }, 500);
    for (const p of due || []) {
      const { data: mark } = await db.from('concerto_way').update({ push_notified_at: new Date().toISOString() }).eq('id', p.id).is('push_notified_at', null).select('id');
      if (!mark?.length) continue;
      const mins = Math.max(0, Math.round((Date.parse(p.publish_at) - Date.now()) / 60e3));
      staffSent += await sendAll('staff', {
        title: `⏰ Concerto Way ${dayTxt(p.day)}tayang ${mins ? mins + ' menit lagi' : 'sekarang'}`,
        body: `"${p.title}" · ${wib(p.publish_at)} WIB. Ketuk untuk membuka & bagikan ke grup partner.`,
        url: `/?cw=${encodeURIComponent(p.id)}`, tag: `cway-${p.id}` }, key);
    }
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
    // 9) Ringkasan mingguan (Senin pagi)
    const weeklySent = await weeklyDigest(key, acadAll);
    return json({ staffSent, liveSent, acadSent, guideSent, gallerySent, productSent, stockSent, weeklySent });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
