/* ══════════════════════════════════════════════════════════════════
   🏆 LANDING EMMA — tampilan khusus halaman pembuka saat pengumuman juara EMMA
   (20 Nov 2026, permintaan pemilik — pratinjau .mockup/landing-emma/ disetujui).
   Data: Storage publik showcase/landing/emma.json (diisi Editor di CAI Hub Studio #emma), salinan terakhir di
   localStorage cai-emma agar langsung tampil tanpa berkedip. on=false → landing biasa.
   Sebelum waktu pengumuman (at) = hitung mundur; sesudahnya (dan ada data juara) = kartu juara yang bisa digeser
   (coverflow 3D). Ketuk kartu tengah → jendela: Perangkat CAI · Wiring · Alur sinyal.
   Hanya SRP; data juara WAJIB asli (diisi Editor); plat nomor di foto/wiring harus disamarkan.
   ══════════════════════════════════════════════════════════════════ */
const EMMA_FILE = 'landing/emma.json', EMMA_KEY = 'cai-emma', EMMA_MD = { 1: '🥇 JUARA 1', 2: '🥈 JUARA 2', 3: '🥉 JUARA 3', 0: '★ PENGHARGAAN' };
let emmaLay = null, emma = null, emmaPos = 0, emmaAuto = null, emmaTick = null, emmaDrag = null, emmaMoved = false, emmaLastK = -1, emmaMode = '';

const emmaUrl = p => p ? (typeof dashPublicUrl === 'function' ? dashPublicUrl(p) : `${SUPA_URL}/storage/v1/object/public/showcase/${p}`) : '';
const emmaEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const emmaGold = s => emmaEsc(s).replace(/\*([^*]+)\*/g, '<span class="lx-gold">$1</span>');
// urutan: Juara 1 semua kelas → Juara 2 → Juara 3 → penghargaan khusus (pilihan pemilik), urutan isian dipertahankan
function emmaWinners() {
  const w = (emma?.winners || []).filter(x => x && (x.name || x.car || x.cls));
  const r = p => p === 1 ? 1 : p === 2 ? 2 : p === 3 ? 3 : 4;
  return w.map((x, i) => ({ x, i })).sort((a, b) => r(+a.x.place) - r(+b.x.place) || a.i - b.i).map(o => o.x);
}
function emmaState() {
  if (!emma?.on) return '';
  if (emma.reveal === 'pre') return 'pre';
  if (emma.reveal === 'post') return emmaWinners().length ? 'post' : 'pre';
  const at = Date.parse(emma.at || '');
  return (!at || Date.now() >= at) && emmaWinners().length ? 'post' : 'pre';
}

