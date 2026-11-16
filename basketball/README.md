# Basketball Combo Builder (starting copy)

A straight copy of the football Combo Builder (`/index.html`, `src/`, `assets/`,
`jersey-material/`) taken from `main` on 2026-11-14, as the starting point for a
basketball uniform version. The football builder at the repo root is untouched.

Run `npm start` from the repo root and open http://localhost:8080/basketball/.

Right now it still shows the football uniform. The adaptation (basketball
jersey, shorts, shoes, no helmet) comes in follow-up changes once Doc approves
the plan.

## The uniform model

The 3D uniform is "Basketball Jersey" by Sev (https://sketchfab.com/sevclothing),
from https://sketchfab.com/3d-models/basketball-jersey-3ee634a324d5400ab84555b0636416f6,
licensed CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/). Doc made it the
gold standard for the basketball uniform (2026-11-16). `tools/bb_display.py`
converts the download into `assets/bb-display.glb`: meters, inner cloth layer
and texture removed, the pattern pieces repacked upright into one print atlas,
trim distances added. `src/display.js` shows it as a turnable display and
prints our designs onto it (`paintBBAtlas` in `src/basketball.js`).
