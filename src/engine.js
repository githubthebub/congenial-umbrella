// ---------------------------------------------------------------------------
// engine.js — pure, deterministic turn-based battle simulation.
// Runs on exactly ONE machine per battle (the AI host locally, or the online
// host who then broadcasts the event log). Given the same seed + same actions
// it always produces the same events -> zero desync.
//
// A "battle" has sides. Each side has a `party` (mons) and `active` (party
// indices currently on the field). 1v1 = one active per side. Co-op raid =
// two allies active on side 0, one boss active on side 1 (boss may act twice).
// resolveTurn(state, actions) mutates state and returns an event log.
// ---------------------------------------------------------------------------
import { MOVES, SPECIES_BY_ID, effectiveness } from './data.js';
import { makeRng } from './rng.js';

const STAGES = ['atk', 'def', 'spa', 'spd', 'spe'];
const CRIT_CHANCE = [1 / 24, 1 / 8, 1 / 2, 1];

function statAt(base, level, isHP) {
  const v = Math.floor((2 * base + 31) * level / 100);
  return isHP ? v + level + 10 : v + 5;
}

export function makeMon(spec, { level = 50, hpMult = 1, boss = false } = {}) {
  const sp = typeof spec === 'string' ? SPECIES_BY_ID[spec] : spec;
  const [hp, atk, def, spa, spd, spe] = sp.base;
  const maxHp = Math.floor(statAt(hp, level, true) * hpMult);
  return {
    id: sp.id, name: sp.name, dex: sp.dex, anim: sp.anim, types: sp.types.slice(),
    level, maxHp, hp: maxHp, boss,
    stats: {
      atk: statAt(atk, level), def: statAt(def, level), spa: statAt(spa, level),
      spd: statAt(spd, level), spe: statAt(spe, level),
    },
    boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: sp.moves.map(id => ({ id, pp: MOVES[id].pp, maxpp: MOVES[id].pp })),
    status: null, sleepTurns: 0, toxic: 0, seededBy: null,
    mustRecharge: false, flinched: false, fainted: false,
  };
}

export function newBattle({ format = '1v1', sides, seed = 1 }) {
  return { format, sides, turn: 0, rng: makeRng(seed), seed, ended: false, winner: null };
}

// --- helpers -----------------------------------------------------------------
const monAt = (st, ref) => st.sides[ref.side].party[st.sides[ref.side].active[ref.slot]];

function effStat(mon, stat) {
  let s = mon.stats[stat];
  const stage = mon.boosts[stat];
  s = stage >= 0 ? Math.floor(s * (2 + stage) / 2) : Math.floor(s * 2 / (2 - stage));
  if (stat === 'spe' && mon.status === 'par') s = Math.floor(s * 0.5);
  return Math.max(1, s);
}

export function sideAliveCount(side) {
  return side.party.filter(m => !m.fainted).length;
}

// public: everything the UI needs to draw a mon
export function monView(mon) {
  return {
    id: mon.id, name: mon.name, dex: mon.dex, anim: mon.anim, types: mon.types,
    hp: mon.hp, maxHp: mon.maxHp, status: mon.status, level: mon.level,
    boosts: { ...mon.boosts }, fainted: mon.fainted,
    moves: mon.moves.map(m => ({ ...MOVES[m.id], id: m.id, pp: m.pp, maxpp: m.maxpp })),
  };
}

// --- damage ------------------------------------------------------------------
export function calcDamage(st, atkr, dfnd, move, { forceCrit = false } = {}) {
  const m = MOVES[move];
  const eff = effectiveness(m.type, dfnd.types);
  if (eff === 0) return { dmg: 0, eff: 0, crit: false };
  const physical = m.category === 'Physical';
  const A = effStat(atkr, physical ? 'atk' : 'spa');
  const D = effStat(dfnd, physical ? 'def' : 'spd');
  const critStage = Math.min(3, m.crit || 0);
  const crit = forceCrit || st.rng.chance(CRIT_CHANCE[critStage]);
  const lvlF = Math.floor(2 * atkr.level / 5) + 2;
  let d = Math.floor(Math.floor(lvlF * m.power * A / D) / 50) + 2;
  if (crit) d = Math.floor(d * 1.5);
  d = Math.floor(d * (85 + st.rng.int(16)) / 100);
  if (atkr.types.includes(m.type)) d = Math.floor(d * 1.5);       // STAB
  d = Math.floor(d * eff);
  if (physical && atkr.status === 'brn') d = Math.floor(d * 0.5);  // burn
  return { dmg: Math.max(1, d), eff, crit };
}

