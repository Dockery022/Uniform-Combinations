// Boot: renderer, studio lighting, turf, the player, the panel, the game
// graphic and saved combos.
import * as THREE from './three.js';
import { loadAssets, loadImage, Player } from './model.js';
import { Orbit, VIEWS } from './orbit.js';
import { Panel, el } from './ui.js';
import { FONTS, makeCanvas, paintTurf } from './textures.js';
import { artUrl, cleanState, clone, decodeState, encodeState, groupOf, pieceName, resolveLook } from './combo.js';
import { BRAND, DEFAULT_STATE } from './team.js';

const POSE_LABELS = { idle: 'Idle', ready: 'Ready', run: 'Run', celebrate: 'Celebrate', heisman: 'Heisman' };
const SAVED_KEY = 'combo-builder-3d:saved';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = document.getElementById('stage');
const canvas = document.getElementById('scene');

// ---------- renderer and scene ----------

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
const pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);

// A dark studio with soft boxes, baked into an environment map so gloss and
// chrome pick up believable highlights.
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
Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 2.2, bottom: -0.4, near: 1, far: 10 });
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
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 0.8 ? 28 / Math.max(0.55, camera.aspect / 0.8) : 28;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

// ---------- state ----------

let state = clone(DEFAULT_STATE);
let saved = loadSaved();
let mode = '3d';
let painted = Promise.resolve();

function loadSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
    return Array.isArray(list) ? list.map((c) => ({ ...cleanState(c), id: Number(c.id) || Date.now() })) : [];
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

function toast(message) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
}

function applyState(next) {
  state = next;
  if (player) painted = player.apply(resolveLook(state)).catch((err) => console.error(err));
  updateReadout();
  if (mode === 'graphic') scheduleGraphic();
  try {
    history.replaceState(null, '', `#${encodeState(state)}`);
  } catch {
    /* sandboxed frames may refuse history changes */
  }
}

const panel = new Panel({
  getState: () => state,
  onChange: (s) => applyState(s),
  onSave: () => {
    saved.unshift({ ...clone(state), id: Date.now() });
    saved = saved.slice(0, 40);
    storeSaved();
    panel.renderSaved(saved);
    toast('Combo saved');
  },
  onLoad: (c) => {
    const { id, ...rest } = c;
    applyState(cleanState(rest));
    panel.render();
    toast('Combo loaded');
  },
  onRemove: (c) => {
    saved = saved.filter((x) => x.id !== c.id);
    storeSaved();
    panel.renderSaved(saved);
  },
});

// The three pieces over the stage, like the graphic's 01 · 02 · 03.
function updateReadout() {
  const rows = [['01 · Helmet', 'helmet', state.helmetNote], ['02 · Jersey', 'jersey'], ['03 · Pants', 'pants', state.socks !== 'Match' ? `${state.socks} socks` : '']];
  document.getElementById('readout').replaceChildren(...rows.map(([label, kind, note]) => el('li', {}, [
    el('span', { class: 'r-label', text: label }),
    el('span', { class: 'r-value', text: pieceName(kind, state[kind]) }),
    note && el('span', { class: 'r-note', text: note }),
  ])));
}

// ---------- stage dock ----------

function segmented(container, entries, current, onPick) {
  container.replaceChildren(...entries.map(([value, label]) => {
    const b = el('button', { type: 'button', class: 'dock-opt', id: `${container.id}-${value}`, text: label, 'aria-pressed': String(value === current) });
    b.addEventListener('click', () => {
      onPick(value);
      for (const other of container.children) other.setAttribute('aria-pressed', String(other === b));
    });
    return b;
  }));
}

const clock = new THREE.Clock();
let pose = 'idle';
segmented(document.getElementById('poses'), Object.entries(POSE_LABELS), pose, (p) => {
  pose = p;
  player?.setPose(p, clock.elapsedTime);
});
segmented(document.getElementById('views'), Object.entries(VIEWS).map(([k, v]) => [k, v.label]), 'three', (v) => orbit.flyTo(v));
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

// ---------- the game graphic ----------

const graphic = document.getElementById('graphic');

