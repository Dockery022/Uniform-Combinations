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

The jersey's UVs split it into four islands: the right sleeve (U 0.02–0.21), the left sleeve (U 0.23–0.42), the front (U 0.45–0.71) and the back (U 0.72–0.98). Every triangle has the same winding (no mirrored islands) and no islands overlap. The front and back meet along the top of each shoulder, so the shoulder numbers are placed as planar decals (`Player.placeTv`) rather than painted per island.

The pants have three islands: the hip band (U 0.01–0.59, V 0.91–0.99, the top ~29% of the leg) and one per leg (left U 0.61–0.79, right U 0.79–0.99). The side stripe is placed by arc distance from each leg's outer seam (`aSeam`), so it crosses from the hip band onto the leg islands without a break.

The socks stop short of the pants hem in the model; `Player.tuckSocks` stretches their tops up under the hem at load time, and the shin under the hem is drawn in the sock color.

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
