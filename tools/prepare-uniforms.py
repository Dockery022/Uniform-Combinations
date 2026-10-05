#!/usr/bin/env python3
"""Turn the Combo Builder design art into web assets and a 3D spec.

Usage: python3 tools/prepare-uniforms.py <art-dir> [out-dir]

<art-dir> holds the design's PNGs with their original names
(helmet-red-mask-red.png, jersey-red.png, pants-red.png, socks-red.png,
shoes-red.png, 1912-crest-outline.png, bird_master.png). The script writes
WebP copies for the panel and the combo graphic into assets/uni/, cuts the
helmet decals and pants logos out of the art for the 3D model, lifts the
LOUISVILLE wordmark off the white jersey for the page header, samples the
colors the 3D materials need, and writes them to src/uniform-art.js.

Needs Pillow and NumPy.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
from palette import BLACK, RED, WHITE, snap  # noqa: E402
from pants_panels import STRIPES, draw_panels  # noqa: E402

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else 'uni-src')
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'assets' / 'uni'
OUT.mkdir(parents=True, exist_ok=True)

# Per-helmet finish and stripes, read off the art by eye. Stripe widths are
# in meters across the top of the shell; colors are sampled below.
HELMETS = {
    'helmet-red': {'finish': 'gloss'},
    'helmet-white': {'finish': 'gloss'},
    'helmet-white-louie': {'finish': 'gloss'},
    'helmet-black': {'finish': 'gloss'},
    'helmet-white-20': {'finish': 'gloss'},
    'helmet-red-20': {'finish': 'satin', 'threshold': 70},
    'helmet-black-20': {'finish': 'gloss'},
    'helmet-whitealt-20': {'finish': 'satin', 'threshold': 45},
    'helmet-script': {'finish': 'gloss', 'mirror': False},
    'helmet-redscript': {'finish': 'gloss', 'mirror': False},
    'helmet-whitestripe': {'finish': 'gloss', 'stripe': [{'at': 0, 'w': 0.06, 'color': RED}]},
    'helmet-halloween': {'finish': 'satin'},
    'helmet-redgold': {'finish': 'gloss'},
    'helmet-blackchrome': {'finish': 'gloss', 'decalMetal': 1},
    'helmet-blackmatte': {'finish': 'matte', 'threshold': 10},
    'helmet-blackstripe': {'finish': 'gloss', 'stripe': [
        {'at': -0.026, 'w': 0.012, 'color': '#ffffff'}, {'at': 0, 'w': 0.04, 'color': RED},
        {'at': 0.026, 'w': 0.012, 'color': '#ffffff'}]},
    'helmet-black23': {'finish': 'satin', 'threshold': 18},
    'helmet-blackmattechrome': {'finish': 'matte', 'decalMetal': 1},
}
JERSEYS = ['jersey-red', 'jersey-white', 'jersey-black', 'jersey-red-wing', 'jersey-white-wing',
           'jersey-black-wing', 'jersey-red-20', 'jersey-white-20', 'jersey-black-20', 'jersey-whitealt-20',
           'jersey-halloween', 'jersey-ironwings', 'jersey-redgold', 'jersey-black-23']
PANTS = ['pants-red', 'pants-white', 'pants-black', 'pants-red-script', 'pants-white-script',
         'pants-black-script', 'pants-red-20', 'pants-white-20', 'pants-black-20', 'pants-whitealt-20',
         'pants-halloween', 'pants-ironwings', 'pants-redgold', 'pants-black-23']
# Where a side panel stops, as a fraction of the way from waist to the
# bottom of the pants, when game photos disagree with the drawing: the 2026
# stripes run the full outside seam, waistband to hem (1.0 = no cut).
PANEL_END = {'pants-red': 1.0, 'pants-white': 1.0, 'pants-black': 1.0}
# Stripes set by hand instead of read from the art (meters from the outer
# seam, + toward the front; later bands paint over earlier ones): the red
# and white 2026 pants carry a thin black stripe, a gap of pants color, then
# a wider stripe in front of it (white on red, red on white); the black
# pants carry red, white and red side by side. From Doc's game photos
# (2026-10-05).
BANDS = {'pants-red': [{'at': -0.011, 'w': 0.01, 'color': BLACK},
                       {'at': 0.024, 'w': 0.04, 'color': WHITE}],
         'pants-white': [{'at': -0.011, 'w': 0.01, 'color': BLACK},
                         {'at': 0.024, 'w': 0.04, 'color': RED}],
         'pants-black': [{'at': 0.015, 'w': 0.054, 'color': RED},
                         {'at': 0.015, 'w': 0.014, 'color': WHITE}]}
SOCKS = ['socks-red', 'socks-white', 'socks-black', 'socks-gray',
         'socks-red-20', 'socks-white-20', 'socks-black-20', 'socks-gray-20']
SHOES = ['shoes-black', 'shoes-white', 'shoes-red', 'shoes-gray']


def load(name):
    return np.array(Image.open(SRC / f'{name}.png').convert('RGBA')).astype(np.int16)


def hexof(rgb):
    return snap('#%02x%02x%02x' % tuple(int(v) for v in rgb[:3]))


def median(a, box):
    x0, y0, x1, y1 = box
    px = a[y0:y1, x0:x1].reshape(-1, 4)
    px = px[px[:, 3] > 200]
    return np.median(px[:, :3], axis=0)


def dist(a, rgb):
    return np.abs(a[:, :, :3] - np.array(rgb)[None, None, :]).max(axis=2)


def save_webp(img, name, width=None, quality=88):
    if width and img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(OUT / f'{name}.webp', 'WEBP', quality=quality, method=6)
    return img.size


def drop_edge_components(mask, band, min_size=250):
    """Keep the components of `mask` that stay clear of `band` (outlines,
    facemask, stripes) and aren't specks of shading."""
    img = Image.fromarray((mask * 255).astype(np.uint8), 'L').copy()
    while True:
        arr = np.array(img)
        ys, xs = np.nonzero((arr == 255) & band)
        if not len(xs):
            break
        ImageDraw.floodfill(img, (int(xs[0]), int(ys[0])), 0)
    while True:
        arr = np.array(img)
        ys, xs = np.nonzero(arr == 255)
        if not len(xs):
            break
        ImageDraw.floodfill(img, (int(xs[0]), int(ys[0])), 128)
        part = np.array(img) == 128
        img = Image.fromarray(np.where(part, 64 if part.sum() >= min_size else 0, np.array(img)).astype(np.uint8), 'L').copy()
    return np.array(img) == 64


