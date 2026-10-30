#!/usr/bin/env python3
"""Musik latar portal (pop-lounge ceria, 100 BPM, nada mayor) — sintetis buatan sendiri, tanpa sample / hak cipta pihak lain.
Menggantikan versi lounge minor (tools/backsound.py) yang terasa "spooky" (30 Okt 2026, permintaan pemilik).
Loop mulus: semua nada & reverb ditempatkan melingkar.
Pakai:  python3 tools/portal-music.py music.wav  →
        ffmpeg -i music.wav -af loudnorm=I=-18:TP=-2 -c:a libmp3lame -b:a 128k assets/audio/portal-music.mp3"""
import numpy as np, wave, sys

SR = 44100
BPM = 100.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
BARS = 40
DUR = BARS * BAR
N = int(round(DUR * SR))
rng = np.random.default_rng(7)

def midi(m): return 440.0 * 2 ** ((m - 69) / 12.0)
def tarr(d): return np.arange(int(d * SR)) / SR

dry = np.zeros((2, N))
def place(sig, t0, gain=1.0, pan=0.0):
    i = int(round(t0 * SR)) % N; j = i + len(sig)
    a = sig * gain
    l, r = (1 - max(0, pan)) * 0.7071, (1 + min(0, pan)) * 0.7071
    for ch, k in ((0, l), (1, r)):
        if j <= N: dry[ch, i:j] += a * k
        else:
            m = N - i; dry[ch, i:N] += a[:m] * k; dry[ch, 0:j - N] += a[m:] * k

def keys(m, d=0.9):                 # piano elektrik cerah, tanpa tremolo
    t = tarr(d); f = midi(m)
    s = (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) * np.exp(-t * 4)
         + 0.15 * np.sin(6 * np.pi * f * t) * np.exp(-t * 8))
    return s * np.minimum(1, t / 0.004) * np.exp(-t * 3.2) * np.minimum(1, (d - t) / 0.05)
def pluck(m, d=0.35):               # gitar/pluck pendek untuk ritme
    t = tarr(d); f = midi(m)
    s = sum(np.sin(2 * np.pi * f * h * t) / h * np.exp(-t * (6 + 5 * h)) for h in (1, 2, 3, 4))
    return s * np.minimum(1, t / 0.002) * np.minimum(1, (d - t) / 0.03)
def pad(notes, d):
    t = tarr(d); out = np.zeros_like(t)
    for m in notes:
        f = midi(m)
        for det in (-0.06, 0.06):
            out += np.sin(2 * np.pi * f * 2 ** (det / 12) * t) / 2
    a = np.minimum(1, t / 0.3); r = np.minimum(1, (d - t) / 0.3)
    return out * a * r / len(notes)
def bass(m, d):
    t = tarr(d); f = midi(m)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t * 6)) * np.minimum(1, t / 0.008) * np.exp(-t * 2.2) * np.minimum(1, (d - t) / 0.04)
def kick(d=0.3):
    t = tarr(d); ph = 2 * np.pi * np.cumsum(52 + 90 * np.exp(-t * 35)) / SR
    return np.sin(ph) * np.exp(-t * 14)
def hat(d=0.06, acc=1.0):
    t = tarr(d); n = rng.standard_normal(len(t)); n = n - np.concatenate([[0], n[:-1]])
    return n * np.exp(-t * 90) * 0.06 * acc
def clap(d=0.18):
    t = tarr(d); n = rng.standard_normal(len(t))
    env = np.exp(-t * 30) + 0.6 * np.exp(-np.maximum(0, t - 0.012) * 30) * (t > 0.012)
    n = n - np.concatenate([[0], n[:-1]])
    return n * env * 0.10

# D mayor: D – A – Bm – G (I–V–vi–IV), tiap akor 1 birama
CH = [
    dict(root=38, pad=[62, 66, 69, 73], arp=[66, 69, 73, 74, 78]),   # Dmaj7
    dict(root=45, pad=[61, 64, 69, 73], arp=[64, 69, 73, 76, 78]),   # A(add9)
    dict(root=47, pad=[62, 66, 69, 71], arp=[66, 69, 71, 74, 78]),   # Bm7
    dict(root=43, pad=[62, 66, 67, 71], arp=[66, 67, 71, 74, 79]),   # Gmaj7
]
ARP = [0, 2, 4, 2, 1, 3, 4, 3]
MEL = {  # melodi riang (nada, ketukan mulai, panjang ketukan) per akor
    0: [(78, 0, 1), (76, 1, .5), (74, 1.5, .5), (76, 2, 1.5)],
    1: [(73, 0, 1), (74, .99, .5), (76, 1.5, 1), (69, 3, 1)],
    2: [(74, 0, 1), (73, 1, .5), (71, 1.5, .5), (73, 2, 1.5)],
    3: [(71, 0, 1), (74, 1, 1), (79, 2, 1), (78, 3, 1)],
}
for b in range(BARS):
    c = CH[b % 4]; t0 = b * BAR; sec = b // 8           # 5 bagian × 8 birama
    place(pad(c['pad'], BAR), t0, 0.16)
    for k in range(8):                                   # arpeggio piano 8th note
        place(keys(c['arp'][ARP[k]]), t0 + k * BEAT / 2, 0.16 * (1.0 if k % 2 == 0 else 0.75), -0.3 + 0.6 * (k % 4) / 3)
    if sec >= 1:
        for k in (1, 3):                                 # pluck di ketukan lemah (rasa "skank" pop)
            for m in c['pad'][:3]: place(pluck(m + 12), t0 + k * BEAT + BEAT / 2, 0.06, 0.35)
        bl = [(0, 1.5, 0), (1.5, 0.5, 0), (2, 1, 7), (3, 0.5, 12), (3.5, 0.5, 7)]
        for st, ln, iv in bl: place(bass(c['root'] + iv, ln * BEAT * 0.95), t0 + st * BEAT, 0.55)
        for k in range(4): place(kick(), t0 + k * BEAT, 0.42 if k % 2 == 0 else 0.30)
        for k in range(8): place(hat(acc=1.3 if k % 2 else 0.7), t0 + k * BEAT / 2, 0.9, 0.25)
        place(clap(), t0 + BEAT, 0.9, -0.1); place(clap(), t0 + 3 * BEAT, 0.9, -0.1)
    if sec in (2, 4):                                    # melodi utama
        for m, st, ln in MEL[b % 4]: place(keys(m, ln * BEAT + 0.4), t0 + st * BEAT, 0.24, 0.1)

def make_ir(seed, d=1.1):                                # ruang kecil & pendek (bukan gema panjang)
    r = np.random.default_rng(seed); n = int(d * SR); t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t * 5.5)
    ir = np.convolve(ir, np.ones(4) / 4, mode='same')
    return ir / np.sqrt(np.sum(ir ** 2))
wet = np.zeros_like(dry)
for ch in (0, 1):
    wet[ch] = np.fft.irfft(np.fft.rfft(dry[ch]) * np.fft.rfft(make_ir(5 + ch), N), N)
mix = dry * 0.9 + wet * 0.22
F = np.fft.rfftfreq(N, 1 / SR); lp = 1 / (1 + (F / 12000) ** 4)
mix = np.stack([np.fft.irfft(np.fft.rfft(mix[c]) * lp, N) for c in (0, 1)])
mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.85
out = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print(f'{DUR:.1f} dtk, {BARS} birama @ {BPM:.0f} BPM')
