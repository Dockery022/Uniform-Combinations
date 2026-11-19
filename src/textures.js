// Canvas painters: the jersey art for projection, back lettering, the ball
// and the turf.

export const FONTS = {
  jersey: '"Louisville Jersey", "Anton", Impact, sans-serif',
  block: '"Graduate", "Arial Black", Impact, sans-serif',
  // The 2020 sets' upright, flared-serif wordmark and nameplates.
  serif: '"Cinzel", "Trajan Pro", Georgia, serif',
  display: '"Anton", "Arial Narrow", Impact, sans-serif',
  sans: '"Gotham SSm A", "Gotham SSm B", "Gotham", "Montserrat", "HelveticaNeue", "Helvetica Neue", Helvetica, Arial, sans-serif',
};

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

// Draw text centered on (cx, cy) with a given cap height in pixels, an
// optional horizontal squeeze, and outline layers drawn outside-in.
function drawText(ctx, text, { family, weight = '', cx, cy, height, sx = 1, fill, outlines = [], skew = 0, rotate = 0, spacing = 0 }) {
  ctx.save();
  ctx.font = `${weight} 100px ${family}`;
  ctx.letterSpacing = `${spacing}px`;
  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent || 72;
  const desc = m.actualBoundingBoxDescent || 0;
  const k = height / (asc + desc);
  ctx.translate(cx, cy);
  if (rotate) ctx.rotate(rotate);
  ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.scale(sx * k, k);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const baseline = (asc - desc) / 2;
  for (const o of outlines) {
    ctx.strokeStyle = o.color;
    ctx.lineWidth = (o.width * 2) / k;
    ctx.strokeText(text, 0, baseline);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, baseline);
  ctx.restore();
}

// Width of `text` drawn by drawText at a given height, before any squeeze.
function textWidth(ctx, text, family, height, weight = '', spacing = 0) {
  ctx.save();
  ctx.font = `${weight} 100px ${family}`;
  ctx.letterSpacing = `${spacing}px`;
  const m = ctx.measureText(text);
  ctx.restore();
  return (m.width * height) / ((m.actualBoundingBoxAscent || 72) + (m.actualBoundingBoxDescent || 0));
}

// A jersey number in the jersey's own lettering: fill, outline and, for the
// shadowed styles, a drop shadow down and to the right. The Louisville
// numerals are set digit by digit the way the art sets its "10": a "1"
// narrower than the font's, other digits a little wider, and a gap between
// them. Block numerals are squeezed so "10" fills the art's number width.
function letterNumber(ctx, number, box, spec, style) {
  // Set it on a scratch canvas, then center its ink on cx: the numerals'
  // side bearings differ (a "1" sits left in its advance), so centering by
  // advance widths leaves numbers like 19 and 12 off the centerline.
  const { width: W, height: H } = ctx.canvas;
  const scratch = makeCanvas(W, H);
  const sctx = scratch.getContext('2d');
  setNumber(sctx, number, box, spec, style);
  const y0 = Math.max(0, Math.floor(box.cy - box.height * 0.7));
  const y1 = Math.min(H, Math.ceil(box.cy + box.height * 0.7));
  const data = sctx.getImageData(0, y0, W, y1 - y0).data;
  let x0 = W;
  let x1 = -1;
  for (let y = 0; y < y1 - y0; y += 2) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
  }
  const shift = x1 >= x0 ? box.cx - (x0 + x1 + 1) / 2 : 0;
  ctx.drawImage(scratch, Math.round(shift), 0);
}

