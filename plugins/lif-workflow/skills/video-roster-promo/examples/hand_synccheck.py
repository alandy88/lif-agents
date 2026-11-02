import numpy as np, librosa
y, sr = librosa.load('music_cut.wav', sr=None, mono=True)
BEAT = 0.49188; FPS = 30
on = librosa.onset.onset_detect(y=y, sr=sr, units='time', hop_length=128, backtrack=False)
# drop: biggest jump in low-band RMS
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=128)); f = librosa.fft_frequencies(sr=sr, n_fft=2048)
low = S[f < 150].sum(0); t = librosa.frames_to_time(np.arange(len(low)), sr=sr, hop_length=128)
d = np.diff(low); dj = np.argmax(d * (t[1:] > 1) * (t[1:] < 3)); print(f'drop onset (low band jump) {t[dj+1]:.3f} s; grid beat 4 = {4*BEAT:.3f} s')
print('nearest onset to drop', min(on, key=lambda x: abs(x - 4 * BEAT)).round(3))
# beat-phase check: onsets vs grid
ph = [(o / BEAT - round(o / BEAT)) * BEAT for o in on if o > 2]
print(f'onsets after drop: {len(ph)}, median offset from grid {np.median(ph)*1000:.1f} ms')
print('cut | frame | time | grid beat | grid time | err ms')
for name, b in [(f'flick{j+1}', 0.5 + 0.5 * j) for j in range(7)] + [('pull 16th', 3.75), ('drop/01', 4), ('whip->02', 6),
                ('blades->03', 8), ('iris->04', 10), ('block->05', 12), ('push->06', 14), ('smear->07', 16),
                ('stop/flyback', 20)] + [(f'land{c+1:02d}', 20.5 + 0.25 * (6 - c)) for c in range(6, -1, -1)] + [('loop', 24)]:
    fr = round(b * BEAT * FPS); print(f'{name:12s} {fr:4d} {fr/FPS:7.3f} {b:5.1f} {b*BEAT:7.3f} {(fr/FPS-b*BEAT)*1000:6.1f}')
# the bar-20 join and the loop seam: biggest sample step vs typical step
import soundfile as sf
a, sr2 = sf.read('music_cut.wav'); a = a.mean(1)
for nm, k in [('join b20', int(round(20 * BEAT * sr2))), ('loop seam', 0)]:
    st = abs(a[k] - a[k - 1]); print(f'{nm}: step {st:.4f} vs median step {np.median(np.abs(np.diff(a))):.4f}')
# the bar-20 stop: low-band level per beat around the join, and the onset nearest beat 20
for k in (18, 19, 20, 21, 22):
    sl = (t >= k * BEAT) & (t < (k + 1) * BEAT); print(f'beat {k}: low-band mean {low[sl].mean():8.1f}')
print('nearest onset to beat 20', min(on, key=lambda x: abs(x - 20 * BEAT)).round(3), 'grid', round(20 * BEAT, 3))
