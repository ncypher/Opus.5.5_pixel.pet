// Tiny chiptune blips. Off until the visitor turns sound on.
let ctx = null;
let enabled = false;

export const soundOn = () => enabled;
export function setSound(on) {
  enabled = !!on;
  if (enabled && !ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; enabled = false; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return enabled;
}

function tone(freq, start, dur, { type = 'square', vol = 0.05, slide = 0 } = {}) {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

const SOUNDS = {
  tap: () => tone(520, 0, 0.06, { type: 'triangle', vol: 0.06 }),
  crack: () => { tone(300, 0, 0.05, { type: 'square' }); tone(240, 0.05, 0.06, { type: 'square' }); },
  hatch: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.12, { vol: 0.05 })),
  eat: () => { tone(220, 0, 0.05, { type: 'square', vol: 0.04 }); tone(200, 0.09, 0.05, { type: 'square', vol: 0.04 }); },
  love: () => [784, 988, 1175].forEach((f, i) => tone(f, i * 0.07, 0.1, { type: 'triangle', vol: 0.06 })),
  yuck: () => tone(300, 0, 0.25, { type: 'sawtooth', vol: 0.03, slide: -140 }),
  bounce: () => tone(420, 0, 0.07, { type: 'triangle', vol: 0.05, slide: 180 }),
  catch: () => [660, 880].forEach((f, i) => tone(f, i * 0.06, 0.09, { vol: 0.04 })),
  pet: () => tone(880, 0, 0.08, { type: 'sine', vol: 0.05, slide: 120 }),
  scoop: () => [1047, 1319].forEach((f, i) => tone(f, i * 0.05, 0.08, { type: 'triangle', vol: 0.04 })),
  bath: () => [600, 700, 650, 800].forEach((f, i) => tone(f, i * 0.06, 0.07, { type: 'sine', vol: 0.04 })),
  sleep: () => [523, 392, 330].forEach((f, i) => tone(f, i * 0.12, 0.16, { type: 'sine', vol: 0.05 })),
  wake: () => [330, 392, 523].forEach((f, i) => tone(f, i * 0.09, 0.12, { type: 'sine', vol: 0.05 })),
  grow: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.14, { vol: 0.05 })),
  shutter: () => { tone(1200, 0, 0.03, { type: 'square', vol: 0.04 }); tone(600, 0.04, 0.05, { type: 'square', vol: 0.03 }); },
};

export function play(name) {
  if (!enabled || !ctx || !SOUNDS[name]) return;
  try { SOUNDS[name](); } catch { /* sound is a nicety */ }
}
