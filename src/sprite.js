// Pixel sprites, generated from genes. Pure: no canvas here, just a grid of
// palette indices, so it can be tested and drawn at any scale.
//
// Index: 0 clear · 1 outline · 2 dark · 3 base · 4 light · 5 belly · 6 accent
//        7 cheek · 8 eye · 9 white (eye shine)
import { PALETTES, rng } from './genome.js';

export const SIZE = 32;
const CLEAR = 0, OUT = 1, DARK = 2, BASE = 3, LIGHT = 4, BELLY = 5, ACCENT = 6, CHEEK = 7, EYE = 8, WHITE = 9;

export function colorsFor(genome) {
  const [outline, dark, base, light, belly, accent, cheek] = PALETTES[genome.palette] || PALETTES.moss;
  return [null, outline, dark, base, light, belly, accent, cheek, outline, '#ffffff'];
}

const BODY = {
  baby: { rx: 6, ry: 5.5 },
  kid: { rx: 7.5, ry: 7 },
  adult: { rx: 9, ry: 8.5 },
};

function grid() { return new Uint8Array(SIZE * SIZE); }
const at = (x, y) => y * SIZE + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
function set(px, x, y, v) { x = Math.round(x); y = Math.round(y); if (inBounds(x, y)) px[at(x, y)] = v; }
function setIf(px, x, y, v, onlyOn) { x = Math.round(x); y = Math.round(y); if (inBounds(x, y) && (onlyOn == null || onlyOn.includes(px[at(x, y)]))) px[at(x, y)] = v; }

// Body dimensions for a stage, shape, and form.
export function bodyOf(genome, stage, form, frame = 0) {
  let { rx, ry } = BODY[stage] || BODY.adult;
  if (form === 'puffball') { rx += 1.5; ry += 0.5; }
  if (genome.shape === 'bean') { rx *= 0.86; ry *= 1.14; }
  if (genome.shape === 'loaf') { rx *= 1.15; ry *= 0.86; }
  if (frame === 1) { rx *= 1.04; ry *= 0.94; } // a little squash on the bob
  const bottom = 28.5;
  return { cx: 16, cy: bottom - ry, rx, ry, bottom, power: genome.shape === 'loaf' ? 2.8 : 2 };
}

function insideBody(b, shape, x, y) {
  const t = (y - (b.cy - b.ry)) / (2 * b.ry); // 0 at top, 1 at bottom
  let rx = b.rx;
  if (shape === 'pear') rx *= 0.78 + 0.36 * Math.max(0, Math.min(1, t));
  const nx = Math.abs(x - b.cx) / rx, ny = Math.abs(y - b.cy) / b.ry;
  return nx ** b.power + ny ** b.power <= 1;
}

function drawEars(px, g, b, stage) {
  const top = Math.round(b.cy - b.ry);
  const big = stage === 'adult' ? 1 : 0;
  const ex = Math.max(2.5, b.rx * 0.55);
  const L = Math.round(b.cx - ex), R = Math.round(b.cx + ex - 1);
  switch (g.ears) {
    case 'cat':
      for (const [x0, dir] of [[L, -1], [R, 1]]) {
        const h = 4 + big;
        for (let i = 0; i < h; i++) for (let w = -Math.floor((h - i) / 2); w <= Math.floor((h - i) / 2); w++) {
          set(px, x0 + w + dir * Math.floor(i / 3), top - i + 1, i > 0 && i < h - 1 && w === 0 ? CHEEK : BASE);
        }
      }
      break;
    case 'bunny':
      for (const [x0, lean] of [[L, -0.18], [R, 0.18]]) {
        const h = 6 + big * 2;
        for (let i = 0; i < h; i++) {
          const x = x0 + lean * i;
          set(px, x, top - i + 1, BASE); set(px, x + 1, top - i + 1, i > 0 && i < h - 1 ? CHEEK : BASE);
        }
      }
      break;
    case 'antenna':
      for (const [x0, lean] of [[L + 1, -0.3], [R - 1, 0.3]]) {
        const h = 4 + big;
        for (let i = 0; i < h; i++) set(px, x0 + lean * i, top - i, DARK);
        const bx = Math.round(x0 + lean * h), by = top - h;
        set(px, bx, by, ACCENT); set(px, bx + 1, by, ACCENT); set(px, bx, by - 1, ACCENT); set(px, bx + 1, by - 1, LIGHT);
      }
      break;
    case 'horns':
      for (const [x0, dir] of [[L, -1], [R, 1]]) {
        const h = 3 + big;
        for (let i = 0; i < h; i++) { set(px, x0 + dir * Math.floor(i / 2), top - i, i === h - 1 ? LIGHT : BELLY); set(px, x0 + 1 + dir * Math.floor(i / 2), top - i, BELLY); }
      }
      break;
    case 'sprout': {
      const x = Math.round(b.cx);
      for (let i = 0; i < 3 + big; i++) set(px, x, top - i, DARK);
      const y = top - 2 - big;
      set(px, x - 1, y, ACCENT); set(px, x - 2, y - 1, ACCENT); set(px, x - 1, y - 1, ACCENT);
      set(px, x + 1, y - 1, ACCENT); set(px, x + 2, y - 2, ACCENT); set(px, x + 1, y - 2, ACCENT);
      break;
    }
    case 'round':
    default:
      for (const x0 of [L, R]) for (let dx = -1 - big; dx <= 1 + big; dx++) for (let dy = 0; dy <= 2 + big; dy++) {
        if (dx * dx + dy * dy <= (2 + big) ** 2) set(px, x0 + dx, top - dy + 1, dy === 1 && dx === 0 ? CHEEK : BASE);
      }
  }
}

