// The rigged player (assets/player.glb) wearing the helmet (assets/helmet.glb).
// Uniform parts are recolored through their materials. Stripes, collars,
// gloves and soles are drawn by small shader additions that read per-vertex
// measurements taken once in the rest pose, so they follow the cloth when the
// player moves. Jersey lettering is painted into a canvas on the jersey UVs.
import * as THREE from './three.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { hex } from './combo.js';
import { SKIN_TONES } from './team.js';
import * as paint from './textures.js';

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
  const load = (url) => loader.loadAsync(url, (e) => {
    progress[url] = { loaded: e.loaded, total: e.total };
    report();
  });
  const [player, helmet] = await Promise.all([load('assets/player.glb'), load('assets/helmet.glb')]);
  return { player, helmet };
}

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

// Wires a per-vertex attribute into a material and lets `fragment` adjust
// diffuseColor after the base map is applied.
function extend(material, { attrs = {}, uniforms = {}, declare = '', fragment = '', vertexWorld = false }) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const attrDecl = Object.entries(attrs).map(([n, t]) => `attribute ${t} ${n};\nvarying ${t} v${n};`).join('\n');
    const attrCopy = Object.keys(attrs).map((n) => `v${n} = ${n};`).join('\n');
    const varyDecl = Object.entries(attrs).map(([n, t]) => `varying ${t} v${n};`).join('\n');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${attrDecl}${vertexWorld ? '\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${attrCopy}${vertexWorld ? '\nvObjPos = position;\nvObjNormal = normal;' : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${varyDecl}${vertexWorld ? '\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;' : ''}\n${declare}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${fragment}`);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => `${material.name}-ext`;
  return material;
}

