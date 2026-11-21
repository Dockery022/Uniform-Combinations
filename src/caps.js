// The shoulder caps: the jersey's cloth over each shoulder pad as its own
// skinned piece that floats a little above it, with a lip where it
// overhangs the sleeve. Each cap is the jersey's outer surface over the
// pad, sampled on a regular grid of the cap's own panel coordinates (a
// along the pad's cross-section from the collar over the top and down the
// arm, b front to back), so it is one surface with uniform texel density
// everywhere, and its design is painted as a flat panel from shapes in cap
// coordinates (meters), at a resolution the jersey's art can't give it.
import * as THREE from './three.js';

export const SHOULDER_CAP = {
  drop: 0.02, // the cap's lower edge is this far below the pad's bottom edge
  inset: 0.01, // the front and back edges sit this far inside the pad's full depth
  collar: 0.012, // the inner edge stands off the neckline by this much, past the collar trim
  inner: 0.01, // and the cap reaches this far in past the neckline's widest point, so it doesn't wrap the collar
  step: 0.003, // the cap's own mesh has a vertex every this far along and across the panel
  bridge: 6, // cells: the cap rides over the outermost cloth this far around, bridging creases in the jersey rather than following them
  pinchCos: 0.96, pinchRounds: 12,
  smooth: 5, // passes of neighbor averaging over the sampled cloth, which blend the millimeter step where the jersey's yoke panel lies over its sleeve panel
  reach: 0.15, // the sampling rays start this far outside the pad's cross-section and run in to 0.12 inside it
  top: 0.088, // over the pad the cap reaches this far front and back of the pad's center line
  cornerR: 0.02, // the lower edge and the rear and front ends meet in a rounded corner of about this radius
  edgeSmooth: 30, // passes of neighbor averaging on the height the lower edge follows
  round: 9, // passes of box smoothing on the cut field: rounds the outline's corners to about the skirt's reach
  bevel: 0.006, // the neck-side, front and rear end edges are sewn seams: flush with the cloth at the edge, rounding up to the full inflate over this distance
  bevelFloor: 0.12, // fraction of the inflate kept right at the seam so the cap doesn't z-fight the cloth
  inflate: 0.003, // the cap floats this far above the jersey
  pillow: 0.003, // and swells this much more toward the middle of the cap, stuffed like a pad under the cloth
  pillowReach: 0.045, // the swell is full this far in from the cap's edges
  crease: 0.0016, // a crease runs down the cap's length, this deep,
  creaseB: 0.012, // at this b (the pad's center line is 0, front positive),
  creaseWidth: 0.004, // with this Gaussian half-width
  lip: 0.0015, // and this much more at its lower edge, where it overhangs the sleeve
  lipWidth: 0.008, // the lip rises over this distance in from the edge
  texel: 0.0005, // meters per texel of the cap panel
  margin: 0.01, // panel margin past the cap's edges, under the lip's skirt
};

