// The ACC football patch, drawn as clean vector shapes into its own small texture: a color map and a
// stitch normal map. The patch is an embroidered badge about 70 mm wide, so it gets a canvas at a
// quarter of a millimeter per texel (painted 4x larger and filtered down) instead of sharing the jersey
// art's density, which keeps the satin stitches and the thin laces readable up close.
//
// Everything is drawn in patch units: u across (0..1 over the patch's 70 mm), v down, so the shapes do
// not depend on the texture size. Shapes follow the reference photo's layout (shape only; no pixel of
// the photo is used): a football outline with pointed ends and a stitched border that has two gaps in
// the upper curve, a short arch with a row of laces over it, a bold italic ACC, and a bar under it.

export const ACC_PATCH = {
  widthM: 0.07, // the embroidered patch itself
  marginM: 0.002, // transparent room round it in the texture
  texelM: 0.00025, // meters per texel of the final texture
  ss: 4, // supersampling, filtered down to the final size
  red: '#C9001F',
  white: '#FFFFFF',
  aspect: 0.545, // patch height / width
  pitchM: 0.0007, // spacing of the satin stitches
  heightStrength: 2.4, // normal-map relief of the thread
  edgeRaiseM: 0.0012, // how far in from the edge the patch rolls up
};

// Path of an arc-bounded football with the given inset, as explicit points (so the border can be stroked in pieces).
function lensPoints(W, H, inset, n = 120) {
  const c = H / 2;
  const half = W / 2 - inset * 1.15;
  const sag = H / 2 - inset;
  const R = (half * half + sag * sag) / (2 * sag);
  const a0 = Math.asin(half / R);
  const pts = { top: [], bottom: [] };
  for (let i = 0; i <= n; i++) {
    const a = -a0 + (2 * a0 * i) / n; // angle from the vertical through the arc's center
    const x = W / 2 + R * Math.sin(a);
    const dy = R * Math.cos(a) - (R - sag);
    pts.top.push([x, c - dy]);
    pts.bottom.push([x, c + dy]);
  }
  return pts;
}

function strokePoly(ctx, pts, width) {
  ctx.lineWidth = width;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

// The red parts, as masks by stitch direction. Each is drawn white on a transparent canvas of W x H (patch units * k).
function drawMasks(k, W, H) {
  const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k); const g = c.getContext('2d'); g.scale(k, k); g.fillStyle = g.strokeStyle = '#fff'; return [c, g]; };
  const [border, gb] = mk();
  const [text, gt] = mk();
  const [bar, gr] = mk();
  const [laces, gl] = mk();
  const stroke = 0.04 * W; // border thread width
  const inset = 0.03 * W + stroke / 2;
  const L = lensPoints(W, H, inset);
  // Border: both arcs, with a gap in the upper curve on each side.
  const gapAt = [0.10, 0.88]; // fraction along the upper curve
  const gapW = 0.028;
  const frac = (i) => i / (L.top.length - 1);
  const upper = [];
  let seg = [];
  L.top.forEach((p, i) => {
    const f = frac(i);
    const inGap = gapAt.some((g) => Math.abs(f - g) < gapW) || (f > 0.3 && f < 0.72); // the arch takes the border's place at the top
    if (inGap) { if (seg.length) upper.push(seg); seg = []; } else seg.push(p);
  });
  if (seg.length) upper.push(seg);
  for (const s of upper) strokePoly(gb, s, stroke);
  const lowerSegs = [L.bottom];
  for (const s of lowerSegs) strokePoly(gb, s, stroke);
  // The arch the laces sit in: a short heavy bridge with its feet turned down.
  const ax0 = W * 0.335;
  const ax1 = W * 0.69;
  const ay = H * 0.19;
  gb.lineWidth = stroke * 0.75;
  gb.lineCap = 'butt';
  gb.beginPath();
  gb.moveTo(ax0, ay + H * 0.06);
  gb.quadraticCurveTo(ax0 + W * 0.005, ay - H * 0.07, ax0 + W * 0.06, ay - H * 0.09);
  gb.lineTo(ax1 - W * 0.06, ay - H * 0.09);
  gb.quadraticCurveTo(ax1 - W * 0.005, ay - H * 0.07, ax1, ay + H * 0.06);
  gb.stroke();
  // Laces: five short slanted bars across the top of the arch.
  const lw = W * 0.02;
  for (let i = 0; i < 5; i++) {
    const x = W * (0.4 + i * 0.062);
    const lean = (i - 2) * -0.004 * W;
    gl.lineWidth = lw;
    gl.lineCap = 'butt';
    gl.beginPath();
    gl.moveTo(x + lean, ay - H * 0.17);
    gl.lineTo(x - lean, ay - H * 0.125);
    gl.stroke();
  }
  // ACC: bold italic capitals in the sans, filled and slightly stroked for heft.
  const th = H * 0.31;
  gt.font = `800 ${th * 1.38}px "Montserrat", "Arial Black", sans-serif`;
  gt.textAlign = 'center';
  gt.textBaseline = 'alphabetic';
  gt.save();
  gt.translate(W * 0.475, H * 0.60);
  gt.transform(1, 0, -0.5, 1, 0, 0);
  gt.lineJoin = 'miter';
  gt.lineWidth = H * 0.016;
  const tw = gt.measureText('ACC').width;
  const sx = (W * 0.50) / tw;
  gt.scale(sx, 1);
  gt.strokeText('ACC', 0, 0);
  gt.fillText('ACC', 0, 0);
  gt.restore();
  // The bar under it: thinner than the letters and reaching out beneath them, its right end cut on the slant.
  gr.beginPath();
  const by = H * 0.675;
  const bh = H * 0.032;
  gr.moveTo(W * 0.15, by + bh);
  gr.lineTo(W * 0.175, by);
  gr.lineTo(W * 0.78, by);
  gr.lineTo(W * 0.76, by + bh);
  gr.closePath();
  gr.fill();
  return { border, text, bar, laces };
}

