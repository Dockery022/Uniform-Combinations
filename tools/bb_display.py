"""Convert Sev's Sketchfab "Basketball Jersey" (CC-BY-4.0) into the
basketball builder's uniform, basketball/assets/bb-display.glb.

  python3 tools/bb_display.py path/to/basketball_jersey.glb

Doc made this model the gold standard for the basketball uniform
(2026-11-16). It is a ghost tank and shorts (no body) simulated as real
sewn pattern pieces, and its UVs are those flat pattern pieces, so our
designs are painted the way a sublimated uniform is printed: flat, piece
by piece.

The source is millimeters, Z up, split into 65k-vertex chunks across four
materials: printed outer cloth, an inner copy of it ~3 mm inside, the
neck/armhole bindings and the drawstring. Out come meters, Y up, front +z,
and three meshes:

  tank    outer cloth and bindings
  shorts  outer cloth (the waistband is folded over at the top)
  string  the drawstring

The inner copy is dropped (the app draws the cloth two-sided instead).

TEXCOORD_0 is a new atlas: every pattern piece upright (body up = atlas
up), seen from outside, at true size, packed into one rectangle. The asset
extras carry the atlas size in meters and, per piece, where it sits and its
landmarks (atlas meters, y down), so the app knows where to print what.

Per-vertex trim distances, in meters along the cloth (measured flat on the
pattern, so they are exact), packed in _TRIM:

  tank    neck: from the neck binding's free edge
          arm: from the armhole binding's free edge
          side: from the side seam
  shorts  side: signed, from the line down the outside of the leg
          (+ toward the back); waist: from the waistband's top fold;
          hem: from the folded leg hem

Source: https://sketchfab.com/3d-models/basketball-jersey-3ee634a324d5400ab84555b0636416f6
Author: Sev (https://sketchfab.com/sevclothing), license CC-BY-4.0.
"""
import json, struct, sys
import numpy as np

OUTER, INNER, BINDING, STRING = 1, 2, 3, 0
FAR = 9.0

# The pattern pieces, by where they sit in the source UVs:
# (u0, u1, v0, v1, material).
PIECES = {
    'front': (0.03, 0.49, -0.34, -0.06, OUTER),
    'back': (0.50, 0.96, -0.34, -0.06, OUTER),
    'legL': (0.19, 0.80, 0.02, 0.28, OUTER),    # wearer's left leg (+x)
    'legR': (-0.81, -0.20, 0.29, 0.55, OUTER),  # wearer's right leg (-x)
    'neckB': (0.03, 0.58, 0.56, 0.59, BINDING),
    'armR': (-0.22, -0.11, 0.33, 0.55, BINDING),
    'armL': (-0.10, 0.00, -0.67, -0.45, BINDING),
}


def load(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    bin_ = b[20 + n + 8:]

    def acc(i):
        a = j['accessors'][i]
        v = j['bufferViews'][a['bufferView']]
        k = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a['componentType']]
        off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        r = np.frombuffer(bin_, dtype=dt, count=a['count'] * k, offset=off)
        return r.reshape(-1, k) if k > 1 else r

    def matrix(node):
        if 'matrix' in node:
            return np.array(node['matrix']).reshape(4, 4).T
        return np.eye(4)

    parts = []

    def walk(i, M):
        node = j['nodes'][i]
        M = M @ matrix(node)
        if 'mesh' in node:
            for p in j['meshes'][node['mesh']]['primitives']:
                P = acc(p['attributes']['POSITION']).astype(np.float64) @ M[:3, :3].T + M[:3, 3]
                N = acc(p['attributes']['NORMAL']).astype(np.float64) @ np.linalg.inv(M[:3, :3])
                N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
                UV = acc(p['attributes']['TEXCOORD_0']).astype(np.float64)
                I = acc(p['indices']).astype(np.int64).reshape(-1, 3)
                parts.append((p.get('material'), P, N, UV, I))
        for c in node.get('children', []):
            walk(c, M)

    for r in j['scenes'][j.get('scene', 0)]['nodes']:
        walk(r, np.eye(4))
    return parts


def merge(parts):
    P, N, UV, I, M = [], [], [], [], []
    base = 0
    for m, p, n, uv, i in parts:
        P.append(p); N.append(n); UV.append(uv); I.append(i + base); M.append(np.full(len(p), m))
        base += len(p)
    return np.concatenate(P), np.concatenate(N), np.concatenate(UV), np.concatenate(I), np.concatenate(M)