function setNumber(ctx, number, { cx, cy, height, width }, spec, style) {
  const { fill, outline } = numberColors(spec);
  const outlines = [{ color: outline, width: height * 0.02 }];
  const draw = (text, x, sx) => {
    if (style.shadow) drawText(ctx, text, { family, cx: x + height * 0.03, cy: cy + height * 0.022, height, sx, fill: outline, outlines });
    drawText(ctx, text, { family, cx: x, cy, height, sx, fill, outlines });
  };
  const family = style.font === 'block' ? FONTS.block : FONTS.jersey;
  if (style.font === 'block') {
    draw(number, cx, Math.min(1.6, Math.max(0.8, width / textWidth(ctx, '10', family, height))));
    return;
  }
  const digits = [...number];
  const squeeze = digits.map((d) => (d === '1' ? 0.8 : 1.08));
  const widths = digits.map((d, i) => textWidth(ctx, d, family, height) * squeeze[i]);
  const gap = height * 0.12;
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (digits.length - 1);
  const fit = Math.min(1, (width * 1.05) / total);
  let x = cx - (total * fit) / 2;
  digits.forEach((d, i) => {
    draw(d, x + (widths[i] * fit) / 2, squeeze[i] * fit);
    x += (widths[i] + gap) * fit;
  });
}

// Shoulder or cuff numbers, drawn flat for the decals the model places on
// each shoulder (see Player.placeTv): the style's first entry (the player's
// right) on the left half of the canvas, the second on the right half. Each
// glyph fills two thirds of its half's height, upright, in the jersey's
// numerals with the number's outline.
export function paintTvDecals(canvas, spec, style, number) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const family = style.font === 'block' ? FONTS.block : FONTS.jersey;
  (style.tv ?? []).slice(0, 2).forEach((tv, i) => {
    const text = tv.digits === 'all' ? number : tv.digits === 'first' ? number[0] : number[number.length - 1];
    const height = H / 1.5;
    const w = textWidth(ctx, text, family, height);
    drawText(ctx, text, {
      family, cx: W * (i + 0.5) / 2, cy: H / 2, height, sx: Math.min(1, (W / 2 - 80) / w),
      fill: numberColors(spec).fill, outlines: [{ color: numberColors(spec).outline, width: height * 0.035 }],
    });
  });
}

// The back of the helmet, as seen from behind: the number centered on the
// shell and LOUISVILLE across the rear bumper. `area` gives the canvas's
// extent in helmet units (half-width x, top and bottom y). The number is
// Cardinal Red on light shells and white on red or black ones; the bumper
// lettering is white on the black bumper.
export function paintHelmetBack(canvas, area, number, shell, back = {}) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const k = H / (area.top - area.bottom); // px per helmet unit
  const y = (v) => (area.top - v) * k;
  if (back.number !== false) {
    const numberH = 0.22 * k;
    drawText(ctx, number, {
      family: FONTS.jersey, cx: W / 2, cy: y(0.1), height: numberH,
      sx: Math.min(1, (0.3 * k) / textWidth(ctx, number, FONTS.jersey, numberH)),
      fill: isLight(shell) ? '#C9001F' : '#FFFFFF',
    });
  }
  if (back.flag) paintFlag(ctx, W / 2 + back.flag.x * k, y(back.flag.y), back.flag.w * k);
  const word = back.word ?? 'LOUISVILLE';
  const wordH = 0.05 * k;
  drawText(ctx, word, {
    family: FONTS.display, cx: W / 2, cy: y(-0.5), height: wordH, spacing: 4,
    sx: Math.min(1, (0.46 * k) / textWidth(ctx, word, FONTS.display, wordH, '', 4)),
    fill: back.wordColor ?? '#FFFFFF',
  });
}

