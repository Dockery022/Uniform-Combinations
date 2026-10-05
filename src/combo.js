// Combo state: validation, names, the 3D look for a combo, and share codes.
import { ART } from './uniform-art.js';
import {
  DEFAULT_STATE, FACEMASKS, GLOVES, GRAPHIC_WORD, GROUP_HEX, HELMET_NOTE, JERSEY_NUMBERS, JERSEY_SLEEVES, LIB, MASK_DEF, SKIN_TONES, VISORS,
} from './team.js';

const row = (kind, id) => LIB[kind].find((r) => r[0] === id);

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Copy only known keys with valid values, so stale saves and hand-edited
// links can't inject anything unexpected.
export function cleanState(patch) {
  const out = clone(DEFAULT_STATE);
  if (!patch || typeof patch !== 'object') return out;
  for (const kind of ['helmet', 'jersey', 'pants', 'socks', 'shoes']) {
    if (row(kind, patch[kind])) out[kind] = patch[kind];
  }
  if (FACEMASKS.some(([n]) => n === patch.facemask)) out.facemask = patch.facemask;
  if (GLOVES.some(([n]) => n === patch.gloves)) out.gloves = patch.gloves;
  if (VISORS.some(([v]) => v === patch.visor)) out.visor = patch.visor;
  if (Number.isInteger(patch.skin) && patch.skin >= 0 && patch.skin < SKIN_TONES.length) out.skin = patch.skin;
  if (patch.site === 'vs' || patch.site === 'at') out.site = patch.site;
  if (typeof patch.showCrest === 'boolean') out.showCrest = patch.showCrest;
  for (const key of ['helmetNote', 'opponent', 'date', 'kickoff', 'network', 'venue']) {
    if (typeof patch[key] === 'string') out[key] = patch[key].slice(0, 60);
  }
  if (typeof patch.name === 'string') out.name = sanitizeName(patch.name);
  if (typeof patch.number === 'string' && sanitizeNumber(patch.number)) out.number = sanitizeNumber(patch.number);
  if (typeof patch.backNumber === 'string' && sanitizeNumber(patch.backNumber)) out.backNumber = sanitizeNumber(patch.backNumber);
  return out;
}

// Jersey numbers are one or two digits.
export function sanitizeNumber(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 2);
}

export function sanitizeName(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9 .'-]/g, '').slice(0, 14);
}

// "Red Louie", "White 2026" — the design's names for a piece.
export function pieceName(kind, id) {
  const r = row(kind, id);
  return r ? `${r[1]} ${r[2]}` : id;
}

// The color group a piece belongs to ("Red", "White", "Black", "Gray").
export function groupOf(kind, id) {
  return row(kind, id)?.[1] ?? 'White';
}

// The big word for a piece on the game graphic: its own name for the
// alternate sets, otherwise its color group.
export function graphicWord(kind, id) {
  return (GRAPHIC_WORD[id] ?? groupOf(kind, id)).toUpperCase();
}

// Switching helmets brings the new helmet's facemask, and its callout unless
// the current callout was typed by hand.
export function pickHelmet(state, id) {
  const patch = { helmet: id, facemask: MASK_DEF[id] || 'Red' };
  if (state.helmetNote === (HELMET_NOTE[state.helmet] ?? '')) patch.helmetNote = HELMET_NOTE[id] ?? '';
  return patch;
}

export function groupHex(group) {
  return GROUP_HEX[group] ?? '#888888';
}

// Art image for a piece, as the panel and the graphic show it. ART_VERSION
// changes whenever the art is redrawn, so browsers fetch the new pictures
// instead of showing ones they cached.
const ART_VERSION = '2026-10-05c';
const art = (file) => `assets/uni/${file}.webp?v=${ART_VERSION}`;

export function artUrl(kind, id, state) {
  const r = row(kind, id) ?? LIB[kind][0];
  if (kind === 'helmet') return art(`${r[3]}-mask-${state.facemask.toLowerCase()}`);
  if (kind === 'socks') {
    if (!r[3]) return artUrl('pants', state.pants, state);
    return art(`${r[3]}${/ 20$/.test(state.pants) ? '-20' : ''}`);
  }
  if (kind === 'shoes') return r[3] ? art(r[3]) : null;
  return art(r[3]);
}

// Everything the 3D player needs for this state.
export function resolveLook(state) {
  const file = (kind) => (row(kind, state[kind]) ?? LIB[kind][0])[3];
  const pantsFile = file('pants');
  const pants = { file: pantsFile, spec: ART.pants[pantsFile] };
  const sockFile = file('socks');
  const shoeFile = file('shoes');
  return {
    helmet: { file: file('helmet'), spec: ART.helmet[file('helmet')] },
    facemask: FACEMASKS.find(([n]) => n === state.facemask)?.[1] ?? FACEMASKS[0][1],
    jersey: {
      file: file('jersey'),
      spec: ART.jersey[file('jersey')],
      style: JERSEY_NUMBERS[file('jersey')] ?? { font: 'jersey' },
      sleeves: JERSEY_SLEEVES[file('jersey')] ?? null,
    },
    pants,
    socks: sockFile ? ART.socks[sockFile] : pants.spec.socks,
    // "No shoes" only leaves them out of the graphic; the player still wears black cleats.
    cleats: ART.shoes[shoeFile ?? 'shoes-black'],
    shoes: shoeFile ?? 'shoes-black',
    gloves: GLOVES.find(([n]) => n === state.gloves)?.[1] ?? null,
    visor: state.visor,
    skin: state.skin,
    number: state.number, // chest and shoulders
    backNumber: state.backNumber || state.number, // back and helmet
    name: state.name,
  };
}

// Share codes: base64url JSON of only what differs from the defaults.
export function encodeState(state) {
  const diff = { v: 2 };
  for (const [k, v] of Object.entries(state)) if (DEFAULT_STATE[k] !== v) diff[k] = v;
  const bytes = new TextEncoder().encode(JSON.stringify(diff));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState(code) {
  const b64 = String(code).trim().replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  if (!data || data.v !== 2) throw new Error('Unknown code version');
  return cleanState(data);
}
