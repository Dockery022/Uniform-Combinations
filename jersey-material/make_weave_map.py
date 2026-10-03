"""
Generates a tileable fine-weave normal map (original, no third-party assets).

The dimple mesh (make_mesh_maps.py) gives the jersey its holes; this adds the
thread texture of the cloth itself, at a much smaller scale, on top of it and
on the smooth yoke, sleeves and pants.

Output (in jersey-material/maps/):
  weave_normal.png   tangent-space normal map (OpenGL / three.js convention)

Usage:
  python make_weave_map.py                 # 256 px, 16 threads per tile
  python make_weave_map.py --threads 12 --strength 3
"""
import argparse
import os
import numpy as np
from PIL import Image


def weave_height(size, threads):
    y, x = np.mgrid[0:size, 0:size].astype(np.float64)
    u = x / size * threads
    v = y / size * threads
    # Each thread is a rounded ridge; warp (vertical) and weft (horizontal)
    # cross over and under each other in a plain-weave checkerboard.
    warp = np.cos(np.pi * (u % 1.0 - 0.5)) ** 2
    weft = np.cos(np.pi * (v % 1.0 - 0.5)) ** 2
    over = ((np.floor(u) + np.floor(v)) % 2) * 2 - 1  # +1: warp on top
    # The thread on top bulges where it crosses, the one underneath dips.
    bulge_u = np.sin(np.pi * (v % 1.0)) * over
    bulge_v = -np.sin(np.pi * (u % 1.0)) * over
    return np.maximum(warp * (0.6 + 0.4 * bulge_u), weft * (0.6 + 0.4 * bulge_v))


def to_normal(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    n = np.stack([-dx, dy, np.ones_like(h)], -1)  # +Y up (OpenGL)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).round().astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', type=int, default=256)
    ap.add_argument('--threads', type=int, default=16)
    ap.add_argument('--strength', type=float, default=2.5)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), 'maps'))
    a = ap.parse_args()
    h = weave_height(a.size, a.threads)
    Image.fromarray(to_normal(h, a.strength), 'RGB').save(os.path.join(a.out, 'weave_normal.png'), optimize=True)


if __name__ == '__main__':
    main()
