/* CAI Hub (Concerto Audio Indonesia) — js/videotron.js
   Tanya Jawab / Open Mic + layar videotron ?layar=qa (scene, video, musik latar, awarding, dll.).
   Dipisah dari index.html 30 Okt 2026 (tahap 3 pemecahan file). Semua file js/*.js adalah script klasik (bukan module):
   fungsi & const/let tingkat atas terbagi di satu lingkup global, URUTAN MUAT PENTING (lihat <script> di akhir index.html). */

/* ══════════════════════════════════════════
   TANYA JAWAB PARTNER — sesi "Listening and Understanding Partner" (Admin & Editor)
   Admin mengetik pertanyaan dealer → tersimpan di `gathering_questions` (rekap) → tombol Tampilkan
   menulis id pertanyaan ke `gathering_screen` (1 baris). Layar videotron = halaman ?layar=qa yang
   membaca baris itu secara realtime (+ cek ulang tiap 4 detik).
══════════════════════════════════════════ */
const QA_TABLE = 'gathering_questions', QA_SCREEN = 'gathering_screen';
const QA_SESSION = 'Listening and Understanding Partner';
const QA_SESSION_RE = /listening|tanya jawab|q ?& ?a|open ?mic|curhat|meeting dealer/i;   // judul lama "Tanya Jawab Partner" tetap dikenali
const QA_STATUS = { baru: 'Antri', tampil: 'Sudah tampil', dijawab: 'Dijawab' };
let qaItems = null, qaErr = '', qaScreenId = null, qaEditId = null, qaFilter = 'all', qaSearch = '', qaChannel = null, rdTab = 'rundown';

function setRdTab(t) {
  rdTab = t === 'qa' ? 'qa' : 'rundown';
  const qa = rdTab === 'qa';
  document.getElementById('rd-tab-rundown').classList.toggle('active', !qa);
  document.getElementById('rd-tab-qa').classList.toggle('active', qa);
  document.getElementById('rd-pane').hidden = qa;
  document.getElementById('qa-pane').hidden = !qa;
  document.getElementById('rd-actions').hidden = qa;
  document.getElementById('rd-subtitle').innerHTML = qa
    ? '<b>Open Mic Partner: Curhat Bebas</b> — ketik pertanyaan / curhatan dealer, tampilkan di videotron, semua otomatis masuk rekap.'
    : 'Run down acara — tambah, ubah, dan centang sesi yang sudah selesai. Khusus Admin &amp; Editor.';
  if (document.getElementById('view-rundown')?.classList.contains('active')) {
    ['nav-rundown', 'mnav-rundown'].forEach(id => document.getElementById(id)?.classList.remove('active'));
    document.getElementById('nav-rundown')?.classList.add('active');
    document.getElementById('mnav-rundown')?.classList.add('active');
  }
  if (qa) { renderQa(); loadQa(); subscribeQa(); }
}

function qaDbError(e) {
  const m = String(e?.message || e);
  return /does not exist|relation|schema cache/i.test(m) ? 'Tabel Open Mic belum dibuat. Jalankan SQL "gathering_questions" di Supabase.' : 'Data Open Mic tidak bisa dimuat: ' + m;
}

async function loadQa() {
  if (!supabase || !isAdmin()) return;
  try {
    const [q, s] = await Promise.all([
      supabase.from(QA_TABLE).select('*').order('id'),
      supabase.from(QA_SCREEN).select('*').eq('id', 1).maybeSingle()]);
    if (q.error) throw q.error;
    if (s.error) throw s.error;
    qaItems = q.data || []; qaScreenId = s.data?.question_id ?? null; scrRow = s.data || scrRow; qaErr = '';
  } catch (e) { qaItems = []; qaErr = qaDbError(e); }
  renderQa();
}

// Admin lain (atau tab lain) yang mengubah data → daftar ikut segar
function subscribeQa() {
  if (!supabase || qaChannel) return;
  let t; const reload = () => { clearTimeout(t); t = setTimeout(loadQa, 300); };
  qaChannel = supabase.channel('qa-admin')
    .on('postgres_changes', { event: '*', schema: 'public', table: QA_TABLE }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: QA_SCREEN }, reload)
    .subscribe();
}

const qaWho = x => [x.dealer, x.city].filter(Boolean).join(' · ') || 'Dealer';
const qaTime = d => d ? new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '';

function renderQa() {
  const list = document.getElementById('qa-list'), live = document.getElementById('qa-live');
  if (!list) return;
  const dl = document.getElementById('qa-dealer-list');
  if (!dl.children.length) dl.innerHTML = [...GT_DISTRIBUTORS, ...GT_DEALERS].map(n => `<option value="${escHtml(n)}">`).join('');
  if (qaItems === null || qaErr) {
    list.innerHTML = `<div class="stock-empty">${qaItems === null ? 'Memuat…' : escHtml(qaErr)}</div>`;
    live.innerHTML = ''; live.classList.remove('on'); document.getElementById('qa-chips').innerHTML = ''; return;
  }
  const no = new Map(qaItems.map((x, i) => [x.id, i + 1]));
  const cur = qaItems.find(x => x.id === qaScreenId);
  const queue = qaItems.filter(x => x.status === 'baru' && x.id !== qaScreenId);
  live.classList.toggle('on', !!cur);
  const sc = sceneInfo(scrRow?.scene);
  live.innerHTML = `${sc ? `<div class="qa-scene-note">🖥 Layar sedang menampilkan <b>${sc.icon} ${sc.label}</b> — pertanyaan tidak terlihat sampai layar dikembalikan ke Meeting Dealer.
      <button class="gt-btn confirm" onclick="setScene(null)">🎤 Kembali ke Meeting Dealer</button></div>` : ''}
    <div class="qa-live-head"><span class="qa-dot${cur && !sc ? ' on' : ''}"></span>${cur ? (sc ? 'Pertanyaan terakhir (tersembunyi selama tampilan sesi)' : 'Sedang tampil di layar videotron') : 'Layar videotron kosong — menampilkan judul sesi'}</div>
    ${cur ? `<div class="qa-live-q">“${escHtml(cur.question)}”</div><div class="qa-live-who">#${no.get(cur.id)} · ${escHtml(qaWho(cur))}</div>
      <div class="qa-live-ans">
        <label>💬 Jawaban CAI ${cur.answer && cur.answer_shown ? '<span class="qa-badge onair">● Tampil di layar</span>' : cur.answer ? '<span class="qa-badge">Belum ditampilkan</span>' : ''}</label>
        <textarea class="gt-input" id="qa-live-answer" rows="3" maxlength="1000" placeholder="Ketik jawaban yang diberikan, lalu klik Tampilkan Jawaban…"
          oninput="qaLiveDraft={id:${cur.id},text:this.value}" onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();qaShowAnswer();}">${escHtml(qaLiveDraft.id === cur.id ? qaLiveDraft.text : (cur.answer || ''))}</textarea>
        <div class="qa-live-btns">
          <button class="gt-btn confirm" onclick="qaShowAnswer()">💬 ${cur.answer_shown ? 'Perbarui' : 'Tampilkan'} Jawaban di Layar</button>
          ${cur.answer_shown ? '<button class="gt-btn ghost" onclick="qaHideAnswer()">🙈 Sembunyikan Jawaban</button>' : ''}
        </div>
      </div>` : ''}
    <div class="qa-live-btns">
      <button class="gt-btn confirm" onclick="openQaScreen()">🖥 Buka Layar Videotron</button>
      ${queue.length ? `<button class="gt-btn ghost" onclick="qaShow(${queue[0].id})">⏭ Tampilkan antrian berikutnya (${queue.length})</button>` : ''}
      ${cur ? '<button class="gt-btn ghost" onclick="qaClearScreen()">⏹ Kosongkan Layar</button>' : ''}
    </div>`;
  const cnt = k => qaItems.filter(x => x.status === k).length;
  document.getElementById('qa-count').textContent = qaItems.length;
  document.getElementById('qa-chips').innerHTML = [['all', 'Semua', qaItems.length], ['baru', 'Antri', cnt('baru')], ['tampil', 'Sudah tampil', cnt('tampil')], ['dijawab', 'Dijawab', cnt('dijawab')]]
    .map(([k, l, n]) => `<button class="filter-chip${qaFilter === k ? ' active' : ''}" onclick="qaFilter='${k}';renderQa()">${l} · ${n}</button>`).join('');
  const s = qaSearch.trim().toLowerCase();
  const rows = qaItems.filter(x => (qaFilter === 'all' || x.status === qaFilter) &&
    (!s || [x.dealer, x.city, x.question, x.answer].some(v => (v || '').toLowerCase().includes(s)))).reverse();
  if (!qaItems.length) { list.innerHTML = '<div class="stock-empty">Belum ada pertanyaan. Ketik pertanyaan dealer di atas lalu klik <b>📺 Simpan &amp; Tampilkan</b>.</div>'; return; }
  if (!rows.length) { list.innerHTML = '<div class="stock-empty">Tidak ada pertanyaan yang cocok.</div>'; return; }
  list.innerHTML = `<div class="rd-table">${rows.map(x => {
    const on = x.id === qaScreenId;
    return `<div class="qa-row${on ? ' onair' : ''}">
      <div class="qa-no">#${no.get(x.id)}<small>${qaTime(x.created_at)}</small></div>
      <div><div class="qa-q">${escHtml(x.question)}</div><div class="qa-who">👤 ${escHtml(qaWho(x))}</div>
        ${x.answer ? `<div class="rd-notes qa-ans-note"><b>💬 Jawaban${on && x.answer_shown ? ' · tampil di layar' : ''}:</b> ${escHtml(x.answer)}</div>` : ''}</div>
      <div class="qa-side">${on ? '<span class="qa-badge onair">● Di layar</span>' : `<span class="qa-badge s-${x.status}">${QA_STATUS[x.status] || x.status}</span>`}
        <div class="rd-btns">
          ${on ? '<button class="gt-btn ghost" onclick="qaClearScreen()" title="Turunkan dari layar">⏹ Turunkan</button>' : `<button class="gt-btn ghost" onclick="qaShow(${x.id})" title="Tampilkan di videotron">📺 Tampilkan</button>`}
          <button class="gt-btn ghost" onclick="qaToggleAnswered(${x.id})" title="${x.status === 'dijawab' ? 'Batalkan tanda dijawab' : 'Tandai sudah dijawab'}">${x.status === 'dijawab' ? '↺' : '✓ Dijawab'}</button>
          <button class="gt-btn ghost" onclick="qaEdit(${x.id})" title="Edit pertanyaan / jawaban">✏️</button>
          <button class="gt-btn ghost gt-del" onclick="qaDelete(${x.id})" title="Hapus">🗑</button>
        </div></div>
    </div>`; }).join('')}</div>`;
}

async function qaSave(show) {
  if (!supabase) return;
  const v = k => document.getElementById('qa-' + k).value.trim();
  const row = { dealer: v('dealer') || null, city: v('city') || null, question: v('question') };
  if (!row.question) { showToast('Ketik pertanyaannya dulu.'); document.getElementById('qa-question').focus(); return; }
  const btns = ['qa-save-show', 'qa-save'].map(id => document.getElementById(id));
  btns.forEach(b => b.disabled = true);
  try {
    if (qaEditId) {
      const old = qaItems?.find(r => r.id === qaEditId);
      Object.assign(row, { answer: v('answer') || null, updated_at: new Date().toISOString() });
      if (!row.answer) row.answer_shown = false;
      if (row.answer && old?.status !== 'dijawab') row.status = 'dijawab';
      const { error } = await supabase.from(QA_TABLE).update(row).eq('id', qaEditId);
      if (error) throw error;
      qaCancelEdit(); showToast('✓ Pertanyaan diperbarui.');
    } else {
      const now = new Date().toISOString();
      const answer = v('answer') || null;
      Object.assign(row, { session: QA_SESSION, status: answer ? 'dijawab' : show ? 'tampil' : 'baru', shown_at: show ? now : null, answer });
      if (answer) row.answer_shown = !!show;
      const { data, error } = await supabase.from(QA_TABLE).insert(row).select().single();
      if (error) throw error;
      ['dealer', 'city', 'question', 'answer'].forEach(k => { document.getElementById('qa-' + k).value = ''; });
      if (show && data) {
        const r = await supabase.from(QA_SCREEN).upsert({ id: 1, question_id: data.id, ...sceneReset(), updated_at: now });
        if (r.error) throw r.error;
        scrRow = { ...scrRow, question_id: data.id, ...sceneReset() };
        qaScreenId = data.id; showToast('📺 Tersimpan & tampil di layar.');
      } else showToast('✓ Masuk antrian.');
      document.getElementById('qa-dealer').focus();
    }
    await loadQa();
  } catch (e) { showToast('Gagal menyimpan: ' + (e.message || e), 9000); }
  finally { btns.forEach(b => b.disabled = false); }
}

async function qaShow(id) {
  const now = new Date().toISOString();
  const { error } = await supabase.from(QA_SCREEN).upsert({ id: 1, question_id: id, ...sceneReset(), updated_at: now });
  if (error) { showToast('Gagal menampilkan: ' + error.message, 8000); return; }
  qaScreenId = id; scrRow = { ...scrRow, question_id: id, ...sceneReset() };
  const x = qaItems?.find(r => r.id === id);
  if (x && x.status === 'baru') {
    Object.assign(x, { status: 'tampil', shown_at: now });
    await supabase.from(QA_TABLE).update({ status: 'tampil', shown_at: now, updated_at: now }).eq('id', id);
  }
  renderQa(); showToast('📺 Pertanyaan tampil di layar.');
}

async function qaClearScreen() {
  const { error } = await supabase.from(QA_SCREEN).upsert({ id: 1, question_id: null, ...sceneReset(), updated_at: new Date().toISOString() });
  if (error) { showToast('Gagal mengosongkan layar: ' + error.message, 8000); return; }
  qaScreenId = null; scrRow = { ...scrRow, question_id: null, ...sceneReset() }; renderQa(); showToast('Layar dikosongkan.');
}

// Jawaban untuk pertanyaan yang sedang tampil → simpan + munculkan di bawah pertanyaan di videotron
let qaLiveDraft = { id: null, text: '' };
async function qaShowAnswer() {
  const x = qaItems?.find(r => r.id === qaScreenId); if (!x) return;
  const answer = document.getElementById('qa-live-answer').value.trim();
  if (!answer) { showToast('Ketik jawabannya dulu.'); document.getElementById('qa-live-answer').focus(); return; }
  const upd = { answer, answer_shown: true, status: 'dijawab', updated_at: new Date().toISOString() };
  const { error } = await supabase.from(QA_TABLE).update(upd).eq('id', x.id);
  if (error) { showToast('Gagal menyimpan jawaban: ' + error.message + (/answer_shown/.test(error.message) ? ' — jalankan SQL kolom answer_shown.' : ''), 9000); return; }
  Object.assign(x, upd); qaLiveDraft = { id: null, text: '' };
  renderQa(); showToast('💬 Jawaban tampil di layar.');
}
async function qaHideAnswer() {
  const x = qaItems?.find(r => r.id === qaScreenId); if (!x) return;
  const { error } = await supabase.from(QA_TABLE).update({ answer_shown: false, updated_at: new Date().toISOString() }).eq('id', x.id);
  if (error) { showToast('Gagal: ' + error.message, 8000); return; }
  x.answer_shown = false; renderQa(); showToast('Jawaban disembunyikan dari layar.');
}

async function qaToggleAnswered(id) {
  const x = qaItems?.find(r => r.id === id); if (!x) return;
  const prev = x.status, status = prev === 'dijawab' ? (x.shown_at ? 'tampil' : 'baru') : 'dijawab';
  x.status = status; renderQa();
  const { error } = await supabase.from(QA_TABLE).update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { x.status = prev; renderQa(); showToast('Gagal mengubah status: ' + error.message, 8000); }
}

function qaEdit(id) {
  const x = qaItems?.find(r => r.id === id); if (!x) return;
  qaEditId = id;
  ['dealer', 'city', 'question', 'answer'].forEach(k => { document.getElementById('qa-' + k).value = x[k] || ''; });
  document.getElementById('qa-form-title').textContent = `Edit pertanyaan #${qaItems.indexOf(x) + 1}`;
  document.getElementById('qa-save-show').textContent = '💾 Simpan Perubahan';
  document.getElementById('qa-save').hidden = true;
  document.getElementById('qa-cancel').hidden = false;
  const f = document.getElementById('qa-form'); f.classList.add('editing');
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('qa-question').focus();
}
function qaCancelEdit() {
  qaEditId = null;
  ['dealer', 'city', 'question', 'answer'].forEach(k => { document.getElementById('qa-' + k).value = ''; });
  document.getElementById('qa-form-title').textContent = 'Input pertanyaan dealer';
  document.getElementById('qa-save-show').textContent = '📺 Simpan & Tampilkan';
  document.getElementById('qa-save').hidden = false;
  document.getElementById('qa-cancel').hidden = true;
  document.getElementById('qa-form').classList.remove('editing');
}

async function qaDelete(id) {
  const x = qaItems?.find(r => r.id === id);
  if (!x || !confirm(`Hapus pertanyaan #${qaItems.indexOf(x) + 1} dari ${qaWho(x)}?`)) return;
  if (id === qaScreenId) await qaClearScreen();
  const { error } = await supabase.from(QA_TABLE).delete().eq('id', id);
  if (error) { showToast('Gagal menghapus: ' + error.message, 8000); return; }
  if (qaEditId === id) qaCancelEdit();
  qaItems = qaItems.filter(r => r.id !== id); renderQa(); showToast('Pertanyaan dihapus.');
}

// Buka di komputer yang tersambung ke videotron (browser yang sama sudah login Admin/Editor)
function openQaScreen() { window.open(location.origin + location.pathname + '?layar=qa', 'cai-videotron'); }

async function exportQa() {
  if (!qaItems?.length) { showToast('Belum ada pertanyaan.'); return; }
  try {
    const XLSX = await loadXlsx();
    const rows = [['No', 'Waktu', 'Sesi', 'Nama Dealer', 'Kota', 'Pertanyaan', 'Status', 'Jawaban'],
      ...qaItems.map((x, i) => [i + 1, fmtGtTime(x.created_at), x.session || QA_SESSION, x.dealer || '', x.city || '', x.question, QA_STATUS[x.status] || x.status, x.answer || ''])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:5},{wch:18},{wch:32},{wch:24},{wch:14},{wch:70},{wch:13},{wch:50}];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Open Mic Partner');
    XLSX.writeFile(wb, `open-mic-gathering-${todayWIB()}.xlsx`);
  } catch (e) { showToast('Gagal ekspor: ' + (e.message || e), 8000); }
}

function printQa() {
  if (!qaItems?.length) { showToast('Belum ada pertanyaan untuk dicetak.'); return; }
  let el = document.getElementById('gt-print');
  if (!el) { el = document.createElement('div'); el.id = 'gt-print'; document.body.appendChild(el); }
  el.innerHTML = `<div class="gp-head"><img src="${LOGO_NAVY}" alt="CAI"><div><h1>REKAP OPEN MIC PARTNER</h1><p>${QA_NAME} · GATHERING CAI 2026 · ${qaItems.length} pertanyaan</p></div></div>
    <table class="gp-items rd-print"><colgroup><col style="width:5%"><col style="width:8%"><col style="width:18%"><col style="width:34%"><col style="width:35%"></colgroup>
    <thead><tr><th>No</th><th>Jam</th><th>Dealer</th><th>Pertanyaan</th><th>Jawaban</th></tr></thead><tbody>
    ${qaItems.map((x, i) => `<tr><td>${i + 1}</td><td>${qaTime(x.created_at)}</td><td>${escHtml(qaWho(x))}</td><td>${escHtml(x.question)}</td><td>${escHtml(x.answer || '')}</td></tr>`).join('')}
    </tbody></table>`;
  window.print();
}


/* ── Layar videotron: tampilan per sesi (scene) ──
   gathering_screen.scene = null → mode Open Mic; selain itu salah satu kunci QS_SCENES.
   scene_text = teks tambahan opsional, scene_until = akhir hitung mundur (opsional). */
