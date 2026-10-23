// The life of one pet. Pure functions over a plain state object, so the rules
// can be tested without a screen. Nothing here ever lets a pet die: low needs
// make it sad and slow, and a little care brings it back.
import { makeGenome, FOODS } from './genome.js';

export const SAVE_KEY = 'opusPixelPetV1';
export const NEEDS = ['food', 'fun', 'rest', 'clean'];
export const FORMS = {
  bouncer: { label: 'Bouncer', blurb: 'Raised on play. Springy, quick, and never still for long.' },
  puffball: { label: 'Puffball', blurb: 'Raised at the snack table. Round, soft, and very content.' },
  glimmer: { label: 'Glimmer', blurb: 'Raised on affection. It sparkles a little when it is happy.' },
  sage: { label: 'Sage', blurb: 'Raised with a bit of everything. Calm, curious, and wears a leaf crown.' },
};
export const STAGES = {
  egg: 'Egg', baby: 'Baby', kid: 'Kid', adult: 'Grown',
};
// Care time (seconds, while the page is open) and bond needed to grow.
export const GROWTH = { kid: { active: 8 * 60, bond: 12 }, adult: { active: 25 * 60, bond: 40 } };
const AWAY_FLOOR = 25;
const JOURNAL_MAX = 40;

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const num = (v, d, lo = 0, hi = 100) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);

export function newPet(seed, now = Date.now()) {
  const g = makeGenome(seed);
  return {
    v: 1, seed: g.seed, name: g.name,
    stage: 'egg', form: null, warmth: 0,
    createdAt: now, hatchedAt: null, lastSeen: now,
    needs: { food: 80, fun: 70, rest: 85, clean: 90 },
    sleeping: false, messes: [], digest: null,
    care: { fed: 0, played: 0, petted: 0, cleaned: 0, slept: 0 },
    bond: 0, active: 0,
    known: { favorite: false, disliked: false },
    flags: {},
    journal: [{ t: now, text: 'An egg arrived. It is warm, and something inside is listening.' }],
  };
}

export const genomeOf = state => makeGenome(state.seed);

export function note(state, text, now = Date.now()) {
  return { ...state, journal: [{ t: now, text }, ...state.journal].slice(0, JOURNAL_MAX) };
}
function once(state, flag, text, now) {
  if (state.flags[flag]) return state;
  return note({ ...state, flags: { ...state.flags, [flag]: true } }, text, now);
}

export const cleanName = v => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 16) : '') || null;

export function rename(state, name, now = Date.now()) {
  const n = cleanName(name);
  if (!n || n === state.name) return state;
  return note({ ...state, name: n }, `You named your pet ${n}.`, now);
}

// ---------- the egg ----------
export function warm(state, amount = 12, now = Date.now()) {
  if (state.stage !== 'egg') return { state, event: null };
  const warmth = clamp(state.warmth + amount);
  if (warmth < 100) return { state: { ...state, warmth }, event: warmth >= 55 && state.warmth < 55 ? 'crack' : 'wobble' };
  const hatched = note({ ...state, warmth: 100, stage: 'baby', hatchedAt: now }, `${state.name} hatched! Tiny, wobbly, and already hungry.`, now);
  return { state: hatched, event: 'hatch' };
}

// ---------- time ----------
// dt: seconds of visible, active time. world: from worldAt().
export function tick(state, dt, world = { phase: 'day', season: 'spring', weather: 'clear' }, now = Date.now(), rnd = Math.random) {
  dt = clamp(dt, 0, 5);
  let s = { ...state, lastSeen: now };
  if (s.stage === 'egg') {
    // An egg left alone still warms, slowly, so nobody is stuck forever.
    return warm(s, dt * 0.6, now).state;
  }
  const night = world.phase === 'night';
  const n = { ...s.needs };
  const messes = s.messes.length;
  n.food -= dt * (s.sleeping ? 0.025 : 0.05);
  n.fun -= dt * (s.sleeping ? 0.01 : 0.035);
  n.clean -= dt * (0.018 + messes * 0.02);
  n.rest += s.sleeping ? dt * 0.55 : -dt * (night ? 0.06 : 0.03);
  for (const k of NEEDS) n[k] = clamp(n[k]);
  s.needs = n;
  s.active = s.active + dt;

  // Digestion: a little while after eating, there is a mess to scoop.
  if (s.digest != null) {
    const d = s.digest - dt;
    if (d <= 0) {
      s.digest = null;
      if (s.messes.length < 3) s.messes = [...s.messes, { x: 0.15 + rnd() * 0.7, t: now }];
      s = once(s, 'firstMess', `${s.name} made a mess. Scoop it up and it will feel better.`, now);
    } else s.digest = d;
  }

  // Wake up rested in the daytime.
  if (s.sleeping && n.rest >= 100 && !night) {
    s.sleeping = false;
    s = note(s, `${s.name} woke up rested and stretched every tiny limb.`, now);
  }

  // Seasonal firsts for the journal.
  if (world.weather === 'snow') s = once(s, 'firstSnow', `First snow. ${s.name} pressed its face to the window.`, now);
  if (world.weather === 'rain') s = once(s, 'firstRain', `Rain on the window. ${s.name} counted drops and lost track.`, now);
  if (night) s = once(s, 'firstNight', `The first night. ${s.name} watched the moon for a long time.`, now);

  return grow(s, now);
}

