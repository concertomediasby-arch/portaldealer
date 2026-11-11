/* ══════════════════════════════════════════
   ✏️ KELOLA KATALOG — tambah & ubah produk dari portal, khusus Editor (11 Nov 2026, permintaan pemilik — pratinjau
   .mockup/katalog-form/ disetujui, cara B). Form #ce-form → foto/video diperkecil di browser → diunggah sementara ke
   Storage publik showcase/catalog-tmp/ → Edge Function `catalog-edit` meng-commit file ke assets/ + katalog-edit.js di repo
   (js/katalog-apply.js menggabungkannya ke BRANDS). Tayang ±2–3 menit (GitHub Pages); kartu WA /p/ & halaman Google /produk/
   dibuat workflow catalog-pages.yml. Selama menunggu, browser Editor memakai salinan lokal (localStorage cai-ce-pending,
   label ⏳ MENUNGGU TAYANG). HANYA SRP. Hapus produk tidak ada di form (lewat Claude).
══════════════════════════════════════════ */
const CE_CATS = ['Speaker', 'Subwoofer', 'Amplifier', 'DSP', 'Tweeter', 'Midrange', 'Cable', 'Accessories'];
const CE_EMOJI = { Speaker: '🔊', Subwoofer: '🥁', Amplifier: '⚡', DSP: '💻', Tweeter: '🎺', Midrange: '🔉', Cable: '🔗', Accessories: '🧱' };
const CE_UNITS = ['', 'set', 'pcs', 'pair', 'lembar', 'meter'];
const CE_MAX_PHOTOS = 12, CE_VIDEO_MAX_MB = 20;
const CE_FN = 'catalog-edit';
let ce = null, ceSaving = false, cePollT = null;

const ceOn = () => typeof isEditor === 'function' && isEditor();
const ceEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ceFind = id => { for (const b of BRANDS) for (const l of b.lines) { const p = l.products.find(x => x.id === id); if (p) return { b, l, p }; } return null; };
const ceIsPending = id => CE_PENDING.has(id);

// ── Tombol di kartu, line & halaman brand (dipanggil productCard()/renderProducts() di js/core.js) ──
function ceCardBtn(p) {
  return `${ceIsPending(p.id) ? '<span class="kc-pend">⏳ MENUNGGU TAYANG</span>' : ''}<button class="kc-pen editor-only" title="Edit produk" onclick="event.stopPropagation();ceOpen('${p.id}')">✏️</button>`;
}
function ceLineBtn(brand, line) {
  return `<button class="kc-addln editor-only" onclick="ceOpen(null,'${brand.id}',${ceEsc(JSON.stringify(line.name)).replace(/'/g, '&#39;')})">＋ Tambah ke line ini</button>`;
}
function ceNewCard(brand, line) {
  return `<button class="kc-newcard editor-only" onclick="ceOpen(null,'${brand.id}',${ceEsc(JSON.stringify(line.name)).replace(/'/g, '&#39;')})"><b>＋</b><span>Tambah Produk</span><small>di line ${ceEsc(line.name)}</small></button>`;
}
function ceBrandBar(brand) {
  return `<div class="kc-bar editor-only"><span>✏️ Kelola katalog <b>${ceEsc(brand.name)}</b> — tambah atau ubah produk dari sini (Editor)</span><button class="kc-btn pri" onclick="ceOpen(null,'${brand.id}')">＋ Tambah Produk</button></div>`;
}

