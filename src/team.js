// Team data for the Combo Builder.
//
// This is the one file to edit when matching the builder to a new design:
// swap the hex values in COLORS, the pieces in LOCKER, and the PRESETS.
// Every color slot in a combo stores either a COLORS key ("red") or a raw
// hex string ("#aa1122") picked with the custom swatch.

export const TEAM = {
  school: 'Louisville',
  nickname: 'Cardinals',
  script: 'Cards',
  wordmark: 'LOUISVILLE',
  defaultName: 'CARDINALS',
};

export const COLORS = {
  red: { name: 'Red', hex: '#C8102E' },
  black: { name: 'Black', hex: '#141416' },
  white: { name: 'White', hex: '#F2F2EF' },
  gray: { name: 'Gray', hex: '#7A7B80' },
  chrome: { name: 'Silver', hex: '#C4C7CC' },
  gold: { name: 'Gold', hex: '#F2B93B' },
  cream: { name: 'Cream', hex: '#E9DFC8' },
};

// Swatches offered for each kind of part, in display order.
export const SWATCHES = {
  shell: ['red', 'black', 'white', 'gray', 'chrome'],
  fabric: ['red', 'black', 'white', 'gray', 'cream'],
  trim: ['red', 'black', 'white', 'gray', 'gold'],
  hardware: ['black', 'white', 'red', 'gray', 'chrome'],
};

export const SKIN_TONES = ['#F1C8A8', '#DDA982', '#BC8259', '#93603F', '#6C412A', '#45291B'];

// The pieces the equipment room actually stocks. The builder counts
// helmets x jerseys x pants to show how many base combos are possible,
// and flags a combo that uses a piece outside this list as custom.
// Helmet keys are "<shell>" for gloss, or "<finish>-<shell>" otherwise.
export const LOCKER = {
  helmets: ['red', 'black', 'white', 'chrome-red'],
  jerseys: ['red', 'black', 'white'],
  pants: ['red', 'black', 'white'],
};

export const OPTIONS = {
  finish: [
    { value: 'gloss', label: 'Gloss' },
    { value: 'satin', label: 'Satin' },
    { value: 'matte', label: 'Matte' },
    { value: 'chrome', label: 'Chrome' },
  ],
  helmetStripe: [
    { value: 'none', label: 'None' },
    { value: 'single', label: 'Single' },
    { value: 'double', label: 'Double' },
    { value: 'tri', label: 'Tri' },
  ],
  decal: [
    { value: 'letter', label: 'Letter' },
    { value: 'script', label: 'Script' },
    { value: 'number', label: 'Number' },
    { value: 'custom', label: 'Upload' },
    { value: 'none', label: 'None' },
  ],
  visor: [
    { value: 'none', label: 'None' },
    { value: 'clear', label: 'Clear' },
    { value: 'smoke', label: 'Smoke' },
    { value: 'iridescent', label: 'Iridescent' },
  ],
  numberFont: [
    { value: 'block', label: 'Block' },
    { value: 'modern', label: 'Modern' },
  ],
  numberTrim: [
    { value: 'none', label: 'None' },
    { value: 'single', label: 'Single' },
    { value: 'double', label: 'Double' },
  ],
  sleeveStripe: [
    { value: 'none', label: 'None' },
    { value: 'single', label: 'Single' },
    { value: 'double', label: 'Double' },
    { value: 'triple', label: 'Triple' },
  ],
  chest: [
    { value: 'wordmark', label: 'Wordmark' },
    { value: 'none', label: 'None' },
  ],
  pantsStripe: [
    { value: 'none', label: 'None' },
    { value: 'single', label: 'Single' },
    { value: 'double', label: 'Double' },
    { value: 'tri', label: 'Tri' },
  ],
  sockStripe: [
    { value: 'none', label: 'None' },
    { value: 'single', label: 'Single' },
    { value: 'double', label: 'Double' },
  ],
  armSleeves: [
    { value: 'none', label: 'None' },
    { value: 'black', label: 'Black' },
    { value: 'white', label: 'White' },
    { value: 'red', label: 'Red' },
  ],
};

export const DEFAULT_COMBO = {
  helmet: {
    shell: 'red', finish: 'gloss',
    stripe: 'single', stripeColor: 'black', stripeTrim: 'white',
    decal: 'letter', decalColor: 'white', decalTrim: 'black',
    mask: 'black', strap: 'white', bumper: 'black', visor: 'smoke',
  },
  jersey: {
    base: 'black', number: '7', numberFont: 'block',
    numberFill: 'white', numberTrim: 'single', trimColor: 'red', trimColor2: 'black',
    sleeveStripe: 'double', stripeColor: 'red', stripeColor2: 'white',
    tvNumbers: true, collar: 'red', chest: 'wordmark', name: TEAM.defaultName,
  },
  pants: { base: 'red', stripe: 'single', stripeColor: 'black', stripeTrim: 'white', belt: 'black' },
  socks: { base: 'black', stripe: 'single', stripeColor: 'red' },
  cleats: { base: 'black', sole: 'white' },
  extras: { gloves: 'black', tape: 'white', armSleeves: 'none', towel: true, skin: 3 },
};

