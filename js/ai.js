/* ============================================================================
 * ai.js — Battle AI / decision engine.
 *
 * Not a neural net — a competitive-heuristic engine that plays like a strong
 * ladder player: it damage-calcs every option, models what YOU are likely to
 * do (prediction), values long-term position (switching, hazards, setup), and
 * times Terastallization around KO math. Personas tune the weights so each
 * opponent "feels" different. This is the code making decisions when you
 * battle Claude.
 * ==========================================================================*/
(function () {
  const G = (typeof window !== 'undefined') ? window : globalThis;
  const POKE = G.POKE = G.POKE || {};
  const D = POKE.data;
  const MOVES = D.MOVES;

  const DEFAULT = { depth: 2, greedy: 0.5, predict: 0.6, switchiness: 0.5, riskTaking: 0.5, tera: 'value' };

  /* ---- Read-only helpers ------------------------------------------------ */
  function activeOf(b, s) { return b.active(s); }
  function foeOf(s) { return s === 0 ? 1 : 0; }

  // Temporarily treat bench mon `idx` as active for side `s` while running fn.
  function withActive(b, s, idx, fn) {
    const side = b.sides[s], old = side.active;
    side.active = idx;
    try { return fn(); } finally { side.active = old; }
  }

  // Best damaging move for the active mon of `atkSide` vs the active foe.
  function bestMove(b, atkSide) {
    const atk = b.active(atkSide), def = b.active(foeOf(atkSide));
    let best = { damage: 0, frac: 0, kos: false, id: null, priority: 0, eff: 1 };
    if (!atk || atk.fainted || !def) return best;
    for (const mv of atk.moves) {
      const md = MOVES[mv.id];
      if (!md || md.category === 'Status' || mv.pp <= 0) continue;
      if (atk.choiceLock && mv.id !== atk.choiceLock) continue;
      let res;
      try { res = b.calcDamage(atkSide, mv.id, { avg: true, crit: false }); } catch (e) { continue; }
      const kos = res.damage >= def.hp;
      // Prefer a guaranteed KO; otherwise prefer raw damage.
      const better = (kos && !best.kos) || (kos === best.kos && res.damage > best.damage);
      if (better) best = { damage: res.damage, frac: Math.min(1, def.hp > 0 ? res.damage / def.hp : 0), kos, id: mv.id, priority: md.priority || 0, eff: res.eff };
    }
    return best;
  }

  function effSpeed(b, s) { return b.effSpeed(b.active(s)); }

  // Which side acts first given each side's chosen move id (priority then speed).
  function movesFirst(b, sA, moveA, sB, moveB) {
    const pa = (MOVES[moveA] && MOVES[moveA].priority) || 0;
    const pb = (MOVES[moveB] && MOVES[moveB].priority) || 0;
    if (pa !== pb) return pa > pb ? sA : sB;
    const va = effSpeed(b, sA), vb = effSpeed(b, sB);
    return va >= vb ? sA : sB;
  }

  // Expected entry-hazard damage fraction for bench mon `idx` switching into side `s`.
  function hazardCost(b, s, idx) {
    const mon = b.sides[s].team[idx];
    if (mon.item === 'Heavy-Duty Boots' && mon.itemActive) return 0;
    const h = b.sides[s].hazards;
    const types = mon.teraActive ? [mon.teraType] : mon.types;
    let frac = 0;
    if (h.sr) frac += 0.125 * D.effectiveness('Rock', types);
    const grounded = !(types.includes('Flying') || mon.ability === 'Levitate' || (mon.item === 'Air Balloon' && mon.itemActive));
    if (grounded && h.spikes) frac += [0, 1 / 8, 1 / 6, 1 / 4][h.spikes];
    return frac;
  }

  function hpFrac(mon) { return mon.hp / mon.maxhp; }
  function aliveCount(b, s) { return b.sides[s].team.filter((m) => !m.fainted).length; }
  function boostSum(mon) { return mon.boosts.atk + mon.boosts.spa + mon.boosts.spe + Math.max(0, mon.boosts.def) + Math.max(0, mon.boosts.spd); }

  /* ---- Matchup score: how good is `mySide` active vs the current foe? ---- */
  function matchup(b, mySide) {
    const foeSide = foeOf(mySide);
    const me = b.active(mySide), foe = b.active(foeSide);
    if (!me || me.fainted) return -999;
    const mine = bestMove(b, mySide);
    const theirs = bestMove(b, foeSide);
    const iFaster = movesFirst(b, mySide, mine.id, foeSide, theirs.id) === mySide;
    let sc = 0;
    // Offense: can I KO / how hard do I hit.
    if (mine.kos) sc += iFaster ? 70 : 45;
    else sc += mine.frac * 45;
    // Defense: how hard do they hit me.
    if (theirs.kos) sc -= iFaster ? 40 : 75;
    else sc -= theirs.frac * 45;
    // Speed control matters.
    sc += iFaster ? 8 : -4;
    // HP cushion.
    sc += (hpFrac(me) - hpFrac(foe)) * 12;
    return sc;
  }

  // Best switch option for `mySide` vs the current foe: {idx, score}.
  function bestSwitch(b, mySide) {
    const switches = b.legalSwitches(mySide);
    let best = { idx: null, score: -Infinity };
    for (const idx of switches) {
      const raw = withActive(b, mySide, idx, () => matchup(b, mySide));
      const cost = hazardCost(b, mySide, idx) * 40;
      const score = raw - cost;
      if (score > best.score) best = { idx, score, raw };
    }
    return best;
  }

  /* ---- Opponent model: what is the foe likely to do this turn? ---------- */
  function predictFoe(b, foeSide) {
    const mySide = foeOf(foeSide);
    const foe = b.active(foeSide), me = b.active(mySide);
    const myBest = bestMove(b, mySide);       // my threat on the foe
    const foeBest = bestMove(b, foeSide);      // foe's threat on me
    const iFaster = movesFirst(b, mySide, myBest.id, foeSide, foeBest.id) === mySide;
    // Only predict a switch when the foe is in a genuinely hopeless spot: about
    // to be KO'd, moving second, and holding a switch that clearly rescues it.
    // (Over-predicting switches makes the AI chase tempo that isn't there.)
    if (myBest.kos && iFaster && foeBest.frac < 0.55) {
      const sw = bestSwitch(b, foeSide);
      if (sw.idx != null && sw.score > matchup(b, foeSide) + 25) return { kind: 'switch', target: sw.idx };
    }
    // If the foe can't meaningfully damage me but has setup, it may set up — approximate as attack.
    return { kind: 'attack', move: foeBest.id };
  }

  /* ---- Tera decision ---------------------------------------------------- */
  function shouldTera(b, mySide, moveId, cfg) {
    const s = b.sides[mySide];
    if (s.teraUsed) return false;
    const me = b.active(mySide), foeSide = foeOf(mySide), foe = b.active(foeSide);
    if (!me.teraType) return false;

    const baseMine = bestMove(b, mySide);
    const baseTheirs = bestMove(b, foeSide);
    // Simulate tera on: temporarily flip typing.
    me.teraActive = true;
    const teraMine = bestMove(b, mySide);
    const teraTheirs = bestMove(b, foeSide);
    me.teraActive = false;

    // Offensive win: tera turns a non-KO into a KO.
    const offense = teraMine.kos && !baseMine.kos;
    // Defensive win: tera turns a foe KO into a non-KO, or big damage drop.
    const defense = (baseTheirs.kos && !teraTheirs.kos) || (baseTheirs.frac - teraTheirs.frac > 0.3);
    if (cfg.tera === 'aggro') return offense || (baseMine.frac < teraMine.frac - 0.15);
    if (cfg.tera === 'late') return (offense && aliveCount(b, foeSide) <= 2) || defense;
    // 'value': tera when it clearly swings the KO math either way.
    return offense || defense;
  }

  /* ---- Score a single move choice --------------------------------------- */
  function scoreMove(b, mySide, mv, cfg, facts) {
    const md = MOVES[mv.id];
    const me = b.active(mySide), foeSide = foeOf(mySide), foe = b.active(foeSide);
    const { myBest, foeBest, iFaster, foePred } = facts;
    let score = 0;

    if (md.category !== 'Status') {
      let res;
      try { res = b.calcDamage(mySide, mv.id, { avg: true, crit: false }); } catch (e) { res = { damage: 0, eff: 1 }; }
      const kos = res.damage >= foe.hp;
      const frac = foe.hp > 0 ? Math.min(1, res.damage / foe.hp) : 0;
      if (kos) score += (iFaster || (md.priority || 0) > 0) ? 105 : 60;
      else score += frac * 62;
      score += res.eff > 1 ? 6 : (res.eff < 1 ? -4 : 0);
      // Priority is gold when I'm slower and the foe is in KO range.
      if ((md.priority || 0) > 0 && !iFaster && frac > 0.35) score += 18;
      // Secondary upside.
      if (md.secondary) {
        const c = md.secondary.chance / 100;
        if (md.secondary.status) score += c * 10;
        if (md.secondary.flinch && iFaster) score += c * 14;
        if (md.secondary.boosts && md.secondary.target === 'self') score += c * 8;
        if (md.secondary.boosts && md.secondary.target === 'foe') score += c * 6;
      }
      // Pivot moves: value momentum via the best incoming matchup.
      if (md.switchOut) {
        const sw = bestSwitch(b, mySide);
        score += 6 + (sw.idx != null ? Math.max(0, sw.raw) * 0.18 : 0);
        if (foePred.kind === 'switch') score += 8 * cfg.predict; // grab momentum on a predicted switch
      }
      // Self-lowering moves are slightly costly (Draco/CC/Overheat).
      if (md.selfDrop) score -= 5;
      // Conditional priority (Sucker Punch / Thunderclap) fails if the foe does
      // not attack. Value comes from the priority bonus above; here we only
      // punish it when we expect the foe to switch or status (it would whiff).
      if (md.condition === 'sucker' && foePred.kind !== 'attack') score -= 60 * cfg.predict;
      // Choice-locking into a resisted move is bad.
      if ((me.item === 'Choice Band' || me.item === 'Choice Specs' || me.item === 'Choice Scarf') && me.itemActive && res.eff === 0) score -= 40;
    } else {
      score += scoreStatusMove(b, mySide, mv, cfg, facts);
    }
    // Greedy personas weight raw damage; patient ones weight position.
    if (md.category !== 'Status') score *= (0.75 + cfg.greedy * 0.6);
    return score;
  }

  function scoreStatusMove(b, mySide, mv, cfg, facts) {
    const md = MOVES[mv.id];
    const me = b.active(mySide), foeSide = foeOf(mySide), foe = b.active(foeSide);
    const { myBest, foeBest, iFaster, foePred } = facts;
    const safe = !foeBest.kos && (iFaster || foeBest.frac < 0.35);
    const predSwitch = foePred.kind === 'switch';

    // Setup (offensive boosts). Only set up when it is actually safe — never on
    // a mere prediction, which is how greedy opponents punish you.
    if (md.selfBoost && (md.selfBoost.atk || md.selfBoost.spa || md.selfBoost.spe)) {
      if (!safe) return -20;
      const saturation = Math.min(1, boostSum(me) / 4);
      let v = 52 * (1 - saturation) + (predSwitch ? 8 : 0);
      if (aliveCount(b, mySide) >= 2 && hpFrac(me) > 0.6) v += 6;
      return v * (1 + cfg.riskTaking * 0.3);
    }
    // Defensive boosts (Iron Defense / Calm Mind's def side).
    if (md.selfBoost && (md.selfBoost.def || md.selfBoost.spd) && !md.selfBoost.atk && !md.selfBoost.spa) {
      return safe ? 30 : -10;
    }
    // Recovery.
    if (md.heal) {
      if (foeBest.kos && !iFaster) return -15;
      return (1 - hpFrac(me)) * 68 + (safe ? 6 : -8);
    }
    // Hazards.
    if (md.hazard) {
      const h = b.sides[foeSide].hazards;
      const already = (md.hazard === 'sr' && h.sr) || (md.hazard === 'spikes' && h.spikes >= 3) || (md.hazard === 'tspikes' && h.tspikes >= 2);
      if (already) return -50;
      const foeTeam = aliveCount(b, foeSide);
      let v = (md.hazard === 'sr' ? 48 : 34) * (foeTeam >= 3 ? 1 : 0.5);
      if (predSwitch) v += 6 * cfg.predict;
      if (!safe) v -= 25;
      return v;
    }
    // Status infliction (Thunder Wave / Will-O-Wisp).
    if (md.status && md.statusTarget === 'foe') {
      if (foe.status) return -30;
      if (b.isImmuneToStatus(foe, md.status)) return -40;
      let v = 30;
      if (md.status === 'par' && !iFaster) v += 18;      // slow a faster threat
      if (md.status === 'brn' && foeBest.id && MOVES[foeBest.id] && MOVES[foeBest.id].category === 'Physical') v += 16;
      if (!safe) v -= 12;
      return v;
    }
    // Phazing (Whirlwind / Roar).
    if (md.forceSwitch) {
      if (boostSum(foe) >= 2) return 55;
      const anyHazard = Object.values(b.sides[foeSide].hazards).some((x) => x > 0);
      return anyHazard ? 20 : 4;
    }
    // Protect.
    if (md.volatile === 'protect') {
      let v = 6;
      if (me.status === 'tox' || me.status === 'brn') v -= 6;
      if (me.item === 'Leftovers') v += 4;
      return v;
    }
    return 5;
  }

  /* ---- Score a switch --------------------------------------------------- */
  function scoreSwitch(b, mySide, idx, cfg, facts) {
    const { myBest, foeBest, iFaster } = facts;
    const raw = withActive(b, mySide, idx, () => matchup(b, mySide));
    const cost = hazardCost(b, mySide, idx) * 42;
    // Giving the foe a free hit on entry.
    const entryHit = foeBest.frac * 26;
    let score = raw - cost - entryHit;
    // Bias: only really want to switch when the current matchup is losing.
    const staying = matchup(b, mySide);
    const losing = foeBest.kos && !myBest.kos;
    if (losing) score += 22;                       // dodge the KO
    if (!losing && staying > 20) score -= 30;      // don't switch out of a good spot
    score *= (0.6 + cfg.switchiness * 0.8);
    return score;
  }

  /* ---- Top-level: choose an action -------------------------------------- */
  function chooseAction(b, side, cfg) {
    cfg = Object.assign({}, DEFAULT, cfg || {});
    try {
      const req = b.requestFor(side);
      if (req.kind !== 'move') return { type: 'switch', target: chooseSwitch(b, side, cfg, req.kind) };

      const foeSide = foeOf(side);
      const myBest = bestMove(b, side);
      const foeBest = bestMove(b, foeSide);
      const iFaster = movesFirst(b, side, myBest.id, foeSide, foeBest.id) === side;
      const foePred = cfg.predict > 0.05 ? predictFoe(b, foeSide) : { kind: 'attack', move: foeBest.id };
      const facts = { myBest, foeBest, iFaster, foePred };

      const candidates = [];
      for (const mv of req.moves) {
        if (mv.disabled || mv.pp <= 0) continue;
        candidates.push({ kind: 'move', mv, score: scoreMove(b, side, mv, cfg, facts) });
      }
      if (!req.trapped) {
        for (const idx of req.switches) {
          candidates.push({ kind: 'switch', idx, score: scoreSwitch(b, side, idx, cfg, facts) });
        }
      }
      if (!candidates.length) {
        // Fallback: first usable move or first switch.
        if (req.moves.length) return { type: 'move', move: req.moves[0].id };
        return { type: 'switch', target: req.switches[0] };
      }
      candidates.sort((x, y) => y.score - x.score);
      const pick = candidates[0];

      if (pick.kind === 'switch') return { type: 'switch', target: pick.idx };
      const tera = req.canTera && shouldTera(b, side, pick.mv.id, cfg);
      return { type: 'move', move: pick.mv.id, tera };
    } catch (e) {
      // Never crash the game loop — fall back to a safe move.
      const req = b.requestFor(side);
      if (req.kind === 'move') {
        const usable = req.moves.filter((m) => !m.disabled && m.pp > 0);
        if (usable.length) return { type: 'move', move: usable[0].id };
      }
      const sw = b.legalSwitches(side);
      return sw.length ? { type: 'switch', target: sw[0] } : { type: 'move', move: req.moves[0].id };
    }
  }

  /* ---- Choose a switch target (forced replacement or pivot) ------------- */
  function chooseSwitch(b, side, cfg, reason) {
    cfg = Object.assign({}, DEFAULT, cfg || {});
    try {
      const switches = b.legalSwitches(side);
      if (!switches.length) return null;
      let best = { idx: switches[0], score: -Infinity };
      for (const idx of switches) {
        const raw = withActive(b, side, idx, () => matchup(b, side));
        const cost = hazardCost(b, side, idx) * 42;
        const score = raw - cost;
        if (score > best.score) best = { idx, score };
      }
      return best.idx;
    } catch (e) {
      const sw = b.legalSwitches(side);
      return sw.length ? sw[0] : null;
    }
  }

  /* ---- Lead selection at team preview ----------------------------------- */
  function chooseLead(b, side, cfg) {
    const team = b.sides[side].team;
    let best = 0, bestScore = -Infinity;
    for (let i = 0; i < team.length; i++) {
      const set = team[i].set;
      let s = 0;
      // Prefer hazard setters and fast, safe pivots as leads.
      if (set.moves.includes('Stealth Rock')) s += 30;
      if (set.moves.some((m) => MOVES[m] && MOVES[m].switchOut)) s += 12;
      s += team[i].stats.spe * 0.05;
      if (set.ability === 'Drizzle' || set.ability === 'Drought' || set.ability === 'Sand Stream') s += 20;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
  }

  POKE.ai = { chooseAction, chooseSwitch, chooseLead, bestMove, matchup, predictFoe, DEFAULT };
  if (typeof module !== 'undefined' && module.exports) module.exports = POKE;
})();
