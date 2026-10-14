#!/usr/bin/env python3
"""Musik latar + efek suara sintetis untuk video 40 detik Portal Dealer Concerto (tanpa sample / hak cipta pihak lain)."""
import numpy as np, wave, sys

SR = 44100
DUR = 40.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
BPM = 120.0
BEAT = 60.0 / BPM

def tarr(d): return np.arange(int(SR * d)) / SR
def env_ad(n, a, d_tc):   # attack linear, decay exponential
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d_tc)
    return e
def midi(m): return 440.0 * 2 ** ((m - 69) / 12.0)

def place(buf, sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N or i + len(sig) <= 0: return
    j = min(N, i + len(sig)); sig = sig[:j - i] * gain
    l, r = (1 - max(0, pan)), (1 + min(0, pan))
    buf[0, i:j] += sig * l * 0.7071; buf[1, i:j] += sig * r * 0.7071

def lp_onepole(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for k in range(len(x)): s = (1 - a) * x[k] + a * s; y[k] = s
    return y

# ── bunyi dasar ──
def kick(d=0.45):
    t = tarr(d); f = 45 + 110 * np.exp(-t * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9) * 1.0 + np.sin(ph * 0.5) * np.exp(-t * 14) * 0.3
def clap(d=0.25):
    t = tarr(d); n = rng.standard_normal(len(t)); n = n - np.concatenate([[0], n[:-1]]) * 0.9  # highpass kasar
    e = np.exp(-t * 28) + 0.6 * np.exp(-np.maximum(0, t - 0.012) * 40) * (t > 0.012)
    return n * e * 0.32
def hat(d=0.08, open_=False):
    t = tarr(d * (3 if open_ else 1)); n = rng.standard_normal(len(t)); n = n - np.concatenate([[0], n[:-1]])
    return n * np.exp(-t * (30 if open_ else 90)) * 0.13
def bass_note(f, d):
    t = tarr(d); e = np.minimum(1, t / 0.01) * np.exp(-t * 3.2) * (t < d - 0.02)
    return (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) * np.exp(-t * 6) + 0.2 * np.sin(6 * np.pi * f * t) * np.exp(-t * 9)) * e
def pad_chord(notes, d, vol=1.0):
    t = tarr(d); out = np.zeros_like(t)
    for m in notes:
        f = midi(m)
        for det in (-0.12, 0.0, 0.14):
            ff = f * 2 ** (det / 12)
            out += (np.sin(2 * np.pi * ff * t) + 0.35 * np.sin(4 * np.pi * ff * t + 0.5) + 0.15 * np.sin(6 * np.pi * ff * t)) * (1 / 3)
    a = np.minimum(1, t / 1.6); r = np.minimum(1, (d - t) / 1.2)
    return out * a * r * vol / len(notes)
def pluck(m, d=0.6):
    t = tarr(d); f = midi(m)
    s = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(4 * np.pi * f * t) * np.exp(-t * 14) + 0.25 * np.sin(6 * np.pi * f * t) * np.exp(-t * 20)
    return s * np.minimum(1, t / 0.004) * np.exp(-t * 7)
def bell(m, d=1.6):
    t = tarr(d); f = midi(m)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 2.2) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 4.5) + 0.3 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 7)
    return s * np.minimum(1, t / 0.003)

def sweep_noise(d, f0, f1, q_bw=0.5, rising_env=True):
    """whoosh: noise di-bandpass dengan frekuensi tengah menyapu f0→f1 (STFT blok)."""
    n = int(SR * d); noise = rng.standard_normal(n + 4096); blk, hop = 2048, 512
    out = np.zeros(n + 4096); win = np.hanning(blk); freqs = np.fft.rfftfreq(blk, 1 / SR)
    for i in range(0, n, hop):
        p = i / n; fc = f0 * (f1 / f0) ** p; seg = noise[i:i + blk] * win
        S = np.fft.rfft(seg); mask = np.exp(-0.5 * ((np.log2(np.maximum(freqs, 1) / fc)) / q_bw) ** 2)
        out[i:i + blk] += np.fft.irfft(S * mask, blk) * win
    out = out[:n] / (np.max(np.abs(out)) + 1e-9)
    t = np.arange(n) / n
    e = (np.sin(np.pi * t ** (0.6 if rising_env else 1.6))) ** 1.5
    return out * e