const QS_SCENES = {
  opening: { label: 'Opening Speech', icon: '🎙', match: /opening/i },
  coffee:  { label: 'Coffee Break', icon: '☕', mins: 20, next: 'Product Launch', match: /coff?ee|rehat/i },
  refresh: { label: 'Refreshment Product', icon: '🔊', match: /refresh|referes/i },
  newbrand: { label: 'Launching - CAELUM', icon: '✨', match: /brand baru|new brand|launching brand|caelum/i },
  cailaunch: { label: 'Launching - CAI', icon: '🚀', match: /launching\s*-\s*cai\b/i },
  launch:  { label: 'Product Launch', icon: '🚀', match: /launch|peluncuran/i },
  lunch:   { label: 'Istirahat Makan Siang', icon: '🍽', next: 'Kick Off 2027', match: /makan siang|lunch/i },
  awarding: { label: 'Awarding', icon: '🏆', match: /award/i },
  dinner:  { label: 'Makan Malam', icon: '🍷', next: 'Healthy Drink', match: /makan malam|dinner/i },
  healthy: { label: 'Healthy Drink', icon: '🥤', match: /health[yi]|healty/i },
  funmkt:  { label: 'Fun Marketing', icon: '🎯', match: /fun ?marketing/i },
  welcome: { label: 'Partner Masuk', icon: '🚪', match: /partner masuk|welcome|registrasi/i },
  anthem: { label: 'Indonesia Raya', icon: '🇮🇩', match: /indonesia raya|lagu kebangsaan/i },
  kickoff: { label: 'Kick Off 2027', icon: '🏁', match: /kick ?off/i },
  testimoni: { label: 'Testimoni Partner CAI', icon: '💬', match: /testimoni/i },
  backdrop: { label: 'Backdrop', icon: '🖼', match: /backdrop/i },
  flier: { label: 'Flier', icon: '📰', match: /fl[iy]er|brosur/i },
  sertifikat: { label: 'Penyerahan Sertifikat Dealer', icon: '📜', match: /sertifikat/i },
  paket: { label: 'Paket Audio', icon: '📦', match: /paket/i },
  topspender: { label: 'Top Spender', icon: '🏆', match: /top ?spender/i },
};
const PORTAL_POINTS = ['Katalog produk & harga SRP resmi', 'Stok produk real-time', 'Panduan Dealer & Concerto Academy', 'Paket Audio & Shopping Gathering'];
const PKS_POINTS = ['Kemitraan dealer resmi CAI tahun 2027', 'Ketentuan & komitmen kerja sama', 'Program & dukungan untuk dealer'];
// Penyerahan Sertifikat Dealer (21 Okt 2026, data dari tabel "Daftar Dealer" pemilik): judul → dealer satu per satu (clicker) → daftar semua.
const CERT_SEQ = ['sertifikat', ...CERT_DEALERS.map((_, i) => 'sertifikat:' + (i + 1)), 'sertifikat:list'];
const certNum = k => { const m = /^sertifikat:(\d+)$/.exec(k || ''); return m ? +m[1] : 0; };
// Kick Off 2027 · "Absen Dosa Dealer CAI" (permintaan pemilik): judul Kick Off → absen dosa (clicker membuka 1 per 1) → "semua jawabannya ada di portal" → video portal → PKS.
// Butir 1–10 dari pemilik, 11–20 tambahan. f = kunci fitur portal yang menjawabnya (ABSEN_FEAT).
const ABSEN_DOSA = [
  { t: 'Sudah dealing sama customer, ternyata stok nggak ada', f: 'stok' },
  { t: 'Telepon distri, distrinya masih tidur 😴', f: 'h24' },
  { t: 'Ditanya harga, kita sendiri nggak hafal', f: 'harga' },
  { t: 'Sebenarnya kita punya barang apa aja, juga nggak tahu', f: 'katalog' },
  { t: 'Customer tanya paketan audio, bingung', f: 'paket' },
  { t: 'Ditanya spec audio, bingung', f: 'spec' },
  { t: 'Cari software, bingung', f: 'dsp' },
  { t: 'Di toilet nggak ada bacaan bermutu 🚽', f: 'academy' },
  { t: 'Cara menjual produk, bingung', f: 'guide' },
  { t: 'Ditanya pengetahuan audio, bingung', f: 'academy' },
  { t: 'Customer minta foto & video produk, yang dikirim foto buram 📸', f: 'media' },
  { t: 'Ditanya "barangnya kapan datang?", jawabnya "sabar ya, Bos"', f: 'stok' },
  { t: 'Kirim spec ke customer pakai screenshot miring', f: 'spec' },
  { t: 'Produk baru keluar, customer malah tahu duluan 😅', f: 'update' },
  { t: 'Katalog cetak sudah lecek kena tumpahan kopi ☕', f: 'katalog' },
  { t: 'Ditanya "ini brand resmi?", jawabnya ragu-ragu', f: 'katalog' },
  { t: 'Cari satu produk, scroll galeri HP 3.000 foto', f: 'katalog' },
  { t: 'Mau order, chat ke sales panjang lebar penuh typo', f: 'wa' },
  { t: 'Nggak sempat ke kantor distri cuma buat cek barang', f: 'h24' },
  { t: 'Karyawan baru di toko belum ngerti produk sama sekali', f: 'academy' },
];
const ABSEN_FEAT = {
  stok:    { i: '📦', n: 'Stok Real-time', d: 'Ready / indent + info barang OTW 🚚' },
  h24:     { i: '🌙', n: 'Buka 24 Jam', d: 'Cek sendiri dari HP, kapan saja' },
  harga:   { i: '🏷', n: 'Harga SRP', d: 'Harga jual resmi di tiap produk' },
  katalog: { i: '📚', n: 'Katalog & Brand Resmi', d: 'Semua brand resmi CAI + pencarian' },
  paket:   { i: '🎁', n: 'Paket Audio', d: 'Paket siap tawar ke customer' },
  spec:    { i: '📄', n: 'Spec Sheet PDF', d: 'Spesifikasi lengkap, tinggal unduh' },
  dsp:     { i: '💾', n: 'DSP Software', d: 'Unduh software resmi brand' },
  academy: { i: '🎓', n: 'Concerto Academy', d: 'Materi pengetahuan audio' },
  guide:   { i: '🧭', n: 'Panduan Dealer', d: 'Tips & teknik penjualan' },
  media:   { i: '🎬', n: 'Foto & Video Produk', d: 'Tombol Bagikan ke WhatsApp' },
  update:  { i: '🆕', n: 'Update Terbaru', d: 'Produk baru & Coming Soon' },
  wa:      { i: '💬', n: 'Order via WhatsApp', d: 'Pesan otomatis: produk + stok' },
};
// scene: 'kickoff:absen:<k>' = k butir sudah dibuka (0 = pembuka), 'kickoff:absen:all' = semua sekaligus, 'kickoff:jawab' = jawaban
const absenPart = k => { if (k === 'kickoff:jawab') return { jawab: true }; const m = /^kickoff:absen:(\d+|all)$/.exec(k || ''); return m ? { k: m[1] === 'all' ? ABSEN_DOSA.length : Math.min(ABSEN_DOSA.length, +m[1]), all: m[1] === 'all' } : null; };
const KICKOFF_PRE = ['kickoff', ...ABSEN_DOSA.map((_, i) => 'kickoff:absen:' + i), 'kickoff:absen:' + ABSEN_DOSA.length, 'kickoff:jawab', 'kickoff:v'];
const sceneForTitle = t => Object.keys(QS_SCENES).find(k => QS_SCENES[k].match.test(t || ''));
// Video Product Launch per brand — scene 'launch:<id brand>'. File MP4 (H.264) di assets/launch/.
// Bila file belum ada / internet putus, operator di komputer videotron bisa memilih file video lokal.
// Banyak video per brand: scene 'launch:<brand>' = putar semua berurutan, 'launch:<brand>:<n>' = video ke-n saja.
// Sumber: folder Google Drive per brand dari pemilik (Okt 2026). Urutan = urutan putar "Putar semua".
const LAUNCH_VIDEOS = {
  audiocircle: [
    { title: 'Köln Series', src: 'assets/launch/ac-koln-klc62.mp4', alt: ['Köln KL-C6.2', 'KL-C6.2', 'Koln'] },
    { title: 'IQ-LES10A', src: 'assets/launch/ac-iq-les10a.mp4' },
  ],
  steg: [
    { title: 'SEC650C', src: 'assets/launch/steg-sec650c.mp4?v=2' },
    { title: 'K Series 136', src: 'assets/launch/steg-k136.mp4' },
    { title: 'DSP S12', src: 'assets/launch/steg-dsp-s12.mp4' },
    { title: 'DSP S6', src: 'assets/launch/steg-dsp-s6.mp4' },
  ],
  audiosystem: [
    { title: 'AY65C', src: 'assets/launch/as-ay65c.mp4' },
    { title: 'AY65', src: 'assets/launch/as-ay65.mp4' },
    { title: 'AS500.1', src: 'assets/launch/as-as500-1.mp4' },
    { title: 'AS10', src: 'assets/launch/as-as10.mp4' },
    { title: 'DSP AS6', src: 'assets/launch/as-dsp-as6.mp4' },
  ],
};
// Testimoni Partner CAI (Free Time): video testimoni dari dealer. Scene 'testimoni' = layar judul,
// 'testimoni:all' = putar semua berurutan, 'testimoni:<n>' = video ke-n saja (n mulai 0).
// File di assets/testimoni/<slug>.mp4 (H.264 1080p, faststart; batas file GitHub 100 MB). title = nama dealer/partner.
// Sebelum file ada di repo, operator bisa memilih file video dari komputer videotron (tombol 📁 muncul di layar).
const TESTIMONI_VIDEOS = [
  { title: 'Central Garage — Surabaya Selatan', src: 'assets/testimoni/central-garage.mp4' },
  { title: 'Concerto — Malang', src: 'assets/testimoni/concerto-malang.mp4' },
  { title: 'Atmos Auto Sound — Kudus', src: 'assets/testimoni/atmos-kudus.mp4' },
  { title: 'Mega Audio — Jakarta', src: 'assets/testimoni/mega-audio-jakarta.mp4' },
  { title: 'Nai Audioworks — Batam', src: 'assets/testimoni/naiaudioworks-batam.mp4' },
  { title: 'Blitz — Tegal', src: 'assets/testimoni/blitz-tegal.mp4' },
  { title: 'Blitz — Cirebon', src: 'assets/testimoni/blitz-cirebon.mp4' },
  { title: 'Blitz — Pekalongan', src: 'assets/testimoni/blitz-pekalongan.mp4' },
  { title: 'Sterindo Autosound — Jakarta', src: 'assets/testimoni/sterindo-jakarta.mp4' },   // 26 Okt 2026, video vertikal → 1920×1080 + latar blur
  { title: 'The Peak Garage — Semarang', src: 'assets/testimoni/tpg-julian.mp4' },
];
const tmParts = k => { const m = /^testimoni:(all|\d+)$/.exec(k || ''); return m ? { idx: m[1] === 'all' ? null : +m[1] } : null; };
const sceneBase = k => String(k || '').split(':')[0];
const launchParts = k => { const [, brand, n] = String(k || '').split(':'); return { brand, idx: n == null || n === '' ? null : +n }; };
// Materi presentasi Fun Marketing (PDF pemilik → gambar 1920×1080). Scene 'funmkt' = judul, 'funmkt:<n>' = slide ke-n.
const FM_SLIDES = 14;
// Slide yang diganti desain judul Fun Marketing (kosong = semua slide asli tampil). Slide 1 dipasang setelah pemilik
// mengonfirmasi orang di kedua fotonya sudah setuju (Okt 2026).
const FM_TITLE_SLIDES = [];
const fmSlide = (n, thumb) => `assets/funmarketing/slide-${String(n).padStart(2, '0')}${thumb ? '-thumb' : ''}.webp`;
// Opening Speech: scene 'opening' = susunan pembicara, 'opening:<n>' = kartu pembicara ke-n. id = brand di BRANDS (pakai logo).
// ac = warna aksen kartu; video = video recap sambutan (Audiocircle & STEG dari pemilik — file di assets/opening/).
// intro = video speech Ricky Eko Widodo (CAI) sebelum recap; urutan layar brand ber-video: speech CAI → recap → kartu (backdrop saat pembicara di panggung).
const OPENING_SPEAKERS = [
  { name: 'Mr. Marc', brand: 'Audiocircle', id: 'audiocircle', ac: '#ef3b36', intro: 'assets/opening/ricky-speech.mp4', introBy: 'Ricky Eko Widodo', video: 'assets/opening/audiocircle.mp4?v=4' },
  { name: 'Mr. Kelvin Lee', brand: 'STEG', id: 'steg', ac: '#22c476', intro: 'assets/opening/ricky-speech-steg.mp4', introBy: 'Ricky Eko Widodo', video: 'assets/opening/steg.mp4?v=2' },
  { name: 'Mr. David', brand: 'Zelos', id: 'zelos', ac: '#e3b94f' },
  { name: 'Robert Adrianto', brand: 'Presiden EMMA Indonesia', logo: 'assets/brands/emma-indonesia.webp', ac: '#2f6bff' },   // 28 Okt 2026, permintaan pemilik
  { name: 'Juliar Candra', brand: 'Harrison Lab', logo: 'assets/brands/harrison-lab.webp', ac: '#4aa8ff' },
  { name: 'Arif', brand: 'Amo Plus', logo: 'assets/brands/amo-plus.webp', ac: '#b66cff' },
  { name: 'Yusak', brand: 'Sound Addict', logo: 'assets/brands/sound-addict.webp', ac: '#ff7a3d' },
];
// Urutan tampil (clicker): susunan → [speech CAI 1] → [recap 1] → kartu pembicara 1 → … (pembicara tanpa video: langsung kartu)
// Awarding — Best Dealer 2026 (dari sertifikat pemilik: top-ten-ranking 2–10 + plakat Defending Champion).
// Urutan reveal di layar: judul → Top 10 … Top 2 → Juara (Defending Champion) → papan peringkat lengkap.
const AWARD_DEALERS = [   // prize = hadiah (daftar dari pemilik), tampil di kartu Top/Juara & papan peringkat
  { rank: 1, name: 'DB Auto', logo: 'assets/awarding/db-auto.webp?v=2', title: 'Defending Champion Dealer', note: '3 Years in a Row', prize: 'Zelos SQ Class 200' },
  { rank: 2, name: 'Central Garage', prize: 'Zelos Tantalum' }, { rank: 3, name: 'DR Audio', prize: 'Zelos MFA5 Evo+ 2Ch' },
  { rank: 4, name: 'Nai Audioworks', prize: 'STEG SS-DSP16 II' }, { rank: 5, name: 'Mega Audio Jakarta', prize: 'Zelos Argentum' },
  { rank: 6, name: 'Blitz Audioworkshop', prize: 'STEG K Series 148' }, { rank: 7, name: 'Sterindo Autosound', prize: 'STEG QK 200.4' },
  { rank: 8, name: 'The Peak Garage', prize: 'Audiocircle BL-S10 MKII' }, { rank: 9, name: 'Dream Sound', prize: 'ZLS HD5.4 + Dios Cable 1M' },
  { rank: 10, name: 'Project Audio', prize: 'STEG SQW8' },
];
// Best Distributor 2026 (tabel pemilik, SINYO dikecualikan atas permintaan pemilik → peringkat diurutkan ulang). Nilai penjualan TIDAK dimasukkan (index.html publik).
const AWARD_DIST = [
  // person = nama pemilik/PIC (tampil di bawah nama distributor); kosong = tidak ditampilkan
  { rank: 1, name: 'Senada Gema Utama' }, { rank: 2, name: 'Harvest Variasi', person: 'Agustinus' },
  { rank: 3, name: 'PADI', person: 'Ronny Koesharyono' }, { rank: 4, name: 'Concerto Malang' },
  { rank: 5, name: 'VIN Audioworks', person: 'Kevin Klise' },   // Concerto Surabaya tidak ditampilkan (pemilik 26 Okt 2026)
];
// Kategori awarding: kunci scene 'awarding:<rank>' / 'awarding:list' = Best Dealer, 'awarding:d<rank>' / 'awarding:dlist' = Best Distributor
const AW_CATS = {
  // hideRank: peringkat 2..n tidak ditampilkan nomornya di layar (hanya Juara = No. 1) — pemilik 26 Okt 2026
  dist: { p: 'd', list: AWARD_DIST, hideRank: true, label: 'Best Distributor 2026', short: 'Best Distributor', no: '01', intro: 'Distributor dengan performa penjualan terbaik sepanjang 2026', sub: 'Concerto Audio Indonesia Performance Distributor 2026' },
  dealer: { p: '', list: AWARD_DEALERS, label: 'Best Dealer 2026', short: 'Best Dealer', no: '02', intro: 'Dealer dengan performa penjualan terbaik sepanjang 2026', sub: 'Concerto Audio Indonesia Performance Dealer 2026' },
};
const awKeys = c => ['awarding:' + AW_CATS[c].p + 'intro'].concat([...AW_CATS[c].list].sort((a, b) => b.rank - a.rank).map(d => 'awarding:' + AW_CATS[c].p + d.rank).concat('awarding:' + AW_CATS[c].p + 'list'));
// Urutan acara: judul → Best Distributor (pembuka → Top 5 … Juara → papan) → Best Dealer (pembuka → Top 10 … Juara → papan)
const AWARD_SEQ = ['awarding', ...awKeys('dist'), ...awKeys('dealer')];
const awPart = k => { const m = /^awarding:(d?)(\d+|list|intro)$/.exec(k || ''); return m ? { cat: m[1] ? 'dist' : 'dealer', r: /\d/.test(m[2]) ? +m[2] : m[2] } : null; };
const OPENING_SEQ = ['opening', ...OPENING_SPEAKERS.flatMap((sp, i) => [...(sp.intro ? [`opening:${i + 1}:i`] : []), ...(sp.video ? [`opening:${i + 1}:v`] : []), `opening:${i + 1}`])];
// Materi PKS Dealer 2027 (isi diskon/target → TIDAK di repo publik): PDF di Storage privat GUIDES_BUCKET, diunggah admin dari panel.
// Scene 'kickoff' = judul Kick Off, 'kickoff:<n>' = halaman PKS Dealer ke-n, 'kickoff:tl:<n>' = halaman PKS Team Leader ke-n (dirender pdf.js).
// PKS Team Leader ditambahkan 21 Okt 2026 (permintaan pemilik) — badge sejajar PKS Dealer di panel Kick Off.
const PKS_PATH = 'gathering/pks-dealer-2027.pdf';
const PKS_DOCS = {
  dealer: { label: 'PKS Dealer 2027', short: 'PKS Dealer', path: PKS_PATH },
  tl: { label: 'PKS Team Leader', short: 'PKS Team Leader', path: 'gathering/pks-team-leader-2027.pdf' },
};
const pksPart = k => { const m = /^kickoff:(?:(tl):)?(\d+)$/.exec(k || ''); return m ? { d: m[1] ? 'tl' : 'dealer', n: +m[2] } : null; };
const pksNum = k => pksPart(k)?.n || 0;
const pksKey = (d, n) => d === 'tl' ? 'kickoff:tl:' + n : 'kickoff:' + n;
let pksMeta = null;   // { dealer: { exists, pages }, tl: { exists, pages } } — di panel admin
let pksSel = 'dealer';   // dokumen PKS yang sedang dibuka di panel
const opNum = k => { const m = /^opening:(\d+)(:[vi])?$/.exec(k || ''); return m ? +m[1] : 0; };
const opVid = k => (/^opening:\d+:([vi])$/.exec(k || '') || [])[1] || '';   // 'v' = video recap, 'i' = video speech CAI, '' = kartu
const ANTHEM_VIDEO = 'assets/opening/indonesia-raya.mp4';   // video lagu kebangsaan Indonesia Raya (scene 'anthem:v'), pembuka acara pagi — dari Drive pemilik
const PORTAL_INTRO_VIDEO = 'assets/intro/portal-dealer-explainer-40s.mp4?v=3';   // video perkenalan portal (scene 'kickoff:v')
const fmNum = k => { const m = /^funmkt:(\d+)$/.exec(k || ''); return m ? +m[1] : 0; };
const sceneInfo = k => {
  const base = QS_SCENES[sceneBase(k)]; if (!base) return null;
  if (fmNum(k)) return { ...base, label: `Fun Marketing · Slide ${fmNum(k)}/${FM_SLIDES}` };
  if (sceneBase(k) === 'sertifikat') return { ...base, label: k === 'sertifikat:list' ? 'Sertifikat Dealer · Daftar semua' : certNum(k) ? `Sertifikat Dealer · ${certNum(k)}/${CERT_DEALERS.length} ${CERT_DEALERS[certNum(k) - 1]?.d || ''}` : base.label };
  if (sceneBase(k) === 'backdrop') return { ...base, label: bdNum(k) ? `Backdrop · ${BACKDROPS[bdNum(k) - 1]?.t}` : 'Backdrop · bergantian' };
  if (sceneBase(k) === 'flier') { const n = flNum(k), t = flierAdmin?.[n - 1]?.t; return { ...base, label: n ? `Flier · ${n}${t ? ' ' + t : ''}` : 'Flier · bergantian' }; }
  if (k === 'cailaunch:full' || k === 'cailaunch:v') return { ...base, icon: '🎬', label: `Launching CAI · ${k === 'cailaunch:v' ? 'video' : 'hitung mundur + video'}` };
  if (k === 'newbrand:full' || k === 'newbrand:v') return { ...base, icon: '🎬', label: `Launching ${NEW_BRAND.name} · ${k === 'newbrand:v' ? 'video' : 'hitung mundur + video'}` };
  if (sceneBase(k) === 'paket') { const pk = paketParse(k); return { ...base, label: pk.pkg ? `Paket Audio · ${pk.pkg.title.split(' — ')[0]}${pk.pages ? ` (hal. ${pk.page}/${pk.pages})` : ` (hal. ${pk.page})`}` : 'Paket Audio · daftar' }; }
  if (k === 'anthem:v') return { ...base, icon: '🎬', label: 'Indonesia Raya · Video lagu kebangsaan' };
  if (k === 'kickoff:v') return { ...base, icon: '🎬', label: 'Kick Off 2027 · Video Perkenalan Portal' };
  { const ab = absenPart(k); if (ab) return { ...base, icon: ab.jawab ? '✅' : '📋', label: ab.jawab ? 'Kick Off 2027 · Semua jawabannya ada di Portal' : `Kick Off 2027 · Absen Dosa ${ab.k}/${ABSEN_DOSA.length}` }; }
  { const pk = pksPart(k); if (pk) { const N = pksMeta?.[pk.d]?.pages; return { ...base, label: `Kick Off 2027 · ${PKS_DOCS[pk.d].short} hal. ${pk.n}${N ? '/' + N : ''}` }; } }
  { const a = awPart(k); if (a) { const C = AW_CATS[a.cat]; return { ...base, label: a.r === 'intro' ? `Awarding · Pembuka ${C.short}` : a.r === 'list' ? `Awarding · Papan peringkat ${C.short}` : `Awarding · ${C.short} ${a.r === 1 ? 'Juara' : 'Top ' + a.r} — ${C.list.find(d => d.rank === a.r)?.name || ''}` }; } }
  if (opNum(k)) { const sp = OPENING_SPEAKERS[opNum(k) - 1]; return { ...base, label: opVid(k) === 'i' ? `Opening Speech · ${sp.brand} · Speech ${sp.introBy || 'CAI'}` : `Opening Speech · ${sp.name} (${sp.brand})${opVid(k) ? ' · video recap' : ''}` }; }
  const tm = tmParts(k); if (tm) return { ...base, icon: '🎬', label: 'Testimoni Partner CAI · ' + (tm.idx == null ? 'semua video' : (TESTIMONI_VIDEOS[tm.idx]?.title || 'video ' + (tm.idx + 1))) };
  const { brand, idx } = launchParts(k), b = brand ? BRANDS.find(x => x.id === brand) : null;
  if (!b) return base;
  const v = idx != null ? LAUNCH_VIDEOS[brand]?.[idx] : null;
  return { ...base, icon: '🎬', label: 'Launch ' + b.name + (v ? ' · ' + v.title : ''), brand: b };
};
let scrRow = null;
const sceneCols = () => !!scrRow && 'scene' in scrRow;
const sceneReset = () => sceneCols() ? { scene: null, scene_text: null, scene_until: null } : {};

async function loadScreenRow() {
  if (!supabase || !isAdmin()) return;
  const { data, error } = await supabase.from(QA_SCREEN).select('*').eq('id', 1).maybeSingle();
  if (!error) { scrRow = data; qaScreenId = data?.question_id ?? qaScreenId; }
  renderScreenPanel(error);
  if (pksMeta === null) loadPksMeta();
}

// Panel layar per sesi: kartu sesi (urutan acara) → pane berisi kontrol khusus sesi terpilih.
// Backdrop (Free Time): 2 foto layar penuh. 'backdrop:1' / 'backdrop:2' = satu foto, 'backdrop' = bergantian otomatis
const BACKDROPS = [
  { t: 'Reset Button', src: 'assets/backdrop/reset-button.webp?v=2', th: 'assets/backdrop/reset-button-thumb.webp?v=2' },   // gambar 16:10 untuk layar 4 × 2,5 m (20 Okt 2026, menggantikan video 16:9)
  { t: '5th Annual Gathering · Dinner', src: 'assets/backdrop/gathering-dinner.webp', th: 'assets/backdrop/gathering-dinner-thumb.webp' },
  { t: 'Dinner · 16:10', src: 'assets/backdrop/dinner-1610.webp?v=2', th: 'assets/backdrop/dinner-1610-thumb.webp?v=2', video: 'assets/backdrop/dinner-1610.mp4?v=2' },   // opsi kedua backdrop dinner (20 Okt 2026, layar 4 × 2,5 m, tanpa foto): video loop 12 dtk motion graphic halus, gambar = cadangan
  { t: 'Penyerahan Sertifikat Dealer', src: 'assets/backdrop/sertifikat-dealer.webp?v=4', th: 'assets/backdrop/sertifikat-dealer-thumb.webp?v=4' },   // 21 Okt 2026 (diperbarui 28 Okt 2026, v=4): 38 dealer dikelompokkan per distributor (data dari pemilik), 16:10
  { t: 'Partner Masuk · Tidak Ada Zona Nyaman', src: 'assets/backdrop/zona-nyaman.webp', th: 'assets/backdrop/zona-nyaman-thumb.webp', video: 'assets/backdrop/zona-nyaman.mp4', welcome: true, sound: true },   // 24 Okt 2026: video motion 48 dtk dari pemilik, diputar berulang dengan suara aslinya saat partner masuk ballroom, sebelum Indonesia Raya
];
const WELCOME_BD = BACKDROPS.findIndex(b => b.welcome) + 1;   // nomor backdrop pembuka acara pagi (scene backdrop:<n>)
const BACKDROP_SEC = 12;
// putar video backdrop; bila browser menolak autoplay bersuara → diputar tanpa suara (operator klik layar sekali sebelum acara)
const playBd = v => { if (v) v.play().catch(() => { v.muted = true; v.dataset.am = '1'; v.play().catch(() => {}); }); };
// Autoplay bersuara ditolak browser → video backdrop (Partner Masuk) diputar tanpa suara; begitu operator mengklik / menekan
// tombol apa pun di layar videotron, suaranya dinyalakan kembali (27 Okt 2026 — sebelumnya tetap senyap sampai scene diulang)
['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => {
  document.querySelectorAll('video.bd-fg[data-am]').forEach(v => { v.muted = false; delete v.dataset.am; v.play().catch(() => {}); });
}, true));
// unduh video ke memori (blob URL di qsVidCache) — sekali per file, dipakai backdrop bersuara agar tidak buffering
const qsBlobJobs = {};
// Simpanan permanen di disk komputer videotron (Cache Storage): video cukup diunduh SEKALI — tetap ada walau tab dimuat
// ulang / browser ditutup (27 Okt 2026; sebelumnya hanya di memori tab sehingga hilang tiap tab memuat ulang versi baru)
const QS_VCACHE = 'cai-videotron-v1';
async function qsCachedBlob(src) {
  let c = null; try { c = await caches.open(QS_VCACHE); } catch (e) {}
  let r = c ? await c.match(src).catch(() => null) : null;
  if (!r) {
    r = await fetch(src); if (!r.ok) throw new Error(r.status);
    if (c) { try { await c.put(src, r.clone()); r = (await c.match(src)) || r; } catch (e) { /* kuota disk penuh → tetap dipakai dari memori */ } }
  }
  return r.blob();
}
const qsFetchBlob = src => qsBlobJobs[src] || (qsBlobJobs[src] = qsCachedBlob(src)
  .then(b => (qsVidCache[src] = URL.createObjectURL(b))).catch(() => { delete qsBlobJobs[src]; return src; }));   // detik per foto saat bergantian (backdrop video: diputar sampai selesai)
// Video baru diputar setelah file lengkap ada di komputer videotron (memori/Cache Storage) → tidak pernah buffering di
// tengah tayangan (27 Okt 2026, permintaan pemilik). Belum terunduh → diunduh saat itu juga (didahulukan); layar tetap
// gelap/poster sampai siap. Batas tunggu QS_VWAIT (mis. internet putus) → diputar streaming sebagai cadangan.
const QS_VWAIT = 45000;
async function qsReadySrc(src) {
  if (!src || /^blob:/.test(src) || qsVidCache[src]) return qsVidCache[src] || src;
  await Promise.race([qsFetchBlob(src), new Promise(r => setTimeout(r, QS_VWAIT))]);
  return qsVidCache[src] || src;
}
// set src + putar hanya bila elemen video masih sama (operator bisa sudah pindah scene selama menunggu)
function qsPlayWhenReady(v, raw, start) {
  const tok = v._qsTok = {};
  qsReadySrc(raw).then(u => { if (v._qsTok !== tok || !v.isConnected) return; v.src = u; start(); });
}
let qsBdTimer = null;
const bdNum = k => { const m = /^backdrop:(\d)$/.exec(k || ''); return m ? +m[1] : 0; };
// Flier (layar tambahan, 25 Okt 2026): gambar diunggah admin ke Storage privat guides/gathering/flier/ (bukan repo — flier bisa memuat harga promo).
// Nama file diawali stempel waktu → urutan tampil = urutan unggah. PDF diubah jadi gambar JPEG per halaman saat diunggah.
const FLIER_DIR = 'gathering/flier';
// flier bawaan (di repo, tampil paling depan, tanpa tombol hapus) — hanya flier tanpa harga dealer/diskon (SRP & harga paket jual umum boleh)
const FLIERS = [
  { t: 'Promo Beli 10 Gratis 1', src: 'assets/flier/beli10-gratis1.webp' },   // 25 Okt 2026, dari pemilik
  { t: 'Audio System · Car Audio Upgrade Package', src: 'assets/flier/audiosystem-upgrade-package.webp' },   // 25 Okt 2026, dari pemilik — harga = SRP + harga paket jual umum
];
const flNum = k => { const m = /^flier:(\d+)$/.exec(k || ''); return m ? +m[1] : 0; };
const flierTitle = n => n.replace(/^\d+-/, '').replace(/\.\w+$/, '').replace(/[_-]+/g, ' ').trim() || 'Flier';
const flierSafe = n => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.\w+$/, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'flier';
let flierCache = null, flierAt = 0, flierJob = null, flierAdmin = null;   // flierAdmin = daftar di panel (null = belum dimuat)
function flierList(force) {
  if (!force && flierCache && Date.now() - flierAt < 60000) return Promise.resolve(flierCache);
  if (flierJob && !force) return flierJob;
  const job = flierJob = (async () => {
    const base = FLIERS.map(f => ({ ...f, id: 'repo:' + f.src, repo: true }));
    if (!supabase) return (flierCache = base, flierAt = Date.now(), base);
    const store = supabase.storage.from(GUIDES_BUCKET);
    const { data, error } = await store.list(FLIER_DIR, { limit: 200, sortBy: { column: 'name', order: 'asc' } });
    if (error) { if (base.length) return base; throw error; }
    const files = (data || []).filter(f => /\.(jpe?g|png|webp)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    let urls = [];
    if (files.length) { const r = await store.createSignedUrls(files.map(f => FLIER_DIR + '/' + f.name), 7200); if (r.error) throw r.error; urls = r.data || []; }
    flierCache = base.concat(files.map((f, i) => ({ id: f.name, path: FLIER_DIR + '/' + f.name, t: flierTitle(f.name), src: urls[i]?.signedUrl })));
    flierAt = Date.now();
    return flierCache;
  })();
  job.finally(() => { if (flierJob === job) flierJob = null; }).catch(() => {});
  return job;
}
async function loadFlierAdmin(force) {
  try { flierAdmin = await flierList(force); } catch (e) { flierAdmin = []; showToast('Daftar flier tidak bisa dibaca: ' + (e.message || e), 8000); }
  if (scrSel === 'flier') renderScreenPanel();
}
// PDF → gambar JPEG per halaman (sisi terpanjang 2560 px, latar putih)
async function flierPdfPages(f) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: await f.arrayBuffer() }).promise;
  try {
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 2560 / Math.max(v1.width, v1.height) });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('halaman kosong')), 'image/jpeg', 0.9));
      out.push({ blob, ext: 'jpg', name: f.name.replace(/\.pdf$/i, '') + (doc.numPages > 1 ? ' hal ' + i : '') });
    }
    return out;
  } finally { doc.destroy(); }
}
async function uploadFliers(input) {
  const files = [...(input.files || [])]; input.value = ''; if (!files.length) return;
  const store = supabase.storage.from(GUIDES_BUCKET);
  let ok = 0, seq = 0;
  for (const f of files) {
    try {
      const img = f.name.match(/\.(jpe?g|png|webp)$/i);
      const parts = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) ? (showToast(`Mengubah PDF ${f.name} jadi gambar…`, 30000), await flierPdfPages(f))
        : img ? [{ blob: f, ext: img[1].toLowerCase().replace('jpeg', 'jpg'), name: f.name }] : null;
      if (!parts) { showToast(`${f.name}: pilih gambar JPG/PNG/WebP atau PDF.`, 6000); continue; }
      for (const pt of parts) {
        showToast(`Mengunggah flier ${ok + 1}…`, 30000);
        const path = `${FLIER_DIR}/${Date.now()}${String(seq++ % 100).padStart(2, '0')}-${flierSafe(pt.name)}.${pt.ext}`;
        const { error } = await store.upload(path, pt.blob, { upsert: true, contentType: pt.ext === 'jpg' ? 'image/jpeg' : 'image/' + pt.ext });
        if (error) throw error;
        ok++;
      }
    } catch (e) { showToast(`Gagal mengunggah ${f.name}: ${e.message || e}`, 9000); }
  }
  await loadFlierAdmin(true);
  if (ok) showToast(`✓ ${ok} flier tersimpan.`);
}
async function deleteFlier(path) {
  if (!confirm('Hapus flier ini?')) return;
  const { data, error } = await supabase.storage.from(GUIDES_BUCKET).remove([path]);
  if (error || !data?.length) { showToast('Gagal menghapus' + (error ? ': ' + error.message : ' (izin hapus belum diberikan).'), 9000); return; }
  await loadFlierAdmin(true);
  showToast('Flier dihapus.');
}
function flierStep(d) {
  const N = flierAdmin?.length || 0, n = flNum(scrRow?.scene); if (!N) return;
  const next = n ? Math.min(N, Math.max(1, n + d)) : (d > 0 ? 1 : N);
  if (next !== n) setScene('flier:' + next);
}
const FREE_NAME = 'Free Time';
// Panel Editor disusun mengikuti urutan acara: pagi (08:30–16:00), malam (18:00), lalu layar tambahan.
const SCR_PAGI = ['welcome', 'anthem', 'qa', 'coffee', 'launch', 'newbrand', 'lunch', 'kickoff'];
const SCR_MALAM = ['opening', 'awarding', 'dinner', 'healthy'];
const SCR_EXTRA = ['topspender', 'sertifikat', 'testimoni', 'funmkt', 'backdrop', 'flier', 'refresh', 'cailaunch'];
const SCR_GROUPS = [['☀️ Acara Pagi · 08:30 – 16:00', SCR_PAGI], ['🌙 Acara Malam · mulai 18:00', SCR_MALAM], ['✨ Layar tambahan', SCR_EXTRA]];
const SCR_LABEL = { qa: { icon: '🎤', label: 'Meeting Dealer', sub: 'Tanya Jawab Partner CAI' } };
// Launching Brand Baru: isi default (bisa ditimpa teks tambahan "Nama Brand | tagline" di panel).
// logo = path logo versi terang (latar gelap), mis. 'assets/brands/<id>.webp' — kosong = nama brand sebagai teks emas.
const NEW_BRAND = { name: 'Caelum', tagline: 'Power Amplifier', logo: 'assets/brands/caelum.webp', video: 'assets/newbrand/caelum.mp4' };
const NB_REVEAL_SEC = 6;   // mode 'newbrand:full': lama reveal nama brand sebelum video diputar
const LAUNCH_TOPICS = [['Audiocircle', 'Köln Series · IQ-LES10A'],
  ['STEG', 'SEC650C · K Series 136 · DSP S12 · DSP S6'], ['Audio System', 'AY65C · AY65 · AS500.1 · AS10 · DSP AS6']];
const SCR_DESC = {
  qa: 'Meeting Dealer (Tanya Jawab Partner CAI): pertanyaan dealer diketik admin/editor & tampil di videotron. Ketik & atur antrian di menu Open Mic Partner.',
  opening: 'Tampilkan susunan pembicara, lalu kartu tiap pembicara secara bergantian. Clicker / panah di komputer videotron juga bisa menggeser.',
  coffee: 'Layar rehat dengan hitung mundur (default 20 menit) dan info sesi berikutnya.',
  refresh: 'Judul sesi (membahas produk yang ada di katalog CAI) dengan strip logo brand berjalan.',
  launch: 'Judul Product Launch beserta daftar produk per brand (Audiocircle, STEG, Audio System); isi nama produk di teks tambahan, atau putar video per brand.',
  cailaunch: 'Peluncuran logo baru Concerto Audio Indonesia: hitung mundur 3-2-1 lalu video launching logo CAI (30 dtk), selesai → logo CAI muncul besar. Isi teks tambahan = yang diluncurkan (mis. nama produk / program), opsional.',
  newbrand: 'Peluncuran brand baru: hitung mundur 3-2-1, kilatan cahaya, lalu nama/logo brand muncul besar. Isi teks tambahan "Nama Brand | tagline".',
  lunch: 'Layar istirahat makan siang (1 jam) — isi hitung mundur bila perlu.',
  awarding: 'Puncak acara malam: layar judul Awarding — Best Distributor & Best Dealer (peringkat 10 besar). Daftar pemenang menyusul setelah data peringkat dikirim.',
  dinner: 'Layar makan malam (dinner) — isi hitung mundur bila perlu.',
  healthy: 'Layar Healthy Drink sebagai penutup acara.',
  testimoni: 'Judul sesi Testimoni Partner CAI, lalu putar video testimoni dari dealer (satu per satu atau semua berurutan). Teks tambahan = nama partner (opsional).',
  flier: 'Flier promo / produk tampil layar penuh (latar blur). Unggah gambar JPG/PNG/WebP atau PDF (tiap halaman jadi satu flier) — tersimpan di penyimpanan privat portal, tidak ikut situs publik. Pilih satu, atau tampilkan bergantian (12 dtk per flier); panah / clicker di komputer videotron juga bisa berpindah flier.',
  topspender: 'Papan Top Spender Shopping Gathering secara langsung: 10 besar beserta hadiahnya, peringkat 11 dst. berjalan di bawah. Data diperbarui otomatis tiap ±5 detik dari pesanan yang dikonfirmasi / belum lunas — tidak perlu klik ulang. Teks tambahan = kalimat di bawah judul (opsional).',
  backdrop: 'Backdrop acara tampil layar penuh — pilih satu, atau biarkan bergantian otomatis. Panah di komputer videotron juga bisa berpindah backdrop.',
  sertifikat: 'Penyerahan Sertifikat Dealer: layar judul → nama dealer muncul satu per satu (sesuai urutan maju ke panggung) → daftar semua dealer. Clicker / panah di komputer videotron menggeser ke dealer berikutnya.',
  funmkt: 'Judul presentasi, lalu slide materi. Clicker / panah di komputer videotron juga bisa mengganti slide.',
  welcome: 'Saat pintu ballroom dibuka & partner / distributor masuk: video "Tidak Ada Zona Nyaman" layar penuh, berulang terus tanpa suara (musik latar tetap jalan) sampai operator pindah ke Indonesia Raya.',
  anthem: 'Pembuka acara pagi (setelah Partner Masuk): layar "Menyanyikan Lagu Kebangsaan Indonesia Raya — hadirin dimohon berdiri", lalu video Indonesia Raya layar penuh (±1 menit 48 dtk). Musik latar otomatis senyap selama sesi ini.',
  kickoff: 'Judul Kick Off 2027 → Absen Dosa Dealer CAI (dibuka 1 per 1) → "Semua jawabannya ada di Portal" → video perkenalan portal → halaman materi PKS Dealer 2027 → PKS Team Leader. Clicker / panah di komputer videotron mengikuti urutan ini.',
};
let scrSel = null;
const scrOnAir = () => sceneBase(scrRow?.scene) || 'qa';
function scrSelect(k) { scrSel = k; renderScreenPanel(); }
function scrSessionTime(k) {
  const x = (rdItems || []).find(r => k === 'qa' ? QA_SESSION_RE.test(r.title) && !sceneForTitle(r.title) : sceneForTitle(r.title) === k);
  return x ? `${x.flexible ? '± ' : ''}${rdT(x.start_time)}` : '';
}

