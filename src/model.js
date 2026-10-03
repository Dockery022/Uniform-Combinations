// The rigged player (assets/player.glb) wearing the helmet (assets/helmet.glb),
// dressed in the design art from assets/uni/.
//
// The jersey art is a front view, so it is projected onto the jersey from the
// front: every vertex gets an art coordinate from its rest-pose position, and
// the sleeves wrap the art's hanging sleeves. The back gets a synthesized
// panel with the number. The cleat art is projected from the side. Helmet decals and
// pants logos are cut out of the art and projected the same way. Stripes,
// collars and gloves are drawn by small shader additions that read
// per-vertex measurements, so they follow the cloth when the player moves.
import * as THREE from './three.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { SKIN_TONES, BRAND } from './team.js';
import * as paint from './textures.js';
import { loadFabricMaps, withTiling, applyMeshFabricInPlace, applySmoothFabricInPlace } from '../jersey-material/jerseyMaterial.js';

const PLAYER_HEIGHT = 1.88; // rest-pose height of the body in meters, without helmet

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const progress = {};
  const report = () => {
    const parts = Object.values(progress);
    const loaded = parts.reduce((a, p) => a + p.loaded, 0);
    const total = parts.reduce((a, p) => a + (p.total || 3e6), 0);
    onProgress?.(Math.min(1, loaded / total));
  };
  const load = async (name) => {
    const url = `assets/${name}.glb`;
    // Hosts that won't serve .glb files get a base64 copy as a JS module.
    if (!window.__comboEmbeddedModels) {
      try {
        return await loader.loadAsync(url, (e) => {
          progress[url] = { loaded: e.loaded, total: e.total };
          report();
        });
      } catch (err) {
        console.warn(`Falling back to the embedded copy of ${url}`, err);
      }
    }
    const { default: b64 } = await import(`../assets/${name}.glb.js`);
    progress[url] = { loaded: 1, total: 1 };
    report();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return loader.parseAsync(bytes.buffer, '');
  };
  const [player, helmet] = await Promise.all([load('player'), load('helmet')]);
  return { player, helmet };
}

const images = new Map();
export function loadImage(url) {
  if (!images.has(url)) {
    images.set(url, new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => { images.delete(url); reject(new Error(`Could not load ${url}`)); };
      img.src = url;
    }));
  }
  return images.get(url);
}

// Where the jersey art's landmarks sit, in art pixels (1366 x 1408 template).
const JERSEY_ART = {
  width: 1366, height: 1408, centerX: 683,
  shoulderY: 20, vNeckY: 380, armpitY: 540, hemY: 1400,
  bodyWidth: 774, // between the side outlines at the chest
  // The sleeves are drawn hanging: the outer edge runs down the side of the
  // art and the hem along the bottom. Each 3D sleeve maps onto this box, its
  // outer side at outerX and its inner side at innerX, shoulder to hem from
  // top to bottom. (The player's left sleeve is on the art's right.)
  sleeves: { top: 290, bottom: 500, left: { outerX: 1316, innerX: 1176 }, right: { outerX: 40, innerX: 190 } },
};
// Shoe art (702 x 372 side view, toe to the right): heel, toe, top and sole.
const SHOE_ART = { heel: 0.012, toe: 0.997, top: 0.03, bottom: 0.95 };
// Pants art (1084 x 1994): the hip logos, cut into a 1084 x 600 strip.
const PANTS_ART = { width: 1084, height: 600, centerX: 542, waistY: 5, waistWidth: 666 };

// Doc's fabric kit (jersey-material/): dimple mesh on the jersey body and the
// pants, smooth fabric on the jersey's yoke and sleeves and on the socks. The
// jersey is one mesh, so a per-vertex weight (aMesh) fades the mesh out on
// the yoke and sleeves. The numbers and lettering stay smooth too. Each mesh
// gets its own tiling from its UV scale, so the holes are round and the same
// size everywhere.
// Tuned to Doc's notes: matte cloth (high roughness, no metalness), small
// faint holes that fade out at full-body distance, polyester sheen, and a
// fine thread weave (WEAVE) over everything, much smaller than the holes.
// How far above the pants hem the socks reach, tucked under the pants, and
// how far up under the hem the shin is drawn in the sock color.
const SOCK_TUCK = 0.015;
const SOCK_SKIN = 0.04;

// The thread weave (jersey-material/maps/weave_normal.png, 16 threads per
// tile), tiled `repeat` times per dimple-mesh tile: about 0.8 mm threads.
// The weave both bends the normal and shades the color a little (darker
// between threads), multiplied over the uniform art after it's drawn, so
// the art and combo colors are never replaced. At a distance the mipmaps
// average it to a flat, faint tone.
const WEAVE = { repeat: 8, strength: 0.6, shade: 0.22 };
const WEAVE_GLSL = /* glsl */ `
  vec3 weaveN = texture2D(uWeave, vNormalMapUv * uWeaveRepeat).xyz * 2.0 - 1.0;
  normal = normalize(normal + tbn * vec3(weaveN.xy * uWeaveStrength * weaveAmt, 0.0));
  diffuseColor.rgb *= 1.0 - uWeaveShade * weaveAmt * (1.0 - clamp(weaveN.z, 0.0, 1.0));
`;
// How far the jersey sits out from its rest shape (meters), so it clears the
// body and pads.
const JERSEY_PUFF = 0.006;
// Doc's fit, in meters: the untucked hem's drop below the belt and its
// clearance over the pants and belt, where it starts flaring out above the
// pants, the shoulder broadening, and the pants' fullness.
// untucked: Doc wants the jersey tucked in (2026-10-03); true hangs it over the belt.
const JERSEY_FIT = { untucked: false, belowBelt: 0.075, clear: 0.012, blend: 0.08, shoulders: 0.015, thigh: 0.012, knee: 0.009 };
// Skin within this distance under the jersey or pants is never drawn.
const COVER_DEPTH = 0.08;
const COVER_SIDE = 0.02;

const MESH_FABRIC = {
  holesPerMeter: 200, // each map tile is 20 holes across
  mesh: { normalScale: 0.25, aoIntensity: 0.35, sheen: 0.5, sheenRoughness: 0.5, envMapIntensity: 0.6, roughness: 1.35 },
  smooth: { sheen: 0.5, sheenRoughness: 0.5, roughness: 0.88, envMapIntensity: 0.6 }, // yoke, sleeves, socks
  yokeDrop: 0.07, // meters below the armpits where the mesh starts on the front
  backDrop: 0.07, // and on the back: the same as the front, so the two match
};

// ---------- shader helpers ----------

// Adds antialiased bands across a per-vertex distance. Up to three bands,
// each with its own center offset, width and color.
const BANDS_GLSL = /* glsl */ `
  uniform vec3 uBandAt;
  uniform vec3 uBandW;
  uniform vec3 uBandC0;
  uniform vec3 uBandC1;
  uniform vec3 uBandC2;
  float bandMask(float d, float at, float w) {
    if (w <= 0.0) return 0.0;
    float fw = max(fwidth(d), 1e-4);
    return 1.0 - smoothstep(w * 0.5 - fw, w * 0.5 + fw, abs(d - at));
  }
  vec3 applyBands(vec3 col, float d) {
    col = mix(col, uBandC0, bandMask(d, uBandAt.x, uBandW.x));
    col = mix(col, uBandC1, bandMask(d, uBandAt.y, uBandW.y));
    col = mix(col, uBandC2, bandMask(d, uBandAt.z, uBandW.z));
    return col;
  }
`;

function bandUniforms() {
  return {
    uBandAt: { value: new THREE.Vector3() },
    uBandW: { value: new THREE.Vector3() },
    uBandC0: { value: new THREE.Color() },
    uBandC1: { value: new THREE.Color() },
    uBandC2: { value: new THREE.Color() },
  };
}

function setBands(u, bands) {
  const at = [0, 0, 0];
  const w = [0, 0, 0];
  const cols = [u.uBandC0.value, u.uBandC1.value, u.uBandC2.value];
  bands.slice(0, 3).forEach((b, i) => {
    at[i] = b.at;
    w[i] = b.w;
    cols[i].set(b.color);
  });
  u.uBandAt.value.set(...at);
  u.uBandW.value.set(...w);
}

// The helmet's rear art (number and bumper lettering), projected straight
// on from behind onto whatever faces backward. The canvas spans HELMET_BACK
// in helmet units; the viewer's right is the helmet's -x.
const HELMET_BACK = { x: 0.32, top: 0.35, bottom: -0.65 };
const HELMET_BACK_GLSL = /* glsl */ `
  uniform sampler2D uBack;
  vec4 helmetBack(vec3 p, vec3 n) {
    float facing = -normalize(n).z;
    if (facing < 0.25) return vec4(0.0);
    vec2 uv = vec2((${HELMET_BACK.x.toFixed(3)} - p.x) / ${(2 * HELMET_BACK.x).toFixed(3)}, (${HELMET_BACK.top.toFixed(3)} - p.y) / ${(HELMET_BACK.top - HELMET_BACK.bottom).toFixed(3)});
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
    return texture2D(uBack, uv) * smoothstep(0.25, 0.45, facing); // premultiplied
  }
`;

// Wires a per-vertex attribute into a material and lets `fragment` adjust
// diffuseColor after the base map is applied.
// `after` adds code after other fragment chunks, keyed by chunk name;
// `rewrite` replaces a chunk with fn(chunk source).
function extend(material, { attrs = {}, uniforms = {}, declare = '', fragment = '', after = {}, rewrite = {}, vertexAfter = {}, vertexDeclare = '', vertexWorld = false }) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const attrDecl = Object.entries(attrs).map(([n, t]) => `attribute ${t} ${n};\nvarying ${t} v${n};`).join('\n');
    const attrCopy = Object.keys(attrs).map((n) => `v${n} = ${n};`).join('\n');
    const varyDecl = Object.entries(attrs).map(([n, t]) => `varying ${t} v${n};`).join('\n');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${attrDecl}${vertexWorld ? '\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;' : ''}\n${vertexDeclare}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${attrCopy}${vertexWorld ? '\nvObjPos = position;\nvObjNormal = normal;' : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${varyDecl}${vertexWorld ? '\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;' : ''}\n${declare}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${fragment}`);
    for (const [chunk, fn] of Object.entries(rewrite)) {
      shader.fragmentShader = shader.fragmentShader.replace(`#include <${chunk}>`, fn(THREE.ShaderChunk[chunk]));
    }
    for (const [chunk, code] of Object.entries(vertexAfter)) {
      shader.vertexShader = shader.vertexShader.replace(`#include <${chunk}>`, `#include <${chunk}>\n${code}`);
    }
    for (const [chunk, code] of Object.entries(after)) {
      shader.fragmentShader = shader.fragmentShader.replace(`#include <${chunk}>`, `#include <${chunk}>\n${code}`);
    }
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => `${material.name}-ext`;
  return material;
}

// ---------- geometry measurements (rest pose, world meters) ----------