function blur(src, radiusPx) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  g.filter = `blur(${radiusPx}px)`;
  g.drawImage(src, 0, 0);
  return c;
}

// Returns { color, normal, widthM, heightM }: both canvases ready to become textures (not premultiplied in the canvas;
// the color texture is uploaded premultiplied by the caller).
export function paintAccPatch(cfg = ACC_PATCH) {
  const k0 = 1 / cfg.texelM; // texels per meter
  const widthTex = Math.ceil((cfg.widthM + 2 * cfg.marginM) * k0);
  const heightTex = Math.ceil((cfg.widthM * cfg.aspect + 2 * cfg.marginM) * k0);
  const widthM = widthTex / k0;
  const heightM = heightTex / k0;
  const ss = cfg.ss;
  const K = cfg.widthM * k0 * ss; // hi-res pixels per patch unit (patch width = 1)
  // Work in patch units: W = 1, H = aspect; the canvas has the margin around it.
  const hw = widthTex * ss;
  const hh = heightTex * ss;
  const padU = cfg.marginM / cfg.widthM;
  const mkHi = () => { const c = document.createElement('canvas'); c.width = hw; c.height = hh; return c; };
  const maskSet = (() => {
    const inner = drawMasks(K, 1, cfg.aspect);
    const out = {};
    for (const [name, cvs] of Object.entries(inner)) {
      const c = mkHi();
      c.getContext('2d').drawImage(cvs, Math.round(padU * K), Math.round(padU * K));
      out[name] = c;
    }
    return out;
  })();
  // Silhouette: the football with a thin white merrowed edge outside the border.
  const sil = mkHi();
  {
    const g = sil.getContext('2d');
    g.save();
    g.translate(Math.round(padU * K), Math.round(padU * K));
    g.scale(K, K);
    g.fillStyle = '#fff';
    const L = lensPoints(1, cfg.aspect, 0.0);
    g.beginPath();
    L.top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    [...L.bottom].reverse().forEach(([x, y]) => g.lineTo(x, y));
    g.closePath();
    g.fill();
    g.restore();
  }
  const get = (c) => c.getContext('2d').getImageData(0, 0, hw, hh).data;
  const mB = get(maskSet.border);
  const mT = get(maskSet.text);
  const mR = get(maskSet.bar);
  const mL = get(maskSet.laces);
  const mS = get(sil);
  // Edge roll: a blurred silhouette gives the raised rim.
  const rim = get(blur(sil, Math.max(1, cfg.edgeRaiseM * k0 * ss)));
  const color = new Uint8ClampedArray(hw * hh * 4);
  const height = new Float32Array(hw * hh);
  const cx = padU + 0.5;
  const cy = padU + cfg.aspect / 2;
  const pitch = cfg.pitchM / cfg.widthM; // patch units
  const TAU = Math.PI * 2;
  const red = [0xC9, 0x00, 0x1F];
  const white = [255, 255, 255];
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      const i = y * hw + x;
      const u = x / K;
      const v = y / K;
      const inSil = mS[i * 4 + 3] / 255;
      if (inSil < 0.003) continue;
      const aB = mB[i * 4 + 3] / 255;
      const aT = mT[i * 4 + 3] / 255;
      const aR = mR[i * 4 + 3] / 255;
      const aL = mL[i * 4 + 3] / 255;
      const aRed = Math.min(1, aB + aT + aR + aL);
      // Thread direction by part: radial round the border and arch, across the letters, along the bar's ends.
      let ph;
      if (aB >= aT && aB >= aR && aB >= aL) ph = Math.atan2((v - cy) * 1.0, (u - cx)) * 0.3 / pitch;
      else if (aT >= aR && aT >= aL) ph = (v + 0.3 * u) / pitch;
      else if (aR >= aL) ph = u / pitch;
      else ph = (v - 0.15 * u) / pitch;
      const ridge = 0.5 + 0.5 * Math.sin(TAU * ph);
      // White ground: a tatami fill, finer and fainter.
      const gph = (u * 0.6 + v * 0.8) / (pitch * 1.3);
      const gridge = 0.5 + 0.5 * Math.sin(TAU * gph);
      const shadeRed = 0.9 + 0.18 * ridge;
      const shadeWhite = 0.965 + 0.05 * gridge;
      for (let c = 0; c < 3; c++) {
        const r = red[c] * shadeRed;
        const w = white[c] * shadeWhite;
        color[i * 4 + c] = r * aRed + w * (1 - aRed);
      }
      color[i * 4 + 3] = inSil * 255;
      height[i] = (aRed * (0.6 + 0.4 * ridge) + (1 - aRed) * 0.25 * gridge) + 2.2 * (rim[i * 4 + 3] / 255) + 0.5 * aRed;
    }
  }
  // Filter down to the final size, then derive the normal map from the filtered height.
  const hi = mkHi();
  hi.getContext('2d').putImageData(new ImageData(color, hw, hh), 0, 0);
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = widthTex;
  colorCanvas.height = heightTex;
  {
    // Premultiply-safe downscale: draw in halves so the filter stays box-like.
    const g = colorCanvas.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    let src = hi;
    let w = hw;
    let h = hh;
    while (w / 2 >= widthTex) {
      const t = document.createElement('canvas');
      t.width = Math.round(w / 2);
      t.height = Math.round(h / 2);
      const tg = t.getContext('2d');
      tg.imageSmoothingQuality = 'high';
      tg.drawImage(src, 0, 0, t.width, t.height);
      src = t; w = t.width; h = t.height;
    }
    g.drawImage(src, 0, 0, widthTex, heightTex);
  }
  // Average the height down (box) to the final grid.
  const fh = new Float32Array(widthTex * heightTex);
  for (let y = 0; y < heightTex; y++) {
    for (let x = 0; x < widthTex; x++) {
      let s = 0;
      for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) s += height[(y * ss + dy) * hw + x * ss + dx];
      fh[y * widthTex + x] = s / (ss * ss);
    }
  }
  const nrm = new Uint8ClampedArray(widthTex * heightTex * 4);
  const at = (x, y) => fh[Math.min(heightTex - 1, Math.max(0, y)) * widthTex + Math.min(widthTex - 1, Math.max(0, x))];
  for (let y = 0; y < heightTex; y++) {
    for (let x = 0; x < widthTex; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 8;
      let nx = -dx * cfg.heightStrength;
      let ny = -dy * cfg.heightStrength;
      const inv = 1 / Math.hypot(nx, ny, 1);
      nx *= inv; ny *= inv;
      const nz = inv;
      const i = (y * widthTex + x) * 4;
      nrm[i] = (nx * 0.5 + 0.5) * 255;
      nrm[i + 1] = (ny * 0.5 + 0.5) * 255;
      nrm[i + 2] = (nz * 0.5 + 0.5) * 255;
      nrm[i + 3] = 255;
    }
  }
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = widthTex;
  normalCanvas.height = heightTex;
  normalCanvas.getContext('2d').putImageData(new ImageData(nrm, widthTex, heightTex), 0, 0);
  return { color: colorCanvas, normal: normalCanvas, widthM, heightM, widthTex, heightTex, texelM: cfg.texelM };
}
