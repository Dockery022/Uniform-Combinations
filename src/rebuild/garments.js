// Garments as inflated copies of the base body (see CLAUDE.md): each garment
// takes the body triangles inside its region, pushes every vertex a few
// millimetres out along its normal, and stays skinned to the body's skeleton.
import * as THREE from '../three.js';

// Offsets in metres. Pants sit over the tucked jersey, socks under the pants,
// and the sleeves start under the jersey's armhole.
export const OFFSET = { socks: 0.001, jersey: 0.002, sleeves: 0.0015, pants: 0.003, gloves: 0.0015, cleats: 0.003 };

// Rest-pose (T-pose) landmarks in world space, from the skeleton.
export function landmarks(body) {
  body.updateMatrixWorld(true);
  const bone = (n) => body.skeleton.bones.find((b) => b.name === n);
  const at = (n) => bone(n).getWorldPosition(new THREE.Vector3());
  const L = {
    pelvis: at('pelvis'), spine3: at('spine_03'), neck: at('neck_01'), head: at('Head'),
    upperarm: at('upperarm_l'), lowerarm: at('lowerarm_l'), hand: at('hand_l'),
    thigh: at('thigh_l'), calf: at('calf_l'), foot: at('foot_l'),
  };
  L.armSign = Math.sign(L.upperarm.x) || 1;
  return L;
}

// Each garment is a box in the rest pose: a height range (y) and a range of
// distance from the body's centre line (ax = |x|, so the arms in the T-pose),
// plus an optional neck hole. Triangles with any corner inside are kept, and
// their outside corners slide along an edge to where it leaves the box, so hems
// are clean and stay on the body's surface.
export function regions(L) {
  const shoulderX = Math.abs(L.upperarm.x) + 0.02;
  const elbowX = Math.abs(L.lowerarm.x);
  const wristX = Math.abs(L.hand.x);
  const waistY = L.pelvis.y + 0.14;
  const kneeY = L.calf.y;
  const ankleY = L.foot.y;
  const INF = Infinity;
  return {
    jersey: { y: [waistY - 0.02, L.neck.y + 0.03], ax: [0, shoulderX], neck: { y: L.neck.y - 0.04, z: L.neck.z, r: 0.085 } },
    sleeves: { y: [-INF, INF], ax: [shoulderX - 0.04, shoulderX + (elbowX - shoulderX) * 0.45] },
    pants: { y: [kneeY - 0.06, waistY], ax: [0, shoulderX] },
    socks: { y: [ankleY - 0.02, kneeY - 0.02], ax: [0, shoulderX] },
    cleats: { y: [-INF, ankleY + 0.02], ax: [0, shoulderX] },
    gloves: { y: [-INF, INF], ax: [wristX - 0.03, INF] },
  };
}

function inNeck(n, p) {
  return n && p.y > n.y && Math.hypot(p.x, p.z - n.z) < n.r;
}

function inside(R, p) {
  const ax = Math.abs(p.x);
  return p.y >= R.y[0] && p.y <= R.y[1] && ax >= R.ax[0] && ax <= R.ax[1] && !inNeck(R.neck, p);
}

// Where the edge from an inside corner a to an outside corner b leaves the box.
// Staying on the edge keeps the hem on the body's surface.
function edgeExit(R, a, b) {
  let lo = 0;
  let hi = 1;
  const q = new THREE.Vector3();
  for (let k = 0; k < 12; k++) {
    const t = (lo + hi) / 2;
    if (inside(R, q.lerpVectors(a, b, t))) lo = t;
    else hi = t;
  }
  return q.lerpVectors(a, b, lo).clone();
}

// Normals averaged across UV seams, so the inflated shell doesn't tear open
// where the body has duplicate vertices.
function weldedNormals(geo) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const sum = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const s = sum.get(k) || [0, 0, 0];
    s[0] += nrm.getX(i); s[1] += nrm.getY(i); s[2] += nrm.getZ(i);
    sum.set(k, s);
  }
  const out = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromArray(sum.get(key(i))).normalize();
    v.toArray(out, i * 3);
  }
  return out;
}

// Plain (non-interleaved) copy of an attribute; the body GLB interleaves its
// vertex data, so it can't be edited in place.
function plain(attr) {
  const Ctor = attr.array.constructor;
  const out = new Ctor(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) for (let k = 0; k < attr.itemSize; k++) out[i * attr.itemSize + k] = attr.getComponent(i, k);
  return new THREE.BufferAttribute(out, attr.itemSize, attr.normalized);
}

// Build one skinned garment mesh from the body for each region.
export function buildGarments(body, materials) {
  const L = landmarks(body);
  const R = regions(L);
  const geo = body.geometry;
  const pos = geo.attributes.position;
  const index = geo.index.array;
  const normals = weldedNormals(geo);
  const toWorld = body.matrixWorld;
  const world = new Array(pos.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) world[i] = v.fromBufferAttribute(pos, i).applyMatrix4(toWorld).clone();

  const out = {};
  const toLocal = body.matrixWorld.clone().invert();
  for (const [name, box] of Object.entries(R)) {
    const tris = [];
    for (let t = 0; t < index.length; t += 3) {
      if (inside(box, world[index[t]]) || inside(box, world[index[t + 1]]) || inside(box, world[index[t + 2]])) {
        tris.push(index[t], index[t + 1], index[t + 2]);
      }
    }
    const g = new THREE.BufferGeometry();
    for (const a of ['position', 'uv', 'skinIndex', 'skinWeight']) g.setAttribute(a, plain(geo.attributes[a]));
    g.setIndex(tris);
    const p = g.attributes.position.array;
    const moved = new Set();
    for (let t = 0; t < tris.length; t += 3) {
      const tri = [tris[t], tris[t + 1], tris[t + 2]];
      const inner = tri.find((i) => inside(box, world[i]));
      if (inner === undefined) continue;
      for (const i of tri) {
        if (moved.has(i) || inside(box, world[i])) continue;
        edgeExit(box, world[inner], world[i]).applyMatrix4(toLocal).toArray(p, i * 3);
        moved.add(i);
      }
    }
    const d = OFFSET[name];
    for (let i = 0; i < pos.count; i++) {
      p[i * 3] += normals[i * 3] * d;
      p[i * 3 + 1] += normals[i * 3 + 1] * d;
      p[i * 3 + 2] += normals[i * 3 + 2] * d;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(normals.slice(), 3));
    g.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(g, materials[name]);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    body.parent.add(mesh);
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    mesh.scale.copy(body.scale);
    mesh.bind(body.skeleton, body.bindMatrix);
    out[name] = mesh;
  }
  return { garments: out, landmarks: L };
}
