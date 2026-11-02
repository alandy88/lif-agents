"""V6: 3D carousel ring of faces -> push into the drop -> 7 cards joined by designed beat transitions -> cards fly back onto the ring, which spins on into frame 0.

usage: promo.py                     -> promo_silent.mp4 (1080x1920, 30 fps)
       promo.py --stills 0.1,1.8,2.05,...   (seconds) -> stills.jpg
Music grid: music_cut.wav (cutmusic.py), beats at k*0.49188 s from t=0, drop at beat 4, half-time bar from beat 24.
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
NBEATS = 28  # 4 intro + 6 cards x 2 + card 07 x 4 + lookbook x 8
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


# three low-frequency displacement fields, cycled on twos -> line boil
BOIL = []
for s in range(3):
    n = torch.from_numpy(
        np.random.default_rng(s)
        .standard_normal((2, H // 16, W // 16))
        .astype(np.float32)
    ).to(dev)
    BOIL.append(
        F.interpolate(n[None], size=(H, W), mode="bicubic", align_corners=False)[0]
        * 1.6
    )
LCACHE = {}


def lines(i):
    """XDoG ink of the held idle frame, masked to the character, with boil"""
    key = i // 2
    if key in LCACHE:
        return LCACHE[key]
    g = (idle(i) * LUM).sum(0, keepdim=True)
    a, b = gblur(g, 0.9), gblur(g, 1.44)
    d = 23 * a - 22 * b
    x = torch.where(d >= 0.62, torch.ones_like(d), 1 + torch.tanh(12 * (d - 0.62)))
    ink = ((1 - x - 0.15) / 0.6).clamp(0, 1) * CMASK
    off = BOIL[key % 3]
    grid = torch.stack([(XS + off[0]) / W * 2 - 1, (YS + off[1]) / H * 2 - 1], -1)[None]
    ink = F.grid_sample(
        ink[None], grid, mode="bilinear", padding_mode="zeros", align_corners=False
    )[0]
    if len(LCACHE) > 4:
        LCACHE.clear()
    LCACHE[key] = ink
    return ink


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


def lineart_frame(i, k, cx, cy, z, roll):
    key = KEY[k]
    ink = ink_on(key)
    L = cam(lines(i), cx, cy, z, roll, "zeros")
    img = key * PAPERTEX[(i // 2) % 3]
    return img * (1 - L) + ink * L


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
PRINT = (540, 940)

# ---------- cards ----------
# c: framing centre (idle coords), z: zoom start/end, n: big numeral (screen x, y, size, rot), doo: doodles
SHOTS = [
    dict(c=(470, 720), z=(1.16, 1.24), roll=-2, n=(540, 430, 1150, 0), doo=[("spark", 900, 860, 60), ("spark", 160, 980, 40)]),
    dict(c=(560, 760), z=(1.0, 1.06), roll=2, n=(540, 400, 1150, -4), doo=[("circle", 540, 1000, 330, 190)]),
    dict(c=(450, 600), z=(1.42, 1.5), roll=0, n=(620, 420, 1150, 0), doo=[("spark", 880, 1150, 55)]),
    dict(c=(540, 760), z=(1.08, 1.14), roll=3, n=(520, 420, 1150, 3), doo=[("spark", 200, 1180, 55), ("spark", 920, 1000, 45)]),
    dict(c=(540, 1540), z=(1.2, 1.28), roll=-3, n=(540, 1440, 460, -3), nc=(24, 22, 28), doo=[("circle", 420, 1340, 300, 200)]),
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


# ---------- V6: 3D carousel ring (intro + ending) ----------
E8 = BEAT / 2
RW, RH = 560, 760  # front card size on screen
RX, RY, YC, PK = 680, 380, 760, 0.8  # ring half-width, front drop, centre y, perspective strength
SKEW = 0.35  # keystone strength of the per-card homography
FACE = (451, 500)  # face window centre (idle coords); half-size FHW x FHH
FHW = 270
FHH = FHW * RH / RW
CARDTEX = {}


def soft(c):  # readable stand-in for the near-black NOIR key on the dark stage
    return PAPER * 0.85 if lum(c) < 0.15 else c


def card_tex(i, j):
    """card j's face window for frame i: 6 channels (sharp RGB, blurred RGB), key frame and numeral baked in"""
    ck = (i // 2, j)
    if ck in CARDTEX:
        return CARDTEX[ck]
    if len(CARDTEX) > 13:
        CARDTEX.clear()
    art = wash(tone(idle(i), j), j)
    gy, gx = torch.meshgrid(torch.linspace(-1, 1, RH, device=dev), torch.linspace(-1, 1, RW, device=dev), indexing="ij")
    g = torch.stack([(FACE[0] + gx * FHW) / W * 2 - 1, (FACE[1] + gy * FHH) / H * 2 - 1], -1)[None]
    t = F.grid_sample(art[None], g, mode="bilinear", padding_mode="border", align_corners=False)[0]
    fr = soft(KEY[j])
    t[:, :14], t[:, -14:], t[:, :, :14], t[:, :, -14:] = fr, fr, fr, fr
    t = htext(t, i, 200 + j, f"{j + 1:02d}", "bebas", 190, c255(fr), 110, 640, amp=0)
    tb = F.interpolate(F.avg_pool2d(t[None], 8), size=(RH, RW), mode="bilinear", align_corners=False)[0]
    CARDTEX[ck] = torch.cat([t, tb])
    return CARDTEX[ck]


def draw_card(img, tex, cx, cy, sc, phi, dim=1.0, blur=0.0, alpha=1.0):
    """card rotated by phi about its vertical axis (inverse homography: near edge taller, far edge shorter)"""
    if alpha <= 0.002 or sc <= 0.01:
        return img
    hw, hh = RW / 2 * sc, RH / 2 * sc
    s, c = math.sin(phi), math.cos(phi)
    ex, ey = hw * c / (1 - abs(s) * SKEW), hh / (1 - abs(s) * SKEW)
    x0, x1 = max(int(cx - ex) - 1, 0), min(int(cx + ex) + 2, W)
    y0, y1 = max(int(cy - ey) - 1, 0), min(int(cy + ey) + 2, H)
    if x0 >= x1 or y0 >= y1:
        return img
    a = (XS[y0:y1, x0:x1] - cx) / hw
    den = c - a * s * SKEW
    u = a / den
    v = (YS[y0:y1, x0:x1] - cy) / hh * (1 + u * s * SKEW)
    m = (((1 - u.abs()) * hw * c).clamp(0, 1) * ((1 - v.abs()) * hh).clamp(0, 1) * (den > 0).float())[None] * alpha
    o = F.grid_sample(tex[None], torch.stack([u, v], -1)[None], mode="bilinear", padding_mode="border", align_corners=False)[0]
    col = (o[:3] * (1 - blur) + o[3:] * blur) * dim
    img[:, y0:y1, x0:x1] = img[:, y0:y1, x0:x1] * (1 - m) + col * m
    return img


def ring_pose(th):
    """ring angle (0 = front) -> cx, cy, scale, phi, depth z, dim, blur"""
    z = math.cos(th)
    p = 1 / (1 + PK * (1 - z))
    return [540 + RX * math.sin(th) * p, YC + RY * z * p, p, math.radians(38) * math.sin(th), z,
            0.3 + 0.7 * ((z + 1) / 2) ** 1.3, c01((0.85 - z) / 1.4), 1.0]


def track_sprite():
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pts = []
    for n in range(181):
        x, y, p = ring_pose(n / 180 * 2 * math.pi)[:3]
        pts.append((x, y + RH / 2 * p + 18 * p))
    ImageDraw.Draw(im).line(pts, fill=(240, 236, 228, 70), width=4, joint="curve")
    a = np.asarray(im).astype(np.float32) / 255.0
    a[..., :3] *= a[..., 3:]
    return torch.from_numpy(a).permute(2, 0, 1).to(dev)


TRACK = track_sprite()
GLOW = torch.exp(-(((XS - 540) / 620) ** 2 + ((YS - 900) / 760) ** 2))[None]


def ring_img(i, s, mod=None, punch=0.0):
    """ring with continuous front index s; mod(j, pose) may override a card's pose (push / fly-in)"""
    f = int(round(s)) % 7
    key = soft(KEY[f])
    img = INK * 0.92 + key * 0.38 * GLOW
    img = htext(img, i, 700 + f, f"{f + 1:02d}", "bebas", 600, c255(key * 0.8 + INK * 0.2), 540, 250, amp=0)
    img = over(img, TRACK)
    img = htext(img, i, 720 + f, CARDS[f][1], "bebas", 92, c255(key), 540, 1640, amp=0)
    img = htext(img, i, 740, "DAKI · STREETWEAR COLLECTION", "bebas", 40, (235, 230, 222), 540, 1810, amp=0)
    poses = []
    for j in range(7):
        ps = ring_pose((j - s) * 2 * math.pi / 7)
        if mod:
            ps = mod(j, ps)
        poses.append((ps[4], j, ps))
    for _, j, ps in sorted(poses, key=lambda q: q[0]):
        cx, cy, sc, phi, z, dim, blur, al = ps
        sc *= 1 + punch * c01((z - 0.5) * 2)  # landing punch on the front card
        img = draw_card(img, card_tex(i, j), cx, cy, sc, phi, dim, blur, al)
    return img


def ease_in(x):
    return c01(x) ** 2


SNAPW = 3.0  # frames of spin before each hard stop


def snaps(t, lands):
    return sum(ease_in((t - (L - SNAPW)) / SNAPW) for L in lands)


def mblur(i, render, lands_all, state):
    """landing frames and still frames are crisp; spinning frames average 6 sub-frame renders"""
    if i in lands_all or state(i - 0.7) == state(i):
        return render(float(i))
    return avg([render(t) for t in lerps(i - 0.7, i, 6)])


def last_land(i, lands):
    return max([L for L in lands if L <= i], default=-99)


INTRO_LAND = [int(round(n * E8 * FPS)) for n in range(8)]  # 01 at 0, 02..07, then 01 again at beat 3.5
PUSH0, PUSH1 = INTRO_LAND[7], bf(4)


def push_mod(q):
    """front card pushes toward the camera onto card 01's face; the rest of the ring blows outward"""
    fx, fy = scr(0, *FACE)
    e = q * q

    def mod(j, ps):
        cx, cy, sc, phi, z, dim, blur, al = ps
        if j == 0:
            return [cx + (fx - cx) * e, cy + (fy - cy) * e, sc * (1 + 2.4 * e), phi, 9, dim, blur, al]
        return [540 + (cx - 540) * (1 + 1.6 * e), cy + (cy - 900) * e, sc * (1 + 0.6 * e), phi, z, dim * (1 - e),
                blur, al * (1 - e)]
    return mod


def intro_frame(i):
    if i >= PUSH0:
        q = lambda t: c01((t - PUSH0) / (PUSH1 - PUSH0))
        img = avg([ring_img(i, 7, push_mod(q(t))) for t in lerps(i - 0.7, i, 4)]) if i > PUSH0 else ring_img(i, 7, push_mod(0))
        return img
    st = lambda t: snaps(t, INTRO_LAND[1:])
    dt = (i - last_land(i, INTRO_LAND)) / FPS
    img = mblur(i, lambda t: ring_img(i, st(t), punch=0.06 * math.exp(-dt * 14)), set(INTRO_LAND), st)
    return img + 0.14 * math.exp(-dt * 18) * (i > 0)  # shutter flash on landing (not on frame 0)


# ending: 07 pulls back into the front slot, 01-06 fly onto the ring on 8ths, the ring spins on into frame 0
END0 = bf(20)
FLY_LAND = [bf(20.5 + 0.5 * j) for j in range(6)]
SPIN_LAND = [bf(24 + 0.5 * n) for n in range(1, 9)]  # last = NF = frame 0
FLYW = 4.0


def end_mod(t):
    fx, fy = scr(6, *FACE)

    def mod(j, ps):
        cx, cy, sc, phi, z, dim, blur, al = ps
        if j == 6:  # pull back out of card 07
            e = oexpo((t - END0) / (bf(20.5) - END0))
            return [fx + (cx - fx) * e, fy + (cy - fy) * e, sc * (3.0 - 2.0 * e), phi, 9 if e < 0.9 else z, dim, blur, al]
        if j > 5:
            return ps
        L = FLY_LAND[j]
        if t < L - FLYW:
            return [cx, cy, sc, phi, z, dim, blur, 0.0]
        e = 1 - ease_in((t - (L - FLYW)) / FLYW)  # 1 = far away, 0 = landed (hard stop)
        sg = 1 if math.sin(phi) >= 0 else -1
        return [cx + sg * 1250 * e, cy + (-1) ** j * 650 * e, sc * (1 + 0.8 * e), phi + sg * 1.1 * e, z + 3 * e, dim,
                blur * (1 - e), al]
    return mod


def end_frame(i):
    if i >= bf(24):
        st = lambda t: 6 + snaps(t, SPIN_LAND)
        dt = (i - last_land(i, [bf(24)] + SPIN_LAND)) / FPS
        img = mblur(i, lambda t: ring_img(i, st(t), punch=0.06 * math.exp(-dt * 14)), set(SPIN_LAND), st)
        return img + 0.14 * math.exp(-dt * 18)
    moving = lambda t: tuple(round(v, 4) for v in [c01((t - END0) / 8)] + [c01((t - L + FLYW) / FLYW) for L in FLY_LAND])
    if i in FLY_LAND or moving(i - 0.7) == moving(i):
        img = ring_img(i, 6, end_mod(float(i)))
    else:
        img = avg([ring_img(i, 6, end_mod(t)) for t in lerps(i - 0.7, i, 5)])
    dt = (i - last_land(i, [END0] + FLY_LAND)) / FPS
    return img + 0.12 * math.exp(-dt * 18)



def seg_img(i, k, j):
    """card k (7 = ring ending) at j frames after its cut (j may be negative)"""
    lb = j / FPS / BEAT
    if k >= 7:
        return end_frame(i)
    return card_img(i, k, lb, 4 if k == 6 else 2)


# ---------- transitions: (frames before cut, frames after cut) ----------
TRANS = {1: "whip", 2: "blades", 3: "iris", 4: "block", 5: "push", 6: "smear", 7: "pull"}
WIN = {"whip": (4, 4), "blades": (5, 4), "iris": (6, 3), "block": (5, 5), "push": (6, 5), "smear": (3, 3),
       "pull": (3, 0)}
WHIP = {-4: 0.03, -3: 0.1, -2: 0.25, -1: 0.5, 0: 0.8, 1: 0.94, 2: 0.985, 3: 1.0}


def sat(img, f=1.45, c=1.12):  # smear frames keep the key colour instead of averaging to grey
    l = (img * LUM).sum(0, keepdim=True)
    return ((l + (img - l) * f - 0.5) * c + 0.5).clamp(0, 1)


def speedlines(img, colour, seed):
    """key-colour horizontal speed dashes, hashed per 9 px row"""
    rows = torch.floor(YS / 9)
    hr = torch.frac(torch.sin(rows * 12.9898 + seed) * 43758.5453).abs()
    hx = torch.frac(torch.sin(torch.floor((XS + hr * 900) / 260) * 78.233 + rows) * 43758.5453).abs()
    m = ((hr > 0.94) & (hx > 0.45)).float()[None]
    return img * (1 - m) + colour * m


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
        p0, p1 = WHIP.get(j - 1, 0.0), WHIP[j]
        st = 1 + 2.5 * (p1 - p0)  # stretch along the whip, anchored at the seam
        a, b = imwarp(A(), zx=st, px=W), imwarp(B(), zx=st, px=0)
        img = avg([pan(a, b, p) for p in lerps(p1 - 0.25 * (p1 - p0), p1, 3)])
        return speedlines(sat(img), KEY[kB], j) if p1 - p0 > 0.1 else img
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
            return sat(avg([imwarp(a, zx=z, px=px, py=py) for z in lerps(zs[j], zs[j] * 1.08, 3)]), 1.3, 1.08)
        px, py = scr(kB, *PRINT)
        zs = {0: 3.0, 1: 2.0, 2: 1.4, 3: 1.12, 4: 1.02}
        b = B()
        img = sat(avg([imwarp(b, zx=z, px=px, py=py) for z in lerps(zs[j], zs[j] + 0.3 * (zs.get(j + 1, 1.0) - zs[j]), 3)]),
                  1.3, 1.08)
        v = (((XS - px) ** 2 + (YS - py) ** 2).sqrt() / 1150 - 0.55).clamp(0, 1)[None] * (1.6 - 0.35 * j)
        return img * (1 - v.clamp(0, 1)) + KEY[kB] * v.clamp(0, 1)  # key-colour tunnel edge
    if kind == "smear":
        if j < 0:
            a = A()
            sm = {-3: (1.25, 0, 50), -2: (2.0, -160, 80), -1: (2.4, -420, 110)}[j]
            img = sat(avg([imwarp(a, tx=sm[1] + dx, zx=sm[0], zy=1 / sm[0] ** 0.3) for dx in lerps(0, -sm[2], 3)]), 1.6)
            if j == -1:  # hard diagonal split: 07 already smearing in from the right
                b = sat(avg([imwarp(B(), tx=400 + dx, zx=2.2, zy=0.8) for dx in lerps(0, -110, 3)]), 1.6)
                m = (XS > W * 0.55 + (YS - H / 2) * 0.3).float()[None]
                img = img * (1 - m) + b * m
            return speedlines(img, KEY[kB] if j == -1 else KEY[kA], j)
        b = B()
        sx, sy, tx = {0: (1.45, 0.86, 140), 1: (0.93, 1.05, -20), 2: (1.02, 0.99, 0)}[j]
        return imwarp(b, tx=tx, zx=sx, zy=sy)
    if kind == "pull":  # rush into 07's face; the cut lands on the same face as the big ring card
        ex, ey = scr(kA, *FACE)
        zs = {-3: (1.0, 1.25), -2: (1.25, 1.6), -1: (1.6, 2.1)}[j]
        a = A()
        return sat(avg([imwarp(a, zx=z, px=ex, py=ey) for z in lerps(zs[0] + 0.6 * (zs[1] - zs[0]), zs[1], 3)]), 1.25, 1.05)
    raise ValueError(kind)


CUTF = [bf(b) for b in CSTART]  # cut frame of each segment; CUTF[8] = NF (loop)


def frame(i):
    t = i / FPS
    if i < CUTF[0]:
        img = intro_frame(i)
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
        if k == 0 and j < 10:  # continue the ring push: settle out of card 01's face, shaking
            fx, fy = scr(0, *FACE)
            img = imwarp(img, tx=sj(i, 41, 30) * (j < 6), ty=sj(i, 42, 30) * (j < 6), zx=1 + 1.4 * math.exp(-j * 0.55),
                         px=fx, py=fy)
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
