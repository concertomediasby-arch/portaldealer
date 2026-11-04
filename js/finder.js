/* ═══════════ TAHAP 8 A — 🎯 PEMANDU "TEMUKAN SISTEM YANG COCOK" (4 Nov 2026, permintaan pemilik — pratinjau .mockup/tahap8/) ═══════════
   4 pertanyaan (mobil · anggaran SRP · selera suara · langsung lengkap / bertahap) → 3 rekomendasi:
     • rakitan katalog dari FD_SETS (total dihitung dari SRP katalog saat itu — harga ikut berubah otomatis),
     • Paket Audio yang cocok (FD_PAKET; harga paket TIDAK ditampilkan — ada di PDF),
     • rakitan nyata dari Galeri Instalasi (mobil yang sama, atau anggaran > 100 jt).
   Detail: daftar barang + SRP, Tahap 1 / Tahap 2 bila bertahap, cek channel (rkAnalyze), → System Simulator / Kirim ke partner / Bagikan.
   FD_SETS = susunan acuan Claude (4 Nov 2026) — ubah / tambah di sini bila pemilik punya kombinasi andalan. Hanya SRP. */

// Anggaran (SRP sistem, belum termasuk instalasi)
const FD_BUDGETS = [
  { id: 't1', e: '💵', t: 'Di bawah Rp 15 juta', s: 'Upgrade pertama yang terasa', lo: 0, hi: 15e6 },
  { id: 't2', e: '💰', t: 'Rp 15 – 40 juta', s: 'Sistem lengkap kelas menengah', lo: 15e6, hi: 40e6 },
  { id: 't3', e: '💎', t: 'Rp 40 – 100 juta', s: 'High-end, detail maksimal', lo: 40e6, hi: 100e6 },
  { id: 't4', e: '👑', t: 'Di atas Rp 100 juta', s: 'Kelas kompetisi & referensi', lo: 100e6, hi: 1e12 },
];
const FD_TASTES = [
  { id: 'detail', e: '🎻', t: 'Detail & jernih', s: 'Vokal hidup, panggung suara di depan (SQ)' },
  { id: 'bass', e: '💥', t: 'Bass bertenaga', s: 'Dentuman terasa — cocok EDM / hip-hop' },
  { id: 'bal', e: '⚖️', t: 'Seimbang', s: 'Jernih dan bass cukup — untuk semua musik' },
  { id: 'comp', e: '🏆', t: 'Siap kompetisi', s: 'Untuk ikut kelas SQ seperti EMMA' },
];
const FD_STAGES = [
  { id: 'now', e: '🚀', t: 'Langsung lengkap', s: 'Semua dipasang sekaligus' },
  { id: 'stage', e: '🪜', t: 'Bertahap', s: 'Mulai dari inti, tambah komponen nanti' },
];
// items = dipasang sekarang · later = tahap 2 (opsional) · taste = urutan kecocokan (pertama = paling cocok)
const FD_SETS = [
  { id: 'as-italy', t: 'Audio System Italy Lengkap', taste: ['bass', 'bal'], items: ['as-ay65c', 'as-dspas6', 'as-as5001', 'as-as10'],
    why: 'Satu keluarga Audio System: speaker komponen, DSP 6 channel, amplifier mono & subwoofer 10" — bass padat untuk harga terjangkau.' },
  { id: 'steg-entry', t: 'STEG 2-Way + Active Subwoofer', taste: ['bal', 'bass'], items: ['st-sec650c', 'st-dsps6'], later: ['st-sa8w'],
    why: 'Speaker komponen SEC650C dengan DSP amplifier 6 channel; subwoofer aktif SA-8W di bawah jok tanpa mengorbankan bagasi.' },
  { id: 'koln', t: 'Audiocircle Köln Line 2-Way', taste: ['detail', 'bal'], items: ['ac-klc62', 'st-dsps6'], later: ['st-sa8w'],
    why: 'Karakter German Sound yang jernih; DSP-S6 mengatur crossover & time alignment agar panggung suara tepat di depan.' },
  { id: 'hamburg3', t: 'Hamburg Line 3-Way Aktif', taste: ['detail', 'bal'], items: ['ac-hlw6', 'ac-hlm3', 'ac-hlt25', 'st-dsps12', 'st-sa8w'],
    why: 'Tiap speaker punya channel DSP sendiri — vokal jernih & detail, bass rapi dari SA-8W di bawah jok.' },
  { id: 'berlin2', t: 'Berlin Line 2-Way', taste: ['bal', 'detail', 'bass'], items: ['ac-blw6', 'ac-blt26', 'st-dsps6'], later: ['ac-bls10'],
    why: 'Mulai dari speaker depan berkualitas + DSP; subwoofer BL-S10 MKII bisa ditambah nanti tanpa mengganti apa pun (channel DSP masih tersisa).' },
  { id: 'hamburg-bass', t: 'Hamburg 2-Way + Subwoofer SQW-8', taste: ['bass', 'bal'], items: ['ac-hlw6', 'ac-hlt25', 'st-dsps6', 'st-sqw8', 'st-dk5001'],
    why: 'Speaker depan jernih ditambah subwoofer 8" SQW-8 dengan amplifier mono DK500.1 — bass bertenaga dan tetap kencang.' },
  { id: 'berlin3', t: 'Berlin Line 3-Way Aktif', taste: ['detail', 'bal'], items: ['ac-blw6', 'ac-blm3', 'ac-blt26', 'st-dsps12'], later: ['st-sa8w'],
    why: 'Sistem 3-way aktif Berlin Line dengan DSP 12 channel — panggung suara lebar & detail; subwoofer aktif menyusul.' },
  { id: 'hamburg-w8', t: 'Hamburg Line 3-Way + Midbass 8"', taste: ['detail', 'bass', 'bal'], items: ['ac-hlw8', 'ac-hlm3', 'ac-hlt25', 'st-dsps12', 'st-sa8w'],
    why: 'Midbass 8" HL-W8 memberi pukulan bass dari pintu tanpa kehilangan detail; DSP 12 channel untuk 3-way aktif.' },
  { id: 'berlin3-bass', t: 'Berlin 3-Way + Subwoofer BL-S10', taste: ['bass', 'bal', 'detail'], items: ['ac-blw6', 'ac-blm3', 'ac-blt26', 'st-dsps12'], later: ['ac-bls10', 'st-dk5001'],
    why: 'Berlin Line 3-way aktif, lalu subwoofer BL-S10 MKII dengan amplifier mono DK500.1 untuk bass yang dalam.' },
  { id: 'kseries', t: 'STEG K Series 3-Way Kompetisi', taste: ['comp', 'detail'], items: ['st-k1c', 'st-k3c', 'st-k6c', 'st-dsps12', 'st-dk5001', 'st-sqw8'],
    why: 'Dibangun untuk panggung suara terbaik & kelas SQ: K Series 3-way aktif, DSP 12 channel, subwoofer SQW-8 + DK500.1.' },
  { id: 'proline', t: 'Audiocircle Pro Line Referensi', taste: ['comp', 'detail', 'bal'], items: ['ac-prow6c', 'ac-prom3c', 'ac-prot28', 'st-ssdsp12', 'st-sqw6'],
    why: 'Speaker referensi Pro Line yang dipakai mobil-mobil juara EMMA, dengan DSP amplifier SS-DSP12 (12 × 80 W).' },
];
// Paket Audio (harga di PDF, tidak ditampilkan)
const FD_PAKET = {
  'paket-entry': { b: ['t1'], taste: ['bal', 'bass'] },
  'paket-audio-system-italy': { b: ['t1'], taste: ['bass', 'bal'] },
  'paket-entry-audiocircle': { b: ['t1', 't2'], taste: ['detail', 'bal'] },
  'paket-3way-aktif': { b: ['t2'], taste: ['detail', 'bal'] },
  'paket-kompetisi': { b: ['t3'], taste: ['comp', 'detail'] },
};

