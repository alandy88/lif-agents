"""Fit exact tempo and phase of the kick band.

usage: tempofit.py TRACK START END [BPM_HINT]
  START END  seconds of a steady, busy part (the drop)
  BPM_HINT   rough tempo; without it librosa's estimate is used (it can be half or double: check the printout)
The fine search runs ±3 BPM around the hint in 0.02 BPM steps.
"""
import sys, numpy as np, librosa
y, sr = librosa.load(sys.argv[1], sr=22050, mono=True); a, b = float(sys.argv[2]), float(sys.argv[3])
S = np.abs(librosa.stft(y, n_fft=1024, hop_length=64)); f = librosa.fft_frequencies(sr=sr, n_fft=1024)
low = S[f < 150].sum(0); on = np.maximum(0, np.diff(low, prepend=low[0])); t = np.arange(len(on)) * 64 / sr
m = (t >= a) & (t < b); on, t = on[m], t[m]
hint = float(sys.argv[4]) if len(sys.argv) > 4 else float(np.atleast_1d(librosa.beat.beat_track(y=y[int(a * sr):int(b * sr)], sr=sr)[0])[0])
print(f'coarse tempo {hint:.1f}')
best = (0, 0, 0)
for bpm in np.arange(hint - 3, hint + 3.001, 0.02):
    p = 60 / bpm
    for ph in np.arange(0, p, 0.002):
        s = (on * np.exp(-((((t - ph) / p + 0.5) % 1 - 0.5) * p / 0.012) ** 2)).sum()
        if s > best[0]: best = (s, bpm, ph)
_, bpm, ph = best; p = 60 / bpm
print(f'bpm {bpm:.2f} beat {p:.5f} phase {ph:.3f}  first beat after {a}: {a + (ph - a) % p:.3f}')