function renderScreenPanel(err) {
  const el = document.getElementById('scr-panel'); if (!el) return;
  if (err || !scrRow) { el.innerHTML = `<div class="scr-warn">Layar videotron belum siap: ${escHtml(err ? qaDbError(err) : 'jalankan SQL "gathering_screen".')}</div>`; return; }
  const sc = sceneInfo(scrRow.scene), air = scrOnAir();
  const sel = scrSel || air;
  const info = sel === 'qa' ? { icon: '🎤', label: 'Meeting Dealer · Tanya Jawab Partner CAI' } : QS_SCENES[sel];
  const live = sel === air;
  const opts = (mins, ph) => `<div class="scr-opts${mins ? '' : ' one'}">
      <input class="gt-input" id="scr-text" maxlength="120" placeholder="${ph || 'Teks tambahan (opsional) — mengganti kalimat bawah di layar'}">
      ${mins ? `<input class="gt-input" id="scr-mins" type="number" min="1" max="180" placeholder="Hitung mundur (menit${QS_SCENES[sel]?.mins ? ', kosong = ' + QS_SCENES[sel].mins : ''})">` : ''}</div>`;
  const showBtn = (label) => `<button class="gt-btn confirm" onclick="setScene(${sel === 'qa' ? 'null' : `'${sel}'`})">${live && (sel === 'qa' || scrRow.scene === sel) ? '↻ ' : '📺 '}${label || 'Tampilkan di layar'}</button>`;
  let body = '';
  if (sel === 'qa') body = `<div class="scr-actions">${showBtn('Tampilkan Meeting Dealer di layar')}<button class="gt-btn ghost" onclick="setRdTab('qa')">🎤 Buka menu Open Mic</button></div>`;
  else if (sel === 'sertifikat') { const cur = certNum(scrRow.scene), sc = scrRow.scene || '', N = CERT_DEALERS.length;
    let i = 0;
    body = `<div class="scr-actions">${showBtn('Tampilkan layar judul')}<button class="gt-btn${sc === 'sertifikat:list' ? ' confirm' : ' ghost'}" onclick="setScene('sertifikat:list')">📋 Daftar semua dealer</button></div>
    <div class="scr-fm-nav">
      <button class="scr-lv-btn" onclick="certStep(-1)" ${sceneBase(sc) === 'sertifikat' && sc !== 'sertifikat' ? '' : 'disabled'}>◀ Sebelumnya</button>
      <span class="scr-fm-now">${cur ? `Dealer <b>${cur}</b> / ${N} · ${escHtml(CERT_DEALERS[cur - 1].d)}` : sc === 'sertifikat:list' ? 'Daftar semua' : 'Belum ada dealer tampil'}</span>
      <button class="scr-lv-btn${cur ? '' : ' on'}" onclick="certStep(1)" ${sc === 'sertifikat:list' ? 'disabled' : ''}>${cur ? (cur < N ? 'Berikutnya ▶' : 'Daftar semua ▶') : '▶ Mulai dari dealer 1'}</button>
    </div>
    ${CERT_GROUPS.map(([g, ds]) => `<div class="scr-sub-k">Distributor · ${escHtml(g)}</div><div class="scr-pks-pages">${ds.map(d => { const n = ++i; return `<button class="scr-lv-btn${cur === n ? ' on' : ''}" onclick="setScene('sertifikat:${n}')">${n}. ${escHtml(d)}</button>`; }).join('')}</div>`).join('')}
    <div class="scr-note">Klik nama dealer untuk langsung menampilkannya, atau pakai ◀ / ▶ (clicker di komputer videotron juga bisa).</div>`; }
  else if (sel === 'backdrop') { const cur = bdNum(scrRow.scene), alt = scrRow.scene === 'backdrop';
    body = `<div class="scr-bd">${BACKDROPS.map((b, i) => `<button class="scr-bd-card${cur === i + 1 ? ' on' : ''}" onclick="setScene('backdrop:${i + 1}')"><img src="${b.th}" alt="${escHtml(b.t)}"><b>${i + 1}. ${escHtml(b.t)}${b.video ? ' <em class="scr-bd-vid">🎬 video</em>' : ''}</b><span>${cur === i + 1 ? '● Tampil · klik untuk ulang' : '▶ Tampilkan'}</span></button>`).join('')}</div>
    <div class="scr-actions"><button class="gt-btn${alt ? ' confirm' : ' ghost'}" onclick="setScene('backdrop')">${alt ? '↻ Bergantian otomatis (aktif)' : '🔁 Tampilkan bergantian'}</button></div>`; }
  else if (sel === 'flier') { if (flierAdmin === null) loadFlierAdmin();
    const L = flierAdmin || [], N = L.length, cur = flNum(scrRow.scene), alt = scrRow.scene === 'flier';
    body = `<div class="scr-actions"><label class="gt-btn confirm">⬆ Tambah Flier (gambar / PDF)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple hidden onchange="uploadFliers(this)"></label>${N ? `<button class="gt-btn${alt ? ' confirm' : ' ghost'}" onclick="setScene('flier')">${alt ? '↻ Bergantian otomatis (aktif)' : '🔁 Tampilkan bergantian'}</button>` : ''}</div>
    ${flierAdmin === null ? '<div class="scr-note">Memuat daftar flier…</div>' : !N ? '<div class="scr-note">Belum ada flier. Klik <b>Tambah Flier</b> — boleh pilih banyak file sekaligus; urutan tampil = urutan unggah.</div>'
      : `<div class="scr-fm-nav">
          <button class="scr-lv-btn" onclick="flierStep(-1)" ${cur > 1 ? '' : 'disabled'}>◀ Sebelumnya</button>
          <span class="scr-fm-now">${cur ? `Flier <b>${cur}</b> / ${N}` : alt ? 'Bergantian otomatis' : 'Belum tampil'}</span>
          <button class="scr-lv-btn${cur ? '' : ' on'}" onclick="flierStep(1)" ${cur && cur >= N ? 'disabled' : ''}>${cur ? 'Berikutnya ▶' : '▶ Mulai dari flier 1'}</button>
        </div>
        <div class="scr-bd">${L.map((f, i) => `<div class="scr-fl"><button class="scr-bd-card scr-fl-card${cur === i + 1 ? ' on' : ''}" onclick="setScene('flier:${i + 1}')"><img src="${escHtml(f.src || '')}" alt="${escHtml(f.t)}" loading="lazy"><b>${i + 1}. ${escHtml(f.t)}</b><span>${cur === i + 1 ? '● Tampil' : '▶ Tampilkan'}</span></button>${f.repo ? '' : `<button class="scr-fl-del" title="Hapus flier" onclick="deleteFlier('${escHtml(f.path)}')">🗑</button>`}</div>`).join('')}</div>`}
    <div class="scr-note">🔒 Flier disimpan privat (tidak ikut situs publik). Menghapus flier menggeser nomor flier sesudahnya.</div>`; }
  else if (sel === 'opening') body = `<div class="scr-actions">${showBtn('Tampilkan susunan pembicara')}</div>
    <div class="scr-sub-k">Pembicara</div>
    <div class="scr-fm-nav">${OPENING_SPEAKERS.map((sp, i) => { const b = BRANDS.find(x => x.id === sp.id); const on = opNum(scrRow.scene) === i + 1 && !opVid(scrRow.scene);
      return `<button class="scr-lv-btn${on ? ' on' : ''}" onclick="setScene('opening:${i + 1}')" title="${escHtml(sp.brand)}">${i + 1}. ${escHtml(sp.name)} <small class="scr-op-brand">${(sp.logo || b?.logo) ? `<img src="${sp.logo || b.logo}" alt="">` : escHtml(sp.brand)}</small></button>`
        + (sp.intro ? `<button class="scr-lv-btn${opNum(scrRow.scene) === i + 1 && opVid(scrRow.scene) === 'i' ? ' on' : ''}" onclick="setScene('opening:${i + 1}:i')" title="Putar video speech ${escHtml(sp.introBy || 'CAI')}">🎤 Speech ${escHtml((sp.introBy || 'CAI').split(' ')[0])}</button>` : '')
        + (sp.video ? `<button class="scr-lv-btn${opNum(scrRow.scene) === i + 1 && opVid(scrRow.scene) === 'v' ? ' on' : ''}" onclick="setScene('opening:${i + 1}:v')" title="Putar video recap ${escHtml(sp.name)}">🎬 Recap</button>` : ''); }).join('')}</div>
    <div class="scr-note">Audiocircle &amp; STEG: ▶ / clicker berurutan 🎤 speech CAI → 🎬 video recap → kartu pembicara (backdrop selama pembicara di panggung).</div>`;
  else if (sel === 'awarding') { const cur = scrRow.scene, ai = AWARD_SEQ.indexOf(cur);
    const row = c => `<div class="scr-sub-k">${AW_CATS[c].label} · Top ${AW_CATS[c].list.length} → Juara</div><div class="scr-lv"><div class="scr-lv-row">${awKeys(c).map(k => { const a = awPart(k), d = AW_CATS[c].list.find(x => x.rank === a.r);
      return `<button class="scr-lv-btn${cur === k ? ' on' : ''}" onclick="setScene('${k}')">${a.r === 'intro' ? '🎬 Pembuka kategori' : a.r === 'list' ? '🏆 Papan peringkat' : a.r === 1 ? `👑 Juara · ${escHtml(d.name)}` : `${a.r}. ${escHtml(d.name)}`}</button>`; }).join('')}</div></div>`;
    body = `${opts(false, 'Teks bawah judul (opsional)')}<div class="scr-actions">${showBtn('Tampilkan judul Awarding')}</div>
    <div class="scr-fm-nav"><button class="scr-lv-btn" onclick="awStep(-1)" ${ai > 0 ? '' : 'disabled'}>◀ Sebelumnya</button>
      <span class="scr-fm-now">${ai > 0 ? escHtml(sceneInfo(cur).label.replace('Awarding · ', '')) : 'Belum mulai'}</span>
      <button class="scr-lv-btn${ai > 0 ? '' : ' on'}" onclick="awStep(1)" ${ai < AWARD_SEQ.length - 1 ? '' : 'disabled'}>${ai > 0 ? 'Berikutnya ▶' : '▶ Mulai (Pembuka Best Distributor)'}</button></div>
    ${row('dist')}${row('dealer')}
    <div class="scr-note">Urutan ▶: Best Distributor (pembuka → Top 5 → Juara → papan) lalu Best Dealer (pembuka → Top 10 → Juara → papan). Tampilan motion graphic + SFX; klik layar videotron sekali sebelum acara agar suara diizinkan. Clicker / panah di komputer videotron juga bisa melangkah.</div>`; }
  else if (sel === 'funmkt') body = `<div class="scr-actions">${showBtn('Tampilkan judul presentasi')}</div>
    <div class="scr-sub-k">Slide materi</div>
    <div class="scr-fm-nav">
      <button class="scr-lv-btn" onclick="fmStep(-1)" ${fmNum(scrRow.scene) > 1 ? '' : 'disabled'}>◀ Sebelumnya</button>
      <span class="scr-fm-now">${fmNum(scrRow.scene) ? `Slide <b>${fmNum(scrRow.scene)}</b> / ${FM_SLIDES}` : 'Belum tampil'}</span>
      <button class="scr-lv-btn${fmNum(scrRow.scene) ? '' : ' on'}" onclick="fmStep(1)" ${fmNum(scrRow.scene) < FM_SLIDES ? '' : 'disabled'}>${fmNum(scrRow.scene) ? 'Berikutnya ▶' : '▶ Mulai dari slide 1'}</button>
    </div>
    <div class="scr-fm-thumbs">${Array.from({ length: FM_SLIDES }, (_, i) => `<button class="scr-fm-th${fmNum(scrRow.scene) === i + 1 ? ' on' : ''}" onclick="setScene('funmkt:${i + 1}')" title="Slide ${i + 1}">${FM_TITLE_SLIDES.includes(i + 1) ? '<b>FUN<br>MARKETING</b>' : `<img src="${fmSlide(i + 1, true)}" alt="" loading="lazy">`}<span>${i + 1}</span></button>`).join('')}</div>`;
  else if (sel === 'testimoni') { const tv = TESTIMONI_VIDEOS, tmI = tmParts(scrRow.scene);
    body = `${opts(false, 'Nama partner (opsional) — tampil di bawah judul')}
    <div class="scr-actions">${showBtn('Tampilkan judul Testimoni')}${tv.length ? `<button class="gt-btn${tmI && tmI.idx == null ? ' confirm' : ' ghost'}" onclick="setScene('testimoni:all')">${tmI && tmI.idx == null ? '↻' : '▶'} Putar semua (${tv.length})</button>` : `<button class="gt-btn ghost" onclick="setScene('testimoni:all')">🎬 Mulai (pilih file di komputer videotron)</button>`}</div>
    ${tv.length ? `<div class="scr-sub-k">Video testimoni</div><div class="scr-lv"><div class="scr-lv-row">${tv.map((v, i) => `<button class="scr-lv-btn${tmI && tmI.idx === i ? ' on' : ''}" onclick="setScene('testimoni:${i}')">${tmI && tmI.idx === i ? '↻' : '▶'} ${i + 1}. ${escHtml(v.title)}</button>`).join('')}</div></div>`
      : '<div class="scr-note">Belum ada video di portal. Kirim video testimoni dealer (link Google Drive), nanti dipasang di daftar ini. Sementara itu, tekan <b>Mulai</b> lalu pilih file video langsung di komputer videotron.</div>'}`; }
  else if (sel === 'launch') body = `${opts(false, 'Nama produk yang diluncurkan (opsional) — tampil besar di layar')}
    <div class="scr-actions">${showBtn('Tampilkan judul Product Launch')}</div>
    <div class="scr-sub-k">Video per brand</div>
    <div class="scr-lv">${Object.entries(LAUNCH_VIDEOS).map(([id, vids]) => { const b = BRANDS.find(x => x.id === id); const all = 'launch:' + id;
      return `<div class="scr-lv-row"><span class="scr-lv-brand">${b?.logo ? `<img src="${b.logo}" alt="${escHtml(b.name)}">` : escHtml(b?.name || id)}</span>
        ${vids.length > 1 ? `<button class="scr-lv-btn${scrRow.scene === all ? ' on' : ''}" onclick="setScene('${all}')">${scrRow.scene === all ? '↻ Ulang semua' : `▶ Putar semua (${vids.length})`}</button>` : ''}
        ${vids.map((v, i) => { const k = vids.length > 1 ? `${all}:${i}` : all, on = scrRow.scene === k;
          return `<button class="scr-lv-btn${on ? ' on' : ''}" onclick="setScene('${k}')">${on ? '↻' : '▶'} ${vids.length > 1 ? (i + 1) + '. ' : ''}${escHtml(v.title)}</button>`; }).join('')}</div>`; }).join('')}</div>`;
  else if (sel === 'cailaunch') { const cn = scrRow.scene === 'cailaunch:now', cf = scrRow.scene === 'cailaunch:full', cv = scrRow.scene === 'cailaunch:v';
    body = `${opts(false, 'Yang diluncurkan (opsional) — tampil di bawah logo CAI')}
    <div class="scr-actions"><button class="gt-btn confirm" onclick="setScene('cailaunch:full')">${cf ? '↻' : '🚀'} Hitung mundur 3-2-1 → video launching logo CAI</button><button class="gt-btn${cv ? ' confirm' : ' ghost'}" onclick="setScene('cailaunch:v')">${cv ? '↻ Putar ulang video' : '🎬 Putar video saja'}</button></div>
    <div class="scr-actions">${showBtn('Hitung mundur 3-2-1 → logo CAI (tanpa video)')}<button class="gt-btn${cn ? ' confirm' : ' ghost'}" onclick="setScene('cailaunch:now')">${cn ? '↻ Tampilkan langsung' : '⚡ Logo langsung (tanpa hitung mundur)'}</button></div>
    <div class="scr-note">Video 30 dtk: logo lama Concerto berubah menjadi logo baru CAI; selesai → layar "Official Launching" + logo CAI tetap tampil. Musik latar otomatis senyap selama video. Klik ulang = diulang.</div>`; }
  else if (sel === 'newbrand') { const nb = scrRow.scene === 'newbrand:now', nf = scrRow.scene === 'newbrand:full', nv = scrRow.scene === 'newbrand:v';
    body = `${opts(false, 'Nama Brand | tagline (opsional) — kosong = ' + NEW_BRAND.name + ' | ' + NEW_BRAND.tagline)}
    ${NEW_BRAND.video ? `<div class="scr-actions"><button class="gt-btn confirm" onclick="setScene('newbrand:full')">${nf ? '↻' : '🚀'} Hitung mundur → ${escHtml(NEW_BRAND.name)} → putar video</button><button class="gt-btn${nv ? ' confirm' : ' ghost'}" onclick="setScene('newbrand:v')">${nv ? '↻' : '🎬'} Putar video ${escHtml(NEW_BRAND.name)} saja</button></div>
    <div class="scr-note">Alur lengkap: 3-2-1 → nama ${escHtml(NEW_BRAND.name)} tampil ${NB_REVEAL_SEC} dtk → video layar penuh → selesai kembali ke layar nama. Spasi di komputer videotron = jeda/lanjut.</div>` : ''}
    <div class="scr-actions">${showBtn('Hitung mundur 3-2-1 (tanpa video)')}<button class="gt-btn${nb ? ' confirm' : ' ghost'}" onclick="setScene('newbrand:now')">${nb ? '↻ Tampilkan langsung' : '⚡ Tampilkan langsung (tanpa hitung mundur)'}</button></div>
    <div class="scr-note">Contoh: <b>Nama Brand | Sound beyond limits</b>. Nama yang sama dengan brand di katalog otomatis memakai logonya. Klik ulang = animasi diulang.</div>`; }
  else if (sel === 'welcome') {
    body = `<div class="scr-actions">${showBtn('Tampilkan Backdrop Partner Masuk (loop)')}</div>
    <div class="scr-note">Video berulang terus sampai operator memilih layar lain. Lanjut ke kartu <b>Indonesia Raya</b> saat acara dimulai.</div>`; }
  else if (sel === 'anthem') { const av = scrRow.scene === 'anthem:v';
    body = `<div class="scr-actions">${showBtn('Tampilkan layar Indonesia Raya')}<button class="gt-btn${av ? ' confirm' : ' ghost'}" onclick="setScene('anthem:v')">${av ? '↻ Putar ulang video' : '🎬 Putar Video Indonesia Raya'}</button></div>
    <div class="scr-note">Urutan: tampilkan layar judul (MC mempersilakan hadirin berdiri) → <b>Putar Video</b> → video layar penuh; selesai kembali ke layar judul. Musik latar senyap selama sesi Indonesia Raya. Spasi = jeda/lanjut.</div>`; }
  else if (sel === 'kickoff') { const onAir = pksPart(scrRow.scene); if (onAir && !scrPksTouched) pksSel = onAir.d;
    const D = PKS_DOCS[pksSel], M = pksMeta?.[pksSel], cur = onAir?.d === pksSel ? onAir.n : 0, n = M?.pages || 0;
    const pv = scrRow.scene === 'kickoff:v';
    const ab = absenPart(scrRow.scene);
    body = `${opts(false)}<div class="scr-actions">${showBtn('Tampilkan judul Kick Off 2027')}<button class="gt-btn${pv ? ' confirm' : ' ghost'}" onclick="setScene('kickoff:v')">${pv ? '↻ Putar ulang video perkenalan' : '🎬 Putar Video Perkenalan Portal'}</button></div>
    <div class="scr-note">Video motion Portal Dealer (40 dtk, dengan musik & efek suara) diputar layar penuh di videotron; selesai → kembali ke kartu Kick Off. Spasi = jeda/lanjut.</div>
    <div class="scr-sub-k">📋 Absen Dosa Dealer CAI</div>
    <div class="scr-fm-nav">
      <button class="scr-lv-btn" onclick="absenStep(-1)" ${ab && !ab.jawab && ab.k > 0 ? '' : 'disabled'}>◀ Sebelumnya</button>
      <span class="scr-fm-now">${ab ? (ab.jawab ? '✅ Layar jawaban' : `Dibuka <b>${ab.k}</b> / ${ABSEN_DOSA.length}`) : 'Belum tampil'}</span>
      <button class="scr-lv-btn${ab ? '' : ' on'}" onclick="absenStep(1)" ${ab?.jawab ? 'disabled' : ''}>${!ab ? '▶ Mulai Absen Dosa' : ab.k < ABSEN_DOSA.length ? 'Buka berikutnya ▶' : 'Jawaban ▶'}</button>
    </div>
    <div class="scr-actions"><button class="gt-btn ghost" onclick="setScene('kickoff:absen:all')">Tampilkan semua ${ABSEN_DOSA.length} sekaligus</button><button class="gt-btn${ab?.jawab ? ' confirm' : ' ghost'}" onclick="setScene('kickoff:jawab')">✅ Semua jawabannya ada di Portal</button></div>
    <div class="scr-note">Clicker / panah: judul Kick Off → pembuka absen → dosa 1 … ${ABSEN_DOSA.length} (satu per klik) → layar jawaban (fitur portal) → video perkenalan portal → PKS Dealer → PKS Team Leader.</div>
    <div class="scr-sub-k">Materi PKS <span class="scr-priv">🔒 file privat — tidak ikut situs publik</span></div>
    <div class="scr-pks-tabs">${Object.entries(PKS_DOCS).map(([id, d]) => { const m = pksMeta?.[id];
      return `<button class="scr-pks-tab${id === pksSel ? ' sel' : ''}" onclick="pksSelect('${id}')">${onAir?.d === id ? '<i class="scr-live">● LIVE</i>' : ''}<b>📄 ${d.label}</b><small>${pksMeta === null ? 'memeriksa…' : m?.exists ? `✓ ${m.pages || '?'} halaman` : 'belum diunggah'}</small></button>`; }).join('')}</div>
    ${pksMeta === null ? '<div class="scr-note">Memeriksa file PKS…</div>' : !M?.exists
      ? `<div class="scr-note">Belum ada file <b>${D.label}</b>. Unggah PDF-nya sekali saja — tersimpan di penyimpanan privat portal.</div>`
      : `<div class="scr-fm-nav">
          <button class="scr-lv-btn" onclick="pksStep(-1)" ${cur > 1 ? '' : 'disabled'}>◀ Sebelumnya</button>
          <span class="scr-fm-now">${cur ? `Halaman <b>${cur}</b> / ${n || '?'}` : 'Belum tampil'}</span>
          <button class="scr-lv-btn${cur ? '' : ' on'}" onclick="pksStep(1)" ${!n || cur < n ? '' : 'disabled'}>${cur ? 'Berikutnya ▶' : '▶ Mulai dari halaman 1'}</button>
        </div>
        ${cur ? `<div class="scr-pks-prev-wrap"><canvas id="scr-pks-prev" class="scr-pks-prev"></canvas><span>Pratinjau yang tampil di videotron · hal. ${cur}</span></div>` : ''}
        <div class="scr-pks-pages">${Array.from({ length: n }, (_, i) => `<button class="scr-lv-btn${cur === i + 1 ? ' on' : ''}" onclick="setScene('${pksKey(pksSel, i + 1)}')">${i + 1}</button>`).join('')}</div>`}
    <div class="scr-actions"><label class="gt-btn ghost">⬆ ${M?.exists ? 'Ganti' : 'Unggah'} PDF ${D.label}<input type="file" accept="application/pdf" hidden onchange="uploadPks(this, '${pksSel}')"></label>${M?.exists ? `<button class="gt-btn ghost gt-del" onclick="deletePks('${pksSel}')">🗑 Hapus PDF ${D.label}</button>` : ''}</div>`; }
  else body = `${opts(sel === 'coffee' || sel === 'lunch' || sel === 'dinner' || sel === 'healthy')}<div class="scr-actions">${showBtn()}</div>`;
  el.innerHTML = `<div class="scr-head"><span class="qa-dot on"></span><span>Layar videotron sekarang: <b>${sc ? sc.icon + ' ' + sc.label : '🎤 Meeting Dealer'}</b></span>
      <button class="gt-btn confirm" onclick="openQaScreen()">🖥 Buka Layar Videotron</button></div>
    ${sceneCols() ? '' : '<div class="scr-warn">Jalankan SQL kolom <b>scene</b> di Supabase agar tampilan per sesi bisa dipakai.</div>'}
    ${bgmPanelHtml()}
    ${SCR_GROUPS.map(([gl, ks]) => `<div class="scr-grp-k">${gl}</div><div class="scr-sessions">${ks.map(k => { const v = SCR_LABEL[k] || QS_SCENES[k], n = ks === SCR_EXTRA ? '' : ks.indexOf(k) + 1;
      return `<button class="scr-btn${k === sel ? ' sel' : ''}${k === air ? ' on' : ''}" onclick="scrSelect('${k}')">${k === air ? '<i class="scr-live">● LIVE</i>' : ''}${n ? `<em>${n}</em>` : ''}<span>${v.icon}</span>${v.label}<small>${scrSessionTime(k) || v.sub || ''}</small></button>`; }).join('')}</div>`).join('')}
    <div class="scr-pane">
      <div class="scr-pane-head"><span class="scr-pane-ic">${info.icon}</span><div><b>${info.label}</b><p>${SCR_DESC[sel]}</p></div>${live ? '<span class="qa-badge onair">● Sedang tampil</span>' : ''}</div>
      ${body}
    </div>`;
  { const pk = pksPart(scrRow?.scene); if (sel === 'kickoff' && pk && pk.d === pksSel && pksMeta?.[pk.d]?.exists) renderPksPreview(pk.n, pk.d); }
}

