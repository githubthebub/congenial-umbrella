// ---------------------------------------------------------------------------
// main.js — app orchestration: screens, progression, and every game mode.
// The online model is host-authoritative with a THIN guest terminal: the guest
// never runs battle logic, it only answers "pick a move / pick a switch" prompts
// and renders event batches the host sends. That makes desync structurally
// impossible — there is exactly one simulation, on the host.
// ---------------------------------------------------------------------------
import { SPECIES, SPECIES_BY_ID, PRESETS, BOSSES } from './data.js';
import {
  newBattle, makeMon, resolveTurn, forcedSwitch, monView, sideAliveCount,
} from './engine.js';
import { chooseAction, chooseBossActions, chooseSwitchIn } from './ai.js';
import { LinkSession, makeRoomCode, roomLink, readJoinParams } from './net.js';
import {
  $, el, wait, BattleScene, makeSprite, monIcon, typeBadge, toast, modal,
} from './ui.js';
import { sfx, haptic, isSoundOn, toggleSound } from './audio.js';

// battle animation speed (persisted; ?turbo speeds up automated runs)
let SPEED = (() => {
  const u = new URLSearchParams(location.search);
  if (u.has('turbo')) return 6;
  const s = +localStorage.getItem('pl_speed');
  return s >= 1 ? s : 1;
})();
let currentScene = null;

// --- engine ref helpers ------------------------------------------------------
const active = (st, ref) => st.sides[ref.side].party[st.sides[ref.side].active[ref.slot]];
const benchOf = (st, side) => st.sides[side].party.map((m, i) => ({
  partyIndex: i, dex: m.dex, name: m.name, anim: m.anim, hp: m.hp, maxHp: m.maxHp,
  types: m.types, fainted: m.fainted, isActive: st.sides[side].active.includes(i),
}));
const activesSnapshot = (st) => {
  const out = [];
  st.sides.forEach((side, s) => side.active.forEach((pi, slot) => {
    out.push({ ref: { side: s, slot }, view: monView(side.party[pi]), isBoss: side.party[pi].boss });
  }));
  return out;
};

// --- progression / profile ---------------------------------------------------
const TITLES = ['Rookie', 'Challenger', 'Ace Trainer', 'Veteran', 'Elite', 'Champion', 'Legend'];
function loadProfile() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem('pl_profile')); } catch {}
  if (!p) {
    p = {
      name: '', trainerId: (Math.floor(Math.random() * 9000) + 1000),
      founder: true, season: 'One', created: Date.now(),
      wins: 0, losses: 0, streak: 0, bestStreak: 0, raids: 0,
      box: PRESETS[0].team.slice(), badges: [],
    };
    saveProfile(p);
  }
  return p;
}
function saveProfile(p) { localStorage.setItem('pl_profile', JSON.stringify(p)); }
let profile = loadProfile();
function titleFor() {
  const w = profile.wins;
  return TITLES[Math.min(TITLES.length - 1, Math.floor(w / 3))];
}
function addToBox(id) { if (!profile.box.includes(id)) { profile.box.push(id); saveProfile(profile); return true; } return false; }

// --- screen router -----------------------------------------------------------
const appEl = () => $('#app');
function show(node) {
  const app = appEl();
  const cur = app.firstElementChild;
  if (cur) { cur.classList.add('leaving'); setTimeout(() => cur.remove(), 220); }
  node.classList.add('screen', 'entering');
  app.append(node);
  requestAnimationFrame(() => node.classList.remove('entering'));
}

function topbar() {
  return el('div', { class: 'topbar' }, [
    el('button', { class: 'brand-btn', onclick: () => renderHome(), title: 'Home' }, [
      el('span', { class: 'brand-glyph', text: '⚡' }),
      el('span', { class: 'brand-word', text: 'LINKMON' }),
    ]),
    el('div', { class: 'top-actions' }, [
      el('button', { class: 'icon-btn', title: 'Sound', onclick: (e) => { const on = toggleSound(); e.currentTarget.textContent = on ? '🔊' : '🔇'; }, text: isSoundOn() ? '🔊' : '🔇' }),
      el('button', { class: 'icon-btn', title: 'Trainer Card', onclick: () => trainerCard(), text: '🪪' }),
      el('button', { class: 'icon-btn', title: 'How it beats Showdown', onclick: () => aboutModal(), text: 'ⓘ' }),
    ]),
  ]);
}

// --- HOME --------------------------------------------------------------------
const TIPS = [
  'Tip: Fire melts Steel, but Ground shocks it harder. Type beats stats.',
  'Tip: Priority moves like Aqua Jet always strike first — perfect for finishing.',
  'Tip: A burn halves physical damage. Sometimes the best attack is a Will-O-Wisp.',
  'Tip: Setup is a gamble. One Swords Dance can end a game — or waste your only turn.',
  'Tip: Switching costs a turn, but walling a sweeper wins the match.',
];
function renderHome() {
  document.body.classList.remove('in-battle');
  const hero = el('div', { class: 'hero' }, [
    el('div', { class: 'hero-glow' }),
    el('h1', { class: 'hero-title' }, [el('span', { class: 'ht-a', text: 'Battle a friend' }), el('span', { class: 'ht-b', text: 'in 10 seconds.' })]),
    el('p', { class: 'hero-sub', text: 'A free browser Pokémon battler. No download. No account. No server to pay for. Send a link — and you’re dueling. On any phone, anywhere.' }),
    el('div', { class: 'cta-row' }, [
      bigCta('⚔️', 'Quick Battle', 'Play right now vs the AI', () => flowQuickBattle(), 'primary'),
      bigCta('🔗', 'Link Up', 'Share a link, duel a friend online', () => flowLinkCreate(), 'link'),
      bigCta('👥', 'Pass & Play', 'Two players, one device', () => flowPassPlay(), 'pass'),
      bigCta('🐲', 'Co-op Raid', 'Team up vs a giant boss', () => flowRaidSetup(), 'raid'),
    ]),
    el('div', { class: 'hero-foot' }, [
      el('span', { class: 'chip', text: profile.founder ? `✦ Founding Trainer · Season ${profile.season}` : `${titleFor()} · ${profile.wins}W` }),
      el('span', { class: 'chip ghost', text: `${SPECIES.length} Pokémon · 18 types · real damage math` }),
      el('button', { class: 'linky', text: 'Why it’s better than Showdown →', onclick: () => aboutModal() }),
    ]),
  ]);
  const screen = el('div', {}, [topbar(), hero]);
  show(screen);
}
function bigCta(icon, title, sub, onclick, kind) {
  return el('button', {
    class: 'big-cta ' + kind, onclick: () => { sfx.select(); haptic(); onclick(); }, onpointerenter: () => sfx.hover(),
  }, [
    el('span', { class: 'bc-icon', text: icon }),
    el('span', { class: 'bc-text' }, [el('span', { class: 'bc-title', text: title }), el('span', { class: 'bc-sub', text: sub })]),
    el('span', { class: 'bc-arrow', text: '→' }),
  ]);
}