// A U.S. flag sticker centered on (cx, cy), `w` px wide, with a thin white border.
function paintFlag(ctx, cx, cy, w) {
  const h = w * 0.55;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x0 - w * 0.04, y0 - w * 0.04, w * 1.08, h + w * 0.08);
  for (let i = 0; i < 13; i++) {
    ctx.fillStyle = i % 2 ? '#FFFFFF' : '#B22234';
    ctx.fillRect(x0, y0 + (i * h) / 13, w, h / 13 + 0.5);
  }
  ctx.fillStyle = '#3C3B6E';
  ctx.fillRect(x0, y0, w * 0.4, (h * 7) / 13);
  ctx.fillStyle = '#FFFFFF';
  const r = w * 0.012;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) {
      ctx.beginPath();
      ctx.arc(x0 + w * 0.4 * ((col + 0.5 + (row % 2) * 0.25) / 6.25), y0 + ((h * 7) / 13) * ((row + 0.5) / 5), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// The jersey's front art, ready to project. The V-neck is filled with the
// body color, because the 3D jersey's neckline is shallower than the drawing's
// and gets its own piping from the collar shader. The art's "10" (chest and
// shoulders) is painted out; the chosen number is lettered on the chest, and
// the shoulder numbers go on as decals (paintTvDecals). A repainted jersey
// (JERSEY_REPAINT) gets its shoulders, logos and wordmark redrawn first.
// Coordinates are art pixels (1366 x 1408), drawn at the canvas's scale.
export function paintJerseyFront(canvas, img, spec, style, number, sleeves, repaint) {
  const ctx = canvas.getContext('2d');
  const k = canvas.width / spec.art.width;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(k, k);
  if (repaint) repaintFront(ctx, img, spec, repaint);
  ctx.fillStyle = spec.base;
  ctx.beginPath();
  for (const [x, y] of [[445, 0], [921, 0], [915, 58], [690, 392], [676, 392], [451, 58]]) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  const [x0, y0, x1, y1] = spec.number.box;
  // A repaint has already painted out the art's shoulder digits with the caps.
  for (const [a, b, c, d] of [spec.number.box, ...(repaint ? [] : (style.tv ?? []).map((t) => t.clear))]) ctx.fillRect(a - 8, b - 8, c - a + 16, d - b + 16);
  // Sleeve bands from game photos replace the drawn sleeve stripes.
  if (sleeves) {
    for (const [x, w] of [[0, 205], [1161, 205]]) {
      ctx.fillStyle = spec.base;
      ctx.fillRect(x, 175, w, 345);
      for (const [top, bottom, color] of sleeves) {
        ctx.fillStyle = color;
        ctx.fillRect(x, top, w, bottom - top);
      }
    }
  }
  ctx.restore();

  letterNumber(ctx, number, {
    cx: ((x0 + x1) / 2) * k, cy: ((y0 + y1) / 2) * k, height: (y1 - y0) * 0.94 * k, width: (x1 - x0) * 0.94 * k,
  }, spec, style);
}

// The back panel: the body color, plus the shoulder patches of a repainted
// jersey, drawn from where the model's shoulder line lands on the panel
// (landmarks.backShoulderY). The number and name are lettered separately,
// by paintBackLettering, and the shoulder numbers are decals.
export function paintJerseyBack(canvas, spec, repaint, landmarks) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (repaint?.claw) {
    ctx.save();
    ctx.scale(canvas.width / spec.art.width, canvas.width / spec.art.width);
    paintShoulderPatches(ctx, spec.art.width, repaint.claw, SHOULDER_PATCH.back, landmarks?.backShoulderY ?? 84);
    ctx.restore();
  }
}

// The sleeve panel: both sleeves unwrapped around the upper arm, the
// player's right sleeve on the left half of the canvas and the left sleeve
// on the right half. Within a sleeve, u runs around the arm from the armpit
// (0), over the back, the outer seam (0.5) and the front, back to the
// armpit (1); v runs down from the top seam (0) to the hem (1). See
// Player.projectJersey, which wraps it.
export const SLEEVE_PANEL = { width: 2048, height: 512 };
// The art's hanging sleeves (front view), in art pixels: each box maps onto
// the front half of its sleeve from the outer side to the armpit, top seam
// to hem; the back half gets its mirror, so the drawn bands run around the
// arm. (The player's left sleeve is on the art's right.)
const ART_SLEEVES = { top: 290, bottom: 500, left: { outerX: 1316, innerX: 1176 }, right: { outerX: 40, innerX: 190 } };

// Paints the sleeve panel from the painted front art (its hanging sleeves,
// bands and all), then a repainted jersey's claws over it.
export function paintJerseySleeves(canvas, front, spec, repaint) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const k = front.width / spec.art.width;
  const S = ART_SLEEVES;
  const q = W / 4; // half a sleeve
  for (const [name, x0] of [['right', 0], ['left', W / 2]]) {
    const { outerX, innerX } = S[name];
    const sx = Math.min(outerX, innerX) * k;
    const sw = Math.abs(innerX - outerX) * k;
    const sy = S.top * k;
    const sh = (S.bottom - S.top) * k;
    // Front half (u 0.5 to 1) reads outer side to armpit left to right; the
    // back half (0 to 0.5) armpit to outer side, so the seam meets itself.
    for (const [dx, flip] of [[x0 + q, outerX > innerX], [x0, outerX < innerX]]) {
      ctx.save();
      ctx.translate(dx + (flip ? q : 0), 0);
      ctx.scale(flip ? -1 : 1, 1);
      ctx.drawImage(front, sx, sy, sw, sh, 0, 0, q, H);
      ctx.restore();
    }
  }
  if (repaint?.claw) {
    for (const x0 of [0, W / 2]) paintSleeveClaws(ctx, x0, W / 2, H, repaint.claw);
  }
}

