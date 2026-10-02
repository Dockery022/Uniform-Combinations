// Canvas painters: the jersey art for projection, back lettering, the ball
// and the turf.

export const FONTS = {
  jersey: '"Louisville Jersey", "Anton", Impact, sans-serif',
  block: '"Graduate", "Arial Black", Impact, sans-serif',
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
export function paintHelmetBack(canvas, area, number, shell) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const k = H / (area.top - area.bottom); // px per helmet unit
  const y = (v) => (area.top - v) * k;
  const numberH = 0.22 * k;
  drawText(ctx, number, {
    family: FONTS.jersey, cx: W / 2, cy: y(0.1), height: numberH,
    sx: Math.min(1, (0.3 * k) / textWidth(ctx, number, FONTS.jersey, numberH)),
    fill: isLight(shell) ? '#C9001F' : '#FFFFFF',
  });
  const wordH = 0.05 * k;
  drawText(ctx, 'LOUISVILLE', {
    family: FONTS.display, cx: W / 2, cy: y(-0.5), height: wordH, spacing: 4,
    sx: Math.min(1, (0.46 * k) / textWidth(ctx, 'LOUISVILLE', FONTS.display, wordH, '', 4)),
    fill: '#FFFFFF',
  });
}

// The jersey's front art, ready to project. The V-neck is filled with the
// body color, because the 3D jersey's neckline is shallower than the drawing's
// and gets its own piping from the collar shader. The art's "10" (chest and
// shoulders) is painted out; the chosen number is lettered on the chest, and
// the shoulder numbers go on as decals (paintTvDecals).
// Coordinates are art pixels (1366 x 1408), drawn at the canvas's scale.
export function paintJerseyFront(canvas, img, spec, style, number, sleeves) {
  const ctx = canvas.getContext('2d');
  const k = canvas.width / spec.art.width;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(k, k);
  ctx.fillStyle = spec.base;
  ctx.beginPath();
  for (const [x, y] of [[445, 0], [921, 0], [915, 58], [690, 392], [676, 392], [451, 58]]) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  const [x0, y0, x1, y1] = spec.number.box;
  for (const [a, b, c, d] of [spec.number.box, ...(style.tv ?? []).map((t) => t.clear)]) ctx.fillRect(a - 8, b - 8, c - a + 16, d - b + 16);
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

// The back panel: the body color. The number and name are lettered
// separately, by paintBackLettering, and the shoulder numbers are decals.
export function paintJerseyBack(canvas, spec) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// The back number, larger and higher than on the front, and an optional
// name between the collar and the number, on a transparent canvas laid over
// the back panel. The number matches the front's lettering. The name is set
// in the same face as the chest LOUISVILLE wordmark (the Louisville Jersey
// capitals are its heavy, slanted letters), in the number's fill with a
// thick outline, so the nameplate reads as the wordmark's family.
export function paintBackLettering(canvas, spec, style, number, name) {
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
    const nameH = height * 0.2;
    const spacing = 2;
    const maxW = (x1 - x0) * 1.2;
    const w = textWidth(ctx, name, FONTS.jersey, nameH, '', spacing);
    const { fill, outline } = numberColors(spec);
    drawText(ctx, name, {
      family: FONTS.jersey, spacing, cx: canvas.width / 2, cy: (top - nameH * 0.5 - 40) * k, height: nameH * k,
      sx: Math.min(1, maxW / w), fill, outlines: [{ color: outline, width: nameH * 0.09 * k }],
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
