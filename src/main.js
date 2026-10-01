// Boot: renderer, studio lighting, turf, the player models, and the panel wiring.
import * as THREE from './three.js';
import { loadAssets, Player } from './model.js';
import { Orbit, VIEWS } from './orbit.js';
import { Panel } from './ui.js';
import { FONTS, makeCanvas, paintTurf } from './textures.js';
import { clone, comboNames, decodeCombo, encodeCombo, mergeCombo, presetCombo, randomCombo } from './combo.js';
import { DEFAULT_COMBO } from './team.js';

const POSE_LABELS = { idle: 'Idle', ready: 'Ready', run: 'Run', celebrate: 'Celebrate', heisman: 'Heisman' };
const SAVED_KEY = 'combo-builder:saved';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');

// ---------- renderer and scene ----------

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);

// A dark studio with soft boxes, baked into an environment map so gloss and
// chrome helmets pick up believable highlights.
function studioEnvironment() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), new THREE.MeshBasicMaterial({ color: '#141418', side: THREE.BackSide })));
  const box = (w, h, pos, intensity, tint = '#ffffff') => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 1, 0);
    env.add(m);
  };
  box(3.5, 2.4, [4, 3, 4], 5);
  box(7, 1.2, [0, 3.9, 0], 3.2);
  box(2, 4, [-5, 2, 2], 1.6, '#dfe6ff');
  box(1.4, 4, [-4, 2, -4.5], 4, '#ff2b48');
  box(1.4, 4, [4.5, 2, -4], 2.2, '#cfd8ff');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  return tex;
}
scene.environment = studioEnvironment();
scene.environmentIntensity = 0.7;

const key = new THREE.DirectionalLight('#fff4ea', 2.4);
key.position.set(2.4, 4.2, 3.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -1.4;
key.shadow.camera.right = 1.4;
key.shadow.camera.top = 2.2;
key.shadow.camera.bottom = -0.4;
key.shadow.camera.near = 1;
key.shadow.camera.far = 10;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
scene.add(key, key.target);
key.target.position.set(0, 0.9, 0);

const rimRed = new THREE.DirectionalLight('#ff2a46', 1.7);
rimRed.position.set(-3.2, 2.6, -2.6);
const rimCool = new THREE.DirectionalLight('#c7d6ff', 1.5);
rimCool.position.set(3.2, 2.2, -3);
scene.add(rimRed, rimCool, new THREE.HemisphereLight('#d6dcea', '#1b1310', 0.35));

const turfCanvas = makeCanvas(1024, 1024);
paintTurf(turfCanvas);
const turfTex = new THREE.CanvasTexture(turfCanvas);
turfTex.colorSpace = THREE.SRGBColorSpace;
turfTex.anisotropy = 8;
const turf = new THREE.Mesh(
  new THREE.CircleGeometry(3.2, 96),
  new THREE.MeshStandardMaterial({ map: turfTex, transparent: true, roughness: 0.95, depthWrite: false }),
);
turf.rotation.x = -Math.PI / 2;
turf.receiveShadow = true;
scene.add(turf);

let player = null;

const orbit = new Orbit(camera, canvas);

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Keep the whole player in frame on tall, narrow screens.
  camera.fov = camera.aspect < 0.8 ? 28 / Math.max(0.55, camera.aspect / 0.8) : 28;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

// ---------- state ----------

let combo = clone(DEFAULT_COMBO);
let pose = 'idle';
let saved = loadSaved();

function loadSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
    return Array.isArray(list) ? list.filter((s) => s && typeof s.code === 'string') : [];
  } catch {
    return [];
  }
}

function storeSaved() {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    /* storage can be unavailable in private windows; the list still works this session */
  }
}

function applyCombo(next, { rerender = false } = {}) {
  combo = next;
  player?.apply(combo);
  panel.updateReadout(combo);
  if (rerender) panel.renderFields();
  try {
    history.replaceState(null, '', `#${encodeCombo(combo)}`);
  } catch {
    /* sandboxed frames may refuse history changes */
  }
}

