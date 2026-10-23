// Drawing the room. Everything is in scene pixels (120 x 75); the canvas is
// scaled up by a whole number so every pixel stays crisp.
export const W = 120, H = 75, FLOOR = 64;
export const WINDOW = { x: 9, y: 7, w: 36, h: 26 };
export const BED = { x: 88, y: 51, w: 28, h: 13 };
export const LAMP = { x: 76, y: 40 };
export const WALK = { min: 12, max: 82 };

// Small bitmaps: each character maps to a color; '.' is clear.
export const BITMAPS = {
  heart: { rows: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], colors: { '#': '#ff6b8b' } },
  note: { rows: ['..##', '..#.', '..#.', '###.', '##..'], colors: { '#': '#ffe066' } },
  zz: { rows: ['###', '..#', '.#.', '#..', '###'], colors: { '#': '#d9e2ff' } },
  bang: { rows: ['#', '#', '#', '.', '#'], colors: { '#': '#ffffff' } },
  drop: { rows: ['.#.', '###', '###', '.#.'], colors: { '#': '#8fd2f2' } },
  sparkle: { rows: ['..#..', '..#..', '##@##', '..#..', '..#..'], colors: { '#': '#fff3b0', '@': '#ffffff' } },
  berry: { rows: ['..g..', '.ggg.', '.rrr.', 'rrwrr', 'rrrrr', '.rrr.'], colors: { g: '#3e9e4f', r: '#e23d5a', w: '#ffd1da' } },
  bun: { rows: ['.ooo.', 'ollyo', 'ooooo', 'ddddd'], colors: { o: '#e8a33c', l: '#ffd98a', y: '#fff0c0', d: '#a8691c' } },
  greens: { rows: ['.g.g.', 'gLgLg', 'ggggg', '.ggg.', '..s..'], colors: { g: '#3fae55', L: '#9be08a', s: '#2b6b36' } },
  fish: { rows: ['.bbb..b', 'bbwbbbb', 'bbbbb.b', '.bbb...'], colors: { b: '#6aa7d8', w: '#0e1d2b' } },
  mess: { rows: ['..b..', '.bbb.', 'bbhbb', 'bbbbb'], colors: { b: '#7a5230', h: '#a77a52' } },
  ball: { rows: ['.pp.', 'pwwp', 'pppp', '.pp.'], colors: { p: '#ff7aa2', w: '#ffffff' } },
  bubble: { rows: ['.##.', '#..#', '#..#', '.##.'], colors: { '#': '#d9f3ff' } },
};

export function bitmap(ctx, name, x, y, flip = false) {
  const b = BITMAPS[name];
  if (!b) return;
  const w = b.rows[0].length;
  for (let r = 0; r < b.rows.length; r++) for (let c = 0; c < w; c++) {
    const ch = b.rows[r][c];
    if (ch === '.') continue;
    ctx.fillStyle = b.colors[ch];
    ctx.fillRect(Math.round(x + (flip ? w - 1 - c : c)), Math.round(y + r), 1, 1);
  }
}

export function sprite(ctx, s, x, y, flip = false, scale = 1) {
  const n = s.size;
  for (let i = 0; i < s.px.length; i++) {
    const v = s.px[i];
    if (!v) continue;
    const c = i % n, r = (i / n) | 0;
    ctx.fillStyle = s.colors[v];
    ctx.fillRect(Math.round(x + (flip ? n - 1 - c : c) * scale), Math.round(y + r * scale), scale, scale);
  }
}

const rect = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

