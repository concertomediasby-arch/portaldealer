#!/usr/bin/env python3
"""Musik latar portal — funk / nu-disco ringan (112 BPM, Am9–D9–Fmaj7–E7sus), sintetis buatan sendiri,
tanpa sample / hak cipta pihak lain. Menggantikan versi pop-lounge D mayor (19 Nov 2026, pilihan pemilik).
Loop mulus: semua nada & reverb ditempatkan melingkar, tanpa fade di ujung.
Bagian (8 birama): A groove ringan · B groove penuh · C + strings & melodi · D jeda (tanpa kick) · E penuh + melodi 2 · F groove.
Pakai:  python3 tools/portal-music.py music.wav  →
        ffmpeg -i music.wav -af loudnorm=I=-18:TP=-2 -c:a libmp3lame -b:a 128k assets/audio/portal-music.mp3"""
import numpy as np, wave, sys
SR=44100; BPM=112.0; BEAT=60/BPM; BAR=4*BEAT; BARS=48; N=int(round(BARS*BAR*SR))
rng=np.random.default_rng(11)
def midi(m): return 440*2**((m-69)/12)
def tarr(d): return np.arange(int(d*SR))/SR
dry=np.zeros((2,N))
def place(s,t0,g=1.0,pan=0.0):
    i=int(round(t0*SR))%N; j=i+len(s); a=s*g
    l,r=(1-max(0,pan))*.7071,(1+min(0,pan))*.7071
    for ch,k in ((0,l),(1,r)):
        if j<=N: dry[ch,i:j]+=a*k
        else: m=N-i; dry[ch,i:N]+=a[:m]*k; dry[ch,:j-N]+=a[m:]*k
def saw(f,t,h=10): return sum(np.sin(2*np.pi*f*k*t)/k for k in range(1,h+1))
def sbass(m,d):   # synth bass bulat + sedikit "pluck"
    t=tarr(d); f=midi(m)
    s=np.sin(2*np.pi*f*t)+saw(f,t,6)*.35*np.exp(-t*9)
    return s*np.minimum(1,t/.003)*np.exp(-t*2.5)*np.minimum(1,(d-t)/.02)
def guitar(m,d=.12):  # gitar funk "chicken scratch" pendek dan terang
    t=tarr(d); f=midi(m)
    s=sum(np.sin(2*np.pi*f*k*t)*np.exp(-t*(20+8*k))/k for k in range(1,7))
    return s*np.minimum(1,t/.001)*np.minimum(1,(d-t)/.015)
def mute(d=.05):
    t=tarr(d); n=rng.standard_normal(len(t)); return n*np.exp(-t*80)*.25
def strings(notes,d):  # string ensemble/pad disko
    t=tarr(d); o=np.zeros_like(t)
    for m in notes:
        for det in (-.08,0,.08): o+=saw(midi(m)*2**(det/12),t,8)
    return o*np.minimum(1,t/.15)*np.minimum(1,(d-t)/.2)/(len(notes)*3)
def stab(notes,d=.25):
    t=tarr(d); o=sum(saw(midi(m),t,8) for m in notes)/len(notes)
    return o*np.exp(-t*10)*np.minimum(1,(d-t)/.02)
def kick(d=.3):
    t=tarr(d); ph=2*np.pi*np.cumsum(50+120*np.exp(-t*40))/SR
    return np.sin(ph)*np.exp(-t*11)
def hat(d=.05,o=False):
    d=.22 if o else d; t=tarr(d); n=rng.standard_normal(len(t)); n=n-np.concatenate([[0],n[:-1]])
    return n*np.exp(-t*(14 if o else 70))*.07
def clap(d=.2):
    t=tarr(d); n=rng.standard_normal(len(t)); n=n-np.concatenate([[0],n[:-1]])
    e=np.exp(-t*25)+.7*np.exp(-np.maximum(0,t-.011)*25)*(t>.011)+.5*np.exp(-np.maximum(0,t-.022)*25)*(t>.022)
    return n*e*.11
def shaker(d=.06):
    t=tarr(d); n=rng.standard_normal(len(t)); n=n-np.concatenate([[0],n[:-1]])
    return n*np.sin(np.pi*t/d)*.025
