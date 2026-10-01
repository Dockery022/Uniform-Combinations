# Uniform Combinations

An interactive 3D combo builder: pick the helmet, jersey, pants, socks and cleats, and see the full uniform on a rigged 3D football player you can turn, zoom and pose.

![Combo Builder](docs/preview.png)

## Run it

No build step or install is needed; it's plain HTML and JavaScript modules.

```bash
npm start            # serves the app on http://localhost:8080
```

**In a GitHub Codespace:** run `git pull`, then `npm start`. Codespaces forwards port 8080 and opens a preview tab. New Codespaces created from this repo start the server for you (see `.devcontainer/devcontainer.json`).

**On GitHub Pages:** publish the repository root. The page loads three.js from jsDelivr and fonts from Google Fonts.

Opening `index.html` straight from disk (`file://`) won't work, because browsers block JavaScript modules there. Use one of the options above.

## What it does

- **Rigged 3D player** (`assets/player.glb`) wearing a real helmet model (`assets/helmet.glb`). Every part is paintable: helmet shell, finish, center stripe, side decal, facemask, chin strap, bumpers, visor tint, jersey body, numbers, outlines, sleeve stripes, sleeve numbers, collar, chest wordmark, name on back, pants and side stripes, belt, socks and stripes, cleats and soles, gloves, wrist tape, arm sleeve, towel and skin tone.
- **Helmet finishes:** gloss, satin, matte and chrome, lit by a studio environment so chrome and gloss pick up real highlights.
- **Poses:** Idle (the model's own motion-capture idle), Ready, Run (with the ball), Celebrate and Heisman, with smooth blending between them.
- **Camera views:** 3/4, Front, Back, Side and a Helmet close-up, plus drag to turn, scroll or pinch to zoom, and a turntable spin.
- **Combo readout:** shows the Helmet · Jersey · Pants combo and whether it uses only pieces in the equipment room ("One of 36 locker combos").
- **Starter combos, Randomize, Save combo** (kept on the device) and **combo codes** you can copy and paste to share a look. The page address also updates with the code, so a copied link reopens the same combo.
- **Snapshot:** renders a 4:5 image with the combo name for sharing.
- **Custom decal upload:** drop in a PNG or SVG and it's placed on both sides of the helmet, facing forward.

## Matching it to your designs

Everything team-specific is in **`src/team.js`**:

| What | Where |
| --- | --- |
| Team colors (hex values) | `COLORS` |
| Which swatches each part offers | `SWATCHES` |
| Pieces in the equipment room, used for the combo count | `LOCKER` |
| Starting combo | `DEFAULT_COMBO` |
| Starter combo cards | `PRESETS`. Each one lists only what it changes from `DEFAULT_COMBO` |
| Wordmark, script decal text, default name on back | `TEAM` |

To add a combo from a design file, copy a `PRESETS` entry and set its colors and styles. A color value can be a key from `COLORS` (`'red'`) or any hex string (`'#9d2235'`).

## The 3D models

The app loads two web-ready models from `assets/`:

| File | From | Notes |
| --- | --- | --- |
| `player.glb` | `3x.fbx` (Mixamo-rigged player with an idle animation) | Materials are renamed by part: `jersey`, `pants`, `socks`, `cleats`, `skin`, `belt`, `tape`, `armSleeve`. The FBX's own helmet is removed. |
| `helmet.glb` | `bucshelmet.obj` | Split into `shell`, `mask`, `strap`, `cup`, `bumper`, `trim`, `pads`, `hardware`; faces +z and is scaled to a shell width of 1. |

To rebuild them from the source files:

```bash
npm install
node_modules/fbx2gltf/bin/Linux/FBX2glTF --binary --input 3x.fbx --output player-raw   # Darwin/ or Windows_NT/ on other systems
npm run prepare:player -- player-raw.glb assets/player.glb
npx obj2gltf -i bucshelmet.obj -o helmet-raw.glb --binary
npm run prepare:helmet -- helmet-raw.glb assets/helmet.glb
```

The jersey's numbers and sleeve stripes are painted onto the jersey's UV layout (`JERSEY_LAYOUT` in `src/textures.js`). Pants stripes, sock stripes, the collar, gloves and cleat soles are drawn by shaders from measurements taken on the model at load time (`measure()` in `src/model.js`), so they follow the cloth as the player moves.

Make sure you have the rights to publish any model you add here, especially if the repository or the page is public.

## Project layout

```
index.html        page shell
src/main.js       renderer, lighting, turf, wiring, snapshot, save and share
src/model.js      loads the player and helmet, recolors parts, poses the rig
src/textures.js   jersey lettering, decals, ball, turf and fabric normal maps
src/vendor/       three.js GLTFLoader (MIT), sharing src/three.js
assets/           player.glb and helmet.glb
tools/            scripts that turn the source FBX/OBJ files into the GLBs
src/orbit.js      camera controls and preset views
src/ui.js         control panel generated from a field schema
src/combo.js      combo state, names, locker check, share codes
src/team.js       team colors, options, presets (edit this one)
src/styles.css    styles, using 1912 Society design tokens
server.mjs        zero-dependency static server for local and Codespaces use
```