function sky(ctx, world, t, particles) {
  const { x, y, w, h } = WINDOW;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, world.sky[0]); g.addColorStop(1, world.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (world.phase === 'night') {
    for (let i = 0; i < 18; i++) {
      const sx = x + ((i * 37) % w), sy = y + ((i * 23) % (h - 6));
      if ((i + Math.floor(t * 1.5)) % 7) rect(ctx, i % 3 ? '#cdd6ff' : '#ffffff', sx, sy, 1, 1);
    }
  }
  const b = world.body;
  const bx = Math.round(x + 4 + b.x * (w - 12)), by = Math.round(y + 4 + b.y * (h - 14));
  if (b.kind === 'sun') {
    rect(ctx, '#ffe9a3', bx - 1, by, 7, 5); rect(ctx, '#ffe9a3', bx, by - 1, 5, 7);
    rect(ctx, '#ffd35c', bx, by, 5, 5);
  } else {
    rect(ctx, '#f4f1dc', bx, by, 5, 5); rect(ctx, '#f4f1dc', bx - 1, by + 1, 7, 3);
    rect(ctx, world.sky[0], bx + 2, by - 1, 4, 4);
  }
  // Distant hills and a tree line.
  ctx.fillStyle = world.phase === 'night' ? '#1b2a3a' : world.season === 'winter' ? '#dfe8f2' : world.season === 'autumn' ? '#b5763a' : '#5f9a52';
  for (let i = 0; i < w; i++) { const hh = 5 + Math.round(3 * Math.sin((i + 3) / 6) + 2 * Math.sin(i / 2.7)); ctx.fillRect(x + i, y + h - hh, 1, hh); }
  if (world.weather === 'cloudy' || world.weather === 'rain' || world.weather === 'snow') {
    const shade = world.phase === 'night' ? '#3a4266' : world.weather === 'rain' ? '#9aa3b8' : '#eef2fb';
    for (const [cx, cy, cw] of [[8, 6, 14], [26, 11, 18], [38, 4, 12]]) {
      const ox = x + ((cx + t * 2) % (w + 20)) - 10;
      rect(ctx, shade, ox, y + cy, cw, 4); rect(ctx, shade, ox + 3, y + cy - 2, cw - 6, 2);
    }
  }
  for (const p of particles) {
    if (p.kind === 'rain') rect(ctx, '#bfe4ff', p.x, p.y, 1, 3);
    else if (p.kind === 'snow') rect(ctx, '#ffffff', p.x, p.y, 1, 1);
    else if (p.kind === 'leaves') rect(ctx, p.c, p.x, p.y, 2, 1);
    else if (p.kind === 'petals') rect(ctx, '#ffc0d6', p.x, p.y, 1, 1);
    else if (p.kind === 'fireflies' && Math.sin(t * 3 + p.seed) > 0) rect(ctx, '#f6ff8a', p.x, p.y, 1, 1);
  }
  ctx.restore();
  // Frame, cross bars, sill, and a plant.
  rect(ctx, '#f4ecff', x - 2, y - 2, w + 4, 2); rect(ctx, '#f4ecff', x - 2, y + h, w + 4, 2);
  rect(ctx, '#f4ecff', x - 2, y, 2, h); rect(ctx, '#f4ecff', x + w, y, 2, h);
  rect(ctx, '#f4ecff', x + Math.floor(w / 2) - 1, y, 2, h); rect(ctx, '#f4ecff', x, y + Math.floor(h / 2) - 1, w, 2);
  rect(ctx, '#bda7e8', x - 4, y + h + 2, w + 8, 3);
  rect(ctx, '#c76f4a', x + w - 8, y + h - 3, 6, 5); rect(ctx, '#a95a3a', x + w - 8, y + h + 1, 6, 1);
  rect(ctx, '#4fa65a', x + w - 7, y + h - 8, 1, 5); rect(ctx, '#4fa65a', x + w - 5, y + h - 10, 1, 7);
  rect(ctx, '#6cc46f', x + w - 9, y + h - 9, 2, 2); rect(ctx, '#6cc46f', x + w - 4, y + h - 11, 2, 2); rect(ctx, '#6cc46f', x + w - 6, y + h - 6, 2, 2);
}