// Pratinjau kecil halaman PKS yang sedang tampil, di panel admin
let scrPksTouched = false;   // editor memilih badge PKS sendiri → jangan ikut berpindah ke dokumen yang sedang tayang
function pksSelect(d) { pksSel = d; scrPksTouched = true; renderScreenPanel(); }
async function renderPksPreview(n, d = 'dealer') {
  try {
    const doc = await getPksDoc(d), page = await doc.getPage(n);
    const cv = document.getElementById('scr-pks-prev'); if (!cv) return;
    const vp = page.getViewport({ scale: 260 / page.getViewport({ scale: 1 }).height * (window.devicePixelRatio || 1) });
    cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  } catch (e) {}
}
function certStep(d) {
  const sc = scrRow?.scene || '', cur = sceneBase(sc) === 'sertifikat' ? Math.max(0, CERT_SEQ.indexOf(sc)) : -1;
  const next = Math.min(CERT_SEQ.length - 1, Math.max(0, cur + d));
  if (next !== cur) setScene(CERT_SEQ[next]);
}
function absenStep(d) {
  const ab = absenPart(scrRow?.scene), N = ABSEN_DOSA.length;
  if (!ab) return d > 0 && setScene('kickoff:absen:0');
  if (ab.jawab) return d < 0 && setScene('kickoff:absen:' + N);
  const k = ab.k + d;
  if (k > N) return setScene('kickoff:jawab');
  if (k >= 0) setScene('kickoff:absen:' + k);
}
function pksStep(d) {
  const pk = pksPart(scrRow?.scene), n = pk?.d === pksSel ? pk.n : 0, max = pksMeta?.[pksSel]?.pages || 999;
  const next = Math.min(max, Math.max(1, (n || 0) + d));
  if (next !== n) setScene(pksKey(pksSel, next));
}
// pdf.js dimuat hanya saat materi PKS dipakai
let pdfLib = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfLib) return pdfLib;
  pdfLib = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = () => { pdfLib = null; rej(new Error('Gagal memuat pembaca PDF. Periksa koneksi internet.')); };
    document.head.appendChild(s);
  });
  return pdfLib;
}
const pksDocs = {};   // per dokumen PKS: promise dokumen pdf.js
const pksDocStamp = {};   // waktu ubah file PKS saat dokumen di pksDocs dimuat
let pksListAt = 0, pksListP = null;
// Waktu ubah file di folder gathering/ (Storage) — dibatasi 1x per 8 dtk
function pksFileStamps(force) {
  if (!force && pksListP && Date.now() - pksListAt < 8000) return pksListP;
  pksListAt = Date.now();
  return pksListP = supabase.storage.from(GUIDES_BUCKET).list('gathering', { limit: 100 })
    .then(({ data }) => Object.fromEntries((data || []).map(f => ['gathering/' + f.name, f.updated_at || f.created_at || ''])))
    .catch(() => null);   // null = gagal dibaca (jangan dianggap file terhapus)
}
function getPksDoc(d = 'dealer', fresh) {
  if (pksDocs[d] && !fresh) {
    // PDF diganti dari komputer lain? Cek di latar; bila berubah, buang cache & minta layar merender ulang
    pksFileStamps().then(st => {
      if (!st || pksDocStamp[d] == null) return;
      const s = st[PKS_DOCS[d].path] || '';   // '' = file dihapus
      if (s === pksDocStamp[d]) return;
      delete pksDocs[d]; delete pksDocStamp[d];
      if (typeof qsPksPages !== 'undefined') delete qsPksPages[d];
      if (QA_SCREEN_MODE && String(qsKey || '').startsWith(`pks|${d}|`)) qsKey = null;
    });
    return pksDocs[d];
  }
  const p = pksDocs[d] = (async () => {
    const lib = await loadPdfJs();
    pksDocStamp[d] = (await pksFileStamps(true))?.[PKS_DOCS[d].path] || '';
    const { data, error } = await supabase.storage.from(GUIDES_BUCKET).createSignedUrl(PKS_DOCS[d].path, 3600);
    if (error) throw error;
    return lib.getDocument(data.signedUrl).promise;
  })();
  p.catch(() => { if (pksDocs[d] === p) delete pksDocs[d]; });
  return p;
}
async function loadPksMeta() {
  if (!supabase || !isAdmin()) return;
  const meta = {};
  try {
    const { data } = await supabase.storage.from(GUIDES_BUCKET).list('gathering', { limit: 100 });
    for (const [id, D] of Object.entries(PKS_DOCS)) {
      const exists = (data || []).some(f => 'gathering/' + f.name === D.path);
      meta[id] = { exists, pages: 0 };
      if (exists) meta[id].pages = await getPksDoc(id).then(doc => doc.numPages).catch(() => 0);
    }
    pksMeta = meta;
  } catch (e) { pksMeta = pksMeta || { dealer: { exists: false, pages: 0 }, tl: { exists: false, pages: 0 } }; showToast('Materi PKS tidak bisa dibaca: ' + (e.message || e), 8000); }
  renderScreenPanel();
}
async function uploadPks(input, d = 'dealer') {
  const f = input.files?.[0]; input.value = ''; if (!f) return;
  if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { showToast('Pilih file PDF.'); return; }
  showToast(`Mengunggah ${PKS_DOCS[d].label}…`, 20000);
  const { error } = await supabase.storage.from(GUIDES_BUCKET).upload(PKS_DOCS[d].path, f, { upsert: true, contentType: 'application/pdf', cacheControl: '10' });
  if (error) { showToast('Gagal mengunggah: ' + error.message, 9000); return; }
  delete pksDocs[d]; await loadPksMeta(); showToast(`✓ ${PKS_DOCS[d].label} tersimpan (${pksMeta?.[d]?.pages || '?'} halaman).`);
}

async function deletePks(d = 'dealer') {
  if (!confirm(`Hapus PDF ${PKS_DOCS[d].label} yang sudah diunggah?\n\nLayar videotron tidak bisa menampilkan materi ini sampai PDF diunggah lagi.`)) return;
  const { data, error } = await supabase.storage.from(GUIDES_BUCKET).remove([PKS_DOCS[d].path]);
  if (error || !data?.length) { showToast('Gagal menghapus: ' + (error?.message || 'izin hapus Storage belum diatur.'), 9000); return; }
  delete pksDocs[d]; delete pksDocStamp[d]; pksListAt = 0;
  await loadPksMeta(); showToast(`🗑 PDF ${PKS_DOCS[d].label} dihapus.`);
}

function fmStep(d) {
  const n = fmNum(scrRow?.scene);
  const next = Math.min(FM_SLIDES, Math.max(1, (n || 0) + d));
  if (next !== n) setScene('funmkt:' + next);
}

