// Turns the helmet OBJ (converted to GLB with obj2gltf) into a small web GLB
// whose materials are named by role, so the app can recolor each part.
//
//   npx obj2gltf -i bucshelmet.obj -o helmet-raw.glb --binary
//   node tools/prepare-helmet.mjs helmet-raw.glb assets/helmet.glb
//
// Output: faces +z, y up, centered on the shell, shell width = 1 unit.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, join, prune, quantize, weld, flatten, transformMesh } from '@gltf-transform/functions';

const [, , input, output] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

// Duplicate shells and the placeholder bumper lettering are dropped.
const DROP = [/^s\.1198Mirrored/, /^s\.0793Mirrored_1/, /^t\.137[23]/];
const ROLE_BY_NAME = [
  [/^s\.079[123]/, 'trim'],
  [/^s\.(1318|1319|1247|1361|1658)/, 'strap'],
  [/^(n\.1313|s\.1231|s\.079[46]|s\.121[13])/, 'bumper'],
];
const ROLE_BY_MATERIAL = {
  Reflective6A6A6A: 'shell',
  Reflective000000: 'mask',
  Standard000000: 'cup',
  StandardFFFFFF: 'pads',
  ReflectiveF91121: 'bumper',
  StandardD6E0FE: 'hardware',
  Standard4F454A: 'hardware',
  Standard737373: 'hardware',
};

const roles = {};
// Each role gets its own preview color so dedup() keeps the materials apart.
const roleMaterial = (role) => (roles[role] ??= doc.createMaterial(role).setBaseColorFactor([
  0.2 + 0.1 * (Object.keys(roles).length % 8), 0.5, 0.5, 1,
]));

for (const node of root.listNodes()) {
  const name = node.getName();
  const mesh = node.getMesh();
  if (!mesh) continue;
  if (DROP.some((r) => r.test(name))) {
    node.dispose();
    continue;
  }
  for (const prim of mesh.listPrimitives()) {
    const role = ROLE_BY_NAME.find(([r]) => r.test(name))?.[1] ?? ROLE_BY_MATERIAL[prim.getMaterial()?.getName()] ?? 'pads';
    prim.setMaterial(roleMaterial(role));
    for (const sem of prim.listSemantics()) if (sem.startsWith('TEXCOORD')) prim.setAttribute(sem, null);
  }
}

// Normalize: shell center to origin, face toward +z, shell width = 1.
const shellBox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMaterial() !== roles.shell) continue;
    const pos = prim.getAttribute('POSITION');
    const mn = pos.getMin([]);
    const mx = pos.getMax([]);
    for (let i = 0; i < 3; i++) {
      shellBox.min[i] = Math.min(shellBox.min[i], mn[i]);
      shellBox.max[i] = Math.max(shellBox.max[i], mx[i]);
    }
  }
}
const center = shellBox.min.map((v, i) => (v + shellBox.max[i]) / 2);
const s = 1 / (shellBox.max[0] - shellBox.min[0]);
// p' = s * rotY(180deg) * (p - center), as a column-major 4x4.
const [cx, cy, cz] = center;
const matrix = [-s, 0, 0, 0, 0, s, 0, 0, 0, 0, -s, 0, s * cx, -s * cy, s * cz, 1];
for (const mesh of root.listMeshes()) transformMesh(mesh, matrix);

await doc.transform(
  flatten(),
  join({ keepNamed: false }),
  weld(),
  dedup(),
  prune(),
  quantize({ quantizePosition: 14, quantizeNormal: 10 }),
);
for (const mesh of root.listMeshes()) mesh.setName(mesh.listPrimitives()[0].getMaterial()?.getName() ?? 'part');
for (const node of root.listNodes()) if (node.getMesh()) node.setName(node.getMesh().getName());

await io.write(output, doc);
console.log('roles', Object.keys(roles).join(', '), 'shell box', shellBox, 'scale', s);
