#!/usr/bin/env python3
"""Make the 2024 black jersey's collar all black.

The design outlines the black jersey's V-neck collar in dark gray, and the
3D player pipes the neckline in the sampled silver trim. Doc (2026-10-06):
"2024 black jersey, the collar is black". This paints the collar's gray
outlines black, leaving the silver wing streaks across the yoke as drawn;
prepare-uniforms.py also sets the collar trim to black through COLLAR.

prepare-uniforms.py calls blacken_collar() for the jerseys in COLLAR. Run
this file directly to patch the WebP already in assets/uni/ (running it
again changes nothing):

    python3 tools/black_collar.py

Needs Pillow and NumPy.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# Jerseys whose collar is black, and the collar's color.
COLLAR = {'jersey-black-wing': '#000000'}
# In pixels of the 1024 px wide art: the rows and columns the collar spans.
ROWS, COLS = (0, 310), (330, 700)


def blacken_collar(img, color='#000000'):
    """Returns a copy of `img` with the collar's gray outlines painted
    `color`. Only neutral dark grays between the collar's outer outlines
    change, so the lighter wing streaks keep their color."""
    a = np.array(img.convert('RGBA'))
    k = a.shape[1] / 1024
    rgb = a[:, :, :3].astype(int)
    neutral = np.ptp(rgb, axis=2) < 14
    level = rgb.max(axis=2)
    gray = neutral & (level > 20) & (level < 125) & (a[:, :, 3] > 128)
    outline = neutral & (level >= 60) & (level <= 92)
    ink = np.array([int(color[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.uint8)
    x0, x1 = round(COLS[0] * k), round(COLS[1] * k)
    for y in range(round(ROWS[0] * k), round(ROWS[1] * k)):
        # The collar's outlines are solid runs of darker gray (about 77) at
        # least 4 px wide; the wing streaks are lighter (about 105).
        g = outline[y, x0:x1]
        run = g[:-3] & g[1:-2] & g[2:-1] & g[3:]
        xs = np.nonzero(run)[0]
        if not len(xs):
            continue
        lo, hi = x0 + xs.min(), x0 + xs.max() + 3
        # Take in the outline's own antialiased edges too.
        while lo > 0 and gray[y, lo - 1]:
            lo -= 1
        while hi < a.shape[1] - 1 and gray[y, hi + 1]:
            hi += 1
        a[y, lo:hi + 1, :3][gray[y, lo:hi + 1]] = ink
    return Image.fromarray(a, 'RGBA')


if __name__ == '__main__':
    for name, color in COLLAR.items():
        path = ROOT / 'assets' / 'uni' / f'{name}.webp'
        blacken_collar(Image.open(path), color).save(path, 'WEBP', quality=88, method=6)
        print('redrew', path.relative_to(ROOT))
