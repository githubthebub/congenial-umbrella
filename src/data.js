// ---------------------------------------------------------------------------
// data.js — types, type chart, moves, species, presets, raid bosses.
// Pure data + tiny helpers. No DOM, no side effects. Importable in Node & browser.
// Base stats / types / move values follow canonical Pokémon values (Gen 8/9).
// ---------------------------------------------------------------------------

export const TYPES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
  'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark',
  'Steel', 'Fairy',
];

// Type-flavored accent colors (used by the UI for badges + juice).
export const TYPE_COLORS = {
  Normal: '#9099a1', Fire: '#ff9d55', Water: '#4d90d5', Electric: '#f4d23c',
  Grass: '#63bc5a', Ice: '#73cec0', Fighting: '#ce4069', Poison: '#ab6ac8',
  Ground: '#d97845', Flying: '#8fa9de', Psychic: '#f97176', Bug: '#90c12c',
  Rock: '#c7b78b', Ghost: '#5269ac', Dragon: '#0b6dc3', Dark: '#5a5366',
  Steel: '#5a8ea1', Fairy: '#ec8fe6',
};

// Attacker -> Defender multipliers. Only non-1.0 entries listed; default = 1.
const CHART = {
  Normal:   { Rock: .5, Ghost: 0, Steel: .5 },
  Fire:     { Fire: .5, Water: .5, Grass: 2, Ice: 2, Bug: 2, Rock: .5, Dragon: .5, Steel: 2 },
  Water:    { Fire: 2, Water: .5, Grass: .5, Ground: 2, Rock: 2, Dragon: .5 },
  Electric: { Water: 2, Electric: .5, Grass: .5, Ground: 0, Flying: 2, Dragon: .5 },
  Grass:    { Fire: .5, Water: 2, Grass: .5, Poison: .5, Ground: 2, Flying: .5, Bug: .5, Rock: 2, Dragon: .5, Steel: .5 },
  Ice:      { Fire: .5, Water: .5, Grass: 2, Ice: .5, Ground: 2, Flying: 2, Dragon: 2, Steel: .5 },
  Fighting: { Normal: 2, Ice: 2, Poison: .5, Flying: .5, Psychic: .5, Bug: .5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: .5 },
  Poison:   { Grass: 2, Poison: .5, Ground: .5, Rock: .5, Ghost: .5, Steel: 0, Fairy: 2 },
  Ground:   { Fire: 2, Electric: 2, Grass: .5, Poison: 2, Flying: 0, Bug: .5, Rock: 2, Steel: 2 },
  Flying:   { Electric: .5, Grass: 2, Fighting: 2, Bug: 2, Rock: .5, Steel: .5 },
  Psychic:  { Fighting: 2, Poison: 2, Psychic: .5, Dark: 0, Steel: .5 },
  Bug:      { Fire: .5, Grass: 2, Fighting: .5, Poison: .5, Flying: .5, Psychic: 2, Ghost: .5, Dark: 2, Steel: .5, Fairy: .5 },
  Rock:     { Fire: 2, Ice: 2, Fighting: .5, Ground: .5, Flying: 2, Bug: 2, Steel: .5 },
  Ghost:    { Normal: 0, Psychic: 2, Ghost: 2, Dark: .5 },
  Dragon:   { Dragon: 2, Steel: .5, Fairy: 0 },
  Dark:     { Fighting: .5, Psychic: 2, Ghost: 2, Dark: .5, Fairy: .5 },
  Steel:    { Fire: .5, Water: .5, Electric: .5, Ice: 2, Rock: 2, Steel: .5, Fairy: 2 },
  Fairy:    { Fire: .5, Fighting: 2, Poison: .5, Dragon: 2, Dark: 2, Steel: .5 },
};

export function typeMult(atkType, defType) {
  const row = CHART[atkType];
  if (!row) return 1;
  return defType in row ? row[defType] : 1;
}

export function effectiveness(atkType, defenderTypes) {
  return defenderTypes.reduce((m, t) => m * typeMult(atkType, t), 1);
}