// rng-free damage estimate for the AI (uses an average roll, no crit)
export function estimateDamage(atkr, dfnd, moveId, roll = 0.925) {
  const m = MOVES[moveId];
  const eff = effectiveness(m.type, dfnd.types);
  if (!m.power || eff === 0) return { dmg: 0, eff };
  const physical = m.category === 'Physical';
  const A = effStat(atkr, physical ? 'atk' : 'spa');
  const D = effStat(dfnd, physical ? 'def' : 'spd');
  const lvlF = Math.floor(2 * atkr.level / 5) + 2;
  let d = Math.floor(Math.floor(lvlF * m.power * A / D) / 50) + 2;
  d = Math.floor(d * roll);
  if (atkr.types.includes(m.type)) d = Math.floor(d * 1.5);
  d = Math.floor(d * eff);
  if (physical && atkr.status === 'brn') d = Math.floor(d * 0.5);
  return { dmg: Math.max(1, d), eff };
}

// --- status ------------------------------------------------------------------
const STATUS_IMMUNE = {
  brn: t => t.includes('Fire'), par: t => t.includes('Electric'),
  frz: t => t.includes('Ice'), psn: t => t.includes('Poison') || t.includes('Steel'),
  tox: t => t.includes('Poison') || t.includes('Steel'),
};
function applyBoost(mon, stat, delta, ev, ref) {
  const before = mon.boosts[stat];
  mon.boosts[stat] = Math.max(-6, Math.min(6, before + delta));
  const real = mon.boosts[stat] - before;
  if (real !== 0) ev.push({ t: 'boost', ref, stat, delta: real, name: mon.name });
  return real;
}

// --- one actor performs one move --------------------------------------------
function performMove(st, action, ev) {
  const atkr = monAt(st, action.actor);
  if (atkr.fainted) return;

  // pre-move status gates
  if (atkr.flinched) { ev.push({ t: 'cant', ref: action.actor, reason: 'flinch', name: atkr.name }); return; }
  if (atkr.mustRecharge) { atkr.mustRecharge = false; ev.push({ t: 'cant', ref: action.actor, reason: 'recharge', name: atkr.name }); return; }
  if (atkr.status === 'frz') {
    if (st.rng.chance(0.2)) { atkr.status = null; ev.push({ t: 'text', msg: `${atkr.name} thawed out!` }); }
    else { ev.push({ t: 'cant', ref: action.actor, reason: 'frz', name: atkr.name }); return; }
  }
  if (atkr.status === 'slp') {
    if (atkr.sleepTurns > 0) atkr.sleepTurns--;
    if (atkr.sleepTurns <= 0 && atkr.status === 'slp') { atkr.status = null; ev.push({ t: 'text', msg: `${atkr.name} woke up!` }); }
    else { ev.push({ t: 'cant', ref: action.actor, reason: 'slp', name: atkr.name }); return; }
  }
  if (atkr.status === 'par' && st.rng.chance(0.25)) { ev.push({ t: 'cant', ref: action.actor, reason: 'par', name: atkr.name }); return; }

  const slot = atkr.moves[action.move];
  const m = MOVES[slot.id];
  if (slot.pp <= 0) { ev.push({ t: 'text', msg: `${atkr.name} has no PP left!` }); return; }
  slot.pp--;
  ev.push({ t: 'move', ref: action.actor, move: m.name, moveType: m.type, name: atkr.name });

  // resolve target (retarget if the intended target fainted)
  let target = action.target;
  if (m.power || m.category !== 'Status') {
    if (!target || monAt(st, target).fainted) target = findLiveOpponent(st, action.actor);
    if (!target) { ev.push({ t: 'text', msg: 'But there was no target...' }); return; }
  }

  // accuracy
  const hit = m.neverMiss || m.acc == null || (st.rng.next() * 100 < m.acc);
  if (!hit) { ev.push({ t: 'miss', ref: action.actor, name: atkr.name }); afterMoveSelf(st, atkr, m, action.actor, ev, 0); return; }

  // status move
  if (m.category === 'Status') { applyStatusMove(st, atkr, target && monAt(st, target), m, action, ev); return; }

  // damaging move
  const dfnd = monAt(st, target);
  const { dmg, eff, crit } = calcDamage(st, atkr, dfnd, slot.id);
  if (eff === 0) { ev.push({ t: 'immune', ref: target, name: dfnd.name }); afterMoveSelf(st, atkr, m, action.actor, ev, 0); return; }
  const dealt = Math.min(dfnd.hp, dmg);
  dfnd.hp -= dealt;
  if (m.type === 'Fire' && dfnd.status === 'frz') { dfnd.status = null; }
  ev.push({ t: 'damage', ref: target, amount: dealt, remainHp: dfnd.hp, maxHp: dfnd.maxHp, eff, crit, name: dfnd.name });
  checkFaint(dfnd, target, ev);

  // drain / recoil / self-drop
  if (m.drain && !atkr.fainted) heal(atkr, Math.max(1, Math.floor(dealt * m.drain)), action.actor, ev, 'drain');
  afterMoveSelf(st, atkr, m, action.actor, ev, dealt);

  // secondary effects only if target survived
  if (!dfnd.fainted) {
    if (m.status && st.rng.chance(m.chance ?? 1)) tryStatusOn(dfnd, target, m.status, st, ev);
    if (m.boosts && m.target === 'target' && st.rng.chance(m.boostChance ?? 1))
      for (const [s, d] of Object.entries(m.boosts)) applyBoost(dfnd, s, d, ev, target);
    if (m.flinch && st.rng.chance(m.flinch)) dfnd.flinched = true;
  }
  // self-boost secondaries (e.g. Meteor Mash)
  if (m.boosts && m.target === 'self' && !atkr.fainted && st.rng.chance(m.boostChance ?? 1))
    for (const [s, d] of Object.entries(m.boosts)) applyBoost(atkr, s, d, ev, action.actor);
}

