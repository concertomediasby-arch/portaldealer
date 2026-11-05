/* ══════════════════════════════════════════
   ⏰ JADWAL TAYANG — khusus Editor (5 Nov 2026, permintaan pemilik — pratinjau .mockup/jadwal/ disetujui)
   Satu halaman untuk semua konten terjadwal: Concerto Way (publish_at), Academy (at di items.json), Galeri (publish_at),
   Panduan Partner (tabel guide_schedule) & Pengumuman produk (tabel product_push) + Draf (Concerto Way, News, Galeri, Acara).
   Tanpa SQL baru — memakai data & fungsi jadwal tiap menu (ubah jadwal = form/prompt menu itu).
   + 🏆 Pengingat: mobil Hall of Fame yang belum masuk Galeri Instalasi (permintaan pemilik 5 Nov 2026).
══════════════════════════════════════════ */
const JD_KINDS = {
  cway: { ic: '☕', t: 'Concerto Way', c: '#d9b46a' },
  acad: { ic: '🎓', t: 'Academy', c: '#b48ce0' },
  gallery: { ic: '🚗', t: 'Galeri', c: '#e2685f' },
  guide: { ic: '📘', t: 'Panduan', c: '#6fd3e6' },
  product: { ic: '🆕', t: 'Produk', c: '#5fc48c' },
};
const JD_WARN_DAYS = 5;   // antrian Concerto Way tinggal ≤ 5 hari → peringatan merah
let jdKind = 'all', jdDay = null, jdCal = null, jdProd = [], jdBusy = false, jdTimer = null;

function openJadwal(kind) {
  if (!requireLogin(() => openJadwal(kind))) return;
  if (!isEditor()) { showToast('Jadwal Tayang khusus Editor.'); showView('dashboard'); return; }
  if (kind) jdKind = kind;
  showView('jadwal');
  jdLoad();
}
async function jdLoad() {
  jdRender();
  if (typeof supabase === 'undefined' || !supabase) { setTimeout(jdLoad, 800); return; }
  jdBusy = true; jdRender();
  const tasks = [];
  if (typeof loadCway === 'function') tasks.push(Promise.resolve(loadCway(true)).catch(() => {}));
  if (typeof loadGaleri === 'function') tasks.push(Promise.resolve(loadGaleri(true)).catch(() => {}));
  if (typeof loadGuideSchedule === 'function') tasks.push(Promise.resolve(loadGuideSchedule()).catch(() => {}));
  if (typeof loadAcadExtra === 'function') tasks.push(Promise.resolve(loadAcadExtra()).catch(() => {}));
  if (typeof loadNews === 'function') tasks.push(Promise.resolve(loadNews(true)).catch(() => {}));
  if (typeof loadEvents === 'function') tasks.push(Promise.resolve(loadEvents(true)).catch(() => {}));
  tasks.push((async () => {
    const { data, error } = await supabase.from('product_push').select('id, product_id, kind, title, publish_at').is('sent_at', null).order('publish_at');
    jdProd = error ? [] : (data || []);
  })().catch(() => { jdProd = []; }));
  await Promise.all(tasks);
  jdBusy = false; jdRender();
  // muat ulang tepat setelah jadwal terdekat lewat (kartu pindah dari daftar)
  clearTimeout(jdTimer);
  const next = jdItems().map(x => x.at).filter(t => t > Date.now()).sort((a, b) => a - b)[0];
  if (next) jdTimer = setTimeout(() => { if (document.getElementById('view-jadwal')?.classList.contains('active')) jdLoad(); }, Math.min(next - Date.now() + 90000, 2 ** 31 - 1));
}
function jdAuthChanged() { if (!isEditor() && document.getElementById('view-jadwal')?.classList.contains('active')) showView('dashboard'); }