function toast(message) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
}

const panel = new Panel({
  getCombo: () => combo,
  onChange: (c) => applyCombo(c),
  onPreset: (id) => applyCombo(presetCombo(id), { rerender: true }),
  onDecalFile: async (file) => {
    try {
      const url = await readImage(file);
      combo.helmet.decalImage = url;
      await loadDecalImage(url);
      applyCombo(combo, { rerender: true });
    } catch {
      toast('That file could not be read as an image. Try a PNG or SVG.');
    }
  },
});

// Downscale an uploaded decal to 512px so it stays light in saved combos.
function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, 512 / Math.max(img.width, img.height));
        const c = makeCanvas(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function loadDecalImage(url) {
  if (!url) {
    player?.setDecalImage(null);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { player?.setDecalImage(img); resolve(); };
    img.onerror = () => { player?.setDecalImage(null); resolve(); };
    img.src = url;
  });
}

// ---------- stage dock ----------

function segmented(container, entries, current, onPick) {
  container.replaceChildren(...entries.map(([value, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dock-opt';
    b.id = `${container.id}-${value}`;
    b.textContent = label;
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => {
      onPick(value);
      for (const other of container.children) other.setAttribute('aria-pressed', String(other === b));
    });
    return b;
  }));
}

const clock = new THREE.Clock();
segmented(document.getElementById('poses'), Object.entries(POSE_LABELS), pose, (p) => {
  pose = p;
  player?.setPose(p, clock.elapsedTime);
});
segmented(document.getElementById('views'), Object.entries(VIEWS).map(([k, v]) => [k, v.label]), 'three', (v) => {
  orbit.flyTo(v);
});
orbit.onInteract = () => {
  for (const b of document.getElementById('views').children) b.setAttribute('aria-pressed', 'false');
};

const spinBtn = document.getElementById('spin');
function setSpin(on) {
  orbit.autoRotate = on;
  spinBtn.setAttribute('aria-pressed', String(on));
}
spinBtn.addEventListener('click', () => setSpin(!orbit.autoRotate));
setSpin(!reduceMotion);

// ---------- snapshot ----------

const snapDialog = document.getElementById('snapshot');
document.getElementById('snap').addEventListener('click', () => {
  renderer.render(scene, camera);
  const shot = makeCanvas(1080, 1350);
  const ctx = shot.getContext('2d');
  const bg = ctx.createRadialGradient(540, -80, 40, 540, -80, 1200);
  bg.addColorStop(0, '#3a0a14');
  bg.addColorStop(0.55, '#0b0b0d');
  bg.addColorStop(1, '#050506');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1350);
  // Cover-fit the 3D view into the frame above the caption band.
  const frameH = 1130;
  const s = Math.max(1080 / canvas.width, frameH / canvas.height);
  const w = canvas.width * s;
  const h = canvas.height * s;
  ctx.drawImage(canvas, (1080 - w) / 2, (frameH - h) / 2, w, h);
  ctx.fillStyle = '#c8102e';
  ctx.fillRect(0, frameH, 1080, 6);
  ctx.fillStyle = '#0e0e10';
  ctx.fillRect(0, frameH + 6, 1080, 1350 - frameH - 6);
  const names = comboNames(combo);
  ctx.fillStyle = '#f5f5f4';
  ctx.font = `92px ${FONTS.modern}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${names.helmet} · ${names.jersey} · ${names.pants}`.toUpperCase(), 56, frameH + 118, 968);
  ctx.font = '600 30px "Geist", system-ui, sans-serif';
  ctx.fillStyle = '#9a9aa2';
  ctx.fillText(`HELMET · JERSEY · PANTS   No. ${combo.jersey.number}`, 58, frameH + 176);
  const img = document.getElementById('snapshot-img');
  img.src = shot.toDataURL('image/png');
  snapDialog.showModal();
});
document.getElementById('snapshot-close').addEventListener('click', () => snapDialog.close());

// ---------- actions ----------

document.getElementById('randomize').addEventListener('click', () => {
  applyCombo(randomCombo(), { rerender: true });
});