function emmaInit() {
  if (typeof QA_SCREEN_MODE !== 'undefined' && QA_SCREEN_MODE) return;
  // pratinjau dari Studio (/?emma=preview&s=pre|post): pakai draf di localStorage cai-emma-draft, tanpa mengambil data tayang
  const q = new URLSearchParams(location.search);
  if (q.get('emma') === 'preview') {
    try { emma = JSON.parse(localStorage.getItem('cai-emma-draft') || 'null'); } catch (e) {}
    if (emma) { emma = { ...emma, on: true, reveal: q.get('s') === 'post' ? 'post' : q.get('s') === 'pre' ? 'pre' : emma.reveal }; emmaApply(true); }
    return;
  }
  try { const c = JSON.parse(localStorage.getItem(EMMA_KEY) || 'null'); if (c) { emma = c; emmaApply(); } } catch (e) {}
  fetch(`${SUPA_URL}/storage/v1/object/public/showcase/${EMMA_FILE}?t=${Date.now()}`, { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null).then(j => {
      const s = JSON.stringify(j || null);
      try { if (j) localStorage.setItem(EMMA_KEY, s); else localStorage.removeItem(EMMA_KEY); } catch (e) {}
      if (s !== JSON.stringify(emma)) { emma = j; emmaApply(true); }
    }).catch(() => {});
}

function emmaApply(force) {
  const L = document.getElementById('landing'); if (!L) return;
  const st = emmaState();
  if (!st) { L.classList.remove('emma'); document.getElementById('lx')?.remove(); emmaStop(); emmaLabel(false); emmaMode = ''; return; }
  if (st === emmaMode && !force && document.getElementById('lx')) return;
  emmaMode = st; emmaStop(); emmaLastK = -1;
  L.classList.add('emma');
  let box = document.getElementById('lx');
  if (!box) { box = document.createElement('div'); box.id = 'lx'; box.className = 'lx'; L.querySelector('.landing-hero').after(box);
    const bg = document.createElement('div'); bg.className = 'lx-bg'; bg.id = 'lx-bg'; L.prepend(bg); }
  document.getElementById('lx-bg').innerHTML = '<i class="b a"></i><i class="b b2"></i><i class="b c"></i><i class="fl"></i>'
    + '<svg class="hx" viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,2 92,26 92,74 50,98 8,74 8,26"/><polygon points="50,10 85,30 85,70 50,90 15,70 15,30"/></svg>'
    + (st === 'post' ? '<div class="cf">' + Array.from({ length: 30 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-duration:${6 + (i * 7) % 8}s;animation-delay:-${(i * 3) % 10}s;background:${['#e2c27e', '#fff3cf', '#c9a25c'][i % 3]}"></i>`).join('') + '</div>' : '');
  box.innerHTML = st === 'pre' ? emmaPreHtml() : emmaPostHtml();
  emmaLabel(true);
  if (st === 'pre') { emmaCount(); emmaTick = setInterval(emmaCount, 1000); }
  else emmaWire();
}
function emmaLabel(on) {
  const l = document.querySelector('#landing .landing-brands-label'); if (!l) return;
  if (!l.dataset.def) l.dataset.def = l.textContent;
  l.textContent = on ? 'Dibangun dengan brand resmi CAI' : l.dataset.def;
}
function emmaStop() { clearInterval(emmaAuto); clearInterval(emmaTick); emmaAuto = emmaTick = null; }
function emmaCo() {
  const t = emma.tagline ?? 'Bersama EMMA Indonesia';
  return `<div class="lx-co"><img src="assets/brands/emma-indonesia.webp" alt="EMMA Indonesia">${t ? `<span class="x"></span>${emmaEsc(t)}` : ''}</div>`;
}
function emmaTitle(a, def) { const t = Array.isArray(a) && a.some(Boolean) ? a : def; return `<h1 class="lx-h">${emmaGold(t[0] || '')}<br>${emmaGold(t[1] || '')}</h1>`; }
function emmaWhen() {
  const at = Date.parse(emma.at || ''); if (!at) return '';
  const d = new Date(at), f = o => d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', ...o });
  return `${f({ weekday: 'long' })}, ${f({ day: 'numeric', month: 'short', year: 'numeric' })} · pukul ${f({ hour: '2-digit', minute: '2-digit' }).replace(':', '.')} WIB`;
}
function emmaPreHtml() {
  const ev = emma.event || 'EMMA 2026', at = Date.parse(emma.at || '');
  return `${emmaCo()}${emmaTitle(emma.preTitle, ['Malam Juara', `*${ev}*`])}
  <p class="lx-sub">${emmaEsc(emma.preSub || 'Siapa yang membawa pulang gelar champion tahun ini? Para juara dan partner pemasangnya diumumkan di sini.')}</p>
  ${at ? `<div class="lx-cd" id="lx-cd"><div><b>00</b><span>Hari</span></div><div><b>00</b><span>Jam</span></div><div><b>00</b><span>Menit</span></div><div><b>00</b><span>Detik</span></div></div>` : ''}
  <div class="lx-when">${emmaEsc([emmaWhen(), emma.place].filter(Boolean).join(' · '))}</div>
  <div class="lx-teaser"><div>?<small>Juara 2</small></div><div class="mid">?<small>Champion</small></div><div>?<small>Juara 3</small></div></div>
  <div class="lx-bt">${at ? '<button class="lx-b1" onclick="emmaIcs()">🔔 Ingatkan saya</button>' : ''}<button class="lx-b2" onclick="enterPortal()">Masuk Portal ▶</button></div>`;
}
function emmaCount() {
  const el = document.getElementById('lx-cd'), at = Date.parse(emma?.at || ''); if (!el || !at) return;
  let x = Math.max(0, at - Date.now()) / 1000; const f = n => String(Math.floor(n)).padStart(2, '0');
  const v = [f(x / 86400), f(x % 86400 / 3600), f(x % 3600 / 60), f(x % 60)];
  [...el.querySelectorAll('b')].forEach((b, i) => { if (b.textContent !== v[i]) b.textContent = v[i]; });
  if (x <= 0 && emmaWinners().length && emma.reveal !== 'pre') emmaApply(true);
}
function emmaIcs() {
  const at = Date.parse(emma?.at || ''); if (!at) return;
  const z = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = emma.event || 'EMMA 2026';
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CAI Hub//EMMA//ID', 'BEGIN:VEVENT', `UID:emma-${at}@hub.concerto.id`, `DTSTAMP:${z(Date.now())}`,
    `DTSTART:${z(at)}`, `DTEND:${z(at + 2 * 3600e3)}`, `SUMMARY:Pengumuman Champion ${ev}`, `LOCATION:${(emma.place || '').replace(/[,;]/g, ' ')}`,
    'DESCRIPTION:Lihat para juara & partner pemasangnya di https://hub.concerto.id', 'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Pengumuman juara EMMA 1 jam lagi', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'Pengumuman-Juara-EMMA.ics'; a.click();
  if (typeof showToast === 'function') showToast('📅 Tambahkan ke kalender HP Anda — pengingat 1 jam sebelum pengumuman');
}

/* ── sesudah pengumuman: kartu juara (coverflow) ── */
const emmaKey = w => [w.name, w.car, w.partner].map(s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')).join('|');
const emmaProds = w => (w.products || []).map(id => ({ id, ...findProductAny(id) })).filter(o => o.product);
function emmaCard(w, i) {
  const pl = +w.place || 0, img = emmaUrl(w.photo);
  return `<div class="lx-pc" data-i="${i}"><span class="lx-md g${pl}">${emmaEsc(w.award && !pl ? '★ ' + w.award : EMMA_MD[pl] || EMMA_MD[0])}</span>
    <div class="lx-pic">${img ? `<img data-src="${emmaEsc(img)}" alt="${emmaEsc(w.car || '')}" draggable="false">` : '<span>🏆</span>'}</div>
    ${w.cls ? `<div class="lx-cl">${emmaEsc(w.cls)}</div>` : ''}<div class="lx-nm">${emmaEsc(w.name || '')}</div>
    <div class="lx-car">${emmaEsc(w.car || '')}</div>
    ${w.partner ? `<div class="lx-pt">Dipasang oleh <b>${emmaEsc(w.partner)}</b>${w.city ? ' · ' + emmaEsc(w.city) : ''}</div>` : ''}
    <div class="lx-tap">🔧 Ketuk untuk lihat perangkat yang dipasang ›</div></div>`;
}
function emmaPostHtml() {
  const W = emmaWinners(), ev = emma.event || 'EMMA 2026';
  const j1 = W.filter(w => +w.place === 1).length, cars = new Set(W.map(emmaKey)).size, pts = new Set(W.map(w => (w.partner || '').toLowerCase()).filter(Boolean)).size;
  return `${emmaCo()}${emmaTitle(emma.postTitle, ['Champions of', `*${ev}*`])}
  <p class="lx-sub">${emmaEsc(emma.postSub || 'Selamat kepada para juara! Sistem audionya dibangun dengan produk resmi CAI oleh partner resmi kami.')}</p>
  <div class="lx-cf" id="lx-cf">${W.map(emmaCard).join('')}</div>
  ${W.length > 1 ? `<div class="lx-nav"><button id="lx-pv" aria-label="Sebelumnya">‹</button><div class="lx-dots" id="lx-dots">${W.map((_, i) => `<i data-i="${i}"></i>`).join('')}</div><button id="lx-nx" aria-label="Berikutnya">›</button></div>
  <div class="lx-cnt" id="lx-cnt"></div>` : ''}
  <div class="lx-info" id="lx-info"></div>
  <div class="lx-tot">Total ${emmaEsc(ev)}: ${j1} Juara 1 · ${W.length} prestasi · ${cars} mobil · ${pts} partner pemasang</div>
  <div class="lx-bt"><button class="lx-b1" onclick="emmaAll()">🏆 Lihat semua juara</button><button class="lx-b2" onclick="enterPortal()">Masuk Portal ▶</button></div>`;
}
function emmaWire() {
  const cf = document.getElementById('lx-cf'); if (!cf) return;
  const W = emmaWinners(), N = W.length, cards = [...cf.children];
  const sp = () => innerWidth < 720 ? 150 : 340;
  const wrap = d => { d = ((d % N) + N) % N; return d > N / 2 ? d - N : d; };
  const cur = () => ((Math.round(emmaPos) % N) + N) % N;
  const lay = () => {
    cards.forEach((c, i) => { const d = N > 1 ? wrap(i - emmaPos) : 0, a = Math.abs(d);
      c.style.transform = `translateX(${d * sp()}px) translateZ(${-a * 220}px) rotateY(${-Math.max(-1, Math.min(1, d)) * 24}deg) scale(${a < 1 ? 1.08 - a * .2 : Math.max(.6, .95 - a * .1)})`;
      c.style.opacity = a > 2.6 ? 0 : a > 1.6 ? .35 : 1; c.style.filter = a < .5 ? 'none' : `brightness(${1 - Math.min(a, 2) * .28})`;
      c.style.zIndex = 100 - Math.round(a * 10); c.style.pointerEvents = a > 2.6 ? 'none' : ''; c.classList.toggle('on', a < .5);
      if (a < 2.6) { const im = c.querySelector('img[data-src]'); if (im) { im.src = im.dataset.src; im.removeAttribute('data-src'); } } });   // foto dimuat hanya bila kartu dekat tengah (hemat kuota)
    const k = cur();
    document.querySelectorAll('#lx-dots i').forEach((x, i) => x.classList.toggle('on', i === k));
    const cnt = document.getElementById('lx-cnt'); if (cnt) cnt.textContent = `${String(k + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')} · GESER UNTUK MELIHAT JUARA LAIN`;
    emmaInfo(k);
  };
  const restart = () => { clearInterval(emmaAuto); if (N > 1) emmaAuto = setInterval(() => { if (document.hidden || document.getElementById('lx-mo')) return; emmaPos = Math.round(emmaPos) + 1; lay(); }, 4500); };
  const go = t => { emmaPos = t; lay(); restart(); };
  const pv = document.getElementById('lx-pv'), nx = document.getElementById('lx-nx'), dots = document.getElementById('lx-dots');
  if (pv) pv.onclick = () => go(Math.round(emmaPos) - 1);
  if (nx) nx.onclick = () => go(Math.round(emmaPos) + 1);
  if (dots) dots.onclick = e => { const i = e.target.dataset.i; if (i == null) return; go(Math.round(emmaPos) + wrap(+i - cur())); };
  cf.onclick = e => { const c = e.target.closest('.lx-pc'); if (!c || emmaMoved) return; const i = +c.dataset.i;
    if (i === cur()) return emmaOpen(i); go(Math.round(emmaPos) + wrap(i - cur())); };
  cf.onpointerdown = e => { emmaDrag = { x: e.clientX, y: e.clientY, p: emmaPos, id: e.pointerId }; emmaMoved = false; clearInterval(emmaAuto); };
  cf.onpointermove = e => { if (!emmaDrag || N < 2) return; const dx = e.clientX - emmaDrag.x;
    if (!emmaMoved) { if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(e.clientY - emmaDrag.y)) return; emmaMoved = true; cf.classList.add('drag'); try { cf.setPointerCapture(e.pointerId); } catch (_) {} }
    emmaPos = emmaDrag.p - dx / sp(); lay(); };
  cf.onpointerup = cf.onpointercancel = () => { if (!emmaDrag) return; emmaDrag = null; cf.classList.remove('drag'); if (emmaMoved) { go(Math.round(emmaPos)); setTimeout(() => { emmaMoved = false; }, 0); } else restart(); };
  cf.onmouseenter = () => clearInterval(emmaAuto); cf.onmouseleave = restart;
  emmaLay = lay;
  emmaPos = 0; lay(); restart();
}
function emmaKeyNav(e) {
  if (!document.getElementById('lx-cf') || document.getElementById('landing')?.hidden) return;
  if (e.key === 'Escape') return emmaClose();
  if (document.getElementById('lx-mo')) return;
  if (e.key === 'ArrowLeft') document.getElementById('lx-pv')?.click();
  if (e.key === 'ArrowRight') document.getElementById('lx-nx')?.click();
}
function emmaInfo(k) {
  if (k === emmaLastK) return; emmaLastK = k;
  const el = document.getElementById('lx-info'); if (!el) return;
  const W = emmaWinners(), w = W[k]; if (!w) return;
  const pr = W.filter(x => emmaKey(x) === emmaKey(w)).length, n = emmaProds(w).length + (w.other ? String(w.other).split(',').filter(s => s.trim()).length : 0);
  el.classList.add('out');
  setTimeout(() => { el.innerHTML = `<div><b>${pr}</b>Prestasi mobil ini</div>${n ? `<div><b>${n}</b>Perangkat CAI</div>` : ''}`; el.classList.remove('out'); }, 160);
}

/* ── jendela detail: Perangkat · Wiring · Alur sinyal ── */
function emmaFlow(w) {
  const P = emmaProds(w), cat = c => P.filter(o => o.product.category === c).map(o => o.product.name);
  const node = (ic, t, s, cls = '') => `<div class="lx-nd ${cls}"><div class="ic">${ic}</div><div class="tx">${emmaEsc(t)}${s ? `<small>${emmaEsc(s)}</small>` : ''}</div></div>`;
  const dsp = cat('DSP'), amp = cat('Amplifier'), tw = cat('Tweeter'), mid = cat('Midrange'), spk = cat('Speaker'), sub = cat('Subwoofer');
  if (!dsp.length && !amp.length && !tw.length && !mid.length && !spk.length && !sub.length) return '<div class="lx-empty">Alur sinyal belum tersedia untuk mobil ini.</div>';
  const ar = t => `<div class="lx-ar">${emmaEsc(t)}</div>`;
  let h = node('📻', 'Sumber audio', w.head || 'Head unit / player', 'src');
  if (dsp.length) h += ar('RCA / OPTICAL') + node('🎛', dsp.join(' + '), !amp.length && w.chans ? `${w.chans} channel · crossover · EQ · time alignment` : 'Crossover · EQ · Time alignment');
  if (amp.length) h += ar(w.chans ? `RCA · ${w.chans} CH` : 'RCA') + node('⚡', amp.join(' + '), w.chans ? `${w.chans} channel` : 'Power amplifier');
  const outs = [[tw, '🔈', 'Tweeter'], [mid, '🔉', 'Midrange'], [spk, '🔊', 'Speaker / Midbass'], [sub, '🎚', 'Subwoofer']].filter(o => o[0].length);
  if (outs.length) h += ar('KABEL SPEAKER') + `<div class="lx-split">${outs.map(([n, ic, l]) => node(ic, n.join(' + '), l)).join('')}</div>`;
  return `<div class="lx-flow">${h}</div><div class="lx-ch">Alur disusun dari perangkat yang dipasang.</div>`;
}
function emmaOpen(k) {
  const w = emmaWinners()[k]; if (!w) return; emmaClose(true); clearInterval(emmaAuto);
  const P = emmaProds(w), other = String(w.other || '').split(',').map(s => s.trim()).filter(Boolean), pl = +w.place || 0;
  const rows = P.map(({ id, brand, product: p }) => `<button class="lx-gi" onclick="emmaProduct('${emmaEsc(brand.id)}','${emmaEsc(id)}')">
      <span class="im">${p.photo || p.photos?.[0] ? `<img src="${emmaEsc(p.photos?.[0] || p.photo)}" alt="" loading="lazy">` : (p.emoji || '🔊')}</span>
      <span class="t">${emmaEsc(brand.name)} ${emmaEsc(p.name)}<small>${emmaEsc(p.category)}${p.soon ? ' · COMING SOON' : ''}</small></span>
      <span class="s">${typeof srpText === 'function' && srpText(p) ? emmaEsc(srpText(p)) : ''} ›</span></button>`).join('')
    + other.map(o => `<div class="lx-gi off"><span class="im">🔧</span><span class="t">${emmaEsc(o)}<small>Perangkat lain</small></span></div>`).join('');
  const d = w.partner && typeof adPublic === 'function' ? adPublic().find(x => normKey(x.n) === normKey(w.partner)) : null;
  const wa = d?.wa ? `https://wa.me/${d.wa}?text=${waText(`Halo ${d.n}, saya lihat di CAI Hub mobil juara ${emma.event || 'EMMA'} ${w.car || ''} yang Anda pasang. Saya ingin tanya sistem audio seperti itu.`)}` : '';
  const m = document.createElement('div'); m.id = 'lx-mo'; m.className = 'lx-mo';
  m.innerHTML = `<div class="lx-mb" role="dialog" aria-modal="true"><button class="x" onclick="emmaClose()" aria-label="Tutup">✕</button>
    <span class="lx-md g${pl}">${emmaEsc(w.award && !pl ? '★ ' + w.award : EMMA_MD[pl] || EMMA_MD[0])}</span>
    <h3>${emmaEsc([w.name, w.car].filter(Boolean).join(' · '))}</h3>
    <div class="meta">${emmaEsc([w.cls, w.partner ? 'Dipasang oleh ' + w.partner : '', w.city].filter(Boolean).join(' · '))}</div>
    <div class="lx-tabs" id="lx-tabs"><button class="on" data-t="0">🔧 Perangkat (${P.length + other.length})</button>${w.wiring ? '<button data-t="1">📐 Wiring</button>' : ''}<button data-t="2">〰 Alur sinyal</button></div>
    <div class="lx-tp on" data-t="0">${rows || '<div class="lx-empty">Daftar perangkat belum tersedia.</div>'}</div>
    ${w.wiring ? `<div class="lx-tp" data-t="1"><a class="lx-wire" href="${emmaEsc(emmaUrl(w.wiring))}" target="_blank" rel="noopener"><img src="${emmaEsc(emmaUrl(w.wiring))}" alt="Diagram wiring ${emmaEsc(w.car || '')}" loading="lazy"></a><div class="lx-zoom">⤢ Ketuk gambar untuk memperbesar</div></div>` : ''}
    <div class="lx-tp" data-t="2">${emmaFlow(w)}</div>
    <div class="lx-mbt">${P.length ? `<button class="g" onclick="emmaRakit(${k})">🔧 Rakit sistem seperti ini</button>` : ''}${wa ? `<a href="${emmaEsc(wa)}" target="_blank" rel="noopener">💬 Tanya partner pemasang</a>` : ''}${w.gl ? `<button onclick="emmaGl('${emmaEsc(w.gl)}')">📷 Foto & video di Galeri</button>` : ''}</div></div>`;
  document.getElementById('landing').appendChild(m);
  m.onclick = e => { if (e.target === m) emmaClose(); };
  m.querySelector('#lx-tabs').onclick = e => { const t = e.target.dataset.t; if (t == null) return;
    m.querySelectorAll('#lx-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    m.querySelectorAll('.lx-tp').forEach(x => x.classList.toggle('on', x.dataset.t === t)); };
}
function emmaClose(quiet) { document.getElementById('lx-mo')?.remove(); if (!quiet && document.getElementById('lx-cf')) { clearInterval(emmaAuto); emmaAuto = setInterval(() => { if (document.hidden || document.getElementById('lx-mo')) return; document.getElementById('lx-nx')?.click(); }, 4500); } }
function emmaProduct(b, p) { emmaClose(true); enterPortal(); showProduct(b, p); }
function emmaRakit(k) { const w = emmaWinners()[k]; emmaClose(true); enterPortal(); coRakit(emmaProds(w).map(o => o.id)); }
function emmaGl(id) { emmaClose(true); enterPortal(); if (typeof glOpenLinked === 'function') glOpenLinked(id); }
function emmaAll() {
  emmaClose(true); clearInterval(emmaAuto);
  const W = emmaWinners(), m = document.createElement('div'); m.id = 'lx-mo'; m.className = 'lx-mo';
  m.innerHTML = `<div class="lx-mb wide" role="dialog" aria-modal="true"><button class="x" onclick="emmaClose()" aria-label="Tutup">✕</button>
    <h3>🏆 Semua juara ${emmaEsc(emma.event || 'EMMA 2026')}</h3><div class="meta">${W.length} prestasi · ketuk untuk melihat perangkat</div>
    <div class="lx-all">${W.map((w, i) => `<button onclick="emmaOpen(${i})"><span class="lx-md g${+w.place || 0}">${emmaEsc(EMMA_MD[+w.place || 0])}</span>
      <b>${emmaEsc(w.name || '')}</b><small>${emmaEsc([w.car, w.cls].filter(Boolean).join(' · '))}</small><small>${emmaEsc([w.partner, w.city].filter(Boolean).join(' · '))}</small></button>`).join('')}</div></div>`;
  document.getElementById('landing').appendChild(m);
  m.onclick = e => { if (e.target === m) emmaClose(); };
}
addEventListener('resize', () => { if (emmaLay && document.getElementById('lx-cf')) emmaLay(); });
document.addEventListener('keydown', emmaKeyNav);
