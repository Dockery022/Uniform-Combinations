#!/usr/bin/env python3
"""Redraw the three-bar mark on the pants' left hip to match the field.

The 3D player showed the pants' mark about twice its real size. In Doc's
game photo (2026-10-05) it is small, just below the waistband inside the side
stripe, and Doc asked for the same mark as on the jersey chest. This clears
the drawn mark and stamps the jersey's, smaller, in the pants mark's color.

prepare-uniforms.py calls redraw_mark() for the pants in MARK_PANTS, on both
the panel art and the hip-logo art. Run this file directly to patch the WebPs
already in assets/uni/ (running it again draws
the same mark):

    python3 tools/hip_mark.py

Needs Pillow and NumPy.
"""
from pathlib import Path

import numpy as np
from PIL import Image

from palette import snap

ROOT = Path(__file__).resolve().parent.parent
# Pants whose art carries the three-bar mark at BOX (the 2020 sets differ).
MARK_PANTS = ['pants-red', 'pants-white', 'pants-black', 'pants-red-script', 'pants-white-script',
              'pants-black-script', 'pants-halloween', 'pants-ironwings', 'pants-redgold', 'pants-black-23']
# In pixels of the 542 px wide art: the drawn mark's box, and the new mark's
# center and height.
BOX = (376, 42, 442, 86)
CENTER = (409, 66)
SIZE = 18
# Doc (2026-10-05): use the jersey's chest mark on the pants. Its box in the
# white jersey art, where it is drawn red on white.
JERSEY_MARK = ('jersey-white', (688, 236, 775, 291))
# The hip-logo art wraps around the curve of the hip on the 3D player, which
# stretches it sideways; draw it this much narrower and taller to keep the
# jersey mark's shape.
LOGO_SCALE = (0.75, 1.3)


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def jersey_mark():
    """The jersey's chest mark as a coverage mask (0..1), cropped tight."""
    name, box = JERSEY_MARK
    rgb = np.array(Image.open(ROOT / 'assets' / 'uni' / f'{name}.webp').convert('RGB').crop(box)).astype(float)
    m = (1 - rgb[:, :, 1] / 255).clip(0, 1)  # red ink has no green
    ys, xs = np.where(m > 0.05)
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def redraw_mark(img, transparent):
    """Returns a copy of `img` with the hip mark redrawn. `transparent` is
    True for the hip-logo art (clear to nothing), False for the panel art
    (clear to the pants color)."""
    a = np.array(img.convert('RGBA'))
    k = a.shape[1] / 542
    x0, y0, x1, y1 = (round(v * k) for v in BOX)
    box = a[y0:y1, x0:x1].astype(int)
    # The mark's color: its solid pixels, not the antialiased edges.
    if transparent:
        ink = box[box[:, :, 3] > 250][:, :3]
    else:
        base = np.median(box[-1, :, :3], axis=0)
        dist = np.abs(box[:, :, :3] - base).max(2)
        ink = box[:, :, :3][dist >= max(80, dist.max() - 30)]
    if not len(ink):
        return img.convert('RGBA')
    color = rgb(snap('#%02X%02X%02X' % tuple(int(v) for v in np.median(ink, axis=0))))
    if transparent:
        a[y0:y1, x0:x1] = 0
    else:
        a[y0:y1, x0:x1, :3] = base.astype(np.uint8)
    # Stamp the jersey mark, scaled to SIZE tall, centered on CENTER.
    sx, sy = LOGO_SCALE if transparent else (1.0, 1.0)
    mark = jersey_mark()
    h = SIZE * k * sy
    w = h / mark.shape[0] * mark.shape[1] * sx / sy
    stamp = Image.fromarray((mark * 255).astype(np.uint8)).resize((round(w), round(h)), Image.LANCZOS)
    m = np.zeros((y1 - y0, x1 - x0))
    mx, my = round(CENTER[0] * k - w / 2) - x0, round(CENTER[1] * k - h / 2) - y0
    m[my:my + stamp.height, mx:mx + stamp.width] = np.array(stamp) / 255
    m = m[:, :, None]
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