// Semua konten terjadwal → { kind, id, at (ms), title, sub, open, edit, note, err }
function jdItems() {
  const out = [], q = s => String(s).replace(/'/g, "\\'");
  if (typeof cwItems !== 'undefined') for (const x of (cwItems || []).filter(cwSched))
    out.push({ kind: 'cway', id: x.id, at: Date.parse(x.publish_at), title: x.title, sub: x.day != null ? `Day ${x.day}` + (x.series ? ' · ' + x.series : '') : (x.series || ''),
      open: `openCway('${x.id}')`, edit: `openCwForm('${x.id}')`, note: '📲 Notifikasi ke partner saat tayang' });
  if (typeof acadScheduled === 'function') for (const a of acadScheduled())
    out.push({ kind: 'acad', id: a.no, at: a.at ? Date.parse(a.at) : Date.parse(a.date + 'T00:00:00+07:00'), title: a.title, sub: `${a.series || 'Fundamental'} #${a.no}`,
      open: `openAcademyItem(${a.no})`, edit: (typeof acadExtra !== 'undefined' && acadExtra.some(x => x.no === a.no)) ? `acadReschedule(${a.no})` : '', note: '🔔 Notifikasi 🎓 saat tayang' });
  if (typeof glItems !== 'undefined') for (const it of (glItems || []).filter(glSched))
    out.push({ kind: 'gallery', id: it.id, at: Date.parse(it.publish_at), title: [it.car_make, it.car_model, it.car_year].filter(Boolean).join(' ') || 'Instalasi', sub: [it.dealer, it.city].filter(Boolean).join(' · ') + (it.hof_id ? ' · 🏆 mobil juara' : ''),
      open: `jdOpenGl('${it.id}')`, edit: `openGlForm('${it.id}')`, note: it.notify !== false ? '🔔 Notifikasi 🚗 saat tayang' : '🔕 Tanpa notifikasi' });
  if (typeof guideSched !== 'undefined') for (const r of (guideSched || []))
    out.push({ kind: 'guide', id: r.id, at: Date.parse(r.publish_at), title: r.title || guideTitleFromName(r.dest.split('/').pop()),
      sub: (DEALER_GUIDES.find(g => g.folder === r.folder)?.title || r.folder || 'Panduan Partner') + ' · PDF', open: `openGuideReader('${q(r.src)}')`, edit: `guideReschedule('${r.id}')`,
      note: '🔔 Notifikasi 📘 ke partner saat tayang', err: r.error || '' });
  for (const r of jdProd) {
    const f = findProductAny(r.product_id);
    out.push({ kind: 'product', id: r.id, at: Date.parse(r.publish_at), title: r.title, sub: (r.kind === 'ready' ? '✅ Kini tersedia' : '🆕 Produk baru') + (f.product ? ` · ${f.brand.name} ${f.product.name}` : ''),
      open: f.product ? `showProduct('${f.brand.id}','${f.product.id}')` : '', edit: f.product ? `jdProdEdit('${f.brand.id}','${f.product.id}')` : '', note: '🔔 Notifikasi 🆕 ke semua pemilih' });
  }
  return out.filter(x => !isNaN(x.at)).sort((a, b) => a.at - b.at);
}
// Draf: belum dijadwalkan / belum ditampilkan
function jdDrafts() {
  const out = [];
  if (typeof cwItems !== 'undefined') for (const x of (cwItems || []).filter(x => !x.published))
    out.push({ kind: 'cway', title: x.title, sub: x.day != null ? `Concerto Way · Day ${x.day}` : 'Concerto Way', open: `openCway('${x.id}')`, edit: `openCwForm('${x.id}')` });
  if (typeof nwItems !== 'undefined') for (const x of (nwItems || []).filter(x => !x.published))
    out.push({ kind: 'news', title: x.title, sub: 'News' + (x.category ? ' · ' + x.category : ''), open: `openNews('${x.id}')`, edit: `openNwForm('${x.id}')` });
  if (typeof glItems !== 'undefined') for (const it of (glItems || []).filter(it => !it.published && !glPending(it)))
    out.push({ kind: 'gallery', title: [it.car_make, it.car_model, it.car_year].filter(Boolean).join(' ') || 'Instalasi', sub: 'Galeri' + (it.dealer ? ' · ' + it.dealer : ''), open: `jdOpenGl('${it.id}')`, edit: `openGlForm('${it.id}')` });
  if (typeof glItems !== 'undefined') { const n = (glItems || []).filter(glPending).length;
    if (n) out.push({ kind: 'gallery', title: `${n} kiriman foto/video menunggu persetujuan`, sub: 'Galeri · dari partner / Admin staff', open: 'openGaleri()', edit: '' }); }
  if (typeof evItems !== 'undefined') for (const e of (evItems || []).filter(e => !e.published))
    out.push({ kind: 'event', title: e.title, sub: 'Kalender Acara', open: `openEvents('${e.id}')`, edit: `openEvForm('${e.id}')` });
  return out;
}
async function jdOpenGl(id) { await openGaleri(); openGlDetail(id); }
function jdProdEdit(bid, pid) { showProduct(bid, pid); setTimeout(() => { if (typeof openProdAnn === 'function') openProdAnn(); }, 300); }

// 🏆 Mobil Hall of Fame yang belum ada di Galeri Instalasi (satu mobil = peserta + mobil + partner sama)
function jdHofMissing() {
  if (typeof HALL_OF_FAME === 'undefined' || !HALL_OF_FAME.length || typeof glItems === 'undefined' || !glItems) return null;
  const cars = new Map();
  for (const e of HALL_OF_FAME) {
    const k = hofCarKey(e), c = cars.get(k);
    if (!c) cars.set(k, { e, wins: 1, best: e.place || 9 }); else { c.wins++; if ((e.place || 9) < c.best) { c.best = e.place || 9; c.e = e; } }
  }
  const linked = new Set();
  for (const it of glItems) if (it.hof_id) { const h = HALL_OF_FAME.find(x => x.id === it.hof_id); if (h) linked.add(hofCarKey(h)); }
  return [...cars.entries()].filter(([k]) => !linked.has(k)).map(([, c]) => c).sort((a, b) => a.best - b.best || b.wins - a.wins);
}

const jdDayKey = ms => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
const jdDayLbl = key => new Date(key + 'T00:00:00Z').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const jdTime = ms => new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace(':', '.');
function jdLeft(ms) {
  const m = Math.round((ms - Date.now()) / 60e3);
  if (m <= 0) return 'sedang diproses…';
  if (m < 60) return `${m} menit lagi`;
  if (m < 1440) return `${Math.floor(m / 60)} jam ${m % 60} mnt lagi`;
  return `${Math.round(m / 1440)} hari lagi`;
}
function jdRemindTxt(kind) {
  if (typeof pushRemind === 'undefined') return '';
  const r = { all: [5], ...(pushRemind || {}) }, L = (r[kind] || r.all || [5]);
  return L.length ? '🔔 Pengingat ' + L.map(m => m >= 1440 ? '1 hari' : m >= 60 ? (m / 60) + ' jam' : m + ' menit').join(' & ') : '';
}
function jdSetKind(k) { jdKind = k; jdDay = null; jdRender(); }
function jdPickDay(k) { jdDay = jdDay === k ? null : k; jdRender(); }
function jdCalGo(d) { const [y, m] = (jdCal || todayWIB().slice(0, 7)).split('-').map(Number); jdCal = new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7); jdRender(); }