def islands(P, UV, I):
    """Connected pieces of cloth, welding vertices that share position and UV."""
    key = np.concatenate([np.round(P * 1e4), np.round(UV * 1e5)], 1).astype(np.int64)
    _, w = np.unique(key, axis=0, return_inverse=True)
    w = w.ravel()
    parent = np.arange(w.max() + 1)

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b, c in w[I]:
        ra = find(a)
        parent[find(b)] = ra
        parent[find(c)] = ra
    return np.array([find(x) for x in range(len(parent))])[w], w


def boundary_vertices(I, weld):
    """Vertices on an edge only one triangle uses (welded by position + UV)."""
    e = np.concatenate([I[:, [0, 1]], I[:, [1, 2]], I[:, [2, 0]]])
    we = np.sort(weld[e], 1)
    _, inv, cnt = np.unique(we, axis=0, return_inverse=True, return_counts=True)
    once = e[cnt[inv.ravel()] == 1]
    return np.unique(once.ravel())


def nearest(Q, R, chunk=2048):
    """Distance from each point of Q to the nearest point of R, and its index."""
    d = np.empty(len(Q))
    k = np.empty(len(Q), np.int64)
    if len(R) == 0:
        d[:] = FAR
        k[:] = -1
        return d, k
    R2 = (R ** 2).sum(1)
    for s in range(0, len(Q), chunk):
        q = Q[s:s + chunk]
        dd = (q ** 2).sum(1)[:, None] - 2 * q @ R.T + R2[None, :]
        k[s:s + chunk] = dd.argmin(1)
        d[s:s + chunk] = np.sqrt(np.maximum(dd[np.arange(len(q)), k[s:s + chunk]], 0))
    return d, k


def thin(pts, step=0.002):
    """Every point set down to about one per `step` meters."""
    if len(pts) == 0:
        return pts
    _, first = np.unique(np.floor(pts / step).astype(np.int64), axis=0, return_index=True)
    return pts[np.sort(first)]


def extreme(ax, y, top, step=0.004):
    """Per `step` of pattern width, the cloth highest (or lowest) on the body."""
    b = np.floor(ax / step).astype(np.int64)
    order = np.lexsort((-y if top else y, b))
    first = np.r_[True, b[order][1:] != b[order][:-1]]
    return order[first]


def orient(M2, target):
    """The rotation or reflection taking pattern coords to `target` best."""
    a = M2 - M2.mean(0)
    t = target - target.mean(0)
    A = np.linalg.lstsq(a, t, rcond=None)[0].T  # t ~ A a
    U, _, Vt = np.linalg.svd(A)
    Q = U @ Vt
    # Pattern pieces are drafted square to the page: snap near-right angles.
    ang = np.arctan2(Q[1, 0], Q[0, 0])
    snap = np.round(ang / (np.pi / 2)) * (np.pi / 2)
    if abs(ang - snap) < np.radians(6):
        c, s = np.cos(snap), np.sin(snap)
        R = np.array([[c, -s], [s, c]])
        Q = R if np.linalg.det(Q) > 0 else R @ np.diag([1, -1])
        Q = np.round(Q)
    return Q


TRIM_SCALE = 10.0  # _TRIM stores distances / TRIM_SCALE as normalized shorts