def riser(d, f0=200, f1=3000):
    n = int(SR * d); t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / d); ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * 0.4 + sweep_noise(d, f0 * 2, f1 * 2, 0.9) * 0.6
    return s * (t / d) ** 2.2

def reverb(sig2, d=2.2, wet=0.28):
    n = int(SR * d); t = np.arange(n) / SR
    ir = rng.standard_normal((2, n)) * np.exp(-t * 2.6); ir[:, :int(0.012 * SR)] *= 0
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    L = sig2.shape[1] + n; nfft = 1 << int(np.ceil(np.log2(L)))
    out = np.zeros_like(sig2)
    for c in range(2):
        out[c] = np.fft.irfft(np.fft.rfft(sig2[c], nfft) * np.fft.rfft(ir[c], nfft), nfft)[:sig2.shape[1]]
    return sig2 * (1 - wet) + out * wet * 2.2

# ═══════ MUSIK ═══════
music = np.zeros((2, N))
# progresi: Am – F – C – G (tiap 4 ketukan = 2 dtk)
CH = [[57, 60, 64], [53, 57, 60], [48, 55, 60, 64], [55, 59, 62]]
ROOT = [33, 29, 36, 31]   # bass (A1, F1, C2, G1)
ARP = [[69, 72, 76, 72], [65, 69, 72, 69], [72, 76, 79, 76], [67, 71, 74, 71]]
bars = int(DUR / (4 * BEAT))   # 20 bar
for b in range(bars):
    t0 = b * 4 * BEAT; c = b % 4
    sec_full = t0 >= 8.0 and t0 < 36.0
    place(music, pad_chord(CH[c], 4 * BEAT + 0.8, 0.9 if t0 < 8 else 0.7), t0, 0.5)
    # bass: ketukan 1 & "dan" ketukan 3 — mulai 8 dtk
    if t0 >= 7.9 and t0 < 36.0:
        for k, (off, dd) in enumerate([(0, 0.9), (1.5, 0.45), (2.0, 0.9), (3.5, 0.4)]):
            place(music, bass_note(midi(ROOT[c]) * (1 if k != 3 else 1.5), dd), t0 + off * BEAT, 0.55)
    # arpeggio: mulai 4 dtk, makin rapat setelah 24 dtk
    if t0 >= 3.9 and t0 < 38.0:
        step = BEAT / 2 if t0 >= 16 else BEAT
        k = 0; tt = t0
        while tt < t0 + 4 * BEAT - 1e-6:
            place(music, pluck(ARP[c][k % 4] + (12 if t0 >= 24 and k % 8 == 5 else 0), 0.5), tt, 0.16 if t0 < 16 else 0.2, pan=0.35 * (1 if k % 2 else -1))
            tt += step; k += 1
    # drum
    if t0 >= 8.0 and t0 < 36.0:
        for beat in range(4):
            tb = t0 + beat * BEAT
            place(music, kick(), tb, 0.85)
            if t0 >= 8.0:
                place(music, hat(), tb + BEAT / 2, 0.55 if beat % 2 else 0.4, pan=0.2)
                if t0 >= 16:
                    place(music, hat(), tb + BEAT / 4, 0.25, pan=-0.2); place(music, hat(), tb + 3 * BEAT / 4, 0.25, pan=0.2)
            if beat in (1, 3) and t0 >= 16: place(music, clap(), tb, 0.55)
# intro: denyut sub lembut 0–8 dtk
for k in range(int(8 / BEAT)):
    place(music, bass_note(midi(33), 0.5), k * BEAT, 0.28 if k < 4 else 0.38)
