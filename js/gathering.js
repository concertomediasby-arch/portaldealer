/* CAI Hub (Concerto Audio Indonesia) — js/gathering.js
   Shopping Gathering: form belanja, rekap pesanan, invoice, Top Spender.
   Dipisah dari index.html 30 Okt 2026 (tahap 3 pemecahan file). Semua file js/*.js adalah script klasik (bukan module):
   fungsi & const/let tingkat atas terbagi di satu lingkup global, URUTAN MUAT PENTING (lihat <script> di akhir index.html). */

/* ══════════════════════════════════════════
   SHOPPING GATHERING — form belanja dealer (khusus login)
   Harga (lama/baru/spesial) disimpan di tabel Supabase `gathering_items` (RLS: baca = authenticated),
   BUKAN di kode situs — index.html bisa dibaca publik dan harga gathering bukan harga publik.
══════════════════════════════════════════ */
const GATHERING_TABLE = 'gathering_items';
const GT_DRAFT_KEY = 'cai-gathering-draft';
const GT_INFO = ['dealer', 'city', 'phone', 'pic'];
// Daftar pilihan "Nama Dealer" (dari list_rank.xlsx pemilik: Distributor + Dealer). "Lainnya" = ketik manual.
const GT_DISTRIBUTORS = ["[DIST] GARUDA BARAT", "[DIST] KG AAN", "[DIST] PADI - RONNY", "[DIST] CONCERTO MALANG", "[DIST] VIN AUDIOWORKS", "[DIST] HARVEST VARIASI"];   // daftar baru dari pemilik 25 Okt 2026
// Daftar dealer resmi per distributor (dipakai Sertifikat Dealer videotron & Shopping Gathering — nama di sini acuan yang benar, pemilik 25 Okt 2026)
const CERT_GROUPS = [
  ['Agustinus', ['Autoschoon', 'Central Garage', 'DB Auto', 'Project Audio']],
  ['CV. Concerto Malang', ['Autosound Gallery', 'MM Audioworks', 'Soundart']],
  ['Garuda Barat', ['Altepro', 'Anugerah Audio', 'Bengkel Pelita', 'CAS Audio', 'Dr Audio Art', 'Dress Up', 'HS Audio', 'Mars Audio', 'SP Audioworks', 'Xtreme Car Audio Pondok Cabe']],
  ['KG Aan', ['Gema Audio', 'Xtreme Car Audio Meruya']],   // 28 Okt 2026, dari pemilik (sebelumnya Garuda Barat)
  ['Kevin Klise', ['NAI Audioworkshop', 'Sterindo Autosound', 'Victory Audio', 'Zona Audio']],   // Sterindo & Victory pindah dari Garuda Barat 28 Okt 2026
  ['Ronny Koesharyono', ['Atmos Autosound', 'Blitz Cirebon', 'Blitz Pekalongan', 'Blitz Tegal', 'Creative Variasi', 'Dreamsound', 'ICO Audioworks', 'Linggom Audio', 'Kenzo Audio Garage', 'Oscar Variasi', 'Otofine Garage', 'Terang Jaya', 'The Peak Garage', 'Mevina Autosoundproof', 'West Audioworks']],
];
const CERT_DEALERS = CERT_GROUPS.flatMap(([g, ds]) => ds.map(d => ({ d, g })));
// Dealer per distributor khusus Shopping Gathering (tidak mengubah Sertifikat Dealer) — menimpa distributor di CERT_GROUPS
const GT_EXTRA_GROUPS = [
  ['KG Aan', ['MCM', 'Mega Audio', 'Roda Mas']],   // dari pemilik 26 Okt 2026 (Gema Audio & Xtreme Meruya kini di CERT_GROUPS KG Aan)
];
const GT_DEALERS = [...new Set([...CERT_DEALERS.map(x => x.d), ...GT_EXTRA_GROUPS.flatMap(([, ds]) => ds)])];   // Shopping Gathering = nama dealer Sertifikat Dealer (25 Okt 2026) + GT_EXTRA_GROUPS
const GT_OTHER = '__other';
// Distributor tiap dealer (dari CERT_GROUPS) — kolom Distributor (dulu Sales PIC) terisi otomatis
const GT_DEALER_DIST = Object.fromEntries([...CERT_DEALERS.map(x => [x.d, x.g]), ...GT_EXTRA_GROUPS.flatMap(([g, ds]) => ds.map(d => [d, g]))]);
// dealer terdaftar → distributornya; pilihan distributor ([DIST] X) → namanya sendiri; Lainnya → diketik manual
const gtDistFor = v => GT_DEALER_DIST[v] || (GT_DISTRIBUTORS.includes(v) ? v.replace(/^\[DIST\]\s*/, '') : '');
function gtFillDist() {
  const v = document.getElementById('gt-dealer').value.trim(), pic = document.getElementById('gt-pic'), d = gtDistFor(v);
  if (d) pic.value = d;
  pic.readOnly = !!d;
}
function renderGtDealerSelect() {
  const sel = document.getElementById('gt-dealer-sel');
  if (!sel || sel.options.length) return;
  const opt = n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`;
  sel.innerHTML = '<option value="">— Pilih dealer —</option>'
    + `<optgroup label="Distributor">${GT_DISTRIBUTORS.map(opt).join('')}</optgroup>`
    + `<optgroup label="Dealer">${GT_DEALERS.map(opt).join('')}</optgroup>`
    + `<option value="${GT_OTHER}">Lainnya (ketik manual)…</option>`;
}
// Sinkronkan select ↔ input tersembunyi #gt-dealer (sumber nilai yang disimpan)
function gtSyncDealerSelect() {
  renderGtDealerSelect();
  const sel = document.getElementById('gt-dealer-sel'), inp = document.getElementById('gt-dealer');
  const v = inp.value.trim(), known = [...GT_DISTRIBUTORS, ...GT_DEALERS].includes(v);
  sel.value = !v ? '' : known ? v : GT_OTHER;
  inp.hidden = sel.value !== GT_OTHER;
  gtFillDist();
}
function gtDealerChanged() {
  const sel = document.getElementById('gt-dealer-sel'), inp = document.getElementById('gt-dealer');
  const other = sel.value === GT_OTHER;
  inp.hidden = !other;
  inp.value = other ? '' : sel.value;
  const pic = document.getElementById('gt-pic');
  if (!gtDistFor(inp.value)) pic.value = '';
  gtFillDist();
  if (other) inp.focus();
  gtSaveDraft();
}
let gtItems = null, gtError = '', gtQty = {}, gtFilter = 'all';
// Produk yang belum ada di daftar, diketik manual oleh dealer (26 Okt 2026, permintaan pemilik): [{ id, name, brand, qty }]
let gtManual = [];
const gtKey = r => `${r.section}|${r.brand}|${r.name}`;
// Harga yang dipakai menghitung total: spesial gathering, atau (clearance) harga clearance
// Harga yang dipakai untuk pesanan: harga spesial (clearance: harga clearance). Produk tanpa harga spesial tapi punya Harga Baru → dibeli di Harga Baru (tanpa promo). Tanpa keduanya → "Hubungi sales".
// Harga Spesial Gathering = Harga Lama − diskon 35% − cashback 10% DPP (DPP = harga setelah diskon ÷ 1,11) — dihitung otomatis
// untuk semua barang gathering (bukan Clearance) yang punya Harga Lama (keputusan pemilik 26 Okt 2026; cocok dengan data tabel lama)
const GT_DISC = 0.35;
const gtSpecialFromOld = old => { const d = Math.round(Number(old) * (1 - GT_DISC)); return d - Math.round(d / 1.11 * 0.1); };
function gtApplySpecial(r) {
  if (r.section === 'clearance') return;
  if (!('db_special_price' in r)) r.db_special_price = r.special_price;
  if (Number(r.old_price) > 0) { r.special_price = gtSpecialFromOld(r.old_price); r.calc_special = true; }
  else { r.special_price = r.db_special_price; r.calc_special = false; }
}
const gtNoPromo = r => r.section !== 'clearance' && r.special_price == null && r.new_price != null;
// Clearance (rumus pemilik 21 Okt 2026): harga setelah diskon 50% (special_price) − cashback,
// cashback = DPP × 10% (DPP = harga clearance ÷ 1,11), dibulatkan ke rupiah
const gtClrCash = r => r.special_price == null ? null : Math.round(r.special_price / 1.11 * 0.10);
const gtNet = r => gtNoPromo(r) ? r.new_price : r.special_price == null ? null
  : r.section === 'clearance' ? r.special_price - gtClrCash(r) : r.special_price;
const gtRp = n => n == null ? '—' : fmtRp(n);
const GT_MANUAL_GROUP = 'Produk Lain (ketik manual)';
const gtGroup = r => r.manual ? GT_MANUAL_GROUP : r.section === 'clearance' ? 'Clearance Sale' : r.brand;
const gtManualRow = m => ({ section: 'gathering', brand: m.brand || 'Lainnya', name: m.name, manual: true });

/* Stok katalog ↔ Shopping Gathering (25 Okt 2026, permintaan pemilik): sisa = qty di tabel stock − qty pesanan gathering
   yang belum selesai (status selain batal/selesai). Sisa 0 / status Habis → Clearance: "Stok habis", tidak bisa dipesan; barang gathering lain: bisa Pre Order.
   Dealer tidak boleh membaca gathering_orders → jumlah terpesan dari fungsi gathering_reserved() (SECURITY DEFINER, tanpa harga/nama toko). */
const GT_RESERVED_SQL = `create or replace function public.gathering_reserved()
returns table(name text, brand text, section text, qty integer)
language sql security definer set search_path = public as $$
  select i->>'name', i->>'brand', i->>'section', sum(coalesce((i->>'qty')::int, 0))::int
  from gathering_orders o cross join lateral jsonb_array_elements(o.items) i
  where coalesce(o.status, 'baru') not in ('batal', 'selesai', 'terhapus')
  group by 1, 2, 3;
$$;
revoke all on function public.gathering_reserved() from public, anon;
grant execute on function public.gathering_reserved() to authenticated;
create or replace function public.gathering_sold()
returns table(name text, brand text, section text, qty integer)
language sql security definer set search_path = public as $$
  select i->>'name', i->>'brand', i->>'section', sum(coalesce((i->>'qty')::int, 0))::int
  from gathering_orders o cross join lateral jsonb_array_elements(o.items) i
  where o.status in ('dikonfirmasi', 'belum_lunas')
  group by 1, 2, 3;
$$;
revoke all on function public.gathering_sold() from public, anon;
grant execute on function public.gathering_sold() to authenticated;`;
let gtReserved = null, gtReservedErr = '', gtResTimer = null, gtPidIdx = null;
const gtPidCache = new Map();
// Nama barang gathering → id produk katalog (kode barang di depan nama, alias kode gudang, lalu model/nama katalog)
// Nama barang gathering yang tidak bisa dicocokkan otomatis ke katalog (normKey nama lengkap → id produk)
const GT_NAME_ALIASES = {
  x3sounddeadeninglembar: 'st-x3', s8sounddeadeninglembar: 'st-s8d', s15sounddeadeninglembar: 'st-s15',   // 26 Okt 2026
  sst50tweeter: 'st-sst50ii',
  ss16hiresdsp: 'st-ss16',   // "SS16 Hi-Res DSP" = XSS16 (pemilik 26 Okt 2026)   // baris "SST50 Tweeter" (Rp 4,2 jt) = SST50II (pemilik 26 Okt 2026); SST50 (3,9 jt) tampil dari katalog
};
const GT_DISPLAY_NAMES = { ss16hiresdsp: 'XSS16 Hi-Res DSP' };   // 26 Okt 2026
function gtProductId(r) {
  if (r.manual) return null;   // produk ketik manual: tidak dicocokkan ke stok katalog
  if (r.pid) return r.pid;
  const na = GT_NAME_ALIASES[normKey(r.name)];
  if (na) return na;
  const ck = (r.brand || '') + '|' + r.name;
  if (gtPidCache.has(ck)) return gtPidCache.get(ck);
  if (!gtPidIdx) {
    gtPidIdx = new Map();
    BRANDS.forEach(b => b.lines.forEach(l => l.products.forEach(p => [p.model, p.name].forEach(v => {
      const k = normKey(v); if (!k) return;
      const a = gtPidIdx.get(k) || []; if (!a.some(x => x.p.id === p.id)) a.push({ b, p }); gtPidIdx.set(k, a);
    }))));
  }
  const code = normKey(gtCode(r.name)), al = STOCK_ALIASES[code];
  let pid = null;
  if (al) pid = al === '-' ? null : al;
  else {
    const hits = gtPidIdx.get(code) || [], bk = normKey(r.brand);
    const hb = hits.length > 1 ? hits.filter(h => normKey(h.b.name) === bk) : hits;
    if (hb.length === 1) pid = hb[0].p.id;
    // cadangan: nama produk katalog (brand sama) yang termuat di nama barang gathering,
    // mis. "RCA Red Dragon Series 1M /Pair" → Red Dragon Series (OG) — semua panjang = satu stok
    if (!pid) {
      const nk = normKey(r.name); let best = 0;
      // juga tanpa kata "Series": "OG Red Dragon RCA 1M /Pair" → Red Dragon Series (26 Okt 2026, baris Clearance OG)
      gtBrandProducts(r.brand).forEach(p => [p.name, p.name.replace(/\s*series\b/i, '')].forEach(n => { const pk = normKey(n); if (pk.length > 3 && pk.length > best && nk.includes(pk)) { best = pk.length; pid = p.id; } }));
    }
  }
  gtPidCache.set(ck, pid);
  return pid;
}
function gtBrandOf(brand) {
  const bk = normKey(brand);
  return bk ? BRANDS.find(x => normKey(x.name) === bk || normKey(x.id) === bk || normKey(x.abbr) === bk) || null : null;
}
function gtBrandProducts(brand) {
  const b = gtBrandOf(brand);
  return b ? brandProducts(b) : [];
}
// Baris "Semua kabel OG RCA" (clearance satu baris untuk seluruh brand) → stok tiap produk katalog brand itu
function gtBrandWideAvail(r) {
  if (!/^semua\b/i.test(String(r.name || '').trim())) return null;
  const list = gtBrandProducts(r.brand).flatMap(p => {
    const vs = stockVariants(p);
    return vs.length ? vs.map(({ v }) => ({ p, label: p.name.replace(/\s*Series$/i, '') + ' ' + v, av: gtAvail({ brand: r.brand, name: p.name + ' ' + v }) }))
      : [{ p, label: p.name, av: gtAvail({ brand: r.brand, name: p.name }) }];
  }).filter(x => x.av);
  return list.length ? list : null;
}
// Kunci stok barang gathering: varian per panjang bila ada barisnya ("RCA Azure Series 1M /Pair" → v:og-azure:1M), selain itu id produk
// Clearance Sale yang tidak tercocok ke katalog memakai angka kolom `stock` tabel (27 Okt 2026, permintaan pemilik): pesanan yang
// belum selesai/batal ikut menahan stok — kunci 'c:<nama>'; dibatalkan admin → stok muncul lagi
const gtClrStockN = r => r?.section === 'clearance' && /^\s*\d+\s*$/.test(String(r.stock ?? '')) ? parseInt(r.stock, 10) : null;
function gtStockKey(r) {
  const pid = gtProductId(r);
  if (!pid) return r?.section === 'clearance' && !/^semua/i.test(String(r.name || '').trim()) ? 'c:' + normKey(r.name) : null;
  const p = findProductById(pid);
  if (p?.priceList) {
    const lens = (String(r.name || '').match(/\b\d+(?:[.,]\d+)?\s*m\b/gi) || []).map(normKey);   // "1M", "2 m"
    const v = Object.keys(p.priceList).find(v => lens.includes(normKey(v)));
    // produk sudah punya stok per panjang → pakai baris panjang itu (tak ada barisnya = belum ada data, bukan total produk)
    if (v && stockVariants(p).length) return variantId(pid, v);
  }
  return pid;
}
// Ketersediaan: null = tidak ada data stok (tidak dibatasi); { n } = sisa (n null = tanpa angka, mis. Indent)
// Stok tak terbatas khusus Clearance Sale (26 Okt 2026, permintaan pemilik) — katalog & form gathering tetap pakai stok biasa
const GT_CLEAR_UNLIMITED = new Set(['og-reddragon', 'og-streamline'].map(pid => VARIANT_PREFIX + pid + ':2M'));   // OG Red Dragon & Stream Line RCA 2M
function gtAvail(r) {
  const pid = gtStockKey(r), s = pid && stockAt(pid);
  if (s?.inf || (r?.section === 'clearance' && GT_CLEAR_UNLIMITED.has(pid))) return { pid, n: null, status: 'ready', inf: true };
  const clrN = !s && gtClrStockN(r);
  if (!s && clrN == null) return null;
  if (s && s.qty == null) return { pid, n: s.status === 'habis' ? 0 : null, status: s.status };
  let used = gtReserved?.get(pid) || 0;
  if (gtEditing?.admin) used -= gtEditing.origByPid?.[pid] || 0;   // admin mengedit: qty pesanan ini sendiri dikembalikan
  // held = bagian dari pesanan aktif yang BELUM dikonfirmasi pembayarannya (status baru/diproses) — kembali bila dibatalkan
  const held = Math.max(0, used - (gtSoldKey.get(pid) || 0));
  return { pid, n: Math.max(0, (s ? s.qty : clrN) - used), status: s ? s.status : 'ready', held };
}
const gtSoldOut = a => !!a && a.n === 0;
// Pre Order (26 Okt 2026, permintaan pemilik): barang Form Belanja Gathering (bukan Clearance Sale) yang stoknya habis — termasuk
// habis karena sudah dibeli dealer lain — tetap bisa dipesan sebagai Pre Order; Qty di atas sisa stok = sisanya Pre Order.
// Hanya di Shopping Gathering, tidak mengubah tampilan stok katalog.
const gtCanPo = r => !!r && r.section !== 'clearance';
// Jumlah Pre Order untuk qty baris ini (memperhitungkan baris lain di form yang menunjuk stok yang sama)
function gtPoQty(r, qty, av) {
  return qty && gtCanPo(r) && av?.n === 0 && !gtEditing?.admin ? qty : 0;   // Pre Order hanya bila stok benar-benar 0
}
// Label Pre Order di pesan WA, Rekap & invoice (item.po = jumlah unit Pre Order)
const gtPoLabel = it => (it?.manual ? ' (Ketik manual)' : '') + (it?.po ? ' (Pre Order)' : '') + (it?.tbd ? ' (Harga menyusul)' : '');
// Barang tanpa harga yang tetap bisa dipesan di Form Belanja (26 Okt 2026, permintaan pemilik) — harga menyusul, Rp 0 di total
const GT_TBD_PIDS = new Set(['st-ss16', 'st-qk2004', 'st-sa55w', 'st-ssaw8', 'st-sqw10']);   // XSS16, QK 200.4, SA-55W, SSAW8, SQW-10
// Produk katalog ber-soon:true → label COMING SOON di Form Belanja (26 Okt 2026, permintaan pemilik)
const gtSoon = r => { const pid = gtProductId(r); return !!(pid && findProductById(pid)?.soon); };
const gtTbd = r => !!r && r.section !== 'clearance' && gtNet(r) == null && GT_TBD_PIDS.has(gtProductId(r));
function gtPoText(r, qty, av) {
  const po = gtPoQty(r, qty, av);
  return po ? `Pre Order ${po} unit` : '';
}
// qty di form untuk produk yang sama (baris gathering & clearance bisa menunjuk produk katalog yang sama)
const gtFormQtyFor = (pid, exceptKey) => (gtItems || []).reduce((t, x) => t + (gtKey(x) !== exceptKey && gtStockKey(x) === pid ? (gtQty[gtKey(x)] || 0) : 0), 0);
async function loadGtReserved() {
  if (!supabase || !authUser) return;
  try {
    const [{ data, error }] = await Promise.all([supabase.rpc('gathering_reserved'), loadGtSold()]);
    if (error) throw error;
    const m = new Map();
    (data || []).forEach(x => { const pid = gtStockKey(x); if (pid) m.set(pid, (m.get(pid) || 0) + (x.qty || 0)); });
    gtReserved = m; gtReservedErr = '';
  } catch (e) { gtReserved = null; gtReservedErr = String(e.message || e); }
  gtRerender();
}
function gtRerender() {
  const ae = document.activeElement;
  if (document.getElementById('view-gathering')?.classList.contains('active') && !ae?.classList?.contains('gt-qty') && !ae?.closest?.('.gt-manual')) renderGathering();
}
function gtCopyReservedSql() { (navigator.clipboard?.writeText(GT_RESERVED_SQL) || Promise.reject()).then(() => showToast('✓ SQL disalin — tempel di Supabase → SQL Editor → Run.'), () => { prompt('Salin SQL ini:', GT_RESERVED_SQL); }); }

function gtLoadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(GT_DRAFT_KEY) || '{}');
    gtQty = d.qty || {};
    gtManual = Array.isArray(d.manual) ? d.manual.filter(m => m && m.name && m.qty > 0) : [];
    GT_INFO.forEach(k => { const el = document.getElementById('gt-' + k); if (el && !el.value) el.value = d.info?.[k] || ''; });
  } catch (e) { gtQty = {}; gtManual = []; }
  gtSyncDealerSelect();
}
function gtSaveDraft() {
  if (gtEditing?.admin) return;   // jangan timpa draf saat admin mengedit pesanan dealer
  const info = Object.fromEntries(GT_INFO.map(k => [k, document.getElementById('gt-' + k)?.value || '']));
  try { localStorage.setItem(GT_DRAFT_KEY, JSON.stringify({ qty: gtQty, manual: gtManual, info })); } catch (e) {}
}

// 30 Okt 2026 (permintaan pemilik): menu Shopping Gathering dinonaktifkan untuk dealer — hanya Admin/Editor (menu ber-class staff-nav).
// Aktifkan lagi untuk dealer: set true dan kembalikan class menu nav-gathering / mnav-gathering ke login-only.
const GT_DEALER_MENU = false;
function openGathering(tab) {
  if (!requireLogin(() => openGathering(tab))) return;
  if (!GT_DEALER_MENU && !isAdmin()) { showToast('Shopping Gathering sudah selesai — menu ini tidak tersedia lagi.'); showView('dashboard'); return; }
  if (!GT_DEALER_MENU && !isEditor() && tab !== 'rekap') tab = 'rekap';   // admin staff: menu Shopping Gathering khusus Editor (30 Okt 2026) — Rekap Gathering tetap bisa dibuka
  showView('gathering');
  document.querySelector('.main')?.scrollTo(0, 0);
  gtLoadDraft();
  renderGtPay();
  renderGtEditing();
  renderGathering();
  loadGathering();
  if (!stockLoaded) loadStock();
  loadGtReserved();
  clearInterval(gtResTimer);
  gtResTimer = setInterval(() => { if (document.getElementById('view-gathering')?.classList.contains('active')) { loadGtReserved(); if (gtLockedForMe()) loadGathering(); } else clearInterval(gtResTimer); }, 30000);
  setGtTab(tab === 'rekap' && isAdmin() ? 'rekap' : 'form');
}

// Barang yang tidak dijual di Shopping Gathering walau masih ada di tabel gathering_items (normKey nama) — permintaan pemilik
const GT_HIDDEN_ITEMS = new Set(['prom3pnextel', 'plm3pnextel', 'q4ccoaxial', 'ms650coaxial', 'drcv3', 'ml35midrange', 'ms30midrange', 's8subwoofer', 'iquss8aactivesub']);   // PRO-M3P Nextel, Q4C Coaxial, MS650 Coaxial, DRC V3, ML35 & MS30 Midrange, S8 Subwoofer, IQ-USS8A (26 Okt 2026)
// Produk katalog yang tidak dijual di Form Belanja (selain Clearance): tidak ditambahkan dari katalog & baris tabelnya disembunyikan
const GT_HIDDEN_PIDS = new Set(['st-q4c']);   // Q4C (26 Okt 2026) — tetap tampil di katalog
// Daftar Form Belanja (selain Clearance) dilengkapi dari katalog (26 Okt 2026, permintaan pemilik): produk katalog yang belum
// ada di tabel gathering_items ikut tampil per brand dengan Harga Baru = SRP katalog ("tanpa promo"; kabel per panjang = satu
// baris per panjang). Diosdela Musica dikecualikan. Baris katalog bertanda `virtual` — saat Admin/Editor mengisi harga lewat
// ✏️ Edit Harga, baris itu disimpan (insert) ke gathering_items.
const GT_CATALOG_SKIP = new Set(['dios', 'audiosystem']);
// Brand yang seluruh barangnya tidak dijual di Shopping Gathering (baris tabel ikut disembunyikan) — Audio System, 27 Okt 2026
const GT_HIDDEN_BRANDS = new Set(['audiosystem']);
// Harga Baru barang gathering (bukan Clearance) = SRP katalog (keputusan pemilik 26 Okt 2026); null = katalog tanpa harga
function gtCatalogPrice(r) {
  const pid = gtProductId(r), p = pid && findProductById(pid);
  if (!p) return null;
  if (p.priceList) {
    const lens = (String(r.name || '').match(/\b\d+(?:[.,]\d+)?\s*m\b/gi) || []).map(normKey);
    const v = Object.keys(p.priceList).find(v => lens.includes(normKey(v)));
    return v ? p.priceList[v] || null : null;
  }
  return p.price || null;
}
function gtWithCatalog(rows) {
  // baris ganda untuk produk katalog yang sama (mis. "SS16 Hi-Res DSP" & "XSS16 - DSP") → hanya baris pertama yang tampil
  const dup = new Set();
  const gath = rows.filter(r => {
    if (r.section === 'clearance') return false;
    const pid = gtProductId(r);
    if (GT_HIDDEN_PIDS.has(pid)) return false;
    const k = pid && gtStockKey(r);
    if (!k) return true;
    if (dup.has(k)) return false;
    dup.add(k); return true;
  }), clear = rows.filter(r => r.section === 'clearance');
  // nama tampilan baris tabel yang sudah berganti nama di katalog (normKey nama tabel → nama baru)
  gath.forEach(r => { const nn = GT_DISPLAY_NAMES[normKey(r.name)]; if (nn) r.name = nn; });
  gath.forEach(r => { const c = gtCatalogPrice(r); if (c != null) { r.db_new_price = r.new_price; r.new_price = c; r.cat_price = true; } gtApplySpecial(r); });
  // sudah ada di tabel: per produk, atau per panjang untuk produk ber-priceList ("RCA Red Dragon Series 1M /Pair" → hanya 1M)
  const covered = new Set();
  gath.forEach(r => {
    const pid = gtProductId(r), p = pid && findProductById(pid);
    if (!p) return;
    const lens = p.priceList ? (String(r.name || '').match(/\b\d+(?:[.,]\d+)?\s*m\b/gi) || []).map(normKey) : [];
    const hit = lens.length && Object.keys(p.priceList).filter(v => lens.includes(normKey(v)));
    if (hit?.length) hit.forEach(v => covered.add(pid + ':' + v)); else covered.add(pid);
  });
  const brandLabel = new Map();   // nama brand seperti tertulis di tabel (agar satu grup dengan baris yang sudah ada)
  gath.forEach(r => { const b = gtBrandOf(r.brand); if (b && !brandLabel.has(b.id)) brandLabel.set(b.id, r.brand); });
  const maxSort = rows.reduce((m, r) => Math.max(m, Number(r.sort) || 0), 0);
  let n = 0;
  const extra = new Map();
  BRANDS.filter(b => !GT_CATALOG_SKIP.has(b.id)).forEach(b => {
    const brand = brandLabel.get(b.id) || b.name;
    brandProducts(b).filter(p => !covered.has(p.id) && !GT_HIDDEN_PIDS.has(p.id)).forEach(p => {
      const base = { section: 'gathering', brand, old_price: null, special_price: null, virtual: true, pid: p.id };
      const lens = p.priceList ? Object.keys(p.priceList).filter(v => !covered.has(p.id + ':' + v)) : [];
      if (p.priceList && !lens.length) return;
      const items = (lens.length ? lens.map(v => ({ ...base, name: `${p.name} ${v}`, new_price: p.priceList[v] || null }))
        : [{ ...base, name: p.name, new_price: p.price || null }]).map(it => ({ ...it, cat_price: it.new_price != null }));
      items.forEach(it => { it.sort = maxSort + (++n); (extra.get(brand) || extra.set(brand, []).get(brand)).push(it); });
    });
  });
  // urutan: tiap grup brand yang sudah ada + barang katalognya, lalu brand katalog lain, lalu Clearance Sale
  const out = [], seen = new Set();
  gath.forEach(r => { if (seen.has(r.brand)) return; seen.add(r.brand); out.push(...gath.filter(x => x.brand === r.brand), ...(extra.get(r.brand) || [])); });
  extra.forEach((list, brand) => { if (!seen.has(brand)) out.push(...list); });
  return [...out, ...clear];
}
async function loadGathering() {
  if (!supabase || !authUser) return;
  try {
    const { data, error } = await supabase.from(GATHERING_TABLE).select('*').order('sort').order('id');
    if (error) throw error;
    gtLockRow = (data || []).find(gtIsLockRow) || null;
    gtLocked = gtLockRow?.note !== 'open';
    gtItems = gtWithCatalog((data || []).filter(r => !gtIsLockRow(r) && !GT_HIDDEN_ITEMS.has(normKey(r.name)) && !GT_HIDDEN_BRANDS.has(gtBrandOf(r.brand)?.id))); gtError = '';
  } catch (e) {
    const m = String(e.message || e);
    gtItems = []; if (gtLocked == null) gtLocked = true;
    gtError = /does not exist|relation|schema cache/i.test(m) ? 'Data Shopping Gathering belum dipasang di database. Admin/editor: jalankan SQL setup gathering di Supabase.' : 'Data gathering tidak bisa dimuat: ' + m;
  }
  renderGathering();
}

function setGtFilter(f) { gtFilter = f; renderGathering(); }

// ── Kunci Shopping Gathering (27 Okt 2026, permintaan pemilik): selama terkunci dealer tidak bisa belanja; Admin/Editor tetap
// bisa membuka form & membuka kunci. Status disimpan sebagai baris khusus di gathering_items (brand '__config', name '__lock__',
// note 'open' = dibuka; tanpa baris / note lain = TERKUNCI) — RLS: baca authenticated, tulis admin/editor; tanpa SQL baru.
let gtLocked = null, gtLockRow = null;
const gtIsLockRow = r => r.brand === '__config' && r.name === '__lock__';
// Penutupan Shopping Gathering (28 Okt 2026, permintaan pemilik): hitung mundur ke 22.00 WIB; lewat dari itu form otomatis tertutup untuk dealer
const GT_CLOSE_AT = Date.parse('2026-10-28T22:30:00+07:00');
const GT_CLOSE_LABEL = '22.30 WIB';
const gtClosed = () => Date.now() >= GT_CLOSE_AT;
const gtLockedForMe = () => (gtLocked !== false || gtClosed()) && !isAdmin();
let gtWasClosed = gtClosed();
function gtCdText(short) {   // short = versi ringkas untuk papan Top Spender videotron
  const ms = GT_CLOSE_AT - Date.now();
  if (ms <= 0) return { done: true, html: short ? `<b>Shopping ditutup</b><span>${GT_CLOSE_LABEL}</span>` : `<span class="ic">⛔</span><b>Shopping Gathering sudah ditutup</b><span>pukul ${GT_CLOSE_LABEL}</span>` };
  const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60, p = n => String(n).padStart(2, '0');
  const clock = `<em>${p(h)}:${p(m)}:${p(sec)}</em>`;
  return { warn: ms <= 15 * 60000, html: short ? `<span>Ditutup ${GT_CLOSE_LABEL}</span>${clock}` : `<span class="ic">⏳</span><b>Shopping Gathering ditutup pukul ${GT_CLOSE_LABEL}</b><span>sisa waktu</span>${clock}` };
}
function gtCdTick() {
  const c = gtCdText(), cs = gtCdText(true);
  document.querySelectorAll('[data-gtcd]').forEach(el => { const x = el.dataset.gtcd === 'short' ? cs : c; el.innerHTML = x.html; el.classList.toggle('warn', !!x.warn); el.classList.toggle('done', !!x.done); });
  if (c.done && !gtWasClosed) { gtWasClosed = true; if (document.getElementById('view-gathering')?.classList.contains('active') && !QA_SCREEN_MODE) renderGathering(); }
}
setInterval(gtCdTick, 1000);
function renderGtLock() {
  const el = document.getElementById('gt-lock'), form = document.getElementById('gt-form');
  if (!el || !form) return;
  const mine = gtLockedForMe() && !gtError;
  form.classList.toggle('locked', mine);
  if (mine) {
    el.className = 'gt-lock'; el.hidden = false;
    el.innerHTML = gtClosed() ? `<div class="ic">⛔</div><b>Shopping Gathering sudah ditutup</b><p>Belanja Gathering CAI 2026 ditutup pukul ${GT_CLOSE_LABEL}. Terima kasih atas partisipasi Anda — untuk pertanyaan pesanan silakan hubungi sales CAI.</p>`
      : gtLocked == null ? '<div class="stock-empty">Memuat…</div>'
      : '<div class="ic">🔒</div><b>Shopping Gathering belum dibuka</b><p>Form belanja Gathering CAI 2026 akan dibuka oleh tim CAI saat acara berlangsung. Halaman ini terbuka otomatis begitu belanja dimulai — silakan tunggu informasi dari panitia.</p>';
    return;
  }
  if (isAdmin() && gtClosed()) {
    el.className = 'gt-lock staff'; el.hidden = false;
    el.innerHTML = `<span class="ic">⛔</span><b>Ditutup untuk dealer</b><p>Lewat pukul ${GT_CLOSE_LABEL}: form otomatis tertutup untuk dealer. Admin/Editor tetap bisa memakai form & Edit Pesanan.</p>`;
    return;
  }
  if (isAdmin() && gtLocked != null) {
    el.className = 'gt-lock staff' + (gtLocked ? '' : ' open'); el.hidden = false;
    el.innerHTML = gtLocked
      ? '<span class="ic">🔒</span><b>Terkunci untuk dealer</b><p>Dealer belum bisa melihat & mengisi form belanja. Admin/Editor tetap bisa mengakses form ini.</p><button class="gt-btn wa" onclick="gtSetLock(false)">🔓 Buka Shopping Gathering</button>'
      : '<span class="ic">🔓</span><b>Dibuka untuk dealer</b><p>Dealer bisa berbelanja & mengirim pesanan sekarang.</p><button class="gt-btn ghost" onclick="gtSetLock(true)">🔒 Kunci lagi</button>';
    return;
  }
  el.hidden = true; el.innerHTML = '';
}
async function gtSetLock(lock) {
  if (!isAdmin()) return;
  if (!confirm(lock ? 'Kunci Shopping Gathering? Dealer tidak bisa berbelanja sampai dibuka lagi.' : 'Buka Shopping Gathering sekarang? Semua dealer langsung bisa berbelanja & mengirim pesanan.')) return;
  const note = lock ? 'locked' : 'open';
  try {
    const res = gtLockRow?.id != null
      ? await supabase.from(GATHERING_TABLE).update({ note }).eq('id', gtLockRow.id).select()
      : await supabase.from(GATHERING_TABLE).insert({ section: 'gathering', brand: '__config', name: '__lock__', sort: 0, note }).select();
    if (res.error) throw res.error;
    if (!res.data?.length) throw new Error('tidak ada baris yang berubah (cek hak akses)');
    gtLockRow = res.data[0]; gtLocked = lock;
    renderGtLock();
    showToast(lock ? '🔒 Shopping Gathering dikunci untuk dealer.' : '🔓 Shopping Gathering dibuka — dealer bisa berbelanja.');
  } catch (e) { showToast('Gagal mengubah kunci: ' + (e.message || e), 8000); }
}

// ── Edit harga Shopping Gathering langsung dari portal (Admin/Editor; RLS tabel = tulis admin/editor) ──
let gtPriceEdit = false;
function gtTogglePriceEdit() {
  if (!isAdmin()) return;
  gtPriceEdit = !gtPriceEdit;
  const b = document.getElementById('gt-pe-btn');
  if (b) { b.classList.toggle('on', gtPriceEdit); b.textContent = gtPriceEdit ? '✓ Selesai Edit' : '✏️ Edit Harga'; }
  renderGathering();
}
async function gtSavePrice(input) {
  const k = input.closest('.gt-row')?.dataset.k, f = input.dataset.f;
  const r = gtItems?.find(x => gtKey(x) === k);
  if (!r || !isAdmin() || !['old_price', 'new_price', 'special_price'].includes(f)) return;
  const raw = input.value.replace(/[^\d]/g, '');
  const v = raw ? parseInt(raw, 10) : null;
  if (v === (r[f] == null ? null : Number(r[f]))) { input.value = v == null ? '' : v.toLocaleString('id-ID'); return; }
  input.classList.remove('ok', 'err'); input.classList.add('saving');
  try {
    let res;
    if (r.virtual) {   // barang dari katalog: baru disimpan ke tabel saat harganya diubah
      res = await supabase.from(GATHERING_TABLE).insert({ section: r.section, brand: r.brand, name: r.name, sort: r.sort,
        old_price: r.old_price, new_price: r.new_price, special_price: r.special_price, [f]: v }).select();
    } else {
      let q = supabase.from(GATHERING_TABLE).update({ [f]: v });
      q = r.id != null ? q.eq('id', r.id) : q.eq('section', r.section).eq('brand', r.brand).eq('name', r.name);
      res = await q.select();
    }
    const { data, error } = res;
    if (error) throw error;
    if (!data?.length) throw new Error('tidak ada baris yang berubah (cek hak akses)');
    if (r.virtual) { r.virtual = false; if (data[0]?.id != null) r.id = data[0].id; }
    r[f] = v;
    if (r.section !== 'clearance' && f === 'special_price') r.db_special_price = v;
    if (r.section !== 'clearance' && f === 'old_price') { gtApplySpecial(r); renderGathering(); showToast(`✓ ${r.name}: Harga Lama ${v == null ? 'dikosongkan' : fmtRp(v) + ' → Harga Spesial ' + fmtRp(r.special_price)}`); gtUpdateBar(); return; }
    input.value = v == null ? '' : v.toLocaleString('id-ID');
    input.classList.remove('saving'); input.classList.add('ok');
    showToast(`✓ ${r.name}: ${{ old_price: 'Harga Lama', new_price: 'Harga Baru', special_price: r.section === 'clearance' ? 'Diskon 50%' : 'Harga Spesial' }[f]} ${v == null ? 'dikosongkan' : fmtRp(v)}`);
    const row = input.closest('.gt-row'), net = gtNet(r), qty = gtQty[k] || 0;
    const sp = row.querySelector('.gt-sp'); if (sp && r.section === 'clearance') sp.textContent = gtRp(net);
    const cb = row.querySelector('.gt-cb'); if (cb) cb.textContent = r.special_price == null ? '—' : '− ' + fmtRp(gtClrCash(r));
    row.querySelector('.gt-line').textContent = qty && net != null ? fmtRp(qty * net) : '—';
    gtUpdateBar();
  } catch (e) {
    input.classList.remove('saving'); input.classList.add('err');
    showToast('Harga gagal disimpan: ' + (e.message || e), 8000);
  }
}

function renderGathering() {
  const list = document.getElementById('gt-list');
  if (!list) return;
  if (gtPriceEdit && !isAdmin()) gtPriceEdit = false;
  renderGtLock();
  if (gtItems === null) { list.innerHTML = '<div class="stock-empty">Memuat…</div>'; gtUpdateBar(); return; }
  if (gtError) { list.innerHTML = `<div class="stock-empty">${escHtml(gtError)}</div>`; gtUpdateBar(); return; }
  const groups = [...new Set(gtItems.map(gtGroup))];
  document.getElementById('gt-chips').innerHTML = ['all', ...groups].map(g =>
    `<button class="filter-chip${gtFilter === g ? ' active' : ''}" onclick="setGtFilter('${escHtml(g)}')">${g === 'all' ? 'Semua' : escHtml(g)}</button>`).join('');
  const q = normKey(document.getElementById('gt-search')?.value || '');
  const rows = gtItems.filter(r => (gtFilter === 'all' || gtGroup(r) === gtFilter) && (!q || normKey(r.name).includes(q)));
  if (!rows.length) { list.innerHTML = `<div class="stock-empty">${gtItems.length ? 'Tidak ada produk yang cocok — ketik manual di bawah.' : 'Belum ada data gathering.'}</div>` + gtManualHtml(); gtUpdateBar(); return; }
  const resWarn = (gtReservedErr || gtSoldErr) && isAdmin() ? `<div class="gt-res-warn">⚠ Pengurangan stok dari pesanan gathering belum aktif — sisa stok masih memakai angka katalog saja. Admin/editor: jalankan SQL fungsi <b>gathering_reserved</b> &amp; <b>gathering_sold</b> di Supabase (stok katalog dikurangi pembelian yang sudah dikonfirmasi). <button class="gt-btn ghost" onclick="gtCopyReservedSql()">📋 Salin SQL</button></div>` : '';
  const peNote = gtPriceEdit ? '<div class="gt-pe-note">✏️ <b>Mode Edit Harga</b> — ubah angka lalu tekan Enter / pindah kolom; langsung tersimpan ke database dan terlihat dealer. Kosongkan = tanpa harga. <b>Harga Baru</b> mengikuti SRP katalog (ubah di katalog); hanya barang tanpa SRP katalog yang Harga Barunya bisa diisi di sini. Klik <b>Selesai Edit</b> untuk kembali.</div>' : '';
  const manualHtml = gtManualHtml();
  list.innerHTML = peNote + resWarn + groups.filter(g => rows.some(r => gtGroup(r) === g)).map(g => {
    const items = rows.filter(r => gtGroup(r) === g);
    const clear = items[0].section === 'clearance';
    const head = clear
      ? '<span>Produk</span><span>Harga Normal</span><span>Diskon 50%</span><span>Cashback</span><span>Harga Clearance</span><span>Qty</span><span>Subtotal</span>'
      : '<span>Produk</span><span>Harga Lama</span><span>Harga Baru</span><span>Harga Spesial</span><span>Qty</span><span>Subtotal</span>';
    return `<div class="gt-group${clear ? ' clear' : ''}">
      ${clear ? `<div class="gt-clear-banner"><div><b>🔥 ${escHtml(g)}</b><span>Diskon 50% + cashback 10% DPP · stok terbatas, siapa cepat dia dapat</span></div><span class="gt-sub" data-group="${escHtml(g)}"></span></div>`
        : `<div class="line-header"><span class="line-name">${escHtml(g)}</span><span class="line-count">${items.length}</span><span class="gt-sub" data-group="${escHtml(g)}"></span></div>`}
      <div class="gt-table${clear ? ' clear' : ''}"><div class="gt-row gt-head">${head}</div>
      ${items.map(r => {
        const k = gtKey(r), net = gtNet(r), av = gtAvail(r), po = gtSoldOut(av) && gtCanPo(r), out = gtSoldOut(av) && !po;
        // Clearance: sisa 0 karena pesanan yang belum dikonfirmasi pembayarannya → "Di-hold" (belum habis; kembali bila dibatalkan)
        const hold = out && clear && av?.held > 0;
        if (out && gtQty[k] && !gtEditing?.admin) { delete gtQty[k]; gtSaveDraft(); }
        const qty = gtQty[k] || 0;
        const bw = !av && gtBrandWideAvail(r);
        const stockChip = bw ? bw.map(({ label, av: a }) => gtSoldOut(a) ? `<span class="gt-soldout">${escHtml(label)} · habis</span>`
              : a.inf ? `<span class="gt-avail">${escHtml(label)} · ∞</span>`
              : a.n != null ? `<span class="gt-avail">${escHtml(label)} · sisa ${a.n}</span>` : `<span class="gt-indent">${escHtml(label)} · indent</span>`).join(' ')
          : !av ? (clear && r.stock ? `<span class="gt-stock">Stok ${escHtml(r.stock)}</span>` : '')
          : po ? '<span class="gt-po">Stok habis · bisa Pre Order</span>'
          : hold ? `<span class="gt-hold">Di-hold ${av.held} · menunggu konfirmasi pembayaran</span>`
          : out ? '<span class="gt-soldout">Stok habis</span>'
          : av.inf ? '<span class="gt-avail">Stok ∞</span>'
          : av.n != null ? `<span class="gt-avail">Sisa ${av.n}</span>`
          : av.status === 'indent' ? '<span class="gt-indent">Indent</span>' : '';
        const poInfo = gtPoText(r, qty, av);
        const sub = [stockChip, poInfo ? `<span class="gt-po-q">${escHtml(poInfo)}</span>` : '', !clear && r.note ? escHtml(r.note) : ''].filter(Boolean).map(x => `<div class="gt-note">${x}</div>`).join('');
        const pe = f => `<input class="gt-pin" inputmode="numeric" data-f="${f}" value="${r[f] == null ? '' : Number(r[f]).toLocaleString('id-ID')}" placeholder="—" onkeydown="if(event.key==='Enter')this.blur()" onchange="gtSavePrice(this)">`;
        const cols = gtPriceEdit && clear
          ? `<span class="gt-p" data-l="Harga Normal">${pe('old_price')}</span>
             <span class="gt-p" data-l="Diskon 50%">${pe('special_price')}</span>
             <span class="gt-p gt-cb" data-l="Cashback 10% DPP">${r.special_price == null ? '—' : '− ' + fmtRp(gtClrCash(r))}</span>
             <span class="gt-p gt-sp" data-l="Harga Clearance">${gtRp(net)}</span>`
          : gtPriceEdit
          ? `<span class="gt-p" data-l="Harga Lama">${pe('old_price')}</span>
             <span class="gt-p" data-l="Harga Baru">${r.cat_price ? `${gtRp(r.new_price)}<small>dari katalog</small>` : pe('new_price')}</span>
             <span class="gt-p" data-l="Harga Spesial">${r.calc_special ? `${gtRp(r.special_price)}<small>dari Harga Lama</small>` : pe('special_price')}</span>`
          : clear
          ? `<span class="gt-p gt-old" data-l="Harga Normal">${r.old_price == null ? '—' : `<s>${fmtRp(r.old_price)}</s>`}</span>
             <span class="gt-p" data-l="Diskon 50%">${gtRp(r.special_price)}</span>
             <span class="gt-p gt-cb" data-l="Cashback 10% DPP">${r.special_price == null ? '—' : '− ' + fmtRp(gtClrCash(r))}</span>
             <span class="gt-p gt-sp" data-l="Harga Clearance">${gtRp(net)}</span>`
          : `<span class="gt-p gt-old" data-l="Harga Lama">${r.old_price == null ? '—' : `<s>${fmtRp(r.old_price)}</s>`}</span>
             <span class="gt-p" data-l="Harga Baru">${gtRp(r.new_price)}</span>
             <span class="gt-p gt-sp" data-l="Harga Spesial">${gtTbd(r) ? '—<small>harga menyusul</small>' : gtRp(net)}${gtNoPromo(r) ? '<small>tanpa promo</small>' : ''}</span>`;
        return `<div class="gt-row${qty ? ' has-qty' : ''}${out && !hold ? ' soldout' : ''}${out && clear && !hold ? ' clr-out' : ''}${hold ? ' held' : ''}" data-k="${escHtml(k)}">
          <span class="gt-name">${escHtml(r.name)}${clear && r.special_price != null ? '<b class="gt-off">−50%</b>' : ''}${gtSoon(r) ? `<span class="eol-tag soon-tag" title="${SOON_TITLE}">COMING SOON</span>` : ''}${sub}</span>${cols}
          <span class="gt-q">${net == null && !gtTbd(r) ? '<span class="gt-na">Hubungi sales</span>'
            : hold && !gtEditing?.admin ? '<span class="gt-hold-pill">Di-hold</span>'
            : out && !gtEditing?.admin ? (clear ? '<span class="gt-out-pill">Stok habis</span>' : '<span class="gt-na">Stok habis</span>')
            : `<input class="gt-qty" type="number" min="0" step="1" inputmode="numeric" value="${qty || ''}" placeholder="${po ? 'PO' : '0'}" aria-label="Qty ${escHtml(r.name)}" oninput="gtSetQty(this)">`}</span>
          <span class="gt-p gt-line" data-l="Subtotal">${qty && net != null ? fmtRp(qty * net) : qty && gtTbd(r) ? 'Harga menyusul' : '—'}</span>
        </div>`;
      }).join('')}</div></div>`;
  }).join('') + manualHtml;
  gtUpdateBar();
}

// ── Produk lain (ketik manual) ──
const gtManualId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function gtManualHtml() {
  const brands = BRANDS.map(b => `<option value="${escHtml(b.name)}">`).join('');
  return `<div class="gt-group gt-manual">
    <div class="line-header"><span class="line-name">➕ ${GT_MANUAL_GROUP}</span><span class="line-count">${gtManual.length}</span><span class="gt-sub" data-group="${escHtml(GT_MANUAL_GROUP)}"></span></div>
    <p class="gt-man-hint">Produk yang Anda cari belum ada di daftar? Ketik nama produknya di sini — harga dikonfirmasi sales CAI (harga menyusul).</p>
    <div class="gt-man-form">
      <input class="gt-input" id="gt-man-name" maxlength="80" placeholder="Nama / tipe produk" onkeydown="if(event.key==='Enter')gtManualAdd()">
      <input class="gt-input" id="gt-man-brand" maxlength="40" placeholder="Brand (opsional)" list="gt-man-brands" onkeydown="if(event.key==='Enter')gtManualAdd()">
      <datalist id="gt-man-brands">${brands}</datalist>
      <input class="gt-input" id="gt-man-qty" type="number" min="1" step="1" inputmode="numeric" placeholder="Qty" onkeydown="if(event.key==='Enter')gtManualAdd()">
      <button class="gt-btn" onclick="gtManualAdd()">＋ Tambah</button>
    </div>
    ${gtManual.length ? `<div class="gt-man-list">${gtManual.map(m => `<div class="gt-man-it">
      <span class="gt-man-n"><b>${escHtml(m.name)}</b>${m.brand ? `<small>${escHtml(m.brand)}</small>` : ''}${m.price > 0 ? `<em class="ok">${fmtRp(m.price)} × ${m.qty} = ${fmtRp(m.price * m.qty)}</em>` : '<em>harga menyusul</em>'}</span>
      ${gtEditing?.admin && isAdmin() ? `<input class="gt-input gt-man-p" inputmode="numeric" value="${m.price > 0 ? Number(m.price).toLocaleString('id-ID') : ''}" placeholder="Harga / unit" title="Harga per unit (Admin)" aria-label="Harga ${escHtml(m.name)}" onkeydown="if(event.key==='Enter')this.blur()" onchange="gtManualPrice('${m.id}', this.value)">` : ''}
      <input class="gt-input gt-man-q" type="number" min="1" step="1" inputmode="numeric" value="${m.qty}" aria-label="Qty ${escHtml(m.name)}" onchange="gtManualQty('${m.id}', this.value)">
      <button class="gt-btn ghost" title="Hapus" onclick="gtManualDel('${m.id}')">🗑</button>
    </div>`).join('')}</div>` : ''}
  </div>`;
}
function gtManualAdd() {
  const name = document.getElementById('gt-man-name')?.value.trim().replace(/\s+/g, ' ');
  const brand = document.getElementById('gt-man-brand')?.value.trim();
  const qty = Math.min(9999, parseInt(document.getElementById('gt-man-qty')?.value, 10) || 0);
  if (!name) { showToast('Ketik nama produk dulu.'); document.getElementById('gt-man-name')?.focus(); return; }
  if (qty < 1) { showToast('Isi Qty minimal 1.'); document.getElementById('gt-man-qty')?.focus(); return; }
  const same = gtManual.find(m => normKey(m.name) === normKey(name) && normKey(m.brand) === normKey(brand));
  if (same) same.qty = Math.min(9999, same.qty + qty); else gtManual.push({ id: gtManualId(), name, brand, qty });
  gtSaveDraft(); renderGathering();
  showToast(`✓ ${name} × ${qty} ditambahkan (harga menyusul).`);
  document.getElementById('gt-man-name')?.focus();
}
function gtManualQty(id, v) {
  const m = gtManual.find(x => x.id === id); if (!m) return;
  const n = Math.min(9999, parseInt(v, 10) || 0);
  if (n < 1) return gtManualDel(id);
  m.qty = n; gtSaveDraft(); renderGathering();
}
// Harga produk ketik manual — hanya Admin/Editor saat Edit Pesanan (kosong = harga menyusul)
function gtManualPrice(id, v) {
  if (!gtEditing?.admin || !isAdmin()) return;
  const m = gtManual.find(x => x.id === id); if (!m) return;
  const raw = String(v).replace(/[^\d]/g, '');
  if (raw) m.price = parseInt(raw, 10); else delete m.price;
  renderGathering();
}
function gtManualDel(id) { gtManual = gtManual.filter(x => x.id !== id); gtSaveDraft(); renderGathering(); }

// HP: saat mengetik Qty (keyboard terbuka) sembunyikan bar total melayang; muncul lagi setelah selesai mengetik
document.addEventListener('focusin', e => { if (e.target.classList?.contains('gt-qty')) document.getElementById('gt-bar')?.classList.add('typing'); });
document.addEventListener('focusout', e => { if (e.target.classList?.contains('gt-qty')) setTimeout(() => { if (!document.activeElement?.classList?.contains('gt-qty')) document.getElementById('gt-bar')?.classList.remove('typing'); }, 150); });
function gtSetQty(input) {
  if (gtLockedForMe()) { input.value = ''; return; }
  const row = input.closest('.gt-row'), k = row.dataset.k;
  const r = gtItems.find(x => gtKey(x) === k);
  let n = Math.max(0, Math.min(9999, parseInt(input.value, 10) || 0));
  const av = gtAvail(r);
  if (n && av?.n === 0 && gtCanPo(r) && !gtEditing?.admin) {   // barang gathering stok 0 → Pre Order, tidak dibatasi
  } else if (n && av?.n != null && !gtEditing?.admin) {   // tidak boleh melebihi sisa stok katalog
    const max = Math.max(0, av.n - gtFormQtyFor(av.pid, k));
    if (n > max) { n = max; input.value = n || ''; showToast(max ? `Stok ${r.name} tinggal ${max}.` : `Stok ${r.name} habis.`); }
  }
  if (n) gtQty[k] = n; else delete gtQty[k];
  row.classList.toggle('has-qty', !!n);
  row.querySelector('.gt-line').textContent = !n ? '—' : gtTbd(r) ? 'Harga menyusul' : fmtRp(n * gtNet(r));
  const pq = row.querySelector('.gt-po-q'), pt = gtPoText(r, n, av);
  if (pq && pt) pq.textContent = pt;
  else if (pq) pq.closest('.gt-note')?.remove();
  else if (pt) row.querySelector('.gt-name').insertAdjacentHTML('beforeend', `<div class="gt-note"><span class="gt-po-q">${escHtml(pt)}</span></div>`);
  gtSaveDraft();
  gtUpdateBar();
}

// Item yang dipesan (hanya yang masih ada di data & punya harga), dikelompokkan sesuai urutan data
function gtOrder() {
  const lines = (gtItems || []).filter(r => gtQty[gtKey(r)] && (gtNet(r) != null || gtTbd(r)))
    .map(r => gtTbd(r) ? { r, qty: gtQty[gtKey(r)], price: 0, total: 0, tbd: true }
      : { r, qty: gtQty[gtKey(r)], price: gtNet(r), total: gtQty[gtKey(r)] * gtNet(r) })
    .concat(gtManual.filter(m => m.qty > 0).map(m => m.price > 0 ? { r: gtManualRow(m), qty: m.qty, price: m.price, total: m.qty * m.price, manual: true }
      : { r: gtManualRow(m), qty: m.qty, price: 0, total: 0, tbd: true, manual: true }));
  const groups = [...new Set(lines.map(l => gtGroup(l.r)))].map(g => {
    const ls = lines.filter(l => gtGroup(l.r) === g);
    return { name: g, lines: ls, qty: ls.reduce((a, l) => a + l.qty, 0), total: ls.reduce((a, l) => a + l.total, 0) };
  });
  return { groups, qty: lines.reduce((a, l) => a + l.qty, 0), total: lines.reduce((a, l) => a + l.total, 0) };
}

function gtUpdateBar() {
  const o = gtOrder();
  document.getElementById('gt-count').textContent = `${o.qty} item`;
  document.getElementById('gt-sum').textContent = fmtRp(o.total);
  document.getElementById('gt-bar').classList.toggle('empty', !o.qty);
  document.querySelectorAll('.gt-sub').forEach(el => {
    const g = o.groups.find(x => x.name === el.dataset.group);
    el.textContent = g ? `${g.qty} item · ${fmtRp(g.total)}` : '';
  });
}

function gtInfo() {
  const i = Object.fromEntries(GT_INFO.map(k => [k, (document.getElementById('gt-' + k)?.value || '').trim()]));
  return { ...i, store: i.dealer };   // "Nama Toko" dihapus — nama dealer dipakai sebagai identitas toko (rekap, Top Spender)
}
const gtToday = () => new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

function gtCheck() {
  const o = gtOrder();
  if (!o.qty) { showToast('Isi jumlah (Qty) minimal satu produk dulu.'); return null; }
  const i = gtInfo();
  if (!i.dealer) { showToast('Pilih Nama Dealer dulu.'); document.getElementById(document.getElementById('gt-dealer').hidden ? 'gt-dealer-sel' : 'gt-dealer').focus(); return null; }
  return { o, i };
}

// Pembayaran Gathering — rekening tujuan transfer (ditampilkan di form, pesan WA, dan cetakan)
const GATHERING_BANKS = [
  { bank: 'BCA', no: '5065685555', name: 'CV Concerto Audio Indonesia' },
];
let gtEditing = null;
const gtToken = () => (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''));
const gtBankLines = () => GATHERING_BANKS.map(b => `${b.bank} ${b.no} a.n ${b.name}`);

function renderGtPay() {
  const el = document.getElementById('gt-pay');
  if (el) el.innerHTML = `<div class="gt-pay-title">💳 Pembayaran Gathering — transfer ke salah satu rekening:</div>
    <div class="gt-pay-list">${GATHERING_BANKS.map(b => `<div class="gt-bank"><b>${escHtml(b.bank)}</b>
      <span class="gt-bank-no">${escHtml(b.no)}</span><button class="gt-copy" onclick="gtCopy('${b.no}')" title="Salin nomor rekening">Salin</button>
      <small>a.n ${escHtml(b.name)}</small></div>`).join('')}</div>
    <div class="gt-pay-note">Pesanan masuk peringkat Top Spender setelah pembayarannya dikonfirmasi admin CAI. Sertakan nomor invoice saat transfer.</div>`;
}
async function gtCopy(t) { try { await navigator.clipboard.writeText(t); showToast('Nomor rekening disalin: ' + t); } catch (e) { showToast(t); } }

function gtOrderPayload(o, i) {
  return { dealer: i.dealer, store: i.store, city: i.city, phone: i.phone, pic: i.pic, total_qty: o.qty, total: o.total,
    items: o.groups.flatMap(g => g.lines.map(l => ({ group: g.name, brand: l.r.brand, section: l.r.section, name: l.r.name, qty: l.qty, price: l.price, total: l.total, ...(l.po ? { po: l.po } : {}), ...(l.tbd ? { tbd: true } : {}), ...(l.manual ? { manual: true } : {}) }))) };
}

async function gtSend() {
  if (gtLockedForMe()) { renderGathering(); showToast(gtClosed() ? `⛔ Shopping Gathering sudah ditutup (${GT_CLOSE_LABEL}).` : '🔒 Shopping Gathering belum dibuka.'); return; }
  const c = gtCheck(); if (!c) return;
  const { o, i } = c;
  if (gtEditing?.admin) return gtAdminSave(o, i);   // perubahan pesanan hanya oleh admin
  // cek ulang stok terbaru (bisa sudah dibeli dealer lain sejak halaman dibuka)
  await Promise.all([loadStock(), loadGtReserved()]);
  const need = new Map();
  o.groups.forEach(g => g.lines.forEach(l => { const pid = gtStockKey(l.r); if (pid && !gtAvail(l.r)?.inf) need.set(pid, { r: l.r, q: (need.get(pid)?.q || 0) + l.qty }); }));
  const short = [...need.values()].map(x => ({ ...x, a: gtAvail(x.r) })).filter(x => x.a?.n != null && x.q > x.a.n && !(x.a.n === 0 && gtCanPo(x.r)));
  if (short.length) {
    renderGathering();
    showToast('Stok tidak cukup: ' + short.map(x => `${x.r.name} (${x.a.n ? 'sisa ' + x.a.n : 'habis'})`).join(', ') + '. Kurangi Qty lalu kirim lagi.', 10000);
    return;
  }
  const sig = JSON.stringify([i.store, o.groups.map(g => g.lines.map(l => [l.r.name, l.qty]))]);
  let last = ''; try { last = localStorage.getItem(GT_SENT_KEY) || ''; } catch (e) {}
  if (sig === last && !confirm('Pesanan yang sama sudah pernah dikirim. Kirim lagi sebagai pesanan baru?')) return;
  // Pre Order: barang gathering (bukan Clearance) yang stok terbarunya benar-benar 0
  o.groups.forEach(g => g.lines.forEach(l => { l.po = gtPoQty(l.r, l.qty, gtAvail(l.r)); }));
  // Buka tab WA langsung di dalam klik (agar tidak diblokir popup), isi alamatnya setelah pesanan tersimpan
  const win = hasWa() ? window.open('', '_blank') : null;
  const btn = document.getElementById('gt-send'); btn.disabled = true;
  let invoice = '';
  try {
    const token = gtToken();
    const { data, error } = await supabase.rpc('gathering_submit_order', { p: gtOrderPayload(o, i), p_token: token });
    if (error) throw error;
    invoice = (Array.isArray(data) ? data[0]?.invoice : data?.invoice) || '';
    try { localStorage.setItem(GT_SENT_KEY, sig); } catch (e) {}
  } catch (e) {
    btn.disabled = false;
    if (win) win.close();
    const m = String(e.message || e);
    showToast('Pesanan gagal dikirim: ' + (/function|schema cache|404/i.test(m) ? 'fitur pesanan belum diaktifkan di server (hubungi CAI).' : m), 10000);
    return;
  }
  btn.disabled = false;
  const txt = ['*FORM BELANJA GATHERING CAI 2026*', `No. Invoice: *${invoice}*`,
    `Nama Dealer: ${i.dealer}`, `Kota: ${i.city || '-'}`, `No. HP: ${i.phone || '-'}`, `Distributor: ${i.pic || '-'}`, `Tanggal: ${gtToday()}`, '',
    ...o.groups.flatMap(g => [`*${g.name.toUpperCase()}*`,
      ...g.lines.map(l => l.tbd ? `• ${l.r.name}${l.manual && l.r.brand !== 'Lainnya' ? ' (' + l.r.brand + ')' : ''} × ${l.qty} — harga menyusul${l.po ? ' (Pre Order)' : ''}` : `• ${l.r.name} × ${l.qty} @ ${fmtRp(l.price)} = ${fmtRp(l.total)}${gtPoLabel(l)}`),
      `Subtotal: ${fmtRp(g.total)}`, '']),
    `*GRAND TOTAL: ${fmtRp(o.total)}* (${o.qty} item)`, '',
    '*Pembayaran (transfer ke salah satu):*', ...gtBankLines().map(b => '• ' + b), `Berita transfer: ${invoice}`, '', `(dari ${PORTAL_URL})`].join('\n');
  if (hasWa()) {
    const url = `https://wa.me/${CAI_WHATSAPP}?text=${encodeURIComponent(txt)}`;
    if (win) win.location.href = url; else window.open(url, '_blank', 'noopener');
  }
  showToast(`✓ Pesanan ${invoice} terkirim. Silakan transfer & tunggu konfirmasi admin.`, 7000);
  gtQty = {}; gtManual = []; gtSaveDraft();
  renderGathering();
  loadGtReserved();
}

