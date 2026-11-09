/* ══════════════════════════════════════════
   📨 LAPORAN PARTNER — khusus Editor (5 Nov 2026, permintaan pemilik — pratinjau .mockup/partner-rapor/ disetujui)
   Kartu PNG bulanan per partner: berapa orang menghubungi tokonya lewat CAI Hub (klik WA · Maps · IG dari Laporan Minat),
   dari mana, + 3 produk paling dilihat di CAI Hub bulan itu. Editor mengirim kartunya ke WA partner masing-masing.
   Angka dari RPC partner_report(p_from, p_to) (supabase/partner-report.sql = PREPORT_SQL); tanda "sudah dikirim" di tabel
   partner_report_sent. Kartu digambar langsung ke canvas (tanpa library); ZIP semua kartu = JSZip (cdnjs, dimuat saat dipakai).
   Bulan & rentang memakai helper Rapor Bulanan (js/report.js). Data klik ke partner mulai dicatat 4 Nov 2026.
══════════════════════════════════════════ */
const PREPORT_SQL = `-- 📨 Laporan Partner bulanan (5 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run (aman dijalankan ulang)
-- Butuh tabel site_interest (SQL Minat Pengunjung). Khusus Editor. Tanpa data pribadi.

-- 1) Tanda "kartu sudah dikirim" per partner per bulan
create table if not exists public.partner_report_sent (
  month date not null,          -- tanggal 1 bulan yang dilaporkan
  partner text not null,        -- nama partner (sama dengan ref di site_interest)
  sent_at timestamptz not null default now(),
  primary key (month, partner)
);
alter table public.partner_report_sent enable row level security;
drop policy if exists "partner report editor" on public.partner_report_sent;
create policy "partner report editor" on public.partner_report_sent for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
grant select, insert, update, delete on public.partner_report_sent to authenticated;

-- 2) Angka per partner untuk rentang tanggal WIB [p_from, p_to] + pembanding: rentang yang sama bulan sebelumnya
create or replace function public.partner_report(p_from date, p_to date)
returns json language plpgsql security definer set search_path = public as $$
declare a date := p_from; b date := least(p_to, p_from + 31);
  pa date := (p_from - interval '1 month')::date; pb date := least((b - interval '1 month')::date, p_from - 1);
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('editor', 'manager') then raise exception 'not allowed'; end if;   -- khusus Editor
  return json_build_object(
    'from', a, 'to', b, 'pfrom', pa, 'pto', pb,
    'partners', (select coalesce(json_agg(t order by t.people desc, t.ref), '[]') from (
        select ref,
          count(distinct vid) filter (where day between a and b) people,
          count(distinct vid) filter (where day between pa and pb) people0,
          coalesce(sum(n) filter (where kind = 'wa' and day between a and b), 0) wa,
          coalesce(sum(n) filter (where kind = 'maps' and day between a and b), 0) maps,
          coalesce(sum(n) filter (where kind = 'ig' and day between a and b), 0) ig,
          (select coalesce(json_object_agg(s.src, s.n), '{}') from (
             select coalesce(nullif(src, ''), 'lain') src, sum(n) n from site_interest x
             where x.kind in ('wa', 'maps', 'ig') and x.ref = i.ref and x.day between a and b group by 1) s) src
        from site_interest i where kind in ('wa', 'maps', 'ig') and day between pa and b group by ref) t),
    'top', (select coalesce(json_agg(t.ref order by t.n desc, t.ref), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'view' and day between a and b group by ref order by 2 desc, 1 limit 3) t),
    'sent', (select coalesce(json_object_agg(partner, sent_at), '{}') from partner_report_sent where month = a));
end $$;
revoke all on function public.partner_report(date, date) from public, anon;
grant execute on function public.partner_report(date, date) to authenticated;
`;
const PR_MIN = '2026-11';
let prMonth = null, prCache = {}, prBusy = false, prErr = '', prQ = '', prMissing = false;
const PR_SRC = { produk: 'halaman produk', google: 'Google', mobil: 'Cari per Mobil', simulator: 'System Simulator', partner: 'Enthusiast Partner', cek: 'Cek Partner Resmi',
  profil: 'Profil Partner', finder: 'Temukan Sistem', cari: 'pencarian', news: 'berita CAI Hub News', hof: 'Hall of Fame', galeri: 'Galeri Instalasi', lain: 'lainnya' };