// ---------- geometry measurements (rest pose, world meters) ----------

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
    this.decalImage = null;
    this.pose = { current: 'idle', previous: 'idle', switchedAt: -10 };
    this.tmpV = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();

    this.fitBody();
    this.collect();
    this.buildMaterials();
    this.measure();
    this.attachHelmet(assets.helmet.scene);
    this.addProps();
    this.captureRest();

    this.mixer = new THREE.AnimationMixer(this.body);
    const clip = assets.player.animations[0];
    if (clip) this.mixer.clipAction(clip).play();
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
    this.canvases = { jersey: C(2560, 1024), decal: C(512, 512), ball: C(512, 256) };
    const tex = (canvas, flipY = false) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = flipY;
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      return t;
    };
    this.textures = { jersey: tex(this.canvases.jersey), decal: tex(this.canvases.decal), ball: tex(this.canvases.ball, true) };
    this.textures.decal.wrapS = THREE.ClampToEdgeWrapping;
    const normals = {
      knit: paint.fabricNormal('knit'), twill: paint.fabricNormal('twill'), rib: paint.fabricNormal('rib'),
    };
    const ntex = (canvas, rx, ry) => {
      const t = new THREE.CanvasTexture(canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.flipY = false;
      return t;
    };

    const fabric = (extra) => new THREE.MeshPhysicalMaterial({ roughness: 0.82, sheen: 0.45, sheenRoughness: 0.6, ...extra });
    const pantsU = bandUniforms();
    const sockU = bandUniforms();
    this.uniforms = {
      pants: pantsU,
      socks: sockU,
      collar: { uCollar: { value: new THREE.Color() }, uCollarW: { value: 0.026 } },
      glove: { uGlove: { value: new THREE.Color() }, uGloveOn: { value: 1 } },
      sole: { uSole: { value: new THREE.Color() } },
      shell: {
        uStripe: bandUniforms(),
        uDecal: { value: this.textures.decal },
        uDecalOn: { value: 1 },
        uDecalMirror: { value: 0 },
        uDecalCenter: { value: new THREE.Vector2(-0.06, 0.07) },
        uDecalSize: { value: 0.46 },
      },
    };

    this.m = {
      jersey: extend(fabric({ name: 'jersey', map: this.textures.jersey, normalMap: ntex(normals.knit, 70, 28), normalScale: new THREE.Vector2(0.45, 0.45) }), {
        attrs: { aNeck: 'float' },
        uniforms: this.uniforms.collar,
        declare: 'uniform vec3 uCollar;\nuniform float uCollarW;',
        fragment: /* glsl */ `
          float cfw = max(fwidth(vaNeck), 1e-4);
          diffuseColor.rgb = mix(diffuseColor.rgb, uCollar, 1.0 - smoothstep(uCollarW - cfw, uCollarW + cfw, vaNeck));
        `,
      }),
      pants: extend(fabric({ name: 'pants', roughness: 0.55, sheen: 0.3, normalMap: ntex(normals.twill, 30, 30), normalScale: new THREE.Vector2(0.25, 0.25) }), {
        attrs: { aSeam: 'float' },
        uniforms: pantsU,
        declare: BANDS_GLSL,
        fragment: 'diffuseColor.rgb = applyBands(diffuseColor.rgb, vaSeam);',
      }),
      socks: extend(fabric({ name: 'socks', roughness: 0.9, normalMap: ntex(normals.rib, 18, 6), normalScale: new THREE.Vector2(0.5, 0.5) }), {
        attrs: { aDrop: 'float' },
        uniforms: sockU,
        declare: BANDS_GLSL,
        fragment: 'diffuseColor.rgb = applyBands(diffuseColor.rgb, vaDrop);',
      }),
      cleats: extend(new THREE.MeshPhysicalMaterial({ name: 'cleats', roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.35 }), {
        attrs: { aHeight: 'float' },
        uniforms: this.uniforms.sole,
        declare: 'uniform vec3 uSole;',
        fragment: 'diffuseColor.rgb = mix(diffuseColor.rgb, uSole, 1.0 - smoothstep(0.018, 0.026, vaHeight));',
      }),
      skin: extend(new THREE.MeshPhysicalMaterial({ name: 'skin', roughness: 0.55, sheen: 0.25, sheenRoughness: 0.8 }), {
        attrs: { aGlove: 'float' },
        uniforms: this.uniforms.glove,
        declare: 'uniform vec3 uGlove;\nuniform float uGloveOn;',
        fragment: 'diffuseColor.rgb = mix(diffuseColor.rgb, uGlove, uGloveOn * smoothstep(0.3, 0.6, vaGlove));',
      }),
      belt: new THREE.MeshStandardMaterial({ name: 'belt', roughness: 0.55 }),
      buckle: new THREE.MeshStandardMaterial({ name: 'buckle', color: '#c9ccd1', metalness: 0.9, roughness: 0.3 }),
      tape: new THREE.MeshStandardMaterial({ name: 'tape', roughness: 0.85 }),
      armSleeve: fabric({ name: 'armSleeve', roughness: 0.5, sheen: 0.3 }),
      eyes: new THREE.MeshPhysicalMaterial({ name: 'eyes', color: '#1a1410', roughness: 0.15, clearcoat: 1 }),
    };
    for (const [name, mesh] of Object.entries(this.parts)) {
      if (this.m[name]) mesh.material = this.m[name];
    }
    paint.paintBall(this.canvases.ball);
    this.textures.ball.needsUpdate = true;
  }

  // Per-vertex measurements in the rest pose, in meters.
  measure() {
    this.body.updateMatrixWorld(true);
    for (const mesh of Object.values(this.parts)) mesh.skeleton?.update();
    const bonePos = (n) => this.bones[n].getWorldPosition(new THREE.Vector3());
    const setAttr = (mesh, name, data) => mesh.geometry.setAttribute(name, new THREE.BufferAttribute(data, 1));

    // Jersey: distance from the neckline, for the collar trim.
    const jersey = this.parts.jersey;
    if (jersey) {
      const world = worldPositions(jersey);
      const neck = bonePos('Neck');
      const shoulderY = bonePos('LeftArm').y;
      const neckEdge = boundaryPoints(jersey, world)
        .filter((p) => p.y > shoulderY - 0.22 && Math.abs(p.x - neck.x) < 0.1 && Math.hypot(p.x - neck.x, p.z - neck.z) < 0.14);
      const aNeck = new Float32Array(world.length / 3);
      for (let i = 0; i < aNeck.length; i++) aNeck[i] = neckEdge.length ? nearestDistance(world, i, neckEdge) : 9;
      setAttr(jersey, 'aNeck', aNeck);
    }

    // Pants: signed arc distance from the outer seam of each leg.
    const pants = this.parts.pants;
    if (pants) {
      const world = worldPositions(pants);
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
    }

    // Socks: distance down from the top of each sock.
    const socks = this.parts.socks;
    if (socks) {
      const world = worldPositions(socks);
      const midX = bonePos('Hips').x;
      let topL = -Infinity;
      let topR = -Infinity;
      for (let i = 0; i < world.length / 3; i++) {
        if (world[i * 3] > midX) topL = Math.max(topL, world[i * 3 + 1]);
        else topR = Math.max(topR, world[i * 3 + 1]);
      }
      const aDrop = new Float32Array(world.length / 3);
      for (let i = 0; i < aDrop.length; i++) aDrop[i] = (world[i * 3] > midX ? topL : topR) - world[i * 3 + 1];
      setAttr(socks, 'aDrop', aDrop);
    }

    // Cleats: height above the lowest point, for the sole color.
    const cleats = this.parts.cleats;
    if (cleats) {
      const world = worldPositions(cleats);
      let ground = Infinity;
      for (let i = 1; i < world.length; i += 3) ground = Math.min(ground, world[i]);
      const aHeight = new Float32Array(world.length / 3);
      for (let i = 0; i < aHeight.length; i++) aHeight[i] = world[i * 3 + 1] - ground;
      setAttr(cleats, 'aHeight', aHeight);
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
        uniforms: { ...stripe, uDecal: h.uDecal, uDecalOn: h.uDecalOn, uDecalMirror: h.uDecalMirror, uDecalCenter: h.uDecalCenter, uDecalSize: h.uDecalSize },
        vertexWorld: true,
        declare: `${BANDS_GLSL}
          uniform sampler2D uDecal;
          uniform float uDecalOn;
          uniform float uDecalMirror;
          uniform vec2 uDecalCenter;
          uniform float uDecalSize;
          float paintMask = 0.0;`,
        fragment: /* glsl */ `
          {
            bool outer = dot(normalize(vObjNormal), normalize(vObjPos)) > 0.0;
            vec3 before = diffuseColor.rgb;
            if (outer) diffuseColor.rgb = applyBands(diffuseColor.rgb, vObjPos.x);
            float side = sign(vObjPos.x);
            float facing = side * normalize(vObjNormal).x;
            if (outer && uDecalOn > 0.5 && facing > 0.3) {
              float flip = (side < 0.0 && uDecalMirror < 0.5) ? 1.0 : -1.0;
              vec2 duv = vec2(0.5 + flip * (vObjPos.z - uDecalCenter.x) / uDecalSize, 0.5 - (vObjPos.y - uDecalCenter.y) / uDecalSize);
              if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) {
                vec4 d = texture2D(uDecal, duv);
                diffuseColor.rgb = mix(diffuseColor.rgb, d.rgb, d.a * smoothstep(0.3, 0.45, facing));
              }
            }
            paintMask = step(0.001, distance(before, diffuseColor.rgb));
          }
        `,
      }),
      mask: new THREE.MeshPhysicalMaterial({ name: 'mask', roughness: 0.3, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
      strap: new THREE.MeshStandardMaterial({ name: 'strap', roughness: 0.65 }),
      cup: new THREE.MeshPhysicalMaterial({ name: 'cup', roughness: 0.35, clearcoat: 0.5 }),
      bumper: new THREE.MeshStandardMaterial({ name: 'bumper', roughness: 0.45 }),
      trim: new THREE.MeshStandardMaterial({ name: 'trim', color: '#141416', roughness: 0.6 }),
      pads: new THREE.MeshStandardMaterial({ name: 'pads', color: '#1b1b1e', roughness: 0.9 }),
      hardware: new THREE.MeshStandardMaterial({ name: 'hardware', color: '#b8bbc1', metalness: 0.55, roughness: 0.35 }),
    };
    // Paint on a chrome shell reads as paint, not metal.
    const shell = this.hm.shell;
    const base = shell.onBeforeCompile;
    shell.onBeforeCompile = (s) => {
      base(s);
      s.fragmentShader = s.fragmentShader.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - paintMask;');
    };
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
    // Towel tucked into the front of the belt on the player's right.
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
    this.towel.position.set(-0.085, waist.y + 0.01, waist.z - 0.012);
    this.towel.rotation.set(-0.12, 0.25, 0.03);
    this.root.add(this.towel);
    this.root.updateMatrixWorld(true);
    this.bones.Hips.attach(this.towel);

    // Ball, carried in the right hand for some poses.
    const prof = Array.from({ length: 25 }, (_, i) => {
      const y = -0.14 + (0.28 * i) / 24;
      return new THREE.Vector2(Math.max(0.003, 0.086 * Math.pow(Math.max(0, 1 - (y / 0.14) ** 2), 0.45)), y);
    });
    this.ball = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), new THREE.MeshStandardMaterial({ map: this.textures.ball, roughness: 0.6 }));
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

  // ---------- apply a combo ----------

  setDecalImage(image) {
    this.decalImage = image;
  }

  apply(combo) {
    const h = combo.helmet;
    const j = combo.jersey;
    const p = combo.pants;
    const m = this.m;
    const hm = this.hm;
    const u = this.uniforms;

    paint.paintJersey(this.canvases.jersey, combo);
    this.textures.jersey.needsUpdate = true;
    paint.paintDecal(this.canvases.decal, combo, h.decal === 'custom' ? this.decalImage : null);
    this.textures.decal.needsUpdate = true;

    const sheen = (c) => new THREE.Color(hex(c)).lerp(new THREE.Color('#ffffff'), 0.2);
    m.jersey.color.set('#ffffff');
    m.jersey.sheenColor.copy(sheen(j.base));
    u.collar.uCollar.value.set(hex(j.collar));

    m.pants.color.set(hex(p.base));
    m.pants.sheenColor.copy(sheen(p.base));
    setBands(u.pants, paint.stripeBands(p.stripe, hex(p.stripeColor), hex(p.stripeTrim)));
    m.belt.color.set(hex(p.belt));

    m.socks.color.set(hex(combo.socks.base));
    m.socks.sheenColor.copy(sheen(combo.socks.base));
    const sockBands = combo.socks.stripe === 'single'
      ? [{ at: 0.075, w: 0.03 }]
      : combo.socks.stripe === 'double' ? [{ at: 0.062, w: 0.015 }, { at: 0.092, w: 0.015 }] : [];
    setBands(u.socks, sockBands.map((b) => ({ ...b, color: hex(combo.socks.stripeColor) })));

    m.cleats.color.set(hex(combo.cleats.base));
    u.sole.uSole.value.set(hex(combo.cleats.sole));

    const skin = SKIN_TONES[combo.extras.skin] ?? SKIN_TONES[2];
    m.skin.color.set(skin);
    m.skin.sheenColor.set(skin);
    u.glove.uGlove.value.set(hex(combo.extras.gloves));
    u.glove.uGloveOn.value = combo.extras.gloves === 'none' ? 0 : 1;
    m.tape.color.set(hex(combo.extras.tape));
    // The body has no forearm under the sleeve, so "none" dresses it as skin.
    const sleeve = combo.extras.armSleeves;
    if (this.parts.armSleeve) this.parts.armSleeve.material = sleeve === 'none' ? m.skin : m.armSleeve;
    if (sleeve !== 'none') m.armSleeve.color.set(hex(sleeve));
    this.towel.visible = combo.extras.towel;

    // Helmet.
    const finish = {
      gloss: { metalness: 0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 },
      satin: { metalness: 0.15, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3 },
      matte: { metalness: 0, roughness: 0.75, clearcoat: 0, clearcoatRoughness: 1 },
      chrome: { metalness: 1, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 },
    }[h.finish] ?? {};
    Object.assign(hm.shell, finish);
    hm.shell.color.set(hex(h.shell));
    // Stripe widths are authored in meters; the shell shader works in helmet units.
    const w = this.helmetWidth || 0.25;
    setBands(u.shell.uStripe, paint.stripeBands(h.stripe, hex(h.stripeColor), hex(h.stripeTrim)).map((b) => ({ ...b, at: b.at / w, w: b.w / w })));
    u.shell.uDecalOn.value = h.decal === 'none' || (h.decal === 'custom' && !this.decalImage) ? 0 : 1;
    u.shell.uDecalMirror.value = h.decal === 'custom' ? 1 : 0;
    hm.mask.color.set(hex(h.mask));
    hm.strap.color.set(hex(h.strap));
    hm.cup.color.set(hex(h.strap));
    hm.bumper.color.set(hex(h.bumper));

    const visor = {
      none: null,
      clear: { color: '#ffffff', opacity: 0.14, metalness: 0, iridescence: 0, clearcoat: 1 },
      smoke: { color: '#0d0d10', opacity: 0.85, metalness: 0.3, iridescence: 0, clearcoat: 1 },
      iridescent: { color: '#16161c', opacity: 0.88, metalness: 0.6, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 900], clearcoat: 1 },
    }[h.visor];
    this.visor.visible = Boolean(visor);
    if (visor) {
      const { color, ...rest } = visor;
      Object.assign(this.visorMat, rest);
      this.visorMat.color.set(color);
      this.visorMat.needsUpdate = true;
    }
  }

  // ---------- poses ----------

  setPose(name, time) {
    if (name === this.pose.current) return;
    this.pose.previous = this.pose.current;
    this.pose.current = name;
    this.pose.switchedAt = time;
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

  sample(name, time) {
    if (name === 'idle') return null; // the animation clip drives idle
    const raw = POSES[name](time);
    const out = new Map();
    for (const [joint, euler] of Object.entries(raw)) {
      const target = JOINT_BONES[joint];
      if (!target) continue;
      const bones = Array.isArray(target) ? target : [target];
      const share = 1 / bones.length;
      for (const b of bones) {
        if (!this.bones[b]) continue;
        out.set(b, this.poseQuat(b, euler.map((v) => v * share), new THREE.Quaternion()));
      }
    }
    out.lift = raw.lift ?? 0;
    out.ball = Boolean(raw.ball);
    return out;
  }

  update(time, dt) {
    this.mixer.update(dt);
    const w = Math.min(1, (time - this.pose.switchedAt) / 0.6);
    const ease = w * w * (3 - 2 * w);
    const a = this.sample(this.pose.previous, time);
    const b = this.sample(this.pose.current, time);
    const hips = this.bones.Hips;
    const clipHips = hips.position.clone();

    const names = new Set([...(a?.keys() ?? []), ...(b?.keys() ?? [])]);
    for (const n of names) {
      const bone = this.bones[n];
      const clipQ = bone.quaternion.clone();
      const qa = a?.get(n) ?? (a ? this.rest[n].local : clipQ);
      const qb = b?.get(n) ?? (b ? this.rest[n].local : clipQ);
      bone.quaternion.copy(qa).slerp(qb, ease);
    }
    // Procedural poses stand on the rest hips; idle keeps the clip's sway.
    const posA = a ? this.rest.Hips.pos : clipHips;
    const posB = b ? this.rest.Hips.pos : clipHips;
    hips.position.lerpVectors(posA, posB, ease);

    const lift = (a?.lift ?? 0) + ((b?.lift ?? 0) - (a?.lift ?? 0)) * ease;
    this.ball.visible = ease > 0.5 ? Boolean(b?.ball) : Boolean(a?.ball);

    // Keep the lowest foot on the turf.
    this.root.position.y = 0;
    this.root.updateMatrixWorld(true);
    this.root.position.y = this.restFeet - this.feetHeight() + lift;
  }
}

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