// ── Edit pesanan oleh ADMIN (dari Rekap) — dealer tidak bisa mengedit ──
let gtDraftBackup = null;
function adminEditGtOrder(id) {
  const o = gtOrders?.find(x => x.id === id);
  if (!o || !isAdmin() || !gtItems) return;
  if (!gtEditing) gtDraftBackup = { qty: gtQty, manual: gtManual, info: gtInfo() };
  const origByPid = {};
  if (!['batal', 'selesai'].includes(o.status)) (o.items || []).forEach(it => { const pid = gtStockKey(it); if (pid) origByPid[pid] = (origByPid[pid] || 0) + (it.qty || 0); });
  gtEditing = { admin: true, id: o.id, invoice: o.invoice || '#' + o.id, store: o.store, origByPid };
  gtQty = {}; gtManual = [];
  const missing = [];
  (o.items || []).forEach(it => {
    if (it.manual) { gtManual.push({ id: gtManualId(), name: it.name, brand: it.brand === 'Lainnya' ? '' : it.brand, qty: it.qty, ...(it.tbd ? {} : { price: Number(it.price) || 0 }) }); return; }
    const row = gtItems.find(x => x.section === it.section && x.brand === it.brand && x.name === it.name);
    if (row) gtQty[gtKey(row)] = it.qty; else missing.push(it.name);
  });
  ['city', 'phone', 'pic'].forEach(k => { const el = document.getElementById('gt-' + k); if (el) el.value = o[k] || ''; });
  document.getElementById('gt-dealer').value = o.dealer || o.store || '';
  gtSyncDealerSelect();
  setGtTab('form'); renderGtEditing(); renderGathering();
  document.querySelector('.main')?.scrollTo(0, 0);
  if (missing.length) showToast('Produk ini tidak ada lagi di daftar gathering: ' + missing.join(', '), 9000);
}
function gtEndEdit(backToRekap) {
  gtEditing = null;
  if (gtDraftBackup) {
    gtQty = gtDraftBackup.qty || {};
    gtManual = gtDraftBackup.manual || [];
    Object.entries(gtDraftBackup.info || {}).forEach(([k, v]) => { const el = document.getElementById('gt-' + k); if (el) el.value = v; });
    gtSyncDealerSelect();
    gtDraftBackup = null;
  }
  renderGtEditing(); renderGathering();
  if (backToRekap) setGtTab('rekap');
}
function gtCancelEdit() { gtEndEdit(true); }
async function gtAdminSave(o, i) {
  const btn = document.getElementById('gt-send'); btn.disabled = true;
  try {
    const { error } = await supabase.from(GATHERING_ORDERS).update({ ...gtOrderPayload(o, i), updated_at: new Date().toISOString() }).eq('id', gtEditing.id);
    if (error) throw error;
    showToast(`✓ Pesanan ${gtEditing.invoice} diperbarui.`);
    gtOrders = null; gtEndEdit(true);
  } catch (e) { showToast('Gagal menyimpan perubahan: ' + (e.message || e), 9000); }
  finally { btn.disabled = false; }
}
function renderGtEditing() {
  const el = document.getElementById('gt-editing'), btn = document.getElementById('gt-send');
  el.hidden = !gtEditing;
  el.innerHTML = gtEditing ? `✏️ <b>Admin</b> mengedit pesanan <b>${escHtml(gtEditing.invoice)}</b> · ${escHtml(gtEditing.store || '')} — ubah Qty / data dealer (harga produk ketik manual bisa diisi di bagian bawah) lalu tekan <b>Simpan Perubahan</b>. <button class="gt-btn ghost" onclick="gtCancelEdit()">Batal edit</button>` : '';
  if (btn) btn.lastChild.textContent = gtEditing ? 'Simpan Perubahan' : 'Kirim ke Sales';
}

