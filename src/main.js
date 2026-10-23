import { FOODS, makeGenome, newSeed, PALETTES } from './genome.js';
import { petSprite, eggSprite } from './sprite.js';
import { worldAt, describeWorld } from './world.js';
import {
  SAVE_KEY, STAGES, FORMS, NEEDS, newPet, genomeOf, warm, tick, feed, play, pet, scoop, bath, toggleSleep,
  moodOf, wish, catchUp, restore, serialize, rename, growthProgress, ageOf,
} from './engine.js';
import { W, H, FLOOR, BED, WALK, drawRoom, drawLighting, drawBlanket, sprite, bitmap, makeParticle, stepParticles } from './scene.js';
import * as sfx from './audio.js';

const $ = s => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

// Optional ?hour=22 to preview another time of day.
const params = new URLSearchParams(location.search);
const hourOverride = params.has('hour') ? Math.max(0, Math.min(23.99, Number(params.get('hour')) || 0)) : null;
const nowDate = () => { const d = new Date(); if (hourOverride != null) d.setHours(Math.floor(hourOverride), Math.round((hourOverride % 1) * 60)); return d; };

// ---------- state ----------
let { state, notice } = restore(store.get(SAVE_KEY), Date.now(), newSeed);
let genome = genomeOf(state);
state = catchUp(state, Date.now()).state;
let world = worldAt(nowDate());
let saveOk = true;

const canvas = $('#room');
const ctx = canvas.getContext('2d');
const actor = { x: W / 2, facing: 1, mode: 'idle', target: null, timer: 1.5, frame: 0, frameT: 0, blinkT: 3, blink: 0, hop: 0, eatT: 0, wobble: 0, mood: null, moodT: 0 };
let foods = [];      // {kind, x, y, vy, landed}
let ball = null;     // {x, y, vx, vy, rest}
let fx = [];         // floating hearts, notes, bubbles
let particles = [];
let spriteCache = new Map();
let accumulate = 0;

function resetParticles() {
  particles = [];
  if (!world.particles) return;
  const n = { rain: 20, snow: 16, leaves: 5, petals: 6, fireflies: 6 }[world.particles] || 0;
  for (let i = 0; i < n; i++) particles.push(makeParticle(world.particles));
}
resetParticles();

function save() { saveOk = store.set(SAVE_KEY, serialize(state)); }

// ---------- canvas sizing: integer scaling keeps pixels square ----------
let scale = 1;
function fit() {
  const box = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  scale = Math.max(1, Math.floor((box.width * dpr) / W));
  canvas.width = W * scale; canvas.height = H * scale;
  ctx.imageSmoothingEnabled = false;
}
new ResizeObserver(fit).observe(canvas.parentElement);
fit();

// ---------- messages ----------
const msgEl = $('#message');
let msgTimer = 0, msgActive = false;
function say(text) {
  if (!text) return;
  msgEl.textContent = text;
  msgActive = true;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { msgActive = false; msgEl.textContent = wish(state); }, 6000);
}
function emote(name, x, y, n = 1) {
  for (let i = 0; i < n; i++) fx.push({ name, x: x + (Math.random() - 0.5) * 10, y: y - Math.random() * 4, vy: -10 - Math.random() * 6, life: reduced ? 0.8 : 1.4 });
}

// ---------- applying engine results ----------
function apply(result, sound) {
  const before = state;
  state = result.state;
  if (result.message) say(result.message);
  if (result.ok && sound) sfx.play(sound);
  if (before.stage !== state.stage) onGrow(before.stage);
  render();
  save();
  return result;
}

function onGrow(from) {
  genome = genomeOf(state);
  spriteCache.clear();
  if (state.stage === 'baby') { sfx.play('hatch'); emote('sparkle', W / 2, FLOOR - 20, 6); say(`${state.name} hatched! Say hello.`); }
  else { sfx.play('grow'); emote('sparkle', actor.x, FLOOR - 26, 8); say(state.journal[0].text); }
  actor.hop = 0.6;
}

// ---------- pet behavior ----------
const speedOf = () => ({ baby: 18, kid: 26, adult: state.form === 'bouncer' ? 40 : state.form === 'puffball' ? 22 : 30 })[state.stage] || 20;
const bedX = BED.x + 12;
const messX = m => Math.round(WALK.min + m.x * (WALK.max - WALK.min));

