// A small Radiance .hdr (RGBE) reader, so the studio HDRI loads without
// three's addon loaders (which import 'three' by bare name and need an
// import map). Handles flat and run-length-encoded scanlines.
import * as THREE from './three.js';

function parse(buffer) {
  const bytes = new Uint8Array(buffer);
  let pos = 0;
  const line = () => {
    let s = '';
    while (pos < bytes.length && bytes[pos] !== 10) s += String.fromCharCode(bytes[pos++]);
    pos++;
    return s;
  };
  if (!line().startsWith('#?')) throw new Error('Not a Radiance HDR file');
  for (let l = line(); l !== ''; l = line()) {
    if (l.startsWith('FORMAT=') && l !== 'FORMAT=32-bit_rle_rgbe') throw new Error(`Unsupported HDR ${l}`);
  }
  const size = line().match(/-Y (\d+) \+X (\d+)/);
  if (!size) throw new Error('Unsupported HDR orientation');
  const height = +size[1];
  const width = +size[2];
  const rgbe = new Uint8Array(width * height * 4);
  const scan = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    const rle = width >= 8 && width < 32768 && bytes[pos] === 2 && bytes[pos + 1] === 2 && !(bytes[pos + 2] & 0x80);
    if (!rle) { // flat scanline
      rgbe.set(bytes.subarray(pos, pos + width * 4), y * width * 4);
      pos += width * 4;
      continue;
    }
    pos += 4;
    for (let c = 0; c < 4; c++) { // each channel run-length encoded on its own
      let x = 0;
      while (x < width) {
        let n = bytes[pos++];
        if (n > 128) {
          n -= 128;
          scan.fill(bytes[pos++], c * width + x, c * width + x + n);
        } else {
          scan.set(bytes.subarray(pos, pos + n), c * width + x);
          pos += n;
        }
        x += n;
      }
    }
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) rgbe[(y * width + x) * 4 + c] = scan[c * width + x];
    }
  }
  // RGBE to linear half floats.
  const data = new Uint16Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const e = rgbe[i * 4 + 3];
    const f = e ? 2 ** (e - 136) : 0;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = THREE.DataUtils.toHalfFloat(rgbe[i * 4 + c] * f);
    data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  return { width, height, data };
}

// Load assets/hdri/<name>.hdr as an equirectangular texture ready for
// PMREMGenerator. Hosts that won't serve .hdr files (the published artifact)
// get the base64 copy <name>.hdr.js, like the models.
export async function loadHDR(name) {
  let buffer = null;
  if (!window.__comboEmbeddedModels) {
    try {
      const res = await fetch(`assets/hdri/${name}.hdr`);
      if (res.ok) buffer = await res.arrayBuffer();
    } catch (err) {
      console.warn(`Falling back to the embedded copy of ${name}.hdr`, err);
    }
  }
  if (!buffer) {
    const { default: b64 } = await import(`../assets/hdri/${name}.hdr.js`);
    buffer = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  }
  const { width, height, data } = parse(buffer);
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.flipY = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
