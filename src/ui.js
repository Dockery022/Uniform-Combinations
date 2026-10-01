// Control panel: tabs of fields generated from a schema, preset cards, and
// the combo readout. Every control writes into the combo and calls onChange.
import { COLORS, DEFAULT_COMBO, OPTIONS, PRESETS, SKIN_TONES, SWATCHES } from './team.js';
import { colorName, comboNames, hex, lockerStatus, mergeCombo, sanitizeName, sanitizeNumber } from './combo.js';

const color = (label, path, swatches, when) => ({ type: 'color', label, path, swatches, when });
const choice = (label, path, options, when) => ({ type: 'choice', label, path, options, when });

export const TABS = [
  {
    id: 'helmet', label: 'Helmet',
    fields: [
      color('Shell', 'helmet.shell', SWATCHES.shell),
      choice('Finish', 'helmet.finish', OPTIONS.finish),
      choice('Center stripe', 'helmet.stripe', OPTIONS.helmetStripe),
      color('Stripe', 'helmet.stripeColor', SWATCHES.trim, (c) => c.helmet.stripe !== 'none'),
      color('Stripe edge', 'helmet.stripeTrim', SWATCHES.trim, (c) => c.helmet.stripe === 'tri'),
      choice('Side decal', 'helmet.decal', OPTIONS.decal),
      { type: 'file', label: 'Decal artwork', path: 'helmet.decalImage', when: (c) => c.helmet.decal === 'custom' },
      color('Decal fill', 'helmet.decalColor', SWATCHES.trim, (c) => !['none', 'custom'].includes(c.helmet.decal)),
      color('Decal outline', 'helmet.decalTrim', SWATCHES.trim, (c) => !['none', 'custom'].includes(c.helmet.decal)),
      choice('Facemask', 'helmet.maskStyle', OPTIONS.maskStyle),
      color('Facemask color', 'helmet.mask', SWATCHES.hardware),
      choice('Visor', 'helmet.visor', OPTIONS.visor),
    ],
  },
  {
    id: 'jersey', label: 'Jersey',
    fields: [
      color('Body', 'jersey.base', SWATCHES.fabric),
      { type: 'text', label: 'Number', path: 'jersey.number', inputmode: 'numeric', maxlength: 2, clean: sanitizeNumber },
      { type: 'text', label: 'Name on back', path: 'jersey.name', maxlength: 14, clean: sanitizeName },
      choice('Number font', 'jersey.numberFont', OPTIONS.numberFont),
      color('Number fill', 'jersey.numberFill', SWATCHES.trim),
      choice('Number outline', 'jersey.numberTrim', OPTIONS.numberTrim),
      color('Outline', 'jersey.trimColor', SWATCHES.trim, (c) => c.jersey.numberTrim !== 'none'),
      color('Outer outline', 'jersey.trimColor2', SWATCHES.trim, (c) => c.jersey.numberTrim === 'double'),
      choice('Sleeve stripes', 'jersey.sleeveStripe', OPTIONS.sleeveStripe),
      color('Stripe', 'jersey.stripeColor', SWATCHES.trim, (c) => c.jersey.sleeveStripe !== 'none'),
      color('Center stripe', 'jersey.stripeColor2', SWATCHES.trim, (c) => c.jersey.sleeveStripe === 'triple'),
      { type: 'toggle', label: 'Sleeve numbers', path: 'jersey.tvNumbers' },
      choice('Chest', 'jersey.chest', OPTIONS.chest),
      color('Collar', 'jersey.collar', SWATCHES.trim),
    ],
  },
  {
    id: 'pants', label: 'Pants',
    fields: [
      color('Pants', 'pants.base', SWATCHES.fabric),
      choice('Side stripe', 'pants.stripe', OPTIONS.pantsStripe),
      color('Stripe', 'pants.stripeColor', SWATCHES.trim, (c) => c.pants.stripe !== 'none'),
      color('Stripe edge', 'pants.stripeTrim', SWATCHES.trim, (c) => c.pants.stripe === 'tri'),
      color('Belt', 'pants.belt', SWATCHES.hardware),
    ],
  },
  {
    id: 'feet', label: 'Socks & cleats',
    fields: [
      color('Socks', 'socks.base', SWATCHES.fabric),
      choice('Sock stripes', 'socks.stripe', OPTIONS.sockStripe),
      color('Stripe', 'socks.stripeColor', SWATCHES.trim, (c) => c.socks.stripe !== 'none'),
      color('Cleats', 'cleats.base', SWATCHES.hardware),
      color('Soles', 'cleats.sole', SWATCHES.hardware),
    ],
  },
  {
    id: 'player', label: 'Player',
    fields: [
      color('Gloves', 'extras.gloves', SWATCHES.trim),
      choice('Arm sleeves', 'extras.armSleeves', OPTIONS.armSleeves),
      { type: 'toggle', label: 'Towel', path: 'extras.towel' },
      { type: 'skin', label: 'Skin tone', path: 'extras.skin' },
    ],
  },
];

