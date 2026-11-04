// ── TAHAP 2: ❤ FAVORIT · 🕘 TERAKHIR DILIHAT · ⇄ BANDINGKAN · 🆕 BARU MINGGU INI (4 Nov 2026, permintaan pemilik — pratinjau .mockup/tahap2b/ disetujui) ──
// Tanpa login & tanpa database: semua disimpan di HP/browser itu (localStorage). Tampil untuk pengunjung umum DAN partner yang login;
// "Baru minggu ini" hanya untuk pengunjung umum (partner sudah punya "Baru untuk Anda"). Bandingkan hanya produk SEKATEGORI, maks. 3.
const FAV_KEY = 'cai-fav', RECENT_KEY = 'cai-recent', CMP_KEY = 'cai-cmp';
const RECENT_MAX = 12, CMP_MAX = 3, WEEK_DAYS = 7;
const favLoad = k => { try { const a = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a.filter(id => findProductAny(id).product) : []; } catch (e) { return []; } };
const favSave = (k, a) => { try { localStorage.setItem(k, JSON.stringify(a)); } catch (e) {} };
const favImg = p => p.photo || (p.photos || [])[0] || '';
const favHas = id => favLoad(FAV_KEY).includes(id);
const cmpList = () => favLoad(CMP_KEY);
const HEART_ON = '❤', HEART_OFF = '♡';

// ── Favorit ──
function favToggle(id) {
  const a = favLoad(FAV_KEY), on = !a.includes(id);
  favSave(FAV_KEY, on ? [id, ...a] : a.filter(x => x !== id));
  const { brand, product } = findProductAny(id);
  showToast(on ? `❤ ${brand.name} ${product.name} disimpan ke Favorit` : 'Dihapus dari Favorit');
  favPaint();
}
// Ikon ♡ di kartu produk (productCard di js/core.js)
const favHeartHtml = id => `<button class="f-heart${favHas(id) ? ' on' : ''}" data-fav="${id}" onclick="event.stopPropagation(); favToggle('${id}')" aria-label="Simpan ke Favorit">${favHas(id) ? HEART_ON : HEART_OFF}</button>`;

// ── Terakhir dilihat (dicatat showProduct) ──
function recentAdd(id) { favSave(RECENT_KEY, [id, ...favLoad(RECENT_KEY).filter(x => x !== id)].slice(0, RECENT_MAX)); }
function recentClear() { favSave(RECENT_KEY, []); favRenderDash(); showToast('Riwayat dihapus'); }

// ── Tombol di halaman produk ──
function favPaintProduct() {
  const el = document.getElementById('pd-acts'); if (!el || !currentProductId) return;
  const id = currentProductId, f = favHas(id), c = cmpList().includes(id);
  el.innerHTML = `<button class="f-btn${f ? ' on' : ''}" onclick="favToggle('${id}')">${f ? HEART_ON + ' Tersimpan' : HEART_OFF + ' Simpan'}</button>
    <button class="f-btn cmp${c ? ' on' : ''}" onclick="cmpToggle('${id}')">${c ? '✓ Dibandingkan' : '⇄ Bandingkan'}</button>`;
}

