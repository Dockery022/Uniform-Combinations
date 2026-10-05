#!/usr/bin/env python3
"""Run the 2026 pants' side panels down to the hem in the panel art.

The design draws the 2026 side panels stopping partway down the thigh, cut
at an angle; on the field (and on the 3D player, PANEL_END in
prepare-uniforms.py) they run the full outside seam, waistband to hem. This
copies the panel's rows from the thigh, where the drawing has it at full
width, down the outer edge of each leg to the sock line.

prepare-uniforms.py calls extend_panels() for the pants in PANEL_END. Run
this file directly to patch the WebPs already in assets/uni/:

    python3 tools/pants_panels.py

Needs Pillow and NumPy.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NAMES = ['pants-red', 'pants-white', 'pants-black']


def extend_panels(img):
    """Returns a copy of the front-view pants art with each side panel
    continued from the thigh to the sock line."""
    a = np.array(img.convert('RGBA')).astype(np.int16)
    h, w = a.shape[:2]
    base = np.median(a[int(h * 0.12):int(h * 0.25), int(w * 0.42):int(w * 0.58), :3].reshape(-1, 3), axis=0)
    k = int(w * 0.11)  # strip width copied from the edge inward: outline, panel and some pants color
    ref = list(range(int(h * 0.26), int(h * 0.34)))  # rows where the drawn panel is full width
    out = a.copy()
    for side in (1, -1):
        def edge(y):
            alpha = a[y, :, 3] > 128
            if not alpha.any():
                return None
            return int(np.argmax(alpha)) if side == 1 else w - 1 - int(np.argmax(alpha[::-1]))

        def strip(y):
            x = edge(y)
            return a[y, x:x + k] if side == 1 else a[y, x - k + 1:x + 1][::-1]

        strips = [strip(y) for y in ref]
        # Sock line: the first row below mid-leg where the pants color gives
        # way to the outline across the leg.
        probe = int(w * 0.07)
        sock = next(y for y in range(int(h * 0.6), h) if edge(y) is not None
                    and np.abs(a[y, edge(y) + side * probe, :3] - base).max() > 40)
        for i, y in enumerate(range(ref[-1] + 1, sock - 1)):
            x = edge(y)
            s = strips[i % len(strips)]
            cols = np.arange(x, x + k) if side == 1 else np.arange(x, x - k, -1)
            inside = a[y, cols, 3] > 128
            out[y, cols[inside]] = s[inside]
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    for name in NAMES:
        path = ROOT / 'assets' / 'uni' / f'{name}.webp'
        extend_panels(Image.open(path)).save(path, 'WEBP', quality=88, method=6)
        print('extended', path.relative_to(ROOT))
