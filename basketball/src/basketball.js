// The basketball sets and how they're drawn. Matched to Doc's photos of the
// 26-27 White and Black uniforms (2026-11-14); the photos are reference
// only, every graphic here is drawn from scratch.
import { BRAND } from './team.js';
import { FONTS } from './textures.js';

const { red: R, black: K, white: W } = BRAND;

// Jersey trim, all in meters on the cloth:
// neck: the V-neck bands from the edge in, [color, width] each.
// arm: the armhole binding color.
// side: the side panel down from the armhole, centered on the side seam:
//   panel fill (or null), piping on its edges, and thin pinstripes inside.
// Chest: wordmark (block LOUISVILLE or the Cardinals script), number colors,
// and the color of the three-bar mark. Back: name color.
export const BB_JERSEYS = {
  'White 26-27': {
    base: W,
    neck: [[K, 0.009], [R, 0.007], [K, 0.005]],
    arm: [[K, 0.016]],
    side: { half: 0.07, panel: R, pipe: K, pipeW: 0.008 },
    wordmark: { kind: 'arch', text: 'LOUISVILLE', fill: R, outline: K },
    number: { font: 'block', fill: R, outline: K },
    name: R,
    bars: R,
    barsAt: 'right',
  },
  'Black 26-27': {
    base: K,
    neck: [[R, 0.009], [K, 0.006], [R, 0.005]],
    arm: [[R, 0.016]],
    side: { half: 0.06, pins: R, pinW: 0.003, pinGap: 0.022 },
    wordmark: { kind: 'script', text: 'Cardinals', fill: R, outline: W },
    number: { font: 'block', fill: R, outline: W },
    name: W,
    bars: W,
    barsAt: 'right',
  },
  'White 25-26': {
    base: W,
    neck: [[K, 0.007], [R, 0.008], [K, 0.005]],
    arm: [[K, 0.007], [R, 0.008], [K, 0.005]],
    side: null,
    wordmark: { kind: 'image', file: 'wordmark' },
    number: { font: 'jersey', fill: K, outline: R },
    name: K,
    bars: K,
    barsAt: 'center',
  },
};

// Shorts: waistband bands from the top down and hem bands from the hem up,
// [color, width] in meters; the side design as on the jersey; the leg marks.
export const BB_SHORTS = {
  'White 26-27': {
    base: W,
    waist: [[K, 0.012], [R, 0.022], [K, 0.012]],
    hem: [[K, 0.03]],
    side: { half: 0.06, panel: R, pipe: K, pipeW: 0.008 },
    bars: R,
  },
  'Black 26-27': {
    base: K,
    waist: [[R, 0.014], [K, 0.02], [R, 0.014]],
    hem: [[R, 0.025]],
    side: { half: 0.065, pipe: R, pipeW: 0.018, pins: R, pinW: 0.003, pinGap: 0.02 },
    bars: W,
  },
  'White 25-26': {
    base: W,
    waist: [],
    hem: [[K, 0.008], [R, 0.01], [W, 0.007], [R, 0.01], [K, 0.008]],
    side: null,
    bars: K,
  },
};

const SCRIPT = '"Yellowtail", "Brush Script MT", cursive';
const BLOCK = FONTS.block; // Graduate: collegiate block with slab serifs

