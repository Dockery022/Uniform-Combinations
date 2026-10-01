// The control panel, laid out like the Combo Builder design: The Uniform
// (piece tabs with art, facemask, options grouped by color, helmet callout),
// The Game, and Saved Combos. Every control writes into the state and calls
// onChange; the panel re-renders the parts that depend on it.
import { FACEMASKS, GLOVES, GROUP_HEX, LIB, SKIN_TONES, VISORS } from './team.js';
import { artUrl, pickHelmet, pieceName, sanitizeName, sanitizeNumber } from './combo.js';

const TABS = [['helmet', 'Helmet'], ['jersey', 'Jersey'], ['pants', 'Pants'], ['socks', 'Accessories']];
const GAME_FIELDS = [['date', 'Date'], ['kickoff', 'Kickoff'], ['network', 'Network'], ['venue', 'Venue']];

// How each kind of art sits in its tile.
const FIT = {
  helmet: 'contain', jersey: 'contain', pants: 'contain', shoes: 'contain',
  socks: 'auto 300%', // the bottom third of the pants art is the socks
};

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

const art = (url, kind, label) => el('span', {
  class: 'art', role: 'img', 'aria-label': label,
  style: url ? `background-image:url("${url}");background-size:${FIT[kind]};background-position:${kind === 'socks' ? 'center bottom' : 'center'}` : '',
});

export class Panel {
  constructor({ getState, onChange, onSave, onLoad, onRemove }) {
    this.getState = getState;
    this.onChange = onChange;
    this.onSave = onSave;
    this.onLoad = onLoad;
    this.onRemove = onRemove;
    this.tab = 'helmet';
    this.$ = (id) => document.getElementById(id);
    this.bindGame();
    this.$('save').addEventListener('click', () => this.onSave());
    this.$('note').addEventListener('input', (e) => this.set({ helmetNote: e.target.value.slice(0, 60) }, false));
    this.render();
  }

  set(patch, rerender = true) {
    Object.assign(this.getState(), patch);
    this.onChange(this.getState());
    if (rerender) this.render();
  }

  render() {
    this.renderTabs();
    this.renderMasks();
    this.renderGroups();
    this.syncInputs();
  }

  renderTabs() {
    const s = this.getState();
    const buttons = TABS.map(([kind, label]) => {
      let sel = pieceName(kind, s[kind]);
      if (kind === 'socks') {
        sel = (s.socks === 'Match' ? 'Socks · match' : `${s.socks} socks`) + (s.shoes !== 'None' ? ` · ${s.shoes} cleats` : '');
      }
      return el('button', {
        type: 'button', class: 'piece-tab', role: 'tab', id: `tab-${kind}`, 'aria-selected': String(this.tab === kind),
        'aria-controls': 'groups', tabindex: this.tab === kind ? '0' : '-1',
        onclick: () => { this.tab = kind; this.render(); },
        onkeydown: (e) => {
          const i = TABS.findIndex(([k]) => k === this.tab);
          const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          this.tab = TABS[(i + step + TABS.length) % TABS.length][0];
          this.render();
          this.$(`tab-${this.tab}`)?.focus();
        },
      }, [
        art(artUrl(kind, s[kind], s), kind, sel),
        el('span', { class: 'piece-label', text: label }),
        el('span', { class: 'piece-sel', text: sel }),
      ]);
    });
    this.$('piece-tabs').replaceChildren(...buttons);
  }

  renderMasks() {
    const s = this.getState();
    const row = this.$('masks');
    row.hidden = this.tab !== 'helmet';
    row.replaceChildren(
      el('span', { class: 'eyebrow', id: 'masks-label', text: 'Facemask' }),
      ...FACEMASKS.map(([name, hex]) => el('button', {
        type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(s.facemask === name),
        onclick: () => this.set({ facemask: name }),
      }, [el('i', { class: 'dot', style: `--c:${hex}`, 'aria-hidden': 'true' }), el('span', { text: name })])),
    );
  }

  renderGroups() {
    const s = this.getState();
    const kind = this.tab;
    const tile = (k) => ([id, group, tag, file]) => {
      const label = k === 'socks' ? (id === 'Match' ? 'Match pants' : group) : k === 'shoes' ? (id === 'None' ? 'None' : group) : tag;
      const full = `${group} · ${tag}`;
      return el('button', {
        type: 'button', class: 'tile', role: 'radio', 'aria-checked': String(s[k] === id), title: full,
        onclick: () => this.set(k === 'helmet' ? pickHelmet(s, id) : { [k]: id }),
      }, [
        art(file || k === 'socks' ? artUrl(k, id, s) : null, k, full),
        el('span', { class: 'tile-tag', text: label }),
      ]);
    };
    const group = (title, dot, items, k) => el('div', { class: 'group' }, [
      el('div', { class: 'group-head' }, [
        dot && el('i', { class: 'dot dot-sm', style: `--c:${dot}`, 'aria-hidden': 'true' }),
        el('span', { class: 'eyebrow', text: `${title} · ${items.length}` }),
      ]),
      el('div', { class: 'tiles', role: 'radiogroup', 'aria-label': title }, items.map(tile(k))),
    ]);

    let groups;
    if (kind === 'socks') {
      groups = [group('Socks', null, LIB.socks, 'socks'), group('Shoes', null, LIB.shoes, 'shoes'), this.extras()];
    } else {
      groups = ['Red', 'White', 'Black', 'Gray']
        .map((color) => [color, LIB[kind].filter((r) => r[1] === color)])
        .filter(([, items]) => items.length)
        .map(([color, items]) => group(color, GROUP_HEX[color], items, kind));
      if (kind === 'jersey') groups.push(this.lettering());
    }
    const box = this.$('groups');
    box.setAttribute('aria-labelledby', `tab-${kind}`);
    box.replaceChildren(...groups);
  }

