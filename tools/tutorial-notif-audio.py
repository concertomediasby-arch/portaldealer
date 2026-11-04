"""Audio video tutorial "Aktifkan Notifikasi CAI Hub" (tutorial-notifikasi.html, 4 Nov 2026).

Musik = assets/audio/portal-music.mp3 (buatan sendiri, bebas royalti) + efek suara sintetis:
ketukan jari (TAPS), denting (POPS), whoosh pindah adegan (SWISH), "ting" notifikasi masuk (TINGS).
Waktu efek dibaca dari halaman (window.TAPS/POPS/SWISH/TINGS) lewat file JSON:

  node -e "..."  → times.json  (lihat CLAUDE.md)   lalu   python3 tools/tutorial-notif-audio.py times.json out.wav
"""
import json, subprocess, sys, wave
import numpy as np

SR = 44100
T = json.load(open(sys.argv[1]))
out = sys.argv[2] if len(sys.argv) > 2 else 'tutorial-notif-audio.wav'
DUR = float(T.get('DUR', 60))
n = int(SR * DUR)

raw = subprocess.run(['ffmpeg', '-v', 'error', '-stream_loop', '-1', '-i', 'assets/audio/portal-music.mp3', '-t', str(DUR), '-f', 's16le', '-ac', '2', '-ar', str(SR), '-'],
                     capture_output=True, check=True).stdout
mus = np.frombuffer(raw, np.int16).reshape(-1, 2).astype(np.float32) / 32768
mus = np.pad(mus, ((0, max(0, n - len(mus))), (0, 0)))[:n] * 0.55
t = np.arange(n) / SR
mus *= (np.clip(t / 1.2, 0, 1) * np.clip((DUR - t) / 2.5, 0, 1))[:, None]

fx = np.zeros(n, np.float32)
rng = np.random.default_rng(3)
def add(at, sig):
    i = int(at * SR); j = min(n, i + len(sig)); fx[i:j] += sig[:j - i]

for at in T['TAPS']:      # ketukan lembut
    tt = np.arange(int(.09 * SR)) / SR
    add(at, 0.5 * np.sin(2 * np.pi * 1350 * tt) * np.exp(-tt * 60) + 0.25 * rng.standard_normal(len(tt)) * np.exp(-tt * 300))
for at in T['POPS']:      # denting naik dua nada
    for k, f in enumerate([1318.5, 1975.5]):
        tt = np.arange(int(.9 * SR)) / SR
        add(at + k * .11, 0.28 * (np.sin(2 * np.pi * f * tt) + .3 * np.sin(2 * np.pi * f * 2 * tt)) * np.exp(-tt * 5))
for at in T['TINGS']:     # notifikasi masuk: dua nada pendek turun
    for k, f in enumerate([1760.0, 1318.5]):
        tt = np.arange(int(.5 * SR)) / SR
        add(at + k * .09, 0.24 * (np.sin(2 * np.pi * f * tt) + .25 * np.sin(2 * np.pi * f * 3 * tt)) * np.exp(-tt * 9))
for at in T['SWISH']:     # whoosh
    L = int(.6 * SR); tt = np.arange(L) / SR
    nz = rng.standard_normal(L); sm = np.convolve(nz, np.ones(18) / 18, 'same')
    add(max(0, at - .2), 0.22 * (nz - sm) * np.sin(np.pi * tt / tt[-1]) ** 2)

mix = mus + fx[:, None]
mix /= max(1.0, np.abs(mix).max() / .95)
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('ok', out)