// --- ABOUT / marketing modal -------------------------------------------------
function aboutModal() {
  const rows = [
    ['⚡ Zero friction', 'No sign-up, no install, no launcher. You’re battling before Showdown finishes loading its team builder.'],
    ['🎁 The invite is a gift', 'You don’t “refer” a friend — you save them a spot at the table. A shared link opens straight into a duel.'],
    ['🤝 Pass Powers', 'Gift your raid partner a burst of Attack, Speed, or Vitality mid-fight. A social feature that’s warm, not tryhard.'],
    ['📱 Built for the phone', 'Big tappable moves, floating damage, screen shake, one-thumb play. Showdown was built for a desktop in 2011.'],
    ['🐲 Co-op raids', 'Two trainers, one giant boss that hits twice a turn. Showdown has no co-op at all.'],
    ['✦ You’re a Founder', 'Play in Season One and your Trainer Card carries a Founding Trainer crest. Later trainers can’t get it.'],
  ];
  const box = el('div', {}, [
    el('h2', { class: 'modal-title', text: 'Why LINKMON, not Showdown?' }),
    el('p', { class: 'modal-lead', text: 'Showdown is deeper — thousands of Pokémon, every mechanic. LINKMON isn’t trying to out-Showdown Showdown. It competes on the axis Showdown ignores: getting two friends into a delightful battle in seconds, for free.' }),
    el('div', { class: 'why-grid' }, rows.map(([h, b]) => el('div', { class: 'why-cell' }, [el('div', { class: 'why-h', text: h }), el('div', { class: 'why-b', text: b })]))),
    el('p', { class: 'fine', text: 'A fan-made project for the love of the games. Not affiliated with, endorsed by, or associated with Nintendo, Game Freak, or The Pokémon Company. Sprites via the open PokéAPI.' }),
    el('button', { class: 'primary-btn', text: 'Let’s battle', onclick: () => m.close() }),
  ]);
  const m = modal(box);
}

// --- TRAINER CARD ------------------------------------------------------------
function trainerCard() {
  const wr = profile.wins + profile.losses;
  const box = el('div', {}, [
    el('div', { class: 'tc-card' }, [
      el('div', { class: 'tc-top' }, [
        el('div', {}, [
          el('div', { class: 'tc-label', text: 'TRAINER CARD' }),
          el('div', { class: 'tc-name', text: profile.name || 'Nameless Trainer' }),
          el('div', { class: 'tc-id', text: `ID · ${String(profile.trainerId).padStart(5, '0')}` }),
        ]),
        el('div', { class: 'tc-title', text: titleFor() }),
      ]),
      el('div', { class: 'tc-stats' }, [
        stat('Wins', profile.wins), stat('Losses', profile.losses),
        stat('Streak', profile.streak), stat('Raids', profile.raids),
        stat('Win %', wr ? Math.round(profile.wins / wr * 100) + '%' : '—'),
      ]),
      profile.founder ? el('div', { class: 'tc-founder', text: `✦ Founding Trainer — Season ${profile.season}` }) : null,
    ]),
    el('h3', { class: 'box-h', text: `Your Box · ${profile.box.length} Pokémon` }),
    el('div', { class: 'box-grid' }, profile.box.map(id => {
      const sp = SPECIES_BY_ID[id]; if (!sp) return null;
      return el('div', { class: 'box-mon', title: sp.name }, [monIcon(sp.dex), el('span', { text: sp.name })]);
    })),
    el('div', { class: 'tc-actions' }, [
      el('button', { class: 'ghost-btn', text: profile.name ? 'Rename' : 'Set name', onclick: () => { renameFlow(); m.close(); } }),
      el('button', { class: 'primary-btn', text: 'Close', onclick: () => m.close() }),
    ]),
  ]);
  const m = modal(box);
  function stat(k, v) { return el('div', { class: 'tc-stat' }, [el('div', { class: 'tcs-v', text: String(v) }), el('div', { class: 'tcs-k', text: k })]); }
}
function renameFlow() {
  const input = el('input', { class: 'text-input', maxlength: '14', placeholder: 'Trainer name', value: profile.name || '' });
  const box = el('div', {}, [
    el('h2', { class: 'modal-title', text: 'Name yourself, Trainer' }),
    input,
    el('button', { class: 'primary-btn', text: 'Save', onclick: () => { profile.name = input.value.trim().slice(0, 14); saveProfile(profile); m.close(); toast('Saved, ' + (profile.name || 'Trainer') + '!'); } }),
  ]);
  const m = modal(box);
  setTimeout(() => input.focus(), 50);
}