const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const set = (obj, path, value) => {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
};
const idFor = (path, suffix = '') => `f-${path.replace(/\./g, '-')}${suffix}`;

function el(tag, attrs = {}, children = []) {
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

export class Panel {
  constructor({ getCombo, onChange, onPreset, onDecalFile }) {
    this.getCombo = getCombo;
    this.onChange = onChange;
    this.onPreset = onPreset;
    this.onDecalFile = onDecalFile;
    this.tab = 'helmet';
    this.tabsEl = document.getElementById('tabs');
    this.fieldsEl = document.getElementById('fields');
    this.presetsEl = document.getElementById('presets');
    this.renderTabs();
    this.renderPresets();
    this.renderFields();
  }

  renderTabs() {
    this.tabsEl.replaceChildren(...TABS.map((t) => el('button', {
      class: 'tab', role: 'tab', id: `tab-${t.id}`, 'aria-selected': String(t.id === this.tab),
      'aria-controls': 'fields', tabindex: t.id === this.tab ? '0' : '-1', text: t.label,
      onclick: () => this.selectTab(t.id),
      onkeydown: (e) => {
        const i = TABS.findIndex((x) => x.id === this.tab);
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        this.selectTab(TABS[(i + step + TABS.length) % TABS.length].id);
        document.getElementById(`tab-${this.tab}`)?.focus();
      },
    })));
  }

  selectTab(id) {
    this.tab = id;
    this.renderTabs();
    this.renderFields();
  }

  renderPresets() {
    const cards = PRESETS.map((p) => {
      const combo = mergeCombo(DEFAULT_COMBO, p.combo);
      const names = comboNames(combo);
      return el('button', {
        class: 'preset', id: `preset-${p.id}`, onclick: () => this.onPreset(p.id),
        'aria-label': `${p.name}: ${names.helmet} helmet, ${names.jersey} jersey, ${names.pants} pants`,
      }, [
        el('span', { class: 'preset-chips', 'aria-hidden': 'true' }, [
          el('i', { class: `chip-dot${combo.helmet.finish === 'chrome' ? ' is-chrome' : ''}`, style: `--c:${hex(combo.helmet.shell)}` }),
          el('i', { class: 'chip-dot', style: `--c:${hex(combo.jersey.base)}` }),
          el('i', { class: 'chip-dot', style: `--c:${hex(combo.pants.base)}` }),
        ]),
        el('span', { class: 'preset-name', text: p.name }),
        el('span', { class: 'preset-hjp', text: `${names.helmet} · ${names.jersey} · ${names.pants}` }),
      ]);
    });
    this.presetsEl.replaceChildren(...cards);
  }

  renderFields() {
    const combo = this.getCombo();
    const tab = TABS.find((t) => t.id === this.tab);
    const focusedId = document.activeElement?.id;
    const nodes = tab.fields.filter((f) => !f.when || f.when(combo)).map((f) => this.field(f, combo));
    this.fieldsEl.setAttribute('aria-labelledby', `tab-${tab.id}`);
    this.fieldsEl.replaceChildren(...nodes);
    if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  }

  commit(path, value, rerender = true) {
    const combo = this.getCombo();
    set(combo, path, value);
    this.onChange(combo);
    if (rerender) this.renderFields();
  }

  field(f, combo) {
    const value = get(combo, f.path);
    const labelId = idFor(f.path, '-label');
    const wrap = (control, extra) => el('div', { class: 'field' }, [
      el('div', { class: 'field-label', id: labelId }, [el('span', { text: f.label }), extra && el('span', { class: 'field-value', text: extra })]),
      control,
    ]);

    if (f.type === 'color') {
      const isCustom = !COLORS[value];
      const swatches = f.swatches.map((key) => el('button', {
        class: 'swatch', role: 'radio', id: idFor(f.path, `-${key}`), 'aria-checked': String(value === key),
        'aria-label': COLORS[key].name, title: COLORS[key].name, style: `--sw:${COLORS[key].hex}`,
        onclick: () => this.commit(f.path, key),
      }));
      const picker = el('input', {
        type: 'color', id: idFor(f.path, '-custom'), value: hex(value), 'aria-label': `${f.label}: custom color`,
        oninput: (e) => this.commit(f.path, e.target.value, false),
        onchange: () => this.renderFields(),
      });
      const custom = el('label', {
        class: `swatch swatch-custom${isCustom ? ' is-selected' : ''}`, title: 'Custom color',
        style: isCustom ? `--sw:${hex(value)}` : '',
      }, [picker]);
      return wrap(el('div', { class: 'swatches', role: 'radiogroup', 'aria-labelledby': labelId }, [...swatches, custom]), colorName(value));
    }

    if (f.type === 'choice') {
      const buttons = f.options.map((o) => el('button', {
        class: 'opt', role: 'radio', id: idFor(f.path, `-${o.value}`), 'aria-checked': String(value === o.value), text: o.label,
        onclick: () => this.commit(f.path, o.value),
      }));
      return wrap(el('div', { class: 'opts', role: 'radiogroup', 'aria-labelledby': labelId }, buttons));
    }

    if (f.type === 'text') {
      const input = el('input', {
        class: 'text-input', id: idFor(f.path), type: 'text', value, maxlength: f.maxlength, inputmode: f.inputmode,
        autocomplete: 'off', spellcheck: 'false', 'aria-labelledby': labelId,
        oninput: (e) => {
          const clean = f.clean(e.target.value);
          if (f.path === 'jersey.number' && e.target.value === '') return;
          this.commit(f.path, clean, false);
        },
        onblur: (e) => { e.target.value = get(this.getCombo(), f.path); },
      });
      return wrap(input);
    }

    if (f.type === 'toggle') {
      const input = el('input', {
        type: 'checkbox', id: idFor(f.path), class: 'toggle-input', checked: value,
        onchange: (e) => this.commit(f.path, e.target.checked),
      });
      return el('label', { class: 'field field-toggle', for: idFor(f.path) }, [
        el('span', { class: 'field-label', text: f.label }), input, el('span', { class: 'toggle', 'aria-hidden': 'true' }),
      ]);
    }

    if (f.type === 'skin') {
      const tones = SKIN_TONES.map((tone, i) => el('button', {
        class: 'swatch', role: 'radio', id: idFor(f.path, `-${i}`), 'aria-checked': String(value === i),
        'aria-label': `Skin tone ${i + 1}`, title: `Tone ${i + 1}`, style: `--sw:${tone}`,
        onclick: () => this.commit(f.path, i),
      }));
      return wrap(el('div', { class: 'swatches', role: 'radiogroup', 'aria-labelledby': labelId }, tones));
    }

    if (f.type === 'file') {
      const input = el('input', {
        type: 'file', id: idFor(f.path), accept: 'image/png,image/svg+xml,image/webp,image/jpeg', class: 'file-input',
        onchange: (e) => e.target.files?.[0] && this.onDecalFile(e.target.files[0]),
      });
      const hasImage = Boolean(combo.helmet.decalImage);
      return wrap(el('div', { class: 'file-row' }, [
        el('label', { class: 'btn btn-quiet', for: idFor(f.path), text: hasImage ? 'Replace image' : 'Choose image' }),
        input,
        el('span', { class: 'file-note', text: 'PNG or SVG with a transparent background works best. Artwork faces forward on both sides.' }),
      ]));
    }
    return el('div');
  }

  updateReadout(combo) {
    const names = comboNames(combo);
    const { total, inLocker } = lockerStatus(combo);
    const slot = (label, name, c, chrome) => el('div', { class: 'slot' }, [
      el('span', { class: 'slot-label', text: label }),
      el('span', { class: 'slot-value' }, [
        el('i', { class: `chip-dot${chrome ? ' is-chrome' : ''}`, style: `--c:${c}`, 'aria-hidden': 'true' }),
        el('span', { text: name }),
      ]),
    ]);
    document.getElementById('readout-slots').replaceChildren(
      slot('Helmet', names.helmet, hex(combo.helmet.shell), combo.helmet.finish === 'chrome'),
      slot('Jersey', names.jersey, hex(combo.jersey.base)),
      slot('Pants', names.pants, hex(combo.pants.base)),
    );
    document.getElementById('readout-meta').textContent = inLocker
      ? `No. ${combo.jersey.number} · One of ${total} locker combos`
      : `No. ${combo.jersey.number} · Custom combo, outside the locker`;
  }
}
