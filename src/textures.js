// Canvas painters: the jersey art for projection, back lettering, the ball,
// the turf and fabric normal maps.

export const FONTS = {
  jersey: '"Louisville Jersey", "Anton", Impact, sans-serif',
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

// The jersey's front art, ready to project: the V-neck is filled with the
// body color, because the 3D jersey's neckline is shallower than the drawing's
// and gets its own piping from the collar shader. Coordinates are art pixels
// (1366 x 1408), drawn at the canvas's scale.
export function paintJerseyFront(canvas, img, spec) {
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
  ctx.restore();
}

// The back: the body color, the front number set larger and higher, and an
// optional name in the Louisville jersey face, in the number's colors.
export function paintJerseyBack(canvas, img, spec, name) {
  const ctx = canvas.getContext('2d');
  const k = canvas.width / spec.art.width;
  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const [x0, y0, x1, y1] = spec.number.box;
  const sw = x1 - x0;
  const sh = y1 - y0;
  const scale = 1.2;
  const top = name ? 470 : 400;
  const sx = img.naturalWidth / spec.art.width;
  ctx.drawImage(img, x0 * sx, y0 * sx, sw * sx, sh * sx,
    (spec.art.width / 2 - (sw * scale) / 2) * k, top * k, sw * scale * k, sh * scale * k);
  if (name) {
    drawText(ctx, name, {
      family: FONTS.jersey, cx: canvas.width / 2, cy: 400 * k, height: 70 * k,
      fill: spec.number.fill, outlines: [{ color: spec.number.outline, width: 5 * k }],
    });
  }
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