def write_glb(path, meshes, extras):
    """A GLB with quantized attributes (KHR_mesh_quantization): positions as
    shorts scaled by the node, normals as bytes, UVs as unsigned shorts and
    the trim distances as one normalized-short VEC4 (_TRIM, times
    TRIM_SCALE in meters). Each mesh's node carries its dequantizing scale."""
    blobs, views, accs, gmeshes, nodes = [], [], [], [], []
    off = 0

    def add(data, count, kind, comp, target, stride=None, normalized=False, minmax=None):
        nonlocal off
        data = data.tobytes()
        pad = (-len(data)) % 4
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': target}
        if stride:
            v['byteStride'] = stride
        views.append(v)
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': count, 'type': kind}
        if normalized:
            a['normalized'] = True
        if minmax:
            a['min'], a['max'] = minmax
        accs.append(a)
        blobs.append(data + b'\0' * pad)
        off += len(data) + pad
        return len(accs) - 1

    def padded(arr, width, dtype):
        out = np.zeros((len(arr), width), dtype)
        out[:, :arr.shape[1]] = arr
        return out

    for name, (attrs, index) in meshes.items():
        n = len(attrs['POSITION'])
        P = attrs['POSITION']
        lo, hi = P.min(0), P.max(0)
        mid, half = (lo + hi) / 2, np.maximum((hi - lo) / 2, 1e-6)
        q = np.round((P - mid) / half * 32767).astype(np.int16)
        amap = {'POSITION': add(padded(q, 4, np.int16), n, 'VEC3', 5122, 34962, 8,
                                minmax=(q.min(0).astype(int).tolist(), q.max(0).astype(int).tolist()))}
        nq = np.round(np.clip(attrs['NORMAL'], -1, 1) * 127).astype(np.int8)
        amap['NORMAL'] = add(padded(nq, 4, np.int8), n, 'VEC3', 5120, 34962, 4, normalized=True)
        uv = np.round(np.clip(attrs['TEXCOORD_0'], 0, 1) * 65535).astype(np.uint16)
        amap['TEXCOORD_0'] = add(uv, n, 'VEC2', 5123, 34962, normalized=True)
        if '_TRIM' in attrs:
            t = np.round(np.clip(attrs['_TRIM'] / TRIM_SCALE, -1, 1) * 32767).astype(np.int16)
            amap['_TRIM'] = add(padded(t, 4, np.int16), n, 'VEC4', 5122, 34962, normalized=True)
        big = n > 65535
        ii = add(np.ascontiguousarray(index.ravel(), dtype=np.uint32 if big else np.uint16), index.size, 'SCALAR', 5125 if big else 5123, 34963)
        gmeshes.append({'name': name, 'primitives': [{'attributes': amap, 'indices': ii}]})
        nodes.append({'name': name, 'mesh': len(gmeshes) - 1, 'translation': mid.tolist(), 'scale': (half / 32767).tolist()})
    j = {
        'asset': {'version': '2.0', 'extras': {
            'title': 'Basketball Jersey', 'author': 'Sev (https://sketchfab.com/sevclothing)',
            'license': 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
            'source': 'https://sketchfab.com/3d-models/basketball-jersey-3ee634a324d5400ab84555b0636416f6',
            'changes': 'Converted to meters and Y up; inner cloth layer and texture removed; UVs repacked into an upright '
                       'pattern atlas; trim distances added; split into tank, shorts and drawstring; quantized.',
            **extras}},
        'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
        'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': gmeshes,
        'buffers': [{'byteLength': off}], 'bufferViews': views, 'accessors': accs,
    }
    js = json.dumps(j).encode()
    js += b' ' * ((-len(js)) % 4)
    bin_ = b''.join(blobs)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_
    open(path, 'wb').write(out)


