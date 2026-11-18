/* ══════════════════════════════════════════
   CAI HUB STUDIO — tahap 6 (18 Nov 2026, permintaan pemilik: "semua ini masuk ke studio"):
   Paket Audio · Stok · Enthusiast Partner · Akun & Kode Akses · Pengunjung & Minat · Rapor Bulanan · Laporan Partner
   dibuat ulang dengan gaya Studio (dulu portal disematkan, #m/<menu> — rute itu tetap ada sebagai cadangan,
   mis. Import Excel stok). Data & aturan sama dengan portal: js/dealers.js, js/core.js (auth_dealers, PAKET_AUDIO),
   js/stock.js (panel admin), js/rundown.js + js/install.js + js/interest.js (Pengunjung & Minat), js/report.js + js/channel.js
   (Rapor, Link & QR, template Story), js/preport.js (Laporan Partner). Ubah aturan di portal → ubah juga di sini.
   Dimuat setelah studio/studio.js (memakai esc, stPage, stGo, stCache, fmtNum, PRODS, wibDate, todayWIB, showToast).
══════════════════════════════════════════ */
const HUB = 'https://hub.concerto.id';
const normKey = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const shareSlug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const saJson = d => typeof d === 'string' ? JSON.parse(d) : d;
const saSetup = e => /function|does not exist|schema cache|404|relation|PGRST20/i.test(String(e?.message || e || ''));
const saCopy = (t, ok) => (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => showToast(ok || '📋 Disalin'), () => prompt('Salin teks ini:', t));
const saFind = id => PRODS().find(x => x.p.id === id) || null;
const saPName = id => { const f = saFind(id); return f ? `${f.b.name} ${f.p.name}` : id; };
// Teks js/core.js (data murni ACADEMY, DEALER_GUIDES, PAKET_AUDIO, LOGO_WHITE) — dibaca sekali
function saCoreTxt() { return stCache.coreTxt || (stCache.coreTxt = fetch('js/core.js?t=' + Date.now(), { cache: 'no-store' }).then(r => r.text()).catch(() => '')); }
async function saCoreArr(name) { const t = await saCoreTxt(), m = t.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`)); try { return m ? Function('return ' + m[1])() : []; } catch (e) { return []; } }
async function saLogo() { if (stCache.logoW) return stCache.logoW; const m = (await saCoreTxt()).match(/const LOGO_WHITE = "([^"]+)"/); return (stCache.logoW = m ? m[1] : ''); }
async function saLive() { if (stCache.live) return stCache.live; try { stCache.live = await (await fetch('share/live.json?build=' + Date.now(), { cache: 'no-store' })).json(); } catch (e) { stCache.live = {}; } return stCache.live; }
const saPfLink = slug => { const h = stCache.live?.pp?.[slug]; return h ? `${HUB}/pp/${slug}/?v=${h}` : `${HUB}/?partner=${encodeURIComponent(slug)}`; };
function saDl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function saScript(src, test) { return test() ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Komponen tidak bisa dimuat — periksa koneksi.')); document.head.appendChild(s); }); }
// Jendela (modal) sederhana bergaya Studio
function saModal(html, cls = '') {
  let ov = document.getElementById('sa-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'sa-ov'; ov.className = 'st-lb'; ov.onclick = e => { if (e.target === ov) saClose(); }; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="st-lbb sa-mb ${cls}">${html}</div>`; ov.classList.add('on');
}
function saClose() { document.getElementById('sa-ov')?.classList.remove('on'); }
addEventListener('keydown', e => { if (e.key === 'Escape') saClose(); });
// Data partner (tabel auth_dealers) — semua termasuk yang disembunyikan
async function saLoadAd(force) {
  if (stCache.adRows && !force) return stCache.adRows;
  const { data, error } = await supabase.from('auth_dealers').select('*').order('region').order('sort').order('name');
  if (error) throw error;
  stCache.adRows = (data || []).map(r => ({ id: r.id, r: r.region, n: r.name, c: r.city || '', a: r.address || '', wa: r.wa || '', ig: r.ig || '', map: r.map || '', hidden: !!r.hidden, sort: r.sort || 0, updated_at: r.updated_at }));
  return stCache.adRows;
}
const saAdPub = () => (stCache.adRows || []).filter(d => !d.hidden);
const saMaps = d => d.map || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([d.n, d.a, d.c].filter(Boolean).join(', '));