// ---------------------------------------------------------------------------
// Moves. category: Physical | Special | Status.
// effect fields (all optional):
//   status: 'brn'|'psn'|'tox'|'par'|'slp'|'frz'  chance: 0..1 (default 1 for status moves)
//   boosts: {stat: stage}  target: 'self'|'target'  boostChance
//   heal: fraction of max HP healed (self)         drain: fraction of damage dealt healed
//   recoil: fraction of damage dealt taken         flinch: chance
//   crit: extra crit stages (high-crit moves)      recharge: true
//   priority (number)   protect: true   neverMiss: true   selfDrop:{stat,stage}
// ---------------------------------------------------------------------------
export const MOVES = {
  // Normal
  tackle:      { name: 'Tackle', type: 'Normal', category: 'Physical', power: 40, acc: 100, pp: 35 },
  bodyslam:    { name: 'Body Slam', type: 'Normal', category: 'Physical', power: 85, acc: 100, pp: 15, status: 'par', chance: .3 },
  doubleedge:  { name: 'Double-Edge', type: 'Normal', category: 'Physical', power: 120, acc: 100, pp: 15, recoil: 1/3 },
  return:      { name: 'Return', type: 'Normal', category: 'Physical', power: 102, acc: 100, pp: 20 },
  hyperbeam:   { name: 'Hyper Beam', type: 'Normal', category: 'Special', power: 150, acc: 90, pp: 5, recharge: true },
  quickattack: { name: 'Quick Attack', type: 'Normal', category: 'Physical', power: 40, acc: 100, pp: 30, priority: 1 },
  extremespeed:{ name: 'Extreme Speed', type: 'Normal', category: 'Physical', power: 80, acc: 100, pp: 5, priority: 2 },
  swordsdance: { name: 'Swords Dance', type: 'Normal', category: 'Status', pp: 20, boosts: { atk: 2 }, target: 'self' },
  // Fire
  ember:       { name: 'Ember', type: 'Fire', category: 'Special', power: 40, acc: 100, pp: 25, status: 'brn', chance: .1 },
  flamethrower:{ name: 'Flamethrower', type: 'Fire', category: 'Special', power: 90, acc: 100, pp: 15, status: 'brn', chance: .1 },
  fireblast:   { name: 'Fire Blast', type: 'Fire', category: 'Special', power: 110, acc: 85, pp: 5, status: 'brn', chance: .1 },
  firepunch:   { name: 'Fire Punch', type: 'Fire', category: 'Physical', power: 75, acc: 100, pp: 15, status: 'brn', chance: .1 },
  flareblitz:  { name: 'Flare Blitz', type: 'Fire', category: 'Physical', power: 120, acc: 100, pp: 15, recoil: 1/3, status: 'brn', chance: .1 },
  overheat:    { name: 'Overheat', type: 'Fire', category: 'Special', power: 130, acc: 90, pp: 5, selfDrop: { stat: 'spa', stage: 2 } },
  willowisp:   { name: 'Will-O-Wisp', type: 'Fire', category: 'Status', acc: 85, pp: 15, status: 'brn' },
  // Water
  watergun:    { name: 'Water Gun', type: 'Water', category: 'Special', power: 40, acc: 100, pp: 25 },
  surf:        { name: 'Surf', type: 'Water', category: 'Special', power: 90, acc: 100, pp: 15 },
  hydropump:   { name: 'Hydro Pump', type: 'Water', category: 'Special', power: 110, acc: 80, pp: 5 },
  scald:       { name: 'Scald', type: 'Water', category: 'Special', power: 80, acc: 100, pp: 15, status: 'brn', chance: .3 },
  aquajet:     { name: 'Aqua Jet', type: 'Water', category: 'Physical', power: 40, acc: 100, pp: 20, priority: 1 },
  waterfall:   { name: 'Waterfall', type: 'Water', category: 'Physical', power: 80, acc: 100, pp: 15, flinch: .2 },
  // Electric
  thunderbolt: { name: 'Thunderbolt', type: 'Electric', category: 'Special', power: 90, acc: 100, pp: 15, status: 'par', chance: .1 },
  thunder:     { name: 'Thunder', type: 'Electric', category: 'Special', power: 110, acc: 70, pp: 10, status: 'par', chance: .3 },
  thunderpunch:{ name: 'Thunder Punch', type: 'Electric', category: 'Physical', power: 75, acc: 100, pp: 15, status: 'par', chance: .1 },
  wildcharge:  { name: 'Wild Charge', type: 'Electric', category: 'Physical', power: 90, acc: 100, pp: 15, recoil: .25 },
  thunderwave: { name: 'Thunder Wave', type: 'Electric', category: 'Status', acc: 90, pp: 20, status: 'par' },
  voltswitch:  { name: 'Volt Switch', type: 'Electric', category: 'Special', power: 70, acc: 100, pp: 20 },
  // Grass
  vinewhip:    { name: 'Vine Whip', type: 'Grass', category: 'Physical', power: 45, acc: 100, pp: 25 },
  energyball:  { name: 'Energy Ball', type: 'Grass', category: 'Special', power: 90, acc: 100, pp: 10, boosts: { spd: -1 }, target: 'target', boostChance: .1 },
  gigadrain:   { name: 'Giga Drain', type: 'Grass', category: 'Special', power: 75, acc: 100, pp: 10, drain: .5 },
  leafblade:   { name: 'Leaf Blade', type: 'Grass', category: 'Physical', power: 90, acc: 100, pp: 15, crit: 1 },
  powerwhip:   { name: 'Power Whip', type: 'Grass', category: 'Physical', power: 120, acc: 85, pp: 10 },
  leechseed:   { name: 'Leech Seed', type: 'Grass', category: 'Status', acc: 90, pp: 10, seed: true },
  synthesis:   { name: 'Synthesis', type: 'Grass', category: 'Status', pp: 5, heal: .5 },
  // Ice
  icebeam:     { name: 'Ice Beam', type: 'Ice', category: 'Special', power: 90, acc: 100, pp: 10, status: 'frz', chance: .1 },
  blizzard:    { name: 'Blizzard', type: 'Ice', category: 'Special', power: 110, acc: 70, pp: 5, status: 'frz', chance: .1 },
  icepunch:    { name: 'Ice Punch', type: 'Ice', category: 'Physical', power: 75, acc: 100, pp: 15, status: 'frz', chance: .1 },
  iceshard:    { name: 'Ice Shard', type: 'Ice', category: 'Physical', power: 40, acc: 100, pp: 30, priority: 1 },
  // Fighting
  aurasphere:  { name: 'Aura Sphere', type: 'Fighting', category: 'Special', power: 80, acc: 100, pp: 20, neverMiss: true },
  closecombat: { name: 'Close Combat', type: 'Fighting', category: 'Physical', power: 120, acc: 100, pp: 5, selfDrop: { stat: 'def', stage: 1, stat2: 'spd', stage2: 1 } },
  drainpunch:  { name: 'Drain Punch', type: 'Fighting', category: 'Physical', power: 75, acc: 100, pp: 10, drain: .5 },
  machpunch:   { name: 'Mach Punch', type: 'Fighting', category: 'Physical', power: 40, acc: 100, pp: 30, priority: 1 },
  brickbreak:  { name: 'Brick Break', type: 'Fighting', category: 'Physical', power: 75, acc: 100, pp: 15 },
  dynamicpunch:{ name: 'Dynamic Punch', type: 'Fighting', category: 'Physical', power: 100, acc: 100, pp: 5 },
  // Poison
  sludgebomb:  { name: 'Sludge Bomb', type: 'Poison', category: 'Special', power: 90, acc: 100, pp: 10, status: 'psn', chance: .3 },
  poisonjab:   { name: 'Poison Jab', type: 'Poison', category: 'Physical', power: 80, acc: 100, pp: 20, status: 'psn', chance: .3 },
  toxic:       { name: 'Toxic', type: 'Poison', category: 'Status', acc: 90, pp: 10, status: 'tox' },
  gunkshot:    { name: 'Gunk Shot', type: 'Poison', category: 'Physical', power: 120, acc: 80, pp: 5, status: 'psn', chance: .3 },
  // Ground
  earthquake:  { name: 'Earthquake', type: 'Ground', category: 'Physical', power: 100, acc: 100, pp: 10 },
  earthpower:  { name: 'Earth Power', type: 'Ground', category: 'Special', power: 90, acc: 100, pp: 10, boosts: { spd: -1 }, target: 'target', boostChance: .1 },
  highhorsepower:{ name: 'High Horsepower', type: 'Ground', category: 'Physical', power: 95, acc: 95, pp: 10 },
  // Flying
  airslash:    { name: 'Air Slash', type: 'Flying', category: 'Special', power: 75, acc: 95, pp: 15, flinch: .3 },
  bravebird:   { name: 'Brave Bird', type: 'Flying', category: 'Physical', power: 120, acc: 100, pp: 15, recoil: 1/3 },
  hurricane:   { name: 'Hurricane', type: 'Flying', category: 'Special', power: 110, acc: 70, pp: 10 },
  roost:       { name: 'Roost', type: 'Flying', category: 'Status', pp: 5, heal: .5 },
  // Psychic
  psychic:     { name: 'Psychic', type: 'Psychic', category: 'Special', power: 90, acc: 100, pp: 10, boosts: { spd: -1 }, target: 'target', boostChance: .1 },
  psyshock:    { name: 'Psyshock', type: 'Psychic', category: 'Special', power: 80, acc: 100, pp: 10 },
  calmmind:    { name: 'Calm Mind', type: 'Psychic', category: 'Status', pp: 20, boosts: { spa: 1, spd: 1 }, target: 'self' },
  recover:     { name: 'Recover', type: 'Psychic', category: 'Status', pp: 5, heal: .5 },
  // Bug
  xscissor:    { name: 'X-Scissor', type: 'Bug', category: 'Physical', power: 80, acc: 100, pp: 15 },
  bugbuzz:     { name: 'Bug Buzz', type: 'Bug', category: 'Special', power: 90, acc: 100, pp: 10, boosts: { spd: -1 }, target: 'target', boostChance: .1 },
  uturn:       { name: 'U-turn', type: 'Bug', category: 'Physical', power: 70, acc: 100, pp: 20 },
  quiverdance: { name: 'Quiver Dance', type: 'Bug', category: 'Status', pp: 20, boosts: { spa: 1, spd: 1, spe: 1 }, target: 'self' },
  // Rock
  rockslide:   { name: 'Rock Slide', type: 'Rock', category: 'Physical', power: 75, acc: 90, pp: 10, flinch: .3 },
  stoneedge:   { name: 'Stone Edge', type: 'Rock', category: 'Physical', power: 100, acc: 80, pp: 5, crit: 1 },
  powergem:    { name: 'Power Gem', type: 'Rock', category: 'Special', power: 80, acc: 100, pp: 20 },
  // Ghost
  shadowball:  { name: 'Shadow Ball', type: 'Ghost', category: 'Special', power: 80, acc: 100, pp: 15, boosts: { spd: -1 }, target: 'target', boostChance: .2 },
  shadowclaw:  { name: 'Shadow Claw', type: 'Ghost', category: 'Physical', power: 70, acc: 100, pp: 15, crit: 1 },
  shadowsneak: { name: 'Shadow Sneak', type: 'Ghost', category: 'Physical', power: 40, acc: 100, pp: 30, priority: 1 },
  poltergeist: { name: 'Poltergeist', type: 'Ghost', category: 'Physical', power: 110, acc: 90, pp: 5 },
  // Dragon
  dragonpulse: { name: 'Dragon Pulse', type: 'Dragon', category: 'Special', power: 85, acc: 100, pp: 10 },
  dragonclaw:  { name: 'Dragon Claw', type: 'Dragon', category: 'Physical', power: 80, acc: 100, pp: 15 },
  outrage:     { name: 'Outrage', type: 'Dragon', category: 'Physical', power: 120, acc: 100, pp: 10 },
  dracometeor: { name: 'Draco Meteor', type: 'Dragon', category: 'Special', power: 130, acc: 90, pp: 5, selfDrop: { stat: 'spa', stage: 2 } },
  dragondance: { name: 'Dragon Dance', type: 'Dragon', category: 'Status', pp: 20, boosts: { atk: 1, spe: 1 }, target: 'self' },
  // Dark
  crunch:      { name: 'Crunch', type: 'Dark', category: 'Physical', power: 80, acc: 100, pp: 15, boosts: { def: -1 }, target: 'target', boostChance: .2 },
  darkpulse:   { name: 'Dark Pulse', type: 'Dark', category: 'Special', power: 80, acc: 100, pp: 15, flinch: .2 },
  knockoff:    { name: 'Knock Off', type: 'Dark', category: 'Physical', power: 65, acc: 100, pp: 20 },
  suckerpunch: { name: 'Sucker Punch', type: 'Dark', category: 'Physical', power: 70, acc: 100, pp: 5, priority: 1 },
  nastyplot:   { name: 'Nasty Plot', type: 'Dark', category: 'Status', pp: 20, boosts: { spa: 2 }, target: 'self' },
  // Steel
  ironhead:    { name: 'Iron Head', type: 'Steel', category: 'Physical', power: 80, acc: 100, pp: 15, flinch: .3 },
  flashcannon: { name: 'Flash Cannon', type: 'Steel', category: 'Special', power: 80, acc: 100, pp: 10, boosts: { spd: -1 }, target: 'target', boostChance: .1 },
  bulletpunch: { name: 'Bullet Punch', type: 'Steel', category: 'Physical', power: 40, acc: 100, pp: 30, priority: 1 },
  meteormash:  { name: 'Meteor Mash', type: 'Steel', category: 'Physical', power: 90, acc: 90, pp: 10, boosts: { atk: 1 }, target: 'self', boostChance: .2 },
  irondefense: { name: 'Iron Defense', type: 'Steel', category: 'Status', pp: 15, boosts: { def: 2 }, target: 'self' },
  // Fairy
  moonblast:   { name: 'Moonblast', type: 'Fairy', category: 'Special', power: 95, acc: 100, pp: 15, boosts: { spa: -1 }, target: 'target', boostChance: .3 },
  playrough:   { name: 'Play Rough', type: 'Fairy', category: 'Physical', power: 90, acc: 90, pp: 10, boosts: { atk: -1 }, target: 'target', boostChance: .1 },
  dazzlinggleam:{ name: 'Dazzling Gleam', type: 'Fairy', category: 'Special', power: 80, acc: 100, pp: 10 },
};