// ── Bandingkan (sekategori, maks. 3) ──
function cmpToggle(id) {
  let a = cmpList();
  if (a.includes(id)) a = a.filter(x => x !== id);
  else {
    const p = findProductAny(id).product, cat = a.length ? findProductAny(a[0]).product.category : p.category;
    if (p.category !== cat) { showToast(`Hanya produk sekategori (${cat}) yang bisa dibandingkan. Kosongkan bilah ✕ untuk kategori lain.`, 5000); return; }
    if (a.length >= CMP_MAX) { showToast(`Maksimal ${CMP_MAX} produk. Hapus salah satu dulu.`); return; }
    a = [...a, id];
  }
  favSave(CMP_KEY, a); favPaint();
}
function cmpRemove(id) { favSave(CMP_KEY, cmpList().filter(x => x !== id)); favPaint(); if (document.getElementById('view-compare')?.classList.contains('active')) renderCompare(); }
function cmpClear() { favSave(CMP_KEY, []); favPaint(); }
function cmpTrayPaint() {
  let t = document.getElementById('cmp-tray');
  const a = cmpList(), view = document.body.dataset.view;
  const show = a.length && view !== 'compare' && document.getElementById('landing')?.hidden !== false && !QA_SCREEN_MODE;
  if (!show) { if (t) t.hidden = true; return; }
  if (!t) { t = document.createElement('div'); t.id = 'cmp-tray'; t.className = 'cmp-tray'; document.body.appendChild(t); }
  const ps = a.map(id => findProductAny(id).product), cat = ps[0].category;
  t.hidden = false;
  t.innerHTML = `<div class="th">${ps.map(p => favImg(p) ? `<img src="${favImg(p)}" alt="">` : `<span>${p.emoji || '📦'}</span>`).join('')}</div>
    <div class="tx"><b>⇄ ${a.length} produk dipilih · ${escHtml(cat)}</b><span>${a.length < 2 ? 'Pilih 1 produk sekategori lagi untuk dibandingkan' : ps.map(p => escHtml(p.name)).join(' · ')}</span></div>
    <button class="go" onclick="openCompare()" ${a.length < 2 ? 'disabled' : ''}>Bandingkan ›</button><button class="x" onclick="cmpClear()" aria-label="Kosongkan">✕</button>`;
}
function openCompare() { showView('compare'); renderCompare(); document.querySelector('.main')?.scrollTo(0, 0); window.scrollTo(0, 0); cmpTrayPaint(); }
function renderCompare() {
  const el = document.getElementById('compare-body'); if (!el) return;
  const rs = cmpList().map(findProductAny);
  if (rs.length < 2) { el.innerHTML = `<div class="stock-empty">Pilih minimal 2 produk sekategori dengan tombol <b>⇄ Bandingkan</b> di halaman produk.</div>`; return; }
  const keys = [...new Set(rs.flatMap(r => Object.keys(r.product.specs || {})))];
  const row = (k, vals, cls = '') => `<tr class="${cls}"><td>${k}</td>${vals.map(v => `<td>${v}</td>`).join('')}</tr>`;
  const specs = keys.map(k => { const v = rs.map(r => r.product.specs?.[k] ?? '—'); return row(escHtml(k), v.map(x => escHtml(String(x))), new Set(v.map(String)).size > 1 ? 'diff' : ''); }).join('');
  el.innerHTML = `<div class="cmp-top"><div class="cmp-note"><i></i>Baris berwarna = nilainya berbeda. Spesifikasi dari data resmi CAI.</div><button class="cmp-share" onclick="cmpShare()">${SHARE_ICON} Bagikan perbandingan</button></div>
  <div class="cmp-wrap"><table class="cmp-t"><thead><tr><td></td>${rs.map(({ brand: b, product: p }) => `<td><div class="cmp-p">
      ${favImg(p) ? `<img src="${favImg(p)}" alt="" onclick="showProduct('${b.id}','${p.id}')">` : `<span class="cmp-em">${p.emoji || '📦'}</span>`}
      <small>${escHtml(b.name.toUpperCase())}</small><b>${escHtml(p.name)}${eolTag(p)}</b><button class="x" onclick="cmpRemove('${p.id}')">✕ Hapus</button></div></td>`).join('')}</tr></thead><tbody>
    <tr><td>Harga SRP</td>${rs.map(({ product: p }) => `<td class="srp">${hasPrice(p) ? srpText(p) : '—'}</td>`).join('')}</tr>
    ${row('Model', rs.map(r => escHtml(r.product.model || '—')))}
    ${specs}
    <tr><td></td>${rs.map(({ brand: b, product: p }) => `<td class="cmp-acts"><button onclick="showProduct('${b.id}','${p.id}')">Lihat produk ›</button><button class="g pd-near-btn" onclick="cmpNear('${b.id}','${p.id}')">📍 Partner terdekat</button></td>`).join('')}</tr>
  </tbody></table></div>`;
}
// Bagikan perbandingan (Tahap 3): link /bandingkan/?cmp=a,b,c → halaman /bandingkan/ (kartu pratinjau umum) → /?cmp=… → cmpOpenLinked()
const cmpLink = () => `${location.origin}/bandingkan/?cmp=${cmpList().map(encodeURIComponent).join(',')}`;
function cmpShare() {
  const rs = cmpList().map(findProductAny); if (rs.length < 2) return;
  const names = rs.map(r => `${r.brand.name} ${r.product.name}${hasPrice(r.product) ? ' (SRP ' + srpText(r.product) + ')' : ''}`);
  shareWa(`⇄ Bandingkan di CAI Hub — ${rs[0].product.category}:\n${names.map(n => '• ' + n).join('\n')}\n\nLihat spesifikasi berdampingan:\n${cmpLink()}`);
}
function cmpOpenLinked(str) {
  const ids = String(str || '').split(',').map(s => s.trim()).filter(id => findProductAny(id).product);
  const cat = ids.length ? findProductAny(ids[0]).product.category : '';
  const ok = ids.filter(id => findProductAny(id).product.category === cat).slice(0, CMP_MAX);
  if (ok.length < 2) { showToast('Link perbandingan tidak valid.'); return; }
  favSave(CMP_KEY, ok); openCompare();
}
function cmpNear(b, p) { showProduct(b, p); setTimeout(() => document.getElementById('pd-near')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350); }