// --- TEAM SELECT -------------------------------------------------------------
function pickTeam({ title = 'Choose your team', cta = 'Ready', allowRandom = true } = {}) {
  return new Promise(resolve => {
    let chosen = [];
    const grid = el('div', { class: 'pick-grid' });
    const chosenRow = el('div', { class: 'chosen-row' });
    const readyBtn = el('button', { class: 'primary-btn wide', text: cta, disabled: 'true', onclick: () => { if (chosen.length === 3) { sfx.select(); resolve(chosen.slice()); } } });

    function renderChosen() {
      chosenRow.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const id = chosen[i];
        if (id) {
          const sp = SPECIES_BY_ID[id];
          chosenRow.append(el('button', { class: 'chosen-mon', title: 'Remove ' + sp.name, onclick: () => { chosen.splice(i, 1); refresh(); } }, [monIcon(sp.dex), el('span', { text: sp.name })]));
        } else chosenRow.append(el('div', { class: 'chosen-mon empty', text: '＋' }));
      }
      readyBtn.disabled = chosen.length === 3 ? null : 'true';
    }
    function refresh() { renderChosen(); [...grid.children].forEach(c => c.classList.toggle('picked', chosen.includes(c.dataset.id))); }

    SPECIES.forEach(sp => {
      const card = el('button', {
        class: 'pick-card', 'data-id': sp.id, onpointerenter: () => sfx.hover(),
        onclick: () => {
          if (chosen.includes(sp.id)) { chosen = chosen.filter(x => x !== sp.id); }
          else if (chosen.length < 3) { chosen.push(sp.id); sfx.select(); haptic(); }
          else { toast('Three is the whole team.'); return; }
          refresh();
        },
      }, [
        makeSprite(sp.dex, sp.anim, false, 'pick-sprite'),
        el('div', { class: 'pick-name', text: sp.name }),
        el('div', { class: 'pick-types' }, sp.types.map(typeBadge)),
      ]);
      grid.append(card);
    });

    const presetRow = el('div', { class: 'preset-row' }, PRESETS.map(p =>
      el('button', { class: 'preset-chip', onclick: () => { chosen = p.team.slice(); sfx.select(); refresh(); toast(p.name + ' — ' + p.blurb); } }, [
        el('span', { class: 'pe', text: p.emoji }), el('span', { text: p.name }),
      ])));
    if (allowRandom) presetRow.append(el('button', { class: 'preset-chip rnd', text: '🎲 Surprise me', onclick: () => { chosen = shuffle(SPECIES.map(s => s.id)).slice(0, 3); sfx.select(); refresh(); } }));

    const screen = el('div', {}, [
      topbar(),
      el('div', { class: 'pick-wrap' }, [
        el('div', { class: 'pick-head' }, [el('h2', { text: title }), el('p', { class: 'muted', text: 'Pick any 3 — or tap a ready-made squad.' })]),
        presetRow,
        chosenRow,
        readyBtn,
        el('div', { class: 'pick-scroll' }, [grid]),
      ]),
    ]);
    renderChosen();
    show(screen);
  });
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }

// --- battle scaffold ---------------------------------------------------------
function battleScreen() {
  document.body.classList.add('in-battle');
  const root = el('div', { class: 'battle-root' });
  const screen = el('div', {}, [
    el('div', { class: 'battle-top' }, [
      el('button', { class: 'icon-btn small', text: '🏳️', title: 'Quit', onclick: () => { if (confirm('Leave the battle?')) renderHome(); } }),
      el('div', { class: 'battle-tag', text: '' }),
      el('button', { class: 'icon-btn small', title: 'Battle speed', text: speedLabel(), onclick: (e) => { cycleSpeed(); e.currentTarget.textContent = speedLabel(); } }),
      el('button', { class: 'icon-btn small', text: isSoundOn() ? '🔊' : '🔇', onclick: (e) => { const on = toggleSound(); e.currentTarget.textContent = on ? '🔊' : '🔇'; } }),
    ]),
    root,
  ]);
  show(screen);
  return root;
}
function speedLabel() { return SPEED >= 3 ? '⏩' : SPEED >= 2 ? '▶▶' : '▶'; }
function cycleSpeed() {
  SPEED = SPEED >= 3 ? 1 : SPEED + 1;
  localStorage.setItem('pl_speed', String(SPEED));
  if (currentScene) currentScene.speed = SPEED;
  toast('Battle speed: ' + SPEED + '×');
}
const EMOTES = ['👍', '😮', '🔥', '😅', '🎉', 'gg'];

// --- QUICK BATTLE (vs AI) ----------------------------------------------------
async function flowQuickBattle() {
  const team = await pickTeam({ title: 'Your team for the duel', cta: 'Find opponent' });
  const foe = shuffle(SPECIES.map(s => s.id)).slice(0, 3);
  const root = battleScreen();
  $('.battle-tag').textContent = 'Quick Battle';
  const st = newBattle({ sides: [{ name: 'You', party: team.map(id => makeMon(id)), active: [0] }, { name: 'Rival', party: foe.map(id => makeMon(id)), active: [0] }], seed: (Math.random() * 1e9) | 0 });
  const scene = new BattleScene(root, { youSide: 0, layout: '1v1', speed: SPEED });
  currentScene = scene;
  scene.build({ slots: activesSnapshot(st) });
  scene.say('A rival Trainer wants to battle!');
  await wait(900);
  await localLoop(st, scene, { you: 0, foe: 1, foeBrain: (s, fRef, yRef) => chooseAction(s, fRef, yRef, 'normal') });
}

