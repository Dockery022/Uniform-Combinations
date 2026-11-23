#!/usr/bin/env python3
"""Make the red 2026 cardinal-head helmet from the White 2020 helmet's art.

Doc (2026-11-23): the 2026 red helmet is like the White cardinal head 2020
helmet, but on a red shell and with no number on the back. In Doc's photos
the cardinal head (red head, yellow beak, black linework) carries a thin
white outline where it sits on the red shell.

This recolors the 2020 white shell red in the panel's side-view art (the
ear hole and facemask keep their colors), adds the white outline to the
2020 cardinal head decal, and writes helmet-red-26-*.webp next to the
originals. prepare-uniforms.py calls make() after it writes the 2020 art,
and takes the 3D spec from SPEC. Run this file directly to rebuild the art
from the WebPs already in assets/uni/:

    python3 tools/red_26_helmet.py

Needs Pillow and NumPy.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from palette import RED, WHITE

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'uni'
SOURCE = 'helmet-white-20'
NAME = 'helmet-red-26'
# White outline around the cardinal head, in pixels of the 752 px decal art.
OUTLINE = 4
# The 3D spec: the 2020 template, a gloss red shell, no back number.
SPEC = {
    'shell': RED, 'finish': 'gloss', 'mirror': True, 'decalMetal': 0, 'stripe': [],
    'back': {'number': False},
    'decal': f'decal-{NAME}',
    'decalArt': {'width': 752, 'height': 762, 'frontX': 85, 'topY': 5, 'pxPerUnit': 541.7},
}


def rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)


def grow(mask, px):
    img = Image.fromarray((mask * 255).astype(np.uint8))
    for _ in range(px):
        img = img.filter(ImageFilter.MaxFilter(3))
    return np.array(img).astype(float) / 255


def decal():
    """The 2020 cardinal head with a white outline, as RGBA."""
    a = np.array(Image.open(OUT / f'decal-{SOURCE}.webp').convert('RGBA')).astype(float)
    # Keep only the head: the 2020 cut also caught a sliver of the ear hole.
    solid = Image.fromarray(((a[:, :, 3] > 40) * 255).astype(np.uint8)).copy()
    ys, xs = np.nonzero(np.array(solid) == 255)
    best, size = None, 0
    while len(xs):
        ImageDraw.floodfill(solid, (int(xs[0]), int(ys[0])), 100)
        part = np.array(solid) == 100
        if part.sum() > size:
            best, size = part, part.sum()
        solid = Image.fromarray(np.where(part, 50, np.array(solid)).astype(np.uint8)).copy()
        ys, xs = np.nonzero(np.array(solid) == 255)
    a[:, :, 3] *= grow(best, 2)
    alpha = a[:, :, 3] / 255
    ring = grow(alpha > 0.5, OUTLINE)
    ring = np.array(Image.fromarray((ring * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(float) / 255
    out_a = alpha + ring * (1 - alpha)
    out_c = (a[:, :, :3] * alpha[..., None] + rgb(WHITE)[None, None, :] * (ring * (1 - alpha))[..., None]) / np.maximum(out_a, 1e-6)[..., None]
    return Image.fromarray(np.dstack([out_c, out_a * 255]).clip(0, 255).astype(np.uint8), 'RGBA')


def side_view(img, new_decal):
    """The panel art on a red shell: the white shell region, found by flood
    fill from the back of the shell, turns red with its shading; then the
    outlined decal goes on at half size."""
    a = np.array(img.convert('RGBA')).astype(float)
    h, w = a.shape[:2]
    white = (a[:, :, :3].min(axis=2) > 150) & (a[:, :, 3] > 128)
    fill = Image.fromarray((white * 255).astype(np.uint8)).copy()
    ImageDraw.floodfill(fill, (int(w * 0.85), int(h * 0.4)), 128)
    shell = np.array(fill) == 128
    # Anti-aliased shell pixels next to the outline: grow a little into the
    # light-gray fringe.
    fringe = grow(shell, 1) > 0
    shell |= fringe & (a[:, :, :3].min(axis=2) > 90) & (np.ptp(a[:, :, :3], axis=2) < 40)
    shade = (a[:, :, :3].mean(axis=2) / 255)[..., None]
    a[shell, :3] = (rgb(RED)[None, None, :] * np.clip(shade / 0.97, 0, 1))[shell]
    d = np.array(new_decal.resize((w, h), Image.LANCZOS)).astype(float)
    k = d[:, :, 3:] / 255
    a[:, :, :3] = a[:, :, :3] * (1 - k) + d[:, :, :3] * k
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def make(out=OUT):
    new = decal()
    new.save(out / f'decal-{NAME}.webp', 'WEBP', quality=90, method=6)
    for mask in ('red', 'white', 'black'):
        side_view(Image.open(out / f'{SOURCE}-mask-{mask}.webp'), new).save(out / f'{NAME}-mask-{mask}.webp', 'WEBP', quality=88, method=6)


if __name__ == '__main__':
    make()
