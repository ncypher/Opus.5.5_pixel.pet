// The world outside the window follows the visitor's real clock and calendar.
import { rng } from './genome.js';

const PHASES = {
  night: { sky: ['#0b1030', '#1d2350'], light: 0.35 },
  dawn:  { sky: ['#3b3f7a', '#f2a07b'], light: 0.75 },
  day:   { sky: ['#5bb4ef', '#bfe7ff'], light: 1 },
  dusk:  { sky: ['#3d2d6b', '#f08a6a'], light: 0.7 },
};

export function phaseOf(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 5 || h >= 21) return 'night';
  if (h < 7) return 'dawn';
  if (h < 17.5) return 'day';
  return 'dusk';
}

export function seasonOf(date) {
  const m = date.getMonth();
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

const dayKey = date => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// The same weather for everyone on a given day.
export function weatherOf(date) {
  const r = rng(hash(dayKey(date)))();
  const season = seasonOf(date);
  if (r < 0.55) return 'clear';
  if (r < 0.7) return 'cloudy';
  if (r < 0.85) return season === 'winter' ? 'snow' : 'rain';
  return season === 'winter' ? 'snow' : season === 'summer' ? 'clear' : 'rain';
}

// Sun or moon position across the window (0..1), arcing over the day.
function celestial(date, phase) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (phase === 'night') {
    const t = ((h + 24 - 21) % 24) / 8; // 21:00 → 05:00
    return { kind: 'moon', x: t, y: 1 - Math.sin(Math.PI * Math.min(1, t)) };
  }
  const t = (h - 5) / 16; // 05:00 → 21:00
  return { kind: 'sun', x: t, y: 1 - Math.sin(Math.PI * Math.max(0, Math.min(1, t))) };
}

export function worldAt(date = new Date()) {
  const phase = phaseOf(date);
  const season = seasonOf(date);
  const weather = weatherOf(date);
  let particles = weather === 'rain' ? 'rain' : weather === 'snow' ? 'snow' : null;
  if (!particles && season === 'autumn' && phase !== 'night') particles = 'leaves';
  if (!particles && season === 'spring' && phase === 'day') particles = 'petals';
  if (!particles && season === 'summer' && (phase === 'night' || phase === 'dusk')) particles = 'fireflies';
  return { phase, season, weather, particles, ...PHASES[phase], body: celestial(date, phase), sleepyTime: phase === 'night' };
}

export const describeWorld = w => {
  const when = { night: 'A quiet night', dawn: 'Early morning', day: 'Daytime', dusk: 'Evening' }[w.phase];
  const sky = { clear: '', cloudy: ', cloudy', rain: ', raining', snow: ', snowing' }[w.weather];
  return `${when}${sky}`;
};