// --- PASS & PLAY (two humans, one device) ------------------------------------
function curtain(msg, sub) {
  return new Promise(resolve => {
    const box = el('div', { class: 'curtain', onclick: () => { c.remove(); resolve(); } }, [
      el('div', { class: 'curtain-inner' }, [
        el('div', { class: 'curtain-icon', text: '📱→' }),
        el('h2', { text: msg }),
        el('p', { class: 'muted', text: sub || 'Tap when you’re ready.' }),
        el('div', { class: 'curtain-cta', text: 'Tap to continue' }),
      ]),
    ]);
    const c = el('div', { class: 'curtain-back' }, [box]);
    document.body.append(c);
    requestAnimationFrame(() => c.classList.add('on'));
  });
}

async function flowPassPlay() {
  const t1 = await pickTeam({ title: 'Player 1 — pick your team', cta: 'Ready' });
  await curtain('Pass to Player 2', 'Player 1 is done. Hand over the device.');
  const t2 = await pickTeam({ title: 'Player 2 — pick your team', cta: 'Ready' });
  const root = battleScreen();
  $('.battle-tag').textContent = 'Pass & Play';
  const st = newBattle({ sides: [{ name: 'Player 1', party: t1.map(id => makeMon(id)), active: [0] }, { name: 'Player 2', party: t2.map(id => makeMon(id)), active: [0] }], seed: (Math.random() * 1e9) | 0 });
  const scene = new BattleScene(root, { youSide: 0, layout: '1v1', speed: SPEED });
  currentScene = scene;
  scene.build({ slots: activesSnapshot(st) });
  const p0 = { side: 0, slot: 0 }, p1 = { side: 1, slot: 0 };
  await curtain('Player 1’s turn', 'Player 2, look away!');
  while (!st.ended) {
    const a0 = await scene.promptAction(p0, { view: monView(active(st, p0)), target: p1, canSwitch: true, bench: benchOf(st, 0), allowForfeit: false });
    await curtain('Player 2’s turn', 'Player 1, look away!');
    const a1 = await scene.promptAction(p1, { view: monView(active(st, p1)), target: p0, canSwitch: true, bench: benchOf(st, 1), allowForfeit: false });
    const r = resolveTurn(st, [a0, a1]);
    await scene.play(r.events);
    if (st.ended) break;
    // forced switches, each behind a privacy curtain
    for (const side of [0, 1]) {
      const ref = { side, slot: 0 };
      if (active(st, ref).fainted && sideAliveCount(st.sides[side]) > 0) {
        await curtain(`Player ${side + 1}, choose a replacement`);
        const to = await scene.showSwitch(benchOf(st, side), ref, { forced: true });
        await scene.play(forcedSwitch(st, ref, to));
      }
    }
    if (!st.ended) await curtain('Player 1’s turn', 'Player 2, look away!');
  }
  // result: winner side maps to Player 1/2
  const won = st.winner === 0;
  endPassPlay(scene, st, won);
}
function endPassPlay(scene, st, p1won) {
  sfx.win();
  document.body.classList.remove('in-battle');
  const card = el('div', { class: 'result-card glass win' }, [
    el('div', { class: 'result-emoji', text: '🏆' }),
    el('h1', { class: 'result-h', text: `Player ${p1won ? '1' : '2'} wins!` }),
    el('div', { class: 'result-sub', text: 'Good game.' }),
    el('div', { class: 'result-actions' }, [
      el('button', { class: 'primary-btn', text: 'Rematch', onclick: () => flowPassPlay() }),
      el('button', { class: 'ghost-btn', text: 'Home', onclick: () => renderHome() }),
    ]),
  ]);
  show(el('div', {}, [topbar(), el('div', { class: 'result-wrap' }, [card])]));
}

// generic local loop: side `you` is human via scene, side `foe` via foeBrain
async function localLoop(st, scene, { you, foe, foeBrain }) {
  const youRef = { side: you, slot: 0 }, foeRef = { side: foe, slot: 0 };
  while (!st.ended) {
    const yv = monView(active(st, youRef));
    const action = await scene.promptAction(youRef, { view: yv, target: foeRef, canSwitch: true, bench: benchOf(st, you), onEmote: null });
    if (action.type === 'forfeit') { return endBattle(scene, st, foe, { forfeit: true }); }
    const fAction = foeBrain(st, foeRef, youRef);
    const r = resolveTurn(st, [action, fAction]);
    await scene.play(r.events);
    if (st.ended) break;
    await resolveForced(st, scene, { human: [you], ai: [foe], foeRef: { [you]: foeRef, [foe]: youRef } });
  }
  endBattle(scene, st, you);
}

// handle post-turn forced switches. human sides prompt; ai sides auto-pick.
async function resolveForced(st, scene, { human, ai, foeRef }) {
  for (const side of [...human, ...ai]) {
    const ref = { side, slot: 0 };
    if (active(st, ref).fainted && sideAliveCount(st.sides[side]) > 0) {
      let to;
      if (human.includes(side)) to = await scene.showSwitch(benchOf(st, side), ref, { forced: true });
      else to = chooseSwitchIn(st, ref, foeRef[side]);
      const ev = forcedSwitch(st, ref, to);
      await scene.play(ev);
    }
  }
}

