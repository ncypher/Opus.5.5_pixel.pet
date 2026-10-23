// Genes: everything that makes one pet look and feel like itself.
// A pet is a seed; the same seed always grows the same creature.

export function rng(seed) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (r, list) => list[Math.floor(r() * list.length)];

// Each palette: outline, dark, base, light, belly, accent, cheek.
export const PALETTES = {
  moss:     ['#1d2b1f', '#4c7a3d', '#7fb85a', '#b9e08a', '#e6f5c4', '#f2c14e', '#f28c8c'],
  plum:     ['#24142e', '#6b3a86', '#9f62c4', '#cf9ee8', '#f2dcfb', '#7ef0c4', '#ff8fb1'],
  tangerine:['#2e1609', '#b4521c', '#f08a3a', '#ffbf7a', '#ffe7c7', '#5fc9e0', '#ff6f6f'],
  tide:     ['#0e1d2b', '#24638a', '#3f9dcf', '#8fd2f2', '#d9f3ff', '#ffd166', '#ff8fa3'],
  rose:     ['#2a1119', '#a63e5c', '#e26d8c', '#f7a7bc', '#ffe0e8', '#8ee3c8', '#ff5d7a'],
  honey:    ['#2b200a', '#a7781b', '#e3b23c', '#f6d77a', '#fff3c9', '#e86a92', '#f28c6c'],
  frost:    ['#151a2c', '#5868a6', '#8e9ee0', '#c9d2fb', '#f0f3ff', '#ffb86b', '#f59bbd'],
  ember:    ['#1c0f12', '#7d2a2a', '#c4463a', '#ef8a5f', '#ffd3b0', '#ffe066', '#ffb3c1'],
  mint:     ['#102620', '#2f8a6e', '#52c49c', '#9ce8c9', '#e1fff2', '#ff9f6b', '#ff8fa3'],
  dusk:     ['#16121f', '#4a4466', '#6f6a96', '#a8a3cf', '#e6e3f7', '#ffcf5c', '#ff9eae'],
};

export const SHAPES = ['round', 'bean', 'pear', 'loaf'];
export const EARS = ['cat', 'bunny', 'antenna', 'horns', 'sprout', 'round'];
export const PATTERNS = ['plain', 'spots', 'stripe', 'patch'];
export const EYES = ['dot', 'tall', 'shine'];
export const FOODS = {
  berry:   { label: 'Berry',   emoji: '🍓', fill: 22 },
  bun:     { label: 'Sweet bun', emoji: '🥐', fill: 34 },
  greens:  { label: 'Greens',  emoji: '🥬', fill: 18 },
  fish:    { label: 'Fish',    emoji: '🐟', fill: 30 },
};
export const TRAITS = ['curious', 'sleepy', 'bouncy', 'shy', 'cheerful', 'dreamy'];

const SYLLABLES = ['mo', 'chi', 'pip', 'lu', 'na', 'bo', 'ki', 'zu', 'fen', 'ri', 'to', 'mi', 'sa', 'pa', 'nu', 'bi', 'ko', 'wen'];

export function suggestName(r) {
  const n = r() < 0.6 ? 2 : 1;
  let s = '';
  for (let i = 0; i < n; i++) s += pick(r, SYLLABLES);
  if (s.length < 3) s += pick(r, ['bo', 'li', 'mo']);
  return s[0].toUpperCase() + s.slice(1);
}

export function makeGenome(seed) {
  const r = rng(seed);
  const foods = Object.keys(FOODS);
  const favorite = pick(r, foods);
  let disliked = pick(r, foods);
  while (disliked === favorite) disliked = pick(r, foods);
  return {
    seed: seed >>> 0,
    palette: pick(r, Object.keys(PALETTES)),
    shape: pick(r, SHAPES),
    ears: pick(r, EARS),
    pattern: pick(r, PATTERNS),
    eyes: pick(r, EYES),
    trait: pick(r, TRAITS),
    favorite,
    disliked,
    name: suggestName(r),
  };
}

export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;
