// ai.js — opponent + raid-boss decision making. Uses the engine's rng-free
// damage estimate so it plays type-aware, KO-hungry battles without cheating
// on the RNG. Three tiers so first-timers aren't crushed and veterans aren't bored.
import { MOVES, effectiveness } from './data.js';
import { estimateDamage } from './engine.js';

// Score a single move for `me` attacking `foe`.
function scoreMove(me, foe, moveId) {
  const m = MOVES[moveId];
  if (m.category === 'Status') {
    // setup/heal/status — situational value, kept below a strong attack
    if (m.heal) return me.hp < me.maxHp * 0.5 ? 55 : 8;
    if (m.status) return foe.status ? 2 : 22;
    if (m.boosts) {
      const totalStages = Object.values(m.boosts).reduce((a, b) => a + b, 0);
      return me.hp > me.maxHp * 0.7 ? 18 + totalStages * 6 : 6;
    }
    return 5;
  }
  const { dmg, eff } = estimateDamage(me, foe, moveId);
  let score = (dmg / foe.maxHp) * 100 * ((m.acc ?? 100) / 100);
  if (dmg >= foe.hp) score += 60;            // can KO this turn
  if (eff > 1) score += 8;
  if (m.priority && dmg >= foe.hp) score += 20; // priority KO
  return score;
}

function legalMoves(mon) {
  return mon.moves.map((slot, i) => ({ i, id: slot.id, pp: slot.pp })).filter(s => s.pp > 0);
}

// Choose an action for one AI-controlled actor.
export function chooseAction(state, actorRef, foeRef, difficulty = 'normal', rand = Math.random) {
  const me = state.sides[actorRef.side].party[state.sides[actorRef.side].active[actorRef.slot]];
  const foe = state.sides[foeRef.side].party[state.sides[foeRef.side].active[foeRef.slot]];
  const options = legalMoves(me);
  if (!options.length) return { actor: actorRef, type: 'move', move: 0, target: foeRef };

  const scored = options.map(o => ({ ...o, score: scoreMove(me, foe, o.id) }));
  scored.sort((a, b) => b.score - a.score);

  let pick;
  if (difficulty === 'easy') pick = scored[Math.floor(rand() * scored.length)];
  else if (difficulty === 'normal') pick = rand() < 0.82 ? scored[0] : scored[Math.min(1, scored.length - 1)];
  else pick = scored[0]; // hard: always optimal
  return { actor: actorRef, type: 'move', move: pick.i, target: foeRef };
}

// Raid boss: acts `boss.actions` times, spreading pressure across live allies.
export function chooseBossActions(state, bossRef, allyRefs, rand = Math.random) {
  const boss = state.sides[bossRef.side].party[state.sides[bossRef.side].active[bossRef.slot]];
  const live = allyRefs.filter(r => {
    const m = state.sides[r.side].party[state.sides[r.side].active[r.slot]];
    return m && !m.fainted;
  });
  if (!live.length) return [];
  const acts = [];
  const n = boss.actions || 1;
  for (let k = 0; k < n; k++) {
    // target the ally the boss can hurt most (spread if two live)
    const target = live[k % live.length];
    const foe = state.sides[target.side].party[state.sides[target.side].active[target.slot]];
    const options = legalMoves(boss);
    const scored = options.map(o => ({ ...o, score: scoreMove(boss, foe, o.id) })).sort((a, b) => b.score - a.score);
    const pick = scored[0] || { i: 0 };
    acts.push({ actor: bossRef, type: 'move', move: pick.i, target });
  }
  return acts;
}

// Which benched mon should the AI send in after a faint (1v1)?
export function chooseSwitchIn(state, sideRef, foeRef) {
  const side = state.sides[sideRef.side];
  const foe = state.sides[foeRef.side].party[state.sides[foeRef.side].active[foeRef.slot]];
  let best = -1, bestScore = -Infinity;
  side.party.forEach((mon, idx) => {
    if (mon.fainted || side.active.includes(idx)) return;
    // prefer a mon that resists the foe's STAB and threatens back
    let score = 0;
    for (const t of foe.types) score -= (effectiveness(t, mon.types) - 1) * 20;
    const bestHit = Math.max(...mon.moves.map(m => estimateDamage(mon, foe, m.id).dmg / foe.maxHp));
    score += bestHit * 40;
    if (score > bestScore) { bestScore = score; best = idx; }
  });
  return best;
}
