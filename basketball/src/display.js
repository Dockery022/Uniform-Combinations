// The basketball uniform as a turnable ghost display: Sev's "Basketball
// Jersey" (Sketchfab, CC-BY-4.0), which Doc made the gold standard for the
// uniform on 2026-11-16. A tank and shorts simulated from real sewn pattern
// pieces, shown on their own with no player inside.
//
// tools/bb_display.py turns the download into assets/bb-display.glb: meters,
// the pattern pieces laid out upright in one atlas (TEXCOORD_0), and per
// vertex trim distances measured flat on the pattern. Here the shader draws
// the base colors, trim bands and side panels from those distances, and the
// prints (wordmark, numbers, name, leg marks) are painted onto the atlas
// the way a sublimated uniform is printed (basketball.js, paintBBAtlas).
//
// It stands in for the football Player in main.js: root, apply(look),
// update(), setPose() and bones.Hips.
import * as THREE from './three.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { art as url } from './combo.js';
import { loadImage } from './model.js';
import { makeCanvas } from './textures.js';
import { paintBBAtlas } from './basketball.js';
import { loadFabricMaps, applyMeshFabricInPlace } from '../jersey-material/jerseyMaterial.js';

export const CREDIT = {
  title: 'Basketball Jersey',
  author: 'Sev',
  authorUrl: 'https://sketchfab.com/sevclothing',
  source: 'https://sketchfab.com/3d-models/basketball-jersey-3ee634a324d5400ab84555b0636416f6',
  license: 'CC BY 4.0',
  licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
};

const PX_PER_M = 1300; // print resolution: 1.3 px per mm of cloth
const HOLES_PER_M = 200; // the mesh fabric's holes, as on the football jersey

export async function loadDisplay(onProgress) {
  const gltf = await new GLTFLoader().loadAsync('assets/bb-display.glb', (e) => onProgress?.(e.total ? e.loaded / e.total : 0));
  return { scene: gltf.scene, atlas: gltf.parser.json.asset.extras.atlas };
}

// Trim, as in model.js: stacks of bands in from an edge, and the side design
// (a panel centered on the seam, piping on its edges, pinstripes inside).
const EDGE_GLSL = /* glsl */ `
  vec3 edgeBands(vec3 c, float d, vec3 cols[5], float edges[5], int n) {
    float fw = clamp(fwidth(d), 1e-4, 0.004); // capped: no smear where a distance jumps
    for (int i = 0; i < 5; i++) {
      if (i >= n) break;
      float lo = i == 0 ? -1.0 : edges[i - 1];
      float hi = edges[i];
      c = mix(c, cols[i], smoothstep(lo - fw, lo + fw, d) * (1.0 - smoothstep(hi - fw, hi + fw, d)));
    }
    return c;
  }
  vec3 sideDesign(vec3 c, float d, vec4 panel, vec4 pipe, vec4 pins, vec4 dims) {
    float ad = abs(d);
    float fw = clamp(fwidth(d), 1e-4, 0.004); // capped: no smear where a distance jumps
    float inside = 1.0 - smoothstep(dims.x - fw, dims.x + fw, ad);
    c = mix(c, panel.rgb, panel.a * inside);
    if (pins.a > 0.0) {
      float m = abs(fract(ad / dims.w) - 0.5) * dims.w;
      c = mix(c, pins.rgb, pins.a * inside * (1.0 - smoothstep(dims.z * 0.5 - fw, dims.z * 0.5 + fw, m)));
    }
    c = mix(c, pipe.rgb, pipe.a * inside * smoothstep(dims.x - dims.y - fw, dims.x - dims.y + fw, ad));
    return c;
  }
`;
const edgeU = (name) => ({
  [`u${name}C`]: { value: Array.from({ length: 5 }, () => new THREE.Color()) },
  [`u${name}W`]: { value: [0, 0, 0, 0, 0] },
  [`u${name}N`]: { value: 0 },
});
const edgeDecl = (name) => `uniform vec3 u${name}C[5];\nuniform float u${name}W[5];\nuniform int u${name}N;`;
function setEdge(u, name, bands = []) {
  let at = 0;
  bands.slice(0, 5).forEach(([color, w], i) => {
    at += w;
    u[`u${name}C`].value[i].set(color);
    u[`u${name}W`].value[i] = at;
  });
  u[`u${name}N`].value = Math.min(5, bands.length);
}
const sideU = () => ({
  uSidePanel: { value: new THREE.Vector4() }, uSidePipe: { value: new THREE.Vector4() },
  uSidePins: { value: new THREE.Vector4() }, uSideDims: { value: new THREE.Vector4(0, 0, 0, 1) },
});
const SIDE_DECL = 'uniform vec4 uSidePanel;\nuniform vec4 uSidePipe;\nuniform vec4 uSidePins;\nuniform vec4 uSideDims;';
function setSide(u, side) {
  const c = (hex) => (hex ? [...new THREE.Color(hex).toArray(), 1] : [0, 0, 0, 0]);
  u.uSidePanel.value.set(...c(side?.panel));
  u.uSidePipe.value.set(...c(side?.pipe));
  u.uSidePins.value.set(...c(side?.pins));
  u.uSideDims.value.set(side?.half ?? 0, side?.pipeW ?? 0, side?.pinW ?? 0, side?.pinGap ?? 1);
}

