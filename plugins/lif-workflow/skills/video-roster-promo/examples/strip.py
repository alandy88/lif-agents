"""V4: three parallax film strips of faces stepping on 8ths -> face 01 pulled out into card 01 on the drop ->
7 cards joined by designed beat transitions -> cards slide back into the strips, which land on frame 0 (loop).

usage: promo.py                     -> promo_silent.mp4 (1080x1920, 30 fps)
       promo.py --stills 0.1,1.8,2.05,...   (seconds) -> stills.jpg
Music grid: music_cut.wav (cutmusic.py), beats at k*0.49188 s from t=0, drop at beat 4, hit/stop at beat 24.
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
DROP = 4 * BEAT  # beat 4 of the cut audio = source bass drop at 15.776 s
NBEATS = 28  # 4 intro + 6 cards x 2 + card 07 x 4 + strips x 8
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
    if bf(24) <= i < NF:  # last bar runs the (looping) idle into its frame 0, so the video loops on the pose too
        i = len(IDLE) - NF + i
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


def gblur(x, s):
    k = int(s * 3) * 2 + 1
    ax = torch.arange(k, device=dev) - k // 2
    ker = torch.exp(-(ax**2) / (2 * s * s))
    ker /= ker.sum()
    C = x.shape[0]
    y = F.conv2d(
        F.pad(x[None], (k // 2, k // 2, 0, 0), mode="replicate"),
        ker.view(1, 1, 1, k).repeat(C, 1, 1, 1),
        groups=C,
    )
    y = F.conv2d(
        F.pad(y, (0, 0, k // 2, k // 2), mode="replicate"),
        ker.view(1, 1, k, 1).repeat(C, 1, 1, 1),
        groups=C,
    )
    return y[0]


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


def rrect_mask(cx, cy, w, h, r):
    qx = (XS - cx).abs() - (w / 2 - r)
    qy = (YS - cy).abs() - (h / 2 - r)
    d = (
        torch.sqrt(qx.clamp(min=0) ** 2 + qy.clamp(min=0) ** 2)
        + torch.minimum(torch.maximum(qx, qy), torch.zeros_like(qx))
        - r
    )
    return (-d).clamp(-1, 1)[None] * 0.5 + 0.5


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
    dict(c=(540, 1560), z=(1.2, 1.26), roll=-3, n=(540, 1380, 700, -3), nc=(24, 22, 28), doo=[("circle", 420, 1120, 300, 200)]),
    dict(c=(520, 740), z=(1.15, 1.22), roll=-2, n=(560, 400, 1150, 2), doo=[("spark", 880, 900, 60), ("spark", 170, 1000, 40)]),
    dict(c=(540, 780), z=(1.0, 1.07), roll=0, n=(540, 420, 1200, 0), doo=[("spark", 920, 900, 70), ("spark", 140, 1050, 50), ("spark", 960, 1250, 40)]),
]
CSTART = [4, 6, 8, 10, 12, 14, 16, 20, 28]  # beat where card k (7 = lookbook, 8 = loop) lands
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


# ---------- V4 opening / ending: three parallax film strips of faces, stepping on 8ths ----------
E8 = BEAT / 2
TILT = -5.0
CT, ST = math.cos(math.radians(TILT)), math.sin(math.radians(TILT))
U = (XS - W / 2) * CT + (YS - H / 2) * ST  # along the strips
V = -(XS - W / 2) * ST + (YS - H / 2) * CT  # across the strips
FACE = (451, 470)
# v: band centre, band: band half-height, tw/th: tile, pitch, sp: tiles moved per hero step (sign = direction),
# ph: colourway phase, z: face zoom, hp/hw/hh/hv: sprocket hole period, width, height, offset from band edge
ROWS = [
    dict(
        v=-772,
        band=212,
        tw=290,
        th=336,
        pitch=322,
        sp=-0.5,
        ph=3,
        z=0.8,
        hp=46,
        hw=24,
        hh=20,
        hv=22,
    ),
    dict(
        v=0,
        band=522,
        tw=780,
        th=900,
        pitch=830,
        sp=1.0,
        ph=0,
        z=1.9,
        hp=64,
        hw=36,
        hh=28,
        hv=36,
    ),
    dict(
        v=772,
        band=212,
        tw=290,
        th=336,
        pitch=322,
        sp=-1.0,
        ph=5,
        z=0.8,
        hp=46,
        hw=24,
        hh=20,
        hv=22,
    ),
]
UMAX = 680  # |u| reach of the screen along the strips


def rpt(u, v):  # strip coords -> screen
    return W / 2 + u * CT - v * ST, H / 2 + u * ST + v * CT


def rr(lu, lv, w, h, r):  # rounded-rect coverage in a tile's local coords
    qx, qy = lu.abs() - (w / 2 - r), lv.abs() - (h / 2 - r)
    d = (
        torch.sqrt(qx.clamp(min=0) ** 2 + qy.clamp(min=0) ** 2)
        + torch.minimum(torch.maximum(qx, qy), torch.zeros_like(qx))
        - r
    )
    return (-d).clamp(-1, 1)[None] * 0.5 + 0.5


def rtile(src, fx, fy, z, cx, cy, w, h, ang, r=22):
    """src sampled upright in a tile at screen (cx, cy) rotated by ang: source (fx, fy) at the tile centre"""
    c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    lu = (XS - cx) * c + (YS - cy) * s
    lv = -(XS - cx) * s + (YS - cy) * c
    g = torch.stack([(fx + lu / z) / W * 2 - 1, (fy + lv / z) / H * 2 - 1], -1)[None]
    img = F.grid_sample(
        src[None], g, mode="bilinear", padding_mode="border", align_corners=False
    )[0]
    return img, rr(lu, lv, w, h, r), lu, lv


_tone = {}


def toned(i, k, soft=False):
    """card k's colourway of the held idle frame; soft = defocused (depth of field)"""
    key = (i // 2, k, soft)
    if key not in _tone:
        if len(_tone) > 40:
            _tone.clear()
        if soft:
            x = F.avg_pool2d(toned(i, k)[None], 4)
            x = F.interpolate(
                gblur(x[0], 2.2)[None],
                size=(H, W),
                mode="bilinear",
                align_corners=False,
            )[0]
        else:
            x = wash(tone(idle(i), k), k)
        _tone[key] = x
    return _tone[key]


def row_layer(i, r, P, fill, sharp):
    """one strip at hero position P; fill(k, r) -> 0 empty slot .. 1 face in place"""
    R = ROWS[r]
    off = R["sp"] * P
    img = INK * 1.3 * PAPERTEX[2] + torch.zeros(3, H, W, device=dev)
    for vh in (R["v"] - R["band"] + R["hv"], R["v"] + R["band"] - R["hv"]):
        holes = (
            (((U + off * R["pitch"]) % R["hp"]) < R["hw"])
            & ((V - vh).abs() < R["hh"] / 2)
        ).float()[None]
        img = img * (1 - holes) + PAPER * 0.82 * holes
    n0 = math.floor(off - UMAX / R["pitch"]) - 1
    for n in range(n0, n0 + int(2 * UMAX / R["pitch"]) + 4):
        u = (n - off) * R["pitch"]
        if abs(u) > UMAX + R["tw"] / 2:
            continue
        k = (n + R["ph"]) % 7
        cx, cy = rpt(u, R["v"])
        centre = r == 1 and abs(u) < R["pitch"] / 2
        fs = fill(k, r)
        src = toned(i, k, soft=not (centre and sharp))
        art, m, lu, lv = rtile(src, *FACE, R["z"], cx, cy, R["tw"], R["th"], TILT)
        if r != 1 or not centre:
            art = art * 0.78  # depth: everything but the hero face sits back
        if fs < 1:
            slot = KEY[k] * PAPERTEX[1]
            if fs > 0:  # the face slides down into its slot
                dv = -(1 - fs) * R["th"]
                art, _, _, _ = rtile(
                    src,
                    FACE[0],
                    FACE[1] - dv / R["z"],
                    R["z"],
                    cx,
                    cy,
                    R["tw"],
                    R["th"],
                    TILT,
                )
                cov = (lv < dv + R["th"] / 2).float()[None]
                edge = ((lv - dv - R["th"] / 2).abs() < 5).float()[None]
                art = art * cov + slot * (1 - cov)
                art = art * (1 - edge) + PAPER * edge
            else:
                art = slot + torch.zeros_like(art)
        img = img * (1 - m) + art * m
        if r == 1:
            col = c255(KEY[k]) if k != 2 else (245, 245, 245)
            if fs < 1:  # empty slot: big numeral in ink
                col = c255(ink_on(KEY[k]))
                img = htext(
                    img,
                    i,
                    220 + k,
                    f"{k + 1:02d}",
                    "bebas",
                    520,
                    col,
                    cx,
                    cy,
                    rot=TILT,
                    amp=0,
                    alpha=1 - c01(fs * 1.5),
                )
            lx, ly = -R["tw"] / 2 + 34, R["th"] / 2 - 26
            img = htext(
                img,
                i,
                200 + k,
                f"{k + 1:02d}",
                "bebas",
                210,
                col,
                cx + lx * CT - ly * ST,
                cy + lx * ST + ly * CT,
                anchor=(0, 1),
                rot=TILT,
                amp=0,
                alpha=c01(fs * 3 - 2),
            )
    return img


def full(k, r):
    return 1.0


def rack(i, P, Pprev, fill=full, sharp=True):
    """the three strips; Pprev = hero position last frame (motion blur along each strip)"""
    img = KEY[round(P) % 7] * PAPERTEX[0] + torch.zeros(
        3, H, W, device=dev
    )  # gaps take the hero's key colour
    for r in (0, 2, 1):
        R = ROWS[r]
        lay = row_layer(i, r, P, fill, sharp)
        d = (
            (P - Pprev) * R["sp"] * R["pitch"] * 0.8
        )  # shutter: 80% of this frame's travel
        if abs(d) > 2:
            lay = avg([imwarp(lay, tx=s * CT, ty=s * ST) for s in lerps(0, d, 8)])
        bm = ((R["band"] - (V - R["v"]).abs()).clamp(-1, 1) * 0.5 + 0.5)[None]
        img = img * (1 - bm) + lay * bm
    return img


GL = {
    4: 0.04,
    3: 0.16,
    2: 0.45,
    1: 0.82,
}  # fast glide into each 8th (frames before landing -> travel), hard stop
LAND_IN = [
    (int(round(e * E8 * FPS)), e) for e in range(8)
]  # (frame, hero position): 01..07 then 01 again


def glide(i, lands):
    """hero position at frame i from a list of (landing frame, position); returns P, frames to next landing"""
    L, p = max((x for x in lands if x[0] <= i), key=lambda x: x[0])
    nxt = [x for x in lands if x[0] > i]
    if not nxt:
        return float(p), 99
    L2, p2 = min(nxt, key=lambda x: x[0])
    f = L2 - i
    return p + (p2 - p) * GL.get(f, 0.0), f


def lifted(base, src, f0, f1, z0, z1, w0, h0, w1, h1, a0, a1, e, shade):
    """one tile pulled out of the strip (e: 0 = in the strip, 1 = full screen); base is dimmed behind it"""
    fx, fy = f0[0] + (f1[0] - f0[0]) * e, f0[1] + (f1[1] - f0[1]) * e
    z = z0 + (z1 - z0) * e
    w, h, a = w0 + (w1 - w0) * e, h0 + (h1 - h0) * e, a0 + (a1 - a0) * e
    art, m, _, _ = rtile(src, fx, fy, z, W / 2, H / 2, w, h, a, r=22 * (1 - e) + 1)
    _, sh, _, _ = rtile(src, fx, fy, z, W / 2 + 18, H / 2 + 30, w + 40, h + 40, a, r=60)
    img = base * (1 - shade) * (1 - 0.6 * sh)
    return img * (1 - m) + art * m


DROPZ = SHOTS[0]["z"][0] * 1.05  # card 01 zoom on its first frame (with the beat punch)
DROPEYE = ((EYE[0] - SHOTS[0]["c"][0]) * DROPZ + W / 2, (EYE[1] - SHOTS[0]["c"][1]) * DROPZ + H / 2)
ZDROP = {0: 2.6, 1: 1.7, 2: 1.25, 3: 1.07, 4: 1.015}  # card 01 bursts out of the eye


def intro(i):
    if i < LAND_IN[7][0]:
        P, f = glide(i, LAND_IN)
        Pp = glide(i - 1, LAND_IN)[0] if i not in dict(LAND_IN) else P  # hard stop: landing frames are crisp
        img = rack(i, P, Pp, sharp=f > 2)
        L = max(x[0] for x in LAND_IN if x[0] <= i)
        return img + 0.1 * math.exp(-(i - L) * 0.9) * (
            i > 0
        )  # shutter flash on each landing but frame 0
    # last 8th: face 01 lifts out of the strip and swallows the screen -> card 01 on the drop
    q = (i - LAND_IN[7][0] + 0.5) / (CUTF[0] - LAND_IN[7][0])
    e = q**1.5
    base = imwarp(rack(i, 7, 7), zx=1 - 0.12 * q)
    R = ROWS[1]
    z1 = DROPZ * ZDROP[0]
    f1 = (
        EYE[0] - (DROPEYE[0] - W / 2) / z1,
        EYE[1] - (DROPEYE[1] - H / 2) / z1,
    )  # eye lands where the card's eye is
    img = lifted(
        base,
        toned(i, 0),
        FACE,
        f1,
        R["z"],
        z1,
        R["tw"] * 1.04,
        R["th"] * 1.04,
        W + 60,
        H + 60,
        TILT,
        0.0,
        e,
        0.25 + 0.55 * q,
    )
    if q > 0.6:  # radial speed into the cut
        img = avg([imwarp(img, zx=1 + s) for s in lerps(0, 0.06 * q, 5)])
    return img


LAND_OUT = [
    (bf(28 + e / 2), e) for e in range(-15, 1)
]  # beats 20.5 .. 28, hero 07 -> ... -> 01 = frame 0


def outro(i, j):
    """beat 20: card 07 shrinks back into the strip; 01..06 slide into their slots on 8ths; beat 24 the side
    strips fill on the hit; the strips run on and land on frame 0"""
    hit = bf(24)

    def fill(k, r):
        if r != 1:
            return 1.0 if i >= hit else 0.0
        if k == 6:
            return 1.0
        F_ = LAND_OUT[1 + k][0]  # 01 lands at beat 21, 02 at 21.5 ...
        return {0: 0.35, 1: 0.75}.get(i - F_, 1.0 if i > F_ else 0.0)  # slot lands sharp, face drops in after

    L0 = LAND_OUT[0][0]
    if i < L0:  # shrink
        q = (j + 1) / (L0 - CUTF[7])
        e = 1 - (1 - q) ** 3
        P, Pp = -15 - 0.9 * (1 - e), -15 - 0.9 * (1 - (1 - j / (L0 - CUTF[7])) ** 3)
        base = rack(i, P, Pp, fill)
        s = SHOTS[6]
        R = ROWS[1]
        return lifted(
            base,
            toned(i, 6),
            s["c"],
            FACE,
            s["z"][1],
            R["z"],
            W + 60,
            H + 60,
            R["tw"],
            R["th"],
            0.0,
            TILT,
            e,
            0.6 * (1 - e),
        )
    P, f = glide(i, LAND_OUT)
    Pp = glide(i - 1, LAND_OUT)[0] if i not in dict(LAND_OUT) else P
    img = rack(i, P, Pp, fill, sharp=f > 2)
    L = max(x[0] for x in LAND_OUT if x[0] <= i)
    img = img + 0.1 * math.exp(-(i - L) * 0.9)
    if i >= hit:  # the hit: flash and punch
        h = i - hit
        img = imwarp(img, zx=1 + 0.07 * math.exp(-h * 0.45)) + 0.3 * math.exp(-h * 0.7)
    return img


def seg_img(i, k, j):
    """card k (7 = strips ending) at j frames after its cut (j may be negative)"""
    lb = j / FPS / BEAT
    if k >= 7:
        return outro(i, j)
    return card_img(i, k, lb, 4 if k == 6 else 2)


# ---------- transitions: (frames before cut, frames after cut) ----------
TRANS = {1: "whip", 2: "blades", 3: "iris", 4: "block", 5: "push", 6: "smear"}  # 07 -> strips: outro()
WIN = {"whip": (4, 4), "blades": (5, 4), "iris": (6, 3), "block": (5, 5), "push": (6, 5), "smear": (3, 3)}
WHIP = {-4: 0.03, -3: 0.1, -2: 0.25, -1: 0.5, 0: 0.8, 1: 0.94, 2: 0.985, 3: 1.0}


def pan(A, B, p):  # A at -p*W, B to its right
    d = int(round(p * W))
    out = torch.zeros_like(A)
    if d < W:
        out[:, :, : W - d] = A[:, :, d:]
    out[:, :, max(W - d, 0):] = B[:, :, : min(d, W)]
    return out


BANDS = torch.from_numpy(np.random.default_rng(5).standard_normal(H // 24 + 1).astype(np.float32)).to(dev)


def stretch(img, px, s, tx, amp):
    """smear frame: the colour image itself stretched along x by s about px, slid by tx, rows offset in 24 px bands"""
    off = BANDS[(YS // 24).long()] * amp
    sx = px + (XS - px - tx - off) / s
    g = torch.stack([sx / W * 2 - 1, YS / H * 2 - 1], -1)[None]
    o = F.grid_sample(img[None], g, mode="bilinear", padding_mode="border", align_corners=False)[0]
    l = (o * LUM).sum(0, keepdim=True)
    return (l + (o - l) * 1.35).clamp(0, 1)  # keep it saturated, never a grey streak


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
        sp = p1 - p0  # whip speed this frame: smear by directional stretch of the colour image, not a blur
        img = pan(stretch(a, W / 2, 1 + sp * 1.2, 0, 260 * sp), stretch(b, W / 2, 1 + sp * 1.2, 0, 260 * sp), p1)
        x = (1 - p1) * W  # key-colour seam leading 02 in
        m = ((XS > x - 70) & (XS < x)).float()[None]
        return img * (1 - m) + KEY[kB] * m
    if kind in ("blades", "blades2"):
        col = KEY[kB] if kind == "blades" else PAPER
        return blades(A() if j < 0 else None, B() if j >= 0 else None, j, col, 62 if kind == "blades" else -58, j < 0)
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
            return avg([imwarp(a, zx=z, px=px, py=py) for z in lerps(zs[j], zs[j] * 1.12, 4)])
        px, py = scr(kB, *EYE)  # come out of 06's eye (colour), not the pale shirt
        zs = {0: 2.6, 1: 1.8, 2: 1.3, 3: 1.08, 4: 1.02}
        b = B()
        return avg([imwarp(b, zx=z, px=px, py=py) for z in lerps(zs[j], zs[j] * 0.9 + 0.1 * zs.get(j + 1, 1.0), 4)])
    if kind == "smear":
        if j < 0:  # 06 smears out to the left ...
            s_, tx, amp = {-3: (1.6, -60, 20), -2: (3.2, -260, 60), -1: (6.0, -600, 120)}[j]
            return stretch(A(), scr(kA, *EYE)[0], s_, tx, amp)
        s_, tx, amp = {0: (5.0, 500, 120), 1: (2.0, 120, 40), 2: (1.15, 20, 8)}[j]  # ... 07 smears in from the right
        return stretch(B(), scr(kB, *EYE)[0], s_, tx, amp)
    raise ValueError(kind)


CUTF = [bf(b) for b in CSTART]  # cut frame of each segment; CUTF[8] = NF (loop)


def frame(i):
    t = i / FPS
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
        if k == 0 and j in ZDROP:  # drop: card 01 bursts out of the eye the face tile zoomed into
            img = imwarp(img, zx=ZDROP[j], px=DROPEYE[0], py=DROPEYE[1])
        if k == 0 and j < 6:
            img = imwarp(img, tx=sj(i, 41, 30), ty=sj(i, 42, 30))
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
