# Puppet one image

Run once per card image. Work in `rig/XX/` inside the project. Scripts: this skill's
`scripts/prep.py` and `scripts/idle_render.py` (its renderer with an `--idle` mode; the values in it
are the Daki worked example). Coordinates below are full-size source pixels of the card image.

## 1. Split into layers (See-through)

See-through lives at `~/github/oss/see-through`. Copy the image to `workspace/in/XX.png` and run from the repo root,
in the background (about 3 min; the first run downloads models for over 10 min; needs 12–16 GB free VRAM):

```bash
.venv/bin/python inference/scripts/inference_psd.py --srcp workspace/in/XX.png --save_to_psd --tblr_split --disable_progressbar
PYTHONPATH=common .venv/bin/python -c "from utils.inference_utils import further_extr; \
  further_extr('workspace/layerdiff_output/XX', rotate=False, save_to_psd=False, tblr_split=True)"
```

The second call writes `XX/optimized/*.png` and `info.json`, which prep needs beside `XX.psd`. Expect about 20
parts: back hair, front hair, face, eyewhite/irides/eyelash per eye, eyebrows, nose, mouth, ears, neck, neckwear,
topwear, bottomwear, legwear, footwear, handwear-l/-r, headwear, objects. A crash after the PNGs exist: call
`apply_marigold` then `further_extr` directly instead of redoing the diffusion.

## 2. Rebuild at full size

```bash
$PY <skill>/scripts/prep.py src/card_XX.png ~/github/oss/see-through/workspace/layerdiff_output XX --panel x0,x1,y0,y1
```

prep scales each part to the source size, takes original pixels wherever that part is visible, merges eyewhite,
iris and lash into `eye-l` / `eye-r`, folds nose, mouth and brows into `face`, and paints the background behind the
character. `--panel` is a coloured box in the background, if any. Open `check_recomp.jpg` (original | recomposite |
clean background): the first two must match. Fix it here, never in the renderer.

Print each layer's bounding box (alpha > 128). Which part is which matters: `-l`/`-r` are the character's sides,
so `eye-l` is usually on the viewer's right. Some images name things differently (Daki: `ears` and `headwear` for
the face marks), so read the names from `layers/_meta.json`.

Union the layer alphas, dilate 5 px and blur 1.5 px into `charmask_XX.png`: the renderer uses it to keep line art
on the character and to put numerals behind her.

## 3. Measure the rig

Copy `idle_render.py` into `rig/XX/` and set the per-image values at the top (they are explained in the
docstring). Read each from the full-size image:

| Value | What it is | How to read it |
|---|---|---|
| `HEAD_C` | head centre | middle of the face box |
| `NECK_P` | head pivot | chin bottom, centre of the neck box top |
| `EYE` | `(x0,x1,y0,y1)` per eye layer | the `eye-l` / `eye-r` boxes |
| `HIP` | upper-body pivot | top of the thighs; seated: where the seat meets the floor |
| `SH_L`, `SH_R` | arm pivots | shoulder joints of `handwear-l` / `handwear-r` |
| `BAG_P` | pendulum pivot for `objects` | strap top or hand holding the prop |
| `w_root`, `w_up`, `lift_w` | y ranges for bob, spine bend, breathing | 1 above the hip, falling to 0 at the feet |
| `w_leg`, `knee` | leg sway and knee give | standing only; seated poses set both to zero |
| `w_chest`, chest x | chest widening on the in-breath | the topwear's bust band and its centre x |
| `w_back`, `w_front` | hair wave weights | distance from the head (back hair), y below the fringe (front hair) |
| `HEADSET` | layers that turn with the head | face, ears, headwear, both eyes, front hair |

## 4. Motion recipes

All warps are backward maps: undo the outer transform (root bob, spine) first, then the local one (head, arm).
Neighbouring layers use the same weight function so seams stay closed.

- **Root bob**: the body sinks and rises about 5–9 px on a 4-beat breath, weight 1 above the hip and 0 at the feet,
  so feet stay planted. Seated: 5 px, legs static.
- **Spine bend and hip shift**: rotation of 1–1.5° about `HIP` on an 8-beat sway, with a small lag per part.
- **Breathing**: chest widens about 1 %, shoulders lift with it.
- **Head**: tilt under 0.6° plus a lagged copy of the body sway. If a hand touches the face (chin rest, peace sign
  at the cheek), keep the tilt near zero and the arm nearly still, or the hand and face drift apart.
- **Arms**: pendulum about the shoulder, 0.2–2°, lagging the sway by 0.4–0.6 s. Arms resting on knees or holding
  props stay near zero.
- **Back hair**: sideways wave whose phase grows with distance from the head (`dist_head / 230`), two sine
  frequencies (0.45 and 1.1 Hz), amplitude about 13 px plus up to 26 px of "gust". The roots stay pinned (weight 0
  near the head), so the tips move most.
- **Front hair**: smaller wave (4–11 px) whose phase follows y, so strands ripple downward.
- **Blink**: squash the eye layer toward its lower lid (`y1 − 6`) by up to 88 %; the face layer already has skin
  painted under the eye. A blink is 0.12 beat closing, 0.28 beat opening.
- **Gust on hits**: in `--idle` mode `REVEALS` lists the beats where this card's cut lands; hair gusts there and the
  eyes blink 1.6 beats later. Set `REVEALS` from plan.md so the puppet reacts to the cut.

## 5. Check and render the idle loop

Set `BEAT` in `idle_render.py` to the BGM's beat (breath every 4 beats and sway every 8 then sit on the music).
Preview poses before rendering: `$PY idle_render.py --idle --stills 0,0.5,1,2,4.1,6` (beat positions). Look for tears at
the neck, shoulders and eye edges, and for hands detaching from the face.

```bash
$PY idle_render.py --idle --nbeats <NBEATS> --out ../../idle_XX.mp4
```

`--idle` frames the whole image, centred, at `z = min(1080/W, 1920/H)`, with no grading, particles or title (about
30 s for 800 frames on the 5090). Record that framing for the renderer: a source point `(x, y)` sits at
`((x − W/2)·z + 540, (y − H/2)·z + 960)` in the idle frame. Images that are not 9:16 leave margins; the renderer's
`cam()` framings must keep them out of shot.

## Limits

Small motion only: breathing, sway, blink, hair, small arm swings. Turning, walking, new poses or lip-sync need
drawn frames or a video model. Seven cards of the same pose read as 站桩; vary framing and transitions per card.
