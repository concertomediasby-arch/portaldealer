// Supabase Edge Function: manage-dealers
// Kelola akun dealer dari portal (hanya untuk akun dengan app_metadata.role = 'editor').
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor,
// nama "manage-dealers", tempel file ini, Deploy. SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY
// sudah tersedia otomatis di lingkungan Edge Function — jangan menaruh kunci di kode.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const STAFF_ROLES = ['editor', 'admin'];
const BAN_FOREVER = '876000h'; // ±100 tahun = nonaktif

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Caller must be a signed-in editor
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: me, error: meErr } = await admin.auth.getUser(token);
  if (meErr || !me?.user) return json({ error: 'Sesi tidak valid. Silakan login ulang.' }, 401);
  if (me.user.app_metadata?.role !== 'editor') return json({ error: 'Hanya akun Editor yang boleh mengelola dealer.' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Permintaan tidak valid.' }, 400); }
  const action = String(body.action || '');
  const str = (k: string) => String(body[k] ?? '').trim();

  // Only plain dealer accounts may be modified — never editor/admin staff
  const loadDealer = async (id: string) => {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error || !data?.user) throw new Error('Akun tidak ditemukan.');
    if (STAFF_ROLES.includes(data.user.app_metadata?.role)) throw new Error('Akun staff tidak bisa diubah dari menu ini.');
    return data.user;
  };

  try {
    switch (action) {
      case 'list': {
        const users = [];
        for (let page = 1; page <= 20; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (error) throw error;
          users.push(...data.users);
          if (data.users.length < 200) break;
        }
        return json({
          users: users.map((u) => ({
            id: u.id,
            email: u.email,
            role: u.app_metadata?.role || 'dealer',
            store: u.user_metadata?.store || '',
            city: u.user_metadata?.city || '',
            phone: u.user_metadata?.phone || '',
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at,
            active: !u.banned_until || new Date(u.banned_until) < new Date(),
          })),
        });
      }

      case 'create': {
        const email = str('email').toLowerCase(), password = str('password');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Format email tidak valid.' }, 400);
        if (password.length < 8) return json({ error: 'Password minimal 8 karakter.' }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { store: str('store'), city: str('city'), phone: str('phone') },
        });
        if (error) throw error;
        return json({ ok: true, id: data.user?.id });
      }

      case 'update': {
        const u = await loadDealer(str('id'));
        const { error } = await admin.auth.admin.updateUserById(u.id, {
          user_metadata: { ...u.user_metadata, store: str('store'), city: str('city'), phone: str('phone') },
        });
        if (error) throw error;
        return json({ ok: true });
      }

      case 'reset_password': {
        const u = await loadDealer(str('id'));
        const password = str('password');
        if (password.length < 8) return json({ error: 'Password minimal 8 karakter.' }, 400);
        const { error } = await admin.auth.admin.updateUserById(u.id, { password });
        if (error) throw error;
        return json({ ok: true });
      }

      case 'set_active': {
        const u = await loadDealer(str('id'));
        const { error } = await admin.auth.admin.updateUserById(u.id, { ban_duration: body.active ? 'none' : BAN_FOREVER });
        if (error) throw error;
        return json({ ok: true });
      }

      case 'delete': {
        const u = await loadDealer(str('id'));
        const { error } = await admin.auth.admin.deleteUser(u.id);
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return json({ error: 'Aksi tidak dikenal.' }, 400);
    }
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    const friendly = /already.*registered|already exists/i.test(msg) ? 'Email ini sudah terdaftar.' : msg;
    return json({ error: friendly }, 400);
  }
});