// Builds both caps from the fitted jersey. `world` is the jersey's
// rest-pose world positions, `aNeck` each vertex's distance from the
// neckline, `aPuff` how much of the jersey's puff (`puff`, meters) each
// vertex gets, and `frames` the shoulder pads from the fit (center line x,
// each pad's cross-section polyline, joint, and depth). Returns one cap per
// pad: its skinned mesh, panel and canvas.
//
// The jersey's cloth over the shoulder is two overlapping panels (the
// sleeve runs on under the body's yoke, a millimeter apart, with no shared
// vertices), so the cap doesn't reuse the jersey's triangles: it casts a
// ray in toward the pad at each grid point and takes the first cloth it
// meets, with the skinning of the triangle it hit, then lifts the sampled
// surface along its own normals.
export function buildCaps({ jersey, world: rest, normals, aNeck, aPuff, puff, frames, material, skirtMaterial }) {
  const C = SHOULDER_CAP;
  // The cloth as the jersey renders it: each vertex pushed out along its
  // (seam-welded) normal by the jersey's puff, so the cap lies over the
  // surface that is drawn, not the unpuffed fit.
  const world = new Float32Array(rest.length);
  for (let i = 0; i < rest.length; i += 3) {
    const k = (puff * aPuff[i / 3]) / (Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1);
    for (let c = 0; c < 3; c++) world[i + c] = rest[i + c] + normals[i + c] * k;
  }
  const geo = jersey.geometry;
  const index = geo.index;
  const skinIndex = geo.attributes.skinIndex;
  const caps = [];
  for (const [k, pad] of frames.pads.entries()) {
    const joint = frames.joints[k];
    const side = pad.side;
    const B = pad.depth - C.inset;
    const yCut = pad.yBottom - C.drop;
    // Arc length along the pad's cross-section polyline (out from the
    // center line, up), the point and outward normal at an arc length, and
    // the nearest point on it to a cross-section position.
    const pts = pad.pts;
    const arc = [0];
    for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const along = (a) => {
      let i = 0;
      while (i + 2 < pts.length && arc[i + 1] < a) i++;
      const L = arc[i + 1] - arc[i] || 1e-9;
      const t = THREE.MathUtils.clamp((a - arc[i]) / L, 0, 1);
      const ex = (pts[i + 1][0] - pts[i][0]) / L;
      const ey = (pts[i + 1][1] - pts[i][1]) / L;
      return { dl: pts[i][0] + ex * L * t, y: pts[i][1] + ey * L * t, nx: -ey, ny: ex };
    };
    const nearest = (dl, y) => {
      let best = Infinity;
      let out = null;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i];
        const ex = pts[i + 1][0] - ax;
        const ey = pts[i + 1][1] - ay;
        const L2 = ex * ex + ey * ey || 1e-9;
        const t = THREE.MathUtils.clamp(((dl - ax) * ex + (y - ay) * ey) / L2, 0, 1);
        const d = (dl - ax - ex * t) ** 2 + (y - ay - ey * t) ** 2;
        if (d < best) {
          best = d;
          out = { a: arc[i] + t * Math.sqrt(L2), d: Math.sqrt(d) };
        }
      }
      return out;
    };
    // The grid: rows every `step` of arc length from the cap's inner edge
    // (where the cross-section passes the neckline's widest reach, less
    // `inner`) to the polyline's end below the pad, columns every `step`
    // from the back edge to the front.
    let a0 = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      if (pts[i + 1][0] < pad.neckR - C.inner) continue;
      a0 = arc[i] + ((pad.neckR - C.inner - pts[i][0]) / (pts[i + 1][0] - pts[i][0] || 1e-9)) * (arc[i + 1] - arc[i]);
      break;
    }
    const aEnd = arc[arc.length - 1];
    const aSide = arc[arc.length - 2]; // where the cross-section's side starts, below the corner
    const na = Math.ceil((aEnd - a0) / C.step);
    const nb = Math.ceil((2 * B) / C.step);
    const N = (na + 1) * (nb + 1);
    const at = (ia, ib) => ia * (nb + 1) + ib;
    const rowA = (ia) => a0 + ((aEnd - a0) * ia) / na;
    const colB = (ib) => -B + (2 * B * ib) / nb;
    // The jersey's triangles near this shoulder, in 2 cm cells.
    const cell = 0.02;
    const cells = new Map();
    const ck = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    const lo = new THREE.Vector3();
    const hi = new THREE.Vector3();
    const near = [];
    for (let t = 0; t < index.count; t += 3) {
      const ids = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      lo.set(Infinity, Infinity, Infinity);
      hi.set(-Infinity, -Infinity, -Infinity);
      let close = false;
      for (const i of ids) {
        const x = world[i * 3];
        const y = world[i * 3 + 1];
        const z = world[i * 3 + 2];
        lo.set(Math.min(lo.x, x), Math.min(lo.y, y), Math.min(lo.z, z));
        hi.set(Math.max(hi.x, x), Math.max(hi.y, y), Math.max(hi.z, z));
        if ((x - frames.cx) * side > a0 - 0.05 && y > pad.yBottom - 0.12 && Math.abs(z - joint.p.z) < B + 0.05) close = true;
      }
      if (!close) continue;
      const k = near.push(ids) - 1;
      for (let ix = Math.floor(lo.x / cell); ix <= Math.floor(hi.x / cell); ix++) {
        for (let iy = Math.floor(lo.y / cell); iy <= Math.floor(hi.y / cell); iy++) {
          for (let iz = Math.floor(lo.z / cell); iz <= Math.floor(hi.z / cell); iz++) {
            const key = `${ix},${iy},${iz}`;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(k);
          }
        }
      }
    }
    const stamp = new Int32Array(near.length).fill(-1);
    // The sampling rays, in from `reach` outside the pad's cross-section
    // along its normal. Over the pad they run in planes of constant z (the
    // pad runs front to back, b = z). Down the arm they turn about the
    // arm's axis instead, b being the arc round it (the sleeve wraps the
    // arm), so the cloth behind and before the arm is met squarely; just
    // below the corner the turn is by the angle that keeps z = b, so the
    // two agree where they blend, and it eases into the arc over 3 cm.
    const ray = new THREE.Ray();
    const hitP = new THREE.Vector3();
    const bary = new THREE.Vector3();
    const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const faceN = new THREE.Vector3();
    const axisD = joint.axis.clone().normalize();
    const turn = new THREE.Vector3().crossVectors(axisD, new THREE.Vector3(side, 0, 0)).z > 0 ? 1 : -1; // the sign of the angle about the axis that moves the outer side toward the front
    const q = new THREE.Quaternion();
    const P0 = new THREE.Vector3();
    const n0 = new THREE.Vector3();
    const o1 = new THREE.Vector3();
    const o2 = new THREE.Vector3();
    const d2 = new THREE.Vector3();
    const rel = new THREE.Vector3();
    // The angle round the arm of arc b at radius R. asin(b / R), kept going in a straight line past
    // x = 0.8 (so there is no clamp and no jump where R changes from row to row: the rays at the cap's
    // rear corner, where |b| is close to R, swung from 90 deg to 63 deg between rows and folded the sampled cloth).
    const arcAngle = (x) => {
      const ax = Math.abs(x);
      const v = ax <= 0.8 ? Math.asin(ax) : Math.asin(0.8) + (ax - 0.8) / 0.6;
      return Math.sign(x) * v;
    };
    const rows = []; // per row: how far down the arm (0 over the pad, 1 down the side), the arm's radius there, the angle per b
    for (let ia = 0; ia <= na; ia++) {
      const a = rowA(ia);
      const { dl, y, ny } = along(a);
      rel.set(frames.cx + side * dl, y, joint.p.z).sub(joint.p);
      const R = Math.max(rel.addScaledVector(axisD, -rel.dot(axisD)).length(), 0.02);
      const ease = THREE.MathUtils.smoothstep(a, aSide, aSide + 0.03);
      rows.push({ down: 1 - Math.max(0, ny), R, theta: (b) => (1 - ease) * arcAngle(b / R) + ease * (b / R) });
    }
    const origin = (ia, ib) => {
      const { dl, y, nx, ny } = along(rowA(ia));
      const { down, theta } = rows[ia];
      const b = colB(ib);
      P0.set(frames.cx + side * dl, y, joint.p.z);
      n0.set(side * nx, ny, 0);
      o1.copy(P0).addScaledVector(n0, C.reach);
      o1.z += b;
      q.setFromAxisAngle(axisD, turn * theta(b));
      o2.copy(P0).addScaledVector(n0, C.reach).sub(joint.p).applyQuaternion(q).add(joint.p);
      d2.copy(n0).negate().applyQuaternion(q);
      ray.origin.lerpVectors(o1, o2, down);
      ray.direction.copy(n0).negate().lerp(d2, down).normalize();
    };
    // Sample: the first cloth each ray meets, and where on which triangle.
    // Cloth the ray only grazes (seen nearly edge-on) isn't the surface over
    // the pad, and is skipped where a proper surface lies further in.
    const hits = new Array(N).fill(null);
    const solid = (i) => !!hits[i] && !hits[i].graze;
    const tMax = C.reach + 0.12;
    for (let ia = 0; ia <= na; ia++) {
      for (let ib = 0; ib <= nb; ib++) {
        origin(ia, ib);
        const id = at(ia, ib);
        let best = null;
        let grazed = null;
        for (let s = 0; s <= tMax; s += cell / 2) {
          hitP.copy(ray.origin).addScaledVector(ray.direction, s);
          for (const k of cells.get(ck(hitP.x, hitP.y, hitP.z)) ?? []) {
            if (stamp[k] === id) continue;
            stamp[k] = id;
            const ids = near[k];
            for (let c = 0; c < 3; c++) tri[c].fromArray(world, ids[c] * 3);
            if (!ray.intersectTriangle(tri[0], tri[1], tri[2], false, hitP)) continue;
            const t = hitP.distanceTo(ray.origin);
            if (t > tMax) continue;
            const facing = Math.abs(THREE.Triangle.getNormal(tri[0], tri[1], tri[2], faceN).dot(ray.direction));
            const graze = facing < 0.2;
            if (graze ? grazed && t >= grazed.t : best && t >= best.t) continue;
            THREE.Triangle.getBarycoord(hitP, tri[0], tri[1], tri[2], bary);
            const hit = { t, ids, w: [bary.x, bary.y, bary.z], facing, graze };
            if (graze) grazed = hit;
            else best = hit;
          }
        }
        hits[at(ia, ib)] = best ?? grazed;
      }
    }
    // A sample much deeper or shallower than its neighbors lies on other
    // cloth than they do (the body behind the sleeve, a fold): not the
    // surface over the pad either.
    for (let pass = 0; pass < 2; pass++) {
      const off = [];
      for (let ia = 0; ia <= na; ia++) {
        for (let ib = 0; ib <= nb; ib++) {
          const i = at(ia, ib);
          if (!solid(i)) continue;
          const ts = [];
          for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) if ((da || db) && ia + da >= 0 && ia + da <= na && ib + db >= 0 && ib + db <= nb && solid(at(ia + da, ib + db))) ts.push(hits[at(ia + da, ib + db)].t);
          if (ts.length < 3) continue;
          ts.sort((p, q) => p - q);
          if (Math.abs(hits[i].t - ts[ts.length >> 1]) > 0.015) off.push(i);
        }
      }
      for (const i of off) hits[i].graze = true;
    }
    // And the surface is only the cloth joined to the pad's center line
    // without a step: from the center column outward, a sample is kept
    // while its depth is within 1.5 cm of its neighbor's.
    {
      const joined = new Uint8Array(N);
      const queue = [];
      for (let ia = 0; ia <= na; ia++) {
        const i = at(ia, nb >> 1);
        if (solid(i)) { joined[i] = 1; queue.push(i); }
      }
      while (queue.length) {
        const i = queue.pop();
        const ia = Math.floor(i / (nb + 1));
        const ib = i % (nb + 1);
        for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ja = ia + da;
          const jb = ib + db;
          if (ja < 0 || ja > na || jb < 0 || jb > nb) continue;
          const j = at(ja, jb);
          if (joined[j] || !solid(j) || Math.abs(hits[j].t - hits[i].t) > 0.015) continue;
          joined[j] = 1;
          queue.push(j);
        }
      }
      for (let i = 0; i < N; i++) if (solid(i) && !joined[i]) hits[i].graze = true;
    }
    // Every other sample (grazed, off the surface, or missed) takes the
    // depth of the proper cloth around it, the surface carried on, in
    // rings until the whole grid has a depth. The cap's edges are set
    // below by geometry, so these only matter near them.
    for (let pass = 0; pass < 8; pass++) {
      const fill = [];
      for (let ia = 0; ia <= na; ia++) {
        for (let ib = 0; ib <= nb; ib++) {
          const i = at(ia, ib);
          if (solid(i)) continue;
          const around = [];
          for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) if (ia + da >= 0 && ia + da <= na && ib + db >= 0 && ib + db <= nb && solid(at(ia + da, ib + db))) around.push(hits[at(ia + da, ib + db)]);
          if (around.length) fill.push([i, around]);
        }
      }
      if (!fill.length) break;
      for (const [i, around] of fill) hits[i] = { ...around[0], t: around.reduce((sum, h) => sum + h.t, 0) / around.length, graze: false, filled: true };
    }
    // Smooth the sampled distances over their neighbors, which blends the
    // step where the yoke's cloth lies over the sleeve's. The surface is
    // taken from the outermost cloth around each sample first, so the
    // smoothing rides over the jersey's creases rather than cutting into
    // them, and never ends up inside the cloth it sampled.
    const raw = new Float32Array(N);
    hits.forEach((h, i) => { if (h) raw[i] = h.t; });
    let dist = Float32Array.from(raw);
    for (let ia = 0; ia <= na; ia++) {
      for (let ib = 0; ib <= nb; ib++) {
        if (!solid(at(ia, ib))) continue;
        let t = Infinity;
        const reach = C.bridge;
        for (let da = -reach; da <= reach; da++) for (let db = -reach; db <= reach; db++) if (ia + da >= 0 && ia + da <= na && ib + db >= 0 && ib + db <= nb && solid(at(ia + da, ib + db))) t = Math.min(t, raw[at(ia + da, ib + db)]);
        dist[at(ia, ib)] = t;
      }
    }
    for (let pass = 0; pass < C.smooth; pass++) {
      const next = Float32Array.from(dist);
      for (let ia = 0; ia <= na; ia++) {
        for (let ib = 0; ib <= nb; ib++) {
          if (!solid(at(ia, ib))) continue;
          let sum = 0;
          let n = 0;
          for (let da = -1; da <= 1; da++) {
            for (let db = -1; db <= 1; db++) {
              const ja = ia + da;
              const jb = ib + db;
              if (ja < 0 || ja > na || jb < 0 || jb > nb || !solid(at(ja, jb))) continue;
              sum += dist[at(ja, jb)];
              n++;
            }
          }
          next[at(ia, ib)] = sum / n;
        }
      }
      dist = next;
    }
    for (let i = 0; i < N; i++) if (solid(i)) dist[i] = Math.min(dist[i], raw[i]);
    // The sampled cloth: its position, the jersey's neckline distance and
    // puff there, and its skinning (the hit triangle's, blended).
    const sample = new Float32Array(N * 3);
    const neckD = new Float32Array(N);
    const skins = new Array(N);
    const lerp3 = (attr, h) => h.ids.reduce((s, i, c) => s + attr[i] * h.w[c], 0);
    for (let ia = 0; ia <= na; ia++) {
      for (let ib = 0; ib <= nb; ib++) {
        const i = at(ia, ib);
        const h = hits[i];
        if (!h) continue;
        origin(ia, ib);
        hitP.copy(ray.origin).addScaledVector(ray.direction, dist[i]);
        sample.set([hitP.x, hitP.y, hitP.z], i * 3);
        neckD[i] = lerp3(aNeck, h);
        skins[i] = mixSkin(h.ids.map((j, c) => [vertexSkin(geo, j), h.w[c]]));
      }
    }
    // The surface's normals from the grid (outward along the ray), and the
    // cloth where the jersey renders it: puffed out along them.
    const nrmG = new Float32Array(N * 3);
    const cloth = new Float32Array(N * 3);
    const dA = new THREE.Vector3();
    const dB = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const diff = (ia, ib, da, db, out) => {
      const lo = at(ia - da, ib - db);
      const hi = at(ia + da, ib + db);
      const hasLo = ia - da >= 0 && ib - db >= 0 && hits[lo];
      const hasHi = ia + da <= na && ib + db <= nb && hits[hi];
      const p = hasLo ? lo : at(ia, ib);
      const q = hasHi ? hi : at(ia, ib);
      out.set(sample[q * 3] - sample[p * 3], sample[q * 3 + 1] - sample[p * 3 + 1], sample[q * 3 + 2] - sample[p * 3 + 2]);
    };
    const gridNormals = () => {
    for (let ia = 0; ia <= na; ia++) {
      for (let ib = 0; ib <= nb; ib++) {
        const i = at(ia, ib);
        if (!hits[i]) continue;
        origin(ia, ib);
        diff(ia, ib, 1, 0, dA);
        diff(ia, ib, 0, 1, dB);
        nrm.crossVectors(dA, dB);
        if (nrm.lengthSq() < 1e-14) nrm.copy(ray.direction).negate();
        if (nrm.dot(ray.direction) > 0) nrm.negate(); // out, against the ray
        nrm.normalize();
        nrmG.set([nrm.x, nrm.y, nrm.z], i * 3);
        hitP.fromArray(sample, i * 3);
        cloth.set([hitP.x, hitP.y, hitP.z], i * 3);
      }
    }
    };
    gridNormals();
    // Where the jersey's cloth steps back on itself (a ridge at the pad's end), the sampled grid folds:
    // its triangles run edge-on or against the surface. Skipping them leaves a slit, and the skirt along
    // the slit's two edges crosses and knots. Instead the sampled positions around the fold are smoothed
    // over (a cap bridging a 5 mm step is better than a hole), and the normals taken again.
    {
      const folded = new Uint8Array(N);
      const tv = new THREE.Vector3();
      const mark = () => {
        folded.fill(0);
        let count = 0;
        for (let ia = 0; ia < na; ia++) {
          for (let ib = 0; ib < nb; ib++) {
            const q = [at(ia, ib), at(ia + 1, ib), at(ia + 1, ib + 1), at(ia, ib + 1)];
            for (const ids of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
              if (ids.some((k) => !hits[k])) continue;
              const u = new THREE.Vector3().fromArray(cloth, ids[1] * 3).sub(tv.fromArray(cloth, ids[0] * 3));
              const w = new THREE.Vector3().fromArray(cloth, ids[2] * 3).sub(tv);
              const c = u.cross(w);
              const facing = Math.abs(c.dot(tv.fromArray(nrmG, ids[0] * 3))) / Math.max(c.length(), 1e-12);
              if (facing < 0.3) { count++; for (const k of ids) folded[k] = 1; }
            }
          }
        }
        return count;
      };
      for (let round = 0; round < 14 && mark(); round++) {
        // Spread the flag two cells out, then average those samples with their neighbors.
        const area = new Uint8Array(N);
        for (let ia = 0; ia <= na; ia++) for (let ib = 0; ib <= nb; ib++) if (folded[at(ia, ib)]) for (let da = -2; da <= 2; da++) for (let db = -2; db <= 2; db++) {
          const ja = ia + da;
          const jb = ib + db;
          if (ja >= 0 && ja <= na && jb >= 0 && jb <= nb) area[at(ja, jb)] = 1;
        }
        for (let pass = 0; pass < 3; pass++) {
          const next = Float32Array.from(sample);
          for (let ia = 0; ia <= na; ia++) for (let ib = 0; ib <= nb; ib++) {
            const i = at(ia, ib);
            if (!area[i] || !hits[i]) continue;
            let n = 0;
            const sum = [0, 0, 0];
            for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
              const ja = ia + da;
              const jb = ib + db;
              if (ja < 0 || ja > na || jb < 0 || jb > nb || !hits[at(ja, jb)]) continue;
              for (let c = 0; c < 3; c++) sum[c] += sample[at(ja, jb) * 3 + c];
              n++;
            }
            for (let c = 0; c < 3; c++) next[i * 3 + c] = sum[c] / n;
          }
          sample.set(next);
        }
        gridNormals();
      }
      // Where the cloth itself pinches (a crease where the sleeve bends: adjacent samples' normals turn
      // sharply), the cap bridges it the same way: the flagged samples are averaged with their neighbors.
      for (let round = 0; round < C.pinchRounds; round++) {
        const area = new Uint8Array(N);
        let count = 0;
        for (let ia = 0; ia <= na; ia++) for (let ib = 0; ib <= nb; ib++) {
          const i = at(ia, ib);
          if (!hits[i]) continue;
          for (const [da, db] of [[1, 0], [0, 1]]) {
            const ja = ia + da;
            const jb = ib + db;
            if (ja > na || jb > nb || !hits[at(ja, jb)]) continue;
            const j = at(ja, jb);
            const dot = nrmG[i * 3] * nrmG[j * 3] + nrmG[i * 3 + 1] * nrmG[j * 3 + 1] + nrmG[i * 3 + 2] * nrmG[j * 3 + 2];
            if (dot < C.pinchCos) {
              count++;
              for (let ea = -2; ea <= 2; ea++) for (let eb = -2; eb <= 2; eb++) {
                const xa = ia + ea;
                const xb = ib + eb;
                if (xa >= 0 && xa <= na && xb >= 0 && xb <= nb) area[at(xa, xb)] = 1;
              }
            }
          }
        }
        if (!count) break;
        for (let pass = 0; pass < 3; pass++) {
          const next = Float32Array.from(sample);
          for (let ia = 0; ia <= na; ia++) for (let ib = 0; ib <= nb; ib++) {
            const i = at(ia, ib);
            if (!area[i] || !hits[i]) continue;
            let n = 0;
            const sum = [0, 0, 0];
            for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
              const ja = ia + da;
              const jb = ib + db;
              if (ja < 0 || ja > na || jb < 0 || jb > nb || !hits[at(ja, jb)]) continue;
              for (let c = 0; c < 3; c++) sum[c] += sample[at(ja, jb) * 3 + c];
              n++;
            }
            for (let c = 0; c < 3; c++) next[i * 3 + c] = sum[c] / n;
          }
          sample.set(next);
        }
        gridNormals();
      }
    }
    // Inside the cap where every cut is positive: past the collar trim,
    // above the lower edge, and within the cap's ends: `top` front and
    // back of the pad's center line over the pad, and `wrap` degrees round
    // the arm down the sleeve. Grid points with no cloth at all (through
    // the neck opening) are outside.
    // The lower edge follows the cloth's height, but the jersey bunches near the pad's rear corner
    // and the height steps there, kinking the edge; so it follows a smoothed copy of the height.
    const ySm = new Float32Array(N);
    for (let i = 0; i < N; i++) ySm[i] = cloth[i * 3 + 1];
    for (let pass = 0; pass < C.edgeSmooth; pass++) {
      const g = Float32Array.from(ySm);
      for (let ia = 0; ia <= na; ia++) {
        for (let ib = 0; ib <= nb; ib++) {
          if (!hits[at(ia, ib)]) continue;
          let sum = 0;
          let n = 0;
          for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
            const ja = ia + da;
            const jb = ib + db;
            if (ja < 0 || ja > na || jb < 0 || jb > nb || !hits[at(ja, jb)]) continue;
            sum += ySm[at(ja, jb)];
            n++;
          }
          g[at(ia, ib)] = sum / n;
        }
      }
      ySm.set(g);
    }
    const f = new Float32Array(N);
    for (let ia = 0; ia <= na; ia++) {
      const { down, R, theta } = rows[ia];
      for (let ib = 0; ib <= nb; ib++) {
        const i = at(ia, ib);
        if (!hits[i]) { f[i] = -1; continue; }
        const b = colB(ib);
        // The ends are the same arc length either side of the center line all the way down (an angle limit
        // of wrap * R narrowed the cap where the arm is thin, biting a curve out of its rear edge).
        const ends = C.top - Math.abs(b);
        // A soft minimum of the lower edge and the ends rounds the cap's corners; the neckline keeps its hard minimum.
        const k = C.cornerR;
        const soft = -k * Math.log(Math.exp(-(ySm[i] - yCut) / k) + Math.exp(-ends / k));
        f[i] = Math.min(neckD[i] - C.collar, soft);
      }
    }
    // Round the cap's outline: the cuts meet at sharp corners, and where one is concave the lip's
    // skirt (7 mm out from the edge) crosses itself and knots. A few box passes of the cut field
    // leave every straight edge where it is and round the corners to about the skirt's reach.
    for (let pass = 0; pass < C.round; pass++) {
      const g = Float32Array.from(f);
      for (let ia = 0; ia <= na; ia++) {
        for (let ib = 0; ib <= nb; ib++) {
          if (!hits[at(ia, ib)]) continue;
          let sum = 0;
          let n = 0;
          for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
            const ja = ia + da;
            const jb = ib + db;
            if (ja < 0 || ja > na || jb < 0 || jb > nb || !hits[at(ja, jb)]) continue;
            sum += f[at(ja, jb)];
            n++;
          }
          g[at(ia, ib)] = sum / n;
        }
      }
      f.set(g);
    }
    // Distance in from the grid's no-cloth edge (where rays found nothing, or the grid ends): triangles
    // touching a missing cell are dropped whole rather than clipped, so the cap can end there in a ragged
    // straight edge no cut field describes. The seam bevel needs this distance too.
    const gd = new Float32Array(N).fill(1);
    for (let ia = 0; ia <= na; ia++) {
      for (let ib = 0; ib <= nb; ib++) {
        if (!hits[at(ia, ib)]) continue;
        let d = 1;
        for (let r = 1; r <= 3 && d === 1; r++) {
          for (let da = -r; da <= r && d === 1; da++) for (let db = -r; db <= r; db++) {
            const ja = ia + da;
            const jb = ib + db;
            if (ja < 0 || ja > na || jb < 0 || jb > nb || !hits[at(ja, jb)]) { d = (r - 1) * C.step; break; }
          }
        }
        gd[at(ia, ib)] = d;
      }
    }
    // Cut the cap's triangles out of the grid's, clipping the ones the edge
    // crosses so the edge is a clean curve. Vertices on the cut are shared
    // between neighbors.
    const verts = []; // { w: [x,y,z] on the puffed cloth, n: [x,y,z], a, b, skin, cut }
    const tris = [];
    const byVertex = new Map();
    const byEdge = new Map();
    const vertex = (i) => {
      if (!byVertex.has(i)) {
        byVertex.set(i, verts.length);
        verts.push({ w: Array.from(cloth.subarray(i * 3, i * 3 + 3)), n: Array.from(nrmG.subarray(i * 3, i * 3 + 3)), a: rowA(Math.floor(i / (nb + 1))), b: colB(i % (nb + 1)), skin: skins[i], cut: false, nd: neckD[i], gd: gd[i], ys: ySm[i] });
      }
      return byVertex.get(i);
    };
    const crossing = (i, j) => {
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      if (!byEdge.has(key)) {
        const t = f[i] / (f[i] - f[j]); // where f crosses zero from i to j
        const L = (p, q) => p + (q - p) * t;
        const n = new THREE.Vector3(L(nrmG[i * 3], nrmG[j * 3]), L(nrmG[i * 3 + 1], nrmG[j * 3 + 1]), L(nrmG[i * 3 + 2], nrmG[j * 3 + 2])).normalize();
        byEdge.set(key, verts.length);
        verts.push({
          w: [L(cloth[i * 3], cloth[j * 3]), L(cloth[i * 3 + 1], cloth[j * 3 + 1]), L(cloth[i * 3 + 2], cloth[j * 3 + 2])],
          n: n.toArray(),
          a: L(rowA(Math.floor(i / (nb + 1))), rowA(Math.floor(j / (nb + 1)))),
          b: L(colB(i % (nb + 1)), colB(j % (nb + 1))),
          skin: mixSkin([[skins[i], 1 - t], [skins[j], t]]),
          cut: true,
          nd: L(neckD[i], neckD[j]),
          gd: Math.min(gd[i], gd[j]),
          ys: L(ySm[i], ySm[j]),
        });
      }
      return byEdge.get(key);
    };
    for (let ia = 0; ia < na; ia++) {
      for (let ib = 0; ib < nb; ib++) {
        const q = [at(ia, ib), at(ia + 1, ib), at(ia + 1, ib + 1), at(ia, ib + 1)];
        for (const ids of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
          if (ids.some((i) => !hits[i]) || ids.every((i) => f[i] < 0)) continue;
          // Wound so the face points out, along the sampled normals.
          dA.fromArray(cloth, ids[1] * 3).sub(tri[0].fromArray(cloth, ids[0] * 3));
          dB.fromArray(cloth, ids[2] * 3).sub(tri[0]);
          nrm.crossVectors(dA, dB);
          const facing = nrm.dot(tri[1].fromArray(nrmG, ids[0] * 3)) / Math.max(nrm.length(), 1e-12);
          if (facing < 0) ids.reverse();
          // The sampling rays crossed over each other here (a fold in the sampled
          // cloth): wound by the side it faces below, and left out only if it has no area facing at all.
          if (Math.abs(facing) < 0.02) continue;
          // Sutherland-Hodgman against f >= 0: the kept polygon's corners in order.
          const poly = [];
          for (let e = 0; e < 3; e++) {
            const i = ids[e];
            const j = ids[(e + 1) % 3];
            if (f[i] >= 0) poly.push(vertex(i));
            if ((f[i] >= 0) !== (f[j] >= 0)) poly.push(crossing(i, j));
          }
          for (let e = 1; e + 1 < poly.length; e++) tris.push(poly[0], poly[e], poly[e + 1]);
        }
      }
    }
    if (!verts.length) continue;
    // The panel: a from the cap's inner edge, b from the pad's center line
    // (front positive), with a margin all round under the lip's skirt.
    let aMin = Infinity;
    let aMax = -Infinity;
    for (const v of verts) { aMin = Math.min(aMin, v.a); aMax = Math.max(aMax, v.a); }
    for (const v of verts) v.a -= aMin;
    const A = aMax - aMin + 2 * C.margin;
    const panel = { margin: C.margin, A, B, L: aMax - aMin, texel: C.texel, w: Math.ceil(A / C.texel), h: Math.ceil((2 * B) / C.texel) };
    const toPanel = (x, y, z) => ({ a: nearest((x - frames.cx) * side, y).a - aMin, b: z - joint.p.z });
    // The lip: the cap stands up to `lip` more proud of the jersey within
    // lipWidth of its lower edge, and a skirt under that edge closes the step.
    for (const v of verts) {
      // (measured from the smoothed height the cut itself follows, so the lip doesn't step where the cloth's raw height does)
      const edge = 1 - THREE.MathUtils.smoothstep(v.ys - yCut, 0, C.lipWidth);
      // The cap's neck-side end (the panel's start, `a` = 0, which lies 3-9 cm from the collar line, so the
      // neckline distance never reached it: it stood a full inflate high there), the pad's front and rear
      // ends and the neckline are one sewn seam: flush at the edge, a rounded bevel up to the full inflate.
      const dEdge = Math.max(0, Math.min(v.nd - C.collar, v.a, C.top - Math.abs(v.b), v.gd));
      const bevel = dEdge >= C.bevel ? 1 : Math.sin((dEdge / C.bevel) * Math.PI / 2);
      // The pillow: a soft swell toward the middle, growing from nothing at the seams and the lower edge.
      const dAll = Math.max(0, Math.min(dEdge, v.w[1] - yCut + 0.01));
      const swell = Math.sin(Math.min(1, dAll / C.pillowReach) * Math.PI / 2);
      // The crease: a shallow groove down the cap, fading out toward the seams so the edges stay clean.
      const groove = Math.exp(-(((v.b - C.creaseB) / C.creaseWidth) ** 2)) * Math.min(1, dEdge / 0.02);
      v.h = C.inflate * (C.bevelFloor + (1 - C.bevelFloor) * bevel) + C.pillow * swell - C.crease * groove + C.lip * edge; // above the puffed jersey
      v.lip = edge;
    }
    // Lifted by the lip, a triangle can end up turned against the cloth's normals (the sampled
    // surface folds there). Left in, it shows from behind as a dark ragged patch; drop it.
    {
      const kept = [];
      const pa = new THREE.Vector3();
      const pb = new THREE.Vector3();
      const pc = new THREE.Vector3();
      const vn = new THREE.Vector3();
      const tv = new THREE.Vector3();
      const top = (v, out) => out.fromArray(verts[v].w).addScaledVector(nrm.fromArray(verts[v].n), verts[v].h);
      for (let t = 0; t < tris.length; t += 3) {
        top(tris[t], pa); top(tris[t + 1], pb); top(tris[t + 2], pc);
        nrm.crossVectors(pb.sub(pa), pc.sub(pa)).normalize();
        vn.fromArray(verts[tris[t]].n).add(tv.fromArray(verts[tris[t + 1]].n)).add(tv.fromArray(verts[tris[t + 2]].n)).normalize();
        if (nrm.dot(vn) > -0.3) kept.push(tris[t], tris[t + 1], tris[t + 2]);
      }
      tris.length = 0;
      for (const k of kept) tris.push(k);
    }
    // The cap's edges, each with the direction out of the cap along its
    // surface (away from the triangle behind it).
    const edgeCount = new Map();
    const third = new Map();
    const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
    for (let t = 0; t < tris.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const key = ek(tris[t + e], tris[t + ((e + 1) % 3)]);
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
        third.set(key, tris[t + ((e + 2) % 3)]);
      }
    }
    const out = new THREE.Vector3();
    for (const [key, n] of edgeCount) {
      if (n !== 1) continue;
      const [p, q] = key.split('_').map(Number);
      const r = third.get(key);
      dA.fromArray(verts[q].w).sub(tri[0].fromArray(verts[p].w)).normalize();
      out.copy(tri[0]).add(tri[1].fromArray(verts[q].w)).multiplyScalar(0.5).sub(tri[2].fromArray(verts[r].w));
      out.addScaledVector(dA, -out.dot(dA));
      for (const v of [p, q]) {
        nrm.fromArray(verts[v].n);
        dB.copy(out).addScaledVector(nrm, -out.dot(nrm));
        (verts[v].out ??= new THREE.Vector3()).add(dB.normalize());
      }
    }
    // A skirt under the cap's edges closes the gap down to the jersey: a
    // rounded step at the lip, a short wall at the other edges.
    const capTris = tris.length; // the triangles from here on are the skirt
    const skirt = new Map(); // top vertex -> [mid, base]
    const stepVertex = (v, along, lift) => {
      nrm.fromArray(v.n);
      dB.copy(v.out).normalize();
      const w = new THREE.Vector3().fromArray(v.w).addScaledVector(nrm, lift * v.h).addScaledVector(dB, along * v.h);
      // The skirt takes the edge vertex's own panel coordinates (the colour of the edge it hangs from; stepping 'a' along it dashed the cap's ends, where the edge runs along 'a').
      const n = nrm.clone(); // the skirt shades as the cap does (turning it outward lit its segments in a dashed pattern)
      verts.push({ skin: v.skin, w: w.toArray(), n: n.toArray(), a: v.a, b: v.b, h: 0, lip: 0, skirt: true });
      return verts.length - 1;
    };
    const rings = (v) => (v.lip >= 0.99 ? [stepVertex(v, 0.45, 0.5), stepVertex(v, 0.9, -0.3)] : [stepVertex(v, 0.12, 0.5), stepVertex(v, 0.25, -0.5)]);
    for (const [key, n] of edgeCount) {
      if (n !== 1) continue;
      const [p, q] = key.split('_').map(Number);
      for (const v of [p, q]) if (!skirt.has(v)) skirt.set(v, rings(verts[v]));
      // The edge's two ends come in sorted order, so wind each wall by where it faces:
      // out of the cap and up, never in toward the cloth (a mixed winding drew every
      // other triangle backwards, which read as teeth along the cap's edge).
      const top = (v) => new THREE.Vector3().fromArray(verts[v].w).addScaledVector(nrm.fromArray(verts[v].n), verts[v].h);
      const pt = top(p);
      const qt = top(q);
      const e = qt.clone().sub(pt);
      const d = new THREE.Vector3().fromArray(verts[skirt.get(q)[0]].w).sub(qt);
      const faceOut = new THREE.Vector3().crossVectors(e, d).dot(out.copy(verts[p].out).add(verts[q].out).normalize().addScaledVector(nrm.fromArray(verts[p].n), 0.6));
      const [a, b] = faceOut >= 0 ? [p, q] : [q, p];
      const [pm, pb0] = skirt.get(a);
      const [qm, qb] = skirt.get(b);
      tris.push(a, b, qm, a, qm, pm, pm, qm, qb, pm, qb, pb0);
    }
    // Positions and normals back in the jersey's own space, each through its
    // sampled skinning, so the cap moves with the jersey.
    const n = verts.length;
    const position = new Float32Array(n * 3);
    const normal = new Float32Array(n * 3);
    const uvs = new Float32Array(n * 2);
    const sIndex = new skinIndex.array.constructor(n * 4);
    const sWeight = new Float32Array(n * 4);
    const m = new THREE.Matrix4();
    const m3 = new THREE.Matrix3();
    const p = new THREE.Vector3();
    verts.forEach((v, vi) => {
      skinMatrix(jersey, v.skin, m).invert();
      p.fromArray(v.w);
      if (!v.skirt) p.addScaledVector(nrm.fromArray(v.n), v.h);
      p.applyMatrix4(m);
      position.set([p.x, p.y, p.z], vi * 3);
      p.fromArray(v.n).applyMatrix3(m3.setFromMatrix4(m)).normalize();
      normal.set([p.x, p.y, p.z], vi * 3);
      uvs[vi * 2] = (v.a + C.margin) / A;
      uvs[vi * 2 + 1] = (B - v.b) / (2 * B);
      sIndex.set(v.skin.idx, vi * 4);
      sWeight.set(v.skin.wt, vi * 4);
    });
    const capGeo = new THREE.BufferGeometry();
    capGeo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    capGeo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    capGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    capGeo.setAttribute('skinIndex', new THREE.BufferAttribute(sIndex, 4));
    capGeo.setAttribute('skinWeight', new THREE.BufferAttribute(sWeight, 4));
    capGeo.setIndex(tris);
    // The face shades from its own shape (the pillow and crease), not the flat cloth's normals; the
    // skirt keeps the cloth's. Normals come from the face's triangles alone, turned to agree with the cloth.
    {
      const faceGeo = new THREE.BufferGeometry();
      faceGeo.setAttribute('position', new THREE.BufferAttribute(position, 3));
      faceGeo.setIndex(tris.slice(0, capTris));
      faceGeo.computeVertexNormals();
      const fn = faceGeo.attributes.normal;
      const used = new Uint8Array(n);
      for (let t = 0; t < capTris; t++) used[tris[t]] = 1;
      for (let vi = 0; vi < n; vi++) {
        if (!used[vi] || verts[vi].skirt) continue;
        const dotc = fn.getX(vi) * normal[vi * 3] + fn.getY(vi) * normal[vi * 3 + 1] + fn.getZ(vi) * normal[vi * 3 + 2];
        const sgn = dotc < 0 ? -1 : 1;
        normal[vi * 3] = fn.getX(vi) * sgn;
        normal[vi * 3 + 1] = fn.getY(vi) * sgn;
        normal[vi * 3 + 2] = fn.getZ(vi) * sgn;
      }
      faceGeo.dispose();
    }
    // The cap's face and its skirt are separate groups, so the skirt can be a
    // plain matte cloth: with the face's sheen the skirt, seen edge-on, read as
    // a pale dashed line along the cap's edge.
    capGeo.addGroup(0, capTris, 0);
    capGeo.addGroup(capTris, tris.length - capTris, 1);
    const mesh = new THREE.SkinnedMesh(capGeo, [material(), skirtMaterial()]);
    mesh.name = `cap-${side > 0 ? 'left' : 'right'}`;
    mesh.position.copy(jersey.position);
    mesh.quaternion.copy(jersey.quaternion);
    mesh.scale.copy(jersey.scale);
    mesh.bindMode = jersey.bindMode;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    jersey.parent.add(mesh);
    mesh.bind(jersey.skeleton, jersey.bindMatrix);
    caps.push({ side, mesh, panel, toPanel, vertices: n, triangles: tris.length / 3 });
  }
  return caps;
}

