"""Audio video tutorial Layar Utama (tutorial-homescreen.html).

Musik = assets/audio/portal-music.mp3 (musik lounge buatan sendiri, bebas royalti) + efek suara sintetis:
ketukan jari (TAPS), denting saat ikon muncul (POPS), whoosh saat pindah adegan (SWISH).
Waktu efek harus sama dengan TAPS / POPS / waktu scene() di tutorial-homescreen.html.

  python3 tools/tutorial-audio.py out.wav
"""
import subprocess, sys, wave
import numpy as np

SR, DUR = 44100, 56.0
TAPS = [11.0, 15.4, 19.0, 30.8, 35.2, 38.8, 46.6]
POPS = [20.2, 40.0]
SWISH = [5.0, 24.8, 44.4, 51.0]
out = sys.argv[1] if len(sys.argv) > 1 else 'tutorial-audio.wav'
n = int(SR * DUR)

raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'assets/audio/portal-music.mp3', '-t', str(DUR), '-f', 's16le', '-ac', '2', '-ar', str(SR), '-'],
                     capture_output=True, check=True).stdout
mus = np.frombuffer(raw, np.int16).reshape(-1, 2).astype(np.float32) / 32768
mus = np.pad(mus, ((0, max(0, n - len(mus))), (0, 0)))[:n] * 0.6
t = np.arange(n) / SR
env = np.clip(t / 1.2, 0, 1) * np.clip((DUR - t) / 2.5, 0, 1)
mus *= env[:, None]

fx = np.zeros(n, np.float32)
rng = np.random.default_rng(3)
def add(at, sig):
    i = int(at * SR); j = min(n, i + len(sig)); fx[i:j] += sig[:j - i]

for at in TAPS:           # ketukan lembut: sinus pendek + klik noise
    tt = np.arange(int(.09 * SR)) / SR
    s = 0.5 * np.sin(2 * np.pi * 1350 * tt) * np.exp(-tt * 60) + 0.25 * rng.standard_normal(len(tt)) * np.exp(-tt * 300)
    add(at, s)
for at in POPS:           # denting naik dua nada
    for k, f in enumerate([1318.5, 1975.5]):
        tt = np.arange(int(.9 * SR)) / SR
        s = 0.28 * (np.sin(2 * np.pi * f * tt) + .3 * np.sin(2 * np.pi * f * 2 * tt)) * np.exp(-tt * 5)
        add(at + k * .11, s)
for at in SWISH:          # whoosh: noise yang di-filter naik-turun
    L = int(.6 * SR); tt = np.arange(L) / SR
    nz = rng.standard_normal(L); sm = np.convolve(nz, np.ones(18) / 18, 'same')
    s = 0.22 * (nz - sm) * np.sin(np.pi * tt / tt[-1]) ** 2
    add(at - .2, s)

mix = mus + fx[:, None]
mix /= max(1.0, np.abs(mix).max() / .95)
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('ok', out)
