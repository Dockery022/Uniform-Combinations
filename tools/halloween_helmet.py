#!/usr/bin/env python3
"""Redraw the Halloween helmet's art to match the real helmet.

Doc's photos of the Halloween helmet (2026-10-23) show a matte black shell,
the cardinal head on each side filled cream (head, beak, eye and teeth) with
its usual black linework and a thin metallic gold keyline around the
outside, and a gold / black / gold / black / gold center stripe. The drawn
art had only a gold outline of the bird.

This builds the side decal from the Red Gold helmet's cardinal head (same
drawing, same place on the template), recolors it, and redraws the panel's
side-view art to match. prepare-uniforms.py calls redraw() after it cuts the
decals. Run this file directly to patch the WebPs already in assets/uni/
(running it again draws the same art):

    python3 tools/halloween_helmet.py

Needs Pillow and NumPy.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from palette import BLACK

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'uni'
NAME = 'helmet-halloween'
SOURCE = 'decal-helmet-redgold'
# Read off the photos. Gold is the Halloween alternate's approved accent.
CREAM = '#EDE8CF'
GOLD = '#D8C77E'
# Keyline width around the bird, in pixels of the 752 px decal art.
KEYLINE = 5
# Center stripe across the top of the shell, in meters from the center line
# (later bands paint over earlier ones; the shell shader takes three): gold,
# black inside it leaving a thin gold edge each side, and a wide gold stripe
# down the middle. prepare-uniforms.py reads this.
STRIPE = [{'at': 0, 'w': 0.08, 'color': GOLD},
          {'at': 0, 'w': 0.062, 'color': BLACK},
          {'at': 0, 'w': 0.024, 'color': GOLD}]
# The back of the shell: no number (the stripe runs down the middle), a flag
# sticker low on the left as seen from behind, and CARDINALS in gold on the
# bumper. Helmet units from the back's center; see paintHelmetBack.
BACK = {'number': False, 'flag': {'x': -0.2, 'y': -0.3, 'w': 0.15}, 'word': 'CARDINALS', 'wordColor': GOLD}
# The same stripe on the 376 px side-view art: (inset from the shell's top
# edge, color) for each pixel row, outside in.
SIDE_STRIPE = [GOLD] * 2 + [BLACK] * 4 + [GOLD] * 5 + [BLACK] * 4 + [GOLD] * 2
SIDE_INSET = 5


def rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)


def grow(mask, px):
    img = Image.fromarray((mask * 255).astype(np.uint8))
    for _ in range(px):
        img = img.filter(ImageFilter.MaxFilter(3))
    return np.array(img).astype(float) / 255


def decal():
    """The cream cardinal head with its gold keyline, as RGBA."""
    a = np.array(Image.open(OUT / f'{SOURCE}.webp').convert('RGBA')).astype(float)
    alpha = a[:, :, 3] / 255
    # Black linework stays black; everything lighter (gold head and beak,
    # white eye and teeth) turns cream, keeping the art's anti-aliasing.
    light = (a[:, :, :3].max(axis=2) / 255).clip(0, 1)
    light = ((light - 0.15) / 0.5).clip(0, 1)
    color = rgb(BLACK)[None, None, :] * (1 - light[..., None]) + rgb(CREAM)[None, None, :] * light[..., None]
    key = grow(alpha > 0.5, KEYLINE)
    key = np.array(Image.fromarray((key * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(float) / 255
    out_a = alpha + key * (1 - alpha)
    out_c = (color * alpha[..., None] + rgb(GOLD)[None, None, :] * (key * (1 - alpha))[..., None]) / np.maximum(out_a, 1e-6)[..., None]
    out = np.dstack([out_c, out_a * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def side_view(img, new_decal, old_decal):
    """The panel's side-view art with the old bird painted out, the new one
    in, and the center stripe along the top of the shell."""
    a = np.array(img.convert('RGBA')).astype(float)
    h, w = a.shape[:2]
    half = lambda im: np.array(im.resize((w, h), Image.LANCZOS)).astype(float)
    old = grow(half(old_decal)[:, :, 3] > 20, 2)
    a[:, :, :3] = a[:, :, :3] * (1 - old[..., None]) + rgb(BLACK)[None, None, :] * old[..., None]

    # The stripe follows the shell's top edge, measured straight down from it
    # in each column (the art's top is a smooth curve), between the facemask
    # and the back of the shell. Supersampled so its edges stay smooth.
    top = np.array([np.argmax(a[:, x, 3] > 128) for x in range(w)], float)
    top = np.convolve(np.pad(top, 3, mode='edge'), np.ones(7) / 7, mode='valid')
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    reach = (a[:, :, 3] > 128) & (xx > 0.2 * w) & (xx < 0.93 * w)
    colors = np.array([rgb(c) for c in SIDE_STRIPE])
    acc = np.zeros((h, w, 3))
    cover = np.zeros((h, w))
    for sub in np.linspace(-0.375, 0.375, 4):
        v = yy + sub - top[None, :] - SIDE_INSET
        i = np.floor(v).astype(int)
        on = reach & (i >= 0) & (i < len(SIDE_STRIPE))
        acc[on] += colors[i[on]] * 0.25
        cover[on] += 0.25
    k = cover[..., None]
    a[:, :, :3] = a[:, :, :3] * (1 - k) + acc
    d = half(new_decal)
    k = d[:, :, 3:] / 255
    a[:, :, :3] = a[:, :, :3] * (1 - k) + d[:, :, :3] * k
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def redraw(out=OUT):
    old = Image.open(out / f'decal-{NAME}.webp').convert('RGBA')
    new = decal()
    for mask in ('red', 'white', 'black'):
        path = out / f'{NAME}-mask-{mask}.webp'
        side_view(Image.open(path), new, old).save(path, 'WEBP', quality=88, method=6)
    new.save(out / f'decal-{NAME}.webp', 'WEBP', quality=90, method=6)


if __name__ == '__main__':
    redraw()