// ── Buka form ──
function ceOpen(id, brandId, lineName) {
  if (!ceOn()) return showToast('Hanya Editor yang bisa mengubah katalog.');
  const f = id ? ceFind(id) : null;
  if (id && !f) return showToast('Produk tidak ditemukan.');
  const b = f ? f.b : (BRANDS.find(x => x.id === brandId) || BRANDS.find(x => x.id === currentBrandId) || BRANDS[0]);
  const p = f ? f.p : {};
  const photos = (p.photos?.length ? p.photos : (p.photo ? [p.photo] : [])).map(path => ({ path }));
  ce = {
    id: f ? p.id : '', created: !f, brand: b.id, line: f ? f.l.name : (lineName || b.lines[b.lines.length - 1]?.name || ''), lineNew: '',
    name: p.name || '', model: p.model || '', category: p.category || (b.lines.find(l => l.name === lineName) || {}).products?.[0]?.category || 'Speaker', emoji: p.emoji || '', desc: p.desc || '',
    specs: Object.entries(p.specs || {}), price: p.price || '', priceUnit: p.priceUnit || '',
    plOn: !!p.priceList, pl: Object.entries(p.priceList || {}), soon: !!p.soon, stock: '',
    photos, video: p.video ? { path: p.video } : null, videoPoster: p.videoPoster || '',
    prev: f ? { brand: b.id, line: f.l.name, data: JSON.parse(JSON.stringify(p)) } : null,
    hist: (typeof KATALOG_EDIT !== 'undefined' ? KATALOG_EDIT.items.find(x => x.id === id)?.hist : null) || [],
  };
  if (!ce.specs.length) ce.specs = [['', '']];
  let ov = document.getElementById('ce-form');
  if (!ov) { ov = document.createElement('div'); ov.id = 'ce-form'; ov.className = 'kc-ov'; ov.onclick = e => { if (e.target === ov) ceClose(); }; document.body.appendChild(ov); }
  ceRender(); ov.classList.add('open'); document.body.style.overflow = 'hidden';
}
function ceClose() {
  if (ceSaving) return;
  document.getElementById('ce-form')?.classList.remove('open'); document.body.style.overflow = '';
  ce?.photos.forEach(x => x.url && URL.revokeObjectURL(x.url)); ce = null;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('ce-form')?.classList.contains('open')) ceClose(); });

