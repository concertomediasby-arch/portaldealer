// Supabase Edge Function: cway-push
// Notifikasi HP (Web Push, gratis — tanpa WhatsApp/layanan pihak ketiga). 4 Nov 2026, permintaan pemilik:
//  • Editor        : pengingat 5 menit SEBELUM Concerto Way terjadwal tayang (Day + judul). Khusus Editor (bukan Admin staff).
//  • Partner       : "Concerto Way Day n sudah tayang" TEPAT saat tayang — tanpa judul/isi (khusus partner, layar kunci).
//  • Semua (publik): "CAI Hub News" saat berita baru diterbitkan; "Concerto Academy" saat materi baru tayang.
// Tiap HP memilih sendiri (kolom staff / cway / news / acad di tabel cway_push_subs).
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
//   {} (pg_cron tiap menit)                          → pengingat staf 5 menit sebelum tayang + notifikasi partner saat jadwal tiba
//                                                      + materi Academy terjadwal (field `at` di showcase/academy/items.json) saat tiba
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
const ACAD_MANIFEST = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/showcase/academy/items.json`;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
type Sub = { endpoint: string; p256dh: string; auth: string };
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
async function sendAll(col: 'staff' | 'cway' | 'news' | 'acad', payload: unknown, key: Key) {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch (_) { /* cron: badan kosong */ }
  try {
    const key = await vapid();
    const a = body.action;
    if (a === 'key') return json({ key: key.pub });

    if (a === 'get') {
      const { data, error } = await db.from(SUBS).select('staff, cway, news, acad').eq('endpoint', String(body.endpoint || '')).maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ flags: data || null });
    }

    if (a === 'set') {
      const ep = String(body.endpoint || '');
      if (!/^https:\/\//.test(ep) || ep.length > 1000) return json({ error: 'endpoint tidak valid' }, 400);
      const who = await caller(req);
      const { data: cur, error: e1 } = await db.from(SUBS).select('endpoint, staff, cway, news, acad').eq('endpoint', ep).maybeSingle();
      if (e1) return json({ error: e1.message }, 500);
      const f = { staff: !!cur?.staff, cway: !!cur?.cway, news: !!cur?.news, acad: !!cur?.acad };
      const want = body.flags || {};
      for (const k of ['staff', 'cway', 'news', 'acad'] as const) if (k in want) f[k] = !!want[k];
      if (want.staff && !who.editor) f.staff = !!cur?.staff;  // pengingat 5 menit hanya untuk Editor
      if (want.cway && !who.auth) f.cway = !!cur?.cway;       // Concerto Way hanya untuk yang login (partner)
      if (!f.staff && !f.cway && !f.news && !f.acad) {
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
    const acadDue = (await acadItems()).filter(a => a.at && Date.parse(a.at) <= now && Date.parse(a.at) > now - 15 * 60e3);
    const acadSent = await acadLive(acadDue, key);
    return json({ staffSent, liveSent, acadSent });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