// Move skinned vertices to new rest-pose world positions (Map index ->
// Vector3), solving each back through its own skinning so it keeps its bone
// weights, then give the moved vertices fresh smooth normals.
function moveRest(mesh, moved) {
  if (!moved.size) return;
  const geo = mesh.geometry;
  // Quantized positions (normalized integers) can't hold points outside the
  // mesh's original box, so edit a float copy.
  if (!(geo.attributes.position.array instanceof Float32Array)) {
    const q = geo.attributes.position;
    const f = new Float32Array(q.count * 3);
    for (let i = 0; i < q.count; i++) f.set([q.getX(i), q.getY(i), q.getZ(i)], i * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(f, 3));
  }
  const pos = geo.attributes.position;
  const toLocal = new Map();
  const skinM = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const v = new THREE.Vector3();
  for (const [i, world] of moved) {
    // world = matrixWorld * bindMatrixInverse * skin * bindMatrix * local
    skinM.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = geo.attributes.skinWeight.getComponent(i, k);
      if (!w) continue;
      const j = geo.attributes.skinIndex.getComponent(i, k);
      tmp.multiplyMatrices(mesh.skeleton.bones[j].matrixWorld, mesh.skeleton.boneInverses[j]);
      for (let e = 0; e < 16; e++) skinM.elements[e] += tmp.elements[e] * w;
    }
    const m = mesh.matrixWorld.clone().multiply(mesh.bindMatrixInverse).multiply(skinM).multiply(mesh.bindMatrix).invert();
    v.copy(world).applyMatrix4(m);
    pos.setXYZ(i, v.x, v.y, v.z);
    toLocal.set(i, m);
  }
  pos.needsUpdate = true;
  const normals = worldNormals(mesh, worldPositions(mesh));
  const nrm = geo.attributes.normal;
  const m3 = new THREE.Matrix3();
  for (const [i, m] of toLocal) {
    v.fromArray(normals, i * 3).applyMatrix3(m3.setFromMatrix4(m)).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  nrm.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

// 1 for vertices at least `rings` edges in from an open boundary (welded by
// position, so UV seams aren't boundaries), else 0.
function innerVertices(mesh, world, rings) {
  const count = world.length / 3;
  const weld = new Map();
  const id = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const k = `${world[i * 3].toFixed(4)},${world[i * 3 + 1].toFixed(4)},${world[i * 3 + 2].toFixed(4)}`;
    if (!weld.has(k)) weld.set(k, weld.size);
    id[i] = weld.get(k);
  }
  const tris = mesh.geometry.index ? mesh.geometry.index.array : Array.from({ length: count }, (_, i) => i);
  const edges = new Map();
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = id[tris[t + e]];
      const b = id[tris[t + ((e + 1) % 3)]];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  let near = new Uint8Array(weld.size);
  for (const [k, n] of edges) if (n === 1) for (const v of k.split(',')) near[+v] = 1;
  for (let r = 1; r < rings; r++) {
    const next = near.slice();
    for (let t = 0; t < tris.length; t += 3) {
      const v = [id[tris[t]], id[tris[t + 1]], id[tris[t + 2]]];
      if (v.some((x) => near[x])) for (const x of v) next[x] = 1;
    }
    near = next;
  }
  return Uint8Array.from(id, (w) => 1 - near[w]);
}

function worldPositions(mesh) {
  const pos = mesh.geometry.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, v);
    v.applyMatrix4(mesh.matrixWorld);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

// Smooth vertex normals for rest-pose world positions (welded by position,
// so UV seams don't crease them).
function worldNormals(mesh, world) {
  const index = mesh.geometry.index;
  const count = world.length / 3;
  const weld = new Map();
  const id = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const k = `${world[i * 3].toFixed(4)},${world[i * 3 + 1].toFixed(4)},${world[i * 3 + 2].toFixed(4)}`;
    if (!weld.has(k)) weld.set(k, weld.size);
    id[i] = weld.get(k);
  }
  const acc = new Float32Array(weld.size * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const tris = index ? index.array : Array.from({ length: count }, (_, i) => i);
  for (let t = 0; t < tris.length; t += 3) {
    a.fromArray(world, tris[t] * 3);
    b.fromArray(world, tris[t + 1] * 3).sub(a);
    c.fromArray(world, tris[t + 2] * 3).sub(a);
    b.cross(c); // area-weighted face normal
    for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) acc[id[tris[t + k]] * 3 + j] += b.getComponent(j);
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    a.fromArray(acc, id[i] * 3).normalize();
    out.set([a.x, a.y, a.z], i * 3);
  }
  return out;
}

// Sum of skin weights on bones whose names pass `test`.
function boneWeight(mesh, test) {
  const idx = mesh.geometry.attributes.skinIndex;
  const wt = mesh.geometry.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  const hits = bones.map((b) => test(b.name));
  const out = new Float32Array(idx.count);
  for (let i = 0; i < idx.count; i++) {
    let s = 0;
    for (let k = 0; k < 4; k++) if (hits[idx.getComponent(i, k)]) s += wt.getComponent(i, k);
    out[i] = s;
  }
  return out;
}

// Vertices on open edges of the mesh (neckline, sleeve hems, waist), after
// welding the UV seams so they don't count as edges.
function boundaryPoints(mesh, world) {
  const index = mesh.geometry.index;
  const key = (i) => `${Math.round(world[i * 3] * 2000)},${Math.round(world[i * 3 + 1] * 2000)},${Math.round(world[i * 3 + 2] * 2000)}`;
  const weld = new Map();
  const id = new Int32Array(world.length / 3);
  for (let i = 0; i < id.length; i++) {
    const k = key(i);
    if (!weld.has(k)) weld.set(k, i);
    id[i] = weld.get(k);
  }
  const edges = new Map();
  const addEdge = (a, b) => {
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    edges.set(k, (edges.get(k) ?? 0) + 1);
  };
  for (let t = 0; t < index.count; t += 3) {
    const a = id[index.getX(t)];
    const b = id[index.getX(t + 1)];
    const c = id[index.getX(t + 2)];
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  const set = new Set();
  for (const [k, n] of edges) {
    if (n !== 1) continue;
    const [a, b] = k.split('_').map(Number);
    set.add(a);
    set.add(b);
  }
  return [...set].map((i) => new THREE.Vector3(world[i * 3], world[i * 3 + 1], world[i * 3 + 2]));
}

// Meters of cloth per unit of U and of V, from the triangle edges that run
// mostly along one UV axis (medians, so seams and stretched spots don't skew it).
function uvScale(mesh, world) {
  const index = mesh.geometry.index;
  const uv = mesh.geometry.attributes.uv;
  const along = [[], []];
  for (let t = 0; t < index.count; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = index.getX(t + k);
      const b = index.getX(t + ((k + 1) % 3));
      const du = Math.abs(uv.getX(a) - uv.getX(b));
      const dv = Math.abs(uv.getY(a) - uv.getY(b));
      const len = Math.hypot(world[a * 3] - world[b * 3], world[a * 3 + 1] - world[b * 3 + 1], world[a * 3 + 2] - world[b * 3 + 2]);
      if (du > dv * 4 && du > 1e-5) along[0].push(len / du);
      else if (dv > du * 4 && dv > 1e-5) along[1].push(len / dv);
    }
  }
  const median = (a) => (a.length ? a.sort((x, y) => x - y)[a.length >> 1] : 1);
  return along.map(median);
}

