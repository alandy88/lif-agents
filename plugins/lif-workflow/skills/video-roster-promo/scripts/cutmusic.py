"""Cut a fixed-tempo track to an exact beat window that loops cleanly.

usage: cutmusic.py SRC BEAT PHASE START NBEATS [--loop]
  SRC     audio file
  BEAT    beat length in seconds (from tempofit.py, never a rounded BPM)
  PHASE   time of source beat 0 (tempofit.py "phase")
  START   source beat index that becomes video t=0 (drop beat minus the intro beats)
  NBEATS  video length in beats
  --loop  replace the last bar with the bar before START, so the end runs into t=0 sample-continuously
Writes music_cut.wav, exactly round(NBEATS*BEAT*30)/30 s long.
"""
import sys
import numpy as np
import soundfile as sf

src, beat, phase, start, nb = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
y, sr = sf.read(src)
y = y if y.ndim == 2 else np.stack([y, y], 1)
s = lambda t: int(round(t * sr))
t0 = phase + start * beat
n = s(round(nb * beat * 30) / 30)
if '--loop' in sys.argv:
    a = y[s(t0):s(t0 + (nb - 4) * beat)].copy()
    b = y[s(t0 - 4 * beat):s(t0)].copy()
    f = np.linspace(0, 1, s(0.003))[:, None]   # 3 ms fades at the splice keep the grid exact
    a[-len(f):] *= 1 - f; b[:len(f)] *= f
    out = np.concatenate([a, b])
else:
    out = y[s(t0):s(t0) + n].copy()
out = out[:n] if len(out) >= n else np.concatenate([out, np.zeros((n - len(out), out.shape[1]))])
assert len(out) == n, (len(out), n)
sf.write('music_cut.wav', out, sr)
print(f'music_cut.wav {n / sr:.3f} s, source {t0:.3f}-{t0 + nb * beat:.3f} s')