function gtPrint() {
  const c = gtCheck(); if (!c) return;
  const { o, i } = c;
  let el = document.getElementById('gt-print');
  if (!el) { el = document.createElement('div'); el.id = 'gt-print'; document.body.appendChild(el); }
  const info = [...(gtEditing ? [['No. Invoice', gtEditing.invoice]] : []), ['Nama Dealer', i.dealer], ['Kota', i.city], ['No. HP', i.phone], ['Distributor', i.pic], ['Tanggal', gtToday()]];
  el.innerHTML = `
    <div class="gp-head"><img src="${LOGO_NAVY}" alt="CAI"><div><h1>FORM BELANJA DEALER</h1><p>GATHERING CAI 2026 · Concerto Audio Indonesia</p></div></div>
    <table class="gp-info">${info.map(([a, b]) => `<tr><td>${a}</td><td>: ${escHtml(b || '')}</td></tr>`).join('')}</table>
    ${o.groups.map(g => `<h2>${escHtml(g.name)}</h2>
      <table class="gp-items"><thead><tr><th>No</th><th>Produk</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>
      ${g.lines.map((l, n) => `<tr><td>${n + 1}</td><td>${escHtml(l.r.name + gtPoLabel(l))}</td><td>${l.qty}</td><td>${l.tbd ? 'menyusul' : fmtRp(l.price)}</td><td>${l.tbd ? '—' : fmtRp(l.total)}</td></tr>`).join('')}
      <tr class="gp-sub"><td colspan="4">Subtotal ${escHtml(g.name)}</td><td>${fmtRp(g.total)}</td></tr></tbody></table>`).join('')}
    <table class="gp-items gp-grand"><tr><td>GRAND TOTAL (${o.qty} item)</td><td>${fmtRp(o.total)}</td></tr></table>
    <p class="gp-terms"><b>Pembayaran (transfer ke salah satu):</b><br>${gtBankLines().map(escHtml).join('<br>')}</p>
    <p class="gp-terms">Harga Spesial Gathering hanya berlaku selama acara berlangsung. Clearance: harga clearance = harga normal − diskon 50% − cashback 10% × DPP (DPP = harga setelah diskon ÷ 1,11), stok terbatas.</p>
    <div class="gp-sign"><div>Dealer<br><br><br>(______________________)</div><div>Distributor<br><br><br>(______________________)</div></div>`;
  window.print();
}


