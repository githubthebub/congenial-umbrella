/* ============================================================================
 * ui.js — Showdown-style front-end and game loop.
 * Drives the engine's resumable turn generator, animates HP/log playback, and
 * collects the player's input. The opponent's moves come from ai.js.
 * ==========================================================================*/
(function () {
  const D = window.POKE.data;
  const { Battle } = window.POKE.engine;
  const AI = window.POKE.ai;
  const { TEAMS, PERSONAS, MOVES, DEX } = D;

  const TYPE_COLORS = {
    Normal:'#9099a1', Fire:'#ff6b3d', Water:'#4d90d5', Electric:'#f3c22b', Grass:'#63bb5b',
    Ice:'#74cec0', Fighting:'#ce4069', Poison:'#ab6ac8', Ground:'#d97746', Flying:'#8fa8dd',
    Psychic:'#f97176', Bug:'#90c12c', Rock:'#c7b78b', Ghost:'#5269ac', Dragon:'#0a6dc4',
    Dark:'#5a5366', Steel:'#5a8ea1', Fairy:'#ec8fe6',
  };
  const EMOJI = {
    'Great Tusk':'🦣','Kingambit':'🗡️','Gholdengo':'🪙','Dragapult':'🐉','Slowking-Galar':'👑',
    'Corviknight':'🦅','Glimmora':'💎','Iron Valiant':'⚔️','Roaring Moon':'🌙','Iron Moth':'🦟',
    'Pelipper':'🦤','Barraskewda':'🐟','Raging Bolt':'⚡','Ogerpon-Wellspring':'🍃','Zapdos':'🌩️',
    'Torkoal':'🐢','Hippowdon':'🦛','Excadrill':'⛏️',
  };
  const emoji = (sp) => EMOJI[sp] || '❔';
  const $ = (id) => document.getElementById(id);
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  function typeBadge(t) {
    const s = document.createElement('span');
    s.className = 'tbadge'; s.textContent = t; s.style.background = TYPE_COLORS[t] || '#666';
    return s;
  }
  function typesEl(types) {
    const wrap = document.createElement('span'); wrap.className = 'types';
    types.forEach((t) => wrap.appendChild(typeBadge(t)));
    return wrap;
  }

  /* ---- Session state ---------------------------------------------------- */
  let selPersona = null, selTeamKey = null, playerLead = 0;
  let battle = null, persona = null, playerTeamKey = null;
  let played = 0, lastHp = [1, 1];
  let inputMode = null;          // 'choose' | 'chooseSwitch' | 'forceSwitch'
  let resolveAction = null, resolveSwitch = null, teraArmed = false;

  /* ---- Snapshot for animation ------------------------------------------- */
  function snapshot() {
    return {
      weather: battle.field.weather, turn: battle.turn,
      sides: [0, 1].map((s) => {
        const side = battle.sides[s], a = side.team[side.active];
        return {
          active: side.active, species: a.species, hp: a.hp, max: a.maxhp,
          status: a.status, teraActive: a.teraActive, types: battle.currentTypes(a),
          hazards: Object.assign({}, side.hazards),
          alive: side.team.map((m) => !m.fainted),
        };
      }),
    };
  }

  /* ======================================================================
   *  MENU
   * ==================================================================== */
  function renderMenu() {
    const pl = $('personaList'); pl.innerHTML = '';
    PERSONAS.forEach((p) => {
      const div = document.createElement('div');
      div.className = 'opt' + (selPersona === p.id ? ' sel' : '');
      div.innerHTML =
        `<div class="av">${p.avatar}</div>
         <div class="body">
           <div class="nm">${p.name} <span class="elo">${p.elo}</span></div>
           <div class="ti">${p.title}</div>
           <div class="bl">${p.blurb}</div>
         </div>`;
      div.onclick = () => { selPersona = p.id; renderMenu(); refreshStart(); };
      pl.appendChild(div);
    });

    const tl = $('teamList'); tl.innerHTML = '';
    Object.keys(TEAMS).forEach((key) => {
      const t = TEAMS[key];
      const div = document.createElement('div');
      div.className = 'opt' + (selTeamKey === key ? ' sel' : '');
      const chips = t.sets.map((s) => `<span class="chip">${emoji(s.species)} ${s.species.replace('-', ' ')}</span>`).join('');
      div.innerHTML =
        `<div class="body">
           <div class="nm">${t.name}</div>
           <div class="bl">${t.desc}</div>
           <div class="teamline">${chips}</div>
         </div>`;
      div.onclick = () => { selTeamKey = key; renderMenu(); refreshStart(); };
      tl.appendChild(div);
    });
  }
  function refreshStart() { $('toPreview').disabled = !(selPersona && selTeamKey); }

  /* ======================================================================
   *  TEAM PREVIEW
   * ==================================================================== */
  function openPreview() {
    persona = PERSONAS.find((p) => p.id === selPersona);
    playerTeamKey = selTeamKey;
    playerLead = 0;
    $('prevTitle').textContent = `You vs ${persona.name}`;
    $('prevSub').textContent = `${persona.title} · ${persona.elo} · ${TEAMS[persona.team].name} team`;
    renderPreviewRow($('prevFoe'), TEAMS[persona.team].sets, false);
    renderPreviewRow($('prevMe'), TEAMS[playerTeamKey].sets, true);
    $('prevStart').disabled = false;
    $('previewOverlay').classList.remove('hidden');
  }
  function renderPreviewRow(container, sets, pickable) {
    container.innerHTML = '';
    sets.forEach((s, i) => {
      const m = document.createElement('div');
      m.className = 'mon' + (pickable ? ' pick' : '') + (pickable && i === playerLead ? ' lead' : '');
      const tt = D.DEX[s.species].types.map((t) => `<span class="tbadge" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
      m.innerHTML = `<div class="em">${emoji(s.species)}</div><div class="mn">${s.species.replace('-', ' ')}</div><div class="tt">${tt}</div>`;
      if (pickable) m.onclick = () => { playerLead = i; renderPreviewRow(container, sets, true); };
      container.appendChild(m);
    });
  }

  /* ======================================================================
   *  BATTLE SETUP
   * ==================================================================== */
  function startBattle() {
    $('previewOverlay').classList.add('hidden');
    $('menu').classList.add('hidden');
    $('end').classList.add('hidden');
    $('battle').classList.remove('hidden');
    $('log').innerHTML = '';

    battle = new Battle(TEAMS[playerTeamKey].sets, TEAMS[persona.team].sets, {
      seed: (Date.now() & 0x7fffffff) ^ 0x51ed,
      names: ['You', persona.name],
      log: (e) => { e.snap = snapshot(); },
    });
    battle.setLead(0, playerLead);
    battle.setLead(1, AI.chooseLead(battle, 1, persona.ai));
    played = 0;
    battle.start();
    lastHp = [1, 1];
    renderFieldFromSnap(battle.log.length ? battle.log[battle.log.length - 1].snap : snapshot());
    turnLoop();
  }

  /* ======================================================================
   *  RENDERING
   * ==================================================================== */
  function hpColor(frac) { return frac > 0.5 ? 'var(--good)' : frac > 0.2 ? 'var(--warn)' : 'var(--bad)'; }

  function renderFieldFromSnap(snap) {
    $('turnCount').textContent = 'Turn ' + Math.max(1, snap.turn);
    const wname = { sun: '☀️ Harsh Sun', rain: '🌧️ Rain', sand: '🏜️ Sandstorm', snow: '❄️ Snow' }[snap.weather] || 'Clear skies';
    $('weather').textContent = wname;
    // Hazards summary.
    $('hazards').innerHTML = 'You: ' + hazIcons(snap.sides[0].hazards) + ' · Foe: ' + hazIcons(snap.sides[1].hazards);

    setSide('foe', snap.sides[1], 1);
    setSide('my', snap.sides[0], 0);
  }
  function hazIcons(h) {
    const parts = [];
    if (h.sr) parts.push('🪨');
    if (h.spikes) parts.push('✦' + (h.spikes > 1 ? h.spikes : ''));
    if (h.tspikes) parts.push('☠' + (h.tspikes > 1 ? h.tspikes : ''));
    if (h.web) parts.push('🕸');
    return parts.length ? parts.join('') : '—';
  }
  function setSide(pre, s, sideIdx) {
    $(pre + 'Name').textContent = s.species.replace('-', ' ');
    $(pre + 'Sprite').textContent = emoji(s.species);
    const tEl = $(pre + 'Types'); tEl.innerHTML = '';
    s.types.forEach((t) => tEl.appendChild(typeBadge(t)));
    if (s.teraActive) { const f = document.createElement('span'); f.className = 'teraflag'; f.textContent = 'TERA'; tEl.appendChild(f); }
    const frac = Math.max(0, s.hp / s.max);
    const fill = $(pre + 'Hp');
    fill.style.width = (frac * 100) + '%';
    fill.style.background = hpColor(frac);
    $(pre + 'HpText').textContent = pre === 'foe' ? Math.ceil(frac * 100) + '%' : (s.hp + '/' + s.max);
    const st = $(pre + 'Status');
    if (s.status) { st.className = 'statuspill st-' + s.status; st.textContent = s.status.toUpperCase(); }
    else { st.className = ''; st.textContent = ''; }
    // Tray.
    const tray = $(pre + 'Tray'); tray.innerHTML = '';
    s.alive.forEach((alive, i) => {
      const b = document.createElement('div');
      b.className = 'ball' + (alive ? '' : ' dead') + (i === s.active ? ' active' : '');
      tray.appendChild(b);
    });
  }

  /* ---- Log playback ----------------------------------------------------- */
  async function playNew() {
    const logEl = $('log');
    while (played < battle.log.length) {
      const e = battle.log[played++];
      const line = document.createElement('div');
      line.className = 'ln ' + (e.type || 'text');
      line.textContent = e.text;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
      if (e.snap) {
        renderFieldFromSnap(e.snap);
        // Shake the sprite that just lost HP.
        for (let s = 0; s < 2; s++) {
          const f = e.snap.sides[s].hp / e.snap.sides[s].max;
          if (f < lastHp[s] - 0.001) {
            const el = $((s === 1 ? 'foe' : 'my') + 'Sprite');
            el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
          }
          lastHp[s] = f;
        }
      }
      const d = e.type === 'faint' ? 620 : (e.type === 'turn' || e.type === 'move' || e.type === 'tera') ? 430 : e.type === 'text' ? 300 : 360;
      await delay(d);
    }
  }

  /* ======================================================================
   *  CONTROLS
   * ==================================================================== */
  function renderControls(req) {
    inputMode = 'choose';
    $('movePanel').classList.remove('hidden');
    $('switchPanel').classList.add('hidden');
    teraArmed = false;
    updateTeraTog(req.canTera);

    const grid = $('moveGrid'); grid.innerHTML = '';
    req.moves.forEach((m) => {
      const md = MOVES[m.id];
      const btn = document.createElement('div');
      btn.className = 'movebtn' + (m.disabled ? ' dis' : '');
      btn.style.background = TYPE_COLORS[md.type] || '#555';
      const cat = md.category === 'Physical' ? '● Phys' : md.category === 'Special' ? '◆ Spec' : '○ Status';
      const bp = md.power ? md.power : '—';
      btn.innerHTML =
        `<span class="cat">${cat}</span>
         <span class="mvname">${m.id}</span>
         <span class="mvmeta"><span>${md.type}</span><span>BP ${bp}</span><span>PP ${m.pp}/${m.maxpp}</span></span>`;
      if (!m.disabled) btn.onclick = () => submitMove(m.id);
      grid.appendChild(btn);
    });

    $('switchBtn').disabled = req.trapped || req.switches.length === 0;
    $('switchBtn').classList.toggle('dis', req.trapped || req.switches.length === 0);
  }

  function updateTeraTog(can) {
    const tg = $('teraTog');
    tg.classList.toggle('disabled', !can);
    tg.classList.toggle('on', teraArmed && can);
  }

  function submitMove(id) {
    if (!resolveAction) return;
    const r = resolveAction; resolveAction = null;
    lockControls();
    r({ type: 'move', move: id, tera: teraArmed });
  }

  function openSwitchPanel(mode) {
    inputMode = mode; // 'chooseSwitch' | 'forceSwitch'
    $('movePanel').classList.add('hidden');
    $('switchPanel').classList.remove('hidden');
    $('cancelSwitch').classList.toggle('hidden', mode === 'forceSwitch');
    const grid = $('switchGrid'); grid.innerHTML = '';
    const side = battle.sides[0];
    side.team.forEach((mon, i) => {
      const disabled = mon.fainted || i === side.active;
      const btn = document.createElement('div');
      btn.className = 'switchbtn' + (disabled ? ' dis' : '');
      const frac = mon.hp / mon.maxhp;
      const st = mon.status ? ` · ${mon.status.toUpperCase()}` : '';
      btn.innerHTML =
        `<span class="em">${emoji(mon.species)}</span>
         <span><span class="sn">${mon.species.replace('-', ' ')}</span><br>
         <span class="shp">${mon.fainted ? 'Fainted' : Math.ceil(frac * 100) + '% HP' + st}</span></span>`;
      if (!disabled) btn.onclick = () => pickSwitch(i);
      grid.appendChild(btn);
    });
  }

  function pickSwitch(i) {
    if (inputMode === 'forceSwitch') {
      if (!resolveSwitch) return;
      const r = resolveSwitch; resolveSwitch = null; lockControls(); r(i);
    } else {
      if (!resolveAction) return;
      const r = resolveAction; resolveAction = null; lockControls();
      r({ type: 'switch', target: i });
    }
  }

  function lockControls() {
    $('movePanel').classList.add('hidden');
    $('switchPanel').classList.add('hidden');
  }
  function setPrompt(t) { $('prompt').textContent = t; }
  function setBanner(t) { $('banner').textContent = t || ''; }

  function playerActionPromise() { return new Promise((r) => { resolveAction = r; }); }
  function playerSwitchPromise() { return new Promise((r) => { resolveSwitch = r; }); }

  /* ======================================================================
   *  TURN LOOP
   * ==================================================================== */
  async function turnLoop() {
    await playNew();
    while (battle.winner === null) {
      const req = battle.requestFor(0);
      if (req.kind !== 'move') { // safety: forced replacement at top of loop
        setPrompt('Choose your next Pokémon.');
        openSwitchPanel('forceSwitch');
        const idx = await playerSwitchPromise();
        battle.doSwitch(0, idx, true);
        await playNew();
        continue;
      }
      setBanner('');
      setPrompt('What will you do?');
      renderControls(req);
      const action = await playerActionPromise();

      // Opponent decides from the same pre-turn state.
      const aiAction = AI.chooseAction(battle, 1, persona.ai);
      setBanner(persona.name + ' is thinking…');
      await delay(280);
      setBanner('');

      await resolveFullTurn(action, aiAction);
    }
    endGame();
  }

  async function resolveFullTurn(a0, a1) {
    const gen = battle.resolveTurn(a0, a1);
    let res = gen.next();
    let guard = 0;
    while (!res.done && guard++ < 40) {
      await playNew();
      const q = res.value; // {kind, side, switches}
      let idx;
      if (q.side === 0) {
        if (!q.switches || q.switches.length === 0) { res = gen.next(null); continue; }
        setPrompt(q.kind === 'pivot' ? 'Choose a Pokémon to switch in.' : 'Your Pokémon fainted — choose the next one.');
        openSwitchPanel('forceSwitch');
        idx = await playerSwitchPromise();
      } else {
        idx = AI.chooseSwitch(battle, 1, persona.ai, q.kind);
      }
      res = gen.next(idx);
    }
    await playNew();
  }

  /* ======================================================================
   *  END
   * ==================================================================== */
  function endGame() {
    lockControls();
    setPrompt(''); setBanner('');
    $('battle').classList.add('hidden');
    $('end').classList.remove('hidden');
    const won = battle.winner === 0;
    const tie = battle.winner === 'tie';
    const big = $('endBig');
    big.textContent = tie ? "It's a draw." : won ? 'Victory!' : 'Defeat.';
    big.className = 'big ' + (tie ? '' : won ? 'win' : 'lose');
    $('endSub').textContent = tie
      ? 'Both teams fell together.'
      : won ? `You outplayed ${persona.name} (${persona.elo}). Well predicted.`
            : `${persona.name} (${persona.elo}) read you this time. Rematch?`;
  }

  /* ======================================================================
   *  WIRING
   * ==================================================================== */
  function wire() {
    $('toPreview').onclick = openPreview;
    $('prevBack').onclick = () => $('previewOverlay').classList.add('hidden');
    $('prevStart').onclick = startBattle;
    $('switchBtn').onclick = () => { if (inputMode === 'choose') { setPrompt('Choose a Pokémon to switch in.'); openSwitchPanel('chooseSwitch'); } };
    $('cancelSwitch').onclick = () => { setPrompt('What will you do?'); const req = battle.requestFor(0); renderControls(req); };
    $('teraTog').onclick = () => {
      const req = battle.requestFor(0);
      if (!req.canTera) return;
      teraArmed = !teraArmed; updateTeraTog(true);
    };
    $('rematch').onclick = () => { $('end').classList.add('hidden'); startBattle(); };
    $('newBattle').onclick = () => { $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); };
    renderMenu();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
