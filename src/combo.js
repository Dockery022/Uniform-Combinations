// Combo state helpers: color lookup, merging, naming and share codes.
import { COLORS, DEFAULT_COMBO, LOCKER, PRESETS } from './team.js';

const HEX = /^#[0-9a-f]{6}$/i;

export function hex(color) {
  if (COLORS[color]) return COLORS[color].hex;
  return HEX.test(color) ? color : '#888888';
}

export function colorName(color) {
  if (COLORS[color]) return COLORS[color].name;
  return HEX.test(color) ? color.toUpperCase() : 'Custom';
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Copy only the keys DEFAULT_COMBO knows about, with matching types, so a
// stale or hand-edited code can never inject unexpected fields.
export function mergeCombo(base, patch) {
  const out = clone(base);
  if (!patch || typeof patch !== 'object') return out;
  for (const part of Object.keys(DEFAULT_COMBO)) {
    const src = patch[part];
    if (!src || typeof src !== 'object') continue;
    for (const key of Object.keys(DEFAULT_COMBO[part])) {
      if (key in src && typeof src[key] === typeof DEFAULT_COMBO[part][key]) out[part][key] = src[key];
    }
    if (part === 'helmet' && typeof src.decalImage === 'string') out.helmet.decalImage = src.decalImage;
  }
  out.jersey.number = sanitizeNumber(out.jersey.number);
  out.jersey.name = sanitizeName(out.jersey.name);
  return out;
}

export function presetCombo(id) {
  const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  return mergeCombo(DEFAULT_COMBO, preset.combo);
}

export function sanitizeNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 2);
  return digits === '' ? '0' : digits;
}

export function sanitizeName(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9 .'-]/g, '').slice(0, 14);
}

export function helmetKey(helmet) {
  return helmet.finish === 'gloss' ? helmet.shell : `${helmet.finish}-${helmet.shell}`;
}

export function helmetName(helmet) {
  const prefix = { gloss: '', satin: 'Satin ', matte: 'Matte ', chrome: 'Chrome ' }[helmet.finish] ?? '';
  return prefix + colorName(helmet.shell);
}

export function comboNames(combo) {
  return {
    helmet: helmetName(combo.helmet),
    jersey: colorName(combo.jersey.base),
    pants: colorName(combo.pants.base),
  };
}

export function lockerStatus(combo) {
  const total = LOCKER.helmets.length * LOCKER.jerseys.length * LOCKER.pants.length;
  const inLocker =
    LOCKER.helmets.includes(helmetKey(combo.helmet)) &&
    LOCKER.jerseys.includes(combo.jersey.base) &&
    LOCKER.pants.includes(combo.pants.base);
  return { total, inLocker };
}

// Share codes are base64url JSON of only what differs from DEFAULT_COMBO.
// Uploaded decal images stay on the device.
export function encodeCombo(combo) {
  const diff = { v: 1 };
  for (const part of Object.keys(DEFAULT_COMBO)) {
    for (const key of Object.keys(DEFAULT_COMBO[part])) {
      if (combo[part][key] !== DEFAULT_COMBO[part][key]) (diff[part] ??= {})[key] = combo[part][key];
    }
  }
  const json = JSON.stringify(diff);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCombo(code) {
  const clean = String(code).trim().replace(/^#/, '').replace(/^combo\./, '');
  const b64 = clean.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || data.v !== 1) throw new Error('Unknown code version');
  return mergeCombo(DEFAULT_COMBO, data);
}

export function randomCombo() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const helmet = pick(LOCKER.helmets);
  const [finish, shell] = helmet.includes('-') ? helmet.split('-') : ['gloss', helmet];
  const jersey = pick(LOCKER.jerseys);
  const pants = pick(LOCKER.pants);
  const contrast = (base) => pick(['red', 'black', 'white'].filter((c) => c !== base));
  const numberFill = contrast(jersey);
  return mergeCombo(DEFAULT_COMBO, {
    helmet: {
      shell, finish,
      stripe: pick(['none', 'single', 'double', 'tri']),
      stripeColor: contrast(shell), stripeTrim: contrast(shell),
      decalColor: contrast(shell), decalTrim: contrast(shell),
      mask: pick(['black', 'white', shell === 'chrome' ? 'black' : shell]),
      visor: pick(['none', 'clear', 'smoke', 'iridescent']),
    },
    jersey: {
      base: jersey, numberFill,
      trimColor: pick(['red', 'black', 'white'].filter((c) => c !== jersey && c !== numberFill)),
      stripeColor: contrast(jersey), stripeColor2: contrast(jersey), collar: contrast(jersey),
      sleeveStripe: pick(['none', 'single', 'double', 'triple']),
      number: String(Math.floor(Math.random() * 99) + 1),
    },
    pants: {
      base: pants, stripe: pick(['none', 'single', 'double', 'tri']),
      stripeColor: contrast(pants), stripeTrim: contrast(pants),
    },
    socks: { base: pick([jersey, pants, 'black', 'white']), stripe: pick(['none', 'single', 'double']), stripeColor: contrast(jersey) },
    cleats: { base: pick(['black', 'white']), sole: pick(['black', 'white']) },
    extras: { gloves: pick(['black', 'white', jersey]) },
  });
}
