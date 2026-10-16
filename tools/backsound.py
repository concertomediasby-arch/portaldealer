#!/usr/bin/env python3
"""Musik latar (lounge santai, 88 BPM) sintetis untuk layar videotron Gathering CAI — tanpa sample / hak cipta pihak lain.
Loop mulus: reverb dihitung dengan konvolusi sirkular, jadi ujung & awal file menyambung.
Pakai:  python3 tools/backsound.py backsound.wav  →  ffmpeg -i backsound.wav -af loudnorm=I=-17:TP=-2 -c:a libmp3lame -b:a 160k assets/audio/backsound.mp3"""
import numpy as np, wave, sys

SR = 44100
BPM = 88.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
BARS = 48
DUR = BARS * BAR
N = int(round(DUR * SR))
rng = np.random.default_rng(11)

def midi(m): return 440.0 * 2 ** ((m - 69) / 12.0)
def tarr(d): return np.arange(int(d * SR)) / SR

dry = np.zeros((2, N))
def place(sig, t0, gain=1.0, pan=0.0):
    i = int(round(t0 * SR)) % N; j = i + len(sig)
    a = sig * gain
    l, r = (1 - max(0, pan)) * 0.7071, (1 + min(0, pan)) * 0.7071
    for ch, k in ((0, l), (1, r)):               # melingkar: ekor nada melewati akhir file kembali ke awal
        if j <= N: dry[ch, i:j] += a * k
        else:
            m = N - i; dry[ch, i:N] += a[:m] * k; dry[ch, 0:j - N] += a[m:] * k

def epiano(m, d=1.4):
    t = tarr(d); f = midi(m)
    s = (np.sin(2 * np.pi * f * t) + 0.38 * np.sin(4 * np.pi * f * t) * np.exp(-t * 3.5)
         + 0.12 * np.sin(6 * np.pi * f * t) * np.exp(-t * 6) + 0.5 * np.sin(2 * np.pi * f * 0.5 * t) * np.exp(-t * 4))
    bell_ = 0.18 * np.sin(2 * np.pi * f * 7 * t) * np.exp(-t * 28)
    trem = 1 + 0.10 * np.sin(2 * np.pi * 4.6 * t)
    return (s + bell_) * np.minimum(1, t / 0.006) * np.exp(-t * 2.3) * trem
def pad(notes, d):
    t = tarr(d); out = np.zeros_like(t)
    for m in notes:
        f = midi(m)
        for det in (-0.10, 0.0, 0.12):
            ff = f * 2 ** (det / 12)
            out += (np.sin(2 * np.pi * ff * t) + 0.25 * np.sin(4 * np.pi * ff * t + .6)) / 3
    a = np.minimum(1, t / (BAR * 0.45)); r = np.minimum(1, (d - t) / (BAR * 0.5))
    return out * a * r / len(notes)
def bass(m, d):
    t = tarr(d); f = midi(m)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) * np.exp(-t * 5)) * np.minimum(1, t / 0.012) * np.exp(-t * 1.4) * np.minimum(1, (d - t) / 0.08)
def kick(d=0.4):
    t = tarr(d); ph = 2 * np.pi * np.cumsum(48 + 70 * np.exp(-t * 30)) / SR
    return np.sin(ph) * np.exp(-t * 11)
def brush(d=0.14, acc=1.0):
    t = tarr(d); n = rng.standard_normal(len(t)); n = n - np.concatenate([[0], n[:-1]])
    return n * np.exp(-t * 38) * 0.05 * acc
def rim(d=0.1):
    t = tarr(d); return (np.sin(2 * np.pi * 1700 * t) * 0.5 + rng.standard_normal(len(t)) * 0.25) * np.exp(-t * 55) * 0.08

# Am9 – Fmaj9 – Cmaj7 – G6, tiap akor 1 birama (siklus 4 birama × 12)
CH = [
    dict(root=45, pad=[57, 60, 64, 67, 71], arp=[64, 67, 71, 72, 76]),
    dict(root=41, pad=[53, 57, 60, 64, 67], arp=[60, 64, 67, 69, 72]),
    dict(root=48, pad=[52, 55, 59, 64, 67], arp=[64, 67, 71, 72, 76]),
    dict(root=43, pad=[55, 59, 62, 64, 67], arp=[62, 67, 71, 74, 76]),
]
ARP_PAT = [0, 2, 1, 3, 2, 4, 3, 1]   # urutan nada arpeggio per 8th note
for b in range(BARS):
    c = CH[b % 4]; t0 = b * BAR
    sec = b // 4                      # 12 bagian × 4 birama
    place(pad(c['pad'], BAR * 1.25), t0 - BAR * 0.12, 0.30, 0.0)
    if sec >= 1 and sec not in (11,):  # piano arpeggio (kecuali birama penutup agar loop mulus)
        for k in range(8):
            if sec % 3 == 2 and k in (3, 7): continue       # variasi: ada jeda
            idx = ARP_PAT[k] if sec % 2 == 0 else ARP_PAT[(k + 3) % 8]
            m = c['arp'][idx] + (0 if sec < 7 else 0)
            place(epiano(m), t0 + k * BEAT / 2 + rng.uniform(0, 0.012), 0.22 * (0.8 + 0.2 * (k % 2 == 0)), -0.25 + 0.5 * (k % 3) / 2)
    if sec >= 2 and sec != 11:         # bass: akar tiap birama + nada kelima di tengah
        place(bass(c['root'], BEAT * 1.9), t0, 0.62)
        place(bass(c['root'] + (7 if sec % 2 else 0), BEAT * 1.4), t0 + 2.5 * BEAT, 0.42)
    if sec >= 3 and sec != 11:         # perkusi lembut
        place(kick(), t0, 0.40); place(kick(), t0 + 2 * BEAT, 0.28)
        for k in range(8): place(brush(acc=1.4 if k % 2 else 0.8), t0 + k * BEAT / 2, 0.8, 0.2)
        place(rim(), t0 + 1 * BEAT, 0.8); place(rim(), t0 + 3 * BEAT, 0.8)
    if sec in (5, 8) and b % 4 == 0:   # melodi lembut di bagian tengah
        mel = [76, 74, 72, 71, 67, 71, 72, 74]
        for k, m in enumerate(mel):
            if k % 2 == 0: place(epiano(m + 0, 2.0), t0 + k * BEAT * 0.5, 0.26, 0.3)

# reverb stereo: konvolusi sirkular dengan impuls eksponensial (loop tetap mulus)
def make_ir(seed, d=2.6):
    r = np.random.default_rng(seed); n = int(d * SR); t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t * 2.4)
    ir = np.convolve(ir, np.ones(6) / 6, mode='same')                       # redam frekuensi tinggi
    return ir / np.sqrt(np.sum(ir ** 2))
wet = np.zeros_like(dry)
for ch in (0, 1):
    X = np.fft.rfft(dry[ch]); IR = np.fft.rfft(make_ir(31 + ch), N)
    wet[ch] = np.fft.irfft(X * IR, N)
mix = dry * 0.78 + wet * 0.55
# lowpass lembut (FFT) agar hangat
F = np.fft.rfftfreq(N, 1 / SR); lp = 1 / (1 + (F / 7500) ** 4)
mix = np.stack([np.fft.irfft(np.fft.rfft(mix[c]) * lp, N) for c in (0, 1)])
mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.85
out = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'backsound.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print(f'{DUR:.1f} dtk, {BARS} birama @ {BPM:.0f} BPM')