def cutout(a, base, keep, threshold):
    """Alpha-keyed art: pixels that differ from the base color inside `keep`."""
    d = dist(a, base)
    core = keep & (d > threshold)
    grown = np.array(Image.fromarray((core * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    alpha = np.clip((d - threshold * 0.25) / (threshold * 0.75), 0, 1) * grown * (a[:, :, 3] / 255)
    out = a.copy()
    out[:, :, 3] = (alpha * 255).astype(np.int16)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def edge_band(a, radius):
    solid = Image.fromarray(((a[:, :, 3] > 128) * 255).astype(np.uint8))
    inner = solid
    for _ in range(radius):
        inner = inner.filter(ImageFilter.MinFilter(3))
    return (a[:, :, 3] > 128) & ~(np.array(inner) > 0)


spec = {'helmet': {}, 'jersey': {}, 'pants': {}, 'socks': {}, 'shoes': {}}

# ---------- helmets ----------
# The side views share one template: the shell's top is at y = 5, its front
# (forehead) at x = 85 and its back at x = 748, at 541.7 px per helmet unit
# (the 3D shell is 1 unit wide). The decal sits above the ear hole (y < 378).
for name, opts in HELMETS.items():
    for mask in ('red', 'white', 'black'):
        save_webp(Image.open(SRC / f'{name}-mask-{mask}.png').convert('RGBA'), f'{name}-mask-{mask}', 376)
    a = load(f'{name}-mask-red')
    shell = median(a, (590, 250, 690, 330))
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    t = opts.get('threshold', 40)
    cand = (a[:, :, 3] > 128) & (dist(a, shell) > t) & (yy < 378) & (xx > 95)
    cand = drop_edge_components(cand, edge_band(a, 22))
    decal = cutout(a, shell, cand, t)
    save_webp(decal, f'decal-{name}', quality=90)
    spec['helmet'][name] = {
        'shell': hexof(shell), 'finish': opts['finish'], 'mirror': opts.get('mirror', True),
        'decalMetal': opts.get('decalMetal', 0), 'stripe': opts.get('stripe', []),
        'decal': f'decal-{name}', 'decalArt': {'width': w, 'height': h, 'frontX': 85, 'topY': 5, 'pxPerUnit': 541.7},
    }

# ---------- jerseys ----------
# Front views on one template (1366 x 1408): V-neck tip at (683, 380),
# armpits at y = 540, hem near y = 1400.
for name in JERSEYS:
    img = Image.open(SRC / f'{name}.png').convert('RGBA')
    a = np.array(img).astype(np.int16)
    base = median(a, (560, 1210, 800, 1290))
    # Collar piping: the first non-base run walking in from the V's outer edge.
    row = a[200, 440:690]
    trim = None
    for i in range(len(row) - 3):
        span = row[i:i + 3, :3]
        if row[i, 3] > 200 and np.abs(span - base).max(axis=1).min() > 50 and np.ptp(span, axis=0).max() < 30:
            trim = span[1]
            break
    # Number block: scan up from the hem for rows with ink in the middle.
    d = dist(a, base)
    ink = (d > 60) & (a[:, :, 3] > 200)
    counts = ink[:, 330:1036].sum(axis=1)
    y = 1240
    while y > 400 and counts[y] < 25:
        y -= 1
    bottom = y
    gap = 0
    while y > 300:
        gap = gap + 1 if counts[y] < 6 else 0
        if gap > 14:
            break
        y -= 1
    top = y + gap
    cols = np.nonzero(ink[top:bottom, 345:1021].sum(axis=0) > 3)[0]
    left, right = 345 + int(cols.min()), 345 + int(cols.max())
    block = a[top:bottom, left:right].reshape(-1, 4)
    block = block[(block[:, 3] > 200) & (np.abs(block[:, :3] - base).max(axis=1) > 60)][:, :3]
    q = (block // 16) * 16 + 8
    keys, n = np.unique(q, axis=0, return_counts=True)
    order = np.argsort(-n)
    fill = keys[order[0]]
    outline = keys[order[1]] if len(order) > 1 else trim
    w = save_webp(img, name, 1024)
    spec['jersey'][name] = {
        'base': hexof(base), 'trim': hexof(trim if trim is not None else base),
        'number': {'box': [left, top, right, bottom], 'fill': hexof(fill), 'outline': hexof(outline)},
        'art': {'width': 1366, 'height': 1408},
    }

# ---------- pants ----------
# Front views (1084 x 1994): waist at y = 5, socks from y = 1380.
for name in PANTS:
    img = Image.open(SRC / f'{name}.png').convert('RGBA')
    a = np.array(img).astype(np.int16)
    base = median(a, (470, 160, 620, 300))
    socks = median(a, (150, 1600, 260, 1800))
    # Side stripe: color runs from the outer edge inward at mid-thigh, after the outline.
    row = a[700]
    x = int(np.argmax(row[:, 3] > 128))
    runs = []
    while x < 300:
        px = row[x, :3]
        if np.abs(px - base).max() < 40 and runs and (np.abs(row[x:x + 14, :3] - base).max(axis=1) < 40).all():
            break
        key = tuple((px // 24) * 24)
        if runs and runs[-1][0] == key:
            runs[-1][1] += 1
        else:
            runs.append([key, 1, px])
        x += 1
    runs = [r for r in runs if r[1] >= 3]
    # The art draws the panel's piping where an outline would be: black on
    # red and white pants, gray on black pants, where the game uniforms show
    # white. Keep it when there is a panel to pipe.
    if runs and max(runs[0][2]) < 90 and runs[0][1] <= 10:
        # Piping sits right against its panel; a gap of pants color after
        # the edge means it is only an outline.
        has_panel = len(runs) > 1 and np.abs(runs[1][2] - base).max() > 40 and any(
            np.abs(r[2] - base).max() > 40 for r in runs[1:] if r[1] >= 8 and max(r[2]) >= 90)
        if not has_panel:
            runs = runs[1:]
        else:
            runs[0][2] = np.array([242, 242, 240]) if base.max() < 60 else np.array([17, 17, 19])
    # The front view shows only the front half of a side panel, so the 3D
    # panel is about twice the drawn width (850 art px per meter), centered on
    # the seam and nudged forward so it shows from the front as in the art.
    total = sum(r[1] for r in runs)
    bands, pos = [], 0
    for key, n, px in runs:
        if np.abs(px - base).max() > 40:
            bands.append({'at': round((pos + n / 2 - total / 2) / 850 + 0.006, 4), 'w': round(n / 850, 4), 'color': hexof(px)})
        pos += n
    bands = sorted(bands, key=lambda b: -b['w'])[:3]
    # How far down the leg the panel runs, as a fraction of waist (y = 5) to
    # sock line (y = 1380): the last row below the sample row that still
    # carries at least half the sampled pattern width.
    def edge_width(y):
        r = a[y]
        x = int(np.argmax(r[:, 3] > 128))
        start = x
        while x < start + 12 and np.abs(r[x, :3] - base).max() > 40 and r[x, :3].max() < 110:
            x += 1
        x0, last, gap = x, None, 0
        while x < x0 + 200:
            if np.abs(r[x, :3] - base).max() > 40:
                last, gap = x, 0
            else:
                gap += 1
                if gap > 14:
                    break
            x += 1
        return 0 if last is None else last - x0 + 1
    ref = edge_width(700)
    end = 1380
    if bands and ref:
        y = 700
        while y < 1380 and edge_width(y) >= ref * 0.5:
            y += 10
        end = y
    band_end = PANEL_END.get(name, round((end - 5) / 1375, 3))
    bands = BANDS.get(name, bands)
    # Hip logos: ink in the top of the pants that isn't part of an edge stripe.
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    cand = (a[:, :, 3] > 128) & (dist(a, base) > 50) & (yy < 520)
    cand = drop_edge_components(cand, edge_band(a, 14))
    logos = cutout(a, base, cand, 50).crop((0, 0, w, 600))
    save_webp(logos, f'logos-{name}', 542, quality=90)
    # The panel art matches the 3D: the 2026 stripes as on the field.
    save_webp(draw_panels(img, STRIPES[name]) if name in STRIPES else img, name, 542)
    spec['pants'][name] = {
        'base': hexof(base), 'socks': hexof(socks), 'bands': bands, 'bandEnd': band_end,
        'logos': f'logos-{name}', 'logoArt': {'width': w, 'height': 600},
    }

for name in SOCKS:
    img = Image.open(SRC / f'{name}.png').convert('RGBA')
    spec['socks'][name] = hexof(median(np.array(img).astype(np.int16), (150, 1600, 260, 1800)))
    save_webp(img, name, 542)

for name in SHOES:
    img = Image.open(SRC / f'{name}.png').convert('RGBA')
    a = np.array(img).astype(np.int16)
    spec['shoes'][name] = hexof(median(a, (480, 120, 600, 190)))
    save_webp(img, name, 420)

save_webp(Image.open(SRC / '1912-crest-outline.png').convert('RGBA'), '1912-crest', 240)
save_webp(Image.open(SRC / 'bird_master.png').convert('RGBA'), 'bird-master', 460)


def wordmark(jersey):
    """The LOUISVILLE wordmark for dark backgrounds, lifted from the white
    jersey: red letters, and the black outline and shadow turned into the
    white trap the mark wears on dark."""
    a = np.array(Image.open(SRC / f'{jersey}.png').convert('RGBA').crop((330, 420, 1040, 640))).astype(np.float32)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    red = (r - g) > 30
    out = np.zeros_like(a)
    # Inside the outline: a red/black mix becomes the same red/white mix.
    t = np.clip(r / 201.0, 0, 1)
    for c, v in enumerate((201, 0, 31)):
        out[:, :, c] = np.where(red, t * v + (1 - t) * 255, 255)
    # Outside the letters: gray over the white jersey is the outline's coverage.
    out[:, :, 3] = np.where(red, 255, 255 - (r + g + b) / 3)
    img = Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')
    img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    img.save(OUT / 'wordmark.webp', 'WEBP', quality=92, method=6)
    return img.size


wordmark('jersey-white')

js = ('// Generated by tools/prepare-uniforms.py from the design art. Do not edit by hand.\n'
      '// Colors are sampled from the art so the 3D materials match the artwork.\n'
      f'export const ART = {json.dumps(spec, indent=1)};\n')
(ROOT / 'src' / 'uniform-art.js').write_text(js)
print(f'Wrote {len(list(OUT.glob("*.webp")))} images to {OUT} and src/uniform-art.js')
