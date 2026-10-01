// Checks for the combo data and state helpers. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  artUrl, cleanState, decodeState, encodeState, graphicWord, pickHelmet, resolveLook, sanitizeName, sanitizeNumber,
} from '../src/combo.js';
import { DEFAULT_STATE, FACEMASKS, GRAPHIC_WORD, HELMET_NOTE, LIB, MASK_DEF } from '../src/team.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const exists = (url) => existsSync(root + url);

test('every piece has its art and sampled colors', () => {
  const state = { ...DEFAULT_STATE };
  for (const [id] of LIB.helmet) {
    for (const [mask] of FACEMASKS) assert.ok(exists(artUrl('helmet', id, { ...state, facemask: mask })), `${id} helmet, ${mask} mask`);
    assert.ok(resolveLook({ ...state, helmet: id }).helmet.spec, `${id} helmet colors`);
  }
  for (const kind of ['jersey', 'pants']) {
    for (const [id] of LIB[kind]) {
      assert.ok(exists(artUrl(kind, id, state)), `${id} ${kind} art`);
      assert.ok(resolveLook({ ...state, [kind]: id })[kind].spec, `${id} ${kind} colors`);
    }
  }
  for (const [pants] of LIB.pants) {
    for (const [socks] of LIB.socks) {
      const s = { ...state, pants, socks };
      assert.ok(exists(artUrl('socks', socks, s)), `${socks} socks with ${pants} pants`);
      assert.ok(resolveLook(s).socks, `${socks} socks colors with ${pants} pants`);
    }
  }
  for (const [id, , , file] of LIB.shoes) {
    if (file) assert.ok(exists(artUrl('shoes', id, state)), `${id} cleats art`);
    assert.ok(resolveLook({ ...state, shoes: id }).cleats, `${id} cleats colors`);
  }
});

test('team tables only name pieces that exist', () => {
  const helmets = new Set(LIB.helmet.map(([id]) => id));
  for (const id of [...Object.keys(MASK_DEF), ...Object.keys(HELMET_NOTE)]) assert.ok(helmets.has(id), id);
  const pieces = new Set(['helmet', 'jersey', 'pants'].flatMap((k) => LIB[k].map(([id]) => id)));
  for (const id of Object.keys(GRAPHIC_WORD)) assert.ok(pieces.has(id), id);
  assert.equal(DEFAULT_STATE.helmetNote, HELMET_NOTE[DEFAULT_STATE.helmet]);
});

test('share codes round-trip and reject junk', () => {
  const state = { ...DEFAULT_STATE, helmet: 'Black Chrome', facemask: 'Black', jersey: 'Halloween 26', number: '88', name: "O'NEIL" };
  assert.deepEqual(decodeState(encodeState(state)), state);
  assert.deepEqual(decodeState(encodeState(DEFAULT_STATE)), DEFAULT_STATE);
  const junk = cleanState({ helmet: 'Purple', skin: 99, site: 'home', number: 'abc', extra: '<script>' });
  assert.deepEqual(junk, DEFAULT_STATE);
});

test('numbers and names are cleaned', () => {
  assert.equal(sanitizeNumber('#123'), '12');
  assert.equal(sanitizeName('smith-jones <b>'), 'SMITH-JONES B');
});

test('alternate sets keep their name on the graphic', () => {
  assert.equal(graphicWord('jersey', 'White Alt 20'), 'ALI');
  assert.equal(graphicWord('helmet', 'Halloween 26'), 'HALLOWEEN');
  assert.equal(graphicWord('pants', 'Black 24'), 'BLACK');
});

test('switching helmets swaps an automatic callout but keeps a typed one', () => {
  const state = { ...DEFAULT_STATE };
  assert.deepEqual(pickHelmet(state, 'White Alt 20'), { helmet: 'White Alt 20', facemask: 'Black', helmetNote: '' });
  assert.equal(pickHelmet({ ...state, helmet: 'White Alt 20', helmetNote: '' }, 'Black').helmetNote, 'Heisman Louie');
  assert.equal(pickHelmet({ ...state, helmetNote: 'Senior Day' }, 'White Alt 20').helmetNote, undefined);
});