// A fabric material whose color is drawn by `fragment` from per-vertex
// trim distances (_trim, see tools/bb_display.py) and the print atlas
// (uPrint, premultiplied).
const TRIM_SCALE = 10; // _trim is stored as normalized shorts of meters / 10
function clothMaterial(name, maps, { uniforms, declare, fragment }) {
  const m = new THREE.MeshPhysicalMaterial({ name, side: THREE.DoubleSide });
  applyMeshFabricInPlace(m, maps, { normalScale: 0.25, aoIntensity: 0.35, sheen: 0.5, sheenRoughness: 0.5, envMapIntensity: 0.6, roughness: 1.35 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 _trim;\nvarying vec4 vTrim;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvTrim = _trim * ${TRIM_SCALE.toFixed(1)};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec4 vTrim;\nuniform sampler2D uPrint;\nuniform vec3 uBase;\n${declare}\n${EDGE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\ndiffuseColor.rgb = uBase;\n${fragment}\nvec4 print = texture2D(uPrint, vNormalMapUv * uPrintScale);\ndiffuseColor.rgb = diffuseColor.rgb * (1.0 - print.a) + print.rgb;`)
      .replace('uniform sampler2D uPrint;', 'uniform sampler2D uPrint;\nuniform vec2 uPrintScale;');
  };
  m.customProgramCacheKey = () => `bb-display-${name}`;
  return m;
}

export class Display {
  constructor(renderer, { scene, atlas }) {
    this.root = new THREE.Group();
    this.atlas = atlas;
    this.meshes = {};
    scene.traverse((o) => { if (o.isMesh) this.meshes[o.name] = o; });
    for (const mesh of Object.values(this.meshes)) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    this.root.add(scene);
    // Stands where a player's uniform would: the waist about hip height.
    this.bones = { Hips: new THREE.Object3D() };
    this.bones.Hips.position.set(0, 1.0, 0);
    this.root.add(this.bones.Hips);

    // The print atlas.
    const [aw, ah] = atlas.size;
    this.canvas = makeCanvas(Math.round(aw * PX_PER_M), Math.round(ah * PX_PER_M));
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.premultiplyAlpha = true;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    this.print = t;

    // The mesh fabric tiles across the atlas at its true size. The print
    // samples the same UVs (vNormalMapUv carries the tiling; uPrintScale
    // undoes it).
    const reps = [aw * HOLES_PER_M / 20, ah * HOLES_PER_M / 20];
    const maps = loadFabricMaps(renderer, 'jersey-material/maps/');
    for (const tex of Object.values(maps)) tex.repeat.set(...reps);
    const printScale = new THREE.Vector2(1 / reps[0], 1 / reps[1]);

    this.u = {
      tank: { uPrint: { value: t }, uPrintScale: { value: printScale }, uBase: { value: new THREE.Color() }, ...edgeU('Neck'), ...edgeU('Arm'), ...sideU() },
      shorts: { uPrint: { value: t }, uPrintScale: { value: printScale }, uBase: { value: new THREE.Color() }, ...edgeU('Waist'), ...edgeU('Hem'), ...sideU() },
    };
    this.m = {
      tank: clothMaterial('tank', maps, {
        uniforms: this.u.tank,
        declare: `${edgeDecl('Neck')}\n${edgeDecl('Arm')}\n${SIDE_DECL}`,
        fragment: /* glsl */ `
          // vTrim: neck, arm, side
          diffuseColor.rgb = sideDesign(diffuseColor.rgb, vTrim.z, uSidePanel, uSidePipe, uSidePins, uSideDims);
          diffuseColor.rgb = edgeBands(diffuseColor.rgb, vTrim.x, uNeckC, uNeckW, uNeckN);
          diffuseColor.rgb = edgeBands(diffuseColor.rgb, vTrim.y, uArmC, uArmW, uArmN);
        `,
      }),
      shorts: clothMaterial('shorts', maps, {
        uniforms: this.u.shorts,
        declare: `${edgeDecl('Waist')}\n${edgeDecl('Hem')}\n${SIDE_DECL}`,
        fragment: /* glsl */ `
          // vTrim: side (signed), waist, hem
          diffuseColor.rgb = sideDesign(diffuseColor.rgb, vTrim.x, uSidePanel, uSidePipe, uSidePins, uSideDims);
          diffuseColor.rgb = edgeBands(diffuseColor.rgb, vTrim.y, uWaistC, uWaistW, uWaistN);
          diffuseColor.rgb = edgeBands(diffuseColor.rgb, vTrim.z, uHemC, uHemW, uHemN);
        `,
      }),
      string: new THREE.MeshPhysicalMaterial({ name: 'string', roughness: 0.8, sheen: 0.4, sheenRoughness: 0.6 }),
    };
    this.meshes.tank.material = this.m.tank;
    this.meshes.shorts.material = this.m.shorts;
    if (this.meshes.string) this.meshes.string.material = this.m.string;
  }

  apply(look) {
    const J = look.bb.jersey;
    const S = look.bb.shorts;
    const sheen = (c) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.2);
    const t = this.u.tank;
    t.uBase.value.set(J.base);
    this.m.tank.sheenColor.copy(sheen(J.base));
    setEdge(t, 'Neck', J.neck);
    setEdge(t, 'Arm', J.arm);
    setSide(t, J.side);
    const s = this.u.shorts;
    s.uBase.value.set(S.base);
    this.m.shorts.sheenColor.copy(sheen(S.base));
    setEdge(s, 'Waist', S.waist);
    setEdge(s, 'Hem', S.hem);
    setSide(s, S.side);
    this.m.string.color.set(S.base);
    return this.paint(look);
  }

  async paint(look) {
    const token = (this.token = (this.token ?? 0) + 1);
    const J = look.bb.jersey;
    const [wordmark, mascot, acc, sponsor] = await Promise.all([
      J.wordmark.kind === 'image' ? loadImage(url(J.wordmark.file)) : null,
      loadImage(url('bb-mascot')).catch(() => null),
      loadImage(url('bb-acc')).catch(() => null),
      loadImage(url('bb-ln')).catch(() => null),
    ]);
    if (token !== this.token) return;
    paintBBAtlas(this.canvas, PX_PER_M, this.atlas, look, { wordmark, mascot, acc, sponsor });
    this.print.needsUpdate = true;
  }

  setPose() {}

  update() {}
}