function jdCalHtml(items) {
  const ym = jdCal || todayWIB().slice(0, 7), [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), start = (first.getUTCDay() + 6) % 7, nd = new Date(Date.UTC(y, m, 0)).getUTCDate(), today = todayWIB();
  const by = {}; for (const x of items) { const k = jdDayKey(x.at); (by[k] = by[k] || new Set()).add(x.kind); }
  let cells = '';
  for (let i = 0; i < start; i++) cells += '<span class="x"></span>';
  for (let d = 1; d <= nd; d++) {
    const k = `${ym}-${String(d).padStart(2, '0')}`, ks = by[k];
    cells += `<button class="${ks ? 'has' : ''}${k === today ? ' tod' : ''}${jdDay === k ? ' on' : ''}" ${ks ? `onclick="jdPickDay('${k}')"` : 'disabled'}>${d}${ks ? `<i>${[...ks].map(t => `<em style="background:${JD_KINDS[t].c}"></em>`).join('')}</i>` : ''}</button>`;
  }
  return `<div class="jd-c"><div class="jd-calh"><button onclick="jdCalGo(-1)" aria-label="Bulan sebelumnya">‹</button><h3>${new Date(first).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3><button onclick="jdCalGo(1)" aria-label="Bulan berikutnya">›</button></div>
    <div class="jd-cal">${['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(h => `<span class="h">${h}</span>`).join('')}${cells}</div>
    <div class="jd-lg">${Object.values(JD_KINDS).map(k => `<span><em style="background:${k.c}"></em>${k.t}</span>`).join('')}</div></div>`;
}