// Text along a gentle upward arch, centered on (cx, cy): `arch` is how far
// the middle rises above the ends, in pixels.
function archText(ctx, text, { cx, cy, height, width, family, fill, outlines = [], arch = 0, spacing = 0 }) {
  ctx.save();
  ctx.font = `100px ${family}`;
  const glyphs = [...text];
  const widths = glyphs.map((g) => ctx.measureText(g).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  const m = ctx.measureText(text);
  const capH = (m.actualBoundingBoxAscent || 72);
  const k = height / capH;
  const sx = Math.min(1, width / (total * k));
  let x = -total / 2;
  const half = (total * k * sx) / 2;
  for (const [i, g] of glyphs.entries()) {
    const gx = (x + widths[i] / 2) * k * sx;
    const t = gx / half; // -1 .. 1
    const lift = arch * (1 - t * t);
    const slope = (-2 * arch * t) / half;
    ctx.save();
    ctx.translate(cx + gx, cy - lift);
    ctx.rotate(Math.atan(slope));
    ctx.scale(k * sx, k);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    for (const o of outlines) {
      ctx.strokeStyle = o.color;
      ctx.lineWidth = (o.width * 2) / k;
      ctx.strokeText(g, 0, capH / 2);
    }
    ctx.fillStyle = fill;
    ctx.fillText(g, 0, capH / 2);
    ctx.restore();
    x += widths[i];
  }
  ctx.restore();
}

// A whole word as one run (the script's letters join), squeezed to `width`.
function wordText(ctx, text, { cx, cy, height, width, family, fill, outlines = [], rotate = 0 }) {
  ctx.save();
  ctx.font = `100px ${family}`;
  const m = ctx.measureText(text);
  const capH = m.actualBoundingBoxAscent || 72;
  const k = height / capH;
  const sx = Math.min(1.2, width / (m.width * k));
  ctx.translate(cx, cy);
  ctx.rotate(rotate);
  ctx.scale(k * sx, k);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (const o of outlines) {
    ctx.strokeStyle = o.color;
    ctx.lineWidth = (o.width * 2) / k;
    ctx.strokeText(text, 0, capH / 2);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, capH / 2);
  ctx.restore();
}

// The three-bar mark: three slanted bars rising left to right, `size` wide.
export function threeBars(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  // Three equal-width bars, bottoms level, rising in height left to right,
  // each leaning right by half its height.
  const w = size * 0.24;
  const gap = size * 0.1;
  const h = [0.42, 0.71, 1].map((f) => f * size * 0.8);
  const base = cy + size * 0.4;
  const span = 3 * w + 2 * gap + h[2] * 0.5;
  for (let i = 0; i < 3; i++) {
    const x = cx - span / 2 + i * (w + gap);
    const lean = h[i] * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x + w, base);
    ctx.lineTo(x + w + lean, base - h[i]);
    ctx.lineTo(x + lean, base - h[i]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Where the chest graphics sit in the front art (1366 x 1408 px, the
// football template the model projects; see JERSEY_ART in model.js).
// Matched to Doc's 2026-11-16 home-game galleries: LOUISVILLE straight across
// the chest at armpit height, a smaller number under it.
export const BB_FRONT = { cx: 683, bars: [683, 470, 56], wordmark: [585, 110, 400], number: [775, 200, 250] };
export const BB_BACK = { name: [470, 54, 460], number: [650, 280, 330] };

function numberText(ctx, number, { cx, cy, height, width, fill, outline, font }) {
  wordText(ctx, number, {
    cx, cy, height, width: Math.min(width, (number.length === 1 ? 0.6 : 1) * width), family: font === 'jersey' ? FONTS.jersey : BLOCK, fill,
    outlines: [{ color: outline, width: height * 0.035 }],
  });
}

export function paintBBFront(canvas, spec, number, wordmarkImg) {
  const ctx = canvas.getContext('2d');
  const k = canvas.width / 1366;
  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(k, k);
  const F = BB_FRONT;
  const wm = spec.wordmark;
  const [wy, wh, ww] = F.wordmark;
  if (wm.kind === 'image' && wordmarkImg) {
    const w = ww * 0.95;
    const h = (wordmarkImg.height / wordmarkImg.width) * w;
    ctx.drawImage(wordmarkImg, F.cx - w / 2, wy - h / 2, w, h);
  } else if (wm.kind === 'script') {
    wordText(ctx, wm.text, { cx: F.cx, cy: wy, height: wh * 1.05, width: ww, family: SCRIPT, fill: wm.fill, outlines: [{ color: wm.outline, width: 9 }], rotate: -0.06 });
  } else if (wm.kind === 'arch') {
    archText(ctx, wm.text, { cx: F.cx, cy: wy, height: wh * 0.62, width: ww, family: BLOCK, fill: wm.fill, outlines: [{ color: wm.outline, width: 6 }], arch: 6, spacing: 4 });
  }
  const [ny, nh, nw] = F.number;
  numberText(ctx, number, { cx: F.cx, cy: ny, height: nh, width: nw, ...spec.number });
  const [bx, by, bs] = F.bars;
  threeBars(ctx, spec.barsAt === 'right' ? bx - 160 : bx, spec.barsAt === 'right' ? by - 40 : by, bs, spec.bars);
  ctx.restore();
}

export function paintBBBack(canvas, spec) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Name arched over the number, on the transparent back-lettering canvas.
export function paintBBBackLettering(canvas, spec, number, name) {
  const ctx = canvas.getContext('2d');
  const k = canvas.width / 1366;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(k, k);
  const B = BB_BACK;
  if (name) {
    const [y, h, w] = B.name;
    archText(ctx, name, { cx: 683, cy: y, height: h, width: Math.min(w, name.length * 62), family: BLOCK, fill: spec.name, arch: 22, spacing: 6 });
  }
  const [ny, nh, nw] = B.number;
  numberText(ctx, number, { cx: 683, cy: ny, height: nh, width: nw, ...spec.number });
  ctx.restore();
}

// The shorts' leg marks in the front-view logo strip (see SHORTS_ART in
// model.js): the three-bar mark low on the right leg, the bird low on the left.
export function paintBBShortsLogos(canvas, spec, bird, art) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { legY, rightX, leftX } = art;
  threeBars(ctx, rightX, legY + 10, 70, spec.bars);
  if (bird) {
    const h = 170;
    const w = (bird.width / bird.height) * h;
    ctx.drawImage(bird, leftX - w / 2, legY - h / 2 - 30, w, h);
  }
}