// --- result / rewards --------------------------------------------------------
function endBattle(scene, st, youSide, { forfeit = false, coop = null } = {}) {
  const won = coop ? coop.won : (forfeit ? false : st.winner === youSide);
  sfx[won ? 'win' : 'lose']();
  document.body.classList.remove('in-battle');
  // progression
  if (won) { profile.wins++; profile.streak++; profile.bestStreak = Math.max(profile.bestStreak, profile.streak); if (coop) profile.raids++; }
  else { profile.losses++; profile.streak = 0; }
  saveProfile(profile);

  const lines = won
    ? ['Victory!', 'Flawless.', 'A masterclass.', 'They never stood a chance.']
    : forfeit ? ['You forfeited.'] : ['Defeat.', 'So close.', 'Next time.', 'Learn. Rematch. Win.'];
  const headline = coop ? (won ? 'Raid Cleared!' : 'The raid overwhelmed you…') : lines[Math.floor(Math.random() * lines.length)];

  const rewards = el('div', { class: 'reward-row' });
  if (won && profile.streak >= 2) rewards.append(rewardPill('🔥', `${profile.streak} win streak`));
  if (won) {
    // collect a random mon you fought (endowment / Wonder-Trade fuel)
    const pool = st.sides.map(s => s.party).flat().map(m => m.id);
    const fresh = shuffle(pool).find(id => !profile.box.includes(id));
    if (fresh) { addToBox(fresh); rewards.append(rewardPill('✨', `Caught ${SPECIES_BY_ID[fresh].name}!`)); sfx.reward(); }
  }

  const card = el('div', { class: 'result-card glass ' + (won ? 'win' : 'lose') }, [
    el('div', { class: 'result-emoji', text: won ? '🏆' : coop ? '💥' : '💤' }),
    el('h1', { class: 'result-h', text: headline }),
    el('div', { class: 'result-sub', text: `${profile.wins}W · ${profile.losses}L · streak ${profile.streak}` }),
    rewards,
    el('div', { class: 'result-actions' }, [
      el('button', { class: 'primary-btn', text: 'Play again', onclick: () => { sfx.select(); (coop ? flowRaidSetup : flowQuickBattle)(); } }),
      el('button', { class: 'ghost-btn', text: 'Home', onclick: () => renderHome() }),
      el('button', { class: 'ghost-btn', text: 'Challenge a friend', onclick: () => flowLinkCreate() }),
    ]),
  ]);
  show(el('div', {}, [topbar(), el('div', { class: 'result-wrap' }, [card])]));
}
function rewardPill(icon, text) { return el('div', { class: 'reward-pill' }, [el('span', { text: icon }), el('span', { text })]); }

// --- LINK BATTLE: create (host) ---------------------------------------------
async function flowLinkCreate() {
  if (globalThis.LINKMON_OFFLINE) return offlineLinkExplain();
  const code = makeRoomCode();
  const link = roomLink(code, 'link');
  const session = new LinkSession('host', code);
  let started = false;

  const status = el('div', { class: 'lobby-status', text: 'Starting a private room…' });
  const codeBig = el('div', { class: 'code-big', text: code });
  const linkField = el('input', { class: 'link-field', readonly: 'true', value: link });
  const tip = el('div', { class: 'lobby-tip', text: TIPS[0] });
  let tipI = 0; const tipTimer = setInterval(() => { tipI = (tipI + 1) % TIPS.length; tip.textContent = TIPS[tipI]; }, 4200);

  const screen = el('div', {}, [topbar(), el('div', { class: 'lobby' }, [
    el('h2', { class: 'lobby-h', text: 'You’re inviting a rival' }),
    el('p', { class: 'muted', text: 'Send this link. When they open it, you’re instantly connected — no app, no account, peer-to-peer.' }),
    el('div', { class: 'code-card glass' }, [
      el('div', { class: 'code-label', text: 'ROOM CODE' }), codeBig,
      el('div', { class: 'share-row' }, [
        el('button', { class: 'primary-btn', text: '📋 Copy invite link', onclick: () => shareLink(link) }),
        el('button', { class: 'ghost-btn', text: 'Copy code', onclick: () => { navigator.clipboard?.writeText(code); toast('Code copied'); } }),
      ]),
      linkField,
    ]),
    status, tip,
    el('button', { class: 'ghost-btn', text: 'Cancel', onclick: () => { clearInterval(tipTimer); session.leave(); renderHome(); } }),
  ])]);
  show(screen);

  session.onStatus(s => { if (!started) status.textContent = { connecting: 'Opening room…', waiting: 'Waiting for your rival to open the link…', connected: 'Rival connected! ⚡', disconnected: 'Rival left.' }[s] || s; });
  // handshake: greet on peer-join (either order works); proceed on their greeting
  session.onPeer(() => session.send('hello', { name: profile.name || 'Host', role: 'host' }));
  session.on('hello', (p) => { if (started) return; started = true; clearInterval(tipTimer); sfx.connect(); haptic(30); hostBegin(session, p); });
  session.onLeave(() => { if (!started) toast('Rival disconnected'); });

  try { await session.connect(); }
  catch (e) { clearInterval(tipTimer); onlineUnavailable(); }
}

function offlineLinkExplain() {
  const box = el('div', {}, [
    el('h2', { class: 'modal-title', text: 'Online play needs the hosted site' }),
    el('p', { class: 'modal-lead', text: 'This embedded preview can’t open peer-to-peer connections (its sandbox blocks WebRTC). Deploy LINKMON free on GitHub Pages and “Link Up” works between any two browsers. Right here, you can still play:' }),
    el('button', { class: 'primary-btn', text: '👥 Pass & Play (2 players, this device)', onclick: () => { m.close(); flowPassPlay(); } }),
    el('button', { class: 'ghost-btn', text: '⚔️ Quick Battle vs AI', onclick: () => { m.close(); flowQuickBattle(); } }),
    el('button', { class: 'ghost-btn', text: 'Back', onclick: () => m.close() }),
  ]);
  const m = modal(box);
}

function onlineUnavailable() {
  const box = el('div', {}, [
    el('h2', { class: 'modal-title', text: 'Couldn’t reach the matchmaking relay' }),
    el('p', { class: 'modal-lead', text: 'Online play needs to load a tiny peer-to-peer library and reach a public relay. Your network or an ad-blocker may be blocking it. Everything else works fully offline:' }),
    el('button', { class: 'primary-btn', text: '⚔️ Play Quick Battle instead', onclick: () => { m.close(); flowQuickBattle(); } }),
    el('button', { class: 'ghost-btn', text: '🐲 Solo Raid instead', onclick: () => { m.close(); startSoloRaid(BOSSES[0]); } }),
    el('button', { class: 'ghost-btn', text: 'Back home', onclick: () => { m.close(); renderHome(); } }),
  ]);
  const m = modal(box, { dismissable: false });
}