// ---------- 2020 sets: claw shoulders (JERSEY_REPAINT in team.js) ----------
//
// From Doc's 2019 game photos: the shoulder top, chest and back stay the
// jersey color (the shoulder number sits on the top, inboard). A patch in
// the contrast color covers the rear-outer corner of each shoulder pad and
// the top of the sleeve behind it, its inner edges cut into claw points
// that rake in toward the collar and the spine. From the patch three long
// claws rake forward and down across the outer sleeve, the sleeve color
// wedged between them, with a thin accent streak along each claw. The
// wordmark is an upright flared serif; the nameplate uses the same face.

// Where the patch reaches onto the torso panels, in art pixels for the
// player's right shoulder (the art's left half; mirrored for the other).
// `edge` is its inner boundary, top to bottom, with y measured from the
// shoulder line (0 on the front, where the shoulder top projects to the
// top of the art; `shoulderY` on the back); everything outboard of it is
// filled. The front keeps to the top-outer corner so the front slope of
// the pad and the chest stay clear; the back runs further in along the
// yoke and down the outer edge, as in the photos.
const SHOULDER_PATCH = {
  front: [[285, 0], [285, 60], [250, 110], [280, 135], [230, 175], [255, 195], [190, 240], [140, 300]],
  back: [[340, -84], [340, 20], [300, 70], [345, 90], [270, 150], [310, 170], [230, 230], [175, 280]],
};
function paintShoulderPatches(ctx, W, { cap }, edge, shoulderY = 0) {
  for (const flip of [false, true]) {
    ctx.save();
    if (flip) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.moveTo(0, Math.max(0, shoulderY + edge[0][1]));
    for (const [x, y] of edge) ctx.lineTo(x, Math.max(0, shoulderY + y));
    ctx.lineTo(0, shoulderY + edge[edge.length - 1][1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// The sleeve, in panel units (u around the arm: 0.25 the back, 0.5 the
// outer seam, 0.75 the front; v down from the top seam). `paw` is the
// patch on the upper back and outer sleeve, with points raking down its
// lower edge. Each claw is [u0, v0, u1, v1, width]: it starts on the paw's
// front boundary, fat, and tapers to a point toward the front of the arm.
// The accent streak runs along each claw's lower (hem-side) edge.
const SLEEVE_CLAW = {
  paw: [[0.14, 0], [0.66, 0], [0.62, 0.12], [0.52, 0.20], [0.42, 0.28], [0.34, 0.36], [0.30, 0.52], [0.24, 0.42], [0.18, 0.54], [0.14, 0.36]],
  claws: [[0.60, 0.08, 0.85, 0.60, 0.08], [0.50, 0.18, 0.77, 0.72, 0.08], [0.40, 0.28, 0.67, 0.78, 0.075]],
  accent: { width: 0.016, gap: 0.028, from: 0.1, to: 0.85 },
};
function paintSleeveClaws(ctx, x0, w, h, { cap, accent = '#FFFFFF' }) {
  const X = (u) => x0 + u * w;
  const Y = (v) => v * h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, w, h);
  ctx.clip();
  ctx.fillStyle = cap;
  ctx.beginPath();
  for (const [u, v] of SLEEVE_CLAW.paw) ctx.lineTo(X(u), Y(v) - (v === 0 ? 2 : 0));
  ctx.closePath();
  ctx.fill();
  for (const [u0, v0, u1, v1, cw] of SLEEVE_CLAW.claws) clawStreak(ctx, X(u0), Y(v0), X(u1), Y(v1), cw * w, cap);
  // A thin accent streak along the lower edge of each claw, in the gap
  // beside it.
  const A = SLEEVE_CLAW.accent;
  for (const [u0, v0, u1, v1, cw] of SLEEVE_CLAW.claws) {
    const dx = X(u1) - X(u0);
    const dy = Y(v1) - Y(v0);
    const len = Math.hypot(dx, dy);
    // Unit normal toward the hem side (lower u, higher v).
    const nx = -dy / len;
    const ny = dx / len;
    const off = (cw * w) / 2 + A.gap * w;
    const sx = X(u0) + dx * A.from + nx * off;
    const sy = Y(v0) + dy * A.from + ny * off;
    const ex = X(u0) + dx * A.to + nx * off * 0.6;
    const ey = Y(v0) + dy * A.to + ny * off * 0.6;
    clawStreak(ctx, sx, sy, ex, ey, A.width * w, accent);
  }
  ctx.restore();
}

// A claw streak from (x0, y0), `w` wide, tapering to a point at (x1, y1),
// bowed a little like a raked claw.
function clawStreak(ctx, x0, y0, x1, y1, w, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const n = 20;
  const side = (sgn) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const bow = Math.sin(Math.PI * t) * len * 0.03;
      const half = (w / 2) * Math.pow(1 - t, 0.8);
      pts.push([x0 + dx * t + nx * (bow + sgn * half), y0 + dy * t + ny * (bow + sgn * half)]);
    }
    return pts;
  };
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const [x, y] of side(1)) ctx.lineTo(x, y);
  for (const [x, y] of side(-1).reverse()) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

// The upper front of a repainted jersey, in art pixels: everything above
// the number (the drawn sleeve stripes, yoke lines, logos and wordmark) is
// painted out, then the shoulder patches, the art's own ACC patch and
// three-bar mark moved in beside the collar, and the serif wordmark go on.
const ART_LOGOS = { acc: [255, 255, 160, 92], mark: [948, 249, 132, 94] }; // x, y, w, h in the 1366 px art
const ART_WORDMARK = { cx: 686, cy: 449, height: 58, width: 430 };
function repaintFront(ctx, img, spec, rp) {
  const W = spec.art.width;
  const s = img.width / W;
  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, W, 560);
  if (rp.claw) paintShoulderPatches(ctx, W, rp.claw, SHOULDER_PATCH.front, 0);
  const logos = rp.logos ?? { inset: 110, drop: 30 };
  for (const [key, dir] of [['acc', 1], ['mark', -1]]) {
    const [x, y, w, h] = ART_LOGOS[key];
    ctx.drawImage(img, x * s, y * s, w * s, h * s, x + dir * logos.inset, y + logos.drop, w, h);
  }
  if (rp.wordmark) {
    const { cx, cy, height, width } = ART_WORDMARK;
    const family = FONTS.serif;
    const weight = '900';
    const spacing = 6;
    const w = textWidth(ctx, 'LOUISVILLE', family, height, weight, spacing);
    drawText(ctx, 'LOUISVILLE', {
      family, weight, spacing, cx, cy, height, sx: Math.min(1.25, width / w),
      fill: rp.wordmark.fill, outlines: [{ color: rp.wordmark.outline, width: 4 }],
    });
  }
}