/* ── 🔑 AKUN & KODE AKSES (js/dealers.js) — Edge Function manage-dealers ── */
const DEALER_CODE_DOMAIN = 'dealer.concerto.id';
const ROLE_LABEL = { editor: 'Editor', admin: 'Admin Staff', manager: 'Ricky', dealer: 'Partner' };
const normDealerCode = c => String(c || '').trim().toUpperCase().replace(/\s+/g, '-');
const validDealerCode = c => /^[A-Z0-9](?:[A-Z0-9-]{1,28})[A-Z0-9]$/.test(c);
const loginEmailFor = id => id.includes('@') ? id.toLowerCase() : `${normDealerCode(id).toLowerCase()}@${DEALER_CODE_DOMAIN}`;
const codeFromEmail = e => { const m = String(e || '').toLowerCase().match(/^([a-z0-9-]+)@dealer\.concerto\.id$/); return m ? m[1].toUpperCase() : ''; };
const accountLabel = u => u ? (codeFromEmail(u.email) ? 'Kode ' + codeFromEmail(u.email) : u.email) : '';
const randomPin = (len = 6) => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint32Array(len)), n => c[n % c.length]).join(''); };
const randomPassword = (len = 10) => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; return Array.from(crypto.getRandomValues(new Uint32Array(len)), n => c[n % c.length]).join(''); };
async function callDealers(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('manage-dealers', { body: { action, ...payload } });
  if (error) {
    let msg = error.message || String(error);
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch (e) {}
    const st = error.context?.status;
    if (st === 404) msg = 'Fungsi server "manage-dealers" belum terpasang di Supabase.';
    else if (/failed to send|fetch/i.test(msg)) msg = 'Tidak bisa menghubungi fungsi "manage-dealers" (belum ter-deploy / koneksi terputus).';
    else if (st === 401) msg = 'Sesi ditolak server (401) — keluar lalu masuk lagi.';
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
let saDlEdit = null, saDlCodeTouched = false, saDlQ = '';
async function stAkun() {
  stPage(`<div class="st-ph"><div><p>Partner</p><h1>Akun &amp; Kode Akses</h1></div><div class="st-acts"><button class="st-btn" onclick="saDlLoad(true)">↻ Muat ulang</button></div></div>
    <div class="st-card st-pad sa-info"><b>🔑 Mode akun bersama aktif</b><p>Semua partner masuk dengan <b>satu Kode Akses</b> (akun <code>cai@dealer.concerto.id</code>). Kode akses = password akun itu, ditulis HURUF BESAR — ganti lewat Supabase → SQL Editor (minta bantuan Claude). Akun perorangan di bawah hanya bila kelak tiap partner punya kode sendiri.</p></div>
    <div class="st-ed"><div class="st-card"><div class="st-filters"><b id="dl-count" class="sa-ct">Daftar akun partner</b><label class="st-search sm"><span>🔍</span><input placeholder="Cari toko, kota, kode…" value="${esc(saDlQ)}" oninput="saDlQ=this.value;saDlRows()"></label></div><div id="dl-list"><p class="st-empty">⏳ Memuat…</p></div></div>
      <div class="st-col"><div class="st-card st-pad" id="dl-form"></div><div id="dl-cred"></div></div></div>`);
  saDlForm(); saDlLoad();
}
async function saDlLoad(force) {
  const el = document.getElementById('dl-list'); if (!el) return;
  if (force || !stCache.dlUsers) el.innerHTML = '<p class="st-empty">⏳ Memuat…</p>';
  try { stCache.dlUsers = (await callDealers('list')).users || []; saDlRows(); }
  catch (e) { el.innerHTML = `<p class="st-empty">⚠ ${esc(e.message)}</p>`; }
}
const saDlDate = d => d ? wibDate(Date.parse(d), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
function saDlRows() {
  const el = document.getElementById('dl-list'), U = stCache.dlUsers; if (!el || !U) return;
  const q = saDlQ.trim().toLowerCase();
  const all = U.filter(u => u.role === 'dealer');
  const rows = all.filter(u => !q || [u.store, u.city, u.email, codeFromEmail(u.email), u.phone].some(v => (v || '').toLowerCase().includes(q))).sort((a, b) => (a.store || a.email).localeCompare(b.store || b.email));
  const staff = U.filter(u => u.role !== 'dealer');
  document.getElementById('dl-count').textContent = `Akun partner (${all.length})`;
  el.innerHTML = (rows.map(u => `<div class="st-row${u.active ? '' : ' sa-off'}"><span class="st-ic gold">🏪</span><div class="tx"><b>${esc(u.store || '(tanpa nama toko)')} ${u.active ? '' : '<span class="st-pill red">Nonaktif</span>'}</b>
      <small>${esc([u.city, accountLabel(u), u.phone].filter(Boolean).join(' · '))}</small><small>Terakhir login: ${saDlDate(u.last_sign_in_at)} · dibuat ${saDlDate(u.created_at)}</small></div>
      <div class="sa-acts"><button class="st-btn sm" onclick="saDlEditOpen('${u.id}')">✏️ Edit</button><button class="st-btn sm" onclick="saDlReset('${u.id}')">Reset PIN</button>
      <button class="st-btn sm" onclick="saDlActive('${u.id}')">${u.active ? 'Nonaktifkan' : 'Aktifkan'}</button><button class="st-btn sm red" onclick="saDlDel('${u.id}')">🗑</button></div></div>`).join('')
    || `<p class="st-empty">${all.length ? 'Tidak ada akun yang cocok.' : 'Belum ada akun partner perorangan — semua partner memakai Kode Akses bersama.'}</p>`)
    + (staff.length && !q ? `<div class="st-tfoot">Akun staff (tidak bisa diubah dari sini): ${staff.map(u => `${esc(u.email)} · ${ROLE_LABEL[u.role] || u.role}`).join(' &nbsp;|&nbsp; ')}</div>` : '');
}
function saDlForm() {
  const el = document.getElementById('dl-form'); if (!el) return;
  const u = saDlEdit ? stCache.dlUsers?.find(x => x.id === saDlEdit) : null;
  el.innerHTML = `<b class="sa-ft">${u ? `Edit akun — ${esc(accountLabel(u))}` : '＋ Tambah akun partner'}</b>
    <label class="st-fl">Nama toko / partner<input class="st-in" id="dl-store" maxlength="80" value="${esc(u?.store || '')}" placeholder="mis. Sinar Audio Surabaya" oninput="saDlSuggest()"></label>
    <label class="st-fl">Kota<input class="st-in" id="dl-city" maxlength="60" value="${esc(u?.city || '')}" placeholder="mis. Surabaya" oninput="saDlSuggest()"></label>
    <label class="st-fl">No. WhatsApp <small>(opsional)</small><input class="st-in" id="dl-phone" maxlength="20" inputmode="tel" value="${esc(u?.phone || '')}" placeholder="08xxxxxxxxxx"></label>
    ${u ? '' : `<label class="st-fl">Kode Partner <small>(huruf, angka, tanda -)</small><input class="st-in" id="dl-code" maxlength="30" placeholder="mis. SBY-SINARAUDIO" autocapitalize="characters" spellcheck="false" oninput="saDlCodeTouched=true"></label>
    <label class="st-fl">PIN<div class="sa-row"><input class="st-in" id="dl-pin" maxlength="30" autocomplete="new-password" value="${randomPin()}"><button class="st-btn" onclick="document.getElementById('dl-pin').value=randomPin()">Acak</button></div></label>`}
    <div class="sa-row" style="margin-top:16px"><button class="st-btn pri" id="dl-save" onclick="saDlSave()">${u ? '💾 Simpan perubahan' : 'Buat akun partner'}</button>${u ? '<button class="st-btn" onclick="saDlEdit=null;saDlForm()">Batal</button>' : ''}</div>
    <p class="st-err" id="dl-msg"></p>`;
  saDlCodeTouched = false;
}
function saDlSuggest() {
  if (saDlEdit || saDlCodeTouched) return; const code = document.getElementById('dl-code'); if (!code) return;
  const clean = t => (t || '').toUpperCase().normalize('NFD').replace(/[^A-Z0-9 ]/g, '').trim();
  const city = clean(document.getElementById('dl-city').value).split(/\s+/)[0] || '';
  let store = clean(document.getElementById('dl-store').value).replace(/\s+/g, ''); if (city) store = store.replace(city, '') || store;
  code.value = [city.slice(0, 3), store.slice(0, 14)].filter(Boolean).join('-');
}
function saDlEditOpen(id) { saDlEdit = id; saDlForm(); document.getElementById('dl-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
async function saDlSave() {
  const v = id => (document.getElementById(id)?.value || '').trim(), msg = document.getElementById('dl-msg'), btn = document.getElementById('dl-save');
  const store = v('dl-store'), city = v('dl-city'), phone = v('dl-phone');
  if (!store) { msg.textContent = 'Isi nama toko.'; return; }
  btn.disabled = true; msg.textContent = '';
  try {
    if (saDlEdit) { await callDealers('update', { id: saDlEdit, store, city, phone }); showToast(`✓ Data ${store} diperbarui`); }
    else {
      const code = normDealerCode(v('dl-code')), password = v('dl-pin');
      if (!validDealerCode(code)) throw new Error('Kode Partner 3–30 karakter: huruf, angka, tanda - (tidak di awal/akhir).');
      if (password.length < 6) throw new Error('PIN minimal 6 karakter.');
      if (stCache.dlUsers?.some(u => codeFromEmail(u.email) === code)) throw new Error(`Kode ${code} sudah dipakai partner lain.`);
      await callDealers('create', { code, email: loginEmailFor(code), password, store, city, phone });
      saDlCred({ store, email: loginEmailFor(code), password, phone }, 'Akun partner berhasil dibuat');
    }
    saDlEdit = null; saDlForm(); saDlLoad();
  } catch (e) { msg.textContent = e.message; btn.disabled = false; }
}
function saDlMsg(c) {
  return `Halo ${c.store}, berikut akun CAI Hub Anda:\n\n🔗 ${HUB}\n` +
    (codeFromEmail(c.email) ? `🏷️ Kode Partner: ${codeFromEmail(c.email)}\n🔑 PIN: ${c.password}\n\n` : `📧 Email: ${c.email}\n🔑 Password: ${c.password}\n\n`) +
    'Masuk lewat ikon akun di kanan atas CAI Hub untuk membuka Stok Produk & Panduan Partner. Mohon jaga kerahasiaan akun ini. Terima kasih — Concerto Audio Indonesia';
}
function saDlCred(c, title) {
  const m = saDlMsg(c), wa = c.phone ? `https://wa.me/${c.phone.replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(m)}` : '';
  stCache.dlCred = m;
  document.getElementById('dl-cred').innerHTML = `<div class="st-card st-pad sa-cred"><b class="sa-ft">✓ ${esc(title)}</b><p class="st-note" style="margin-top:4px">Kirim data masuk ini ke partner. PIN tidak bisa dilihat lagi setelah kotak ini ditutup.</p>
    <pre>${esc(m)}</pre><div class="sa-row"><button class="st-btn pri" onclick="saCopy(stCache.dlCred,'📋 Pesan masuk disalin')">📋 Salin pesan</button>${wa ? `<a class="st-btn" href="${wa}" target="_blank" rel="noopener">💬 Kirim via WA</a>` : ''}<button class="st-btn" onclick="this.closest('.sa-cred').remove()">Tutup</button></div></div>`;
  document.getElementById('dl-cred').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function saDlReset(id) {
  const u = stCache.dlUsers?.find(x => x.id === id), isCode = !!codeFromEmail(u?.email);
  if (!u || !confirm(`Buat ${isCode ? 'PIN' : 'password'} baru untuk ${u.store || accountLabel(u)}? Yang lama tidak berlaku lagi.`)) return;
  const password = isCode ? randomPin() : randomPassword();
  try { await callDealers('reset_password', { id, password }); saDlCred({ store: u.store || u.email, email: u.email, password, phone: u.phone }, isCode ? 'PIN baru dibuat' : 'Password baru dibuat'); }
  catch (e) { showToast('⚠ Gagal reset: ' + e.message, 8000); }
}
async function saDlActive(id) {
  const u = stCache.dlUsers?.find(x => x.id === id); if (!u) return;
  if (u.active && !confirm(`Nonaktifkan ${u.store || u.email}? Partner ini tidak bisa masuk sampai diaktifkan lagi.`)) return;
  try { await callDealers('set_active', { id, active: !u.active }); showToast(u.active ? 'Akun dinonaktifkan' : 'Akun diaktifkan kembali'); saDlLoad(); }
  catch (e) { showToast('⚠ ' + e.message, 8000); }
}
async function saDlDel(id) {
  const u = stCache.dlUsers?.find(x => x.id === id);
  if (!u || !confirm(`Hapus akun ${u.store || accountLabel(u)} secara permanen?\n\nSaran: pilih "Nonaktifkan" bila mungkin dipakai lagi.`)) return;
  try { await callDealers('delete', { id }); showToast('🗑 Akun dihapus'); if (saDlEdit === id) { saDlEdit = null; saDlForm(); } saDlLoad(); }
  catch (e) { showToast('⚠ ' + e.message, 8000); }
}

/* ── 🏪 ENTHUSIAST PARTNER (js/core.js openAdForm/saveAdDealer) — tabel auth_dealers ── */
let saAdReg = 'all', saAdQ = '';
const adWa = v => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '62' + d.slice(1); else if (d.startsWith('8')) d = '62' + d; return d; };
const adIg = v => String(v || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '');
async function stPartner() {
  stPage(`<div class="st-ph"><div><p>Partner</p><h1>Enthusiast Partner</h1></div><div class="st-acts"><button class="st-btn" onclick="saLoadAd(true).then(saAdPaint)">↻</button><a class="st-btn" href="/?kota=semua" target="_blank" rel="noopener">↗ Lihat di CAI Hub</a><a class="st-btn gold" href="#partner/new">＋ Tambah partner</a></div></div>
    <div class="st-card"><div class="st-filters" id="ad-f"></div><div id="ad-list"><p class="st-empty">⏳ Memuat…</p></div><div class="st-tfoot">Perubahan langsung terlihat pengunjung. Halaman Google &amp; kartu WA partner ikut diperbarui bot ±15 menit.</div></div>`);
  try { await saLoadAd(true); saAdPaint(); } catch (e) { document.getElementById('ad-list').innerHTML = `<p class="st-empty">⚠ ${esc(e.message)}</p>`; }
}
function saAdPaint() {
  const f = document.getElementById('ad-f'), A = stCache.adRows || []; if (!f) return;
  const regs = [...new Set(A.map(d => d.r))];
  f.innerHTML = `<button class="st-chip${saAdReg === 'all' ? ' on' : ''}" onclick="saAdReg='all';saAdPaint()">Semua ${A.length}</button>` +
    regs.map(r => `<button class="st-chip${saAdReg === r ? ' on' : ''}" onclick="saAdReg=${esc(JSON.stringify(r))};saAdPaint()">${esc(r)} ${A.filter(d => d.r === r).length}</button>`).join('') +
    `<label class="st-search sm"><span>🔍</span><input placeholder="Cari nama / kota…" value="${esc(saAdQ)}" oninput="saAdQ=this.value;saAdRows()"></label>`;
  saAdRows();
}
function saAdRows() {
  const el = document.getElementById('ad-list'); if (!el) return;
  const q = normKey(saAdQ), A = (stCache.adRows || []).filter(d => (saAdReg === 'all' || d.r === saAdReg) && (!q || normKey([d.n, d.c, d.a, d.r].join(' ')).includes(q)));
  let h = '', reg = '';
  for (const d of A) {
    if (d.r !== reg) { reg = d.r; h += `<div class="sa-grp">${esc(reg)}</div>`; }
    h += `<a class="st-nrow${d.hidden ? ' sa-off' : ''}" href="#partner/${d.id}"><span class="sa-ini">${esc((d.n.match(/[A-Za-z0-9]/g) || ['?']).slice(0, 2).join('').toUpperCase())}</span>
      <div class="tx"><b>${esc(d.n)}</b><small>${esc([d.c, d.a].filter(Boolean).join(' · ') || '—')}</small></div>
      <span class="sa-ics">${d.wa ? '<i title="WhatsApp">💬</i>' : ''}${d.ig ? '<i title="Instagram">📷</i>' : ''}${d.map ? '<i title="Link Maps">📍</i>' : ''}</span>
      ${d.hidden ? '<span class="st-pill mu">Disembunyikan</span>' : '<span class="st-pill ok">Tampil</span>'}<span class="st-chev">›</span></a>`;
  }
  el.innerHTML = h || '<p class="st-empty">Tidak ada partner yang cocok.</p>';
}
let saAf = null;
async function stPartnerEdit(id) {
  try { await saLoadAd(); } catch (e) { return stPage(`<p class="st-empty">⚠ ${esc(e.message)}</p>`); }
  const d = id ? stCache.adRows.find(x => x.id === id) : null;
  if (id && !d) { showToast('Partner tidak ditemukan.'); stGo('#partner'); return; }
  saAf = d ? { ...d } : { id: null, r: saAdReg !== 'all' ? saAdReg : '', n: '', c: '', a: '', wa: '', ig: '', map: '', hidden: false, sort: Math.max(0, ...stCache.adRows.map(x => x.sort || 0)) + 10 };
  const regs = [...new Set(stCache.adRows.map(x => x.r))].sort();
  const f = (k, label, ph = '', type = 'text', small = '') => `<label class="st-fl">${label}${small ? ` <small>${small}</small>` : ''}<input class="st-in" type="${type}" value="${esc(saAf[k] ?? '')}" placeholder="${esc(ph)}" oninput="saAf.${k}=this.value;saAfPrev()"></label>`;
  stPage(`<div class="st-ph"><div><p><a href="#partner">Enthusiast Partner</a> › ${d ? 'Edit' : 'Baru'}</p><h1>${d ? esc(d.n) : 'Tambah partner'}</h1></div>
      <div class="st-acts">${d ? `<button class="st-btn red" onclick="saAfDel()">🗑</button><a class="st-btn" href="/?partner=${esc(shareSlug(d.n))}" target="_blank" rel="noopener">↗ Profil</a>` : ''}<button class="st-btn pri" id="af-save" onclick="saAfSave()">💾 Simpan</button></div></div>
    <div class="st-ed"><div class="st-card st-pad">
      <input class="st-in st-title" placeholder="Nama partner" value="${esc(saAf.n)}" oninput="saAf.n=this.value;saAfPrev()">
      <div class="sa-g2"><label class="st-fl">Provinsi / wilayah<input class="st-in" list="af-regs" value="${esc(saAf.r)}" placeholder="Pilih / ketik baru" oninput="saAf.r=this.value;saAfPrev()"><datalist id="af-regs">${regs.map(r => `<option value="${esc(r)}">`).join('')}</datalist></label>${f('c', 'Kota', 'mis. Surabaya')}</div>
      <label class="st-fl">Alamat<textarea class="st-in" rows="2" oninput="saAf.a=this.value;saAfPrev()">${esc(saAf.a)}</textarea></label>
      <div class="sa-g2">${f('wa', 'WhatsApp', '0812… atau 62812…', 'tel')}${f('ig', 'Instagram', 'username, tanpa @')}</div>
      ${f('map', 'Link Google Maps', 'kosong = dicari otomatis dari nama + alamat', 'text', '(opsional — pin persis)')}
    </div>
    <div class="st-col"><div class="st-card st-pad">
      <div class="st-fl" style="margin-top:0">Status<div class="st-seg" id="af-vis"><button onclick="saAf.hidden=false;saAfVis()">Tampil</button><button onclick="saAf.hidden=true;saAfVis()">Disembunyikan</button></div></div>
      <label class="st-fl">Urutan <small>(angka kecil tampil lebih dulu dalam provinsinya)</small><input class="st-in" type="number" value="${esc(saAf.sort)}" oninput="saAf.sort=this.value"></label>
      <p class="st-note">Untuk menyembunyikan sementara, pilih <b>Disembunyikan</b> — data tetap tersimpan.</p></div>
      <div class="st-card st-pad"><div class="st-fl" style="margin:0 0 10px">Pratinjau kartu</div><div id="af-prev"></div></div></div></div>`);
  saAfVis();
}
function saAfVis() { document.querySelectorAll('#af-vis button').forEach((b, i) => b.classList.toggle('on', i === (saAf.hidden ? 1 : 0))); saAfPrev(); }
function saAfPrev() {
  const el = document.getElementById('af-prev'); if (!el || !saAf) return; const d = saAf;
  el.innerHTML = `<div class="sa-adc${d.hidden ? ' off' : ''}"><div class="h"><b>${esc(d.n || 'Nama partner')}</b><span>✓ Resmi</span></div><small>📍 ${esc(d.c || 'Kota')}${d.r ? ' · ' + esc(d.r) : ''}</small>${d.a ? `<p>${esc(d.a)}</p>` : ''}
    <div class="b">${adWa(d.wa) ? `<a href="https://wa.me/${adWa(d.wa)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}${adIg(d.ig) ? `<a href="https://instagram.com/${esc(adIg(d.ig))}" target="_blank" rel="noopener">📷 Instagram</a>` : ''}<a href="${esc(saMaps(d))}" target="_blank" rel="noopener">📍 Maps</a></div></div>`;
}
async function saAfSave() {
  const e = saAf; if (!e) return;
  const name = String(e.n || '').trim(), region = String(e.r || '').trim();
  if (!name || !region) return showToast('⚠ Isi nama partner & provinsi dulu.');
  const row = { region, name, city: String(e.c || '').trim() || null, address: String(e.a || '').trim() || null, wa: adWa(e.wa) || null, ig: adIg(e.ig) || null,
    map: String(e.map || '').trim() || null, hidden: !!e.hidden, sort: +e.sort || 0, updated_at: new Date().toISOString() };
  const btn = document.getElementById('af-save'); btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
  const { error } = await (e.id ? supabase.from('auth_dealers').update(row).eq('id', e.id) : supabase.from('auth_dealers').insert(row));
  if (error) { btn.disabled = false; btn.textContent = '💾 Simpan'; return showToast('⚠ Gagal menyimpan: ' + error.message, 7000); }
  showToast('✓ Partner disimpan'); stCache.partners = null; await saLoadAd(true).catch(() => {}); saAf = null; stGo('#partner', true);
}
async function saAfDel() {
  const d = saAf; if (!d?.id || !confirm(`Hapus partner "${d.n}" dari daftar Enthusiast Partner?\n\nTips: untuk menyembunyikan sementara, pilih status "Disembunyikan".`)) return;
  const { error } = await supabase.from('auth_dealers').delete().eq('id', d.id);
  if (error) return showToast('⚠ Gagal menghapus: ' + error.message, 7000);
  showToast('🗑 Partner dihapus'); stCache.partners = null; await saLoadAd(true).catch(() => {}); stGo('#partner', true);
}

/* ── 📦 PAKET AUDIO (PAKET_AUDIO di js/core.js + PDF di assets/paket/) — isi diubah lewat repo ── */
async function stPaket() {
  stPage(`<div class="st-ph"><div><p>Katalog</p><h1>Paket Audio</h1></div><div class="st-acts"><a class="st-btn" href="/?studio=paket" target="_blank" rel="noopener">↗ Lihat di CAI Hub</a></div></div>
    <div id="pk-list"><p class="st-empty">⏳ Memuat…</p></div>
    <p class="st-note">Isi paket (judul, komponen, PDF) disimpan di file situs — untuk menambah / mengubah paket, kirim PDF &amp; keterangannya ke Claude. PDF paket boleh memuat harga jual paket (bukan harga dealer).</p>`);
  const P = stCache.paket || (stCache.paket = await saCoreArr('PAKET_AUDIO'));
  const el = document.getElementById('pk-list'); if (!el) return;
  el.innerHTML = `<div class="sa-pk">${P.map(p => `<div class="st-card sa-pkc${p.available ? '' : ' off'}"><div class="h"><span class="ic">${esc(p.icon || '📦')}</span><div><small>${esc(p.segment || '')}</small><b>${esc(p.title)}</b></div>${p.available ? '<span class="st-pill ok">Tayang</span>' : '<span class="st-pill mu">Segera hadir</span>'}</div>
    <p>${esc(p.desc || '')}</p><div class="st-glchips">${(p.products || []).map(x => `<span class="st-glchip" style="padding-right:11px">${esc(x)}</span>`).join('')}</div>
    <div class="sa-row">${p.available ? `<a class="st-btn sm" href="${esc(p.file)}" target="_blank" rel="noopener">📄 Buka PDF</a><button class="st-btn sm" onclick="saPkShare('${esc(p.id)}')">💬 Bagikan ke WA</button>` : ''}<a class="st-btn sm" href="/?paket=${esc(p.id)}" target="_blank" rel="noopener">↗ Lihat</a></div></div>`).join('') || '<p class="st-empty">Belum ada paket.</p>'}</div>`;
}
function saPkShare(id) {
  const p = (stCache.paket || []).find(x => x.id === id); if (!p) return;
  const t = `${p.title}\n${p.segment}\nKomponen: ${(p.products || []).join(', ')}\n\nLihat paket di CAI Hub:\n${HUB}/k/${encodeURIComponent(id)}/`;
  window.open('https://wa.me/?text=' + waEnc(t), '_blank', 'noopener');
}

/* ── 📊 STOK (panel admin js/stock.js) — tabel stock, autosave; sinkron sheet di server (sync-stock-sheet) ── */
const STOCK_LABEL = { ready: 'Ready', indent: 'Indent', habis: 'Habis' };
const OTW_NOTE_RE = /\botw(?:\s*cai)?\s*:?\s*(\d+)\s*(set|pcs|pc|unit|pair|psg)?\b/i;
const otwFromNote = note => { const m = String(note || '').match(OTW_NOTE_RE); return m ? `${m[1]} ${(m[2] || 'unit').toLowerCase().replace(/^pc$/, 'pcs')}` : ''; };
const adminNote = n => String(n || '').replace(/\b(free|pinjam|2nd|pasang)\s*:?\s*\d+(\s*(pcs|set|unit))?/gi, '').replace(/tidak ada di template\.?/gi, '')
  .split(/[|;]/).map(x => x.replace(/^[\s.,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ')).filter(Boolean).join(' | ');
const STOCK_SHOW_SQL = "alter table public.stock add column if not exists show boolean not null default false;\n";
let saSkB = 'all', saSkS = 'all', saSkQ = '', saSkT = {}, saSlTab = 'all', saSlAll = false;
async function saLoadStock() {
  const { data, error } = await supabase.from('stock').select('*');
  if (error) throw error;
  stCache.stockFull = Object.fromEntries((data || []).map(r => [r.product_id, { ...r, incoming: r.incoming || otwFromNote(r.note) }]));
  stCache.stock = Object.fromEntries((data || []).map(r => [r.product_id, r]));   // dipakai menu Produk & Ringkasan
  return stCache.stockFull;
}
const saSkTime = iso => iso ? wibDate(Date.parse(iso), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
async function stStok() {
  stPage(`<div class="st-ph"><div><p>Katalog</p><h1>Stok</h1></div><div class="st-acts"><button class="st-btn" onclick="saSkTemplate()">⬇ Template Excel</button><a class="st-btn" href="#stok/import">📥 Import Excel</a><button class="st-btn" onclick="stStok()">↻</button></div></div>
    <div class="st-card st-cwq" id="sk-sync"><div><b>⏳ Memeriksa sinkron otomatis…</b></div></div>
    <div class="st-kpis sa-k5" id="sk-kpi"></div>
    <div class="st-g2"><div class="st-card"><div class="st-filters" id="sk-f"></div><div class="st-tw"><table class="st-tbl sa-sk"><thead><tr><th>Produk</th><th>Status</th><th>Qty</th><th>🚚 OTW</th><th class="st-hm">Diperbarui</th></tr></thead><tbody id="sk-tb"><tr><td colspan="5" class="st-empty">⏳ Memuat…</td></tr></tbody></table></div>
      <div class="st-tfoot">Ketik langsung — tersimpan otomatis (✓). Qty 0 = Habis, Qty &gt; 0 = Ready (Indent dipertahankan bila dipilih). OTW tampil ke partner sebagai 🚚 OTW. Sinkron Google Sheet di server tiap 15 menit bisa menimpa angka yang diketik.</div></div>
      <div class="st-card" id="sk-log"><div class="st-ch"><h3>🔔 Update terbaru</h3></div><p class="st-empty">⏳ Memuat…</p></div></div>`);
  saSkSync();
  try { await saLoadStock(); saSkPaint(); } catch (e) { document.getElementById('sk-tb').innerHTML = `<tr><td colspan="5" class="st-empty">⚠ ${esc(e.message)}</td></tr>`; }
  saSlLoad();
}
async function saSkSync() {
  const el = document.getElementById('sk-sync'); if (!el) return;
  const { data, error } = await supabase.from('stock_sync').select('*').eq('id', 1).maybeSingle();
  if (!document.getElementById('sk-sync')) return;
  const btn = '<button class="st-btn pri" id="sk-run" onclick="saSkRun()">⚡ Sinkron sekarang</button>';
  if (error) { el.innerHTML = `<div><b>Sinkron Google Sheet otomatis belum terpasang</b><small>Pakai 📥 Import Excel untuk memperbarui stok dari file.</small></div>`; return; }
  el.innerHTML = !data ? `<div><b>⏳ Sinkron otomatis terpasang, belum pernah berjalan</b><small>Google Sheet stok dibaca server tiap 15 menit.</small></div><div class="st-acts">${btn}</div>`
    : `<div><b>${data.ok ? '🟢' : '🔴'} Sinkron Google Sheet terakhir: ${esc(saSkTime(data.ran_at))} WIB${data.source === 'manual' ? ' (manual)' : ''}</b><small>${esc(data.message || '')}</small></div><div class="st-acts">${btn}</div>`;
  el.classList.toggle('warn', !!data && !data.ok);
}
async function saSkRun() {
  const b = document.getElementById('sk-run'); if (b) { b.disabled = true; b.textContent = '⏳ Menyinkronkan…'; }
  try { const { data, error } = await supabase.functions.invoke('sync-stock-sheet', { body: {} }); if (error) throw error; showToast(data?.ok ? '✓ Stok tersinkron — ' + data.message : '⚠ Sinkron gagal: ' + (data?.error || ''), 7000); }
  catch (e) { showToast('⚠ Sinkron gagal: ' + (e.message || e), 7000); }
  await saLoadStock().catch(() => {}); saSkSync(); saSkPaint(); saSlLoad();
}
const saSkExtra = () => Object.keys(stCache.stockFull || {}).filter(k => k.startsWith('x:')).sort().map(id => ({ id, name: id.slice(2), model: 'Belum ada di katalog', ex: 1 }));
function saSkPaint() {
  const S = stCache.stockFull || {}, ids = PRODS().map(x => x.p.id), cnt = { ready: 0, indent: 0, habis: 0, none: 0, otw: 0 };
  ids.forEach(id => { const s = S[id]; cnt[s?.status || 'none'] = (cnt[s?.status || 'none'] || 0) + 1; if (s?.incoming) cnt.otw++; });
  const k = document.getElementById('sk-kpi');
  if (k) k.innerHTML = [['ready', '🟢 Ready'], ['indent', '🟡 Indent'], ['habis', '🔴 Habis'], ['none', '— Belum diatur'], ['otw', '🚚 OTW']]
    .map(([x, t]) => `<button class="st-card st-kpi sa-kb${saSkS === x ? ' on' : ''}" onclick="saSkS=saSkS==='${x}'?'all':'${x}';saSkPaint()"><div class="l">${t}</div><div class="v">${cnt[x]}</div></button>`).join('');
  const f = document.getElementById('sk-f'); if (!f) return;
  const ex = saSkExtra();
  f.innerHTML = `<button class="st-chip${saSkB === 'all' ? ' on' : ''}" onclick="saSkB='all';saSkPaint()">Semua</button>` + BRANDS.map(b => `<button class="st-chip${saSkB === b.id ? ' on' : ''}" onclick="saSkB='${b.id}';saSkPaint()">${esc(b.name)}</button>`).join('')
    + (ex.length ? `<button class="st-chip${saSkB === '_x' ? ' on' : ''}" onclick="saSkB='_x';saSkPaint()">Produk lain ${ex.length}</button>` : '')
    + `<label class="st-search sm"><span>🔍</span><input placeholder="Cari model…" value="${esc(saSkQ)}" oninput="saSkQ=this.value;saSkRows()"></label>`;
  saSkRows();
}
function saSkRows() {
  const tb = document.getElementById('sk-tb'); if (!tb) return;
  const S = stCache.stockFull || {}, q = stNorm(saSkQ);
  const okS = id => { const s = S[id]; return saSkS === 'all' || (saSkS === 'none' ? !s : saSkS === 'otw' ? !!s?.incoming : s?.status === saSkS); };
  const groups = [...BRANDS.map(b => [b.name, b.id, b.lines.flatMap(l => l.products)]), ['Produk Lain (di luar katalog)', '_x', saSkExtra()]];
  let h = '';
  for (const [name, bid, list] of groups) {
    if (saSkB !== 'all' && saSkB !== bid) continue;
    const rows = list.filter(p => okS(p.id) && (!q || stNorm(p.name + p.model + name).includes(q))); if (!rows.length) continue;
    h += `<tr class="sa-sg"><td colspan="5">${esc(name)}${bid === '_x' ? ' <small>— hanya terlihat di sini sampai Anda menekan 👁 Tampilkan di katalog</small>' : ''}</td></tr>`;
    for (const p of rows) {
      const s = S[p.id] || {}, st = s.status || '';
      h += `<tr data-pid="${esc(p.id)}"><td><b>${esc(p.name)}</b><small>${p.ex ? saSkShowBtn(p.id) : esc(p.model)}</small></td>
        <td><select class="st-in sa-sel ${st}" onchange="saSkCh('${esc(p.id)}')"><option value="">— Belum diatur</option>${Object.entries(STOCK_LABEL).map(([v, t]) => `<option value="${v}"${st === v ? ' selected' : ''}>${{ ready: '🟢', indent: '🟡', habis: '🔴' }[v]} ${t}</option>`).join('')}</select></td>
        <td><input class="st-in sa-qty" type="number" min="0" step="1" inputmode="numeric" placeholder="Qty" value="${s.qty ?? ''}" oninput="saSkQty('${esc(p.id)}',this)"></td>
        <td><input class="st-in sa-otw" maxlength="40" placeholder="mis. 20 pcs" value="${esc(s.incoming || '')}" oninput="saSkCh('${esc(p.id)}')"></td>
        <td class="st-hm sa-t"><span class="sa-ok"></span>${esc(saSkTime(s.updated_at))}</td></tr>`;
    }
  }
  tb.innerHTML = h || '<tr><td colspan="5" class="st-empty">Tidak ada produk yang cocok.</td></tr>';
}
const saSkRow = pid => document.querySelector(`#sk-tb tr[data-pid="${CSS.escape(pid)}"]`);
function saSkQty(pid, inp) {
  const sel = saSkRow(pid)?.querySelector('.sa-sel');
  if (sel && inp.value !== '') { const n = parseInt(inp.value, 10); if (n === 0) sel.value = 'habis'; else if (n > 0 && sel.value !== 'indent') sel.value = 'ready'; }
  saSkCh(pid);
}
function saSkCh(pid) { clearTimeout(saSkT[pid]); saSkT[pid] = setTimeout(() => saSkSave(pid), 700); }
async function saSkSave(pid) {
  const tr = saSkRow(pid); if (!tr) return;
  const sel = tr.querySelector('.sa-sel'), ok = tr.querySelector('.sa-ok'), S = stCache.stockFull;
  const incoming = tr.querySelector('.sa-otw').value.trim(), qv = tr.querySelector('.sa-qty').value;
  const n = qv !== '' ? parseInt(qv, 10) : null, qty = Number.isInteger(n) && n >= 0 ? n : null;
  const note = adminNote(S[pid]?.note).replace(new RegExp(OTW_NOTE_RE.source, 'gi'), '').split('|').map(x => x.trim()).filter(Boolean).join(' | ');
  let status = sel.value;
  if (!status && (qty !== null || incoming)) { status = qty === 0 ? (incoming ? 'indent' : 'habis') : 'ready'; sel.value = status; }
  sel.className = 'st-in sa-sel ' + status; ok.textContent = '⏳ '; ok.className = 'sa-ok';
  try {
    if (!status) { const { error } = await supabase.from('stock').delete().eq('product_id', pid); if (error) throw error; delete S[pid]; }
    else { const { error } = await supabase.from('stock').upsert({ product_id: pid, status, note, qty, incoming: incoming || null }, { onConflict: 'product_id' }); if (error) throw error;
      S[pid] = { ...S[pid], product_id: pid, status, note, qty, incoming, updated_at: new Date().toISOString() }; }
    stCache.stock = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v]));
    ok.textContent = '✓ '; ok.className = 'sa-ok y'; setTimeout(() => { if (ok.textContent === '✓ ') ok.textContent = ''; }, 2500);
    clearTimeout(saSkT.k); saSkT.k = setTimeout(() => { saSkPaintKpi(); saSlLoad(); }, 1500);
  } catch (e) { ok.textContent = '✗ '; ok.className = 'sa-ok n'; ok.title = e.message || ''; showToast('⚠ Gagal menyimpan stok: ' + (e.message || e), 6000); }
}
function saSkPaintKpi() { const a = document.activeElement; if (a?.closest?.('#sk-tb')) return; saSkPaint(); }
function saSkShowBtn(pid) {
  const on = !!stCache.stockFull?.[pid]?.show;
  return `<button class="sa-exb${on ? ' on' : ''}" onclick="saSkShow('${esc(pid)}')">${on ? '👁 Tampil di katalog · sembunyikan' : '🔒 Hanya di sini · 👁 Tampilkan di katalog'}</button>`;
}
async function saSkShow(pid) {
  const s = stCache.stockFull?.[pid]; if (!s) return; const on = !s.show;
  const { error } = await supabase.from('stock').update({ show: on }).eq('product_id', pid);
  if (error) { if (/show/i.test(error.message || '')) saCopy(STOCK_SHOW_SQL, 'SQL izin tampil belum dijalankan — SQL disalin, tempel di Supabase → SQL Editor → Run.'); else showToast('⚠ ' + error.message); return; }
  s.show = on; saSkRows(); showToast(on ? `👁 ${pid.slice(2)} kini tampil di menu Stok partner` : `🔒 ${pid.slice(2)} disembunyikan dari menu Stok partner`);
}
async function saSkTemplate() {
  try {
    await saScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => window.XLSX);
    const S = stCache.stockFull || await saLoadStock(), rows = [['Brand', 'Model', 'Nama Produk', 'Qty', 'Status', 'Catatan']];
    PRODS().forEach(({ b, p }) => { const s = S[p.id] || {}; rows.push([b.name, p.model, p.name, s.qty ?? '', s.status ? STOCK_LABEL[s.status] : '', s.note || '']); });
    saSkExtra().forEach(p => { const s = S[p.id]; rows.push(['Lainnya', p.name, p.name, s.qty ?? '', s.status ? STOCK_LABEL[s.status] : '', s.note || '']); });
    const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 7 }, { wch: 9 }, { wch: 32 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Stok'); XLSX.writeFile(wb, `stok-concerto-${todayWIB()}.xlsx`);
  } catch (e) { showToast('⚠ ' + (e.message || e), 6000); }
}
/* ── 📥 IMPORT EXCEL STOK (19 Nov 2026, permintaan pemilik — dulu alat lama CAI Hub lewat sematan #m/stock).
   Salinan aturan importFile()/detectLayout()/renderImport()/saveImport() di js/stock.js (juga dipakai Edge Function sync-stock-sheet):
   ubah aturan import → ubah ketiganya. File .xlsx/.xls/.csv, tempel dari Excel, atau Google Sheet (link disimpan di browser ini). ── */
const SI_WORDS = { ready: 'ready', ada: 'ready', tersedia: 'ready', indent: 'indent', inden: 'indent', po: 'indent', habis: 'habis', kosong: 'habis', soldout: 'habis' };
const SI_ALIAS_KEY = 'cai-stock-alias', SI_SHEET_KEY = 'cai-stock-sheet';
const siAliases = () => { try { return JSON.parse(localStorage.getItem(SI_ALIAS_KEY) || '{}'); } catch (e) { return {}; } };
const siExtraId = raw => 'x:' + String(raw).toUpperCase().replace(/[^A-Z0-9 .\-\/+]/g, '').replace(/\s+/g, ' ').trim();
const siVariantOf = (code, p) => p?.priceList ? Object.keys(p.priceList).find(v => normKey(code).endsWith(normKey(v))) || null : null;
const siSheetLink = () => { try { return localStorage.getItem(SI_SHEET_KEY) || ''; } catch (e) { return ''; } };
let si = null, siRows = [];
async function stStokImport() {
  si = null; siRows = [];
  stPage(`<div class="st-ph"><div><p><a href="#stok">Stok</a> › Import</p><h1>📥 Import Excel stok</h1></div></div>
    <div class="st-card st-pad">
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <label class="st-btn pri">📄 Pilih file Excel / CSV<input type="file" accept=".xlsx,.xls,.csv,.txt" hidden onchange="siFile(this)"></label>
        <button class="st-btn" onclick="siSheet()">🔄 Ambil dari Google Sheet</button>
        ${siSheetLink() ? '<button class="st-btn sm" onclick="siSheet(true)">ganti link sheet</button>' : ''}
      </div>
      <p class="st-note">Format yang dikenali: template Excel CAI Hub (Brand · Model · Qty · Status · Catatan), stok gudang (<b>Kode Barang · … · Baru</b> — kolom <b>Baru</b> jadi Qty), STOCK DISTRIBUTOR (<b>Merk · Unit · Stok Tersedia</b>), dan daftar barang OTW (sheet/judul berisi “OTW” / “belum datang”).</p>
      <details style="margin-top:8px"><summary class="st-mu" style="cursor:pointer">…atau tempel dari Excel</summary>
        <textarea class="st-in" id="si-text" rows="6" placeholder="Salin baris dari Excel (dengan judul kolom) lalu tempel di sini" style="width:100%;margin-top:8px;font-family:var(--mono,monospace)"></textarea>
        <button class="st-btn" style="margin-top:6px" onclick="siPaste()">Baca data tempel</button></details>
    </div>
    <div id="si-prev"></div>`);
}
function siMsg(t, bad) { const el = document.getElementById('si-prev'); if (el) el.innerHTML = `<div class="st-card st-pad"><p class="st-empty"${bad ? ' style="color:#C8463B"' : ''}>${t}</p></div>`; }
async function siFile(input) {
  const file = input.files?.[0]; input.value = ''; if (!file) return;
  siMsg('⏳ Membaca file…');
  try {
    let sheets;
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      await saScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', () => window.XLSX);
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      sheets = wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }) }));
    } else sheets = [{ name: file.name, rows: siSplit(await file.text()) }];
    await siStart(sheets, file.name);
  } catch (e) { siMsg('⚠ Gagal membaca file: ' + esc(e.message || e), 1); }
}
function siSplit(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim()), first = lines[0] || '';
  const d = first.includes('\t') ? '\t' : first.includes(';') ? ';' : first.includes(',') ? ',' : '\t';
  return lines.map(l => l.split(d).map(c => c.trim().replace(/^"(.*)"$/, '$1')));
}
function siPaste() { const t = document.getElementById('si-text')?.value || ''; if (!t.trim()) return siMsg('Tempel data dari Excel dulu, atau pilih file.', 1); siStart([{ name: 'data tempel', rows: siSplit(t) }], 'data tempel'); }
function siCsv(text) {
  const rows = []; let row = [], cell = '', q = false; text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function siCsvUrl(link) {
  const id = (String(link).match(/\/d\/([\w-]{20,})/) || [])[1] || (/^[\w-]{20,}$/.test(link) ? link : ''); if (!id) return '';
  const gid = (String(link).match(/[#&?]gid=(\d+)/) || [])[1];
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gid ? '&gid=' + gid : ''}&t=${Date.now()}`;
}
async function siSheet(change) {
  let link = siSheetLink();
  if (change || !link) {
    const v = prompt('Tempel link Google Sheet stok (Bagikan → "Siapa saja yang memiliki link"):', link); if (v === null) return;
    if (!siCsvUrl(v.trim())) return showToast('⚠ Link Google Sheet tidak valid.');
    link = v.trim(); try { localStorage.setItem(SI_SHEET_KEY, link); } catch (e) {}
    if (change) return stStokImport();
  }
  siMsg('⏳ Mengambil data dari Google Sheet…');
  try {
    const r = await fetch(siCsvUrl(link), { cache: 'no-store' }), t = await r.text();
    if (!r.ok || /^\s*<(!doctype|html)/i.test(t)) throw new Error('akses ditolak');
    siStart([{ name: 'Google Sheet', rows: siCsv(t) }], 'Google Sheet');
  } catch (e) { siMsg('⚠ Gagal membaca Google Sheet — pastikan dibagikan “Siapa saja yang memiliki link” (Pelihat). (' + esc(e.message || e) + ')', 1); }
}
async function siStart(sheets, source) {
  sheets = sheets.map(s => ({ name: s.name, rows: s.rows.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(Boolean)) })).filter(s => s.rows.length);
  if (!sheets.length) return siMsg('Tidak ada data yang terbaca.', 1);
  if (!stCache.stockFull) { try { await saLoadStock(); } catch (e) { return siMsg('⚠ Stok saat ini tidak bisa dimuat: ' + esc(e.message || e), 1); } }
  si = { sheets, source }; siPick(0);
}
function siLayout(rows) {
  const isHead = r => r.some(c => /kode|model|nama|produk|barang|no\s*inv|tipe|^\s*unit\s*$/i.test(c)) && r.some(c => /qty|jumlah|stok|stock|baru|sisa/i.test(c));
  const h = rows.slice(0, 8).findIndex(isHead);
  if (h < 0) return { h: 0, head: null, body: rows, col: { model: 0, name: -1, qty: 1, note: 2, status: -1, brand: -1 } };
  const head = rows[h].map(c => String(c).trim().toLowerCase()), find = re => head.findIndex(x => re.test(x));
  let model = find(/kode|model|tipe|type|no\s*inv/); const name = find(/nama|produk|product/);
  if (model < 0) model = name; if (model < 0) model = find(/^unit$/);
  let qty = find(/^baru$/); if (qty < 0) qty = find(/qty|jumlah|stok|stock|sisa/);
  return { h, head: rows[h], body: rows.slice(h + 1), col: { model, name, qty, status: find(/status/), note: find(/catatan|note/), brand: find(/brand|merek|merk/) } };
}
const SI_OTW = /\botw\b|blm\s*datang|belum\s*datang|perjalanan/i;
const siLooksOtw = sh => SI_OTW.test(sh.name) || SI_OTW.test(sh.rows.slice(0, siLayout(sh.rows).h).flat().join(' '));
function siPick(i) { si.idx = +i; si.mode = siLooksOtw(si.sheets[si.idx]) ? 'otw' : 'gudang'; si.qtyCol = null; siRender(); }
function siSetAlias(key, pid) { const a = siAliases(); if (pid) a[key] = pid; else delete a[key]; try { localStorage.setItem(SI_ALIAS_KEY, JSON.stringify(a)); } catch (e) {} siRender(); }
function siRender() {
  if (!si) return;
  const S = stCache.stockFull || {}, sheet = si.sheets[si.idx], lay = siLayout(sheet.rows), col = { ...lay.col };
  if (si.qtyCol !== null) col.qty = si.qtyCol;
  const otw = si.mode === 'otw', aliases = siAliases();
  const index = PRODS().map(({ b, p }) => ({ b, p, keys: new Set([normKey(p.model), normKey(p.name), normKey(p.id), normKey(b.name + p.model)]) }));
  const byId = Object.fromEntries(index.map(x => [x.p.id, x]));
  const matched = new Map(); let skipped = 0, ignored = 0;
  lay.body.forEach(r => {
    const cell = k => col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '';
    const raw = cell('model') || cell('name'); if (!raw || /^total/i.test(raw)) return;
    const qtyRaw = cell('qty').replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1'), stRaw = cell('status'), note = cell('note');
    const num = qtyRaw.match(/^\s*(\d+)/); let qty = num ? parseInt(num[1], 10) : null, status = '', incoming = '';
    if (otw) {
      if (qty === null) { skipped++; return; }
      const unit = (qtyRaw.match(/^\s*\d+\s*(set|pcs|pc|unit|pair|psg)\b/i) || [])[1];
      incoming = { n: qty, unit: unit ? unit.toLowerCase().replace(/^pc$/, 'pcs') : 'unit' };
    } else {
      if (qty === null && SI_WORDS[normKey(qtyRaw)]) status = SI_WORDS[normKey(qtyRaw)];
      if (SI_WORDS[normKey(stRaw)]) status = status || SI_WORDS[normKey(stRaw)];
      if (qty === null && !status) { skipped++; return; }
      if (qty !== null && status !== 'indent') status = qty === 0 ? 'habis' : 'ready';
      if (status === 'habis' && otwFromNote(note)) status = 'indent';
    }
    const k = normKey(raw); let bk = normKey(cell('brand'));
    const brandMatch = b => [b.name, b.id, b.abbr].some(v => normKey(v || '') === bk);
    if (bk && !BRANDS.some(brandMatch)) bk = '';
    const alias = aliases[k] || STOCK_ALIASES[k];
    if (alias === '-') { ignored++; return; }
    let hit = byId[alias];
    if (!hit && aliases[k] !== '+') { const hits = [...new Map(index.filter(x => x.keys.has(k) && (!bk || brandMatch(x.b))).map(h => [h.p.id, h])).values()]; if (hits.length === 1) hit = hits[0]; }
    const pid = hit ? hit.p.id : siExtraId(raw); if (!hit && pid === 'x:') return;
    const prev = matched.get(pid), variant = !otw && qty !== null && hit ? siVariantOf(k, hit.p) : null;
    if (prev && !prev.codes.has(k)) {
      prev.codes.add(k); prev.raw += ' + ' + raw;
      if (variant) prev.variants[variant] = (prev.variants[variant] || 0) + qty;
      if (otw) prev.incoming.n += incoming.n;
      else if (qty !== null) { prev.qty = (prev.qty || 0) + qty; prev.status = prev.qty === 0 ? 'habis' : (prev.status === 'indent' ? 'indent' : 'ready'); }
      return;
    }
    matched.set(pid, { pid, hit, key: k, raw, codes: new Set([k]), qty, status, note, incoming, otwNote: otw ? '' : otwFromNote(note), variants: variant ? { ...(prev?.variants || {}), [variant]: qty } : {} });
  });
  siRows = [...matched.values()]; si.hasNoteCol = !!lay.head && col.note >= 0;
  const bad = siRows.filter(r => !r.hit), good = siRows.filter(r => r.hit);
  const cleared = otw ? Object.entries(S).filter(([pid, s]) => s.incoming && !matched.has(pid)).length : 0;
  si.cleared = cleared;
  const opts = `<option value="+" selected>＋ Produk lain (di luar katalog)</option><option value="-">Abaikan — jangan disimpan</option>`
    + BRANDS.map(b => `<optgroup label="Sama dengan produk ${esc(b.name)}:">${b.lines.flatMap(l => l.products).map(p => `<option value="${esc(p.id)}">${esc(p.model)}</option>`).join('')}</optgroup>`).join('');
  const headOpts = lay.head ? lay.head.map((h, i) => h ? `<option value="${i}"${i === col.qty ? ' selected' : ''}>${esc(h)}</option>` : '').join('') : '';
  const stOf = r => { const c = S[r.pid] || {}; return otw ? (c.status && c.status !== 'habis' && c.qty !== 0 ? c.status : 'indent') : r.status; };
  const amount = r => { const c = S[r.pid] || {};
    return (otw ? `${r.incoming.n} ${r.incoming.unit}` : (r.qty ?? '—')) + (!otw && c.qty != null && c.qty !== r.qty ? `<small>sebelumnya ${c.qty}</small>` : '')
      + (r.otwNote ? `<small style="color:#2F6BCB">🚚 OTW ${esc(r.otwNote)}</small>` : '')
      + (!otw && Object.keys(r.variants).length ? `<small>${Object.entries(r.variants).map(([v, n]) => `${esc(v)}: ${n}`).join(' · ')}</small>` : ''); };
  const stPill = st => st ? `<span class="st-pill ${{ ready: 'ok', indent: 'gold', habis: 'red' }[st]}">${STOCK_LABEL[st]}</span>` : '—';
  document.getElementById('si-prev').innerHTML = `<div class="st-card st-pad">
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
      ${si.sheets.length > 1 ? `<label class="st-fl" style="margin:0">Sheet<select class="st-in" onchange="siPick(this.value)">${si.sheets.map((x, i) => `<option value="${i}"${i === si.idx ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
      <label class="st-fl" style="margin:0">Jenis data<select class="st-in" onchange="si.mode=this.value;siRender()"><option value="gudang"${!otw ? ' selected' : ''}>Stok gudang</option><option value="otw"${otw ? ' selected' : ''}>Barang OTW (belum datang)</option></select></label>
      ${headOpts ? `<label class="st-fl" style="margin:0">Kolom jumlah<select class="st-in" onchange="si.qtyCol=+this.value;siRender()">${headOpts}</select></label>` : ''}
    </div>
    <p class="st-note">${esc(si.source)}: <b style="color:#1F9D6B">${good.length} cocok katalog</b>${bad.length ? ` · <b style="color:#B8893A">${bad.length} produk lain</b> (di luar katalog, ikut disimpan)` : ''}${ignored ? ` · ${ignored} diabaikan` : ''}${skipped ? ` · ${skipped} baris tanpa jumlah dilewati` : ''}</p>
    ${otw ? `<p class="st-note" style="background:#FFF6E0;padding:8px 10px;border-radius:8px">⚠ Mode <b>Barang OTW</b>: jumlah dicatat sebagai barang dalam perjalanan, <b>stok gudang tidak berubah</b>.${cleared ? ` ${cleared} produk yang sebelumnya OTW tapi tidak ada di daftar ini akan dihapus tanda OTW-nya (dianggap sudah datang).` : ''}</p>` : ''}
    ${bad.length ? `<p class="st-note">Baris ＋ tidak ada di katalog dan masuk <b>Produk lain</b>. Bila sebenarnya produk katalog dengan kode berbeda, pilih produknya — pilihan diingat di browser ini.</p>` : ''}
    <div class="st-tw"><table class="st-tbl"><thead><tr><th></th><th>Kode / Produk</th><th>${otw ? 'OTW' : 'Qty'}</th><th>Status</th></tr></thead><tbody>
      ${bad.map(r => `<tr><td>＋</td><td><b>${esc(r.raw)}</b><select class="st-in" style="margin-top:4px;max-width:280px" onchange="siSetAlias('${esc(r.key)}', this.value === '+' ? '' : this.value)">${opts}</select></td><td>${amount(r)}</td><td>${stPill(stOf(r))}</td></tr>`).join('')}
      ${good.map(r => `<tr><td>✓</td><td><b>${esc(r.hit.p.name)}</b><small>${esc(r.hit.b.name)} · ${esc(r.hit.p.model)}${normKey(r.raw) !== normKey(r.hit.p.model) ? ` · dari “${esc(r.raw)}”` : ''}</small></td><td>${amount(r)}</td><td>${stPill(stOf(r))}</td></tr>`).join('')}
    </tbody></table></div>
    ${siRows.length || cleared ? `<div class="st-acts" style="margin-top:12px"><button class="st-btn" onclick="stStokImport()">Batal</button><button class="st-btn pri" id="si-save" onclick="siSave()">💾 Simpan ${siRows.length} produk${otw ? ' sebagai OTW' : ''}</button></div>` : ''}
  </div>`;
}
async function siSave() {
  if (!si) return;
  const S = stCache.stockFull || {}, otw = si.mode === 'otw', btn = document.getElementById('si-save');
  btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
  let payload;
  if (otw) {
    const listed = new Set(siRows.map(r => r.pid));
    payload = siRows.map(r => { const c = S[r.pid] || {}; return { product_id: r.pid, incoming: `${r.incoming.n} ${r.incoming.unit}`, status: c.status && c.status !== 'habis' && c.qty !== 0 ? c.status : 'indent', qty: c.qty ?? null, note: c.note || '' }; });
    Object.entries(S).forEach(([pid, c]) => { if (c.incoming && !listed.has(pid)) payload.push({ product_id: pid, incoming: null, status: c.status, qty: c.qty ?? null, note: c.note || '' }); });
  } else {
    const fileHasOtw = siRows.some(r => r.otwNote);
    payload = siRows.map(r => { const row = { product_id: r.pid, status: r.status, qty: r.qty, note: si.hasNoteCol ? r.note : (r.note || S[r.pid]?.note || '') }; if (fileHasOtw) row.incoming = r.otwNote || null; return row; });
    siRows.forEach(r => Object.entries(r.variants).forEach(([v, n]) => payload.push({ product_id: 'v:' + r.pid + ':' + v, status: n === 0 ? 'habis' : 'ready', qty: n, note: '' })));
  }
  try {
    const { error } = await supabase.from('stock').upsert(payload, { onConflict: 'product_id' }); if (error) throw error;
    showToast(`✓ ${otw ? 'Data OTW' : 'Stok'} ${siRows.length} produk berhasil diperbarui.`, 5000);
    si = null; stCache.stockFull = null; stGo('#stok', true);
  } catch (e) {
    btn.disabled = false; btn.textContent = `💾 Simpan ${siRows.length} produk`;
    const m = String(e.message || e);
    if (/incoming/.test(m)) saCopy('alter table stock add column if not exists incoming text;', 'Kolom OTW belum ada — SQL disalin, tempel di Supabase → SQL Editor → Run.');
    else showToast('⚠ Gagal menyimpan: ' + m, 7000);
  }
}
// 🔔 Update terbaru (tabel stock_log, 7 hari) — sama dengan slogItems() portal
const saSlStatus = s => ({ ready: 'Ready', indent: 'Indent', habis: 'Habis' })[s] || '—';
const saSlSrc = s => ({ server: 'sinkron sheet otomatis', admin: 'Admin Staff', editor: 'Editor' })[s] || (s || '');
const saSlName = id => String(id).startsWith('x:') ? 'Produk lain: ' + String(id).slice(2) : saPName(id);
async function saSlLoad() {
  const { data, error } = await supabase.from('stock_log').select('*').gte('at', new Date(Date.now() - 7 * 864e5).toISOString()).order('at', { ascending: false }).limit(500);
  stCache.slog = error ? null : data || []; stCache.slogErr = error ? (saSetup(error) ? 'setup' : error.message) : ''; saSlPaint();
}
function saSlItems() {
  const out = [];
  for (const r of stCache.slog || []) {
    if (String(r.product_id).startsWith('x:') && r.old_status == null && r.old_qty == null && r.new_status != null) { out.push({ k: 'new', at: r.at, n: saSlName(r.product_id), s: `${saSlSrc(r.src)} · kode baru di sheet`, v: `🆕 Baru${r.new_qty != null ? ' · ' + r.new_qty : ''}`, c: 'nw' }); continue; }
    const b = r.old_status == null && r.old_qty == null ? '—' : `${r.old_status && r.old_status !== r.new_status ? saSlStatus(r.old_status) + ' ' : ''}${r.old_qty ?? ''}`.trim() || saSlStatus(r.old_status);
    const a = r.new_status == null ? 'Belum diatur' : `${r.new_status !== r.old_status || r.new_qty == null ? saSlStatus(r.new_status) + ' ' : ''}${r.new_qty ?? ''}`.trim();
    const dn = r.new_status === 'habis' || (r.new_qty != null && r.old_qty != null && r.new_qty < r.old_qty) || r.new_status == null;
    out.push({ k: 'stock', at: r.at, n: saSlName(r.product_id), s: saSlSrc(r.src), v: `${b} → ${a}`, c: dn ? 'dn' : 'up' });
  }
  const since = Date.now() - 7 * 864e5;
  for (const u of typeof RECENT_UPDATES !== 'undefined' ? RECENT_UPDATES : []) { if (u.type !== 'new') continue; const at = Date.parse(u.date + 'T08:00:00+07:00'); if (at >= since) out.push({ k: 'new', at: new Date(at).toISOString(), n: saPName(u.productId), s: 'produk baru di katalog', v: '🆕 Produk baru', c: 'nw' }); }
  return out.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}
function saSlPaint() {
  const el = document.getElementById('sk-log'); if (!el) return;
  if (stCache.slogErr === 'setup') { el.innerHTML = '<div class="st-ch"><h3>🔔 Update terbaru</h3></div><p class="st-empty">Catatan perubahan stok belum aktif (SQL <code>supabase/stock-log.sql</code> belum dijalankan).</p>'; return; }
  if (!stCache.slog) { el.innerHTML = `<div class="st-ch"><h3>🔔 Update terbaru</h3></div><p class="st-empty">${stCache.slogErr ? '⚠ ' + esc(stCache.slogErr) : '⏳ Memuat…'}</p>`; return; }
  const all = saSlItems(), rows = all.filter(i => saSlTab === 'all' || i.k === saSlTab), show = saSlAll ? rows : rows.slice(0, 10), cnt = k => all.filter(i => i.k === k).length;
  const tab = (k, t) => `<button class="st-chip${saSlTab === k ? ' on' : ''}" onclick="saSlTab='${k}';saSlAll=false;saSlPaint()">${t}</button>`;
  el.innerHTML = `<div class="st-ch"><h3>🔔 Update terbaru</h3><span class="st-mu" style="margin-left:auto;font-size:12px">7 hari terakhir</span></div>
    <div class="st-filters">${tab('all', 'Semua ' + all.length)}${tab('stock', '📦 Stok ' + cnt('stock'))}${tab('new', '🆕 Baru ' + cnt('new'))}</div>
    ${show.map(i => `<div class="st-row sa-sl"><div class="tx"><b>${esc(i.n)}</b><small>${esc(saSkTime(i.at))} · ${esc(i.s)}</small></div><em class="${i.c}">${esc(i.v)}</em></div>`).join('') || '<p class="st-empty">Belum ada perubahan dalam 7 hari terakhir.</p>'}
    ${rows.length > 10 ? `<button class="sa-more" onclick="saSlAll=!saSlAll;saSlPaint()">${saSlAll ? 'Tampilkan lebih sedikit' : `Lihat semua ${rows.length} ›`}</button>` : ''}`;
}

/* ── 📈 PENGUNJUNG & MINAT (js/rundown.js renderVisitors · js/install.js appRecapHtml · js/interest.js intHtml) ── */
const INT_SRC = { produk: ['Halaman produk “Tanya”', '#B8893A'], simulator: ['System Simulator', '#E0B33F'], partner: ['Enthusiast Partner', '#3FA9C0'], cek: ['Cek Partner Resmi', '#1F9D6B'], profil: ['Profil Partner', '#C9A227'],
  mobil: ['Cari per Mobil', '#5B83E0'], finder: ['Temukan Sistem', '#D86AA8'], cari: ['Pencarian Dashboard', '#7DB44A'], news: ['Berita News', '#2E95AE'], google: ['Halaman Google /partner/', '#8F6AD6'],
  hof: ['Hall of Fame', '#D88A3C'], galeri: ['Galeri Instalasi', '#C8463B'], lain: ['Lainnya', '#8B92A1'] };
const saSrc = k => INT_SRC[k] || INT_SRC.lain;
let saVsTab = 'visit', saVsDays = 30;
async function saFinderOpts() {
  if (stCache.fd) return stCache.fd;
  try { const t = await (await fetch('js/finder.js?t=' + Date.now(), { cache: 'no-store' })).text(), g = n => { const m = t.match(new RegExp(`const ${n} = (\\[[\\s\\S]*?\\n\\]);`)); return m ? Function('return ' + m[1])() : []; };
    stCache.fd = { b: g('FD_BUDGETS'), t: g('FD_TASTES'), st: g('FD_STAGES') }; } catch (e) { stCache.fd = { b: [], t: [], st: [] }; }
  return stCache.fd;
}
async function stPengunjung(tab) {
  if (tab) saVsTab = tab;
  stPage(`<div class="st-ph"><div><p>Laporan</p><h1>Pengunjung &amp; Minat</h1></div><div class="st-acts">
      <div class="st-seg" id="vs-tab"><button onclick="stGo('#pengunjung')">👥 Pengunjung</button><button onclick="stGo('#pengunjung/minat')">📈 Minat pengunjung</button></div>
      <div class="st-seg" id="vs-days">${[7, 30, 90].map(n => `<button onclick="saVsDays=${n};saVsLoad()">${n} hari</button>`).join('')}</div><button class="st-btn" onclick="saVsLoad()">↻</button></div></div>
    <div id="vs-body"><p class="st-empty">⏳ Memuat…</p></div>`);
  document.querySelectorAll('#vs-tab button').forEach((b, i) => b.classList.toggle('on', i === (saVsTab === 'int' ? 1 : 0)));
  saVsLoad();
}
async function saVsLoad() {
  document.querySelectorAll('#vs-days button').forEach(b => b.classList.toggle('on', b.textContent.startsWith(saVsDays + ' ')));
  const el = document.getElementById('vs-body'); if (!el) return; el.innerHTML = '<p class="st-empty">⏳ Memuat…</p>';
  const rpc = (f, a) => supabase.rpc(f, a).then(r => r.error ? { err: saSetup(r.error) ? 'setup' : r.error.message } : { d: saJson(r.data) }, e => ({ err: e.message || String(e) }));
  if (saVsTab === 'int') {
    const [I] = await Promise.all([rpc('interest_stats', { p_days: saVsDays }), saFinderOpts(), saLoadAd().catch(() => null)]);
    if (document.getElementById('vs-body')) el.innerHTML = I.err ? `<p class="st-empty">${I.err === 'setup' ? 'Laporan Minat Pengunjung belum diaktifkan (SQL <code>supabase/interest.sql</code>).' : '⚠ ' + esc(I.err)}</p>` : saIntHtml(I.d);
    return;
  }
  const [V, A, AV] = await Promise.all([rpc('site_visit_stats', { p_days: saVsDays }), rpc('app_event_stats', { p_days: saVsDays }), supabase.rpc('academy_view_counts').then(r => r.error ? null : r.data || [], () => null), stLoadAcad().catch(() => null)]);
  if (!document.getElementById('vs-body')) return;
  el.innerHTML = V.err ? `<p class="st-empty">${V.err === 'setup' ? 'Penghitung pengunjung belum diaktifkan.' : '⚠ ' + esc(V.err)}</p>` : saVisHtml(V.d) + saAppHtml(A) + saAcadHtml(AV);
  saVsSide();
}
function saVisHtml(S) {
  const map = new Map((S.daily || []).map(d => [d.day, d])), days = [], base = Date.parse(S.today + 'T00:00:00Z');
  for (let i = saVsDays - 1; i >= 0; i--) { const k = new Date(base - i * 864e5).toISOString().slice(0, 10), d = map.get(k); days.push({ day: k, v: +(d?.visitors || 0), n: +(d?.visits || 0), l: +(d?.logged || 0) }); }
  const t = days[days.length - 1], mx = Math.max(1, ...days.map(d => d.v)), sum = days.reduce((a, d) => a + d.n, 0);
  const fd = (k, o) => new Date(k + 'T00:00:00Z').toLocaleDateString('id-ID', { timeZone: 'UTC', ...(o || { day: 'numeric', month: 'short' }) });
  const kp = (l, v, d) => `<div class="st-card st-kpi"><div class="l">${l}</div><div class="v">${fmtNum(v)}</div><div class="d">${d}</div></div>`;
  return `<div class="st-kpis">${kp('Hari ini', t.v, `orang · ${fmtNum(t.n)} kunjungan · ${fmtNum(t.l)} partner login`)}${kp('7 hari terakhir', S.v7, 'orang berbeda')}${kp('30 hari terakhir', S.v30, 'orang berbeda')}${kp('Total', S.total_visitors, `orang · ${fmtNum(S.total_visits)} kunjungan${S.first_day ? ' sejak ' + fd(S.first_day, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`)}</div>
    <div class="st-card st-pad" style="margin-bottom:18px"><div class="sa-h">Pengunjung per hari · ${saVsDays} hari <span>${fmtNum(sum)} kunjungan · <i class="sa-lg a"></i>pengunjung umum <i class="sa-lg b"></i>partner login</span></div>
      <div class="sa-chart">${days.map(d => `<i title="${fd(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}: ${d.v} orang · ${d.n} kunjungan · ${d.l} partner login" style="height:${d.v / mx * 100}%" class="${new Date(d.day + 'T00:00:00Z').getUTCDay() % 6 === 0 ? 'we' : ''}"><u style="height:${d.v ? d.l / d.v * 100 : 0}%"></u></i>`).join('')}</div>
      <div class="sa-ax"><span>${fd(days[0].day)}</span><span>${fd(t.day)}</span></div></div>
    <div class="st-g2"><div class="st-card"><div class="st-ch"><h3>Rincian harian</h3></div><div class="st-tw"><table class="st-tbl"><thead><tr><th>Tanggal</th><th>Orang</th><th>Partner login</th><th>Kunjungan</th></tr></thead><tbody>
      ${days.slice().reverse().filter(d => d.n).map(d => `<tr><td>${fd(d.day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td><td>${fmtNum(d.v)}</td><td>${fmtNum(d.l)}</td><td>${fmtNum(d.n)}</td></tr>`).join('') || '<tr><td colspan="4" class="st-empty">Belum ada kunjungan di periode ini.</td></tr>'}</tbody></table></div></div>
      <div class="st-col" id="vs-side"></div></div>
    <p class="st-note"><b>Orang</b> = browser/perangkat berbeda (HP + laptop = 2; mode samaran / hapus data browser = orang baru). <b>Kunjungan</b> = berapa kali CAI Hub dibuka (sekali per tab). Akun Admin/Editor/Ricky & layar videotron tidak dihitung. Hari dalam WIB.</p>`;
}
function saAppHtml(A) {
  if (A.err) return `<template data-side><div class="st-card st-pad"><div class="sa-h">📲 Pemasangan CAI Hub</div><p class="st-note">${A.err === 'setup' ? 'Pengukuran pemasangan belum diaktifkan (SQL supabase/app-install.sql).' : esc(A.err)}</p></div></template>`;
  const S = A.d, pct = (a, b) => b ? Math.round(a / b * 100) : 0, row = (l, v, s, p) => `<div class="sa-ap"><div><b>${fmtNum(v)}</b><small>${l}</small></div><span>${s}</span><div class="sa-bar"><i style="width:${Math.min(100, p)}%"></i></div></div>`;
  return `<template data-side><div class="st-card st-pad"><div class="sa-h">📲 Pemasangan CAI Hub · ${saVsDays} hari</div>
    ${row('dibuka dari ikon Layar Utama', S.standalone, `${pct(S.standalone, S.visitors)}% dari pengunjung`, pct(S.standalone, S.visitors))}
    ${row('pasang baru', S.install, `Android ${fmtNum(S.install_android)} · iPhone ${fmtNum(S.install_ios)}* · total ${fmtNum(S.total_install)}`, pct(S.install, Math.max(S.shown, S.install)))}
    ${row('ajakan pasang ditampilkan', S.shown, `ditutup ${fmtNum(S.dismiss)} · pasang ${pct(S.install, S.shown)}%`, pct(S.install, S.shown))}
    ${S.qr != null ? row('scan kartu QR toko', S.qr, `${fmtNum(S.qr_install)} lalu memasang (${pct(S.qr_install, S.qr)}%)`, pct(S.qr_install, S.qr)) : ''}
    <p class="st-note">* iPhone dihitung saat CAI Hub pertama kali dibuka dari ikonnya.</p></div></template>`;
}
function saAcadHtml(AV) {
  if (!AV) return '';
  const m = new Map(AV.map(x => [+x.no, x])), list = (stCache.acad || []).filter(acadDueS).map(a => ({ a, v: +(m.get(+a.no)?.views || 0), p: +(m.get(+a.no)?.viewers || 0) })).sort((x, y) => y.v - x.v || x.a.no - y.a.no);
  return `<template data-side><div class="st-card"><div class="st-ch"><h3>🎓 Academy · dilihat per materi</h3></div><div class="st-tw" style="max-height:420px"><table class="st-tbl"><thead><tr><th>Materi</th><th>Dilihat</th><th>Orang</th></tr></thead><tbody>
    ${list.map(r => `<tr><td>#${r.a.no} · ${esc(r.a.title)}</td><td>${fmtNum(r.v)}</td><td>${fmtNum(r.p)}</td></tr>`).join('') || '<tr><td colspan="3" class="st-empty">Belum ada data.</td></tr>'}</tbody></table></div></div></template>`;
}
// kotak samping (pemasangan + Academy) dipindah ke kolom kanan setelah dirender
function saVsSide() { const side = document.getElementById('vs-side'); if (!side) return; document.querySelectorAll('#vs-body template[data-side]').forEach(t => { side.append(t.content); t.remove(); }); }
function saTrend(n, n0) { if (!n0) return n ? '<span class="up">baru</span>' : ''; const p = Math.round((n - n0) / n0 * 100); return `<span class="${p < 0 ? 'dn' : 'up'}">${p < 0 ? '▼' : '▲'} ${Math.abs(p)}%</span>`; }
function saHBars(rows, lbl, val, col) { const M = Math.max(1, ...rows.map(val)); return rows.map((x, i) => `<div class="sa-hb"><div class="t">${lbl(x, i)}</div><b>${fmtNum(val(x))}</b><div class="sa-bar"><i style="width:${val(x) / M * 100}%${col ? ';background:' + col(x) : ''}"></i></div></div>`).join(''); }
function saSrcBar(ps) {
  const tot = ps.reduce((a, x) => a + +x.n, 0) || 1; if (!ps.length) return '';
  return `<div class="sa-src">${ps.map(x => `<i style="width:${x.n / tot * 100}%;background:${saSrc(x.src)[1]}"></i>`).join('')}</div><div class="sa-leg">${ps.slice(0, 8).map(x => `<span><i style="background:${saSrc(x.src)[1]}"></i>${esc(saSrc(x.src)[0])} ${Math.round(x.n / tot * 100)}%</span>`).join('')}</div>`;
}
const saChips = (a, cls = '') => a?.length ? `<div class="sa-kw ${cls}">${a.map(x => `<span>${esc(x.ref)}<b>${fmtNum(x.n)}</b></span>`).join('')}</div>` : '<p class="st-empty">Belum ada data.</p>';
const saCarName = slug => String(slug).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
function saIntHtml(S) {
  const T = S.tot || {}, kp = (l, v, v0, x) => `<div class="st-card st-kpi"><div class="l">${l}</div><div class="v">${fmtNum(v)}</div><div class="d">${x || `${saTrend(+v, +v0)} ${v0 ? 'dari ' + fmtNum(v0) : ''}`}</div></div>`;
  const sh = S.share || {}, ds = saAdPub();
  const views = (S.views || []).map(x => ({ ...x, f: saFind(x.ref) })).filter(x => x.f).slice(0, 10);
  const vHtml = views.length ? saHBars(views, (x, i) => { const ph = (x.f.p.photos || [x.f.p.photo]).filter(Boolean)[0]; return `<span class="sa-rk${i < 3 ? ' g' : ''}">${i + 1}</span><span class="st-th sm">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy">` : esc(x.f.p.emoji || '🔊')}</span><a href="/?p=${esc(x.f.p.id)}" target="_blank" rel="noopener"><b>${esc(x.f.p.name)}</b><small>${esc(x.f.b.name)} · ${esc(x.f.p.category)} ${saTrend(+x.n, +x.n0)}</small></a>`; }, x => +x.n) : '<p class="st-empty">Belum ada data.</p>';
  const parts = (S.partners || []).map(x => `<tr><td><b>${esc(x.ref)}</b><small>${esc(ds.find(d => d.n === x.ref)?.c || '')}</small></td><td>${fmtNum(x.wa || 0)}</td><td>${fmtNum(x.maps || 0)}</td><td>${fmtNum(x.ig || 0)}</td><td><b>${fmtNum(x.total)}</b></td></tr>`).join('');
  const list = (a, fn) => a?.length ? a.map(x => `<div class="st-row sa-li"><div class="tx">${esc(fn(x.ref))}</div><b>${fmtNum(x.n)}</b></div>`).join('') : '<p class="st-empty">Belum ada data.</p>';
  const cmpName = ref => ref.split(',').map(id => saFind(id)?.p.name || id).join(' ⇄ ');
  // Temukan Sistem
  const FD = stCache.fd || { b: [], t: [], st: [] }, F = (S.finder || []).map(x => { const [b, t, st] = String(x.ref).split('|'); return { b, t, st, n: +x.n }; }), tot = F.reduce((a, x) => a + x.n, 0);
  const agg = (k, opts) => opts.map(o => ({ o, n: F.filter(x => x[k] === o.id).reduce((a, x) => a + x.n, 0) }));
  const q = (title, rows) => `<div class="sa-h sm">${title}</div>${saHBars(rows, r => `${esc(r.o.e || '')} ${esc(r.o.t)}`, r => r.n)}`;
  const best = [...F].sort((a, b) => b.n - a.n)[0], lab = (arr, id) => (arr.find(o => o.id === id) || {}).t || id, go = S.fdgo || {};
  const fd = !('finder' in S) ? '<p class="st-empty">Butuh pembaruan SQL laporan minat.</p>' : tot ? `${q('Anggaran', agg('b', FD.b))}${q('Selera suara', agg('t', FD.t))}${q('Cara pasang', agg('st', FD.st))}
    ${best ? `<p class="sa-tip">🔥 <b>Kombinasi terbanyak:</b> ${esc(lab(FD.b, best.b))} · ${esc(lab(FD.t, best.t))} · ${esc(lab(FD.st, best.st))} — <b>${fmtNum(best.n)} orang</b></p>` : ''}
    <p class="sa-tip">🔧 Hasil dipakai: <b>${fmtNum(go.rakit || 0)}</b> dibuka di Simulator · <b>${fmtNum(go.partner || 0)}</b> dikirim ke partner · <b>${fmtNum(go.share || 0)}</b> dibagikan.</p>` : '<p class="st-empty">Belum ada yang menyelesaikan Temukan Sistem.</p>';
  const cars = S.cars || [];
  return `<div class="st-kpis">${kp('Produk dilihat', T.view, T.view0)}${kp('Klik ke partner (WA · Maps · IG)', T.click, T.click0)}${kp('Pencarian', T.search, T.search0)}${kp('Rakitan & perbandingan dibagikan', T.share, 0, `rakitan ${fmtNum(sh.rk || 0)} · perbandingan ${fmtNum(sh.cmp || 0)}`)}</div>
    <div class="st-g2 sa-gap"><div class="st-card st-pad"><div class="sa-h">🔥 Produk paling dilihat · ${S.days || saVsDays} hari <span>1× per orang per hari · panah = vs periode sebelumnya</span></div>${vHtml}</div>
      <div class="st-col"><div class="st-card"><div class="st-ch"><h3>📞 Klik ke partner</h3></div>${parts ? `<div class="st-tw"><table class="st-tbl"><thead><tr><th>Partner</th><th>WA</th><th>Maps</th><th>IG</th><th>Total</th></tr></thead><tbody>${parts}</tbody></table></div><div class="st-pad" style="padding-top:12px"><div class="sa-h sm">Dari mana kliknya</div>${saSrcBar(S.psrc || [])}</div>` : '<p class="st-empty">Belum ada klik.</p>'}</div>
        <div class="st-card st-pad"><div class="sa-h">📍 Kota paling banyak dicari</div>${saChips(S.cities)}</div></div></div>
    <div class="st-g2 sa-gap sa-eq"><div class="st-card st-pad"><div class="sa-h">🔎 Kata yang paling dicari <span>dicari ≥ 2 orang</span></div>${saChips(S.search_hit)}</div>
      <div class="st-card st-pad"><div class="sa-h">❓ Dicari tapi tidak ketemu <span>bahan sinonim pencarian / produk baru</span></div>${saChips(S.search_miss, 'miss')}</div></div>
    <div class="sa-g3 sa-gap"><div class="st-card"><div class="st-ch"><h3>❤ Paling banyak disimpan</h3></div>${list(S.fav, saPName)}</div><div class="st-card"><div class="st-ch"><h3>⇄ Paling sering dibandingkan</h3></div>${list(S.cmp, cmpName)}</div><div class="st-card"><div class="st-ch"><h3>🔧 Paling sering masuk rakitan</h3></div>${list(S.rk, saPName)}</div></div>
    <div class="st-g2 sa-gap sa-eq"><div class="st-card st-pad"><div class="sa-h">🚗 Mobil paling dicari <span>orang</span></div>${cars.length ? saHBars(cars, (x, i) => `<span class="sa-rk${i < 3 ? ' g' : ''}">${i + 1}</span><b>${esc(saCarName(x.ref))}</b>`, x => +x.n) : '<p class="st-empty">Belum ada data.</p>'}
        ${(S.car_miss || []).length ? `<p class="sa-tip">💡 <b>Dicari tapi belum ada datanya:</b> ${S.car_miss.map(x => `${esc(x.ref)} (${fmtNum(x.n)})`).join(' · ')} → calon konten Galeri.</p>` : ''}</div>
      <div class="st-card st-pad"><div class="sa-h">🎯 Jawaban Temukan Sistem <span>${tot ? fmtNum(tot) + ' kali diselesaikan' : ''}</span></div>${fd}</div></div>
    <p class="st-note">Dicatat per browser tanpa data pribadi${S.first_day ? ' sejak ' + new Date(S.first_day + 'T00:00:00Z').toLocaleDateString('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : ''}; akun Admin/Editor/Ricky tidak dihitung. Klik WA tercatat saat tombol ditekan (belum tentu pesan terkirim).</p>`;
}

/* ── 📊 RAPOR BULANAN (js/report.js + 📍 kanal js/channel.js + 🔎 Google Search) — RPC monthly_report, tabel gsc_monthly ── */
const RP_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const RP_MIN = '2026-10';
let rpMonth = null;
const rpNow = () => todayWIB().slice(0, 7);
const rpShift = (m, d) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + d, 1)).toISOString().slice(0, 7); };
const rpLabel = m => { const [y, mo] = m.split('-').map(Number); return `${RP_MONTHS[mo - 1]} ${y}`; };
const rpShort = m => { const [y, mo] = m.split('-').map(Number); return `${RP_MONTHS[mo - 1].slice(0, 3)} ${y}`; };
function rpRange(m) { const [y, mo] = m.split('-').map(Number), last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10), t = todayWIB(); return { from: `${m}-01`, to: last < t ? last : t, running: last >= t }; }
const rpDefault = () => { const p = rpShift(rpNow(), -1); return p > RP_MIN ? p : rpNow(); };
function rpDelta(n, n0, pct = true) {
  if (!n0) return n ? '<span class="rp-d up">baru</span>' : '';
  const d = pct ? Math.round((n - n0) / n0 * 100) : n - n0;
  return d ? `<span class="rp-d ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${pct ? '%' : ''}</span>` : '<span class="rp-d">= sama</span>';
}
const rpDayLabel = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const rpCity = name => saAdPub().find(x => normKey(x.n) === normKey(name))?.c || '';
async function stRapor(m) {
  if (m && /^\d{4}-\d{2}$/.test(m)) rpMonth = m > rpNow() ? rpNow() : m < RP_MIN ? RP_MIN : m;
  if (!rpMonth) rpMonth = rpDefault();
  stPage('<div id="rp-body"><p class="st-empty">⏳ Memuat rapor…</p></div>');
  Promise.all([saLoadAd(), stLoadNews(), stLoadCw(), stLoadGl(), stLoadAcad(), saFinderOpts()].map(p => p.catch(() => null))).then(() => rpRender());
  rpLoad();
}
function rpGo(d) { const m = rpShift(rpMonth, d); if (m < RP_MIN || m > rpNow()) return; stGo('#rapor/' + m); }
async function rpLoad(force) {
  const m = rpMonth, r = rpRange(m), k = `rp|${m}|${r.to}`;
  if (force) { stCache[k] = null; stCache.gsc = {}; }
  rpRender(); gscLoad(m);
  if (stCache[k]) return;
  const { data, error } = await supabase.rpc('monthly_report', { p_from: r.from, p_to: r.to });
  if (error) stCache.rpErr = saSetup(error) ? 'setup' : error.message; else { stCache.rpErr = ''; stCache[k] = saJson(data); }
  rpRender();
}
const rpData = () => { const r = rpRange(rpMonth); return stCache[`rp|${rpMonth}|${r.to}`] || null; };
function rpInsights(S) {
  const out = [], v = S.vis || {};
  if (v.people) { const d = v.people0 ? Math.round((v.people - v.people0) / v.people0 * 100) : null, top = [...(S.daily || [])].sort((a, b) => b.n - a.n)[0];
    out.push(`Pengunjung ${d == null ? '' : d >= 0 ? `naik <b>+${d}%</b> ` : `turun <b>${d}%</b> `}(${fmtNum(v.people)} orang)` + (top ? `. Hari teramai <b>${rpDayLabel(top.day)}</b> — ${fmtNum(top.n)} orang.` : '.')); }
  const vw = S.views || [];
  if (vw.length) { let up = null; vw.forEach((x, i) => { const j = (S.views0 || []).indexOf(x.ref), g = j < 0 ? null : j - i; if (g != null && g >= 3 && (!up || g > up.g)) up = { ref: x.ref, g, from: j + 1, to: i + 1 }; });
    out.push(`<b>${esc(saPName(vw[0].ref))}</b> paling banyak dilihat` + (up ? `; <b>${esc(saPName(up.ref))}</b> naik dari peringkat ${up.from} ke ${up.to}.` : '.')); }
  const c = S.click || {}, ct = (c.wa || 0) + (c.maps || 0) + (c.ig || 0);
  if (ct) { const src = (S.psrc || [])[0], p = (S.partners || [])[0], d = c.total0 ? Math.round((ct - c.total0) / c.total0 * 100) : null;
    out.push(`<b>${fmtNum(ct)} klik ke partner</b>${d == null ? '' : ` (${d >= 0 ? '+' : ''}${d}%)`}` + (src ? `, ${Math.round(src.n / ct * 100)}% dari ${esc(saSrc(src.src)[0])}` : '') + (p ? `. Paling banyak diklik: <b>${esc(p.ref)}</b>${rpCity(p.ref) ? ', ' + esc(rpCity(p.ref)) : ''}.` : '.')); }
  const ms = (S.miss || [])[0];
  if (ms) out.push(`“<b>${esc(ms.ref)}</b>” dicari ${fmtNum(ms.n)} orang tapi tidak ketemu di katalog — pertimbangkan sinonim pencarian atau produk/paket terkait.`);
  if (S.app?.install) out.push(`<b>${fmtNum(S.app.install)} orang</b> memasang CAI Hub di HP` + (S.app.qr ? ` · ${fmtNum(S.app.qr)} orang scan kartu QR toko.` : '.'));
  return out.slice(0, 4);
}
function rpOpenInfo(ref) {
  const i = ref.indexOf(':'), k = ref.slice(0, i), id = ref.slice(i + 1);
  if (k === 'news') { const it = (stCache.news || []).find(x => x.id === id); return '📰 News · ' + (it?.title || 'berita'); }
  if (k === 'gl') { const it = (stCache.gl || []).find(x => x.id === id); return '🚗 Galeri · ' + (it ? [it.car_make, it.car_model].filter(Boolean).join(' ') + (it.dealer ? ' — ' + it.dealer : '') : 'instalasi'); }
  if (k === 'acad') { const it = (stCache.acad || []).find(x => String(x.no) === id); return `🎓 Academy #${id}` + (it ? ' · ' + it.title : ''); }
  if (k === 'cw') { const it = (stCache.cw || []).find(x => x.id === id); return '☕ Concerto Way · ' + (it ? (it.day ? `Day ${it.day} · ` : '') + it.title : 'postingan'); }
  if (k === 'ev') return '📅 Acara';
  return ref;
}
function rpRender() {
  const box = document.getElementById('rp-body'); if (!box) return;
  const m = rpMonth, r = rpRange(m), S = rpData(), prev = rpShift(m, -1), next = rpShift(m, 1);
  const head = `<div class="rp-top"><div><div class="rp-k">📊 Rapor bulanan · CAI Hub</div><h1 class="rp-h">Rapor <em>${rpLabel(m)}</em></h1>
      <p class="rp-sub">${Number(r.from.slice(8))}–${Number(r.to.slice(8))} ${rpLabel(m)}${r.running ? ' <b class="rp-run">bulan berjalan</b>' : ''} · dibandingkan ${r.running ? `1–${Number(r.to.slice(8))} ` : ''}${rpLabel(prev)}</p></div>
    <div class="st-acts" data-html2canvas-ignore><div class="rp-mon"><button class="st-btn sm" onclick="rpGo(-1)" ${prev < RP_MIN ? 'disabled' : ''}>‹</button><span>${rpShort(m)}</span><button class="st-btn sm" onclick="rpGo(1)" ${next > rpNow() ? 'disabled' : ''}>›</button></div>
      <button class="st-btn" onclick="rpLoad(true)" title="Muat ulang">↻</button><button class="st-btn" onclick="chGenOpen()">🔗 Link &amp; QR</button>
      <button class="st-btn" onclick="rpShare()" ${S ? '' : 'disabled'}>💬 Bagikan</button><button class="st-btn gold" onclick="rpPng()" ${S ? '' : 'disabled'}>⬇ Unduh PNG</button></div></div>`;
  if (!S) { box.innerHTML = `<div class="rp-sheet">${head}<p class="st-empty">${stCache.rpErr === 'setup' ? 'Fungsi Rapor Bulanan belum ada di Supabase (SQL supabase/report.sql).' : stCache.rpErr ? '⚠ ' + esc(stCache.rpErr) : '⏳ Memuat rapor…'}</p></div>`; return; }
  const v = S.vis || {}, a = S.app || {}, c = S.click || {}, P = S.push || {}, ct = (c.wa || 0) + (c.maps || 0) + (c.ig || 0), ins = rpInsights(S);
  const kpi = (ic, l, val, d, x) => `<div class="st-card rp-kp"><small>${ic} ${l}</small><div class="v">${val}</div>${d}${x ? ` <span class="x">· ${x}</span>` : ''}</div>`;
  const days = [], mx = Math.max(1, ...(S.daily || []).map(x => x.n)), dm = Object.fromEntries((S.daily || []).map(x => [x.day, x]));
  for (let d = new Date(r.from + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= r.to; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10), x = dm[iso] || { n: 0, l: 0 };
    days.push(`<i class="${d.getUTCDay() % 6 === 0 ? 'we' : ''}" style="height:${Math.max(x.n ? 3 : 0, x.n / mx * 100)}%" title="${rpDayLabel(iso)} · ${x.n} orang${x.l ? ` · ${x.l} partner login` : ''}"><u style="height:${x.n ? x.l / x.n * 100 : 0}%"></u></i>`);
  }
  const prods = (S.views || []).map((x, i) => { const f = saFind(x.ref), j = (S.views0 || []).indexOf(x.ref), g = j < 0 ? null : j - i, ph = f ? (f.p.photos || [f.p.photo]).filter(Boolean)[0] : '';
    return `<div class="rp-pr"><span class="n">${i + 1}</span><span class="st-th sm">${ph ? `<img src="${esc(ph)}" alt="">` : esc(f?.p.emoji || '📦')}</span><span class="t"><b>${esc(f ? `${f.b.name} ${f.p.name}` : x.ref)}</b><small>${esc(f?.p.category || '')}</small></span>
      <span class="val">${fmtNum(x.n)}<em class="${g == null ? 'nw' : g > 0 ? 'up' : g < 0 ? 'dn' : ''}">${g == null ? 'baru' : g > 0 ? '▲ ' + g : g < 0 ? '▼ ' + -g : '= ' + (j + 1)}</em></span></div>`; }).join('') || '<p class="st-empty">Belum ada data produk dilihat.</p>';
  const partners = (S.partners || []).length ? saHBars(S.partners, x => `<b>${esc(x.ref)}</b>${rpCity(x.ref) ? ` <small>· ${esc(rpCity(x.ref))}</small>` : ''}`, x => x.n) : '<p class="st-empty">Belum ada klik ke partner.</p>';
  const miss = (S.miss || []).map(x => `<div class="st-row sa-li"><div class="tx">${esc(x.ref)}</div><b>${fmtNum(x.n)}</b></div>`).join('');
  const cars = (S.cars || []).length ? saHBars(S.cars, x => `<b>${esc(saCarName(x.ref))}</b>`, x => x.n) : '<p class="st-empty">Belum ada data.</p>';
  const FD = stCache.fd || { b: [], t: [] }, fdBy = { b: {}, t: {} }; let fdP = 0;
  for (const x of S.finder || []) { const [b, t] = x.ref.split('|'); fdP += x.n; fdBy.b[b] = (fdBy.b[b] || 0) + x.n; fdBy.t[t] = (fdBy.t[t] || 0) + x.n; }
  const top = o => Object.entries(o).sort((x, y) => y[1] - x[1])[0]?.[0], fdB = FD.b.find(x => x.id === top(fdBy.b))?.t || '', fdT = FD.t.find(x => x.id === top(fdBy.t))?.t || '';
  const C = S.content || {}, acad = (stCache.acad || []).filter(x => { const d = x.at ? new Date(Date.parse(x.at) + 7 * 36e5).toISOString().slice(0, 10) : x.date; return d && d >= r.from && d <= r.to && acadDueS(x); }).length;
  const cwd = C.cway_days && C.cway_days[0] ? ` (Day ${C.cway_days[0]}${C.cway_days[1] !== C.cway_days[0] ? '–' + C.cway_days[1] : ''})` : '';
  const cnt = [[C.news, '📰 News'], [C.cway, '☕ Concerto Way' + cwd], [acad, '🎓 Academy'], [C.gallery, '🚗 Galeri'], [C.guides, '📘 Panduan Partner'], [C.events, '📅 Acara']].map(([n, t]) => `<div><b>${fmtNum(n)}</b><small>${t}</small></div>`).join('');
  const opens = (S.opens || []).slice(0, 5);
  box.innerHTML = `<div class="rp-sheet" id="rp-sheet">${head}
    ${ins.length ? `<div class="st-card rp-ins"><b>💡 Ringkasan ${r.running ? 'sejauh ini' : 'bulan ini'}</b><ul>${ins.map(x => `<li>${x}</li>`).join('')}</ul></div>` : ''}
    ${S.first_day && S.first_day > r.from ? '<p class="st-note">ℹ️ Data pengunjung baru dicatat sejak ' + new Date(S.first_day + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) + '.</p>' : ''}
    <div class="rp-kpi">${kpi('👥', 'Pengunjung', fmtNum(v.people), rpDelta(v.people, v.people0), `${fmtNum(v.visits)} kunjungan`)}${kpi('🔑', 'Partner login', fmtNum(v.logged), rpDelta(v.logged, v.logged0), 'Kode Akses')}
      ${kpi('📲', 'Pasang di HP', fmtNum(a.install), rpDelta(a.install, a.install0, false), a.qr ? `${fmtNum(a.qr)} scan kartu QR` : 'dari ikon Layar Utama')}
      ${kpi('📞', 'Klik ke partner', fmtNum(ct), rpDelta(ct, c.total0), `WA ${fmtNum(c.wa)} · Maps ${fmtNum(c.maps)} · IG ${fmtNum(c.ig)}`)}
      ${kpi('🔔', 'Notifikasi aktif', fmtNum(P.now) + ' HP', P.logged ? `<span class="rp-d up">+${fmtNum(P.on)}</span>` : '', P.logged ? `${fmtNum(P.off)} berhenti` : '')}</div>
    ${chBoxHtml(S, m)}${gscBoxHtml(m)}
    <div class="st-g2 sa-gap"><div class="st-card st-pad"><div class="sa-h">Pengunjung harian <span>orang berbeda · <i class="sa-lg a"></i>pengunjung <i class="sa-lg b"></i>partner login</span></div><div class="sa-chart rp">${days.join('')}</div><div class="sa-ax"><span>1 ${RP_MONTHS[+m.slice(5) - 1].slice(0, 3)}</span><span>${Number(r.to.slice(8))} ${RP_MONTHS[+m.slice(5) - 1].slice(0, 3)}</span></div></div>
      <div class="st-card st-pad"><div class="sa-h">🔥 Produk paling dilihat <span>orang · peringkat lalu</span></div>${prods}</div></div>
    <div class="sa-g3 sa-gap"><div class="st-card st-pad"><div class="sa-h">📞 Partner paling diklik</div>${partners}${(S.psrc || []).length ? `<div class="sa-h sm" style="margin-top:12px">Klik datang dari</div>${saSrcBar(S.psrc)}` : ''}</div>
      <div class="st-card st-pad"><div class="sa-h">❓ Dicari tapi tidak ketemu</div>${miss || '<p class="st-empty">Tidak ada — semua pencarian (≥ 2 orang) menemukan produk.</p>'}</div>
      <div class="st-card st-pad"><div class="sa-h">🚗 Mobil paling dicari</div>${cars}${(S.car_miss || []).length ? `<p class="sa-tip">🔎 Belum ada datanya: ${S.car_miss.map(x => `<b>${esc(x.ref)}</b> (${x.n})`).join(', ')}</p>` : ''}${fdP ? `<p class="sa-tip">🎯 Temukan Sistem dipakai <b>${fmtNum(fdP)}×</b>${fdB ? ` · anggaran terbanyak <b>${esc(fdB)}</b>` : ''}${fdT ? ` · selera <b>${esc(fdT)}</b>` : ''}</p>` : ''}</div></div>
    <div class="st-g2 sa-gap sa-eq"><div class="st-card st-pad"><div class="sa-h">📝 Konten terbit ${r.running ? 'sejauh ini' : 'bulan ini'}</div><div class="rp-cnt">${cnt}</div></div>
      <div class="st-card st-pad"><div class="sa-h">⭐ Konten paling dibuka <span>orang</span></div>${opens.length ? saHBars(opens, x => `<b>${esc(rpOpenInfo(x.ref))}</b>`, x => x.n) : '<p class="st-empty">Belum ada data.</p>'}</div></div>
    <div class="rp-foot"><span>CAI Hub · hub.concerto.id · disusun ${wibDate(Date.now(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB</span><span>Angka = orang berbeda (1 HP/browser = 1 orang) · akun Admin/Editor tidak dihitung</span></div></div>`;
}
async function rpBlob() {
  const el = document.getElementById('rp-sheet'); if (!el) return null;
  showToast('⏳ Menyiapkan gambar rapor…', 8000);
  try { await saScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', () => window.html2canvas); } catch (e) { showToast(e.message); return null; }
  el.classList.add('png');
  try { const cv = await html2canvas(el, { backgroundColor: '#F4F3EF', scale: 2, useCORS: true, logging: false, windowWidth: 1240, width: el.scrollWidth }); return await new Promise(ok => cv.toBlob(ok, 'image/png')); }
  finally { el.classList.remove('png'); }
}
const rpFile = () => `Rapor-CAI-Hub-${rpLabel(rpMonth).replace(' ', '-')}.png`;
async function rpPng() { const b = await rpBlob(); if (b) { saDl(b, rpFile()); showToast('✓ Rapor diunduh'); } }
async function rpShare() {
  const S = rpData(), r = rpRange(rpMonth); if (!S) return;
  const c = S.click || {}, ct = (c.wa || 0) + (c.maps || 0) + (c.ig || 0), v = S.vis || {}, d = v.people0 ? Math.round((v.people - v.people0) / v.people0 * 100) : null, G = stCache.gsc?.[rpMonth];
  const text = `📊 Rapor CAI Hub · ${rpLabel(rpMonth)}${r.running ? ` (sampai ${Number(r.to.slice(8))} ${RP_MONTHS[+rpMonth.slice(5) - 1]})` : ''}\n👥 ${fmtNum(v.people)} pengunjung${d == null ? '' : ` (${d >= 0 ? '▲' : '▼'}${Math.abs(d)}%)`}\n📞 ${fmtNum(ct)} klik ke partner\n📲 ${fmtNum(S.app?.install)} pasang di HP`
    + (G ? `\n🔎 Google: ${fmtNum(G.clicks)} klik · posisi ${gscPos(G.position)}` : '') + (S.channels?.rows?.length ? `\n📍 Kanal teratas: ${[...S.channels.rows].sort((a, b) => b.n - a.n).slice(0, 3).map(x => `${chInfo(x.ch).t} ${fmtNum(x.n)}`).join(' · ')}` : '');
  const b = await rpBlob();
  if (b) { const f = new File([b], rpFile(), { type: 'image/png' }); if (navigator.canShare?.({ files: [f] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) { try { await navigator.share({ files: [f], text }); return; } catch (e) { if (e?.name === 'AbortError') return; } } saDl(b, rpFile()); }
  window.open('https://wa.me/?text=' + waEnc(text), '_blank', 'noopener');
}
// 📍 Pengunjung datang dari (kanal)
const CH_DEF = { ig: { ic: '📸', t: 'Instagram', chip: 'Instagram bio', tip: 'Tempel di kolom <b>Situs web</b> profil Instagram (Edit profil → Tautan).' }, tiktok: { ic: '🎵', t: 'TikTok', chip: 'TikTok', tip: 'Profil TikTok → <b>Edit profil → Situs web</b>.' },
  story: { ic: '💬', t: 'Story WA', chip: 'Story WA', tip: 'Untuk status WhatsApp & stiker <b>Link</b> di Story Instagram. Template Story di bawah sudah memakai QR ini.' }, event: { ic: '🎪', t: 'Banner event', chip: 'Banner event', tip: 'Cetak di roll-up banner / backdrop pameran & kompetisi.' },
  kartu: { ic: '🃏', t: 'Kartu QR toko', chip: 'Kartu QR', tip: 'Kartu meja / stiker / kartu kecil di toko partner.' }, stiker: { ic: '🚗', t: 'Stiker mobil', chip: 'Stiker mobil', tip: 'Stiker kaca "Featured on CAI Hub" di mobil Galeri (per mobil: tombol cetak stiker di Galeri CAI Hub).' },
  wa: { ic: '🟢', t: 'WhatsApp' }, google: { ic: '🔎', t: 'Google' }, gbp: { ic: '📍', t: 'Google Business', tip: 'Kolom Situs web di Google Business Profile.' }, fb: { ic: '📘', t: 'Facebook' }, yt: { ic: '▶️', t: 'YouTube' }, link: { ic: '🔗', t: 'Link dibagikan' } };
const CH_CHIPS = ['ig', 'tiktok', 'story', 'event', 'kartu', 'stiker'];
const chInfo = c => CH_DEF[c] || { ic: '🏷', t: c };
const chNorm = s => String(s || '').toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
const chLink = c => `${HUB}/?src=${c}`;
const CH_COLORS = ['#B8893A', '#3FA9C0', '#C8463B', '#1F9D6B', '#8F6AD6', '#D88A3C', '#C9A227', '#2F6BCB', '#D86AA8', '#7DB44A'];
function chBoxHtml(S, m) {
  const C = S.channels;
  if (!C) return `<div class="st-card st-pad sa-gap" data-html2canvas-ignore><div class="sa-h">📍 Pengunjung datang dari · ${rpShort(m)}</div><p class="st-empty">Pencatatan kanal belum aktif (SQL supabase/channels.sql).</p></div>`;
  const rows = [...(C.rows || [])].filter(x => x.n || x.n0 || x.inst).sort((a, b) => b.n - a.n || b.inst - a.inst || a.ch.localeCompare(b.ch)), D = C.direct || {}, M = Math.max(1, ...rows.map(x => x.n), D.n || 0);
  const row = (ic, t, x, cls = '') => `<tr class="${cls}"><td>${ic} ${t}</td><td><div class="sa-hb in"><b>${fmtNum(x.n)}</b><div class="sa-bar"><i style="width:${(x.n || 0) / M * 100}%"></i></div></div></td><td>${rpDelta(x.n || 0, x.n0 || 0)}</td><td><b>${fmtNum(x.inst)}</b>${x.n && x.inst ? ` <small>${Math.round(x.inst / x.n * 100)}%</small>` : ''}</td></tr>`;
  const up = rows.filter(x => x.n >= 3 && x.n > (x.n0 || 0)).map(x => ({ ...x, g: x.n - (x.n0 || 0) })).sort((a, b) => b.g - a.g || b.n - a.n)[0];
  const ins = rows.filter(x => x.n >= 5 && x.inst).map(x => ({ ...x, p: x.inst / x.n })).sort((a, b) => b.p - a.p || b.inst - a.inst)[0];
  const sum = [up ? `Kanal yang naik paling tinggi: <b>${chInfo(up.ch).ic} ${esc(chInfo(up.ch).t)}</b> (+${fmtNum(up.g)} orang)` : '', ins ? `pasang di HP tertinggi: <b>${chInfo(ins.ch).ic} ${esc(chInfo(ins.ch).t)}</b> (${Math.round(ins.p * 100)}%)` : ''].filter(Boolean).join(' · ');
  const tot = rows.reduce((s, x) => s + (x.n || 0), 0) + (D.n || 0) || 1, col = i => CH_COLORS[i % CH_COLORS.length];
  return `<div class="st-card st-pad sa-gap"><div class="sa-h">📍 Pengunjung datang dari · ${rpShort(m)} <span>orang · vs bulan lalu · pasang di HP</span></div><div class="st-g2">
    <div class="st-tw"><table class="st-tbl"><thead><tr><th>Kanal</th><th>Pengunjung</th><th>vs bln lalu</th><th>Pasang di HP</th></tr></thead><tbody>${rows.map(x => row(chInfo(x.ch).ic, esc(chInfo(x.ch).t) + (CH_DEF[x.ch] ? '' : ` <small>?src=${esc(x.ch)}</small>`), x)).join('')}${row('🏠', 'Langsung / lainnya', D, 'sa-dim')}</tbody></table></div>
    <div>${sum ? `<p class="sa-tip">💡 ${sum}.</p>` : ''}<div class="sa-h sm">Pembagian pengunjung</div><div class="sa-src">${rows.map((x, i) => `<i style="width:${x.n / tot * 100}%;background:${col(i)}"></i>`).join('')}<i style="width:${(D.n || 0) / tot * 100}%;background:#B9BCC4"></i></div>
      <div class="sa-leg">${rows.slice(0, 7).map((x, i) => `<span><i style="background:${col(i)}"></i>${esc(chInfo(x.ch).t)} ${Math.round(x.n / tot * 100)}%</span>`).join('')}<span><i style="background:#B9BCC4"></i>Langsung ${Math.round((D.n || 0) / tot * 100)}%</span></div>
      <p class="st-note">1 orang bisa datang dari beberapa kanal. <i>Pasang di HP</i> dihitung ke kanal pertama orang itu.</p><div class="sa-row" data-html2canvas-ignore><button class="st-btn sm" onclick="chGenOpen()">🔗 Buat link &amp; QR promosi</button></div></div></div></div>`;
}
// 🔎 Google Search (diisi manual dari Search Console)
const gscPrev = m => rpShift(m, -1);
const gscPos = v => v == null ? '–' : Number(v).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
async function gscLoad(m) {
  stCache.gsc = stCache.gsc || {}; if (m in stCache.gsc) return;
  const { data, error } = await supabase.from('gsc_monthly').select('*').in('month', [m, gscPrev(m)]);
  if (error) stCache.gscMissing = saSetup(error); else { stCache.gscMissing = false; stCache.gsc[m] = (data || []).find(x => x.month === m) || null; stCache.gsc[gscPrev(m)] = (data || []).find(x => x.month === gscPrev(m)) || null; }
  rpRender();
}
function gscBoxHtml(m) {
  const G = stCache.gsc?.[m], P = stCache.gsc?.[gscPrev(m)], acts = `<div class="sa-row" data-html2canvas-ignore><button class="st-btn sm gold" onclick="gscForm('${m}')">✏️ ${G ? 'Ubah angka' : 'Isi angka'}</button><button class="st-btn sm" onclick="gscGuide()">📖 Cara ambil angka</button></div>`;
  if (stCache.gscMissing) return `<div class="st-card st-pad sa-gap" data-html2canvas-ignore><div class="sa-h">🔎 Google Search</div><p class="st-empty">Tabel Google Search belum dibuat (SQL supabase/gsc.sql).</p></div>`;
  if (!G) return `<div class="st-card st-pad sa-gap" data-html2canvas-ignore><div class="sa-h">🔎 Google Search · ${rpShort(m)}</div><p class="st-note">Angka Google Search bulan ini belum diisi. Search Console biasanya lengkap ±2–3 hari setelah bulan berakhir.</p>${acts}</div>`;
  const ctr = x => x && x.impressions ? x.clicks / x.impressions * 100 : null, c = ctr(G), c0 = ctr(P);
  const pd = P && G.position != null && P.position != null ? (d => d ? `<span class="rp-d ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲ naik' : '▼ turun'} ${Math.abs(d).toLocaleString('id-ID')}</span>` : '<span class="rp-d">= sama</span>')(Math.round((P.position - G.position) * 10) / 10) : '';
  const qs = (G.queries || []).filter(q => q?.q).slice(0, 5), prevQ = Object.fromEntries((P?.queries || []).map(q => [String(q.q).toLowerCase(), 1]));
  const kp = (l, v, d, x) => `<div class="rp-gk"><small>${l}</small><b>${v}</b>${d || ''}${x ? `<span class="x">${x}</span>` : ''}</div>`;
  return `<div class="st-card st-pad sa-gap"><div class="sa-h">🔎 Google Search · ${rpShort(m)} <span>dari Search Console</span></div><div class="st-g2"><div class="rp-gks">
      ${kp('Klik dari Google', fmtNum(G.clicks), P ? rpDelta(G.clicks, P.clicks) : '')}${kp('Tayangan', fmtNum(G.impressions), P ? rpDelta(G.impressions, P.impressions) : '', 'muncul di hasil pencarian')}
      ${kp('CTR', c == null ? '–' : c.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%', '', c0 == null ? '' : 'bulan lalu ' + c0.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%')}${kp('Posisi rata-rata', gscPos(G.position), pd, 'makin kecil makin atas')}</div>
    <div><div class="sa-h sm">5 kata kunci teratas <span>klik</span></div>${qs.length ? saHBars(qs, (q, i) => `<span class="sa-rk">${i + 1}</span><b>${esc(q.q)}</b>${prevQ[String(q.q).toLowerCase()] ? '' : ' <small class="up">baru</small>'}`, q => q.c || 0, () => '#2F6BCB') : '<p class="st-empty">Kata kunci belum diisi.</p>'}${acts}</div></div></div>`;
}
function gscForm(m) {
  const G = stCache.gsc?.[m] || {}, q = [...(G.queries || [])]; while (q.length < 5) q.push({ q: '', c: '' });
  saModal(`<div class="st-lbh"><b>🔎 Google Search · ${rpLabel(m)}</b><button class="st-btn sm" onclick="saClose()">✕</button></div><div class="st-pad">
    <p class="st-note" style="margin:0">Salin dari Search Console → <b>Performa → Hasil penelusuran</b>, tanggal 1–${new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate()} ${rpLabel(m)}. <a href="#" onclick="gscGuide();return false">📖 Cara ambil angka</a></p>
    <div class="sa-g3f"><label class="st-fl">Total klik<input class="st-in" id="gsc-c" inputmode="numeric" value="${G.clicks ?? ''}"></label><label class="st-fl">Total tayangan<input class="st-in" id="gsc-i" inputmode="numeric" value="${G.impressions ?? ''}"></label><label class="st-fl">Posisi rata-rata<input class="st-in" id="gsc-p" inputmode="decimal" value="${G.position == null ? '' : String(G.position).replace('.', ',')}" placeholder="mis. 14,2"></label></div>
    <div class="st-fl">5 kata kunci teratas <small>(tab Kueri, urut Klik)</small></div>
    ${q.slice(0, 5).map((x, i) => `<div class="sa-row gsc-q"><span class="sa-rk">${i + 1}</span><input class="st-in gsc-qq" value="${esc(x.q || '')}" placeholder="kata kunci"><input class="st-in gsc-qc" style="width:90px" inputmode="numeric" value="${x.c ?? ''}" placeholder="klik"></div>`).join('')}
    <div class="sa-row" style="margin-top:16px"><button class="st-btn pri" id="gsc-save" onclick="gscSave('${m}')">✓ Simpan</button>${stCache.gsc?.[m] ? `<button class="st-btn red" onclick="gscDel('${m}')">🗑 Hapus angka bulan ini</button>` : ''}</div></div>`);
}
const gscInt = v => { const n = parseInt(String(v || '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };
async function gscSave(m) {
  const ps = document.getElementById('gsc-p').value.trim().replace(/\./g, '').replace(',', '.'), p = ps ? Number(ps) : null;
  const qq = [...document.querySelectorAll('#sa-ov .gsc-q')].map(r => ({ q: r.querySelector('.gsc-qq').value.trim().slice(0, 80), c: gscInt(r.querySelector('.gsc-qc').value) || 0 })).filter(x => x.q);
  const row = { month: m, clicks: gscInt(document.getElementById('gsc-c').value) || 0, impressions: gscInt(document.getElementById('gsc-i').value) || 0, position: p == null || !isFinite(p) ? null : Math.round(p * 10) / 10, queries: qq, updated_at: new Date().toISOString() };
  const b = document.getElementById('gsc-save'); b.disabled = true;
  const { error } = await supabase.from('gsc_monthly').upsert(row);
  if (error) { b.disabled = false; return showToast('⚠ Gagal menyimpan: ' + error.message, 7000); }
  stCache.gsc[m] = row; saClose(); showToast('✓ Angka Google Search tersimpan'); rpRender();
}
async function gscDel(m) {
  if (!confirm('Hapus angka Google Search bulan ini?')) return;
  const { error } = await supabase.from('gsc_monthly').delete().eq('month', m);
  if (error) return showToast('⚠ ' + error.message); stCache.gsc[m] = null; saClose(); rpRender();
}
function gscGuide() {
  saModal(`<div class="st-lbh"><b>📖 Cara ambil angka Google Search</b><button class="st-btn sm" onclick="saClose()">✕</button></div><div class="st-pad"><ol class="sa-ol">
    <li>Buka <b>search.google.com/search-console</b> dengan akun Google CAI, pilih properti <code>https://hub.concerto.id/</code>.</li>
    <li>Menu kiri <b>Performa → Hasil penelusuran</b>.</li><li>Filter <b>Tanggal → Khusus</b>: tanggal 1 sampai tanggal terakhir bulan yang dilaporkan → <b>Terapkan</b>.</li>
    <li>Klik keempat kotak di atas grafik: <b>Total klik · Total tayangan · CTR rata-rata · Posisi rata-rata</b>.</li>
    <li>Ketik Total klik, Total tayangan dan Posisi rata-rata ke form (CTR dihitung otomatis).</li><li>Tab <b>Kueri</b>, urutkan kolom <b>Klik</b> → salin 5 kata kunci teratas + jumlah kliknya.</li><li>Tekan <b>✓ Simpan</b> — angka masuk Rapor &amp; ikut gambar PNG.</li></ol>
    <p class="st-note">Isi setelah tanggal 3 tiap bulan: data Search Console terlambat ±2–3 hari.</p></div>`);
}
// 🔗 Link & QR promosi + 🎬 template Story (js/qr.js)
let chSel = 'ig', chOther = '';
function chGenOpen(c) {
  if (c) chSel = c;
  saModal(`<div class="st-lbh"><b>🔗 Link &amp; QR promosi</b><button class="st-btn sm" onclick="saClose()">✕</button></div><div class="st-pad">
    <p class="st-note" style="margin:0 0 12px">Satu link berkode untuk tiap tempat promosi — hasilnya terlihat di Rapor › 📍 Pengunjung datang dari.</p>
    <div class="sa-row wrap">${CH_CHIPS.map(c => `<button class="st-chip${chSel === c ? ' on' : ''}" data-ch="${c}" onclick="chPick('${c}')">${CH_DEF[c].ic} ${CH_DEF[c].chip}</button>`).join('')}<button class="st-chip${chSel === '+' ? ' on' : ''}" data-ch="+" onclick="chPick('+')">＋ Lainnya</button></div>
    <div id="chg-body"></div>
    <div class="sa-story"><canvas id="chg-st" width="180" height="320"></canvas><div><b>🎬 Template Story / Reels</b><p class="st-note">PNG 1080 × 1920 · latar hitam-emas · QR <code>?src=story</code> · 6 logo brand.</p><button class="st-btn gold" onclick="chStoryPng()">⬇ Unduh Template Story</button></div></div></div>`, 'wide');
  chBody(); chStoryCanvas(document.getElementById('chg-st'));
}
function chPick(c) { chSel = c; document.querySelectorAll('#sa-ov [data-ch]').forEach(b => b.classList.toggle('on', b.dataset.ch === c)); chBody(); }
const chCode = () => chSel === '+' ? chNorm(chOther) : chSel;
function chBody() {
  const el = document.getElementById('chg-body'); if (!el) return;
  el.innerHTML = `${chSel === '+' ? `<label class="st-fl">Nama kanal <small>(huruf kecil, angka, tanda -, maks. 20 — mis. pameran-jcc)</small><input class="st-in" id="chg-o" value="${esc(chOther)}" maxlength="24" oninput="chOther=this.value;chLive()"></label>` : ''}
    <div class="sa-qr"><canvas id="chg-qr" width="300" height="300"></canvas><div><div class="st-fl" style="margin-top:0">Link</div><div class="sa-link" id="chg-link"></div>
      <div class="sa-row"><button class="st-btn pri" onclick="chCopyLink()">📋 Salin link</button><button class="st-btn" onclick="chQrPng()">⬇ QR PNG</button></div><p class="st-note" id="chg-tip"></p></div></div>`;
  chLive(); if (chSel === '+') setTimeout(() => document.getElementById('chg-o')?.focus(), 30);
}
function chLive() {
  const c = chCode(), cv = document.getElementById('chg-qr'); if (!cv) return;
  document.getElementById('chg-link').innerHTML = c ? `hub.concerto.id/?src=<b>${esc(c)}</b>` : '<span class="st-mu">Ketik nama kanal…</span>';
  document.getElementById('chg-tip').innerHTML = c ? (CH_DEF[c]?.tip || `Kanal baru <b>${esc(c)}</b> — muncul di Rapor sebagai 🏷 ${esc(c)}.`) + ' QR: ECC Q (tetap terbaca walau sebagian tertutup).' : '';
  const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height);
  if (c) qrCanvas(chLink(c), cv.width, { canvas: cv, margin: 3 }); else { x.fillStyle = '#EEEDE8'; x.fillRect(0, 0, cv.width, cv.height); }
}
function chCopyLink() { const c = chCode(); if (!c) return showToast('Ketik nama kanal dulu.'); saCopy(chLink(c), '📋 Link disalin: ' + chLink(c)); }
function chQrPng() { const c = chCode(); if (!c) return showToast('Ketik nama kanal dulu.'); qrCanvas(chLink(c), 1200, { margin: 4 }).toBlob(b => { saDl(b, `QR-CAI-Hub-${c}.png`); showToast('✓ QR diunduh'); }, 'image/png'); }
const chImg = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
async function chStoryCanvas(target) {   // sama dengan chStoryCanvas() di js/channel.js
  const W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
  try { await Promise.all(['700 150px Sora', '600 40px Sora', '500 34px Inter', '600 26px "JetBrains Mono"'].map(f => document.fonts.load(f))); } catch (e) {}
  const G1 = '#e9cf98', G2 = '#c9a45c', G3 = '#8d6a2c';
  x.fillStyle = '#060608'; x.fillRect(0, 0, W, H);
  const glow = (cx, cy, r, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(201,164,92,${a})`); g.addColorStop(1, 'rgba(201,164,92,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); };
  glow(W / 2, 330, 760, .20); glow(W / 2, 1150, 620, .16); glow(W * .1, H, 700, .10); glow(W * .95, H * .05, 500, .08);
  x.strokeStyle = 'rgba(233,207,152,.05)'; x.lineWidth = 1;
  for (let i = 0; i <= W; i += 60) { x.beginPath(); x.moveTo(i + .5, 0); x.lineTo(i + .5, H); x.stroke(); }
  for (let i = 0; i <= H; i += 60) { x.beginPath(); x.moveTo(0, i + .5); x.lineTo(W, i + .5); x.stroke(); }
  const fade = x.createLinearGradient(0, 0, 0, H); fade.addColorStop(0, 'rgba(6,6,8,0)'); fade.addColorStop(.5, 'rgba(6,6,8,.55)'); fade.addColorStop(1, 'rgba(6,6,8,0)'); x.fillStyle = fade; x.fillRect(0, 0, W, H);
  const hex = (cx, cy, r, w, a) => { x.save(); x.strokeStyle = `rgba(233,207,152,${a})`; x.lineWidth = w; x.beginPath(); for (let i = 0; i < 6; i++) { const t = Math.PI / 3 * i - Math.PI / 2; x[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(t), cy + r * Math.sin(t)); } x.closePath(); x.stroke(); x.restore(); };
  hex(W / 2, 470, 470, 2, .10); hex(W / 2, 470, 430, 1, .07);
  const gold = (y0, y1) => { const g = x.createLinearGradient(0, y0, W, y1); g.addColorStop(0, G3); g.addColorStop(.45, G1); g.addColorStop(.55, '#fff3d6'); g.addColorStop(1, G2); return g; };
  x.strokeStyle = 'rgba(233,207,152,.35)'; x.lineWidth = 2; x.strokeRect(36, 36, W - 72, H - 72);
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  const logo = await chImg(await saLogo()); if (logo) { const lw = 300, lh = lw * logo.height / logo.width; x.drawImage(logo, (W - lw) / 2, 205, lw, lh); }
  x.font = '600 28px "JetBrains Mono", monospace'; x.fillStyle = G2;
  const spaced = (t, y, sp) => { const ch = [...t], w = ch.reduce((s, c) => s + x.measureText(c).width + sp, -sp); let cx = (W - w) / 2; x.textAlign = 'left'; ch.forEach(c => { x.fillText(c, cx, y); cx += x.measureText(c).width + sp; }); x.textAlign = 'center'; };
  spaced('OFFICIAL BRAND HUB', 420, 10);
  x.fillStyle = gold(0, 0); x.fillRect(W / 2 - 160, 446, 90, 2); x.fillRect(W / 2 + 70, 446, 90, 2);
  x.beginPath(); x.moveTo(W / 2, 438); x.lineTo(W / 2 + 8, 447); x.lineTo(W / 2, 456); x.lineTo(W / 2 - 8, 447); x.closePath(); x.fill();
  x.font = '700 168px Sora, sans-serif';
  const w1 = x.measureText('CAI ').width, w2 = x.measureText('Hub').width, sx = (W - w1 - w2) / 2;
  x.textAlign = 'left'; x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 30; x.fillText('CAI ', sx, 630);
  x.fillStyle = gold(sx + w1, 0); x.shadowColor = 'rgba(201,164,92,.45)'; x.shadowBlur = 40; x.fillText('Hub', sx + w1, 630); x.shadowBlur = 0; x.textAlign = 'center';
  x.font = '500 36px Inter, sans-serif'; x.fillStyle = 'rgba(255,255,255,.86)'; x.fillText('Spesifikasi lengkap · Video produk', W / 2, 714); x.fillText('Partner resmi terdekat', W / 2, 764);
  const qs = 520, qx = (W - qs) / 2, qy = 840, rr = 34;
  const rrect = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  x.save(); x.shadowColor = 'rgba(201,164,92,.55)'; x.shadowBlur = 70; rrect(qx - 16, qy - 16, qs + 32, qs + 32, rr + 10); x.fillStyle = gold(qx, qy); x.fill(); x.restore();
  rrect(qx - 6, qy - 6, qs + 12, qs + 12, rr); x.fillStyle = '#fff'; x.fill();
  qrDraw(x, qrMatrix(chLink('story'), 'Q'), qx + 14, qy + 14, qs - 28, { margin: 2, fg: '#0a0a0c' });
  x.font = '700 48px Sora, sans-serif'; x.fillStyle = '#fff'; x.fillText('Scan / ketuk link di bio', W / 2, 1462);
  x.font = '600 40px "JetBrains Mono", monospace'; x.fillStyle = gold(W / 2 - 200, 0); x.fillText('hub.concerto.id', W / 2, 1526);
  const brands = BRANDS.filter(b => b.logo).slice(0, 6), imgs = await Promise.all(brands.map(b => chImg(b.logo)));
  x.fillStyle = 'rgba(233,207,152,.28)'; x.fillRect(140, 1572, W - 280, 1);
  const cw = 250, chh = 64, gx = (W - cw * 3) / 2;
  imgs.forEach((im, i) => { if (!im) return; const cx = gx + (i % 3) * cw + cw / 2, cy = 1630 + Math.floor(i / 3) * 84, s = Math.min(170 / im.width, chh / im.height), w = im.width * s, h = im.height * s; x.globalAlpha = .92; x.drawImage(im, cx - w / 2, cy - h / 2, w, h); x.globalAlpha = 1; });
  if (target) { const t = target.getContext('2d'); t.clearRect(0, 0, target.width, target.height); t.drawImage(cv, 0, 0, target.width, target.height); }
  return cv;
}
async function chStoryPng() { showToast('⏳ Menyiapkan template Story…', 4000); (await chStoryCanvas()).toBlob(b => { saDl(b, 'Story-CAI-Hub-1080x1920.png'); showToast('✓ Template Story diunduh'); }, 'image/png'); }

/* ── 📨 LAPORAN PARTNER (js/preport.js) — RPC partner_report, tabel partner_report_sent; kartu PNG 1080×1350 di canvas ── */
const PR_MIN = '2026-11';
const PR_SRC = { produk: 'halaman produk', google: 'Google', mobil: 'Cari per Mobil', simulator: 'System Simulator', partner: 'Enthusiast Partner', cek: 'Cek Partner Resmi',
  profil: 'Profil Partner', finder: 'Temukan Sistem', cari: 'pencarian', news: 'berita CAI Hub News', hof: 'Hall of Fame', galeri: 'Galeri Instalasi', lain: 'lainnya' };
const PR_COL = { produk: '#d8b26a', google: '#6fd3e6', mobil: '#52c38a', simulator: '#f0c75e', partner: '#7aa7ff', profil: '#e8c14a', cek: '#a3e07a', news: '#3fb8cf', lain: '#8b92a1' };
let prMonth = null, prQ = '';
const prDefault = () => { const p = rpShift(rpNow(), -1); return p >= PR_MIN ? p : rpNow(); };
async function stLapPartner(m) {
  if (m && /^\d{4}-\d{2}$/.test(m)) prMonth = m > rpNow() ? rpNow() : m < PR_MIN ? PR_MIN : m;
  if (!prMonth) prMonth = prDefault();
  stPage(`<div class="st-ph"><div><p>Laporan</p><h1>Laporan Partner</h1></div><div class="st-acts" id="pr-acts"></div></div><div id="pr-body"><p class="st-empty">⏳ Memuat…</p></div>`);
  saLive(); await saLoadAd().catch(() => null); prLoad();
}
function prGo(d) { const m = rpShift(prMonth, d); if (m < PR_MIN || m > rpNow()) return; stGo('#lappartner/' + m); }
const prKey = () => `pr|${prMonth}|${rpRange(prMonth).to}`;
const prData = () => stCache[prKey()] || null;
async function prLoad(force) {
  if (force) stCache[prKey()] = null;
  prRender(); if (prData()) return;
  const r = rpRange(prMonth), { data, error } = await supabase.rpc('partner_report', { p_from: r.from, p_to: r.to });
  if (error) stCache.prErr = saSetup(error) ? 'setup' : error.message; else { stCache.prErr = ''; stCache[prKey()] = saJson(data); }
  prRender();
}
function prRows() {
  const d = prData(), ds = saAdPub(), by = new Map((d?.partners || []).map(x => [normKey(x.ref), x]));
  const rows = ds.map(p => ({ p, s: by.get(normKey(p.n)) || null }));
  for (const [k, s] of by) if (!ds.some(p => normKey(p.n) === k)) rows.push({ p: { n: s.ref }, s });
  return rows.sort((a, b) => (b.s?.people || 0) - (a.s?.people || 0) || (b.s ? 1 : 0) - (a.s ? 1 : 0) || a.p.n.localeCompare(b.p.n));
}
const prSrcList = s => Object.entries(s?.src || {}).sort((a, b) => b[1] - a[1]);
const prSent = name => prData()?.sent?.[name];
function prRender() {
  const acts = document.getElementById('pr-acts'), el = document.getElementById('pr-body'); if (!el) return;
  const d = prData(), r = rpRange(prMonth), rows = prRows(), q = normKey(prQ);
  acts.innerHTML = `<div class="rp-mon"><button class="st-btn sm" onclick="prGo(-1)" ${rpShift(prMonth, -1) < PR_MIN ? 'disabled' : ''}>‹</button><span>${rpShort(prMonth)}</span><button class="st-btn sm" onclick="prGo(1)" ${prMonth >= rpNow() ? 'disabled' : ''}>›</button></div>
    <button class="st-btn" onclick="prLoad(true)">↻</button><button class="st-btn gold" onclick="prZip()" ${rows.some(x => x.s?.people) ? '' : 'disabled'}>⬇ Semua kartu (ZIP)</button>`;
  if (!d) { el.innerHTML = `<p class="st-empty">${stCache.prErr === 'setup' ? 'Fungsi Laporan Partner belum ada di Supabase (SQL supabase/partner-report.sql).' : stCache.prErr ? '⚠ ' + esc(stCache.prErr) : '⏳ Memuat…'}</p>`; return; }
  const list = q ? rows.filter(x => normKey([x.p.n, x.p.c, x.p.r].join(' ')).includes(q)) : rows;
  const tot = rows.reduce((a, x) => a + (x.s ? x.s.wa + x.s.maps + x.s.ig : 0), 0), wa = rows.reduce((a, x) => a + (x.s?.wa || 0), 0), hit = rows.filter(x => x.s?.people).length, sent = rows.filter(x => x.s?.people && prSent(x.p.n)).length;
  const kp = (l, v, s) => `<div class="st-card st-kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${s}</div></div>`;
  el.innerHTML = `${r.running ? `<p class="st-note" style="margin:0 0 14px">Bulan berjalan — angka sampai ${new Date(r.to + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', timeZone: 'UTC' })}. Kirim kartu sebaiknya setelah bulan selesai (tanggal 1).</p>` : ''}
    <div class="st-kpis">${kp('Klik ke partner', fmtNum(tot), 'WA · Maps · IG')}${kp('Partner dihubungi', hit, `dari ${rows.length} partner`)}${kp('Lewat WhatsApp', (tot ? Math.round(wa / tot * 100) : 0) + '%', 'dari semua klik')}${kp('Kartu sudah dikirim', `${sent} / ${hit}`, 'partner yang punya klik')}</div>
    <div class="st-card"><div class="st-filters"><b class="sa-ct">${rpLabel(prMonth)}</b><label class="st-search sm"><span>🔍</span><input placeholder="Cari partner / kota…" value="${esc(prQ)}" oninput="prQ=this.value;prRows2()"></label></div><div class="st-tw"><table class="st-tbl"><thead><tr><th>Partner</th><th>Orang</th><th class="st-hm">WA · Maps · IG</th><th class="st-hm">Dari</th><th>Status</th><th></th></tr></thead><tbody id="pr-tb"></tbody></table></div>
    <div class="st-tfoot">“Orang” = pengunjung berbeda yang menekan WhatsApp, Maps atau Instagram partner itu di CAI Hub (bukan berarti pesan terkirim). Kartu tanpa harga &amp; tanpa angka partner lain. Data klik mulai dicatat 4 Nov 2026.</div></div>`;
  prRows2();
}
function prRows2() {
  const tb = document.getElementById('pr-tb'); if (!tb) return;
  const rows = prRows(), q = normKey(prQ), list = q ? rows.filter(x => normKey([x.p.n, x.p.c, x.p.r].join(' ')).includes(q)) : rows;
  tb.innerHTML = list.map(x => { const s = x.s, i = rows.indexOf(x), sn = prSent(x.p.n), dl = s ? s.people - (s.people0 || 0) : 0;
    return `<tr><td><b>${esc(x.p.n)}</b><small>${esc(x.p.c || x.p.r || '—')}</small></td><td><b>${s?.people || 0}</b> ${s && s.people0 ? `<small class="${dl < 0 ? 'dn' : 'up'}" style="display:inline">${dl < 0 ? '▼' : '▲'} ${Math.abs(dl)}</small>` : s?.people ? '<small class="up" style="display:inline">baru</small>' : ''}</td>
      <td class="st-hm">${s ? `${s.wa} · ${s.maps} · ${s.ig}` : '—'}</td><td class="st-hm">${s ? esc(prSrcList(s).slice(0, 2).map(([k]) => PR_SRC[k] || k).join(', ')) : '—'}</td>
      <td>${sn ? `<span class="st-pill ok">✓ Dikirim ${wibDate(Date.parse(sn), { day: 'numeric', month: 'numeric' })}</span>` : s?.people ? '<span class="st-pill warn">Belum</span>' : '<span class="st-pill mu">Tanpa klik</span>'}</td>
      <td class="st-tact"><button class="st-btn sm" onclick="prView(${i})">👁 Lihat</button>${x.p.wa ? `<button class="st-btn sm" onclick="prSend(${i})">💬 Kirim WA</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="6" class="st-empty">Tidak ada partner yang cocok.</td></tr>';
}
function prWrapRound(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
async function prCard(x) {   // sama dengan prCard() di js/preport.js
  try { await document.fonts?.load('800 60px Sora'); await document.fonts?.load('500 20px Inter'); } catch (e) {}
  const logo = await chImg(await saLogo());
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const d = prData(), s = x.s, p = x.p, G = '#d8b26a', M = 72, SO = 'Sora, Inter, sans-serif', IN = 'Inter, sans-serif';
  c.fillStyle = '#0a0b0e'; c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(W, 0, 0, W, 0, 900); g.addColorStop(0, 'rgba(216,178,106,.22)'); g.addColorStop(1, 'rgba(216,178,106,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (logo) { const h = 44, w = logo.width / logo.height * h; c.drawImage(logo, M, 70, w, h); }
  c.textBaseline = 'alphabetic'; c.fillStyle = G; c.font = `700 22px ${SO}`; c.textAlign = 'right'; c.fillText('C A I   H U B', W - M, 100); c.textAlign = 'left';
  c.font = `700 24px ${SO}`; c.fillText(`LAPORAN PARTNER · ${rpLabel(prMonth).toUpperCase()}`.split('').join(String.fromCharCode(8202)), M, 196);
  c.fillStyle = '#fff'; let fs = 76; c.font = `800 ${fs}px ${SO}`; while (c.measureText(p.n).width > W - 2 * M && fs > 44) { fs -= 4; c.font = `800 ${fs}px ${SO}`; } c.fillText(p.n, M, 290);
  c.fillStyle = '#aab0bc'; c.font = `500 30px ${IN}`; c.fillText(`${p.c ? '📍 ' + p.c + ' · ' : ''}✓ Partner resmi CAI`, M, 340);
  const by = 392, bh = 302; prWrapRound(c, M, by, W - 2 * M, bh, 30); const bg = c.createLinearGradient(M, by, W - M, by + bh); bg.addColorStop(0, 'rgba(216,178,106,.16)'); bg.addColorStop(1, 'rgba(216,178,106,.02)');
  c.fillStyle = bg; c.fill(); c.strokeStyle = 'rgba(216,178,106,.45)'; c.lineWidth = 2; c.stroke();
  const n = s?.people || 0;
  c.fillStyle = '#d6d9df'; c.font = `500 28px ${IN}`; c.fillText(n ? 'Calon pembeli yang menghubungi toko Anda lewat CAI Hub' : 'Bulan ini belum ada yang menghubungi lewat CAI Hub', M + 40, by + 62);
  c.fillStyle = G; c.font = `800 150px ${SO}`; c.fillText(String(n), M + 36, by + 214); const nw = c.measureText(String(n)).width;
  c.fillStyle = '#fff'; c.font = `700 36px ${SO}`; c.fillText('orang', M + 54 + nw, by + 212);
  const n0 = s?.people0 || 0, prev = RP_MONTHS[(+prMonth.slice(5) + 10) % 12];
  if (n && n0) { const dl = n - n0; c.fillStyle = dl < 0 ? '#ef6b6b' : '#52c38a'; c.font = `700 26px ${IN}`; c.fillText(dl ? `${dl < 0 ? '▼' : '▲'} ${Math.abs(dl)} dibanding ${prev}` : `= sama dengan ${prev}`, M + 40, by + 268); }
  else if (!n) { c.fillStyle = '#e9c98a'; c.font = `600 25px ${IN}`; c.fillText('Bagikan link profil Anda & kirim foto instalasi ke tim CAI', M + 40, by + 268); }
  const ry = 722, cw = (W - 2 * M - 36) / 3;
  [['WhatsApp', s?.wa || 0, '💬'], ['Buka Maps', s?.maps || 0, '📍'], ['Instagram', s?.ig || 0, '📷']].forEach(([t, v, ic], i) => {
    const x0 = M + i * (cw + 18); prWrapRound(c, x0, ry, cw, 130, 22); c.fillStyle = '#111317'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#fff'; c.font = `800 52px ${SO}`; c.fillText(String(v), x0 + 24, ry + 68); c.fillStyle = '#aab0bc'; c.font = `500 22px ${IN}`; c.fillText(`${ic} klik ${t}`, x0 + 24, ry + 106);
  });
  let y = 920; const src = prSrcList(s), tot = src.reduce((a, [, v]) => a + v, 0);
  if (tot) {
    c.fillStyle = '#aab0bc'; c.font = `600 24px ${IN}`; c.fillText(`Mereka menemukan Anda dari ${src.slice(0, 2).map(([k]) => PR_SRC[k] || k).join(' & ')}`, M, y);
    let bx = M; y += 20; prWrapRound(c, M, y, W - 2 * M, 18, 9); c.save(); c.clip();
    const segs = src.slice(0, 4), rest = tot - segs.reduce((a, [, v]) => a + v, 0); if (rest > 0) segs.push(['lain', rest]);
    for (const [k, v] of segs) { const w = (W - 2 * M) * v / tot; c.fillStyle = PR_COL[k] || '#8b92a1'; c.fillRect(bx, y, w + 1, 18); bx += w; } c.restore();
    y += 52; let lx = M; c.font = `500 21px ${IN}`;
    for (const [k, v] of segs) { const t = `${(PR_SRC[k] || k).replace(/^./, z => z.toUpperCase())} ${Math.round(v / tot * 100)}%`, w = c.measureText(t).width + 50;
      if (lx + w > W - M) { lx = M; y += 34; } c.fillStyle = PR_COL[k] || '#8b92a1'; prWrapRound(c, lx, y - 15, 14, 14, 4); c.fill(); c.fillStyle = '#cfd3da'; c.fillText(t, lx + 22, y); lx += w; }
    y += 64;
  } else y = 930;
  const tops = (d?.top || []).map(id => saFind(id)).filter(Boolean).map(f => `${f.b.name} ${f.p.name}`);
  if (tops.length) { c.fillStyle = '#aab0bc'; c.font = `600 24px ${IN}`; c.fillText('Produk paling dilihat di CAI Hub bulan ini:', M, y); y += 46; c.fillStyle = '#fff'; c.font = `700 28px ${SO}`; tops.forEach((t, i) => { c.fillText(`${i + 1}. ${t}`, M + 8, y); y += 44; }); }
  c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 1; c.beginPath(); c.moveTo(M, H - 104); c.lineTo(W - M, H - 104); c.stroke();
  const link = saPfLink(shareSlug(p.n)).replace(/^https?:\/\//, '').replace(/\?v=.*$/, '').replace(/\/$/, '');
  c.font = `600 21px ${IN}`; c.fillStyle = '#8b92a1'; c.fillText('Profil Anda: ', M, H - 58); const lw = c.measureText('Profil Anda: ').width;
  c.fillStyle = G; c.font = `700 21px ${IN}`; c.fillText(link.length > 44 ? link.slice(0, 43) + '…' : link, M + lw, H - 58);
  c.textAlign = 'right'; c.fillStyle = '#8b92a1'; c.font = `600 21px ${IN}`; c.fillText('Concerto Audio Indonesia', W - M, H - 58); c.textAlign = 'left';
  return new Promise(ok => cv.toBlob(ok, 'image/png'));
}
const prFile = p => `Laporan-CAI-Hub-${shareSlug(p.n)}-${prMonth}.png`;
function prMsg(x) {
  const s = x.s, n = s?.people || 0, link = saPfLink(shareSlug(x.p.n));
  return n ? `Halo ${x.p.n} 👋\nIni laporan CAI Hub bulan ${rpLabel(prMonth)}: ${n} calon pembeli menghubungi toko Anda lewat CAI Hub (klik WA ${s.wa} · Maps ${s.maps} · IG ${s.ig}).\n\nBagikan link profil Anda agar makin banyak yang menemukan toko Anda:\n${link}\n\n— Tim Concerto Audio Indonesia`
    : `Halo ${x.p.n} 👋\nIni laporan CAI Hub bulan ${rpLabel(prMonth)}. Bulan ini belum ada calon pembeli yang menghubungi toko Anda lewat CAI Hub.\n\nYuk bagikan link profil Anda & kirim foto instalasi ke tim CAI agar tampil di Galeri:\n${link}\n\n— Tim Concerto Audio Indonesia`;
}
async function prView(i) {
  const x = prRows()[i]; if (!x) return;
  saModal(`<div class="st-lbh"><b>${esc(x.p.n)} · ${rpLabel(prMonth)}</b><button class="st-btn sm" onclick="saClose()">✕</button></div><p class="st-empty">⏳ Menggambar kartu…</p>`);
  const u = URL.createObjectURL(await prCard(x));
  saModal(`<div class="st-lbh"><b>${esc(x.p.n)} · ${rpLabel(prMonth)}</b><button class="st-btn sm" onclick="saClose()">✕</button></div><img src="${u}" alt="Kartu ${esc(x.p.n)}">
    <div class="st-pad"><pre class="sa-pre">${esc(prMsg(x))}</pre><div class="sa-row"><a class="st-btn gold" href="${u}" download="${esc(prFile(x.p))}">⬇ Unduh PNG</a>${x.p.wa ? `<button class="st-btn pri" onclick="prSend(${i})">💬 Kirim WA</button>` : ''}</div></div>`);
}
async function prMark(name) {
  const r = rpRange(prMonth), d = prData();
  const { error } = await supabase.from('partner_report_sent').upsert({ month: r.from, partner: name, sent_at: new Date().toISOString() });
  if (!error && d) { d.sent = { ...(d.sent || {}), [name]: new Date().toISOString() }; prRender(); }
}
async function prSend(i) {   // HP: menu berbagi dengan kartu terlampir · laptop: kartu diunduh + WhatsApp partner dibuka
  const x = prRows()[i]; if (!x?.p.wa) return;
  const b = await prCard(x), f = new File([b], prFile(x.p), { type: 'image/png' }), t = prMsg(x);
  if (navigator.canShare && /Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text: t }); prMark(x.p.n); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  saDl(b, f.name); window.open(`https://wa.me/${x.p.wa}?text=${waEnc(t)}`, '_blank', 'noopener');
  showToast('Kartu diunduh — lampirkan di chat WhatsApp partner.', 5000); prMark(x.p.n);
}
async function prZip() {
  const rows = prRows().filter(x => x.s?.people); if (!rows.length) return;
  showToast('⏳ Menyiapkan ZIP kartu…', 8000);
  try { await saScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', () => window.JSZip); } catch (e) { return showToast(e.message); }
  const z = new JSZip(); for (const x of rows) z.file(prFile(x.p), await prCard(x));
  saDl(await z.generateAsync({ type: 'blob' }), `Laporan-Partner-CAI-Hub-${prMonth}.zip`); showToast(`✓ ${rows.length} kartu diunduh`);
}

/* ── 📰 NEWS LENGKAP DI STUDIO (19 Nov 2026, permintaan pemilik: "halaman studio ketika di edit masih menuju ke CAI Hub") ──
   Posisi & zoom sampul (akhiran #x,y,z di kolom image), 📷 foto tambahan [foto n] (kolom photos), 🔧 project & partner pemasang
   + 🔊 perangkat (kolom projects) — aturan sama dengan js/news.js (nwFrDrag, nwPhFormHtml, nwProjFormHtml, saveNw). */
const NEWS_PH_MAX = 12;
const NW_PH_RE = /\[\s*foto\s+([\d\s,]+)\]/gi;
const nwPhNums = t => String(t || '').split(/[\s,]+/).map(Number).filter(n => n > 0);
function nwFrParse(v) { const m = String(v || '').split('#')[1]; const [x, y, z] = m ? m.split(',').map(s => s === '' ? NaN : Number(s)) : []; return { x: isFinite(x) ? x : 50, y: isFinite(y) ? y : 50, z: isFinite(z) && z >= 1 ? z : 1 }; }
const nwFrCss = f => `object-position:${f.x}% ${f.y}%;transform-origin:${f.x}% ${f.y}%;scale:${f.z}`;
const nwFrSfx = f => f && (f.x !== 50 || f.y !== 50 || f.z !== 1) ? `#${f.x},${f.y},${f.z}` : '';
const nwPhUrl = p => p ? (/^https?:/i.test(p) ? p : (typeof glMediaUrl === 'function' ? glMediaUrl(p) : pubUrl(p))) : '';
function stNwExtraInit(it) {
  nf.fr = nwFrParse(it?.image); nf.image = String(it?.image || '').split('#')[0];
  nf.photos = (Array.isArray(it?.photos) ? it.photos : []).map(p => ({ path: p.path, cap: p.cap || '' })); nf.hadPh = nf.photos.length > 0;
  nf.projects = (Array.isArray(it?.projects) ? it.projects : []).map(p => ({ ...p, products: [...(p.products || [])] })); nf.hadProj = nf.projects.length > 0;
  Promise.all([stLoadGl().catch(() => null), saLoadAd().catch(() => null)]).then(() => { if (nf) { stNfPh(); stNfPj(); } });
}
// Sampul: geser + zoom
function stNfCover() {
  const el = document.getElementById('nf-img'); if (!el || !nf) return;
  const src = nf.preview || (nf.image ? pubUrl(nf.image) : '');
  el.innerHTML = src ? `<div class="sa-cov" onpointerdown="stNfDrag(event)" title="Geser untuk memilih bagian yang tampil"><img src="${esc(src)}" alt="" style="${nwFrCss(nf.fr)}" draggable="false"><span>✥ Geser gambar</span></div>
      <div class="sa-row"><label class="st-btn sm">🖼 Ganti gambar<input type="file" accept="image/*" hidden onchange="stNfImg(this)"></label><span class="sa-zl">🔍 Zoom <input type="range" min="1" max="2.5" step="0.05" value="${nf.fr.z}" oninput="nf.fr.z=+this.value;stNfFr()"></span>
        <button class="st-btn sm" onclick="nf.fr={x:50,y:50,z:1};stNfCover();stNfPrev();stNfDirty()">⊙ Reset</button><button class="st-link" onclick="stNfImgDel()">Hapus gambar</button></div>`
    : `<label class="st-img16"><span>🖼 Pilih gambar sampul</span><input type="file" accept="image/*" hidden onchange="stNfImg(this)"></label>`;
}
function stNfFr() { const i = document.querySelector('#nf-img .sa-cov img'); if (i) i.style.cssText = nwFrCss(nf.fr); stNfPrev(); stNfDirty(); }
function stNfDirty() { if (!stDirty) { stDirty = true; stStat(); } }
function stNfDrag(e) {
  const box = e.currentTarget, f = nf?.fr; if (!f || e.button > 0) return;
  e.preventDefault(); box.setPointerCapture?.(e.pointerId); box.classList.add('drag');
  const r = box.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, fx = f.x, fy = f.y;
  const mv = ev => { const k = 100 / Math.max(1, f.z - 1 + .6);
    f.x = Math.round(Math.min(100, Math.max(0, fx - (ev.clientX - x0) / r.width * k))); f.y = Math.round(Math.min(100, Math.max(0, fy - (ev.clientY - y0) / r.height * k))); stNfFr(); };
  const up = () => { box.classList.remove('drag'); box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up); };
  box.addEventListener('pointermove', mv); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
}
// 📷 Foto tambahan
const nwGlLive = () => (stCache.gl || []).filter(g => g.published && !glPend(g) && !glSch(g));
const nwCar = g => [g.car_make, g.car_model, g.car_year].filter(Boolean).join(' ');
function stNfPh() {
  const el = document.getElementById('nf-ph'); if (!el || !nf) return;
  const used = new Set(); String(nf.body || '').replace(NW_PH_RE, (m, g) => { nwPhNums(g).forEach(n => used.add(n)); return ''; });
  const gl = nwGlLive().filter(g => (g.photos || []).some(p => !glVid(p)));
  el.innerHTML = `<div class="sa-sh"><b>📷 Foto tambahan</b><small>${nf.photos.length} dari maks. ${NEWS_PH_MAX} · disisipkan di antara paragraf dengan ↳ Sisipkan</small></div>
    <div class="sa-row">${nf.photos.length < NEWS_PH_MAX ? `<label class="st-btn sm">＋ Tambah foto<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onchange="stNfPhAdd(this)"></label>` : ''}
      ${gl.length && nf.photos.length < NEWS_PH_MAX ? `<select class="st-in sa-sel2" onchange="stNfPhGl(this.value);this.value=''"><option value="">📷 Ambil dari Galeri Instalasi…</option>${gl.map(g => `<option value="${esc(g.id)}">${esc(nwCar(g) + (g.dealer ? ' · ' + g.dealer : ''))}</option>`).join('')}</select>` : ''}</div>
    ${nf.photos.length ? `<div class="st-glmed">${nf.photos.map((p, i) => `<div class="st-glm"><div class="st-glmv"><img src="${esc(p.preview || nwPhUrl(p.path))}" alt="" loading="lazy"><span class="st-pill gold">${i + 1}</span>${used.has(i + 1) ? '<span class="st-pill ok r">di isi ✓</span>' : ''}</div>
      <input class="st-in sm" value="${esc(p.cap || '')}" maxlength="80" placeholder="+ keterangan" oninput="nf.photos[${i}].cap=this.value">
      <div class="st-glma"><button onclick="stNfPhMove(${i},-1)"${i ? '' : ' disabled'}>◀</button><button onclick="stNfPhIns(${i})" title="Sisipkan di posisi kursor isi berita">↳ Sisip</button><button onclick="stNfPhMove(${i},1)"${i < nf.photos.length - 1 ? '' : ' disabled'}>▶</button><button onclick="stNfPhDel(${i})">🗑</button></div></div>`).join('')}</div>`
      : '<p class="st-note">Belum ada foto tambahan. Foto yang tidak disisipkan tampil sebagai “Foto lainnya” di bawah berita.</p>'}`;
}
function stNfPhAdd(input) { const files = [...input.files]; input.value = ''; const room = NEWS_PH_MAX - nf.photos.length; if (files.length > room) showToast(`Maksimal ${NEWS_PH_MAX} foto.`); files.slice(0, room).forEach(file => nf.photos.push({ file, preview: URL.createObjectURL(file), cap: '' })); stNfPh(); stNfDirty(); }
function stNfPhGl(id) {
  const g = stCache.gl?.find(x => x.id === id); if (!g) return; const have = new Set(nf.photos.map(p => p.path));
  const add = (g.photos || []).filter(p => !glVid(p) && p.path && !have.has(p.path)), room = NEWS_PH_MAX - nf.photos.length;
  add.slice(0, room).forEach(p => nf.photos.push({ path: p.path, cap: p.area || '' })); if (add.length > room) showToast(`Maksimal ${NEWS_PH_MAX} foto.`); stNfPh(); stNfDirty();
}
function stNfRenum(map) { nf.body = String(nf.body || '').replace(NW_PH_RE, (m, g) => { const n = nwPhNums(g).map(x => map[x] ?? x).filter(x => x > 0); return n.length ? `[foto ${n.join(' ')}]` : ''; }).replace(/\n{3,}/g, '\n\n'); const b = document.getElementById('nf-body'); if (b) b.value = nf.body; }
function stNfPhMove(i, d) { const j = i + d; if (j < 0 || j >= nf.photos.length) return; [nf.photos[i], nf.photos[j]] = [nf.photos[j], nf.photos[i]]; stNfRenum({ [i + 1]: j + 1, [j + 1]: i + 1 }); stNfPh(); stNfDirty(); }
function stNfPhDel(i) { const p = nf.photos[i]; if (p?.preview) URL.revokeObjectURL(p.preview); nf.photos.splice(i, 1); const map = { [i + 1]: 0 }; for (let k = i + 2; k <= nf.photos.length + 1; k++) map[k] = k - 1; stNfRenum(map); stNfPh(); stNfDirty(); }
function stNfPhIns(i) {
  const ta = document.getElementById('nf-body'); if (!ta) return; const b = ta.value, at = nf.sel == null ? b.length : Math.min(nf.sel, b.length);
  const pre = b.slice(0, at).replace(/\s+$/, ''), post = b.slice(at).replace(/^\s+/, ''), tag = `[foto ${i + 1}]`;
  ta.value = nf.body = (pre ? pre + '\n\n' : '') + tag + (post ? '\n\n' + post : ''); nf.sel = (pre ? pre.length + 2 : 0) + tag.length;
  ta.focus(); ta.setSelectionRange(nf.sel, nf.sel); stNfPh(); stNfDirty();
}
// 🔧 Project & partner pemasang + 🔊 perangkat
const nwPrLbl = x => `${x.b.name} ${x.p.model || x.p.name}`;
const nwPjProds = p => [...new Set(p.products || [])].filter(id => saFind(id));
function stNfPj() {
  const el = document.getElementById('nf-pj'); if (!el || !nf) return;
  const gl = nwGlLive();
  el.innerHTML = `<div class="sa-sh"><b>🔧 Project &amp; partner pemasang</b><small>opsional — untuk berita kontes / acara</small></div>
    ${nf.projects.map((p, i) => `<div class="sa-pj"><div class="sa-pjr"><input class="st-in" value="${esc(p.car || '')}" placeholder="Merek Model Mobil" oninput="nf.projects[${i}].car=this.value">
        <input class="st-in" value="${esc(p.owner || '')}" placeholder="Peserta / pemilik" oninput="nf.projects[${i}].owner=this.value">
        <input class="st-in" value="${esc(p.result || '')}" placeholder="Hasil, mis. Juara 1 · Kelas …" oninput="nf.projects[${i}].result=this.value">
        <input class="st-in" list="nf-dl-pt" value="${esc(p.partner || '')}" placeholder="Partner pemasang" oninput="nf.projects[${i}].partner=this.value">
        <button class="st-btn sm red" onclick="nf.projects.splice(${i},1);stNfPj();stNfDirty()" title="Hapus project">🗑</button></div>
      <div class="sa-pjp"><small>🔊 Perangkat terpasang · ${nwPjProds(p).length} produk</small><div class="st-glchips">${nwPjProds(p).map(id => `<span class="st-glchip">${esc(saFind(id).p.model || saFind(id).p.name)}<button onclick="stNfPjPDel(${i},'${id}')">✕</button></span>`).join('')}</div>
        <div class="sa-row"><input class="st-in" id="nf-pjp-${i}" list="nf-dl-pr" placeholder="Ketik produk katalog, mis. “SQW”…" onkeydown="if(event.key==='Enter'){event.preventDefault();stNfPjPAdd(${i})}"><button class="st-btn sm" onclick="stNfPjPAdd(${i})">＋ Tambah</button></div>
        <input class="st-in" style="margin-top:8px" value="${esc(p.other || '')}" placeholder="Perangkat lain di luar katalog (opsional), pisahkan dengan koma" oninput="nf.projects[${i}].other=this.value"></div></div>`).join('')}
    <datalist id="nf-dl-pr">${PRODS().map(x => `<option value="${esc(nwPrLbl(x))}">`).join('')}</datalist><datalist id="nf-dl-pt">${saAdPub().map(d => `<option value="${esc(d.n)}">`).join('')}</datalist>
    <div class="sa-row"><button class="st-btn sm" onclick="nf.projects.push({car:'',owner:'',result:'',partner:'',products:[]});stNfPj();stNfDirty()">＋ Tambah project</button>
      ${gl.length ? `<select class="st-in sa-sel2" onchange="stNfPjGl(this.value);this.value=''"><option value="">📷 Ambil dari Galeri Instalasi…</option>${gl.map(g => `<option value="${esc(g.id)}">${esc(nwCar(g) + (g.dealer ? ' · ' + g.dealer : ''))}</option>`).join('')}</select>` : ''}</div>
    <p class="st-note">Partner dari daftar Enthusiast Partner otomatis tersambung ke tombol WhatsApp, Instagram, Maps &amp; Profil di berita.</p>`;
}
function stNfPjPAdd(i) {
  const inp = document.getElementById('nf-pjp-' + i), k = normKey(inp?.value); if (!k) return;
  const x = PRODS().find(r => [nwPrLbl(r), r.p.model, r.p.name, `${r.b.name} ${r.p.name}`].some(v => v && normKey(v) === k));
  if (!x) return showToast('Produk tidak ditemukan — pilih dari daftar katalog.');
  const p = nf.projects[i]; p.products = [...new Set([...(p.products || []), x.p.id])]; stNfPj(); stNfDirty(); document.getElementById('nf-pjp-' + i)?.focus();
}
function stNfPjPDel(i, id) { const p = nf.projects[i]; p.products = (p.products || []).filter(x => x !== id); stNfPj(); stNfDirty(); }
function stNfPjGl(id) {
  const g = stCache.gl?.find(x => x.id === id); if (!g) return;
  const d = saAdPub().find(x => normKey(x.n) === normKey(g.dealer));
  let prods = (g.products || []).filter(id => saFind(id)), other = '';
  const h = g.hof_id && typeof HALL_OF_FAME !== 'undefined' ? HALL_OF_FAME.find(e => e.id === g.hof_id) : null;
  if (!prods.length && h?.products) prods = h.products.filter(id => saFind(id)); if (h?.other?.length) other = h.other.join(', ');
  nf.projects.push({ car: nwCar(g), owner: h?.name || '', result: h ? [h.award, h.cls].filter(Boolean).join(' · ') : '', partner: d?.n || g.dealer || '', gl: g.id, products: [...new Set(prods)], other });
  stNfPj(); stNfDirty();
}
// dipakai stNewsSave(): kolom projects & photos (hanya dikirim bila dipakai / pernah ada)
async function stNfExtraRow(row, up) {
  const pj = nf.projects.map(p => { const pr = nwPjProds(p), ot = (p.other || '').trim();
    return Object.fromEntries(Object.entries({ car: (p.car || '').trim(), owner: (p.owner || '').trim(), result: (p.result || '').trim(), partner: (p.partner || '').trim(), gl: p.gl || '', products: pr.length ? pr : '', other: ot }).filter(([, v]) => v)); })
    .filter(p => p.car || p.partner);
  if (pj.length || nf.hadProj) row.projects = pj;
  const ph = [];
  for (const p of nf.photos) {
    if (p.file) { const blob = await glResize(p.file, 1600), path = `news/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
      const { error } = await supabase.storage.from('showcase').upload(path, blob, { contentType: blob.type, cacheControl: '3600' }); if (error) throw error; up.push(path); p.path = path; }
    if (p.path) ph.push(Object.fromEntries(Object.entries({ path: p.path, cap: (p.cap || '').trim() }).filter(([, v]) => v)));
  }
  if (ph.length || nf.hadPh) row.photos = ph;
  return ph;
}

/* ── 🚗 GALERI: atur posisi · zoom · putar foto · sampul loop di Studio (19 Nov 2026, sama dengan js/showcase.js glFr/glDragStart/glRotate/glAdjCover) ── */
const glPosXYs = p => { const m = /^(\d{1,3}) (\d{1,3})$/.exec(p?.pos || ''); return m ? [+m[1], +m[2]] : null; };
const glFrS = p => { const xy = glPosXYs(p) || [50, 50], z = Math.min(3, Math.max(1, +p?.zoom || 1)); return { x: xy[0], y: xy[1], z }; };
const glFrCssS = ({ x, y, z }) => `position:absolute;left:${((1 - z) * x).toFixed(2)}%;top:${((1 - z) * y).toFixed(2)}%;width:${(z * 100).toFixed(1)}%;height:${(z * 100).toFixed(1)}%;max-width:none;object-fit:cover;object-position:${x}% ${y}%`;
function glSetFrS(q, f) {
  if (Math.round(f.x) === 50 && Math.round(f.y) === 50) delete q.pos; else q.pos = `${Math.round(f.x)} ${Math.round(f.y)}`;
  if (f.z > 1.01) q.zoom = Math.round(f.z * 100) / 100; else delete q.zoom;
}
let gfAdj = null;
function stGfAdj(i) {
  const p = gf?.photos[i]; if (!p) return; const v = !!(p.video || glVid(p));
  gfAdj = { i, f: glFrS(p) };
  saModal(`<div class="st-lbh"><b>🎯 Atur ${v ? 'video' : 'foto'} ${i + 1}</b><button class="st-btn sm" onclick="saClose()">✕</button></div><div class="st-pad">
    <p class="st-note" style="margin:0 0 10px">Geser ${v ? 'video' : 'foto'} di bingkai 4:3 — bagian ini yang tampil di sampul kartu, thumbnail &amp; detail Galeri.</p>
    <div class="sa-adj" onpointerdown="stGfAdjDrag(event)">${v ? `<video id="gfa-m" src="${esc(p.url)}" muted loop autoplay playsinline style="${glFrCssS(gfAdj.f)}"></video>` : `<img id="gfa-m" src="${esc(p.url)}" alt="" draggable="false" style="${glFrCssS(gfAdj.f)}">`}<span>✥ Geser</span></div>
    <div class="sa-row"><span class="sa-zl">🔍 Zoom <input type="range" min="1" max="3" step="0.05" value="${gfAdj.f.z}" oninput="gfAdj.f.z=+this.value;stGfAdjPaint()"></span>
      <button class="st-btn sm" onclick="gfAdj.f={x:50,y:50,z:1};stGfAdjPaint();document.querySelector('#sa-ov input[type=range]').value=1">⊙ Reset</button>
      ${v ? `<button class="st-btn sm${p.cover ? ' pri' : ''}" onclick="stGfCover(${i})">🎞 ${p.cover ? 'Sampul loop · lepas' : 'Jadikan sampul loop'}</button>` : `<button class="st-btn sm" onclick="stGfRotate(${i})">⟳ Putar 90°</button>`}</div>
    <div class="sa-row" style="margin-top:16px"><button class="st-btn pri" onclick="stGfAdjDone()">✓ Selesai</button><span class="st-note" style="margin:0">Tersimpan saat Anda menekan 💾 Simpan.</span></div></div>`);
}
function stGfAdjPaint() { const m = document.getElementById('gfa-m'); if (m && gfAdj) m.style.cssText = glFrCssS(gfAdj.f); }
function stGfAdjDrag(ev) {
  const box = ev.currentTarget, el = box.querySelector('#gfa-m'); if (!el || ev.button > 0 || !gfAdj) return;
  ev.preventDefault(); box.setPointerCapture?.(ev.pointerId);
  const f = gfAdj.f, sx = ev.clientX, sy = ev.clientY, x0 = f.x, y0 = f.y, r = box.getBoundingClientRect(), W = r.width, H = r.height;
  const nw = el.naturalWidth || el.videoWidth || W, nh = el.naturalHeight || el.videoHeight || H, sc = Math.max(W / nw, H / nh);
  const rx = f.z * (nw * sc - W) + (f.z - 1) * W, ry = f.z * (nh * sc - H) + (f.z - 1) * H;
  const mv = e => { if (rx > 1) f.x = Math.max(0, Math.min(100, x0 - (e.clientX - sx) / rx * 100)); if (ry > 1) f.y = Math.max(0, Math.min(100, y0 - (e.clientY - sy) / ry * 100)); stGfAdjPaint(); };
  const up = () => { box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up); };
  box.addEventListener('pointermove', mv); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
}
function stGfAdjDone() { const p = gf?.photos[gfAdj?.i]; if (p) { glSetFrS(p, gfAdj.f); stGfMedia(); if (!stDirty) { stDirty = true; stStat(); } } saClose(); }
function stGfCover(i) { const p = gf.photos[i], on = !p.cover; gf.photos.forEach(q => delete q.cover); if (on) p.cover = true; if (!stDirty) { stDirty = true; stStat(); } stGfAdj(i); stGfMedia(); }
async function stGfRotate(i) {
  const p = gf.photos[i]; if (!p || p._rot) return; p._rot = true; showToast('⏳ Memutar foto…', 8000);
  try {
    const bmp = await createImageBitmap(p.blob || await (await fetch(p.url, { cache: 'no-store' })).blob());
    const c = document.createElement('canvas'); c.width = bmp.height; c.height = bmp.width; const g = c.getContext('2d'); g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(bmp, 0, 0);
    const blob = await new Promise((ok, no) => c.toBlob(b => b && b.type === 'image/webp' ? ok(b) : c.toBlob(j => j ? ok(j) : no(new Error('Gagal memutar foto')), 'image/jpeg', .88), 'image/webp', .85));
    if (p.path) { gf.removed.push(p.path); delete p.path; } if (p.blob) URL.revokeObjectURL(p.url);
    const xy = glPosXYs(p); if (xy) p.pos = `${100 - xy[1]} ${xy[0]}`;
    p.blob = blob; p.url = URL.createObjectURL(blob); if (!stDirty) { stDirty = true; stStat(); }
    showToast('✓ Foto diputar — tersimpan setelah 💾 Simpan', 3000);
  } catch (e) { showToast('⚠ Foto tidak bisa diputar: ' + (e.message || e), 5000); }
  delete p._rot; stGfMedia(); stGfAdj(i);
}

/* ── 🎬 SOROTAN BRAND (19 Nov 2026, permintaan pemilik — dulu tombol 🎬/✏️/↺ di kotak Dashboard CAI Hub).
   4 kotak video Dashboard: DASH_TILES (data murni di js/core.js) + catatan Editor showcase/dashboard/tiles.json
   ({ <brand>: { path?, mb?, label?, tag? }, _share: { <brand>: hash } }). Salinan aturan uploadDashVideo()/editDashLabel()/
   resetDashVideo()/dashShareImage()/dashShareSync() di js/core.js — ubah aturan di portal → ubah juga di sini. ── */
const SR_TAGS = ['Featured', 'New Arrival', 'Coming Soon', 'Best Seller', 'Juara EMMA'];
const SR_MAX_MB = 5, SR_MANIFEST = 'dashboard/tiles.json', SR_SHARE_VER = 1;
const SR_REPO_COPIES = new Set(['dashboard/zelos-1794119157102.mp4']);   // sama dengan DASH_REPO_COPIES
const srOvVid = o => (o?.path && o.mb && o.mb <= SR_MAX_MB && !SR_REPO_COPIES.has(o.path)) ? o.path : '';
let srTiles = [], srOv = {}, srEdit = {};
async function srLoad() {
  if (!srTiles.length) srTiles = await saCoreArr('DASH_TILES');
  try { const r = await fetch(pubUrl(SR_MANIFEST) + '?t=' + Date.now(), { cache: 'no-store' }); srOv = r.ok ? (await r.json()) || {} : {}; } catch (e) { srOv = {}; }
}
function srTile(id, ov = srOv) {
  const t = srTiles.find(x => x.id === id), b = BRANDS.find(x => x.id === id); if (!t || !b) return null;
  const o = ov[id] || {}, v = srOvVid(o);
  return { t, b, o, label: o.label || t.label || '', tag: 'tag' in o ? o.tag : (t.tag || ''), video: v ? pubUrl(v) : t.video, poster: v ? '' : (t.poster || ''), photos: t.photos || [], custom: !!v };
}
const srTagCls = tg => /new|baru/i.test(tg) ? 'new' : /soon/i.test(tg) ? 'soon' : /juara|emma/i.test(tg) ? 'win' : '';
async function stSorotan() {
  stPage(`<div class="st-ph"><div><p>Konten</p><h1>🎬 Sorotan Brand</h1></div><div class="st-acts"><a class="st-btn" href="/" target="_blank" rel="noopener">↗ Lihat di Dashboard</a><button class="st-btn" onclick="stSorotan()">↻</button></div></div>
    <p class="st-note" style="margin-top:-6px">Empat kotak video paling atas Dashboard CAI Hub. Perubahan langsung tampil untuk semua pengunjung. Video maks. ${SR_MAX_MB} MB (sebaiknya 854×480, tanpa suara, 10–15 detik) agar Dashboard ringan &amp; kuota Supabase aman.</p>
    <div class="sr-grid" id="sr-grid"><p class="st-empty">⏳ Memuat…</p></div>`);
  await srLoad(); srPaint();
}
function srPaint() {
  const g = document.getElementById('sr-grid'); if (!g) return;
  g.innerHTML = srTiles.map(t => {
    const d = srTile(t.id); if (!d) return '';
    const e = srEdit[t.id] || (srEdit[t.id] = { label: d.o.label ?? '', tag: 'tag' in d.o ? (d.o.tag || '-') : '' });
    const tagNow = e.tag === '-' ? '' : (e.tag || d.t.tag || ''), labNow = e.label || d.t.label || '';
    const media = d.video ? `<video src="${esc(d.video)}"${d.poster ? ` poster="${esc(d.poster)}"` : ''} muted loop playsinline autoplay preload="metadata"></video>` : `<img src="${esc(d.photos[0] || '')}" alt="">`;
    return `<div class="st-card sr-card" style="--bc:${esc(d.b.color || '#d8b26a')}">
      <div class="sr-vid">${media}${tagNow ? `<span class="sr-tag ${srTagCls(tagNow)}">${esc(tagNow)}</span>` : ''}</div>
      <div class="sr-bar">${d.b.logo ? `<img src="${esc(d.b.logo)}" alt="${esc(d.b.name)}">` : `<b>${esc(d.b.name)}</b>`}<span>${esc(labNow)}</span></div>
      <div class="st-pad">
        <div class="sr-src">${d.custom ? `🎬 Video unggahan Editor · ${esc(String(d.o.mb))} MB` : `📦 Video bawaan${d.video ? '' : ' (foto bergantian)'}`}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          <label class="st-btn sm pri">🎬 Ganti video<input type="file" accept="video/mp4,video/webm,video/quicktime" hidden onchange="srUpload('${d.b.id}',this)"></label>
          ${d.o.path ? `<button class="st-btn sm" onclick="srReset('${d.b.id}')">↺ Kembali ke video bawaan</button>` : ''}
        </div>
        <label class="st-fl">Nama produk / seri <small>— kosong = “${esc(d.t.label || '')}”</small><input class="st-in" maxlength="40" placeholder="${esc(d.t.label || '')}" value="${esc(e.label)}" oninput="srEdit['${d.b.id}'].label=this.value"></label>
        <label class="st-fl">Tag pojok kiri atas
          <select class="st-in" onchange="srEdit['${d.b.id}'].tag=this.value==='__c'?(prompt('Tulis tag:',srEdit['${d.b.id}'].tag||'')||'').trim():this.value;srPaint()">
            <option value=""${!e.tag ? ' selected' : ''}>Bawaan (${esc(d.t.tag || 'tanpa tag')})</option>
            ${SR_TAGS.map(x => `<option${e.tag === x ? ' selected' : ''}>${x}</option>`).join('')}
            ${e.tag && e.tag !== '-' && !SR_TAGS.includes(e.tag) ? `<option selected value="${esc(e.tag)}">${esc(e.tag)}</option>` : ''}
            <option value="-"${e.tag === '-' ? ' selected' : ''}>— Tanpa tag</option><option value="__c">✏️ Tulis sendiri…</option></select></label>
        <div class="st-acts" style="margin-top:12px"><button class="st-btn pri" onclick="srSave('${d.b.id}',this)">💾 Simpan</button></div>
      </div></div>`;
  }).join('') || '<p class="st-empty">Data kotak tidak terbaca.</p>';
  g.querySelectorAll('video').forEach(v => v.play?.().catch(() => {}));
}
async function srManifest(next) {
  const blob = new Blob([JSON.stringify(next)], { type: 'application/json' });
  const { error } = await supabase.storage.from('showcase').upload(SR_MANIFEST, blob, { upsert: true, contentType: 'application/json', cacheControl: '0' });
  if (error) throw error;
}
function srErr(e, what) {
  const m = e?.message || String(e);
  if (/row-level security|policy|403|unauthori/i.test(m)) saCopy(`drop policy if exists "showcase staff read" on storage.objects;\ncreate policy "showcase staff read" on storage.objects for select to authenticated\n  using (bucket_id = 'showcase' and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));`, '⚠ Izin Storage belum lengkap — SQL perbaikan disalin, tempel di Supabase → SQL Editor → Run.');
  else showToast(`⚠ Gagal ${what}: ` + m, 7000);
}
async function srSave(id, btn) {
  const t = srTiles.find(x => x.id === id), e = srEdit[id] || {}, n = { ...(srOv[id] || {}) };
  const lab = (e.label || '').trim(), tg = (e.tag || '').trim();
  if (lab) n.label = lab; else delete n.label;
  if (tg === '-') n.tag = ''; else if (tg && tg !== (t?.tag || '')) n.tag = tg; else delete n.tag;
  const next = { ...srOv }; if (Object.keys(n).length) next[id] = n; else delete next[id];
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyimpan…'; }
  try { await srManifest(next); srOv = next; showToast('✓ Disimpan — langsung tampil di Dashboard'); srShare(id); }
  catch (er) { srErr(er, 'menyimpan'); }
  srPaint();
}
async function srUpload(id, input) {
  const f = input.files?.[0]; input.value = ''; if (!f) return;
  if (f.size > SR_MAX_MB * 1048576) return showToast(`⚠ Video terlalu besar (${(f.size / 1048576).toFixed(1)} MB). Maksimal ${SR_MAX_MB} MB — kompres dulu (854×480, tanpa suara, 10–15 detik).`, 7000);
  const ext = (f.name.match(/\.(mp4|m4v|mov|webm)$/i)?.[1] || 'mp4').toLowerCase(), path = `dashboard/${id}-${Date.now()}.${ext}`;
  showToast('⏳ Mengunggah video…', 60000);
  try {
    const { error } = await supabase.storage.from('showcase').upload(path, f, { contentType: f.type || 'video/mp4', cacheControl: '31536000', upsert: false });
    if (error) throw error;
    const old = srOv[id]?.path, next = { ...srOv, [id]: { ...(srOv[id] || {}), path, mb: +(f.size / 1048576).toFixed(2) } };
    try { await srManifest(next); } catch (er) { supabase.storage.from('showcase').remove([path]).catch(() => {}); throw er; }
    srOv = next; if (old) supabase.storage.from('showcase').remove([old]).catch(() => {});
    showToast('✓ Video kotak diganti — langsung tampil untuk semua pengunjung'); srPaint(); srShare(id);
  } catch (er) { srErr(er, 'mengunggah'); }
}
async function srReset(id) {
  if (!confirm('Kembalikan kotak ini ke video/foto bawaan?')) return;
  const old = srOv[id]?.path, next = { ...srOv };
  if (next[id]) { next[id] = { ...next[id] }; delete next[id].path; delete next[id].mb; if (!Object.keys(next[id]).length) delete next[id]; }
  try { await srManifest(next); srOv = next; if (old) await supabase.storage.from('showcase').remove([old]); showToast('✓ Kembali ke tampilan bawaan'); srPaint(); srShare(id); }
  catch (er) { srErr(er, 'menyimpan'); }
}
// Sampul pratinjau WA /s/<brand>/ (showcase/dashboard/share-<brand>.jpg) — sama dengan dashShareImage() portal
function srHash(id) { const d = srTile(id); if (!d) return ''; const s = [SR_SHARE_VER, d.label, d.tag, srOvVid(d.o) || 'bawaan'].join('|'); let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); }
const srImg = src => new Promise((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => no(new Error('gambar gagal dimuat')); i.src = src; });
const srFrame = src => new Promise((ok, no) => { const v = document.createElement('video'); v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.preload = 'auto';
  const t = setTimeout(() => no(new Error('video terlalu lama dimuat')), 25000);
  v.onloadeddata = () => { v.currentTime = Math.min(1.5, (v.duration || 3) / 3); }; v.onseeked = () => { clearTimeout(t); ok(v); }; v.onerror = () => { clearTimeout(t); no(new Error('video gagal dimuat')); }; v.src = src; });
async function srShareImage(id) {
  const d = srTile(id); if (!d) return null;
  try { await Promise.all(['800 64px Sora', '700 16px Sora', '800 14px Sora', '400 21px Inter', '700 19px Sora'].map(f => document.fonts.load(f))); } catch (e) {}
  let bg = null; try { bg = srOvVid(d.o) ? await srFrame(pubUrl(srOvVid(d.o))) : await srImg(d.t.poster || d.photos[0]); } catch (e) {}
  const lw = await saLogo();
  const [logo, cai] = await Promise.all([d.b.logo ? srImg(d.b.logo).catch(() => null) : null, lw ? srImg(lw).catch(() => null) : null]);
  const W = 1200, H = 630, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
  x.fillStyle = '#07080a'; x.fillRect(0, 0, W, H);
  if (bg) { const bw = bg.videoWidth || bg.naturalWidth, bh = bg.videoHeight || bg.naturalHeight, sc = Math.max(W / bw, H / bh); x.drawImage(bg, (W - bw * sc) / 2, (H - bh * sc) / 2, bw * sc, bh * sc); }
  const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(7,8,10,.95)'); g.addColorStop(.42, 'rgba(7,8,10,.82)'); g.addColorStop(.75, 'rgba(7,8,10,.15)'); g.addColorStop(1, 'rgba(7,8,10,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H); x.fillStyle = d.b.color || '#d8b26a'; x.fillRect(0, 0, W, 8);
  x.beginPath(); x.arc(W - 126, H / 2, 56, 0, Math.PI * 2); x.fillStyle = 'rgba(0,0,0,.45)'; x.fill(); x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.85)'; x.stroke();
  x.beginPath(); x.moveTo(W - 134, H / 2 - 21); x.lineTo(W - 100, H / 2); x.lineTo(W - 134, H / 2 + 21); x.closePath(); x.fillStyle = '#fff'; x.fill();
  const L = 64, ls = v => { if ('letterSpacing' in x) x.letterSpacing = v; };
  if (logo) { const h = 54, w = Math.min(280, logo.naturalWidth * h / logo.naturalHeight); x.drawImage(logo, L, 52, w, w * logo.naturalHeight / logo.naturalWidth); }
  else { x.font = '800 38px Sora'; x.fillStyle = '#fff'; x.textBaseline = 'top'; x.fillText(d.b.name, L, 52); }
  x.textBaseline = 'alphabetic'; x.font = '400 21px Inter'; const lines = [''];
  for (const w of (d.b.tagline || '').split(' ')) { const t = (lines[lines.length - 1] + ' ' + w).trim(); if (x.measureText(t).width > 600 && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = t; }
  const tl = lines.slice(0, 2), y = 506 - (tl.length - 1) * 28, subTop = y - 21;
  x.fillStyle = '#c9cdd5'; tl.forEach((t, i) => x.fillText(t, L, y + i * 28));
  const label = d.label || d.b.name; let fs = 64; x.font = `800 ${fs}px Sora`;
  while (x.measureText(label).width > 640 && fs > 36) { fs -= 2; x.font = `800 ${fs}px Sora`; }
  const ly = subTop - 16; x.fillStyle = '#fff'; x.fillText(label, L, ly);
  const ky = ly - fs - 14; x.font = '700 16px Sora'; ls('4px'); x.fillStyle = '#d8b26a'; x.fillText('SOROTAN BRAND', L, ky); const kw = x.measureText('SOROTAN BRAND').width; ls('0px');
  if (d.tag) { x.font = '800 14px Sora'; ls('1.7px'); const tt = d.tag.toUpperCase(), tw = x.measureText(tt).width + 20, tx = L + kw + 12, ty = ky - 17;
    x.fillStyle = /new|baru/i.test(d.tag) ? '#e5484d' : /soon/i.test(d.tag) ? '#2f6bff' : '#d8b26a';
    x.beginPath(); x.roundRect ? x.roundRect(tx, ty, tw, 26, 6) : x.rect(tx, ty, tw, 26); x.fill();
    x.fillStyle = /new|baru|soon/i.test(d.tag) ? '#fff' : '#111'; x.fillText(tt, tx + 10, ty + 19); ls('0px'); }
  x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(L, 537, 592, 1);
  if (cai) { const h = 30; x.drawImage(cai, L, 556, cai.naturalWidth * h / cai.naturalHeight, h); }
  x.font = '700 19px Sora'; x.fillStyle = '#d8b26a'; x.textAlign = 'right'; x.fillText('hub.concerto.id', L + 592, 578); x.textAlign = 'left';
  return new Promise(ok => cv.toBlob(ok, 'image/jpeg', .86));
}
let srShareBusy = Promise.resolve();
function srShare(id) {
  srShareBusy = srShareBusy.then(async () => {
    if ((srOv._share || {})[id] === srHash(id)) return;
    try {
      const blob = await srShareImage(id); if (!blob) return;
      const { error } = await supabase.storage.from('showcase').upload(`dashboard/share-${id}.jpg`, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '60' }); if (error) throw error;
      const next = { ...srOv, _share: { ...(srOv._share || {}), [id]: srHash(id) } }; await srManifest(next); srOv = next;
    } catch (e) { console.warn('Sampul Sorotan gagal dibuat:', id, e); }
  });
  return srShareBusy;
}