function drawFeet(px, b, stage, frame, walking) {
  const spread = stage === 'baby' ? 3 : stage === 'kid' ? 4 : 5;
  const y = Math.round(b.bottom);
  for (const [side, lift] of [[-1, walking && frame === 1 ? 1 : 0], [1, walking && frame === 0 ? 1 : 0]]) {
    const x = Math.round(b.cx + side * spread) - (side < 0 ? 1 : 0);
    for (let dx = 0; dx < 3; dx++) set(px, x + dx - 1, y - lift, DARK);
    for (let dx = 0; dx < 2; dx++) set(px, x + dx - (side < 0 ? 1 : 0), y + 1 - lift, DARK);
  }
}

function drawPattern(px, g, b) {
  const r = rng(g.seed ^ 0x9e3779b9);
  const body = (x, y) => inBounds(x, y) && px[at(x, y)] === BASE;
  if (g.pattern === 'spots') {
    for (let k = 0; k < 6; k++) {
      const x = Math.round(b.cx + (r() * 2 - 1) * b.rx * 0.8);
      const y = Math.round(b.cy - b.ry * 0.85 + r() * b.ry * 0.5);
      if (Math.abs(x - b.cx) < 2 && y > b.cy - b.ry * 0.5) continue;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (body(x + dx, y + dy)) px[at(x + dx, y + dy)] = DARK;
    }
  } else if (g.pattern === 'stripe') {
    for (const fy of [-0.7, -0.45, -0.2]) {
      const y = Math.round(b.cy + b.ry * fy);
      for (let x = 0; x < SIZE; x++) if (Math.abs(x - b.cx) > b.rx * 0.5 && body(x, y)) px[at(x, y)] = DARK;
    }
  } else if (g.pattern === 'patch') {
    const pcx = b.cx + b.rx * 0.35, pcy = b.cy - b.ry * 0.45;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (((x + 0.5 - pcx) / (b.rx * 0.45)) ** 2 + ((y + 0.5 - pcy) / (b.ry * 0.4)) ** 2 <= 1 && body(x, y)) px[at(x, y)] = ACCENT;
    }
  }
}

function outline(px) {
  const out = px.slice();
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (px[at(x, y)] !== CLEAR) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (inBounds(nx, ny) && px[at(nx, ny)] !== CLEAR) { out[at(x, y)] = OUT; break; }
    }
  }
  return out;
}