function nearestDistance(world, i, points) {
  let best = Infinity;
  const x = world[i * 3];
  const y = world[i * 3 + 1];
  const z = world[i * 3 + 2];
  for (const p of points) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function dequantize(mesh) {
  const g = mesh.geometry;
  for (const name of ['position', 'normal']) {
    const a = g.attributes[name];
    if (!a || a.array instanceof Float32Array) continue;
    const f = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      f[i * 3] = a.getX(i);
      f[i * 3 + 1] = a.getY(i);
      f[i * 3 + 2] = a.getZ(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(f, 3));
  }
  g.applyMatrix4(mesh.matrix);
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();
}

// ---------- the player ----------

export class Player {
  constructor(renderer, assets) {
    this.renderer = renderer;
    this.root = new THREE.Group();
    this.body = assets.player.scene;
    this.root.add(this.body);
    this.tmpV = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();

    this.fitBody();
    this.collect();
    this.buildMaterials();
    this.measure();
    this.attachHelmet(assets.helmet.scene);
    this.addProps();
    this.captureRest();
    this.buildActions(assets.player.animations[0]);
  }

  fitBody() {
    this.body.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.body, true);
    const s = PLAYER_HEIGHT / (box.max.y - box.min.y);
    this.scale = s;
    this.body.scale.setScalar(s);
    this.body.position.set(-(box.min.x + box.max.x) * 0.5 * s, -box.min.y * s, -(box.min.z + box.max.z) * 0.5 * s);
    this.body.updateMatrixWorld(true);
  }

  collect() {
    this.bones = {};
    this.parts = {};
    this.body.traverse((o) => {
      if (o.isBone) this.bones[o.name.replace(/^mixamorig_?/, '')] = o;
      if (o.isMesh) {
        this.parts[o.material.name] = o;
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
  }

  buildMaterials() {
    const C = paint.makeCanvas;
    const aniso = this.renderer.capabilities.getMaxAnisotropy(); // keeps the art sharp at an angle
    const tex = (canvas, flipY = false) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = flipY;
      t.anisotropy = aniso;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    };
    // Art canvases: jersey front and back at the art's full size, so the
    // lettering stays crisp up close, the hip logos, the helmet decal and the ball.
    this.canvases = {
      front: C(JERSEY_ART.width, JERSEY_ART.height),
      back: C(JERSEY_ART.width, JERSEY_ART.height),
      // The back number and name, on their own 2048 px canvas so they stay sharp.
      backLetters: C(2048, Math.round((2048 * JERSEY_ART.height) / JERSEY_ART.width)),
      // The two shoulder (or cuff) numbers, side by side: the player's right on the left half.
      tv: C(2048, 1024),
      logos: C(PANTS_ART.width, PANTS_ART.height),
      shoe: C(702, 372),
      decal: C(752, 762),
      // The back of the helmet: the number on the shell and LOUISVILLE on the bumper.
      helmetBack: C(1024, 1600),
      ball: C(512, 256),
    };
    this.textures = Object.fromEntries(Object.entries(this.canvases).map(([k, c]) => [k, tex(c, k === 'ball')]));
    // Premultiplied, so the letters' edges filter cleanly over the jersey.
    this.textures.backLetters.premultiplyAlpha = true;
    this.textures.tv.premultiplyAlpha = true;
    this.textures.helmetBack.premultiplyAlpha = true;
    // One set of fabric maps; the jersey and pants each get their own tiling,
    // set from their UV scale in measure().
    const fabricMaps = loadFabricMaps(this.renderer, 'jersey-material/maps/');
    this.fabricMaps = { jersey: withTiling(fabricMaps, 16, 6.3), pants: withTiling(fabricMaps, 6) };

    const fabric = (extra) => new THREE.MeshPhysicalMaterial({ roughness: 0.9, metalness: 0, sheen: 0.5, sheenRoughness: 0.5, ...extra });
    const weave = new THREE.TextureLoader().load('jersey-material/maps/weave_normal.png');
    weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
    weave.flipY = false;
    weave.colorSpace = THREE.NoColorSpace;
    weave.anisotropy = aniso;
    const weaveU = { uWeave: { value: weave }, uWeaveRepeat: { value: WEAVE.repeat }, uWeaveStrength: { value: WEAVE.strength }, uWeaveShade: { value: WEAVE.shade } };
    const weaveDecl = 'uniform sampler2D uWeave;\nuniform float uWeaveRepeat;\nuniform float uWeaveStrength;\nuniform float uWeaveShade;';
    const pantsU = bandUniforms();
    this.uniforms = {
      pants: { ...pantsU, ...weaveU, uLogos: { value: this.textures.logos }, uBandEnd: { value: 1 } },
      jersey: {
        uArtFront: { value: this.textures.front },
        uArtBack: { value: this.textures.back },
        uBackLetters: { value: this.textures.backLetters },
        uTv: { value: this.textures.tv },
        uBase: { value: new THREE.Color() },
        uCollar: { value: new THREE.Color() },
        uCollarW: { value: 0.008 },
        uSmoothRough: { value: MESH_FABRIC.smooth.roughness },
        uPuff: { value: 0 },
        ...weaveU,
      },
      glove: { uGlove: { value: new THREE.Color() }, uGloveOn: { value: 1 }, uSock: { value: new THREE.Color() } },
      shoe: { uShoe: { value: this.textures.shoe }, uShoeBase: { value: new THREE.Color() } },
      shell: {
        uStripe: bandUniforms(),
        uDecal: { value: this.textures.decal },
        uBack: { value: this.textures.helmetBack },
        uDecalOn: { value: 0 },
        // x, y: art pixel of the shell's front and top; z: art pixels per helmet unit.
        uDecalArt: { value: new THREE.Vector3(85, 5, 541.7) },
        uDecalSize: { value: new THREE.Vector2(752, 762) },
        // Shell extents (front z, top y) in helmet units.
        uShellFront: { value: new THREE.Vector2(0.612, 0.566) },
        // Art u of the decal's center; the far side flips about it when the
        // decal must read the same way on both sides (scripts). -1 mirrors.
        uDecalFlip: { value: -1 },
        uDecalMetal: { value: 0 },
      },
    };

    this.m = {
      // aMesh is 1 on the dimple-mesh body and 0 on the smooth yoke and sleeves;
      // the mesh's relief, roughness and hole shading all fade with it.
      jersey: extend(applyMeshFabricInPlace(fabric({ name: 'jersey' }), this.fabricMaps.jersey, MESH_FABRIC.mesh), {
        attrs: { aArt: 'vec3', aNeck: 'float', aMesh: 'float', aTv: 'vec3', aPuff: 'float' },
        uniforms: this.uniforms.jersey,
        declare: `uniform sampler2D uArtFront;\nuniform sampler2D uArtBack;\nuniform sampler2D uBackLetters;\nuniform sampler2D uTv;\nuniform vec3 uBase;\nuniform vec3 uCollar;\nuniform float uCollarW;\nuniform float uSmoothRough;\n${weaveDecl}`,
        // Pushed out along its skinned normal (uPuff is JERSEY_PUFF in the
        // mesh's units), so it rides over the body instead of through it.
        vertexDeclare: 'uniform float uPuff;',
        vertexAfter: { skinning_vertex: 'transformed += normalize(objectNormal) * uPuff * aPuff;' },
        fragment: /* glsl */ `
          vec4 art = vaArt.z < 0.5 ? texture2D(uArtFront, vaArt.xy) : texture2D(uArtBack, vaArt.xy);
          diffuseColor.rgb = mix(uBase, art.rgb, art.a);
          float cfw = max(fwidth(vaNeck), 1e-4);
          diffuseColor.rgb = mix(diffuseColor.rgb, uCollar, 1.0 - smoothstep(uCollarW - cfw, uCollarW + cfw, vaNeck));
          vec4 lettering = vaArt.z < 0.5 ? vec4(0.0) : texture2D(uBackLetters, vaArt.xy); // premultiplied
          // Shoulder numbers: flat decals, aTv = (across, down, side 1 or 2).
          if (vaTv.z > 0.5 && all(greaterThan(vaTv.xy, vec2(0.0))) && all(lessThan(vaTv.xy, vec2(1.0)))) {
            vec4 tv = texture2D(uTv, vec2((vaTv.z > 1.5 ? 0.5 : 0.0) + vaTv.x * 0.5, vaTv.y));
            lettering = lettering * (1.0 - tv.a) + tv;
          }
          float letters = lettering.a;
          diffuseColor.rgb = diffuseColor.rgb * (1.0 - letters) + lettering.rgb;
          // No mesh under the lettering or anything else off the base color.
          float meshAmt = vaMesh * (1.0 - letters) * (1.0 - smoothstep(0.12, 0.25, distance(diffuseColor.rgb, uBase)));
        `,
        rewrite: { aomap_fragment: (chunk) => chunk.replace(/aoMapIntensity/g, '(aoMapIntensity * meshAmt)') },
        after: {
          roughnessmap_fragment: 'roughnessFactor = mix(uSmoothRough, roughnessFactor, meshAmt);',
          // Twill lettering shows less of the weave than the cloth.
          normal_fragment_maps: `normal = normalize(mix(nonPerturbedNormal, normal, meshAmt));\nfloat weaveAmt = 1.0 - 0.7 * letters;\n${WEAVE_GLSL}`,
        },
      }),
      pants: extend(applyMeshFabricInPlace(fabric({ name: 'pants' }), this.fabricMaps.pants, MESH_FABRIC.mesh), {
        attrs: { aSeam: 'float', aLogo: 'vec3', aDown: 'float' },
        uniforms: this.uniforms.pants,
        declare: `${BANDS_GLSL}\nuniform sampler2D uLogos;\nuniform float uBandEnd;\n${weaveDecl}`,
        after: { normal_fragment_maps: `float weaveAmt = 1.0;\n${WEAVE_GLSL}` },
        // Side stripes run the full outside seam, waistband to hem; with
        // uBandEnd < 1 they stop partway down, cut at an angle.
        fragment: /* glsl */ `
          float bandEnd = uBandEnd >= 1.0 ? 2.0 : uBandEnd - vaSeam * 1.2;
          float bfw = max(fwidth(vaDown), 1e-4);
          diffuseColor.rgb = mix(diffuseColor.rgb, applyBands(diffuseColor.rgb, vaSeam), 1.0 - smoothstep(bandEnd - bfw, bandEnd + bfw, vaDown));
          if (vaLogo.z > 0.5 && vaLogo.x > 0.0 && vaLogo.x < 1.0 && vaLogo.y > 0.0 && vaLogo.y < 1.0) {
            vec4 logo = texture2D(uLogos, vaLogo.xy);
            diffuseColor.rgb = mix(diffuseColor.rgb, logo.rgb, logo.a);
          }
        `,
      }),
      socks: applySmoothFabricInPlace(fabric({ name: 'socks' }), MESH_FABRIC.smooth),
      // Synthetic uppers on rubber soles: semi-matte, with a soft coat.
      cleats: extend(new THREE.MeshPhysicalMaterial({ name: 'cleats', roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5 }), {
        attrs: { aShoe: 'vec2' },
        uniforms: this.uniforms.shoe,
        declare: 'uniform sampler2D uShoe;\nuniform vec3 uShoeBase;',
        fragment: /* glsl */ `
          vec4 shoe = texture2D(uShoe, vaShoe);
          diffuseColor.rgb = mix(uShoeBase, shoe.rgb, shoe.a);
        `,
      }),
      // Skin under the clothes is cut away (aHide, see hideCovered) and the
      // rest is drawn a little behind coincident cloth (polygonOffset), so
      // nothing pokes through the jersey or pants and nothing z-fights.
      skin: extend(new THREE.MeshPhysicalMaterial({
        // Slightly lower roughness than before, softer specular (no flat
        // shine), and a warm sheen for a soft, subsurface-like edge.
        name: 'skin', roughness: 0.48, specularIntensity: 0.5, sheen: 0.4, sheenRoughness: 0.6, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
      }), {
        attrs: { aGlove: 'float', aSock: 'float', aHide: 'float' },
        uniforms: this.uniforms.glove,
        declare: 'uniform vec3 uGlove;\nuniform float uGloveOn;\nuniform vec3 uSock;',
        fragment: `
          if (vaHide > 0.999) discard; // all three corners under cloth
          float gloveAmt = uGloveOn * smoothstep(0.3, 0.6, vaGlove);
          diffuseColor.rgb = mix(diffuseColor.rgb, uGlove, gloveAmt);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSock, step(0.5, vaSock));
        `,
        // Gloves: synthetic grip palms, fairly rough; sock-colored shin: cloth.
        after: { roughnessmap_fragment: 'roughnessFactor = mix(mix(roughnessFactor, 0.62, gloveAmt), 0.9, step(0.5, vaSock));' },
      }),
      // Leather belt: a low sheen in a thin, fairly rough clear coat.
      belt: new THREE.MeshPhysicalMaterial({ name: 'belt', roughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.5 }),
      buckle: new THREE.MeshStandardMaterial({ name: 'buckle', color: '#c9ccd1', metalness: 0.9, roughness: 0.3 }),
      tape: new THREE.MeshStandardMaterial({ name: 'tape', color: BRAND.white, roughness: 0.85 }),
      armSleeve: fabric({ name: 'armSleeve', roughness: 0.5, sheen: 0.3 }),
      eyes: new THREE.MeshPhysicalMaterial({ name: 'eyes', color: '#1a1410', roughness: 0.15, clearcoat: 1 }),
    };
    for (const [name, mesh] of Object.entries(this.parts)) {
      if (this.m[name]) mesh.material = this.m[name];
    }
    paint.paintBall(this.canvases.ball);
    this.textures.ball.needsUpdate = true;
  }

  // The model's socks stop short of the pants hem, leaving bare shin. This
  // stretches the top 6 cm of each sock up to SOCK_TUCK above the hem, so it
  // tucks under the pants, and pushes the new part out to clear the leg
  // (the knee is wider than the calf). Done on the rest pose: each moved
  // vertex is solved back through its own skinning transform, so it skins
  // exactly as before with the same bone weights. No asset change needed.
  tuckSocks() {
    const { socks, pants, skin } = this.parts;
    if (!socks || !pants || !skin) return;
    const sw = worldPositions(socks);
    const pw = worldPositions(pants);
    const kw = worldPositions(skin);
    const pos = socks.geometry.attributes.position;
    const mid = (this.bones.LeftUpLeg.getWorldPosition(new THREE.Vector3()).x + this.bones.RightUpLeg.getWorldPosition(new THREE.Vector3()).x) / 2;
    const BAND = 0.06; // the top 6 cm of the sock is stretched
    const moved = new Map();
    const aSock = new Float32Array(kw.length / 3);
    for (const left of [true, false]) {
      const side = (x) => (x > mid) === left;
      let hem = Infinity;
      for (let i = 0; i < pw.length; i += 3) if (side(pw[i])) hem = Math.min(hem, pw[i + 1]);
      let top = -Infinity;
      for (let i = 0; i < sw.length; i += 3) if (side(sw[i])) top = Math.max(top, sw[i + 1]);
      const target = hem + SOCK_TUCK;
      if (!(target > top)) continue;
      // The sock's top edge isn't level, so each 15° sector stretches from its own top.
      let cx = 0;
      let cz = 0;
      let cn = 0;
      for (let i = 0; i < sw.length; i += 3) {
        if (!side(sw[i]) || sw[i + 1] < top - BAND) continue;
        cx += sw[i];
        cz += sw[i + 2];
        cn++;
      }
      cx /= cn;
      cz /= cn;
      const sector = (x, z) => (Math.floor(((Math.atan2(z - cz, x - cx) + Math.PI) / (2 * Math.PI)) * 24) + 24) % 24;
      const tops = new Float32Array(24).fill(-Infinity);
      for (let i = 0; i < sw.length; i += 3) {
        if (side(sw[i]) && sw[i + 1] > top - 2 * BAND) tops[sector(sw[i], sw[i + 2])] = Math.max(tops[sector(sw[i], sw[i + 2])], sw[i + 1]);
      }
      for (let b = 0; b < 24; b++) if (!Number.isFinite(tops[b])) tops[b] = top;
      // The hem isn't level either (it rides up at the back of the knee).
      const hems = new Float32Array(24).fill(Infinity);
      for (let i = 0; i < pw.length; i += 3) {
        if (side(pw[i]) && pw[i + 1] < hem + 0.08) hems[sector(pw[i], pw[i + 2])] = Math.min(hems[sector(pw[i], pw[i + 2])], pw[i + 1]);
      }
      const targets = hems.map((h) => (Number.isFinite(h) ? h : hem) + SOCK_TUCK);
      const tallest = Math.max(...targets);
      // Skin on the shin, up under the hem, is drawn in the sock color too, so
      // no skin shows where a low-poly facet of the sock dips under the leg
      // or the knee bends the hem away.
      let bottom = Infinity;
      for (let i = 0; i < sw.length; i += 3) if (side(sw[i])) bottom = Math.min(bottom, sw[i + 1]);
      for (let i = 0; i < kw.length; i += 3) {
        if (!side(kw[i]) || kw[i + 1] < bottom || Math.hypot(kw[i] - cx, kw[i + 2] - cz) > 0.12) continue;
        if (kw[i + 1] < targets[sector(kw[i], kw[i + 2])] - SOCK_TUCK + SOCK_SKIN) aSock[i / 3] = 1;
      }
      // The leg's center and outer radius per 1 cm slice and 15° sector.
      const slices = new Map();
      for (let i = 0; i < kw.length; i += 3) {
        const y = kw[i + 1];
        if (!side(kw[i]) || y < top - 3 * BAND || y > tallest + 0.06) continue;
        const k = Math.round(y * 100);
        const sl = slices.get(k) ?? { x: 0, z: 0, n: 0, pts: [] };
        sl.x += kw[i];
        sl.z += kw[i + 2];
        sl.n++;
        sl.pts.push(kw[i], kw[i + 2]);
        slices.set(k, sl);
      }
      // The pants' inner radius per sector at the same slices, so the
      // tucked part stays under the hem.
      const hemR = new Map();
      for (let i = 0; i < pw.length; i += 3) {
        const y = pw[i + 1];
        if (!side(pw[i]) || y > tallest + 0.02) continue;
        const k = Math.round(y * 100);
        const list = hemR.get(k) ?? [];
        list.push(pw[i], pw[i + 2]);
        hemR.set(k, list);
      }
      for (const sl of slices.values()) {
        sl.x /= sl.n;
        sl.z /= sl.n;
        sl.r = new Float32Array(24);
        for (let j = 0; j < sl.pts.length; j += 2) {
          const dx = sl.pts[j] - sl.x;
          const dz = sl.pts[j + 1] - sl.z;
          if (Math.hypot(dx, dz) > 0.12) continue; // not this leg
          const b = (Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * 24) + 24) % 24;
          sl.r[b] = Math.max(sl.r[b], Math.hypot(dx, dz));
        }
      }
      for (let i = 0; i < pos.count; i++) {
        const x = sw[i * 3];
        const y = sw[i * 3 + 1];
        const z = sw[i * 3 + 2];
        if (!side(x)) continue;
        const sec = sector(x, z);
        const t = tops[sec];
        if (y < t - BAND) continue;
        const ny = t - BAND + ((y - (t - BAND)) / BAND) * (targets[sec] - (t - BAND));
        const sl = slices.get(Math.round(ny * 100));
        let nx = x;
        let nz = z;
        if (sl) {
          const dx = x - sl.x;
          const dz = z - sl.z;
          const r = Math.hypot(dx, dz) || 1e-6;
          const b = (Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * 24) + 24) % 24;
          // The sock is low-poly, so clear the widest leg within 4 cm above
          // and below, which its flat facets span.
          let need = 0;
          for (let dy = -4; dy <= 4; dy++) {
            const o = slices.get(Math.round(ny * 100) + dy);
            if (o) for (const bb of [b, (b + 1) % 24, (b + 23) % 24]) need = Math.max(need, o.r[bb]);
          }
          need += 0.004;
          let nr = Math.max(r, need);
          // Inside the pants: no wider than the hem in this direction.
          let pr = Infinity;
          for (let dy = -1; dy <= 1; dy++) {
            const ring = hemR.get(Math.round(ny * 100) + dy) ?? [];
            for (let j = 0; j < ring.length; j += 2) {
              const px = ring[j] - sl.x;
              const pz = ring[j + 1] - sl.z;
              const pb = (Math.floor(((Math.atan2(pz, px) + Math.PI) / (2 * Math.PI)) * 24) + 24) % 24;
              if ((pb - b + 25) % 24 <= 2) pr = Math.min(pr, Math.hypot(px, pz));
            }
          }
          if (Number.isFinite(pr)) nr = Math.min(nr, pr - 0.006);
          nx = sl.x + (dx / r) * nr;
          nz = sl.z + (dz / r) * nr;
        }
        moved.set(i, new THREE.Vector3(nx, ny, nz));
      }
    }
    moveRest(socks, moved);
    skin.geometry.setAttribute('aSock', new THREE.BufferAttribute(aSock, 1));
  }

  // Doc's fit (2026-10-03): the jersey stays tucked in (JERSEY_FIT.untucked
  // would hang it outside the pants, JERSEY_FIT.belowBelt under the belt); the shoulders are a little
  // broader; the pants are a little fuller at the thighs and knees. Rest
  // pose edits, solved back through each vertex's skinning (moveRest).
  fitUniform() {
    const { jersey, pants, belt, buckle } = this.parts;
    const bone = (n) => this.bones[n].getWorldPosition(new THREE.Vector3());
    const sector = (x, z, cx, cz) => (Math.floor(((Math.atan2(z - cz, x - cx) + Math.PI) / (2 * Math.PI)) * 36) + 36) % 36;
    if (jersey && pants) {
      const jw = worldPositions(jersey);
      const jn = worldNormals(jersey, jw);
      const uv = jersey.geometry.attributes.uv;
      const waist = [pants, belt, buckle].filter(Boolean).map((m) => worldPositions(m));
      const bw = belt ? worldPositions(belt) : waist[0];
      let cx = 0;
      let cz = 0;
      let beltLow = Infinity;
      for (let i = 0; i < bw.length; i += 3) { cx += bw[i]; cz += bw[i + 2]; beltLow = Math.min(beltLow, bw[i + 1]); }
      cx /= bw.length / 3;
      cz /= bw.length / 3;
      const pantsTop = new THREE.Box3().setFromObject(pants, true).max.y;
      let hemOld = Infinity;
      for (let i = 0; i < jw.length / 3; i++) if (uv.getX(i) >= 0.44) hemOld = Math.min(hemOld, jw[i * 3 + 1]);
      const hemNew = Math.min(hemOld, beltLow - JERSEY_FIT.belowBelt);
      const top = pantsTop + JERSEY_FIT.blend; // the jersey is untouched above this
      // Widest the waist gets (pants, belt, buckle) per 10° sector, down to the new hem.
      const R = new Float32Array(36);
      for (const w of waist) {
        for (let i = 0; i < w.length; i += 3) {
          if (w[i + 1] < hemNew - 0.01 || Math.hypot(w[i] - cx, w[i + 2] - cz) > 0.3) continue;
          const b = sector(w[i], w[i + 2], cx, cz);
          R[b] = Math.max(R[b], Math.hypot(w[i] - cx, w[i + 2] - cz));
        }
      }
      // Smooth the sectors so the hem hangs in an even curve.
      const Rm = R.map((_, b) => Math.max(R[b], R[(b + 1) % 36], R[(b + 35) % 36]) + JERSEY_FIT.clear);
      const Rs = Rm.map((_, b) => [-2, -1, 0, 1, 2].reduce((sum, o) => sum + Rm[(b + o + 36) % 36], 0) / 5);
      // Radius at any angle, interpolated between sector centers, so the hem
      // is a smooth curve rather than 10° steps.
      const needAt = (x, z) => {
        const f = ((Math.atan2(z - cz, x - cx) + Math.PI) / (2 * Math.PI)) * 36 - 0.5;
        const b0 = Math.floor(f);
        const t = f - b0;
        return Rs[(b0 + 36) % 36] * (1 - t) + Rs[(b0 + 37) % 36] * t;
      };
      // The tucked part is bunched into folds that double back on
      // themselves, so it's re-hung by its UV v (which runs straight down the
      // cloth): per sector, v at the pants top maps to the pants top and the
      // hem's v to the new hem.
      const vTop = new Float32Array(36).fill(NaN);
      const vHem = new Float32Array(36).fill(NaN);
      {
        const near = Array.from({ length: 36 }, () => []);
        for (let i = 0; i < jw.length / 3; i++) {
          if (uv.getX(i) < 0.44) continue;
          const b = sector(jw[i * 3], jw[i * 3 + 2], cx, cz);
          if (Math.abs(jw[i * 3 + 1] - pantsTop) < 0.01) near[b].push(uv.getY(i));
        }
        near.forEach((l, b) => { if (l.length) vTop[b] = l.sort((p, q) => p - q)[l.length >> 1]; });
        for (let i = 0; i < jw.length / 3; i++) {
          if (uv.getX(i) < 0.44 || jw[i * 3 + 1] > pantsTop) continue;
          const b = sector(jw[i * 3], jw[i * 3 + 2], cx, cz);
          const v = uv.getY(i);
          if (Number.isNaN(vTop[b])) continue;
          if (Number.isNaN(vHem[b]) || Math.abs(v - vTop[b]) > Math.abs(vHem[b] - vTop[b])) vHem[b] = v;
        }
      }
      const armpit = this.jerseyArmpit ?? bone('LeftArm').y - 0.12;
      const capTop = bone('LeftArm').y + 0.03;
      const moved = new Map();
      for (let i = 0; i < jw.length / 3; i++) {
        let x = jw[i * 3];
        let y = jw[i * 3 + 1];
        let z = jw[i * 3 + 2];
        const torso = uv.getX(i) >= 0.44;
        let changed = false;
        if (JERSEY_FIT.untucked && torso && y < top) {
          // Stretch the lower torso down to the new hem, then out over the waist.
          const b = sector(x, z, cx, cz);
          const v = uv.getY(i);
          const span = vHem[b] - vTop[b];
          if (y < pantsTop && Math.abs(span) > 1e-4) {
            const f = THREE.MathUtils.clamp((v - vTop[b]) / span, 0, 1);
            y = pantsTop - f * (pantsTop - hemNew);
          } else if (y < pantsTop) {
            y = top - ((top - y) * (top - hemNew)) / (top - hemOld);
          }
          const dx = x - cx;
          const dz = z - cz;
          const r = Math.hypot(dx, dz) || 1e-6;
          const need = needAt(x, z);
          // Over the pants it hangs as a smooth curve at `need` (the folds the
          // tucked hem had are flattened out), blending back to its own shape above.
          const flare = 1 - THREE.MathUtils.smoothstep(y, pantsTop, top);
          const nr = r + (Math.max(need, r * (1 - flare)) - r) * flare;
          x = cx + (dx / r) * nr;
          z = cz + (dz / r) * nr;
          changed = true;
        }
        // Broader shoulders: the shoulder caps push out along their normal,
        // leaning outward, never in toward the body.
        const side = Math.sign(x - cx);
        const n = new THREE.Vector3().fromArray(jn, i * 3);
        // Only the top and outside of the cap; the underarm stays put, so it
        // doesn't move into the arm when the arm is raised.
        const w = THREE.MathUtils.smoothstep(Math.abs(x - cx), 0.08, 0.2) * THREE.MathUtils.smoothstep(y, armpit - 0.06, capTop)
          * THREE.MathUtils.smoothstep(n.y + 0.5 * n.x * side, 0, 0.5);
        if (w > 0) {
          if (n.x * side > -0.2) n.x += 0.5 * side;
          n.normalize().multiplyScalar(JERSEY_FIT.shoulders * w);
          x += n.x;
          y += n.y;
          z += n.z;
          changed = true;
        }
        if (changed) moved.set(i, new THREE.Vector3(x, y, z));
      }
      moveRest(jersey, moved);
    }
    if (pants) {
      const pw = worldPositions(pants);
      const moved = new Map();
      const legs = [['LeftUpLeg', 'LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg', 'RightFoot']].map((l) => l.map(bone));
      const mid = (legs[0][0].x + legs[1][0].x) / 2;
      const bell = (v) => Math.exp(-v * v);
      const axis = new THREE.Vector3();
      const p = new THREE.Vector3();
      for (let i = 0; i < pw.length / 3; i++) {
        p.fromArray(pw, i * 3);
        const [hip, knee, foot] = legs[(p.x > mid) === (legs[0][0].x > mid) ? 0 : 1];
        // Nearest point on the leg's hip-knee-ankle line.
        const seg = p.y > knee.y ? [hip, knee] : [knee, foot];
        const d = seg[1].clone().sub(seg[0]);
        const t = THREE.MathUtils.clamp(p.clone().sub(seg[0]).dot(d) / d.lengthSq(), 0, 1);
        axis.copy(seg[0]).addScaledVector(d, t);
        const out = p.clone().sub(axis);
        out.addScaledVector(d, -out.dot(d) / d.lengthSq()); // across the leg only
        if (out.lengthSq() < 1e-8) continue;
        out.normalize();
        const thighMid = (hip.y + knee.y) / 2;
        let a = JERSEY_FIT.thigh * bell((p.y - thighMid) / 0.16) + JERSEY_FIT.knee * bell((p.y - knee.y) / 0.08);
        a *= 1 - THREE.MathUtils.smoothstep(p.y, hip.y - 0.14, hip.y - 0.02); // nothing at the waist
        if ((out.x > 0) !== (axis.x > mid)) a *= 0.35; // little on the inseam, so the legs don't meet
        if (a > 1e-5) moved.set(i, p.clone().addScaledVector(out, a));
      }
      moveRest(pants, moved);
    }
  }

  // Marks the skin under the jersey and pants (aHide = 1) so the skin shader
  // can drop it: a body vertex is covered when it lies behind the nearest
  // cloth vertex's surface, within COVER_DEPTH and COVER_SIDE of it, and
  // that cloth vertex is at least three rings in from an opening (collar, sleeve ends, hems), so
  // skin at the openings always stays. Rest pose; the cloth is skinned to
  // the same bones, so what's covered stays covered as the player moves.
  hideCovered() {
    const skin = this.parts.skin;
    const cloth = ['jersey', 'pants'].map((n) => this.parts[n]).filter(Boolean);
    if (!skin || !cloth.length) return;
    const cell = COVER_DEPTH;
    const grid = new Map();
    const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    const pts = [];
    for (const mesh of cloth) {
      const world = worldPositions(mesh);
      const normals = worldNormals(mesh, world);
      const inner = innerVertices(mesh, world, 3);
      for (let i = 0; i < world.length / 3; i++) {
        const k = key(world[i * 3], world[i * 3 + 1], world[i * 3 + 2]);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(pts.length);
        pts.push({ p: world.subarray(i * 3, i * 3 + 3), n: normals.subarray(i * 3, i * 3 + 3), inner: inner[i] });
      }
    }
    const kw = worldPositions(skin);
    const count = kw.length / 3;
    const aHide = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = kw[i * 3];
      const y = kw[i * 3 + 1];
      const z = kw[i * 3 + 2];
      let best = null;
      let bestD = COVER_DEPTH * COVER_DEPTH;
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const cz = Math.floor(z / cell);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        for (const j of grid.get(`${cx + a},${cy + b},${cz + c}`) ?? []) {
          const { p } = pts[j];
          const d = (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2;
          if (d < bestD) { bestD = d; best = pts[j]; }
        }
      }
      if (!best?.inner) continue;
      const { p, n } = best;
      const dx = x - p[0];
      const dy = y - p[1];
      const dz = z - p[2];
      const depth = dx * n[0] + dy * n[1] + dz * n[2];
      const side = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - depth * depth));
      // Behind the cloth (or under 2 mm in front of it, poking through at
      // rest) and right under that vertex, not off to the side in an opening.
      if (depth < 0.002 && side < COVER_SIDE) aHide[i] = 1;
    }
    // The upper arm inside each sleeve, whatever the rest pose says: when
    // the arm is raised it slides up through the sleeve's surface, so all
    // upper-arm skin short of the cuff (less 2 cm) is dropped too.
    const jersey = this.parts.jersey;
    if (jersey) {
      const jw = worldPositions(jersey);
      const uv = jersey.geometry.attributes.uv;
      for (const S of ['Left', 'Right']) {
        const shoulder = this.bones[`${S}Arm`]?.getWorldPosition(new THREE.Vector3());
        const elbow = this.bones[`${S}ForeArm`]?.getWorldPosition(new THREE.Vector3());
        if (!shoulder || !elbow) continue;
        const axis = elbow.clone().sub(shoulder).normalize();
        const along = (x, y, z) => (x - shoulder.x) * axis.x + (y - shoulder.y) * axis.y + (z - shoulder.z) * axis.z;
        let cuff = -Infinity;
        for (let i = 0; i < jw.length / 3; i++) {
          if (uv.getX(i) >= 0.44 || Math.sign(jw[i * 3] - shoulder.x) !== Math.sign(axis.x) && Math.abs(jw[i * 3]) < Math.abs(shoulder.x)) continue;
          if (Math.sign(jw[i * 3]) !== Math.sign(shoulder.x)) continue;
          cuff = Math.max(cuff, along(jw[i * 3], jw[i * 3 + 1], jw[i * 3 + 2]));
        }
        if (!Number.isFinite(cuff)) continue;
        // Upper arm, plus the deltoid and armpit (the Shoulder bone) away from the neck.
        const arm = boneWeight(skin, (n) => n.endsWith(`${S}Arm`) || n.endsWith(`${S}Shoulder`));
        const neckX = this.bones.Neck.getWorldPosition(new THREE.Vector3()).x;
        for (let i = 0; i < count; i++) {
          if (arm[i] < 0.5 || Math.abs(kw[i * 3] - neckX) < 0.12) continue;
          const t = along(kw[i * 3], kw[i * 3 + 1], kw[i * 3 + 2]);
          if (t < cuff - 0.02) aHide[i] = 1;
        }
      }
    }
    skin.geometry.setAttribute('aHide', new THREE.BufferAttribute(aHide, 1));
  }

  // Tile a mesh's fabric maps so the holes come out round and
  // MESH_FABRIC.holesPerMeter apart, whatever its UV scale.
  tileFabric(maps, mesh, world) {
    const [mu, mv] = uvScale(mesh, world);
    const k = MESH_FABRIC.holesPerMeter / 20;
    for (const t of Object.values(maps)) t.repeat.set(mu * k, mv * k);
  }

  // Per-vertex measurements in the rest pose, in meters.
  measure() {
    this.body.updateMatrixWorld(true);
    for (const mesh of Object.values(this.parts)) mesh.skeleton?.update();
    const bonePos = (n) => this.bones[n].getWorldPosition(new THREE.Vector3());
    const setAttr = (mesh, name, data) => mesh.geometry.setAttribute(name, new THREE.BufferAttribute(data, 1));
    this.fitUniform();
    this.tuckSocks();

    // Jersey: distance from the neckline for the collar piping, and where each
    // vertex lands on the front-view art.
    const jersey = this.parts.jersey;
    if (jersey) {
      const world = worldPositions(jersey);
      const count = world.length / 3;
      const neck = bonePos('Neck');
      const shoulderY = bonePos('LeftArm').y;
      const neckEdge = boundaryPoints(jersey, world)
        .filter((p) => p.y > shoulderY - 0.22 && Math.abs(p.x - neck.x) < 0.1 && Math.hypot(p.x - neck.x, p.z - neck.z) < 0.14);
      const aNeck = new Float32Array(count);
      for (let i = 0; i < count; i++) aNeck[i] = neckEdge.length ? nearestDistance(world, i, neckEdge) : 9;
      setAttr(jersey, 'aNeck', aNeck);
      const aArt = this.projectJersey(jersey, world, neckEdge, bonePos);
      jersey.geometry.setAttribute('aArt', new THREE.BufferAttribute(aArt, 3));
      // Kept for placing the shoulder-number decals, which move with the style.
      this.jerseyRest = { world, normals: worldNormals(jersey, world), art: aArt, neck: bonePos('Neck') };
      jersey.geometry.setAttribute('aTv', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      // Dimple mesh on the front below the yoke and on the lower back, faded over 4 cm.
      const uv = jersey.geometry.attributes.uv;
      const aMesh = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const u = uv.getX(i);
        if (u < 0.44) continue; // sleeve
        const meshTop = this.jerseyArmpit - (u < 0.715 ? MESH_FABRIC.yokeDrop : MESH_FABRIC.backDrop);
        aMesh[i] = THREE.MathUtils.smoothstep(meshTop - world[i * 3 + 1], -0.02, 0.02);
      }
      setAttr(jersey, 'aMesh', aMesh);
      this.tileFabric(this.fabricMaps.jersey, jersey, world);
      // Full outward offset above the pants; tucked in, none where the hem
      // goes under the pants.
      const pantsTop = this.parts.pants ? new THREE.Box3().setFromObject(this.parts.pants, true).max.y : -Infinity;
      const aPuff = new Float32Array(count);
      for (let i = 0; i < count; i++) aPuff[i] = JERSEY_FIT.untucked ? 1 : THREE.MathUtils.smoothstep(world[i * 3 + 1], pantsTop, pantsTop + 0.05);
      setAttr(jersey, 'aPuff', aPuff);
      this.uniforms.jersey.uPuff.value = JERSEY_PUFF / jersey.matrixWorld.getMaxScaleOnAxis();
    }
    this.hideCovered();

    // Pants: signed arc distance from the outer seam of each leg.
    const pants = this.parts.pants;
    if (pants) {
      const world = worldPositions(pants);
      this.tileFabric(this.fabricMaps.pants, pants, world);
      const legs = {
        L: [bonePos('LeftUpLeg'), bonePos('LeftLeg')],
        R: [bonePos('RightUpLeg'), bonePos('RightLeg')],
      };
      const mid = (legs.L[0].x + legs.R[0].x) / 2;
      const aSeam = new Float32Array(world.length / 3);
      const p = new THREE.Vector3();
      for (let i = 0; i < aSeam.length; i++) {
        p.fromArray(world, i * 3);
        const left = p.x > mid;
        const [hip, knee] = left ? legs.L : legs.R;
        const dir = knee.clone().sub(hip).normalize();
        const along = p.clone().sub(hip).dot(dir);
        const r = p.clone().sub(hip).sub(dir.clone().multiplyScalar(along));
        const out = new THREE.Vector3(left ? 1 : -1, 0, 0).projectOnPlane(dir).normalize();
        const fwd = new THREE.Vector3().crossVectors(dir, out);
        const angle = Math.atan2(r.dot(fwd), r.dot(out));
        aSeam[i] = angle * r.length() * (left ? 1 : -1);
      }
      setAttr(pants, 'aSeam', aSeam);

      // Hip logos: a front projection of the art's waist strip.
      let top = -Infinity;
      for (let i = 1; i < world.length; i += 3) top = Math.max(top, world[i]);
      const ring = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
      for (let i = 0; i < world.length / 3; i++) {
        if (Math.abs(world[i * 3 + 1] - (top - 0.04)) > 0.01) continue;
        ring.x0 = Math.min(ring.x0, world[i * 3]);
        ring.x1 = Math.max(ring.x1, world[i * 3]);
        ring.z0 = Math.min(ring.z0, world[i * 3 + 2]);
        ring.z1 = Math.max(ring.z1, world[i * 3 + 2]);
      }
      const A = PANTS_ART;
      const xc = (ring.x0 + ring.x1) / 2;
      const zc = (ring.z0 + ring.z1) / 2;
      const scale = A.waistWidth / (ring.x1 - ring.x0);
      const aLogo = new Float32Array(world.length);
      for (let i = 0; i < world.length / 3; i++) {
        aLogo[i * 3] = (A.centerX + (world[i * 3] - xc) * scale) / A.width;
        aLogo[i * 3 + 1] = (A.waistY + (top - world[i * 3 + 1]) * scale) / A.height;
        aLogo[i * 3 + 2] = world[i * 3 + 2] > zc ? 1 : 0;
      }
      pants.geometry.setAttribute('aLogo', new THREE.BufferAttribute(aLogo, 3));

      // Down the leg from the waist (0) to the bottom of the pants (1), for
      // side panels that stop partway down.
      let bottom = Infinity;
      for (let i = 1; i < world.length; i += 3) bottom = Math.min(bottom, world[i]);
      const aDown = new Float32Array(world.length / 3);
      for (let i = 0; i < aDown.length; i++) aDown[i] = (top - world[i * 3 + 1]) / (top - bottom);
      setAttr(pants, 'aDown', aDown);
    }

    // Cleats: the side-view art projected along each foot, heel to toe and
    // collar to studs, on both sides of the shoe.
    const cleats = this.parts.cleats;
    if (cleats) {
      const world = worldPositions(cleats);
      const midX = bonePos('Hips').x;
      const feet = ['Left', 'Right'].map((side) => {
        const ankle = bonePos(`${side}Foot`);
        const toe = bonePos(`${side}ToeBase`);
        const fwd = new THREE.Vector3(toe.x - ankle.x, 0, toe.z - ankle.z).normalize();
        return { ankle, fwd, a0: Infinity, a1: -Infinity, y0: Infinity, y1: -Infinity };
      });
      const along = new Float32Array(world.length / 3);
      for (let i = 0; i < along.length; i++) {
        const f = feet[world[i * 3] > midX ? 0 : 1];
        along[i] = (world[i * 3] - f.ankle.x) * f.fwd.x + (world[i * 3 + 2] - f.ankle.z) * f.fwd.z;
        f.a0 = Math.min(f.a0, along[i]);
        f.a1 = Math.max(f.a1, along[i]);
        f.y0 = Math.min(f.y0, world[i * 3 + 1]);
        f.y1 = Math.max(f.y1, world[i * 3 + 1]);
      }
      const A = SHOE_ART;
      const aShoe = new Float32Array(world.length / 3 * 2);
      for (let i = 0; i < along.length; i++) {
        const f = feet[world[i * 3] > midX ? 0 : 1];
        aShoe[i * 2] = A.heel + ((along[i] - f.a0) / (f.a1 - f.a0)) * (A.toe - A.heel);
        aShoe[i * 2 + 1] = A.top + ((f.y1 - world[i * 3 + 1]) / (f.y1 - f.y0)) * (A.bottom - A.top);
      }
      cleats.geometry.setAttribute('aShoe', new THREE.BufferAttribute(aShoe, 2));
      // The model's packed normals facet the glossy upper; smooth them.
      cleats.geometry.computeVertexNormals();
    }

    // Skin: how much each vertex follows the hands, for gloves.
    const skin = this.parts.skin;
    if (skin) setAttr(skin, 'aGlove', boneWeight(skin, (n) => /Hand/.test(n)));

    // Waist landmarks for the towel.
    const belt = this.parts.belt;
    if (belt) {
      const world = worldPositions(belt);
      let maxZ = -Infinity;
      let y = 0;
      for (let i = 0; i < world.length / 3; i++) {
        if (world[i * 3 + 2] > maxZ) {
          maxZ = world[i * 3 + 2];
          y = world[i * 3 + 1];
        }
      }
      this.waist = { y, z: maxZ };
    }
  }

  // Art coordinates (u, v, back?) for each jersey vertex. The torso is a
  // straight front (or back) projection, scaled so the chest fills the art's
  // body and stretched vertically to meet its shoulder, V-neck and armpit
  // lines. Each sleeve wraps the art's hanging sleeve, front and back alike,
  // so its bands run around the arm.
  projectJersey(jersey, world, neckEdge, bonePos) {
    const A = JERSEY_ART;
    const count = world.length / 3;
    const uv = jersey.geometry.attributes.uv;
    const panel = new Uint8Array(count); // 0 front, 1 back, 2 sleeve
    let top = -Infinity;
    let armpit = Infinity;
    for (let i = 0; i < count; i++) {
      const u = uv.getX(i);
      panel[i] = u < 0.44 ? 2 : u < 0.715 ? 0 : 1;
      const y = world[i * 3 + 1];
      if (panel[i] === 0) top = Math.max(top, y);
      if (panel[i] === 2) armpit = Math.min(armpit, y);
    }
    this.jerseyArmpit = armpit;
    const neckZ = bonePos('Neck').z;
    const front = neckEdge.filter((p) => p.z > neckZ);
    const vTip = front.length ? Math.min(...front.map((p) => p.y)) : top - 0.075;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (let i = 0; i < count; i++) {
      if (panel[i] !== 0 || Math.abs(world[i * 3 + 1] - (armpit - 0.06)) > 0.012) continue;
      x0 = Math.min(x0, world[i * 3]);
      x1 = Math.max(x1, world[i * 3]);
    }
    const xc = (x0 + x1) / 2;
    const scale = (A.bodyWidth - 28) / (x1 - x0); // art pixels per meter; keeps the side outlines off the body
    this.artScale = scale;
    const stops = [[top, A.shoulderY], [vTip, A.vNeckY], [armpit, A.armpitY]];
    const artY = (y) => {
      if (y >= top) return A.shoulderY - (y - top) * scale;
      if (y <= armpit) return A.armpitY + (armpit - y) * scale;
      for (let k = 0; k < stops.length - 1; k++) {
        const [ya, pa] = stops[k];
        const [yb, pb] = stops[k + 1];
        if (y <= ya && y >= yb) return pa + ((ya - y) / (ya - yb)) * (pb - pa);
      }
      return A.armpitY;
    };
    // The back has no V-neck, so it maps at one scale throughout; the front's
    // piecewise fit to the art's V would stretch the back number vertically
    // where it rises above the armpits.
    const torso = (x, y, back) => [A.centerX + (back ? -1 : 1) * (x - xc) * scale, back ? A.armpitY + (armpit - y) * scale : artY(y)];

    // Sleeve extents per side, in 1 cm rows, so a hanging, slightly splayed
    // arm still spans the art box from its outer to its inner side.
    const sleeve = { left: { rows: new Map(), top: -Infinity, bottom: Infinity }, right: { rows: new Map(), top: -Infinity, bottom: Infinity } };
    for (let i = 0; i < count; i++) {
      if (panel[i] !== 2) continue;
      const x = world[i * 3];
      const y = world[i * 3 + 1];
      const side = sleeve[x > xc ? 'left' : 'right'];
      side.top = Math.max(side.top, y);
      side.bottom = Math.min(side.bottom, y);
      const key = Math.round(y * 100);
      const row = side.rows.get(key) ?? { x0: Infinity, x1: -Infinity };
      row.x0 = Math.min(row.x0, x);
      row.x1 = Math.max(row.x1, x);
      side.rows.set(key, row);
    }
    const S = A.sleeves;
    const sleeveArt = (x, y, name) => {
      const side = sleeve[name];
      const row = side.rows.get(Math.round(y * 100)) ?? { x0: x, x1: x };
      const outer = name === 'left' ? row.x1 : row.x0;
      const inner = name === 'left' ? row.x0 : row.x1;
      const across = Math.abs(inner - outer) > 1e-4 ? (x - outer) / (inner - outer) : 0.5;
      const down = (side.top - y) / Math.max(1e-4, side.top - side.bottom);
      return [S[name].outerX + across * (S[name].innerX - S[name].outerX), S.top + down * (S.bottom - S.top)];
    };

    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = world[i * 3];
      const y = world[i * 3 + 1];
      const [ax, ay] = panel[i] === 2 ? sleeveArt(x, y, x > xc ? 'left' : 'right') : torso(x, y, panel[i] === 1);
      out[i * 3] = ax / A.width;
      out[i * 3 + 1] = ay / A.height;
      out[i * 3 + 2] = panel[i] === 1 ? 1 : 0;
    }
    return out;
  }

  // Shoulder (or cuff) numbers as flat decals. Each one is centered where the
  // style's art letters it, found as the jersey point that projects closest
  // to that art pixel (the front of the shoulder, or the cuff). Nearby
  // vertices get planar decal coordinates, shown where they face the same
  // way as the center, so the
  // number lies flat on the cloth and crosses the front/back UV seam on top
  // of the shoulder without a break. Digit tops point at the neck on the
  // shoulder and up on a cuff. Returns each decal's size in meters.
  placeTv(style) {
    const key = JSON.stringify(style.tv ?? []);
    if (key === this.tvKey) return this.tvSizes;
    this.tvKey = key;
    const jersey = this.parts.jersey;
    const R = this.jerseyRest;
    if (!jersey || !R) return (this.tvSizes = []);
    const { world, normals, art, neck } = R;
    const uv = jersey.geometry.attributes.uv;
    const attr = jersey.geometry.attributes.aTv;
    attr.array.fill(0);
    const count = world.length / 3;
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    const n0 = new THREE.Vector3();
    this.tvSizes = (style.tv ?? []).slice(0, 2).map((tv, side) => {
      const ax = tv.at[0] / JERSEY_ART.width;
      const ay = tv.at[1] / JERSEY_ART.height;
      const onSleeve = tv.at[0] < 205 || tv.at[0] > 1161; // art sleeve columns
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < count; i++) {
        const u = uv.getX(i);
        if ((u < 0.44) !== onSleeve || (!onSleeve && u >= 0.715)) continue; // sleeves, or the front panel
        const d = (art[i * 3] - ax) ** 2 + (art[i * 3 + 1] - ay) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) return 0;
      const c = new THREE.Vector3().fromArray(world, best * 3);
      // Average normal around the center.
      n0.set(0, 0, 0);
      for (let i = 0; i < count; i++) {
        if (p.fromArray(world, i * 3).distanceTo(c) < 0.03) n0.add(q.fromArray(normals, i * 3));
      }
      n0.normalize();
      const upHint = onSleeve ? new THREE.Vector3(0, 1, 0) : neck.clone().sub(c);
      const up = upHint.projectOnPlane(n0).normalize();
      const right = new THREE.Vector3().crossVectors(up, n0).normalize();
      const size = (tv.h / this.artScale) * 1.5; // the glyph is drawn 2/3 of the square
      for (let i = 0; i < count; i++) {
        p.fromArray(world, i * 3).sub(c);
        if (p.length() > size) continue;
        attr.array[i * 3] = p.dot(right) / size + 0.5;
        attr.array[i * 3 + 1] = 0.5 - p.dot(up) / size;
        // Coordinates stay valid past the cut, so a triangle across it
        // clips the glyph cleanly instead of smearing it.
        attr.array[i * 3 + 2] = q.fromArray(normals, i * 3).dot(n0) > 0.2 ? side + 1 : 0;
      }
      return size;
    });
    attr.needsUpdate = true;
    return this.tvSizes;
  }

  attachHelmet(helmet) {
    this.helmet = helmet;
    this.helmetParts = {};
    helmet.traverse((o) => {
      if (!o.isMesh) return;
      dequantize(o);
      o.castShadow = true;
      o.receiveShadow = true;
      this.helmetParts[o.material.name] = o;
    });

    const h = this.uniforms.shell;
    const stripe = h.uStripe;
    this.hm = {
      shell: extend(new THREE.MeshPhysicalMaterial({ name: 'shell' }), {
        uniforms: { ...stripe, ...Object.fromEntries(Object.entries(h).filter(([k]) => k !== 'uStripe')) },
        vertexWorld: true,
        declare: `${BANDS_GLSL}
          uniform sampler2D uDecal;
          uniform float uDecalOn;
          uniform vec3 uDecalArt;
          uniform vec2 uDecalSize;
          uniform vec2 uShellFront;
          uniform float uDecalFlip;
          uniform float uDecalMetal;
          float paintMask = 0.0;
          float decalMask = 0.0;
          ${HELMET_BACK_GLSL}`,
        // The decal art is a side view from the player's left: art x runs
        // from the shell's front toward its back, art y down from its top.
        fragment: /* glsl */ `
          {
            bool outer = dot(normalize(vObjNormal), normalize(vObjPos)) > 0.0;
            vec3 before = diffuseColor.rgb;
            if (outer) diffuseColor.rgb = applyBands(diffuseColor.rgb, vObjPos.x);
            paintMask = step(0.001, distance(before, diffuseColor.rgb));
            float side = sign(vObjPos.x);
            float facing = side * normalize(vObjNormal).x;
            if (outer && uDecalOn > 0.5 && facing > 0.2) {
              vec2 duv = vec2(
                (uDecalArt.x + (uShellFront.x - vObjPos.z) * uDecalArt.z) / uDecalSize.x,
                (uDecalArt.y + (uShellFront.y - vObjPos.y) * uDecalArt.z) / uDecalSize.y);
              if (side < 0.0 && uDecalFlip >= 0.0) duv.x = 2.0 * uDecalFlip - duv.x;
              if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) {
                vec4 d = texture2D(uDecal, duv);
                decalMask = d.a * smoothstep(0.2, 0.4, facing);
                diffuseColor.rgb = mix(diffuseColor.rgb, d.rgb, decalMask);
              }
            }
            if (outer) {
              vec4 back = helmetBack(vObjPos, vObjNormal);
              diffuseColor.rgb = diffuseColor.rgb * (1.0 - back.a) + back.rgb;
              paintMask = max(paintMask, back.a);
            }
          }
        `,
      }),
      mask: new THREE.MeshPhysicalMaterial({ name: 'mask', roughness: 0.3, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
      strap: new THREE.MeshStandardMaterial({ name: 'strap', roughness: 0.65 }),
      cup: new THREE.MeshPhysicalMaterial({ name: 'cup', roughness: 0.35, clearcoat: 0.5 }),
      bumper: extend(new THREE.MeshPhysicalMaterial({ name: 'bumper', roughness: 0.45 }), {
        uniforms: { uBack: h.uBack },
        vertexWorld: true,
        declare: HELMET_BACK_GLSL,
        fragment: /* glsl */ `
          vec4 back = helmetBack(vObjPos, vObjNormal);
          diffuseColor.rgb = diffuseColor.rgb * (1.0 - back.a) + back.rgb;
        `,
      }),
      trim: new THREE.MeshStandardMaterial({ name: 'trim', color: BRAND.black, roughness: 0.6 }),
      pads: new THREE.MeshStandardMaterial({ name: 'pads', color: '#1b1b1e', roughness: 0.9 }),
      hardware: new THREE.MeshStandardMaterial({ name: 'hardware', color: '#b8bbc1', metalness: 0.55, roughness: 0.35 }),
    };
    // Stripes read as paint; a chrome decal reads as polished metal.
    const shell = this.hm.shell;
    const base = shell.onBeforeCompile;
    shell.onBeforeCompile = (s) => {
      base(s);
      s.fragmentShader = s.fragmentShader
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor * (1.0 - paintMask), 1.0, decalMask * uDecalMetal);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, decalMask * uDecalMetal);');
    };
    // Where the shell's front and top are, for placing the side-view decal.
    const shellMesh = this.helmetParts.shell;
    if (shellMesh) {
      shellMesh.geometry.computeBoundingBox();
      const box = shellMesh.geometry.boundingBox;
      h.uShellFront.value.set(box.max.z, box.max.y);
    }
    for (const [name, mesh] of Object.entries(this.helmetParts)) if (this.hm[name]) mesh.material = this.hm[name];

    // Visor: a curved lens behind the top bar of the facemask.
    const visorGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.22, 40, 1, true, -0.62, 1.24);
    visorGeo.translate(0, -0.13, 0.08);
    this.visorMat = new THREE.MeshPhysicalMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.05 });
    this.visor = new THREE.Mesh(visorGeo, this.visorMat);
    helmet.add(this.visor);

    // Seat it where the bundled helmet sat, then let it ride on the head bone.
    const box = this.body.userData.helmetBox;
    const head = this.bones.Head;
    if (box) {
      const min = new THREE.Vector3(...box.min).applyMatrix4(this.body.matrixWorld);
      const max = new THREE.Vector3(...box.max).applyMatrix4(this.body.matrixWorld);
      const width = max.x - min.x;
      helmet.scale.setScalar(width * 1.03);
      helmet.position.set((min.x + max.x) / 2, (min.y + max.y) / 2 + 0.012, (min.z + max.z) / 2 - 0.035);
    } else {
      helmet.scale.setScalar(0.26);
      helmet.position.copy(head.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 0.1, 0));
    }
    this.root.add(helmet);
    this.root.updateMatrixWorld(true);
    head.attach(helmet);
    this.helmetWidth = helmet.getWorldScale(new THREE.Vector3()).x;
  }

  addProps() {
    // Towel tucked into the front of the belt on the player's left.
    const towelGeo = new THREE.PlaneGeometry(0.085, 0.22, 6, 14);
    const tp = towelGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i);
      const y = tp.getY(i);
      tp.setZ(i, 0.006 * Math.sin((x / 0.085) * Math.PI * 2 + y * 9) + (y < 0 ? y * y * 0.3 : 0));
    }
    towelGeo.translate(0, -0.11, 0);
    towelGeo.computeVertexNormals();
    this.towel = new THREE.Mesh(towelGeo, new THREE.MeshStandardMaterial({ color: '#f4f4f1', roughness: 0.95, side: THREE.DoubleSide }));
    this.towel.castShadow = true;
    const waist = this.waist ?? { y: 1.05, z: 0.13 };
    this.towel.position.set(0.085, waist.y + 0.01, waist.z - 0.012);
    this.towel.rotation.set(-0.12, -0.25, -0.03);
    this.root.add(this.towel);
    this.root.updateMatrixWorld(true);
    this.bones.Hips.attach(this.towel);

    // Ball, carried in the right hand for some poses.
    const prof = Array.from({ length: 25 }, (_, i) => {
      const y = -0.14 + (0.28 * i) / 24;
      return new THREE.Vector2(Math.max(0.003, 0.086 * Math.pow(Math.max(0, 1 - (y / 0.14) ** 2), 0.45)), y);
    });
    this.ball = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), new THREE.MeshStandardMaterial({ map: this.textures.ball, roughness: 0.6 }));
    this.ball.name = 'poseBall';
    this.ball.castShadow = true;
    this.ball.visible = false;
    const hand = this.bones.RightHand;
    hand.add(this.ball);
    // Hand space is in source units; undo the body scale so the ball is in meters.
    this.ball.scale.setScalar(1 / this.scale);
    this.ball.position.set(0, 0.09 / this.scale, 0.05 / this.scale);
    this.ball.rotation.set(0.2, 0, 0.25);
  }

  captureRest() {
    this.body.updateMatrixWorld(true);
    this.rest = {};
    const bodyQ = this.body.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const [name, bone] of Object.entries(this.bones)) {
      const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(bodyQ);
      this.rest[name] = { local: bone.quaternion.clone(), world, pos: bone.position.clone() };
    }
    this.restFeet = this.feetHeight();
  }

  feetHeight() {
    let min = Infinity;
    for (const n of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']) {
      const b = this.bones[n];
      if (b) min = Math.min(min, b.getWorldPosition(this.tmpV).y);
    }
    return min;
  }

  // ---------- dress the player ----------

  // `look` is a resolved combo (see resolveLook in combo.js): art file names,
  // the colors sampled from that art, and the player options.
  apply(look) {
    const m = this.m;
    const hm = this.hm;
    const u = this.uniforms;
    const j = look.jersey.spec;
    const p = look.pants.spec;
    const h = look.helmet.spec;
    const sheen = (c) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.2);

    m.jersey.color.set('#ffffff');
    m.jersey.sheenColor.copy(sheen(j.base));
    u.jersey.uBase.value.set(j.base);
    u.jersey.uCollar.value.set(j.trim);

    m.pants.color.set(p.base);
    m.pants.sheenColor.copy(sheen(p.base));
    setBands(u.pants, p.bands);
    u.pants.uBandEnd.value = p.bandEnd ?? 1;
    m.belt.color.set(BRAND.black);
    m.socks.color.set(look.socks);
    u.glove.uSock.value.set(look.socks);
    m.socks.sheenColor.copy(sheen(look.socks));
    m.cleats.color.set('#ffffff');
    u.shoe.uShoeBase.value.set(look.cleats);

    const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[2];
    m.skin.color.set(skin);
    m.skin.sheenColor.set(skin).lerp(new THREE.Color('#ff7a5c'), 0.3); // warm, like light through skin
    u.glove.uGlove.value.set(look.gloves ?? '#000000');
    u.glove.uGloveOn.value = look.gloves ? 1 : 0;
    if (this.parts.armSleeve) this.parts.armSleeve.material = m.skin; // no forearm under the sleeve mesh

    // Helmet.
    const finish = {
      // Glossy paint under a clear coat; a touch of coat roughness keeps the
      // HDRI's reflections soft rather than mirror-sharp.
      gloss: { metalness: 0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 },
      satin: { metalness: 0.1, roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.3 },
      matte: { metalness: 0, roughness: 0.78, clearcoat: 0, clearcoatRoughness: 1 },
    }[h.finish] ?? {};
    Object.assign(hm.shell, finish);
    hm.shell.color.set(h.shell);
    // Stripe widths are in meters; the shell shader works in helmet units.
    const w = this.helmetWidth || 0.25;
    setBands(u.shell.uStripe, h.stripe.map((b) => ({ ...b, at: b.at / w, w: b.w / w })));
    u.shell.uDecalArt.value.set(h.decalArt.frontX, h.decalArt.topY, h.decalArt.pxPerUnit);
    u.shell.uDecalSize.value.set(h.decalArt.width, h.decalArt.height);
    u.shell.uDecalMetal.value = h.decalMetal;
    hm.mask.color.set(look.facemask);
    const strap = look.facemask === BRAND.black ? BRAND.black : BRAND.white;
    hm.strap.color.set(strap);
    hm.cup.color.set(strap);
    hm.bumper.color.set(BRAND.black);

    const visor = {
      none: null,
      clear: { color: '#ffffff', opacity: 0.14, metalness: 0, iridescence: 0, clearcoat: 1 },
      smoke: { color: '#0d0d10', opacity: 0.85, metalness: 0.3, iridescence: 0, clearcoat: 1 },
      iridescent: { color: '#16161c', opacity: 0.88, metalness: 0.6, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 900], clearcoat: 1 },
    }[look.visor];
    this.visor.visible = Boolean(visor);
    if (visor) {
      const { color, ...rest } = visor;
      Object.assign(this.visorMat, rest);
      this.visorMat.color.set(color);
      this.visorMat.needsUpdate = true;
    }

    return this.paintArt(look);
  }

  // Draws the art for this look into the jersey, logo and decal canvases.
  // Images load once; a newer look that lands first wins.
  async paintArt(look) {
    const token = (this.artToken = (this.artToken ?? 0) + 1);
    const url = (file) => `assets/uni/${file}.webp`;
    const [jersey, logos, decal, shoe] = await Promise.all([
      loadImage(url(look.jersey.file)),
      loadImage(url(look.pants.spec.logos)),
      loadImage(url(look.helmet.spec.decal)),
      loadImage(url(look.shoes)),
    ]);
    if (token !== this.artToken) return;
    paint.paintJerseyFront(this.canvases.front, jersey, look.jersey.spec, look.jersey.style, look.number, look.jersey.sleeves);
    paint.paintJerseyBack(this.canvases.back, look.jersey.spec);
    paint.paintBackLettering(this.canvases.backLetters, look.jersey.spec, look.jersey.style, look.backNumber, look.name);
    this.placeTv(look.jersey.style);
    paint.paintTvDecals(this.canvases.tv, look.jersey.spec, look.jersey.style, look.number);
    paint.paintHelmetBack(this.canvases.helmetBack, HELMET_BACK, look.backNumber, look.helmet.spec.shell);
    const lc = this.canvases.logos.getContext('2d');
    lc.clearRect(0, 0, this.canvases.logos.width, this.canvases.logos.height);
    lc.drawImage(logos, 0, 0, this.canvases.logos.width, this.canvases.logos.height);
    const dc = this.canvases.decal.getContext('2d');
    dc.clearRect(0, 0, 752, 762);
    dc.drawImage(decal, 0, 0, 752, 762);
    // A script must read forward on the far side too: flip it about its own center.
    const sh = this.uniforms.shell;
    sh.uDecalFlip.value = look.helmet.spec.mirror ? -1 : paint.alphaCenterX(this.canvases.decal) / 752;
    sh.uDecalOn.value = 1;
    const shc = this.canvases.shoe.getContext('2d');
    shc.clearRect(0, 0, 702, 372);
    shc.drawImage(shoe, 0, 0, 702, 372);
    for (const k of ['front', 'back', 'backLetters', 'tv', 'helmetBack', 'logos', 'decal', 'shoe']) this.textures[k].needsUpdate = true;
  }

  // ---------- poses ----------

  // Every pose is an AnimationAction on one AnimationMixer: idle is the
  // model's own Mixamo clip, the others are baked from POSES into looping
  // clips. All actions keep playing; switching poses fades their weights.
  buildActions(idleClip) {
    this.mixer = new THREE.AnimationMixer(this.body);
    // The mixer animates this empty's height to lift the player off the turf.
    this.liftNode = new THREE.Object3D();
    this.liftNode.name = 'poseLift';
    this.body.add(this.liftNode);

    const clips = { idle: idleClip ?? new THREE.AnimationClip('idle', 0, []) };
    for (const name of Object.keys(POSES)) clips[name] = this.bakePose(name, clips.idle);
    this.actions = {};
    this.weights = {};
    for (const [name, clip] of Object.entries(clips)) {
      this.weights[name] = Number(name === 'idle');
      this.actions[name] = this.mixer.clipAction(clip).setEffectiveWeight(this.weights[name]).play();
    }
    this.pose = 'idle';
  }

  // Sample a POSES function over one loop into keyframe tracks. Bones the pose
  // leaves alone (fingers, collarbones, toes) hold the idle clip's first frame.
  bakePose(name, idleClip) {
    const duration = POSE_LOOPS[name];
    const steps = Math.max(2, Math.ceil(duration * POSE_FPS));
    const times = Array.from({ length: steps + 1 }, (_, i) => (i / steps) * duration);
    const frames = times.map((t) => POSES[name](t));
    const tracks = [];

    const driven = new Map();
    for (const [joint, target] of Object.entries(JOINT_BONES)) {
      if (!(joint in frames[0])) continue;
      const bones = (Array.isArray(target) ? target : [target]).filter((b) => this.bones[b]);
      for (const b of bones) driven.set(b, { joint, share: 1 / bones.length });
    }
    const q = new THREE.Quaternion();
    for (const [b, { joint, share }] of driven) {
      const values = [];
      const prev = new THREE.Quaternion();
      frames.forEach((f, i) => {
        this.poseQuat(b, f[joint].map((v) => v * share), q);
        // Keep neighbouring keys in the same hemisphere so slerp takes the short way.
        if (i > 0 && q.dot(prev) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        prev.copy(q);
        values.push(q.x, q.y, q.z, q.w);
      });
      tracks.push(new THREE.QuaternionKeyframeTrack(`${this.bones[b].name}.quaternion`, times, values));
    }

    for (const track of idleClip.tracks) {
      const [node, prop] = track.name.split('.');
      const bone = this.bones[node.replace(/^mixamorig_?/, '')];
      if (prop !== 'quaternion' || !bone || driven.has(node.replace(/^mixamorig_?/, ''))) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(track.name, [0], Array.from(track.values.slice(0, 4))));
    }

    // Procedural poses stand on the rest hips; idle keeps the clip's sway.
    tracks.push(new THREE.VectorKeyframeTrack(`${this.bones.Hips.name}.position`, [0], this.rest.Hips.pos.toArray()));
    tracks.push(new THREE.VectorKeyframeTrack('poseLift.position', times, frames.flatMap((f) => [0, f.lift ?? 0, 0])));
    tracks.push(new THREE.BooleanKeyframeTrack('poseBall.visible', [0], [Boolean(frames[0].ball)]));
    return new THREE.AnimationClip(name, duration, tracks);
  }

  // Fade toward `name`. Weights ramp from wherever they are, so picking a new
  // pose mid-fade never snaps.
  setPose(name) {
    if (this.actions[name]) this.pose = name;
  }

  // Local rotation for a bone given a delta in character axes, applied on
  // top of the rest pose: local = inv(restWorld(parent)) * delta * restWorld(bone).
  poseQuat(name, euler, out) {
    const r = this.rest[name];
    const parent = this.bones[name].parent;
    const parentRest = this.rest[parent?.name?.replace(/^mixamorig_?/, '')]?.world ?? new THREE.Quaternion();
    const delta = this.tmpQ.setFromEuler(new THREE.Euler(euler[0], euler[1], euler[2], 'XYZ'));
    return out.copy(parentRest).invert().multiply(delta).multiply(r.world);
  }

  // A subtle procedural sway on top of the idle clip: the spine leans a
  // degree side to side and the chest breathes, on slow, unrelated periods
  // so it never looks like a loop. The mixer rewrites these bones every
  // frame, so the offset is added after it and never accumulates.
  idleSway(dt, weight) {
    this.swayT = (this.swayT ?? 0) + dt;
    if (weight <= 0.001) return;
    const t = this.swayT;
    const lean = Math.sin((t * Math.PI * 2) / 4.3) * 0.018 * weight;
    const breathe = Math.sin((t * Math.PI * 2) / 3.1) * 0.012 * weight;
    const turn = Math.sin((t * Math.PI * 2) / 6.7 + 1.3) * 0.015 * weight;
    const e = new THREE.Euler();
    const q = this.tmpQ;
    if (this.bones.Spine) this.bones.Spine.quaternion.multiply(q.setFromEuler(e.set(0, turn, lean)));
    if (this.bones.Spine1) this.bones.Spine1.quaternion.multiply(q.setFromEuler(e.set(breathe, 0, lean * 0.5)));
  }

  // `hold` freezes each pose on its current frame (reduced motion) while
  // still letting a pose change fade through.
  update(dt, hold = false) {
    const step = dt / POSE_FADE;
    let total = 0;
    for (const name of Object.keys(this.actions)) {
      const target = name === this.pose ? 1 : 0;
      const w = this.weights[name] + Math.max(-step, Math.min(step, target - this.weights[name]));
      this.weights[name] = w;
      total += w;
    }
    // Normalize so the blend always sums to one full pose.
    for (const [name, action] of Object.entries(this.actions)) {
      action.paused = hold;
      action.setEffectiveWeight(total > 0 ? this.weights[name] / total : Number(name === this.pose));
    }
    this.mixer.update(dt);
    if (!hold) this.idleSway(dt, total > 0 ? this.weights.idle / total : 0);

    // Keep the lowest foot on the turf.
    this.root.position.y = 0;
    this.root.updateMatrixWorld(true);
    this.root.position.y = this.restFeet - this.feetHeight() + this.liftNode.position.y;
  }
}

