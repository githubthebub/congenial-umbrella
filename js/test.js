/* Headless test harness: runs many random-agent battles to smoke-test the
 * engine, then a few AI-vs-AI battles. Run with: node js/test.js            */
const POKE = require('./data.js');
require('./engine.js');
require('./ai.js');
const { Battle } = POKE.engine;
const { TEAMS, PERSONAS } = POKE.data;
const AI = POKE.ai;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomAction(b, side, rng) {
  const req = b.requestFor(side);
  if (req.kind !== 'move') return { type: 'switch', target: req.switches[0] };
  const usable = req.moves.filter((m) => !m.disabled && m.pp > 0);
  if (rng() < 0.12 && req.switches.length) return { type: 'switch', target: req.switches[(rng() * req.switches.length) | 0] };
  if (!usable.length) return req.switches.length ? { type: 'switch', target: req.switches[0] } : { type: 'move', move: req.moves[0].id };
  const mv = usable[(rng() * usable.length) | 0];
  return { type: 'move', move: mv.id, tera: req.canTera && rng() < 0.15 };
}

function driveTurn(b, a0, a1, pick) {
  const gen = b.resolveTurn(a0, a1);
  let res = gen.next();
  let guard = 0;
  while (!res.done && guard++ < 40) {
    const req = res.value;
    const idx = req.switches && req.switches.length ? pick(req) : null;
    res = gen.next(idx);
  }
  return res.done;
}

function runRandom(seed) {
  const t1 = TEAMS.balance.sets, t2 = TEAMS.offense.sets;
  const b = new Battle(t1, t2, { seed });
  const rng = mulberry32(seed ^ 0x9e3779b9);
  b.start();
  let guard = 0;
  while (b.winner === null && guard++ < 400) {
    const a0 = randomAction(b, 0, rng), a1 = randomAction(b, 1, rng);
    driveTurn(b, a0, a1, (req) => req.switches[(rng() * req.switches.length) | 0]);
  }
  return { winner: b.winner, turns: b.turn, guard };
}

function runAIvsAI(seed, cfg0, cfg1, teamA, teamB) {
  const b = new Battle(teamA.sets, teamB.sets, { seed });
  b.start();
  let guard = 0;
  while (b.winner === null && guard++ < 400) {
    const a0 = AI.chooseAction(b, 0, cfg0);
    const a1 = AI.chooseAction(b, 1, cfg1);
    driveTurn(b, a0, a1, (req) => AI.chooseSwitch(b, req.side, cfg0 && req.side === 0 ? cfg0 : cfg1, req.kind));
  }
  return { winner: b.winner, turns: b.turn, log: b.log.length };
}

// --- Random smoke test ---
let errors = 0, ties = 0, w0 = 0, w1 = 0;
for (let s = 1; s <= 300; s++) {
  try {
    const r = runRandom(s);
    if (r.winner === 'tie') ties++; else if (r.winner === 0) w0++; else if (r.winner === 1) w1++;
    if (r.guard >= 400) { console.log('  [warn] battle', s, 'hit guard'); }
  } catch (e) { errors++; if (errors <= 5) console.log('  [ERR] seed', s, e.message, '\n', e.stack.split('\n').slice(1, 4).join('\n')); }
}
console.log('Random smoke: 300 battles | wins P0=' + w0, 'P1=' + w1, 'ties=' + ties, 'errors=' + errors);

// --- AI vs AI test (all persona configs) ---
let aiErr = 0;
const teams = Object.values(TEAMS);
for (let s = 1; s <= 40; s++) {
  try {
    const p = PERSONAS[(s) % PERSONAS.length], q = PERSONAS[(s + 3) % PERSONAS.length];
    const ta = teams[s % teams.length], tb = teams[(s + 2) % teams.length];
    const r = runAIvsAI(s * 7 + 1, p.ai, q.ai, ta, tb);
    if (s <= 3) console.log('  AI battle', s, p.name, 'vs', q.name, '→', r.winner, 'in', r.turns, 'turns');
  } catch (e) { aiErr++; if (aiErr <= 5) console.log('  [AI-ERR] seed', s, e.message, '\n', e.stack.split('\n').slice(1, 5).join('\n')); }
}
console.log('AI-vs-AI: 40 battles | errors=' + aiErr);
console.log(errors === 0 && aiErr === 0 ? 'ALL GREEN ✅' : 'HAD ERRORS ❌');