export function formFor(care) {
  const play = care.played, food = care.fed, love = care.petted + care.cleaned;
  const total = play + food + love;
  if (total < 3) return 'sage';
  const share = [['bouncer', play], ['puffball', food], ['glimmer', love]].sort((a, b) => b[1] - a[1]);
  return share[0][1] / total >= 0.45 ? share[0][0] : 'sage';
}

export function grow(state, now = Date.now()) {
  if (state.stage === 'baby' && state.active >= GROWTH.kid.active && state.bond >= GROWTH.kid.bond) {
    return note({ ...state, stage: 'kid' }, `${state.name} grew! Ears, a belly, and opinions.`, now);
  }
  if (state.stage === 'kid' && state.active >= GROWTH.adult.active && state.bond >= GROWTH.adult.bond) {
    const form = formFor(state.care);
    return note({ ...state, stage: 'adult', form }, `${state.name} is all grown up: a ${FORMS[form].label}. ${FORMS[form].blurb}`, now);
  }
  return state;
}

// How far along to the next stage, 0..1, and what it is waiting on.
export function growthProgress(state) {
  if (state.stage === 'egg') return { next: 'baby', value: state.warmth / 100, waiting: 'warmth' };
  const goal = state.stage === 'baby' ? GROWTH.kid : state.stage === 'kid' ? GROWTH.adult : null;
  if (!goal) return { next: null, value: 1, waiting: null };
  const t = Math.min(1, state.active / goal.active), b = Math.min(1, state.bond / goal.bond);
  return { next: state.stage === 'baby' ? 'kid' : 'adult', value: Math.min(t, b), waiting: t < b ? 'time' : b < 1 ? 'care' : null };
}

// ---------- care ----------
const awake = (state, verb) => state.sleeping ? { state, message: `Shh. ${state.name} is asleep. Turn the light on to ${verb}.`, ok: false } : null;
const hatchedOnly = state => state.stage === 'egg' ? { state, message: 'Still an egg. Keep it warm.', ok: false } : null;

export function feed(state, food, now = Date.now(), rnd = Math.random) {
  const block = hatchedOnly(state) || awake(state, 'feed it');
  if (block) return block;
  const item = FOODS[food];
  if (!item) return { state, message: 'That is not food.', ok: false };
  if (state.needs.food >= 95) return { state, message: `${state.name} is full. Maybe later.`, ok: false };
  const g = genomeOf(state);
  let s = { ...state, needs: { ...state.needs }, care: { ...state.care, fed: state.care.fed + 1 }, known: { ...state.known } };
  let message, reaction;
  if (food === g.favorite) {
    s.needs.food = clamp(s.needs.food + item.fill * 1.3);
    s.needs.fun = clamp(s.needs.fun + 10);
    s.bond += 3;
    reaction = 'love';
    message = `${s.name} loves ${item.label.toLowerCase()}! Happy chewing noises.`;
    if (!s.known.favorite) { s.known.favorite = true; s = note(s, `Discovery: ${s.name}'s favorite food is ${item.label.toLowerCase()}.`, now); }
  } else if (food === g.disliked) {
    s.needs.food = clamp(s.needs.food + item.fill * 0.4);
    s.needs.fun = clamp(s.needs.fun - 6);
    reaction = 'yuck';
    message = `${s.name} nibbled the ${item.label.toLowerCase()} and made a face.`;
    if (!s.known.disliked) { s.known.disliked = true; s = note(s, `Discovery: ${s.name} does not like ${item.label.toLowerCase()}. Noted.`, now); }
  } else {
    s.needs.food = clamp(s.needs.food + item.fill);
    s.needs.fun = clamp(s.needs.fun + 3);
    s.bond += 2;
    reaction = 'yum';
    message = `${item.label} for ${s.name}. Gone in three bites.`;
  }
  s.needs.clean = clamp(s.needs.clean - 4);
  if (s.digest == null) s.digest = 50 + rnd() * 70;
  return { state: grow(s, now), message, ok: true, reaction };
}

