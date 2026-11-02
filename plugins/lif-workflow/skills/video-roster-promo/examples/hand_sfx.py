# V5 audio. music_cut.wav: source from beat k=28 (13.8086 s) for 20 beats (drop on beat 4, stops on the bar at 20),
# then the source bar k=24..27, which runs straight into k=28 = frame 0, so the loop is source-continuous.
# mix.wav: shutter ticks on the 8th flicks, whoosh + boom on the pull/drop, whoosh into each transition,
# boom on the bar-20 stop, soft ticks as the cards land back on the stack (16ths).
import numpy as np
import soundfile as sf

BEAT = 0.49188
FPS = 30
NBEATS = 24
src, sr = sf.read("/home/peteryu/work/daki-promo2/src/music_83.flac")
src = src if src.ndim == 2 else np.stack([src, src], 1)
s28 = 0.036 + 28 * BEAT
smp = lambda t: int(round(t * sr))
xf = smp(0.008)  # 8 ms crossfade at the bar-20 join, taken from the drop running on past the bar
a = src[smp(s28) : smp(s28 + 20 * BEAT) + xf]
b = src[smp(s28 - 4 * BEAT) : smp(s28)].copy()
n = round(NBEATS * BEAT * FPS) * sr // FPS  # exactly the video length (24 beats rounded to frames)
# drop the few surplus samples from the start of the end bar, not its end: its last sample must meet frame 0
b = b[len(a) - xf + len(b) - n :]
ramp = np.linspace(0, 1, xf)[:, None]
b[:xf] = a[-xf:] * (1 - ramp) + b[:xf] * ramp
y = np.concatenate([a[:-xf], b])
assert len(y) == n
sf.write("music_cut.wav", y, sr)

bf = lambda b: round(b * BEAT * FPS) / FPS
rng = np.random.default_rng(3)


def put(s, at, g):
    i = int(at * sr)
    k = min(len(s), len(y) - i)
    if i >= 0 and k > 0:
        y[i : i + k] += g * s[:k, None]


def shutter():
    k = int(sr * 0.06)
    t = np.arange(k) / sr
    x = rng.standard_normal(k)
    return np.diff(x, prepend=0) * np.exp(-t * 90) + 0.5 * np.sin(
        2 * np.pi * 2400 * t
    ) * np.exp(-t * 120)


def whoosh(d=0.22):
    k = int(sr * d)
    x = rng.standard_normal(k)
    out = np.zeros(k)
    acc = 0.0
    c = np.linspace(0.02, 0.5, k)
    for j in range(k):
        acc += c[j] * (x[j] - acc)
        out[j] = acc
    return out * np.linspace(0, 1, k) ** 2


def boom():
    k = int(sr * 0.5)
    t = np.arange(k) / sr
    return np.sin(2 * np.pi * (45 + 60 * np.exp(-t * 18)) * t) * np.exp(-t * 6)


for j in range(7):
    put(shutter(), bf(0.5 + 0.5 * j), 0.35)  # flicks on 8ths
put(whoosh(0.13), bf(4) - 0.13, 0.5)
put(boom(), bf(4), 0.5)  # pull to camera -> drop
for b_ in [6, 8, 10, 12, 14, 16]:
    put(whoosh(), bf(b_) - 0.22, 0.5)
put(boom(), bf(20), 0.45)
put(whoosh(0.18), bf(20), 0.35)  # stop on the bar, 07 flies back
for c in range(7):
    put(shutter(), bf(20.5 + 0.25 * (6 - c)), 0.2)  # cards land on the stack
y /= max(1, np.abs(y).max() / 0.98)
sf.write("mix.wav", y, sr)
