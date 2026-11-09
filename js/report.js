/* ══════════════════════════════════════════
   📊 RAPOR BULANAN — khusus Editor (4 Nov 2026, permintaan pemilik — pratinjau .mockup/rapor/)
   Angka dari RPC monthly_report(p_from, p_to) (supabase/report.sql = REPORT_SQL); Academy dihitung di klien (acadAll()).
   Notifikasi tiap tanggal 1 pukul 08.00 WIB ke HP Editor (Edge Function cway-push → monthlyReport()), ketuk = /?rapor=YYYY-MM.
   Unduh PNG / Bagikan: html2canvas (cdnjs, dimuat saat dipakai).
   📍 Kotak "Pengunjung datang dari" + tombol 🔗 Link & QR promosi: js/channel.js (Branding no. 7, 6 Nov 2026).
══════════════════════════════════════════ */
const RP_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const RP_MIN = '2026-10';   // data pengunjung mulai dicatat 30 Okt 2026
const REPORT_SQL = `-- 📊 Rapor Bulanan Editor (4 Nov 2026; + kotak 📍 kanal 6 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run (aman dijalankan ulang)
-- Butuh tabel dari SQL sebelumnya: site_visits (Pengunjung Portal), site_app_events (Pemasangan CAI Hub),
-- site_interest (Minat Pengunjung), cway_push_subs (Notifikasi). Tanpa data pribadi.

-- 1) Catat HP yang mulai / berhenti berlangganan notifikasi (dihitung per hari, tanpa endpoint)
create table if not exists public.push_sub_log (
  day date not null,
  kind text not null,   -- on = mulai berlangganan · off = berhenti / langganan kedaluwarsa
  n int not null default 0,
  primary key (day, kind)
);
alter table public.push_sub_log enable row level security;
create or replace function public.push_sub_log_mark() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into push_sub_log (day, kind, n) values ((now() at time zone 'Asia/Jakarta')::date, case when tg_op = 'INSERT' then 'on' else 'off' end, 1)
  on conflict (day, kind) do update set n = push_sub_log.n + 1;
  return null;
end $$;
drop trigger if exists push_sub_log_mark on public.cway_push_subs;
create trigger push_sub_log_mark after insert or delete on public.cway_push_subs for each row execute function public.push_sub_log_mark();
revoke execute on function public.push_sub_log_mark() from public, anon, authenticated;   -- hanya dipakai sebagai trigger (8 Nov 2026, saran pemeriksa keamanan Supabase)

-- 2) Minat Pengunjung: + kind 'open' (News / Galeri / Academy / Concerto Way / Acara dibuka; 1× per orang per hari)
--    (definisi sama dengan supabase/interest.sql — bila diubah, samakan kedua file & konstanta INT_SQL / REPORT_SQL)
create or replace function public.log_interest(p_vid text, p_kind text, p_ref text, p_src text default '')
returns void language plpgsql security definer set search_path = public as $$
declare r text := left(btrim(coalesce(p_ref, '')), 120); s text := left(coalesce(p_src, ''), 20);
begin
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 or r = '' then return; end if;
  if p_kind not in ('view', 'wa', 'maps', 'ig', 'city', 'search', 'fav', 'cmp', 'rk', 'share', 'car', 'carq', 'finder', 'fdgo', 'open') then return; end if;
  if p_kind in ('search', 'carq') then r := lower(r); end if;
  insert into site_interest (day, vid, kind, ref, src) values ((now() at time zone 'Asia/Jakarta')::date, p_vid, p_kind, r, s)
  on conflict (day, vid, kind, ref, src) do update set n = least(site_interest.n + 1, 50)
    where site_interest.kind not in ('view', 'car', 'finder', 'open');   -- dibuka: 1× per orang per hari
end $$;
grant execute on function public.log_interest(text, text, text, text) to anon, authenticated;

-- 3) Notifikasi rapor: sekali per bulan (diisi Edge Function cway-push tiap tanggal 1 pagi)
create table if not exists public.monthly_push (
  month date primary key,   -- tanggal 1 bulan yang dilaporkan
  sent_at timestamptz not null default now(),
  counts jsonb
);
alter table public.monthly_push enable row level security;

-- 4) Angka rapor untuk rentang tanggal WIB [p_from, p_to] + pembanding: rentang yang sama di bulan sebelumnya
create or replace function public.monthly_report(p_from date, p_to date)
returns json language plpgsql security definer set search_path = public as $$
declare a date := p_from; b date := least(p_to, p_from + 31);
  pa date := (p_from - interval '1 month')::date; pb date := least((b - interval '1 month')::date, p_from - 1);
  g text := coalesce(auth.jwt() ->> 'role', ''); ch json;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('editor', 'manager') and g <> 'service_role' then raise exception 'not allowed'; end if;   -- khusus Editor
  -- 📍 kanal kunjungan (supabase/channels.sql, 6 Nov 2026) — null bila SQL kanal belum dijalankan
  begin execute 'select public.channel_stats($1, $2, $3, $4)' into ch using a, b, pa, pb;
  exception when undefined_function or undefined_table then ch := null; end;
  return json_build_object(
    'channels', ch,
    'from', a, 'to', b, 'pfrom', pa, 'pto', pb,
    'first_day', (select min(day) from site_visits),
    'vis', (select json_build_object(
        'people', count(distinct vid) filter (where day between a and b), 'people0', count(distinct vid) filter (where day between pa and pb),
        'visits', coalesce(sum(visits) filter (where day between a and b), 0), 'visits0', coalesce(sum(visits) filter (where day between pa and pb), 0),
        'logged', count(distinct vid) filter (where logged and day between a and b), 'logged0', count(distinct vid) filter (where logged and day between pa and pb))
      from site_visits where day between pa and b),
    'daily', (select coalesce(json_agg(t order by t.day), '[]') from (
        select day, count(*) n, count(*) filter (where logged) l from site_visits where day between a and b group by day) t),
    'app', (select json_build_object(
        'install', count(distinct vid) filter (where kind = 'install' and day between a and b), 'install0', count(distinct vid) filter (where kind = 'install' and day between pa and pb),
        'qr', count(distinct vid) filter (where kind = 'qr' and day between a and b),
        'standalone', count(distinct vid) filter (where kind = 'standalone' and day between a and b))
      from site_app_events where day between pa and b),
    'push', json_build_object(
        'now', (select count(*) from cway_push_subs),
        'on', (select coalesce(sum(n), 0) from push_sub_log where kind = 'on' and day between a and b),
        'off', (select coalesce(sum(n), 0) from push_sub_log where kind = 'off' and day between a and b),
        'logged', exists (select 1 from push_sub_log)),
    'views', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'view' and day between a and b group by ref order by 2 desc, 1 limit 10) t),
    'views0', (select coalesce(json_agg(t.ref order by t.n desc, t.ref), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'view' and day between pa and pb group by ref order by 2 desc, 1 limit 50) t),
    'click', (select json_build_object(
        'wa', coalesce(sum(n) filter (where kind = 'wa' and day between a and b), 0), 'maps', coalesce(sum(n) filter (where kind = 'maps' and day between a and b), 0),
        'ig', coalesce(sum(n) filter (where kind = 'ig' and day between a and b), 0), 'total0', coalesce(sum(n) filter (where day between pa and pb), 0))
      from site_interest where kind in ('wa', 'maps', 'ig') and day between pa and b),
    'partners', (select coalesce(json_agg(t), '[]') from (
        select ref, sum(n) n from site_interest where kind in ('wa', 'maps', 'ig') and day between a and b group by ref order by 2 desc, 1 limit 5) t),
    'psrc', (select coalesce(json_agg(t), '[]') from (
        select src, sum(n) n from site_interest where kind in ('wa', 'maps', 'ig') and day between a and b group by src order by 2 desc) t),
    'miss', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'search' and src = 'miss' and day between a and b group by ref
        having count(distinct vid) >= 2 order by 2 desc, 1 limit 6) t),
    'cars', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'car' and day between a and b group by ref order by 2 desc, 1 limit 5) t),
    'car_miss', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'carq' and src = 'miss' and length(ref) >= 3 and day between a and b group by ref
        having count(distinct vid) >= 2 order by 2 desc, 1 limit 3) t),
    'finder', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'finder' and day between a and b group by ref order by 2 desc, 1 limit 60) t),
    'opens', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'open' and day between a and b group by ref order by 2 desc, 1 limit 8) t),
    'content', json_build_object(
        'news', (select count(*) from cai_news where published and post_date between a and b),
        'cway', (select count(*) from concerto_way where published and coalesce((publish_at at time zone 'Asia/Jakarta')::date, post_date) between a and b and (publish_at is null or publish_at <= now())),
        'cway_days', (select json_build_array(min(day), max(day)) from concerto_way where published and coalesce((publish_at at time zone 'Asia/Jakarta')::date, post_date) between a and b and (publish_at is null or publish_at <= now())),
        'gallery', (select count(*) from showcase_installs where published and (coalesce(publish_at, created_at) at time zone 'Asia/Jakarta')::date between a and b and coalesce(publish_at, created_at) <= now()),
        'events', (select count(*) from cai_events where published and (created_at at time zone 'Asia/Jakarta')::date between a and b),
        'guides', (select count(*) from storage.objects where bucket_id = 'guides' and name ~* '^[^/]+/[^/]+\\.pdf$'
                    and name !~ '^(pending|thumbs|gathering)/' and (coalesce(updated_at, created_at) at time zone 'Asia/Jakarta')::date between a and b)));
end $$;
revoke all on function public.monthly_report(date, date) from public, anon;
grant execute on function public.monthly_report(date, date) to authenticated, service_role;
`;