function walkTo(x, dt) {
  const dx = x - actor.x;
  if (Math.abs(dx) < 1.5) return true;
  actor.facing = dx > 0 ? 1 : -1;
  const sp = speedOf() * (moodOf(state) === 'sad' ? 0.6 : 1);
  actor.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
  actor.walking = true;
  return false;
}

function behave(dt) {
  actor.walking = false;
  if (state.stage === 'egg') { actor.x = W / 2; actor.wobble = Math.max(0, actor.wobble - dt); return; }
  if (actor.hop > 0) actor.hop = Math.max(0, actor.hop - dt);
  if (actor.moodT > 0) { actor.moodT -= dt; if (actor.moodT <= 0) actor.mood = null; }

  if (state.sleeping) {
    if (walkTo(bedX, dt)) { actor.mode = 'sleep'; actor.facing = -1; if (Math.random() < dt * 0.5) emote('zz', actor.x + 6, BED.y - 16); }
    return;
  }
  if (actor.mode === 'sleep') actor.mode = 'idle';

  if (actor.eatT > 0) {
    actor.eatT -= dt;
    if (actor.eatT <= 0) {
      const f = actor.eating; actor.eating = null;
      const r = apply(feed(state, f.kind, Date.now()), null);
      if (r.ok) {
        sfx.play(r.reaction === 'love' ? 'love' : r.reaction === 'yuck' ? 'yuck' : 'eat');
        if (r.reaction === 'love') { emote('heart', actor.x, FLOOR - 26, 3); actor.hop = 0.5; }
        if (r.reaction === 'yuck') { actor.mood = 'sad'; actor.moodT = 1.6; emote('drop', actor.x + 7, FLOOR - 26); }
      }
    }
    return;
  }

  const meal = foods.find(f => f.landed);
  if (meal) {
    if (walkTo(meal.x - actor.facing * 3, dt) || Math.abs(meal.x - actor.x) < 6) {
      foods = foods.filter(f => f !== meal);
      if (state.needs.food >= 95) { say(`${state.name} sniffs the ${FOODS[meal.kind].label.toLowerCase()} and walks away. Too full.`); return; }
      actor.eating = meal; actor.eatT = 1.4;
    }
    return;
  }

  if (ball) {
    if (ball.y > FLOOR - 12) {
      if (walkTo(ball.x, dt) || Math.abs(ball.x - actor.x) < 5) {
        if (Math.abs(ball.x - actor.x) < 7) {
          ball = null;
          const r = apply(play(state, Date.now()), 'catch');
          if (r.ok) { actor.hop = 0.5; emote('note', actor.x, FLOOR - 28, 2); } else emote('zz', actor.x, FLOOR - 28);
        }
      }
    } else if (ball.vx) actor.facing = ball.x > actor.x ? 1 : -1;
    return;
  }

  actor.timer -= dt;
  if (actor.mode === 'walk' && actor.target != null) {
    if (walkTo(actor.target, dt)) { actor.mode = 'idle'; actor.timer = 1.5 + Math.random() * 3; }
    return;
  }
  if (actor.timer <= 0) {
    const restless = state.stage === 'adult' && state.form === 'bouncer';
    if (Math.random() < (restless ? 0.75 : 0.55)) { actor.mode = 'walk'; actor.target = WALK.min + Math.random() * (WALK.max - WALK.min); }
    else if (moodOf(state) === 'happy' && Math.random() < 0.4) { actor.hop = 0.45; emote('note', actor.x, FLOOR - 28); }
    actor.timer = 2 + Math.random() * 3;
  }
}

function moodForSprite() {
  if (actor.eatT > 0) return 'eat';
  if (actor.mood) return actor.mood;
  const m = moodOf(state);
  if (m === 'sleep') return 'sleep';
  if (actor.blink > 0) return 'blink';
  if (actor.hop > 0) return 'happy';
  return m === 'happy' ? (actor.walking ? 'normal' : 'happy') : m;
}

function currentSprite() {
  if (state.stage === 'egg') {
    const key = `egg|${state.warmth >= 85 ? 2 : state.warmth >= 55 ? 1 : 0}|${actor.frame}`;
    if (!spriteCache.has(key)) spriteCache.set(key, eggSprite(genome, { warmth: state.warmth, frame: actor.wobble > 0 ? actor.frame : 0 }));
    return spriteCache.get(key);
  }
  const mood = moodForSprite();
  const walking = !!actor.walking;
  const key = `${state.stage}|${state.form}|${mood}|${actor.frame}|${walking}`;
  if (!spriteCache.has(key)) spriteCache.set(key, petSprite(genome, { stage: state.stage, form: state.form, mood, frame: actor.frame, walking }));
  return spriteCache.get(key);
}

