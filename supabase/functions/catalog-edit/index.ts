// Supabase Edge Function: catalog-edit — KELOLA KATALOG dari portal (11 Nov 2026, permintaan pemilik, cara B).
// Editor menambah / mengubah produk lewat form portal (js/catedit.js) → fungsi ini menyimpan ke REPO GitHub dalam SATU commit:
//   • foto/video baru (diunggah dulu oleh browser Editor ke Storage publik showcase/catalog-tmp/, lalu dipindah ke assets/)
//   • katalog-edit.js (`const KATALOG_EDIT = {...}` JSON murni; digabung ke BRANDS oleh js/katalog-apply.js)
// Push itu menjalankan workflow .github/workflows/catalog-pages.yml (kartu WA /p/, halaman Google /produk/, sitemap).
// Deploy: nama "catalog-edit", Verify JWT boleh aktif (pemanggil dicek sendiri: app_metadata.role = 'editor').
// Secret: GH_CATALOG_TOKEN (token GitHub fine-grained hanya repo portaldealer, izin Contents = Read and write) — atau
// GH_DISPATCH_TOKEN yang sama bila izin Contents ditambahkan ke token itu. JANGAN taruh token di repo.
// Hanya SRP: kolom harga = harga jual umum. Tidak ada aksi hapus produk (lewat Claude).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const REPO = 'concertomediasby-arch/portaldealer', BRANCH = 'main', FILE = 'katalog-edit.js';
const HEAD = '// DIKELOLA PORTAL (menu Kelola Katalog, Editor) lewat Edge Function catalog-edit — JANGAN diedit manual. Lihat js/katalog-apply.js.\n';
const CATS = ['Speaker', 'Subwoofer', 'Amplifier', 'DSP', 'Tweeter', 'Midrange', 'Cable', 'Accessories'];
const UNITS = ['', 'set', 'pcs', 'pair', 'lembar', 'meter'];
const PATH_RE = /^assets\/[A-Za-z0-9._\/-]{1,120}(\?v=\d+)?(#t=[\d.]+)?$/;
const NEW_RE = /^assets\/[a-z0-9][a-z0-9.-]{1,90}\.(webp|jpe?g|png|mp4)$/;
const TMP_RE = /^catalog-tmp\/[A-Za-z0-9._-]{1,120}$/;

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const b64 = (u8: Uint8Array) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64text = (t: string) => b64(new TextEncoder().encode(t));

function cleanData(d: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  o.name = clean(d.name, 80); if (!o.name) throw new Error('Nama produk wajib diisi.');
  o.model = clean(d.model, 80) || o.name;
  o.category = CATS.includes(String(d.category)) ? d.category : (() => { throw new Error('Kategori tidak dikenal.'); })();
  o.emoji = clean(d.emoji, 8) || '📦';
  o.desc = clean(d.desc, 600);
  const specs: Record<string, string> = {};
  if (d.specs && typeof d.specs === 'object') for (const [k, v] of Object.entries(d.specs as Record<string, unknown>).slice(0, 60)) {
    const kk = clean(k, 60), vv = clean(v, 240); if (kk && vv) specs[kk] = vv;
  }
  o.specs = specs;
  const price = Math.round(Number(d.price) || 0);
  o.price = price > 0 && price < 1e10 ? price : null;
  o.priceUnit = UNITS.includes(String(d.priceUnit || '')) ? (d.priceUnit || null) : null;
  let pl: Record<string, number> | null = null;
  if (d.priceList && typeof d.priceList === 'object') for (const [k, v] of Object.entries(d.priceList as Record<string, unknown>).slice(0, 20)) {
    const kk = clean(k, 20), n = Math.round(Number(v) || 0); if (kk && n > 0 && n < 1e10) (pl ||= {})[kk] = n;
  }
  o.priceList = pl;
  if (pl) o.price = null;
  o.soon = d.soon === true || null;
  const photos = Array.isArray(d.photos) ? d.photos.map(String).filter(p => PATH_RE.test(p)).slice(0, 12) : [];
  o.photos = photos.length ? photos : null;
  o.photo = null;   // foto utama = photos[0] (init() di js/core.js)
  o.video = typeof d.video === 'string' && PATH_RE.test(d.video) ? d.video : null;
  o.videoPoster = typeof d.videoPoster === 'string' && PATH_RE.test(d.videoPoster) ? d.videoPoster : null;
  o.hasVideo = !!o.video || null;
  return o;
}

async function gh(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, { ...init, headers: {
    Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'cai-hub-catalog', ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* */ }
  if (!r.ok) { const e: any = new Error(`GitHub ${r.status}: ${j?.message || t.slice(0, 160)}`); e.status = r.status; throw e; }
  return j;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: me, error: meErr } = await db.auth.getUser(jwt);
  if (meErr || !me?.user) return json({ error: 'Sesi tidak valid. Silakan login ulang.' }, 401);
  if (me.user.app_metadata?.role !== 'editor') return json({ error: 'Hanya akun Editor yang boleh mengubah katalog.' }, 403);
  const token = Deno.env.get('GH_CATALOG_TOKEN') || Deno.env.get('GH_DISPATCH_TOKEN') || '';

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Permintaan tidak valid.' }, 400); }
  if (body.action === 'check') {
    if (!token) return json({ ok: false, token: false });
    try { const r = await gh(token, `contents/${FILE}?ref=${BRANCH}`); return json({ ok: true, token: true, sha: r.sha }); }
    catch (e: any) { return json({ ok: false, token: true, error: e.message, status: e.status }); }
  }
  if (body.action !== 'save') return json({ error: 'Aksi tidak dikenal.' }, 400);
  if (!token) return json({ error: 'Token GitHub belum diatur (secret GH_CATALOG_TOKEN).', code: 'no-token' }, 500);

  try {
    const it = body.item || {};
    const id = String(it.id || '');
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) throw new Error('ID produk tidak valid.');
    const brand = String(it.brand || '');
    if (!/^[a-z0-9-]{2,30}$/.test(brand)) throw new Error('Brand tidak valid.');
    const line = clean(it.line, 60); if (!line) throw new Error('Line / seri wajib diisi.');
    const data = cleanData(it.data || {});
    const stock = clean(it.stock, 120);
    const files = (Array.isArray(body.files) ? body.files : []).slice(0, 14);
    for (const f of files) if (!TMP_RE.test(String(f.tmp)) || !NEW_RE.test(String(f.dest))) throw new Error('Nama file tidak valid.');

    // 1) file media dari Storage sementara → blob GitHub
    const tree: { path: string; mode: string; type: string; sha: string }[] = [];
    for (const f of files) {
      const { data: blob, error } = await db.storage.from('showcase').download(f.tmp);
      if (error || !blob) throw new Error('File sementara tidak ditemukan: ' + f.tmp);
      const u8 = new Uint8Array(await blob.arrayBuffer());
      if (u8.length > 25 * 1024 * 1024) throw new Error('File terlalu besar: ' + f.dest);
      const b = await gh(token, 'git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(u8), encoding: 'base64' }) });
      tree.push({ path: f.dest, mode: '100644', type: 'blob', sha: b.sha });
    }

    // 2) katalog-edit.js + commit (ulang bila main bergerak — bot GitHub juga commit ke main)
    const at = new Date().toISOString();
    let commitSha = '';
    for (let attempt = 0; attempt < 4 && !commitSha; attempt++) {
      const ref = await gh(token, `git/ref/heads/${BRANCH}`);
      const parent = ref.object.sha;
      const pc = await gh(token, `git/commits/${parent}`);
      let ke: any = { v: '', items: [] };
      try {
        // isi mentah (contents API JSON hanya memuat isi file ≤ 1 MB)
        const fr = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}?ref=${parent}`, { headers: {
          Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'cai-hub-catalog' } });
        if (!fr.ok) { const e: any = new Error(`GitHub ${fr.status}: katalog-edit.js`); e.status = fr.status; throw e; }
        const src = await fr.text(), i = src.indexOf('const KATALOG_EDIT = ');
        if (i >= 0) ke = JSON.parse(src.slice(i + 21).trim().replace(/;\s*$/, ''));
      } catch (e: any) { if (e.status !== 404) throw e; }
      if (!Array.isArray(ke.items)) ke.items = [];
      const old = ke.items.find((x: any) => x.id === id);
      const snap = old ? { at: old.at, by: old.by, brand: old.brand, line: old.line, data: old.data, stock: old.stock || '' }
        : (body.prev && body.prev.data ? { at: 'katalog', brand: clean(body.prev.brand, 30), line: clean(body.prev.line, 60), data: body.prev.data } : null);
      const item: any = { id, brand, line, data, ...(stock ? { stock } : {}), at, by: me.user.email,
        ...(old ? (old.created ? { created: true } : {}) : (it.created ? { created: true } : {})),
        hist: [snap, ...(old?.hist || [])].filter(Boolean).slice(0, 5) };
      if (old) ke.items[ke.items.indexOf(old)] = item; else ke.items.push(item);
      ke.v = at;
      const text = HEAD + 'const KATALOG_EDIT = ' + JSON.stringify(ke) + ';\n';
      const kb = await gh(token, 'git/blobs', { method: 'POST', body: JSON.stringify({ content: b64text(text), encoding: 'base64' }) });
      const t = await gh(token, 'git/trees', { method: 'POST', body: JSON.stringify({ base_tree: pc.tree.sha,
        tree: [...tree, { path: FILE, mode: '100644', type: 'blob', sha: kb.sha }] }) });
      const c = await gh(token, 'git/commits', { method: 'POST', body: JSON.stringify({ parents: [parent], tree: t.sha,
        message: `Katalog: ${old || !it.created ? 'perbarui' : 'tambah'} ${data.name} (${brand}) lewat portal\n\nDisimpan Editor dari menu Kelola Katalog (Edge Function catalog-edit).` }) });
      try { await gh(token, `git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha, force: false }) }); commitSha = c.sha; }
      catch (e: any) { if (e.status !== 422 && e.status !== 409) throw e; await new Promise(r => setTimeout(r, 1500)); }
    }
    if (!commitSha) throw new Error('Repo sedang sibuk — coba simpan lagi sebentar.');
    if (files.length) await db.storage.from('showcase').remove(files.map((f: any) => f.tmp));
    return json({ ok: true, at, commit: commitSha, item: { id, brand, line, data, stock, at, ...(it.created ? { created: true } : {}) } });
  } catch (e: any) {
    return json({ error: e.message || String(e), code: e.status === 401 || e.status === 403 ? 'gh-auth' : '' }, 400);
  }
});