/* ── Rekap pesanan gathering (khusus admin/editor) ──
   Tabel `gathering_orders`: dealer (akun bersama) hanya boleh INSERT; baca/ubah/hapus hanya admin/editor. */
const GATHERING_ORDERS = 'gathering_orders';
const GT_SENT_KEY = 'cai-gathering-sent';
const GT_STATUS = { baru: 'Menunggu Konfirmasi', dikonfirmasi: 'Dikonfirmasi', belum_lunas: 'Belum Lunas', selesai: 'Selesai', batal: 'Batal' };
// Belum Lunas (28 Okt 2026, permintaan pemilik) = pembelian disetujui tapi pembayaran belum penuh — tetap masuk Top Spender & mengurangi stok seperti Dikonfirmasi
const gtConfirmed = o => o.status === 'dikonfirmasi' || o.status === 'belum_lunas' || o.status === 'selesai';
let gtTrash = [];   // pesanan yang dipindah ke Terhapus (status 'terhapus', bisa dipulihkan)
let gtOrders = null, gtOrdersErr = '', gtTab = 'form', gtOrderFilter = 'all', gtOpenOrder = null;

function setGtTab(t) {
  gtTab = t === 'rekap' ? (isAdmin() ? 'rekap' : 'form') : t === 'top' ? 'top' : 'form';
  ['form', 'top', 'rekap'].forEach(k => {
    document.getElementById('gt-' + k).hidden = gtTab !== k;
    document.getElementById('gt-tab-' + k)?.classList.toggle('active', gtTab === k);
  });
  document.getElementById('view-gathering').classList.toggle('rekap-mode', gtTab !== 'form');
  if (gtTab === 'rekap') { renderGtRekap(); loadGtOrders(); }
  if (gtTab === 'top') { renderGtTop(); loadGtTop(); }
}