// ---------- props ----------
function dropFood(kind) {
  if (state.stage === 'egg') return say('Still an egg. Keep it warm.');
  if (state.sleeping) return say(`Shh. ${state.name} is asleep. Turn the light on first.`);
  if (foods.length >= 2) return say('One snack at a time.');
  const x = Math.max(WALK.min, Math.min(WALK.max, actor.x + actor.facing * 14));
  foods.push({ kind, x, y: 14, vy: 0, landed: false });
  sfx.play('tap');
  closeShelf();
}

function throwBall() {
  if (state.stage === 'egg') return say('Still an egg. Keep it warm.');
  if (state.sleeping) return say(`Shh. ${state.name} is asleep.`);
  if (ball) return;
  const fromRight = actor.x < W / 2;
  ball = { x: fromRight ? W - 34 : 8, y: 30, vx: (fromRight ? -1 : 1) * (30 + Math.random() * 22), vy: -40 };
  sfx.play('bounce');
}

function stepProps(dt) {
  for (const f of foods) if (!f.landed) {
    f.vy += 220 * dt; f.y += f.vy * dt;
    if (f.y >= FLOOR - 4) { f.y = FLOOR - 4; f.landed = true; }
  }
  if (ball) {
    ball.vy += 150 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.y >= FLOOR - 3) {
      ball.y = FLOOR - 3; ball.vy *= -0.55; ball.vx *= 0.8;
      if (Math.abs(ball.vy) > 20) sfx.play('bounce');
      if (Math.abs(ball.vy) < 12) ball.vy = 0;
    }
    if (ball.x < 4 || ball.x > BED.x - 2) { ball.vx *= -0.7; ball.x = Math.max(4, Math.min(BED.x - 2, ball.x)); }
    if (Math.abs(ball.vx) < 2 && ball.vy === 0) ball.vx = 0;
  }
  for (const e of fx) { e.y += e.vy * dt; e.life -= dt; }
  fx = fx.filter(e => e.life > 0);
  if (!reduced) stepParticles(particles, dt);
}

// ---------- drawing ----------
const accent = () => (PALETTES[genome.palette] || PALETTES.moss)[5];

function draw(t) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawRoom(ctx, world, t, particles, accent());
  for (const m of state.messes) bitmap(ctx, 'mess', messX(m) - 2, FLOOR - 3);
  for (const f of foods) bitmap(ctx, f.kind, f.x - 3, f.y - 3);

  const s = currentSprite();
  let y = FLOOR - 30;
  if (state.stage === 'egg') y = FLOOR - 29;
  else if (actor.mode === 'sleep' && state.sleeping) y = BED.y + 8 - 30;
  if (actor.hop > 0 && !reduced) y -= Math.round(Math.sin((actor.hop / 0.5) * Math.PI) * 5);
  const wob = state.stage === 'egg' && actor.wobble > 0 ? (actor.frame ? 1 : -1) : 0;
  // Shadow
  ctx.fillStyle = 'rgba(40, 20, 70, 0.28)';
  if (!(actor.mode === 'sleep' && state.sleeping)) ctx.fillRect(Math.round(actor.x) - 7, FLOOR + 1, 14, 2);
  sprite(ctx, s, Math.round(actor.x) - 16 + wob, y, actor.facing < 0);
  if (actor.mode === 'sleep' && state.sleeping) drawBlanket(ctx, accent());

  if (ball) bitmap(ctx, 'ball', ball.x - 2, ball.y - 2);
  if (actor.eating && actor.eatT > 0.5) bitmap(ctx, actor.eating.kind, Math.round(actor.x + actor.facing * 9) - 3, FLOOR - 6);
  drawLighting(ctx, world, !state.sleeping);
  for (const e of fx) bitmap(ctx, e.name, e.x - 3, e.y - 3);
}