  // 3D-only options, under Accessories.
  extras() {
    const s = this.getState();
    const chips = (label, options, key) => el('div', { class: 'extra' }, [
      el('span', { class: 'eyebrow', text: label }),
      el('div', { class: 'chips', role: 'radiogroup', 'aria-label': label }, options.map(([value, text, hex]) => el('button', {
        type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(s[key] === value),
        onclick: () => this.set({ [key]: value }),
      }, [hex !== undefined && el('i', { class: `dot${hex ? '' : ' dot-none'}`, style: hex ? `--c:${hex}` : '', 'aria-hidden': 'true' }), el('span', { text })]))),
    ]);
    return el('div', { class: 'group' }, [
      el('div', { class: 'group-head' }, [el('span', { class: 'eyebrow', text: 'On the 3D player' })]),
      chips('Gloves', GLOVES.map(([n, hex]) => [n, n, hex]), 'gloves'),
      chips('Visor', VISORS.map(([v, t]) => [v, t]), 'visor'),
      el('div', { class: 'extra' }, [
        el('span', { class: 'eyebrow', text: 'Skin tone' }),
        el('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Skin tone' }, SKIN_TONES.map((tone, i) => el('button', {
          type: 'button', class: 'swatch', role: 'radio', 'aria-checked': String(s.skin === i), 'aria-label': `Skin tone ${i + 1}`,
          style: `--c:${tone}`, onclick: () => this.set({ skin: i }),
        }))),
      ]),
    ]);
  }

  // Number and name, under the jerseys. The art's "10" is relettered on the player.
  lettering() {
    const s = this.getState();
    const number = el('input', {
      class: 'input', id: 'number', type: 'text', inputmode: 'numeric', value: s.number, maxlength: 2, autocomplete: 'off',
      oninput: (e) => {
        const n = sanitizeNumber(e.target.value);
        if (n) this.set({ number: n }, false);
      },
      onblur: (e) => { e.target.value = this.getState().number; },
    });
    const name = el('input', {
      class: 'input', id: 'name', type: 'text', value: s.name, maxlength: 14, autocomplete: 'off', spellcheck: 'false',
      placeholder: 'No name',
      oninput: (e) => this.set({ name: sanitizeName(e.target.value) }, false),
      onblur: (e) => { e.target.value = this.getState().name; },
    });
    return el('div', { class: 'group' }, [
      el('div', { class: 'group-head' }, [el('span', { class: 'eyebrow', text: 'On the 3D player' })]),
      el('div', { class: 'lettering' }, [
        el('label', { class: 'field' }, [el('span', { class: 'eyebrow', text: 'Number' }), number]),
        el('label', { class: 'field' }, [el('span', { class: 'eyebrow', text: 'Name on back' }), name]),
      ]),
    ]);
  }

  bindGame() {
    const fields = this.$('game-fields');
    fields.replaceChildren(...GAME_FIELDS.map(([key, label]) => el('label', { class: 'field' }, [
      el('span', { class: 'eyebrow', text: label }),
      el('input', { class: 'input', id: `game-${key}`, type: 'text', autocomplete: 'off', oninput: (e) => this.set({ [key]: e.target.value.slice(0, 60) }, false) }),
    ])));
    this.$('opponent').addEventListener('input', (e) => this.set({ opponent: e.target.value.slice(0, 60) }, false));
    for (const site of ['vs', 'at']) this.$(`site-${site}`).addEventListener('click', () => this.set({ site }));
    this.$('crest').addEventListener('change', (e) => this.set({ showCrest: e.target.checked }));
  }

  // Text inputs only take the state's value when they aren't being typed in.
  syncInputs() {
    const s = this.getState();
    const put = (id, v) => {
      const node = this.$(id);
      if (node && document.activeElement !== node) node.value = v;
    };
    put('note', s.helmetNote);
    put('opponent', s.opponent);
    for (const [key] of GAME_FIELDS) put(`game-${key}`, s[key]);
    for (const site of ['vs', 'at']) this.$(`site-${site}`).setAttribute('aria-pressed', String(s.site === site));
    this.$('crest').checked = s.showCrest;
  }

  renderSaved(saved) {
    this.$('saved-empty').hidden = saved.length > 0;
    this.$('saved').replaceChildren(...saved.map((c) => el('li', { class: 'saved-row' }, [
      el('button', { type: 'button', class: 'saved-open', onclick: () => this.onLoad(c) }, [
        el('span', { class: 'saved-title', text: `${c.site} ${c.opponent} · ${c.date}` }),
        el('span', {
          class: 'saved-sub',
          text: `${pieceName('helmet', c.helmet)} · ${c.facemask} mask / ${pieceName('jersey', c.jersey)} / ${pieceName('pants', c.pants)}`
            + `${c.socks && c.socks !== 'Match' ? ` · ${c.socks} socks` : ''}${c.helmetNote ? ` · ${c.helmetNote}` : ''}`,
        }),
      ]),
      el('button', { type: 'button', class: 'saved-del', 'aria-label': `Delete ${c.site} ${c.opponent}`, text: 'Delete', onclick: () => this.onRemove(c) }),
    ])));
  }
}
