// Canvas painters: jersey lettering, helmet decals, the ball, the turf and
// fabric normal maps. Stripe patterns are shared with the shaders in model.js.
import { hex } from './combo.js';
import { TEAM } from './team.js';

export const FONTS = {
  block: '"Graduate", "Arial Black", Impact, sans-serif',
  modern: '"Anton", "Arial Narrow", Impact, sans-serif',
  script: '"Yellowtail", "Brush Script MT", cursive',
};

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

// Stripe patterns as bands across a center line: offset and width in meters.
export function stripeBands(style, c1, c2) {
  switch (style) {
    case 'single': return [{ at: 0, w: 0.026, color: c1 }];
    case 'double': return [{ at: -0.0135, w: 0.014, color: c1 }, { at: 0.0135, w: 0.014, color: c1 }];
    case 'tri': return [
      { at: -0.0195, w: 0.007, color: c2 }, { at: 0, w: 0.02, color: c1 }, { at: 0.0195, w: 0.007, color: c2 },
    ];
    case 'triple': return [
      { at: -0.024, w: 0.011, color: c1 }, { at: 0, w: 0.011, color: c2 }, { at: 0.024, w: 0.011, color: c1 },
    ];
    default: return [];
  }
}

// Draw text centered on (cx, cy) with a given cap height in pixels, an
// optional horizontal squeeze, and outline layers drawn outside-in.
function drawText(ctx, text, { family, cx, cy, height, sx = 1, fill, outlines = [], skew = 0, rotate = 0 }) {
  ctx.save();
  ctx.font = `100px ${family}`;
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

function numberOutlines(jersey, px) {
  const inner = hex(jersey.trimColor);
  const outer = hex(jersey.trimColor2);
  if (jersey.numberTrim === 'single') return [{ color: inner, width: px * 0.9 }];
  if (jersey.numberTrim === 'double') return [{ color: outer, width: px * 1.7 }, { color: inner, width: px * 0.85 }];
  return [];
}

// Jersey lettering on the jersey's UV layout (a 2.5 : 1 sheet). The front
// panel is centered at u = 0.578, the back panel at u = 0.855; v runs from
// the collar (0) down to the hem (1). Heights are fractions of the sheet.
// Each sleeve is its own piece: centered at u = 0.115 / 0.327, armhole seam
// along v = 0.207 and a curved hem along v = 0.339 + 8 * (u - center)^2.
export const JERSEY_LAYOUT = {
  front: { u: 0.578, wordmark: { v: 0.37, h: 0.036 }, number: { v: 0.535, h: 0.2 } },
  back: { u: 0.856, name: { v: 0.25, h: 0.042 }, number: { v: 0.51, h: 0.235 } },
  sleeves: { centers: [0.115, 0.327], halfWidth: 0.1, hemV: 0.339, hemCurve: 8, number: { v: 0.268, h: 0.055 } },
  vPerMeter: 0.81,
};

export function paintJersey(canvas, combo) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const j = combo.jersey;
  const L = JERSEY_LAYOUT;
  ctx.fillStyle = hex(j.base);
  ctx.fillRect(0, 0, W, H);

  const family = FONTS[j.numberFont] ?? FONTS.block;
  const fill = hex(j.numberFill);
  const outlines = numberOutlines(j, H * 0.0065);

  drawText(ctx, j.number, { family, cx: L.front.u * W, cy: L.front.number.v * H, height: L.front.number.h * H, fill, outlines });
  if (j.chest === 'wordmark') {
    drawText(ctx, TEAM.wordmark, {
      family, cx: L.front.u * W, cy: L.front.wordmark.v * H, height: L.front.wordmark.h * H, fill,
      outlines: j.numberTrim === 'none' ? [] : [{ color: hex(j.trimColor), width: H * 0.003 }],
    });
  }
  drawText(ctx, j.number, { family, cx: L.back.u * W, cy: L.back.number.v * H, height: L.back.number.h * H, fill, outlines });
  if (j.name) {
    drawText(ctx, j.name, { family, cx: L.back.u * W, cy: L.back.name.v * H, height: L.back.name.h * H, fill });
  }

  // Sleeve stripes run parallel to the curved hem; sleeve numbers sit above them.
  const S = L.sleeves;
  const bands = stripeBands(j.sleeveStripe, hex(j.stripeColor), hex(j.stripeColor2));
  for (const c of S.centers) {
    for (const band of bands) {
      const lift = (0.045 + band.at) * L.vPerMeter;
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const du = -S.halfWidth + (2 * S.halfWidth * k) / 40;
        const v = S.hemV + S.hemCurve * du * du - lift;
        if (k === 0) ctx.moveTo((c + du) * W, v * H);
        else ctx.lineTo((c + du) * W, v * H);
      }
      ctx.strokeStyle = band.color;
      ctx.lineWidth = band.w * L.vPerMeter * H;
      ctx.lineCap = 'butt';
      ctx.stroke();
    }
    if (j.tvNumbers) {
      drawText(ctx, j.number, {
        family, cx: c * W, cy: S.number.v * H, height: S.number.h * H, fill, outlines: numberOutlines(j, H * 0.0025),
      });
    }
  }
}

// Tileable tangent-space normal maps for fabric: a knit mesh for jerseys,
// diagonal twill for pants and vertical ribs for socks.
export function fabricNormal(kind, size = 128) {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      let h;
      if (kind === 'knit') h = Math.pow(Math.max(0, Math.sin(u * 8) * Math.sin(v * 8)), 0.6) - 0.15 * Math.cos(v * 16);
      else if (kind === 'twill') h = Math.sin((u + v) * 12);
      else h = Math.pow(Math.abs(Math.sin(u * 6)), 0.5);
      height[y * size + x] = h;
    }
  }
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 1.5;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 1.5;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Side decal on a transparent square.
export function paintDecal(canvas, combo, image) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const h = combo.helmet;
  ctx.clearRect(0, 0, W, H);
  const fill = hex(h.decalColor);
  const outlines = [{ color: hex(h.decalTrim), width: W * 0.022 }];
  if (h.decal === 'letter') {
    drawText(ctx, TEAM.school[0], { family: FONTS.block, cx: W / 2, cy: H / 2, height: H * 0.62, fill, outlines });
  } else if (h.decal === 'script') {
    drawText(ctx, TEAM.script ?? TEAM.nickname, {
      family: FONTS.script, cx: W / 2, cy: H * 0.5, height: H * 0.34, sx: 0.92, fill, outlines, rotate: -0.16,
    });
  } else if (h.decal === 'number') {
    drawText(ctx, combo.jersey.number, {
      family: FONTS[combo.jersey.numberFont] ?? FONTS.block, cx: W / 2, cy: H / 2, height: H * 0.5, fill, outlines,
    });
  } else if (h.decal === 'custom' && image) {
    const scale = Math.min((W * 0.9) / image.width, (H * 0.9) / image.height);
    const w = image.width * scale;
    const ih = image.height * scale;
    ctx.drawImage(image, (W - w) / 2, (H - ih) / 2, w, ih);
  }
}

// Leather ball: half-stripes near each tip and a lace row.
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
