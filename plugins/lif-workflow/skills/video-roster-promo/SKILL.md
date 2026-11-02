---
name: video-roster-promo
description: >
  Vertical Douyin 卡点 promo (≤15 s) of several illustrations — a roster, 合集, outfit or colourway set — cut to
  the user's BGM: avatar roster opening, puppet-animated cards with blink and hair motion, designed transitions,
  手书 line art. Use when the user gives several images plus music for a 合集/阵容/卡点 promo, or asks to reuse
  the Daki colourway promo (film strip, poker hand, 3D ring).
---

# Roster promo video

N images (3–9) and one BGM in, one ≤15 s 1080x1920 30 fps video out. Each image is split into layers and
rigged as a **puppet**; cards cut on the **beat grid**; everything renders on the GPU in Python.

```
BGM ──> tempofit ──> cutmusic ──> music_cut.wav ─────────────────────┐
images ─> See-through ─> prep ─> rig ─> idle_render ─> idle_XX.mp4 ──┼─> promo.py ─> sfx/mix ─> mux ─> check
design.md menus + ledger ─> plan.md ─────────────────────────────────┘
```

One image only: the vault's `layered-promo-video` skill. Dancing puppets in a 16:9 showreel: the vault's
`character-showreel` skill (both in `$LIF_NOTES_VAULT/.agents/skills/`).

## Setup

Project folder `~/work/<name>-roster/`: `src/card_01.png …` (the user's images, in roster order), `src/bgm.*`.

```bash
PY=~/github/oss/see-through/.venv/bin/python     # torch, OpenCV, Pillow, psd-tools
mkdir -p fonts && for f in ofl/zhimangxing/ZhiMangXing ofl/longcang/LongCang apache/permanentmarker/PermanentMarker \
  ofl/bebasneue/BebasNeue ofl/anton/Anton; do curl -sSLfo fonts/${f##*/}-Regular.ttf https://github.com/google/fonts/raw/main/$f-Regular.ttf; done
```

Audio scripts run with `uv run -q --with numpy --with soundfile --with librosa python …`.
The GPU is shared with ComfyUI: free it while its queue is empty before See-through or a render.

## 1. Read the BGM

1. `uv run … python scripts/tempofit.py src/bgm.flac <start_s> <end_s> [bpm_hint]` over the busiest part: exact
   `bpm`, `beat` and `phase`. Pass a hint when the coarse tempo is half or double the felt beat. Use this beat
   everywhere. A rounded BPM drifts a frame every few bars.
2. Find the sections with `scripts/beatgrid.py <track> <bpm>` (its `bars` table marks builds and drops)
   and a low-band loudness print around the drop (as in the Daki run: 0.1 s bins, 150 Hz low band).
3. Choose `START` so the drop lands at video beat 3–4 (1.5–2.0 s): `START = drop_beat − intro_beats`.
   Choose `NBEATS` so `NBEATS × beat ≤ 15.0 s`.
4. `uv run … python scripts/cutmusic.py src/bgm.flac <beat> <phase> <START> <NBEATS> --loop`. `--loop` swaps the
   last bar for the bar before `START`, so the end flows into frame 0 when Douyin replays.

Done when: librosa puts the drop onset in `music_cut.wav` within one frame (33 ms) of its grid beat.

## 2. Design the cut

Read [design.md](design.md). Write `plan.md`: one row per beat range (beat → what is on screen → transition →
music event), the opening, every card's framing, transition and type, and the ending. Compare it against the last
three entries in the vault ledger `$LIF_NOTES_VAULT/work/social-media/douyin/promo-designs.md`.

Done when: the plan fits the BGM's sections and breaks every anti-repetition rule in design.md nowhere.

## 3. Puppet every image

Follow [puppet.md](puppet.md) once per image: split, rebuild layers, measure the rig, check poses, render
`idle_XX.mp4` on this BGM's beat, and keep `charmask_XX.png`.

Done when: every card has an idle video of `NBEATS` beats whose stills show breathing, sway, hair lag and a blink
with no tears at the neck, shoulders or eyes.

## 4. Build the renderer

Copy the example closest to the chosen opening into the project as `promo.py`: `examples/strip.py` (parallax
film strips), `examples/hand.py` (poker hand) or `examples/ring.py` (3D ring). All three share the card section,
the six transitions (`trans()`), on-twos line art (`lines()`), hand type (`htext()`), doodles and `cam()`.
They were built for one image in seven colourways; adapt them:

- **Sources.** Replace the single `IDLE` list with one per card (`IDLE[k]`, `idle(k, i)` returning frame
  `(i//2)*2`, which keeps the character on twos). Per card: its own `CMASK`/`TMASK` from `charmask_XX.png`,
  warped by that card's idle framing (step 3 records it).
- **Colour.** `tone()`/`wash()` fake colourways from one image. With different images drop them and set each
  card's `KEY` colour from its outfit (k-means of the masked pixels, keep the most saturated cluster).
- **Per-card values.** `SHOTS` framing centres, `EYE`/face points, avatar framing (`AV`), numeral positions:
  re-read them from each card's idle frame. Absolute paths at the top of the example point at the Daki run.
- **Timeline.** `BEAT`, `NBEATS`, `CSTART` and the opening's beat constants come from plan.md.

Render `--stills` covering the opening, the drop, every transition (one frame before and after each cut) and the
ending; look at them before any full render.

Done when: stills show every card's face clear of type and numerals, no frame washed to white or black, and each
transition reading as designed.

## 5. Sound

Start from `examples/hand_sfx.py`: shutter ticks on opening flicks, whoosh into each transition, boom on the drop
and on the ending's stop. Layer them over `music_cut.wav` into `mix.wav`; keep the BGM's own drop untouched.

## 6. Render, mux and check

```bash
$PY promo.py --out promo_silent.mp4
ffmpeg -y -i promo_silent.mp4 -i mix.wav -map 0:v -map 1:a -c:v libx264 -crf 15 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 256k -movflags +faststart -shortest promo.mp4
ffmpeg -y -i promo.mp4 -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -c:a copy -movflags +faststart promo_share.mp4
ffmpeg -y -i promo.mp4 -vf "fps=4,scale=135:-1,tile=12x5" -frames:v 1 sheet.jpg
```

Adapt `examples/hand_synccheck.py`: list every cut frame against its grid beat, the drop onset, and the sample
step at the loop seam.

Done when: duration ≤ 15.0 s, every cut within one frame of the grid, `sheet.jpg` shows every section, and the
seam step is no larger than a typical sample step.

## 7. Deliver and log

Send `promo_share.mp4`. Say plainly that motion and sync were checked on frames and numbers, not watched or
heard. Append the design combination to the ledger (`$LIF_NOTES_VAULT/work/social-media/douyin/promo-designs.md`, format in the
note) so the next video avoids it.

## Reference run

`~/work/daki-promo2/` (November 2026), while it exists: research, music cut, demos v1–v6 with briefs
(`BRIEF.md`, `BRIEF2.md`). v4–v6 are the examples here.
