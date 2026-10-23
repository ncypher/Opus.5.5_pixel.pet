// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGenome, rng, FOODS, PALETTES } from '../src/genome.js';
import { petSprite, eggSprite, coverage, SIZE } from '../src/sprite.js';
import { worldAt, phaseOf, seasonOf, weatherOf } from '../src/world.js';
import {
  newPet, warm, tick, feed, play, pet, scoop, bath, toggleSleep, moodOf, formFor, catchUp,
  restore, serialize, rename, growthProgress, GROWTH, NEEDS,
} from '../src/engine.js';

const T0 = Date.UTC(2026, 9, 23, 14, 0, 0);
const DAY = { phase: 'day', season: 'autumn', weather: 'clear' };
const seq = seed => rng(seed);

function hatched(seed = 7) {
  let s = newPet(seed, T0);
  for (let i = 0; i < 20 && s.stage === 'egg'; i++) s = warm(s, 12, T0).state;
  return s;
}

test('the same seed grows the same pet', () => {
  assert.deepEqual(makeGenome(42), makeGenome(42));
  assert.notDeepEqual(makeGenome(42), makeGenome(43));
  const g = makeGenome(5);
  assert.ok(PALETTES[g.palette]);
  assert.notEqual(g.favorite, g.disliked);
  assert.ok(FOODS[g.favorite] && FOODS[g.disliked]);
});

test('sprites draw something for every stage, form, and mood, and grow with age', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = makeGenome(seed);
    const sizes = {};
    for (const stage of ['baby', 'kid', 'adult']) {
      const forms = stage === 'adult' ? ['bouncer', 'puffball', 'glimmer', 'sage'] : [null];
      for (const form of forms) for (const mood of ['normal', 'happy', 'sad', 'sleep', 'blink', 'eat']) for (const frame of [0, 1]) {
        const s = petSprite(g, { stage, form, mood, frame, walking: frame === 1 });
        assert.equal(s.px.length, SIZE * SIZE);
        assert.ok(s.px.every(v => v >= 0 && v <= 9));
        assert.ok(coverage(s) > 30, `seed ${seed} ${stage} ${form} ${mood}`);
      }
      sizes[stage] = coverage(petSprite(g, { stage, form: stage === 'adult' ? 'sage' : null }));
    }
    assert.ok(sizes.baby < sizes.kid && sizes.kid < sizes.adult, `seed ${seed} grows`);
    assert.ok(coverage(eggSprite(g, { warmth: 90 })) > 80);
  }
});

test('the world follows the clock and calendar', () => {
  assert.equal(phaseOf(new Date(2026, 0, 1, 2, 0)), 'night');
  assert.equal(phaseOf(new Date(2026, 0, 1, 6, 0)), 'dawn');
  assert.equal(phaseOf(new Date(2026, 0, 1, 12, 0)), 'day');
  assert.equal(phaseOf(new Date(2026, 0, 1, 19, 0)), 'dusk');
  assert.equal(seasonOf(new Date(2026, 0, 10)), 'winter');
  assert.equal(seasonOf(new Date(2026, 9, 10)), 'autumn');
  // Same day, same weather; never snow in summer.
  assert.equal(weatherOf(new Date(2026, 6, 4, 9)), weatherOf(new Date(2026, 6, 4, 22)));
  for (let d = 1; d <= 31; d++) assert.notEqual(weatherOf(new Date(2026, 6, d)), 'snow');
  const w = worldAt(new Date(2026, 9, 23, 23, 0));
  assert.equal(w.phase, 'night');
  assert.equal(w.body.kind, 'moon');
});

test('an egg hatches from warmth, by taps or slowly on its own', () => {
  let s = newPet(9, T0);
  assert.equal(s.stage, 'egg');
  assert.equal(moodOf(s), 'egg');
  assert.equal(feed(s, 'berry', T0).ok, false);
  let events = [];
  for (let i = 0; i < 9; i++) { const r = warm(s, 12, T0); s = r.state; events.push(r.event); }
  assert.equal(s.stage, 'baby');
  assert.ok(events.includes('crack') && events.at(-1) === 'hatch');
  assert.match(s.journal[0].text, /hatched/);
  // Left alone, an egg still hatches.
  let lone = newPet(10, T0);
  for (let i = 0; i < 60 && lone.stage === 'egg'; i++) lone = tick(lone, 5, DAY, T0);
  assert.equal(lone.stage, 'baby');
});

test('needs fall with time but never below zero, and nothing dies', () => {
  let s = hatched();
  for (let i = 0; i < 4000; i++) s = tick(s, 5, DAY, T0 + i * 5000, seq(1));
  for (const k of NEEDS) assert.ok(s.needs[k] >= 0 && s.needs[k] <= 100);
  assert.equal(moodOf(s), 'sad');
  // A little care brings it back.
  s = feed(s, 'bun', T0).state;
  s = bath(s, T0).state;
  assert.ok(s.needs.food > 0 && s.needs.clean === 100);
});

