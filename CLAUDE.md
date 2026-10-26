# CLAUDE.md

Rules for working on the 3D uniform viewer. Doc (GitHub `Dockery022`) owns this repo and reviews every change.

## Figure and garments

- Don't build the figure or garments from primitives (boxes, cylinders, lathes, hand-made geometry). Use a free `.glb` base body from `/assets`.
- Each garment (jersey, pants, helmet) is a slightly inflated copy of the body mesh: copy the body geometry and offset every vertex 1-3 mm along its vertex normal, so the layers don't clip. Keep the copy skinned to the same skeleton so it moves with the body.

## Materials

- Fabric uses `MeshPhysicalMaterial` with a normal map, a roughness map, and sheen (a sheen map where one is supplied).
- Jersey: matte mesh.
- Pants: twill.
- Helmet: glossy.

## Lighting

- An HDRI environment, plus one soft key light and one rim light. Nothing else.

## Visual checks

After every visual change, before moving on:

1. Start the app (`npm start`, http://localhost:8080).
2. Render a headless screenshot: `node tools/screenshot.mjs http://localhost:8080/ out.png`. It uses the pre-installed Playwright Chromium with SwiftShader WebGL and exits non-zero if the page logs an error.
3. Look at the screenshot.
4. Compare it to a reference photo of the real uniform, and say what still differs.

Reference photos are for comparison only. Never crop them into textures or commit them (they carry licensed marks).

## Standing uniform rules

- Colors: Cardinal Red `#C9001F`, Black `#000000`, White `#FFFFFF`, Metallic Silver `#8A8D8F`. Beak yellow `#FDB913` is for the bird logo only. The Red Gold and Halloween alternates keep their gold.
- Jerseys are tucked into the pants.
- Default back name SOCIETY in the Louisville jersey font; front number 19, back number 12.