const PR_COL = { produk: '#d8b26a', google: '#6fd3e6', mobil: '#52c38a', simulator: '#f0c75e', partner: '#7aa7ff', profil: '#e8c14a', cek: '#a3e07a', news: '#3fb8cf', lain: '#8b92a1' };
function prDefault() { const p = rpShift(rpNow(), -1); return p >= PR_MIN ? p : rpNow(); }

function openPartnerReport(m) {
  if (!requireLogin(() => openPartnerReport(m))) return;
  if (!isReporter()) { showToast('Laporan Partner khusus Editor.'); showView('dashboard'); return; }
  if (m && /^\d{4}-\d{2}$/.test(m)) prMonth = m > rpNow() ? rpNow() : m < PR_MIN ? PR_MIN : m;
  if (!prMonth) prMonth = prDefault();
  showView('prapor');
  if (typeof adEnsure === 'function') adEnsure();
  prLoad();
}
function prCopySql() {
  const done = () => showToast('✓ SQL Laporan Partner disalin — tempel di Supabase → SQL Editor → Run', 5000);
  if (navigator.clipboard) navigator.clipboard.writeText(PREPORT_SQL).then(done, () => prompt('Salin SQL ini:', PREPORT_SQL)); else prompt('Salin SQL ini:', PREPORT_SQL);
}
function prGo(d) { const m = rpShift(prMonth, d); if (m < PR_MIN || m > rpNow()) return; prMonth = m; prLoad(); }
function prAuthChanged() { if (!isReporter() && document.getElementById('view-prapor')?.classList.contains('active')) showView('dashboard'); }
async function prLoad(force) {
  const m = prMonth, r = rpRange(m), k = `${m}|${r.to}`;
  prRender();
  if (prCache[k] && !force) return;
  if (typeof supabase === 'undefined' || !supabase) { setTimeout(() => prLoad(force), 800); return; }
  prBusy = true; prErr = ''; prRender();
  const { data, error } = await supabase.rpc('partner_report', { p_from: r.from, p_to: r.to });
  prBusy = false;
  if (error) { prMissing = /partner_report|function|schema cache/i.test(error.message || ''); prErr = error.message || 'Gagal memuat'; }
  else { prMissing = false; prCache[k] = data; }
  prRender();
}
const prData = () => { const r = rpRange(prMonth); return prCache[`${prMonth}|${r.to}`] || null; };
// semua partner (daftar publik) + angka; partner yang sudah tidak di daftar tapi punya klik tetap ikut
function prRows() {
  const d = prData(), ds = typeof adPublic === 'function' ? adPublic() : [], by = new Map((d?.partners || []).map(x => [normKey(x.ref), x]));
  const rows = ds.map(p => ({ p, s: by.get(normKey(p.n)) || null }));
  for (const [k, s] of by) if (!ds.some(p => normKey(p.n) === k)) rows.push({ p: { n: s.ref }, s });
  return rows.sort((a, b) => (b.s?.people || 0) - (a.s?.people || 0) || (b.s ? 1 : 0) - (a.s ? 1 : 0) || a.p.n.localeCompare(b.p.n));
}
const prSrcList = s => Object.entries(s?.src || {}).sort((a, b) => b[1] - a[1]);
const prSent = name => prData()?.sent?.[name];
const prProd = id => { for (const b of BRANDS) for (const l of b.lines) for (const p of l.products) if (p.id === id) return `${b.name} ${p.name}`; return null; };
const prLinkOf = p => typeof pfLink === 'function' ? pfLink(shareSlug(p.n)) : `${location.origin}/?partner=${shareSlug(p.n)}`;

