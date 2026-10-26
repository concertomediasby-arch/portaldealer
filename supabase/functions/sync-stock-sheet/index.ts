// Supabase Edge Function: sync-stock-sheet
// Sinkron otomatis stok dari Google Sheet (STOCK DISTRIBUTOR) ke tabel `stock` — dipanggil terjadwal oleh pg_cron
// (lihat supabase/sync-stock-sheet.sql) atau manual oleh admin/editor dari panel admin.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → Via Editor, nama "sync-stock-sheet",
// tempel file ini, matikan "Verify JWT" (fungsi memeriksa sendiri: header x-sync-secret ATAU sesi admin/editor), Deploy.
// Secrets (Edge Functions → Secrets):
//   STOCK_SHEET_URL = link Google Sheet stok (dibagikan "Siapa saja yang memiliki link — Pelihat"; gid tab dipakai bila ada)
//   SYNC_SECRET     = kata sandi acak panjang, sama dengan yang ditulis di SQL jadwal
//   CATALOG_URL     = (opsional) default https://dealer.concerto.id/index.html
// SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY sudah tersedia otomatis — jangan menaruh kunci di kode.
//
// Katalog (BRANDS) & STOCK_ALIASES dibaca dari index.html situs sebagai DATA (JSON5, tanpa menjalankan kode),
// jadi produk/alias baru di repo langsung ikut. Aturan pencocokan di bawah = salinan renderImport()/saveImport()
// (mode "Stok gudang") di index.html — bila aturan import di portal diubah, ubah juga di sini.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import JSON5 from 'https://esm.sh/json5@2.2.3';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Row = { product_id: string; status: string; qty: number | null; note: string; incoming?: string | null };

const normKey = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const STATUS_WORDS: Record<string, string> = { ready: 'ready', ada: 'ready', tersedia: 'ready', indent: 'indent', inden: 'indent', po: 'indent', habis: 'habis', kosong: 'habis', soldout: 'habis' };
const OTW_NOTE_RE = /\botw(?:\s*cai)?\s*:?\s*(\d+)\s*(set|pcs|pc|unit|pair|psg)?\b/i;
const otwFromNote = (note: string) => { const m = String(note || '').match(OTW_NOTE_RE); return m ? `${m[1]} ${(m[2] || 'unit').toLowerCase().replace(/^pc$/, 'pcs')}` : ''; };
const EXTRA_PREFIX = 'x:';
const extraId = (raw: string) => EXTRA_PREFIX + String(raw).toUpperCase().replace(/[^A-Z0-9 .\-\/+]/g, '').replace(/\s+/g, ' ').trim();
const variantId = (pid: string, v: string) => `v:${pid}:${v}`;
const OTW_RE = /\botw\b|blm\s*datang|belum\s*datang|perjalanan/i;