// ---------- the loop ----------
let last = performance.now();
let worldCheck = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!document.hidden) {
    actor.frameT += dt;
    const period = actor.walking ? 0.16 : state.stage === 'egg' ? 0.12 : 0.55;
    if (actor.frameT > period) { actor.frameT = 0; actor.frame ^= 1; }
    actor.blinkT -= dt;
    if (actor.blinkT <= 0) { actor.blink = 0.14; actor.blinkT = 2.5 + Math.random() * 4; }
    if (actor.blink > 0) actor.blink -= dt;

    behave(dt);
    stepProps(dt);
    accumulate += dt;
    if (accumulate >= 1) {
      const before = state;
      state = tick(state, accumulate, world, Date.now());
      accumulate = 0;
      if (before.stage !== state.stage) onGrow(before.stage);
      if (before.messes.length < state.messes.length) emote('bang', messX(state.messes.at(-1)) + 2, FLOOR - 8);
      if (before.sleeping && !state.sleeping) sfx.play('wake');
      render();
    }
    worldCheck += dt;
    if (worldCheck > 20) {
      worldCheck = 0;
      const w = worldAt(nowDate());
      if (w.phase !== world.phase || w.weather !== world.weather || w.particles !== world.particles) { world = w; resetParticles(); } else world = w;
    }
    draw(now / 1000);
  }
  requestAnimationFrame(frame);
}

// ---------- input on the room ----------
const toScene = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
const onPet = p => {
  const top = actor.mode === 'sleep' && state.sleeping ? BED.y - 26 : FLOOR - 26;
  return Math.abs(p.x - actor.x) < 11 && p.y > top && p.y < top + 28;
};
let stroke = null;

canvas.addEventListener('pointerdown', e => {
  const p = toScene(e);
  sfx.setSound(sfx.soundOn());
  if (state.stage === 'egg') {
    if (Math.abs(p.x - W / 2) < 12 && p.y > FLOOR - 26) {
      const r = warm(state, 12, Date.now());
      actor.wobble = 0.5;
      sfx.play(r.event === 'crack' ? 'crack' : 'tap');
      emote('heart', W / 2, FLOOR - 24);
      apply({ state: r.state, ok: true, message: r.event === 'crack' ? 'A crack! Something is moving in there.' : r.event === 'hatch' ? null : null }, null);
    }
    return;
  }
  const mi = state.messes.findIndex(m => Math.abs(p.x - messX(m)) < 6 && p.y > FLOOR - 7 && p.y < FLOOR + 4);
  if (mi >= 0) {
    apply(scoop(state, mi, Date.now()), 'scoop');
    emote('sparkle', p.x, FLOOR - 6);
    return;
  }
  if (onPet(p)) {
    stroke = { id: e.pointerId, x: p.x, y: p.y, dist: 0, lastPet: 0 };
    canvas.setPointerCapture(e.pointerId);
    petOnce();
    return;
  }
  if (!state.sleeping && p.y > FLOOR - 30) { actor.mode = 'walk'; actor.target = Math.max(WALK.min, Math.min(WALK.max, p.x)); }
});

function petOnce() {
  const now = performance.now();
  if (stroke && now - stroke.lastPet < 450) return;
  if (stroke) stroke.lastPet = now;
  const r = apply(pet(state, Date.now()), 'pet');
  if (r.ok) emote('heart', actor.x, (state.sleeping ? BED.y - 20 : FLOOR - 26));
  if (!state.sleeping) { actor.mood = 'happy'; actor.moodT = 0.9; }
}

canvas.addEventListener('pointermove', e => {
  const p = toScene(e);
  canvas.style.cursor = state.stage === 'egg' ? 'pointer' : onPet(p) ? 'grab' : 'default';
  if (!stroke || stroke.id !== e.pointerId) return;
  stroke.dist += Math.hypot(p.x - stroke.x, p.y - stroke.y);
  stroke.x = p.x; stroke.y = p.y;
  if (stroke.dist > 14) { stroke.dist = 0; petOnce(); }
});
const endStroke = e => { if (stroke && stroke.id === e.pointerId) stroke = null; };
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