// Simpan isian yang sedang diketik sebelum menggambar ulang
function ceSync() {
  const ov = document.getElementById('ce-form'); if (!ov || !ce) return;
  ov.querySelectorAll('[data-k]').forEach(el => { ce[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; });
  const rows = (sel) => [...ov.querySelectorAll(sel)].map(r => [r.querySelector('.k').value, r.querySelector('.v').value]);
  ce.specs = rows('.kc-spec:not(.kc-pl)'); ce.pl = rows('.kc-pl');
}
const ceSet = (k, v) => { ceSync(); ce[k] = v; ceRender(); };
function ceBrand(v) { ceSync(); ce.brand = v; const b = BRANDS.find(x => x.id === v); ce.line = b?.lines[b.lines.length - 1]?.name || '__new'; ce.lineNew = ''; ceRender(); }

function ceRender() {
  const ov = document.getElementById('ce-form'); if (!ov || !ce) return;
  const b = BRANDS.find(x => x.id === ce.brand) || BRANDS[0];
  const lines = b.lines.map(l => l.name);
  const lineVal = ce.line === '__new' || !lines.includes(ce.line) && ce.line ? '__new' : ce.line;
  if (lineVal === '__new' && ce.line !== '__new' && !ce.lineNew) ce.lineNew = ce.line;
  const opt = (v, t, sel) => `<option value="${ceEsc(v)}"${v === sel ? ' selected' : ''}>${ceEsc(t)}</option>`;
  const ph = ce.photos.map((x, i) => `<div class="kc-pt"><img src="${ceEsc(x.url || x.path)}" alt="">${i === 0 ? '<span class="m">UTAMA</span>' : ''}
      <span class="kc-pt-act">${i ? `<button onclick="ceMove(${i},-1)" title="Geser ke kiri">◀</button>` : ''}${i < ce.photos.length - 1 ? `<button onclick="ceMove(${i},1)" title="Geser ke kanan">▶</button>` : ''}<button onclick="ceDelPhoto(${i})" title="Hapus foto">✕</button></span></div>`).join('');
  const prevP = { name: ce.name || 'Nama produk', model: ce.model || ce.name || 'Model', category: ce.category, soon: ce.soon,
    price: ce.plOn ? 0 : Number(String(ce.price).replace(/\D/g, '')) || 0, priceUnit: ce.priceUnit,
    priceList: ce.plOn ? Object.fromEntries(ce.pl.filter(r => r[0] && Number(String(r[1]).replace(/\D/g, ''))).map(r => [r[0], Number(String(r[1]).replace(/\D/g, ''))])) : null };
  const ph0 = ce.photos[0];
  ov.innerHTML = `<div class="kc-mod">
    <div class="kc-mh"><h2>${ce.created ? '＋ Tambah Produk' : '✏️ Edit Produk · ' + ceEsc(b.name + ' ' + (ce.prev?.data?.name || ''))}</h2><span class="kc-tag">EDITOR</span><button class="kc-x" onclick="ceClose()" aria-label="Tutup">✕</button></div>
    <div class="kc-mb">
      <div class="kc-col">
        <div class="kc-sec">01 · POSISI DI KATALOG</div>
        <div class="kc-row">
          <div class="kc-fld"><label>Brand</label><select class="kc-in" data-k="brand" onchange="ceBrand(this.value)">${BRANDS.map(x => opt(x.id, x.name, ce.brand)).join('')}</select></div>
          <div class="kc-fld"><label>Line / seri</label><select class="kc-in" data-k="line" onchange="ceSet('line', this.value)">${lines.map(l => opt(l, l, lineVal)).join('')}${opt('__new', '＋ Line baru…', lineVal)}</select>
            ${lineVal === '__new' ? `<input class="kc-in" style="margin-top:6px" data-k="lineNew" value="${ceEsc(ce.lineNew)}" placeholder="Nama line baru, mis. Active Subwoofer">` : ''}</div>
        </div>
        <div class="kc-sec">02 · IDENTITAS</div>
        <div class="kc-row">
          <div class="kc-fld"><label>Nama produk *</label><input class="kc-in" data-k="name" value="${ceEsc(ce.name)}" placeholder="mis. SQW-8" oninput="cePrev()"></div>
          <div class="kc-fld"><label>Model</label><input class="kc-in" data-k="model" value="${ceEsc(ce.model)}" placeholder="kosong = sama dengan nama" oninput="cePrev()"></div>
        </div>
        <div class="kc-row">
          <div class="kc-fld"><label>Kategori</label><select class="kc-in" data-k="category" onchange="cePrev()">${CE_CATS.map(c => opt(c, c, ce.category)).join('')}</select></div>
          <div class="kc-fld"><label>Kode stok gudang (opsional)</label><input class="kc-in" data-k="stock" value="${ceEsc(ce.stock)}" placeholder="mis. SQW8 · pisahkan koma"><div class="kc-hint">Bila kode di Google Sheet berbeda dari model</div></div>
        </div>
        ${ce.created ? '' : `<div class="kc-hint" style="margin:-4px 0 8px">ID produk: <code>${ceEsc(ce.id)}</code> (tetap — link lama tidak berubah)</div>`}
        <div class="kc-fld"><label>Deskripsi singkat</label><textarea class="kc-in kc-ta" data-k="desc" placeholder="mis. 8&quot; Subwoofer Speaker — Rubber honeycomb aluminum cone.">${ceEsc(ce.desc)}</textarea></div>
        <div class="kc-sec">03 · HARGA (SRP SAJA)</div>
        ${ce.plOn ? `${ce.pl.map(r => `<div class="kc-spec kc-pl"><input class="kc-in k" value="${ceEsc(r[0])}" placeholder="Varian, mis. 1M" oninput="cePrev()"><input class="kc-in v" value="${ceEsc(r[1])}" placeholder="SRP, mis. 2100000" inputmode="numeric" oninput="cePrev()"><button class="kc-d" onclick="ceRow('pl',this)">✕</button></div>`).join('')}
          <button class="kc-add" onclick="ceSync();ce.pl.push(['','']);ceRender()">＋ Tambah varian</button>`
        : `<div class="kc-row"><div class="kc-fld"><label>Harga jual umum (SRP)</label><input class="kc-in" data-k="price" value="${ceEsc(ce.price)}" placeholder="angka saja, mis. 9000000 · kosong = tanpa harga" inputmode="numeric" oninput="cePrev()"></div>
          <div class="kc-fld"><label>Satuan</label><select class="kc-in" data-k="priceUnit" onchange="cePrev()">${CE_UNITS.map(u => opt(u, u || '—', ce.priceUnit)).join('')}</select></div></div>`}
        <div class="kc-warn">⚠️ Hanya harga jual umum (SRP). Jangan isi harga dealer, modal, atau diskon — katalog bisa dibaca siapa saja.</div>
        <label class="kc-chk"><input type="checkbox" data-k="plOn" ${ce.plOn ? 'checked' : ''} onchange="ceSet('plOn', this.checked); if (ce.plOn && !ce.pl.length) { ce.pl = [['1M',''],['2M','']]; ceRender(); }"> Harga per varian (mis. kabel 1M / 2M / 3M)</label>
        ${ce.plOn ? `<div class="kc-fld" style="max-width:200px"><label>Satuan</label><select class="kc-in" data-k="priceUnit">${CE_UNITS.map(u => opt(u, u || '—', ce.priceUnit)).join('')}</select></div>` : ''}
        <label class="kc-chk"><input type="checkbox" data-k="soon" ${ce.soon ? 'checked' : ''} onchange="cePrev()"> COMING SOON (belum rilis)</label>
        <div class="kc-sec">04 · SPESIFIKASI</div>
        ${ce.specs.map(r => `<div class="kc-spec"><input class="kc-in k" value="${ceEsc(r[0])}" placeholder="mis. RMS Power" oninput="cePrev()"><input class="kc-in v" value="${ceEsc(r[1])}" placeholder="mis. 200 W" oninput="cePrev()"><button class="kc-d" onclick="ceRow('specs',this)">✕</button></div>`).join('')}
        <div class="kc-adds"><button class="kc-add" onclick="ceSync();ce.specs.push(['','']);ceRender()">＋ Tambah baris</button><button class="kc-add" onclick="cePaste()">📋 Tempel dari tabel / Excel (2 kolom)</button></div>
      </div>
      <div class="kc-col kc-col2">
        <div class="kc-sec">05 · FOTO</div>
        <div class="kc-photos">${ph}${ce.photos.length < CE_MAX_PHOTOS ? `<label class="kc-pt up"><input type="file" accept="image/*" multiple hidden onchange="ceAddPhotos(this)"><b>＋</b>Foto</label>` : ''}</div>
        <div class="kc-hint">◀ ▶ mengurutkan · foto pertama = foto utama · otomatis diperkecil ≤1400 px WebP (latar putih disarankan)</div>
        <div class="kc-sec">06 · VIDEO (OPSIONAL)</div>
        ${ce.video ? `<div class="kc-vid">🎬 ${ceEsc(ce.video.name || ce.video.path)} <button class="kc-d" onclick="ceSet('video', null)">✕ Lepas</button></div>`
          : `<label class="kc-in kc-vpick"><input type="file" accept="video/mp4" hidden onchange="ceAddVideo(this)">🎬 Pilih MP4 (maks. ${CE_VIDEO_MAX_MB} MB, 720p H.264 disarankan)</label>`}
        <div class="kc-sec">PRATINJAU KARTU</div>
        <div class="kc-prevwrap" id="ce-prev">${cePrevHtml(b, prevP, ph0)}</div>
        ${ce.hist.length ? `<div class="kc-sec">RIWAYAT</div>${ce.hist.map((h, i) => `<div class="kc-hist"><span>${h.at === 'katalog' ? 'Data awal katalog' : new Date(h.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })}</span><button class="kc-add" onclick="ceRestore(${i})">↺ Muat versi ini</button></div>`).join('')}<div class="kc-hint">Memuat versi lama ke form — tekan Simpan untuk menayangkannya lagi.</div>` : ''}
        <div class="kc-sec">SETELAH DISIMPAN OTOMATIS</div>
        <div class="kc-hint" style="line-height:1.75">✓ Tampil di portal ±2–3 menit<br>✓ Kartu WA <code>/p/…</code> &amp; halaman Google <code>/produk/…</code> + sitemap<br>✓ Stok Google Sheet tetap tersambung<br>✓ Riwayat perubahan tersimpan (bisa dikembalikan)</div>
      </div>
    </div>
    <div class="kc-mf"><span class="s" id="ce-msg">Tayang di portal ±2–3 menit setelah disimpan</span><button class="kc-btn" onclick="ceClose()">Batal</button><button class="kc-btn pri" id="ce-save" onclick="ceSave()">💾 Simpan &amp; Tayangkan</button></div>
  </div>`;
}
function cePrevHtml(b, p, ph0) {
  const src = ph0 ? (ph0.url || ph0.path) : '';
  return `<div class="product-card" style="pointer-events:none"><div class="product-thumb" style="background:${src ? '#fff' : b.color + '10'}">
    ${src ? `<img class="product-photo" src="${ceEsc(src)}" alt="">` : `<span class="product-thumb-icon">${CE_EMOJI[p.category] || '📦'}</span>`}<span class="product-thumb-label">${ceEsc(p.category)}</span></div>
    <div class="product-info"><div class="product-name">${ceEsc(p.name)}${eolTag(p)}</div><div class="product-model">${ceEsc(p.model)}</div>${srpRow(p)}</div></div>`;
}
function cePrev() {
  ceSync(); const b = BRANDS.find(x => x.id === ce.brand) || BRANDS[0];
  const p = { name: ce.name || 'Nama produk', model: ce.model || ce.name || 'Model', category: ce.category, soon: ce.soon,
    price: ce.plOn ? 0 : Number(String(ce.price).replace(/\D/g, '')) || 0, priceUnit: ce.priceUnit,
    priceList: ce.plOn ? Object.fromEntries(ce.pl.filter(r => r[0] && Number(String(r[1]).replace(/\D/g, ''))).map(r => [r[0], Number(String(r[1]).replace(/\D/g, ''))])) : null };
  const el = document.getElementById('ce-prev'); if (el) el.innerHTML = cePrevHtml(b, p, ce.photos[0]);
}
function ceRow(kind, btn) { ceSync(); const rows = [...document.querySelectorAll(kind === 'pl' ? '.kc-pl' : '.kc-spec:not(.kc-pl)')]; const i = rows.indexOf(btn.closest('.kc-spec')); if (i >= 0) ce[kind].splice(i, 1); if (kind === 'specs' && !ce.specs.length) ce.specs = [['', '']]; ceRender(); }
function cePaste() {
  const t = prompt('Tempel tabel spesifikasi (2 kolom: nama · nilai). Dari Excel/Sheet langsung tempel; atau satu baris per spek dengan pemisah ":" / tab.');
  if (!t) return; ceSync();
  const rows = t.split(/\r?\n/).map(l => l.split(/\t|\s*:\s+|\s{2,}|\s*\|\s*/)).map(c => [String(c[0] || '').trim(), c.slice(1).join(' ').trim()]).filter(r => r[0] && r[1]);
  if (!rows.length) return showToast('⚠ Tidak ada baris 2 kolom yang dikenali.');
  ce.specs = [...ce.specs.filter(r => r[0] || r[1]), ...rows]; ceRender(); showToast(`✓ ${rows.length} baris spesifikasi ditambahkan`);
}
function ceRestore(i) {
  const h = ce.hist[i]; if (!h?.data) return;
  if (!confirm('Muat versi ini ke form? Isian sekarang akan diganti (belum tersimpan sampai Anda menekan Simpan).')) return;
  const d = h.data;
  Object.assign(ce, { brand: h.brand || ce.brand, line: h.line || ce.line, name: d.name || '', model: d.model || '', category: d.category || 'Speaker', desc: d.desc || '',
    specs: Object.entries(d.specs || {}), price: d.price || '', priceUnit: d.priceUnit || '', plOn: !!d.priceList, pl: Object.entries(d.priceList || {}), soon: !!d.soon,
    photos: (d.photos?.length ? d.photos : (d.photo ? [d.photo] : [])).map(path => ({ path })), video: d.video ? { path: d.video } : null, videoPoster: d.videoPoster || '' });
  if (!ce.specs.length) ce.specs = [['', '']];
  ceRender();
}
function ceMove(i, d) { ceSync(); const a = ce.photos; [a[i], a[i + d]] = [a[i + d], a[i]]; ceRender(); }
function ceDelPhoto(i) { ceSync(); const x = ce.photos.splice(i, 1)[0]; if (x?.url) URL.revokeObjectURL(x.url); ceRender(); }
async function ceAddPhotos(input) {
  const files = [...input.files]; input.value = ''; ceSync();
  for (const f of files) {
    if (ce.photos.length >= CE_MAX_PHOTOS) { showToast(`⚠ Maksimal ${CE_MAX_PHOTOS} foto.`); break; }
    try { const blob = await glResize(f, 1400); ce.photos.push({ blob, url: URL.createObjectURL(blob) }); }
    catch (e) { showToast('⚠ ' + e.message); }
  }
  ceRender();
}
function ceAddVideo(input) {
  const f = input.files[0]; input.value = ''; if (!f) return;
  if (f.size > CE_VIDEO_MAX_MB * 1048576) return showToast(`⚠ Video ${(f.size / 1048576).toFixed(1)} MB — maksimal ${CE_VIDEO_MAX_MB} MB. Kompres dulu (720p H.264).`, 7000);
  ceSet('video', { blob: f, name: f.name });
}

// ── Simpan ──
function ceNewId(b, model) {
  const pre = Object.entries(b.lines.flatMap(l => l.products).reduce((m, p) => { const k = (p.id.match(/^[a-z]+-/) || [''])[0]; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1])[0]?.[0] || (b.id.slice(0, 2) + '-');
  const base = (pre + String(model).toLowerCase().replace(/[^a-z0-9]+/g, '')).slice(0, 36) || pre + 'produk';
  let id = base, n = 2; while (ceFind(id)) id = base + '-' + n++;
  return id;
}
const ceMsg = (t) => { const el = document.getElementById('ce-msg'); if (el) el.textContent = t; };
async function ceSave() {
  if (ceSaving || !ce) return; ceSync();
  const b = BRANDS.find(x => x.id === ce.brand);
  const line = String(ce.line === '__new' || !b.lines.some(l => l.name === ce.line) ? ce.lineNew : ce.line).trim();
  const name = String(ce.name).trim(), num = v => Number(String(v).replace(/\D/g, '')) || 0;
  if (!name) return showToast('⚠ Nama produk wajib diisi.');
  if (!line) return showToast('⚠ Pilih line atau ketik nama line baru.');
  if (!ce.photos.length && !confirm('Produk belum punya foto — tetap simpan (tampil ikon kategori)?')) return;
  const pl = ce.plOn ? Object.fromEntries(ce.pl.filter(r => String(r[0]).trim() && num(r[1])).map(r => [String(r[0]).trim(), num(r[1])])) : null;
  if (ce.plOn && !Object.keys(pl).length) return showToast('⚠ Isi minimal satu varian + SRP, atau hilangkan centang harga per varian.');
  if (/dealer|modal|diskon/i.test(ce.desc + JSON.stringify(ce.specs)) && !confirm('Teks memuat kata "dealer/modal/diskon". Katalog hanya boleh berisi harga SRP — lanjutkan simpan?')) return;
  const id = ce.created ? ceNewId(b, ce.model || name) : ce.id;
  ceSaving = true; const btn = document.getElementById('ce-save'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyimpan…'; }
  const tmpUp = [];
  try {
    if (!supabase) throw new Error('Database belum siap — coba lagi.');
    // 1) unggah foto/video baru ke Storage sementara
    const ts = Date.now().toString(36), files = [], photos = [];
    let n = 0;
    for (const x of ce.photos) {
      if (x.path) { photos.push(x.path); continue; }
      n++; ceMsg(`⬆ Mengunggah foto ${n}…`);
      const ext = x.blob.type === 'image/webp' ? 'webp' : 'jpg';
      const tmp = `catalog-tmp/${ts}-${n}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error } = await supabase.storage.from('showcase').upload(tmp, x.blob, { contentType: x.blob.type, upsert: false });
      if (error) throw error;
      tmpUp.push(tmp); const dest = `assets/${id}-${ts}-${n}.${ext}`; files.push({ tmp, dest }); photos.push(dest);
    }
    let video = ce.video?.path || null;
    if (ce.video?.blob) {
      ceMsg('⬆ Mengunggah video…');
      const tmp = `catalog-tmp/${ts}-v-${Math.random().toString(36).slice(2, 7)}.mp4`;
      const { error } = await supabase.storage.from('showcase').upload(tmp, ce.video.blob, { contentType: 'video/mp4', upsert: false });
      if (error) throw error;
      tmpUp.push(tmp); video = `assets/${id}-${ts}.mp4`; files.push({ tmp, dest: video });
    }
    const data = { name, model: String(ce.model).trim() || name, category: ce.category, emoji: CE_EMOJI[ce.category] || '📦',
      desc: String(ce.desc).trim(), specs: Object.fromEntries(ce.specs.map(r => [String(r[0]).trim(), String(r[1]).trim()]).filter(r => r[0] && r[1])),
      price: pl ? null : (num(ce.price) || null), priceUnit: ce.priceUnit || null, priceList: pl, soon: !!ce.soon,
      photos, video, videoPoster: video && video === ce.video?.path ? (ce.videoPoster || null) : null };
    const item = { id, brand: b.id, line, data, stock: String(ce.stock).trim(), created: ce.created };
    ceMsg('💾 Menyimpan ke situs…');
    const { data: res, error } = await supabase.functions.invoke(CE_FN, { body: { action: 'save', item, files, prev: ce.created ? null : ce.prev } });
    let err = error ? (await error.context?.json?.().catch(() => null))?.error || error.message : res?.error;
    if (err) { if (/not found|404|Failed to send/i.test(err)) err = 'Fungsi catalog-edit belum di-deploy di Supabase.'; throw new Error(err); }
    // 2) salinan lokal sampai situs selesai diperbarui
    const pend = (() => { try { return JSON.parse(localStorage.getItem('cai-ce-pending') || '[]'); } catch (e) { return []; } })().filter(x => x.item?.id !== id);
    pend.push({ ts: Date.now(), item: res.item });
    try { localStorage.setItem('cai-ce-pending', JSON.stringify(pend)); } catch (e) { /* */ }
    katalogApply(BRANDS, STOCK_ALIASES, null, { items: [res.item] }); CE_PENDING.add(id);
    const fp = ceFind(id)?.p; if (fp?.photos?.[0]) fp.photo = fp.photos[0]; else if (fp) delete fp.photo;
    // foto baru belum ada di situs → tampilkan dari blob selama menunggu
    ce.photos.forEach((x, i) => { if (x.blob && fp?.photos?.[i]) ceLocalImg[fp.photos[i]] = x.url; });
    ceSaving = false; const nm = name; document.getElementById('ce-form')?.classList.remove('open'); document.body.style.overflow = ''; ce = null;
    ceProgress(id, nm, res.at, files.length);
    ceRefreshViews(b.id, id);
  } catch (e) {
    ceSaving = false;
    if (tmpUp.length) supabase?.storage.from('showcase').remove(tmpUp).catch(() => {});
    if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan & Tayangkan'; }
    ceMsg('⚠ ' + (e.message || e));
    if (/row-level security|policy/i.test(e.message || '')) dashErr(e, 'mengunggah foto'); else showToast('⚠ Gagal menyimpan: ' + (e.message || e), 9000);
  }
}
const ceLocalImg = {};   // path assets/... baru → blob URL di browser Editor sampai situs diperbarui
function ceRefreshViews(brandId, id) {
  const fp = ceFind(id); if (!fp) return;
  const v = document.querySelector('.view.active')?.id;
  if (v === 'view-brand') showBrand(fp.b.id);
  else if (v === 'view-catalog') renderCatalog();
  else if (v === 'view-product' && currentProductId === id) showProduct(fp.b.id, id);
  ceFixImgs();
}
// Ganti src gambar yang filenya belum ada di situs dengan blob lokal (hanya browser Editor yang baru menyimpan)
function ceFixImgs() {
  if (!Object.keys(ceLocalImg).length) return;
  document.querySelectorAll('img').forEach(img => { const s = img.getAttribute('src'); if (ceLocalImg[s]) img.src = ceLocalImg[s]; });
}
new MutationObserver(() => ceFixImgs()).observe(document.documentElement, { childList: true, subtree: true });

// ── Kotak progres "Menyimpan…" + cek situs tiap 20 dtk ──
function ceProgress(id, name, at, nFiles) {
  let box = document.getElementById('ce-prog');
  if (!box) { box = document.createElement('div'); box.id = 'ce-prog'; box.className = 'kc-prog'; document.body.appendChild(box); }
  const t0 = Date.now();
  const paint = (live) => {
    const sec = Math.round((Date.now() - t0) / 1000);
    box.innerHTML = `<button class="kc-x" onclick="this.parentNode.remove()" aria-label="Tutup">✕</button><h3>${live ? '✅' : '💾'} ${ceEsc(name)} ${live ? 'sudah tayang' : 'disimpan'}</h3>
      <div class="kc-st done">✅ ${nFiles ? `File diunggah (${nFiles})` : 'Data disiapkan'}</div>
      <div class="kc-st done">✅ Tersimpan di situs (repo)</div>
      <div class="kc-st ${live ? 'done' : 'run'}">${live ? '✅ Portal sudah memakai data baru' : `⏳ Situs sedang diperbarui · ${sec} dtk`}</div>
      <div class="kc-st ${live ? 'run' : 'wait'}">${live ? '⏳' : '○'} Kartu WA &amp; halaman Google (±3–5 menit)</div>
      <div class="kc-bar2"><i style="width:${live ? 100 : Math.min(90, 20 + sec / 2)}%"></i></div>
      <div class="kc-hint">Boleh ditutup — produk tampil otomatis. Pengunjung melihatnya setelah tanda ⏳ hilang.</div>`;
  };
  paint(false);
  clearInterval(cePollT);
  let n = 0;
  cePollT = setInterval(async () => {
    n++;
    if (document.body.contains(box)) paint(false);
    if (n % 4) return;   // cek situs tiap ±20 dtk
    try {
      const t = await (await fetch('katalog-edit.js?build=' + Date.now(), { cache: 'no-store' })).text();
      const ke = JSON.parse(t.slice(t.indexOf('const KATALOG_EDIT = ') + 21).trim().replace(/;\s*$/, ''));
      if ((ke.items.find(x => x.id === id)?.at || '') >= at) {
        clearInterval(cePollT); if (typeof KATALOG_EDIT !== 'undefined') KATALOG_EDIT.items = ke.items;
        CE_PENDING.delete(id);
        try { localStorage.setItem('cai-ce-pending', JSON.stringify(JSON.parse(localStorage.getItem('cai-ce-pending') || '[]').filter(x => x.item?.id !== id))); } catch (e) { /* */ }
        if (document.body.contains(box)) paint(true);
        showToast(`✅ ${name} sudah tayang di CAI Hub`);
        const fp = ceFind(id); if (fp) ceRefreshViews(fp.b.id, id);
      }
    } catch (e) { /* situs belum siap */ }
    if (n > 240) clearInterval(cePollT);   // ±20 menit
  }, 5000);
}
// Saat dibuka lagi dengan simpanan yang belum tayang → lanjutkan pengecekan
setTimeout(() => {
  try { const p = JSON.parse(localStorage.getItem('cai-ce-pending') || '[]'); const last = p[p.length - 1];
    if (last && CE_PENDING.has(last.item.id)) ceProgress(last.item.id, last.item.data.name, last.item.at, 0); } catch (e) { /* */ }
}, 2500);
