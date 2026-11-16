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
    // Doc's photos: LOUISVILLE and the numbers in the slanted jersey face,
    // red with a heavy black outline; the three-bar centered under the V.
    wordmark: { kind: 'jersey', text: 'LOUISVILLE', fill: R, outline: K },
    number: { font: 'jersey', fill: R, outline: K },
    name: R,
    bars: R,
    barsAt: 'center',
  },
  'Black 26-27': {
    base: K,
    neck: [[R, 0.009], [K, 0.006], [R, 0.005]],
    arm: [[R, 0.016]],
    side: { half: 0.06, pins: R, pinW: 0.003, pinGap: 0.022 },
    wordmark: { kind: 'script', text: 'Cardinals', fill: R, outline: W },
    number: { font: 'sans', fill: R, outline: W }, // upright block, no serifs
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
    // Doc's Notre Dame photos: the mascot at the side of the left leg, the
    // three-bar low on the same leg.
    barsLeg: 'left',
    mascotForward: 0.0,
  },
};

const SCRIPT = '"Yellowtail", "Brush Script MT", cursive';
const BLOCK = FONTS.block; // Graduate: collegiate block with slab serifs
const NUMBER_FACES = { jersey: FONTS.jersey, block: BLOCK, sans: '"Oswald", "Arial Narrow", Impact, sans-serif' };

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