test('favorite and disliked foods are discovered and remembered', () => {
  let s = hatched(11);
  const g = makeGenome(11);
  s = { ...s, needs: { ...s.needs, food: 20 } };
  const loved = feed(s, g.favorite, T0, seq(2));
  assert.equal(loved.reaction, 'love');
  assert.ok(loved.state.known.favorite);
  assert.match(loved.state.journal[0].text, /favorite food/);
  const yuck = feed(loved.state, g.disliked, T0, seq(3));
  assert.equal(yuck.reaction, 'yuck');
  assert.ok(yuck.state.known.disliked);
  assert.ok(loved.state.needs.food - 20 > yuck.state.needs.food - loved.state.needs.food, 'favorite fills more');
  assert.equal(feed({ ...s, needs: { ...s.needs, food: 99 } }, 'berry', T0).ok, false);
});

test('eating leads to a mess, and scooping or a bath cleans it', () => {
  let s = hatched(12);
  s = { ...s, needs: { ...s.needs, food: 30 } };
  s = feed(s, 'berry', T0, () => 0).state;
  assert.ok(s.digest > 0);
  for (let i = 0; i < 40 && !s.messes.length; i++) s = tick(s, 5, DAY, T0, () => 0.5);
  assert.equal(s.messes.length, 1);
  const before = s.needs.clean;
  s = scoop(s, 0, T0).state;
  assert.equal(s.messes.length, 0);
  assert.ok(s.needs.clean > before);
  assert.equal(scoop(s, 0, T0).ok, false);
});

test('sleep restores rest, blocks feeding, and wakes in the morning', () => {
  let s = hatched(13);
  s = { ...s, needs: { ...s.needs, rest: 10 } };
  assert.equal(play(s, T0).ok, false, 'too tired to play');
  s = toggleSleep(s, T0).state;
  assert.equal(moodOf(s), 'sleep');
  assert.equal(feed(s, 'berry', T0).ok, false);
  for (let i = 0; i < 60; i++) s = tick(s, 5, { ...DAY, phase: 'night' }, T0);
  assert.equal(s.sleeping, true, 'stays asleep at night');
  for (let i = 0; i < 60; i++) s = tick(s, 5, DAY, T0);
  assert.equal(s.sleeping, false, 'wakes rested in daytime');
  assert.ok(s.needs.rest > 85, 'woke rested, then the day began');
});

test('growing up needs both time and care, and the form follows the care', () => {
  let s = hatched(14);
  s = { ...s, active: GROWTH.kid.active + 1 };
  s = tick(s, 1, DAY, T0);
  assert.equal(s.stage, 'baby', 'time alone is not enough');
  for (let i = 0; i < 30; i++) s = pet(s, T0).state;
  s = tick(s, 1, DAY, T0);
  assert.equal(s.stage, 'kid');
  assert.equal(growthProgress(s).next, 'adult');
  // Raise it on play.
  s = { ...s, active: GROWTH.adult.active + 1, care: { fed: 2, played: 30, petted: 3, cleaned: 2, slept: 1 }, needs: { ...s.needs, rest: 100 } };
  for (let i = 0; i < 10; i++) s = play(s, T0).state;
  assert.equal(s.stage, 'adult');
  assert.equal(s.form, 'bouncer');
  assert.equal(formFor({ fed: 20, played: 2, petted: 1, cleaned: 1 }), 'puffball');
  assert.equal(formFor({ fed: 2, played: 2, petted: 12, cleaned: 6 }), 'glimmer');
  assert.equal(formFor({ fed: 5, played: 5, petted: 3, cleaned: 2 }), 'sage');
});

test('coming back: the pet missed you, gently', () => {
  let s = hatched(15);
  s = { ...s, needs: { food: 90, fun: 90, rest: 90, clean: 90 }, lastSeen: T0 };
  const r = catchUp(s, T0 + 3 * 86400000);
  for (const k of NEEDS) assert.ok(r.state.needs[k] >= 25, `${k} floor`);
  assert.match(r.state.journal[0].text, /away 3 days/);
  const short = catchUp(s, T0 + 30000);
  assert.deepEqual(short.state.needs, s.needs);
  // Needs already under the floor are not pushed lower.
  const low = catchUp({ ...s, needs: { food: 10, fun: 10, rest: 10, clean: 10 } }, T0 + 86400000);
  assert.equal(low.state.needs.food, 10);
});

test('saves round-trip, and broken saves fall back to a fresh egg', () => {
  let s = hatched(16);
  s = rename(s, '  Captain   Wobble  ', T0);
  assert.equal(s.name, 'Captain Wobble');
  const back = restore(serialize(s), T0, () => 99);
  assert.equal(back.notice, 'restored');
  assert.deepEqual(back.state, s);
  for (const bad of ['{', '[]', '{"v":2}', 'null', '{"v":1,"seed":"x"}']) {
    const r = restore(bad, T0, () => 99);
    assert.equal(r.notice, 'unreadable', bad);
    assert.equal(r.state.stage, 'egg');
  }
  // Tampered values are clamped, not trusted.
  const t = restore(JSON.stringify({ ...s, needs: { food: 9999, fun: -5, rest: 'x', clean: 50 }, stage: 'wizard', messes: [{ x: 7 }, 'junk'] }), T0);
  assert.equal(t.state.needs.food, 100);
  assert.equal(t.state.needs.fun, 0);
  assert.equal(t.state.stage, 'egg');
  assert.equal(t.state.messes.length, 1);
  assert.ok(t.state.messes[0].x <= 0.95);
});