// ---------------------------------------------------------------------------
// Species. base stats in canonical order. `dex` drives sprite URLs.
// `anim` = has Gen-V animated sprite (front+back); else UI falls back to art.
// ---------------------------------------------------------------------------
function S(id, dex, name, types, base, moves, anim = true, role = '') {
  return { id, dex, name, types, base, moves, anim, role };
}

export const SPECIES = [
  // ---- Kanto ----
  S('venusaur', 3, 'Venusaur', ['Grass', 'Poison'], [80,82,83,100,100,80], ['gigadrain','sludgebomb','synthesis','leechseed'], true, 'Bulky attacker'),
  S('charizard', 6, 'Charizard', ['Fire', 'Flying'], [78,84,78,109,85,100], ['flamethrower','airslash','dragonpulse','roost'], true, 'Special sweeper'),
  S('blastoise', 9, 'Blastoise', ['Water'], [79,83,100,85,105,78], ['surf','icebeam','flashcannon','recover'], true, 'Bulky water'),
  S('arcanine', 59, 'Arcanine', ['Fire'], [90,110,80,100,80,95], ['flareblitz','wildcharge','closecombat','extremespeed'], true, 'Physical wallbreaker'),
  S('alakazam', 65, 'Alakazam', ['Psychic'], [55,50,45,135,95,120], ['psychic','shadowball','dazzlinggleam','calmmind'], true, 'Frail sweeper'),
  S('machamp', 68, 'Machamp', ['Fighting'], [90,130,80,65,85,55], ['dynamicpunch','icepunch','earthquake','bulletpunch'], true, 'Bulky brawler'),
  S('gengar', 94, 'Gengar', ['Ghost', 'Poison'], [60,65,60,130,75,110], ['shadowball','sludgebomb','psychic','nastyplot'], true, 'Speedy special'),
  S('starmie', 121, 'Starmie', ['Water', 'Psychic'], [60,75,85,100,85,115], ['surf','psychic','icebeam','recover'], true, 'Fast pivot'),
  S('gyarados', 130, 'Gyarados', ['Water', 'Flying'], [95,125,79,60,100,81], ['waterfall','crunch','earthquake','dragondance'], true, 'Dragon-dance sweeper'),
  S('lapras', 131, 'Lapras', ['Water', 'Ice'], [130,85,80,85,95,60], ['surf','icebeam','thunderbolt','bodyslam'], true, 'Bulky tank'),
  S('vaporeon', 134, 'Vaporeon', ['Water'], [130,65,60,110,95,65], ['surf','icebeam','shadowball','recover'], true, 'Bulky water'),
  S('jolteon', 135, 'Jolteon', ['Electric'], [65,65,60,110,95,130], ['thunderbolt','shadowball','voltswitch','calmmind'], true, 'Speed control'),
  S('flareon', 136, 'Flareon', ['Fire'], [65,130,60,95,110,65], ['flareblitz','firepunch','bodyslam','quickattack'], true, 'Physical attacker'),
  S('snorlax', 143, 'Snorlax', ['Normal'], [160,110,65,65,110,30], ['bodyslam','earthquake','firepunch','recover'], true, 'Wall'),
  S('dragonite', 149, 'Dragonite', ['Dragon', 'Flying'], [91,134,95,100,100,80], ['outrage','firepunch','extremespeed','dragondance'], true, 'Setup sweeper'),
  // ---- Johto ----
  S('scizor', 212, 'Scizor', ['Bug', 'Steel'], [70,130,100,55,80,65], ['bulletpunch','xscissor','swordsdance','drainpunch'], true, 'Priority breaker'),
  S('heracross', 214, 'Heracross', ['Bug', 'Fighting'], [80,125,75,40,95,85], ['closecombat','xscissor','stoneedge','swordsdance'], true, 'Wallbreaker'),
  S('tyranitar', 248, 'Tyranitar', ['Rock', 'Dark'], [100,134,110,95,100,61], ['stoneedge','crunch','earthquake','icepunch'], true, 'Sand tank'),
  // ---- Hoenn ----
  S('gardevoir', 282, 'Gardevoir', ['Psychic', 'Fairy'], [68,65,65,125,115,80], ['moonblast','psychic','shadowball','calmmind'], true, 'Special sweeper'),
  S('breloom', 286, 'Breloom', ['Grass', 'Fighting'], [60,130,80,60,60,70], ['machpunch','leafblade','closecombat','swordsdance'], true, 'Priority punch'),
  S('milotic', 350, 'Milotic', ['Water'], [95,60,79,100,125,81], ['scald','icebeam','dragonpulse','recover'], true, 'Special wall'),
  S('salamence', 373, 'Salamence', ['Dragon', 'Flying'], [95,135,80,110,80,100], ['dracometeor','fireblast','dragonclaw','dragondance'], true, 'Mixed sweeper'),
  S('metagross', 376, 'Metagross', ['Steel', 'Psychic'], [80,135,130,95,90,70], ['meteormash','earthquake','icepunch','bulletpunch'], true, 'Physical tank'),
  // ---- Sinnoh ----
  S('garchomp', 445, 'Garchomp', ['Dragon', 'Ground'], [108,130,95,80,85,102], ['earthquake','outrage','stoneedge','swordsdance'], true, 'Offensive tank'),
  S('lucario', 448, 'Lucario', ['Fighting', 'Steel'], [70,110,70,115,70,90], ['aurasphere','flashcannon','nastyplot','extremespeed'], true, 'Mixed attacker'),
  S('weavile', 461, 'Weavile', ['Dark', 'Ice'], [70,120,65,45,85,125], ['iceshard','knockoff','icepunch','swordsdance'], true, 'Fast priority'),
  S('togekiss', 468, 'Togekiss', ['Fairy', 'Flying'], [85,50,95,120,115,80], ['airslash','dazzlinggleam','aurasphere','roost'], true, 'Flinch abuser'),
  S('mamoswine', 473, 'Mamoswine', ['Ice', 'Ground'], [110,130,80,70,60,80], ['earthquake','iceshard','icepunch','stoneedge'], true, 'Priority breaker'),
  // ---- Unova ----
  S('excadrill', 530, 'Excadrill', ['Ground', 'Steel'], [110,135,60,50,65,88], ['earthquake','ironhead','rockslide','swordsdance'], true, 'Sand sweeper'),
  S('conkeldurr', 534, 'Conkeldurr', ['Fighting'], [105,140,95,55,65,45], ['drainpunch','machpunch','poisonjab','bulletpunch'], true, 'Bulky attacker'),
  S('ferrothorn', 598, 'Ferrothorn', ['Grass', 'Steel'], [74,94,131,54,116,20], ['powerwhip','gyroball_x','leechseed','thunderwave'], true, 'Hazard wall'),
  S('chandelure', 609, 'Chandelure', ['Ghost', 'Fire'], [60,55,90,145,90,80], ['shadowball','flamethrower','energyball','calmmind'], true, 'Special nuke'),
  S('hydreigon', 635, 'Hydreigon', ['Dark', 'Dragon'], [92,105,90,125,90,98], ['darkpulse','dracometeor','flashcannon','nastyplot'], true, 'Special sweeper'),
  S('volcarona', 637, 'Volcarona', ['Bug', 'Fire'], [85,60,65,135,105,100], ['fireblast','bugbuzz','psychic','quiverdance'], true, 'Setup sweeper'),
  // ---- Modern favorites (official artwork fallback) ----
  S('greninja', 658, 'Greninja', ['Water', 'Dark'], [72,95,67,103,71,122], ['hydropump','darkpulse','icebeam','gunkshot'], false, 'Fast mixed'),
  S('aegislash', 681, 'Aegislash', ['Steel', 'Ghost'], [60,50,140,50,140,60], ['shadowball','flashcannon','shadowsneak','irondefense'], false, 'Bulky pivot'),
  S('sylveon', 700, 'Sylveon', ['Fairy'], [95,65,65,110,130,60], ['moonblast','psyshock','shadowball','calmmind'], false, 'Special wall'),
  S('toxapex', 748, 'Toxapex', ['Poison', 'Water'], [50,63,152,53,142,35], ['scald','toxic','recover','sludgebomb'], false, 'Ultimate wall'),
  S('mimikyu', 778, 'Mimikyu', ['Ghost', 'Fairy'], [55,90,80,50,105,96], ['poltergeist','playrough','shadowsneak','swordsdance'], false, 'Disguise sweeper'),
  S('cinderace', 815, 'Cinderace', ['Fire'], [80,116,75,65,75,119], ['flareblitz','highhorsepower','suckerpunch','uturn'], false, 'Fast breaker'),
  S('corviknight', 823, 'Corviknight', ['Flying', 'Steel'], [98,87,105,53,85,67], ['bravebird','ironhead','roost','bulkup_x'], false, 'Physical wall'),
  S('dragapult', 887, 'Dragapult', ['Dragon', 'Ghost'], [88,120,75,100,75,142], ['dragonclaw','poltergeist','fireblast','uturn'], false, 'Fastest sweeper'),
];