function numberText(ctx, number, { cx, cy, height, width, fill, outline, font, outlineW = 0.035 }) {
  wordText(ctx, number, {
    cx, cy, height, width: Math.min(width, (number.length === 1 ? 0.6 : 1) * width), family: NUMBER_FACES[font] ?? BLOCK, fill,
    outlines: [{ color: outline, width: height * outlineW }],
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
  } else if (wm.kind === 'jersey') {
    const p = F.jersey;
    archText(ctx, wm.text, { cx, cy: front.neck + p.below, height: p.height, width: p.width, family: FONTS.jersey, fill: wm.fill, outlines: [{ color: wm.outline, width: p.outline }], arch: 0.004, spacing: 1 });
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
// model.js): the three-bar mark low on the right leg, the dunking-cardinal
// mascot (Doc's art, assets/uni/bb-mascot.webp) low on the left.
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

// ---------- printing on the display uniform's pattern ----------
//
// The display uniform (Sev's "Basketball Jersey", see display.js) comes as
// flat sewn pattern pieces, so the art is printed the way a sublimated
// uniform is: flat on each piece, at true size. `atlas` is the pattern
// layout from the model (meters, y down the body); every placement below is
// in meters on the cloth, measured from the piece's landmarks (center line,
// bottom of the neckline, armpits; the leg's outside line and hem).
// Sizes follow Doc's 2026-11-16 home-game galleries.
export const BB_PRINT = {
  front: {
    wordmark: { below: 0.075, height: 0.042, width: 0.25 }, // straight, about armpit height
    jersey: { below: 0.085, height: 0.06, width: 0.27, outline: 0.0035 },
    script: { below: 0.085, height: 0.075, width: 0.27 },
    image: { below: 0.1, width: 0.25 },
    number: { below: 0.215, height: 0.15, width: 0.17, outline: 0.05 },
    bars: { right: { across: -0.095, below: 0.01, size: 0.04 }, center: { across: 0, below: 0.028, size: 0.034 } },
    // The conference patch on the wearer's left chest, by the strap.
    patch: { across: 0.095, below: 0.005, size: 0.042 },
  },
  back: {
    name: { below: 0.085, height: 0.04, width: 0.24, arch: 0.012 },
    number: { below: 0.215, height: 0.2, width: 0.23 },
  },
  shorts: {
    mascot: { forward: 0.1, aboveHem: 0.13, height: 0.14 }, // lower front of the wearer's left leg
    bars: { forward: 0.1, aboveHem: 0.09, size: 0.045 }, // lower front of the wearer's right leg
  },
};

// The round conference patch: white, a silver ring, ACC in black.
function confPatch(ctx, cx, cy, size) {
  const r = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = W;
  ctx.fill();
  ctx.lineWidth = r * 0.14;
  ctx.strokeStyle = BRAND.silver ?? '#8A8D8F';
  ctx.stroke();
  ctx.font = `800 100px ${'"Montserrat", Arial, sans-serif'}`;
  const m = ctx.measureText('ACC');
  const k = (r * 1.25) / m.width;
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.fillStyle = K;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ACC', 0, 4);
  ctx.restore();
}

// The leg's outside line at height y (atlas meters).
function sideAt(line, y) {
  if (y <= line[0][1]) return line[0][0];
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    if (y <= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  }
  return line[line.length - 1][0];
}

// Paints every print onto the transparent atlas canvas, `ppm` pixels per
// meter. Base colors, trim and side panels come from the shader.
export function paintBBAtlas(canvas, ppm, atlas, look, { wordmark, mascot }) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(ppm, ppm); // draw in meters
  const J = look.bb.jersey;
  const S = look.bb.shorts;
  const F = BB_PRINT.front;
  const front = atlas.pieces.front;
  const cx = front.center;
  const wm = J.wordmark;
  if (wm.kind === 'image' && wordmark) {
    const w = F.image.width;
    const h = (wordmark.height / wordmark.width) * w;
    ctx.drawImage(wordmark, cx - w / 2, front.neck + F.image.below - h / 2, w, h);
  } else if (wm.kind === 'script') {
    const p = F.script;
    wordText(ctx, wm.text, { cx, cy: front.neck + p.below, height: p.height, width: p.width, family: SCRIPT, fill: wm.fill, outlines: [{ color: wm.outline, width: 0.0035 }], rotate: -0.06 });
  } else if (wm.kind === 'jersey') {
    const p = F.jersey;
    archText(ctx, wm.text, { cx, cy: front.neck + p.below, height: p.height, width: p.width, family: FONTS.jersey, fill: wm.fill, outlines: [{ color: wm.outline, width: p.outline }], arch: 0.004, spacing: 1 });
  } else if (wm.kind === 'arch') {
    const p = F.wordmark;
    archText(ctx, wm.text, { cx, cy: front.neck + p.below, height: p.height, width: p.width, family: BLOCK, fill: wm.fill, outlines: [{ color: wm.outline, width: 0.0025 }], arch: 0.002, spacing: 2 });
  }
  const n = F.number;
  numberText(ctx, look.number, { cx, cy: front.neck + n.below, height: n.height, width: n.width, outlineW: n.outline, ...J.number });
  const b = F.bars[J.barsAt === 'right' ? 'right' : 'center'];
  threeBars(ctx, cx + b.across, front.neck + b.below, b.size, J.bars);
  const pa = F.patch;
  confPatch(ctx, cx + pa.across, front.neck + pa.below, pa.size);

  const B = BB_PRINT.back;
  const back = atlas.pieces.back;
  if (look.name) {
    const p = B.name;
    archText(ctx, look.name, { cx: back.center, cy: back.neck + p.below, height: p.height, width: Math.min(p.width, look.name.length * 0.032), family: BLOCK, fill: J.name, arch: p.arch, spacing: 6 });
  }
  numberText(ctx, look.backNumber, { cx: back.center, cy: back.neck + B.number.below, height: B.number.height, width: B.number.width, outlineW: 0.045, ...J.number });

  const P = BB_PRINT.shorts;
  const left = atlas.pieces.legL;
  if (mascot) {
    const y = left.hem - P.mascot.aboveHem;
    const h = P.mascot.height;
    const w = (mascot.width / mascot.height) * h;
    const x = sideAt(left.side, y) + left.front * (S.mascotForward ?? P.mascot.forward);
    ctx.drawImage(mascot, x - w / 2, y - h / 2, w, h);
  }
  const leg = atlas.pieces[S.barsLeg === 'left' ? 'legL' : 'legR'];
  const by = leg.hem - (S.barsLeg === 'left' ? 0.08 : P.bars.aboveHem); // clear of the hem bands
  threeBars(ctx, sideAt(leg.side, by) + leg.front * (S.barsLeg === 'left' ? 0.12 : P.bars.forward), by, P.bars.size, S.bars);
  ctx.restore();
}