// Renders the player alone on a transparent background, framed head to toe.
function renderCutout(w, h) {
  const saved3d = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov, aspect: camera.aspect };
  turf.visible = false;
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  camera.fov = 16;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const target = new THREE.Vector3(0, 1.0, 0);
  const dist = 1.12 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(Math.sin(0.32) * dist, 1.15, Math.cos(0.32) * dist);
  camera.lookAt(target);
  renderer.render(scene, camera);
  const out = makeCanvas(w, h);
  out.getContext('2d').drawImage(renderer.domElement, 0, 0);
  turf.visible = true;
  camera.position.copy(saved3d.pos);
  camera.quaternion.copy(saved3d.quat);
  camera.fov = saved3d.fov;
  camera.aspect = saved3d.aspect;
  resize();
  return out;
}

const INK = { Red: BRAND.red, White: '#ffffff', Gray: '#8f9195', Black: '#111111' };

// Text with tracking (letter-spacing in px), left aligned at x.
function tracked(ctx, text, x, y, spacing) {
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, x, y);
    const width = ctx.measureText(text).width;
    ctx.letterSpacing = '0px';
    return width;
  }
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - x;
}

// The 1080 x 1080 "The Combo" graphic from the design, with the 3D render
// standing in for the flat art.
async function drawGraphic() {
  const s = state;
  await painted;
  const [bird, crest, shoes] = await Promise.all([
    loadImage('assets/uni/bird-master.webp'),
    loadImage('assets/uni/1912-crest.webp'),
    s.shoes !== 'None' ? loadImage(artUrl('shoes', s.shoes, s)) : null,
  ]);
  const ctx = graphic.getContext('2d');
  const sans = (weight, px) => `${weight} ${px}px ${FONTS.sans}`;
  const display = (px) => `${px}px ${FONTS.display}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f5f5f4';
  ctx.fillRect(0, 0, 1080, 1080);

  // Cardinal band with the matchup, THE COMBO and the crest.
  ctx.fillStyle = BRAND.red;
  ctx.fillRect(0, 0, 164, 1080);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 164, 1080);
  ctx.clip();
  ctx.globalAlpha = 0.22;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(bird, -150, 300, 460, (460 * bird.naturalHeight) / bird.naturalWidth);
  ctx.restore();
  ctx.fillStyle = '#8a0e22';
  ctx.fillRect(156, 0, 8, 1080);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = sans(600, 20);
  ctx.fillText(s.site.toUpperCase().split('').join(' '), 78, 62);
  ctx.font = display(40);
  const words = s.opponent.toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && ctx.measureText(`${last} ${w}`).width <= 130) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  lines.forEach((line, i) => {
    const wd = ctx.measureText(line).width;
    ctx.save();
    ctx.translate(78, 104 + i * 38);
    if (wd > 130) ctx.scale(130 / wd, 1);
    ctx.fillText(line, 0, 0);
    ctx.restore();
  });
  const bandTop = 104 + lines.length * 38;
  const bandBottom = s.showCrest ? 1080 - 36 - 112 - 16 - 2 : 1080 - 36 - 2;
  ctx.save();
  ctx.font = display(156);
  const comboW = ctx.measureText('THE COMBO').width;
  const room = bandBottom - bandTop - 40;
  ctx.translate(78 + 156 * 0.36, (bandTop + bandBottom) / 2);
  ctx.rotate(-Math.PI / 2);
  if (comboW > room) ctx.scale(room / comboW, 1);
  ctx.fillText('THE COMBO', 0, 0);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(42, bandBottom, 72, 2);
  if (s.showCrest) ctx.drawImage(crest, 22, 1080 - 36 - 112, 112, 112);

  // The player.
  const shot = renderCutout(780, 2080);
  ctx.drawImage(shot, 690, 20, 390, 1040);

  // Helmet, jersey and pants in big type.
  ctx.textAlign = 'left';
  let y = 56;
  const piece = (label, kind, note) => {
    ctx.font = sans(600, 20);
    ctx.fillStyle = '#52525b';
    const lw = tracked(ctx, label.toUpperCase(), 210, y + 20, 4);
    if (note) {
      ctx.fillStyle = BRAND.red;
      tracked(ctx, note.toUpperCase(), 210 + lw + 14, y + 20, 2.8);
    }
    const group = groupOf(kind, s[kind]);
    const word = group.toUpperCase();
    ctx.font = display(232);
    const ww = ctx.measureText(word).width;
    const k = Math.min(1, 500 / ww);
    ctx.save();
    ctx.translate(204, y + 26 + 200 * k);
    ctx.scale(k, k);
    if (group === 'White') {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(word, 0, 0);
      ctx.lineWidth = 2 / k;
      ctx.strokeStyle = '#111111';
      ctx.strokeText(word, 0, 0);
    } else {
      ctx.fillStyle = INK[group] ?? '#111111';
      ctx.fillText(word, 0, 0);
    }
    ctx.restore();
    y += 26 + 213 + 14;
  };
  piece('01 · Helmet', 'helmet', s.helmetNote);
  piece('02 · Jersey', 'jersey');
  piece('03 · Pants', 'pants', s.socks !== 'Match' ? `${s.socks} socks` : '');

  // Date, kickoff and venue.
  ctx.fillStyle = '#111111';
  ctx.font = display(56);
  ctx.fillText(s.date.toUpperCase(), 210, 1080 - 52 - 30 - 8 - 22 - 8 - 4);
  ctx.font = sans(600, 22);
  ctx.fillStyle = BRAND.red;
  tracked(ctx, `${s.kickoff} · ${s.network}`.toUpperCase(), 210, 1080 - 52 - 30 - 8 - 4, 3);
  ctx.font = sans(400, 20);
  ctx.fillStyle = '#52525b';
  tracked(ctx, s.venue.toUpperCase(), 210, 1080 - 52 - 4, 2.8);
  if (shoes) ctx.drawImage(shoes, 540, 900, 200, (200 * shoes.naturalHeight) / shoes.naturalWidth);
}

let graphicTimer = 0;
function scheduleGraphic() {
  clearTimeout(graphicTimer);
  graphicTimer = setTimeout(() => drawGraphic().catch((err) => console.error(err)), 120);
}

function setMode(next) {
  mode = next;
  const g = mode === 'graphic';
  graphic.hidden = !g;
  document.getElementById('overlay').hidden = g;
  document.getElementById('mode-3d').setAttribute('aria-pressed', String(!g));
  document.getElementById('mode-graphic').setAttribute('aria-pressed', String(g));
  document.getElementById('preview-note').textContent = g
    ? 'Live preview of the 1080 × 1080 graphic, with the 3D player in your pose.'
    : 'Turn the player to check every angle. The game graphic uses this 3D render.';
  if (g) scheduleGraphic();
}
document.getElementById('mode-3d').addEventListener('click', () => setMode('3d'));
document.getElementById('mode-graphic').addEventListener('click', () => setMode('graphic'));

document.getElementById('download').addEventListener('click', async () => {
  await drawGraphic();
  graphic.toBlob((blob) => {
    if (!blob) return toast('The graphic could not be saved here.');
    const a = el('a', { href: URL.createObjectURL(blob), download: `combo-${s2slug(state.opponent)}.png` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Graphic downloaded');
  }, 'image/png');
});
const s2slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';

// ---------- boot ----------

async function fontsReady() {
  const loads = [`100px ${FONTS.jersey}`, `100px ${FONTS.block}`, `100px ${FONTS.display}`, `600 20px ${FONTS.sans}`].map((f) => document.fonts.load(f));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]);
}

function frame() {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  const still = reduceMotion && pose !== 'run' && pose !== 'celebrate';
  player.update(still ? 0 : t, still ? 0 : Math.min(dt, 0.1));
  orbit.update(Math.min(dt, 0.25), reduceMotion);
  if (mode === '3d') renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

async function start(data = {}) {
  let initial = clone(DEFAULT_STATE);
  if (data.state) initial = cleanState(data.state);
  else if (location.hash.length > 8) {
    try { initial = decodeState(location.hash); } catch { /* ignore a stale link */ }
  }
  state = initial;
  panel.render();
  panel.renderSaved(saved);
  updateReadout();
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
  if (new URLSearchParams(location.search).has('debug')) window.__combo = {
    player, orbit, scene, camera, THREE, setMode,
    set: (patch) => { applyState(cleanState({ ...state, ...patch })); panel.render(); return painted; },
  };
  applyState(state);
  await painted;
  if (data.pose && POSE_LABELS[data.pose]) document.getElementById(`poses-${data.pose}`)?.click();
  if (data.mode === 'graphic') setMode('graphic');
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);
  // Late fonts get a repaint so the back lettering never shows a fallback face.
  document.fonts.ready.then(() => applyState(state));
}

const hot = window.claude?.hot;
hot?.snapshot?.(() => ({ state, pose, mode }));
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