document.getElementById('copy').addEventListener('click', async () => {
  const code = encodeCombo(combo);
  const field = document.getElementById('code');
  try {
    await navigator.clipboard.writeText(code);
    toast('Combo code copied');
  } catch {
    field.value = code;
    field.focus();
    field.select();
    toast('Code is in the box below. Copy it from there.');
  }
});

document.getElementById('load-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const field = document.getElementById('code');
  try {
    applyCombo(decodeCombo(field.value), { rerender: true });
    field.value = '';
    toast('Combo loaded');
  } catch {
    toast('That code did not load. Make sure the whole code was pasted.');
  }
});

document.getElementById('save').addEventListener('click', () => {
  const names = comboNames(combo);
  saved.unshift({
    name: `${names.helmet} · ${names.jersey} · ${names.pants}`,
    number: combo.jersey.number,
    code: encodeCombo(combo),
    decalImage: combo.helmet.decalImage,
  });
  saved = saved.slice(0, 24);
  storeSaved();
  renderSaved();
  toast('Saved to your combos');
});

function renderSaved() {
  const list = document.getElementById('saved');
  const empty = document.getElementById('saved-empty');
  empty.hidden = saved.length > 0;
  list.replaceChildren(...saved.map((s, i) => {
    const li = document.createElement('li');
    li.className = 'saved-row';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'saved-open';
    open.textContent = `${s.name}`;
    const num = document.createElement('span');
    num.className = 'saved-num';
    num.textContent = `No. ${s.number}`;
    open.append(num);
    open.addEventListener('click', async () => {
      try {
        const next = decodeCombo(s.code);
        if (s.decalImage) next.helmet.decalImage = s.decalImage;
        await loadDecalImage(next.helmet.decalImage);
        applyCombo(next, { rerender: true });
      } catch {
        toast('This saved combo could not be opened.');
      }
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'saved-del';
    del.textContent = 'Remove';
    del.setAttribute('aria-label', `Remove ${s.name}`);
    del.addEventListener('click', () => {
      saved.splice(i, 1);
      storeSaved();
      renderSaved();
    });
    li.append(open, del);
    return li;
  }));
}

// ---------- boot ----------

async function fontsReady() {
  const loads = [`100px ${FONTS.block}`, `100px ${FONTS.modern}`, `100px ${FONTS.script}`].map((f) => document.fonts.load(f));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]);
}

function frame() {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  const ambientOnly = pose !== 'run' && pose !== 'celebrate';
  const still = reduceMotion && ambientOnly;
  player.update(still ? 0 : t, still ? 0 : Math.min(dt, 0.1));
  orbit.update(Math.min(dt, 0.25), reduceMotion);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

async function start(data = {}) {
  let initial = DEFAULT_COMBO;
  if (data.combo) initial = mergeCombo(DEFAULT_COMBO, data.combo);
  else if (location.hash.length > 8) {
    try { initial = decodeCombo(location.hash); } catch { /* ignore a stale hash */ }
  }
  const label = document.getElementById('loading-text');
  let assets;
  try {
    [assets] = await Promise.all([
      loadAssets((f) => { label.textContent = `Suiting up the player… ${Math.round(f * 100)}%`; }),
      fontsReady(),
    ]);
  } catch (err) {
    console.error(err);
    label.textContent = 'The 3D player could not be loaded. Check your connection and reload the page.';
    return;
  }
  player = new Player(renderer, assets);
  scene.add(player.root);
  if (pose !== 'idle') player.setPose(pose, clock.elapsedTime);
  await loadDecalImage(initial.helmet.decalImage);
  applyCombo(clone(initial), { rerender: true });
  if (data.pose && POSE_LABELS[data.pose]) document.getElementById(`poses-${data.pose}`)?.click();
  renderSaved();
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);
  // Fonts that arrive late get a repaint so numbers never show a fallback face.
  document.fonts.ready.then(() => player.apply(combo));
}

const hot = window.claude?.hot;
hot?.snapshot?.(() => ({ combo, pose }));
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