// host handshake done -> both pick teams -> host builds battle -> run
async function hostBegin(session, guestHello) {
  toast(`${guestHello.name || 'Rival'} connected!`);
  const team = await pickTeam({ title: 'Pick your team — your rival is waiting', cta: 'Lock it in' });
  loadingScreen('Waiting for your rival to lock in their team…');
  // register the reply listener before asking (avoid missing a fast reply)
  const teamP = session.once('team', { timeout: 120000 });
  session.send('need_team', {});
  let guestTeam;
  try { guestTeam = (await teamP).payload.team; }
  catch { toast('Rival took too long.'); return renderHome(); }
  guestTeam = sanitizeTeam(guestTeam);

  const st = newBattle({
    sides: [
      { name: profile.name || 'Host', party: team.map(id => makeMon(id)), active: [0] },
      { name: guestHello.name || 'Rival', party: guestTeam.map(id => makeMon(id)), active: [0] },
    ], seed: (Math.random() * 1e9) | 0,
  });
  const root = battleScreen();
  $('.battle-tag').textContent = 'Link Battle';
  const scene = new BattleScene(root, { youSide: 0, layout: '1v1', speed: SPEED });
  currentScene = scene;
  scene.build({ slots: activesSnapshot(st) });
  wireEmotes(session, scene, 1);
  // tell guest to build its scene (its perspective = side 1)
  session.send('start', { snap: activesSnapshot(st) });
  scene.say('The link is live. Battle!');
  await wait(800);
  await hostLoop(session, st, scene);
}

async function hostLoop(session, st, scene) {
  const youRef = { side: 0, slot: 0 }, foeRef = { side: 1, slot: 0 };
  while (!st.ended) {
    // register the guest-reply listener BEFORE asking, so a fast reply can't be missed
    const guestP = session.once('move', { timeout: 180000 }).then(m => m.payload.action).catch(() => ({ actor: foeRef, type: 'move', move: 0, target: youRef }));
    session.send('ask_move', { yourRef: foeRef, view: monView(active(st, foeRef)), foeRef: youRef, bench: benchOf(st, 1) });
    const hostP = scene.promptAction(youRef, { view: monView(active(st, youRef)), target: foeRef, canSwitch: true, bench: benchOf(st, 0), onEmote: () => emotePicker(session, scene, youRef) });
    const [hostAction, guestActionRaw] = await Promise.all([hostP, guestP]);
    if (hostAction.type === 'forfeit') { session.send('over', { winner: 1 }); return endBattle(scene, st, 0, { forfeit: true }); }
    const guestAction = normalizeAction(guestActionRaw, foeRef, youRef, st, 1);
    const r = resolveTurn(st, [hostAction, guestAction]);
    session.send('events', { batch: r.events, snap: activesSnapshot(st) });
    await scene.play(r.events);
    if (st.ended) break;
    // forced switches, host-driven
    for (const side of [0, 1]) {
      const ref = { side, slot: 0 };
      if (active(st, ref).fainted && sideAliveCount(st.sides[side]) > 0) {
        let to;
        if (side === 0) to = await scene.showSwitch(benchOf(st, 0), ref, { forced: true });
        else { const swP = session.once('switch', { timeout: 120000 }).catch(() => ({ payload: { to: firstAlive(st, 1) } })); session.send('ask_switch', { ref, bench: benchOf(st, 1) }); to = (await swP).payload.to; }
        if (!Number.isInteger(to) || st.sides[side].party[to]?.fainted) to = firstAlive(st, side);
        const ev = forcedSwitch(st, ref, to);
        session.send('events', { batch: ev, snap: activesSnapshot(st) });
        await scene.play(ev);
      }
    }
  }
  session.send('over', { winner: st.winner });
  endBattle(scene, st, 0);
}

// --- LINK BATTLE: guest terminal --------------------------------------------
async function guestJoin(code) {
  const session = new LinkSession('guest', code);
  const status = el('div', { class: 'lobby-status', text: 'Connecting to the room…' });
  const screen = el('div', {}, [topbar(), el('div', { class: 'lobby' }, [
    el('div', { class: 'challenge-badge', text: '⚔️' }),
    el('h2', { class: 'lobby-h', text: 'Someone challenged you to a duel' }),
    el('p', { class: 'muted', text: `Room ${code} · connecting peer-to-peer…` }),
    status,
    el('button', { class: 'ghost-btn', text: 'Cancel', onclick: () => { session.leave(); renderHome(); } }),
  ])]);
  show(screen);

  let scene = null, myTeam = null;
  session.onStatus(s => { status.textContent = { connecting: 'Connecting…', waiting: 'Reaching the host…', connected: 'Connected! ⚡', disconnected: 'The host left.' }[s] || s; });
  // handshake: greet the host as soon as the peer connects
  session.onPeer(() => session.send('hello', { name: profile.name || 'Guest', role: 'guest' }));
  session.on('hello', () => { sfx.connect(); haptic(30); });
  session.on('need_team', async () => {
    myTeam = await pickTeam({ title: 'Pick your team — accept the challenge', cta: 'Send team' });
    session.send('team', { team: myTeam });
    loadingScreen('Team sent. Waiting for the battle to begin…');
  });
  session.on('start', (p) => {
    const root = battleScreen(); $('.battle-tag').textContent = 'Link Battle';
    scene = new BattleScene(root, { youSide: 1, layout: '1v1', speed: SPEED });
  currentScene = scene;
    scene.build({ slots: p.snap });
    wireEmotes(session, scene, 0);
    scene.say('The link is live. Battle!');
  });
  session.on('ask_move', async (p) => {
    if (!scene) return;
    const action = await scene.promptAction(p.yourRef, { view: p.view, target: p.foeRef, canSwitch: true, bench: p.bench, onEmote: () => emotePicker(session, scene, p.yourRef) });
    if (action.type === 'forfeit') { session.send('move', { action: { type: 'move', move: 0 } }); return; }
    session.send('move', { action });
  });
  session.on('ask_switch', async (p) => {
    if (!scene) return;
    const to = await scene.showSwitch(p.bench, p.ref, { forced: true });
    session.send('switch', { to });
  });
  session.on('events', async (p) => { if (!scene) return; await scene.play(p.batch); scene.resync(p.snap); });
  session.on('over', (p) => { if (scene) endBattle(scene, { winner: p.winner, sides: [{ party: [] }, { party: [] }] }, 1); });
  session.onLeave(() => { toast('The host disconnected.'); });

  try { await session.connect(); } catch { onlineUnavailable(); }
}