let rpMonth = null, rpCache = {}, rpErr = '', rpMissing = false, rpPending = null, rpBusy = false;

const rpNow = () => todayWIB().slice(0, 7);
const rpShift = (m, d) => { const [y, mo] = m.split('-').map(Number), t = new Date(Date.UTC(y, mo - 1 + d, 1)); return t.toISOString().slice(0, 7); };
const rpLabel = m => { const [y, mo] = m.split('-').map(Number); return `${RP_MONTHS[mo - 1]} ${y}`; };
const rpShort = m => { const [y, mo] = m.split('-').map(Number); return `${RP_MONTHS[mo - 1].slice(0, 3)} ${y}`; };
function rpRange(m) {
  const [y, mo] = m.split('-').map(Number), last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10), t = todayWIB();
  return { from: `${m}-01`, to: last < t ? last : t, running: last >= t };
}
// bawaan: bulan lalu (lengkap); selama bulan lalu sebelum data lengkap (Okt 2026) → bulan berjalan
function rpDefault() { const p = rpShift(rpNow(), -1); return p > RP_MIN ? p : rpNow(); }

function openRapor(m) {
  if (!requireLogin(() => openRapor(m))) return;
  if (!isReporter()) { showToast('Rapor Bulanan khusus Editor.'); showView('dashboard'); return; }
  if (m && /^\d{4}-\d{2}$/.test(m)) rpMonth = m > rpNow() ? rpNow() : m < RP_MIN ? RP_MIN : m;
  if (!rpMonth) rpMonth = rpDefault();
  showView('rapor');
  // judul konten (News, Galeri, Acara, Concerto Way) untuk "Konten paling dibuka"
  if (typeof loadGaleri === 'function' && !glItems) loadGaleri().then(() => rpRender()).catch(() => {});
  if (typeof loadCway === 'function' && !cwItems) Promise.resolve(loadCway()).then(() => rpRender()).catch(() => {});
  rpLoad();
}
function rpGo(d) { const m = rpShift(rpMonth, d); if (m < RP_MIN || m > rpNow()) return; rpMonth = m; rpLoad(); }
function rpAuthChanged() {
  if (rpPending) { const m = rpPending; rpPending = null; openRapor(m); if (!authUser && typeof setLoginMode === 'function') setLoginMode(true); }   // link notifikasi: form login staff (email)
  if (!isReporter() && document.getElementById('view-rapor')?.classList.contains('active')) showView('dashboard');
}
async function rpLoad(force) {
  const m = rpMonth, r = rpRange(m), k = `${m}|${r.to}`;
  if (force) gscData = {};   // ↻ juga memuat ulang angka Google Search
  rpRender();
  if (rpCache[k] && !force) return;
  if (typeof supabase === 'undefined' || !supabase) { setTimeout(() => rpLoad(force), 800); return; }
  rpBusy = true; rpErr = ''; rpRender();
  const { data, error } = await supabase.rpc('monthly_report', { p_from: r.from, p_to: r.to });
  rpBusy = false;
  if (error) {
    rpMissing = /monthly_report|function|schema cache|does not exist|push_sub_log/i.test(error.message || '');
    rpErr = rpMissing ? '' : (error.message || String(error));
  } else { rpMissing = false; rpCache[k] = data; }
  rpRender();
}
function rpCopySql() {
  const done = () => showToast('✓ SQL Rapor Bulanan disalin — tempel di Supabase → SQL Editor → Run.', 6000);
  if (navigator.clipboard) navigator.clipboard.writeText(REPORT_SQL).then(done, () => prompt('Salin SQL ini:', REPORT_SQL)); else prompt('Salin SQL ini:', REPORT_SQL);
}