/* ── Top Spender Gathering 2026 ──
   Dealer (akun bersama) tidak boleh membaca gathering_orders, jadi peringkat diambil lewat fungsi
   Postgres `gathering_top_spenders(lim)` (SECURITY DEFINER) yang hanya mengembalikan agregat per toko. */
// Hadiah ranking Top Spender (dari pemilik 28 Okt 2026; v = nilai hadiah, kosong = tidak ditampilkan)
const GT_TOP_PRIZES = [
  { p: 'Concerto Line 3 Way', b: 'Audiocircle', note: 'Seri terbaru', v: 'Rp 59,9 jt' },
  { p: 'XSS16', b: 'STEG', v: 'Rp 50 jt+' },
  { p: 'SSDSP16 II', b: 'STEG', v: 'Rp 43 jt' },
  { p: 'SSDSP12 II', b: 'STEG', v: 'Rp 37 jt' },
  { p: '2 Way Berlin (New)', b: 'Audiocircle', v: 'Rp 15 jt' },
  { p: 'Köln 3 Way', b: 'Audiocircle', v: 'Rp 9 jt' },
  { p: 'DSP S12', b: 'STEG', v: 'Rp 8,6 jt' },
  { p: 'IQ LES 10', b: 'Audiocircle', v: 'Rp 8 jt' },
  { p: 'Berlin Tweeter AMT (New)', b: 'Audiocircle', v: 'Rp 6,6 jt' },
  { p: 'DSP S6', b: 'STEG', v: 'Rp 4,2 jt' },
];
const GT_TOP_PRIZE_REST = 'SEC-650 Coaxial';   // hadiah ranking 11 dan seterusnya
const gtPrizeHtml = i => { const z = GT_TOP_PRIZES[i]; return z ? `<div class="gt-top-prize">Hadiah: <b>${escHtml(z.p)}</b> · ${escHtml(z.b)}${z.note ? ' · ' + escHtml(z.note) : ''}${z.v ? ` · senilai <b>${escHtml(z.v)}</b>` : ''}</div>` : ''; };
const GT_TOP_HIGHLIGHT = 10;  // 10 besar ditonjolkan; toko lain tetap tampil di daftar bawahnya
const GT_TOP_FETCH = 1000;
const GT_TOP_FACTOR = 1 / 1.11;   // nilai di papan = subtotal pembelian ÷ 111% (subtotal dikurangi PPN 11%); fungsi SQL tetap mengembalikan subtotal
let gtTop = null, gtTopErr = '', gtTopAt = 0;
// tombol Muat ulang: beri tanda sedang memuat + notifikasi, agar terlihat bekerja walau angkanya tidak berubah
async function reloadGtTop(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Memuat…'; }
  await loadGtTop();
  showToast(gtTopErr ? '⚠ ' + gtTopErr : '✓ Top Spender diperbarui');
}
async function loadGtTop() {
  if (!supabase || !authUser) return;
  try {
    const { data, error } = await supabase.rpc('gathering_top_spenders', { lim: GT_TOP_FETCH });
    if (error) throw error;
    gtTop = (data || []).map(r => ({ ...r, total: Math.round(Number(r.total || 0) * GT_TOP_FACTOR) })); gtTopErr = ''; gtTopAt = Date.now();
  } catch (e) {
    const m = String(e.message || e);
    gtTop = [];
    gtTopErr = /function|does not exist|schema cache|404/i.test(m) ? 'Papan Top Spender belum diaktifkan. Admin/editor: jalankan SQL fungsi gathering_top_spenders di Supabase.' : 'Top Spender tidak bisa dimuat: ' + m;
  }
  renderGtTop();
}
function renderGtTop() {
  const el = document.getElementById('gt-top');
  if (!el || gtTab !== 'top') return;
  const head = `<div class="gt-top-head"><div class="gt-top-title">🏆 Top Spender Gathering 2026</div>
    <div class="gt-top-sub">Total belanja semua dealer selama Gathering CAI 2026 (sebelum PPN 11%) · ${GT_TOP_HIGHLIGHT} besar ditonjolkan · dihitung dari pembelian yang sudah dikonfirmasi admin${gtTopAt ? ` · diperbarui pukul ${new Date(gtTopAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' })}` : ''}</div>
    <button class="gt-btn ghost" id="gt-top-reload" onclick="reloadGtTop(this)">↻ Muat ulang</button></div>`;
  if (gtTop === null) { el.innerHTML = head + '<div class="stock-empty">Memuat peringkat…</div>'; return; }
  if (gtTopErr) { el.innerHTML = head + `<div class="stock-empty">${escHtml(gtTopErr)}</div>`; return; }
  if (!gtTop.length) { el.innerHTML = head + '<div class="stock-empty">Belum ada pembelian yang dikonfirmasi. Jadilah toko pertama di papan Top Spender!</div>'; return; }
  const medal = ['🥇', '🥈', '🥉'];
  const all = gtTop.reduce((a, r) => a + Number(r.total || 0), 0);
  const rest = gtTop.slice(GT_TOP_HIGHLIGHT);
  el.innerHTML = head + `<div class="gt-top-stats"><span><b>${gtTop.length}</b> toko</span><span>Total pembelian <b>${fmtRp(all)}</b></span></div>
    <div class="gt-top-note"><b>Hadiah ranking:</b> Juara 1–${GT_TOP_PRIZES.length} mendapatkan hadiah yang tertera di kartunya masing-masing · ranking ${GT_TOP_PRIZES.length + 1} dan seterusnya mendapatkan <b>${escHtml(GT_TOP_PRIZE_REST)}</b></div>
    <div class="gt-top-list">${Array.from({ length: Math.max(Math.min(gtTop.length, GT_TOP_HIGHLIGHT), GT_TOP_PRIZES.length) }, (_, i) => gtTop[i] ? `
    <div class="gt-top-row hl rank-${i + 1}">
      <div class="gt-top-rank">${medal[i] || '#' + (i + 1)}</div>
      <div class="gt-top-store"><b>${escHtml(gtTop[i].store || '-')}</b>${gtTop[i].city ? `<span>${escHtml(gtTop[i].city)}</span>` : ''}${gtPrizeHtml(i)}</div>
      <div class="gt-top-total">${fmtRp(Number(gtTop[i].total || 0))}</div>
    </div>` : `
    <div class="gt-top-row hl empty">
      <div class="gt-top-rank">${medal[i] || '#' + (i + 1)}</div>
      <div class="gt-top-store"><b>Belum terisi</b><span>Juara ${i + 1} — raih posisi ini!</span>${gtPrizeHtml(i)}</div>
      <div class="gt-top-total">–</div>
    </div>`).join('')}</div>
    ${rest.length ? `<div class="line-header gt-top-more"><span class="line-name">Peringkat lainnya · hadiah ${escHtml(GT_TOP_PRIZE_REST)}</span><span class="line-count">${rest.length}</span></div>
    <div class="gt-top-rest">${rest.map((r, i) => `
      <div class="gt-rest-row"><span class="gt-rest-rank">${GT_TOP_HIGHLIGHT + i + 1}</span>
        <span class="gt-rest-store"><b>${escHtml(r.store || '-')}</b>${r.city ? ` <span>· ${escHtml(r.city)}</span>` : ''}</span>
        <span class="gt-rest-total">${fmtRp(Number(r.total || 0))}</span></div>`).join('')}</div>` : ''}`;
}

async function loadGtOrders() {
  if (!supabase || !isAdmin()) return;
  try {
    const { data, error } = await supabase.from(GATHERING_ORDERS).select('*').order('created_at', { ascending: false });
    if (error) throw error;
    gtTrash = (data || []).filter(o => o.status === 'terhapus');
    gtOrders = (data || []).filter(o => o.status !== 'terhapus'); gtOrdersErr = '';
  } catch (e) {
    const m = String(e.message || e);
    gtOrders = []; gtTrash = [];
    gtOrdersErr = /does not exist|relation|schema cache/i.test(m) ? 'Tabel rekap pesanan belum dibuat. Jalankan SQL "gathering_orders" di Supabase.' : 'Rekap tidak bisa dimuat: ' + m;
  }
  renderGtRekap();
}

const fmtGtTime = d => new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const gtActive = () => (gtOrders || []).filter(o => o.status !== 'batal');
// Produk brand ini boleh dipesan & masuk invoice, tapi TIDAK masuk akumulasi penjualan (rekap toko/total) maupun Top Spender
const gtNoAccum = it => /^audio\s*system$/i.test(String(it.brand || it.group || '').trim());
const gtAccumTotal = o => Array.isArray(o.items) && o.items.length ? o.items.reduce((a, it) => a + (gtNoAccum(it) ? 0 : Number(it.total || 0)), 0) : Number(o.total || 0);

// Total per produk dari semua pesanan yang tidak batal
// Nama toko untuk rekap (store = nama dealer; kota dipisah). Kunci dinormalisasi agar penulisan beda huruf tetap satu toko.
const gtStoreName = o => (o.store || o.dealer || 'Tanpa nama').trim();
function gtProductTotals() {
  const m = new Map();
  gtActive().forEach(o => (o.items || []).forEach(it => {
    const k = it.group + '|' + it.name;
    const x = m.get(k) || { group: it.group, name: it.name, qty: 0, total: 0, orders: 0, stores: new Map() };
    x.qty += it.qty; x.total += it.total; x.orders++;
    const sk = normKey(gtStoreName(o)), st = x.stores.get(sk) || { name: gtStoreName(o), city: o.city || '', qty: 0, total: 0 };
    st.qty += it.qty; st.total += it.total; x.stores.set(sk, st);
    m.set(k, x);
  }));
  return [...m.values()].map(x => ({ ...x, stores: [...x.stores.values()].sort((a, b) => b.total - a.total) })).sort((a, b) => b.total - a.total);
}
// Rekap per toko: total pembelian tiap toko (tanpa pesanan batal) + rincian barangnya
function gtStoreTotals() {
  const m = new Map();
  gtActive().forEach(o => {
    const k = normKey(gtStoreName(o));
    const x = m.get(k) || { name: gtStoreName(o), city: o.city || '', orders: 0, qty: 0, total: 0, items: new Map() };
    x.orders++; x.city = x.city || o.city || '';
    (o.items || []).forEach(it => {
      if (!gtNoAccum(it)) { x.qty += it.qty; x.total += it.total; }
      const ik = it.group + '|' + it.name, y = x.items.get(ik) || { name: it.name, group: it.group, qty: 0, total: 0 };
      y.qty += it.qty; y.total += it.total; x.items.set(ik, y);
    });
    m.set(k, x);
  });
  return [...m.values()].map(x => ({ ...x, items: [...x.items.values()].sort((a, b) => b.total - a.total) })).sort((a, b) => b.total - a.total);
}

function setGtOrderFilter(f) { gtOrderFilter = f; renderGtRekap(); }
function toggleGtOrder(id) { gtOpenOrder = gtOpenOrder === id ? null : id; renderGtRekap(); }

function renderGtRekap() {
  const el = document.getElementById('gt-rekap');
  if (!el || gtTab !== 'rekap') return;
  if (gtOrders === null) { el.innerHTML = '<div class="stock-empty">Memuat rekap…</div>'; return; }
  if (gtOrdersErr) { el.innerHTML = `<div class="stock-empty">${escHtml(gtOrdersErr)}</div>`; return; }
  const act = gtActive();
  const q = normKey(document.getElementById('gt-rk-search')?.value || '');
  const list = gtOrders.filter(o => (gtOrderFilter === 'all' || o.status === gtOrderFilter) &&
    (!q || normKey([o.invoice, o.store, o.city, o.dealer, o.pic, o.phone].join(' ')).includes(q)));
  const prods = gtProductTotals(), stores = gtStoreTotals();
  const count = st => gtOrders.filter(o => o.status === st).length;
  el.innerHTML = `
    <div class="stock-summary">
      <div class="stock-sum"><b>${count('baru')}</b><span>Menunggu konfirmasi</span></div>
      <div class="stock-sum"><b>${gtOrders.filter(gtConfirmed).length}</b><span>Dikonfirmasi</span></div>
      <div class="stock-sum"><b>${act.reduce((a, o) => a + (o.total_qty || 0), 0)}</b><span>Total item (tanpa batal)</span></div>
      <div class="stock-sum gt-sum-val"><b>${fmtRp(gtOrders.filter(gtConfirmed).reduce((a, o) => a + gtAccumTotal(o), 0))}</b><span>Nilai dikonfirmasi (tanpa Audio System)</span></div>
    </div>
    <div class="gt-rk-tools">
      <input id="gt-rk-search" class="catalog-search gt-rk-search" placeholder="Cari invoice, toko, kota, dealer, sales…" value="${escHtml(document.getElementById('gt-rk-search')?.value || '')}" oninput="renderGtRekap(); this.focus(); this.setSelectionRange(this.value.length, this.value.length)">
      <div class="catalog-chips">${['all', ...Object.keys(GT_STATUS)].map(st =>
        `<button class="filter-chip${gtOrderFilter === st ? ' active' : ''}" onclick="setGtOrderFilter('${st}')">${st === 'all' ? 'Semua' : GT_STATUS[st]} (${st === 'all' ? gtOrders.length : count(st)})</button>`).join('')}
        <button class="filter-chip gt-trash-chip${gtOrderFilter === 'trash' ? ' active' : ''}" onclick="setGtOrderFilter('trash')">🗑 Terhapus (${gtTrash.length})</button></div>
      <div class="gt-rk-actions">
        <button class="gt-btn ghost" onclick="loadGtOrders()">↻ Muat ulang</button>
        <button class="gt-btn ghost" onclick="exportGtOrders()">⬇ Excel</button>
      </div>
    </div>
    ${gtOrderFilter === 'trash' ? gtTrashHtml() : ''}<div class="gt-orders"${gtOrderFilter === 'trash' ? ' hidden' : ''}>${list.length ? list.map(o => `
      <div class="gt-order st-${o.status}">
        <div class="gt-order-head" onclick="toggleGtOrder(${o.id})">
          <div class="gt-order-main">
            <div class="gt-order-inv">${escHtml(o.invoice || '—')}${o.updated_at ? ' <span>· diubah ' + fmtGtTime(o.updated_at) + '</span>' : ''}</div>
            <div class="gt-order-store">${escHtml(o.store || '-')}${o.city ? ` <span>· ${escHtml(o.city)}</span>` : ''}</div>
            <div class="gt-order-sub">${fmtGtTime(o.created_at)} · ${escHtml([o.dealer && o.dealer !== o.store ? o.dealer : '', o.pic ? 'Distributor: ' + o.pic : ''].filter(Boolean).join(' · ') || '—')}</div>
          </div>
          <div class="gt-order-total"><b>${fmtRp(Number(o.total || 0))}</b><span>${o.total_qty} item</span></div>
        </div>
        ${o.status === 'baru' ? `<div class="gt-confirm-bar"><span>⏳ Menunggu pembayaran. Setelah transfer${o.invoice ? ' (berita: ' + escHtml(o.invoice) + ')' : ''} diterima, klik konfirmasi — pembelian langsung masuk Top Spender.</span>
          <button class="gt-btn confirm" onclick="event.stopPropagation(); confirmGtOrder(${o.id})">✓ Konfirmasi Pembayaran</button></div>`
          : o.status === 'belum_lunas' ? `<div class="gt-confirm-bar warn"><span>⚠ Belum lunas — tetap masuk Top Spender. Klik konfirmasi setelah pelunasan diterima.</span>
          <button class="gt-btn confirm" onclick="event.stopPropagation(); confirmGtOrder(${o.id})">✓ Konfirmasi Pelunasan</button></div>`
          : gtConfirmed(o) ? `<div class="gt-confirm-bar ok"><span>✅ Pembayaran dikonfirmasi${o.confirmed_at ? ' · ' + fmtGtTime(o.confirmed_at) : ''} — masuk Top Spender.</span></div>` : ''}
        ${gtOpenOrder === o.id ? `<div class="gt-order-body">
          <table class="gt-order-items"><thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>
          ${(o.items || []).map(it => `<tr><td>${escHtml(it.name)}${gtPoLabel(it) ? `<b class="gt-po">${escHtml(gtPoLabel(it).trim())}</b>` : ''}<small>${escHtml(it.group)}</small></td><td>${it.qty}</td><td>${fmtRp(it.price)}</td><td>${fmtRp(it.total)}</td></tr>`).join('')}
          </tbody></table>
          <div class="gt-order-actions">
            ${o.phone ? `<a class="gt-btn ghost" href="https://wa.me/${o.phone.replace(/\D/g, '').replace(/^0/, '62')}" target="_blank" rel="noopener">💬 WA ${escHtml(o.phone)}</a>` : ''}
            <label class="gt-status">Status
              <select onchange="setGtOrderStatus(${o.id}, this.value)">${Object.entries(GT_STATUS).map(([k, v]) => `<option value="${k}"${o.status === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
            <button class="gt-btn ghost" onclick="downloadGtInvoice(${o.id})">⬇ Download Invoice</button>
            <button class="gt-btn ghost" onclick="shareGtOrderWa(${o.id})" title="Bagikan PDF invoice lewat WhatsApp (pilih kontak/grup)">📤 Bagikan Invoice (WA)</button>
            <button class="gt-btn ghost" onclick="adminEditGtOrder(${o.id})">✏️ Edit Pesanan</button>
            ${o.status === 'baru' || o.status === 'belum_lunas' ? `<button class="gt-btn confirm" onclick="confirmGtOrder(${o.id})">✓ Konfirmasi Pembayaran</button>` : ''}
            <button class="gt-btn ghost gt-del" onclick="deleteGtOrder(${o.id})">🗑 Hapus</button>
          </div></div>` : ''}
        <span class="gt-badge st-${o.status}">${GT_STATUS[o.status] || o.status}</span>
      </div>`).join('') : `<div class="stock-empty">${gtOrders.length ? 'Tidak ada pesanan yang cocok.' : 'Belum ada pesanan. Pesanan muncul di sini saat dealer menekan "Kirim ke Sales".'}</div>`}</div>
    ${stores.length ? `<div class="line-header gt-rk-head"><span class="line-name">Rekap per toko</span><span class="line-count">${stores.length}</span><span class="gt-sub">tanpa pesanan batal</span></div>
    <div class="gt-table gt-prod-table gt-store-table"><div class="gt-row gt-head"><span>Toko</span><span>Kota</span><span>Pesanan</span><span>Total Qty</span><span>Total Pembelian</span></div>
      ${stores.map((t, i) => `<div class="gt-row"><span class="gt-name"><b class="gt-rank">${i + 1}</b>${escHtml(t.name)}<small class="gt-store-items">${t.items.map(it => `${escHtml(it.name)} ×${it.qty}`).join(' · ')}</small></span><span class="gt-p" data-l="Kota">${escHtml(t.city || '—')}</span><span class="gt-p" data-l="Pesanan">${t.orders}</span><span class="gt-p gt-sp" data-l="Total Qty">${t.qty}</span><span class="gt-p gt-line" data-l="Total Pembelian">${fmtRp(t.total)}</span></div>`).join('')}
      <div class="gt-row gt-store-sum"><span class="gt-name">Total semua toko</span><span class="gt-p"></span><span class="gt-p" data-l="Pesanan">${stores.reduce((a, t) => a + t.orders, 0)}</span><span class="gt-p gt-sp" data-l="Total Qty">${stores.reduce((a, t) => a + t.qty, 0)}</span><span class="gt-p gt-line" data-l="Total Pembelian">${fmtRp(stores.reduce((a, t) => a + t.total, 0))}</span></div>
    </div>` : ''}
    ${prods.length ? `<div class="line-header gt-rk-head"><span class="line-name">Rekap per produk</span><span class="line-count">${prods.length}</span><span class="gt-sub">tanpa pesanan batal</span></div>
    <div class="gt-table gt-prod-table"><div class="gt-row gt-head"><span>Produk</span><span>Grup</span><span>Pesanan</span><span>Total Qty</span><span>Total Nilai</span></div>
      ${prods.map(p => `<div class="gt-row"><span class="gt-name">${escHtml(p.name)}<small class="gt-store-items">${p.stores.map(t => `${escHtml(t.name)} ×${t.qty}`).join(' · ')}</small></span><span class="gt-p" data-l="Grup">${escHtml(p.group)}</span><span class="gt-p" data-l="Pesanan">${p.orders}</span><span class="gt-p gt-sp" data-l="Total Qty">${p.qty}</span><span class="gt-p gt-line" data-l="Total Nilai">${fmtRp(p.total)}</span></div>`).join('')}
    </div>` : ''}`;
}


// ── Invoice PDF (jsPDF) — format "INVOICE BELANJA · GATHERING CAI 2026" ──
function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  const a = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const t = x => x < 12 ? a[x] : x < 20 ? t(x - 10) + ' belas' : x < 100 ? t(Math.floor(x / 10)) + ' puluh ' + t(x % 10)
    : x < 200 ? 'seratus ' + t(x - 100) : x < 1000 ? t(Math.floor(x / 100)) + ' ratus ' + t(x % 100)
    : x < 2000 ? 'seribu ' + t(x - 1000) : x < 1e6 ? t(Math.floor(x / 1000)) + ' ribu ' + t(x % 1000)
    : x < 1e9 ? t(Math.floor(x / 1e6)) + ' juta ' + t(x % 1e6) : x < 1e12 ? t(Math.floor(x / 1e9)) + ' miliar ' + t(x % 1e9)
    : t(Math.floor(x / 1e12)) + ' triliun ' + t(x % 1e12);
  const w = t(n).replace(/\s+/g, ' ').trim();
  return w ? w.charAt(0).toUpperCase() + w.slice(1) + ' rupiah' : 'Nol rupiah';
}

// Kode barang untuk invoice (permintaan pemilik 21 Okt 2026): ambil bagian depan nama yang cocok dengan
// model/alias katalog (mis. "SQ8-2SE Subwoofer 8\"" → "SQ8-2SE"); bila tak cocok, potong di kata keterangan
let gtCodeKeys = null;
const GT_DESC_WORD = /^(subwoofer|sub|speaker|speakers|tweeter|tweeters|midrange|mid|woofer|amplifier|amp|power|coaxial|component|komponen|cable|kabel|sound|deadening|active|processor|set|pair|pasang|channel|class|mono|slim|underseat|under-seat|plug|for|untuk)$/i;
function gtCode(name) {
  const nm = String(name || '').trim(), n = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!gtCodeKeys) {
    gtCodeKeys = new Set(Object.keys(STOCK_ALIASES).map(n));
    BRANDS.forEach(b => b.lines.forEach(l => l.products.forEach(p => { gtCodeKeys.add(n(p.model)); gtCodeKeys.add(n(p.name)); })));
  }
  const t = nm.split(/\s+/);
  for (let i = t.length; i > 0; i--) { const c = t.slice(0, i).join(' '); if (gtCodeKeys.has(n(c))) return c; }
  const k = t.findIndex((w, i) => i > 0 && (GT_DESC_WORD.test(w.replace(/[^\w-]/g, '')) || /\d+(\.\d+)?("|''|inch|in)$/i.test(w)));
  return k > 0 ? t.slice(0, k).join(' ') : nm;
}
function downloadGtInvoice(id, build) {   // build = true → kembalikan { doc, name } tanpa mengunduh (dipakai Bagikan)
  const o = gtOrders?.find(x => x.id === id);
  if (!o) return;
  if (!window.jspdf) { showToast('Komponen PDF belum termuat — periksa koneksi lalu coba lagi.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const NAVY = [12, 22, 48], GOLD = [198, 160, 72], HEAD = [47, 58, 92], GRID = [176, 181, 199], ZEBRA = [242, 243, 247];
  const L = 14, R = 196, W = R - L;
  const nf = n => Number(n || 0).toLocaleString('id-ID');
  const rp = n => n == null ? '' : nf(n);
  const items = o.items || [];
  const date = new Date(o.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  let page = 0;

  const header = () => {
    page++;
    doc.setFillColor(...NAVY); doc.rect(L, 12, W, 22, 'F');
    try { doc.addImage(LOGO_WHITE, 'PNG', L + 8, 15.5, 40, 40 * 156 / 431); } catch (e) {}
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('INVOICE BELANJA', R - 4, 21, { align: 'right' });
    doc.setTextColor(...GOLD); doc.setFontSize(11.5); doc.text('GATHERING CAI 2026', R - 4, 26.5, { align: 'right' });
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text('Concerto Audio Indonesia', R - 4, 31, { align: 'right' });
  };
  const footer = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140, 140, 150);
    doc.text(`CAI – Concerto Audio Indonesia  |  Gathering CAI 2026  |  ${o.invoice || ''}  |  Hal. ${page}`, 105, 288, { align: 'center' });
  };
  const field = (label, value, x, y, lineEnd) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 30); doc.text(label, x, y);
    doc.setFont('helvetica', 'normal'); doc.text(':', x + 30, y);
    doc.text(String(value || '-'), x + 33, y, { maxWidth: lineEnd - x - 34 });
    doc.setDrawColor(170, 170, 180); doc.setLineDashPattern([0.4, 0.6], 0); doc.line(x + 32, y + 1.4, lineEnd, y + 1.4); doc.setLineDashPattern([], 0);
  };

  header();
  let y = 44;
  const lf = [['No. Invoice', o.invoice], ['Nama Dealer', o.store || o.dealer], ['Kota', o.city]];
  const rf = [['Tanggal', date], ['No. HP', o.phone], ['Distributor', o.pic], ['Status', GT_STATUS[o.status] || o.status]];
  lf.forEach(([k, v], n) => field(k, v, L, y + n * 6.2, 100));
  rf.forEach(([k, v], n) => field(k, v, 108, y + n * 6.2, R));
  y += 4 * 6.2 + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...NAVY); doc.text('RINCIAN INVOICE', L, y);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.line(L, y + 2, R, y + 2); doc.setLineWidth(0.2);
  y += 7;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(90, 90, 100);
  doc.text('Rincian produk sesuai pesanan Shopping Gathering (termasuk item Clearance Sale: diskon 50% − cashback 10% DPP). Harga = harga spesial gathering / harga clearance.', L, y, { maxWidth: W });
  y += 5;

  // table
  const cols = [{ t: 'No', w: 9, a: 'center' }, { t: 'Brand', w: 30, a: 'left' }, { t: 'Seri Produk Dipilih', w: 63, a: 'left' },
                { t: 'Qty', w: 13, a: 'center' }, { t: 'Harga Gathering (Rp)', w: 34, a: 'right' }, { t: 'Subtotal (Rp)', w: 33, a: 'right' }];
  const rowH = 5.6;
  const thead = () => {
    doc.setFillColor(...HEAD); doc.rect(L, y, W, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
    let x = L; cols.forEach(c => { doc.text(c.t, x + c.w / 2, y + 4.7, { align: 'center' }); x += c.w; });
    y += 7;
  };
  const cell = (c, x, txt) => {
    const tx = c.a === 'center' ? x + c.w / 2 : c.a === 'right' ? x + c.w - 2 : x + 2;
    doc.text(String(txt), tx, y + 3.9, { align: c.a, maxWidth: c.w - 3 });
  };
  thead();
  const rows = items.map((it, n) => [n + 1, it.brand || it.group || '', gtCode(it.name) + (it.section === 'clearance' ? ' (Clearance)' : '') + gtPoLabel(it), it.qty, rp(it.price), rp(it.total)]);
  const minRows = Math.max(rows.length, rows.length <= 17 ? 17 : rows.length);
  for (let n = 0; n < minRows; n++) {
    if (y + rowH > 250) { footer(); doc.addPage(); header(); y = 44; thead(); }
    if (n % 2) { doc.setFillColor(...ZEBRA); doc.rect(L, y, W, rowH, 'F'); }
    doc.setDrawColor(...GRID); doc.setLineWidth(0.15);
    let x = L; cols.forEach(c => { doc.rect(x, y, c.w, rowH); x += c.w; });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(25, 25, 35);
    const r = rows[n] || [n + 1, '', '', '', '', ''];
    x = L; cols.forEach((c, k) => { cell(c, x, r[k]); x += c.w; });
    y += rowH;
  }
  // DPP → PPN 11% → grand total (harga gathering sudah termasuk PPN: DPP = total ÷ 1,11)
  if (y + 24 > 255) { footer(); doc.addPage(); header(); y = 44; }
  const wLabel = cols[0].w + cols[1].w + cols[2].w;
  const gTotal = Math.round(Number(o.total || 0)), dpp = Math.round(gTotal / 1.11), ppn = gTotal - dpp;
  [['DPP (Total ÷ 1,11)', dpp], ['PPN 11% (DPP × 11%)', ppn]].forEach(([lab, val]) => {
    doc.setDrawColor(...GRID); doc.setLineWidth(0.15); doc.rect(L, y, W, 7); doc.line(L + wLabel, y, L + wLabel, y + 7);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(40, 40, 55);
    doc.text(lab, L + wLabel - 3, y + 4.8, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.text(rp(val), R - 2, y + 4.8, { align: 'right' });
    y += 7;
  });
  doc.setFillColor(...GOLD); doc.rect(L, y, wLabel, 8, 'F');
  doc.setFillColor(248, 241, 222); doc.rect(L + wLabel, y, W - wLabel, 8, 'F');
  doc.setDrawColor(...GRID); doc.rect(L, y, W, 8); doc.line(L + wLabel, y, L + wLabel, y + 8);
  doc.line(L + wLabel + cols[3].w, y, L + wLabel + cols[3].w, y + 8); doc.line(L + wLabel + cols[3].w + cols[4].w, y, L + wLabel + cols[3].w + cols[4].w, y + 8);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(20, 20, 30);
  doc.text('GRAND TOTAL', L + wLabel - 3, y + 5.5, { align: 'right' });
  doc.setFontSize(9.5);
  doc.text(String(o.total_qty || items.reduce((a, it) => a + it.qty, 0)), L + wLabel + cols[3].w / 2, y + 5.5, { align: 'center' });
  doc.text(rp(gTotal), R - 2, y + 5.5, { align: 'right' });
  y += 14;

  // terbilang & catatan
  if (y + 50 > 284) { footer(); doc.addPage(); header(); y = 44; }
  field('Terbilang', terbilang(o.total), L, y, R);
  // Catatan: satu informasi per baris (rekening, berita transfer, konfirmasi)
  const noteLines = [['Transfer ke', ''], ...GATHERING_BANKS.map(b => ['', `•  ${b.bank} ${b.no}  a.n ${b.name}`]),
    ['Berita transfer', o.invoice || '-'], ...(o.confirmed_at ? [['Dikonfirmasi', fmtGtTime(o.confirmed_at)]] : [])];
  let ny = y + 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 30); doc.text('Catatan', L, ny);
  doc.setFont('helvetica', 'normal'); doc.text(':', L + 30, ny);
  noteLines.forEach(([k, v]) => {
    doc.setFontSize(8.8);
    if (k) { doc.setFont('helvetica', 'bold'); doc.text(k, L + 33, ny); doc.setFont('helvetica', 'normal'); if (v) doc.text(': ' + v, L + 60, ny); }
    else doc.text(v, L + 36, ny);
    ny += 4.6;
  });
  y = ny + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 20, 30);
  // tanda tangan: Dealer · Distributor · CV Concerto Audio Indonesia
  const sig = [[45, 'Dealer', ''], [105, 'Distributor', o.pic || ''], [165, 'CV Concerto Audio Indonesia', '']];
  sig.forEach(([cx, t]) => doc.text(t, cx, y, { align: 'center' }));
  doc.setFont('helvetica', 'normal');
  doc.setDrawColor(40, 40, 50); doc.setLineWidth(0.3);
  sig.forEach(([cx, , nm]) => {
    doc.setFontSize(10); doc.text('(', cx - 23, y + 22); doc.text(')', cx + 22, y + 22); doc.line(cx - 21, y + 22.6, cx + 21, y + 22.6);
    if (nm) { doc.setFontSize(9); doc.text(nm, cx, y + 20.5, { align: 'center' }); }
  });
  footer();
  const name = `Invoice-${o.invoice || o.id}-${(o.store || '').replace(/[^\w]+/g, '_')}.pdf`;
  if (build) return { doc, name };
  doc.save(name);
}

// Bagikan PDF invoice lewat WhatsApp (Rekap admin; bisa sebelum/sesudah konfirmasi pembayaran).
// Web Share API dengan file (HP & sebagian browser desktop) → pilih WhatsApp & penerima;
// browser yang tidak mendukung → PDF diunduh lalu WhatsApp Web dibuka untuk dilampirkan manual.
async function shareGtOrderWa(id) {
  const o = gtOrders.find(x => x.id === id);
  if (!o) return;
  const r = downloadGtInvoice(id, true);
  if (!r) return;
  const file = new File([r.doc.output('blob')], r.name, { type: 'application/pdf' });
  const text = `Invoice Gathering CAI 2026 — ${o.invoice || ''} · ${o.store || o.dealer || ''}`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: r.name, text }); }
    catch (e) { if (e?.name !== 'AbortError') showToast('Gagal membagikan: ' + (e?.message || e)); }
    return;
  }
  r.doc.save(r.name);
  showToast('Browser ini tidak bisa membagikan file langsung — PDF invoice diunduh, lampirkan di WhatsApp yang terbuka.', 6000);
  window.open('https://web.whatsapp.com/', '_blank', 'noopener');
}