// The back number, larger and higher than on the front, and an optional
// name between the collar and the number, on a transparent canvas laid over
// the back panel. The number matches the front's lettering. The name is set
// in the same face as the chest LOUISVILLE wordmark (the Louisville Jersey
// capitals are its heavy, slanted letters), black on light jerseys and in
// the number's fill on dark ones, like the real nameplates.
export function paintBackLettering(canvas, spec, style, number, name, repaint) {
  const ctx = canvas.getContext('2d');
  const k = canvas.width / spec.art.width;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const [x0, y0, x1, y1] = spec.number.box;
  const height = (y1 - y0) * 1.12;
  const top = name ? 450 : 400;
  // Lettered exactly like the chest number (same numerals, fill and outline), only larger.
  letterNumber(ctx, number, {
    cx: (spec.art.width / 2) * k, cy: (top + height / 2) * k, height: height * k, width: (x1 - x0) * 1.12 * k,
  }, spec, style);
  if (name) {
    // A repainted jersey's nameplate follows its photos: the serif of its
    // wordmark, in the plate color (red on the 2020 black and white sets,
    // white on the red).
    const plate = repaint?.nameplate;
    const nameH = height * (plate ? 0.17 : 0.2);
    const spacing = plate ? 6 : 2;
    const maxW = (x1 - x0) * 1.2;
    const family = plate ? FONTS.serif : FONTS.jersey;
    const weight = plate ? '900' : '';
    const w = textWidth(ctx, name, family, nameH, weight, spacing);
    drawText(ctx, name, {
      family, weight, spacing, cx: canvas.width / 2, cy: (top - nameH * 0.5 - 40) * k, height: nameH * k,
      sx: Math.min(1, maxW / w), fill: plate?.fill ?? (isLight(spec.base) ? '#000000' : numberColors(spec).fill),
    });
  }
}