const rpN = n => Number(n || 0).toLocaleString('id-ID');
function rpDelta(n, n0, pct = true) {
  if (!n0) return n ? '<span class="rp-d up">baru</span>' : '';
  const d = pct ? Math.round((n - n0) / n0 * 100) : n - n0;
  if (!d) return '<span class="rp-d">= sama</span>';
  return `<span class="rp-d ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${pct ? '%' : ''}</span>`;
}
const rpDayLabel = iso => { const d = new Date(iso + 'T00:00:00Z'); return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
const rpPartnerCity = name => { const d = (typeof adPublic === 'function' ? adPublic() : []).find(x => normKey(x.n) === normKey(name)); return d?.c || ''; };
function rpAcad(r) { return (typeof acadAll === 'function' ? acadAll() : []).filter(a => { const d = a.at ? new Date(Date.parse(a.at) + 7 * 3600e3).toISOString().slice(0, 10) : a.date; return d && d >= r.from && d <= r.to && (!a.at || Date.parse(a.at) <= Date.now()); }).length; }
// judul untuk ref "news:<id>" · "gl:<id>" · "acad:<no>" · "cw:<id>" · "ev:<id>"
function rpOpenInfo(ref) {
  const [k, id] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
  if (k === 'news') { const it = (nwItems || []).find(x => x.id === id); return { t: '📰 News · ' + (it?.title || 'berita'), fn: it ? `openNews('${id}')` : '' }; }
  if (k === 'gl') { const it = (glItems || []).find(x => x.id === id); return { t: '🚗 Galeri · ' + (it ? [it.car_make, it.car_model].filter(Boolean).join(' ') + (it.dealer ? ' — ' + it.dealer : '') : 'instalasi'), fn: it ? `openGaleri();openGlDetail('${id}')` : '' }; }
  if (k === 'acad') { const it = (typeof acadAll === 'function' ? acadAll() : []).find(x => String(x.no) === id); return { t: `🎓 Academy #${id}` + (it ? ' · ' + it.title : ''), fn: it ? `openAcademyItem(${Number(id)})` : '' }; }
  if (k === 'cw') { const it = (cwItems || []).find(x => x.id === id); return { t: '☕ Concerto Way · ' + (it ? (it.day ? `Day ${it.day} · ` : '') + it.title : 'postingan'), fn: it ? `openCway('${id}')` : '' }; }
  if (k === 'ev') { const it = (evItems || []).find(x => x.id === id); return { t: '📅 Acara · ' + (it?.title || 'acara'), fn: it ? `openEvents('${id}')` : '' }; }
  return { t: ref, fn: '' };
}
function rpFinder(rows) {
  const tot = {}, by = { b: {}, t: {} };
  let people = 0;
  for (const r of rows || []) { const [b, t] = r.ref.split('|'); people += r.n; by.b[b] = (by.b[b] || 0) + r.n; by.t[t] = (by.t[t] || 0) + r.n; tot[r.ref] = r.n; }
  const top = o => Object.entries(o).sort((x, y) => y[1] - x[1])[0]?.[0];
  return { people, budget: FD_BUDGETS.find(x => x.id === top(by.b))?.t || '', taste: FD_TASTES.find(x => x.id === top(by.t))?.t || '' };
}
// ringkasan otomatis (3–4 kalimat)
function rpInsights(S, r) {
  const out = [], v = S.vis || {};
  if (v.people) {
    const d = v.people0 ? Math.round((v.people - v.people0) / v.people0 * 100) : null;
    const top = [...(S.daily || [])].sort((a, b) => b.n - a.n)[0];
    out.push(`Pengunjung ${d == null ? '' : d >= 0 ? `naik <b>+${d}%</b> ` : `turun <b>${d}%</b> `}(${rpN(v.people)} orang)` + (top ? `. Hari teramai <b>${rpDayLabel(top.day)}</b> — ${rpN(top.n)} orang.` : '.'));
  }
  const vw = S.views || [];
  if (vw.length) {
    const nm = id => { const f = findProductAny(id); return f.product ? `${f.brand.name} ${f.product.name}` : id; };
    let up = null;
    vw.forEach((x, i) => { const j = (S.views0 || []).indexOf(x.ref); const g = j < 0 ? null : j - i; if (g != null && g >= 3 && (!up || g > up.g)) up = { ref: x.ref, g, from: j + 1, to: i + 1 }; });
    out.push(`<b>${escHtml(nm(vw[0].ref))}</b> paling banyak dilihat` + (up ? `; <b>${escHtml(nm(up.ref))}</b> naik dari peringkat ${up.from} ke ${up.to}.` : '.'));
  }
  const c = S.click || {}, ct = (c.wa || 0) + (c.maps || 0) + (c.ig || 0);
  if (ct) {
    const src = (S.psrc || [])[0], p = (S.partners || [])[0], d = c.total0 ? Math.round((ct - c.total0) / c.total0 * 100) : null;
    out.push(`<b>${rpN(ct)} klik ke partner</b>${d == null ? '' : ` (${d >= 0 ? '+' : ''}${d}%)`}` + (src ? `, ${Math.round(src.n / ct * 100)}% dari ${escHtml((INT_SRC[src.src] || [src.src || 'lainnya'])[0])}` : '') + (p ? `. Paling banyak diklik: <b>${escHtml(p.ref)}</b>${rpPartnerCity(p.ref) ? ', ' + escHtml(rpPartnerCity(p.ref)) : ''}.` : '.'));
  }
  const ms = (S.miss || [])[0];
  if (ms) out.push(`“<b>${escHtml(ms.ref)}</b>” dicari ${rpN(ms.n)} orang tapi tidak ketemu di katalog — pertimbangkan info, sinonim pencarian, atau produk/paket terkait.`);
  if (S.app?.install) out.push(`<b>${rpN(S.app.install)} orang</b> memasang CAI Hub di HP` + (S.app.qr ? ` · ${rpN(S.app.qr)} orang scan kartu QR toko.` : '.'));
  return out.slice(0, 4);
}

function rpRender() {
  const box = document.getElementById('rapor-body'); if (!box) return;
  if (!isReporter()) { box.innerHTML = '<div class="stock-empty">Rapor Bulanan khusus Editor.</div>'; return; }
  const m = rpMonth || rpDefault(), r = rpRange(m), S = rpCache[`${m}|${r.to}`];
  const prev = rpShift(m, -1), next = rpShift(m, 1);
  const dr = `${Number(r.from.slice(8))}–${Number(r.to.slice(8))} ${rpLabel(m)}`;
  const head = `<div class="rp-top"><div>
      <div class="rp-k">📊 Rapor bulanan · CAI Hub</div>
      <h1 class="rp-h">Rapor <em>${rpLabel(m)}</em></h1>
      <p class="rp-sub">${dr}${r.running ? ' <b class="rp-run">bulan berjalan</b>' : ''} · dibandingkan ${r.running ? `1–${Number(r.to.slice(8))} ` : ''}${rpLabel(prev)}</p>
      <span class="rp-lock">🔒 Khusus Editor · tanpa data pribadi pengunjung</span></div>
    <div class="rp-acts" data-html2canvas-ignore>
      <div class="rp-mon"><button class="rp-btn" onclick="rpGo(-1)" ${prev < RP_MIN ? 'disabled' : ''} aria-label="Bulan sebelumnya">‹</button><span>${rpShort(m)}</span><button class="rp-btn" onclick="rpGo(1)" ${next > rpNow() ? 'disabled' : ''} aria-label="Bulan berikutnya">›</button></div>
      <button class="rp-btn" onclick="rpLoad(true)" title="Muat ulang">↻</button>
      <button class="rp-btn editor-only" onclick="chGenOpen()" title="Link & QR promosi per kanal">🔗 Link & QR</button>
      <button class="rp-btn" onclick="rpShare()" ${S ? '' : 'disabled'}>${typeof SHARE_ICON !== 'undefined' ? SHARE_ICON : ''} Bagikan</button>
      <button class="rp-btn g" onclick="rpPng()" ${S ? '' : 'disabled'}>⬇ Unduh PNG</button></div></div>`;
  if (rpMissing) { box.innerHTML = `<div class="rp-sheet">${head}<div class="rp-ins"><h3>⚙️ SQL Rapor Bulanan belum dijalankan</h3><p>Jalankan sekali di Supabase → SQL Editor → Run (file <code>supabase/report.sql</code>).</p><button class="rp-btn g" onclick="rpCopySql()">📋 Salin SQL Rapor Bulanan</button></div></div>`; return; }
  if (!S) { box.innerHTML = `<div class="rp-sheet">${head}<div class="stock-empty">${rpErr ? '⚠ ' + escHtml(rpErr) : '⏳ Menyusun rapor…'}</div></div>`; return; }
  const v = S.vis || {}, a = S.app || {}, c = S.click || {}, P = S.push || {}, ct = (c.wa || 0) + (c.maps || 0) + (c.ig || 0);
  const ins = rpInsights(S, r);
  const early = S.first_day && S.first_day > r.from ? `<p class="rp-note">ℹ️ Data pengunjung baru dicatat sejak ${new Date(S.first_day + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}; minat pengunjung (produk, klik partner, pencarian) sejak 4 Nov 2026.</p>` : '';
  const kpi = (ic, lbl, val, d, x) => `<div class="rp-c rp-kp"><small>${ic} ${lbl}</small><div class="v">${val}</div>${d}${x ? ` <span class="x">· ${x}</span>` : ''}</div>`;
  // grafik harian
  const days = [], mx = Math.max(1, ...(S.daily || []).map(x => x.n)), dm = Object.fromEntries((S.daily || []).map(x => [x.day, x]));
  for (let d = new Date(r.from + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= r.to; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10), x = dm[iso] || { n: 0, l: 0 }, we = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    days.push(`<i class="${we ? 'we' : ''}" style="height:${Math.max(x.n ? 3 : 0, x.n / mx * 100)}%" title="${rpDayLabel(iso)} · ${x.n} orang${x.l ? ` · ${x.l} partner login` : ''}"><u style="height:${x.n ? x.l / x.n * 100 : 0}%"></u></i>`);
  }
  const nd = days.length, ax = [1, Math.round(nd / 4), Math.round(nd / 2), Math.round(nd * 3 / 4), nd].filter((x, i, A) => x >= 1 && A.indexOf(x) === i);
  // produk
  const prods = (S.views || []).map((x, i) => {
    const f = findProductAny(x.ref), j = (S.views0 || []).indexOf(x.ref), g = j < 0 ? null : j - i;
    const ph = f.product ? (f.product.photo || f.product.photos?.[0]) : '';
    return `<button class="rp-pr" ${f.product ? `onclick="showProduct('${f.brand.id}','${f.product.id}')"` : ''}><span class="n">${i + 1}</span>${ph ? `<img src="${escHtml(ph)}" alt="" loading="lazy">` : `<span class="em">${f.product?.emoji || '📦'}</span>`}
      <span class="t"><b>${escHtml(f.product ? `${f.brand.name} ${f.product.name}` : x.ref)}</b><small>${escHtml(f.product?.category || '')}</small></span>
      <span class="val">${rpN(x.n)}<em class="${g == null ? 'nw' : g > 0 ? 'up' : g < 0 ? 'dn' : ''}">${g == null ? 'baru' : g > 0 ? '▲ ' + g : g < 0 ? '▼ ' + -g : '= ' + (j + 1)}</em></span></button>`;
  }).join('') || '<div class="rp-empty">Belum ada data produk dilihat.</div>';
  const bars = (rows, lbl, val, w, extra = () => '') => { const M = Math.max(1, ...rows.map(val)); return rows.map(x => `<div class="rp-row"><div>${lbl(x)}</div><span class="val">${rpN(val(x))}</span><div class="bar"><i style="width:${val(x) / M * 100}%${extra(x)}"></i></div></div>`).join(''); };
  const partners = (S.partners || []).length ? bars(S.partners, x => `<b>${escHtml(x.ref)}</b>${rpPartnerCity(x.ref) ? ` <small>· ${escHtml(rpPartnerCity(x.ref))}</small>` : ''}`, x => x.n) : '<div class="rp-empty">Belum ada klik ke partner.</div>';
  const src = (S.psrc || []).filter(x => x.n), stot = src.reduce((s, x) => s + x.n, 0) || 1;
  const srcBar = src.length ? `<div class="rp-mini">Klik datang dari</div><div class="rp-src">${src.map(x => `<i style="width:${x.n / stot * 100}%;background:${(INT_SRC[x.src] || INT_SRC.lain)[1]}"></i>`).join('')}</div>
    <div class="rp-chips">${src.slice(0, 6).map(x => `<span><i style="background:${(INT_SRC[x.src] || INT_SRC.lain)[1]}"></i>${escHtml((INT_SRC[x.src] || [x.src || 'Lainnya'])[0])} ${Math.round(x.n / stot * 100)}%</span>`).join('')}</div>` : '';
  const miss = (S.miss || []).map(x => `<div><span>${escHtml(x.ref)}</span><em>${rpN(x.n)}</em></div>`).join('');
  const carMap = typeof carList === 'function' ? Object.fromEntries(carList().map(x => [x.slug, x])) : {};
  const cars = (S.cars || []).length ? bars(S.cars, x => `<b>${escHtml(carMap[x.ref]?.name || x.ref.replace(/-/g, ' '))}</b>${carMap[x.ref] && !carMap[x.ref].gl?.length ? ' <small>· belum ada di Galeri</small>' : ''}`, x => x.n, x => carMap[x.ref] && !carMap[x.ref].gl?.length ? ';background:var(--rp-r)' : '') : '<div class="rp-empty">Belum ada data.</div>';
  const fd = rpFinder(S.finder);
  const cm = (S.car_miss || []).length ? `<div class="rp-tip">🔎 Dicari di Cari per Mobil tapi belum ada datanya: ${S.car_miss.map(x => `<b>${escHtml(x.ref)}</b> (${x.n})`).join(', ')}</div>` : '';
  const C = S.content || {}, acad = rpAcad(r), cwd = C.cway_days && C.cway_days[0] ? ` (Day ${C.cway_days[0]}${C.cway_days[1] !== C.cway_days[0] ? '–' + C.cway_days[1] : ''})` : '';
  const cnt = [[C.news, '📰 News'], [C.cway, '☕ Concerto Way' + cwd], [acad, '🎓 Academy'], [C.gallery, '🚗 Galeri Instalasi'], [C.guides, '📘 Panduan Partner'], [C.events, '📅 Acara']]
    .map(([n, t]) => `<div><b>${rpN(n)}</b><small>${t}</small></div>`).join('');
  const opens = (S.opens || []).slice(0, 5);
  const opensHtml = opens.length ? bars(opens, x => { const o = rpOpenInfo(x.ref); return `<b ${o.fn ? `class="lnk" onclick="${o.fn}"` : ''}>${escHtml(o.t)}</b>`; }, x => x.n) : '<div class="rp-empty">Mulai dicatat sejak rapor ini dibuat — angka muncul di bulan berikutnya.</div>';
  box.innerHTML = `<div class="rp-sheet" id="rp-sheet">${head}
    ${ins.length ? `<div class="rp-ins"><h3>💡 Ringkasan ${r.running ? 'sejauh ini' : 'bulan ini'}</h3><ul>${ins.map(x => `<li>${x}</li>`).join('')}</ul></div>` : ''}${early}
    <div class="rp-kpi">
      ${kpi('👥', 'Pengunjung', rpN(v.people), rpDelta(v.people, v.people0), `${rpN(v.visits)} kunjungan`)}
      ${kpi('🔑', 'Partner login', rpN(v.logged), rpDelta(v.logged, v.logged0), 'Kode Akses')}
      ${kpi('📲', 'Pasang di HP', rpN(a.install), rpDelta(a.install, a.install0, false), a.qr ? `${rpN(a.qr)} scan kartu QR` : 'dari ikon Layar Utama')}
      ${kpi('📞', 'Klik ke partner', rpN(ct), rpDelta(ct, c.total0), `WA ${rpN(c.wa)} · Maps ${rpN(c.maps)} · IG ${rpN(c.ig)}`)}
      ${kpi('🔔', 'Notifikasi aktif', rpN(P.now) + ' HP', P.logged ? `<span class="rp-d up">+${rpN(P.on)}</span>` : '', P.logged ? `${rpN(P.off)} berhenti` : 'mulai dicatat bulan ini')}
    </div>
    ${typeof chBoxHtml === 'function' ? chBoxHtml(S, m) : ''}
    ${gscBoxHtml(m)}
    <div class="rp-g2">
      <div class="rp-c"><h2>Pengunjung harian <small>orang berbeda per hari</small></h2>
        <div class="rp-chart">${days.join('')}</div>
        <div class="rp-ax">${ax.map(x => `<span>${x}${x === 1 || x === nd ? ' ' + RP_MONTHS[Number(m.slice(5)) - 1].slice(0, 3) : ''}</span>`).join('')}</div>
        <div class="rp-lg"><span><i style="background:var(--rp-g)"></i>Pengunjung</span><span><i style="background:var(--rp-b)"></i>Partner login</span><span><i class="we"></i>Sabtu–Minggu</span></div></div>
      <div class="rp-c"><h2>🔥 Produk paling dilihat <small>orang · peringkat lalu</small></h2><div class="rp-pl">${prods}</div></div>
    </div>
    <div class="rp-g3">
      <div class="rp-c"><h2>📞 Partner paling diklik <small>WA · Maps · IG</small></h2>${partners}${srcBar}</div>
      <div class="rp-c"><h2>❓ Dicari tapi tidak ketemu <small>orang</small></h2>${miss ? `<div class="rp-miss">${miss}</div><div class="rp-tip">💡 Kata yang sering dicari bisa dijadikan <b>sinonim pencarian</b> (mis. “peredam pintu” → produk peredam) — kirim daftarnya ke Claude.</div>` : '<div class="rp-empty">Tidak ada — semua pencarian (≥ 2 orang) menemukan produk.</div>'}</div>
      <div class="rp-c"><h2>🚗 Mobil paling dicari <small>orang</small></h2>${cars}${cm}${fd.people ? `<div class="rp-tip">🎯 Temukan Sistem dipakai <b>${rpN(fd.people)}×</b>${fd.budget ? ` · anggaran terbanyak <b>${escHtml(fd.budget)}</b>` : ''}${fd.taste ? ` · selera <b>${escHtml(fd.taste)}</b>` : ''}</div>` : ''}</div>
    </div>
    <div class="rp-g2">
      <div class="rp-c"><h2>📝 Konten terbit ${r.running ? 'sejauh ini' : 'bulan ini'}</h2><div class="rp-cnt">${cnt}</div></div>
      <div class="rp-c"><h2>⭐ Konten paling dibuka <small>orang</small></h2>${opensHtml}</div>
    </div>
    <div class="rp-foot"><span>CAI Hub · hub.concerto.id · disusun ${new Date().toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB</span><span>Angka = orang berbeda (1 HP/browser = 1 orang) · akun Admin/Editor tidak dihitung</span></div>
  </div>`;
}

// ── Unduh PNG / Bagikan (html2canvas dari cdnjs, dimuat saat dipakai) ──
let rpH2cP = null;
function rpH2c() {
  if (window.html2canvas) return Promise.resolve();
  return rpH2cP || (rpH2cP = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'; s.onload = ok; s.onerror = () => { rpH2cP = null; no(); }; document.head.appendChild(s); }));
}
async function rpBlob() {
  const el = document.getElementById('rp-sheet'); if (!el) return null;
  showToast('⏳ Menyiapkan gambar rapor…', 8000);
  try { await rpH2c(); } catch (e) { showToast('Komponen gambar belum termuat — periksa koneksi lalu coba lagi.'); return null; }
  el.classList.add('png');
  try {
    const bg = getComputedStyle(document.body).backgroundColor || '#0a0b0e';
    const cv = await html2canvas(el, { backgroundColor: bg, scale: 2, useCORS: true, logging: false, windowWidth: 1200, width: el.scrollWidth,
      ignoreElements: x => x.tagName === 'SCRIPT' || (x.nodeType === 1 && !x.contains(el) && !el.contains(x) && x !== el && x.tagName !== 'HEAD' && !x.closest?.('head')) });   // hanya rapor yang disalin (lebih cepat, tanpa onload menu lain)
    return await new Promise(res => cv.toBlob(res, 'image/png'));
  } finally { el.classList.remove('png'); }
}
const rpFile = () => `Rapor-CAI-Hub-${rpLabel(rpMonth).replace(' ', '-')}.png`;
async function rpPng() {
  const b = await rpBlob(); if (!b) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = rpFile(); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); showToast('✓ Rapor diunduh');
}
async function rpShare() {
  const r = rpRange(rpMonth), S = rpCache[`${rpMonth}|${r.to}`]; if (!S) return;
  const c = S.click || {}, ct = (c.wa || 0) + (c.maps || 0) + (c.ig || 0), v = S.vis || {};
  const d = v.people0 ? Math.round((v.people - v.people0) / v.people0 * 100) : null;
  const text = `📊 Rapor CAI Hub · ${rpLabel(rpMonth)}${r.running ? ' (sampai ' + Number(r.to.slice(8)) + ' ' + RP_MONTHS[Number(rpMonth.slice(5)) - 1] + ')' : ''}\n👥 ${rpN(v.people)} pengunjung${d == null ? '' : ` (${d >= 0 ? '▲' : '▼'}${Math.abs(d)}%)`}\n📞 ${rpN(ct)} klik ke partner\n📲 ${rpN(S.app?.install)} pasang di HP` + (gscData[rpMonth] ? `\n🔎 Google: ${rpN(gscData[rpMonth].clicks)} klik · posisi ${gscPos(gscData[rpMonth].position)}` : '') + (S.channels?.rows?.length ? `\n📍 Kanal teratas: ${[...S.channels.rows].sort((a, b) => b.n - a.n).slice(0, 3).map(x => `${chInfo(x.ch).t} ${rpN(x.n)}`).join(' · ')}` : '');
  const b = await rpBlob();
  if (b) { const f = new File([b], rpFile(), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = rpFile(); document.body.appendChild(a); a.click(); a.remove(); }
  window.open(`https://wa.me/?text=${waText(text)}`, '_blank', 'noopener');
}

// ── 🔎 GOOGLE SEARCH DI RAPOR BULANAN (Branding no. 8 C, 6 Nov 2026) — khusus Editor, diisi manual dari Search Console ──
// Tabel gsc_monthly (SQL sekali jalan supabase/gsc.sql = GSC_SQL). Kotak ikut PNG rapor bila sudah diisi.
const GSC_SQL = `-- 🔎 Google Search di Rapor Bulanan (Branding CAI Hub no. 8 C) — SQL sekali jalan, aman dijalankan ulang.
-- Editor mengetik angka dari Google Search Console tiap bulan; khusus Editor (baca & tulis).
create table if not exists public.gsc_monthly (
  month text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  clicks integer not null default 0 check (clicks >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  position numeric(5,1) check (position is null or position > 0),
  queries jsonb not null default '[]'::jsonb check (jsonb_typeof(queries) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.gsc_monthly enable row level security;
drop policy if exists "gsc editor" on public.gsc_monthly;
create policy "gsc editor" on public.gsc_monthly for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
revoke all on public.gsc_monthly from anon;
grant select, insert, update, delete on public.gsc_monthly to authenticated;`;
let gscData = {}, gscMissing = false, gscBusy = {};
const gscPrev = m => { const [y, mo] = m.split('-').map(Number), d = new Date(Date.UTC(y, mo - 2, 1)); return d.toISOString().slice(0, 7); };
async function gscLoad(m, force) {
  if (!m || (!force && (m in gscData)) || gscBusy[m] || typeof supabase === 'undefined' || !supabase?.from) return;
  gscBusy[m] = true;
  const p = gscPrev(m), { data, error } = await supabase.from('gsc_monthly').select('*').in('month', [m, p]);
  gscBusy[m] = false;
  if (error) { gscMissing = /gsc_monthly|does not exist|PGRST205|42P01/i.test(error.message + ' ' + error.code); gscData[m] = null; }
  else { gscMissing = false; gscData[m] = (data || []).find(x => x.month === m) || null; if (!(p in gscData)) gscData[p] = (data || []).find(x => x.month === p) || null; }
  if (rpMonth === m || (!rpMonth && m === rpDefault())) rpRender();
}
const gscN = v => Number(v || 0).toLocaleString('id-ID');
const gscPos = v => v == null ? '–' : Number(v).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const gscCtr = x => x && x.impressions ? x.clicks / x.impressions * 100 : null;
function gscPosDelta(a, b) {   // posisi: makin KECIL makin baik
  if (a == null || b == null) return '';
  const d = Math.round((b - a) * 10) / 10;
  if (!d) return '<span class="rp-d">= sama</span>';
  return `<span class="rp-d ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲ naik' : '▼ turun'} ${Math.abs(d).toLocaleString('id-ID')}</span>`;
}
function gscBoxHtml(m) {
  if (!(m in gscData)) { gscLoad(m); return `<div class="rp-c rp-gsc" data-html2canvas-ignore><h2>🔎 Google Search · ${rpShort(m)}</h2><div class="rp-empty">⏳ Memuat…</div></div>`; }
  const acts = `<div class="rp-ch-acts" data-html2canvas-ignore><button class="rp-btn g editor-only" onclick="gscOpenForm('${m}')">✏️ ${gscData[m] ? 'Ubah angka' : 'Isi angka'}</button><button class="rp-btn" onclick="gscGuide()">📖 Cara ambil angka</button></div>`;
  if (gscMissing) return `<div class="rp-c rp-gsc" data-html2canvas-ignore><h2>🔎 Google Search · ${rpShort(m)}</h2>
    <div class="rp-empty">⚙️ Tabel Google Search belum dibuat. Jalankan SQL ini sekali di Supabase → SQL Editor → Run (file <code>supabase/gsc.sql</code>).</div>
    <div class="rp-ch-acts"><button class="rp-btn g" onclick="gscCopySql()">📋 Salin SQL Google Search</button><button class="rp-btn" onclick="gscGuide()">📖 Cara ambil angka</button></div></div>`;
  const G = gscData[m], P = gscData[gscPrev(m)];
  if (!G) return `<div class="rp-c rp-gsc" data-html2canvas-ignore><h2>🔎 Google Search · ${rpShort(m)} <small>diisi manual dari Search Console</small></h2>
    <div class="rp-empty">Angka Google Search bulan ini belum diisi. Search Console biasanya lengkap ±2–3 hari setelah bulan berakhir.</div>${acts}</div>`;
  const ctr = gscCtr(G), ctr0 = gscCtr(P);
  const kp = (lbl, v, d, x) => `<div class="rp-gk"><small>${lbl}</small><b>${v}</b>${d || ''}${x ? `<span class="x">${x}</span>` : ''}</div>`;
  const qs = (G.queries || []).filter(q => q && q.q).slice(0, 5), M = Math.max(1, ...qs.map(q => q.c || 0));
  const prevQ = Object.fromEntries((P?.queries || []).map(q => [String(q.q).toLowerCase(), q.c || 0]));
  return `<div class="rp-c rp-gsc"><h2>🔎 Google Search · ${rpShort(m)} <small>dari Google Search Console · vs bulan lalu</small></h2>
    <div class="rp-gsc-in"><div class="rp-gks">
      ${kp('Klik dari Google', gscN(G.clicks), P ? rpDelta(G.clicks, P.clicks) : '')}
      ${kp('Tayangan', gscN(G.impressions), P ? rpDelta(G.impressions, P.impressions) : '', 'muncul di hasil pencarian')}
      ${kp('CTR', ctr == null ? '–' : ctr.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%', '', ctr0 == null ? '' : 'bulan lalu ' + ctr0.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%')}
      ${kp('Posisi rata-rata', gscPos(G.position), P ? gscPosDelta(G.position, P.position) : '', 'makin kecil makin atas')}</div>
    <div><div class="rp-mini">5 kata kunci teratas <small>klik</small></div>
      ${qs.length ? qs.map((q, i) => { const p0 = prevQ[String(q.q).toLowerCase()]; return `<div class="rp-row"><div><span class="rp-gq">${i + 1}</span><b>${escHtml(q.q)}</b>${p0 == null ? ' <small class="rp-gnew">baru</small>' : ''}</div><span class="val">${gscN(q.c)}</span><div class="bar"><i style="width:${(q.c || 0) / M * 100}%;background:#4f8df7"></i></div></div>`; }).join('') : '<div class="rp-empty">Kata kunci belum diisi.</div>'}
      ${acts}</div></div></div>`;
}
function gscCopySql() {
  const done = () => showToast('✓ SQL Google Search disalin — tempel di Supabase → SQL Editor → Run.', 6000);
  if (navigator.clipboard) navigator.clipboard.writeText(GSC_SQL).then(done, () => prompt('Salin SQL ini:', GSC_SQL)); else prompt('Salin SQL ini:', GSC_SQL);
}
function gscOv(id) {
  let ov = document.getElementById(id);
  if (!ov) { ov = document.createElement('div'); ov.id = id; ov.className = 'chg-ov'; ov.onclick = e => { if (e.target === ov) ov.classList.remove('open'); }; document.body.appendChild(ov); }
  return ov;
}
function gscOpenForm(m) {
  if (typeof isEditor === 'function' && !isEditor()) { showToast('Khusus Editor.'); return; }
  const G = gscData[m] || {}, q = [...(G.queries || [])]; while (q.length < 5) q.push({ q: '', c: '' });
  const ov = gscOv('gsc-form');
  ov.innerHTML = `<div class="chg-box gsc-box" role="dialog" aria-label="Isi angka Google Search"><button class="chg-x" onclick="this.closest('.chg-ov').classList.remove('open')" aria-label="Tutup">✕</button>
    <div class="chg-k">🔒 Khusus Editor</div><h2 class="chg-h">🔎 Google Search <em>${rpLabel(m)}</em></h2>
    <p class="chg-sub">Salin dari Search Console → <b>Performa → Hasil penelusuran</b>, tanggal 1–${new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate()} ${rpLabel(m)}. <a href="#" onclick="gscGuide();return false">📖 Cara ambil angka</a></p>
    <div class="gsc-f3"><label class="chg-in"><span>Total klik</span><input id="gsc-c" inputmode="numeric" value="${G.clicks ?? ''}" placeholder="mis. 1240"></label>
      <label class="chg-in"><span>Total tayangan</span><input id="gsc-i" inputmode="numeric" value="${G.impressions ?? ''}" placeholder="mis. 38500"></label>
      <label class="chg-in"><span>Posisi rata-rata</span><input id="gsc-p" inputmode="decimal" value="${G.position == null ? '' : String(G.position).replace('.', ',')}" placeholder="mis. 14,2"></label></div>
    <div class="chg-lbl">5 kata kunci teratas (tab Kueri, urut Klik)</div>
    <div class="gsc-qs">${q.slice(0, 5).map((x, i) => `<div class="gsc-q"><span>${i + 1}</span><input class="gsc-qq" value="${escHtml(x.q || '')}" placeholder="kata kunci"><input class="gsc-qc" inputmode="numeric" value="${x.c ?? ''}" placeholder="klik"></div>`).join('')}</div>
    <div class="chg-acts"><button class="rp-btn g" id="gsc-save" onclick="gscSave('${m}')">✓ Simpan</button>${gscData[m] ? `<button class="rp-btn" onclick="gscDel('${m}')">🗑 Hapus angka bulan ini</button>` : ''}</div></div>`;
  ov.classList.add('open'); setTimeout(() => document.getElementById('gsc-c')?.focus(), 50);
}
const gscInt = v => { const n = parseInt(String(v || '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };
async function gscSave(m) {
  const c = gscInt(document.getElementById('gsc-c').value), i = gscInt(document.getElementById('gsc-i').value);
  const ps = document.getElementById('gsc-p').value.trim().replace(/\./g, '').replace(',', '.'), p = ps ? Number(ps) : null;
  if (c == null || i == null) { showToast('Isi Total klik & Total tayangan.'); return; }
  if (c > i) { showToast('Klik tidak mungkin lebih besar dari tayangan — periksa lagi.'); return; }
  if (ps && !(p > 0)) { showToast('Posisi rata-rata tidak valid (contoh 14,2).'); return; }
  const qq = [...document.querySelectorAll('#gsc-form .gsc-q')].map(r => ({ q: r.querySelector('.gsc-qq').value.trim().slice(0, 80), c: gscInt(r.querySelector('.gsc-qc').value) || 0 })).filter(x => x.q);
  const b = document.getElementById('gsc-save'); b.disabled = true; b.textContent = '⏳ Menyimpan…';
  const row = { month: m, clicks: c, impressions: i, position: p == null ? null : Math.round(p * 10) / 10, queries: qq, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('gsc_monthly').upsert(row);
  if (error) { b.disabled = false; b.textContent = '✓ Simpan'; if (/gsc_monthly|does not exist|PGRST205|42P01/i.test(error.message + ' ' + error.code)) { gscCopySql(); showToast('Tabel belum ada — SQL disalin, jalankan dulu di Supabase.', 7000); } else showToast('Gagal menyimpan: ' + error.message, 6000); return; }
  gscData[m] = row; document.getElementById('gsc-form').classList.remove('open'); showToast('✓ Angka Google Search tersimpan'); rpRender();
}
async function gscDel(m) {
  if (!confirm(`Hapus angka Google Search ${rpLabel(m)}?`)) return;
  const { error } = await supabase.from('gsc_monthly').delete().eq('month', m);
  if (error) { showToast('Gagal menghapus: ' + error.message, 6000); return; }
  gscData[m] = null; document.getElementById('gsc-form')?.classList.remove('open'); rpRender();
}
function gscGuide() {
  const ov = gscOv('gsc-guide');
  ov.innerHTML = `<div class="chg-box gsc-box" role="dialog" aria-label="Cara ambil angka Google Search"><button class="chg-x" onclick="this.closest('.chg-ov').classList.remove('open')" aria-label="Tutup">✕</button>
    <div class="chg-k">📖 Panduan · ±3 menit sebulan</div><h2 class="chg-h">Cara ambil angka <em>Google Search</em></h2>
    <ol class="gsc-steps">
      <li>Buka <b>search.google.com/search-console</b> dengan akun Google CAI, pilih properti <code>https://hub.concerto.id/</code>.</li>
      <li>Menu kiri <b>Performa → Hasil penelusuran</b>.</li>
      <li>Klik filter <b>Tanggal → Khusus</b>: tanggal 1 sampai tanggal terakhir bulan yang dilaporkan → <b>Terapkan</b>.</li>
      <li>Klik keempat kotak di atas grafik sampai aktif: <b>Total klik · Total tayangan · CTR rata-rata · Posisi rata-rata</b>.</li>
      <li>Ketik <b>Total klik</b>, <b>Total tayangan</b> dan <b>Posisi rata-rata</b> ke form (CTR dihitung otomatis).</li>
      <li>Di bawah grafik, tab <b>Kueri</b>, urutkan kolom <b>Klik</b> (terbesar di atas) → salin 5 kata kunci teratas + jumlah kliknya.</li>
      <li>Tekan <b>✓ Simpan</b> — angka langsung masuk Rapor & ikut gambar PNG.</li></ol>
    <p class="chg-tip">Isi setelah tanggal 3 tiap bulan: data Search Console terlambat ±2–3 hari. Klik di sini = orang yang mengklik CAI Hub di hasil Google (bukan iklan); kunjungan yang tercatat di kotak <b>📍 Pengunjung datang dari</b> sebagai 🔎 Google bisa sedikit berbeda karena cara hitungnya beda.</p></div>`;
  ov.classList.add('open');
}