const FD_KEY = 'cai-finder';
let fd = { step: 0, car: '', carName: '', budget: '', taste: '', stage: '' }, fdRecs = [], fdSel = null, fdCarQ = '';
try { const s = JSON.parse(sessionStorage.getItem(FD_KEY) || 'null'); if (s && typeof s === 'object') fd = Object.assign(fd, s); } catch (e) {}
const fdSave = () => { try { sessionStorage.setItem(FD_KEY, JSON.stringify(fd)); } catch (e) {} };
const fdPrice = ids => ids.reduce((t, id) => t + rkPrice({ pid: id }), 0);
const fdOk = id => !!findProductAny(id).product;

function openFinder(carSlug) {
  if (typeof carSlug === 'string' && carSlug) { const c = typeof carBySlug === 'function' ? carBySlug(carSlug) : null;
    fd = { step: 1, car: carSlug, carName: c ? c.name : '', budget: '', taste: '', stage: '' }; }
  else if (fd.step > 4 || (fd.step === 4 && !fd.stage)) fd.step = 0;
  fdSel = null; fdSave();
  showView('finder'); document.querySelector('.main')?.scrollTo(0, 0);
  renderFinder();
  if (typeof carEnsure === 'function') carEnsure();
}
function fdRestart() { fd = { step: 0, car: '', carName: '', budget: '', taste: '', stage: '' }; fdSel = null; fdSave(); renderFinder(); document.querySelector('.main')?.scrollTo(0, 0); }
function fdBack() { if (fdSel) { fdSel = null; return renderFinder(); } fd.step = Math.max(0, fd.step - 1); fdSave(); renderFinder(); }
function fdPick(k, v, name) {
  fd[k] = v; if (k === 'car') fd.carName = name || '';
  fd.step = { car: 1, budget: 2, taste: 3, stage: 4 }[k]; fdSave();
  if (fd.step === 4) { fdCompute(); if (typeof intLog === 'function') intLog('finder', `${fd.budget}|${fd.taste}|${fd.stage}`, fd.car ? 'mobil' : '', true); }
  renderFinder(); document.querySelector('.main')?.scrollTo(0, 0);
}
function fdCarSearch(v) { fdCarQ = v; renderFinder(true); }