// Number fill and outline. The spec's colors are already on the brand
// palette (tools/palette.py): Cardinal Red #C9001F on #000000 for the white
// sets, White or Silver fills on the dark ones, gold on the two gold alternates.
export function numberColors(spec) {
  return { fill: spec.number.fill, outline: spec.number.outline };
}

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160;
}

// Horizontal center of the opaque pixels, in canvas pixels.
export function alphaCenterX(canvas) {
  const { width: W, height: H } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  let x0 = W;
  let x1 = 0;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
  }
  return x1 >= x0 ? (x0 + x1) / 2 : W / 2;
}

export function paintBall(canvas) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  ctx.fillStyle = '#6a3518';
  ctx.fillRect(0, 0, W, H);
  // Pebble grain.
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,220,180,0.05)';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // Seams.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (const u of [0, 0.25, 0.5, 0.75]) ctx.fillRect(u * W - 1, H * 0.06, 3, H * 0.88);
  // Stripes on the top half only, as on a college ball.
  ctx.fillStyle = '#f2f2ef';
  for (const v of [0.24, 0.76]) ctx.fillRect(W * 0.02, v * H - H * 0.022, W * 0.46, H * 0.044);
  // Laces at u = 0.25.
  ctx.fillRect(W * 0.25 - 3, H * 0.33, 6, H * 0.34);
  for (let i = 0; i < 8; i++) {
    const y = H * (0.35 + i * 0.043);
    ctx.fillRect(W * 0.25 - 14, y, 28, 7);
  }
}

// Turf disc under the player, centered on a yard line.
export function paintTurf(canvas) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const cx = W / 2;
  const cy = H / 2;
  const radiusM = 3.2;
  const pxPerM = W / (radiusM * 2);

  // Mowing pattern: alternating 5-yard bands break at the yard line.
  ctx.fillStyle = '#123520';
  ctx.fillRect(0, 0, W, H / 2);
  ctx.fillStyle = '#0f2c1a';
  ctx.fillRect(0, H / 2, W, H / 2);

  // Grain.
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(120,200,140,0.05)';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 3);
  }

  // Yard line (4 inches wide) through the player's feet, running sideline to sideline.
  ctx.fillStyle = 'rgba(245,245,240,0.86)';
  const line = 0.1016 * pxPerM;
  ctx.fillRect(0, cy - line / 2, W, line);
  // One-yard hash ticks along the inbounds line.
  const yard = 0.9144 * pxPerM;
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const y = cy + i * yard;
    ctx.fillRect(cx + 1.6 * pxPerM, y - line / 2, 0.61 * pxPerM, line);
    ctx.fillRect(cx - 1.6 * pxPerM - 0.61 * pxPerM, y - line / 2, 0.61 * pxPerM, line);
  }

  // Fade to transparent at the rim.
  ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createRadialGradient(cx, cy, W * 0.12, cx, cy, W * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.65, 'rgba(0,0,0,0.75)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}
