/* ══════════════════════════════════════════
   📍 KANAL KUNJUNGAN · LINK & QR PROMOSI · TEMPLATE STORY (Branding CAI Hub no. 7, 6 Nov 2026, permintaan pemilik — pratinjau .mockup/kanal/ disetujui)
   A. Pencatatan: ?src=<kanal> (ig, tiktok, story, wa, event, kartu, stiker, gbp, … bebas a-z0-9- maks. 20 huruf) atau dikenali
      otomatis dari referrer / aplikasi (Google, WhatsApp, Instagram, Facebook, TikTok, YouTube, link berbagi CAI Hub, halaman Google CAI Hub).
      Sekali per sesi tab → RPC log_channel(p_vid, p_ch) → tabel site_channels (tanpa data pribadi; ID browser = visitId()).
      Akun Admin/Editor & layar videotron tidak dicatat. Penanda ?src dibuang dari alamat (tidak ikut terbawa saat dibagikan / dipasang).
      "Pasang di HP" dihubungkan ke kanal PERTAMA orang itu di server (channel_stats, kolom first_at).
   B. Rapor Bulanan: kotak "📍 Pengunjung datang dari" (chBoxHtml) dari monthly_report → channels.
   C. Pembuat link & QR promosi (khusus Editor): chGenOpen() — tombol di header Rapor Bulanan.
   D. Template Story/Reels PNG 1080×1920 (canvas): chStoryCanvas().
   SQL sekali jalan: supabase/channels.sql = CHANNEL_SQL.
══════════════════════════════════════════ */
const CHANNEL_SQL = `-- 📍 Kanal kunjungan — "Pengunjung datang dari mana" (Branding CAI Hub no. 7, 6 Nov 2026)
-- Jalankan sekali di Supabase → SQL Editor → Run (aman dijalankan ulang). Tanpa data pribadi.
-- Butuh tabel dari SQL sebelumnya: site_visits (Pengunjung Portal), site_app_events (Pemasangan CAI Hub).
-- Setelah ini, Rapor Bulanan menampilkan kotak "📍 Pengunjung datang dari" (monthly_report di supabase/report.sql
-- memanggil channel_stats bila ada — tidak perlu menjalankan ulang report.sql bila sudah versi 6 Nov 2026).

-- 1) Kanal per orang per hari (ig, tiktok, story, wa, event, kartu, stiker, google, fb, link, … a-z0-9- maks. 20)
create table if not exists public.site_channels (
  day date not null,
  vid text not null,                              -- ID acak per browser (cai-vid), sama dengan site_visits
  ch text not null,
  n int not null default 1,
  first_at timestamptz not null default now(),    -- dipakai untuk "kanal pertama" orang itu (Pasang di HP)
  primary key (day, vid, ch)
);
alter table public.site_channels enable row level security;
create index if not exists site_channels_vid on public.site_channels (vid, first_at);

create or replace function public.log_channel(p_vid text, p_ch text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 then return; end if;
  if p_ch is null or p_ch !~ '^[a-z0-9][a-z0-9-]{0,19}$' then return; end if;
  insert into site_channels (day, vid, ch) values ((now() at time zone 'Asia/Jakarta')::date, p_vid, p_ch)
  on conflict (day, vid, ch) do update set n = least(site_channels.n + 1, 50);
end $$;
grant execute on function public.log_channel(text, text) to anon, authenticated;

-- 2) Angka per kanal untuk rentang [p_from, p_to] + pembanding [p_pfrom, p_pto]
--    n = orang berbeda yang datang lewat kanal itu · inst = pasang di HP di rentang itu, dihitung ke kanal PERTAMA orang itu
--    direct = pengunjung tanpa kanal (ketik alamat, ikon HP, bookmark, referrer lain)
create or replace function public.channel_stats(p_from date, p_to date, p_pfrom date, p_pto date)
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'editor' and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'not allowed'; end if;   -- khusus Editor
  with cur as (select distinct vid, ch from site_channels where day between p_from and p_to),
  prev as (select distinct vid, ch from site_channels where day between p_pfrom and p_pto),
  inst as (select e.vid, (select s.ch from site_channels s where s.vid = e.vid and s.day <= e.day order by s.first_at, s.ch limit 1) ch
           from (select vid, min(day) as day from site_app_events where kind = 'install' and day between p_from and p_to group by vid) e),
  chs as (select ch from cur union select ch from prev union select ch from inst where ch is not null)
  select json_build_object(
    'rows', coalesce((select json_agg(t order by t.n desc, t.ch) from (
        select c.ch, (select count(*) from cur where cur.ch = c.ch) n, (select count(*) from prev where prev.ch = c.ch) n0,
               (select count(*) from inst where inst.ch = c.ch) inst from chs c) t), '[]'),
    'direct', json_build_object(
        'n', (select count(distinct v.vid) from site_visits v where v.day between p_from and p_to and not exists (select 1 from cur where cur.vid = v.vid)),
        'n0', (select count(distinct v.vid) from site_visits v where v.day between p_pfrom and p_pto and not exists (select 1 from prev where prev.vid = v.vid)),
        'inst', (select count(*) from inst where ch is null)),
    'since', (select min(day) from site_channels)) into r;
  return r;
end $$;
revoke all on function public.channel_stats(date, date, date, date) from public, anon;
grant execute on function public.channel_stats(date, date, date, date) to authenticated, service_role;`;
const CH_HOST = 'https://hub.concerto.id';
const CH_SES = 'cai-ch';
// Kanal yang dibuat lewat pembuat link (urutan chip) + kanal yang dikenali otomatis
const CH_DEF = {
  ig:     { ic: '📸', t: 'Instagram', chip: 'Instagram bio', tip: 'Tempel di kolom <b>Situs web</b> profil Instagram (Edit profil → Tautan).' },
  tiktok: { ic: '🎵', t: 'TikTok', chip: 'TikTok', tip: 'Profil TikTok → <b>Edit profil → Situs web</b>.' },
  story:  { ic: '💬', t: 'Story WA', chip: 'Story WA', tip: 'Untuk status WhatsApp & stiker <b>Link</b> di Story Instagram. Template Story di bawah sudah memakai QR ini.' },
  event:  { ic: '🎪', t: 'Banner event', chip: 'Banner event', tip: 'Cetak di roll-up banner / backdrop pameran & kompetisi.' },
  kartu:  { ic: '🃏', t: 'Kartu QR toko', chip: 'Kartu QR', tip: 'Kartu meja / stiker / kartu kecil di toko partner (sudah tercetak dengan kode ini).' },
  stiker: { ic: '🚗', t: 'Stiker mobil', chip: 'Stiker mobil', tip: 'Stiker kaca "Featured on CAI Hub" di mobil Galeri (per mobil: tombol cetak stiker di Galeri).' },
  wa:     { ic: '🟢', t: 'WhatsApp', tip: 'Link di pesan / grup WhatsApp (juga dikenali otomatis dari aplikasi WhatsApp).' },
  google: { ic: '🔎', t: 'Google', auto: 1 },
  gbp:    { ic: '📍', t: 'Google Business', tip: 'Kolom Situs web di Google Business Profile.' },
  fb:     { ic: '📘', t: 'Facebook', auto: 1 },
  yt:     { ic: '▶️', t: 'YouTube', auto: 1 },
  link:   { ic: '🔗', t: 'Link dibagikan', auto: 1 },
};
const CH_CHIPS = ['ig', 'tiktok', 'story', 'event', 'kartu', 'stiker'];
const chInfo = c => CH_DEF[c] || { ic: '🏷', t: c };
const chNorm = s => { const c = String(s || '').toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 20); return c; };
const chLink = c => `${CH_HOST}/?src=${c}`;

