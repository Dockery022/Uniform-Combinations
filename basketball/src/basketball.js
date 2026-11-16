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
// the middle rises above the ends. All the letters' outlines go down before
// any fill, so touching letters share one outline. `shadow` ({ dx, dy,
// color }) adds an offset outline underneath; `spikeV` drops the V's point
// below the baseline, as on the 26-27 home LOUISVILLE.
function archText(ctx, text, { cx, cy, height, width, family, fill, outlines = [], arch = 0, spacing = 0, shadow = null, spikeV = false }) {
  ctx.save();
  ctx.font = `100px ${family}`;
  const glyphs = [...text];
  const widths = glyphs.map((g) => ctx.measureText(g).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  const m = ctx.measureText(text);
  const capH = (m.actualBoundingBoxAscent || 72);
  const k = height / capH;
  const sx = Math.min(1, width / (total * k));
  const half = (total * k * sx) / 2;
  const place = [];
  let x = -total / 2;
  for (const [i, g] of glyphs.entries()) {
    const gx = (x + widths[i] / 2) * k * sx;
    const t = gx / half; // -1 .. 1
    place.push({ g, w: widths[i], gx, lift: arch * (1 - t * t), slope: (-2 * arch * t) / half });
    x += widths[i];
  }
  const each = (fn) => {
    for (const p of place) {
      ctx.save();
      ctx.translate(cx + p.gx, cy - p.lift);
      ctx.rotate(Math.atan(p.slope));
      ctx.scale(k * sx, k);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      fn(p);
      ctx.restore();
    }
  };
  // The V's point: a wedge under the letter, filled and outlined with it.
  const spike = (p) => {
    if (!spikeV || p.g !== 'V') return null;
    const path = new Path2D();
    path.moveTo(-p.w * 0.16, capH / 2 - 2);
    path.lineTo(p.w * 0.12, capH / 2 - 2);
    path.lineTo(-p.w * 0.06, capH / 2 + capH * 0.24);
    path.closePath();
    return path;
  };
  const stroke = (p, color, w) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = (w * 2) / k;
    ctx.strokeText(p.g, 0, capH / 2);
    ctx.fillText(p.g, 0, capH / 2);
    const sp = spike(p);
    if (sp) {
      ctx.stroke(sp);
      ctx.fill(sp);
    }
  };
  const outer = outlines.reduce((a, o) => Math.max(a, o.width), 0);
  if (shadow) {
    each((p) => {
      ctx.translate(shadow.dx / (k * sx), shadow.dy / k);
      stroke(p, shadow.color, outer);
    });
  }
  for (const o of [...outlines].sort((a, b) => b.width - a.width)) each((p) => stroke(p, o.color, o.width));
  each((p) => {
    ctx.fillStyle = fill;
    ctx.fillText(p.g, 0, capH / 2);
    const sp = spike(p);
    if (sp) ctx.fill(sp);
  });
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
// The three-bar mark, traced from the art Doc sent (2026-11-16): three
// slanted bars on a level base, rising left to right, `size` wide.
const THREE_BARS = [[[-0.4622, 0.2958], [-0.1975, 0.2958], [-0.3015, 0.1163], [-0.5, 0.2297]], [[-0.1115, 0.2958], [0.1522, 0.2958], [-0.0699, -0.0879], [-0.2675, 0.0255]], [[0.2344, 0.2958], [0.5, 0.2958], [0.1578, -0.2958], [-0.0406, -0.1824]]];
export function threeBars(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  for (const bar of THREE_BARS) {
    ctx.beginPath();
    bar.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, cx + x * size, cy + y * size));
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
    archText(ctx, wm.text, {
      cx, cy: front.neck + p.below, height: p.height, width: p.width, family: FONTS.jersey, fill: wm.fill,
      outlines: [{ color: wm.outline, width: p.outline }], arch: 0.003, spacing: -2,
      shadow: { dx: -0.002, dy: 0.0035, color: wm.outline }, spikeV: true,
    });
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
    jersey: { below: 0.085, height: 0.058, width: 0.28, outline: 0.003 },
    script: { below: 0.085, height: 0.075, width: 0.27 },
    image: { below: 0.1, width: 0.25 },
    number: { below: 0.225, height: 0.15, width: 0.17, outline: 0.04 },
    bars: { right: { across: -0.095, below: 0.01, size: 0.04 }, center: { across: 0, below: 0.028, size: 0.034 } },
    // The conference patch on the wearer's left chest, by the strap.
    patch: { across: 0.095, below: 0.025, size: 0.045 },
    flag: { across: 0.1, below: -0.025, width: 0.045 },
    sponsor: { across: -0.105, below: 0.015, width: 0.06 },
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

// The chest patches, as in Doc's 2026-11-16 photos: the round ACC patch
// (Doc's logo art) on the wearer's left chest with the US flag above it,
// and the L&N Federal Credit Union patch (Doc's logo art, white on a black
// navy patch) on the wearer's right chest.
function roundPatch(ctx, cx, cy, size, img) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = W;
  ctx.fill();
  if (img) ctx.drawImage(img, cx - size * 0.44, cy - size * 0.44, size * 0.88, size * 0.88);
  ctx.restore();
}