function sheetCsvUrl(link: string) {
  const id = (link.match(/\/d\/([\w-]{20,})/) || [])[1] || (/^[\w-]{20,}$/.test(link) ? link : '');
  if (!id) return '';
  const gid = (link.match(/[#&?]gid=(\d+)/) || [])[1];
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gid ? '&gid=' + gid : ''}&t=${Date.now()}`;
}
function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
}
function detectLayout(rows: string[][]) {
  const isHead = (r: string[]) => r.some(c => /kode|model|nama|produk|barang|no\s*inv|tipe|^\s*unit\s*$/i.test(c)) && r.some(c => /qty|jumlah|stok|stock|baru|sisa/i.test(c));
  const h = rows.slice(0, 8).findIndex(isHead);
  if (h < 0) return { h: 0, hasHead: false, body: rows, col: { model: 0, name: -1, qty: 1, note: 2, status: -1, brand: -1 } };
  const head = rows[h].map(c => c.toLowerCase());
  const find = (re: RegExp) => head.findIndex(x => re.test(x));
  let model = find(/kode|model|tipe|type|no\s*inv/);
  const name = find(/nama|produk|product/);
  if (model < 0) model = name;
  if (model < 0) model = find(/^unit$/);
  let qty = find(/^baru$/);
  if (qty < 0) qty = find(/qty|jumlah|stok|stock|sisa/);
  return { h, hasHead: true, body: rows.slice(h + 1), col: { model, name, qty, status: find(/status/), note: find(/catatan|note/), brand: find(/brand|merek|merk/) } };
}
// Ambil literal `const NAME = [ ... ];` / `{ ... };` dari index.html dan parse sebagai data
function grabLiteral(html: string, start: string, close: string) {
  const i = html.indexOf(start);
  if (i < 0) throw new Error(`${start} tidak ditemukan di katalog`);
  const a = i + start.length - 1, j = html.indexOf(close, a);
  return JSON5.parse(html.slice(a, j + close.length - 1));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pemanggil: jadwal (x-sync-secret) atau admin/editor yang login
  const secret = Deno.env.get('SYNC_SECRET') || '';
  let source = 'jadwal';
  if (!(secret && req.headers.get('x-sync-secret') === secret)) {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: me } = token ? await db.auth.getUser(token) : { data: null };
    if (!['admin', 'editor'].includes(me?.user?.app_metadata?.role)) return json({ error: 'Tidak diizinkan.' }, 401);
    source = 'manual';
  }

  const log = async (ok: boolean, message: string, matched = 0, changed = 0) => {
    await db.from('stock_sync').upsert({ id: 1, ran_at: new Date().toISOString(), ok, message, matched, changed, source }, { onConflict: 'id' });
  };

  try {
    const link = Deno.env.get('STOCK_SHEET_URL') || '';
    const csvUrl = sheetCsvUrl(link);
    if (!csvUrl) throw new Error('Secret STOCK_SHEET_URL belum diisi / tidak valid');

    // Katalog dari situs (cache-buster agar versi terbaru)
    const catUrl = (Deno.env.get('CATALOG_URL') || 'https://dealer.concerto.id/index.html') + '?t=' + Date.now();
    const html = await (await fetch(catUrl)).text();
    const BRANDS = grabLiteral(html, 'const BRANDS = [', '\n];') as any[];
    const ALIASES = grabLiteral(html, 'const STOCK_ALIASES = {', '\n};') as Record<string, string>;
    const index = BRANDS.flatMap(b => b.lines.flatMap((l: any) => l.products.map((p: any) => ({ b, p,
      keys: new Set([normKey(p.model), normKey(p.name), normKey(p.id), normKey(b.name + p.model)]) }))));
    const byId = Object.fromEntries(index.map(x => [x.p.id, x]));
    const stockVariantOf = (code: string, p: any) => p?.priceList ? Object.keys(p.priceList).find(v => normKey(code).endsWith(normKey(v))) || null : null;

    const res = await fetch(csvUrl);
    const text = await res.text();
    if (!res.ok || /^\s*<(!doctype|html)/i.test(text)) throw new Error('Google Sheet tidak bisa dibaca — pastikan dibagikan "Siapa saja yang memiliki link"');
    const rows = parseCsv(text);
    const lay = detectLayout(rows);
    if (OTW_RE.test(rows.slice(0, lay.h).flat().join(' '))) throw new Error('Sheet terdeteksi sebagai daftar OTW — sinkron otomatis hanya untuk stok gudang');
    const col = lay.col;

    // ── sama dengan renderImport() mode gudang ──
    const matched = new Map<string, any>();
    let skipped = 0, ignored = 0;
    for (const r of lay.body) {
      const cell = (k: keyof typeof col) => col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '';
      const raw = cell('model') || cell('name');
      if (!raw || /^total/i.test(raw)) continue;
      const qtyRaw = cell('qty').replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1'), stRaw = cell('status'), note = cell('note');
      const num = qtyRaw.match(/^\s*(\d+)/);
      const qty = num ? parseInt(num[1], 10) : null;
      let status = '';
      if (qty === null && STATUS_WORDS[normKey(qtyRaw)]) status = STATUS_WORDS[normKey(qtyRaw)];
      if (STATUS_WORDS[normKey(stRaw)]) status = status || STATUS_WORDS[normKey(stRaw)];
      if (qty === null && !status) { skipped++; continue; }
      if (qty !== null && status !== 'indent') status = qty === 0 ? 'habis' : 'ready';
      if (status === 'habis' && otwFromNote(note)) status = 'indent';

      const k = normKey(raw);
      let bk = normKey(cell('brand'));
      const brandMatch = (b: any) => [b.name, b.id, b.abbr].some(v => normKey(v || '') === bk);
      if (bk && !BRANDS.some(brandMatch)) bk = '';
      const alias = ALIASES[k];
      if (alias === '-') { ignored++; continue; }
      let hit = byId[alias];
      if (!hit) {
        const hits = [...new Map(index.filter(x => x.keys.has(k) && (!bk || brandMatch(x.b))).map(h => [h.p.id, h])).values()];
        if (hits.length === 1) hit = hits[0];
      }
      const pid = hit ? hit.p.id : extraId(raw);
      if (!hit && pid === EXTRA_PREFIX) continue;

      const prev = matched.get(pid);
      const variant = qty !== null && hit ? stockVariantOf(k, hit.p) : null;
      if (prev && !prev.codes.has(k)) {
        prev.codes.add(k);
        if (variant) prev.variants[variant] = (prev.variants[variant] || 0) + qty!;
        if (qty !== null) { prev.qty = (prev.qty || 0) + qty; prev.status = prev.qty === 0 ? 'habis' : (prev.status === 'indent' ? 'indent' : 'ready'); }
        continue;
      }
      matched.set(pid, { pid, hit, codes: new Set([k]), qty, status, note, otwNote: otwFromNote(note),
        variants: variant ? { ...(prev?.variants || {}), [variant]: qty } : {} });
    }
    const items = [...matched.values()];
    if (!items.length) throw new Error('Tidak ada baris stok yang terbaca dari sheet');

    // ── sama dengan saveImport() mode gudang ──
    const { data: cur, error: curErr } = await db.from('stock').select('product_id,status,qty,note,incoming');
    if (curErr) throw curErr;
    const curMap = new Map((cur || []).map((c: any) => [c.product_id, c]));
    const hasNoteCol = lay.hasHead && col.note >= 0;
    const fileHasOtw = items.some(r => r.otwNote);
    const payload: Row[] = items.map(r => {
      const row: Row = { product_id: r.pid, status: r.status, qty: r.qty,
        note: hasNoteCol ? r.note : (r.note || curMap.get(r.pid)?.note || '') };
      if (fileHasOtw) row.incoming = r.otwNote || null;
      return row;
    });
    items.forEach(r => Object.entries(r.variants || {}).forEach(([v, n]: [string, any]) =>
      payload.push({ product_id: variantId(r.pid, v), status: n === 0 ? 'habis' : 'ready', qty: n, note: '' })));

    // Hanya baris yang berubah — agar "terakhir diperbarui" & realtime tidak bergerak tiap jadwal
    const changed = payload.filter(p => {
      const c: any = curMap.get(p.product_id);
      return !c || c.status !== p.status || (c.qty ?? null) !== (p.qty ?? null) || (c.note || '') !== (p.note || '')
        || ('incoming' in p && (c.incoming || null) !== (p.incoming || null));
    });
    // upsert dikelompokkan per bentuk kolom (baris dengan / tanpa `incoming`)
    for (const group of [changed.filter(p => 'incoming' in p), changed.filter(p => !('incoming' in p))]) {
      if (!group.length) continue;
      const { error } = await db.from('stock').upsert(group, { onConflict: 'product_id' });
      if (error) throw error;
    }
    const good = items.filter(r => r.hit).length;
    const msg = `${good} cocok katalog · ${items.length - good} produk lain${ignored ? ` · ${ignored} diabaikan` : ''}${skipped ? ` · ${skipped} baris tanpa jumlah` : ''} · ${changed.length} baris berubah`;
    await log(true, msg, items.length, changed.length);
    return json({ ok: true, message: msg, matched: items.length, changed: changed.length });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    await log(false, msg).catch(() => {});
    return json({ ok: false, error: msg }, 500);
  }
});