async function setScene(key) {
  if (!supabase) return;
  if (key && !sceneCols()) { showToast('Jalankan SQL kolom scene di Supabase dulu.', 8000); return; }
  if (!key && !scrRow?.scene) { renderScreenPanel(); return; }
  const text = document.getElementById('scr-text')?.value.trim() || null;
  const minsIn = parseInt(document.getElementById('scr-mins')?.value, 10);
  const mins = key && !key.includes(':') ? (minsIn > 0 ? minsIn : (QS_SCENES[key].mins || 0)) : 0;
  const row = { id: 1, scene: key, scene_text: key ? text : null, scene_until: mins ? new Date(Date.now() + mins * 60000).toISOString() : null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from(QA_SCREEN).upsert(row);
  if (error) { showToast('Gagal mengubah layar: ' + error.message, 9000); return; }
  scrRow = { ...scrRow, ...row };
  renderScreenPanel(); renderRundown(); if (rdTab === 'qa') renderQa();
  if (!fmNum(key)) showToast(key ? `🖥 Layar: ${sceneInfo(key).label}${mins ? ` · hitung mundur ${mins} menit` : ''}` : '🖥 Layar kembali ke Meeting Dealer');
}

/* Desain tiap sesi di layar videotron */
const SC_CUP = '<svg class="sc-svg" viewBox="0 0 120 120" aria-hidden="true"><g class="sc-steam" fill="none" stroke="#e9c46a" stroke-width="4" stroke-linecap="round"><path d="M44 40c-6-8 6-12 0-20"/><path d="M60 40c-6-8 6-12 0-20"/><path d="M76 40c-6-8 6-12 0-20"/></g><path d="M26 50h66v20a30 30 0 0 1-30 30h-6a30 30 0 0 1-30-30z" fill="rgba(233,196,106,.12)" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M92 56h5a12 12 0 0 1 0 24h-7" fill="none" stroke="#fff" stroke-width="5"/><line x1="18" y1="110" x2="102" y2="110" stroke="#e9c46a" stroke-width="5" stroke-linecap="round"/></svg>';
const SC_MEGA = '<svg class="sc-svg sc-mega" viewBox="0 0 140 120" aria-hidden="true"><path d="M22 50h18l46-26v72L40 70H22a6 6 0 0 1-6-6V56a6 6 0 0 1 6-6z" fill="rgba(233,196,106,.12)" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M34 70l8 26h12l-6-24" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><g class="sc-waves" fill="none" stroke="#e9c46a" stroke-width="5" stroke-linecap="round"><path d="M100 46a20 20 0 0 1 0 28"/><path d="M110 36a34 34 0 0 1 0 48"/><path d="M120 26a48 48 0 0 1 0 68"/></g></svg>';
const SC_QUOTE = '<svg class="sc-svg" viewBox="0 0 140 120" aria-hidden="true"><path d="M18 26h66a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H48l-16 14V78h-14a8 8 0 0 1-8-8V34a8 8 0 0 1 8-8z" fill="rgba(233,196,106,.12)" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M62 56h60a8 8 0 0 1 8 8v30a8 8 0 0 1-8 8h-10v12l-14-12H62a8 8 0 0 1-8-8V64a8 8 0 0 1 8-8z" fill="none" stroke="#e9c46a" stroke-width="4" stroke-linejoin="round"/><circle cx="74" cy="80" r="3.5" fill="#e9c46a"/><circle cx="90" cy="80" r="3.5" fill="#e9c46a"/><circle cx="106" cy="80" r="3.5" fill="#e9c46a"/></svg>';
const SC_PLATE = '<svg class="sc-svg" viewBox="0 0 140 120" aria-hidden="true"><circle cx="70" cy="62" r="36" fill="rgba(233,196,106,.10)" stroke="#fff" stroke-width="5"/><circle cx="70" cy="62" r="22" fill="none" stroke="#e9c46a" stroke-width="3"/><path d="M16 28v22a7 7 0 0 0 14 0V28M23 28v74" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M122 28c-9 6-9 28 0 34v40" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let qsSceneNow = null;   // scene yang sedang dirender (cek setelah muat asinkron, mis. daftar flier)
function renderScene(s) {
  qsSceneNow = s.scene;
  qsSetEventSub(sceneBase(s.scene));
  if (String(s.scene).startsWith('launch:')) return renderLaunchVideo(s);
  if (tmParts(s.scene)) return renderTestimoniVideo(s);
  if (fmNum(s.scene) && !FM_TITLE_SLIDES.includes(fmNum(s.scene))) return renderFmSlide(fmNum(s.scene));
  if (sceneBase(s.scene) === 'backdrop') return renderBackdrop(s);
  if (sceneBase(s.scene) === 'flier') return renderFlier(s);
  if (s.scene === 'welcome' && WELCOME_BD) return renderBackdrop({ ...s, scene: 'backdrop:' + WELCOME_BD });   // kartu Partner Masuk = backdrop "Tidak Ada Zona Nyaman" (loop)
  if (sceneBase(s.scene) === 'sertifikat') return renderCert(s);
  if (sceneBase(s.scene) === 'paket') return renderPaket(s);
  if (sceneBase(s.scene) === 'topspender') return renderTopSpender(s);
  if (sceneBase(s.scene) === 'opening') qsPrefetchOpening(opNum(s.scene));
  if (opNum(s.scene)) return renderOpeningSpeaker(opNum(s.scene), opVid(s.scene), s.updated_at);
  if (s.scene === 'awarding') return renderAwardTitle(s);
  if (awPart(s.scene)) return renderAwarding(s.scene, s.updated_at);
  if (absenPart(s.scene)) return renderAbsen(s);
  { const pk = pksPart(s.scene); if (pk) return renderPksPage(pk.n, pk.d); }
  const sc = QS_SCENES[sceneBase(s.scene)], t = s.scene_text ? escHtml(s.scene_text) : '';
  const count = s.scene_until ? `<div class="sc-count"><span class="qs-count" data-until="${escHtml(s.scene_until)}">--:--</span><small>sisa waktu</small></div>` : '';
  const next = sc.next ? `<div class="sc-next">Setelah ini · <b>${sc.next}</b></div>` : '';
  const logos = BRANDS.filter(b => b.logo).map(b => `<img src="${b.logo}" alt="${escHtml(b.name)}">`).join('');
  const li = a => a.map(x => `<li>${escHtml(x)}</li>`).join('');
  const html = {
    coffee: `<div class="qs-scene sc-coffee">${SC_CUP}<div class="qs-kicker">Rehat Sejenak</div><h1 class="sc-title">Coffee <em>Break</em></h1>
      <p class="sc-sub">${t || 'Silakan menikmati kopi &amp; snack yang telah disediakan'}</p>${count}${next}</div>`,
    refresh: `<div class="qs-scene sc-refresh"><div class="qs-kicker">Listening and Understanding Partner</div><h1 class="sc-title">Refreshment <em>Product</em></h1>
      <p class="sc-sub">${t || 'Membahas produk yang ada di katalog Concerto Audio Indonesia'}</p>
      <div class="sc-logos"><div class="sc-track">${logos}${logos}</div></div>${count}</div>`,
    launch: `<div class="qs-scene sc-launch lh"><div class="lh-bg"><div class="sc-rays"></div><i class="lh-ring r1"></i><i class="lh-ring r2"></i><i class="lh-ring r3"></i><span class="lh-year">2027</span>${lhSparks()}<i class="lh-streak s1"></i><i class="lh-streak s2"></i></div>
      <i class="lh-br tl"></i><i class="lh-br tr"></i><i class="lh-br bl"></i><i class="lh-br brr"></i>
      <div class="lh-kicker"><i></i><span>Introducing</span><i></i></div>
      <h1 class="lh-title"><span class="lh-w">Product</span> <span class="lh-w g">Launch</span></h1>
      <div class="lh-name"><span>${t || 'New Product 2027'}</span></div>
      <div class="lh-div"><i></i><b></b><i></i></div>
      <p class="lh-sub">Concerto Audio Indonesia</p>
      <div class="lh-topics">${LAUNCH_TOPICS.map(([b, l]) => `<div><b>${b}</b><span>${l}</span></div>`).join('')}</div>${count}</div>`,
    newbrand: renderNewBrand(s),
    cailaunch: renderCaiLaunch(s),
    lunch: `<div class="qs-scene sc-lunch">${SC_PLATE}<div class="qs-kicker">Istirahat</div><h1 class="sc-title">Makan <em>Siang</em></h1>
      <p class="sc-sub">${t || 'ISHOMA · istirahat, sholat &amp; makan siang · 1 jam'}</p>${count}${next}</div>`,
    dinner: `<div class="qs-scene sc-lunch">${SC_PLATE}<div class="qs-kicker">Gathering Dinner</div><h1 class="sc-title">Makan <em>Malam</em></h1>
      <p class="sc-sub">${t || 'Selamat menikmati hidangan makan malam'}</p>${count}${next}</div>`,
    healthy: `<div class="qs-scene sc-coffee">${SC_CUP}<div class="qs-kicker">Penutup Acara</div><h1 class="sc-title">Healthy <em>Drink</em></h1>
      <p class="sc-sub">${t || 'Terima kasih atas kehadiran &amp; kebersamaan Anda'}</p>${count}</div>`,
    testimoni: tmScene({ who: t }),
    opening: ogTitleHtml(t),
    funmkt: `<div class="sc-bubbles">${'<i></i>'.repeat(14)}</div><div class="qs-scene sc-fun">${SC_MEGA}<div class="qs-kicker">Presentasi</div>
      <h1 class="sc-title">Fun <em>Marketing</em></h1><p class="sc-sub">${t || 'Ide pemasaran yang seru, kreatif &amp; mudah dipraktikkan di toko Anda'}</p>${count}</div>`,
    anthem: `<div class="qs-scene ir"><div class="ir-bg"><i></i><i></i></div>
      <div class="ir-flag" aria-hidden="true"><b></b><b></b></div>
      <div class="ir-kick"><i></i><span>Lagu Kebangsaan</span><i></i></div>
      <h1 class="ir-title">Indonesia <em>Raya</em></h1>
      <p class="ir-sub">${t || 'W.R. Supratman · 1928'}</p>
      <div class="ir-stand">Hadirin dimohon berdiri</div></div>`,
    kickoff: `<div class="qs-scene sc-kickoff og ko">${ogBg(['#e9c46a', '#2f5bd3', '#b8893a', '#1f8fae', '#e9c46a'], 'Kick Off 2027')}
      <span class="ko-wm" aria-hidden="true">2027</span>
      <svg class="ko-hex" viewBox="0 0 200 200" aria-hidden="true"><polygon points="${AX_HEX200}"/><polygon class="h2" points="${AX_HEX200}"/></svg>
      <div class="ko-panel og-glass" style="--sd:2.4s">
        <div class="og-kick"><i></i><span>Gathering CAI 2026</span><i></i></div>
        <div class="ko-k">Kick Off</div>
        <h1 class="ko-year"><span>2027</span></h1>
        <p class="ko-sub">${t || 'Melangkah bersama · Tumbuh bersama'}</p>
        <div class="ko-line"><i></i><b></b><i></i></div>
        <div class="ko-agenda">${[['01', 'Absen Dosa', 'Dealer CAI 😄'], ['02', 'Ada Kejutan', 'untuk dealer 🤫'], ['03', 'PKS Dealer 2027', 'Perjanjian Kerja Sama']].map(([n, a, b], i) =>
          `<div class="ko-chip og-glass" style="--d:${(1.3 + i * 0.15).toFixed(2)}s;--sd:${(3 + i * 0.4).toFixed(1)}s"><em>${n}</em><div><b>${a}</b><small>${b}</small></div></div>`).join('')}</div>
      </div>${count}</div>`,
  }[sceneBase(s.scene)];
  const kv = s.scene === 'kickoff:v' || s.scene === 'anthem:v';   // video perkenalan portal: diputar di atas kartu Kick Off, selesai → kartu Kick Off tetap tampil
  const changed = qsSetStage(['scene', s.scene, s.scene_text, s.scene_until, kv || ['newbrand', 'cailaunch'].includes(sceneBase(s.scene)) ? s.updated_at : ''].join('|'), html);
  if (kv && changed) setTimeout(s.scene === 'anthem:v' ? playAnthemVideo : playPortalVideo, 500);
  if (changed && sceneBase(s.scene) === 'cailaunch') {
    nbBurst();
    if (s.scene === 'cailaunch:v') nbVidTimer = setTimeout(playCaiVideo, 500);
    if (s.scene === 'cailaunch:full') nbVidTimer = setTimeout(playCaiVideo, 3900);   // video langsung setelah 3-2-1 (videonya sendiri = reveal logo)
  }
  if (changed && sceneBase(s.scene) === 'newbrand') {
    nbBurst();
    if (s.scene === 'newbrand:v') nbVidTimer = setTimeout(playNewBrandVideo, 500);
    if (s.scene === 'newbrand:full') nbVidTimer = setTimeout(playNewBrandVideo, 3900 + NB_REVEAL_SEC * 1000);
  }
  qsTick();
}




// Kartu pembicara sinematik: aksen warna brand, nama raksasa dengan animasi muncul, lencana brand berputar, equalizer audio, progres.
// ── Awarding: motion graphic gaya "award show TV" (megah, modern futuristik) ──
// Tiap scene = timeline CSS (animation-delay = detik sejak scene mulai). Scene dirender dengan class .wait (semua animasi ditahan),
// SFX dijadwalkan di jam audio (ctx.currentTime + AW_SFX_LEAD), lalu .wait dilepas tepat saat suara pertama terdengar (+ latensi output).
// Urutan: judul → pembuka kategori → Top n … Top 2 (hitung mundur 3 dtk) → Juara (hitung mundur 5 dtk) → papan peringkat.
const AX_HEX = '50,1 99,29 99,86.5 50,114.5 1,86.5 1,29', AX_HEX2 = '50,9 92,33 92,82.5 50,106.5 8,82.5 8,33';
const AX_HEX200 = '100,30 160.6,65 160.6,135 100,170 39.4,135 39.4,65';
const axRnd = seed => () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
// teks dipecah per huruf (tiap huruf punya delay sendiri); kata tidak terpotong di tengah
const axL = (text, d0, step) => { let i = 0; return String(text).split(/\s+/).filter(Boolean).map(w => `<span class="ax-w">${[...w].map(ch => `<span class="ax-l" style="--d:${(d0 + step * i++).toFixed(3)}s">${escHtml(ch)}</span>`).join('')}</span>`).join(' '); };
const axSize = s => s.length > 18 ? ' sm' : s.length > 12 ? ' md' : '';
const pad2 = n => String(n).padStart(2, '0');
const axPrize = (d, t) => d.prize ? `<div class="ax-prize" style="--d:${t}s"><span>Hadiah</span><b>${escHtml(d.prize)}</b></div>` : '';
function axBg(hud = true) {
  const r = axRnd(11), dust = Array.from({ length: 34 }, () => `<i style="--x:${(r() * 100).toFixed(1)}%;--y:${(30 + r() * 65).toFixed(1)}%;--z:${(0.25 + r() * 0.5).toFixed(2)}vh;--s:${(5 + r() * 6).toFixed(1)}s;--d:-${(r() * 8).toFixed(1)}s;--o:${(0.35 + r() * 0.5).toFixed(2)}"></i>`).join('');
  return `<div class="ax-bg"><div class="ax-hz"></div><div class="ax-beams"><i></i><i></i><i></i><i></i></div><div class="ax-floor"><i></i></div><div class="ax-dust">${dust}</div>
    ${hud ? `<svg class="ax-hud" viewBox="0 0 200 200" aria-hidden="true"><circle class="h1" cx="100" cy="100" r="96" pathLength="100"/><circle class="h2" cx="100" cy="100" r="88" pathLength="100"/><circle class="h3" cx="100" cy="100" r="80"/><polygon class="h4" points="${AX_HEX200}" pathLength="100"/></svg>` : ''}</div>
    <div class="ax-bug"><img src="${LOGO_WHITE}" alt="CAI"><span>Gathering CAI 2026<b>Awarding Night</b></span></div>
    <div class="ax-live"><i></i>Live</div><div class="ax-corner"><i></i><i></i><i></i><i></i></div><div class="ax-foot">Concerto Audio Indonesia · 5th Annual Gathering</div>`;
}
function renderAwardTitle(s) {
  const t = s.scene_text ? escHtml(s.scene_text) : '';
  const cats = [['01', 'Best Distributor', `Top ${AWARD_DIST.length}`], ['02', 'Best Dealer', `Top ${AWARD_DEALERS.length}`], ['03', 'Defending Champion', 'Dealer of the Year']];
  const html = `<div class="qs-scene ax ax-title wait">${axBg()}
    <div class="ax-flare" style="--d:.8s"></div><div class="ax-flash" style="--d:2s;--o:.55"></div><i class="ax-wave" style="--d:2s;--sc:7"></i>
    <div class="ax-center">
      <div class="ax-kick" style="--d:1.2s"><i></i><span>${axL('5th Annual Gathering · Concerto Audio Indonesia', 1.25, 0.022)}</span><i></i></div>
      <h1 class="ax-word ax-gold ax-slam">${axL('AWARDING', 2, 0.06)}</h1>
      <div class="ax-night"><span>Night</span><b>2026</b></div>
      <div class="ax-rule" style="--d:2.9s"></div>
      <p class="ax-sub" style="--d:3.1s">${t || 'Malam penghargaan bagi distributor &amp; dealer dengan performa terbaik sepanjang 2026'}</p>
      <div class="ax-cats">${cats.map(([n, b, sp], i) => `<div class="ax-sheen" style="--d:${(3.4 + i * 0.15).toFixed(2)}s"><em>${n}</em><b>${b}</b><span>${sp}</span></div>`).join('')}</div>
    </div></div>`;
  axPlay(['ax', 'title', s.scene_text || '', s.updated_at || ''].join('|'), html, axSfxTitle);
}
function renderAwarding(key, stamp) {
  const { cat, r: a } = awPart(key), C = AW_CATS[cat], n = C.list.length;
  const ranks = [...C.list].sort((x, y) => x.rank - y.rank), champ = ranks[0], sk = ['ax', key, stamp || ''].join('|');
  const [w1, ...wr] = C.short.split(' ');
  if (a === 'intro') {   // pembuka kategori: nomor raksasa, "BEST / DISTRIBUTOR", slot peringkat menunggu diumumkan
    const html = `<div class="qs-scene ax ax-intro cont wait">${axBg()}<div class="ax-flare" style="--d:0s;--fy:46%"></div><i class="ax-wave" style="--d:.95s;--sc:6"></i>
      <div class="ax-bignum" style="--d:.1s">${C.no}</div>
      <div class="ax-center">
        <div class="ax-kick" style="--d:.5s"><i></i><span>${axL('Kategori ' + C.no, 0.5, 0.03)}</span><i></i></div>
        <h1 class="ax-cat"><span class="ax-catw">${axL(w1, 0.7, 0.06)}</span><span class="ax-gold ax-slam">${axL(wr.join(' '), 0.95, 0.05)}</span></h1>
        <div class="ax-rule" style="--d:1.6s"></div>
        <p class="ax-sub" style="--d:1.75s">${C.intro}</p>
        <div class="ax-slots">${[...ranks].reverse().map((d, i) => `<div class="ax-slot${d.rank === 1 ? ' one' : ''}" style="--d:${(2 + i * 0.1).toFixed(2)}s"><svg viewBox="0 0 100 115.47" aria-hidden="true"><polygon points="${AX_HEX}"/></svg><b>${C.hideRank && d.rank !== 1 ? '★' : pad2(d.rank)}</b></div>`).join('')}</div>
      </div></div>`;
    return axPlay(sk, html, (ctx, t) => axSfxIntro(ctx, t, n));
  }
  if (a === 'list') {   // papan peringkat: juara di baris lebar, peringkat lain masuk berurutan
    const html = `<div class="qs-scene ax ax-board cont wait">${axBg(false)}
      <div class="ax-bwrap">
        <div class="ax-kick" style="--d:.2s"><i></i><span>${axL('Final Ranking', 0.2, 0.03)}</span><i></i></div>
        <h1 class="ax-btitle"><span>${escHtml(w1)}</span><span class="ax-gold ax-slam">${axL(wr.join(' ') + ' 2026', 0.45, 0.04)}</span></h1>
        <div class="ax-bchamp ax-sheen" style="--d:.9s"><em class="ax-goldt">01</em>${champ.logo ? `<img src="${champ.logo}" alt="${escHtml(champ.name)}">` : `<b class="bn ax-goldt">${escHtml(champ.name)}</b>`}
          <div><b>${escHtml(champ.title || 'Champion ' + C.short)}${champ.person ? ' · ' + escHtml(champ.person) : ''}</b><span>${escHtml(champ.note || C.sub)}</span>${champ.prize ? `<span class="pz">Hadiah · ${escHtml(champ.prize)}</span>` : ''}</div></div>
        <ol class="ax-blist${ranks.length - 1 < 6 ? ' few' : ''}${C.hideRank ? ' uni' : ''}">${ranks.slice(1).map((d, i) => `<li class="ax-sheen" style="--d:${(1.2 + i * 0.09).toFixed(2)}s"><em>${C.hideRank ? '★' : pad2(d.rank)}</em><b>${escHtml(d.name)}${d.person || d.note ? `<small>${escHtml(d.person || d.note)}</small>` : C.hideRank ? '<small>&nbsp;</small>' : ''}${d.prize ? `<small class="pz">Hadiah · ${escHtml(d.prize)}</small>` : ''}</b></li>`).join('')}</ol>
      </div></div>`;
    return axPlay(sk, html, (ctx, t) => axSfxBoard(ctx, t, ranks.length - 1));
  }
  const d = C.list.find(x => x.rank === a); if (!d) return;
  const one = a === 1, cd = one ? AW_CD_CHAMP : AW_CD_TOP;
  const card = one ? axChampHtml(C, d) : axTopHtml(C, d, n);
  const cdHtml = `<div class="qs-scene ax ax-cd cont wait${one ? ' champ' : ''}" style="--cd:${cd}s;--n:${cd}">${axBg()}
    ${Array.from({ length: cd }, (_, i) => `<i class="ax-wave" style="--d:${(i + 0.06).toFixed(2)}s;--sc:${one ? 5 : 4}"></i>`).join('')}
    <div class="ax-center">
      <div class="ax-chip" style="--d:0s"><b>${one ? 'Champion' : C.hideRank ? 'Penerima Penghargaan' : 'Top ' + a}</b><span>${C.label}</span></div>
      <div class="ax-cdlead">${one ? 'Dan juaranya adalah…' : C.hideRank ? 'Selanjutnya…' : 'Peringkat ' + a}</div>
      <div class="ax-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="r0" cx="100" cy="100" r="92"/><circle class="r1" cx="100" cy="100" r="92" pathLength="100"/><circle class="r2" cx="100" cy="100" r="80" pathLength="100"/><polygon class="r3" points="${AX_HEX200}"/></svg>
        ${Array.from({ length: cd }, (_, i) => `<b style="--d:${i}s">${cd - i}</b>`).join('')}</div>
    </div></div>`;
  if (!qsSetStage(sk, cdHtml)) return;
  clearTimeout(awCdTimer);
  awStartCd(sk, one, cd, card, !!d.prize);
}
// Kartu Top n: kilatan + gelombang kejut → angka raksasa → chip kategori (0,3) → nama emas huruf per huruf (0,7) → nama pemilik, garis, progres
function axTopHtml(C, d, n) {
  const prog = [...C.list].sort((x, y) => y.rank - x.rank).map(x => `<i class="${x.rank === d.rank ? 'on' : x.rank > d.rank ? 'done' : ''}"></i>`).join('');
  return `<div class="qs-scene ax ax-top cont">${axBg()}
    <div class="ax-flash" style="--d:0s;--dur:.8s"></div><i class="ax-wave" style="--d:0s;--sc:7"></i><i class="ax-wave" style="--d:.12s;--sc:5"></i>
    ${C.hideRank ? '' : `<div class="ax-bignum" style="--d:.05s">${pad2(d.rank)}</div>`}<div class="ax-flare" style="--d:.45s;--fy:56%"></div>
    <div class="ax-center">
      <div class="ax-chip" style="--d:.3s"><b>${C.hideRank ? 'Penerima Penghargaan' : 'Top ' + d.rank}</b><span>${C.label}</span></div>
      <div class="ax-pre" style="--d:.5s">Selamat kepada</div>
      <h1 class="ax-name ax-gold${axSize(d.name)}">${axL(d.name, 0.7, 0.035)}</h1>
      ${d.person ? `<div class="ax-person" style="--d:1.15s">${escHtml(d.person)}</div>` : ''}
      ${d.note ? `<div class="ax-note" style="--d:1.2s">${escHtml(d.note)}</div>` : ''}
      ${axPrize(d, 1.2)}
      <div class="ax-rule" style="--d:1s"></div>
      <p class="ax-sub" style="--d:1.25s">${C.sub}</p>
      <div class="ax-prog" style="--d:1.4s">${prog}</div>
    </div></div>`;
}
// Kartu Juara — mengikuti SFX awSfx: kilatan + sinar (0) → lambang heksagon tergambar → medali No.1 (0,5) → chip (0,8) → tiga bintang (1,0/1,15/1,3)
// → nama/logo juara meledak masuk + percikan & konfeti (1,4) → pemilik, catatan, kalimat penghargaan
function axChampHtml(C, d) {
  const r = axRnd(29);
  const sparks = Array.from({ length: 56 }, (_, i) => `<i style="--a:${(i * 360 / 56 + r() * 5).toFixed(1)}deg;--r:${(30 + r() * 45).toFixed(0)}vh;--w:${(4 + r() * 6).toFixed(1)}vh;--s:${(0.9 + r() * 0.8).toFixed(2)}s;--d:${(1.4 + r() * 0.12).toFixed(2)}s"></i>`).join('');
  const conf = Array.from({ length: 48 }, () => `<i style="--x:${(r() * 100).toFixed(1)}%;--dx:${(r() * 16 - 8).toFixed(1)}vw;--r:${Math.round(r() * 720 - 360)}deg;--s:${(3.6 + r() * 3).toFixed(2)}s;--d:${(1.4 + r() * 3).toFixed(2)}s"></i>`).join('');
  return `<div class="qs-scene ax ax-champ cont">${axBg(false)}
    <div class="ax-flash" style="--d:0s;--dur:1.2s;--o:1"></div><i class="ax-wave" style="--d:0s;--sc:8"></i><i class="ax-wave" style="--d:.5s;--sc:3"></i><i class="ax-wave" style="--d:1.4s;--sc:9"></i>
    <div class="ax-rays"></div>
    <svg class="ax-crest" viewBox="0 0 100 115.47" aria-hidden="true"><polygon class="c1" points="${AX_HEX}" pathLength="100"/><polygon class="c2" points="${AX_HEX2}" pathLength="100"/><circle class="c3" cx="50" cy="57.7" r="40" pathLength="100"/></svg>
    <div class="ax-sparks">${sparks}</div><div class="ax-conf">${conf}</div><div class="ax-flare" style="--d:1.4s;--fy:58%"></div>
    <div class="ax-center">
      <div class="ax-medal"><svg viewBox="0 0 100 115.47" aria-hidden="true"><defs><linearGradient id="axmg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3d0"/><stop offset=".45" stop-color="#e9c46a"/><stop offset="1" stop-color="#a77b28"/></linearGradient></defs><polygon points="${AX_HEX}" fill="url(#axmg)"/><polygon points="${AX_HEX2}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.2"/></svg><span><small>No.</small>1</span></div>
      <div class="ax-chip" style="--d:.8s"><b>${escHtml(d.title || 'Champion')}</b><span>${C.label}</span></div>
      <div class="ax-stars"><i style="--d:1s">★</i><i style="--d:1.15s">★</i><i style="--d:1.3s">★</i></div>
      <div class="ax-pre" style="--d:1.3s">Presented to</div>
      ${d.logo ? `<img class="ax-clogo" src="${d.logo}" alt="${escHtml(d.name)}">` : `<h1 class="ax-name ax-gold ax-slam${axSize(d.name)}">${axL(d.name, 1.4, 0.045)}</h1>`}
      ${d.person ? `<div class="ax-person" style="--d:1.9s">${escHtml(d.person)}</div>` : ''}
      ${d.note ? `<div class="ax-note" style="--d:2.1s">${escHtml(d.note)}</div>` : ''}
      ${axPrize(d, 2.3)}
      <p class="ax-sub" style="--d:2.5s">In recognition of outstanding performance, dedication &amp; remarkable achievement throughout 2026</p>
    </div></div>`;
}
// Audio: AudioContext yang sudah berjalan (pakai milik musik latar bila ada), atau null bila browser belum mengizinkan suara
async function axCtx() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    const ctx = bgm.ctx || (awSfx.ctx = awSfx.ctx || new AC());
    if (ctx.state !== 'running') await Promise.race([ctx.resume().catch(() => {}), new Promise(r => setTimeout(r, 400))]);
    return ctx.state === 'running' ? ctx : null;
  } catch (e) { return null; }
}
const AW_SFX_LEAD = 0.15;
const axLat = ctx => (AW_SFX_LEAD + (ctx.outputLatency || ctx.baseLatency || 0)) * 1000;
async function axPlay(sk, html, sfx) {
  if (!qsSetStage(sk, html)) return;
  const ctx = await axCtx(); if (qsKey !== sk) return;
  let wait = 0;
  if (ctx) { try { sfx(ctx, ctx.currentTime + AW_SFX_LEAD); } catch (e) {} wait = axLat(ctx); }
  setTimeout(() => { if (qsKey === sk) document.querySelector('#qs-stage .ax')?.classList.remove('wait'); }, wait);
}
async function awStartCd(sk, champ, cd, html, prize) {
  const ctx = await axCtx(); if (qsKey !== sk) return;
  let wait = 0;
  if (ctx) { awSfx(ctx, champ, cd, ctx.currentTime + AW_SFX_LEAD, prize); wait = axLat(ctx); }
  setTimeout(() => {
    if (qsKey !== sk) return;
    document.querySelector('#qs-stage .ax')?.classList.remove('wait');
    awCdTimer = setTimeout(() => { if (qsKey === sk) document.getElementById('qs-stage').innerHTML = html; }, cd * 1000);
  }, wait);
}
// Perangkat SFX — semua disintesis Web Audio (tanpa file / sampel pihak lain), lewat kompresor; musik latar diturunkan sementara (bgm.duckUntil)
const AW_SFX_VOL = 0.9;
function axKit(ctx, duck) {
  if (duck) bgm.duckUntil = Math.max(bgm.duckUntil || 0, Date.now() + duck * 1000);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.25; comp.connect(ctx.destination);
  const out = ctx.createGain(); out.gain.value = AW_SFX_VOL * 0.62; out.connect(comp);
  const noiseBuf = len => { const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };
  const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
  const k = {
    boom: (t, f0, f1, peak, dec) => { const o = osc('sine', f0), g = ctx.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dec); env(g, t, 0.005, peak, dec); o.connect(g).connect(out); o.start(t); o.stop(t + dec + 0.1); },
    noise: (t, dur, type, freq, peak, dec, q = 1) => { const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = noiseBuf(dur); f.type = type; f.frequency.value = freq; f.Q.value = q; env(g, t, 0.003, peak, dec); src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur); },
    // nada "brass" hangat: dua sawtooth lewat lowpass yang membuka
    brass: (t, f, peak, dur) => { const o = osc('sawtooth', f), o2 = osc('sawtooth', f * 1.004), lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(2600, t + 0.35); lp.frequency.exponentialRampToValueAtTime(900, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.09); g.gain.setTargetAtTime(peak * 0.55, t + 0.3, 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); o2.connect(lp); lp.connect(g).connect(out); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); },
    bell: (t, f, peak, dec) => [[1, 1], [2.76, 0.4], [5.4, 0.18]].forEach(([m, a]) => { const o = osc('sine', f * m), g = ctx.createGain(); env(g, t, 0.004, peak * a, dec / m ** 0.3); o.connect(g).connect(out); o.start(t); o.stop(t + dec + 0.1); }),
    blip: (t, f, peak, dec = 0.12) => { const o = osc('sine', f), g = ctx.createGain(); env(g, t, 0.003, peak, dec); o.connect(g).connect(out); o.start(t); o.stop(t + dec + 0.05); },
    whoosh: (t, dur, peak) => { const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = noiseBuf(dur); f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(3200, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur); },
    riser: (t, dur, f0, f1, peak) => { const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = noiseBuf(dur + 0.2); f.type = 'bandpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur + 0.2); },
    // dengung sub-bass yang membengkak (pembuka)
    swell: (t, dur, f, peak) => { const lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 420;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.36); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      [f, f * 1.5, f * 2.003].forEach(x => { const o = osc('sawtooth', x); o.connect(lp); o.start(t); o.stop(t + dur + 0.05); }); lp.connect(g).connect(out); },
  };
  return k;
}
// Layar judul: dengung + riser → flare (0,8) → teks kecil (1,25) → hantaman besar saat AWARDING membanting (2,0) → NIGHT (2,75) → fanfare (2,9) → kategori (3,4)
function axSfxTitle(ctx, t) {
  const k = axKit(ctx, 6.5);
  k.swell(t, 5.5, 55, 0.12); k.riser(t + 0.3, 1.7, 200, 3200, 0.13);
  k.whoosh(t + 0.8, 0.9, 0.16);
  for (let i = 0; i < 8; i++) k.blip(t + 1.25 + i * 0.1, 1800 + i * 120, 0.03, 0.08);
  const hit = t + 2; k.boom(hit, 120, 30, 0.8, 2.2); k.boom(hit, 60, 28, 0.45, 2.6); k.noise(hit, 2.8, 'highpass', 3200, 0.38, 2.4);
  for (let i = 0; i < 8; i++) k.bell(hit + i * 0.06, 2600 + i * 90, 0.016, 0.35);
  k.whoosh(t + 2.75, 0.7, 0.12);
  [[130.81, 0.07], [196, 0.06], [261.63, 0.06], [329.63, 0.05], [392, 0.045]].forEach(([f, a]) => k.brass(t + 2.9, f, a, 3.4));
  [1046.5, 1318.5, 1568].forEach((f, i) => k.bell(t + 3.4 + i * 0.15, f, 0.05, 0.9));
}
// Pembuka kategori: flare (0) → angka raksasa (0,1) → "Kategori" (0,5) → hantaman nama kategori (0,95) → kilau (1,6) → slot peringkat naik nadanya (2,0 …)
function axSfxIntro(ctx, t, slots) {
  const k = axKit(ctx, 4.5);
  k.whoosh(t, 0.7, 0.14); k.boom(t + 0.1, 80, 34, 0.55, 1.2);
  for (let i = 0; i < 5; i++) k.blip(t + 0.5 + i * 0.07, 1600 + i * 150, 0.03, 0.07);
  k.boom(t + 0.95, 115, 32, 0.95, 1.8); k.noise(t + 0.95, 2, 'highpass', 3500, 0.3, 1.8);
  [523.25, 659.25, 783.99].forEach((f, i) => k.bell(t + 1.6 + i * 0.05, f, 0.05, 1.2));
  for (let i = 0; i < slots; i++) k.blip(t + 2 + i * 0.1, 523.25 * Math.pow(2, i / 6), 0.05, 0.14);
  k.bell(t + 2 + (slots - 1) * 0.1, 1318.5, 0.07, 1.4);
}
// Papan peringkat: whoosh (0,2) → hantaman judul (0,45) → baris juara (0,9) → baris lain berurutan (1,2 …) → akor penutup
function axSfxBoard(ctx, t, rows) {
  const k = axKit(ctx, 4);
  k.whoosh(t + 0.2, 0.6, 0.12);
  k.boom(t + 0.45, 110, 32, 0.8, 1.6); k.noise(t + 0.45, 1.8, 'highpass', 3800, 0.25, 1.6);
  k.whoosh(t + 0.9, 0.6, 0.14); [783.99, 987.77, 1174.66].forEach((f, i) => k.bell(t + 0.95 + i * 0.05, f, 0.06, 1.4));
  for (let i = 0; i < rows; i++) { k.whoosh(t + 1.2 + i * 0.09, 0.25, 0.05); k.blip(t + 1.25 + i * 0.09, 1200 + i * 60, 0.025, 0.06); }
  [261.63, 329.63, 392, 523.25].forEach(f => k.brass(t + 1.3 + rows * 0.09, f, 0.045, 2.6));
}
// Hitung mundur + reveal: detak bass tiap detik (nada naik) + klik, riser; Juara: drumroll snare makin rapat.
// Reveal Juara mengikuti kartu .ax-champ: kilatan (0) → medali (0,5) → tiga bintang (1,0/1,15/1,3) → nama + fanfare + kilau konfeti (1,4).
// Reveal Top: hantaman + whoosh (0) → kilau akor saat nama muncul (0,7).
function awSfx(ctx, champ, cd, start, prize) {
  try {
    const k = axKit(ctx, cd + 2.5), t0 = start;
    for (let i = 0; i < cd; i++) { const t = t0 + i + 0.06; k.boom(t, 95 + i * 12, 42, 0.9, 0.55); k.noise(t, 0.08, 'highpass', 3500, 0.25, 0.06); }
    k.riser(t0, cd, 250, 4200, champ ? 0.22 : 0.16);
    if (champ) { let t = t0, step = 0.11; while (t < t0 + cd - 0.05) { const p = (t - t0) / cd; k.noise(t, 0.09, 'bandpass', 1900, 0.08 + p * 0.32, 0.07, 0.8); t += step; step = Math.max(0.045, step * 0.985); } }
    const tr = t0 + cd;
    if (champ) {
      k.noise(tr, 0.25, 'highpass', 6000, 0.22, 0.18); k.whoosh(tr, 0.55, 0.2); k.boom(tr, 70, 40, 0.55, 0.7);
      k.bell(tr + 0.5, 880, 0.16, 1.8); k.bell(tr + 0.5, 1318.5, 0.08, 1.5);
      [1046.5, 1318.5, 1568].forEach((f, i) => k.bell(tr + 1.0 + i * 0.15, f, 0.09, 0.9));
      const th = tr + 1.4;
      k.boom(th, 110, 36, 1, 1.8); k.noise(th, 3, 'highpass', 4200, 0.42, 2.6);
      [[130.81, 0.16], [261.63, 0.13], [329.63, 0.11], [392, 0.11], [523.25, 0.09]].forEach(([f, a]) => k.brass(th, f, a, 3.2));
      for (let i = 0; i < 18; i++) k.bell(th + 0.3 + Math.random() * 2.2, 1800 + Math.random() * 2400, 0.025, 0.5);
      if (prize) [1318.5, 1760].forEach((f, i) => k.bell(tr + 2.3 + i * 0.06, f, 0.05, 1));   // plat hadiah
    } else {
      k.boom(tr, 110, 38, 0.85, 1.2); k.noise(tr, 1.6, 'highpass', 4500, 0.26, 1.2); k.whoosh(tr, 0.6, 0.12);
      [523.25, 659.25, 783.99].forEach((f, i) => k.bell(tr + 0.7 + i * 0.05, f, 0.06, 1.4));
      if (prize) [1046.5, 1318.5].forEach((f, i) => k.bell(tr + 1.2 + i * 0.06, f, 0.04, 0.9));   // plat hadiah
    }
  } catch (e) { /* audio gagal → tetap tampil tanpa suara */ }
}
const AW_CD_TOP = 3, AW_CD_CHAMP = 5;   // detik hitung mundur sebelum kartu Top / Juara
let awCdTimer = null;
function awStep(d) {
  const i = Math.max(0, AWARD_SEQ.indexOf(scrRow?.scene)), n = Math.min(AWARD_SEQ.length - 1, Math.max(0, i + d));
  if (n !== i || !AWARD_SEQ.includes(scrRow?.scene)) setScene(AWARD_SEQ[n]);
}
// Latar bersama Opening Speech: grid HUD, orb warna brand melayang, garis scan, logo pojok, siku bingkai
function ogBg(colors, label = 'Opening Speech') {
  const pos = [[18, 30, 60], [82, 26, 56], [50, 80, 70], [12, 78, 46], [88, 74, 50], [50, 18, 44]];
  return `<div class="og-bg"><div class="og-lines"></div>${colors.map((c, i) => { const [x, y, z] = pos[i % pos.length]; return `<i class="og-orb" style="--c:${c};--x:${x}%;--y:${y}%;--s:${z}vh;--d:-${i * 2.7}s"></i>`; }).join('')}<div class="og-scan"></div></div>
    <div class="og-bug"><img src="${LOGO_WHITE}" alt="CAI"><span>Gathering CAI 2026<b>${label}</b></span></div><div class="og-corner"><i></i><i></i><i></i><i></i></div>`;
}
const ogMark = sp => { const b = BRANDS.find(x => x.id === sp.id), src = sp.logo || b?.logo; return src ? `<img src="${src}" alt="${escHtml(sp.brand)}">` : `<b>${escHtml(sp.brand.split(/\s+/).map(w => w[0]).join('').slice(0, 3))}</b>`; };
function ogTitleHtml(t) {
  return `<div class="qs-scene og og-title">${ogBg(OPENING_SPEAKERS.map(s => s.ac))}
    <div class="og-head"><div class="og-kick"><i></i><span>Gathering CAI 2026</span><i></i></div>
      <h1 class="og-h1">Opening <em>Speech</em></h1><p class="og-sub">${t || 'Sambutan dari brand partner Concerto Audio Indonesia'}</p></div>
    <div class="og-grid${OPENING_SPEAKERS.length > 6 ? ' c4' : ''}">${OPENING_SPEAKERS.map((sp, i) => `<div class="og-card og-glass" style="--ac:${sp.ac};--d:${(0.7 + i * 0.12).toFixed(2)}s;--sd:${(2 + i * 0.35).toFixed(2)}s">
      <span class="og-no">${String(i + 1).padStart(2, '0')}</span><div class="og-logo">${ogMark(sp)}</div>
      <div class="og-txt"><b>${escHtml(sp.name)}</b><small>${escHtml(sp.brand)}</small></div></div>`).join('')}</div></div>`;
}
// Kartu pembicara: panel kaca kiri (urutan, "Sambutan oleh", nama besar, chip brand, progres) + emblem kaca kanan (logo + cincin HUD berputar)
function renderOpeningSpeaker(n, vid, stamp) {
  const sp = OPENING_SPEAKERS[n - 1];
  if (!sp) return;
  const m = /^(Mr\.?|Ms\.?|Mrs\.?|Bapak|Ibu)\s+(.+)$/i.exec(sp.name), title = m ? m[1] : '', words = (m ? m[2] : sp.name).split(/\s+/);
  const num = String(n).padStart(2, '0'), tot = String(OPENING_SPEAKERS.length).padStart(2, '0');
  const fs = words.length > 1 ? 'min(7.4vw, 13vh)' : 'min(10vw, 18vh)';
  const html = `<div class="qs-scene og og-sp" style="--ac:${sp.ac}">${ogBg([sp.ac, '#1d3a7a', sp.ac])}<div class="og-wm">${num}</div>
    <div class="og-panel og-glass" style="--sd:2.4s">
      <div class="og-meta"><b>Opening Speech</b><i></i><span>${num} / ${tot}</span></div>
      <div class="og-pre">Sambutan oleh</div>
      ${title ? `<div class="og-ttl">${escHtml(title)}</div>` : ''}
      <h1 class="og-name" style="--fs:${fs}">${words.map((w, i) => `<span style="--i:${i}">${escHtml(w)}</span>`).join('')}</h1>
      <div class="og-chip"><i></i>${escHtml(sp.brand)}</div>
      <div class="og-prog">${OPENING_SPEAKERS.map((x, i) => `<i class="${i + 1 === n ? 'on' : i + 1 < n ? 'done' : ''}"></i>`).join('')}</div>
    </div>
    <div class="og-emblem"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="e1" cx="50" cy="50" r="49" pathLength="100"/><circle class="e2" cx="50" cy="50" r="44"/><circle class="e3" cx="50" cy="50" r="38" pathLength="100"/></svg>
      <div class="og-core og-glass" style="--sd:3s">${ogMark(sp)}</div></div></div>`;
  const key = ['opening', n, vid, vid && stamp ? new Date(stamp).getTime() : ''].join('|');
  // speech selesai → recap sudah diputar langsung oleh layar ini (qsSpkChain): cukup catat kunci, jangan putar ulang
  if (vid && qsSpkChain === n + vid && document.getElementById('qs-video')) { qsSpkChain = null; qsKey = key; return; }
  const changed = qsSetStage(key, html);
  if (changed && vid) setTimeout(() => playSpeakerVideo(n, vid), 600);
}
// Video sambutan pembicara (Audiocircle & STEG): overlay layar penuh di atas kartu; selesai → kembali ke kartu
const qsLocalSpeaker = {};
let qsSpkChain = null;
// Video Opening Speech (speech Ricky + recap) diunduh ke memori sejak scene Opening tampil → recap langsung jalan
// begitu speech selesai, tanpa menunggu buffer dari internet venue. Pembicara yang sedang/akan tampil didahulukan.
let qsOpPrefetching = false;
async function qsPrefetchOpening(first = 0) {
  if (qsOpPrefetching) return; qsOpPrefetching = true;
  try {
    const sps = OPENING_SPEAKERS.map((sp, i) => ({ sp, i })), order = first ? [...sps.slice(first - 1), ...sps.slice(0, first - 1)] : sps;
    for (const { sp, i } of order) for (const src of i === first - 1 ? [sp.video, sp.intro] : [sp.intro, sp.video]) {   // pembicara saat ini: recap dulu (speech-nya sedang diputar)
      if (!src || qsVidCache[src]) continue;
      await qsFetchBlob(src);   // gagal → tetap streaming
    }
  } finally { qsOpPrefetching = false; }
}   // 'n'+'v' = recap ke-n sedang diputar langsung setelah speech (scene di tabel menyusul)
function playSpeakerVideo(n, kind = 'v', chain = false) {
  const sp = OPENING_SPEAKERS[n - 1]; if (!sp) return;
  const raw = kind === 'i' ? sp.intro : sp.video;
  const src = qsLocalSpeaker[n + kind] || raw;
  if (!src) return;
  let ov = chain && document.getElementById('qs-video');
  if (!ov) {
    document.getElementById('qs-video')?.remove();
    ov = document.createElement('div');
    ov.id = 'qs-video'; ov.className = 'qs-video';
    ov.innerHTML = '<video id="qs-video-el" playsinline preload="auto"></video><button class="qs-unmute" hidden>🔊 Nyalakan suara</button>';
    document.getElementById('qa-screen').appendChild(ov);
  }
  const v = ov.querySelector('video'), um = ov.querySelector('.qs-unmute');
  qsVidFade(v);
  const recap = qsLocalSpeaker[n + 'v'] || sp.video;
  v.onended = () => {
    if (kind === 'i' && recap) {   // Speech Ricky → Recap langsung, tanpa kembali ke kartu
      qsSpkChain = n + 'v';
      playSpeakerVideo(n, 'v', true);
      try { supabase.from(QA_SCREEN).upsert({ id: 1, scene: `opening:${n}:v`, scene_text: null, scene_until: null, updated_at: new Date().toISOString() }).then(() => {}, () => {}); } catch (e) {}
      return;
    }
    ov.classList.add('ending'); ov.style.transition = 'opacity .6s'; ov.style.opacity = '0'; setTimeout(() => ov.remove(), 650);
  };
  v.onerror = () => {
    ov.remove();
    document.querySelector('.og-sp')?.insertAdjacentHTML('beforeend', `<label class="op-pick">📁 Video belum tersedia — pilih file di komputer ini<input type="file" accept="video/*" hidden onchange="qsPickSpeakerVideo(${n}, this, '${kind}')"></label>`);
  };
  um.onclick = () => { v.muted = false; um.hidden = true; };
  qsPlayWhenReady(v, src, () => v.play().catch(() => { v.muted = true; um.hidden = false; v.play().catch(() => {}); }));
}
// Video perkenalan portal (Kick Off 2027): overlay layar penuh; file gagal → pilih file lokal
let qsLocalPortal = null;
// Kick Off · Absen Dosa Dealer CAI: daftar dibuka 1 per 1 (clicker), lalu layar jawaban = fitur portal yang menjawab tiap dosa
function renderAbsen(s) {
  const a = absenPart(s.scene), N = ABSEN_DOSA.length;
  // pindah poin (bukan "semua sekaligus"): perbarui daftar yang sudah tampil — hanya poin baru yang beranimasi, halaman tidak dirender ulang
  const list = !a.jawab && !a.all && document.querySelector('#qs-stage .ab:not(.ab-j) .ab-list');
  if (list && String(qsKey).startsWith('absen|kickoff:absen:')) {
    const key = ['absen', s.scene, ''].join('|');
    if (key === qsKey) return;
    const pm = /^absen\|kickoff:absen:(\d+|all)/.exec(qsKey)?.[1], prev = pm === 'all' ? N : +pm || 0;
    qsKey = key;
    [...list.children].forEach((li, i) => {
      const isNew = a.k > prev && i === a.k - 1;
      li.className = 'ab-it' + (i < a.k ? ' on' : '') + (isNew ? ' in new' : '');
      li.style.setProperty('--d', '0s');
      if (isNew) { li.style.animation = 'none'; void li.offsetWidth; li.style.animation = ''; }
    });
    const c = document.querySelector('#qs-stage .ab-count'); if (c) c.textContent = `${a.k} / ${N}`;
    return;
  }
  let html;
  if (a.jawab) {
    const tiles = [...new Set(ABSEN_DOSA.map(x => x.f))].map((f, j) => {
      const F = ABSEN_FEAT[f], nos = ABSEN_DOSA.map((x, i) => x.f === f ? i + 1 : 0).filter(Boolean);
      return `<div class="ab-tile" style="--d:${(0.8 + j * 0.12).toFixed(2)}s"><span class="ab-ti">${F.i}</span><div><b>${F.n}</b><small>${F.d}</small>
        <div class="ab-nos">${nos.map(n => `<em>${pad2(n)}</em>`).join('')}</div></div><i class="ab-ok">✓</i></div>`; }).join('');
    html = `<div class="qs-scene ab ab-j"><div class="ab-kick">Kabar baiknya…</div><h1 class="ab-title">Semua <em>jawabannya</em> ada di Portal</h1>
      <div class="ab-grid">${tiles}</div>
      <div class="ab-url"><img src="assets/qr-portal.svg" alt="QR hub.concerto.id"><div><small>CAI Hub</small><b>hub.concerto.id</b></div></div></div>`;
  } else {
    const items = ABSEN_DOSA.map((x, i) => {
      const cls = i >= a.k ? '' : a.all ? 'on in' : i === a.k - 1 ? 'on in new' : 'on';
      return `<li class="ab-it ${cls}" style="--d:${a.all ? (0.2 + i * 0.1).toFixed(2) : 0}s"><em>${pad2(i + 1)}</em><span>${escHtml(x.t)}</span><i class="ab-chk"></i></li>`; }).join('');
    html = `<div class="qs-scene ab"><div class="ab-head"><div class="ab-kick">Kick Off 2027</div>
      <h1 class="ab-title">📋 Absen Dosa <em>Dealer CAI</em> 😄</h1>
      <p class="ab-intro">Halo rekan-rekan dealer 🙏 Silakan hitung dalam hati, berapa yang pernah kejadian:</p></div>
      <ol class="ab-list">${items}</ol><div class="ab-count">${a.k} / ${N}</div></div>`;
  }
  qsSetStage(['absen', s.scene, a.all || a.jawab ? s.updated_at : ''].join('|'), html);
}
// Penyerahan Sertifikat Dealer: layar judul, kartu per dealer (nama besar emas), dan daftar semua (gambar backdrop sertifikat)
function ceBg() {
  const r = axRnd(5), bk = Array.from({ length: 22 }, () => { const x = r() * 100, y = r() * 100; return (x > 12 && x < 88 && y > 8 && y < 92) ? '' : `<i style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--z:${(1 + r() * 4).toFixed(1)}vh;--o:${(.15 + r() * .4).toFixed(2)};--d:-${(r() * 10).toFixed(1)}s"></i>`; }).join('');
  return `<div class="ce-bg"><div class="ce-glow"></div><div class="ce-bk">${bk}</div></div><div class="ce-frame"></div><div class="ce-frame2"></div>
    <i class="ce-cn tl"></i><i class="ce-cn tr"></i><i class="ce-cn bl"></i><i class="ce-cn br"></i><i class="ce-dm t"></i><i class="ce-dm b"></i>
    ${['tl', 'tr', 'bl', 'br'].map(c => `<div class="ce-orn ${c}">${CE_CORNER}</div>`).join('')}
    <img class="ce-logo" src="${LOGO_WHITE}" alt="CAI"><div class="ce-tag">5th Annual Gathering<b>2026</b></div>`;
}
// Ornamen emas sesi Sertifikat: filigri art-deco di 4 sudut + cabang laurel (kiri/kanan nama dealer)
const CE_CORNER = `<svg viewBox="0 0 160 160" aria-hidden="true"><g fill="none" stroke="#d9b56e" stroke-linecap="round">
  <path d="M6 150 V40 Q6 6 40 6 H150" stroke-width="2"/><path d="M18 150 V52 Q18 18 52 18 H150" stroke-width="1" opacity=".55"/>
  <path d="M30 120 Q30 30 120 30" stroke-width="1.2" opacity=".7"/>
  <path d="M40 40 q14 -2 20 10 q4 10 -6 14 q-9 2 -10 -7 q0 -6 6 -6" stroke-width="1.6"/>
  <path d="M40 40 q-2 14 10 20 q10 4 14 -6 q2 -9 -7 -10 q-6 0 -6 6" stroke-width="1.6"/>
  <path d="M64 30 h40 M30 64 v40" stroke-width="1" opacity=".6"/></g>
  <g fill="#e9c46a"><rect x="36" y="36" width="8" height="8" transform="rotate(45 40 40)"/><circle cx="108" cy="30" r="2.6"/><circle cx="30" cy="108" r="2.6"/><circle cx="150" cy="6" r="2"/><circle cx="6" cy="150" r="2"/></g></svg>`;
