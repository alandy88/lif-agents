"""V5 poker-hand cut: the 7 avatar cards fan out as a hand, flick on 8ths, card 01 is pulled to camera on the drop
-> 7 cards joined by designed beat transitions -> the cards fly back into the stack and re-fan (= frame 0, loop).

usage: promo.py                     -> promo_silent.mp4 (1080x1920, 30 fps)
       promo.py --stills 0.1,1.8,2.05,...   (seconds) -> stills.jpg
Music grid: music_cut.wav = source 13.8086 s + 20 beats, then the source bar before it (k=24..27), so the
loop is source-continuous; beats at k*0.49188 s from t=0, drop at beat 4, drop stops on the bar at beat 20.
"""

import argparse
import math
import subprocess
import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("--stills", default="")
ap.add_argument("--out", default="promo_silent.mp4")
args = ap.parse_args()

dev = "cuda"
FPS = 30
W, H = 1080, 1920
BEAT = 0.49188
NBEATS = 24  # 4 hand intro + 6 cards x 2 + card 07 x 4 + fly-back/re-fan x 4
NF = int(round(NBEATS * BEAT * FPS))


def bf(b):  # frame nearest to beat b
    return int(round(b * BEAT * FPS))
YS, XS = torch.meshgrid(
    torch.arange(H, device=dev, dtype=torch.float32) + 0.5,
    torch.arange(W, device=dev, dtype=torch.float32) + 0.5,
    indexing="ij",
)


def c01(x):
    return min(max(x, 0.0), 1.0)


def oexpo(x):
    x = c01(x)
    return 1 - 2 ** (-10 * x) if x < 1 else 1.0


def oback(x, c=1.7):
    x = c01(x)
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


def hsh(*a):
    h = 0
    for v in a:
        h = (h * 1000003 + int(v) * 7919 + 12345) & 0xFFFFFFFF
    return ((h * 2654435761) & 0xFFFFFFFF) / 0xFFFFFFFF