# penutup: akor Am panjang + bel resolusi
place(music, pad_chord([57, 60, 64, 69], 4.8, 1.0), 36.0, 0.65)
place(music, kick(0.8) * 1.1, 36.0, 0.9)
for k, m in enumerate([81, 84, 88, 93]): place(music, bell(m, 2.2), 36.15 + k * 0.16, 0.18, pan=(-0.4, 0.4, -0.2, 0.2)[k])
music[:] = reverb(music, 2.4, 0.22)
# sidechain pompa ringan mengikuti kick (hanya 8–36 dtk)
gain = np.ones(N)
for k in range(int(8 / BEAT), int(36 / BEAT)):
    i = int(k * BEAT * SR); L = int(0.28 * SR); gain[i:i + L] *= 0.62 + 0.38 * (1 - np.exp(-np.arange(L) / (0.09 * SR)))
music *= gain
# fade in/out
fi = np.minimum(1, np.arange(N) / (0.8 * SR)); fo = np.minimum(1, (N - np.arange(N)) / (2.0 * SR)); music *= fi * fo
music *= 0.6

# ═══════ EFEK SUARA ═══════
sfx = np.zeros((2, N))
def boom(t0, g=1.0): place(sfx, kick(1.0) * 1.2 + np.sin(2 * np.pi * 38 * tarr(1.4)) * np.exp(-tarr(1.4) * 3) * 0.6 if False else kick(1.0) * 1.2, t0, g * 0.9); place(sfx, sweep_noise(1.1, 3000, 300, 1.1, False) * 0.5, t0, g * 0.5)
def whoosh(t0, d=0.8, f0=250, f1=4000, g=0.7, pan=0.0): place(sfx, sweep_noise(d, f0, f1, 0.75), t0, g, pan)
def whoosh_out(t0, d=0.7, g=0.6, pan=0.0): place(sfx, sweep_noise(d, 5000, 300, 0.75), t0, g, pan)
def pop(t0, m=84, g=0.5, pan=0.0):
    t = tarr(0.18); f = midi(m) * (1 + 0.8 * np.exp(-t * 60)); s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22)
    place(sfx, s, t0, g, pan)
def tick(t0, g=0.3, f=2400, pan=0.0):
    t = tarr(0.05); s = np.sin(2 * np.pi * f * t) * np.exp(-t * 120) + rng.standard_normal(len(t)) * np.exp(-t * 200) * 0.2
    place(sfx, s, t0, g, pan)
def thud(t0, g=0.8, f=70):
    t = tarr(0.3); s = np.sin(2 * np.pi * (f + 90 * np.exp(-t * 50)) * t) * np.exp(-t * 14) + rng.standard_normal(len(t)) * np.exp(-t * 80) * 0.15
    place(sfx, s, t0, g)
def shimmer(t0, g=0.35):
    for k, m in enumerate([93, 96, 100, 105, 108]): place(sfx, bell(m, 1.4) * 0.5, t0 + k * 0.07, g, pan=(-0.5 + 0.25 * k))
def chime(t0, notes=(81, 85, 88, 93), g=0.3):
    for k, m in enumerate(notes): place(sfx, bell(m, 1.8), t0 + k * 0.09, g, pan=(-0.3 + 0.2 * k))
def click(t0, g=0.5):
    t = tarr(0.04); place(sfx, (rng.standard_normal(len(t)) * np.exp(-t * 300) + np.sin(2 * np.pi * 1200 * t) * np.exp(-t * 200)) * 0.6, t0, g)