function ceLaurel() {   // cabang laurel: daun elips di sepanjang busur
  let leaves = '';
  for (let i = 0; i < 11; i++) {
    const t = i / 10, a = -70 + t * 140, rad = a * Math.PI / 180, x = 60 + 50 * Math.cos(rad) * -1 + 50, y = 100 + 88 * Math.sin(rad);
    const rot = a + 90, sz = 1 - Math.abs(t - .5) * .5;
    leaves += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(13 * sz).toFixed(1)}" ry="${(5 * sz).toFixed(1)}" transform="rotate(${(rot - 35).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    leaves += `<ellipse cx="${(x + 9).toFixed(1)}" cy="${y.toFixed(1)}" rx="${(12 * sz).toFixed(1)}" ry="${(4.6 * sz).toFixed(1)}" transform="rotate(${(rot + 35).toFixed(1)} ${(x + 9).toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  return `<svg viewBox="0 0 120 200" aria-hidden="true"><path d="M70 14 Q14 100 70 188" fill="none" stroke="#d9b56e" stroke-width="2"/><g fill="url(#ceLf)">${leaves}</g>
    <defs><linearGradient id="ceLf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e3b0"/><stop offset=".5" stop-color="#d9b56e"/><stop offset="1" stop-color="#9c7330"/></linearGradient></defs></svg>`;
}
// Segel sertifikat emas (SVG): tepi bergerigi, teks melingkar, heksagon CAI + 2026 di tengah, dua pita di bawah
function ceSeal() {
  const pts = Array.from({ length: 48 }, (_, i) => { const a = i / 48 * Math.PI * 2, r = i % 2 ? 92 : 100; return (100 + r * Math.sin(a)).toFixed(1) + ',' + (100 - r * Math.cos(a)).toFixed(1); }).join(' ');
  const hex = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return (100 + 40 * Math.sin(a)).toFixed(1) + ',' + (100 - 40 * Math.cos(a)).toFixed(1); }).join(' ');
  return `<div class="ce-seal"><svg viewBox="0 0 200 250" aria-hidden="true"><defs>
      <linearGradient id="ceG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3d6"/><stop offset=".35" stop-color="#e9c46a"/><stop offset=".7" stop-color="#b8893a"/><stop offset="1" stop-color="#f1d38c"/></linearGradient>
      <linearGradient id="ceR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f3a7a"/><stop offset="1" stop-color="#0b1838"/></linearGradient>
      <path id="ceArc" d="M100,100 m-68,0 a68,68 0 1,1 136,0 a68,68 0 1,1 -136,0"/></defs>
    <path class="ce-rib" d="M62,150 L42,244 L64,230 L80,250 L94,170 Z" fill="url(#ceR)" stroke="url(#ceG)" stroke-width="2"/>
    <path class="ce-rib" d="M138,150 L158,244 L136,230 L120,250 L106,170 Z" fill="url(#ceR)" stroke="url(#ceG)" stroke-width="2"/>
    <g class="ce-rot"><polygon points="${pts}" fill="url(#ceG)"/></g>
    <circle cx="100" cy="100" r="84" fill="#0d1838" stroke="url(#ceG)" stroke-width="2.5"/>
    <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(233,196,106,.45)" stroke-width="1"/>
    <circle cx="100" cy="100" r="54" fill="none" stroke="rgba(233,196,106,.45)" stroke-width="1"/>
    <text class="ce-arc"><textPath href="#ceArc" startOffset="0" textLength="418" lengthAdjust="spacing">CERTIFIED DEALER • CONCERTO AUDIO INDONESIA •</textPath></text>
    <polygon points="${hex}" fill="none" stroke="url(#ceG)" stroke-width="3"/>
    <text x="100" y="103" class="ce-yr">2026</text><text x="100" y="117" class="ce-yr2">OFFICIAL</text>
  </svg></div>`;
}
function renderCert(s) {
  const n = certNum(s.scene), N = CERT_DEALERS.length, t = s.scene_text ? escHtml(s.scene_text) : '';
  let html;
  if (s.scene === 'sertifikat:list') html = `<div class="qs-scene ce ce-list"><img src="assets/backdrop/sertifikat-dealer.webp?v=4" alt="Daftar dealer penerima sertifikat"></div>`;
  else if (n) {
    const c = CERT_DEALERS[n - 1], L = c.d.length, fs = L > 20 ? 'min(6.4vw, 11vh)' : L > 13 ? 'min(8vw, 14vh)' : 'min(10vw, 17vh)';
    html = `<div class="qs-scene ce ce-one">${ceBg()}
      <div class="ce-kick"><i></i><span>Penyerahan Sertifikat Dealer</span><i></i></div>
      <div class="ce-pre">Selamat kepada</div>
      <div class="ce-nm"><div class="ce-laurel l">${ceLaurel()}</div><h1 class="ce-name" style="font-size:${fs}"><span>${escHtml(c.d)}</span></h1><div class="ce-laurel r">${ceLaurel()}</div></div>
      <div class="ce-line"><i></i><b></b><i></i></div>
      <div class="ce-role">Dealer Resmi Concerto Audio Indonesia</div>
      <div class="ce-grp">Distributor · ${escHtml(c.g)}</div></div>`;
  } else html = `<div class="qs-scene ce ce-title">${ceBg()}
      <div class="ce-script">Penyerahan</div>
      <h1 class="ce-h1">SERTIFIKAT DEALER</h1>
      <div class="ce-flr"><i></i><b></b><em></em><b></b><i></i></div>
      <p class="ce-sub">${t || 'Selamat &amp; terima kasih kepada para dealer resmi Concerto Audio Indonesia'}</p>
      ${ceSeal()}
      <div class="ce-total">${N} Dealer Resmi</div></div>`;
  qsSetStage(['cert', s.scene, s.scene_text, s.updated_at].join('|'), html);
}
function playPortalVideo() { playOverlayVideo(qsLocalPortal || PORTAL_INTRO_VIDEO, '.sc-kickoff', 'qsPickPortalVideo'); }
// Video Indonesia Raya (pembuka acara pagi): overlay layar penuh di atas layar judul; file gagal → pilih file lokal
let qsLocalAnthem = null;
function playAnthemVideo() { playOverlayVideo(qsLocalAnthem || ANTHEM_VIDEO, '.ir', 'qsPickAnthemVideo'); }
function qsPickAnthemVideo(input) {
  const f = input.files?.[0]; if (!f) return;
  if (qsLocalAnthem) URL.revokeObjectURL(qsLocalAnthem);
  qsLocalAnthem = URL.createObjectURL(f);
  document.querySelector('.op-pick')?.remove();
  playAnthemVideo();
}
// Video launching logo CAI (logo lama → logo baru): overlay layar penuh; selesai → layar logo CAI tetap tampil
const CAI_LAUNCH_VIDEO = 'assets/newbrand/cai-launch.mp4';
let qsLocalCai = null;
function playCaiVideo() { playOverlayVideo(qsLocalCai || CAI_LAUNCH_VIDEO, '.nb', 'qsPickCaiVideo'); }
function qsPickCaiVideo(input) {
  const f = input.files?.[0]; if (!f) return;
  if (qsLocalCai) URL.revokeObjectURL(qsLocalCai);
  qsLocalCai = URL.createObjectURL(f);
  document.querySelector('.op-pick')?.remove();
  playCaiVideo();
}
// Video peluncuran brand baru (Caelum): diputar di atas layar reveal; selesai → reveal tetap tampil
let qsLocalNb = null;
function playNewBrandVideo() { playOverlayVideo(qsLocalNb || NEW_BRAND.video, '.nb', 'qsPickNbVideo'); }
function qsPickNbVideo(input) {
  const f = input.files?.[0]; if (!f) return;
  if (qsLocalNb) URL.revokeObjectURL(qsLocalNb);
  qsLocalNb = URL.createObjectURL(f);
  document.querySelector('.op-pick')?.remove();
  playNewBrandVideo();
}
// Fade in / fade out tiap video layar penuh di videotron: gambar muncul dari hitam & suara naik di awal,
// gambar meredup ke hitam & suara turun di QS_VFADE detik terakhir (berlaku juga per video dalam daftar putar).
const QS_VFADE = 0.8;
function qsVidFade(v) {
  if (v._fx) return; v._fx = true;
  v.style.opacity = '0'; v.style.transition = `opacity ${QS_VFADE}s ease`;
  let raf = 0, out = false;
  const ramp = to => { cancelAnimationFrame(raf); const from = v.volume, t0 = performance.now();
    const step = t => { const k = Math.min(1, Math.max(0, (t - t0) / (QS_VFADE * 1000))); v.volume = Math.min(1, Math.max(0, from + (to - from) * k)); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); };
  v.addEventListener('loadstart', () => { out = false; cancelAnimationFrame(raf); v.style.opacity = '0'; v.volume = 0; });
  v.addEventListener('playing', () => { if (!out) { v.style.opacity = '1'; ramp(1); } });
  v.addEventListener('timeupdate', () => { if (!out && v.duration && v.duration - v.currentTime <= QS_VFADE + 0.1) { out = true; v.style.opacity = '0'; ramp(0); } });
}
function playOverlayVideo(src, host, pickFn) {
  document.getElementById('qs-video')?.remove();
  const ov = document.createElement('div');
  ov.id = 'qs-video'; ov.className = 'qs-video';
  ov.innerHTML = '<video id="qs-video-el" playsinline preload="auto"></video><button class="qs-unmute" hidden>🔊 Nyalakan suara</button>';
  document.getElementById('qa-screen').appendChild(ov);
  const v = ov.querySelector('video'), um = ov.querySelector('.qs-unmute');
  qsVidFade(v);
  v.onended = () => { ov.classList.add('ending'); ov.style.transition = 'opacity .8s'; ov.style.opacity = '0'; setTimeout(() => ov.remove(), 850); };
  v.onerror = () => {
    ov.remove();
    document.querySelector(host)?.insertAdjacentHTML('beforeend', `<label class="op-pick">📁 Video belum termuat — pilih file di komputer ini<input type="file" accept="video/*" hidden onchange="${pickFn}(this)"></label>`);
  };
  um.onclick = () => { v.muted = false; um.hidden = true; };
  qsPlayWhenReady(v, src, () => v.play().catch(() => { v.muted = true; um.hidden = false; v.play().catch(() => {}); }));   // diputar setelah file lengkap ada di komputer
}
function qsPickPortalVideo(input) {
  const f = input.files?.[0]; if (!f) return;
  if (qsLocalPortal) URL.revokeObjectURL(qsLocalPortal);
  qsLocalPortal = URL.createObjectURL(f);
  document.querySelector('.op-pick')?.remove();
  playPortalVideo();
}
function qsPickSpeakerVideo(n, input, kind = 'v') {
  const f = input.files?.[0]; if (!f) return;
  if (qsLocalSpeaker[n + kind]) URL.revokeObjectURL(qsLocalSpeaker[n + kind]);
  qsLocalSpeaker[n + kind] = URL.createObjectURL(f);
  document.querySelector('.op-pick')?.remove();
  playSpeakerVideo(n, kind);
}


/* ── Halaman PKS di layar: dirender pdf.js ke canvas setinggi layar (A4 tegak di tengah) ── */
const qsPksPages = {};   // jumlah halaman per dokumen PKS (layar videotron)
/* ── Paket Audio di layar (sementara, untuk acara Gathering): PDF paket dirender pdf.js layar penuh ──
   scene 'paket' = daftar paket, 'paket:<i>' / 'paket:<i>:<p>' = paket ke-i (1..n), halaman p. */
const paketParse = k => {
  const m = /^paket(?::(\d+)(?::(\d+))?)?$/.exec(k || '') || [];
  const list = PAKET_AUDIO.filter(x => x.available), i = +m[1] || 0;
  return { idx: i, page: +m[2] || 1, pkg: i ? list[i - 1] : null, pages: paketPages[list[i - 1]?.file] || 0, list };
};
const paketPages = {}, paketDocs = {};
function getPaketDoc(file) {
  if (!paketDocs[file]) {
    paketDocs[file] = loadPdfJs().then(lib => lib.getDocument(file).promise).then(d => { paketPages[file] = d.numPages; return d; });
    paketDocs[file].catch(() => { delete paketDocs[file]; });
  }
  return paketDocs[file];
}
async function renderPaket(s) {
  const pk = paketParse(s.scene);
  if (!pk.pkg) {   // daftar paket
    qsSetStage('paketlist|' + s.scene, `<div class="qs-scene sc-open"><div class="qs-kicker">Concerto Audio Indonesia</div><h1 class="sc-title">Paket <em>Audio</em></h1>
      <div class="sc-op-list">${pk.list.map((p, i) => `<div class="sc-op-item"><span>${i + 1}</span><b>${escHtml(p.title)}</b></div>`).join('')}</div></div>`);
    return;
  }
  const key = 'pks|paket' + pk.idx + '-' + pk.page;
  if (!qsSetStage(key, '<div class="qs-idle"><p>Memuat paket…</p></div>')) return;
  let ov = document.getElementById('qs-slide');
  if (!ov) { ov = document.createElement('div'); ov.id = 'qs-slide'; ov.className = 'qs-slide qs-pks'; document.getElementById('qa-screen').appendChild(ov); }
  ov.classList.add('qs-pks');
  try {
    const doc = await getPaketDoc(pk.pkg.file);
    if (qsKey !== key) return;
    const page = await doc.getPage(Math.min(pk.page, doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(window.innerHeight * 0.96 / base.height, window.innerWidth * 0.96 / base.width) * (window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    if (qsKey !== key) return;
    ov.appendChild(cv); requestAnimationFrame(() => cv.classList.add('in'));
    setTimeout(() => [...ov.children].slice(0, -1).forEach(x => x.remove()), 600);
  } catch (e) {
    ov.remove(); qsKey = null;
    document.getElementById('qs-stage').innerHTML = `<div class="qs-idle"><p>Paket belum bisa dimuat (${escHtml(e.message || e)}).</p></div>`;
  }
}
// Pindah halaman / paket: daftar → paket 1 hal.1 → … → paket terakhir. local = dipanggil di komputer videotron (render langsung)
async function paketStep(d, local) {
  const { data: s } = await supabase.from(QA_SCREEN).select('scene').eq('id', 1).maybeSingle();
  const pk = paketParse(s?.scene);
  if (sceneBase(s?.scene) !== 'paket') { if (!local) showToast('Tayangkan salah satu paket dulu.'); return; }
  let idx = pk.idx, page = pk.page;
  if (idx) {
    const n = pk.pages || (await getPaketDoc(pk.pkg.file).then(x => x.numPages).catch(() => 0));
    if (d > 0) { if (n && page < n) page++; else if (idx < pk.list.length) { idx++; page = 1; } else return; }
    else { if (page > 1) page--; else if (idx > 1) { idx--; const f = pk.list[idx - 1].file; page = paketPages[f] || await getPaketDoc(f).then(x => x.numPages).catch(() => 1); } else { idx = 0; page = 1; } }
  } else if (d > 0 && pk.list.length) { idx = 1; page = 1; } else return;
  await paketSetScene(idx ? `paket:${idx}:${page}` : 'paket', local);
}
async function paketSetScene(scene, local) {
  const now = new Date().toISOString();
  if (local) renderScene({ scene, updated_at: now });
  const { error } = await supabase.from(QA_SCREEN).upsert({ id: 1, scene, scene_text: null, scene_until: null, updated_at: now });
  if (error) { showToast('Gagal mengubah layar: ' + error.message + ' (jalankan SQL kolom scene di Supabase)', 9000); return; }
  if (!local) paketMarkOnScreen(scene);
}
// Menu Paket Audio (Admin/Editor): tayangkan paket di layar videotron
async function paketOnScreen(id) {
  if (!supabase || !isAdmin()) return;
  const pk = PAKET_AUDIO.filter(x => x.available), i = id ? pk.findIndex(x => x.id === id) + 1 : 0;
  await paketSetScene(i ? `paket:${i}:1` : 'paket', false);
  if (i) showToast('📺 Tayang di layar videotron: ' + pk[i - 1].title.split(' — ')[0]);
}
async function paketOffScreen() {
  if (!supabase || !isAdmin()) return;
  const { error } = await supabase.from(QA_SCREEN).upsert({ id: 1, scene: null, scene_text: null, scene_until: null, updated_at: new Date().toISOString() });
  if (error) { showToast('Gagal: ' + error.message, 8000); return; }
  paketMarkOnScreen(null); showToast('Layar videotron kembali ke Meeting Dealer');
}
function paketMarkOnScreen(scene) {
  const pk = paketParse(scene);
  document.querySelectorAll('.res-btn-screen').forEach(b => { const on = pk.pkg && b.id === 'pk-btn-' + pk.pkg.id; b.classList.toggle('on', !!on); b.textContent = on ? '● Tayang di layar' : '📺 Tayangkan di Layar'; });
  const el = document.getElementById('pk-now'); if (el) el.textContent = sceneBase(scene) === 'paket' ? (pk.pkg ? `${pk.pkg.title.split(' — ')[0]} · hal. ${pk.page}${pk.pages ? '/' + pk.pages : ''}` : 'daftar paket') : '';
}
async function renderPksPage(n, d = 'dealer') {
  const key = `pks|${d}|${n}`;
  if (!qsSetStage(key, '<div class="qs-idle"><p>Memuat materi PKS…</p></div>')) return;
  let ov = document.getElementById('qs-slide');
  if (!ov) { ov = document.createElement('div'); ov.id = 'qs-slide'; ov.className = 'qs-slide qs-pks'; document.getElementById('qa-screen').appendChild(ov); }
  ov.classList.add('qs-pks');
  try {
    const doc = await getPksDoc(d);
    qsPksPages[d] = doc.numPages;
    if (qsKey !== key) return;   // sudah pindah halaman sementara memuat
    const page = await doc.getPage(Math.min(n, doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(window.innerHeight * 0.96 / base.height, window.innerWidth * 0.96 / base.width) * (window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas');
    cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    if (qsKey !== key) return;
    ov.appendChild(cv); requestAnimationFrame(() => cv.classList.add('in'));
    setTimeout(() => [...ov.children].slice(0, -1).forEach(x => x.remove()), 600);
  } catch (e) {
    ov.remove();
    qsKey = null;   // coba lagi otomatis di poll berikutnya (mis. PDF baru saja diunggah)
    document.getElementById('qs-stage').innerHTML = `<div class="qs-idle"><p>${PKS_DOCS[d].label} belum tersedia (${escHtml(e.message || e)}). Unggah PDF di panel Kick Off 2027.</p></div>`;
  }
}

/* ── Slide presentasi di layar: gambar layar penuh, ganti slide dengan crossfade, slide berikutnya dipra-muat ── */
function renderFmSlide(n) {
  if (!qsSetStage('fmslide|' + n, '<div class="qs-idle"><p>Fun Marketing</p></div>')) return;
  let ov = document.getElementById('qs-slide');
  if (!ov) { ov = document.createElement('div'); ov.id = 'qs-slide'; ov.className = 'qs-slide'; document.getElementById('qa-screen').appendChild(ov); }
  const img = new Image();
  img.alt = 'Slide ' + n; img.src = fmSlide(n);
  img.onload = () => { ov.appendChild(img); requestAnimationFrame(() => img.classList.add('in')); setTimeout(() => [...ov.children].slice(0, -1).forEach(x => x.remove()), 600); };
  [n + 1, n - 1].filter(x => x >= 1 && x <= FM_SLIDES && !FM_TITLE_SLIDES.includes(x)).forEach(x => { new Image().src = fmSlide(x); });
}
// Clicker presentasi / tombol panah di komputer videotron → ganti slide (ditulis ke tabel agar panel admin ikut)
async function qsFmKey(d) {
  const { data: s } = await supabase.from(QA_SCREEN).select('scene').eq('id', 1).maybeSingle();
  if (sceneBase(s?.scene) === 'opening') {   // Opening Speech: 0 = susunan pembicara, 1..n = pembicara
    const cur = Math.max(0, OPENING_SEQ.indexOf(s.scene)), next = Math.min(OPENING_SEQ.length - 1, Math.max(0, cur + d));
    if (next === cur) return;
    const scene = OPENING_SEQ[next], now = new Date().toISOString();
    renderScene({ scene, updated_at: now });
    await supabase.from(QA_SCREEN).upsert({ id: 1, scene, scene_text: null, scene_until: null, updated_at: now });
    return;
  }
  if (sceneBase(s?.scene) === 'awarding') {   // Awarding: judul → Top 10 … Top 2 → Juara → papan peringkat
    const cur = Math.max(0, AWARD_SEQ.indexOf(s.scene)), next = Math.min(AWARD_SEQ.length - 1, Math.max(0, cur + d));
    if (next === cur) return;
    const scene = AWARD_SEQ[next], now = new Date().toISOString();
    renderScene({ scene, updated_at: now });
    await supabase.from(QA_SCREEN).upsert({ id: 1, scene, scene_text: null, scene_until: null, updated_at: now });
    return;
  }
  if (sceneBase(s?.scene) === 'kickoff') {   // judul Kick Off → Absen Dosa (1 per 1) → jawaban → video portal → PKS Dealer hal. 1..n → PKS Team Leader hal. 1..m
    const pages = async id => qsPksPages[id] ?? (qsPksPages[id] = await getPksDoc(id).then(x => x.numPages).catch(() => 0));
    const dp = await pages('dealer'), tp = await pages('tl'), P = KICKOFF_PRE.length - 1, pk = pksPart(s.scene);
    const pre = s.scene === 'kickoff:absen:all' ? KICKOFF_PRE.indexOf('kickoff:absen:' + ABSEN_DOSA.length) : KICKOFF_PRE.indexOf(s.scene);
    const cur = pre >= 0 ? pre : pk ? P + (pk.d === 'tl' ? dp : 0) + pk.n : 0;
    const max = P + dp + tp;
    const next = Math.min(max, Math.max(0, cur + d));
    if (next === cur) return;
    const r = next - P, scene = next < KICKOFF_PRE.length ? KICKOFF_PRE[next] : r <= dp ? pksKey('dealer', r) : pksKey('tl', r - dp), now = new Date().toISOString();
    renderScene({ scene, updated_at: now });
    await supabase.from(QA_SCREEN).upsert({ id: 1, scene, scene_text: null, scene_until: null, updated_at: now });
    return;
  }
  if (sceneBase(s?.scene) === 'sertifikat') {   // Sertifikat: judul → dealer 1..n → daftar semua
    const cur = Math.max(0, CERT_SEQ.indexOf(s.scene)), next = Math.min(CERT_SEQ.length - 1, Math.max(0, cur + d));
    if (next === cur) return;
    const scene = CERT_SEQ[next], now = new Date().toISOString();
    renderScene({ scene, updated_at: now });
    await supabase.from(QA_SCREEN).upsert({ id: 1, scene, scene_text: null, scene_until: null, updated_at: now });
    return;
  }
  if (sceneBase(s?.scene) === 'paket') return paketStep(d, true);
  if (sceneBase(s?.scene) === 'flier') {   // Flier: panah = flier berikutnya / sebelumnya
    const N = (await flierList().catch(() => [])).length; if (!N) return;
    const cur = flNum(s.scene), next = cur === 0 ? (d > 0 ? 1 : N) : Math.min(N, Math.max(1, cur + d));
    if (next === cur) return;
    const scene = 'flier:' + next;
    renderScene({ scene });
    await supabase.from(QA_SCREEN).upsert({ id: 1, scene, scene_text: null, scene_until: null, updated_at: new Date().toISOString() });
    return;
  }
  if (sceneBase(s?.scene) === 'backdrop') {   // Backdrop: panah = ganti foto
    const cur = bdNum(s.scene) || 0, next = cur === 0 ? (d > 0 ? 1 : BACKDROPS.length) : Math.min(BACKDROPS.length, Math.max(1, cur + d));
    if (next === cur) return;
    const scene = 'backdrop:' + next;
    renderScene({ scene });
    await supabase.from(QA_SCREEN).upsert({ id: 1, scene, scene_text: null, scene_until: null, updated_at: new Date().toISOString() });
    return;
  }
  const cur = sceneBase(s?.scene) === 'funmkt' ? fmNum(s.scene) : null;
  if (cur === null) return;
  const next = Math.min(FM_SLIDES, Math.max(1, cur + d));
  if (next === cur) return;
  if (FM_TITLE_SLIDES.includes(next)) { qsKey = null; renderScene({ scene: 'funmkt:' + next }); } else renderFmSlide(next);
  await supabase.from(QA_SCREEN).upsert({ id: 1, scene: 'funmkt:' + next, scene_text: null, scene_until: null, updated_at: new Date().toISOString() });
}

/* ── Video Product Launch di layar: intro logo brand → video layar penuh → penutup ── */
let qsLvTimer = null;
const qsLocalVideos = {};   // file video lokal pilihan operator, per brand (array object URL) — hanya selama tab terbuka
function stopLaunchVideo() {
  clearTimeout(qsLvTimer); qsLvTimer = null;
  const ov = document.getElementById('qs-video');
  if (ov) { ov.querySelector('video')?.pause(); ov.remove(); }
}
function launchList(brand, idx) {
  const local = qsLocalVideos[brand];
  if (local?.length) {
    if (idx != null) { const t = (brand === 'testimoni' ? TESTIMONI_VIDEOS : LAUNCH_VIDEOS[brand])?.[idx]?.title, hit = local.find(x => x.title === t); if (hit) return [hit]; }
    return local;
  }
  const vids = (brand === 'testimoni' ? TESTIMONI_VIDEOS : LAUNCH_VIDEOS[brand]) || [];
  return idx != null ? vids.slice(idx, idx + 1) : vids;
}
// Percikan emas untuk layar Product Launch (posisi/waktu acak tetap per render)
// Launching Brand Baru: hitung mundur 3-2-1 → kilatan → reveal nama/logo brand (CSS, sekali putar per tampil)
function renderNewBrand(s) {
  const [n0, t0] = String(s.scene_text || '').split('|').map(x => x.trim());
  const name = n0 || NEW_BRAND.name, tag = t0 || (n0 ? '' : NEW_BRAND.tagline);
  const b = BRANDS.find(x => x.name.toLowerCase() === name.toLowerCase());
  const logo = b?.logo || (!n0 || name === NEW_BRAND.name ? NEW_BRAND.logo : '');
  const cd = s.scene === 'newbrand' || s.scene === 'newbrand:full';   // :now & :v tanpa hitung mundur
  return `<div class="qs-scene sc-launch lh nb${cd ? ' cd' : ''}">
    <div class="lh-bg"><div class="sc-rays"></div><i class="lh-ring r1"></i><i class="lh-ring r2"></i><i class="lh-ring r3"></i>${lhSparks()}<i class="lh-streak s1"></i><i class="lh-streak s2"></i></div>
    ${cd ? '<div class="nb-count"><b>3</b><b>2</b><b>1</b></div><i class="nb-flash"></i>' : ''}
    <div class="nb-reveal">
      <i class="lh-br tl"></i><i class="lh-br tr"></i><i class="lh-br bl"></i><i class="lh-br brr"></i>
      <div class="lh-kicker"><i></i><span>Welcome to the Family</span><i></i></div>
      <h1 class="lh-title"><span class="lh-w">New</span> <span class="lh-w g">Brand</span></h1>
      <div class="nb-burst"></div>
      <div class="lh-name nb-name">${logo ? `<img class="nb-logo" src="${logo}" alt="${escHtml(name)}">` : `<span>${escHtml(name)}</span>`}</div>
      ${tag ? `<p class="nb-tag">${escHtml(tag)}</p>` : ''}
      <div class="lh-div"><i></i><b></b><i></i></div>
      <p class="lh-sub">Concerto Audio Indonesia · Brand Resmi</p>
    </div></div>`;
}
// Launching - CAI: hitung mundur 3-2-1 → kilatan → logo CAI (memakai animasi & CSS .nb-* yang sama dengan Launching - CAELUM)
function renderCaiLaunch(s) {
  const what = String(s.scene_text || '').trim(), cd = s.scene === 'cailaunch' || s.scene === 'cailaunch:full';
  return `<div class="qs-scene sc-launch lh nb${cd ? ' cd' : ''}">
    <div class="lh-bg"><div class="sc-rays"></div><i class="lh-ring r1"></i><i class="lh-ring r2"></i><i class="lh-ring r3"></i>${lhSparks()}<i class="lh-streak s1"></i><i class="lh-streak s2"></i></div>
    ${cd ? '<div class="nb-count"><b>3</b><b>2</b><b>1</b></div><i class="nb-flash"></i>' : ''}
    <div class="nb-reveal">
      <i class="lh-br tl"></i><i class="lh-br tr"></i><i class="lh-br bl"></i><i class="lh-br brr"></i>
      <div class="lh-kicker"><i></i><span>Official Launching</span><i></i></div>
      <div class="nb-burst"></div>
      <div class="lh-name nb-name"><img class="nb-logo nb-cai" src="${LOGO_WHITE}" alt="Concerto Audio Indonesia"></div>
      ${what ? `<p class="nb-tag">${escHtml(what)}</p>` : ''}
      <div class="lh-div"><i></i><b></b><i></i></div>
      <p class="lh-sub">Concerto Audio Indonesia · Gathering CAI 2026</p>
    </div></div>`;
}
// Percikan emas memancar dari tengah saat nama brand muncul (mode hitung mundur: reveal dimulai setelah 3,9 dtk)
let nbTimer = null, nbVidTimer = null;
function nbBurst() {
  const el = document.querySelector('#qs-stage .nb-burst'); if (!el) return;
  const nb = el.closest('.nb');
  if (nb.classList.contains('cd') && !nb.classList.contains('go')) { clearTimeout(nbTimer); nbTimer = setTimeout(() => { nb.classList.add('go'); nbBurst(); }, 3900); return; }
  const delay = 0.5;
  el.innerHTML = Array.from({ length: 36 }, (_, i) => { const a = i / 36 * Math.PI * 2 + Math.random() * .2, r = 28 + Math.random() * 30;
    return `<em style="--x:${(Math.cos(a) * r).toFixed(1)}vw;--y:${(Math.sin(a) * r * .6).toFixed(1)}vh;animation-delay:${(delay + Math.random() * .15).toFixed(2)}s"></em>`; }).join('');
}
function lhSparks() {
  let h = '';
  for (let i = 0; i < 26; i++) {
    const x = Math.round(Math.random() * 100), y = Math.round(20 + Math.random() * 75), d = (Math.random() * 6).toFixed(2), du = (4 + Math.random() * 5).toFixed(2), sz = (0.5 + Math.random() * 1.1).toFixed(2);
    h += `<em style="left:${x}%;top:${y}%;animation-delay:${d}s;animation-duration:${du}s;width:${sz}vh;height:${sz}vh"></em>`;
  }
  return `<div class="lh-sparks">${h}</div>`;
}
function renderLaunchVideo(s) {
  const { brand, idx } = launchParts(s.scene), b = BRANDS.find(x => x.id === brand);
  const one = idx != null ? LAUNCH_VIDEOS[brand]?.[idx] : null;
  // Tanpa sampul/judul pembuka (27 Okt 2026, permintaan pemilik): layar hitam polos, video langsung diputar.
  // Pesan & tombol pilih file hanya muncul bila video gagal dimuat.
  const changed = qsSetStage(['launchv', s.scene, s.scene_text, s.updated_at].join('|'), `<div class="qs-scene sc-lv-bare">
    <p class="sc-sub" id="sc-lv-msg" hidden></p>
    <div class="sc-lv-pick" id="sc-lv-pick" hidden><label class="qs-login">📁 Pilih file video di komputer ini (boleh lebih dari satu)<input type="file" accept="video/*" multiple hidden onchange="qsPickVideo('${brand}', ${idx == null ? 'null' : idx}, this)"></label></div></div>`);
  if (changed) qsLvTimer = setTimeout(() => playLaunchVideo(brand, idx, 0), 0);   // langsung; poll 4 dtk tidak memulai ulang video
}
// Layar Testimoni Partner CAI: judul + (nama dealer / daftar partner) + titik progres video
const tmSplit = t => { const [n, ...c] = String(t || '').split(/\s+[—–-]\s+/); return { name: (n || '').trim(), city: c.join(' — ').trim() }; };
function tmScene({ who = '', city = '', idx = null, extra = '' } = {}) {
  const n = TESTIMONI_VIDEOS.length;
  const dots = n ? `<div class="tm-dots">${TESTIMONI_VIDEOS.map((v, i) => `<i${idx === i ? ' class="on"' : ''}></i>`).join('')}</div>` : '';
  const chips = !who && n ? `<div class="tm-chips">${TESTIMONI_VIDEOS.map(v => `<span>${escHtml(((x) => x.name + (x.city ? ' · ' + x.city : ''))(tmSplit(v.title)))}</span>`).join('')}</div>` : '';
  return `<div class="qs-scene sc-testi"><div class="sc-rays"></div>${SC_QUOTE}
    <div class="tm-kicker"><i></i><span>Free Time</span><i></i></div>
    <h1 class="tm-title">Testimoni <em>Partner CAI</em></h1>
    ${who ? `<div class="tm-who"><b>${who}</b>${city ? `<span class="tm-city">${city}</span>` : ''}</div>` : ''}${chips}${dots}
    <p class="sc-sub" id="sc-lv-msg">Concerto Audio Indonesia</p>${extra}</div>`;
}
function renderTestimoniVideo(s) {
  const { idx } = tmParts(s.scene), one = idx != null ? TESTIMONI_VIDEOS[idx] : null, sp = tmSplit(one?.title);
  const who = s.scene_text ? escHtml(s.scene_text) : escHtml(sp.name), city = s.scene_text ? '' : escHtml(sp.city);
  const pick = `<div class="sc-lv-pick" id="sc-lv-pick" hidden><label class="qs-login">📁 Pilih file video testimoni di komputer ini (boleh lebih dari satu)<input type="file" accept="video/*" multiple hidden onchange="qsPickVideo('testimoni', ${idx == null ? 'null' : idx}, this)"></label></div>`;
  const changed = qsSetStage(['testi', s.scene, s.scene_text, s.updated_at].join('|'), tmScene({ who, city, idx, extra: pick }));
  qsPrefetchVideos(TESTIMONI_VIDEOS, 'testimoni');
  if (changed) qsLvTimer = setTimeout(() => playLaunchVideo('testimoni', idx, 0), 3000);
}
// Video testimoni diunduh ke memori (blob) sebelum diputar → tidak bergantung kecepatan internet saat tayang (patah-patah/buffering)
const qsVidCache = {}; let qsPrefetching = false, qsAllPrefetching = false;
// Anti buffering (27 Okt 2026): SEMUA video videotron diunduh ke memori satu per satu sejak layar dibuka, urut sesuai
// susunan acara (± 600 MB; biarkan tab layar terbuka beberapa menit sebelum acara). Video yang sudah ada di memori
// diputar lokal (playLaunchVideo, playOverlayVideo, backdrop, Opening Speech); yang belum selesai tetap streaming.
function qsAllVideoSrcs() {
  const list = [
    ...BACKDROPS.filter(b => b.welcome && b.video).map(b => b.video), ANTHEM_VIDEO,
    ...Object.values(LAUNCH_VIDEOS).flat().map(v => v.src), NEW_BRAND.video, PORTAL_INTRO_VIDEO,
    ...OPENING_SPEAKERS.flatMap(sp => [sp.intro, sp.video]), CAI_LAUNCH_VIDEO,
    ...TESTIMONI_VIDEOS.map(v => v.src), ...BACKDROPS.filter(b => b.video && !b.welcome).map(b => b.video),
  ];
  return [...new Set(list.filter(Boolean))];
}
// Progres unduhan TIDAK tampil di layar videotron (permintaan pemilik 27 Okt 2026) — dilaporkan ke panel Admin/Editor
// lewat Realtime broadcast channel 'bgm-status' (event 'vid'), seperti status musik.
let qsVidProg = { busy: false, cur: '' };
function qsVidReport() {
  if (!supabase) return;
  const list = qsAllVideoSrcs(), done = list.filter(s => qsVidCache[s]).length;
  try {
    if (!bgmCh) { bgmCh = supabase.channel('bgm-status'); bgmCh.subscribe(); }
    bgmCh.send({ type: 'broadcast', event: 'vid', payload: { done, total: list.length, busy: qsVidProg.busy, cur: qsVidProg.cur } });
  } catch (e) { /* abaikan */ }
}
async function qsPrefetchAll() {
  if (qsAllPrefetching) return; qsAllPrefetching = true;
  const list = qsAllVideoSrcs();
  qsVidProg.busy = true; qsVidReport();
  try {
    for (let i = 0; i < list.length; i++) {
      if (qsVidCache[list[i]]) continue;
      qsVidProg.cur = decodeURIComponent(list[i].split('/').pop().replace(/\?.*$/, '')); qsVidReport();
      await qsFetchBlob(list[i]);
    }
  } finally { qsAllPrefetching = false; qsVidProg = { busy: false, cur: '' }; qsVidReport(); }
}
async function qsPrefetchVideos(list, label) {
  if (qsPrefetching) return; qsPrefetching = true;
  const el = null;   // progres unduhan tidak ditampilkan di layar videotron (dilaporkan ke panel lewat qsVidReport)
  try {
    for (let i = 0; i < list.length; i++) {
      const src = list[i].src; if (qsVidCache[src]) continue;
      if (el) { el.textContent = `⬇ Menyiapkan video ${label} ${i + 1}/${list.length}…`; el.hidden = false; }
      await qsFetchBlob(src);   // gagal → tetap streaming dari server
    }
  } finally { qsPrefetching = false; if (el) el.hidden = true; }
}
function playLaunchVideo(brand, idx, pos) {
  const list = launchList(brand, idx), item = list[pos];
  const msg = document.getElementById('sc-lv-msg');
  const fail = text => { stopLaunchVideo(); if (msg) { msg.textContent = text; msg.hidden = false; } const pick = document.getElementById('sc-lv-pick'); if (pick) pick.hidden = false; };
  if (!item) return fail('Video belum diatur.');
  let ov = document.getElementById('qs-video');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'qs-video'; ov.className = 'qs-video';
    ov.innerHTML = '<video id="qs-video-el" playsinline preload="auto"></video><div class="qs-vcap"></div><button class="qs-unmute" hidden>🔊 Nyalakan suara</button>';
    document.getElementById('qa-screen').appendChild(ov);
  }
  const v = ov.querySelector('video'), um = ov.querySelector('.qs-unmute'), cap = ov.querySelector('.qs-vcap');
  const wasMuted = v.muted;
  qsVidFade(v);
  // keterangan kecil "2/3 · judul" di awal tiap video (hanya bila lebih dari satu)
  const tm = brand === 'testimoni', real = tm && idx != null ? idx : pos;
  cap.className = 'qs-vcap' + (tm ? ' tm-lt' : '');
  if (tm) { const sp = tmSplit(item.title); cap.innerHTML = `<b>${escHtml(sp.name)}</b>${sp.city ? `<span>${escHtml(sp.city)}</span>` : ''}`;
    document.querySelectorAll('.sc-testi .tm-dots i').forEach((d, i) => { d.classList.toggle('done', i < real); d.classList.toggle('on', i === real); }); }
  else cap.textContent = '';   // Product Launch: tanpa keterangan judul (permintaan pemilik 27 Okt 2026)
  void cap.offsetWidth; if (cap.textContent) cap.classList.add('show');
  v.onended = () => {
    if (pos + 1 < list.length) return playLaunchVideo(brand, idx, pos + 1);
    stopLaunchVideo(); if (msg && tm) msg.textContent = 'Concerto Audio Indonesia';   // Product Launch selesai: layar hitam polos
    if (tm) {   // selesai: ganti nama dealer dengan ucapan terima kasih
      const sc = document.querySelector('.sc-testi'); if (!sc) return;
      sc.querySelectorAll('.tm-who, .tm-chips').forEach(x => x.remove());
      sc.querySelector('.tm-title')?.insertAdjacentHTML('afterend', '<div class="tm-who"><b>Terima kasih</b><span class="tm-city">atas cerita & kepercayaan para partner</span></div>');
      sc.querySelectorAll('.tm-dots i').forEach(d => { d.className = 'done'; });
    }
  };
  v.onerror = () => fail(`Video "${item.title}" tidak bisa diputar (file belum diunggah atau koneksi terputus).`);
  um.onclick = () => { v.muted = false; um.hidden = true; };
  // Browser bisa menolak autoplay bersuara bila tab belum pernah diklik → putar tanpa suara + tombol suara
  v.muted = wasMuted;
  qsPlayWhenReady(v, item.src, () => v.play().catch(() => { v.muted = true; um.hidden = false; v.play().catch(() => {}); }));
}
// Nama file dicocokkan ke judul di LAUNCH_VIDEOS (mis. "AS500.1 (CAI).mp4" → AS500.1) → urutan & indeks ikut daftar;
// file yang tak cocok ditaruh di akhir (urut nama).
const vidKey = t => String(t).normalize('NFD').replace(/\.(mp4|mov|m4v|webm|mkv|avi)$/i, '').replace(/\(cai\)/ig, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function qsPickVideo(brand, idx, input) {
  const files = [...(input.files || [])]; if (!files.length) return;
  (qsLocalVideos[brand] || []).forEach(x => x && URL.revokeObjectURL(x.src));
  const left = files.sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true }));
  const take = v => { const keys = [v.title, ...(v.alt || [])].map(vidKey);
    const i = left.findIndex(f => keys.some(k => vidKey(f.name).endsWith(k))); return i < 0 ? null : left.splice(i, 1)[0]; };
  const toItem = (f, title) => ({ title: title || f.name.replace(/\.[^.]+$/, ''), src: URL.createObjectURL(f) });
  const matched = ((brand === 'testimoni' ? TESTIMONI_VIDEOS : LAUNCH_VIDEOS[brand]) || []).map(v => { const f = take(v); return f ? toItem(f, v.title) : null; });
  const list = matched.filter(Boolean).concat(left.map(f => toItem(f)));
  qsLocalVideos[brand] = list;
  // satu video dipilih & cocok dengan tombol yang diklik → putar itu saja; selain itu putar semua
  playLaunchVideo(brand, idx != null && matched[idx] ? idx : null, 0);
}

// Hitung mundur di layar (Coffee Break dll.)
function qsTick() {
  document.querySelectorAll('#qs-stage .qs-count').forEach(el => {
    const ms = new Date(el.dataset.until) - Date.now();
    const sec = Math.max(0, Math.ceil(ms / 1000));
    el.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    el.parentElement.classList.toggle('over', sec === 0);
    if (sec === 0) el.nextElementSibling.textContent = 'sesi berikutnya segera dimulai';
  });
}

/* ── Halaman layar videotron: ?layar=qa ── */
const QA_SCREEN_MODE = new URLSearchParams(location.search).get('layar') === 'qa';
let qsTimer = null, qsChannel = null, qsKey = null, qsCursorT = null;

// Layar videotron memuat ulang sendiri bila ada versi portal baru (cek tiap 60 dtk; ditunda selama video diputar)
let qsBuildSig = null;
async function qsCheckBuild() {
  try {
    const t = await (await fetch(location.pathname + '?build=' + Date.now(), { cache: 'no-store' })).text();
    const sig = t.length + ':' + t.slice(-200);
    if (qsBuildSig === null) { qsBuildSig = sig; return; }
    const v = document.getElementById('qs-video-el');
    if (sig !== qsBuildSig && !(v && !v.paused) && !document.getElementById('qs-video')) location.reload();
  } catch (e) {}
}
function initQaScreen() {
  if (!QA_SCREEN_MODE) return;
  qsCheckBuild(); setInterval(qsCheckBuild, 60000);
  document.body.classList.add('screen-mode');
  document.title = 'Layar Videotron — Gathering CAI 2026';
  { const f = document.createElement('link'); f.rel = 'stylesheet';   // font tambahan khusus layar videotron (layar Sertifikat Dealer)
    f.href = 'https://fonts.googleapis.com/css2?family=Great+Vibes&family=Playfair+Display:wght@700;900&family=Cormorant+Garamond:ital,wght@1,500&display=swap'; document.head.appendChild(f); }
  const el = document.getElementById('qa-screen');
  el.hidden = false;
  document.getElementById('qs-logo').src = LOGO_WHITE;
  setInterval(qsTick, 1000);
  qsSetStage('wait', '<div class="qs-idle"><p>Menghubungkan…</p></div>');
  document.addEventListener('fullscreenchange', () => el.classList.toggle('is-fs', !!document.fullscreenElement));
  el.addEventListener('mousemove', () => { el.classList.remove('hide-cursor'); clearTimeout(qsCursorT); qsCursorT = setTimeout(() => el.classList.add('hide-cursor'), 3000); });
  document.addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') qsFullscreen(); if (e.key === ' ') { const v = document.getElementById('qs-video-el'); if (v) { e.preventDefault(); v.paused ? v.play() : v.pause(); } }
    if (['ArrowRight', 'PageDown', 'ArrowDown'].includes(e.key)) { e.preventDefault(); qsFmKey(1); }
    if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); qsFmKey(-1); } });
}
function qsFullscreen() { document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.().catch(() => {}); }

function qaScreenAuth() {
  if (!QA_SCREEN_MODE) return;
  if (isAdmin()) { closeAdmin(); startQaScreen(); return; }
  stopQaScreen();
  qsSetStage('login', `<div class="qs-idle"><div class="qs-kicker">Layar Videotron · Gathering CAI 2026</div><h1>Meeting <em>Dealer</em></h1>
    <p>Login sebagai Admin / Editor di browser ini untuk menampilkan pertanyaan.</p><button class="qs-login" onclick="openAdmin()">🔒 Login Admin</button></div>`);
}
/* ── Mode offline videotron (27 Okt 2026, permintaan pemilik) ──
   Panel Editor & layar videotron di SATU komputer → perintah tampilan juga dikirim lewat BroadcastChannel antar-tab
   (tanpa internet). Setiap upsert ke gathering_screen dari panel ikut disiarkan lokal; layar langsung menerapkannya.
   Internet putus: upsert/select gathering_screen gagal → dianggap berhasil memakai baris lokal, jadi tombol panel &
   clicker tetap jalan. Baris lokal yang lebih baru dari database dipakai layar (database tertinggal saat offline). */
const QS_LOCAL = 'BroadcastChannel' in window ? new BroadcastChannel('cai-videotron') : null;
let qsLocalRow = null;   // baris gathering_screen terakhir yang diketahui di tab ini (panel & layar)
const qsNetErr = e => !navigator.onLine || /fetch|network|failed|timeout|load/i.test(String(e?.message || e || ''));
function qsLocalWrap() {
  if (!supabase || supabase._qsWrapped) return; supabase._qsWrapped = true;
  const from = supabase.from.bind(supabase);
  supabase.from = t => {
    const q = from(t);
    if (t !== QA_SCREEN) return q;
    const up = q.upsert.bind(q), sel = q.select.bind(q);
    q.upsert = (row, ...a) => {
      const now = row?.updated_at ? row : { ...row };
      qsLocalRow = { ...(qsLocalRow || {}), ...now, at: Date.now() };
      if (!('scene' in qsLocalRow) && !('question_id' in qsLocalRow)) return up(row, ...a);   // keadaan layar belum diketahui → jangan siarkan
      const qid = qsLocalRow.question_id, qq = qid && (qaItems || []).find(x => x.id === qid);
      try { QS_LOCAL?.postMessage({ row: qsLocalRow, q: qq || null }); } catch (e) {}
      return up(row, ...a).then(r => r.error && qsNetErr(r.error) ? { ...r, error: null } : r, e => ({ data: null, error: qsNetErr(e) ? null : e }));
    };
    q.select = (...a) => {
      const b = sel(...a), eq = b.eq.bind(b);
      b.eq = (...x) => {
        const c = eq(...x), ms = c.maybeSingle.bind(c);
        c.maybeSingle = () => ms().then(r => {
          if (r.error) return qsLocalRow && qsNetErr(r.error) ? { data: qsLocalRow, error: null } : r;
          if (r.data) qsLocalRow = { ...(qsLocalRow || {}), ...r.data };
          return r;
        }, e => ({ data: qsLocalRow, error: qsLocalRow ? null : e }));
        return c;
      };
      return b;
    };
    return q;
  };
}
// Layar videotron: terapkan baris dari panel di komputer yang sama
let qsLocalQ = null, qsLocalAt = 0;
if (QS_LOCAL) QS_LOCAL.onmessage = ev => {
  if (!QA_SCREEN_MODE || !ev.data?.row || !('scene' in ev.data.row)) return;
  qsLocalRow = ev.data.row; qsLocalQ = ev.data.q; qsLocalAt = Date.now();
  qsRenderRow(qsLocalRow, qsLocalQ);
};
function qsRenderRow(s, q) {
  bgmApply(s);
  document.getElementById('qs-status')?.classList.remove('off');
  if (s?.scene && sceneInfo(s.scene)) { renderScene(s); return; }
  renderQaScreen(s?.question_id ? q : null);
}
// Service worker: halaman & aset tetap bisa dibuka ulang tanpa internet (khusus layar videotron & staf)
function qsRegisterSW() {
  if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/localhost/.test(location.href)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
function startQaScreen() {
  if (qsTimer) return;
  qsRegisterSW();
  setTimeout(() => BACKDROPS.filter(b => b.welcome && b.video).forEach(b => qsFetchBlob(b.video)), 1500);   // video Partner Masuk disiapkan paling awal (dipakai pertama di acara pagi)
  setTimeout(qsPrefetchAll, 8000); setInterval(qsVidReport, 5000);   // semua video acara diunduh ke memori di latar (anti buffering), urut sesuai susunan acara
  qsLoad();
  qsTimer = setInterval(qsLoad, 4000);
  qsChannel = supabase.channel('qa-screen')
    .on('postgres_changes', { event: '*', schema: 'public', table: QA_SCREEN }, qsLoad)
    .on('postgres_changes', { event: '*', schema: 'public', table: QA_TABLE }, qsLoad)
    .subscribe();
}
function stopQaScreen() {
  clearInterval(qsTimer); qsTimer = null;
  if (qsChannel) { supabase.removeChannel(qsChannel); qsChannel = null; }
}

/* ── Musik latar layar videotron ──
   Satu AudioBuffer berulang (gapless) lewat Web Audio, di luar #qs-stage → tidak terputus saat sesi berganti.
   Volume di-fade otomatis: senyap pada sesi di daftar "senyap" (bgm_off), saat video (#qs-video) diputar, atau bila dimatikan.
   Pengaturan dibaca dari baris gathering_screen (kolom bgm_on / bgm_vol / bgm_off — opsional; tanpa kolom = default di bawah).
   Browser menahan audio sebelum ada interaksi → tombol "Aktifkan musik latar" muncul sampai layar diklik / tombol ditekan. */
const BGM_SRC = 'assets/audio/backsound.mp3?v=2';
const BGM_AWARD_SRC = 'assets/audio/awarding.mp3?v=1';
// Daftar backsound — dipilih Editor dari panel (menu Backsound). Tambah lagu: file di assets/audio/ + satu baris di sini.
const BGM_TRACKS = [
  { id: 'main', name: 'Upward Trend', sub: 'Corporate · musik latar umum', src: BGM_SRC },
  { id: 'awarding', name: 'Champions Anthem', sub: 'Awards Ceremony · cocok untuk Awarding', src: BGM_AWARD_SRC },
  // lagu panjang (12 mnt) → stream: diputar lewat elemen <audio> (tidak di-decode utuh ke memori ±280 MB), tetap lewat gain & crossfade yang sama
  { id: 'presentation', name: 'Background Presentation', sub: '12 menit · tenang untuk sesi presentasi', src: 'assets/audio/presentation.mp3?v=1', stream: true },
  // lagu komersial berhak cipta → TIDAK di repo publik: file diunggah Editor ke Storage privat (store), diputar lewat signed URL
  { id: 'champions', name: 'We Are The Champions', sub: 'Queen · file privat (unggah di bawah)', store: 'gathering/audio/we-are-the-champions' },
];
const bgmTrackUrl = async def => {   // src publik, atau signed URL untuk lagu di Storage privat
  if (!def.store) return def.src;
  const { data, error } = await supabase.storage.from(GUIDES_BUCKET).createSignedUrl(def.store, 3600);
  if (error || !data?.signedUrl) throw new Error(/not.?found|404/i.test(error?.message || '') || !error ? 'lagu belum diunggah' : error.message);
  return data.signedUrl;
};
const bgmTrackOk = id => BGM_TRACKS.some(t => t.id === id) ? id : BGM_TRACKS[0].id;
const BGM_YT_ID = '';   // musik latar dari YouTube (pemutar resmi YouTube IFrame; tidak diunduh / disalin ke repo). Kosongkan untuk memakai file di atas saja.
const BGM_KEYS = [['anthem', '🇮🇩', 'Indonesia Raya'], ['qa', '🎤', 'Meeting Dealer'], ['opening', '🎙', 'Opening Speech'], ['coffee', '☕', 'Coffee Break'], ['refresh', '🔊', 'Refreshment Product'], ['launch', '🚀', 'Product Launch'],
  ['newbrand', '✨', 'Launching - CAELUM'], ['cailaunch', '🚀', 'Launching - CAI'], ['lunch', '🍽', 'Makan Siang'], ['testimoni', '💬', 'Testimoni'], ['backdrop', '🖼', 'Backdrop'], ['funmkt', '🎯', 'Fun Marketing'], ['kickoff', '🏁', 'Kick Off 2027'], ['paket', '📦', 'Paket Audio']];
const BGM_OFF_DEFAULT = [];   // bawaan: musik menyala di semua sesi (Editor bisa membuat sesi tertentu senyap lewat panel); video penuh layar selalu menurunkan musik otomatis
const bgmOffList = r => r && r.bgm_off != null ? String(r.bgm_off).split(',').map(x => x.trim()).filter(Boolean) : BGM_OFF_DEFAULT;
const bgmClamp = v => Math.min(100, Math.max(0, +v || 0));
const bgmDefault = () => ({ on: false, vol: 70, off: BGM_OFF_DEFAULT.slice(), track: BGM_TRACKS[0].id });   // bawaan: MATI sampai Editor menyalakan
function bgmLocal() {   // pengaturan terakhir dari Editor, tersimpan di browser layar videotron (tak perlu kolom Supabase)
  try { const o = JSON.parse(localStorage.getItem('cai-bgm') || 'null'); if (o && typeof o.on === 'boolean') return { on: o.on, vol: bgmClamp(o.vol ?? 70), off: Array.isArray(o.off) ? o.off : [], track: bgmTrackOk(o.track) }; } catch (e) {}
  return null;
}
function bgmLocalSave(c) { try { localStorage.setItem('cai-bgm', JSON.stringify({ on: c.on, vol: c.vol, off: c.off, track: c.track })); } catch (e) {} }
const bgm = { ctx: null, gain: null, started: false, why: '', cfg: { ...bgmDefault(), scene: 'qa' } };
function bgmApply(s) {
  const loc = bgmLocal();
  const base = s && s.bgm_on != null ? { on: s.bgm_on !== false, vol: bgmClamp(s.bgm_vol ?? 70), off: [], track: bgmTrackOk(s.bgm_track || loc?.track) } : { ...(loc || bgmDefault()), off: [] };
  bgm.cfg = { ...base, scene: s?.scene ? sceneBase(s.scene) : 'qa', raw: s?.scene || '' };
  if (!bgm.inited) { bgm.inited = true; bgmInit(); }
}
// Perintah Editor → layar videotron lewat Realtime broadcast (channel 'bgm-cmd'); layar menyimpan di localStorage-nya
function bgmCmdListen() {
  if (bgm.cmdCh || !supabase) return;
  try {
    bgm.cmdCh = supabase.channel('bgm-cmd').on('broadcast', { event: 'cmd' }, m => {
      const p = m.payload || {}; if (typeof p.on !== 'boolean') return;
      const c = { on: p.on, vol: bgmClamp(p.vol ?? 70), off: Array.isArray(p.off) ? p.off : [], track: bgmTrackOk(p.track) };
      bgmLocalSave(c); bgm.cfg = { ...bgm.cfg, ...c }; bgmTick();
    }).subscribe();
  } catch (e) { bgm.cmdCh = null; }
}
function bgmInit() {
  bgmCmdListen();
  const unlock = () => bgmResume();
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, unlock));
  setInterval(bgmTick, 400);
  if (BGM_YT_ID) bgmInitYt(); else bgmInitFile();
}
function bgmInitFile() {   // musik file lokal lewat Web Audio (gapless); tiap backsound punya gain sendiri → crossfade saat Editor mengganti lagu
  bgm.mode = 'file';
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  bgm.ctx = new AC(); bgm.trk = {};
  BGM_TRACKS.forEach(t => { const g = bgm.ctx.createGain(); g.gain.value = 0; g.connect(bgm.ctx.destination); bgm.trk[t.id] = { g, buf: null, src: null, loading: false, err: '' }; });
  bgm.gain = bgm.trk[BGM_TRACKS[0].id].g;
  bgmTrackLoad(bgm.cfg.track);
  setTimeout(() => BGM_TRACKS.forEach(t => bgmTrackLoad(t.id)), 15000);   // pramuat backsound lain agar ganti lagu instan
}
function bgmTrackLoad(id) {
  const T = bgm.trk?.[id], def = BGM_TRACKS.find(t => t.id === id); if (!T || !def || T.buf || T.loading) return;
  if (T.err && !(def.store && Date.now() > (T.retry || 0))) return;   // lagu privat yang belum diunggah dicoba lagi tiap 20 dtk
  T.loading = true; T.err = '';
  if (def.stream) {
    const el = new Audio(); el.loop = true; el.preload = 'auto'; el.src = def.src;
    el.addEventListener('canplay', () => { if (!T.buf) { T.buf = true; T.loading = false; bgmTick(); } }, { once: true });
    el.addEventListener('error', () => { T.err = 'file tidak termuat'; T.loading = false; console.warn('Backsound tidak termuat:', def.name); bgmTick(); }, { once: true });
    try { T.el = el; T.node = bgm.ctx.createMediaElementSource(el); T.node.connect(T.g); } catch (e) { T.err = String(e?.message || e); T.loading = false; }
    return;
  }
  bgmTrackUrl(def).then(u => fetch(u)).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then(b => new Promise((ok, no) => bgm.ctx.decodeAudioData(b, ok, no))).then(buf => { T.buf = buf; })
    .catch(e => { T.err = String(e?.message || e || 'gagal'); T.retry = Date.now() + 20000; console.warn('Backsound tidak termuat:', def.name, e); })
    .finally(() => { T.loading = false; bgmTick(); });
}
// Lagu aktif diputar dari awal saat dipilih (berulang); lagu lain di-fade out lalu dihentikan
function bgmTrackSync(active, playing) {
  const ctx = bgm.ctx; if (!ctx || !bgm.trk) return;
  if (playing && bgm.trk[active] && !bgm.trk[active].buf) bgmTrackLoad(active);
  Object.entries(bgm.trk).forEach(([id, T]) => {
    const want = playing && id === active && T.buf;
    if (T.el) {   // lagu stream: mulai dari awal saat dipilih, jeda 3 dtk setelah fade out
      if (want && !T.src) { clearTimeout(T.stopT); T.el.currentTime = 0; T.el.play().catch(() => {}); T.src = T.el; }
      if (!want && T.src) { T.src = null; T.stopT = setTimeout(() => { if (!T.src) T.el.pause(); }, 3000); }
      return;
    }
    if (want && !T.src) { const src = ctx.createBufferSource(); src.buffer = T.buf; src.loop = true; src.connect(T.g); src.start(); T.src = src; }
    if (!want && T.src) { try { T.src.stop(ctx.currentTime + 3); } catch (e) {} T.src = null; }
  });
}
function bgmInitYt() {   // musik dari YouTube lewat IFrame Player API (pemutar tampil kecil di pojok layar saat musik menyala)
  bgm.mode = 'yt'; bgm.ytVol = 0;
  const fail = () => { if (bgm.mode === 'yt' && !bgm.yt?.ready) { bgm.mode = 'file'; document.getElementById('qs-yt')?.remove(); bgmInitFile(); } };
  window.onYouTubeIframeAPIReady = () => {
    try {
      bgm.yt = { ready: false, p: new YT.Player('qs-yt-p', { width: 200, height: 200, videoId: BGM_YT_ID,
        playerVars: { controls: 0, loop: 1, playlist: BGM_YT_ID, playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1, fs: 0, origin: location.origin },
        events: { onReady: e => { bgm.yt.ready = true; e.target.setVolume(0); bgmTick(); }, onError: () => { bgm.yt.ready = false; fail(); } } }) };
    } catch (e) { fail(); }
  };
  const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; sc.onerror = fail; document.head.appendChild(sc);
  setTimeout(fail, 12000);   // internet / YouTube tak terjangkau → pakai musik file
}
function bgmResume() {
  if (bgm.mode === 'yt') { try { bgm.yt?.ready && bgm.yt.p.playVideo(); } catch (e) {} bgmTick(); return; }
  const T = bgm.trk?.[bgm.cfg.track]; if (T?.err) { T.err = ''; bgmTrackLoad(bgm.cfg.track); }
  bgm.ctx?.resume().then(bgmTick).catch(() => {});
}
function bgmTick() {
  const c = bgm.cfg, vid = !!document.getElementById('qs-video'), sceneOff = false, duck = vid && c.scene === 'testimoni', quiet = !c.on || sceneOff || c.scene === 'anthem' || c.scene === 'welcome' || c.raw === 'backdrop:' + WELCOME_BD || (vid && !duck);   // video testimoni: musik tetap jalan, volume dikecilkan agar suara dealer terdengar
  const label = BGM_KEYS.find(k => k[0] === c.scene)?.[2] || c.scene;
  let running = false;
  if (bgm.mode === 'yt') {
    const y = bgm.yt; if (!y?.ready) return;
    let st = -1; try { st = y.p.getPlayerState(); } catch (e) { return; }
    const tile = document.getElementById('qs-yt'), target = quiet ? 0 : c.vol * (duck ? 0.3 : 1);
    if (!quiet) {
      tile?.classList.add('on');
      if (st !== 1) { try { y.p.playVideo(); } catch (e) {} }
      bgm.ytVol += (target - bgm.ytVol) * 0.35;
    } else {
      bgm.ytVol *= 0.55;
      if (bgm.ytVol < 2 && st === 1) { try { y.p.pauseVideo(); } catch (e) {} }
      if (bgm.ytVol < 2) tile?.classList.remove('on');
    }
    try { y.p.setVolume(Math.round(bgm.ytVol)); } catch (e) {}
    running = st === 1 || st === 3 || quiet;   // quiet = tidak butuh diputar
  } else if (bgm.ctx) {
    const target = quiet ? 0 : Math.pow(c.vol / 100, 1.3) * (duck ? 0.3 : 1) * (Date.now() < (bgm.duckUntil || 0) ? 0.2 : 1);
    const act = bgmTrackOk(c.track), T = bgm.trk[act];
    if (!T.buf && !T.loading && !T.err) bgmTrackLoad(act);
    bgm.loading = T.loading; bgm.loadErr = T.err;
    bgmTrackSync(act, c.on);
    Object.entries(bgm.trk).forEach(([id, X]) => X.g.gain.setTargetAtTime(id === act ? target : 0, bgm.ctx.currentTime, 0.7));
    running = bgm.ctx.state === 'running';
  } else return;
  // status dilaporkan ke panel Editor (tidak ada tombol / tulisan musik di layar videotron)
  const bad = bgm.mode === 'file' && bgm.loadErr, wait = bgm.mode === 'file' && bgm.loading;
  const kind = !c.on ? 'mati' : bad ? 'gagal' : wait ? 'memuat' : !running ? 'klik' : (vid && !duck) ? 'video' : sceneOff ? 'senyap' : 'bunyi';
  bgmReport({ kind, scene: label, err: bgm.loadErr || '', mode: bgm.mode, cfg: { on: c.on, vol: c.vol, off: c.off, track: c.track } });
}
// Laporan status musik: layar videotron → panel Editor lewat Supabase Realtime broadcast (tanpa tabel / kolom baru)
let bgmCh = null, bgmLastSent = '', bgmLastAt = 0, bgmRemote = null, bgmWatch = null;
function bgmReport(st) {
  if (!supabase) return;
  const key = JSON.stringify(st), now = Date.now();
  if (key === bgmLastSent && now - bgmLastAt < 4000) return;
  try {
    if (!bgmCh) { bgmCh = supabase.channel('bgm-status'); bgmCh.subscribe(); }
    bgmCh.send({ type: 'broadcast', event: 'status', payload: st }); bgmLastSent = key; bgmLastAt = now;
  } catch (e) { /* abaikan */ }
}
function bgmWatchStart() {   // dipanggil di panel Editor: dengarkan laporan dari layar videotron
  if (bgmWatch || !supabase) return;
  try {
    bgmWatch = supabase.channel('bgm-status').on('broadcast', { event: 'status' }, m => { bgmRemote = { ...(m.payload || {}), at: Date.now() }; bgmShowStatus(); bgmRefreshBox(); })
      .on('broadcast', { event: 'vid' }, m => { qsVidRemote = { ...(m.payload || {}), at: Date.now() }; bgmShowStatus(); }).subscribe();
    setInterval(bgmShowStatus, 3000);
  } catch (e) { bgmWatch = null; }
}
function bgmShowStatus() {
  const el = document.getElementById('bgm-status'); if (!el) return;
  const r = bgmRemote, fresh = r && Date.now() - r.at < 12000;
  const T = { bunyi: ['ok', '🟢 Musik berbunyi di layar videotron'], video: ['ok', '🟢 Musik diam sementara — video sedang diputar'], senyap: ['warn', '🔇 Musik senyap di sesi ini' + (r?.scene ? ' (' + r.scene + ')' : '')],
    mati: ['warn', '⚪ Musik dimatikan'], memuat: ['warn', '⏳ Layar videotron sedang memuat file musik…'],
    klik: ['warn', '🟠 Layar videotron menunggu satu klik: klik di mana saja pada layar videotron (atau tekan tombol apa saja) agar browser mengizinkan suara'],
    gagal: ['bad', '🔴 File musik gagal dimuat di layar videotron' + (r?.err ? ' (' + r.err + ')' : '') + ' — muat ulang tab layar videotron'] };
  const [cls, txt] = fresh ? (T[r.kind] || ['warn', r.kind]) : ['warn', '⚪ Layar videotron tidak terdeteksi — buka lewat tombol 🖥 Buka Layar Videotron'];
  el.className = 'scr-bgm-status ' + cls; el.textContent = txt;
  const ve = document.getElementById('vid-status'); if (!ve) return;
  const v = qsVidRemote, vf = v && Date.now() - v.at < 15000;
  const [vc, vt] = !vf ? ['warn', '⚪ Unduhan video: layar videotron tidak terdeteksi']
    : v.done >= v.total ? ['ok', `✅ Semua video siap di komputer videotron (${v.done}/${v.total}) — diputar tanpa buffering`]
    : v.busy ? ['warn', `⬇ Mengunduh video ke komputer videotron… ${v.done}/${v.total} siap${v.cur ? ' · sedang: ' + v.cur : ''}`]
    : ['bad', `🔴 ${v.done}/${v.total} video siap — sebagian gagal diunduh; muat ulang tab layar videotron untuk mencoba lagi`];
  ve.className = 'scr-bgm-status ' + vc; ve.textContent = vt;
}
let qsVidRemote = null;
function bgmPanelHtml() {
  const has = isEditor(), cfg = bgmDisplayCfg(), on = cfg.on, vol = cfg.vol, off = cfg.off;
  if (isAdmin()) setTimeout(() => { bgmWatchStart(); bgmShowStatus(); }, 0);
  return `<div class="scr-bgm"><div class="scr-bgm-row"><b>🎵 Musik latar videotron</b>
      <button class="gt-btn ${on ? 'confirm' : 'ghost'}" onclick="bgmSave({ bgm_on: ${!on} })" ${has ? '' : 'disabled'}>${on ? '● Menyala' : '○ Mati'}</button>
      <label>Volume <input type="range" min="0" max="100" value="${vol}" oninput="this.nextElementSibling.textContent = this.value + '%'" onchange="bgmSave({ bgm_vol: +this.value })" ${has ? '' : 'disabled'}><span>${vol}%</span></label></div>
    <div class="scr-bgm-status warn" id="bgm-status">…</div>
    <div class="scr-bgm-status warn" id="vid-status">…</div>
    <div class="scr-bgm-k">🎼 <b>Backsound</b> — pilih lagu yang diputar (berganti dengan crossfade, mulai dari awal lagu):</div>
    <div class="scr-bgm-tracks">${BGM_TRACKS.map(t => `<button class="scr-bgm-track${cfg.track === t.id ? ' on' : ''}" onclick="bgmSave({ bgm_track: '${t.id}' })" ${has ? '' : 'disabled'}><b>${cfg.track === t.id ? '▶ ' : ''}${escHtml(t.name)}</b><span>${escHtml(t.sub)}</span></button>`).join('')}</div>
    ${isEditor() ? BGM_TRACKS.filter(t => t.store).map(t => `<div class="scr-actions" style="margin-top:8px"><label class="gt-btn ghost" style="cursor:pointer">⬆ Unggah / ganti lagu ${escHtml(t.name)}<input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav" hidden onchange="bgmUploadTrack('${t.id}', this)"></label><span class="scr-bgm-k" style="margin:0">disimpan privat (tidak di repo publik); layar videotron memuatnya otomatis ±20 dtk setelah diunggah</span></div>`).join('') : ''}
    <div class="scr-bgm-k">Musik tetap jalan saat layar berganti sesi; berhenti sementara hanya saat video layar penuh diputar.</div>
    ${isEditor() ? `<div class="scr-actions" style="margin-top:10px"><button class="gt-btn ghost" id="bgm-test-btn" onclick="bgmTestHere()">🔊 Tes musik di komputer ini</button><span class="scr-bgm-k" id="bgm-test-msg" style="margin:0"></span></div>` : ''}
    ${!isEditor() ? '<div class="scr-note">Hanya <b>Editor</b> yang bisa menyalakan / mematikan dan mengatur musik latar.</div>' : `<div class="scr-note">Musik <b>mati</b> sampai Editor menekan Menyala; setelah menyala, musik berbunyi di <b>semua sesi</b>. Pengaturan dikirim langsung ke layar videotron &amp; diingat di komputer itu. Opsional agar permanen lintas komputer: <button class="gt-btn ghost" onclick="bgmCopySql()">📋 Salin SQL</button></div>`}</div>`;
}
const BGM_SQL = "alter table public.gathering_screen\n  add column if not exists bgm_on boolean default false,\n  add column if not exists bgm_vol integer default 70,\n  add column if not exists bgm_off text,\n  add column if not exists bgm_track text;\nupdate public.gathering_screen set bgm_on = coalesce(bgm_on, false) where id = 1;";
function bgmCopySql() { (navigator.clipboard?.writeText(BGM_SQL) || Promise.reject()).then(() => showToast('✓ SQL disalin — tempel di Supabase → SQL Editor → Run.'), () => { prompt('Salin SQL ini:', BGM_SQL); }); }
// Tes musik di komputer ini (Editor): memastikan file musik termuat & terdengar di browser yang dipakai
let bgmTestAudio = null;
function bgmTestHere() {
  const msg = document.getElementById('bgm-test-msg'), btn = document.getElementById('bgm-test-btn');
  if (bgmTestAudio) { bgmTestAudio.pause(); bgmTestAudio = null; if (btn) btn.textContent = '🔊 Tes musik di komputer ini'; if (msg) msg.textContent = ''; return; }
  const def = BGM_TRACKS.find(t => t.id === bgmDisplayCfg().track) || BGM_TRACKS[0];
  if (def.store) { bgmTrackUrl(def).then(u => { const a = new Audio(u); a.volume = 0.6; bgmTestAudio = a; bgmTestPlay(a, msg, btn); }, e => { if (msg) msg.textContent = '⚠ ' + (e?.message || e); }); return; }
  const a = new Audio(def.src); a.volume = 0.6; bgmTestAudio = a; bgmTestPlay(a, msg, btn);
}
async function bgmUploadTrack(id, input) {
  const f = input.files?.[0]; input.value = ''; const def = BGM_TRACKS.find(t => t.id === id); if (!f || !def?.store) return;
  if (!/^audio\//i.test(f.type) && !/\.(mp3|m4a|aac|wav|ogg)$/i.test(f.name)) { showToast('Pilih file audio (MP3/M4A).'); return; }
  showToast(`Mengunggah lagu ${def.name}…`, 20000);
  const { error } = await supabase.storage.from(GUIDES_BUCKET).upload(def.store, f, { upsert: true, contentType: f.type || 'audio/mpeg', cacheControl: '10' });
  showToast(error ? 'Gagal mengunggah: ' + error.message : `✓ Lagu ${def.name} tersimpan — pilih di daftar Backsound untuk memutarnya.`, 9000);
}
function bgmTestPlay(a, msg, btn) {
  a.onended = () => { bgmTestAudio = null; if (btn) btn.textContent = '🔊 Tes musik di komputer ini'; };
  a.onerror = () => { bgmTestAudio = null; if (btn) btn.textContent = '🔊 Tes musik di komputer ini'; if (msg) msg.textContent = '⚠ File musik tidak bisa dimuat (' + (a.error?.message || 'format/jaringan') + ').'; };
  a.play().then(() => { if (btn) btn.textContent = '⏹ Hentikan tes'; if (msg) msg.textContent = 'Terdengar? Berarti file musik & suara komputer ini baik.'; setTimeout(() => { if (bgmTestAudio === a) bgmTestHere(); }, 20000); })
    .catch(e => { bgmTestAudio = null; if (msg) msg.textContent = '⚠ Tidak bisa diputar: ' + (e?.message || e); });
}
let bgmPending = null;   // pilihan Editor yang baru diklik: langsung tampil di panel sampai layar melapor nilai yang sama (maks. 15 dtk)
function bgmDisplayCfg() {   // yang ditampilkan di panel Editor: pilihan baru → laporan layar (segar) → baris DB → cadangan lokal → bawaan
  const r = bgmRemote, pd = bgmPending;
  if (pd && Date.now() < pd.until) {
    const rc = r && r.cfg && r.at > pd.at ? r.cfg : null;
    if (!rc || rc.on !== pd.cfg.on || bgmClamp(rc.vol) !== pd.cfg.vol || bgmTrackOk(rc.track) !== pd.cfg.track) return { ...pd.cfg, off: [] };
  }
  if (r && r.cfg && Date.now() - r.at < 12000) return { on: !!r.cfg.on, vol: bgmClamp(r.cfg.vol), off: r.cfg.off || [], track: bgmTrackOk(r.cfg.track) };
  if (scrRow && scrRow.bgm_on != null) return { on: scrRow.bgm_on !== false, vol: bgmClamp(scrRow.bgm_vol ?? 70), off: bgmOffList(scrRow), track: bgmTrackOk(scrRow.bgm_track || bgmLocal()?.track) };
  return bgmLocal() || bgmDefault();
}
function bgmRefreshBox() {
  const box = document.querySelector('.scr-bgm'), ae = document.activeElement;
  if (!box || !isEditor() || (ae && ae.tagName === 'INPUT' && box.contains(ae))) return;   // jangan ganggu slider volume yang sedang digeser; tombol yang baru diklik tidak menahan render ulang
  const t = document.createElement('div'); t.innerHTML = bgmPanelHtml(); box.replaceWith(t.firstElementChild); bgmShowStatus();
}
async function bgmSave(patch) {
  if (!supabase || !isEditor()) { showToast('Hanya Editor yang bisa mengatur musik latar.'); return; }
  const cur = bgmDisplayCfg(), c = { on: patch.bgm_on ?? cur.on, vol: bgmClamp(patch.bgm_vol ?? cur.vol), off: [], track: bgmTrackOk(patch.bgm_track ?? cur.track) };
  bgmLocalSave(c);
  bgmPending = { cfg: c, at: Date.now(), until: Date.now() + 15000 };
  bgmRefreshBox();   // tombol langsung berganti warna, tanpa menunggu jaringan
  try { const r = await supabase.from(QA_SCREEN).upsert({ id: 1, bgm_on: c.on, bgm_vol: c.vol, bgm_off: '' }); if (!r.error) scrRow = { ...scrRow, bgm_on: c.on, bgm_vol: c.vol, bgm_off: '' }; } catch (e) {}
  try { const r = await supabase.from(QA_SCREEN).upsert({ id: 1, bgm_track: c.track }); if (!r.error) scrRow = { ...scrRow, bgm_track: c.track }; } catch (e) {}   // kolom opsional bgm_track
  try {
    if (!bgm.sendCh) { bgm.sendCh = supabase.channel('bgm-cmd'); await new Promise(ok => { bgm.sendCh.subscribe(st => { if (st === 'SUBSCRIBED') ok(); }); setTimeout(ok, 3000); }); }
    await bgm.sendCh.send({ type: 'broadcast', event: 'cmd', payload: bgmPending?.cfg || c });   // selalu kirim pilihan terakhir (klik cepat beruntun tidak tertimpa nilai lama)
  } catch (e) { showToast('Perintah musik gagal dikirim ke layar videotron.', 6000); }
  bgmRefreshBox();
}
function bgmToggleSession(k) {
  const off = bgmDisplayCfg().off.slice(), i = off.indexOf(k);
  if (i < 0) off.push(k); else off.splice(i, 1);
  bgmSave({ bgm_off: off.join(',') });
}

async function qsLoad() {
  const st = document.getElementById('qs-status');
  try {
    let { data: s, error } = await supabase.from(QA_SCREEN).select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    // perintah lokal (offline) lebih baru dari database → tetap pakai yang lokal
    if (qsLocalAt && qsLocalRow && (!s || new Date(qsLocalRow.updated_at || 0) > new Date(s.updated_at || 0))) { qsRenderRow(qsLocalRow, qsLocalQ); return; }
    bgmApply(s);
    if (s?.scene && sceneInfo(s.scene)) { st.classList.remove('off'); renderScene(s); return; }
    let q = null;
    if (s?.question_id) {
      const r = await supabase.from(QA_TABLE).select('*').eq('id', s.question_id).maybeSingle();
      if (r.error) throw r.error;
      q = r.data;
    }
    st.classList.remove('off');
    renderQaScreen(q);
  } catch (e) { st.classList.add('off'); st.title = 'Koneksi bermasalah: ' + (e.message || e); }
}

function qsSetStage(key, html) {
  if (key === qsKey) return false;
  qsKey = key;
  stopLaunchVideo(); clearTimeout(qsBdTimer); clearTimeout(nbTimer); clearTimeout(nbVidTimer);
  if (!/^(fmslide|pks|bd)\|/.test(String(key))) document.getElementById('qs-slide')?.remove();
  document.getElementById('qs-stage').innerHTML = html;
  return true;
}

// Backdrop: foto/video layar penuh (latar blur). Satu backdrop = foto diam / video berulang; bergantian = foto 12 dtk, video sampai selesai.
// items = daftar lain dengan bentuk { t, src, id } (dipakai Flier: scene flier / flier:<n>)
function renderBackdrop(s, items) {
  const fl = !!items, all = items || BACKDROPS, n = fl ? flNum(s.scene) : bdNum(s.scene), list = (n ? [all[n - 1]] : all).filter(Boolean);
  if (!list.length) { qsSetStage('fl|none', `<div class="qs-idle"><p>${fl ? 'Belum ada flier — unggah di panel Layar videotron' : 'Backdrop'}</p></div>`); return; }
  if (!qsSetStage(['bd', s.scene, n ? '' : s.updated_at, fl ? list.map(b => b.id).join(',') : ''].join('|'), `<div class="qs-idle"><p>${fl ? 'Flier' : 'Backdrop'}</p></div>`)) return;
  clearTimeout(qsBdTimer);
  document.getElementById('qs-slide')?.remove();
  const ov = document.createElement('div'); ov.id = 'qs-slide'; ov.className = 'qs-slide qs-bd';
  const vidTag = b => `<video class="bd-fg" src="${qsVidCache[b.video] || b.video}" poster="${b.src}"${b.sound ? '' : ' muted'} playsinline preload="auto"${list.length === 1 ? ' loop' : ''}></video>`;
  // video bersuara (Partner Masuk) belum ada di memori → tampilkan posternya dulu, video diputar setelah selesai diunduh (anti buffering)
  const waiting = list.length === 1 && list[0].video && !qsVidCache[list[0].video];
  ov.innerHTML = list.map((b, i) => `<div class="bd-s" data-i="${i}"><img class="bd-bg" src="${b.src}" alt="">${b.video && !waiting
    ? vidTag(b) : `<img class="bd-fg" src="${b.src}" alt="${escHtml(b.t)}">`}</div>`).join('');
  if (waiting) qsFetchBlob(list[0].video).then(() => {
    const fg = ov.querySelector('.bd-fg'); if (!document.body.contains(ov) || !fg) return;
    fg.outerHTML = vidTag(list[0]); playBd(ov.querySelector('video.bd-fg'));
  });
  document.getElementById('qa-screen').appendChild(ov);
  ov.querySelectorAll('video.bd-fg').forEach(v => v.addEventListener('error', () => {   // video gagal → pakai gambar diamnya
    const img = document.createElement('img'); img.className = 'bd-fg'; img.src = v.poster; v.replaceWith(img);
  }));
  const show = i => {
    if (!document.body.contains(ov)) return;
    const slides = [...ov.children];
    slides.forEach((el, k) => el.classList.toggle('in', k === i));
    const v = slides[i].querySelector('video');
    const next = () => { if (list.length > 1) show((i + 1) % list.length); };
    if (v) { v.currentTime = 0; playBd(v); if (list.length > 1) { v.onended = next; qsBdTimer = setTimeout(next, 120000); } }   // batas aman 2 menit
    else if (list.length > 1) qsBdTimer = setTimeout(next, BACKDROP_SEC * 1000);
    slides.forEach((el, k) => { if (k !== i) el.querySelector('video')?.pause(); });
  };
  show(0);
}
// Flier: daftar dari Storage privat (di-cache 60 dtk), lalu tampil seperti backdrop
function renderFlier(s) {
  if (!flierCache) qsSetStage('fl|load', '<div class="qs-idle"><p>Memuat flier…</p></div>');
  flierList().then(L => { if (qsSceneNow === s.scene) renderBackdrop(s, L); })
    .catch(e => { if (qsSceneNow !== s.scene) return; qsSetStage('fl|err', `<div class="qs-idle"><p>Flier belum bisa dimuat (${escHtml(e.message || e)}).</p></div>`); qsKey = null; });
}
// ── Top Spender di videotron (28 Okt 2026, permintaan pemilik): scene 'topspender' ──
// Data = fungsi gathering_top_spenders (sama dengan tab Top Spender). renderScene() dipanggil tiap poll 4 dtk → data diambil ulang maks. tiap 5 dtk,
// ditambah realtime perubahan gathering_orders bila tabel ada di publication. Layar hanya digambar ulang bila angka berubah; baris yang berubah berkilau.
let tspData = null, tspAt = 0, tspBusy = false, tspCh = null, tspPrev = null, tspRow = null;
function renderTopSpender(s) {
  tspRow = s;
  const fetchNow = () => {
    if (tspBusy || !supabase) return; tspBusy = true; tspAt = Date.now();
    supabase.rpc('gathering_top_spenders', { lim: GT_TOP_FETCH }).then(({ data, error }) => {
      if (error) throw error;
      tspData = (data || []).map(r => ({ store: r.store || '-', city: r.city || '', total: Math.round(Number(r.total || 0) * GT_TOP_FACTOR) }));
      if (sceneBase(qsSceneNow) === 'topspender') tspPaint(tspRow || s);
    }).catch(e => { if (sceneBase(qsSceneNow) === 'topspender' && !tspData) { qsSetStage('tsp|err', `<div class="qs-idle"><p>Top Spender belum bisa dimuat (${escHtml(e.message || e)}).</p></div>`); qsKey = null; } })
      .finally(() => { tspBusy = false; });
  };
  if (!tspCh && supabase) {
    try { tspCh = supabase.channel('tsp-orders').on('postgres_changes', { event: '*', schema: 'public', table: GATHERING_ORDERS }, () => { if (sceneBase(qsSceneNow) === 'topspender') setTimeout(fetchNow, 700); }).subscribe(); } catch (e) { tspCh = null; }
  }
  if (tspData) tspPaint(s); else qsSetStage('tsp|load', '<div class="qs-idle"><p>Memuat Top Spender…</p></div>');
  if (!tspData || Date.now() - tspAt > 5000) fetchNow();
}
function tspPaint(s) {
  const L = tspData || [], key = 'tsp|' + (s.scene_text || '') + '|' + L.map(r => r.store + '=' + r.total).join(';');
  if (key === qsKey) return;
  const live = String(qsKey || '').startsWith('tsp|') && !/^tsp\|(load|err)/.test(qsKey);
  const prev = tspPrev || {}; tspPrev = Object.fromEntries(L.map((r, i) => [r.store, r.total + '#' + i]));
  const all = L.reduce((a, r) => a + r.total, 0), medal = ['🥇', '🥈', '🥉'];
  const n = Math.max(GT_TOP_PRIZES.length, Math.min(L.length, GT_TOP_HIGHLIGHT));
  const row = i => {
    const r = L[i], z = GT_TOP_PRIZES[i], chg = live && r && prev[r.store] !== r.total + '#' + i;
    return `<div class="tsp-row${i < 3 ? ' m' + (i + 1) : ''}${r ? '' : ' empty'}${chg ? ' chg' : ''}" style="--d:${(0.5 + i * 0.07).toFixed(2)}s">
      <div class="tsp-rk">${medal[i] || i + 1}</div>
      <div class="tsp-st"><b>${r ? escHtml(r.store) : 'Belum terisi'}</b></div>
      <div class="tsp-tot">${r ? fmtRp(r.total) : '–'}</div>
      <small class="tsp-pz">${r && r.city ? `<span>${escHtml(r.city)}</span>` : ''}${z ? `Hadiah: <em>${escHtml(z.p)}</em> · ${escHtml(z.b)}${z.v ? ' · ' + escHtml(z.v) : ''}` : ''}</small></div>`;
  };
  const rest = L.slice(n), tick = rest.map((r, i) => `<span><em>${n + i + 1}</em>${escHtml(r.store)}${r.city ? ' · ' + escHtml(r.city) : ''} <b>${fmtRp(r.total)}</b></span>`).join('');
  const html = `<div class="qs-scene tsp${live ? ' live' : ''}"><div class="tsp-bg"><i></i><i></i></div>
    <div class="tsp-head">
      <img src="${LOGO_WHITE}" alt="CAI">
      <div class="tsp-ttl"><div class="tsp-kick">Shopping Gathering CAI 2026</div><h1>Top <em>Spender</em></h1>${s.scene_text ? `<p>${escHtml(s.scene_text)}</p>` : ''}</div>
      <div class="tsp-sum"><div class="tsp-cd gt-cd" data-gtcd="short">${gtCdText(true).html}</div><div class="tsp-live"><i></i>Live</div><b>${L.length} toko</b><span>Total ${fmtRp(all)}</span></div>
    </div>
    <div class="tsp-grid">${Array.from({ length: n }, (_, i) => row(i)).join('')}</div>
    <div class="tsp-foot"><div class="tsp-rest">Peringkat ${n + 1} dst. · hadiah <b>${escHtml(GT_TOP_PRIZE_REST)}</b></div>
      ${rest.length ? `<div class="tsp-tick"><div style="--t:${Math.max(20, rest.length * 5)}s">${tick}${tick}</div></div>` : '<div class="tsp-tick empty">Belum ada peringkat 11 ke bawah</div>'}</div>
  </div>`;
  qsSetStage(key, html);
}
function qsSetEventSub(base) {
  const el = document.getElementById('qs-event-sub'); if (!el) return;
  el.textContent = !base || base === 'qa' ? 'Meeting Dealer · Tanya Jawab Partner CAI' : (QS_SCENES[base]?.label || '');
}
function renderQaScreen(q) {
  qsSceneNow = null;
  qsSetEventSub(null);
  if (!q) {
    qsSetStage('idle', `<div class="qs-idle"><div class="qs-kicker">Tanya Jawab Partner CAI</div><h1>Meeting <em>Dealer</em></h1>
      <p>Sampaikan pertanyaan, usul &amp; unek-unek Anda kepada tim Concerto Audio Indonesia</p></div>`);
    return;
  }
  const len = q.question.length, ans = q.answer_shown && q.answer ? q.answer : '';
  // tanpa jawaban: pertanyaan memenuhi layar; dengan jawaban: pertanyaan mengecil, jawaban di bawahnya
  const size = !ans
    ? (len <= 60 ? 'min(5.6vw, 10vh)' : len <= 120 ? 'min(4.6vw, 8.2vh)' : len <= 200 ? 'min(3.8vw, 6.8vh)' : len <= 320 ? 'min(3.1vw, 5.6vh)' : 'min(2.5vw, 4.6vh)')
    : (len <= 80 ? 'min(3.4vw, 6vh)' : len <= 180 ? 'min(2.8vw, 5vh)' : 'min(2.2vw, 4vh)');
  const alen = ans.length;
  const asize = alen <= 120 ? 'min(3.3vw, 5.8vh)' : alen <= 260 ? 'min(2.7vw, 4.8vh)' : alen <= 450 ? 'min(2.2vw, 3.9vh)' : 'min(1.8vw, 3.2vh)';
  qsSetStage(['q', q.id, q.question, q.dealer, q.city, ans].join('|'), `<div class="qs-q${ans ? ' has-ans' : ''}"><div class="qs-kicker">Pertanyaan dari</div>
    <div class="qs-who">${escHtml(q.dealer || 'Dealer')}${q.city ? `<small>${escHtml(q.city)}</small>` : ''}</div>
    <p class="qs-quote" style="font-size:${size}">${escHtml(q.question)}</p>
    ${ans ? `<div class="qs-ans"><div class="qs-kicker">Jawaban CAI</div><p style="font-size:${asize}">${escHtml(ans)}</p></div>` : ''}</div>`);
}
