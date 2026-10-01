// Turns the rigged player FBX (converted with FBX2glTF) into a web GLB with
// materials named by uniform part, so the app can recolor each one.
//
//   FBX2glTF --binary --input 3x.fbx --output player-raw
//   node tools/prepare-player.mjs player-raw.glb assets/player.glb
//
// The static helmet that ships with the FBX is removed; its rest-pose box is
// kept in scene extras (helmetBox) so the app can seat its own helmet there.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample } from '@gltf-transform/functions';

const [, , input, output] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

const RENAME = {
  shirt_0: 'jersey',
  pants: 'pants',
  'Mat.2_2mat': 'belt',
  'Mat.2': 'buckle',
  Default: 'socks',
  'Fabric-Linen': 'tape',
  'Fabric-Silk': 'armSleeve',
  'sepatu key.obj': 'cleats',
  Bodymat: 'skin',
};

// Rest-pose box of the bundled helmet, in glTF world space.
const helmetNode = root.listNodes().find((n) => n.getName() === 'helmet_1');
const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
if (helmetNode) {
  const m = helmetNode.getWorldMatrix();
  const pos = helmetNode.getMesh().listPrimitives()[0].getAttribute('POSITION');
  const v = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i += 7) {
    pos.getElement(i, v);
    const w = [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]);
    for (let k = 0; k < 3; k++) {
      box.min[k] = Math.min(box.min[k], w[k]);
      box.max[k] = Math.max(box.max[k], w[k]);
    }
  }
}

// Drop the static helmet rig (helmet, pads cover and visor) under Null_1.
const dropRoot = root.listNodes().find((n) => n.getName() === 'Null_1');
const dropAll = (n) => {
  for (const c of n.listChildren()) dropAll(c);
  n.getMesh()?.dispose();
  n.dispose();
};
if (dropRoot) dropAll(dropRoot);

const eyes = doc.createMaterial('eyes').setBaseColorFactor([0.1, 0.1, 0.1, 1]);
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  for (const prim of mesh.listPrimitives()) {
    for (const sem of prim.listSemantics()) if (sem !== 'TEXCOORD_0' && sem.startsWith('TEXCOORD')) prim.setAttribute(sem, null);
    if (node.getName() === 'Eyes') prim.setMaterial(eyes);
  }
}
for (const mat of root.listMaterials()) {
  if (RENAME[mat.getName()]) mat.setName(RENAME[mat.getName()]);
  for (const slot of ['BaseColor', 'Normal', 'Occlusion', 'Emissive', 'MetallicRoughness']) mat[`set${slot}Texture`]?.(null);
  mat.setBaseColorFactor([0.5 + Math.random() * 0.4, 0.5, 0.5, 1]).setAlphaMode('OPAQUE').setDoubleSided(false);
}
for (const anim of root.listAnimations()) anim.setName('idle');

root.listScenes()[0].setExtras({ helmetBox: helmetNode ? box : null });

await doc.transform(resample(), dedup(), prune({ keepAttributes: true }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(output, doc);
console.log('helmetBox', box);
