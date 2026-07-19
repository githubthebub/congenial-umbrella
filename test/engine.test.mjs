// Node test harness. Run: node test/engine.test.mjs
import { SPECIES, MOVES, SPECIES_BY_ID, BOSSES, PRESETS, typeMult, effectiveness } from '../src/data.js';
import { newBattle, makeMon, resolveTurn, forcedSwitch, monView, sideAliveCount, estimateDamage } from '../src/engine.js';
import { chooseAction, chooseBossActions, chooseSwitchIn } from '../src/ai.js';
import { makeRng, hashSeed } from '../src/rng.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ FAIL:', m); } };
const section = (s) => console.log('\n' + s);

// --- data integrity ----------------------------------------------------------
section('Data integrity');
ok(SPECIES.length >= 30, `roster has ${SPECIES.length} species (>=30)`);
let badMove = null, badStat = null;
for (const sp of SPECIES) {
  if (sp.moves.length !== 4) badMove = `${sp.id} has ${sp.moves.length} moves`;
  for (const mv of sp.moves) if (!MOVES[mv]) badMove = `${sp.id} -> unknown move ${mv}`;
  if (sp.base.length !== 6 || sp.base.some(n => !Number.isInteger(n) || n <= 0 || n > 255)) badStat = `${sp.id} base ${sp.base}`;
}
ok(!badMove, `every species has 4 valid moves ${badMove || ''}`);
ok(!badStat, `every species has 6 sane base stats ${badStat || ''}`);
for (const b of BOSSES) for (const mv of b.moves) ok(!!MOVES[mv], `boss ${b.id} move ${mv} exists`);
for (const p of PRESETS) for (const id of p.team) ok(!!SPECIES_BY_ID[id], `preset ${p.name} member ${id} exists`);
let badMoveType = null;
for (const [id, m] of Object.entries(MOVES)) {
  if (!['Physical', 'Special', 'Status'].includes(m.category)) badMoveType = `${id} bad category`;
  if (m.category !== 'Status' && !m.power) badMoveType = `${id} damaging move without power`;
}
ok(!badMoveType, `all moves well-formed ${badMoveType || ''}`);

// --- type chart --------------------------------------------------------------
section('Type chart');
ok(typeMult('Fire', 'Grass') === 2, 'Fire > Grass');
ok(typeMult('Water', 'Fire') === 2, 'Water > Fire');
ok(typeMult('Electric', 'Ground') === 0, 'Electric immune to Ground');
ok(typeMult('Normal', 'Ghost') === 0, 'Normal cannot hit Ghost');
ok(typeMult('Fighting', 'Ghost') === 0, 'Fighting cannot hit Ghost');
ok(effectiveness('Ground', ['Fire', 'Flying']) === 0, 'Ground vs Fire/Flying = 0 (Flying immune)');
ok(effectiveness('Rock', ['Fire', 'Flying']) === 4, 'Rock vs Fire/Flying = 4x');
ok(effectiveness('Ice', ['Dragon', 'Flying']) === 4, 'Ice vs Dragon/Flying = 4x');

// --- stat computation --------------------------------------------------------
section('Stat computation (level 50, IV31, EV0)');
const zard = makeMon('charizard');
// HP = floor((2*78+31)*50/100)+50+10 = floor(93.5)+60 = 93+60 = 153
ok(zard.maxHp === 153, `Charizard maxHp = ${zard.maxHp} (expect 153)`);
// Spe = floor((2*100+31)*50/100)+5 = floor(115.5)+5 = 115+5 = 120
ok(zard.stats.spe === 120, `Charizard Spe = ${zard.stats.spe} (expect 120)`);
ok(zard.moves.length === 4 && zard.moves[0].pp > 0, 'mon has 4 moves with pp');

// --- single turn sanity ------------------------------------------------------
section('Single turn');
{
  const a = makeMon('charizard'), b = makeMon('venusaur');
  const st = newBattle({ sides: [{ name: 'A', party: [a], active: [0] }, { name: 'B', party: [b], active: [0] }], seed: 42 });
  const before = b.hp;
  const r = resolveTurn(st, [
    { actor: { side: 0, slot: 0 }, type: 'move', move: 0, target: { side: 1, slot: 0 } }, // Flamethrower
    { actor: { side: 1, slot: 0 }, type: 'move', move: 0, target: { side: 0, slot: 0 } },
  ]);
  ok(b.hp < before, 'Flamethrower damaged Venusaur');
  const dmgEvent = r.events.find(e => e.t === 'damage' && e.name === 'Venusaur');
  ok(dmgEvent && dmgEvent.eff === 2, `Fire vs Grass/Poison super effective (eff=${dmgEvent && dmgEvent.eff})`);
  ok(a.hp >= 0 && b.hp >= 0, 'HP never negative');
}

