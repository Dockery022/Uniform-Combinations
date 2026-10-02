#!/usr/bin/env python3
"""Snap colors sampled from the art to the UofL brand palette.

Cardinal Red #C9001F, Black #000000, White #FFFFFF, Metallic Silver #8A8D8F.
Beak yellow #FDB913 belongs to the bird logo only, so it is never produced
here; gold accents on alternate uniforms (Red Gold, Halloween) are kept as
the art has them.

prepare-uniforms.py runs every sampled color through snap(). To snap an
existing spec without the source art:

    python3 tools/palette.py src/uniform-art.js
"""
import re
import sys

RED, BLACK, WHITE, SILVER = '#C9001F', '#000000', '#FFFFFF', '#8A8D8F'


def snap(hex_color):
    n = int(hex_color[1:], 16)
    r, g, b = n >> 16, (n >> 8) & 255, n & 255
    hi, lo = max(r, g, b), min(r, g, b)
    if r > 100 and r - g > 90 and r - b > 60:
        return RED  # any saturated red: base, trim, stripes, numbers
    if hi < 80:
        return BLACK  # charcoal reads as black
    if lo > 205:
        return WHITE  # off-whites from shading in the art
    if hi - lo < 24:
        return SILVER  # any neutral gray in between
    return hex_color


def snap_file(path):
    text = open(path).read()
    out = re.sub(r'"(#[0-9a-fA-F]{6})"', lambda m: f'"{snap(m.group(1))}"', text)
    open(path, 'w').write(out)


if __name__ == '__main__':
    for p in sys.argv[1:]:
        snap_file(p)