def sj(i, seed, amp):  # stepped wiggle: new value every 2 frames (on twos)
    return (hsh(i // 2, seed) * 2 - 1) * amp


# ---------- colourways ----------
# name_cn, name_en, hue shift (deg, see tone()), saturation
CARDS = [
    ("樱粉", "SAKURA", -140, 1.15),
    ("薄荷", "MINT", 30, 1.1),
    ("墨白", "NOIR", 0, 0.0),
    ("落日", "SUNSET", 165, 1.2),
    ("堇紫", "VIOLET", -80, 1.15),
    ("青柠", "LIME", 115, 1.4),
    ("本色", "ORIGINAL", 0, 1.05),
]


def hue_mat(hue):
    a = math.radians(hue)
    c, s = math.cos(a), math.sin(a)
    return torch.tensor(
        [
            [
                0.299 + 0.701 * c + 0.168 * s,
                0.587 - 0.587 * c + 0.330 * s,
                0.114 - 0.114 * c - 0.497 * s,
            ],
            [
                0.299 - 0.299 * c - 0.328 * s,
                0.587 + 0.413 * c + 0.035 * s,
                0.114 - 0.114 * c + 0.292 * s,
            ],
            [
                0.299 - 0.300 * c + 1.25 * s,
                0.587 - 0.588 * c - 1.05 * s,
                0.114 + 0.886 * c - 0.203 * s,
            ],
        ],
        device=dev,
    )


LUM = torch.tensor([0.299, 0.587, 0.114], device=dev).view(3, 1, 1)


def tone(img, k):
    """recolour everything but skin: hue rotation weighted by saturation and distance from skin hue"""
    _, _, hue, sat = CARDS[k]
    l = (img * LUM).sum(0, keepdim=True)
    mx, mn = img.max(0, keepdim=True)[0], img.min(0, keepdim=True)[0]
    sv = (mx - mn) / (mx + 1e-4)
    r, g, b = img[0:1], img[1:2], img[2:3]
    h = (
        torch.atan2(math.sqrt(3) * (g - b), 2 * r - g - b) * 180 / math.pi % 360
    )  # 0 = red
    dsk = torch.minimum((h - 25).abs(), 360 - (h - 25).abs())
    skin = torch.exp(-((dsk / 22) ** 2)) * (sv < 0.45).float()
    w = ((sv - 0.08) / 0.2).clamp(0, 1) * (1 - skin)
    o = torch.einsum("ij,jhw->ihw", hue_mat(hue), img) if hue else img
    o = l + (o - l) * sat
    if sat == 0:
        o = (o - 0.5) * 1.2 + 0.5
    o = img + (o - img) * (w if sat else torch.ones_like(w))
    return o.clamp(0, 1)


PANEL = torch.tensor([0.36, 0.78, 0.86], device=dev).view(3, 1, 1)
KEY = []
for k in range(7):
    c = tone(PANEL.expand(3, 1, 1).clone(), k).view(3)
    if CARDS[k][1] == "NOIR":
        c = torch.tensor([0.08, 0.08, 0.09], device=dev)
    if CARDS[k][1] == "ORIGINAL":
        c = torch.tensor([0.86, 0.2, 0.29], device=dev)  # Daki red
    KEY.append(c.view(3, 1, 1))


def lum(c):
    return float((c.view(3) * LUM.view(3)).sum())


INK = torch.tensor([0.07, 0.06, 0.1], device=dev).view(3, 1, 1)
PAPER = torch.tensor([0.95, 0.93, 0.89], device=dev).view(3, 1, 1)


def ink_on(c):
    return INK if lum(c) > 0.55 else PAPER


# ---------- sources ----------
cap = cv2.VideoCapture("/home/peteryu/work/daki-gacha/idle.mp4")
IDLE = []
while True:
    ok, f = cap.read()
    if not ok:
        break
    IDLE.append(f)


def idle(i):  # character on twos
    f = IDLE[min((i // 2) * 2, len(IDLE) - 1)][..., ::-1].copy()
    return torch.from_numpy(f).to(dev).permute(2, 0, 1).float() / 255.0


# char mask in idle-frame coords: source scaled 0.96 about its centre, dilated for hair motion
cm = cv2.imread("/home/peteryu/work/daki-promo2/charmask.png", 0)
M = np.float32([[0.96, 0, 540 - 562.5 * 0.96], [0, 0.96, 960 - 1000 * 0.96]])
cm = cv2.warpAffine(cm, M, (W, H))
cm = cv2.dilate(cm, np.ones((45, 45), np.uint8))
CMASK = torch.from_numpy(cv2.GaussianBlur(cm, (0, 0), 6)).to(dev).float()[None] / 255.0
# tight cut-out for type behind the character
tm = cv2.dilate(cv2.warpAffine(cv2.imread("/home/peteryu/work/daki-promo2/charmask.png", 0), M, (W, H)), np.ones((13, 13), np.uint8))
TMASK = torch.from_numpy(cv2.GaussianBlur(tm, (0, 0), 2.5)).to(dev).float()[None] / 255.0


rngp = np.random.default_rng(9)


def paper_tex(s):
    n = rngp.standard_normal((H // 2, W // 2)).astype(np.float32)
    n = (
        cv2.GaussianBlur(n, (0, 0), 0.8) * 0.5
        + cv2.GaussianBlur(
            rngp.standard_normal((H // 2, W // 2)).astype(np.float32), (0, 0), 12
        )
        * 6
    )
    t = torch.from_numpy(cv2.resize(n, (W, H))).to(dev)[None]
    return 1 + 0.035 * t.clamp(-2, 2)


PAPERTEX = [paper_tex(s) for s in range(3)]


def cam(img, cx, cy, z, roll=0.0, pad="border"):
    c, s = math.cos(math.radians(roll)), math.sin(math.radians(roll))
    ox, oy = XS - W / 2, YS - H / 2
    sx = cx + (c * ox - s * oy) / z
    sy = cy + (s * ox + c * oy) / z
    g = torch.stack([sx / W * 2 - 1, sy / H * 2 - 1], -1)[None]
    return F.grid_sample(
        img[None], g, mode="bilinear", padding_mode=pad, align_corners=False
    )[0]


# ---------- type and doodles ----------
FONT = {
    "marker": "/home/peteryu/work/daki-promo2/fonts/PermanentMarker-Regular.ttf",
    "brush": "/home/peteryu/work/daki-promo2/fonts/ZhiMangXing-Regular.ttf",
    "hand": "/home/peteryu/work/daki-promo2/fonts/LongCang-Regular.ttf",
    "bebas": "/home/peteryu/work/daki-promo2/fonts/BebasNeue-Regular.ttf",
}
_tc = {}


def text(s, font, size, fill, stroke=0, sfill=(0, 0, 0), track=0):
    key = (s, font, size, fill, stroke, sfill, track)
    if key in _tc:
        return _tc[key]
    f = ImageFont.truetype(FONT[font], size)
    ws = [f.getlength(ch) for ch in s]
    tw = int(sum(ws) + track * (len(s) - 1) + 4 * stroke + 20)
    im = Image.new("RGBA", (tw, int(size * 1.6) + 4 * stroke), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x = 2 * stroke + 10
    for ch, w in zip(s, ws):
        d.text(
            (x, stroke + size * 0.1),
            ch,
            font=f,
            fill=fill + (255,),
            stroke_width=stroke,
            stroke_fill=sfill + (255,),
        )
        x += w + track
    a = np.asarray(im).astype(np.float32) / 255.0
    a[..., :3] *= a[..., 3:]
    bb = im.getbbox()
    a = a[bb[1] : bb[3], bb[0] : bb[2]]
    t = torch.from_numpy(a.copy()).permute(2, 0, 1).to(dev)
    _tc[key] = t
    return t


def c255(c):
    return tuple(int(v * 255) for v in c.view(3).tolist())


def place(dst, spr, cx, cy, scale=1.0, alpha=1.0, rot=0.0, anchor=(0.5, 0.5)):
    if alpha <= 0.002 or scale <= 0.01:
        return dst
    h, w = spr.shape[1:]
    cx = cx + (0.5 - anchor[0]) * w * scale
    cy = cy + (0.5 - anchor[1]) * h * scale
    r = math.hypot(w, h) * scale / 2 + 2
    x0, x1 = max(int(cx - r), 0), min(int(cx + r), W)
    y0, y1 = max(int(cy - r), 0), min(int(cy + r), H)
    if x0 >= x1 or y0 >= y1:
        return dst
    xs, ys = XS[y0:y1, x0:x1] - cx, YS[y0:y1, x0:x1] - cy
    c, s = math.cos(-math.radians(rot)), math.sin(-math.radians(rot))
    u = (c * xs - s * ys) / scale
    v = (s * xs + c * ys) / scale
    g = torch.stack([u / (w / 2), v / (h / 2)], -1)[None]
    o = (
        F.grid_sample(
            spr[None], g, mode="bilinear", padding_mode="zeros", align_corners=False
        )[0]
        * alpha
    )
    dst[:, y0:y1, x0:x1] = o[:3] + dst[:, y0:y1, x0:x1] * (1 - o[3:])
    return dst


def htext(
    dst,
    i,
    seed,
    s,
    font,
    size,
    fill,
    cx,
    cy,
    stroke=0,
    sfill=(0, 0, 0),
    alpha=1.0,
    scale=1.0,
    rot=0.0,
    anchor=(0.5, 0.5),
    amp=2.5,
):
    """hand-lettered text: position and angle re-jittered on twos"""
    spr = text(s, font, size, fill, stroke, sfill)
    return place(
        dst,
        spr,
        cx + sj(i, seed, amp),
        cy + sj(i, seed + 1, amp),
        scale,
        alpha,
        rot + sj(i, seed + 2, 1.2),
        anchor,
    )


def doodle(i, items, progress):
    """boiling marker doodles drawn with PIL; items: ('circle', cx, cy, rx, ry, colour) / ('spark', cx, cy, r, colour)"""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    hk = i // 2
    for n, it in enumerate(items):
        if it[0] == "circle":
            _, cx, cy, rx, ry, colr = it
            N = 90
            end = int(N * 1.18 * c01(progress))
            pts = []
            for j in range(end):
                a = -2.2 + j / N * 2 * math.pi
                wob = (
                    1
                    + 0.05 * math.sin(a * 3 + hsh(hk, n) * 6)
                    + (hsh(hk, n, j // 8) - 0.5) * 0.03
                )
                pts.append(
                    (
                        cx + rx * wob * math.cos(a) * (1 + 0.04 * j / N),
                        cy + ry * wob * math.sin(a),
                    )
                )
            if len(pts) > 1:
                d.line(pts, fill=colr + (255,), width=9, joint="curve")
        else:
            _, cx, cy, r, colr = it
            if progress < 0.3:
                continue
            r = r * oback((progress - 0.3) / 0.3) * (1 + 0.12 * (hsh(hk, n, 7) - 0.5))
            jx, jy = (hsh(hk, n, 1) - 0.5) * 4, (hsh(hk, n, 2) - 0.5) * 4
            pts = []
            for j in range(9):
                a = j * math.pi / 4 - math.pi / 2
                rr = r if j % 2 == 0 else r * 0.28
                pts.append((cx + jx + rr * math.cos(a), cy + jy + rr * math.sin(a)))
            d.line(pts, fill=colr + (255,), width=6, joint="curve")
    a = np.asarray(im).astype(np.float32) / 255.0
    a[..., :3] *= a[..., 3:]
    return torch.from_numpy(a).permute(2, 0, 1).to(dev)


def over(dst, spr):
    return spr[:3] + dst * (1 - spr[3:])


def wash(img, k):
    # colourise the mostly-white art toward the card's key colour
    key = KEY[k]; l = (img * LUM).sum(0, keepdim=True)
    tint = l * (key / key.max().clamp(min=.2)) if lum(key) > .15 else l.expand(3, -1, -1)
    return (img * .68 + (tint * .5 + img * .5) * .32 * 1.08).clamp(0, 1)


def colour_frame(i, k, cx, cy, z, roll):
    return cam(wash(tone(idle(i), k), k), cx, cy, z, roll)


# ---------- V3: image-space helpers ----------
def imwarp(img, tx=0.0, ty=0.0, zx=1.0, zy=None, px=W / 2, py=H / 2, pad="border"):
    """zoom about screen point (px, py) by (zx, zy), then translate by (tx, ty)"""
    zy = zx if zy is None else zy
    sx = px + (XS - px - tx) / zx
    sy = py + (YS - py - ty) / zy
    g = torch.stack([sx / W * 2 - 1, sy / H * 2 - 1], -1)[None]
    return F.grid_sample(img[None], g, mode="bilinear", padding_mode=pad, align_corners=False)[0]


def lerps(a, b, n):
    return [a + (b - a) * j / (n - 1) for j in range(n)] if n > 1 else [b]


def avg(ims):
    return sum(ims) / len(ims)


def scr(k, x, y):  # idle-frame point -> screen point under card k's framing (roll ignored)
    s = SHOTS[k]
    return ((x - s["c"][0]) * s["z"][0] + W / 2, (y - s["c"][1]) * s["z"][0] + H / 2)


EYE = (378, 444)
SHOE = (330, 1720)

# ---------- cards ----------
# c: framing centre (idle coords), z: zoom start/end, n: big numeral (screen x, y, size, rot), doo: doodles
SHOTS = [
    dict(c=(470, 720), z=(1.16, 1.24), roll=-2, n=(540, 430, 1150, 0), doo=[("spark", 900, 860, 60), ("spark", 160, 980, 40)]),
    dict(c=(560, 760), z=(1.0, 1.06), roll=2, n=(540, 400, 1150, -4), doo=[("circle", 540, 1000, 330, 190)]),
    dict(c=(450, 600), z=(1.42, 1.5), roll=0, n=(620, 420, 1150, 0), doo=[("spark", 880, 1150, 55)]),
    dict(c=(540, 760), z=(1.08, 1.14), roll=3, n=(520, 420, 1150, 3), doo=[("spark", 200, 1180, 55), ("spark", 920, 1000, 45)]),
    dict(c=(540, 1290), z=(1.0, 1.05), roll=-3, n=(815, 1300, 650, -3), nc=(24, 22, 28), doo=[("circle", 420, 1340, 300, 200)]),
    dict(c=(520, 740), z=(1.15, 1.22), roll=-2, n=(560, 400, 1150, 2), doo=[("spark", 880, 900, 60), ("spark", 170, 1000, 40)]),
    dict(c=(540, 780), z=(1.0, 1.07), roll=0, n=(540, 420, 1200, 0), doo=[("spark", 920, 900, 70), ("spark", 140, 1050, 50), ("spark", 960, 1250, 40)]),
]
CSTART = [4, 6, 8, 10, 12, 14, 16, 20, 24]  # beat where card k (7 = fly-back ending, 8 = loop) lands
BAND = 330


def card_cam(i, k, lb, nb):
    s = SHOTS[k]
    u = c01(lb / nb)
    z = s["z"][0] + (s["z"][1] - s["z"][0]) * (1 - (1 - u) ** 2)
    hit = max(lb - math.floor(lb), 0) if lb >= 0 else 9  # time since the last beat
    z *= 1 + 0.05 * math.exp(-hit * 8)  # zoom punch on every beat
    sh = 10 * math.exp(-hit * 10) if lb >= 0.9 else 0  # shake on later beats
    return s["c"][0] + sj(i, 31, sh), s["c"][1] + sj(i, 32, sh), z, s["roll"] * (0.6 + 0.4 * u)


def numeral(img, i, k, lb, x, y, size, rot, colour, alpha=1.0, scale=1.0):
    e = oexpo(lb / 0.35) if lb > 0 else 0.0
    return htext(img, i, 500 + k, f"{k + 1:02d}", "bebas", size, colour, x, y + 260 * (1 - e) - 30 * c01(lb / 4),
                 alpha=alpha * (0.2 + 0.8 * e), scale=scale, rot=rot, amp=0)


def name_type(img, i, k, lb, y0, ink, slab=True):
    """the key-colour band with the colour name; y0 = band top"""
    key = KEY[k]
    cn, en = CARDS[k][0], CARDS[k][1]
    if slab:
        e = oexpo(lb / 0.3) if lb > 0 else 0.0
        m = ((XS < e * W * 1.04) & (YS >= y0) & (YS < y0 + BAND)).float()[None]
        img = img * (1 - m) + key * PAPERTEX[(i // 2) % 3] * m
    pc = 1 + 0.9 * (1 - oexpo(lb / 0.22)) if lb > 0 else 1.9
    img = htext(img, i, 130 + k, cn, "brush", 280, c255(ink), 300, y0 + BAND / 2 + 5, scale=pc,
                alpha=c01(lb / 0.08), rot=-4)
    img = htext(img, i, 140 + k, en, "marker", 72, c255(ink), 1010, y0 + 115, anchor=(1, 0.5),
                scale=oback((lb - 0.5) / 0.3), alpha=c01((lb - 0.5) / 0.08), rot=-3)
    img = htext(img, i, 120 + k, f"{k + 1:02d}/07", "bebas", 96, c255(ink), 1010, y0 + 215, anchor=(1, 0.5),
                alpha=c01((lb - 0.15) / 0.15), amp=0)
    img = htext(img, i, 100 + k, "DAKI · STREETWEAR COLLECTION", "bebas", 34, c255(ink), 1010, y0 + 290,
                anchor=(1, 0.5), alpha=c01((lb - 0.3) / 0.2), amp=0)
    return img


def card_img(i, k, lb, nb):
    """one card: colour art, huge numeral cut out behind the character, key band with the name"""
    cx, cy, z, roll = card_cam(i, k, lb, nb)
    art = colour_frame(i, k, cx, cy, z, roll)
    m = cam(TMASK, cx, cy, z, roll, "zeros")
    key = KEY[k]
    nx, ny, ns, nr = SHOTS[k]["n"]
    ncol = c255(key) if 0.12 < lum(key) < 0.8 else (c255(INK) if lum(key) >= 0.8 else (24, 22, 28))
    ncol = SHOTS[k].get("nc", ncol)
    bg = numeral(art.clone(), i, k, lb, nx, ny, ns, nr, ncol, alpha=0.96)
    img = bg * (1 - m) + art * m
    if lb > 0.6:
        d = SHOTS[k]["doo"]
        col = c255(key) if 0.15 < lum(key) < 0.75 else c255(INK)
        img = over(img, doodle(i, [(it[0], *it[1:], col) for it in d], (lb - 0.6) / 0.6))
    img = name_type(img, i, k, lb, H - BAND, ink_on(key))
    return img + 0.22 * math.exp(-max(lb, 0) * 14)


# ---------- the hand: 7 face-up avatar cards ----------
CW, CH, CS = 440, 660, 0.45  # card size on screen, content scale (card = window onto a full frame scaled by CS)
AV = (395, 640, 1.8)  # avatar framing (idle coords centre, zoom): face sits upper-right, the part a fan leaves exposed
STEP, R = 8.0, 760  # fan step (deg), radius from the pivot to card centre
PY0, PY1 = 1760 + R, 1280 + R  # pivot y: closed stack at the bottom edge -> fanned hand
T0, STAG, DUR = -1.75, 0.25, 2.25  # card c starts sliding at beat T0 + c*STAG (16ths), takes DUR beats
LIFTS = [(0.5 + 0.5 * n, c) for n, c in enumerate([1, 2, 3, 4, 5, 6, 0])]  # (beat, card) flicks on 8ths; 01 last
LIFT = 230  # px a flicked card rises along its radius
PULL = 3.75  # card 01 leaves the hand on the 16th before the drop


def hand_pose(c, t):
    """card c at beat t (t < 0 = the ending's last bar, t = 0 is frame 0): (cx, cy, rot) and slide progress"""
    p = 1 - (1 - c01((t - T0 - STAG * c) / DUR)) ** 3
    th = math.radians((c - 3) * STEP * p)
    py = PY0 + (PY1 - PY0) * p
    return W / 2 + R * math.sin(th) + (c - 3) * 5 * (1 - p), py - R * math.cos(th), math.degrees(th) + (c - 3) * 1.2 * (1 - p), p


def lift(i, c):
    """flick: the card pops up along its radius on its 8th and settles over the next 8th"""
    v = 0.0
    for b, cc in LIFTS:
        f = i - bf(b)
        if cc == c and f >= 0:
            v = max(v, oback(f / 3) * math.exp(-max(f - 3, 0) / 4))
    return v


def key_col(c, lo=0.15):  # key colour as type/glow colour; NOIR's near-black key reads as paper
    return KEY[c] if lum(KEY[c]) > lo else PAPER * 0.85


def sdf(lx, ly, hw, hh, r):
    qx, qy = lx.abs() - (hw - r), ly.abs() - (hh - r)
    return torch.sqrt(qx.clamp(min=0) ** 2 + qy.clamp(min=0) ** 2) + torch.minimum(torch.maximum(qx, qy), torch.zeros_like(qx)) - r


def draw_card(dst, i, c, src, cx, cy, s, rot, w=None, h=None, glow=0.0):
    """one card: rounded window onto the full-frame image src (scaled by s about the card centre), thin key border,
    soft drop shadow, corner index. s = 1, w = W, h = H at the centre is exactly the full frame."""
    w, h = w or CW * s / CS, h or CH * s / CS
    rr = math.hypot(w, h) / 2 + 60
    x0, x1, y0, y1 = max(int(cx - rr), 0), min(int(cx + rr), W), max(int(cy - rr), 0), min(int(cy + rr), H)
    if x0 >= x1 or y0 >= y1:
        return dst
    ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    xs, ys = XS[y0:y1, x0:x1] - cx, YS[y0:y1, x0:x1] - cy
    lx, ly = ca * xs + sa * ys, -sa * xs + ca * ys
    k = s / CS  # card-size factor for border, radius, shadow
    rad, bw = 26 * k, 7 * k
    d = sdf(lx, ly, w / 2, h / 2, rad)
    sl = ca * xs + sa * (ys - 22 * k), -sa * xs + ca * (ys - 22 * k)
    ds = sdf(sl[0], sl[1], w / 2, h / 2, rad)
    sh = (0.55 * (1 - (ds / (40 * k)).clamp(0, 1)) ** 2)[None]
    out = dst[:, y0:y1, x0:x1] * (1 - sh)
    g = torch.stack([(W / 2 + lx / s) / W * 2 - 1, (H / 2 + ly / s) / H * 2 - 1], -1)[None]
    art = F.grid_sample(src[None], g, mode="bilinear", padding_mode="border", align_corners=False)[0]
    art = art * (1 + 0.08 * (1 - ((lx + ly) / (w + h) + 0.5).clamp(0, 1)))[None]  # faint top-left sheen
    m = (0.5 - d).clamp(0, 1)[None]
    bm = m * (d + bw + 0.5).clamp(0, 1)[None]
    art = art * (1 - bm) + key_col(c, 0.1) * bm
    art = art + glow * key_col(c) * 0.25 * (d > -bw * 4).float()[None]
    dst[:, y0:y1, x0:x1] = out * (1 - m) + art * m
    # corner index, top-right (the corner a left-over-right fan leaves exposed)
    ix, iy = w / 2 - 44 * k, -h / 2 + 52 * k
    return place(dst, text(f"{c + 1:02d}", "bebas", 64, c255(key_col(c, 0.1)), 3, (12, 10, 16)),
                 cx + ca * ix - sa * iy, cy + sa * ix + ca * iy, scale=k, rot=rot)


def hand_bg(i, gc, gt=1.0):
    """dark table with a soft key-colour glow of colourway gc"""
    g = torch.exp(-(((XS - W / 2) / 760) ** 2 + ((YS - 1050) / 900) ** 2))[None]
    return (INK * 0.85 + key_col(gc) * 0.33 * gt * g) * PAPERTEX[(i // 2) % 3]


def hand_type(img, i, c, f):
    """roll-call type for the flicked card: huge numeral, colour name"""
    pop = 1 + 0.25 * (1 - oexpo(f / 4))
    col = c255(key_col(c))
    img = htext(img, i, 700 + c, f"{c + 1:02d}", "bebas", 620, col, W / 2 - 200, 500, scale=pop, amp=0)
    img = htext(img, i, 710 + c, CARDS[c][0], "brush", 180, (245, 240, 232), W / 2 + 285, 430, scale=pop, rot=-4)
    img = htext(img, i, 720 + c, CARDS[c][1], "marker", 64, col, W / 2 + 285, 610, rot=-3)
    return img


def index_row(img, i):
    """01..07 in their key colours: the roster as type, shown while no card is flicked"""
    for c in range(7):
        img = htext(img, i, 740 + c, f"{c + 1:02d}", "bebas", 160, c255(key_col(c)), W / 2 + (c - 3) * 150, 600, amp=0)
    return img


def caption(img):
    return htext(img, 0, 730, "DAKI · STREETWEAR COLLECTION", "bebas", 40, (235, 230, 222), W / 2, 110, amp=0, alpha=0.8)


def hand(i, t, skip=()):
    """the fanned hand at beat t (opening t in [0, 4), ending t in [-4, 0))"""
    av = idle(i)
    base = cam(av, *AV)
    flick = [(b, c) for b, c in LIFTS if bf(b) <= i and t >= 0]
    gc = flick[-1][1] if flick else 6
    img = caption(hand_bg(i, gc))
    img = hand_type(img, i, gc, i - bf(flick[-1][0])) if flick else index_row(img, i)
    for c in range(6, -1, -1):  # card 01 on top, 07 at the bottom
        if c in skip:
            continue
        cx, cy, rot, p = hand_pose(c, t)
        lv = lift(i, c) if t >= 0 else 0.0
        a = math.radians(rot)
        cx, cy = cx + LIFT * lv * math.sin(a) - (c - 3) * 30 * lv, cy - LIFT * lv * math.cos(a)  # flick up and inward
        img = draw_card(img, i, c, wash(tone(base, c), c), cx, cy, CS * (1 + 0.05 * lv), rot + 3 * lv * (1 if c % 2 else -1),
                        glow=lv)
    return img


def pull(i, u):
    """card 01 leaves the hand and flies to camera; u in (0, 1] -> full frame = card_img(0) framing at u = 1"""
    e = u ** 1.6
    img = hand(i, PULL, skip=(0,))
    cx, cy, rot, _ = hand_pose(0, PULL)
    a = math.radians(rot)
    cx, cy = cx + LIFT * math.sin(a) + 90, cy - LIFT * math.cos(a)
    tx, ty, tz, troll = card_cam(i, 0, 0, 2)
    ccx = AV[0] + (tx - AV[0]) * e
    ccy = AV[1] + (ty - AV[1]) * e
    cz = AV[2] * (tz / AV[2]) ** e
    src = wash(tone(cam(idle(i), ccx, ccy, cz, troll * e), 0), 0)
    s = CS * (1 / CS) ** e
    return draw_card(img, i, 0, src, cx + (W / 2 - cx) * e, cy + (H / 2 - cy) * e, s, rot * (1 - e),
                     w=CW * (W / CW) ** e, h=CH * (H / CH) ** e)


def intro(i):
    t = i / FPS / BEAT
    if i >= bf(PULL):
        return pull(i, (i - bf(PULL) + 1) / (bf(4) - bf(PULL) + 1))
    return hand(i, t)


# ---------- ending: the cards fly back onto the stack, then re-fan (= the opening's pre-roll) ----------
FLY = 0.5  # beats per fly-back; card 07 leaves the full frame on the bar (beat 20), 06..01 follow on 16ths


def fly_win(c):
    s0 = CSTART[7] + STAG * (6 - c)
    return s0, s0 + FLY


def ending(i, j):
    b = CSTART[7] + j / FPS / BEAT
    t = b - CSTART[8]
    img = index_row(caption(hand_bg(i, 6)), i)
    base = cam(idle(i), *AV)
    for c in range(6, -1, -1):
        s0, s1 = fly_win(c)
        if b < s0 and c < 6:
            continue
        sx, sy, srot, _ = hand_pose(c, t)
        if b >= s1:
            img = draw_card(img, i, c, wash(tone(base, c), c), sx, sy, CS, srot)
            continue
        u = c01((b - s0) / FLY)
        e = 1 - (1 - u) ** 3
        av = wash(tone(base, c), c)
        if c == 6:  # the full-frame card 07 shrinks back from camera, its framing easing to the avatar crop
            tx, ty, tz, troll = card_cam(i, 6, b - CSTART[6], 4)
            src = wash(tone(cam(idle(i), tx + (AV[0] - tx) * e, ty + (AV[1] - ty) * e, tz * (AV[2] / tz) ** e,
                                troll * (1 - e)), 6), 6)
            src = src + (card_img(i, 6, b - CSTART[6], 4) - src) * (1 - c01(e / 0.35))
            fx, fy, fs, frot = W / 2, H / 2, 1.0, 0.0
            w = CW * (W / CW) ** (1 - e)
            h = CH * (H / CH) ** (1 - e)
        else:  # from camera, swinging in from alternating sides
            sd = 1 if c % 2 else -1
            src, fx, fy, fs, frot = av, W / 2 + sd * 760, 260, 1.15, -sd * 28
            w = h = None
        s = fs * (CS / fs) ** e
        img = draw_card(img, i, c, src, fx + (sx - fx) * e, fy + (sy - fy) * e, s, frot + (srot - frot) * e, w=w, h=h)
    return img + 0.2 * math.exp(-j / FPS / BEAT * 14)


def seg_img(i, k, j):
    """card k (7 = fly-back ending) at j frames after its cut (j may be negative)"""
    lb = j / FPS / BEAT
    if k >= 7:
        return ending(i, j)
    return card_img(i, k, lb, 4 if k == 6 else 2)


# ---------- transitions: (frames before cut, frames after cut) ----------
TRANS = {1: "whip", 2: "blades", 3: "iris", 4: "block", 5: "push", 6: "smear"}
WIN = {"whip": (4, 4), "blades": (5, 4), "iris": (6, 3), "block": (5, 5), "push": (6, 5), "smear": (3, 3)}
WHIP = {-4: 0.03, -3: 0.1, -2: 0.25, -1: 0.5, 0: 0.8, 1: 0.94, 2: 0.985, 3: 1.0}


def pan(A, B, p):  # A at -p*W, B to its right
    d = int(round(p * W))
    out = torch.zeros_like(A)
    if d < W:
        out[:, :, : W - d] = A[:, :, d:]
    out[:, :, max(W - d, 0):] = B[:, :, : min(d, W)]
    return out


def blades(A, B, j, colour, ang, pre):
    """diagonal shutter blades: close over A before the cut, open over B after it"""
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    v = XS * ca + YS * sa  # across blades
    u = (-XS * sa + YS * ca)
    u = (u - u.min()) / (u.max() - u.min())
    n = torch.floor(v / 170)
    odd = (n % 2 == 1)
    c = {-5: 0.12, -4: 0.3, -3: 0.55, -2: 0.8, -1: 1.05}.get(j) if j < 0 else 1 - {0: 0.45, 1: 0.75, 2: 0.92, 3: 1.0}[j]
    m = torch.where(odd, u > 1 - c, u < c).float()[None]
    edge = torch.where(odd, ((u - (1 - c)).abs() < 0.004), ((u - c).abs() < 0.004)).float()[None]
    base = A if j < 0 else B
    img = base * (1 - m) + colour * PAPERTEX[0] * m
    return img * (1 - edge) + INK * edge


def trans(i, kind, kA, kB, j, cut):
    """frame of the cut from seg kA to seg kB, j frames from the cut frame"""
    A = lambda: seg_img(i, kA, i - CUTF[kA])
    B = lambda: seg_img(i, kB, j)
    if kind == "whip":
        a, b = A(), B()
        p0, p1 = WHIP.get(j - 1, 0.0), WHIP[j]
        st = 1 + 7 * (p1 - p0)  # directional stretch of the colour images, anchored at the seam (no grey averaging)
        return pan(imwarp(a, zx=st, px=W), imwarp(b, zx=st, px=0), (p0 + p1) / 2)
    if kind == "blades":
        return blades(A() if j < 0 else None, B() if j >= 0 else None, j, KEY[kB], 62, j < 0)
    if kind == "iris":
        ex, ey = scr(kA, *EYE)
        r = {-6: 0, -5: 45, -4: 120, -3: 270, -2: 560, -1: 1100}.get(j, 3000)
        b = B()
        if j < 0:
            zA = 1 + 1.6 * ((j + 7) / 6) ** 2
            a = imwarp(A(), zx=zA, px=ex, py=ey)
            b = imwarp(b, zx=1.35, px=ex, py=ey)
            d = torch.sqrt((XS - ex) ** 2 + (YS - ey) ** 2)[None]
            m = (r - d).clamp(0, 1)
            ring = ((d - r).abs() < 14).float() * (r > 0)
            img = a * (1 - m) + b * m
            img = img * (1 - ring) + KEY[kB] * ring
            return img
        return imwarp(b, zx={0: 1.2, 1: 1.07, 2: 1.015}[j], px=ex, py=ey)
    if kind == "block":
        key = KEY[kB]
        ink = ink_on(key)
        if j < 0:
            top = H * {-5: 0.85, -4: 0.62, -3: 0.38, -2: 0.16, -1: 0.03}[j]
            base = A()
        else:
            top = -H * {0: 0.0, 1: 0.28, 2: 0.58, 3: 0.84, 4: 0.98}[j]
            base = B()
        m = ((YS >= top) & (YS < top + H)).float()[None]
        img = base * (1 - m) + key * PAPERTEX[1] * m
        img = htext(img, i, 600, f"{kB + 1:02d}", "bebas", 1250, c255(ink), W / 2, top + H * 0.42, amp=0)
        img = htext(img, i, 610, CARDS[kB][0], "brush", 300, c255(ink), W / 2, top + H * 0.78, rot=-4)
        return img
    if kind == "push":
        if j < 0:
            px, py = scr(kA, *SHOE)
            zs = {-6: 1.0, -5: 1.06, -4: 1.18, -3: 1.4, -2: 1.75, -1: 2.3}
            a = A()
            return avg([imwarp(a, zx=z, px=px, py=py) for z in lerps(zs[j], zs[j] * 1.1, 3)])
        px, py = scr(kB, *EYE)  # come out of 06's face (colour), not the white shirt
        zs = {0: 2.4, 1: 1.7, 2: 1.3, 3: 1.1, 4: 1.02}
        b = B()
        img = avg([imwarp(b, zx=z, px=px, py=py) for z in lerps(zs[j], zs[j] * 0.94, 3)])
        return img if j > 1 else ((img - 0.5) * 1.18 + 0.47).clamp(0, 1)  # contrast punch: the cut frame must not read pale
    if kind == "smear":
        if j < 0:
            # directional stretch of the colour image itself (no averaging -> no grey streaks)
            sx, tx = {-3: (1.6, -60), -2: (3.2, -260), -1: (5.5, -520)}[j]
            img = imwarp(A(), tx=tx, zx=sx, zy=0.96, px=0)
            if j == -1:  # 07 already stretching in from the right behind a hard seam
                seam = W * 0.42
                b = imwarp(B(), tx=seam - W * 0.2, zx=4.0, zy=0.92, px=W * 0.2)
                img = torch.where(XS[None] > seam, b, img)
            # key-colour speed lines of the incoming card
            lines_ = ((torch.sin(YS * 0.37 + j * 1.7) > 0.992) & (torch.sin(XS * 0.004 + YS * 0.011 + j) > 0.2)).float()[None]
            return img * (1 - lines_) + KEY[kB] * lines_
        b = B()
        sx, sy, tx = {0: (1.45, 0.86, 140), 1: (0.93, 1.05, -20), 2: (1.02, 0.99, 0)}[j]
        return imwarp(b, tx=tx, zx=sx, zy=sy)
    raise ValueError(kind)


CUTF = [bf(b) for b in CSTART]  # cut frame of each segment; CUTF[8] = NF (loop)


def frame(i):
    if i < CUTF[0]:
        img = intro(i)
    else:
        k = max(n for n in range(8) if CUTF[n] <= i)
        j = i - CUTF[k]
        kind_in = TRANS.get(k)
        nxt = TRANS.get(k + 1)
        if nxt and CUTF[k + 1] - i <= WIN[nxt][0]:
            img = trans(i, nxt, k, k + 1, i - CUTF[k + 1], CUTF[k + 1])
        elif kind_in and j < WIN[kind_in][1]:
            img = trans(i, kind_in, k - 1, k, j, CUTF[k])
        else:
            img = seg_img(i, k, j)
        if k == 0 and j < 2:  # impact frames on the drop
            img = 1 - img
        if k == 0 and j < 6:
            img = imwarp(img, tx=sj(i, 41, 30), ty=sj(i, 42, 30), zx=1 + 0.08 * math.exp(-j * 0.6))
    vy, vx = YS / H * 2 - 1, XS / W * 2 - 1
    img = img * (1 - 0.18 * ((vx**2 * 0.7 + vy**2) - 0.5).clamp(0, 1))
    img = img + (torch.rand(1, H, W, device=dev) - 0.5) * 0.03
    return (img.clamp(0, 1) * 255).byte().permute(1, 2, 0).cpu().numpy()


with torch.no_grad():
    if args.stills:
        ims = []
        for s in args.stills.split(","):
            fi = int(s[1:]) if s.startswith("f") else int(round(float(s) * FPS))
            f = frame(fi)
            f = cv2.resize(f[..., ::-1], (W // 4, H // 4), interpolation=cv2.INTER_AREA)
            cv2.putText(f, f"f{fi}", (6, 22), 0, 0.7, (0, 255, 255), 2)
            ims.append(f)
        rows = [np.hstack(ims[r : r + 8] + [np.zeros_like(ims[0])] * (8 - len(ims[r : r + 8]))) for r in range(0, len(ims), 8)]
        cv2.imwrite(args.out if args.out.endswith(".jpg") else "stills.jpg", np.vstack(rows))
    else:
        ff = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
             "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "15", "-preset", "medium", "-pix_fmt", "yuv420p",
             args.out],
            stdin=subprocess.PIPE,
        )
        for i in range(NF):
            ff.stdin.write(frame(i).tobytes())
        ff.stdin.close()
        ff.wait()