const POSE_FADE = 0.25; // seconds to cross-fade between poses
const POSE_FPS = 30; // keyframes per second when baking POSES into clips

// Which bones each pose joint drives. Spine bends are shared across three bones.
const JOINT_BONES = {
  pelvis: 'Hips',
  spine: ['Spine', 'Spine1', 'Spine2'],
  neck: 'Neck',
  head: 'Head',
  shoulderL: 'LeftArm', shoulderR: 'RightArm',
  elbowL: 'LeftForeArm', elbowR: 'RightForeArm',
  wristL: 'LeftHand', wristR: 'RightHand',
  hipL: 'LeftUpLeg', hipR: 'RightUpLeg',
  kneeL: 'LeftLeg', kneeR: 'RightLeg',
  ankleL: 'LeftFoot', ankleR: 'RightFoot',
};

// Each pose returns rotations [x, y, z] in character axes, relative to the
// rest pose. Negative x swings a limb forward; positive x bends a knee back.
// The player's left side is +x.
export const POSES = {
  ready(t) {
    const b = Math.sin(t * 2.4) * 0.012;
    return {
      pelvis: [0.25, 0, 0],
      spine: [0.32 + b, 0, 0],
      neck: [-0.3, 0, 0],
      head: [-0.15, 0, 0],
      shoulderL: [-0.55, 0, 0.12], shoulderR: [-0.55, 0, -0.12],
      elbowL: [-0.9, 0, 0], elbowR: [-0.9, 0, 0],
      hipL: [-0.95, 0.12, 0.14], hipR: [-0.95, -0.12, -0.14],
      kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0],
      ankleL: [-0.3, 0, -0.14], ankleR: [-0.3, 0, 0.14],
    };
  },
  run(t) {
    const p = t * 9;
    const s = Math.sin(p);
    const c = Math.cos(p);
    const leg = (sg) => {
      const hip = -0.35 - 0.75 * s * sg;
      const knee = 0.35 + 1.15 * Math.max(0, c * sg);
      return { hip, knee, ankle: -(0.12 + hip + knee) * 0.6 };
    };
    const L = leg(1);
    const R = leg(-1);
    return {
      pelvis: [0.12, s * 0.1, 0],
      spine: [0.16, -s * 0.16, 0],
      neck: [-0.22, s * 0.1, 0],
      shoulderL: [0.75 * s, 0, 0.08], elbowL: [-1.45, 0, 0],
      shoulderR: [-0.3 + 0.1 * s, 0.55, -0.05], elbowR: [-1.9, 0, 0], wristR: [0.1, 0, 0],
      hipL: [L.hip, 0, 0.03], kneeL: [L.knee, 0, 0], ankleL: [L.ankle, 0, -0.03],
      hipR: [R.hip, 0, -0.03], kneeR: [R.knee, 0, 0], ankleR: [R.ankle, 0, 0.03],
      lift: Math.abs(s) * 0.045,
      ball: true,
    };
  },
  celebrate(t) {
    const p = t * 4.2;
    const j = Math.max(0, Math.sin(p));
    return {
      pelvis: [-0.04, 0, 0],
      spine: [-0.12, 0, 0],
      neck: [-0.2, 0, 0],
      head: [-0.12, 0, 0],
      shoulderL: [-0.2, 0, 2.4 + 0.12 * Math.sin(p)], shoulderR: [-0.2, 0, -2.4 - 0.12 * Math.sin(p)],
      elbowL: [-0.35, 0, 0], elbowR: [-0.35, 0, 0],
      hipL: [-0.2 * (1 - j), 0.1, 0.06], hipR: [-0.2 * (1 - j), -0.1, -0.06],
      kneeL: [0.4 * (1 - j), 0, 0], kneeR: [0.4 * (1 - j), 0, 0],
      ankleL: [-0.2 * (1 - j) + 0.2 * j, 0, -0.06], ankleR: [-0.2 * (1 - j) + 0.2 * j, 0, 0.06],
      lift: j * 0.11,
    };
  },
  heisman(t) {
    const b = Math.sin(t * 1.4) * 0.01;
    return {
      pelvis: [0, 0.3, 0],
      spine: [0.06 + b, 0.18, 0],
      neck: [0, -0.25, 0],
      head: [0, -0.15, 0],
      shoulderL: [-1.45, 0, 0.05], elbowL: [-0.06, 0, 0], wristL: [-1.0, 0, 0],
      shoulderR: [-0.3, 0.3, -0.2], elbowR: [-1.9, 0, 0], wristR: [0.15, 0, 0],
      hipL: [-1.35, 0, 0.12], kneeL: [1.75, 0, 0], ankleL: [-0.35, 0, -0.1],
      hipR: [0.08, -0.1, -0.06], kneeR: [0.12, 0, 0], ankleR: [-0.2, 0, 0.06],
      ball: true,
    };
  },
};

// One loop of each pose, in seconds: the period of its motion in POSES.
const POSE_LOOPS = {
  ready: (2 * Math.PI) / 2.4,
  run: (2 * Math.PI) / 9,
  celebrate: (2 * Math.PI) / 4.2,
  heisman: (2 * Math.PI) / 1.4,
};