// A vertex's skinning: its bone indices and weights.
function vertexSkin(geo, i) {
  const idx = [0, 0, 0, 0];
  const wt = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    idx[c] = geo.attributes.skinIndex.getComponent(i, c);
    wt[c] = geo.attributes.skinWeight.getComponent(i, c);
  }
  return { idx, wt };
}

// Skinnings blended by weight ([skin, weight] pairs): the four heaviest
// bones, renormalized.
function mixSkin(parts) {
  const sum = new Map();
  for (const [s, k] of parts) for (let c = 0; c < 4; c++) if (s.wt[c] * k > 0) sum.set(s.idx[c], (sum.get(s.idx[c]) ?? 0) + s.wt[c] * k);
  const top = [...sum].sort((p, q) => q[1] - p[1]).slice(0, 4);
  const total = top.reduce((t, [, w]) => t + w, 0) || 1;
  const idx = [0, 0, 0, 0];
  const wt = [0, 0, 0, 0];
  top.forEach(([j, w], c) => { idx[c] = j; wt[c] = w / total; });
  return { idx, wt };
}

// The matrix taking the mesh's own vertex space to rest-pose world
// positions through a skinning ({ idx, wt }):
// world = matrixWorld * bindMatrixInverse * skin * bindMatrix * local.
function skinMatrix(mesh, skin, out) {
  const skinM = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  const tmp = new THREE.Matrix4();
  for (let k = 0; k < 4; k++) {
    const w = skin.wt[k];
    if (!w) continue;
    const j = skin.idx[k];
    tmp.multiplyMatrices(mesh.skeleton.bones[j].matrixWorld, mesh.skeleton.boneInverses[j]);
    for (let e = 0; e < 16; e++) skinM.elements[e] += tmp.elements[e] * w;
  }
  return out.copy(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(skinM).multiply(mesh.bindMatrix);
}

// A shape coordinate: a number in meters, or text for a fraction of the
// cap's length L plus an offset: "L-0.01" (1 cm short of the lower edge),
// "0.4L+0.02".
function coord(v, L) {
  if (typeof v === 'number') return v;
  const m = /^\s*([+-]?\d*\.?\d+)?\s*L\s*(?:([+-])\s*(\d*\.?\d+))?\s*$/.exec(String(v));
  if (!m) throw new Error(`cap shape coordinate ${JSON.stringify(v)}: use meters, "L-0.01" or "0.4L+0.02"`);
  return (m[1] === undefined ? 1 : parseFloat(m[1])) * L + (m[2] ? (m[2] === '-' ? -1 : 1) * parseFloat(m[3]) : 0);
}

// Paints a cap's panel into its canvas: the base color, then the design's
// shapes in cap coordinates (meters: a along the cap from its inner edge
// by the collar, b front (+) to back (-) from the pad's center line), then
// the shoulder number, all drawn 4x oversize and filtered down, and the
// 5 mm grid on top when asked. A polygon has a fill and outline layers
// drawn outside its edge, innermost first; a line has a color and width.
export function paintCap(canvas, panel, design, { number, grid } = {}) {
  const S = 4;
  const { w, h, texel, B, L } = panel;
  const big = paintCap.big ?? (paintCap.big = document.createElement('canvas'));
  big.width = w * S;
  big.height = h * S;
  const ctx = big.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = design.base;
  ctx.fillRect(0, 0, big.width, big.height);
  // Panel meters: x = a (from the cap's inner edge, past the margin), y = B - b (the front at the top).
  ctx.setTransform(S / texel, 0, 0, S / texel, (S * panel.margin) / texel, 0);
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 8;
  for (const shape of design.shapes ?? []) {
    ctx.beginPath();
    shape.points.forEach(([a, b], i) => (i ? ctx.lineTo(coord(a, L), B - coord(b, L)) : ctx.moveTo(coord(a, L), B - coord(b, L))));
    if (shape.type === 'line') {
      ctx.lineCap = shape.cap ?? 'butt';
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.width;
      ctx.stroke();
      continue;
    }
    ctx.closePath();
    const layers = shape.outline ?? [];
    for (let i = layers.length - 1; i >= 0; i--) {
      ctx.strokeStyle = layers[i].color;
      ctx.lineWidth = 2 * layers.slice(0, i + 1).reduce((sum, l) => sum + l.width, 0);
      ctx.stroke();
    }
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
  if (number) {
    // The glyph reads upright from the side: its top toward the collar.
    const { image, sx, sy, sw, sh, at, size, side } = number;
    ctx.save();
    ctx.translate(at.a, B - at.b);
    ctx.transform(0, side > 0 ? 1 : -1, 1, 0, 0, 0);
    ctx.drawImage(image, sx, sy, sw, sh, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  // Filter down in two halvings.
  const half = paintCap.half ?? (paintCap.half = document.createElement('canvas'));
  half.width = w * 2;
  half.height = h * 2;
  const hc = half.getContext('2d');
  hc.imageSmoothingEnabled = true;
  hc.imageSmoothingQuality = 'high';
  hc.drawImage(big, 0, 0, half.width, half.height);
  const out = canvas.getContext('2d');
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.imageSmoothingEnabled = true;
  out.imageSmoothingQuality = 'high';
  out.drawImage(half, 0, 0, w, h);
  if (grid) drawGrid(out, panel);
}

// The cap's gloss map, laid out like the color panel: red = clearcoat (patent-leather claws), green =
// roughness (the satin cloth 0.62, the claws 0.14). Shapes flagged `gloss` in the design are the patent
// leather; everything else keeps the matte cloth.
export function paintCapGloss(canvas, panel, design) {
  const { texel, B, L } = panel;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgb(0,158,0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(1 / texel, 0, 0, 1 / texel, panel.margin / texel, 0);
  ctx.fillStyle = 'rgb(255,36,0)';
  for (const shape of design.shapes ?? []) {
    if (!shape.gloss || shape.type === 'line') continue;
    ctx.beginPath();
    shape.points.forEach(([a, b], i) => (i ? ctx.lineTo(coord(a, L), B - coord(b, L)) : ctx.moveTo(coord(a, L), B - coord(b, L))));
    ctx.closePath();
    ctx.fill();
  }
}

// A labeled 5 mm grid over the panel, for checking the layout: thin lines
// every 5 mm, heavier every 50 mm with their a and b in millimeters, the
// cap's inner edge (a = 0) and the pad's center line (b = 0) brightest.
function drawGrid(ctx, panel) {
  const { w, h, texel, B, margin } = panel;
  const px = (m) => m / texel;
  const aEdge = margin; // canvas x (m) of the cap's inner edge
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '11px sans-serif';
  ctx.textBaseline = 'top';
  for (let mm = -Math.ceil(aEdge / 0.005) * 5; px(aEdge + mm / 1000) < w; mm += 5) {
    const x = Math.round(px(aEdge + mm / 1000)) + 0.5;
    const major = mm % 50 === 0;
    ctx.strokeStyle = mm === 0 ? 'rgba(255,255,0,0.95)' : major ? 'rgba(0,229,255,0.8)' : 'rgba(0,229,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    if (major) { ctx.fillStyle = '#00e5ff'; ctx.fillText(`a ${mm}`, x + 2, 2); }
  }
  for (let mm = -Math.round(B * 1000); mm <= B * 1000; mm += 5) {
    const y = Math.round(px(B - mm / 1000)) + 0.5;
    const major = mm % 50 === 0;
    ctx.strokeStyle = mm === 0 ? 'rgba(255,255,0,0.95)' : major ? 'rgba(0,229,255,0.8)' : 'rgba(0,229,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    if (major) { ctx.fillStyle = '#00e5ff'; ctx.fillText(`b ${mm > 0 ? '+' : ''}${mm}`, 2, y + 2); }
  }
  ctx.fillStyle = '#ffff00';
  ctx.fillText('a: from the collar edge over the top and down the arm (mm)', px(aEdge) + 4, h - 28);
  ctx.fillText('b: front (+) to back (-) of the pad center (mm)', px(aEdge) + 4, h - 14);
  ctx.restore();
}