// Ditangkap saat skrip dimuat (sebelum openDeepLink/insInit mengubah alamat)
const CH_LAND = (() => { let src = ''; try { src = new URLSearchParams(location.search).get('src') || ''; } catch (e) {} return { src, ref: document.referrer || '', ua: navigator.userAgent || '' }; })();

// ── A. Kenali kanal ──
function chDetect(L = CH_LAND) {
  const s = chNorm(L.src); if (s) return s;
  const ua = L.ua;
  if (/Instagram/i.test(ua)) return 'ig';                          // browser di dalam aplikasi
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'fb';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok';
  const ref = L.ref; if (!ref) return '';
  const app = ref.match(/^android-app:\/\/([^/]+)/i);
  if (app) { const p = app[1].toLowerCase();
    return /whatsapp/.test(p) ? 'wa' : /instagram/.test(p) ? 'ig' : /facebook|orca/.test(p) ? 'fb' : /musically|trill|tiktok/.test(p) ? 'tiktok'
      : /googlequicksearchbox|android\.gm$|chrome/.test(p) ? (/gm$|chrome/.test(p) ? '' : 'google') : /youtube/.test(p) ? 'yt' : ''; }
  let h = '', path = ''; try { const u = new URL(ref); h = u.hostname.toLowerCase(); path = u.pathname; } catch (e) { return ''; }
  if (h === location.hostname || h === 'hub.concerto.id' || h === 'dealer.concerto.id') {
    if (/^\/(p|h|a|k|d|s|g|m|n|pp|news|galeri|cway|panduan|bandingkan|rakitan)\//.test(path)) return 'link';   // kartu pratinjau link berbagi (WA dll.)
    if (/^\/(produk|kategori|brand|partner|academy|mobil|hall-of-fame)\//.test(path)) return 'google';         // halaman Google CAI Hub
    return '';
  }
  if (/(^|\.)google\.[a-z.]+$/.test(h) || /^(www\.)?(bing\.com|duckduckgo\.com)$/.test(h) || /(^|\.)search\.yahoo\.com$/.test(h)) return 'google';
  if (h === 'l.wl.co' || h === 'wa.me' || /(^|\.)whatsapp\.(com|net)$/.test(h)) return 'wa';
  if (/(^|\.)instagram\.com$/.test(h)) return 'ig';
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(h)) return 'fb';
  if (/(^|\.)tiktok\.com$/.test(h)) return 'tiktok';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'yt';
  return '';
}
let chOff = false;
function chInit() {
  if (typeof QA_SCREEN_MODE !== 'undefined' && QA_SCREEN_MODE) return;
  // buang ?src dari alamat (kartu QR lama ?src=kartu tetap dicatat 'qr' oleh insSrcCheck di js/install.js)
  if (CH_LAND.src) { try { const q = new URLSearchParams(location.search); q.delete('src'); history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch (e) {} }
  let done = ''; try { done = sessionStorage.getItem(CH_SES); } catch (e) {}
  if (done) return;                                    // sekali per sesi tab
  const ch = chDetect();
  try { sessionStorage.setItem(CH_SES, ch || '-'); } catch (e) {}
  if (ch) setTimeout(() => chLog(ch), 3000);          // tunggu status login (akun Admin/Editor tidak dicatat)
}
function chLog(ch) {
  if (chOff || typeof supabase === 'undefined' || !supabase || (typeof isAdmin === 'function' && isAdmin())) return;
  const vid = typeof visitId === 'function' ? visitId() : null; if (!vid) return;
  supabase.rpc('log_channel', { p_vid: vid, p_ch: ch }).then(r => { if (r?.error) chOff = true; }, () => { chOff = true; });
}

// ── B. Kotak Rapor Bulanan "📍 Pengunjung datang dari" ──
function chSummary(rows) {
  const up = rows.filter(x => x.n >= 3 && x.n > (x.n0 || 0)).map(x => ({ ...x, g: x.n - (x.n0 || 0) })).sort((a, b) => b.g - a.g || b.n - a.n)[0];
  const ins = rows.filter(x => x.n >= 5 && x.inst).map(x => ({ ...x, p: x.inst / x.n })).sort((a, b) => b.p - a.p || b.inst - a.inst)[0];
  const out = [];
  if (up) out.push(`Kanal yang naik paling tinggi: <b>${chInfo(up.ch).ic} ${escHtml(chInfo(up.ch).t)}</b> (+${rpN(up.g)} orang${up.n0 ? `, ▲ ${Math.round(up.g / up.n0 * 100)}%` : ', kanal baru'})`);
  if (ins) out.push(`persentase pasang di HP tertinggi: <b>${chInfo(ins.ch).ic} ${escHtml(chInfo(ins.ch).t)}</b> (${Math.round(ins.p * 100)}% dari pengunjungnya memasang)`);
  return out.length ? out.join(' · ') + '.' : '';
}
const CH_COLORS = ['#c9a45c', '#6fd3e6', '#e5675e', '#5fc48c', '#b48ae6', '#e6a15f', '#e6d65f', '#5f8de6', '#e65fa8', '#8fd18a'];
function chBoxHtml(S, m) {
  const C = S.channels;
  const gen = `<button class="rp-btn" data-html2canvas-ignore onclick="chGenOpen()">🔗 Buat link & QR promosi</button>`;
  if (!C) return `<div class="rp-c rp-ch" data-html2canvas-ignore><h2>📍 Pengunjung datang dari · ${rpShort(m)}</h2>
    <div class="rp-empty">⚙️ Pencatatan kanal belum aktif. Jalankan SQL ini sekali di Supabase → SQL Editor → Run (file <code>supabase/channels.sql</code>), lalu muat ulang.</div>
    <div class="rp-ch-acts"><button class="rp-btn g" onclick="chCopySql()">📋 Salin SQL Kanal</button>${gen}</div></div>`;
  const rows = [...(C.rows || [])].filter(x => x.n || x.n0 || x.inst).sort((a, b) => b.n - a.n || b.inst - a.inst || a.ch.localeCompare(b.ch));
  const D = C.direct || {}, M = Math.max(1, ...rows.map(x => x.n), D.n || 0);
  const row = (ic, t, x, cls = '') => `<tr class="${cls}"><td><span class="rp-ch-ic">${ic}</span>${t}</td>
      <td><div class="rp-ch-n"><b>${rpN(x.n)}</b><div class="bar"><i style="width:${(x.n || 0) / M * 100}%"></i></div></div></td>
      <td>${rpDelta(x.n || 0, x.n0 || 0)}</td>
      <td><b>${rpN(x.inst)}</b>${x.n && x.inst ? `<small>${Math.round(x.inst / x.n * 100)}%</small>` : ''}</td></tr>`;
  const since = C.since && C.since > `${m}-01` ? `<div class="rp-tip">ℹ️ Kanal dicatat sejak ${new Date(C.since + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}.</div>` : '';
  const sum = chSummary(rows);
  const tot = rows.reduce((s, x) => s + (x.n || 0), 0) + (D.n || 0) || 1, col = i => CH_COLORS[i % CH_COLORS.length];
  const mix = `<div class="rp-mini">Pembagian pengunjung</div><div class="rp-ch-mix">${rows.map((x, i) => `<i style="width:${x.n / tot * 100}%;background:${col(i)}"></i>`).join('')}<i style="width:${(D.n || 0) / tot * 100}%;background:#5a5d66"></i></div>
    <div class="rp-chips">${rows.slice(0, 7).map((x, i) => `<span><i style="background:${col(i)}"></i>${escHtml(chInfo(x.ch).t)} ${Math.round(x.n / tot * 100)}%</span>`).join('')}<span><i style="background:#5a5d66"></i>Langsung ${Math.round((D.n || 0) / tot * 100)}%</span></div>`;
  return `<div class="rp-c rp-ch"><h2>📍 Pengunjung datang dari · ${rpShort(m)} <small>orang · vs bulan lalu · pasang di HP</small></h2>
    <div class="rp-ch-in"><div><table class="rp-cht"><thead><tr><th>Kanal</th><th>Pengunjung</th><th>vs bln lalu</th><th>Pasang di HP</th></tr></thead><tbody>
      ${rows.map(x => row(chInfo(x.ch).ic, escHtml(chInfo(x.ch).t) + (CH_DEF[x.ch] ? '' : ` <small>?src=${escHtml(x.ch)}</small>`), x)).join('')}
      ${row('🏠', 'Langsung / lainnya <small>ketik alamat, ikon HP, bookmark</small>', D, 'dim')}
    </tbody></table>${rows.length ? '' : '<div class="rp-empty">Belum ada pengunjung dari link / QR berkode bulan ini.</div>'}</div>
    <div>${sum ? `<p class="rp-ch-sum">💡 ${sum}</p>` : ''}${mix}
      <div class="rp-tip">1 orang bisa datang dari beberapa kanal. <i>Pasang di HP</i> dihitung ke kanal <b>pertama</b> orang itu. Google, WhatsApp, Instagram, Facebook & TikTok juga dikenali otomatis tanpa kode.</div>${since}
      <div class="rp-ch-acts">${gen}</div></div></div></div>`;
}
function chCopySql() {
  const done = () => showToast('✓ SQL Kanal disalin — tempel di Supabase → SQL Editor → Run.', 6000);
  if (navigator.clipboard) navigator.clipboard.writeText(CHANNEL_SQL).then(done, () => prompt('Salin SQL ini:', CHANNEL_SQL)); else prompt('Salin SQL ini:', CHANNEL_SQL);
}

// ── C. Pembuat link & QR promosi (khusus Editor) ──
let chGenSel = 'ig', chGenOther = '';
function chGenOpen(c) {
  if (typeof isEditor === 'function' && !isEditor()) { showToast('Khusus Editor.'); return; }
  if (c) chGenSel = c;
  let ov = document.getElementById('ch-gen');
  if (!ov) { ov = document.createElement('div'); ov.id = 'ch-gen'; ov.className = 'chg-ov'; ov.onclick = e => { if (e.target === ov) chGenClose(); }; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="chg-box" role="dialog" aria-label="Link & QR promosi"><button class="chg-x" onclick="chGenClose()" aria-label="Tutup">✕</button>
    <div class="chg-k">🔒 Khusus Editor</div><h2 class="chg-h">🔗 Link & QR <em>promosi</em></h2>
    <p class="chg-sub">Satu link berkode untuk tiap tempat promosi — hasilnya terlihat di Rapor Bulanan › <b>📍 Pengunjung datang dari</b>.</p>
    <div class="chg-chips">${CH_CHIPS.map(c => `<button class="chg-chip${chGenSel === c ? ' on' : ''}" onclick="chGenPick('${c}')">${CH_DEF[c].ic} ${CH_DEF[c].chip}</button>`).join('')}
      <button class="chg-chip${chGenSel === '+' ? ' on' : ''}" onclick="chGenPick('+')">＋ Lainnya</button></div>
    <div id="chg-body"></div>
    <div class="chg-story"><div class="chg-sth"><canvas id="chg-st" width="270" height="480"></canvas></div><div>
      <b>🎬 Template Story / Reels</b><p>PNG 1080 × 1920 · latar hitam-emas · QR <code>?src=story</code> · 6 logo brand. Untuk Story Instagram/WA atau penutup Reels.</p>
      <button class="rp-btn g" onclick="chStoryPng()">⬇ Unduh Template Story</button></div></div></div>`;
  ov.classList.add('open');
  chGenBody();
  chStoryCanvas(document.getElementById('chg-st'));
}
function chGenClose() { document.getElementById('ch-gen')?.classList.remove('open'); }
function chGenPick(c) { chGenSel = c; document.querySelectorAll('#ch-gen .chg-chip').forEach(b => b.classList.toggle('on', b.getAttribute('onclick') === `chGenPick('${c}')`)); chGenBody(); }
const chGenCode = () => chGenSel === '+' ? chNorm(chGenOther) : chGenSel;
function chGenBody() {
  const el = document.getElementById('chg-body'); if (!el) return;
  const c = chGenCode(), other = chGenSel === '+';
  el.innerHTML = `${other ? `<label class="chg-in"><span>Nama kanal <small>huruf kecil, angka, tanda -, maks. 20 (mis. <code>pameran-jcc</code>, <code>brosur</code>)</small></span>
      <input id="chg-other" value="${escHtml(chGenOther)}" maxlength="24" placeholder="mis. brosur" oninput="chGenOther=this.value;chGenLive()" autocomplete="off"></label>` : ''}
    <div class="chg-res"><div class="chg-qr"><canvas id="chg-qr" width="440" height="440"></canvas></div><div class="chg-info">
      <div class="chg-lbl">Link</div><div class="chg-link" id="chg-link"></div>
      <div class="chg-acts"><button class="rp-btn g" onclick="chGenCopy()">📋 Salin link</button><button class="rp-btn" onclick="chGenQrPng()">⬇ QR PNG</button></div>
      <p class="chg-tip" id="chg-tip"></p></div></div>`;
  chGenLive();
  if (other) setTimeout(() => document.getElementById('chg-other')?.focus(), 30);
}
function chGenLive() {
  const c = chGenCode(), lk = document.getElementById('chg-link'), cv = document.getElementById('chg-qr'), tip = document.getElementById('chg-tip');
  if (!lk) return;
  lk.innerHTML = c ? `hub.concerto.id/?src=<b>${escHtml(c)}</b>` : '<span class="mut">Ketik nama kanal…</span>';
  tip.innerHTML = c ? (CH_DEF[c]?.tip || `Kanal baru <b>${escHtml(c)}</b> — muncul di Rapor sebagai <i>🏷 ${escHtml(c)}</i>.`) + ' QR: ECC Q (tetap terbaca walau sebagian tertutup/kotor).' : '';
  const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height);
  if (c) qrCanvas(chLink(c), cv.width, { canvas: cv, margin: 3 }); else { x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(0, 0, cv.width, cv.height); }
}
function chGenCopy() {
  const c = chGenCode(); if (!c) { showToast('Ketik nama kanal dulu.'); return; }
  const u = chLink(c);
  (navigator.clipboard?.writeText(u) || Promise.reject()).then(() => showToast('📋 Link disalin: ' + u), () => prompt('Salin link ini:', u));
}
function chDownload(cv, name) {
  cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); showToast('✓ ' + name + ' diunduh'); }, 'image/png');
}
function chGenQrPng() {
  const c = chGenCode(); if (!c) { showToast('Ketik nama kanal dulu.'); return; }
  chDownload(qrCanvas(chLink(c), 1200, { margin: 4 }), `QR-CAI-Hub-${c}.png`);   // 1200 px · margin 4 modul (standar) · siap cetak
}

// ── D. Template Story / Reels 1080×1920 (canvas, tanpa library) ──
const CH_IMG = {};
const chImg = src => CH_IMG[src] || (CH_IMG[src] = new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }));
async function chStoryCanvas(target) {
  const W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  try { await Promise.all(['700 150px Sora', '600 40px Sora', '500 34px Inter', '600 26px "JetBrains Mono"'].map(f => document.fonts.load(f))); } catch (e) {}
  const G1 = '#e9cf98', G2 = '#c9a45c', G3 = '#8d6a2c';
  // latar hitam pekat + cahaya emas + garis tipis
  x.fillStyle = '#060608'; x.fillRect(0, 0, W, H);
  const glow = (cx, cy, r, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(201,164,92,${a})`); g.addColorStop(1, 'rgba(201,164,92,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); };
  glow(W / 2, 330, 760, .20); glow(W / 2, 1150, 620, .16); glow(W * .1, H, 700, .10); glow(W * .95, H * .05, 500, .08);
  x.strokeStyle = 'rgba(233,207,152,.05)'; x.lineWidth = 1;
  for (let i = 0; i <= W; i += 60) { x.beginPath(); x.moveTo(i + .5, 0); x.lineTo(i + .5, H); x.stroke(); }
  for (let i = 0; i <= H; i += 60) { x.beginPath(); x.moveTo(0, i + .5); x.lineTo(W, i + .5); x.stroke(); }
  const fade = x.createLinearGradient(0, 0, 0, H); fade.addColorStop(0, 'rgba(6,6,8,.0)'); fade.addColorStop(.5, 'rgba(6,6,8,.55)'); fade.addColorStop(1, 'rgba(6,6,8,.0)');
  x.fillStyle = fade; x.fillRect(0, 0, W, H);
  // heksagon garis tipis di belakang judul (bentuk logo CAI)
  const hex = (cx, cy, r, w, a) => { x.save(); x.strokeStyle = `rgba(233,207,152,${a})`; x.lineWidth = w; x.beginPath(); for (let i = 0; i < 6; i++) { const t = Math.PI / 3 * i - Math.PI / 2; x[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(t), cy + r * Math.sin(t)); } x.closePath(); x.stroke(); x.restore(); };
  hex(W / 2, 470, 470, 2, .10); hex(W / 2, 470, 430, 1, .07);
  // garis emas atas & bawah (bingkai)
  const gold = (y0, y1) => { const g = x.createLinearGradient(0, y0, W, y1); g.addColorStop(0, G3); g.addColorStop(.45, G1); g.addColorStop(.55, '#fff3d6'); g.addColorStop(1, G2); return g; };
  x.strokeStyle = 'rgba(233,207,152,.35)'; x.lineWidth = 2; x.strokeRect(36, 36, W - 72, H - 72);
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  // logo CAI
  const logo = await chImg(typeof LOGO_WHITE !== 'undefined' ? LOGO_WHITE : 'assets/intro/logo-white.png');
  if (logo) { const lw = 300, lh = lw * logo.height / logo.width; x.drawImage(logo, (W - lw) / 2, 205, lw, lh); }
  // OFFICIAL BRAND HUB
  x.font = '600 28px "JetBrains Mono", monospace'; x.fillStyle = G2;
  const spaced = (t, y, sp) => { const ch = [...t], w = ch.reduce((s, c) => s + x.measureText(c).width + sp, -sp); let cx = (W - w) / 2; x.textAlign = 'left'; ch.forEach(c => { x.fillText(c, cx, y); cx += x.measureText(c).width + sp; }); x.textAlign = 'center'; };
  spaced('OFFICIAL BRAND HUB', 420, 10);
  x.fillStyle = gold(0, 0); x.fillRect(W / 2 - 160, 446, 90, 2); x.fillRect(W / 2 + 70, 446, 90, 2);
  x.beginPath(); x.moveTo(W / 2, 438); x.lineTo(W / 2 + 8, 447); x.lineTo(W / 2, 456); x.lineTo(W / 2 - 8, 447); x.closePath(); x.fill();
  // CAI Hub
  x.font = '700 168px Sora, sans-serif';
  const w1 = x.measureText('CAI ').width, w2 = x.measureText('Hub').width, sx = (W - w1 - w2) / 2;
  x.textAlign = 'left'; x.fillStyle = '#ffffff'; x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 30; x.fillText('CAI ', sx, 630);
  x.fillStyle = gold(sx + w1, 0); x.shadowColor = 'rgba(201,164,92,.45)'; x.shadowBlur = 40; x.fillText('Hub', sx + w1, 630); x.shadowBlur = 0; x.textAlign = 'center';
  // tagline 3 poin
  x.font = '500 36px Inter, sans-serif'; x.fillStyle = 'rgba(255,255,255,.86)';
  x.fillText('Spesifikasi lengkap · Harga SRP', W / 2, 714);
  x.fillText('Partner resmi terdekat', W / 2, 764);
  // kartu QR putih bertepi emas
  const qs = 520, qx = (W - qs) / 2, qy = 840, rr = 34;
  const rrect = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  x.save(); x.shadowColor = 'rgba(201,164,92,.55)'; x.shadowBlur = 70; rrect(qx - 16, qy - 16, qs + 32, qs + 32, rr + 10); x.fillStyle = gold(qx, qy); x.fill(); x.restore();
  rrect(qx - 6, qy - 6, qs + 12, qs + 12, rr); x.fillStyle = '#fff'; x.fill();
  qrDraw(x, qrMatrix(chLink('story'), 'Q'), qx + 14, qy + 14, qs - 28, { margin: 2, fg: '#0a0a0c' });
  // ajakan + alamat
  x.font = '700 48px Sora, sans-serif'; x.fillStyle = '#fff'; x.fillText('Scan / ketuk link di bio', W / 2, 1462);
  x.font = '600 40px "JetBrains Mono", monospace'; x.fillStyle = gold(W / 2 - 200, 0); x.fillText('hub.concerto.id', W / 2, 1526);
  // 6 logo brand (3 × 2)
  const brands = (typeof BRANDS !== 'undefined' ? BRANDS : []).filter(b => b.logo).slice(0, 6);
  const imgs = await Promise.all(brands.map(b => chImg(b.logo)));
  x.fillStyle = 'rgba(233,207,152,.28)'; x.fillRect(140, 1572, W - 280, 1);
  const cw = 250, chh = 64, gx = (W - cw * 3) / 2;
  imgs.forEach((im, i) => { if (!im) return; const cx = gx + (i % 3) * cw + cw / 2, cy = 1630 + Math.floor(i / 3) * 84;
    const s = Math.min(170 / im.width, chh / im.height), w = im.width * s, h = im.height * s; x.globalAlpha = .92; x.drawImage(im, cx - w / 2, cy - h / 2, w, h); x.globalAlpha = 1; });
  if (target) { const t = target.getContext('2d'); t.clearRect(0, 0, target.width, target.height); t.drawImage(cv, 0, 0, target.width, target.height); }
  return cv;
}
async function chStoryPng() { showToast('⏳ Menyiapkan template Story…', 4000); chDownload(await chStoryCanvas(), 'Story-CAI-Hub-1080x1920.png'); }
