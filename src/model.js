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
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const tex = (canvas, flipY = false) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = flipY;
      t.anisotropy = aniso;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    };
    // Art canvases: jersey front and back at half the art's size, the hip
    // logos, the helmet decal and the ball.
    this.canvases = {
      front: C(JERSEY_ART.width / 2, JERSEY_ART.height / 2),
      back: C(JERSEY_ART.width / 2, JERSEY_ART.height / 2),
      logos: C(PANTS_ART.width / 2, PANTS_ART.height / 2),
      shoe: C(702, 372),
      decal: C(752, 762),
      ball: C(512, 256),
    };
    this.textures = Object.fromEntries(Object.entries(this.canvases).map(([k, c]) => [k, tex(c, k === 'ball')]));
    const normals = {
      knit: paint.fabricNormal('knit'), twill: paint.fabricNormal('twill'),
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
    this.uniforms = {
      pants: { ...pantsU, uLogos: { value: this.textures.logos }, uBandEnd: { value: 1 } },
      jersey: {
        uArtFront: { value: this.textures.front },
        uArtBack: { value: this.textures.back },
        uBase: { value: new THREE.Color() },
        uCollar: { value: new THREE.Color() },
        uCollarW: { value: 0.012 },
      },
      glove: { uGlove: { value: new THREE.Color() }, uGloveOn: { value: 1 } },
      shoe: { uShoe: { value: this.textures.shoe }, uShoeBase: { value: new THREE.Color() } },
      shell: {
        uStripe: bandUniforms(),
        uDecal: { value: this.textures.decal },
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
      jersey: extend(fabric({ name: 'jersey', normalMap: ntex(normals.knit, 70, 28), normalScale: new THREE.Vector2(0.3, 0.3) }), {
        attrs: { aArt: 'vec3', aNeck: 'float' },
        uniforms: this.uniforms.jersey,
        declare: 'uniform sampler2D uArtFront;\nuniform sampler2D uArtBack;\nuniform vec3 uBase;\nuniform vec3 uCollar;\nuniform float uCollarW;',
        fragment: /* glsl */ `
          vec4 art = vaArt.z < 0.5 ? texture2D(uArtFront, vaArt.xy) : texture2D(uArtBack, vaArt.xy);
          diffuseColor.rgb = mix(uBase, art.rgb, art.a);
          float cfw = max(fwidth(vaNeck), 1e-4);
          diffuseColor.rgb = mix(diffuseColor.rgb, uCollar, 1.0 - smoothstep(uCollarW - cfw, uCollarW + cfw, vaNeck));
        `,
      }),
      pants: extend(fabric({ name: 'pants', roughness: 0.6, sheen: 0.3, normalMap: ntex(normals.twill, 60, 60), normalScale: new THREE.Vector2(0.06, 0.06) }), {
        attrs: { aSeam: 'float', aLogo: 'vec3', aDown: 'float' },
        uniforms: this.uniforms.pants,
        declare: `${BANDS_GLSL}\nuniform sampler2D uLogos;\nuniform float uBandEnd;`,
        // Side panels stop partway down the leg, cut at an angle like the art.
        fragment: /* glsl */ `
          float bandEnd = uBandEnd - vaSeam * 1.2;
          float bfw = max(fwidth(vaDown), 1e-4);
          diffuseColor.rgb = mix(diffuseColor.rgb, applyBands(diffuseColor.rgb, vaSeam), 1.0 - smoothstep(bandEnd - bfw, bandEnd + bfw, vaDown));
          if (vaLogo.z > 0.5 && vaLogo.x > 0.0 && vaLogo.x < 1.0 && vaLogo.y > 0.0 && vaLogo.y < 1.0) {
            vec4 logo = texture2D(uLogos, vaLogo.xy);
            diffuseColor.rgb = mix(diffuseColor.rgb, logo.rgb, logo.a);
          }
        `,
      }),
      socks: fabric({ name: 'socks', roughness: 0.9, sheen: 0.3 }),
      cleats: extend(new THREE.MeshPhysicalMaterial({ name: 'cleats', roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4 }), {
        attrs: { aShoe: 'vec2' },
        uniforms: this.uniforms.shoe,
        declare: 'uniform sampler2D uShoe;\nuniform vec3 uShoeBase;',
        fragment: /* glsl */ `
          vec4 shoe = texture2D(uShoe, vaShoe);
          diffuseColor.rgb = mix(uShoeBase, shoe.rgb, shoe.a);
        `,
      }),
      skin: extend(new THREE.MeshPhysicalMaterial({ name: 'skin', roughness: 0.55, sheen: 0.25, sheenRoughness: 0.8 }), {
        attrs: { aGlove: 'float' },
        uniforms: this.uniforms.glove,
        declare: 'uniform vec3 uGlove;\nuniform float uGloveOn;',
        fragment: 'diffuseColor.rgb = mix(diffuseColor.rgb, uGlove, uGloveOn * smoothstep(0.3, 0.6, vaGlove));',
      }),
      belt: new THREE.MeshStandardMaterial({ name: 'belt', roughness: 0.55 }),
      buckle: new THREE.MeshStandardMaterial({ name: 'buckle', color: '#c9ccd1', metalness: 0.9, roughness: 0.3 }),
      tape: new THREE.MeshStandardMaterial({ name: 'tape', color: '#f4f4f2', roughness: 0.85 }),
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
      jersey.geometry.setAttribute('aArt', new THREE.BufferAttribute(this.projectJersey(jersey, world, neckEdge, bonePos), 3));
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
    const torso = (x, y, back) => [A.centerX + (back ? -1 : 1) * (x - xc) * scale, artY(y)];

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
          float decalMask = 0.0;`,
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
    m.belt.color.set(p.base === '#000000' ? '#0b0b0c' : '#111113');
    m.socks.color.set(look.socks);
    m.socks.sheenColor.copy(sheen(look.socks));
    m.cleats.color.set('#ffffff');
    u.shoe.uShoeBase.value.set(look.cleats);

    const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[2];
    m.skin.color.set(skin);
    m.skin.sheenColor.set(skin);
    u.glove.uGlove.value.set(look.gloves ?? '#000000');
    u.glove.uGloveOn.value = look.gloves ? 1 : 0;
    if (this.parts.armSleeve) this.parts.armSleeve.material = m.skin; // no forearm under the sleeve mesh

    // Helmet.
    const finish = {
      gloss: { metalness: 0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 },
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
    const strap = look.facemask === '#000000' ? '#111113' : '#f2f2f0';
    hm.strap.color.set(strap);
    hm.cup.color.set(strap);
    hm.bumper.color.set('#111113');

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
    paint.paintJerseyFront(this.canvases.front, jersey, look.jersey.spec, look.jersey.style, look.number);
    paint.paintJerseyBack(this.canvases.back, look.jersey.spec, look.jersey.style, look.number, look.name);
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
    for (const k of ['front', 'back', 'logos', 'decal', 'shoe']) this.textures[k].needsUpdate = true;
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