export function play(state, now = Date.now()) {
  const block = hatchedOnly(state) || awake(state, 'play');
  if (block) return block;
  if (state.needs.rest < 15) return { state, message: `${state.name} is too tired to chase anything. Time for a nap?`, ok: false };
  const s = {
    ...state, bond: state.bond + 3, care: { ...state.care, played: state.care.played + 1 },
    needs: { ...state.needs, fun: clamp(state.needs.fun + 16), rest: clamp(state.needs.rest - 6), food: clamp(state.needs.food - 3), clean: clamp(state.needs.clean - 2) },
  };
  return { state: grow(s, now), message: `${s.name} caught it! Tail wagging, if it has one.`, ok: true };
}

export function pet(state, now = Date.now()) {
  const block = hatchedOnly(state);
  if (block) return block;
  if (state.sleeping) {
    return { state: { ...state, bond: state.bond + 0.5 }, message: `${state.name} sighs in its sleep.`, ok: true };
  }
  const tired = state.needs.fun >= 98;
  const s = {
    ...state, bond: state.bond + (tired ? 0.2 : 1), care: { ...state.care, petted: state.care.petted + 1 },
    needs: { ...state.needs, fun: clamp(state.needs.fun + 3) },
  };
  return { state: grow(s, now), message: tired ? `${s.name} is already as happy as a pet can be.` : `${s.name} leans into your hand.`, ok: true };
}

export function scoop(state, index, now = Date.now()) {
  if (!state.messes[index]) return { state, message: 'Nothing to clean there.', ok: false };
  const s = {
    ...state, messes: state.messes.filter((_, i) => i !== index), bond: state.bond + 1,
    care: { ...state.care, cleaned: state.care.cleaned + 1 },
    needs: { ...state.needs, clean: clamp(state.needs.clean + 10) },
  };
  return { state: grow(s, now), message: s.messes.length ? 'Scooped. One more to go.' : 'All clean. Fresh as a daisy.', ok: true };
}

export function bath(state, now = Date.now()) {
  const block = hatchedOnly(state) || awake(state, 'give a bath');
  if (block) return block;
  if (state.needs.clean >= 95 && !state.messes.length) return { state, message: `${state.name} is already sparkling.`, ok: false };
  const s = {
    ...state, messes: [], bond: state.bond + 2, care: { ...state.care, cleaned: state.care.cleaned + 1 },
    needs: { ...state.needs, clean: 100, fun: clamp(state.needs.fun + (genomeOf(state).trait === 'shy' ? -4 : 4)) },
  };
  return { state: grow(s, now), message: `Bubbles everywhere. ${s.name} is squeaky clean.`, ok: true };
}

export function toggleSleep(state, now = Date.now()) {
  const block = hatchedOnly(state);
  if (block) return block;
  if (!state.sleeping) {
    const s = { ...state, sleeping: true, care: { ...state.care, slept: state.care.slept + 1 } };
    return { state: s, message: `Lights out. ${s.name} curls up in bed.`, ok: true };
  }
  return { state: { ...state, sleeping: false }, message: `Lights on. ${state.name} blinks at you.`, ok: true };
}

// ---------- mood ----------
export function moodOf(state) {
  if (state.stage === 'egg') return 'egg';
  if (state.sleeping) return 'sleep';
  const n = state.needs;
  const low = NEEDS.filter(k => n[k] < 25);
  if (low.length) return 'sad';
  if (n.fun > 75 && n.food > 50 && n.clean > 50) return 'happy';
  return 'normal';
}

export function wish(state) {
  if (state.stage === 'egg') return state.warmth < 55 ? 'Tap the egg to keep it warm.' : 'It is cracking! A few more taps.';
  if (state.sleeping) return 'Sleeping. Dreaming of something round.';
  const n = state.needs;
  const lowest = NEEDS.slice().sort((a, b) => n[a] - n[b])[0];
  if (state.messes.length) return 'There is a mess to scoop.';
  if (n[lowest] >= 60) return 'Content. Maybe throw the ball?';
  return {
    food: 'Hungry. It keeps looking at the food shelf.',
    fun: 'Bored. Throw the ball, or give it a pat.',
    rest: 'Sleepy. Turn the light off for a nap.',
    clean: 'A bit grubby. A bath would help.',
  }[lowest];
}