// A couple of movepool ids above reference moves that don't need unique mechanics;
// alias them to existing moves so every species has 4 legal, functional moves.
MOVES.gyroball_x = { name: 'Gyro Ball', type: 'Steel', category: 'Physical', power: 80, acc: 100, pp: 5 };
MOVES.bulkup_x   = { name: 'Bulk Up', type: 'Fighting', category: 'Status', pp: 20, boosts: { atk: 1, def: 1 }, target: 'self' };

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));

// Curated 3-mon preset teams for instant play.
export const PRESETS = [
  { name: 'Kanto Classic',  emoji: '🔴', team: ['charizard', 'blastoise', 'venusaur'], blurb: 'The three that started it all.' },
  { name: 'Eeveelution',    emoji: '🌈', team: ['jolteon', 'vaporeon', 'flareon'], blurb: 'One shape, three destinies.' },
  { name: 'Pseudo Power',   emoji: '🐉', team: ['dragonite', 'tyranitar', 'garchomp'], blurb: 'Slow to raise. Terrifying to face.' },
  { name: 'Hyper Offense',  emoji: '⚡', team: ['weavile', 'dragapult', 'greninja'], blurb: 'Hit first. Hit hard. No apologies.' },
  { name: 'Fairy Tale',     emoji: '✨', team: ['sylveon', 'togekiss', 'gardevoir'], blurb: 'Deceptively lethal charm.' },
  { name: 'Iron Wall',      emoji: '🛡️', team: ['metagross', 'ferrothorn', 'toxapex'], blurb: 'You will get bored before they faint.' },
];