function lnPatch(ctx, cx, cy, w, img) {
  const h = w * 0.62;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h * 0.12);
  ctx.fillStyle = '#34374F'; // the patch's dark navy twill, as in Doc's close-up
  ctx.fill();
  ctx.lineWidth = h * 0.06;
  ctx.strokeStyle = '#1F2133'; // stitched edge
  ctx.stroke();
  if (img) {
    const iw = w * 0.8;
    const ih = (img.height / img.width) * iw;
    ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih);
  }
  ctx.restore();
}

function usFlag(ctx, cx, cy, w) {
  const h = w * 0.6;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  ctx.save();
  for (let i = 0; i < 13; i++) {
    ctx.fillStyle = i % 2 ? '#FFFFFF' : '#B22234';
    ctx.fillRect(x0, y0 + (i * h) / 13, w, h / 13 + 0.0002);
  }
  ctx.fillStyle = '#3C3B6E';
  ctx.fillRect(x0, y0, w * 0.4, (h * 7) / 13);
  ctx.fillStyle = '#FFFFFF';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    ctx.beginPath();
    ctx.arc(x0 + w * 0.04 + c * w * 0.08, y0 + h * 0.06 + r * h * 0.12, w * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
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
export function paintBBAtlas(canvas, ppm, atlas, look, { wordmark, mascot, acc, sponsor }) {
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
    archText(ctx, wm.text, {
      cx, cy: front.neck + p.below, height: p.height, width: p.width, family: FONTS.jersey, fill: wm.fill,
      outlines: [{ color: wm.outline, width: p.outline }], arch: 0.003, spacing: -2,
      shadow: { dx: -0.002, dy: 0.0035, color: wm.outline }, spikeV: true,
    });
  } else if (wm.kind === 'arch') {
    const p = F.wordmark;
    archText(ctx, wm.text, { cx, cy: front.neck + p.below, height: p.height, width: p.width, family: BLOCK, fill: wm.fill, outlines: [{ color: wm.outline, width: 0.0025 }], arch: 0.002, spacing: 2 });
  }
  const n = F.number;
  numberText(ctx, look.number, { cx, cy: front.neck + n.below, height: n.height, width: n.width, outlineW: n.outline, ...J.number });
  const b = F.bars[J.barsAt === 'right' ? 'right' : 'center'];
  threeBars(ctx, cx + b.across, front.neck + b.below, b.size, J.bars);
  const pa = F.patch;
  roundPatch(ctx, cx + pa.across, front.neck + pa.below, pa.size, acc);
  const fl = F.flag;
  usFlag(ctx, cx + fl.across, front.neck + fl.below, fl.width);
  // The L&N patch sits where the three-bar goes on sets that wear it by the strap.
  if (J.barsAt !== 'right') {
    const sp = F.sponsor;
    lnPatch(ctx, cx + sp.across, front.neck + sp.below, sp.width, sponsor);
  }

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
