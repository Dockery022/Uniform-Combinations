"""
Generates tileable football-jersey mesh maps (original, no third-party assets).

Outputs (in jersey-material/maps/):
  mesh_normal.png     tangent-space normal map (OpenGL / three.js convention)
  mesh_roughness.png  roughness map (green channel used by three.js)
  mesh_detail.png     grayscale multiply map (weave shading + hole darkening)

Usage:
  python make_mesh_maps.py                  # defaults
  python make_mesh_maps.py --size 1024 --cells 24 --style dimple
  python make_mesh_maps.py --style tricot   # tighter, flatter "practice jersey" mesh
"""
import argparse
import os
import numpy as np
from PIL import Image


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def periodic_blur(a, passes=2):
    for _ in range(passes):
        a = (
            a * 4
            + np.roll(a, 1, 0) + np.roll(a, -1, 0)
            + np.roll(a, 1, 1) + np.roll(a, -1, 1)
        ) / 8.0
    return a


def make_height(size, cells, style, seed):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size].astype(np.float64)
    u = x / size * cells          # cell coordinates
    v = y / size * cells

    # Staggered (brick/hex-like) hole grid: every other row offset by half a cell.
    row = np.floor(v)
    u_off = u + (row % 2) * 0.5
    fu = (u_off % 1.0) - 0.5
    fv = (v % 1.0) - 0.5

    if style == "dimple":
        # Round holes, classic football "dimple mesh"
        d = np.sqrt(fu ** 2 + (fv * 1.0) ** 2)
        hole = 1.0 - smoothstep(0.17, 0.30, d)   # 1 inside hole, 0 on fabric
    else:
        # tricot: small elongated holes, tighter look
        d = np.sqrt((fu / 1.2) ** 2 + (fv / 0.8) ** 2)
        hole = 1.0 - smoothstep(0.10, 0.22, d)

    # Fabric surface rises between holes
    height = 1.0 - hole

    # Fine woven/knit micro-texture on the fabric (periodic so it tiles)
    freq = cells * 6
    weave = (
        0.5 + 0.5 * np.sin(2 * np.pi * (x / size) * freq)
    ) * (
        0.5 + 0.5 * np.sin(2 * np.pi * (y / size) * freq * 0.9)
    )
    height += 0.06 * weave * (1.0 - hole)

    # Soft low-frequency noise so it doesn't look perfectly CG
    noise = rng.random((size, size))
    noise = periodic_blur(noise, passes=6)
    height += 0.05 * (noise - noise.mean())

    height = periodic_blur(height, passes=1)
    return height, hole, weave


def height_to_normal(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx = -dx * strength
    ny = dy * strength          # flip Y: image rows go down, OpenGL normal Y goes up
    nz = np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / ln, ny / ln, nz / ln], axis=-1)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--cells", type=int, default=20, help="holes across one tile")
    ap.add_argument("--style", choices=["dimple", "tricot"], default="dimple")
    ap.add_argument("--strength", type=float, default=14.0, help="normal map strength")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "maps"))
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    h, hole, weave = make_height(args.size, args.cells, args.style, args.seed)

    normal = height_to_normal(h, args.strength)
    Image.fromarray(normal, "RGB").save(os.path.join(args.out, "mesh_normal.png"))

    # Roughness: polyester is fairly smooth with a slight sheen; holes/edges rougher.
    rough = 0.52 + 0.18 * hole + 0.08 * weave
    rough = np.clip(rough, 0, 1)
    r8 = (rough * 255).astype(np.uint8)
    Image.fromarray(np.stack([r8, r8, r8], -1), "RGB").save(
        os.path.join(args.out, "mesh_roughness.png")
    )

    # Detail/multiply: darken holes (you see the body/undershirt through them)
    detail = 1.0 - 0.45 * hole - 0.06 * weave
    d8 = (np.clip(detail, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(np.stack([d8, d8, d8], -1), "RGB").save(
        os.path.join(args.out, "mesh_detail.png")
    )
    print(f"Wrote 3 maps to {args.out}/ ({args.size}px, {args.cells} cells, {args.style})")


if __name__ == "__main__":
    main()
