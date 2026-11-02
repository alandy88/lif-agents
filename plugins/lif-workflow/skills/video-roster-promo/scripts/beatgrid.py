"""Read a fixed-tempo track's beat grid from its kick drum, so cuts sit on real hits.

usage: beatgrid.py TRACK [BPM]
prints
  grid     T0, the kick grid's first beat inside the music, and how clearly the kicks sit on it
  windows  kick and snare offset from the grid per 2 s window; a steady kick column means a steady grid
  fold     2-bar pattern of kick, snare and hat in 8th notes, counted from T0
  bars     loudness, bass and treble per bar from T0; a treble jump marks a drop, a ramp marks a build
  A0       bar starts one bar before each drop: candidate offsets for reel beat 0
"""

import sys

import librosa
import numpy as np

y, sr = librosa.load(sys.argv[1], sr=None, mono=True)
bpm = float(sys.argv[2]) if len(sys.argv) > 2 else 128.0
p = 60.0 / bpm
hop = 128
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
f = librosa.fft_frequencies(sr=sr, n_fft=2048)
tt = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)


def band(lo, hi):
    return np.log1p(S[(f >= lo) & (f < hi)].sum(0))


def flux(lo, hi):
    e = band(lo, hi)
    return np.maximum(0, np.diff(e, prepend=e[0]))


kick, snare, hat = flux(30, 100), flux(1500, 6000), flux(8000, 16000)
rms = librosa.feature.rms(y=y, hop_length=hop)[0]
alive = np.nonzero(rms > 0.1 * np.median(rms[rms > 1e-4]))[0]
t0m, t1m = tt[alive[0]], tt[alive[-1]]


def hits(env, ts):
    idx = np.searchsorted(tt, ts)
    idx = idx[idx < len(env)]
    return np.array([env[max(0, i - 2) : i + 3].max() for i in idx])


def best_phase(env, a, b):
    phases = np.linspace(0, p, 192, endpoint=False)
    sc = np.array([hits(env, np.arange(a + ph, b, p)).sum() for ph in phases])
    return a + phases[sc.argmax()], sc.max() / (sc.mean() + 1e-9)


T0, contrast = best_phase(kick, t0m, t1m)
T0 = T0 - np.floor((T0 - t0m) / p) * p
print(
    f"grid    {bpm:g} BPM, beat {p:.5f} s, T0 {T0:.3f} s, kick contrast {contrast:.1f}, music {t0m:.2f}-{t1m:.2f} s"
)


def off_ms(t):
    return ((t - T0 + p / 2) % p - p / 2) * 1000


print("windows (offset from grid in ms)")
for w0 in np.arange(t0m, t1m - 2, 2.0):
    k, _ = best_phase(kick, w0, w0 + 2)
    s, _ = best_phase(snare, w0, w0 + 2)
    print(f"  {w0:5.1f}s  kick {off_ms(k):+6.0f}  snare {off_ms(s):+6.0f}")

print("fold    (2 bars in 8ths from T0, 1.00 = strongest)")
nbins = 16
for name, env in (("kick", kick), ("snare", snare), ("hat", hat)):
    acc = np.zeros(nbins)
    ts = np.arange(T0, t1m, p / 2)
    for i, v in enumerate(hits(env, ts)):
        acc[i % nbins] += v
    print(f"  {name:5s} " + " ".join(f"{v / acc.max():.2f}" for v in acc))

print("bars    start      rms   bass  treble")
lo, hi = band(0, 150), band(6000, sr / 2)
rows = []
bar = 4 * p
k = 0
while T0 + (k + 1) * bar <= t1m + 0.05:
    a = T0 + k * bar
    m = (tt >= a) & (tt < a + bar)
    rows.append((k, a, rms[m].mean(), lo[m].mean(), hi[m].mean()))
    k += 1
for i, (k, a, r, l, h) in enumerate(rows):
    tag = ""
    if i and h - rows[i - 1][4] > 0.8:
        tag = "  <- drop"
    elif i and h - rows[i - 1][4] > 0.3:
        tag = "  <- build"
    print(f"  bar {k:2d} {a:7.3f}s  {r:.3f}  {l:5.2f}  {h:5.2f}{tag}")
print(
    f"end     last full bar ends {T0 + len(rows) * bar:.3f} s, music fades out by {t1m:.2f} s"
)
drops = [i for i in range(1, len(rows)) if rows[i][4] - rows[i - 1][4] > 0.8]
for d in drops:
    print(f"A0      {T0 + (d - 1) * bar:.3f} s puts the drop (bar {d}) on reel beat 4")