// ── Mesin rekomendasi ──
function fdCompute() {
  const B = FD_BUDGETS.find(b => b.id === fd.budget) || FD_BUDGETS[1], staged = fd.stage === 'stage';
  const inB = (n, tol = 0) => n >= B.lo * (1 - tol) && n <= B.hi * (1 + tol);
  const tasteScore = arr => { const i = (arr || []).indexOf(fd.taste); return i < 0 ? 0 : 6 - i * 2; };
  const recs = [];
  // 1) rakitan katalog
  const sets = FD_SETS.filter(s => s.items.every(fdOk)).map(s => {
    const now = fdPrice(s.items), later = (s.later || []).filter(fdOk), all = now + fdPrice(later);
    const base = all;   // anggaran = sistem lengkap (bertahap hanya membagi waktu pemasangan)
    let sc = tasteScore(s.taste) + (inB(base) ? 10 : inB(base, 0.12) ? 5 : 0) + (staged && later.length ? 3 : 0);
    return { kind: 'set', s, id: s.id, t: s.t, why: s.why, items: s.items, later: staged ? later : [], full: staged ? [] : later, now, all, sc, fits: inB(base, 0.12) };
  }).filter(x => x.fits).sort((a, b) => b.sc - a.sc || Math.abs(a.all - (B.lo + Math.min(B.hi, 2e8)) / 2) - Math.abs(b.all - (B.lo + Math.min(B.hi, 2e8)) / 2));
  if (sets[0]) recs.push({ ...sets[0], tag: 'PALING COCOK', cls: '' });
  const alt = (staged && sets.find(x => x !== sets[0] && x.later.length)) || sets.find(x => x !== sets[0]);
  if (alt) recs.push({ ...alt, tag: staged && alt.later.length ? 'BERTAHAP' : 'ALTERNATIF', cls: 'c' });
  // 2) Paket Audio
  const pk = (typeof PAKET_AUDIO !== 'undefined' ? PAKET_AUDIO : []).filter(p => p.available && FD_PAKET[p.id]?.b.includes(B.id) && (tasteScore(FD_PAKET[p.id].taste) || recs.length < 2))
    .sort((a, b) => tasteScore(FD_PAKET[b.id].taste) - tasteScore(FD_PAKET[a.id].taste))[0];
  if (pk) recs.push({ kind: 'paket', id: pk.id, t: pk.title, why: pk.desc, p: pk, tag: 'PAKET SIAP PASANG', cls: 'b' });
  // 3) Galeri: mobil yang sama, atau anggaran besar → rakitan nyata yang totalnya masuk anggaran
  const gl = typeof glLive === 'function' && glItems ? glLive() : [];
  const car = fd.car && typeof carBySlug === 'function' ? carBySlug(fd.car) : null;
  const glRec = g => { const ids = (g.products || []).filter(fdOk); return { kind: 'gl', id: 'gl-' + g.id, g, t: `Seperti ${glTitle(g)} — ${g.dealer || 'partner resmi'}`,
    why: `Rakitan nyata dari Galeri Instalasi${g.city ? ' · ' + g.city : ''}: ${ids.length} produk CAI.`, items: ids, later: [], full: [], now: fdPrice(ids), all: fdPrice(ids), tag: 'DI GALERI', cls: 'g' }; };
  let gRecs = (car ? car.gl : []).map(glRec).filter(r => r.items.length);
  if (!gRecs.length && B.id === 't4') gRecs = gl.map(glRec).filter(r => r.items.length >= 3 && inB(r.all, 0.1)).sort((a, b) => a.all - b.all);
  const gIn = gRecs.find(r => inB(r.all, 0.12));
  if (gIn && recs.length < 4) recs.push(gIn);
  fdRecs = recs.slice(0, 4);
  fd.glInfo = gRecs.length && !gIn ? gRecs[0].id : '';
  fdGl = gRecs;
}
let fdGl = [];

