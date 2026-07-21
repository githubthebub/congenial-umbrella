/* ============================================================================
 * engine.js — Gen 9 OU singles battle engine.
 *
 * Faithful-enough implementation of the mechanics that matter for OU singles:
 * the real damage formula, stat stages, priority/speed ordering, status,
 * weather, entry hazards, common items & abilities, Terastallization, and
 * mid-turn faint/pivot replacements (via a resumable generator).
 * ==========================================================================*/
(function () {
  const G = (typeof window !== 'undefined') ? window : globalThis;
  const POKE = G.POKE = G.POKE || {};
  const D = POKE.data;

  /* ---- Seedable RNG (mulberry32) ---------------------------------------- */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const boostMul = (s) => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
  const accMul = (s) => s >= 0 ? (3 + s) / 3 : 3 / (3 - s);

  /* ---- Stat calculation ------------------------------------------------- */
  function calcStat(base, ev, iv, level, nat) {
    return Math.floor((Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5) * nat);
  }
  function calcHP(base, ev, iv, level) {
    return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10;
  }

  function makePokemon(set) {
    const species = D.DEX[set.species];
    if (!species) throw new Error('Unknown species: ' + set.species);
    const level = 100;
    const nat = D.NATURES[set.nature] || [null, null];
    const boostKey = nat[0], dropKey = nat[1];
    const natMul = (k) => k === boostKey ? 1.1 : (k === dropKey ? 0.9 : 1.0);

    // Physical attacker? If no physical damaging move, drop Atk IV to 0.
    const moveObjs = set.moves.map((m) => Object.assign({ id: m }, D.MOVES[m]));
    const hasPhysical = moveObjs.some((m) => m.category === 'Physical');
    const atkIV = hasPhysical ? 31 : 0;

    const b = species.stats, ev = set.evs;
    const stats = {
      hp: calcHP(b.hp, ev.hp, 31, level),
      atk: calcStat(b.atk, ev.atk, atkIV, level, natMul('atk')),
      def: calcStat(b.def, ev.def, 31, level, natMul('def')),
      spa: calcStat(b.spa, ev.spa, 31, level, natMul('spa')),
      spd: calcStat(b.spd, ev.spd, 31, level, natMul('spd')),
      spe: calcStat(b.spe, ev.spe, 31, level, natMul('spe')),
    };

    return {
      set, species: set.species, types: species.types.slice(), baseTypes: species.stats ? species.types.slice() : [],
      level, stats, maxhp: stats.hp, hp: stats.hp,
      boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 },
      status: '', sleepTurns: 0, toxicN: 0,
      item: set.item, itemActive: !!set.item, ability: set.ability,
      moves: moveObjs.map((m) => ({ id: m.id, pp: m.pp, maxpp: m.pp, disabled: false })),
      fainted: false,
      volatiles: {},          // protect, leechseed, confusion, flinch, charge, sub
      teraType: set.tera, teraActive: false,
      boostedStat: null,      // Protosynthesis / Quark Drive / Booster Energy
      choiceLock: null,
      hasSwitched: false,
    };
  }

  /* ---- Battle ----------------------------------------------------------- */
  function Battle(team1, team2, opts) {
    opts = opts || {};
    this.rng = makeRng(opts.seed != null ? opts.seed : 12345);
    this.sides = [team1, team2].map((team, i) => ({
      idx: i, name: (opts.names && opts.names[i]) || (i === 0 ? 'Player' : 'Opponent'),
      team: team.map(makePokemon), active: 0, teraUsed: false,
      hazards: { sr: 0, spikes: 0, tspikes: 0, web: 0 },
      lastMove: null,
    }));
    this.field = { weather: '', weatherTurns: 0 };
    this.turn = 0;
    this.winner = null; // null | 0 | 1 | 'tie'
    this.log = [];
    this._onLog = opts.log || null;
    this.started = false;
  }

  Battle.prototype.emit = function (text, type) {
    const e = { text, type: type || 'text', turn: this.turn };
    this.log.push(e);
    if (this._onLog) this._onLog(e);
  };

  Battle.prototype.active = function (s) { return this.sides[s].team[this.sides[s].active]; };
  Battle.prototype.foeSide = function (s) { return s === 0 ? 1 : 0; };
  Battle.prototype.move = function (id) { return D.MOVES[id]; };

  /* ---- Typing / effectiveness ------------------------------------------- */
  Battle.prototype.currentTypes = function (mon) {
    if (mon.teraActive) return [mon.teraType];
    return mon.types;
  };
  Battle.prototype.isGrounded = function (mon) {
    if (mon.item === 'Air Balloon' && mon.itemActive) return false;
    if (mon.ability === 'Levitate') return false;
    return !this.currentTypes(mon).includes('Flying');
  };

  /* ---- Start / leads ---------------------------------------------------- */
  Battle.prototype.setLead = function (side, idx) { this.sides[side].active = idx; };

  Battle.prototype.start = function () {
    this.started = true;
    this.turn = 1;
    this.emit('Battle start! ' + this.sides[0].name + ' vs ' + this.sides[1].name + '.', 'system');
    // Switch-in effects for both leads (faster first, cosmetic).
    const order = this.speedOrder(0, 1);
    for (const s of order) this.onSwitchIn(s, this.sides[s].active, true);
  };

  /* ---- Switch-in effects (abilities, hazards) --------------------------- */
  Battle.prototype.onSwitchIn = function (side, idx, isLead) {
    const s = this.sides[side];
    s.active = idx;
    const mon = s.team[idx];
    mon.hasSwitched = true;
    // Hazards (Heavy-Duty Boots negate).
    if (!(mon.item === 'Heavy-Duty Boots' && mon.itemActive)) this.applyHazards(side);
    if (mon.fainted) return;
    // Weather-setting abilities.
    const w = { 'Drought': 'sun', 'Drizzle': 'rain', 'Sand Stream': 'sand', 'Snow Warning': 'snow' }[mon.ability];
    if (w && this.field.weather !== w) {
      const rockItem = { sun: 'Heat Rock', rain: 'Damp Rock', sand: 'Smooth Rock', snow: 'Icy Rock' }[w];
      this.field.weather = w; this.field.weatherTurns = (mon.item === rockItem) ? 8 : 5;
      this.emit(this.weatherStartMsg(w), 'weather');
    }
    // Intimidate.
    if (mon.ability === 'Intimidate') {
      const foe = this.active(this.foeSide(side));
      if (foe && !foe.fainted) this.applyBoost(this.foeSide(side), { atk: -1 }, 'Intimidate');
    }
    // Dauntless Shield.
    if (mon.ability === 'Dauntless Shield') this.applyBoost(side, { def: 1 }, 'Dauntless Shield');
    // Protosynthesis / Quark Drive / Booster Energy.
    this.checkParadox(side);
  };

  Battle.prototype.checkParadox = function (side) {
    const mon = this.active(side);
    if (!mon || mon.fainted) return;
    const proto = mon.ability === 'Protosynthesis', quark = mon.ability === 'Quark Drive';
    if (!proto && !quark) return;
    const envOn = (proto && this.field.weather === 'sun') || (quark && this.field.terrain === 'electric');
    const booster = mon.item === 'Booster Energy' && mon.itemActive;
    if ((envOn || booster) && !mon.boostedStat) {
      // Highest stat among atk/def/spa/spd/spe (after nature, no boosts).
      let best = 'atk', bestv = -1;
      for (const k of ['atk', 'def', 'spa', 'spd', 'spe']) if (mon.stats[k] > bestv) { bestv = mon.stats[k]; best = k; }
      mon.boostedStat = best;
      if (booster && !envOn) { mon.itemActive = false; mon.item = null; }
      this.emit(mon.species + "'s " + mon.ability + ' boosted its ' + best.toUpperCase() + '!', 'ability');
    } else if (!envOn && !booster && mon.boostedStat && !mon._boosterHeld) {
      // Weather faded and no booster held: Proto boost drops.
      if (proto) mon.boostedStat = null;
    }
  };

  Battle.prototype.applyHazards = function (side) {
    const s = this.sides[side], mon = s.team[s.active], h = s.hazards;
    if (mon.fainted) return;
    if (h.sr) {
      const eff = D.effectiveness('Rock', this.currentTypes(mon));
      const dmg = Math.floor(mon.maxhp * 0.125 * eff);
      if (dmg > 0) { this.damage(side, dmg, 'Pointed stones dug into ' + mon.species + '!'); }
    }
    if (mon.fainted) return;
    const grounded = this.isGrounded(mon);
    if (grounded && h.spikes) {
      const frac = [0, 1 / 8, 1 / 6, 1 / 4][h.spikes];
      this.damage(side, Math.floor(mon.maxhp * frac), mon.species + ' is hurt by Spikes!');
    }
    if (mon.fainted) return;
    if (grounded && h.tspikes) {
      if (this.currentTypes(mon).includes('Poison')) {
        h.tspikes = 0; this.emit(mon.species + ' absorbed the Toxic Spikes!', 'system');
      } else if (!this.isImmuneToStatus(mon, h.tspikes >= 2 ? 'tox' : 'psn')) {
        this.setStatus(side, h.tspikes >= 2 ? 'tox' : 'psn', 'hazard');
      }
    }
    if (mon.fainted) return;
    if (grounded && h.web && mon.boosts.spe > -6) {
      this.applyBoost(side, { spe: -1 }, 'Sticky Web');
    }
  };

  /* ---- Damage application ----------------------------------------------- */
  Battle.prototype.damage = function (side, amount, msg, opts) {
    opts = opts || {};
    const mon = this.active(side);
    if (!mon || mon.fainted || amount <= 0) return 0;
    // Substitute soak.
    if (mon.volatiles.sub != null && !opts.direct && !opts.bypassSub) {
      const before = mon.volatiles.sub;
      mon.volatiles.sub -= amount;
      if (mon.volatiles.sub <= 0) { delete mon.volatiles.sub; this.emit(mon.species + "'s substitute faded!", 'system'); }
      return Math.min(before, amount);
    }
    amount = Math.min(amount, mon.hp);
    mon.hp -= amount;
    if (msg) this.emit(msg, 'damage');
    if (mon.hp <= 0) { mon.hp = 0; this.faint(side); }
    return amount;
  };

  Battle.prototype.heal = function (side, amount, msg) {
    const mon = this.active(side);
    if (!mon || mon.fainted) return 0;
    const before = mon.hp;
    mon.hp = Math.min(mon.maxhp, mon.hp + Math.floor(amount));
    if (mon.hp > before && msg) this.emit(msg, 'heal');
    return mon.hp - before;
  };

  Battle.prototype.faint = function (side) {
    const mon = this.active(side);
    mon.fainted = true; mon.hp = 0;
    this.emit(mon.species + ' fainted!', 'faint');
  };

  /* ---- Status ----------------------------------------------------------- */
  Battle.prototype.isImmuneToStatus = function (mon, status) {
    const types = this.currentTypes(mon);
    if (mon.status) return true;
    if (mon.ability === 'Good as Gold' && false) return true; // GaG blocks status *moves*, handled elsewhere
    if (mon.ability === 'Purifying Salt') return true;
    if ((status === 'psn' || status === 'tox') && (types.includes('Poison') || types.includes('Steel')) && mon.ability !== 'Corrosion') return true;
    if (status === 'brn' && types.includes('Fire')) return true;
    if (status === 'par' && types.includes('Electric')) return true;
    if (status === 'frz' && types.includes('Ice')) return true;
    if (status === 'slp' && mon.ability === 'Insomnia') return true;
    if ((status === 'brn') && (mon.ability === 'Thermal Exchange' || mon.ability === 'Water Veil')) return true;
    return false;
  };

  Battle.prototype.setStatus = function (side, status, src) {
    const mon = this.active(side);
    if (!mon || mon.fainted) return false;
    if (this.isImmuneToStatus(mon, status)) return false;
    mon.status = status;
    if (status === 'slp') mon.sleepTurns = 1 + Math.floor(this.rng() * 3); // 1-3 turns
    if (status === 'tox') mon.toxicN = 1;
    const label = { brn: 'was burned', par: 'was paralyzed', psn: 'was poisoned', tox: 'was badly poisoned', slp: 'fell asleep', frz: 'was frozen solid' }[status];
    this.emit(mon.species + ' ' + label + '!', 'status');
    return true;
  };

  /* ---- Boosts ----------------------------------------------------------- */
  Battle.prototype.applyBoost = function (side, boosts, src) {
    const mon = this.active(side);
    if (!mon || mon.fainted) return;
    for (const k in boosts) {
      let d = boosts[k];
      if (d < 0 && (mon.ability === 'Clear Body' || mon.ability === 'White Smoke' || (mon.ability === 'Hyper Cutter' && k === 'atk'))) {
        this.emit(mon.species + "'s " + mon.ability + ' prevents stat loss!', 'ability'); continue;
      }
      const before = mon.boosts[k];
      mon.boosts[k] = clamp(before + d, -6, 6);
      const real = mon.boosts[k] - before;
      if (real === 0) continue;
      const dir = real > 0 ? 'rose' : 'fell';
      const mag = Math.abs(real) >= 2 ? ' sharply' : '';
      this.emit(mon.species + "'s " + k.toUpperCase() + ' ' + dir + mag + '!', 'boost');
    }
  };

  /* ---- Effective stats for damage --------------------------------------- */
  Battle.prototype.effStat = function (mon, key, opts) {
    opts = opts || {};
    let stat = mon.stats[key];
    let stage = mon.boosts[key];
    if (opts.ignoreNeg && stage < 0) stage = 0;
    if (opts.ignorePos && stage > 0) stage = 0;
    stat = Math.floor(stat * boostMul(stage));
    // Item / ability multipliers.
    if (key === 'atk') {
      if (mon.item === 'Choice Band' && mon.itemActive) stat = Math.floor(stat * 1.5);
      if (mon.ability === 'Guts' && mon.status) stat = Math.floor(stat * 1.5);
      if (mon.ability === 'Supreme Overlord') stat = Math.floor(stat * (1 + 0.1 * (mon._fallen || 0)));
    }
    if (key === 'spa') {
      if (mon.item === 'Choice Specs' && mon.itemActive) stat = Math.floor(stat * 1.5);
      if (mon.ability === 'Supreme Overlord') stat = Math.floor(stat * (1 + 0.1 * (mon._fallen || 0)));
    }
    if (key === 'spd' && this.field.weather === 'sand' && this.currentTypes(mon).includes('Rock')) stat = Math.floor(stat * 1.5);
    if (key === 'def' && this.field.weather === 'snow' && this.currentTypes(mon).includes('Ice')) stat = Math.floor(stat * 1.5);
    if (mon.boostedStat === key) stat = Math.floor(stat * 1.3);
    return stat;
  };

  Battle.prototype.effSpeed = function (mon) {
    let spe = Math.floor(mon.stats.spe * boostMul(mon.boosts.spe));
    if (mon.item === 'Choice Scarf' && mon.itemActive) spe = Math.floor(spe * 1.5);
    if (mon.status === 'par' && mon.ability !== 'Quick Feet') spe = Math.floor(spe * 0.5);
    if (mon.ability === 'Swift Swim' && this.field.weather === 'rain') spe = Math.floor(spe * 2);
    if (mon.ability === 'Sand Rush' && this.field.weather === 'sand') spe = Math.floor(spe * 2);
    if (mon.ability === 'Chlorophyll' && this.field.weather === 'sun') spe = Math.floor(spe * 2);
    if (mon.boostedStat === 'spe') spe = Math.floor(spe * 1.5);
    return spe;
  };

  /* ---- Damage calculation ----------------------------------------------- */
  // Returns {damage, eff, crit, hits} without applying it. opts.roll in [0..1],
  // opts.crit forces crit, opts.avg uses 0.925.
  Battle.prototype.calcDamage = function (atkSide, move, opts) {
    opts = opts || {};
    const attacker = this.active(atkSide);
    const defender = this.active(this.foeSide(atkSide));
    const m = typeof move === 'string' ? Object.assign({ id: move }, D.MOVES[move]) : move;
    if (!m || m.category === 'Status') return { damage: 0, eff: 1, crit: false };

    let moveType = m.type;
    if (m.ivycudgel && attacker.set.species.startsWith('Ogerpon-Wellspring')) moveType = 'Water';
    if (m.teraVaries && attacker.teraActive) moveType = attacker.teraType;

    const defTypes = this.currentTypes(defender);
    let eff = D.effectiveness(moveType, defTypes);
    // Immunity via ability.
    if (eff > 0) {
      if (moveType === 'Ground' && !this.isGrounded(defender)) eff = 0;
      if (moveType === 'Electric' && (defender.ability === 'Volt Absorb' || defender.ability === 'Lightning Rod' || defender.ability === 'Motor Drive')) eff = 0;
      if (moveType === 'Water' && (defender.ability === 'Water Absorb' || defender.ability === 'Storm Drain' || defender.ability === 'Dry Skin')) eff = 0;
      if (moveType === 'Fire' && (defender.ability === 'Flash Fire' || defender.ability === 'Well-Baked Body')) eff = 0;
      if (moveType === 'Grass' && defender.ability === 'Sap Sipper') eff = 0;
    }
    if (eff === 0) return { damage: 0, eff: 0, crit: false };

    // Power.
    let power = m.power;
    if (m.eruption) power = Math.max(1, Math.floor(150 * attacker.hp / attacker.maxhp));
    if (m.knockoff && defender.item && defender.itemActive && !defender.set.species.startsWith('Ogerpon')) power = Math.floor(power * 1.5);
    if (m.ivycudgel && attacker.item === 'Wellspring Mask') power = Math.floor(power * 1.2);
    if (m.id === 'Ivy Cudgel' && attacker.item === 'Wellspring Mask') { /* handled */ }
    if (m.id === 'Facade' && attacker.status) power *= 2;

    // Offensive / defensive stats.
    const crit = opts.crit != null ? opts.crit : (this.rng() < (m.highCrit ? 1 / 8 : 1 / 24));
    const atkKey = m.useDefAsAtk ? 'def' : (m.category === 'Physical' ? 'atk' : 'spa');
    const defKey = (m.category === 'Physical' || m.hitsDef) ? 'def' : 'spd';
    let A = this.effStat(attacker, atkKey, { ignoreNeg: crit });
    let D_ = this.effStat(defender, defKey, { ignorePos: crit });
    // Vessel of Ruin lowers foe SpA; Tablets/Sword/Beads analogous — implement VoR + Sword of Ruin.
    if (m.category === 'Special' && this.hasRuin('Vessel of Ruin', atkSide)) A = Math.floor(A * 0.75);
    if (m.category === 'Physical' && this.hasRuin('Tablets of Ruin', atkSide)) A = Math.floor(A * 0.75);
    if (defKey === 'def' && this.hasRuin('Sword of Ruin', this.foeSide(atkSide))) D_ = Math.floor(D_ * 0.75);
    if (defKey === 'spd' && this.hasRuin('Beads of Ruin', this.foeSide(atkSide))) D_ = Math.floor(D_ * 0.75);

    let dmg = Math.floor(Math.floor(Math.floor((2 * attacker.level / 5 + 2) * power * A / D_) / 50) + 2);

    // Multiplier chain.
    // Weather.
    if (this.field.weather === 'rain') { if (moveType === 'Water') dmg = Math.floor(dmg * 1.5); if (moveType === 'Fire') dmg = Math.floor(dmg * 0.5); }
    if (this.field.weather === 'sun') { if (moveType === 'Fire') dmg = Math.floor(dmg * 1.5); if (moveType === 'Water') dmg = Math.floor(dmg * 0.5); }
    // Crit.
    if (crit) dmg = Math.floor(dmg * 1.5);
    // Random factor.
    const roll = opts.avg ? 0.925 : (opts.roll != null ? (0.85 + 0.15 * opts.roll) : (0.85 + (Math.floor(this.rng() * 16)) / 100));
    dmg = Math.floor(dmg * roll);
    // STAB.
    const stab = this.stabMultiplier(attacker, moveType);
    if (stab !== 1) dmg = Math.floor(dmg * stab);
    // Type effectiveness.
    dmg = Math.floor(dmg * eff);
    // Burn.
    if (m.category === 'Physical' && attacker.status === 'brn' && attacker.ability !== 'Guts') dmg = Math.floor(dmg * 0.5);
    // Multiscale / defensive.
    if (defender.hp === defender.maxhp && (defender.ability === 'Multiscale' || defender.ability === 'Shadow Shield')) dmg = Math.floor(dmg * 0.5);
    if (eff > 1 && defender.item === 'Weakness Policy') { /* skip WP */ }
    // Life Orb.
    if (attacker.item === 'Life Orb' && attacker.itemActive) dmg = Math.floor(dmg * 1.3);
    // Assault Vest already in stat. Wellspring mask handled in power.
    if (dmg < 1) dmg = 1;
    return { damage: dmg, eff, crit, type: moveType };
  };

  Battle.prototype.stabMultiplier = function (mon, moveType) {
    const isOriginal = mon.types.includes(moveType);
    const adaptability = mon.ability === 'Adaptability';
    if (mon.teraActive) {
      const isTera = mon.teraType === moveType;
      if (isTera && isOriginal) return adaptability ? 2.25 : 2.0;
      if (isTera || isOriginal) return adaptability ? 2.0 : 1.5;
      return 1;
    }
    if (isOriginal) return adaptability ? 2.0 : 1.5;
    return 1;
  };

  Battle.prototype.hasRuin = function (ability, exceptSide) {
    for (let i = 0; i < 2; i++) {
      if (i === exceptSide) continue;
      const mon = this.active(i);
      if (mon && !mon.fainted && mon.ability === ability) return true;
    }
    return false;
  };

  /* ---- Accuracy --------------------------------------------------------- */
  Battle.prototype.accuracyCheck = function (atkSide, m) {
    if (m.acc === true || m.acc == null) return true;
    const attacker = this.active(atkSide), defender = this.active(this.foeSide(atkSide));
    if (m.rainPerfect && this.field.weather === 'rain') return true;
    if (m.id === 'Thunder' && this.field.weather === 'rain') return true;
    let acc = m.acc;
    const stage = clamp(attacker.boosts.acc - defender.boosts.eva, -6, 6);
    acc = acc * accMul(stage);
    return this.rng() * 100 < acc;
  };

  /* ---- Speed order ------------------------------------------------------ */
  Battle.prototype.speedOrder = function (a, b) {
    const sa = this.effSpeed(this.active(a)), sb = this.effSpeed(this.active(b));
    if (sa !== sb) return sa > sb ? [a, b] : [b, a];
    return this.rng() < 0.5 ? [a, b] : [b, a];
  };

  /* ---- Requests (what each side must choose) ---------------------------- */
  Battle.prototype.requestFor = function (side) {
    const mon = this.active(side);
    if (mon.fainted) return this.switchRequest(side, 'replace');
    const moves = mon.moves.map((mv) => {
      const md = D.MOVES[mv.id];
      let disabled = mv.pp <= 0 || mv.disabled;
      if (mon.choiceLock && mv.id !== mon.choiceLock) disabled = true;
      return { id: mv.id, pp: mv.pp, maxpp: mv.maxpp, type: md.type, category: md.category, power: md.power || 0, acc: md.acc, disabled };
    });
    const allDisabled = moves.every((m) => m.disabled);
    if (allDisabled) moves.forEach((m) => { if (m.pp > 0) m.disabled = false; }); // Struggle-ish fallback
    return {
      kind: 'move', side, active: mon,
      moves,
      canTera: !this.sides[side].teraUsed && !mon.teraActive,
      switches: this.legalSwitches(side),
      trapped: this.isTrapped(side),
    };
  };

  Battle.prototype.legalSwitches = function (side) {
    const s = this.sides[side], out = [];
    for (let i = 0; i < s.team.length; i++) if (i !== s.active && !s.team[i].fainted) out.push(i);
    return out;
  };
  Battle.prototype.switchRequest = function (side, reason) {
    return { kind: reason || 'replace', side, switches: this.legalSwitches(side) };
  };
  Battle.prototype.isTrapped = function (side) {
    const foe = this.active(this.foeSide(side));
    const mon = this.active(side);
    if (mon.item === 'Heavy-Duty Boots') { /* not relevant */ }
    // Nothing in this roster traps; hook left for completeness.
    return false;
  };

  /* ---- Turn resolution (generator) -------------------------------------- *
   * Yields switch requests {kind:'replace'|'pivot', side, switches} and is
   * resumed with the chosen bench index. Returns when the turn (incl. end-of-
   * turn residuals and any faint replacements) is complete.
   * --------------------------------------------------------------------- */
  Battle.prototype.resolveTurn = function* (action0, action1) {
    const actions = [action0, action1];
    this.emit('— Turn ' + this.turn + ' —', 'turn');

    // 1) Switches happen first (in speed order among switchers is irrelevant).
    for (let s = 0; s < 2; s++) {
      const a = actions[s];
      if (a && a.type === 'switch') {
        this.doSwitch(s, a.target);
      }
    }

    // Determine move order among sides that chose to move.
    const movers = [0, 1].filter((s) => actions[s] && actions[s].type === 'move' && !this.active(s).fainted);
    movers.sort((x, y) => {
      const mx = D.MOVES[this.moveIdOf(actions[x])], my = D.MOVES[this.moveIdOf(actions[y])];
      const px = mx.priority || 0, py = my.priority || 0;
      if (px !== py) return py - px;
      const sx = this.effSpeed(this.active(x)), sy = this.effSpeed(this.active(y));
      if (sx !== sy) return sy - sx;
      return this.rng() < 0.5 ? -1 : 1;
    });

    // 2) Execute moves in order.
    for (const s of movers) {
      const mon = this.active(s);
      if (mon.fainted) continue;
      // Apply Tera if requested (before the move).
      const a = actions[s];
      if (a.tera && !this.sides[s].teraUsed && !mon.teraActive) this.doTera(s);
      const req = yield* this.performMove(s, a, actions);
      // performMove may request a pivot replacement.
      if (this.winner !== null) return;
    }

    // 3) End-of-turn residuals.
    yield* this.endOfTurn();
    if (this.winner !== null) return;

    // 4) Any active fainted mons need replacements (from residual damage).
    for (const s of this.speedOrder(0, 1)) {
      if (this.active(s).fainted) {
        const picked = yield this.switchRequest(s, 'replace');
        this.doSwitch(s, picked, true);
        if (this.winner !== null) return;
      }
    }

    this.turn++;
  };

  Battle.prototype.moveIdOf = function (a) { return a.move; };

  Battle.prototype.doTera = function (side) {
    const mon = this.active(side);
    mon.teraActive = true;
    this.sides[side].teraUsed = true;
    this.emit(mon.species + ' Terastallized into the ' + mon.teraType + ' type!', 'tera');
    this.checkParadox(side);
  };

  /* ---- Switch ----------------------------------------------------------- */
  Battle.prototype.doSwitch = function (side, target, silent) {
    const s = this.sides[side];
    const outMon = s.team[s.active];
    if (target == null || target === s.active || !s.team[target] || s.team[target].fainted) {
      // No valid switch; keep current if fainted this is a problem, but guarded upstream.
      target = this.legalSwitches(side)[0];
      if (target == null) return;
    }
    if (!outMon.fainted) {
      // Regenerator heal.
      if (outMon.ability === 'Regenerator') outMon.hp = Math.min(outMon.maxhp, outMon.hp + Math.floor(outMon.maxhp / 3));
      // Reset volatiles and choice lock on switch out.
      outMon.boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
      outMon.volatiles = {};
      outMon.choiceLock = null;
      if (outMon.status === 'tox') outMon.toxicN = 1;
      this.emit(this.sides[side].name + ' withdrew ' + outMon.species + '.', 'switch');
    }
    s.active = target;
    const inMon = s.team[target];
    inMon.boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
    inMon.volatiles = {};
    inMon.choiceLock = null;
    this.emit(this.sides[side].name + ' sent out ' + inMon.species + '!', 'switch');
    this.onSwitchIn(side, target, false);
  };

  /* ---- Move execution --------------------------------------------------- */
  Battle.prototype.performMove = function* (side, action, actions) {
    const mon = this.active(side);
    const foeSide = this.foeSide(side);
    const mv = mon.moves.find((x) => x.id === action.move) || mon.moves[0];
    const m = Object.assign({ id: mv.id }, D.MOVES[mv.id]);

    // Pre-move status checks.
    if (!this.canMove(side, m)) return;

    // Spend PP; set choice lock.
    if (mv.pp > 0) mv.pp--;
    if ((mon.item === 'Choice Band' || mon.item === 'Choice Specs' || mon.item === 'Choice Scarf') && mon.itemActive) mon.choiceLock = mv.id;

    this.sides[side].lastMove = mv.id;
    this.emit(mon.species + ' used ' + mv.id + '!', 'move');

    // Status-move blockers.
    const foe = this.active(foeSide);
    if (m.category === 'Status' && (m.statusTarget === 'foe' || m.forceSwitch)) {
      if (foe.ability === 'Good as Gold') { this.emit(foe.species + "'s Good as Gold blocks it!", 'ability'); return; }
      if (foe.ability === 'Magic Bounce' && (m.status || m.forceSwitch)) { this.emit('It was bounced back by Magic Bounce!', 'ability'); if (m.status) this.setStatus(side, m.status); return; }
    }

    // Charge moves (Solar Beam skips charge in sun).
    if (m.charge === 'sun' && this.field.weather !== 'sun' && !mon.volatiles.charging) {
      mon.volatiles.charging = m.id;
      this.emit(mon.species + ' absorbed light!', 'move');
      return;
    }
    if (mon.volatiles.charging) delete mon.volatiles.charging;

    // Protect (self).
    if (m.volatile === 'protect') {
      // simple: always succeeds (no consecutive fail modeling).
      mon.volatiles.protect = true;
      this.emit(mon.species + ' protected itself!', 'move');
      return;
    }

    const foeProtected = foe.volatiles && foe.volatiles.protect;

    // Sucker/Thunderclap condition: foe must be using an attacking move and not yet moved.
    if (m.condition === 'sucker') {
      const foeAct = actions[foeSide];
      const foeMoveOk = foeAct && foeAct.type === 'move' && D.MOVES[foeAct.move] && D.MOVES[foeAct.move].category !== 'Status';
      const foeAlreadyMoved = this._movedThisTurn && this._movedThisTurn[foeSide];
      if (!foeMoveOk || foeAlreadyMoved) { this.emit('But it failed!', 'text'); this._markMoved(side); return; }
    }
    this._markMoved(side);

    // Status moves (non-damaging).
    if (m.category === 'Status') {
      if (foeProtected && (m.statusTarget === 'foe' || m.forceSwitch)) { this.emit('But ' + foe.species + ' protected itself!', 'text'); return; }
      yield* this.applyStatusMove(side, m);
      this.afterMoveItem(side);
      return;
    }

    // Damaging move.
    if (foeProtected) { this.emit(foe.species + ' protected itself!', 'text'); this.afterMoveItem(side); return; }
    if (!this.accuracyCheck(side, m)) { this.emit(mon.species + "'s attack missed!", 'miss'); this.afterMoveItem(side); return; }

    const hitsN = m.multihit ? (Array.isArray(m.multihit) ? this.rollMultihit(m.multihit) : m.multihit) : 1;
    let totalDamage = 0, lastEff = 1, anyHit = false;
    for (let h = 0; h < hitsN; h++) {
      if (foe.fainted) break;
      const res = this.calcDamage(side, m);
      lastEff = res.eff;
      if (res.eff === 0) { this.emit("It doesn't affect " + foe.species + '...', 'text'); this.afterMoveItem(side); return; }
      anyHit = true;
      let dmg = res.damage;
      // Focus Sash / Sturdy: survive an OHKO from full HP with 1 HP.
      const willKO = dmg >= foe.hp && foe.volatiles.sub == null;
      if (willKO && foe.hp === foe.maxhp && ((foe.item === 'Focus Sash' && foe.itemActive) || foe.ability === 'Sturdy')) {
        dmg = foe.hp - 1;
        if (foe.item === 'Focus Sash') { foe.itemActive = false; foe.item = null; }
        this._pendingEndure = foe.species;
      }
      const dealt = this.damage(foeSide, dmg);
      totalDamage += dealt;
      if (res.crit && h === 0) this.emit('A critical hit!', 'text');
    }
    if (anyHit) {
      if (lastEff > 1) this.emit("It's super effective!", 'text');
      else if (lastEff < 1 && lastEff > 0) this.emit("It's not very effective...", 'text');
      if (this._pendingEndure) { this.emit(this._pendingEndure + ' hung on!', 'text'); this._pendingEndure = null; }
    }

    // Post-damage: drain, recoil, contact effects, secondaries, knock off, switch out.
    if (anyHit) {
      const md = m;
      if (md.drain && totalDamage > 0) this.heal(side, Math.floor(totalDamage * md.drain), mon.species + ' drained HP!');
      if (md.recoil && totalDamage > 0 && mon.ability !== 'Rock Head') this.damage(side, Math.max(1, Math.floor(totalDamage * md.recoil)), mon.species + ' is hit by recoil!', { direct: true });
      if (mon.item === 'Life Orb' && mon.itemActive && mon.ability !== 'Magic Guard') this.damage(side, Math.max(1, Math.floor(mon.maxhp / 10)), mon.species + ' lost HP to Life Orb!', { direct: true });
      // Contact: Rocky Helmet / Rough Skin / Static.
      if (md.contact && !foe.fainted) {
        if (foe.item === 'Rocky Helmet' && foe.itemActive) this.damage(side, Math.floor(mon.maxhp / 6), mon.species + ' was hurt by Rocky Helmet!', { direct: true });
        if (foe.ability === 'Rough Skin' || foe.ability === 'Iron Barbs') this.damage(side, Math.floor(mon.maxhp / 8), mon.species + ' was hurt by ' + foe.ability + '!', { direct: true });
        if (foe.ability === 'Static' && this.rng() < 0.3) this.setStatus(side, 'par');
        if (foe.ability === 'Flame Body' && this.rng() < 0.3) this.setStatus(side, 'brn');
      }
      // Knock Off removes item.
      if (md.knockoff && foe.item && foe.itemActive && !foe.set.species.startsWith('Ogerpon') && foe.ability !== 'Sticky Hold') {
        this.emit(mon.species + ' knocked off ' + foe.species + "'s " + foe.item + '!', 'text');
        foe.item = null; foe.itemActive = false;
      }
      // Secondary effect (if foe survived).
      if (!foe.fainted && md.secondary && this.rng() * 100 < md.secondary.chance) {
        const sec = md.secondary;
        if (sec.status) this.setStatus(foeSide, sec.status);
        if (sec.flinch) foe.volatiles.flinch = true;
        if (sec.confuse) this.addConfusion(foeSide);
        if (sec.boosts) this.applyBoost(sec.target === 'self' ? side : foeSide, sec.boosts);
      }
      // Self stat drops (Close Combat etc.).
      if (md.selfDrop) this.applyBoost(side, md.selfDrop);
      if (md.selfBoost) this.applyBoost(side, md.selfBoost);
      // Rapid Spin clears own hazards.
      if (md.spin) this.clearHazards(side);
      // Defending ability boosts (Weakness Policy skipped).
      // Fainted foe: Kingambit Supreme Overlord counter, Moxie etc.
      if (foe.fainted) this.onFoeFainted(side);
    }

    this.afterMoveItem(side);

    // Switch-out moves (U-turn/Volt Switch/Flip Turn): user picks replacement.
    if (m.switchOut && !mon.fainted && this.legalSwitches(side).length > 0 && this.winner === null) {
      const picked = yield { kind: 'pivot', side, switches: this.legalSwitches(side) };
      this.doSwitch(side, picked);
    }
    // Force switch on foe (Whirlwind handled in status move).
  };

  Battle.prototype.rollMultihit = function (range) {
    // Standard 2-5 distribution approximated; for [2,2] etc just min..max uniform-ish.
    const [lo, hi] = range;
    if (lo === hi) return lo;
    if (lo === 2 && hi === 5) { const r = this.rng(); return r < 0.35 ? 2 : r < 0.70 ? 3 : r < 0.85 ? 4 : 5; }
    return lo + Math.floor(this.rng() * (hi - lo + 1));
  };

  Battle.prototype._markMoved = function (side) {
    if (!this._movedThisTurn) this._movedThisTurn = [false, false];
    this._movedThisTurn[side] = true;
  };

  Battle.prototype.onFoeFainted = function (side) {
    // Attacker-side effects when it KOs.
    const mon = this.active(side);
    if (mon.ability === 'Moxie' || mon.ability === 'Chilling Neigh') this.applyBoost(side, { atk: 1 });
    if (mon.ability === 'Grim Neigh') this.applyBoost(side, { spa: 1 });
    if (mon.ability === 'Beast Boost') {
      let best = 'atk', bv = -1; for (const k of ['atk', 'def', 'spa', 'spd', 'spe']) if (mon.stats[k] > bv) { bv = mon.stats[k]; best = k; }
      this.applyBoost(side, { [best]: 1 });
    }
    // Supreme Overlord counter on the side that lost a mon is handled at faint.
  };

  Battle.prototype.canMove = function (side, m) {
    const mon = this.active(side);
    // Flinch.
    if (mon.volatiles.flinch) { delete mon.volatiles.flinch; this.emit(mon.species + ' flinched!', 'text'); return false; }
    // Freeze.
    if (mon.status === 'frz') {
      if (this.rng() < 0.2 || m.type === 'Fire') { mon.status = ''; this.emit(mon.species + ' thawed out!', 'status'); }
      else { this.emit(mon.species + ' is frozen solid!', 'status'); return false; }
    }
    // Sleep.
    if (mon.status === 'slp') {
      mon.sleepTurns--;
      if (mon.sleepTurns <= 0) { mon.status = ''; this.emit(mon.species + ' woke up!', 'status'); }
      else { this.emit(mon.species + ' is fast asleep.', 'status'); return false; }
    }
    // Paralysis.
    if (mon.status === 'par' && this.rng() < 0.25) { this.emit(mon.species + ' is paralyzed! It can\'t move!', 'status'); return false; }
    // Confusion.
    if (mon.volatiles.confusion != null) {
      mon.volatiles.confusion--;
      if (mon.volatiles.confusion <= 0) { delete mon.volatiles.confusion; this.emit(mon.species + ' snapped out of confusion!', 'status'); }
      else {
        this.emit(mon.species + ' is confused!', 'status');
        if (this.rng() < 1 / 3) {
          const self = Math.floor(Math.floor(Math.floor((2 * mon.level / 5 + 2) * 40 * this.effStat(mon, 'atk') / this.effStat(mon, 'def')) / 50) + 2);
          this.damage(side, self, mon.species + ' hurt itself in confusion!', { direct: true });
          return false;
        }
      }
    }
    return true;
  };

  Battle.prototype.addConfusion = function (side) {
    const mon = this.active(side);
    if (mon.volatiles.confusion == null && mon.ability !== 'Own Tempo') mon.volatiles.confusion = 2 + Math.floor(this.rng() * 3);
  };

  /* ---- Status moves ----------------------------------------------------- */
  Battle.prototype.applyStatusMove = function* (side, m) {
    const foeSide = this.foeSide(side);
    if (m.hazard) {
      const h = this.sides[foeSide].hazards;
      if (m.hazard === 'sr') { if (!h.sr) { h.sr = 1; this.emit('Pointed stones float around the foe\'s team!', 'hazard'); } else this.emit('But it failed!', 'text'); }
      if (m.hazard === 'spikes') { if (h.spikes < 3) { h.spikes++; this.emit('Spikes were scattered!', 'hazard'); } else this.emit('But it failed!', 'text'); }
      if (m.hazard === 'tspikes') { if (h.tspikes < 2) { h.tspikes++; this.emit('Toxic Spikes were scattered!', 'hazard'); } else this.emit('But it failed!', 'text'); }
      return;
    }
    if (m.status && (m.statusTarget === 'foe' || (!m.selfBoost && !m.heal))) {
      this.setStatus(foeSide, m.status);
      return;
    }
    if (m.heal) {
      this.heal(side, Math.floor(this.active(side).maxhp * m.heal), this.active(side).species + ' restored HP!');
      return;
    }
    if (m.selfBoost) { this.applyBoost(side, m.selfBoost); return; }
    if (m.forceSwitch) {
      const targets = this.legalSwitches(foeSide);
      if (targets.length === 0) { this.emit('But it failed!', 'text'); return; }
      const pick = targets[Math.floor(this.rng() * targets.length)];
      this.emit(this.active(foeSide).species + ' was dragged out!', 'text');
      this.doSwitch(foeSide, pick, true);
      return;
    }
    this.emit('But nothing happened.', 'text');
  };

  Battle.prototype.afterMoveItem = function (side) {
    const mon = this.active(side);
    if (mon.fainted) return;
    // Sitrus berry.
    if (mon.item === 'Sitrus Berry' && mon.itemActive && mon.hp <= mon.maxhp / 2) {
      mon.itemActive = false; mon.item = null;
      this.heal(side, Math.floor(mon.maxhp / 4), mon.species + ' ate its Sitrus Berry!');
    }
  };

  Battle.prototype.clearHazards = function (side) {
    const h = this.sides[side].hazards;
    if (h.sr || h.spikes || h.tspikes || h.web) {
      h.sr = h.spikes = h.tspikes = h.web = 0;
      this.emit(this.active(side).species + ' blew away the hazards!', 'text');
    }
  };

  /* ---- End of turn ------------------------------------------------------ */
  Battle.prototype.endOfTurn = function* () {
    // Clear protect + flinch + moved markers.
    for (let s = 0; s < 2; s++) { const mon = this.active(s); if (mon.volatiles.protect) delete mon.volatiles.protect; }
    this._movedThisTurn = [false, false];

    const order = this.speedOrder(0, 1);
    // Weather chip.
    if (this.field.weather === 'sand') {
      for (const s of order) {
        const mon = this.active(s);
        if (mon.fainted || mon.ability === 'Magic Guard' || mon.ability === 'Sand Force' || mon.ability === 'Sand Rush' || mon.ability === 'Sand Veil') continue;
        const t = this.currentTypes(mon);
        if (t.includes('Rock') || t.includes('Ground') || t.includes('Steel')) continue;
        this.damage(s, Math.floor(mon.maxhp / 16), mon.species + ' is buffeted by the sandstorm!');
      }
    }
    // Leftovers / Black Sludge.
    for (const s of order) {
      const mon = this.active(s);
      if (mon.fainted) continue;
      if (mon.item === 'Leftovers' && mon.itemActive) this.heal(s, Math.floor(mon.maxhp / 16), mon.species + ' restored a little HP with Leftovers!');
    }
    // Status damage.
    for (const s of order) {
      const mon = this.active(s);
      if (mon.fainted || mon.ability === 'Magic Guard') continue;
      if (mon.status === 'brn') this.damage(s, Math.max(1, Math.floor(mon.maxhp / 16)), mon.species + ' is hurt by its burn!');
      else if (mon.status === 'psn' && mon.ability !== 'Poison Heal') this.damage(s, Math.max(1, Math.floor(mon.maxhp / 8)), mon.species + ' is hurt by poison!');
      else if (mon.status === 'psn' && mon.ability === 'Poison Heal') this.heal(s, Math.floor(mon.maxhp / 8), mon.species + ' is healed by Poison Heal!');
      else if (mon.status === 'tox') {
        this.damage(s, Math.max(1, Math.floor(mon.maxhp * mon.toxicN / 16)), mon.species + ' is hurt by poison!');
        mon.toxicN++;
      }
    }
    // Leech seed (not in roster but supported).
    for (const s of order) {
      const mon = this.active(s);
      if (mon.fainted || !mon.volatiles.leechseed) continue;
      const foeS = this.foeSide(s);
      const drained = this.damage(s, Math.floor(mon.maxhp / 8), mon.species + "'s health is sapped by Leech Seed!");
      if (drained > 0) this.heal(foeS, drained, null);
    }
    // Weather countdown.
    if (this.field.weather) {
      this.field.weatherTurns--;
      if (this.field.weatherTurns <= 0) {
        this.emit(this.weatherEndMsg(this.field.weather), 'weather');
        this.field.weather = '';
        for (let s = 0; s < 2; s++) this.checkParadox(s);
      }
    }
    // Win check.
    this.checkWin();
  };

  /* ---- Faint bookkeeping (Supreme Overlord counter) --------------------- */
  Battle.prototype.checkWin = function () {
    if (this._ended) return;
    const dead = [0, 1].map((s) => this.sides[s].team.every((m) => m.fainted));
    if (dead[0] && dead[1]) this.winner = 'tie';
    else if (dead[0]) this.winner = 1;
    else if (dead[1]) this.winner = 0;
    if (this.winner !== null && this.winner !== undefined) {
      this._ended = true;
      const w = this.winner === 'tie' ? 'It\'s a tie!' : this.sides[this.winner].name + ' wins!';
      this.emit(w, 'system');
    }
  };

  // Recompute Supreme Overlord "fallen" counts on demand.
  Battle.prototype.updateFallen = function () {
    for (let s = 0; s < 2; s++) {
      const fallen = this.sides[s].team.filter((m) => m.fainted).length;
      for (const m of this.sides[s].team) if (m.ability === 'Supreme Overlord') m._fallen = fallen;
    }
  };

  /* ---- Weather messages ------------------------------------------------- */
  Battle.prototype.weatherStartMsg = function (w) {
    return { sun: 'The sunlight turned harsh!', rain: 'It started to rain!', sand: 'A sandstorm kicked up!', snow: 'It started to snow!' }[w];
  };
  Battle.prototype.weatherEndMsg = function (w) {
    return { sun: 'The harsh sunlight faded.', rain: 'The rain stopped.', sand: 'The sandstorm subsided.', snow: 'The snow stopped.' }[w];
  };

  // Override faint to keep Supreme Overlord counts fresh.
  const _faint = Battle.prototype.faint;
  Battle.prototype.faint = function (side) { _faint.call(this, side); this.updateFallen(); this.checkWin(); };

  POKE.engine = { Battle, makePokemon, makeRng, calcStat, calcHP, boostMul };
  if (typeof module !== 'undefined' && module.exports) module.exports = POKE;
})();