# A minor ceria (dorian): Am9 – D9 – Fmaj7 – E7sus
CH=[dict(r=33,v=[60,64,67,71]),dict(r=38,v=[60,64,66,69]),dict(r=29,v=[60,64,65,69]),dict(r=28,v=[62,64,68,71])]
# pola bass oktaf ala disko (16th) per birama: (ketukan, interval, panjang)
BL=[(0,0,.4),(.5,12,.2),(1,0,.4),(1.5,12,.2),(2,0,.4),(2.5,12,.2),(2.75,10,.2),(3,0,.4),(3.5,12,.2),(3.75,7,.2)]
GT=[.25,.75,1.25,1.75,2.25,2.75,3.25,3.75]   # gitar di sela ketukan
MEL={0:[(76,0,.5),(79,.5,.5),(81,1,1),(79,2.5,.5),(76,3,1)],1:[(74,0,.75),(76,.75,.75),(78,1.5,1.5),(81,3.5,.5)],
     2:[(79,0,.5),(77,.5,.5),(76,1,1),(72,2,1),(74,3,1)],3:[(76,0,2),(74,2,.5),(76,2.5,.5),(80,3,1)]}
MEL2={0:[(81,0,.5),(79,.5,.5),(76,1,.5),(79,1.5,1.5),(84,3,1)],1:[(81,0,1),(78,1,.5),(76,1.5,.5),(74,2,2)],
      2:[(77,0,.75),(79,.75,.75),(81,1.5,1),(77,2.5,1.5)],3:[(76,0,1),(80,1,1),(83,2,1.5),(81,3.5,.5)]}
for b in range(BARS):
    c=CH[b%4]; t0=b*BAR; sec='ABCDEF'[b//8]; last=(b%8==7)
    drums=sec!='D'
    for k in range(4):
        if drums: place(kick(),t0+k*BEAT,.5 if sec!='A' else .42)
        if drums or k>=2 and last: place(hat(o=True),t0+k*BEAT+BEAT/2,.9 if sec!='A' else .6,.25)
        for q in range(4): place(shaker(),t0+(k+q/4)*BEAT,1.0 if q%2 else .5,-.4)
    if sec in 'BCEF' or (sec=='D' and last):
        place(clap(),t0+BEAT,1,-.05); place(clap(),t0+3*BEAT,1,-.05)
    if sec=='D' and last:
        for q in range(8): place(clap(),t0+2*BEAT+q*BEAT/4,.25+.08*q,-.05)
    if sec in 'BCEF':
        for st,iv,ln in BL: place(sbass(c['r']+12+iv,ln*BEAT),t0+st*BEAT,.42)
        for k,st in enumerate(GT):
            if k%2==0: place(guitar(c['v'][2]+12),t0+st*BEAT,.18,.45); place(guitar(c['v'][3]+12),t0+st*BEAT+.004,.12,.45)
            else: place(mute(),t0+st*BEAT,.6,.45)
    else:
        for st in (0,1.5,2,3.5): place(sbass(c['r']+12+(12 if st%1 else 0),(.4 if st%1 else 1.3)*BEAT),t0+st*BEAT,.36)
    if sec!='D':
        place(stab(c['v']),t0+0,.13,-.3); place(stab(c['v']),t0+2.5*BEAT,.1,-.3)
    if sec in 'CDE':
        place(strings(c['v'],BAR),t0,.12 if sec!='D' else .16,-.2)
    if sec=='C':
        for m,st,ln in MEL[b%4]: place(strings([m],ln*BEAT+.1)*1.5,t0+st*BEAT,.22,.1)
    if sec=='E':
        for m,st,ln in MEL2[b%4]: place(strings([m],ln*BEAT+.1)*1.5,t0+st*BEAT,.2,.1)
    if sec=='D' and b%2==0:
        for m,st,ln in MEL[b%4][:2]: place(guitar(m,.5),t0+st*BEAT,.22,.1)
def ir(seed,d=1.0):
    r=np.random.default_rng(seed); n=int(d*SR); t=np.arange(n)/SR
    x=r.standard_normal(n)*np.exp(-t*6); x=np.convolve(x,np.ones(5)/5,'same'); return x/np.sqrt((x**2).sum())
wet=np.stack([np.fft.irfft(np.fft.rfft(dry[c])*np.fft.rfft(ir(4+c),N),N) for c in (0,1)])
mix=dry*.9+wet*.2
F=np.fft.rfftfreq(N,1/SR); lp=1/(1+(F/12500)**4)
mix=np.stack([np.fft.irfft(np.fft.rfft(mix[c])*lp,N) for c in (0,1)])
mix=np.tanh(mix/np.abs(mix).max()*1.4)/np.tanh(1.4)*.85   # sedikit "lem" ala kompresor
with wave.open(sys.argv[1],'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix.T,-1,1)*32767).astype('<i2').tobytes())
print(BARS*BAR)