// ---------- coming back ----------
// While you are away, the pet misses you a little, but never drops below a floor.
export function catchUp(state, now = Date.now()) {
  const away = Math.max(0, (now - (state.lastSeen || now)) / 1000);
  if (state.stage === 'egg' || away < 120) return { state: { ...state, lastSeen: now }, away };
  const minutes = away / 60;
  const drop = Math.min(45, minutes * 0.12);
  const n = { ...state.needs };
  for (const k of ['food', 'fun', 'clean']) if (n[k] > AWAY_FLOOR) n[k] = Math.max(AWAY_FLOOR, n[k] - drop);
  n.rest = state.sleeping ? 100 : Math.max(AWAY_FLOOR, n.rest - drop * 0.5);
  let s = { ...state, needs: n, lastSeen: now };
  const hours = minutes / 60;
  const span = hours >= 24 ? `${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? '' : 's'}` : hours >= 1 ? `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}` : `${Math.round(minutes)} minutes`;
  if (minutes >= 10) s = note(s, `You were away ${span}. ${s.name} ${state.sleeping ? 'slept the whole time' : 'waited by the window'} and is glad you are back.`, now);
  return { state: s, away };
}

// ---------- saving ----------
export function serialize(state) { return JSON.stringify(state); }

export function restore(raw, now = Date.now(), seedFn = () => (Math.random() * 2 ** 32) >>> 0) {
  if (!raw) return { state: newPet(seedFn(), now), notice: 'new' };
  let d;
  try { d = JSON.parse(raw); } catch { d = null; }
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.v !== 1 || !Number.isInteger(d.seed)) {
    return { state: newPet(seedFn(), now), notice: 'unreadable' };
  }
  const base = newPet(d.seed >>> 0, d.createdAt || now);
  const stage = ['egg', 'baby', 'kid', 'adult'].includes(d.stage) ? d.stage : 'egg';
  const s = {
    ...base,
    name: cleanName(d.name) || base.name,
    stage,
    form: stage === 'adult' && FORMS[d.form] ? d.form : stage === 'adult' ? 'sage' : null,
    warmth: num(d.warmth, 0),
    createdAt: num(d.createdAt, now, 0, 1e15),
    hatchedAt: d.hatchedAt == null ? (stage === 'egg' ? null : now) : num(d.hatchedAt, now, 0, 1e15),
    lastSeen: num(d.lastSeen, now, 0, 1e15),
    needs: Object.fromEntries(NEEDS.map(k => [k, num(d.needs && d.needs[k], base.needs[k])])),
    sleeping: d.sleeping === true,
    messes: Array.isArray(d.messes) ? d.messes.slice(0, 3).filter(m => m && typeof m.x === 'number').map(m => ({ x: clamp(m.x, 0.05, 0.95), t: num(m.t, now, 0, 1e15) })) : [],
    digest: d.digest == null ? null : num(d.digest, null, 0, 600),
    care: Object.fromEntries(Object.keys(base.care).map(k => [k, num(d.care && d.care[k], 0, 0, 1e9)])),
    bond: num(d.bond, 0, 0, 1e9),
    active: num(d.active, 0, 0, 1e10),
    known: { favorite: !!(d.known && d.known.favorite), disliked: !!(d.known && d.known.disliked) },
    flags: d.flags && typeof d.flags === 'object' && !Array.isArray(d.flags) ? Object.fromEntries(Object.entries(d.flags).filter(([, v]) => v === true)) : {},
    journal: Array.isArray(d.journal) ? d.journal.filter(e => e && typeof e.text === 'string').slice(0, JOURNAL_MAX).map(e => ({ t: num(e.t, now, 0, 1e15), text: e.text.slice(0, 240) })) : base.journal,
  };
  return { state: s, notice: 'restored' };
}

export function ageOf(state, now = Date.now()) {
  if (!state.hatchedAt) return 'not hatched yet';
  const days = Math.floor((now - state.hatchedAt) / 86400000);
  return days < 1 ? 'hatched today' : `${days} day${days === 1 ? '' : 's'} old`;
}