function afterMoveSelf(st, atkr, m, ref, ev, dealt) {
  if (m.recoil && dealt > 0 && !atkr.fainted) {
    const r = Math.max(1, Math.floor(dealt * m.recoil));
    atkr.hp = Math.max(0, atkr.hp - r);
    ev.push({ t: 'residual', ref, kind: 'recoil', amount: r, remainHp: atkr.hp, name: atkr.name });
    checkFaint(atkr, ref, ev);
  }
  if (m.selfDrop && !atkr.fainted) {
    applyBoost(atkr, m.selfDrop.stat, -m.selfDrop.stage, ev, ref);
    if (m.selfDrop.stat2) applyBoost(atkr, m.selfDrop.stat2, -m.selfDrop.stage2, ev, ref);
  }
  if (m.recharge && dealt > 0) atkr.mustRecharge = true;
}

function tryStatusOn(mon, ref, status, st, ev) {
  if (mon.status || mon.fainted) return false;
  if (STATUS_IMMUNE[status] && STATUS_IMMUNE[status](mon.types)) return false;
  mon.status = status;
  if (status === 'slp') mon.sleepTurns = st.rng.range(1, 3);
  if (status === 'tox') mon.toxic = 1;
  ev.push({ t: 'status', ref, status, applied: true, name: mon.name });
  return true;
}

function applyStatusMove(st, atkr, targetMon, m, action, ev) {
  if (m.heal) { heal(atkr, Math.floor(atkr.maxHp * m.heal), action.actor, ev, 'heal'); return; }
  if (m.boosts && (m.target === 'self' || !m.target)) {
    for (const [s, d] of Object.entries(m.boosts)) applyBoost(atkr, s, d, ev, action.actor);
    return;
  }
  if (m.status && targetMon) {
    if (m.status === 'brn' && targetMon.types.includes('Fire')) { ev.push({ t: 'text', msg: `It doesn't affect ${targetMon.name}...` }); return; }
    if (!tryStatusOn(targetMon, action.target, m.status, st, ev)) ev.push({ t: 'text', msg: `It failed!` });
    return;
  }
  if (m.seed && targetMon) {
    if (targetMon.types.includes('Grass') || targetMon.seededBy) { ev.push({ t: 'text', msg: `It failed!` }); return; }
    targetMon.seededBy = { ...action.actor };
    ev.push({ t: 'text', msg: `${targetMon.name} was seeded!` });
    return;
  }
  ev.push({ t: 'text', msg: `But nothing happened.` });
}

function heal(mon, amount, ref, ev, kind) {
  const before = mon.hp;
  mon.hp = Math.min(mon.maxHp, mon.hp + amount);
  if (mon.hp !== before) ev.push({ t: 'heal', ref, amount: mon.hp - before, remainHp: mon.hp, maxHp: mon.maxHp, kind, name: mon.name });
}

function checkFaint(mon, ref, ev) {
  if (mon.hp <= 0 && !mon.fainted) { mon.hp = 0; mon.fainted = true; mon.seededBy = null; ev.push({ t: 'faint', ref, name: mon.name }); }
}

function findLiveOpponent(st, actorRef) {
  for (let s = 0; s < st.sides.length; s++) {
    if (s === actorRef.side) continue;
    const side = st.sides[s];
    for (let slot = 0; slot < side.active.length; slot++) {
      const mon = side.party[side.active[slot]];
      if (mon && !mon.fainted) return { side: s, slot };
    }
  }
  return null;
}