// ---------- controls ----------
const shelf = $('#shelf');
function closeShelf() { shelf.hidden = true; $('#feedBtn').setAttribute('aria-expanded', 'false'); }
$('#feedBtn').addEventListener('click', () => {
  const open = shelf.hidden;
  shelf.hidden = !open;
  $('#feedBtn').setAttribute('aria-expanded', String(open));
  if (open) shelf.querySelector('button')?.focus();
});
for (const [k, f] of Object.entries(FOODS)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'food';
  b.dataset.food = k;
  b.innerHTML = `<span aria-hidden="true">${f.emoji}</span>${f.label}`;
  b.addEventListener('click', () => dropFood(k));
  shelf.append(b);
}
$('#ballBtn').addEventListener('click', throwBall);
$('#petBtn').addEventListener('click', () => { if (state.stage === 'egg') { canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width / 2, clientY: canvas.getBoundingClientRect().top + canvas.getBoundingClientRect().height * 0.8 })); } else petOnce(); });
$('#bathBtn').addEventListener('click', () => {
  const r = apply(bath(state, Date.now()), 'bath');
  if (r.ok) emote('bubble', actor.x, FLOOR - 20, 6);
});
$('#lightBtn').addEventListener('click', () => {
  const r = apply(toggleSleep(state, Date.now()), state.sleeping ? 'wake' : 'sleep');
  if (r.ok) { foods = []; ball = null; }
});
$('#photoBtn').addEventListener('click', photo);
const soundBtn = $('#soundBtn');
let soundPref = store.get('opusPixelPetSound') === 'on';
function syncSound() { soundBtn.setAttribute('aria-pressed', String(soundPref)); soundBtn.textContent = soundPref ? 'Sound on' : 'Sound off'; }
soundBtn.addEventListener('click', () => { soundPref = !soundPref; sfx.setSound(soundPref); store.set('opusPixelPetSound', soundPref ? 'on' : 'off'); syncSound(); sfx.play('tap'); });
syncSound();
document.addEventListener('pointerdown', () => { if (soundPref && !sfx.soundOn()) sfx.setSound(true); }, { once: true });

$('#renameForm').addEventListener('submit', e => {
  e.preventDefault();
  const before = state.name;
  apply({ state: rename(state, $('#nameInput').value, Date.now()), ok: true }, 'tap');
  if (state.name !== before) say(`Hello, ${state.name}.`);
});
const restart = $('#restartBtn');
restart.addEventListener('click', () => {
  if (restart.dataset.armed !== 'true') {
    restart.dataset.armed = 'true';
    restart.textContent = `Yes, say goodbye to ${state.name}`;
    setTimeout(() => { restart.dataset.armed = 'false'; restart.textContent = 'Start over with a new egg'; }, 5000);
    return;
  }
  state = newPet(newSeed(), Date.now());
  genome = genomeOf(state);
  spriteCache.clear(); foods = []; ball = null; fx = [];
  restart.dataset.armed = 'false'; restart.textContent = 'Start over with a new egg';
  say('A new egg. Tap it to keep it warm.');
  render(); save();
});

addEventListener('keydown', e => {
  if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const map = { f: () => $('#feedBtn').click(), b: throwBall, p: () => $('#petBtn').click(), w: () => $('#bathBtn').click(), l: () => $('#lightBtn').click() };
  if (map[k]) { e.preventDefault(); map[k](); }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); return; }
  const r = catchUp(state, Date.now());
  state = r.state;
  last = performance.now();
  if (r.away >= 600) say(state.journal[0].text);
  render();
});
addEventListener('pagehide', save);
setInterval(save, 5000);

// ---------- the panel ----------
const meters = $('#meters');
const LABELS = { food: 'Food', fun: 'Fun', rest: 'Rest', clean: 'Clean' };
for (const k of NEEDS) {
  const row = document.createElement('div');
  row.className = 'meter';
  row.dataset.need = k;
  row.innerHTML = `<span class="meter-label">${LABELS[k]}</span><span class="cells" role="meter" aria-label="${LABELS[k]}" aria-valuemin="0" aria-valuemax="100">${'<i></i>'.repeat(10)}</span>`;
  meters.append(row);
}

