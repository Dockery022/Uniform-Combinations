// Sleeve specs, one per jersey in assets/sleeves/<file>.json, measured from
// the jersey's source art (the sleeve-specs table in the project files).
// Each band is a fraction of the sleeve length from the hem, in from/to,
// with its color. On the player the bands are drawn by surface distance
// from the sleeve's hem, so they stay straight and a constant width.
// A spec with a `stripe` (the 2020 black jersey) draws it over the shoulder
// and down the outer sleeve instead, with the spec's `outline` around it;
// its sizes are meters on the 3D jersey, since the art has no stripe.
const cache = new Map();

// Jerseys whose sleeves are drawn from their spec. The rest keep the flat
// art on the sleeves until their own change brings them over.
export const SLEEVE_ROLLOUT = new Set(['jersey-red-20', 'jersey-black-20']);

export function loadSleeveSpec(file) {
  if (!SLEEVE_ROLLOUT.has(file)) return Promise.resolve(null);
  if (!cache.has(file)) {
    cache.set(file, fetch(`assets/sleeves/${file}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return cache.get(file);
}

// The spec's bands as the shader wants them: center distance from the hem
// and width, in meters.
export function sleeveBands(spec) {
  if (!spec?.bands?.length) return [];
  const L = spec.sleeveLength_m ?? 0.168;
  return spec.bands.map((b) => ({ at: ((b.from + b.to) / 2) * L, w: (b.to - b.from) * L, color: b.color }));
}

// The spec's over-the-shoulder stripe as the shader wants it, in meters:
// width, where it starts past the shoulder number (from the neckline) and
// ends above the cuff (from the hem), and its outline. null without one.
export function sleeveStripe(spec) {
  const s = spec?.stripe;
  if (!s) return null;
  const L = spec.sleeveLength_m ?? 0.168;
  return {
    width: s.width_m,
    color: s.color,
    start: s.fromNeck_m ?? 0,
    end: (s.endFromHem ?? 0) * L,
    outlineWidth: spec.outline?.width_m ?? 0,
    outlineColor: spec.outline?.color ?? '#FFFFFF',
  };
}