def main(src, dst):
    parts = load(src)
    P, N, UV, I, MAT = merge([p for p in parts if p[0] in (OUTER, BINDING)])
    P = P / 1000
    isl, weld = islands(P, UV, I)
    bverts = np.zeros(len(P), bool)
    bverts[boundary_vertices(I, weld)] = True

    # Which piece each vertex belongs to.
    names = list(PIECES)
    piece = np.full(len(P), -1)
    for k, (u0, u1, v0, v1, m) in enumerate(PIECES.values()):
        s = (UV[:, 0] >= u0) & (UV[:, 0] <= u1) & (UV[:, 1] >= v0) & (UV[:, 1] <= v1) & (MAT == m)
        piece[s] = k
    assert (piece >= 0).all(), 'a vertex outside every pattern piece'
    sel = {n: piece == k for k, n in enumerate(names)}

    # The UVs are the flat pattern at a known scale (u and v differ, the
    # source texture was 2048 x 4096): fit meters per UV unit from the
    # edge lengths, then work in pattern meters.
    e = np.concatenate([I[:, [0, 1]], I[:, [1, 2]], I[:, [2, 0]]])
    d3 = np.linalg.norm(P[e[:, 0]] - P[e[:, 1]], axis=1)
    du = UV[e[:, 0]] - UV[e[:, 1]]
    su, sv = np.sqrt(np.linalg.lstsq(du ** 2, d3 ** 2, rcond=None)[0])
    M2 = UV * [su, sv]
    print('pattern scale: %.4f m per u, %.4f m per v' % (su, sv))

    # Upright and seen from outside: atlas x runs to the viewer's right,
    # atlas y runs down the body.
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    look = {'front': x, 'back': -x, 'legL': -z, 'legR': z}
    A = np.zeros((len(P), 2))
    for n in names:
        s = sel[n]
        if n in look:
            Q = orient(M2[s], np.stack([look[n][s], -y[s]], 1))
        else:
            Q = np.eye(2)  # bindings: only their trim distances matter
        A[s] = M2[s] @ Q.T

    # Shelf-pack the pieces into one atlas, PAD apart.
    PAD = 0.03
    rows = [['front', 'back'], ['legL', 'legR'], ['neckB', 'armR', 'armL']]
    place, cy, width = {}, PAD, 0
    for row in rows:
        cx, h = PAD, 0
        for n in row:
            s = sel[n]
            lo, hi = A[s].min(0), A[s].max(0)
            A[s] += [cx, cy] - lo
            place[n] = [cx, cy, hi[0] - lo[0], hi[1] - lo[1]]
            cx += hi[0] - lo[0] + PAD
            h = max(h, hi[1] - lo[1])
        width = max(width, cx)
        cy += h + PAD
    size = [width, cy]
    print('atlas %.3f x %.3f m' % tuple(size))

    # ---- trim distances, flat on the pattern ----
    NECK, ARM, SIDE, WAIST, HEM = (np.full(len(P), FAR) for _ in range(5))
    land = {n: {'box': [round(v, 4) for v in place[n]]} for n in names}

    def bpts(s):
        return np.where(s & bverts)[0]

    # Bindings: the edge sewn to the tank vs the free edge.
    body = np.where(sel['front'] | sel['back'])[0]
    bodyRef = P[body][::3]
    for n, field in (('neckB', NECK), ('armR', ARM), ('armL', ARM)):
        s = sel[n]
        b = bpts(s)
        d, _ = nearest(P[b], bodyRef)
        free = thin(A[b[d > 0.012]], 0.001)
        idx = np.where(s)[0]
        field[idx] = nearest(A[idx], free)[0]
        land[n]['width'] = round(float(np.percentile(field[idx], 98)), 4)
        print(n, 'binding width %.1f mm' % (1000 * land[n]['width']))
    neckW = land['neckB']['width']
    armW = (land['armR']['width'] + land['armL']['width']) / 2
    neckRef = P[sel['neckB']][::2]
    armRef = P[sel['armR'] | sel['armL']][::2]
    armpit = P[sel['armR'] | sel['armL'], 1].min()
    nb = sel['neckB']
    neckLow = {'front': P[nb & (P[:, 2] > 0), 1].min(), 'back': P[nb & (P[:, 2] < 0), 1].min()}
    for n in ('front', 'back'):
        s = sel[n]
        b = bpts(s)
        dn, _ = nearest(P[b], neckRef)
        da, _ = nearest(P[b], armRef)
        neck = thin(A[b[(dn < 0.004) & (dn < da)]], 0.0015)
        arm = thin(A[b[(da < 0.004) & (da <= dn)]], 0.0015)
        side = thin(A[b[(P[b, 1] < armpit - 0.003) & (np.abs(P[b, 0]) > 0.12)]], 0.0015)
        idx = np.where(s)[0]
        NECK[idx] = neckW + nearest(A[idx], neck)[0]
        ARM[idx] = armW + nearest(A[idx], arm)[0]
        SIDE[idx] = nearest(A[idx], side)[0]  # rounds off over the seam's top, into the armhole
        # Landmarks for the printing: the middle of the body, the bottom of
        # the neckline, the armpits and the hem.
        mid = idx[(np.abs(P[idx, 0]) < 0.004) & (NECK[idx] < FAR)]
        cxm = float(np.median(A[mid, 0]))
        # The bottom of the neckline as it shows: the cloth level with the
        # binding's lowest point (the body's cut edge hides under the binding).
        vee = mid[np.abs(P[mid, 1] - neckLow[n]) < 0.003]
        land[n].update({
            'center': round(cxm, 4),
            'neck': round(float(A[vee, 1].max()), 4),
            'armpit': round(float(side[:, 1].min()), 4),
            'hem': round(float(A[idx, 1].max()), 4),
        })

    # Shorts: the waistband is folded over its top; its own pieces sit next
    # to each leg in the pattern.
    for n in ('legL', 'legR'):
        s = sel[n]
        idx = np.where(s)[0]
        ids = np.unique(isl[idx])
        islMinY = {i: P[idx[isl[idx] == i], 1].min() for i in ids}
        wb = idx[np.array([islMinY[i] > 1.05 for i in isl[idx]])]
        leg = np.setdiff1d(idx, wb)
        # The fold along the top: all the way around, the highest cloth.
        fold = A[wb[extreme(A[wb, 0], P[wb, 1], top=True)]]
        WAIST[wb] = nearest(A[wb], thin(fold, 0.0015))[0]
        b = bpts(np.isin(np.arange(len(P)), leg))
        dw, k = nearest(P[b], P[wb])
        near = dw < 0.004
        seam = thin(A[b[near]], 0.0015)
        outside = float(np.median(WAIST[wb[k[near]]]))  # fold to seam, down the outside
        WAIST[leg] = outside + nearest(A[leg], seam)[0]
        # Leg hem: folded up inside, so measured from the fold, the lowest
        # cloth all the way around the leg.
        low = leg[extreme(A[leg, 0], P[leg, 1], top=False)]
        hemFold = A[low[P[low, 1] < P[leg, 1].min() + 0.06]]
        hemY = float(np.median(hemFold[:, 1]))
        HEM[idx] = nearest(A[idx], thin(hemFold, 0.0015))[0]
        # The line down the outside of the leg: per 5 mm of height, where the
        # cloth is farthest out to the side.
        ys = np.arange(A[leg, 1].min(), A[leg, 1].max() + 0.005, 0.005)
        line = []
        for y0 in ys:
            r = leg[np.abs(A[leg, 1] - y0) < 0.004]
            if len(r) < 5:
                continue
            out = np.abs(P[r, 0])
            k = r[out > out.max() - 0.002]
            line.append([np.median(A[k, 0]), y0])
        line = np.array(line)
        line[:, 0] = np.convolve(np.pad(line[:, 0], 6, mode='edge'), np.ones(13) / 13, mode='valid')
        sx = np.interp(A[leg, 1], line[:, 1], line[:, 0])
        sgn = 1.0 if n == 'legL' else -1.0  # +atlas x is toward the back on the left leg
        SIDE[leg] = (A[leg, 0] - sx) * sgn
        # The waistband takes its side distance from the leg cloth beside it.
        _, k = nearest(P[wb], P[leg])
        SIDE[wb] = SIDE[leg[k]]
        land[n].update({
            'side': [[round(a, 4), round(b, 4)] for a, b in line[::4]],
            'front': -sgn,  # atlas x direction toward the front of the leg
            'hem': round(float(hemY), 4),
            'waist': round(float(A[leg, 1].min()), 4),
        })

    uv = A / size
    tank = np.where(np.isin(piece, [names.index(n) for n in ('front', 'back', 'neckB', 'armR', 'armL')]))[0]
    shorts = np.where(np.isin(piece, [names.index(n) for n in ('legL', 'legR')]))[0]
    meshes = {}
    zero = np.zeros(len(P))
    for name, keep, trim in (('tank', tank, (NECK, ARM, SIDE, zero)),
                             ('shorts', shorts, (SIDE, WAIST, HEM, zero))):
        mask = np.zeros(len(P), bool)
        mask[keep] = True
        tri = I[mask[I].all(1)]
        remap = -np.ones(len(P), np.int64)
        remap[keep] = np.arange(len(keep))
        a = {'POSITION': P[keep], 'NORMAL': N[keep], 'TEXCOORD_0': uv[keep]}
        a['_TRIM'] = np.stack([t[keep] for t in trim], 1)
        meshes[name] = (a, remap[tri])
        print(name, len(keep), 'verts', len(tri), 'tris')
    sp, sn, suv, si, _ = merge([p for p in parts if p[0] == STRING])
    meshes['string'] = ({'POSITION': sp / 1000, 'NORMAL': sn, 'TEXCOORD_0': suv}, si)
    write_glb(dst, meshes, {'atlas': {'size': [round(v, 4) for v in size], 'pieces': land}})


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'basketball/assets/bb-display.glb')