function relTime(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

let lastJournal = '';
function render() {
  $('#petName').textContent = state.name;
  const stageLabel = state.stage === 'adult' ? `${FORMS[state.form].label}` : STAGES[state.stage];
  $('#stageBadge').textContent = stageLabel;
  $('#age').textContent = `${ageOf(state)} · ${genome.trait}`;
  if (document.activeElement !== $('#nameInput')) $('#nameInput').value = state.name;
  for (const k of NEEDS) {
    const row = meters.querySelector(`[data-need="${k}"]`);
    const v = Math.round(state.needs[k]);
    const filled = state.stage === 'egg' ? 0 : Math.ceil(v / 10);
    row.querySelectorAll('i').forEach((c, i) => { c.className = i < filled ? (v < 25 ? 'on low' : 'on') : ''; });
    row.querySelector('.cells').setAttribute('aria-valuenow', String(state.stage === 'egg' ? 0 : v));
  }
  meters.classList.toggle('dim', state.stage === 'egg');
  const g = growthProgress(state);
  $('#growFill').style.width = `${Math.round(g.value * 100)}%`;
  $('#growLabel').textContent = state.stage === 'egg' ? 'Hatching'
    : g.next ? `Growing into a ${g.next === 'kid' ? 'kid' : 'grown-up'}${g.waiting === 'care' ? ', needs more care' : g.waiting === 'time' ? ', give it time' : ''}`
    : 'All grown up';
  const fav = FOODS[genome.favorite], dis = FOODS[genome.disliked];
  $('#favorite').textContent = state.known.favorite ? `${fav.emoji} ${fav.label}` : '? Not yet known';
  $('#disliked').textContent = state.known.disliked ? `${dis.emoji} ${dis.label}` : '? Not yet known';
  $('#lightBtn').textContent = state.sleeping ? 'Lights on' : 'Lights off';
  $('#lightBtn').setAttribute('aria-pressed', String(state.sleeping));
  $('#worldLabel').textContent = describeWorld(world);
  if (!msgActive) msgEl.textContent = wish(state);
  $('#wish').textContent = wish(state);
  const sig = state.journal.map(j => j.t + j.text).join('|');
  if (sig !== lastJournal) {
    lastJournal = sig;
    const list = $('#journal');
    list.replaceChildren(...state.journal.slice(0, 14).map(j => {
      const li = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = new Date(j.t).toISOString();
      time.textContent = relTime(j.t);
      li.append(time, document.createTextNode(j.text));
      return li;
    }));
  }
  $('#saveNote').textContent = saveOk ? 'Saved in this browser. Your pet waits while you are away.' : 'This browser is not saving. Your pet lives until you close the tab.';
  document.documentElement.style.setProperty('--pet-accent', accent());
}

// ---------- photo card ----------
async function photo() {
  if (state.stage === 'egg') return say('Wait until it hatches for a photo.');
  try { await document.fonts.load('48px "VT323"'); } catch { /* fallback font is fine */ }
  const c = document.createElement('canvas');
  c.width = 600; c.height = 760;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const pal = PALETTES[genome.palette];
  const bg = g.createLinearGradient(0, 0, 0, 760);
  bg.addColorStop(0, pal[4]); bg.addColorStop(1, pal[3]);
  g.fillStyle = bg; g.fillRect(0, 0, 600, 760);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let y = 0; y < 760; y += 24) for (let x = (y / 24) % 2 ? 12 : 0; x < 600; x += 24) g.fillRect(x, y, 4, 4);
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(150, 520, 300, 18);
  const s = petSprite(genome, { stage: state.stage, form: state.form, mood: 'happy' });
  sprite(g, s, 300 - 16 * 13, 100, false, 13);
  g.fillStyle = pal[0];
  g.textAlign = 'center';
  g.font = '72px "VT323", monospace';
  g.fillText(state.name, 300, 620);
  g.font = '34px "VT323", monospace';
  g.fillText(`${state.stage === 'adult' ? FORMS[state.form].label : STAGES[state.stage]} · ${ageOf(state)}`, 300, 664);
  g.font = '26px "VT323", monospace';
  g.globalAlpha = 0.7;
  g.fillText('Pixel Pet · Opus 5.5 edition', 300, 724);
  g.globalAlpha = 1;
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `${state.name.replace(/[^\w-]+/g, '-')}-pixel-pet.png`;
  document.body.append(a); a.click(); a.remove();
  sfx.play('shutter');
  say(`Say cheese, ${state.name}. Photo saved.`);
}

// ---------- start ----------
if (notice === 'unreadable') say('That save could not be read, so a fresh egg is waiting.');
else if (notice === 'new') say('An egg! Tap it to keep it warm.');
else say(state.journal[0] && Date.now() - state.journal[0].t < 5000 ? state.journal[0].text : `Welcome back. ${wish(state)}`);
render();
requestAnimationFrame(frame);

// Test hook.
window.__pet = {
  state: () => state, actor: () => ({ ...actor }), world: () => world,
  warp(seconds) { for (let i = 0; i < seconds; i += 5) state = tick(state, 5, world, Date.now()); spriteCache.clear(); render(); },
  set(patch) { const before = state; state = { ...state, ...patch }; if (before.stage !== state.stage) { genome = genomeOf(state); spriteCache.clear(); } render(); },
  hatch() { while (state.stage === 'egg') state = warm(state, 25, Date.now()).state; genome = genomeOf(state); spriteCache.clear(); say(`${state.name} hatched! Say hello.`); render(); },
  drop: dropFood, ball: throwBall,
};