function prRender() {
  const el = document.getElementById('prapor-body'); if (!el) return;
  const d = prData(), r = rpRange(prMonth), rows = prRows(), q = normKey(prQ);
  const list = q ? rows.filter(x => normKey([x.p.n, x.p.c, x.p.r].join(' ')).includes(q)) : rows;
  const tot = rows.reduce((a, x) => a + (x.s ? x.s.wa + x.s.maps + x.s.ig : 0), 0), wa = rows.reduce((a, x) => a + (x.s?.wa || 0), 0);
  const hit = rows.filter(x => x.s?.people).length, sent = rows.filter(x => x.s?.people && prSent(x.p.n)).length;
  el.innerHTML = `<div class="pr-head"><div><h1>📨 Laporan Partner</h1><p>Kartu bulanan per partner: berapa orang menghubungi tokonya lewat CAI Hub. Kirim ke WA partner masing-masing.</p></div></div>
    <div class="pr-bar"><div class="rp-mon"><button class="rp-btn" onclick="prGo(-1)" ${rpShift(prMonth, -1) < PR_MIN ? 'disabled' : ''}>‹</button><span>${rpLabel(prMonth)}</span><button class="rp-btn" onclick="prGo(1)" ${prMonth >= rpNow() ? 'disabled' : ''}>›</button></div>
      <input class="pr-q" placeholder="Cari partner / kota…" value="${escHtml(prQ)}" oninput="prQ=this.value;prRender();const i=document.querySelector('.pr-q');i.focus();i.setSelectionRange(i.value.length,i.value.length)">
      <button class="pr-btn g" onclick="prLoad(true)">↻</button><button class="pr-btn g" onclick="prZip()" ${hit ? '' : 'disabled'}>⬇ Unduh semua PNG (ZIP)</button></div>
    ${r.running ? `<div class="pr-note">Bulan berjalan — angka sampai ${new Date(r.to + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', timeZone: 'UTC' })}. Kirim kartu sebaiknya setelah bulan selesai (tanggal 1).</div>` : ''}
    ${prMissing ? `<div class="pr-note warn">Fungsi Laporan Partner belum ada di Supabase. <button class="pr-btn" onclick="prCopySql()">📋 Salin SQL Laporan Partner</button></div>`
      : prErr ? `<div class="pr-note warn">Gagal memuat: ${escHtml(prErr)}</div>` : ''}
    ${prBusy && !d ? '<div class="stock-empty">⏳ Memuat…</div>' : !d ? '' : `
    <div class="pr-sum"><div><b>${rpN(tot)}</b><span>klik ke partner</span></div><div><b>${hit}</b><span>dari ${rows.length} partner dihubungi</span></div>
      <div><b>${tot ? Math.round(wa / tot * 100) : 0}%</b><span>lewat WhatsApp</span></div><div><b>${sent} / ${hit}</b><span>kartu sudah dikirim</span></div></div>
    <div class="pr-tbl"><div class="pr-tr pr-th"><span>Partner</span><span>Orang</span><span>WA · Maps · IG</span><span>Dari</span><span>Status</span><span></span></div>
    ${list.map(x => { const s = x.s, i = rows.indexOf(x), sn = prSent(x.p.n);
      const dl = s ? s.people - (s.people0 || 0) : 0;
      return `<div class="pr-tr${sn ? ' on' : ''}"><span class="pr-n"><b>${escHtml(x.p.n)}</b><small>${escHtml(x.p.c || x.p.r || '—')}</small></span>
        <span class="pr-num">${s?.people || 0}${s && s.people0 ? `<em class="${dl < 0 ? 'dn' : 'up'}">${dl < 0 ? '▼' : '▲'} ${Math.abs(dl)}</em>` : s?.people ? '<em class="up">baru</em>' : ''}</span>
        <span>${s ? `${s.wa} · ${s.maps} · ${s.ig}` : '—'}</span><span class="pr-src">${s ? escHtml(prSrcList(s).slice(0, 2).map(([k]) => PR_SRC[k] || k).join(', ')) : '—'}</span>
        <span>${sn ? `<em class="pr-st ok">✓ Dikirim ${new Date(sn).toLocaleDateString('id-ID', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Jakarta' })}</em>` : `<em class="pr-st">${s?.people ? 'Belum' : 'Tanpa klik'}</em>`}</span>
        <span class="pr-acts"><button onclick="prView(${i})">👁 Lihat</button>${x.p.wa ? `<button class="wa" onclick="prSend(${i})">Kirim WA</button>` : ''}</span></div>`; }).join('') || '<div class="stock-empty">Tidak ada partner yang cocok.</div>'}</div>
    <p class="pr-foot">“Orang” = pengunjung berbeda yang menekan WhatsApp, Maps atau Instagram partner itu di CAI Hub (bukan berarti pesan terkirim). Partner tanpa klik tetap bisa dikirimi kartu berisi ajakan membagikan link profil &amp; mengirim foto instalasi. Data klik mulai dicatat 4 Nov 2026.</p>`}`;
}

// ── Kartu PNG 1080×1350 (canvas) ──
let prLogo = null;
function prImg(src) { return new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); }
function prWrap(c, t, w) { const out = []; let line = ''; for (const wd of String(t).split(' ')) { const s = line ? line + ' ' + wd : wd; if (c.measureText(s).width > w && line) { out.push(line); line = wd; } else line = s; } if (line) out.push(line); return out; }
function prRound(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
async function prCard(x) {
  try { await document.fonts?.load('800 60px Sora'); await document.fonts?.load('500 20px Inter'); } catch (e) {}
  if (!prLogo) prLogo = await prImg(LOGO_WHITE);
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const d = prData(), s = x.s, p = x.p, G = '#d8b26a', M = 72, SO = 'Sora, Inter, sans-serif', IN = 'Inter, sans-serif';
  c.fillStyle = '#0a0b0e'; c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(W, 0, 0, W, 0, 900); g.addColorStop(0, 'rgba(216,178,106,.22)'); g.addColorStop(1, 'rgba(216,178,106,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (prLogo) { const h = 44, w = prLogo.width / prLogo.height * h; c.drawImage(prLogo, M, 70, w, h); }
  c.textBaseline = 'alphabetic'; c.fillStyle = G; c.font = `700 22px ${SO}`; c.textAlign = 'right'; c.fillText('C A I   H U B', W - M, 100); c.textAlign = 'left';
  c.font = `700 24px ${SO}`; c.fillText(`LAPORAN PARTNER · ${rpLabel(prMonth).toUpperCase()}`.split('').join(String.fromCharCode(8202)), M, 196);
  c.fillStyle = '#fff'; let fs = 76; c.font = `800 ${fs}px ${SO}`; while (c.measureText(p.n).width > W - 2 * M && fs > 44) { fs -= 4; c.font = `800 ${fs}px ${SO}`; } c.fillText(p.n, M, 290);
  c.fillStyle = '#aab0bc'; c.font = `500 30px ${IN}`; c.fillText(`${p.c ? '📍 ' + p.c + ' · ' : ''}✓ Partner resmi CAI`, M, 340);
  // angka besar
  const by = 392, bh = 302; prRound(c, M, by, W - 2 * M, bh, 30); const bg = c.createLinearGradient(M, by, W - M, by + bh); bg.addColorStop(0, 'rgba(216,178,106,.16)'); bg.addColorStop(1, 'rgba(216,178,106,.02)');
  c.fillStyle = bg; c.fill(); c.strokeStyle = 'rgba(216,178,106,.45)'; c.lineWidth = 2; c.stroke();
  const n = s?.people || 0;
  c.fillStyle = '#d6d9df'; c.font = `500 28px ${IN}`; c.fillText(n ? 'Calon pembeli yang menghubungi toko Anda lewat CAI Hub' : 'Bulan ini belum ada yang menghubungi lewat CAI Hub', M + 40, by + 62);
  c.fillStyle = G; c.font = `800 150px ${SO}`; c.fillText(String(n), M + 36, by + 214); const nw = c.measureText(String(n)).width;
  c.fillStyle = '#fff'; c.font = `700 36px ${SO}`; c.fillText('orang', M + 54 + nw, by + 212);
  const n0 = s?.people0 || 0, prev = RP_MONTHS[(+prMonth.slice(5) + 10) % 12];
  if (n && n0) { const dl = n - n0; c.fillStyle = dl < 0 ? '#ef6b6b' : '#52c38a'; c.font = `700 26px ${IN}`; c.fillText(dl ? `${dl < 0 ? '▼' : '▲'} ${Math.abs(dl)} dibanding ${prev}` : `= sama dengan ${prev}`, M + 40, by + 268); }
  else if (!n) { c.fillStyle = '#e9c98a'; c.font = `600 25px ${IN}`; c.fillText('Bagikan link profil Anda & kirim foto instalasi ke tim CAI', M + 40, by + 268); }
  // WA · Maps · IG
  const ry = 722, cw = (W - 2 * M - 36) / 3;
  [['WhatsApp', s?.wa || 0, '💬'], ['Buka Maps', s?.maps || 0, '📍'], ['Instagram', s?.ig || 0, '📷']].forEach(([t, v, ic], i) => {
    const x0 = M + i * (cw + 18); prRound(c, x0, ry, cw, 130, 22); c.fillStyle = '#111317'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#fff'; c.font = `800 52px ${SO}`; c.fillText(String(v), x0 + 24, ry + 68); c.fillStyle = '#aab0bc'; c.font = `500 22px ${IN}`; c.fillText(`${ic} klik ${t}`, x0 + 24, ry + 106);
  });
  // sumber
  let y = 920; const src = prSrcList(s), tot = src.reduce((a, [, v]) => a + v, 0);
  if (tot) {
    const top = src.slice(0, 2).map(([k]) => PR_SRC[k] || k);
    c.fillStyle = '#aab0bc'; c.font = `600 24px ${IN}`; c.fillText(`Mereka menemukan Anda dari ${top.join(' & ')}`, M, y);
    let bx = M; y += 20; prRound(c, M, y, W - 2 * M, 18, 9); c.save(); c.clip();
    const segs = src.slice(0, 4); const rest = tot - segs.reduce((a, [, v]) => a + v, 0); if (rest > 0) segs.push(['lain', rest]);
    for (const [k, v] of segs) { const w = (W - 2 * M) * v / tot; c.fillStyle = PR_COL[k] || '#8b92a1'; c.fillRect(bx, y, w + 1, 18); bx += w; } c.restore();
    y += 52; let lx = M; c.font = `500 21px ${IN}`;
    for (const [k, v] of segs) { const t = `${(PR_SRC[k] || k).replace(/^./, z => z.toUpperCase())} ${Math.round(v / tot * 100)}%`, w = c.measureText(t).width + 50;
      if (lx + w > W - M) { lx = M; y += 34; } c.fillStyle = PR_COL[k] || '#8b92a1'; prRound(c, lx, y - 15, 14, 14, 4); c.fill(); c.fillStyle = '#cfd3da'; c.fillText(t, lx + 22, y); lx += w; }
    y += 64;
  } else y = 930;
  // produk paling dilihat
  const tops = (d?.top || []).map(prProd).filter(Boolean);
  if (tops.length) { c.fillStyle = '#aab0bc'; c.font = `600 24px ${IN}`; c.fillText('Produk paling dilihat di CAI Hub bulan ini:', M, y); y += 46;
    c.fillStyle = '#fff'; c.font = `700 28px ${SO}`; tops.forEach((t, i) => { c.fillText(`${i + 1}. ${t}`, M + 8, y); y += 44; }); }
  // kaki
  c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 1; c.beginPath(); c.moveTo(M, H - 104); c.lineTo(W - M, H - 104); c.stroke();
  const link = prLinkOf(p).replace(/^https?:\/\//, '').replace(/\?v=.*$/, '').replace(/\/$/, '');
  c.font = `600 21px ${IN}`; c.fillStyle = '#8b92a1'; c.fillText('Profil Anda: ', M, H - 58); const lw = c.measureText('Profil Anda: ').width;
  c.fillStyle = G; c.font = `700 21px ${IN}`; c.fillText(link.length > 44 ? link.slice(0, 43) + '…' : link, M + lw, H - 58);
  c.textAlign = 'right'; c.fillStyle = '#8b92a1'; c.font = `600 21px ${IN}`; c.fillText('Concerto Audio Indonesia', W - M, H - 58); c.textAlign = 'left';
  return new Promise(ok => cv.toBlob(ok, 'image/png'));
}
const prFile = p => `Laporan-CAI-Hub-${shareSlug(p.n)}-${prMonth}.png`;
function prMsg(x) {
  const s = x.s, n = s?.people || 0, link = prLinkOf(x.p);
  return n ? `Halo ${x.p.n} 👋\nIni laporan CAI Hub bulan ${rpLabel(prMonth)}: ${n} calon pembeli menghubungi toko Anda lewat CAI Hub (klik WA ${s.wa} · Maps ${s.maps} · IG ${s.ig}).\n\nBagikan link profil Anda agar makin banyak yang menemukan toko Anda:\n${link}\n\n— Tim Concerto Audio Indonesia`
    : `Halo ${x.p.n} 👋\nIni laporan CAI Hub bulan ${rpLabel(prMonth)}. Bulan ini belum ada calon pembeli yang menghubungi toko Anda lewat CAI Hub.\n\nYuk bagikan link profil Anda & kirim foto instalasi ke tim CAI agar tampil di Galeri:\n${link}\n\n— Tim Concerto Audio Indonesia`;
}
async function prView(i) {
  const x = prRows()[i]; if (!x) return;
  const b = await prCard(x), u = URL.createObjectURL(b);
  let ov = document.getElementById('pr-ov'); if (!ov) { ov = document.createElement('div'); ov.id = 'pr-ov'; ov.className = 'pr-ov'; ov.onclick = e => { if (e.target === ov) prClose(); }; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="pr-box"><button class="pr-x" onclick="prClose()">✕</button><img src="${u}" alt="Kartu ${escHtml(x.p.n)}">
    <div class="pr-msg">${escHtml(prMsg(x))}</div><div class="pr-bt"><a class="pr-btn g" href="${u}" download="${escHtml(prFile(x.p))}">⬇ Unduh PNG</a>${x.p.wa ? `<button class="pr-btn wa" onclick="prSend(${i})">Kirim WA</button>` : ''}</div></div>`;
  ov.classList.add('open');
}
function prClose() { document.getElementById('pr-ov')?.classList.remove('open'); }
async function prMark(name) {
  const r = rpRange(prMonth), d = prData();
  const { error } = await supabase.from('partner_report_sent').upsert({ month: r.from, partner: name, sent_at: new Date().toISOString() });
  if (!error && d) { d.sent = { ...(d.sent || {}), [name]: new Date().toISOString() }; prRender(); }
}
// HP: menu berbagi (pilih kontak partner) dengan kartu terlampir · laptop: kartu diunduh + WhatsApp partner dibuka (lampirkan manual)
async function prSend(i) {
  const x = prRows()[i]; if (!x?.p.wa) return;
  const b = await prCard(x), f = new File([b], prFile(x.p), { type: 'image/png' }), t = prMsg(x);
  if (navigator.canShare && /Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], text: t }); prMark(x.p.n); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  window.open(`https://wa.me/${x.p.wa}?text=${waText(t)}`, '_blank', 'noopener');
  showToast('Kartu diunduh — lampirkan di chat WhatsApp partner.', 5000); prMark(x.p.n);
}
let prZipP = null;
async function prZip() {
  const rows = prRows().filter(x => x.s?.people); if (!rows.length) return;
  showToast('⏳ Menyiapkan ZIP kartu…', 8000);
  try { await (prZipP || (prZipP = new Promise((ok, no) => { if (window.JSZip) return ok(); const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = ok; s.onerror = () => { prZipP = null; no(); }; document.head.appendChild(s); }))); }
  catch (e) { showToast('Komponen ZIP belum termuat — periksa koneksi lalu coba lagi.'); return; }
  const z = new JSZip(); for (const x of rows) z.file(prFile(x.p), await prCard(x));
  const b = await z.generateAsync({ type: 'blob' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `Laporan-Partner-CAI-Hub-${prMonth}.zip`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); showToast(`✓ ${rows.length} kartu diunduh`);
}