// ── Dashboard: Terakhir dilihat & Favorit (semua) + Baru minggu ini (pengunjung umum) ──
function favMini(id) {
  const { brand: b, product: p } = findProductAny(id);
  return `<button class="d-mini" onclick="showProduct('${b.id}','${p.id}')">${favImg(p) ? `<img src="${favImg(p)}" alt="" loading="lazy">` : `<span class="d-mini-em">${p.emoji || '📦'}</span>`}
    <div><b>${escHtml(b.name)} ${escHtml(p.name)}</b><small>${hasPrice(p) ? srpText(p) : '&nbsp;'}</small></div></button>`;
}
function favMineHtml() {
  const rec = favLoad(RECENT_KEY), fav = favLoad(FAV_KEY);
  let h = '';
  if (rec.length) h += `<div class="d-sec"><div class="d-sec-h"><b>🕘 Terakhir Anda lihat</b><button onclick="recentClear()">Hapus riwayat</button></div><div class="d-row">${rec.slice(0, 8).map(favMini).join('')}</div></div>`;
  if (fav.length) h += `<div class="d-sec"><div class="d-sec-h"><b>❤ Favorit Anda · ${fav.length}</b></div><div class="d-row">${fav.map(favMini).join('')}</div></div>`;
  return h;
}
const weekAgo = d => d ? (Date.now() - Date.parse(String(d).length <= 10 ? d + 'T00:00:00+07:00' : d)) / 864e5 : 1e9;
function weekHtml() {
  const it = [], nc = (img, k, t, e, fn) => `<button class="d-nc" onclick="${fn}">${img}<div><small>${k}</small><b>${t}</b><em>${e}</em></div></button>`;
  const ico = c => `<span class="ic">${c}</span>`;
  const u = (typeof RECENT_UPDATES !== 'undefined' ? RECENT_UPDATES : []).find(x => weekAgo(x.date) <= WEEK_DAYS && findProductAny(x.productId).product);
  if (u) { const { brand: b, product: p } = findProductAny(u.productId);
    it.push(nc(favImg(p) ? `<img src="${favImg(p)}" alt="">` : ico(p.emoji || '📦'), 'PRODUK DIPERBARUI', `${escHtml(b.name)} ${escHtml(p.name)}`, escHtml(u.note || ''), `showProduct('${b.id}','${p.id}')`)); }
  const a = typeof acadReleased === 'function' ? acadReleased()[0] : null;
  if (a && weekAgo(a.at || a.date) <= WEEK_DAYS) it.push(nc(`<img src="${acadImg(a, true)}" alt="">`, 'ACADEMY', escHtml(a.title), `Materi #${a.no}`, `openAcademyItem(${a.no})`));
  const g = typeof glLive === 'function' ? glLive().filter(x => weekAgo(x.publish_at || x.created_at) <= WEEK_DAYS).sort((x, y) => Date.parse(y.publish_at || y.created_at) - Date.parse(x.publish_at || x.created_at))[0] : null;
  if (g) { const ph = (g.photos || []).find(p => !glIsVid(p));
    it.push(nc(ph ? `<img src="${glUrl(ph.path)}" alt="">` : ico('🚗'), 'GALERI INSTALASI', escHtml(glTitle(g)), escHtml([g.dealer, g.city].filter(Boolean).join(' · ')), `openGaleri(); openGlDetail('${g.id}')`)); }
  const n = typeof nwLive === 'function' && nwItems ? nwLive().find(x => weekAgo(x.post_date) <= WEEK_DAYS) : null;
  if (n) { const th = nwThumb(n); it.push(nc(th ? `<img src="${th}" alt="">` : ico('📰'), 'NEWS', escHtml(n.title), escHtml(n.category || ''), `openNews('${n.id}')`)); }
  return it.length ? `<div class="d-sec"><div class="d-sec-h"><b>🆕 Baru minggu ini</b></div><div class="d-new">${it.join('')}</div></div>` : '';
}
let weekTry = 0;
function favRenderDash() {
  const mine = favMineHtml();
  ['dash-mine', 'dash-mine2'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = mine; });
  const w = document.getElementById('dash-week'); if (w) w.innerHTML = authUser ? '' : weekHtml();
  // Data Galeri & News dimuat di latar → tampilkan lagi setelah siap (maks. ±15 dtk)
  if (!authUser && typeof supabase !== 'undefined' && supabase) {
    if (typeof loadGaleri === 'function' && !glItems && !glLoading) loadGaleri().then(() => favRenderDash(), () => {});
    if (!nwItems && weekTry < 5) { weekTry++; setTimeout(favRenderDash, 3000); }
  }
}

