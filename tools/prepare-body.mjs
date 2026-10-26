// Packs Quaternius' Universal Base Characters male body (CC0) into the web
// GLB the garments are built from. Use the glTF in "Base Characters/Godot - UE":
// its normal maps are already in glTF (OpenGL) convention.
//
//   node tools/prepare-body.mjs "<kit>/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf" assets/body/base-body.glb
//
// The kit's .gltf names two textures (*_png.png) that ship without the suffix;
// those are resolved before reading. Positions stay float (no quantization) so
// garments can be inflated along the normals in meters at load time.
import { existsSync, mkdtempSync, readFileSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const [, , input, output] = process.argv;

const src = dirname(input);
const work = mkdtempSync(join(tmpdir(), 'body-'));
for (const f of readdirSync(src)) copyFileSync(join(src, f), join(work, f));
const json = JSON.parse(readFileSync(input, 'utf8'));
for (const img of json.images) {
  if (!existsSync(join(work, img.uri))) img.uri = img.uri.replace(/_png\.png$/, '.png');
}
const gltfPath = join(work, basename(input));
writeFileSync(gltfPath, JSON.stringify(json));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ sharp });
const doc = await io.read(gltfPath);
const root = doc.getRoot();

const RENAME = { MI_Superhero_Male: 'skin', MI_Eyes: 'eyes', MI_Hair_1: 'eyebrows' };
for (const mat of root.listMaterials()) {
  mat.setName(RENAME[mat.getName()] ?? mat.getName());
  // Only the eyebrow cards need both sides.
  mat.setDoubleSided(mat.getName() === 'eyebrows');
}
for (const node of root.listNodes()) if (node.getName() === 'SuperHero_Male') node.setName('body');
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    for (const sem of prim.listSemantics()) {
      if ((sem.startsWith('TEXCOORD') && sem !== 'TEXCOORD_0') || sem.startsWith('COLOR')) prim.setAttribute(sem, null);
    }
  }
}

await doc.transform(
  dedup(),
  prune({ keepAttributes: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 88 }),
);
await io.write(output, doc);
console.log('wrote', output);