// Starter combos. Each is merged over DEFAULT_COMBO, so a preset only
// lists what it changes. Replace these with the combos from the design file.
export const PRESETS = [
  {
    id: 'home', name: 'Home Red',
    combo: {
      helmet: { shell: 'red', stripe: 'single', stripeColor: 'black', decalColor: 'white', mask: 'black' },
      jersey: { base: 'red', numberFill: 'white', numberTrim: 'single', trimColor: 'black', stripeColor: 'black', stripeColor2: 'white', collar: 'black' },
      pants: { base: 'white', stripe: 'single', stripeColor: 'red', stripeTrim: 'black' },
      socks: { base: 'red', stripe: 'none' },
    },
  },
  {
    id: 'road', name: 'Road White',
    combo: {
      helmet: { shell: 'red', stripe: 'single', stripeColor: 'black', mask: 'black' },
      jersey: { base: 'white', numberFill: 'red', numberTrim: 'single', trimColor: 'black', stripeColor: 'red', stripeColor2: 'black', collar: 'red' },
      pants: { base: 'red', stripe: 'single', stripeColor: 'white', stripeTrim: 'black' },
      socks: { base: 'white', stripe: 'single', stripeColor: 'red' },
      cleats: { base: 'white', sole: 'white' },
      extras: { gloves: 'white' },
    },
  },
  {
    id: 'mix', name: 'Red Black Red',
    combo: {},
  },
  {
    id: 'blackout', name: 'Blackout',
    combo: {
      helmet: { shell: 'black', finish: 'matte', stripe: 'single', stripeColor: 'red', decalColor: 'red', decalTrim: 'black', mask: 'black' },
      jersey: { base: 'black', numberFill: 'red', numberTrim: 'single', trimColor: 'white', stripeColor: 'red', stripeColor2: 'black', collar: 'red' },
      pants: { base: 'black', stripe: 'single', stripeColor: 'red', stripeTrim: 'black' },
      socks: { base: 'black', stripe: 'none' },
    },
  },
  {
    id: 'whiteout', name: 'Whiteout',
    combo: {
      helmet: { shell: 'white', stripe: 'double', stripeColor: 'red', stripeTrim: 'black', decalColor: 'red', decalTrim: 'black', mask: 'white', bumper: 'white', visor: 'clear' },
      jersey: { base: 'white', numberFill: 'black', numberTrim: 'single', trimColor: 'red', stripeColor: 'red', stripeColor2: 'black', collar: 'black' },
      pants: { base: 'white', stripe: 'double', stripeColor: 'red', stripeTrim: 'black' },
      socks: { base: 'white', stripe: 'double', stripeColor: 'red' },
      cleats: { base: 'white', sole: 'white' },
      extras: { gloves: 'white' },
    },
  },
  {
    id: 'redout', name: 'Red Out',
    combo: {
      helmet: { shell: 'red', finish: 'matte', stripe: 'none', decalColor: 'black', decalTrim: 'white', mask: 'red', bumper: 'red', strap: 'black', visor: 'iridescent' },
      jersey: { base: 'red', numberFill: 'black', numberTrim: 'single', trimColor: 'white', stripeColor: 'black', stripeColor2: 'white', collar: 'black' },
      pants: { base: 'red', stripe: 'none' },
      socks: { base: 'red', stripe: 'none' },
      cleats: { base: 'red', sole: 'black' },
      extras: { gloves: 'red', armSleeves: 'black' },
    },
  },
  {
    id: 'chrome', name: 'Chrome Night',
    combo: {
      helmet: { shell: 'red', finish: 'chrome', stripe: 'none', decalColor: 'black', decalTrim: 'white', mask: 'black' },
      jersey: { base: 'black', numberFill: 'white', numberTrim: 'double', trimColor: 'red', trimColor2: 'gray', stripeColor: 'red', stripeColor2: 'gray', collar: 'red', numberFont: 'modern' },
      pants: { base: 'black', stripe: 'tri', stripeColor: 'red', stripeTrim: 'gray' },
      socks: { base: 'black', stripe: 'none' },
    },
  },
  {
    id: 'throwback', name: 'Throwback',
    combo: {
      helmet: { shell: 'white', stripe: 'tri', stripeColor: 'red', stripeTrim: 'black', decal: 'number', decalColor: 'red', decalTrim: 'black', mask: 'gray', bumper: 'gray', visor: 'none' },
      jersey: { base: 'red', numberFill: 'white', numberTrim: 'none', stripeColor: 'white', stripeColor2: 'white', sleeveStripe: 'triple', collar: 'white', chest: 'none' },
      pants: { base: 'cream', stripe: 'tri', stripeColor: 'red', stripeTrim: 'black', belt: 'black' },
      socks: { base: 'red', stripe: 'double', stripeColor: 'white' },
      cleats: { base: 'black', sole: 'black' },
      extras: { gloves: 'white', towel: false },
    },
  },
];
