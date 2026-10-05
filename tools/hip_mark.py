#!/usr/bin/env python3
"""Redraw the three-bar mark on the pants' left hip to match the field.

The design draws the mark wide and flat, and the 3D player blows it up to
about twice its real size. In Doc's game photos (2026-10-05) it is small,
three separate bars leaning right and rising left to right, sitting just
below the waistband inside the side stripe. This clears the drawn mark and
draws that shape, smaller, in the same color.

prepare-uniforms.py calls redraw_mark() for the pants in MARK_PANTS, on both
the panel art and the hip-logo art. Run this file directly to patch the WebPs
already in assets/uni/ (running it again draws
the same mark):

    python3 tools/hip_mark.py

Needs Pillow and NumPy.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
# Pants whose art carries the three-bar mark at BOX (the 2020 sets differ).
MARK_PANTS = ['pants-red', 'pants-white', 'pants-black', 'pants-red-script', 'pants-white-script',
              'pants-black-script', 'pants-halloween', 'pants-ironwings', 'pants-redgold', 'pants-black-23']
# In pixels of the 542 px wide art: the drawn mark's box, and the new mark's
# center and height. Bars are BAR wide with GAP between them, rise to HEIGHTS
# of the tallest, and lean LEAN of their height to the right.
BOX = (376, 42, 442, 86)
CENTER = (409, 66)
SIZE = 20
BAR, GAP, LEAN = 0.27, 0.15, 0.38
HEIGHTS = (0.5, 0.75, 1.0)
SS = 8  # supersampling
# The hip-logo art wraps around the curve of the hip on the 3D player, which
# stretches it sideways; draw it this much narrower and taller to land the
# photo's shape.
LOGO_SCALE = (0.75, 1.3)


def mark_polygons(k, sx=1.0, sy=1.0):
    """The three bars as polygons, in pixels of art k times 542 px wide,
    scaled sx wide and sy tall about the mark's center."""
    h, b, g = SIZE * k, BAR * SIZE * k, GAP * SIZE * k
    width = 3 * b + 2 * g + LEAN * h
    cx, cy = CENTER[0] * k, CENTER[1] * k
    x0, y0 = cx - width / 2, cy + h / 2
    out = []
    for i, f in enumerate(HEIGHTS):
        x, s = x0 + i * (b + g), LEAN * h * f
        bar = [(x, y0), (x + b, y0), (x + b + s, y0 - h * f), (x + s, y0 - h * f)]
        out.append([(cx + (px - cx) * sx, cy + (py - cy) * sy) for px, py in bar])
    return out


def redraw_mark(img, transparent):
    """Returns a copy of `img` with the hip mark redrawn. `transparent` is
    True for the hip-logo art (clear to nothing), False for the panel art
    (clear to the pants color)."""
    a = np.array(img.convert('RGBA'))
    k = a.shape[1] / 542
    x0, y0, x1, y1 = (round(v * k) for v in BOX)
    box = a[y0:y1, x0:x1].astype(int)
    if transparent:
        ink = box[box[:, :, 3] > 200][:, :3]
    else:
        base = np.median(box[-1, :, :3], axis=0)
        ink = box[:, :, :3][np.abs(box[:, :, :3] - base).max(2) > 80]
    if not len(ink):
        return img.convert('RGBA')
    color = tuple(int(v) for v in np.median(ink, axis=0))
    if transparent:
        a[y0:y1, x0:x1] = 0
    else:
        a[y0:y1, x0:x1, :3] = base.astype(np.uint8)
    # Draw the bars large and shrink them, for clean edges.
    w, h = (x1 - x0) * SS, (y1 - y0) * SS
    mask = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(mask)
    for poly in mark_polygons(k, *(LOGO_SCALE if transparent else (1.0, 1.0))):
        d.polygon([((x - x0) * SS, (y - y0) * SS) for x, y in poly], fill=255)
    m = np.array(mask.resize((x1 - x0, y1 - y0), Image.LANCZOS)).astype(float)[:, :, None] / 255
    region = a[y0:y1, x0:x1].astype(float)
    region[:, :, :3] = region[:, :, :3] * (1 - m) + np.array(color) * m
    if transparent:
        region[:, :, 3:] = np.maximum(region[:, :, 3:], m * 255)
    a[y0:y1, x0:x1] = region.round().clip(0, 255).astype(np.uint8)
    return Image.fromarray(a, 'RGBA')


if __name__ == '__main__':
    for name in MARK_PANTS:
        for file, transparent in ((name, False), (f'logos-{name}', True)):
            path = ROOT / 'assets' / 'uni' / f'{file}.webp'
            redraw_mark(Image.open(path), transparent).save(path, 'WEBP', quality=90 if transparent else 88, method=6)
            print('redrew', path.relative_to(ROOT))
