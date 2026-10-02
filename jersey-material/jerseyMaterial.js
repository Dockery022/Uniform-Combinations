// jerseyMaterial.js
// Drop-in fabric materials for a football jersey / pants in three.js (r152+).
// Keeps your existing color texture (so uniform swaps still work) and adds
// mesh relief, polyester sheen, and hole shading on top.
//
// Adapted for the Combo Builder: three.js comes from the app's pinned copy,
// the maps load with flipY off to match glTF UVs, and the *InPlace helpers
// upgrade a MeshPhysicalMaterial without copying it, so the app's art
// shaders (onBeforeCompile, which Material.copy drops) keep working.

import * as THREE from '../src/three.js';

const loader = new THREE.TextureLoader();

function loadData(url, renderer, repeat) {
  const copies = [];
  const t = loader.load(url, () => copies.forEach((c) => { c.needsUpdate = true; }));
  t.userData.copies = copies;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.flipY = false; // glTF UV convention
  t.colorSpace = THREE.NoColorSpace; // data maps, NOT sRGB
  if (renderer) t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

/**
 * Load the generated maps once and reuse them across every material.
 * @param {THREE.WebGLRenderer} renderer
 * @param {string} base   folder holding the generated maps, e.g. '/maps/'
 * @param {number} tiling how many times the mesh tile repeats across the UV space.
 *                        Tune this by eye: higher = smaller holes.
 */
export function loadFabricMaps(renderer, base = '/maps/', tiling = 6) {
  return {
    normal: loadData(base + 'mesh_normal.png', renderer, tiling),
    rough: loadData(base + 'mesh_roughness.png', renderer, tiling),
    detail: loadData(base + 'mesh_detail.png', renderer, tiling),
  };
}

/**
 * The same maps with their own tiling, for a mesh whose UVs are scaled
 * differently (the images are shared, not reloaded).
 */
export function withTiling(maps, x, y = x) {
  const out = {};
  for (const [k, t] of Object.entries(maps)) {
    out[k] = t.clone();
    out[k].repeat.set(x, y);
    t.userData.copies?.push(out[k]); // uploaded once the image arrives
  }
  return out;
}

const MESH_DEFAULTS = {
  normalScale: 0.6,   // how deep the holes read
  aoIntensity: 0.7,   // hole darkening
  sheen: 0.5,         // polyester sheen strength
  sheenRoughness: 0.5,
  envMapIntensity: 0.8,
  roughness: 1.0,     // scales the roughness map; above 1 makes the fabric more matte
};

/** Give a MeshPhysicalMaterial the mesh fabric look, in place. */
export function applyMeshFabricInPlace(m, maps, opts = {}) {
  const { normalScale, aoIntensity, sheen, sheenRoughness, envMapIntensity, roughness } = { ...MESH_DEFAULTS, ...opts };
  m.normalMap = maps.normal;
  m.normalScale.set(normalScale, normalScale);
  m.roughnessMap = maps.rough;
  m.roughness = roughness;        // roughnessMap drives the value
  m.metalness = 0.0;
  m.aoMap = maps.detail;
  m.aoMapIntensity = aoIntensity;

  m.sheen = sheen;
  m.sheenRoughness = sheenRoughness;
  m.sheenColor = new THREE.Color(0xffffff);
  m.envMapIntensity = envMapIntensity;

  m.needsUpdate = true;
  return m;
}

/**
 * Upgrade a jersey material in place to a fabric look.
 * Works on the MeshStandardMaterial that GLTFLoader gives you.
 * Returns the (possibly new) material - assign it back to the mesh.
 */
export function applyMeshFabric(material, maps, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial();
  m.copy(material);               // keeps color/map/skinning flags/etc.
  return applyMeshFabricInPlace(m, maps, opts);
}

const SMOOTH_DEFAULTS = { sheen: 0.7, roughness: 0.45, envMapIntensity: 0.9 };

/** Smooth "dazzle" fabric, in place. */
export function applySmoothFabricInPlace(m, opts = {}) {
  const { sheen, roughness, envMapIntensity, sheenRoughness = 0.4 } = { ...SMOOTH_DEFAULTS, ...opts };
  m.normalMap = null;
  m.roughnessMap = null;
  m.aoMap = null;
  m.roughness = roughness;
  m.metalness = 0.0;
  m.sheen = sheen;
  m.sheenRoughness = sheenRoughness;
  m.sheenColor = new THREE.Color(0xffffff);
  m.envMapIntensity = envMapIntensity;
  m.needsUpdate = true;
  return m;
}

/**
 * Smooth "dazzle" fabric for yoke / shoulders / sleeves / numbers:
 * no mesh relief, a bit more sheen. Real jerseys mix both fabrics.
 */
export function applySmoothFabric(material, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial();
  m.copy(material);
  return applySmoothFabricInPlace(m, opts);
}

/**
 * Example usage after your GLB loads.
 * Material names depend on your model - log them to find out.
 */
export function styleUniform(root, renderer) {
  const maps = loadFabricMaps(renderer, '/maps/', 6);

  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = (o.material.name || '').toLowerCase();
    // console.log('material:', o.name, '->', o.material.name);

    if (name.includes('jersey_body') || name.includes('pants')) {
      o.material = applyMeshFabric(o.material, maps);
    } else if (name.includes('jersey') || name.includes('sleeve') || name.includes('sock')) {
      o.material = applySmoothFabric(o.material);
    }
  });
}

/* ---- Lighting that makes fabric read (usually the biggest win) ----
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
new RGBELoader().load('/hdri/stadium.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;        // gives sheen + sparkle something to catch
});
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
*/