async function confirmGtOrder(id) {
  const o = gtOrders.find(x => x.id === id);
  if (!o || !confirm(`Pembayaran ${o.invoice || ''} — ${o.store} (${fmtRp(Number(o.total || 0))}) sudah diterima?\n\nPembelian akan dikonfirmasi dan masuk Top Spender.`)) return;
  await setGtOrderStatus(id, 'dikonfirmasi');
}

async function setGtOrderStatus(id, status) {
  try {
    const patch = { status, ...(status === 'dikonfirmasi' ? { confirmed_at: new Date().toISOString() } : {}) };
    const { error } = await supabase.from(GATHERING_ORDERS).update(patch).eq('id', id);
    if (error) throw error;
    const o = gtOrders.find(x => x.id === id); if (o) o.status = status;
    loadGtSold().then(refreshStockUI);   // stok katalog ikut berubah (dikonfirmasi = berkurang, batal/selesai = tidak dihitung)
    renderGtRekap(); showToast(status === 'dikonfirmasi' ? '✓ Pembelian dikonfirmasi — masuk Top Spender.' : status === 'belum_lunas' ? 'Status Belum Lunas — tetap masuk Top Spender.' : 'Status pesanan diperbarui.');
  } catch (e) { showToast('Gagal mengubah status: ' + (e.message || e), 8000); }
}

