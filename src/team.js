// Team data for the Combo Builder, matching the Louisville Combo Builder design.
//
// LIB lists every piece in the equipment room the way the design does:
// [id, color group, tag, art file]. The art lives in assets/uni/ and the 3D
// colors sampled from it in src/uniform-art.js (both made by
// tools/prepare-uniforms.py). To add a piece, add its art, rerun the tool and
// add a row here.

// UofL Athletics brand palette (Brand Guidelines, Jan 2023). Beak yellow is
// reserved for the primary mark, so it isn't offered anywhere.
export const BRAND = {
  red: '#C9001F', // Cardinal Red, PMS 200
  black: '#000000',
  white: '#FFFFFF',
  silver: '#8A8D8F', // Metallic Silver, PMS 877
};

// Swatch colors for the color groups in the panel.
export const GROUP_HEX = { Red: BRAND.red, White: BRAND.white, Black: BRAND.black, Gray: BRAND.silver };

export const LIB = {
  helmet: [
    ['Red', 'Red', 'Louie', 'helmet-red'],
    ['White', 'White', 'Cardinal head', 'helmet-white'],
    ['White Louie', 'White', 'Louie', 'helmet-white-louie'],
    ['Black', 'Black', 'Louie', 'helmet-black'],
    ['White 20', 'White', 'Cardinal head · 2020', 'helmet-white-20'],
    ['Red 20', 'Red', '2020', 'helmet-red-20'],
    ['Black 20', 'Black', '2020', 'helmet-black-20'],
    ['White Alt 20', 'White', 'Ali', 'helmet-whitealt-20'],
    ['Black Script', 'Black', 'Cards script', 'helmet-script'],
    ['Red Script', 'Red', 'Cards script', 'helmet-redscript'],
    ['White Stripe', 'White', 'Stripe · cardinal head', 'helmet-whitestripe'],
    ['Halloween 26', 'Black', 'Halloween · 2026', 'helmet-halloween'],
    ['Red Gold', 'Red', 'Gold', 'helmet-redgold'],
    ['Black Chrome', 'Black', 'Chrome', 'helmet-blackchrome'],
    ['Black Matte', 'Black', 'Matte', 'helmet-blackmatte'],
    ['Black Stripe', 'Black', 'Louie · stripe', 'helmet-blackstripe'],
    ['Black 23', 'Black', 'Gray · 2023', 'helmet-black23'],
    ['Black Matte Chrome', 'Black', 'Matte · chrome', 'helmet-blackmattechrome'],
  ],
  jersey: [
    ['Red', 'Red', '2026', 'jersey-red'],
    ['White', 'White', '2026', 'jersey-white'],
    ['Black', 'Black', '2026', 'jersey-black'],
    ['Red 24', 'Red', '2024', 'jersey-red-wing'],
    ['White 24', 'White', '2024', 'jersey-white-wing'],
    ['Black 24', 'Black', '2024', 'jersey-black-wing'],
    ['Red 20', 'Red', '2020', 'jersey-red-20'],
    ['White 20', 'White', '2020', 'jersey-white-20'],
    ['Black 20', 'Black', '2020', 'jersey-black-20'],
    ['White Alt 20', 'White', 'Ali', 'jersey-whitealt-20'],
    ['Halloween 26', 'Black', 'Halloween · 2026', 'jersey-halloween'],
    ['Iron Wings', 'Gray', 'Iron Wings', 'jersey-ironwings'],
    ['Red Gold', 'Red', 'Gold', 'jersey-redgold'],
    ['Black 23', 'Black', 'Gray · 2023', 'jersey-black-23'],
  ],
  pants: [
    ['Red', 'Red', '2026', 'pants-red'],
    ['White', 'White', '2026', 'pants-white'],
    ['Black', 'Black', '2026', 'pants-black'],
    ['Red 24', 'Red', '2024', 'pants-red-script'],
    ['White 24', 'White', '2024', 'pants-white-script'],
    ['Black 24', 'Black', '2024', 'pants-black-script'],
    ['Red 20', 'Red', '2020', 'pants-red-20'],
    ['White 20', 'White', '2020', 'pants-white-20'],
    ['Black 20', 'Black', '2020', 'pants-black-20'],
    ['White Alt 20', 'White', 'Ali', 'pants-whitealt-20'],
    ['Halloween 26', 'Black', 'Halloween · 2026', 'pants-halloween'],
    ['Iron Wings', 'Gray', 'Iron Wings', 'pants-ironwings'],
    ['Red Gold', 'Red', 'Gold', 'pants-redgold'],
    ['Black 23', 'Black', 'Gray · 2023', 'pants-black-23'],
  ],
  socks: [
    ['Match', 'Match', 'Pants socks', null],
    ['Red', 'Red', 'Socks', 'socks-red'],
    ['White', 'White', 'Socks', 'socks-white'],
    ['Black', 'Black', 'Socks', 'socks-black'],
    ['Gray', 'Gray', 'Socks', 'socks-gray'],
  ],
  shoes: [
    ['None', 'None', 'No shoes', null],
    ['Black', 'Black', 'Cleats', 'shoes-black'],
    ['White', 'White', 'Cleats', 'shoes-white'],
    ['Red', 'Red', 'Cleats', 'shoes-red'],
    ['Gray', 'Gray', 'Cleats', 'shoes-gray'],
  ],
};

// The facemask each helmet comes with; anything not listed wears red.
export const MASK_DEF = {
  'Black': 'Black', 'Black 20': 'Black', 'White Alt 20': 'Black', 'Red 20': 'White', 'Black Script': 'Red',
  'Red Script': 'White', 'White Stripe': 'Red', 'Halloween 26': 'Black', 'Red Gold': 'Black',
  'Black Chrome': 'Black', 'Black Matte': 'Black', 'Black Stripe': 'Black', 'Black 23': 'Black',
  'Black Matte Chrome': 'Black',
};

export const FACEMASKS = [['Red', BRAND.red], ['White', BRAND.white], ['Black', BRAND.black]];

// Extras for the 3D player that the flat graphic doesn't show.
export const GLOVES = [['Black', '#111113'], ['White', '#f2f2f0'], ['Red', BRAND.red], ['None', null]];
export const VISORS = [['none', 'None'], ['clear', 'Clear'], ['smoke', 'Smoke'], ['iridescent', 'Iridescent']];
export const SKIN_TONES = ['#F1C8A8', '#DDA982', '#BC8259', '#93603F', '#6C412A', '#45291B'];

// Everything a saved combo holds: the uniform, the game, and the 3D extras.
export const DEFAULT_STATE = {
  helmet: 'Red', facemask: 'Red', jersey: 'White', pants: 'White', socks: 'Match', shoes: 'Black',
  helmetNote: 'Heisman Louie',
  site: 'vs', opponent: 'NC State', date: 'Sat · Oct 3', kickoff: '3:30 PM', network: 'ACCN',
  venue: 'Carter-Finley Stadium', showCrest: true,
  name: '', gloves: 'Black', visor: 'smoke', skin: 3,
};