# S1 — logo
place(sfx, riser(1.1, 150, 2500) * 0.5, 0.0, 0.55); boom(0.28, 1.0); shimmer(1.15, 0.3); thud(1.55, 0.7, 62); shimmer(1.62, 0.22)
whoosh_out(3.55, 0.7, 0.55)
# S2 — slam kata
for t0 in (4.1, 4.9, 5.65): whoosh(t0 - 0.12, 0.35, 400, 3500, 0.35); thud(t0 + 0.05, 0.9, 58 if t0 < 5 else 52)
for k, t0 in enumerate([4.1 + .18, 4.9 + .18, 4.9 + .36, 5.65 + .0]): click(t0 + 0.02, 0.2)
for k in range(4): pop(6.5 + k * .22, 88 + k * 2, 0.35, pan=-0.5 + k * .33)
place(sfx, riser(1.5, 250, 3500) * 0.5, 6.5, 0.6); whoosh_out(7.75, 0.55, 0.5)
# S3 — perangkat
boom(8.0, 0.8); whoosh(8.05, 0.9, 200, 3500, 0.7, -0.3); whoosh(8.55, 0.8, 300, 4000, 0.6, 0.4)
for t0 in (8.7, 10.2, 11.6, 13.0, 14.4): tick(t0 - 0.05, 0.4); pop(t0 + 0.2, 84 + [0, 3, 5, 8, 10][[8.7, 10.2, 11.6, 13.0, 14.4].index(t0)], 0.35)
for t0 in (8.9, 11.7, 14.4): whoosh(t0 - 0.05, 0.45, 600, 5000, 0.3, -0.5)
whoosh_out(15.5, 0.7, 0.55)
# S4 — kartu
whoosh(16.1, 0.7, 300, 3500, 0.5)
for i in range(6): t0 = 16.7 + i * .45; whoosh(t0 - 0.05, 0.4, 500, 3800, 0.3, (-0.6 + 0.24 * i)); pop(t0 + 0.3, 76 + i * 2, 0.4, (-0.6 + 0.24 * i)); thud(t0 + 0.28, 0.35, 90)
for i in range(14): tick(17.8 + i * 0.14, 0.12 + 0.01 * i, 2000 + 60 * i)    # angka stok berdetak
place(sfx, riser(0.9, 300, 3000) * 0.5, 22.6, 0.55); whoosh_out(23.4, 0.7, 0.55)
# S5 — brand
boom(24.0, 0.8)
for i in range(6): t0 = 24.7 + i * .28; pop(t0 + 0.05, 72 + i * 2, 0.4, (-0.7 + 0.28 * i)); bell_t = t0
for i, m in enumerate([81, 84, 88, 91, 93, 96]): place(sfx, bell(m, 1.4), 24.75 + i * .28, 0.16, pan=(-0.7 + 0.28 * i))
for i in range(22): tick(26.9 + i * 0.075, 0.1 + 0.012 * i, 1800 + 90 * i)                          # hitung angka
for t0 in (26.9, 27.2, 27.5): pop(t0 + 1.6, 96, 0.3)
chime(28.6, (84, 88, 91, 96), 0.25); whoosh_out(29.9, 0.6, 0.5)
# S6 — buka kunci
place(sfx, np.sin(2 * np.pi * 55 * tarr(1.2)) * np.minimum(1, tarr(1.2) / 0.5) * np.exp(-tarr(1.2) * 1.5) * 0.4, 30.3, 0.5)
whoosh(30.55, 0.7, 250, 3000, 0.5); pop(30.9, 80, 0.4)
for i in range(6): click(31.8 + i * .17, 0.45); tick(31.8 + i * .17, 0.2, 1600 + 150 * i)       # ketik kode
place(sfx, riser(0.8, 250, 2500) * 0.4, 32.2, 0.5)
# unlock: klik logam + ding sukses
click(33.0, 0.8); thud(33.0, 0.5, 120); chime(33.05, (88, 93, 96, 100), 0.4)
for i in range(3): t0 = 33.7 + i * .38; whoosh(t0 - 0.05, 0.4, 500, 3800, 0.3, (-0.5, 0, 0.5)[i]); pop(t0 + 0.2, 84 + i * 3, 0.45, (-0.5, 0, 0.5)[i])
place(sfx, riser(1.1, 250, 4000) * 0.6, 34.8, 0.6); whoosh_out(35.7, 0.35, 0.4)
# S7 — penutup
boom(36.0, 1.2); shimmer(36.1, 0.4); whoosh(36.1, 0.8, 300, 4200, 0.5)
pop(36.8, 84, 0.4); thud(36.55, 0.6, 60); pop(37.2, 88, 0.4); chime(37.4, (88, 93, 96, 100, 105), 0.25)
sfx[:] = reverb(sfx, 1.6, 0.18)

mix = music + sfx * 0.95
# limiter lembut + normalisasi
peak = np.max(np.abs(mix)); mix = np.tanh(mix / (peak * 0.8)) * 0.8
mix *= 0.89 / np.max(np.abs(mix))
pcm = (mix.T * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'promo_audio.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', mix.shape, float(np.sqrt((mix ** 2).mean())))