function jdRender() {
  const box = document.getElementById('jadwal-body'); if (!box) return;
  if (!isEditor()) { box.innerHTML = '<div class="stock-empty">Jadwal Tayang khusus Editor.</div>'; return; }
  const all = jdItems(), drafts = jdDrafts(), cnt = k => all.filter(x => x.kind === k).length;
  let list = jdKind === 'draft' ? [] : all.filter(x => jdKind === 'all' || x.kind === jdKind);
  if (jdDay) list = list.filter(x => jdDayKey(x.at) === jdDay);
  // peringatan: antrian Concerto Way hampir habis · Panduan gagal dipindah
  const warns = [], cw = all.filter(x => x.kind === 'cway'), lastCw = cw[cw.length - 1];
  const daysLeft = lastCw ? Math.ceil((lastCw.at - Date.now()) / 864e5) : 0;
  if (typeof cwItems !== 'undefined' && cwItems && (!lastCw || daysLeft <= JD_WARN_DAYS)) {
    const nextDay = Math.max(0, ...(cwItems || []).map(x => x.day || 0)) + 1;
    warns.push(`<div class="jd-warn"><span>⚠️</span><div>${lastCw ? `<b>Antrian Concerto Way habis ${escHtml(jdDayLbl(jdDayKey(lastCw.at)))}</b> (${escHtml(lastCw.sub.split(' · ')[0])}) — tinggal ${daysLeft} hari.` : '<b>Tidak ada Concerto Way terjadwal.</b>'} Tambahkan materi agar partner tetap mendapat Concerto Way setiap hari.</div><button class="gt-btn" onclick="openCway();setTimeout(()=>openCwForm(),300)">＋ Tambah Day ${nextDay}</button></div>`);
  }
  for (const x of all.filter(x => x.err)) warns.push(`<div class="jd-warn"><span>⚠️</span><div><b>Panduan “${escHtml(x.title)}” gagal ditayangkan:</b> ${escHtml(x.err)}</div><button class="gt-btn" onclick="${x.edit}">✏️ Jadwal ulang</button></div>`);
  // daftar per hari
  const groups = []; for (const x of list) { const k = jdDayKey(x.at); let g = groups[groups.length - 1]; if (!g || g.k !== k) groups.push(g = { k, items: [] }); g.items.push(x); }
  const today = todayWIB(), tom = jdDayKey(Date.now() + 864e5);
  const card = x => { const K = JD_KINDS[x.kind]; return `<div class="jd-it" style="--jc:${K.c}"><div class="tm">${jdTime(x.at)}<small>WIB</small></div><span class="bar"></span>
      <div class="bd"><div class="mn">${K.ic} ${K.t}${x.sub ? ' · ' + escHtml(x.sub) : ''}</div><div class="tt">${escHtml(x.title)}</div>
        <div class="meta"><span>⏳ ${jdLeft(x.at)}</span>${jdRemindTxt(x.kind) ? `<span>${jdRemindTxt(x.kind)}</span>` : ''}${x.note ? `<span>${x.note}</span>` : ''}</div></div>
      <div class="acts">${x.open ? `<button class="gt-btn ghost" onclick="${x.open}">👁 Lihat</button>` : ''}${x.edit ? `<button class="gt-btn ghost" onclick="${x.edit}">✏️ Jadwal</button>` : ''}</div></div>`; };
  const listHtml = jdKind === 'draft'
    ? (drafts.length ? `<div class="jd-drafts">${drafts.map(d => `<div class="jd-it dr"><div class="tm">📝<small>DRAF</small></div><span class="bar"></span><div class="bd"><div class="mn">${escHtml(d.sub)}</div><div class="tt">${escHtml(d.title)}</div></div>
        <div class="acts">${d.open ? `<button class="gt-btn ghost" onclick="${d.open}">👁 Lihat</button>` : ''}${d.edit ? `<button class="gt-btn ghost" onclick="${d.edit}">✏️ Ubah</button>` : ''}</div></div>`).join('')}</div>` : '<div class="stock-empty">Tidak ada draf.</div>')
    : groups.length ? groups.map(g => `<div class="jd-day"><b>${escHtml(jdDayLbl(g.k))}</b>${g.k === today ? '<span class="tod">HARI INI</span>' : g.k === tom ? '<span class="tod">BESOK</span>' : ''}<small>${g.items.length} postingan</small></div>${g.items.map(card).join('')}`).join('')
    : `<div class="stock-empty">${jdBusy ? '⏳ Memuat jadwal…' : jdDay ? 'Tidak ada postingan di tanggal ini.' : 'Belum ada postingan terjadwal' + (jdKind !== 'all' ? ' di menu ini' : '') + '. Jadwalkan dari menu masing-masing (pilih <b>⏰ Jadwalkan</b> di form).'}</div>`;
  // stok antrian per menu
  const stock = Object.entries(JD_KINDS).map(([k, K]) => { const xs = all.filter(x => x.kind === k), last = xs[xs.length - 1];
    return `<div><span>${K.ic}</span><span>${K.t}</span><em class="${last ? (k === 'cway' && daysLeft <= JD_WARN_DAYS ? 'bad' : 'ok') : (k === 'cway' ? 'bad' : '')}">${last ? `s/d ${escHtml(new Date(last.at).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }))} · ${xs.length}` : 'kosong'}</em></div>`; }).join('');
  // pengingat Editor
  const rm = typeof pushRemind !== 'undefined' ? { all: [5], live: false, ...(pushRemind || {}) } : null;
  const lt = L => (L || []).map(m => m >= 1440 ? '1 hari' : m >= 60 ? (m / 60) + ' jam' : m + ' menit').join(' & ') || '—';
  const rmHtml = rm ? `<p>Semua menu: <b>${lt(rm.all)}</b> sebelum tayang${rm.live ? ' · ✅ kabar saat sudah tayang' : ''}</p>${Object.keys(JD_KINDS).filter(k => rm[k]).map(k => `<p>${JD_KINDS[k].ic} ${JD_KINDS[k].t}: <b>${lt(rm[k])}</b></p>`).join('')}` : '<p>Pengingat tayang belum aktif di perangkat ini.</p>';
  // 🏆 mobil Hall of Fame belum di Galeri
  const miss = jdHofMissing();
  const hof = miss == null ? '' : `<div class="jd-c jd-hof"><h3>🏆 Hall of Fame → Galeri</h3>${miss.length
    ? `<p class="jd-mini">${miss.length} mobil juara belum punya foto/video di Galeri Instalasi:</p><div class="jd-hl">${miss.slice(0, 6).map(c => `<button onclick="openGlForHof('${c.e.id}')"><span>${c.best === 1 ? '🥇' : c.best === 2 ? '🥈' : c.best === 3 ? '🥉' : '🏅'}</span><span><b>${escHtml(c.e.car || '—')}</b><small>${escHtml([c.e.name, c.e.dealer].filter(Boolean).join(' · '))}${c.wins > 1 ? ` · ${c.wins} prestasi` : ''}</small></span><em>＋ Foto</em></button>`).join('')}</div>${miss.length > 6 && HOF_ON ? `<button class="gt-btn ghost" onclick="openHallOfFame()">Lihat semua di Hall of Fame (${miss.length}) ›</button>` : ''}`
    : '<p class="jd-mini ok">✅ Semua mobil Hall of Fame sudah ada di Galeri Instalasi.</p>'}</div>`;
  const chip = (k, lbl, n) => `<button class="filter-chip${jdKind === k ? ' active' : ''}" onclick="jdSetKind('${k}')">${lbl} <b>${n}</b></button>`;
  box.innerHTML = `<div class="jd-top"><div><div class="jd-k">⏰ Jadwal tayang · khusus Editor</div><h1 class="jd-h">Postingan <em>terjadwal</em></h1>
      <p class="jd-sub">Semua konten yang menunggu tayang dari Concerto Way, Academy, Galeri, Panduan Partner &amp; Pengumuman produk.</p></div>
      <div class="jd-acts"><button class="gt-btn ghost" onclick="jdLoad()">${jdBusy ? '⏳' : '↻'} Muat ulang</button></div></div>
    <div class="jd-chips">${chip('all', 'Semua', all.length)}${Object.entries(JD_KINDS).map(([k, K]) => chip(k, K.ic + ' ' + K.t, cnt(k))).join('')}${chip('draft', '📝 Draf', drafts.length)}</div>
    <div class="jd-lay"><div class="jd-main">${warns.join('')}${jdDay ? `<div class="jd-filter">Tanggal <b>${escHtml(jdDayLbl(jdDay))}</b> <button onclick="jdPickDay('${jdDay}')">✕ tampilkan semua</button></div>` : ''}${listHtml}</div>
      <div class="jd-side">${jdCalHtml(all)}${hof}
        <div class="jd-c"><h3>📦 Stok antrian</h3><div class="jd-q">${stock}</div></div>
        <div class="jd-c jd-rm"><h3>🔔 Pengingat Anda</h3>${rmHtml}<button class="gt-btn ghost" onclick="openSettings()">⚙️ Ubah di Setting</button></div>
      </div></div>`;
}