export function drawRoom(ctx, world, t, particles, accent) {
  // Wall with a soft pattern, then the floor.
  rect(ctx, '#d9cbf2', 0, 0, W, FLOOR);
  for (let y = 4; y < FLOOR - 11; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < W; x += 8) rect(ctx, '#d1c1ee', x, y, 1, 1);
  rect(ctx, '#b9a4e3', 0, FLOOR - 11, W, 1);
  rect(ctx, '#c8b6ec', 0, FLOOR - 10, W, 10);
  for (let x = 6; x < W; x += 10) rect(ctx, '#bea9e8', x, FLOOR - 10, 1, 10);
  rect(ctx, '#8d6bb8', 0, FLOOR, W, H - FLOOR);
  for (let y = FLOOR + 3; y < H; y += 4) rect(ctx, '#7f5ead', 0, y, W, 1);
  for (let y = FLOOR; y < H; y += 4) for (let x = (((y - FLOOR) / 4) % 2) * 13; x < W; x += 26) rect(ctx, '#7f5ead', x, y, 1, 4);
  // Rug
  const rugX = Math.round(W / 2) - 6;
  ctx.fillStyle = '#f2a6c0';
  for (let i = -22; i <= 22; i++) { const hh = Math.round(3 * Math.sqrt(1 - (i / 23) ** 2)); ctx.fillRect(rugX + i, FLOOR + 4 - hh, 1, hh * 2 + 1); }
  ctx.fillStyle = '#f7c4d6';
  for (let i = -16; i <= 16; i += 2) { const hh = Math.round(1.5 * Math.sqrt(1 - (i / 17) ** 2)); ctx.fillRect(rugX + i, FLOOR + 4 - hh, 1, hh * 2 + 1); }

  sky(ctx, world, t, particles);

  // Shelf with a clock and a little framed doodle.
  rect(ctx, '#a68bd6', 52, 17, 24, 2); rect(ctx, '#8f73c4', 52, 19, 24, 1);
  rect(ctx, '#fff4dc', 54, 11, 6, 6); rect(ctx, '#5a4a7a', 57, 12, 1, 3); rect(ctx, '#5a4a7a', 57, 14, 2, 1);
  rect(ctx, '#f4ecff', 64, 8, 9, 9); rect(ctx, accent, 66, 10, 5, 5); rect(ctx, '#ffffff', 67, 11, 2, 2);

  // Lamp on a side table.
  rect(ctx, '#9d7ac9', LAMP.x - 5, FLOOR - 9, 11, 2); rect(ctx, '#8462b8', LAMP.x - 4, FLOOR - 7, 1, 7); rect(ctx, '#8462b8', LAMP.x + 4, FLOOR - 7, 1, 7);
  rect(ctx, '#6f5aa0', LAMP.x, FLOOR - 16, 1, 7);
  rect(ctx, '#ffd98a', LAMP.x - 4, FLOOR - 21, 9, 5); rect(ctx, '#ffe9b8', LAMP.x - 3, FLOOR - 22, 7, 1);

  // Bed
  rect(ctx, '#6e4f96', BED.x, BED.y + 5, BED.w, BED.h - 5);
  rect(ctx, '#6e4f96', BED.x + BED.w - 3, BED.y - 4, 3, BED.h + 4);
  rect(ctx, '#5a3f82', BED.x, BED.y + BED.h - 1, BED.w, 1);
  rect(ctx, '#f2e9ff', BED.x + 1, BED.y + 2, BED.w - 4, 4);
  rect(ctx, '#ffffff', BED.x + 2, BED.y, 8, 3);
  rect(ctx, accent, BED.x + 11, BED.y + 2, BED.w - 14, 5);
  rect(ctx, '#ffffff', BED.x + 13, BED.y + 3, 2, 1); rect(ctx, '#ffffff', BED.x + 19, BED.y + 4, 2, 1);
}

// Drawn over a sleeping pet so it is tucked in.
export function drawBlanket(ctx, accent) {
  rect(ctx, accent, BED.x + 1, BED.y + 4, BED.w - 4, 5);
  rect(ctx, '#ffffff', BED.x + 4, BED.y + 5, 2, 1); rect(ctx, '#ffffff', BED.x + 12, BED.y + 6, 2, 1); rect(ctx, '#ffffff', BED.x + 19, BED.y + 5, 2, 1);
  rect(ctx, '#6e4f96', BED.x, BED.y + 8, BED.w, BED.h - 8);
  rect(ctx, '#5a3f82', BED.x, BED.y + BED.h - 1, BED.w, 1);
}

// Darkness for night and lights-off, with a warm lamp glow when the light is on.
export function drawLighting(ctx, world, lightsOn) {
  let dark = (1 - world.light) * 0.55;
  if (!lightsOn) dark = Math.max(dark, 0.45) + 0.12;
  if (dark > 0.01) {
    ctx.fillStyle = `rgba(14, 10, 40, ${Math.min(0.72, dark)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (lightsOn && (world.phase === 'night' || world.phase === 'dusk')) {
    const g = ctx.createRadialGradient(LAMP.x, FLOOR - 19, 2, LAMP.x, FLOOR - 19, 55);
    g.addColorStop(0, 'rgba(255, 214, 140, 0.35)'); g.addColorStop(1, 'rgba(255, 214, 140, 0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
}

export function makeParticle(kind, rnd = Math.random) {
  const { x, y, w, h } = WINDOW;
  const leaf = ['#e07a3a', '#d4a03a', '#c4553a'];
  return {
    kind, x: x + rnd() * w, y: y + rnd() * h, seed: rnd() * 10,
    vx: kind === 'leaves' ? 4 + rnd() * 4 : kind === 'snow' ? (rnd() - 0.5) * 3 : kind === 'fireflies' ? (rnd() - 0.5) * 4 : 1,
    vy: kind === 'rain' ? 60 + rnd() * 20 : kind === 'snow' ? 6 + rnd() * 4 : kind === 'fireflies' ? (rnd() - 0.5) * 3 : 8 + rnd() * 4,
    c: leaf[Math.floor(rnd() * 3)],
  };
}

export function stepParticles(list, dt) {
  const { x, y, w, h } = WINDOW;
  for (const p of list) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'fireflies') { p.vx += (Math.random() - 0.5) * 6 * dt; p.vy += (Math.random() - 0.5) * 6 * dt; }
    if (p.y > y + h) p.y = y - 2;
    if (p.y < y - 3) p.y = y + h;
    if (p.x > x + w) p.x = x;
    if (p.x < x) p.x = x + w;
  }
}
