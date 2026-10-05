#!/usr/bin/env python3
"""Redraw the 2026 pants' side stripes in the panel art to match the field.

In Doc's game photos (2026-10-05) the red and white 2026 pants carry a thin
black stripe, a gap of pants color, then a wider stripe (white on red, red on
white). They start at the hip, sweep forward across the thigh and stop above
the knee, cut at an angle with the front stripe ending lowest. The black
pants carry red, white and red side by side down the full outside seam to
the hem. The 3D player draws the same from BANDS, PANEL_END and PANEL_SWEEP
in prepare-uniforms.py. This repaints the strip just inside each leg's
outline, down to the sock line, in that pattern.

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
# The optional third item stops the stripes partway down: `end` is where the
# back stripe stops, as a fraction of waistband to sock line; the front one
# runs `cut` further; `sweep` is how far (px) they move toward the front of
# the leg by the end.
THIGH = {'end': 0.66, 'cut': 0.08, 'sweep': 22}
STRIPES = {
    'pants-red': ('#C9001F', [(None, 2), ('#000000', 3), (None, 3), ('#FFFFFF', 12), (None, 3)], THIGH),
    'pants-white': ('#FFFFFF', [(None, 2), ('#000000', 3), (None, 3), ('#C9001F', 12), (None, 3)], THIGH),
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
    thigh = spec[2] if len(spec) > 2 else None
    sweep = round(thigh['sweep'] * k) if thigh else 0
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
        top = round(6 * k)
        for y in range(top, sock - 1):
            x = edge(y, side)
            if x is None:
                continue
            t = (y - top) / (sock - top)
            shift = round(sweep * min(1.0, t / thigh['end'])) if thigh else 0
            # Clear the whole strip the stripes can cover, then paint them.
            for i in range(len(pattern) + sweep):
                xx = x + side * (o + i)
                if 0 <= xx < w and a[y, xx, 3] > 128:
                    out[y, xx, :3] = base
            for i, c in enumerate(pattern):
                if thigh and t > thigh['end'] + thigh['cut'] * i / len(pattern):
                    continue
                xx = x + side * (o + shift + i)
                if 0 <= xx < w and a[y, xx, 3] > 128:
                    out[y, xx, :3] = c
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    for name, spec in STRIPES.items():
        path = ROOT / 'assets' / 'uni' / f'{name}.webp'
        draw_panels(Image.open(path), spec).save(path, 'WEBP', quality=88, method=6)
        print('redrew', path.relative_to(ROOT))