// ── Tampilan ──
const fdOpt = (k, o, on) => `<button class="fd-opt${on ? ' on' : ''}" onclick="fdPick('${k}','${o.id}')"><span class="e">${o.e}</span><div><b>${o.t}</b><small>${o.s}</small></div></button>`;
function fdAnsChips(edit) {
  const B = FD_BUDGETS.find(x => x.id === fd.budget), T = FD_TASTES.find(x => x.id === fd.taste), S = FD_STAGES.find(x => x.id === fd.stage);
  const c = [fd.carName && `🚙 ${escHtml(fd.carName)}`, B && `${B.e} ${B.t.replace('Rp ', '').replace(' juta', ' jt')}`, T && `${T.e} ${T.t}`, S && `${S.e} ${S.t}`].filter(Boolean);
  return c.length ? `<div class="fd-ans">${c.map(x => `<span>${x}</span>`).join('')}${edit ? '<button onclick="fd.step=0;fdSave();renderFinder()">Ubah</button>' : ''}</div>` : '';
}
function renderFinder(keepFocus) {
  const el = document.getElementById('finder-body'); if (!el) return;
  if (fdSel) return renderFdDetail();
  if (fd.step >= 4 && fd.stage) { if (!fdRecs.length) fdCompute(); return renderFdResults(); }
  const step = fd.step, prog = `<div class="fd-prog">${[0, 1, 2, 3].map(i => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div><div class="fd-stp">LANGKAH ${step + 1} DARI 4</div>`;
  let q = '', body = '';
  if (step === 0) {
    q = 'Mobil Anda apa?';
    const cars = typeof carList === 'function' ? carList() : [], qq = normKey(fdCarQ);
    const list = cars.filter(c => !qq || normKey(c.name).includes(qq)).slice(0, qq ? 12 : 8);
    body = `<input class="fd-in" id="fd-car-q" type="search" placeholder="Ketik merek / model, mis. “Innova”" value="${escHtml(fdCarQ)}" oninput="fdCarSearch(this.value)" autocomplete="off">
      <div class="fd-cars">${list.map(c => `<button class="filter-chip${fd.car === c.slug ? ' active' : ''}" onclick="fdPick('car','${c.slug}',${escHtml(JSON.stringify(c.name))})">${CAR_ICON(c.body)} ${escHtml(c.name)}</button>`).join('')}
      ${qq && !list.length ? `<button class="filter-chip" onclick="fdPick('car','',${escHtml(JSON.stringify(fdCarQ.trim()))})">🚗 Pakai “${escHtml(fdCarQ.trim())}”</button>` : ''}</div>
      <button class="fd-skip" onclick="fdPick('car','','')">Lewati — mobil saya tidak ada / nanti saja ›</button>`;
  } else if (step === 1) { q = 'Berapa anggaran sistem audionya?'; body = FD_BUDGETS.map(o => fdOpt('budget', o, fd.budget === o.id)).join('') + '<div class="fd-note">Total SRP produk — belum termasuk biaya instalasi, custom box & biaya lain.</div>'; }
  else if (step === 2) { q = 'Suara seperti apa yang Anda suka?'; body = FD_TASTES.map(o => fdOpt('taste', o, fd.taste === o.id)).join(''); }
  else { q = 'Dipasang langsung lengkap atau bertahap?'; body = FD_STAGES.map(o => fdOpt('stage', o, fd.stage === o.id)).join(''); }
  el.innerHTML = `<div class="fd-card">${prog}<div class="fd-q">${q}</div>${body}${fdAnsChips(false)}
    ${step ? `<button class="fd-back" onclick="fdBack()">‹ Kembali</button>` : ''}</div>`;
  if (keepFocus) { const i = document.getElementById('fd-car-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}
const fdThumbs = ids => `<div class="fd-thumbs">${ids.slice(0, 6).map(id => { const { brand: b, product: p } = findProductAny(id); return `<span title="${escHtml(b.name + ' ' + p.name)}">${rkThumb(p, b)}</span>`; }).join('')}</div>`;
function renderFdResults() {
  const el = document.getElementById('finder-body');
  const T = FD_TASTES.find(x => x.id === fd.taste);
  const rec = (r, i) => `<button class="fd-rec${i === 0 ? ' best' : ''}" onclick="fdOpen('${r.id}')"><span class="fd-tag ${r.cls}">${r.tag}</span><b class="t">${escHtml(r.t)}</b><span class="why">${escHtml(r.why)}</span>
    ${r.kind === 'paket' ? `<span class="fd-tot">Paket Audio · harga paket di PDF <em>Lihat paket ›</em></span>`
      : `${fdThumbs(r.items.concat(r.later || [], r.full || []))}<span class="fd-tot">${r.later?.length ? `Tahap 1 · ${r.items.length} produk` : `${r.items.length + (r.full?.length || 0)} produk`} · Total SRP <em>${fmtRp(r.later?.length ? r.now : r.all)}</em></span>`}</button>`;
  const gi = fd.glInfo && fdGl.find(r => r.id === fd.glInfo);
  el.innerHTML = `<div class="fd-res-h"><div><div class="fd-q" style="margin:0">Rekomendasi untuk Anda</div>${fdAnsChips(true)}</div></div>
    ${fdRecs.length ? `<div class="fd-recs">${fdRecs.map(rec).join('')}</div>` : `<div class="stock-empty">Belum ada rekomendasi yang pas untuk pilihan ini. Coba ubah anggaran, atau tanyakan langsung ke partner resmi.</div>`}
    ${fd.taste === 'comp' && ['t1', 't2'].includes(fd.budget) ? '<div class="fd-info">🏆 Untuk ikut kelas kompetisi SQ, sistem 3-way aktif K Series / Pro Line (anggaran Rp 40 juta ke atas) lebih disarankan. Rekomendasi di atas tetap bisa jadi tahap awal.</div>' : ''}
    ${gi ? `<button class="fd-info" onclick="fdOpen('${gi.id}')">🚗 <b>Di Galeri:</b> ${escHtml(gi.t.replace(/^Seperti /, ''))} memakai ${escHtml(gi.items.slice(0, 3).map(id => findProductAny(id).product.name).join(', '))}${gi.items.length > 3 ? ' …' : ''} (Total SRP ${fmtRp(gi.all)}). <span>Lihat ›</span></button>` : ''}
    ${fd.car && typeof carBySlug === 'function' && carBySlug(fd.car) ? `<button class="fd-info" onclick="openCar('${fd.car}')">🚙 Lihat contoh pemasangan & partner yang pernah mengerjakan ${escHtml(fd.carName)} <span>›</span></button>` : ''}
    <div class="fd-acts"><button class="car-btn o" onclick="fdRestart()">↺ Mulai lagi</button><button class="car-btn o" onclick="openRakit()">🔧 Rakit sendiri di System Simulator</button></div>
    <div class="fd-note">${T ? 'Rekomendasi disusun dari katalog resmi CAI, Paket Audio & Galeri Instalasi. ' : ''}Harga = SRP. ${escHtml(RK_EXCL)} Konsultasikan detail pemasangan dengan partner resmi.</div>`;
}
function fdOpen(id) {
  const r = fdRecs.find(x => x.id === id) || fdGl.find(x => x.id === id); if (!r) return;
  if (r.kind === 'paket') return paketOpenLinked(r.id);
  fdSel = r; renderFinder(); document.querySelector('.main')?.scrollTo(0, 0);
}
function fdChannels(ids) { const save = rk.items; rk.items = ids.map(pid => ({ pid, qty: 1 })); const a = rkAnalyze(); rk.items = save; return a; }
function renderFdDetail() {
  const el = document.getElementById('finder-body'), r = fdSel;
  const row = id => { const { brand: b, product: p } = findProductAny(id); const pr = rkPrice({ pid: id });
    return `<button class="fd-li" onclick="showProduct('${b.id}','${p.id}')"><span class="th">${rkThumb(p, b)}</span><div><b>${escHtml(b.name)} ${escHtml(p.name)}</b><small>${escHtml(p.category)}${p.soon ? ' · COMING SOON' : ''}</small></div><em>${pr ? fmtRp(pr) + (p.priceUnit ? ' / ' + escHtml(p.priceUnit) : '') : 'Hubungi sales'}</em></button>`; };
  const now = r.items, later = r.later || [], full = now.concat(r.full || []);
  const an = fdChannels(later.length ? now : full), an2 = later.length ? fdChannels(now.concat(later)) : null;
  const note = a => a.notes.filter(n => n.t !== 'info' || /DSP/.test(n.m)).map(n => `<div class="fd-ch ${n.t}">${n.t === 'ok' ? '✅' : n.t === 'warn' ? '⚠️' : 'ℹ️'} ${escHtml(n.m)}</div>`).join('');
  el.innerHTML = `<button class="car-back" onclick="fdBack()">‹ Rekomendasi</button>
    <div class="fd-card"><span class="fd-tag ${r.cls}">${r.tag}</span><div class="fd-q" style="margin:6px 0 2px">${escHtml(r.t)}</div>${fdAnsChips(false)}<div class="fd-why">${escHtml(r.why)}</div>
    ${later.length ? `<div class="fd-sub">Tahap 1 — dipasang sekarang</div>` : ''}${(later.length ? now : full).map(row).join('')}
    <div class="fd-sum"><span>${later.length ? 'Total SRP Tahap 1' : 'Total SRP'}</span><b>${fmtRp(later.length ? r.now : r.all)}</b></div>
    ${later.length ? `<div class="fd-sub">Tahap 2 — bisa ditambah nanti</div>${later.map(row).join('')}<div class="fd-sum sm"><span>Total SRP bila lengkap</span><b>${fmtRp(r.all)}</b></div>` : ''}
    <div class="fd-ex">${escHtml(RK_EXCL)}</div>
    ${note(an)}${an2 && an2.have < an2.need ? `<div class="fd-ch warn">⚠️ Saat Tahap 2 dipasang, perlu tambahan channel penguat — tanyakan partner.</div>` : ''}
    ${r.g ? `<button class="fd-info" onclick="openGlDetail('${r.g.id}')">📷 Lihat foto & video instalasinya di Galeri <span>›</span></button>` : ''}
    <button class="car-btn g" onclick="fdToRakit()">🔧 Buka di System Simulator</button>
    <div class="fd-acts two"><button class="car-btn w" onclick="fdToPartner()">💬 Kirim ke partner resmi</button><button class="car-btn o" onclick="fdShare()">${SHARE_ICON} Bagikan</button></div></div>`;
}
const fdIds = () => fdSel ? fdSel.items.concat(fdSel.later?.length ? [] : (fdSel.full || [])) : [];
function fdLoadRk(confirmReplace) {
  rkLoad();
  if (confirmReplace && rk.items.length && !confirm('Ganti rakitan yang ada di System Simulator dengan rekomendasi ini?')) return false;
  rk.items = fdIds().map(pid => { const p = findProductAny(pid).product; const v = p.priceList ? Object.keys(p.priceList)[0] : undefined; return { pid, qty: 1, ...(v ? { v } : {}) }; });
  if (fd.carName) rk.car = fd.carName;
  rkSave(); return true;
}
const fdGo = k => { if (typeof intLog === 'function') intLog('fdgo', k, '', true); };   // Laporan Minat: hasil Temukan Sistem dipakai
function fdToRakit() { if (fdLoadRk(true)) { fdGo('rakit'); openRakit(); showToast('✓ Rekomendasi dimuat — bisa Anda ubah'); } }
function fdToPartner() { if (fdLoadRk(true)) { fdGo('partner'); openRakit(); setTimeout(() => rkSendOpen(), 120); } }
function fdShare() {
  if (!fdSel) return; fdGo('share');
  const ids = fdIds(), enc = ids.map(id => id + '*1').join('~'), link = `${location.origin}/rakitan/?rk=${encodeURIComponent(enc)}`;
  const t = `🎯 Rekomendasi sistem audio dari CAI Hub${fd.carName ? ' untuk ' + fd.carName : ''}: ${fdSel.t}\n\n` +
    ids.map((id, i) => { const { brand: b, product: p } = findProductAny(id); return `${i + 1}. ${b.name} ${p.name}`; }).join('\n') +
    `\n\nTotal SRP ${fmtRp(fdPrice(ids))} (${RK_EXCL.replace(/\.$/, '')})\n${link}`;
  window.open('https://wa.me/?text=' + waText(t), '_blank', 'noopener');
}
