# Model parts

How the 3D player is loaded, and every mesh and material in the two models.

## Loading

`loadAssets()` in `src/model.js` loads `assets/player.glb` and `assets/helmet.glb` with three.js's `GLTFLoader` (vendored in `src/vendor/`). Hosts that won't serve `.glb` files (the published artifact) load the base64 copies `assets/*.glb.js` instead, chosen by `window.__comboEmbeddedModels`.

`Player` then:

1. scales the body to 1.88 m and stands it on the origin (`fitBody`);
2. collects bones by name, without the `mixamorig` prefix, and meshes by **material name** into `this.parts` (`collect`). three.js splits a glTF mesh with several primitives into one `Mesh` per primitive, so each material below is its own mesh;
3. replaces each material with the app's own (`buildMaterials`), keyed by the same names;
4. measures per-vertex attributes in the rest pose for the art projection (`measure`);
5. attaches the helmet to the head bone, replacing its materials the same way (`attachHelmet`).

## player.glb

Skinned to one Mixamo skeleton, with one clip, `idle` (34 channels).

| glTF node | Material (= part) | Vertices | What it is |
| --- | --- | --- | --- |
| `shirt` | `jersey` | 19,443 | Jersey: front, back and sleeves in one mesh |
| `Body_3_2` | `pants` | 6,922 | Pants |
| `Body_3_2` | `belt` | 1,280 | Belt |
| `Body_3_2` | `buckle` | 61 | Belt buckle |
| `Body_2` | `skin` | 12,623 | Body skin (gloves are painted on by the shader) |
| `Body_2` | `socks` | 651 | Socks |
| `Body_2` | `tape` | 300 | Wrist tape |
| `Body_2` | `armSleeve` | 389 | Arm sleeve |
| `Eyes` | `eyes` | 804 | Eyes |
| `shoes` | `cleats` | 41,490 | Cleats |

The jersey's UVs split it into panels by U: sleeves below 0.44, the front from 0.44 to 0.715, the back above.

## helmet.glb

Not skinned; parented to the head bone.

| glTF node | Material (= part) | Vertices |
| --- | --- | --- |
| `shell` | `shell` | 24,648 |
| `mask` | `mask` | 4,371 |
| `strap` | `strap` | 6,398 |
| `pads` | `pads` | 17,965 |
| `bumper` | `bumper` | 4,866 |
| `hardware` | `hardware` | 9,913 |
| `trim` | `trim` | 4,398 |
| `cup` | `cup` | 484 |
