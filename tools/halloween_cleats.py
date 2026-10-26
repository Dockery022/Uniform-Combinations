#!/usr/bin/env python3
"""Gold-trimmed black cleats for the Halloween combo.

Doc (2026-10-24): for the Halloween combo, replace the white on the black
cleats with gold. This recolors shoes-black.webp into
shoes-black-gold.webp: light pixels (the stripes and the sole plate) become
the Halloween gold, keeping the art's shading; the black upper is
untouched. combo.js swaps in this art when black cleats are worn with the
Halloween jersey or pants.

    python3 tools/halloween_cleats.py

Needs Pillow and NumPy.
"""
from pathlib import Path

import numpy as np
from PIL import Image

from halloween_helmet import GOLD, rgb

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'uni'


def recolor(img):
    a = np.array(img.convert('RGBA')).astype(float)
    lum = a[:, :, :3].mean(axis=2) / 255
    # How white a pixel is: 0 for the black upper, 1 for the stripes and sole.
    t = np.clip((lum - 0.25) / 0.3, 0, 1)
    t = t * t * (3 - 2 * t)
    shade = np.clip(lum / 0.95, 0, 0.9)[..., None]
    gold = rgb(GOLD)[None, None, :] * shade
    a[:, :, :3] = a[:, :, :3] * (1 - t[..., None]) + gold * t[..., None]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    recolor(Image.open(OUT / 'shoes-black.webp')).save(OUT / 'shoes-black-gold.webp', 'WEBP', quality=88, method=6)