// Perbarui semua tampilan yang terpengaruh (ikon ♡ kartu, tombol produk, bilah Bandingkan, Dashboard)
function favPaint() {
  document.querySelectorAll('.f-heart[data-fav]').forEach(b => { const on = favHas(b.dataset.fav); b.classList.toggle('on', on); b.textContent = on ? HEART_ON : HEART_OFF; });
  favPaintProduct(); cmpTrayPaint();
  if (document.getElementById('view-dashboard')?.classList.contains('active')) favRenderDash();
}

// ── Halaman Google (Tahap 3): /kategori/<slug>/ → /?kat= · /partner/<kota>/ → /?kota= (tools/gen-seo-pages.js) ──
const KAT_SLUGS = { speaker: 'Speaker', subwoofer: 'Subwoofer', amplifier: 'Amplifier', dsp: 'DSP', tweeter: 'Tweeter', midrange: 'Midrange', kabel: 'Cable', aksesoris: 'Accessories' };
function katOpenLinked(slug) {
  const cat = KAT_SLUGS[String(slug).toLowerCase()]; openCatalog();
  if (!cat) return;
  const s = document.getElementById('catalog-search'); if (s) { s.value = cat; renderCatalog(); }
}
function kotaOpenLinked(slug, tries = 0) {
  if (!tries) openAuthDealers();
  if (!slug || slug === 'semua') return;
  const ds = adPublic(), city = [...new Set(ds.map(d => d.c).filter(Boolean))].find(c => shareSlug(c) === slug);
  const prov = [...new Set(ds.map(d => d.r))].find(r => shareSlug(r) === slug || 'provinsi-' + shareSlug(r) === slug);
  if (city) { const s = document.getElementById('ad-search'); if (s) s.value = city; renderAuthDealers(); }
  else if (prov) setAdRegion(prov);
  // Data tabel auth_dealers bisa belum termuat (partner baru belum ada di cadangan) — coba lagi sebentar
  else if (tries < 16) setTimeout(() => kotaOpenLinked(slug, tries + 1), 500);
}
