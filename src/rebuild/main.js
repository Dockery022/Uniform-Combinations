// Preview of the rebuilt viewer: base body, garments inflated from it,
// MeshPhysicalMaterial fabrics, glossy helmet, HDRI + one key + one rim light.
import * as THREE from '../three.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { loadHDR } from '../hdr.js';
import { Orbit, VIEWS } from '../orbit.js';
import { buildGarments } from './garments.js';

const RED = '#C9001F';
const WHITE = '#FFFFFF';
const BLACK = '#000000';
const SILVER = '#8A8D8F';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1b1e);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromEquirectangular(await loadHDR('studio_small_09_1k')).texture;
scene.environmentIntensity = 0.6;

// One soft key from the front right, one rim from behind left.
const key = new THREE.DirectionalLight(0xfff4e8, 2.2);
key.position.set(2.5, 4, 3.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 6;
key.shadow.bias = -0.0004;
Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.2, bottom: -0.2, near: 0.5, far: 12 });
scene.add(key);
const rim = new THREE.DirectionalLight(0xe8f0ff, 2.6);
rim.position.set(-2.5, 3.2, -3.5);
scene.add(rim);

const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshStandardMaterial({ color: 0x232327, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Fabric maps tile across the body's UV atlas.
const texLoader = new THREE.TextureLoader();
const aniso = renderer.capabilities.getMaxAnisotropy();
async function fabricMaps(name, repeat) {
  const load = async (kind) => {
    const t = await texLoader.loadAsync(`assets/fabric/${name}_${kind}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = aniso;
    return t;
  };
  const [normalMap, roughnessMap] = await Promise.all([load('normal'), load('roughness')]);
  return { normalMap, roughnessMap };
}
const [mesh, twill] = await Promise.all([fabricMaps('jersey-mesh', 14), fabricMaps('pants-twill', 16)]);

const fabric = (color, maps, opts = {}) =>
  new THREE.MeshPhysicalMaterial({
    color,
    ...maps,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 1,
    metalness: 0,
    sheen: 0.5,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(WHITE), 0.3),
    ...opts,
  });

const materials = {
  jersey: fabric(RED, mesh), // matte mesh
  sleeves: fabric(RED, mesh),
  pants: fabric(WHITE, twill, { sheen: 0.35 }), // twill
  socks: fabric(RED, mesh),
  gloves: new THREE.MeshPhysicalMaterial({ color: BLACK, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0x333333) }),
  cleats: new THREE.MeshPhysicalMaterial({ color: BLACK, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
};

// Where layers come within a millimetre of each other the outer one wins the
// depth test, so the inner layer can't speckle through.
const LAYER = { socks: 0, sleeves: 1, jersey: 2, pants: 3, cleats: 4, gloves: 1 };
for (const [name, m] of Object.entries(materials)) {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -LAYER[name];
  m.polygonOffsetUnits = -4 * LAYER[name];
}

const gltf = await new GLTFLoader().loadAsync('assets/body/base-body.glb');
scene.add(gltf.scene);
let body;
gltf.scene.traverse((o) => {
  if (o.isSkinnedMesh && o.name === 'body') body = o;
  if (o.isMesh) {
    o.castShadow = o.receiveShadow = true;
    o.frustumCulled = false;
  }
});

// Garments are cut and inflated in the rest (T) pose, then everything poses together.
const { garments, landmarks } = buildGarments(body, materials);
for (const n of (new URLSearchParams(location.search).get('hide') || '').split(',')) if (garments[n]) garments[n].visible = false;
window.__garments = Object.fromEntries(Object.entries(garments).map(([k, m]) => [k, m.geometry.index.count / 3]));

// Glossy helmet (the real shell + facemask model), fitted to the head and
// parented to the head bone so it follows the pose.
const helmetGltf = await new GLTFLoader().loadAsync('assets/helmet.glb');
const helmet = helmetGltf.scene;
const helmetMat = {
  shell: new THREE.MeshPhysicalMaterial({ color: RED, roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }),
  mask: new THREE.MeshPhysicalMaterial({ color: WHITE, roughness: 0.35, clearcoat: 0.5 }),
  hardware: new THREE.MeshPhysicalMaterial({ color: SILVER, roughness: 0.3, metalness: 1 }),
  other: new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.6 }),
};
helmet.traverse((o) => {
  if (!o.isMesh) return;
  o.material = helmetMat[o.material.name] || helmetMat.other;
  o.castShadow = o.receiveShadow = true;
});
{
  // Head size from the body's own vertices above the neck.
  const pos = body.geometry.attributes.position;
  const v = new THREE.Vector3();
  const head = new THREE.Box3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
    if (v.y > landmarks.neck.y + 0.06 && Math.abs(v.x) < 0.14) head.expandByPoint(v);
  }
  const hs = head.getSize(new THREE.Vector3());
  const hc = head.getCenter(new THREE.Vector3());
  const shellBox = new THREE.Box3().setFromObject(helmet.getObjectByName('shell') || helmet);
  const s = (hs.x * 1.62) / shellBox.getSize(new THREE.Vector3()).x;
  helmet.scale.setScalar(s);
  helmet.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(helmet.getObjectByName('shell') || helmet);
  const bc = b.getCenter(new THREE.Vector3());
  helmet.position.add(new THREE.Vector3(hc.x - bc.x, head.max.y + 0.035 - b.max.y, hc.z - bc.z - 0.012));
  scene.add(helmet);
  helmet.updateMatrixWorld(true);
  body.skeleton.bones.find((x) => x.name === 'Head').attach(helmet);
}

// Arms down from the T-pose into a relaxed stance.
const bone = (n) => body.skeleton.bones.find((b) => b.name === n);
function rotateWorld(b, axis, angle) {
  const parentQ = b.parent.getWorldQuaternion(new THREE.Quaternion());
  const worldQ = b.getWorldQuaternion(new THREE.Quaternion());
  const delta = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  b.quaternion.copy(parentQ.invert().multiply(delta).multiply(worldQ));
  b.updateMatrixWorld(true);
}
const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
for (const side of ['l', 'r']) {
  const up = bone(`upperarm_${side}`);
  const sign = Math.sign(up.getWorldPosition(new THREE.Vector3()).x);
  rotateWorld(up, Z, -sign * 1.25);
  rotateWorld(up, Y, sign * 0.12);
  rotateWorld(bone(`lowerarm_${side}`), new THREE.Vector3(1, 0, 0), -0.25);
}

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
const orbit = new Orbit(camera, canvas);
const params = new URLSearchParams(location.search);
const view = VIEWS[params.get('view')] || VIEWS.three;
orbit.target.fromArray(view.target);
Object.assign(orbit.s, { theta: view.theta, phi: view.phi, radius: view.radius * 0.8 });
orbit.apply();
if (params.get('cam')) {
  // ?cam=x,y,z,tx,ty,tz for close-up checks.
  const [x, y, z, tx, ty, tz] = params.get('cam').split(',').map(Number);
  orbit.update = null;
  camera.position.set(x, y, z);
  camera.lookAt(tx, ty, tz);
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => {
  orbit.update?.(1 / 60);
  renderer.render(scene, camera);
});
window.__ready = true;