// 🗑 Hapus = pindah ke "Terhapus" (28 Okt 2026, permintaan pemilik — sebelumnya langsung terhapus permanen):
// status 'terhapus' + prev_status (status sebelum dihapus) → bisa dipulihkan; hapus permanen hanya dari daftar Terhapus.
const GT_TRASH_SQL = `alter table public.gathering_orders drop constraint if exists gathering_orders_status_check;
alter table public.gathering_orders add constraint gathering_orders_status_check
  check (status in ('baru','diproses','dikonfirmasi','belum_lunas','selesai','batal','terhapus'));
alter table public.gathering_orders add column if not exists prev_status text;`;
const gtAfterOrderChange = () => { loadGtSold().then(refreshStockUI); loadGtReserved?.(); };
async function deleteGtOrder(id) {
  const o = gtOrders.find(x => x.id === id);
  if (!o || !confirm(`Pindahkan pesanan ${o.invoice || ''} — ${o.store} (${fmtGtTime(o.created_at)}) ke Terhapus?\n\nPesanan bisa dipulihkan dari filter "🗑 Terhapus".`)) return;
  try {
    let { error } = await supabase.from(GATHERING_ORDERS).update({ status: 'terhapus', prev_status: o.status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error && /prev_status/i.test(error.message)) ({ error } = await supabase.from(GATHERING_ORDERS).update({ status: 'terhapus', updated_at: new Date().toISOString() }).eq('id', id));
    if (error) throw error;
    gtOrders = gtOrders.filter(x => x.id !== id);
    gtTrash.unshift({ ...o, prev_status: o.status, status: 'terhapus' });
    renderGtRekap(); gtAfterOrderChange(); showToast('Pesanan dipindah ke Terhapus — bisa dipulihkan.');
  } catch (e) {
    const m = String(e.message || e);
    if (/check constraint|violates|status_check/i.test(m)) {
      navigator.clipboard?.writeText(GT_TRASH_SQL).catch(() => {});
      showToast('Fitur Terhapus belum aktif — SQL sudah disalin, jalankan di Supabase → SQL Editor lalu coba lagi. Pesanan TIDAK dihapus.', 12000);
    } else showToast('Gagal menghapus: ' + m, 8000);
  }
}
async function restoreGtOrder(id) {
  const o = gtTrash.find(x => x.id === id);
  if (!o) return;
  const status = o.prev_status && o.prev_status !== 'terhapus' ? o.prev_status : 'baru';
  let { error } = await supabase.from(GATHERING_ORDERS).update({ status, prev_status: null, updated_at: new Date().toISOString() }).eq('id', id);
  if (error && /prev_status/i.test(error.message)) ({ error } = await supabase.from(GATHERING_ORDERS).update({ status, updated_at: new Date().toISOString() }).eq('id', id));
  if (error) { showToast('Gagal memulihkan: ' + error.message, 8000); return; }
  gtTrash = gtTrash.filter(x => x.id !== id);
  gtOrders.unshift({ ...o, status, prev_status: null });
  gtOrders.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  renderGtRekap(); gtAfterOrderChange(); showToast(`↩ Pesanan dipulihkan (status: ${GT_STATUS[status] || status}).`);
}
async function purgeGtOrder(id) {
  const o = gtTrash.find(x => x.id === id);
  if (!o || !confirm(`Hapus PERMANEN pesanan ${o.invoice || ''} — ${o.store}?\n\nTidak bisa dikembalikan lagi.`)) return;
  const { error } = await supabase.from(GATHERING_ORDERS).delete().eq('id', id);
  if (error) { showToast('Gagal menghapus: ' + error.message, 8000); return; }
  gtTrash = gtTrash.filter(x => x.id !== id);
  renderGtRekap(); showToast('Pesanan dihapus permanen.');
}
function gtTrashHtml() {
  if (!gtTrash.length) return '<div class="stock-empty">Tidak ada pesanan di Terhapus.</div>';
  return `<div class="gt-orders gt-trash">${gtTrash.map(o => `
    <div class="gt-order st-terhapus"><div class="gt-order-head">
      <div class="gt-order-main"><b>${escHtml(o.invoice || '—')} · ${escHtml(o.store || '-')}</b>${o.city ? ` <span>· ${escHtml(o.city)}</span>` : ''}
        <div class="gt-order-sub">${fmtGtTime(o.created_at)} · status sebelum dihapus: ${escHtml(GT_STATUS[o.prev_status] || o.prev_status || '—')} · ${o.total_qty || 0} item · ${fmtRp(Number(o.total || 0))}</div></div>
      <div class="gt-trash-act">
        <button class="gt-btn confirm" onclick="restoreGtOrder(${o.id})">↩ Pulihkan</button>
        <button class="gt-btn ghost gt-del" onclick="purgeGtOrder(${o.id})">Hapus permanen</button>
      </div></div></div>`).join('')}</div>`;
}

async function exportGtOrders() {
  if (!gtOrders?.length) { showToast('Belum ada pesanan untuk diekspor.'); return; }
  try {
    const XLSX = await loadXlsx();
    const rows = [['No. Invoice', 'Waktu', 'Status', 'Nama Toko', 'Kota', 'Nama Dealer', 'No. HP', 'Distributor', 'Grup', 'Produk', 'Qty', 'Harga', 'Subtotal', 'Total Pesanan']];
    gtOrders.forEach(o => (o.items || []).forEach((it, n) => rows.push([o.invoice || '', fmtGtTime(o.created_at), GT_STATUS[o.status] || o.status, o.store, o.city, o.dealer, o.phone, o.pic,
      it.group, it.name, it.qty, it.price, it.total, n === 0 ? Number(o.total || 0) : ''])));
    const prod = [['Produk', 'Grup', 'Jumlah Pesanan', 'Total Qty', 'Total Nilai', 'Dibeli oleh (toko × qty)'], ...gtProductTotals().map(p => [p.name, p.group, p.orders, p.qty, p.total, p.stores.map(t => `${t.name} ×${t.qty}`).join(', ')])];
    const st = gtStoreTotals();
    const toko = [['No', 'Nama Toko', 'Kota', 'Jumlah Pesanan', 'Total Qty', 'Total Pembelian', 'Barang (qty)'], ...st.map((t, i) => [i + 1, t.name, t.city, t.orders, t.qty, t.total, t.items.map(it => `${it.name} ×${it.qty}`).join(', ')]),
      ['', 'TOTAL', '', st.reduce((a, t) => a + t.orders, 0), st.reduce((a, t) => a + t.qty, 0), st.reduce((a, t) => a + t.total, 0), '']];
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(rows); ws1['!cols'] = [{wch:12},{wch:18},{wch:9},{wch:22},{wch:14},{wch:18},{wch:15},{wch:14},{wch:14},{wch:32},{wch:6},{wch:13},{wch:14},{wch:15}];
    const ws2 = XLSX.utils.aoa_to_sheet(prod); ws2['!cols'] = [{wch:34},{wch:16},{wch:15},{wch:10},{wch:15},{wch:60}];
    const ws3 = XLSX.utils.aoa_to_sheet(toko); ws3['!cols'] = [{wch:5},{wch:28},{wch:16},{wch:15},{wch:10},{wch:16},{wch:70}];
    XLSX.utils.book_append_sheet(wb, ws1, 'Pesanan');
    XLSX.utils.book_append_sheet(wb, ws3, 'Rekap Toko');
    XLSX.utils.book_append_sheet(wb, ws2, 'Rekap Produk');
    XLSX.writeFile(wb, `rekap-gathering-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (e) { showToast('Gagal ekspor: ' + (e.message || e), 8000); }
}

function gtReset() {
  if ((!Object.keys(gtQty).length && !gtManual.length) || !confirm('Kosongkan semua jumlah pesanan?')) return;
  gtQty = {}; gtManual = []; gtSaveDraft(); renderGathering();
}
