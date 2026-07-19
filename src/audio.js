// audio.js — all sound synthesized at runtime with the Web Audio API.
// Zero audio files = zero bytes to host, zero licensing, instant load. Muted
// until first user gesture (browser autoplay policy) and remembered in storage.
let ctx = null;
let enabled = localStorage.getItem('pl_sound') !== 'off';

function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; } }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function isSoundOn() { return enabled; }
export function toggleSound() { enabled = !enabled; localStorage.setItem('pl_sound', enabled ? 'on' : 'off'); if (enabled) blip(660, 0.05, 'sine'); return enabled; }

function tone(freq, dur, type = 'sine', gain = 0.14, when = 0, sweepTo = null) {
  const a = ac(); if (!a || !enabled) return;
  const t0 = a.currentTime + when;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur, gain = 0.2, when = 0, hp = 400) {
  const a = ac(); if (!a || !enabled) return;
  const t0 = a.currentTime + when;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(); src.buffer = buf;
  const g = a.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  src.connect(f).connect(g).connect(a.destination); src.start(t0);
}
function blip(f, d, type) { tone(f, d, type, 0.1); }

export const sfx = {
  select: () => blip(520, 0.05, 'square'),
  back: () => blip(300, 0.06, 'square'),
  hover: () => tone(700, 0.03, 'sine', 0.05),
  hit: () => { noise(0.14, 0.22, 0, 300); tone(150, 0.12, 'triangle', 0.12, 0, 60); },
  superHit: () => { noise(0.22, 0.3, 0, 250); tone(200, 0.2, 'sawtooth', 0.14, 0, 70); tone(400, 0.1, 'square', 0.08, 0.02); },
  weakHit: () => { noise(0.08, 0.12, 0, 600); },
  faint: () => { tone(400, 0.5, 'sine', 0.14, 0, 60); },
  heal: () => { tone(523, 0.12, 'sine', 0.1); tone(659, 0.12, 'sine', 0.1, 0.1); tone(784, 0.16, 'sine', 0.1, 0.2); },
  buff: () => { tone(330, 0.12, 'square', 0.08); tone(494, 0.14, 'square', 0.08, 0.08); },
  status: () => { tone(220, 0.2, 'sawtooth', 0.1, 0, 180); },
  crit: () => { noise(0.05, 0.25, 0, 800); tone(880, 0.08, 'square', 0.12); },
  connect: () => { tone(440, 0.1, 'sine', 0.12); tone(660, 0.1, 'sine', 0.12, 0.1); tone(880, 0.2, 'sine', 0.12, 0.2); },
  send: () => { tone(600, 0.08, 'sine', 0.08, 0, 900); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'square', 0.12, i * 0.12)); },
  lose: () => { [392, 349, 294].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, i * 0.18, f * 0.6)); },
  roar: () => { noise(0.6, 0.35, 0, 120); tone(90, 0.6, 'sawtooth', 0.18, 0, 55); },
  reward: () => { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.18, 'sine', 0.12, i * 0.1)); },
};

export function haptic(ms = 12) { if (navigator.vibrate) try { navigator.vibrate(ms); } catch {} }
