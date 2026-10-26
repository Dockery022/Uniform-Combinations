# CLAUDE.md

Rules for working on the 3D uniform viewer. Doc (GitHub `Dockery022`) owns this repo and reviews every change.

## Figure and garments

- The player is `assets/player.glb` (the garments are modelled into it) and the helmet is `assets/helmet.glb`. Keep both. Don't build the figure or garments from primitives.
- Don't rebuild the garments as inflated copies of a bare base body. That was tried on 2026-10-26 and looked far worse than the original model.

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