// Raid bosses — powered-up, big HP, two actions per round.
// Boss stats + HP multipliers tuned via simulation so difficulty is monotonic
// (AI-ally win rates ≈ 72% / 52% / 30%). Real players also get Pass Power heals.
export const BOSSES = [
  {
    id: 'inferno-volcarona', name: 'Inferno Volcarona', dex: 637, anim: true,
    types: ['Bug', 'Fire'], base: [85,60,65,95,95,90],
    moves: ['flamethrower', 'bugbuzz', 'airslash', 'psychic'],
    hpMult: 1.8, actions: 2, star: 3,
    intro: 'The sky glows ember-orange. A Sun Pokémon the size of a house descends.',
  },
  {
    id: 'tyrant-tyranitar', name: 'Tyrant Tyranitar', dex: 248, anim: true,
    types: ['Rock', 'Dark'], base: [110,110,105,80,90,61],
    moves: ['stoneedge', 'crunch', 'earthquake', 'icepunch'],
    hpMult: 2.8, actions: 2, star: 4,
    intro: 'The ground quakes. Sand blots out the sun. It has been waiting.',
  },
  {
    id: 'spectral-dragapult', name: 'Spectral Dragapult', dex: 887, anim: false,
    types: ['Dragon', 'Ghost'], base: [100,105,80,95,80,115],
    moves: ['dragonclaw', 'poltergeist', 'fireblast', 'shadowball'],
    hpMult: 2.9, actions: 2, star: 5,
    intro: 'You never see it move. You only see where it has been.',
  },
];

// ---------------------------------------------------------------------------
// Sprite URLs (PokéAPI community CDN — free, hosted on GitHub). onerror in the
// UI cascades to the next fallback so a missing sprite never breaks the scene.
// ---------------------------------------------------------------------------
const SP = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
export function spriteFront(dex, anim) {
  return anim ? `${SP}/versions/generation-v/black-white/animated/${dex}.gif` : `${SP}/other/official-artwork/${dex}.png`;
}
export function spriteBack(dex, anim) {
  return anim ? `${SP}/versions/generation-v/black-white/animated/back/${dex}.gif` : `${SP}/back/${dex}.png`;
}
export function spriteFrontFallbacks(dex) {
  return [`${SP}/${dex}.png`, `${SP}/other/official-artwork/${dex}.png`, `${SP}/other/home/${dex}.png`];
}
export function spriteBackFallbacks(dex) {
  return [`${SP}/back/${dex}.png`, `${SP}/${dex}.png`, `${SP}/other/official-artwork/${dex}.png`];
}
export function spriteIcon(dex) {
  return `${SP}/versions/generation-viii/icons/${dex}.png`;
}