// --- turn resolution ---------------------------------------------------------
// actions: array of {actor:{side,slot}, type:'move'|'switch', move?, target?, to?}
export function resolveTurn(st, actions) {
  const ev = [];
  st.turn++;
  // clear per-turn flags
  for (const side of st.sides) for (const m of side.party) m.flinched = false;

  // 1) switches resolve first, fastest first
  const switches = actions.filter(a => a.type === 'switch');
  switches.sort((a, b) => effStat(monAt(st, b.actor), 'spe') - effStat(monAt(st, a.actor), 'spe'));
  for (const a of switches) doSwitch(st, a, ev);

  // 2) moves ordered by priority then effective speed then rng
  const moves = actions.filter(a => a.type === 'move').map(a => {
    const mon = monAt(st, a.actor);
    return { a, prio: MOVES[mon.moves[a.move].id].priority || 0, spe: effStat(mon, 'spe'), tb: st.rng.next() };
  });
  moves.sort((x, y) => y.prio - x.prio || y.spe - x.spe || y.tb - x.tb);
  for (const { a } of moves) {
    if (st.ended) break;
    if (monAt(st, a.actor).fainted) continue;
    performMove(st, a, ev);
    maybeEnd(st, ev);
  }

  // 3) residual damage (burn/poison/leech seed), fastest first
  if (!st.ended) endOfTurn(st, ev);
  maybeEnd(st, ev);
  return { events: ev, ended: st.ended, winner: st.winner };
}

function doSwitch(st, a, ev) {
  const side = st.sides[a.actor.side];
  const outMon = side.party[side.active[a.actor.slot]];
  if (side.party[a.to].fainted || side.active.includes(a.to)) return;
  ev.push({ t: 'switchout', ref: a.actor, name: outMon.name });
  // reset volatile on switch out
  outMon.boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  outMon.seededBy = null; outMon.mustRecharge = false;
  side.active[a.actor.slot] = a.to;
  const inMon = side.party[a.to];
  ev.push({ t: 'switchin', ref: a.actor, name: inMon.name, view: monView(inMon) });
}

// caller uses this for a forced replacement after a faint (1v1)
export function forcedSwitch(st, ref, partyIndex) {
  const ev = [];
  const side = st.sides[ref.side];
  side.active[ref.slot] = partyIndex;
  const inMon = side.party[partyIndex];
  ev.push({ t: 'switchin', ref, name: inMon.name, view: monView(inMon), forced: true });
  return ev;
}

function endOfTurn(st, ev) {
  const actives = [];
  st.sides.forEach((side, s) => side.active.forEach((pi, slot) => {
    const mon = side.party[pi];
    if (mon && !mon.fainted) actives.push({ mon, ref: { side: s, slot } });
  }));
  actives.sort((a, b) => effStat(b.mon, 'spe') - effStat(a.mon, 'spe'));
  for (const { mon, ref } of actives) {
    if (mon.fainted) continue;
    if (mon.status === 'brn') residual(mon, ref, Math.max(1, Math.floor(mon.maxHp / 16)), 'brn', ev);
    else if (mon.status === 'psn') residual(mon, ref, Math.max(1, Math.floor(mon.maxHp / 8)), 'psn', ev);
    else if (mon.status === 'tox') { residual(mon, ref, Math.max(1, Math.floor(mon.maxHp * mon.toxic / 16)), 'tox', ev); mon.toxic++; }
    if (mon.fainted) continue;
    if (mon.seededBy) {
      const seeder = monAt(st, mon.seededBy);
      const amt = Math.max(1, Math.floor(mon.maxHp / 8));
      residual(mon, ref, amt, 'seed', ev);
      if (seeder && !seeder.fainted) heal(seeder, amt, mon.seededBy, ev, 'drain');
    }
  }
}
function residual(mon, ref, amount, kind, ev) {
  const dealt = Math.min(mon.hp, amount);
  mon.hp -= dealt;
  ev.push({ t: 'residual', ref, kind, amount: dealt, remainHp: mon.hp, maxHp: mon.maxHp, name: mon.name });
  checkFaint(mon, ref, ev);
}

function maybeEnd(st, ev) {
  if (st.ended) return;
  const alive = st.sides.map(sideAliveCount);
  const dead = alive.map(a => a === 0);
  if (dead.some(d => d)) {
    st.ended = true;
    st.winner = dead[0] ? 1 : 0;
    ev.push({ t: 'end', winner: st.winner });
  }
}