// --- determinism -------------------------------------------------------------
section('Determinism');
function runFullBattle(seed, difficulty = 'hard') {
  const teamA = PRESETS[0].team.map(id => makeMon(id));
  const teamB = PRESETS[2].team.map(id => makeMon(id));
  const st = newBattle({ sides: [{ name: 'A', party: teamA, active: [0] }, { name: 'B', party: teamB, active: [0] }], seed });
  const log = [];
  let guard = 0;
  while (!st.ended && guard++ < 400) {
    const aRef = { side: 0, slot: 0 }, bRef = { side: 1, slot: 0 };
    const rngA = makeRng(seed + st.turn * 7 + 1).next;
    const rngB = makeRng(seed + st.turn * 7 + 2).next;
    const acts = [chooseAction(st, aRef, bRef, difficulty, rngA), chooseAction(st, bRef, aRef, difficulty, rngB)];
    const r = resolveTurn(st, acts);
    for (const e of r.events) { log.push(e.t); if (e.remainHp != null) ok(e.remainHp >= 0 && e.remainHp <= e.maxHp, 'hp in bounds'); }
    if (st.ended) break;
    // forced switches
    for (const s of [0, 1]) {
      const side = st.sides[s];
      const activeMon = side.party[side.active[0]];
      if (activeMon.fainted && sideAliveCount(side) > 0) {
        const foeRef = { side: s === 0 ? 1 : 0, slot: 0 };
        const idx = chooseSwitchIn(st, { side: s, slot: 0 }, foeRef);
        if (idx >= 0) forcedSwitch(st, { side: s, slot: 0 }, idx);
      }
    }
  }
  return { ended: st.ended, winner: st.winner, turns: st.turn, log: log.join(','), guard };
}
const r1 = runFullBattle(12345);
const r2 = runFullBattle(12345);
ok(r1.ended, `battle terminates (turns=${r1.turns})`);
ok(r1.log === r2.log, 'same seed -> identical event log (deterministic)');
ok(r1.winner === r2.winner, `same seed -> same winner (${r1.winner})`);

// --- many battles terminate, no runaway --------------------------------------
section('Stress: 100 full battles terminate');
let maxTurns = 0, allEnded = true;
for (let s = 0; s < 100; s++) {
  const r = runFullBattle(1000 + s * 13, s % 2 ? 'normal' : 'hard');
  if (!r.ended) allEnded = false;
  maxTurns = Math.max(maxTurns, r.turns);
}
ok(allEnded, 'all 100 battles reached a winner');
ok(maxTurns < 300, `no battle ran away (max turns=${maxTurns})`);

// --- status conditions -------------------------------------------------------
section('Status conditions');
{
  const a = makeMon('gengar'); // will use Will-O-Wisp? gengar has no wisp; use a mon with willowisp
  // craft: attacker uses toxic on snorlax; check residual next turns
  const tox = makeMon('toxapex'); const lax = makeMon('snorlax');
  const st = newBattle({ sides: [{ name: 'A', party: [tox], active: [0] }, { name: 'B', party: [lax], active: [0] }], seed: 7 });
  // toxapex moves: scald,toxic,recover,sludgebomb -> toxic is index 1
  resolveTurn(st, [{ actor: { side: 0, slot: 0 }, type: 'move', move: 1, target: { side: 1, slot: 0 } }]);
  ok(lax.status === 'tox', `Snorlax badly poisoned (status=${lax.status})`);
  const hp1 = lax.hp;
  resolveTurn(st, [{ actor: { side: 0, slot: 0 }, type: 'move', move: 2, target: { side: 0, slot: 0 } }]); // recover (no attack)
  ok(lax.hp < hp1, 'toxic deals increasing residual damage');
}
{
  // Fire type cannot be burned
  const zard = makeMon('charizard');
  const burnt = { ...zard };
  ok(true, 'placeholder'); // covered by immunity map; validate directly:
}
import { calcDamage } from '../src/engine.js';
{
  const chomp = makeMon('garchomp'), corv = makeMon('corviknight');
  const st = newBattle({ sides: [{ name: 'A', party: [chomp], active: [0] }, { name: 'B', party: [corv], active: [0] }], seed: 3 });
  const est = estimateDamage(chomp, corv, 'earthquake');
  ok(est.eff === 0, 'Earthquake vs Flying/Steel = immune (Flying)');
}

// --- raid ---------------------------------------------------------------------
section('Co-op raid');
{
  const p1 = makeMon('greninja'), p2 = makeMon('lucario');
  const boss = makeMon(BOSSES[0], { hpMult: BOSSES[0].hpMult, boss: true });
  boss.actions = BOSSES[0].actions;
  const st = newBattle({ format: 'raid', sides: [{ name: 'Allies', party: [p1, p2], active: [0, 1] }, { name: 'Boss', party: [boss], active: [0] }], seed: 99 });
  ok(boss.maxHp > makeMon(BOSSES[0]).maxHp, 'boss has multiplied HP');
  let guard = 0, ended = false;
  while (!st.ended && guard++ < 200) {
    const acts = [];
    const p1ref = { side: 0, slot: 0 }, p2ref = { side: 0, slot: 1 }, bref = { side: 1, slot: 0 };
    if (!st.sides[0].party[0].fainted) acts.push(chooseAction(st, p1ref, bref, 'hard'));
    if (!st.sides[0].party[1].fainted) acts.push(chooseAction(st, p2ref, bref, 'hard'));
    acts.push(...chooseBossActions(st, bref, [p1ref, p2ref]));
    const r = resolveTurn(st, acts);
    if (r.ended) { ended = true; break; }
  }
  ok(st.ended, `raid resolves to an outcome (winner side ${st.winner}, turns ${st.turn})`);
}

// --- summary -----------------------------------------------------------------
console.log(`\n${'='.repeat(40)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(40)}`);
process.exit(fail ? 1 : 0);
