#!/usr/bin/env node
// 📦 Tahap 2 hemat kuota Supabase (8 Nov 2026, permintaan pemilik)
// Menyalin media PUBLIK yang sudah tayang dari Supabase Storage (bucket "showcase") ke folder media/ di repo,
// supaya pengunjung mengambilnya dari situs sendiri (GitHub Pages) — bukan dari Supabase (kuota egress).
//   Galeri Instalasi (foto & video mobil yang tayang) · gambar & foto berita News · poster Kalender Acara (publik)
//   · gambar materi Concerto Academy dari portal.
// Hasil: media/<path storage> (+ video dikompres ke .mp4 720p) dan media/map.json { files: { <path storage>: { f, mb } } }.
// Portal (js/core.js mediaLocal()) memakai salinan bila ada di map.json; selain itu tetap Supabase.
// Dijalankan GitHub Actions (.github/workflows/live-cards.yml). --check = hanya cek ada yang perlu disalin/dihapus.
// Hanya data yang bisa dibaca publik (publishable key + RLS publik) — draf, kiriman tertunda & terjadwal tidak terbaca.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const stockJs = fs.readFileSync(path.join(ROOT, 'js/stock.js'), 'utf8');
const SUPA_URL = process.env.MIRROR_BASE || stockJs.match(/const SUPA_URL\s*=\s*'([^']+)'/)[1], SUPA_KEY = stockJs.match(/const SUPA_KEY\s*=\s*'([^']+)'/)[1];
const DIR = 'media', MAP = path.join(ROOT, DIR, 'map.json');
const VIDEO_KEEP_MB = 8;     // video ≤ 8 MB disalin apa adanya
const VIDEO_MAX_MB = 20;     // hasil kompres > 20 MB tidak disalin (tetap dari Supabase)
// Jeda 24 jam (8 Nov 2026, permintaan pemilik): repo publik menyimpan riwayat selamanya — media baru disalin
// setelah tayang ≥ 24 jam, supaya salah unggah (plat nomor, wajah, foto keliru) sempat dihapus Editor dulu.
const DELAY_H = 24;
const tms = v => { const t = Date.parse(v || ''); return isNaN(t) ? 0 : t; };
// waktu unggah dari nama file (<Date.now()>-…), mis. 1730000000000-1.webp
const fileTs = p => { const m = String(p).split('/').pop().match(/(?:^|\D)(1[6-9]\d{11})(?!\d)/); return m ? +m[1] : 0; };
const isVid = p => /\.(mp4|mov|webm|m4v)$/i.test(p);
const clean = p => String(p || '').split('#')[0].trim();
const ok = p => p && !/^(https?:|blob:|data:)/i.test(p) && !p.startsWith('pending/') && !p.includes('..');
const vcodec = f => { try { return execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim(); } catch (e) { return ''; } };
const pub = p => `${SUPA_URL}/storage/v1/object/public/showcase/${p.split('/').map(encodeURIComponent).join('/')}`;

async function rest(q, optional) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${q}`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
  if (!r.ok) { if (optional) { console.warn('dilewati', q.split('?')[0], r.status); return []; } throw new Error(`${q.split('?')[0]}: HTTP ${r.status} ${await r.text()}`); }
  return r.json();
}
async function wanted() {
  // Map path → sejak kapan tayang (ms) = paling akhir dari waktu unggah file & waktu item tayang/diubah
  const set = new Map(), add = (p, ...ts) => { p = clean(p); if (!ok(p)) return; const t = Math.max(fileTs(p), ...ts.map(tms)); set.set(p, Math.max(set.get(p) || 0, t)); };
  for (const g of await rest('showcase_installs?select=*&published=eq.true'))
    for (const p of Array.isArray(g.photos) ? g.photos : []) add(p?.path, g.publish_at, g.created_at);
  for (const n of await rest('cai_news?select=*&published=eq.true')) {
    add(n.image, n.created_at, n.push_at); for (const p of Array.isArray(n.photos) ? n.photos : []) add(p?.path, n.created_at, n.push_at);
  }
  for (const e of await rest('cai_events?select=*', true)) add(e.poster, e.created_at, e.push_at);
  try {
    const r = await fetch(pub('academy/items.json') + '?t=' + Date.now());
    if (r.ok) { const now = Date.now(), today = new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
      for (const a of (await r.json()).items || []) if (a && (a.at ? Date.parse(a.at) <= now : (a.date || '') <= today)) { add(a.img, a.at); add(a.thumb, a.at); } }
  } catch (e) { console.warn('academy dilewati:', e.message); }
  return set;
}

(async () => {
  const want = await wanted();
  const map = fs.existsSync(MAP) ? JSON.parse(fs.readFileSync(MAP, 'utf8')) : {};
  const files = map.files || {}, skip = map.skip || {};
  const due = Date.now() - DELAY_H * 3600e3;
  const fresh = [...want.keys()].filter(p => !files[p] && !skip[p]);
  const todo = fresh.filter(p => want.get(p) <= due);   // baru tayang < 24 jam → tunggu
  if (fresh.length > todo.length) console.log(`Media: ${fresh.length - todo.length} file menunggu jeda ${DELAY_H} jam`);
  const gone = Object.keys(files).filter(p => !want.has(p));
  const changed = todo.length > 0 || gone.length > 0 || Object.keys(skip).some(p => !want.has(p));
  if (process.argv.includes('--check')) {
    console.log(changed ? `Media: ${todo.length} baru · ${gone.length} dihapus` : 'Media: tidak ada perubahan');
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `media=${changed}\n`);
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cai-media-'));
  let added = 0, skipped = 0;
  for (const p of todo) {
    try {
      const r = await fetch(pub(p)); if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      let rel = `${DIR}/${p}`, out = buf;
      const src = path.join(tmp, 'in' + path.extname(p)), dst = path.join(tmp, 'out.mp4');
      if (isVid(p)) fs.writeFileSync(src, buf);
      // video disalin apa adanya hanya bila MP4 H.264 ≤ 8 MB; selain itu (MOV/HEVC/besar) dikompres ke MP4 H.264 720p
      if (isVid(p) && (buf.length > VIDEO_KEEP_MB * 1048576 || !/\.mp4$/i.test(p) || vcodec(src) !== 'h264')) {
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', "scale=-2:'min(720,ih)'", '-c:v', 'libx264', '-preset', 'faster', '-crf', '27',
          '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', dst], { timeout: 15 * 60000 });
        out = fs.readFileSync(dst); rel = rel.replace(/\.[^./]+$/, '') + '.mp4';
      }
      const mb = +(out.length / 1048576).toFixed(2);
      if (isVid(p) && mb > VIDEO_MAX_MB) { skip[p] = { mb }; skipped++; console.warn('terlalu besar, tetap dari Supabase:', p, mb, 'MB'); continue; }
      fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, rel), out);
      files[p] = { f: rel, mb }; added++;
      console.log('disalin', p, (buf.length / 1048576).toFixed(1), '→', mb, 'MB');
    } catch (e) { console.warn('gagal', p, e.message); }
  }
  for (const p of gone) { fs.rmSync(path.join(ROOT, files[p].f), { force: true }); delete files[p]; }
  for (const p of Object.keys(skip)) if (!want.has(p)) delete skip[p];
  // folder kosong dibersihkan
  const prune = d => { for (const x of fs.readdirSync(d, { withFileTypes: true })) if (x.isDirectory()) { const s = path.join(d, x.name); prune(s); if (!fs.readdirSync(s).length) fs.rmdirSync(s); } };
  if (fs.existsSync(path.join(ROOT, DIR))) prune(path.join(ROOT, DIR));
  const sorted = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  fs.mkdirSync(path.join(ROOT, DIR), { recursive: true });
  fs.writeFileSync(MAP, JSON.stringify({ _note: 'Salinan media publik dari Supabase Storage (showcase) — dibuat otomatis oleh tools/mirror-media.js (GitHub Actions). Jangan diedit manual.', files: sorted(files), skip: sorted(skip) }, null, 1) + '\n');
  fs.rmSync(tmp, { recursive: true, force: true });
  const total = Object.values(files).reduce((s, x) => s + x.mb, 0);
  console.log(`Media: ${added} disalin · ${gone.length} dihapus · ${skipped} terlalu besar · total ${Object.keys(files).length} file ${total.toFixed(1)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