function drawFace(px, g, b, stage, mood, frame) {
  const ey = Math.round(b.cy - b.ry * 0.12);
  const gap = Math.max(2, Math.round(b.rx * 0.42));
  const eyes = [Math.round(b.cx) - gap - 1, Math.round(b.cx) + gap - 1];
  const tall = g.eyes !== 'dot' && stage !== 'baby';
  const closed = mood === 'sleep' || mood === 'blink';
  for (const ex of eyes) {
    if (closed) {
      set(px, ex, ey + 1, EYE); set(px, ex + 1, ey + 1, EYE);
      if (mood === 'sleep') { set(px, ex - 1, ey, EYE); }
    } else if (mood === 'happy' || mood === 'eat') {
      set(px, ex - 1, ey + 1, EYE); set(px, ex, ey, EYE); set(px, ex + 1, ey, EYE); set(px, ex + 2, ey + 1, EYE);
    } else {
      const h = tall ? 3 : 2;
      for (let dy = 0; dy < h; dy++) { set(px, ex, ey + dy - (tall ? 1 : 0), EYE); set(px, ex + 1, ey + dy - (tall ? 1 : 0), EYE); }
      if (g.eyes === 'shine' || stage === 'baby') set(px, ex, ey - (tall ? 1 : 0), WHITE);
      if (mood === 'sad') { set(px, ex + (ex < b.cx ? 2 : -1), ey - 2 - (tall ? 1 : 0), EYE); }
    }
  }
  // Cheeks
  const cy = ey + 2;
  setIf(px, eyes[0] - 1, cy, CHEEK, [BASE, LIGHT, DARK, BELLY, ACCENT]);
  setIf(px, eyes[0] - 2, cy, CHEEK, [BASE, LIGHT, DARK, BELLY, ACCENT]);
  setIf(px, eyes[1] + 2, cy, CHEEK, [BASE, LIGHT, DARK, BELLY, ACCENT]);
  setIf(px, eyes[1] + 3, cy, CHEEK, [BASE, LIGHT, DARK, BELLY, ACCENT]);
  // Mouth
  const mx = Math.round(b.cx) - 1, my = ey + 3;
  if (mood === 'eat') {
    set(px, mx, my, EYE); set(px, mx + 1, my, EYE); set(px, mx, my + 1, EYE); set(px, mx + 1, my + 1, CHEEK);
    if (frame === 1) { set(px, mx, my + 1, EYE); set(px, mx + 1, my + 1, EYE); }
  } else if (mood === 'happy') {
    set(px, mx - 1, my, EYE); set(px, mx, my + 1, EYE); set(px, mx + 1, my + 1, EYE); set(px, mx + 2, my, EYE);
  } else if (mood === 'sad') {
    set(px, mx - 1, my + 1, EYE); set(px, mx, my, EYE); set(px, mx + 1, my, EYE); set(px, mx + 2, my + 1, EYE);
  } else if (mood === 'sleep') {
    set(px, mx, my, EYE);
  } else {
    set(px, mx, my, EYE); set(px, mx + 1, my, EYE);
  }
}

function drawForm(px, form, b, frame) {
  if (form === 'bouncer') { // a springy accent tail
    const x0 = Math.round(b.cx + b.rx) , y0 = Math.round(b.cy + b.ry * 0.2);
    const pts = frame ? [[0, 0], [1, -1], [2, -1], [2, -2], [3, -3]] : [[0, 0], [1, 0], [2, -1], [3, -1], [3, -2]];
    for (const [dx, dy] of pts) set(px, x0 + dx, y0 + dy, ACCENT);
  } else if (form === 'sage') { // a little leaf crown
    const y = Math.round(b.cy - b.ry) - 1;
    for (const dx of [-3, -1, 1, 3]) set(px, Math.round(b.cx) + dx - 1, y - (Math.abs(dx) === 1 ? 1 : 0), ACCENT);
  }
}

function fluff(px) { // scalloped outline for puffballs
  const out = px.slice();
  for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) {
    if (px[at(x, y)] !== OUT || (x + y) % 2) continue;
    const below = px[at(x, y + 1)], right = px[at(x + 1, y)], left = px[at(x - 1, y)], above = px[at(x, y - 1)];
    const inward = [below, right, left, above].some(v => v === BASE || v === LIGHT || v === DARK);
    if (!inward) continue;
    for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
      const v = px[at(x + dx, y + dy)];
      if (v === CLEAR) { out[at(x, y)] = LIGHT; out[at(x + dx, y + dy)] = OUT; break; }
    }
  }
  return out;
}

function glow(px, frame) { // sparkles for glimmers
  const out = px.slice();
  const r = rng(1234 + frame);
  let n = 0;
  for (let tries = 0; tries < 400 && n < 6; tries++) {
    const x = Math.floor(r() * SIZE), y = Math.floor(r() * SIZE);
    if (px[at(x, y)] !== CLEAR) continue;
    let near = false;
    for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (inBounds(x + dx, y + dy) && px[at(x + dx, y + dy)] === OUT && Math.abs(dx) + Math.abs(dy) >= 2) { near = true; break; }
    }
    if (near) { out[at(x, y)] = n % 2 ? WHITE : ACCENT; n++; }
  }
  return out;
}

