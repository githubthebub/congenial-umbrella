/* ============================================================================
 * data.js — Pokédex, moves, type chart, competitive OU teams, and AI personas
 * for a Gen 9 (Scarlet/Violet) OU singles battle simulator.
 *
 * Base stats and typings are the real Gen 9 values. Movesets are competitively
 * plausible OU builds. Everything attaches to the global POKE namespace so the
 * files load as plain <script> tags (works from file://) and under Node for
 * the headless test harness.
 * ==========================================================================*/
(function () {
  const G = (typeof window !== 'undefined') ? window : globalThis;
  const POKE = G.POKE = G.POKE || {};

  /* ---- Types ------------------------------------------------------------ */
  const TYPES = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting',
    'Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark',
    'Steel','Fairy'];

  // Only non-1x matchups are listed; everything else defaults to 1.
  const CHART = {
    Normal:   {Rock:0.5, Ghost:0, Steel:0.5},
    Fire:     {Fire:0.5, Water:0.5, Grass:2, Ice:2, Bug:2, Rock:0.5, Dragon:0.5, Steel:2},
    Water:    {Fire:2, Water:0.5, Grass:0.5, Ground:2, Rock:2, Dragon:0.5},
    Electric: {Water:2, Electric:0.5, Grass:0.5, Ground:0, Flying:2, Dragon:0.5},
    Grass:    {Fire:0.5, Water:2, Grass:0.5, Poison:0.5, Ground:2, Flying:0.5, Bug:0.5, Rock:2, Dragon:0.5, Steel:0.5},
    Ice:      {Fire:0.5, Water:0.5, Grass:2, Ice:0.5, Ground:2, Flying:2, Dragon:2, Steel:0.5},
    Fighting: {Normal:2, Ice:2, Poison:0.5, Flying:0.5, Psychic:0.5, Bug:0.5, Rock:2, Ghost:0, Dark:2, Steel:2, Fairy:0.5},
    Poison:   {Grass:2, Poison:0.5, Ground:0.5, Rock:0.5, Ghost:0.5, Steel:0, Fairy:2},
    Ground:   {Fire:2, Electric:2, Grass:0.5, Poison:2, Flying:0, Bug:0.5, Rock:2, Steel:2},
    Flying:   {Electric:0.5, Grass:2, Fighting:2, Bug:2, Rock:0.5, Steel:0.5},
    Psychic:  {Fighting:2, Poison:2, Psychic:0.5, Dark:0, Steel:0.5},
    Bug:      {Fire:0.5, Grass:2, Fighting:0.5, Poison:0.5, Flying:0.5, Psychic:2, Ghost:0.5, Dark:2, Steel:0.5, Fairy:0.5},
    Rock:     {Fire:2, Ice:2, Fighting:0.5, Ground:0.5, Flying:2, Bug:2, Steel:0.5},
    Ghost:    {Normal:0, Psychic:2, Ghost:2, Dark:0.5},
    Dragon:   {Dragon:2, Steel:0.5, Fairy:0},
    Dark:     {Fighting:0.5, Psychic:2, Ghost:2, Dark:0.5, Fairy:0.5},
    Steel:    {Fire:0.5, Water:0.5, Electric:0.5, Ice:2, Rock:2, Steel:0.5, Fairy:2},
    Fairy:    {Fire:0.5, Fighting:2, Poison:0.5, Dragon:2, Dark:2, Steel:0.5},
  };

  function typeMult(atkType, defType) {
    const row = CHART[atkType];
    if (!row) return 1;
    return (defType in row) ? row[defType] : 1;
  }
  // Effectiveness of a move type vs a list of defender types.
  function effectiveness(atkType, defTypes) {
    let m = 1;
    for (const t of defTypes) m *= typeMult(atkType, t);
    return m;
  }

  /* ---- Natures ---------------------------------------------------------- */
  // [boosted, lowered] stat keys; neutral natures omit both.
  const NATURES = {
    Adamant: ['atk', 'spa'], Modest: ['spa', 'atk'], Jolly: ['spe', 'spa'],
    Timid: ['spe', 'atk'], Bold: ['def', 'atk'], Impish: ['def', 'spa'],
    Calm: ['spd', 'atk'], Careful: ['spd', 'spa'], Naive: ['spe', 'spd'],
    Hasty: ['spe', 'def'], Quiet: ['spa', 'spe'], Relaxed: ['def', 'spe'],
    Sassy: ['spd', 'spe'], Brave: ['atk', 'spe'], Lonely: ['atk', 'def'],
    Serious: [null, null],
  };

  /* ---- Pokédex (Gen 9 base stats) --------------------------------------- */
  // stats: hp/atk/def/spa/spd/spe. weightkg used by a couple of moves.
  const DEX = {
    'Great Tusk':      {types:['Ground','Fighting'], stats:{hp:115,atk:131,def:131,spa:53,spd:53,spe:87}, weightkg:320},
    'Kingambit':       {types:['Dark','Steel'],      stats:{hp:100,atk:135,def:120,spa:60,spd:85,spe:50}, weightkg:120},
    'Gholdengo':       {types:['Steel','Ghost'],     stats:{hp:87,atk:60,def:95,spa:133,spd:91,spe:84},   weightkg:30},
    'Dragapult':       {types:['Dragon','Ghost'],    stats:{hp:88,atk:120,def:75,spa:100,spd:75,spe:142}, weightkg:50},
    'Slowking-Galar':  {types:['Poison','Psychic'],  stats:{hp:95,atk:65,def:80,spa:110,spd:110,spe:30},  weightkg:79.5},
    'Corviknight':     {types:['Flying','Steel'],    stats:{hp:98,atk:87,def:105,spa:53,spd:85,spe:67},   weightkg:75},
    'Glimmora':        {types:['Rock','Poison'],     stats:{hp:83,atk:55,def:90,spa:130,spd:81,spe:86},   weightkg:45},
    'Iron Valiant':    {types:['Fairy','Fighting'],  stats:{hp:74,atk:130,def:90,spa:120,spd:60,spe:116}, weightkg:35},
    'Roaring Moon':    {types:['Dragon','Dark'],     stats:{hp:105,atk:139,def:71,spa:55,spd:101,spe:119},weightkg:380},
    'Iron Moth':       {types:['Fire','Poison'],     stats:{hp:80,atk:70,def:60,spa:140,spd:110,spe:110}, weightkg:36},
    'Pelipper':        {types:['Water','Flying'],    stats:{hp:60,atk:50,def:100,spa:95,spd:70,spe:65},   weightkg:28},
    'Barraskewda':     {types:['Water'],             stats:{hp:61,atk:123,def:60,spa:60,spd:50,spe:136},  weightkg:30},
    'Raging Bolt':     {types:['Electric','Dragon'], stats:{hp:125,atk:73,def:91,spa:137,spd:89,spe:75},  weightkg:480},
    'Ogerpon-Wellspring':{types:['Grass','Water'],   stats:{hp:80,atk:120,def:84,spa:60,spd:96,spe:110},  weightkg:39.8},
    'Zapdos':          {types:['Electric','Flying'], stats:{hp:90,atk:90,def:85,spa:125,spd:90,spe:100},  weightkg:52.6},
    'Torkoal':         {types:['Fire'],              stats:{hp:70,atk:85,def:140,spa:85,spd:70,spe:20},   weightkg:80.4},
    'Hippowdon':       {types:['Ground'],            stats:{hp:108,atk:112,def:118,spa:68,spd:72,spe:47}, weightkg:300},
    'Excadrill':       {types:['Ground','Steel'],    stats:{hp:110,atk:135,def:60,spa:50,spd:65,spe:88},  weightkg:40.4},
  };

  /* ---- Moves ------------------------------------------------------------ *
   * category: Physical | Special | Status
   * Optional keys handled by the engine:
   *   priority, acc(true=never miss), recoil, drain, heal, highCrit, contact,
   *   sound, punch, slicing, bite, pulse, multihit:[min,max]|n, selfBoost{},
   *   boostsTarget{}, boostTarget:'self'|'foe', secondary:{chance,status,boosts,target},
   *   status, hazard:'sr'|'spikes'|'tspikes', switchOut, forceSwitch,
   *   recharge, chargeMove(sun-skip), sunPower, ivycudgel(type from mask),
   *   eruption(scale by hp), condition:'sucker'|'thunderclap', volatile:'protect',
   *   selfDrop{}, teraVaries, hitsDef(psyshock)
   * --------------------------------------------------------------------- */
  const MOVES = {
    // --- Physical ---
    'Headlong Rush':  {type:'Ground', category:'Physical', power:120, acc:100, pp:5, contact:true, selfDrop:{def:-1,spd:-1}},
    'Close Combat':   {type:'Fighting',category:'Physical', power:120, acc:100, pp:8, contact:true, selfDrop:{def:-1,spd:-1}},
    'Knock Off':      {type:'Dark',    category:'Physical', power:65,  acc:100, pp:20, contact:true, knockoff:true},
    'Rapid Spin':     {type:'Normal',  category:'Physical', power:50,  acc:100, pp:40, contact:true, spin:true, selfBoost:{spe:1}},
    'Ice Spinner':    {type:'Ice',     category:'Physical', power:80,  acc:100, pp:15, contact:true},
    'Kowtow Cleave':  {type:'Dark',    category:'Physical', power:85,  acc:true, pp:10, contact:true, slicing:true},
    'Iron Head':      {type:'Steel',   category:'Physical', power:80,  acc:100, pp:15, contact:true, secondary:{chance:30, flinch:true}},
    'Sucker Punch':   {type:'Dark',    category:'Physical', power:70,  acc:100, pp:5, priority:1, contact:true, condition:'sucker'},
    'U-turn':         {type:'Bug',     category:'Physical', power:70,  acc:100, pp:20, contact:true, switchOut:true},
    'Flip Turn':      {type:'Water',   category:'Physical', power:60,  acc:100, pp:20, contact:true, switchOut:true},
    'Aqua Jet':       {type:'Water',   category:'Physical', power:40,  acc:100, pp:20, priority:1, contact:true},
    'Brave Bird':     {type:'Flying',  category:'Physical', power:120, acc:100, pp:15, contact:true, recoil:1/3},
    'Body Press':     {type:'Fighting',category:'Physical', power:80,  acc:100, pp:10, contact:true, useDefAsAtk:true},
    'Liquidation':    {type:'Water',   category:'Physical', power:85,  acc:100, pp:10, contact:true, secondary:{chance:20, boosts:{def:-1}, target:'foe'}},
    'Ivy Cudgel':     {type:'Grass',   category:'Physical', power:100, acc:100, pp:10, highCrit:true, ivycudgel:true},
    'Horn Leech':     {type:'Grass',   category:'Physical', power:75,  acc:100, pp:10, contact:true, drain:0.5},
    'Crunch':         {type:'Dark',    category:'Physical', power:80,  acc:100, pp:15, contact:true, bite:true, secondary:{chance:20, boosts:{def:-1}, target:'foe'}},
    'Earthquake':     {type:'Ground',  category:'Physical', power:100, acc:100, pp:10},
    'Dragon Claw':    {type:'Dragon',  category:'Physical', power:80,  acc:100, pp:15, contact:true},
    'Rock Slide':     {type:'Rock',    category:'Physical', power:75,  acc:90,  pp:10, secondary:{chance:30, flinch:true}},

    // --- Special ---
    'Make It Rain':   {type:'Steel',   category:'Special', power:120, acc:100, pp:5, selfDrop:{spa:-1}},
    'Shadow Ball':    {type:'Ghost',   category:'Special', power:80,  acc:100, pp:15, secondary:{chance:20, boosts:{spd:-1}, target:'foe'}},
    'Focus Blast':    {type:'Fighting',category:'Special', power:120, acc:70,  pp:5, secondary:{chance:10, boosts:{spd:-1}, target:'foe'}},
    'Thunderbolt':    {type:'Electric',category:'Special', power:90,  acc:100, pp:15, secondary:{chance:10, status:'par'}},
    'Draco Meteor':   {type:'Dragon',  category:'Special', power:130, acc:90,  pp:5, selfDrop:{spa:-2}},
    'Flamethrower':   {type:'Fire',    category:'Special', power:90,  acc:100, pp:15, secondary:{chance:10, status:'brn'}},
    'Hurricane':      {type:'Flying',  category:'Special', power:110, acc:70,  pp:10, rainPerfect:true, secondary:{chance:30, confuse:true}},
    'Surf':           {type:'Water',   category:'Special', power:90,  acc:100, pp:15},
    'Moonblast':      {type:'Fairy',   category:'Special', power:95,  acc:100, pp:15, secondary:{chance:30, boosts:{spa:-1}, target:'foe'}},
    'Psyshock':       {type:'Psychic', category:'Special', power:80,  acc:100, pp:10, hitsDef:true},
    'Sludge Bomb':    {type:'Poison',  category:'Special', power:90,  acc:100, pp:10, secondary:{chance:30, status:'psn'}},
    'Sludge Wave':    {type:'Poison',  category:'Special', power:95,  acc:100, pp:10, secondary:{chance:10, status:'psn'}},
    'Ice Beam':       {type:'Ice',     category:'Special', power:90,  acc:100, pp:10, secondary:{chance:10, status:'frz'}},
    'Energy Ball':    {type:'Grass',   category:'Special', power:90,  acc:100, pp:10, secondary:{chance:10, boosts:{spd:-1}, target:'foe'}},
    'Dazzling Gleam': {type:'Fairy',   category:'Special', power:80,  acc:100, pp:10},
    'Fiery Dance':    {type:'Fire',    category:'Special', power:80,  acc:100, pp:10, secondary:{chance:50, boosts:{spa:1}, target:'self'}},
    'Thunderclap':    {type:'Electric',category:'Special', power:70,  acc:100, pp:5, priority:1, condition:'sucker'},
    'Power Gem':      {type:'Rock',    category:'Special', power:80,  acc:100, pp:20},
    'Earth Power':    {type:'Ground',  category:'Special', power:90,  acc:100, pp:10, secondary:{chance:10, boosts:{spd:-1}, target:'foe'}},
    'Eruption':       {type:'Fire',    category:'Special', power:150, acc:100, pp:5, eruption:true},
    'Solar Beam':     {type:'Grass',   category:'Special', power:120, acc:100, pp:10, charge:'sun'},
    'Volt Switch':    {type:'Electric',category:'Special', power:70,  acc:100, pp:20, switchOut:true},

    // --- Status ---
    'Swords Dance':   {type:'Normal', category:'Status', pp:20, selfBoost:{atk:2}},
    'Calm Mind':      {type:'Psychic',category:'Status', pp:20, selfBoost:{spa:1,spd:1}},
    'Dragon Dance':   {type:'Dragon', category:'Status', pp:20, selfBoost:{atk:1,spe:1}},
    'Roost':          {type:'Flying', category:'Status', pp:5, heal:0.5, roost:true},
    'Slack Off':      {type:'Normal', category:'Status', pp:5, heal:0.5},
    'Stealth Rock':   {type:'Rock',   category:'Status', pp:20, hazard:'sr'},
    'Thunder Wave':   {type:'Electric',category:'Status', pp:20, acc:90, status:'par', statusTarget:'foe'},
    'Whirlwind':      {type:'Normal', category:'Status', pp:20, acc:true, priority:-6, forceSwitch:true},
    'Protect':        {type:'Normal', category:'Status', pp:10, priority:4, volatile:'protect'},
  };

  /* ---- Competitive OU teams --------------------------------------------- *
   * Each set: {species,item,ability,nature,evs,moves,tera}. IVs assumed 31
   * except atk 0 for pure special attackers (engine handles this from role).
   * --------------------------------------------------------------------- */
  const E = (o) => Object.assign({hp:0,atk:0,def:0,spa:0,spd:0,spe:0}, o);

  const TEAMS = {
    balance: {
      name: 'Standard Balance',
      desc: 'A well-rounded OU squad: hazards, a spinner, pivots, and Kingambit as a late-game cleaner.',
      sets: [
        {species:'Great Tusk', item:'Heavy-Duty Boots', ability:'Protosynthesis', nature:'Jolly',
          evs:E({atk:252,def:4,spe:252}), moves:['Headlong Rush','Close Combat','Knock Off','Rapid Spin'], tera:'Steel'},
        {species:'Kingambit', item:'Leftovers', ability:'Supreme Overlord', nature:'Adamant',
          evs:E({hp:112,atk:252,spe:144}), moves:['Kowtow Cleave','Iron Head','Sucker Punch','Swords Dance'], tera:'Fairy'},
        {species:'Gholdengo', item:'Air Balloon', ability:'Good as Gold', nature:'Timid',
          evs:E({hp:80,spa:252,spe:176}), moves:['Make It Rain','Shadow Ball','Focus Blast','Thunderbolt'], tera:'Flying'},
        {species:'Dragapult', item:'Heavy-Duty Boots', ability:'Infiltrator', nature:'Timid',
          evs:E({spa:252,def:4,spe:252}), moves:['Draco Meteor','Shadow Ball','Flamethrower','U-turn'], tera:'Ghost'},
        {species:'Slowking-Galar', item:'Heavy-Duty Boots', ability:'Regenerator', nature:'Calm',
          evs:E({hp:252,def:16,spd:240}), moves:['Sludge Bomb','Psyshock','Flamethrower','Thunder Wave'], tera:'Water'},
        {species:'Corviknight', item:'Rocky Helmet', ability:'Pressure', nature:'Impish',
          evs:E({hp:252,def:168,spd:88}), moves:['Brave Bird','Body Press','Roost','U-turn'], tera:'Dragon'},
      ],
    },
    offense: {
      name: 'Hyper Offense',
      desc: 'Glimmora sets the tone with hazards and a Focus Sash, then four fast breakers apply relentless pressure.',
      sets: [
        {species:'Glimmora', item:'Focus Sash', ability:'Toxic Debris', nature:'Timid',
          evs:E({spa:252,def:4,spe:252}), moves:['Stealth Rock','Power Gem','Earth Power','Sludge Wave'], tera:'Grass'},
        {species:'Iron Valiant', item:'Booster Energy', ability:'Quark Drive', nature:'Timid',
          evs:E({spa:252,def:4,spe:252}), moves:['Moonblast','Focus Blast','Psyshock','Thunderbolt'], tera:'Electric'},
        {species:'Roaring Moon', item:'Booster Energy', ability:'Protosynthesis', nature:'Jolly',
          evs:E({atk:252,def:4,spe:252}), moves:['Dragon Dance','Knock Off','Earthquake','Dragon Claw'], tera:'Dark'},
        {species:'Iron Moth', item:'Booster Energy', ability:'Quark Drive', nature:'Timid',
          evs:E({spa:252,def:4,spe:252}), moves:['Fiery Dance','Sludge Wave','Energy Ball','Dazzling Gleam'], tera:'Grass'},
        {species:'Kingambit', item:'Air Balloon', ability:'Supreme Overlord', nature:'Adamant',
          evs:E({hp:112,atk:252,spe:144}), moves:['Kowtow Cleave','Iron Head','Sucker Punch','Swords Dance'], tera:'Fairy'},
        {species:'Great Tusk', item:'Booster Energy', ability:'Protosynthesis', nature:'Jolly',
          evs:E({atk:252,def:4,spe:252}), moves:['Headlong Rush','Close Combat','Ice Spinner','Rapid Spin'], tera:'Steel'},
      ],
    },
    rain: {
      name: 'Rain Offense',
      desc: 'Pelipper turns on the rain so Barraskewda and Raging Bolt hit like trucks with perfect-accuracy Hurricanes backing them.',
      sets: [
        {species:'Pelipper', item:'Heavy-Duty Boots', ability:'Drizzle', nature:'Bold',
          evs:E({hp:252,def:252,spd:4}), moves:['Hurricane','Surf','U-turn','Roost'], tera:'Ground'},
        {species:'Barraskewda', item:'Choice Band', ability:'Swift Swim', nature:'Adamant',
          evs:E({atk:252,def:4,spe:252}), moves:['Liquidation','Flip Turn','Close Combat','Aqua Jet'], tera:'Water'},
        {species:'Raging Bolt', item:'Booster Energy', ability:'Protosynthesis', nature:'Modest',
          evs:E({hp:64,spa:252,spe:192}), moves:['Thunderclap','Thunderbolt','Draco Meteor','Calm Mind'], tera:'Electric'},
        {species:'Ogerpon-Wellspring', item:'Wellspring Mask', ability:'Water Absorb', nature:'Jolly',
          evs:E({atk:252,def:4,spe:252}), moves:['Ivy Cudgel','Horn Leech','Knock Off','Swords Dance'], tera:'Water'},
        {species:'Zapdos', item:'Heavy-Duty Boots', ability:'Static', nature:'Timid',
          evs:E({hp:48,spa:208,spe:252}), moves:['Hurricane','Thunderbolt','Volt Switch','Roost'], tera:'Steel'},
        {species:'Gholdengo', item:'Choice Scarf', ability:'Good as Gold', nature:'Timid',
          evs:E({spa:252,def:4,spe:252}), moves:['Make It Rain','Shadow Ball','Thunderbolt','Focus Blast'], tera:'Flying'},
      ],
    },
    sun: {
      name: 'Sun Offense',
      desc: 'Torkoal blasts Eruptions while the Protosynthesis Paradox trio (Roaring Moon, Raging Bolt, Iron Moth) snowballs in the sunlight.',
      sets: [
        {species:'Torkoal', item:'Heat Rock', ability:'Drought', nature:'Quiet',
          evs:E({hp:252,spa:252,def:4}), moves:['Eruption','Solar Beam','Earth Power','Body Press'], tera:'Fire'},
        {species:'Roaring Moon', item:'Booster Energy', ability:'Protosynthesis', nature:'Jolly',
          evs:E({atk:252,def:4,spe:252}), moves:['Dragon Dance','Knock Off','Earthquake','Dragon Claw'], tera:'Dark'},
        {species:'Raging Bolt', item:'Booster Energy', ability:'Protosynthesis', nature:'Modest',
          evs:E({hp:64,spa:252,spe:192}), moves:['Thunderclap','Thunderbolt','Draco Meteor','Calm Mind'], tera:'Electric'},
        {species:'Iron Moth', item:'Booster Energy', ability:'Quark Drive', nature:'Timid',
          evs:E({spa:252,def:4,spe:252}), moves:['Fiery Dance','Sludge Wave','Energy Ball','Dazzling Gleam'], tera:'Grass'},
        {species:'Great Tusk', item:'Heavy-Duty Boots', ability:'Protosynthesis', nature:'Jolly',
          evs:E({atk:252,def:4,spe:252}), moves:['Headlong Rush','Close Combat','Ice Spinner','Rapid Spin'], tera:'Steel'},
        {species:'Gholdengo', item:'Choice Specs', ability:'Good as Gold', nature:'Timid',
          evs:E({spa:252,def:4,spe:252}), moves:['Make It Rain','Shadow Ball','Focus Blast','Thunderbolt'], tera:'Flying'},
      ],
    },
    sand: {
      name: 'Sand Balance',
      desc: 'Hippowdon anchors the sand and hazards; Excadrill becomes a Sand Rush terror while Kingambit and Dragapult clean up.',
      sets: [
        {species:'Hippowdon', item:'Leftovers', ability:'Sand Stream', nature:'Impish',
          evs:E({hp:252,def:184,spd:72}), moves:['Earthquake','Stealth Rock','Slack Off','Whirlwind'], tera:'Grass'},
        {species:'Excadrill', item:'Leftovers', ability:'Sand Rush', nature:'Adamant',
          evs:E({hp:4,atk:252,spe:252}), moves:['Earthquake','Iron Head','Rock Slide','Rapid Spin'], tera:'Ground'},
        {species:'Great Tusk', item:'Booster Energy', ability:'Protosynthesis', nature:'Jolly',
          evs:E({atk:252,def:4,spe:252}), moves:['Headlong Rush','Close Combat','Ice Spinner','Rapid Spin'], tera:'Steel'},
        {species:'Gholdengo', item:'Air Balloon', ability:'Good as Gold', nature:'Timid',
          evs:E({hp:80,spa:252,spe:176}), moves:['Make It Rain','Shadow Ball','Focus Blast','Thunderbolt'], tera:'Flying'},
        {species:'Dragapult', item:'Heavy-Duty Boots', ability:'Infiltrator', nature:'Timid',
          evs:E({spa:252,def:4,spe:252}), moves:['Draco Meteor','Shadow Ball','Flamethrower','U-turn'], tera:'Ghost'},
        {species:'Kingambit', item:'Leftovers', ability:'Supreme Overlord', nature:'Adamant',
          evs:E({hp:112,atk:252,spe:144}), moves:['Kowtow Cleave','Iron Head','Sucker Punch','Swords Dance'], tera:'Fairy'},
      ],
    },
  };

  /* ---- Opponent personas ------------------------------------------------ *
   * These are AI personalities, not real people. Each maps to an AI config
   * (see ai.js) and a preferred team. "Claude" is the flagship deep-search
   * opponent the player is challenging.
   * --------------------------------------------------------------------- */
  const PERSONAS = [
    {id:'rookie', name:'Youngster Kai', title:'Casual Ladder Player', elo:1100, avatar:'🧢',
      team:'balance', ai:{depth:1, greedy:0.9, predict:0.1, switchiness:0.2, riskTaking:0.5, tera:'late'},
      blurb:'Just here for fun. Clicks the move that does the most damage and hopes for the best.'},
    {id:'grinder', name:'Ladder Grinder Max', title:'1500 Ladder Regular', elo:1500, avatar:'⚙️',
      team:'sand', ai:{depth:1, greedy:0.6, predict:0.35, switchiness:0.45, riskTaking:0.5, tera:'value'},
      blurb:'Solid fundamentals — plays the matchup, keeps hazards up, and rarely misclicks.'},
    {id:'wall', name:'The Architect', title:'Balance Specialist', elo:1650, avatar:'🏛️',
      team:'balance', ai:{depth:2, greedy:0.4, predict:0.55, switchiness:0.7, riskTaking:0.3, tera:'value'},
      blurb:'Patient and positional. Pivots, preserves win conditions, and punishes greed.'},
    {id:'hazard', name:'Hazard Lord Vex', title:'Hyper Offense Menace', elo:1750, avatar:'🌪️',
      team:'offense', ai:{depth:2, greedy:0.65, predict:0.6, switchiness:0.5, riskTaking:0.75, tera:'aggro'},
      blurb:'Stacks hazards, keeps momentum, and forces you to make the right read every single turn.'},
    {id:'rainlord', name:'Tempest', title:'Weather Abuser', elo:1820, avatar:'🌧️',
      team:'rain', ai:{depth:2, greedy:0.6, predict:0.6, switchiness:0.55, riskTaking:0.7, tera:'value'},
      blurb:'Turns on the rain and drowns you in perfectly-accurate Hurricanes and Swift Swim sweeps.'},
    {id:'finalist', name:'World Finalist AI', title:'Tournament Grandmaster', elo:1950, avatar:'👑',
      team:'sun', ai:{depth:3, greedy:0.45, predict:0.8, switchiness:0.65, riskTaking:0.6, tera:'value'},
      blurb:'Reads you like a book. Deep lookahead, ruthless sequencing, and immaculate Tera timing.'},
    {id:'claude', name:'Claude', title:'The One You Came For', elo:2000, avatar:'🤖',
      team:'balance', ai:{depth:3, greedy:0.4, predict:0.85, switchiness:0.7, riskTaking:0.55, tera:'value'},
      blurb:'Deep expectimax search with opponent modeling. Predicts your switches, values long-term position, and Terastallizes at the exact right moment. This is who you challenged.'},
  ];

  POKE.data = {
    TYPES, CHART, typeMult, effectiveness, NATURES, DEX, MOVES, TEAMS, PERSONAS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = POKE;
})();