// --- shared online helpers ---------------------------------------------------
function normalizeAction(raw, actorRef, foeRef, st, side) {
  if (!raw || typeof raw !== 'object') return { actor: actorRef, type: 'move', move: 0, target: foeRef };
  if (raw.type === 'switch' && Number.isInteger(raw.to) && !st.sides[side].party[raw.to]?.fainted && !st.sides[side].active.includes(raw.to))
    return { actor: actorRef, type: 'switch', to: raw.to };
  let mv = Number.isInteger(raw.move) ? raw.move : 0;
  const mon = active(st, actorRef);
  if (mv < 0 || mv >= mon.moves.length) mv = 0;
  return { actor: actorRef, type: 'move', move: mv, target: foeRef };
}
function firstAlive(st, side) { return st.sides[side].party.findIndex(m => !m.fainted); }
function sanitizeTeam(team) {
  const t = (Array.isArray(team) ? team : []).filter(id => SPECIES_BY_ID[id]).slice(0, 3);
  while (t.length < 3) t.push(shuffle(SPECIES.map(s => s.id)).find(id => !t.includes(id)));
  return t;
}
function wireEmotes(session, scene, fromSide) {
  session.on('emote', (p) => { scene.emote({ side: fromSide, slot: p.slot ?? 0 }, String(p.emoji).slice(0, 3)); sfx.send(); });
}
function emotePicker(session, scene, myRef) {
  const row = el('div', { class: 'emote-picker' }, EMOTES.map(e =>
    el('button', { class: 'emote-btn', text: e, onclick: () => { session.send('emote', { emoji: e, slot: myRef.slot }); scene.emote(myRef, e); sfx.send(); m.close(); } })));
  const m = modal(el('div', {}, [el('h3', { class: 'modal-title', text: 'Send an emote' }), row]));
}
function loadingScreen(msg) {
  const node = el('div', {}, [topbar(), el('div', { class: 'loading' }, [el('div', { class: 'spinner' }), el('p', { class: 'muted', text: msg })])]);
  show(node); return node;
}
function shareLink(link) {
  if (navigator.share) navigator.share({ title: 'LINKMON — I challenge you!', text: 'Open this and battle me right now:', url: link }).catch(() => { });
  else { navigator.clipboard?.writeText(link); toast('Invite link copied — send it to a friend!'); }
}

// --- RAID --------------------------------------------------------------------
const POWERS = {
  vitality: { icon: '💚', name: 'Vitality', apply: (m) => { const a = Math.floor(m.maxHp * 0.28); m.hp = Math.min(m.maxHp, m.hp + a); return [{ t: 'heal', ref: null, amount: a, remainHp: m.hp, maxHp: m.maxHp, kind: 'heal', name: m.name }]; } },
  power: { icon: '⚔️', name: 'Attack', apply: (m) => bump(m, ['atk', 'spa']) },
  guard: { icon: '🛡️', name: 'Guard', apply: (m) => bump(m, ['def', 'spd']) },
  haste: { icon: '💨', name: 'Speed', apply: (m) => bump(m, ['spe', 'spe']) },
  cleanse: { icon: '✨', name: 'Cleanse', apply: (m) => { m.status = null; return [{ t: 'text', msg: `${m.name} was cleansed!` }]; } },
};
function bump(m, stats) { const ev = []; for (const s of [...new Set(stats)]) { m.boosts[s] = Math.min(6, m.boosts[s] + 1); ev.push({ t: 'boost', ref: null, stat: s, delta: 1, name: m.name }); } return ev; }

async function flowRaidSetup() {
  const cards = BOSSES.map(b => el('button', { class: 'boss-card glass', onclick: () => startSoloRaid(b) }, [
    makeSprite(b.dex, b.anim, false, 'boss-portrait'),
    el('div', { class: 'boss-info' }, [
      el('div', { class: 'boss-name', text: b.name }),
      el('div', { class: 'boss-stars', text: '★'.repeat(b.star) }),
      el('div', { class: 'boss-types' }, b.types.map(typeBadge)),
      el('div', { class: 'boss-intro', text: b.intro }),
    ]),
  ]));
  show(el('div', {}, [topbar(), el('div', { class: 'raid-setup' }, [
    el('h2', { text: 'Co-op Raid' }), el('p', { class: 'muted', text: 'You and a partner vs a colossal boss that strikes twice a turn. Gift your partner Pass Powers to survive — Entralink-style.' }),
    el('div', { class: 'boss-list' }, cards),
  ])]));
}

