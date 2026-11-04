// Supabase Edge Function: cway-push
// Notifikasi HP (Web Push, gratis — tanpa WhatsApp/layanan pihak ketiga) untuk Editor/Admin:
// 5 menit sebelum Concerto Way terjadwal tayang (kolom concerto_way.publish_at). 4 Nov 2026, permintaan pemilik.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor, nama "cway-push",
// tempel file ini, MATIKAN "Verify JWT", Deploy. Lalu jalankan SQL supabase/cway-push.sql (tabel + jadwal tiap menit).
// Tidak perlu secret: kunci VAPID dibuat otomatis saat pertama dipakai & disimpan di tabel cway_push_config
// (RLS aktif tanpa policy → hanya fungsi ini yang bisa membacanya). SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY otomatis.
//
// Aksi (POST JSON):
//   { action: 'key' }                → { key } kunci publik VAPID (untuk berlangganan di HP)
//   { action: 'test', endpoint }     → kirim notifikasi uji ke HP itu (harus sudah terdaftar di cway_push_subs)
//   {} (dipanggil pg_cron tiap menit) → kirim pengingat untuk postingan yang tayang ≤ 5 menit lagi (sekali per postingan)
// Aman dipanggil siapa saja: tidak mengembalikan data, dan tiap postingan hanya dikirimi pengingat sekali (push_notified_at).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const LEAD_MIN = 5;                       // menit sebelum tayang
const SUBJECT = 'https://hub.concerto.id/';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function vapid() {
  const { data } = await db.from('cway_push_config').select('public_key, private_key').eq('id', 1).maybeSingle();
  if (data?.public_key) return { pub: data.public_key, priv: data.private_key };
  const k = webpush.generateVAPIDKeys();
  await db.from('cway_push_config').upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: 'id', ignoreDuplicates: true });
  const { data: d2 } = await db.from('cway_push_config').select('public_key, private_key').eq('id', 1).single();   // bila dua panggilan bersamaan, pakai yang tersimpan
  return { pub: d2!.public_key, priv: d2!.private_key };
}

// Kirim lewat fetch (bukan modul https Node) — web-push hanya dipakai untuk enkripsi & tanda tangan VAPID
async function send(sub: { endpoint: string; p256dh: string; auth: string }, payload: unknown, key: { pub: string; priv: string }) {
  const r = webpush.generateRequestDetails({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
    vapidDetails: { subject: SUBJECT, publicKey: key.pub, privateKey: key.priv }, TTL: 600, urgency: 'high',
  });
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.headers)) if (k.toLowerCase() !== 'content-length') headers[k] = String(v);   // fetch menghitung panjang sendiri
  const res = await fetch(r.endpoint, { method: r.method, headers, body: r.body });
  if (res.status === 404 || res.status === 410) await db.from('cway_push_subs').delete().eq('endpoint', sub.endpoint);   // langganan kedaluwarsa / dicabut
  return res.status;
}

const wib = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace(':', '.');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let body: Record<string, string> = {};
  try { body = await req.json(); } catch (_) { /* cron: badan kosong */ }
  try {
    const key = await vapid();
    if (body.action === 'key') return json({ key: key.pub });

    if (body.action === 'test') {
      const { data: sub } = await db.from('cway_push_subs').select('endpoint, p256dh, auth').eq('endpoint', body.endpoint || '').maybeSingle();
      if (!sub) return json({ error: 'HP ini belum terdaftar' }, 404);
      const st = await send(sub, { title: '🔔 Tes pengingat Concerto Way', body: 'Notifikasi aktif di HP ini. Pengingat dikirim 5 menit sebelum Day yang dijadwalkan tayang.', url: '/', tag: 'cway-test' }, key);
      return json({ ok: st < 300, status: st });
    }

    // Jadwal: postingan terbit yang tayang dalam ≤ 5 menit (atau baru lewat ≤ 10 menit) dan belum diingatkan
    const now = Date.now();
    const { data: due, error } = await db.from('concerto_way').select('id, day, title, publish_at').eq('published', true).is('push_notified_at', null)
      .gt('publish_at', new Date(now - 10 * 60e3).toISOString()).lte('publish_at', new Date(now + LEAD_MIN * 60e3 + 30e3).toISOString());
    if (error) return json({ error: error.message }, 500);
    if (!due?.length) return json({ sent: 0 });
    const { data: subs } = await db.from('cway_push_subs').select('endpoint, p256dh, auth');
    let sent = 0;
    for (const p of due) {
      // tandai dulu (hanya bila belum ditandai) agar panggilan bersamaan tidak mengirim dua kali
      const { data: mark } = await db.from('concerto_way').update({ push_notified_at: new Date().toISOString() }).eq('id', p.id).is('push_notified_at', null).select('id');
      if (!mark?.length) continue;
      const mins = Math.max(0, Math.round((Date.parse(p.publish_at) - Date.now()) / 60e3));
      const day = p.day != null ? `Day ${p.day} ` : '';
      const payload = {
        title: `⏰ Concerto Way ${day}tayang ${mins ? mins + ' menit lagi' : 'sekarang'}`,
        body: `"${p.title}" · ${wib(p.publish_at)} WIB. Ketuk untuk membuka & bagikan ke grup partner.`,
        url: `/?cw=${encodeURIComponent(p.id)}`, tag: `cway-${p.id}`,
      };
      for (const s of subs || []) { try { if ((await send(s, payload, key)) < 300) sent++; } catch (_) { /* lanjut ke HP lain */ } }
    }
    return json({ sent, posts: due.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
