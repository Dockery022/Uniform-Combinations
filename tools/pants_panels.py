#!/usr/bin/env python3
"""Redraw the 2026 pants' side stripes in the panel art to match the field.

The design draws the 2026 side panels as one wide stripe that stops partway
down the thigh, cut at an angle. In Doc's game photos (2026-10-05) each leg
carries a thin stripe, a gap of pants color, then a wider stripe, running the
full outside seam from waistband to hem: black and white on red, black and red
on white. The black pants carry red, white and red side by side. The 3D player draws the same from BANDS and
PANEL_END in prepare-uniforms.py. This repaints the strip just inside each
leg's outline, down to the sock line, in that pattern.

prepare-uniforms.py calls draw_panels() for the pants in STRIPES. Run this
file directly to patch the WebPs already in assets/uni/ (it only overwrites
the strip, so running it again changes nothing):

    python3 tools/pants_panels.py

Needs Pillow and NumPy.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# Each pants' color, then its stripes inward from the outline as
# (color, width in pixels of the 542 px wide panel art); None is pants color.
# The last entry paints pants color over what is left of the drawn panel.
STRIPES = {
    'pants-red': ('#C9001F', [(None, 2), ('#000000', 3), (None, 3), ('#FFFFFF', 12), (None, 3)]),
    'pants-white': ('#FFFFFF', [(None, 2), ('#000000', 3), (None, 3), ('#C9001F', 12), (None, 3)]),
    'pants-black': ('#000000', [(None, 2), ('#C9001F', 6), ('#FFFFFF', 4), ('#C9001F', 6), (None, 9)]),
}
OUTLINE = 4  # the art's outline, left as drawn


def rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.int16)


def draw_panels(img, spec):
    """Returns a copy of the front-view pants art with each side stripe
    repainted as `spec` (pants color, stripes), waistband to sock line."""
    base = rgb(spec[0])
    a = np.array(img.convert('RGBA')).astype(np.int16)
    h, w = a.shape[:2]
    k = w / 542
    o = max(1, round(OUTLINE * k))
    pattern = [base if c is None else rgb(c) for c, n in spec[1] for _ in range(max(1, round(n * k)))]
    out = a.copy()

    def edge(y, side):
        alpha = a[y, :, 3] > 128
        if not alpha.any():
            return None
        return int(np.argmax(alpha)) if side == 1 else w - 1 - int(np.argmax(alpha[::-1]))

    for side in (1, -1):
        # Sock line: the first row below mid-leg where the pants color gives
        # way to the outline across the leg.
        probe = round(38 * k)
        sock = next(y for y in range(int(h * 0.6), h) if edge(y, side) is not None
                    and np.abs(a[y, edge(y, side) + side * probe, :3] - base).max() > 40)
        for y in range(round(6 * k), sock - 1):
            x = edge(y, side)
            if x is None:
                continue
            for i, c in enumerate(pattern):
                xx = x + side * (o + i)
                if 0 <= xx < w and a[y, xx, 3] > 128:
                    out[y, xx, :3] = c
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    for name, spec in STRIPES.items():
        path = ROOT / 'assets' / 'uni' / f'{name}.webp'
        draw_panels(Image.open(path), spec).save(path, 'WEBP', quality=88, method=6)
        print('redrew', path.relative_to(ROOT))