// stage: 'baby' | 'kid' | 'adult'; form (adults): 'bouncer' | 'puffball' | 'glimmer' | 'sage'
// mood: 'normal' | 'happy' | 'sad' | 'sleep' | 'blink' | 'eat'; frame: 0 | 1; walking: bool
export function petSprite(genome, { stage = 'baby', form = null, mood = 'normal', frame = 0, walking = false } = {}) {
  let px = grid();
  const b = bodyOf(genome, stage, form, walking ? 0 : frame);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!insideBody(b, genome.shape, x + 0.5, y + 0.5)) continue;
    const nx = (x + 0.5 - b.cx) / b.rx, ny = (y + 0.5 - b.cy) / b.ry;
    let v = BASE;
    if (ny < -0.42 && nx < 0.15 && nx > -0.75) v = LIGHT;
    if (ny > 0.62 || nx > 0.78) v = DARK;
    px[at(x, y)] = v;
  }
  if (stage !== 'baby') {
    const bcx = b.cx, bcy = b.cy + b.ry * 0.38;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (((x + 0.5 - bcx) / (b.rx * 0.52)) ** 2 + ((y + 0.5 - bcy) / (b.ry * 0.42)) ** 2 <= 1 && px[at(x, y)] !== CLEAR) px[at(x, y)] = BELLY;
    }
    drawPattern(px, genome, b);
  }
  if (stage !== 'baby' || genome.ears === 'sprout' || genome.ears === 'antenna') drawEars(px, genome, b, stage);
  drawFeet(px, b, stage, frame, walking);
  drawForm(px, form, b, frame);
  px = outline(px);
  if (form === 'puffball') px = fluff(px);
  drawFace(px, genome, b, stage, mood, frame);
  if (form === 'glimmer') px = glow(px, frame);
  return { size: SIZE, px, colors: colorsFor(genome) };
}

// The egg: speckled, wobbling, and cracking as it warms.
export function eggSprite(genome, { warmth = 0, frame = 0 } = {}) {
  const px = grid();
  const cx = 16 + (frame === 1 && warmth > 0 ? 0.6 : 0), cy = 20, rx = 6.5, ry = 8.5;
  const r = rng(genome.seed ^ 0x51ed);
  const top = cy - ry, bot = cy + ry * 0.75;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const yy = y + 0.5;
    if (yy < top || yy > bot) continue;
    const ny = yy < cy ? (yy - cy) / ry : (yy - cy) / (ry * 0.75);
    const taper = yy < cy ? 0.72 + 0.28 * (1 - Math.abs(ny)) : 1; // pointier top
    const half = rx * taper * Math.sqrt(Math.max(0, 1 - ny * ny));
    const nx = (x + 0.5 - cx) / Math.max(half, 0.01);
    if (Math.abs(nx) > 1) continue;
    px[at(x, y)] = ny < -0.35 && nx < 0 && nx > -0.7 ? WHITE : nx > 0.55 || ny > 0.55 ? BELLY : LIGHT;
  }
  for (let k = 0; k < 7; k++) {
    const x = Math.round(cx + (r() * 2 - 1) * rx * 0.6), y = Math.round(cy + (r() * 2 - 1) * ry * 0.55);
    if (px[at(x, y)]) { px[at(x, y)] = k % 2 ? ACCENT : BASE; if (px[at(x + 1, y)]) px[at(x + 1, y)] = k % 2 ? ACCENT : BASE; }
  }
  const out = outline(px);
  if (warmth >= 55) { // a zigzag crack that grows as it warms
    const reach = warmth >= 85 ? 5 : 3;
    const zig = [0, -1, 0, 1, 0, -1, 0, 1, 0, -1, 0];
    for (let dx = -reach; dx <= reach; dx++) {
      const x = Math.round(cx) + dx, y = cy - 2 + zig[dx + 5];
      if (inBounds(x, y) && out[at(x, y)] && out[at(x, y)] !== OUT) out[at(x, y)] = OUT;
    }
  }
  return { size: SIZE, px: out, colors: colorsFor(genome) };
}

// Count of non-clear pixels: handy for tests and for a quick "is anything there" check.
export const coverage = s => s.px.reduce((n, v) => n + (v ? 1 : 0), 0);