async function startSoloRaid(boss) {
  const yourId = await pickOne('Choose your raider');
  if (!yourId) return renderHome();
  const partnerId = shuffle(SPECIES.map(s => s.id)).find(id => id !== yourId);
  const st = makeRaidState(boss, [yourId, partnerId]);
  const root = battleScreen(); $('.battle-tag').textContent = boss.name + ' · ★'.repeat(boss.star);
  const scene = new BattleScene(root, { youSide: 0, layout: 'raid', speed: SPEED });
  currentScene = scene;
  scene.build({ slots: activesSnapshot(st) });
  scene.say(boss.intro); sfx.roar(); await wait(1400);
  await raidLoop(st, scene, boss, {
    allyBrain: (s) => chooseAction(s, { side: 0, slot: 1 }, { side: 1, slot: 0 }, 'hard'),
    powersFor: 2,
    aiGifts: true,
  });
}

function makeRaidState(boss, allyIds) {
  const bossMon = makeMon(boss, { hpMult: boss.hpMult, boss: true });
  bossMon.actions = boss.actions;
  return newBattle({
    format: 'raid',
    sides: [
      { name: 'Allies', party: allyIds.map(id => makeMon(id)), active: [0, 1] },
      { name: boss.name, party: [bossMon], active: [0] },
    ], seed: (Math.random() * 1e9) | 0,
  });
}

async function raidLoop(st, scene, boss, { allyBrain, powersFor = 2, aiGifts = false }) {
  const bossRef = { side: 1, slot: 0 };
  const p1 = { side: 0, slot: 0 }, p2 = { side: 0, slot: 1 };
  let charges = powersFor;
  while (!st.ended) {
    const acts = [];
    // your action (with pass-power tray)
    if (!active(st, p1).fainted) {
      const onPower = charges > 0 ? () => raidPowerPicker(st, scene, p2, () => { charges--; }) : null;
      const a = await scene.promptAction(p1, { view: monView(active(st, p1)), target: bossRef, canSwitch: false, bench: [], allowForfeit: true, onEmote: onPower });
      if (a.type === 'forfeit') return endBattle(scene, st, 0, { coop: { won: false } });
      acts.push(a);
    }
    // partner (AI) action — occasionally gifts YOU a Pass Power when you're low
    if (!active(st, p2).fainted) {
      if (aiGifts && Math.random() < 0.28 && active(st, p1).hp < active(st, p1).maxHp * 0.5 && !active(st, p1).fainted) {
        const ev = giftPower(st, p1, 'vitality'); await scene.play(ev);
      }
      acts.push(allyBrain(st));
    }
    // boss acts (twice)
    acts.push(...chooseBossActions(st, bossRef, [p1, p2]));
    const r = resolveTurn(st, acts);
    await scene.play(r.events);
  }
  endBattle(scene, st, 0, { coop: { won: st.winner === 0 } });
}

function raidPowerPicker(st, scene, allyRef, onSpend) {
  const ally = active(st, allyRef);
  const row = el('div', { class: 'emote-picker' }, Object.entries(POWERS).map(([k, p]) =>
    el('button', { class: 'power-btn', onclick: () => { const ev = giftPower(st, allyRef, k); onSpend(); m.close(); scene.play(ev); toast(`Gifted ${p.name} to your partner!`); } }, [el('span', { text: p.icon }), el('span', { text: p.name })])));
  const m = modal(el('div', {}, [el('h3', { class: 'modal-title', text: 'Pass a Power to your partner' }), el('p', { class: 'muted small', text: 'A gift, Entralink-style. Choose one.' }), row]));
}
function giftPower(st, ref, key) {
  const mon = active(st, ref);
  const ev = POWERS[key].apply(mon).map(e => ({ ...e, ref }));
  sfx.buff();
  return [{ t: 'text', msg: `A Pass Power flows to ${mon.name}!` }, ...ev];
}

function pickOne(title) {
  return new Promise(resolve => {
    const grid = el('div', { class: 'pick-grid' }, SPECIES.map(sp => el('button', {
      class: 'pick-card', onclick: () => { sfx.select(); resolve(sp.id); },
    }, [makeSprite(sp.dex, sp.anim, false, 'pick-sprite'), el('div', { class: 'pick-name', text: sp.name }), el('div', { class: 'pick-types' }, sp.types.map(typeBadge))])));
    show(el('div', {}, [topbar(), el('div', { class: 'pick-wrap' }, [el('div', { class: 'pick-head' }, [el('h2', { text: title })]), el('div', { class: 'pick-scroll' }, [grid])])]));
  });
}

// --- boot --------------------------------------------------------------------
function boot() {
  // dynamic viewport height fix for mobile browser chrome
  const setVh = () => document.documentElement.style.setProperty('--vh', window.innerHeight * 0.01 + 'px');
  setVh(); addEventListener('resize', setVh);

  const join = readJoinParams();
  if (join) {
    // a shared link drops the rival straight into the duel
    guestJoin(join.code);
    // clean the URL so a refresh doesn't rejoin a dead room
    history.replaceState(null, '', location.pathname);
    return;
  }
  renderHome();
  if (!profile.onboarded) setTimeout(() => firstRunWelcome(), 500);
}
function firstRunWelcome() {
  const input = el('input', { class: 'text-input', maxlength: '14', placeholder: 'Your trainer name (optional)' });
  const box = el('div', {}, [
    el('div', { class: 'welcome-crest', text: '✦' }),
    el('h2', { class: 'modal-title', text: 'Welcome, Founding Trainer' }),
    el('p', { class: 'modal-lead', text: 'You’re here in Season One — your Trainer Card will carry a Founder crest that later players can’t earn. Pick a name (or stay mysterious) and let’s battle.' }),
    input,
    el('button', { class: 'primary-btn wide', text: 'Enter the Arena', onclick: () => { profile.name = input.value.trim().slice(0, 14); profile.onboarded = true; saveProfile(profile); m.close(); sfx.reward(); toast('Founder crest unlocked ✦'); } }),
  ]);
  const m = modal(box);
  setTimeout(() => input.focus(), 60);
}

boot();
