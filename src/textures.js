// Canvas painters for every printed part of the uniform. Each painter works in
// real-world meters and converts to pixels with the layout it is handed, so
// numbers and stripes keep true proportions on the curved meshes.
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

// Torso wraps a lathe whose seam sits at the center of the back:
// u = 0.5 is the chest, u = 0 / 1 is the spine.
export function paintTorso(canvas, combo, layout) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const j = combo.jersey;
  const pxV = H / layout.length;
  const squeezeAt = (y) => (W / (2 * Math.PI * layout.radiusAt(y))) / pxV;
  const outlinePx = 0.0075 * pxV;

  ctx.fillStyle = hex(j.base);
  ctx.fillRect(0, 0, W, H);

  const family = FONTS[j.numberFont] ?? FONTS.block;
  const fill = hex(j.numberFill);
  const outlines = numberOutlines(j, outlinePx);

  // Front number and chest wordmark.
  drawText(ctx, j.number, {
    family, cx: W / 2, cy: layout.yToCanvas(0.195, H), height: 0.225 * pxV, sx: squeezeAt(0.195), fill, outlines,
  });
  if (j.chest === 'wordmark') {
    drawText(ctx, TEAM.wordmark, {
      family, cx: W / 2, cy: layout.yToCanvas(0.328, H), height: 0.022 * pxV, sx: squeezeAt(0.328), fill,
      outlines: j.numberTrim === 'none' ? [] : [{ color: hex(j.trimColor), width: outlinePx * 0.45 }],
    });
  }

  // Back number and nameplate, drawn twice so the seam splits them cleanly.
  for (const cx of [0, W]) {
    drawText(ctx, j.number, {
      family, cx, cy: layout.yToCanvas(0.175, H), height: 0.25 * pxV, sx: squeezeAt(0.175), fill, outlines,
    });
    if (j.name) {
      drawText(ctx, j.name, {
        family, cx, cy: layout.yToCanvas(0.326, H), height: 0.026 * pxV, sx: squeezeAt(0.326), fill,
      });
    }
  }
}

// Sleeve cylinder: the outer side of each arm sits at u = 0.25.
export function paintSleeve(canvas, combo, layout) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const j = combo.jersey;
  const pxV = H / layout.length;
  const pxU = W / layout.circumference;

  ctx.fillStyle = hex(j.base);
  ctx.fillRect(0, 0, W, H);

  const bands = stripeBands(j.sleeveStripe, hex(j.stripeColor), hex(j.stripeColor2));
  const center = H - 0.04 * pxV;
  for (const b of bands) {
    ctx.fillStyle = b.color;
    ctx.fillRect(0, center + b.at * pxV - (b.w * pxV) / 2, W, b.w * pxV);
  }

  if (j.tvNumbers) {
    const cy = (bands.length ? 0.058 : 0.07) * pxV;
    drawText(ctx, j.number, {
      family: FONTS[j.numberFont] ?? FONTS.block,
      cx: W * 0.25, cy, height: (bands.length ? 0.05 : 0.06) * pxV, sx: pxU / pxV,
      fill: hex(j.numberFill), outlines: numberOutlines(j, 0.0028 * pxV),
    });
  }
}

// Thigh: one stripe down the outer seam at u = 0.25.
export function paintThigh(canvas, combo, layout) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const p = combo.pants;
  const pxU = W / layout.circumference;
  ctx.fillStyle = hex(p.base);
  ctx.fillRect(0, 0, W, H);
  for (const b of stripeBands(p.stripe, hex(p.stripeColor), hex(p.stripeTrim))) {
    ctx.fillStyle = b.color;
    ctx.fillRect(W * 0.25 + b.at * pxU - (b.w * pxU) / 2, 0, b.w * pxU, H);
  }
}

// Pelvis: stripes on both hips (u = 0.25 and 0.75).
export function paintPelvis(canvas, combo, layout) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const p = combo.pants;
  const pxU = W / layout.circumference;
  ctx.fillStyle = hex(p.base);
  ctx.fillRect(0, 0, W, H);
  for (const u of [0.25, 0.75]) {
    for (const b of stripeBands(p.stripe, hex(p.stripeColor), hex(p.stripeTrim))) {
      ctx.fillStyle = b.color;
      ctx.fillRect(W * u + b.at * pxU - (b.w * pxU) / 2, 0, b.w * pxU, H);
    }
  }
}

// Sock: horizontal bands near the top of the calf.
export function paintSock(canvas, combo, layout) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const s = combo.socks;
  const pxV = H / layout.length;
  ctx.fillStyle = hex(s.base);
  ctx.fillRect(0, 0, W, H);
  const color = hex(s.stripeColor);
  const bands = s.stripe === 'single'
    ? [{ at: 0.09, w: 0.032 }]
    : s.stripe === 'double' ? [{ at: 0.075, w: 0.016 }, { at: 0.108, w: 0.016 }] : [];
  ctx.fillStyle = color;
  for (const b of bands) ctx.fillRect(0, b.at * pxV - (b.w * pxV) / 2, W, b.w * pxV);
}

// Helmet shell: the sphere's poles point out the ear holes, so the center
// stripe that runs front to back is a horizontal band across the middle.
export function paintShell(canvas, combo, layout) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const h = combo.helmet;
  const pxV = H / layout.length;
  ctx.fillStyle = hex(h.shell);
  ctx.fillRect(0, 0, W, H);
  for (const b of stripeBands(h.stripe, hex(h.stripeColor), hex(h.stripeTrim))) {
    ctx.fillStyle = b.color;
    ctx.fillRect(0, H / 2 + b.at * pxV - (b.w * pxV) / 2, W, b.w * pxV);
  }
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
