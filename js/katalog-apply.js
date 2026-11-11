/* CAI Hub — KELOLA KATALOG dari portal (11 Nov 2026, permintaan pemilik — pratinjau .mockup/katalog-form/ disetujui, cara B).
   Produk yang ditambah / diubah Editor lewat form portal disimpan Edge Function `catalog-edit` ke file repo
   **katalog-edit.js** (`const KATALOG_EDIT = { v, items: [...] }`, JSON murni — dikelola portal, JANGAN diedit manual).
   File ini menggabungkannya ke BRANDS / STOCK_ALIASES / RECENT_UPDATES dari katalog.js — dimuat setelah katalog.js &
   katalog-edit.js, sebelum js/core.js. Logika yang SAMA dipakai skrip Node (tools/lib/katalog.js → gen-share-pages,
   gen-seo-pages, cars-data) dan disalin di Edge Function sync-stock-sheet (ubah di sini → ubah juga di sana).
   Item: { id, brand, line, data: { name, model, category, emoji, desc, specs, price, priceUnit, priceList, soon,
           photos, video, videoPoster, hasVideo, photo }, stock?, at, by?, created?, hist?: [...] }
   Nilai null / '' / false di data = field dihapus dari produk. */
function katalogApply(B, A, R, E) {
  if (!E || !Array.isArray(E.items)) return [];
  const nk = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const done = [];
  for (const it of E.items) {
    if (!it || !it.id || !it.data) continue;
    let cur = null, curLine = null, curB = null;
    for (const b of B) for (const l of b.lines) {
      const p = l.products.find(x => x.id === it.id);
      if (p) { cur = p; curLine = l; curB = b; }
    }
    const b = B.find(x => x.id === it.brand) || curB;
    if (!b) continue;
    const lineName = String(it.line || (curLine && curLine.name) || 'Lainnya').trim();
    let l = b.lines.find(x => x.name === lineName);
    if (!l) { l = { name: lineName, products: [] }; b.lines.push(l); }
    const p = cur || { id: it.id };
    for (const [k, v] of Object.entries(it.data)) {
      if (v === null || v === '' || v === false || (Array.isArray(v) && !v.length)) delete p[k];
      else p[k] = v;
    }
    p.id = it.id;
    if (!p.emoji) p.emoji = '📦';
    if (!p.specs) p.specs = {};
    if (!cur) l.products.push(p);
    else if (curLine !== l) { curLine.products.splice(curLine.products.indexOf(p), 1); l.products.push(p); }
    if (curLine && curLine !== l && !curLine.products.length) curB.lines.splice(curB.lines.indexOf(curLine), 1);
    if (it.stock && A) for (const c of String(it.stock).split(',')) { const k = nk(c); if (k) A[k] = it.id; }
    if (R && it.at && !R.some(u => u.productId === it.id && u._ke === it.at)) {
      R.push({ date: String(it.at).slice(0, 10), type: it.created ? 'new' : 'data', brandId: b.id, productId: it.id,
        note: (it.created ? 'Produk baru ditambahkan: ' : 'Data produk diperbarui: ') + (p.name || it.id), _ke: it.at });
    }
    done.push(it.id);
  }
  if (R) R.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return done;
}

// ── Browser: gabungkan katalog-edit.js + simpanan Editor yang belum tayang (localStorage, khusus browser Editor) ──
var CE_PENDING = new Set();
if (typeof window !== 'undefined') {
  const KE = typeof KATALOG_EDIT !== 'undefined' ? KATALOG_EDIT : null;
  katalogApply(BRANDS, STOCK_ALIASES, RECENT_UPDATES, KE);
  try {
    const pend = JSON.parse(localStorage.getItem('cai-ce-pending') || '[]');
    const live = new Map((KE?.items || []).map(x => [x.id, x.at]));
    const left = pend.filter(x => x && x.item && !(live.get(x.item.id) >= x.item.at) && Date.now() - x.ts < 3 * 864e5);
    if (left.length !== pend.length) localStorage.setItem('cai-ce-pending', JSON.stringify(left));
    katalogApply(BRANDS, STOCK_ALIASES, null, { items: left.map(x => x.item) }).forEach(id => CE_PENDING.add(id));
  } catch (e) { /* localStorage tidak tersedia */ }
}
