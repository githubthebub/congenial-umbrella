// ---------------------------------------------------------------------------
// ui.js — DOM builders, sprite loading with fallback cascade, toasts/modals,
// and BattleScene: a juicy renderer that replays the engine's event log with
// lunges, screen-shake, floating damage numbers, HP drain and status tints.
// ---------------------------------------------------------------------------
import {
  TYPE_COLORS, MOVES, EMOJI_BY_DEX, spriteFront, spriteBack, spriteFrontFallbacks,
  spriteBackFallbacks, spriteIcon,
} from './data.js';
import { sfx, haptic } from './audio.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const wait = (ms) => new Promise(r => setTimeout(r, ms));

export function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}

const STAT_NAME = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };
const STATUS_NAME = { brn: 'BRN', psn: 'PSN', tox: 'TOX', par: 'PAR', slp: 'SLP', frz: 'FRZ' };
const STATUS_VERB = { brn: 'was burned', psn: 'was poisoned', tox: 'was badly poisoned', par: 'was paralyzed', slp: 'fell asleep', frz: 'was frozen solid' };
const RESIDUAL_MSG = { brn: 'is hurt by its burn', psn: 'is hurt by poison', tox: 'is hurt by poison', seed: "'s health was sapped", recoil: 'is hit with recoil' };

export function typeBadge(t) {
  return el('span', { class: 'type-badge', style: { background: TYPE_COLORS[t] || '#777' }, text: t.toUpperCase() });
}

export function makeSprite(dex, anim, back = false, cls = '') {
  if (globalThis.LINKMON_TOKENS) return el('div', { class: 'sprite token ' + cls, text: EMOJI_BY_DEX[dex] || '✨' });
  const img = el('img', { class: 'sprite ' + cls, alt: '', draggable: 'false' });
  const fbs = back ? spriteBackFallbacks(dex) : spriteFrontFallbacks(dex);
  img.dataset.fb = JSON.stringify(fbs); img.dataset.i = '0';
  img.onerror = () => {
    const list = JSON.parse(img.dataset.fb); let i = +img.dataset.i;
    if (i < list.length) { img.dataset.i = String(i + 1); img.src = list[i]; }
    else { img.onerror = null; img.style.opacity = '0'; }
  };
  img.src = back ? spriteBack(dex, anim) : spriteFront(dex, anim);
  return img;
}

export function monIcon(dex) {
  if (globalThis.LINKMON_TOKENS) return el('div', { class: 'mon-icon token', text: EMOJI_BY_DEX[dex] || '✨' });
  const img = el('img', { class: 'mon-icon', alt: '' });
  img.onerror = () => { img.onerror = null; img.src = spriteFront(dex, false); };
  img.src = spriteIcon(dex);
  return img;
}

// --- toasts / modals ---------------------------------------------------------
export function toast(msg, kind = '') {
  const host = $('#toasts') || document.body.appendChild(el('div', { id: 'toasts' }));
  const t = el('div', { class: 'toast ' + kind, text: msg });
  host.append(t);
  requestAnimationFrame(() => t.classList.add('on'));
  setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 300); }, 2600);
}

export function modal(contentNode, { dismissable = true } = {}) {
  const back = el('div', { class: 'modal-back' });
  const box = el('div', { class: 'modal glass' }, [contentNode]);
  back.append(box);
  if (dismissable) back.addEventListener('click', e => { if (e.target === back) close(); });
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('on'));
  function close() { back.classList.remove('on'); setTimeout(() => back.remove(), 250); }
  return { close, el: box };
}

function hpColor(frac) { return frac > 0.5 ? 'var(--good)' : frac > 0.2 ? 'var(--warn)' : 'var(--bad)'; }

// ---------------------------------------------------------------------------
// BattleScene
// ---------------------------------------------------------------------------
export class BattleScene {
  constructor(root, { youSide = 0, layout = '1v1', speed = 1 } = {}) {
    this.root = root;
    this.youSide = youSide;
    this.layout = layout;
    this.speed = speed;
    this.slots = new Map();   // "side:slot" -> {sprite, card, hpInner, hpNum, statusEl, boostEl, wrap, view}
    this.msg = null;
    this._pending = null;
  }
  key(ref) { return `${ref.side}:${ref.slot}`; }
  ms(x) { return x / this.speed; }

  build(config) {
    // config.slots: [{ref, view, isBoss}]
    this.root.innerHTML = '';
    this.root.classList.add('battle', 'layout-' + this.layout);
    const field = el('div', { class: 'field' });
    const shake = el('div', { class: 'field-shake' }, [field]);
    this.field = field; this.shakeEl = shake;
    const msg = el('div', { class: 'msgbox glass', text: '' });
    this.msg = msg;
    const controls = el('div', { class: 'controls' });
    this.controls = controls;
    this.root.append(shake, msg, controls);

    for (const s of config.slots) {
      const yours = s.ref.side === this.youSide;
      const posc = `pos-${s.ref.side}-${s.ref.slot}`;
      const wrap = el('div', { class: `slot ${yours ? 'near' : 'far'} ${s.isBoss ? 'boss' : ''} ${posc}` });
      const platform = el('div', { class: 'platform' });
      const sprite = makeSprite(s.view.dex, s.view.anim, yours && !s.isBoss, s.isBoss ? 'huge' : '');
      const spriteWrap = el('div', { class: 'sprite-wrap' }, [sprite]);
      wrap.append(platform, spriteWrap);
      field.append(wrap);
      const card = this.makeCard(s.view, yours);
      card.el.classList.add(`card-${s.ref.side}-${s.ref.slot}`);
      field.append(card.el);
      this.slots.set(this.key(s.ref), { wrap, spriteWrap, sprite, ...card, view: s.view, yours, isBoss: s.isBoss });
    }
    return this;
  }

  makeCard(view, yours) {
    const hpInner = el('div', { class: 'hp-inner' });
    const hpNum = el('div', { class: 'hp-num' });
    const statusEl = el('span', { class: 'status-pill hidden' });
    const boostEl = el('span', { class: 'boost-tag hidden' });
    const nameRow = el('div', { class: 'card-name' }, [
      el('span', { class: 'nm', text: view.name }),
      el('span', { class: 'lv', text: 'Lv' + view.level }),
      statusEl,
    ]);
    const bar = el('div', { class: 'hp-bar' }, [hpInner]);
    const kids = [nameRow, bar, boostEl];
    if (yours) kids.splice(2, 0, hpNum);
    const card = el('div', { class: `mon-card glass ${yours ? 'mine' : 'theirs'}` }, kids);
    const api = { el: card, hpInner, hpNum, statusEl, boostEl, nameEl: nameRow.querySelector('.nm'), lvEl: nameRow.querySelector('.lv') };
    this.paintCard(api, view);
    return api;
  }

  paintCard(api, view) {
    const frac = Math.max(0, view.hp / view.maxHp);
    api.hpInner.style.width = (frac * 100) + '%';
    api.hpInner.style.background = hpColor(frac);
    api.hpInner.classList.toggle('low', frac <= 0.2 && frac > 0);
    if (api.hpNum) api.hpNum.textContent = `${view.hp}/${view.maxHp}`;
    if (view.status) { api.statusEl.textContent = STATUS_NAME[view.status]; api.statusEl.className = 'status-pill st-' + view.status; }
    else api.statusEl.className = 'status-pill hidden';
    const boostSum = Object.entries(view.boosts || {}).filter(([, v]) => v !== 0);
    if (boostSum.length) { api.boostEl.classList.remove('hidden'); api.boostEl.textContent = boostSum.map(([k, v]) => `${STAT_NAME[k].split(' ').pop()} ${v > 0 ? '+' + v : v}`).join('  '); }
    else api.boostEl.classList.add('hidden');
  }

  say(msg) { this.msg.textContent = msg; }

  setStatusTint(slot, status) {
    slot.spriteWrap.classList.remove('tint-brn', 'tint-psn', 'tint-tox', 'tint-par', 'tint-slp', 'tint-frz');
    if (status) slot.spriteWrap.classList.add('tint-' + status);
  }

  floatNum(slot, text, kind) {
    const f = el('div', { class: 'float-num ' + kind, text });
    slot.spriteWrap.append(f);
    setTimeout(() => f.remove(), 1100);
  }

  screenShake(big = false) {
    this.shakeEl.classList.remove('shake', 'shake-big');
    void this.shakeEl.offsetWidth;
    this.shakeEl.classList.add(big ? 'shake-big' : 'shake');
  }

  // --- input -----------------------------------------------------------------
  clearControls() { this.controls.innerHTML = ''; }

  promptAction(ref, { view, target, canSwitch = false, bench = [], allowForfeit = true, onEmote = null }) {
    return new Promise(resolve => {
      this.clearControls();
      const grid = el('div', { class: 'moves' });
      view.moves.forEach((m, i) => {
        const disabled = m.pp <= 0;
        const btn = el('button', {
          class: 'move-btn' + (disabled ? ' disabled' : ''),
          style: { '--tc': TYPE_COLORS[m.type] },
          disabled: disabled ? 'true' : null,
          onclick: () => { if (disabled) return; sfx.select(); haptic(); done({ actor: ref, type: 'move', move: i, target }); },
          onpointerenter: () => sfx.hover(),
        }, [
          el('span', { class: 'mv-name', text: m.name }),
          el('span', { class: 'mv-meta' }, [typeBadge(m.type), el('span', { class: 'mv-pp', text: `${m.pp}/${m.maxpp}` })]),
        ]);
        grid.append(btn);
      });
      const side = el('div', { class: 'side-btns' });
      if (canSwitch && bench.some(b => !b.fainted)) side.append(el('button', { class: 'ghost-btn', text: '⇄ Switch', onclick: () => { sfx.select(); this.showSwitch(bench, ref).then(to => { if (to == null) this.promptAction(ref, { view, target, canSwitch, bench, allowForfeit, onEmote }).then(resolve); else done({ actor: ref, type: 'switch', to }); }); } }));
      if (onEmote) side.append(el('button', { class: 'ghost-btn', text: '☺ Emote', onclick: () => onEmote() }));
      if (allowForfeit) side.append(el('button', { class: 'ghost-btn danger', text: 'Forfeit', onclick: () => { done({ actor: ref, type: 'forfeit' }); } }));
      this.controls.append(grid, side);
      const done = (a) => { this.clearControls(); resolve(a); };
    });
  }

  showSwitch(bench, ref, { forced = false } = {}) {
    return new Promise(resolve => {
      const list = el('div', { class: 'switch-list' });
      bench.forEach((b) => {
        if (b.isActive) return;
        const btn = el('button', {
          class: 'switch-card glass' + (b.fainted ? ' fainted' : ''),
          disabled: b.fainted ? 'true' : null,
          onclick: () => { if (b.fainted) return; sfx.select(); m.close(); resolve(b.partyIndex); },
        }, [
          monIcon(b.dex),
          el('div', {}, [el('div', { class: 'sc-name', text: b.name }), el('div', { class: 'sc-hp', text: b.fainted ? 'Fainted' : `${b.hp}/${b.maxHp} HP` }),
          el('div', { class: 'sc-types' }, b.types.map(typeBadge))]),
        ]);
        list.append(btn);
      });
      const head = el('div', { class: 'switch-head', text: forced ? 'Choose your next Pokémon' : 'Switch to…' });
      const wrap = el('div', {}, [head, list]);
      if (!forced) wrap.append(el('button', { class: 'ghost-btn', text: 'Cancel', onclick: () => { m.close(); resolve(null); } }));
      const m = modal(wrap, { dismissable: !forced });
    });
  }

  // --- playback --------------------------------------------------------------
  async play(events, { onEnd = null } = {}) {
    for (const e of events) {
      if (!this[`_ev_${e.t}`]) continue;
      await this[`_ev_${e.t}`](e);
    }
    if (onEnd) onEnd();
  }

  slotFor(ref) { return this.slots.get(this.key(ref)); }

  async _ev_text(e) { this.say(e.msg); await wait(this.ms(650)); }

  async _ev_move(e) {
    const s = this.slotFor(e.ref); if (!s) return;
    this.say(`${e.name} used ${e.move}!`);
    s.spriteWrap.classList.add(s.yours ? 'lunge-up' : 'lunge-down');
    sfx.select();
    await wait(this.ms(230));
    s.spriteWrap.classList.remove('lunge-up', 'lunge-down');
    await wait(this.ms(120));
  }

  async _ev_damage(e) {
    const s = this.slotFor(e.ref); if (!s) return;
    s.view.hp = e.remainHp;
    const kind = e.eff > 1 ? 'super' : e.eff < 1 ? 'weak' : 'norm';
    this.floatNum(s, '-' + e.amount, kind);
    if (e.crit) { sfx.crit(); this.floatNum(s, 'CRIT!', 'crit'); }
    if (e.eff > 1) sfx.superHit(); else if (e.eff < 1) sfx.weakHit(); else sfx.hit();
    haptic(e.eff > 1 ? 30 : 12);
    s.spriteWrap.classList.add('hit');
    this.screenShake(e.eff > 1 || e.crit);
    this.paintCard(s, s.view);
    await wait(this.ms(120));
    s.spriteWrap.classList.remove('hit');
    if (e.eff > 1) { this.say("It's super effective!"); await wait(this.ms(500)); }
    else if (e.eff < 1) { this.say('Not very effective…'); await wait(this.ms(500)); }
    else await wait(this.ms(260));
  }

  async _ev_immune(e) { this.say(`It doesn't affect ${e.name}…`); sfx.weakHit(); await wait(this.ms(650)); }
  async _ev_miss(e) { this.say(`${e.name}'s attack missed!`); await wait(this.ms(600)); }

  async _ev_faint(e) {
    const s = this.slotFor(e.ref); if (!s) return;
    s.view.hp = 0; this.paintCard(s, s.view);
    this.say(`${e.name} fainted!`);
    sfx.faint(); haptic(40);
    s.spriteWrap.classList.add('faint');
    await wait(this.ms(750));
  }

  async _ev_status(e) {
    const s = this.slotFor(e.ref); if (!s) return;
    s.view.status = e.status; this.paintCard(s, s.view); this.setStatusTint(s, e.status);
    this.say(`${e.name} ${STATUS_VERB[e.status]}!`); sfx.status();
    await wait(this.ms(650));
  }

  async _ev_boost(e) {
    const s = this.slotFor(e.ref); if (!s) return;
    s.view.boosts[e.stat] = (s.view.boosts[e.stat] || 0) + e.delta;
    this.paintCard(s, s.view);
    const up = e.delta > 0;
    s.spriteWrap.classList.add(up ? 'buff' : 'debuff');
    this.say(`${e.name}'s ${STAT_NAME[e.stat]} ${up ? 'rose' + (e.delta > 1 ? ' sharply' : '') : 'fell' + (e.delta < -1 ? ' harshly' : '')}!`);
    sfx.buff();
    await wait(this.ms(500));
    s.spriteWrap.classList.remove('buff', 'debuff');
  }

  async _ev_heal(e) {
    const s = this.slotFor(e.ref); if (!s) return;
    s.view.hp = e.remainHp; this.paintCard(s, s.view);
    this.floatNum(s, '+' + e.amount, 'heal');
    if (e.kind !== 'drain') this.say(`${e.name} restored its health!`);
    sfx.heal();
    await wait(this.ms(500));
  }

  async _ev_residual(e) {
    const s = this.slotFor(e.ref); if (!s) return;
    s.view.hp = e.remainHp; this.paintCard(s, s.view);
    this.floatNum(s, '-' + e.amount, 'weak');
    this.say(`${e.name} ${RESIDUAL_MSG[e.kind] || 'was hurt'}!`);
    sfx.weakHit();
    await wait(this.ms(520));
  }

  async _ev_cant(e) {
    const reason = { par: 'is paralyzed! It can’t move!', slp: 'is fast asleep.', frz: 'is frozen solid!', flinch: 'flinched and couldn’t move!', recharge: 'must recharge!' }[e.reason];
    this.say(`${e.name} ${reason}`);
    await wait(this.ms(650));
  }

  async _ev_switchout(e) {
    const s = this.slotFor(e.ref); if (!s) return;
    this.say(`${e.name}, come back!`);
    s.spriteWrap.classList.add('recall');
    await wait(this.ms(360));
  }

  async _ev_switchin(e) {
    const s = this.slotFor(e.ref); if (!s) return;
    const v = e.view;
    s.view = v;
    // swap sprite image
    const newSprite = makeSprite(v.dex, v.anim, s.yours && !s.isBoss, s.isBoss ? 'huge' : '');
    s.spriteWrap.innerHTML = ''; s.spriteWrap.append(newSprite); s.sprite = newSprite;
    s.spriteWrap.classList.remove('recall', 'faint');
    this.setStatusTint(s, v.status);
    // rebuild card (preserve its layout position class)
    const parent = s.el.parentNode;
    const yours = s.yours;
    const posClass = [...s.el.classList].find(c => c.startsWith('card-'));
    const fresh = this.makeCard(v, yours);
    if (posClass) fresh.el.classList.add(posClass);
    parent.replaceChild(fresh.el, s.el);
    Object.assign(s, fresh, { view: v });
    s.spriteWrap.classList.add('send-in');
    sfx.select();
    this.say(`Go! ${v.name}!`);
    await wait(this.ms(500));
    s.spriteWrap.classList.remove('send-in');
  }

  async _ev_end() { /* handled by controller */ }

  // Belt-and-suspenders repaint from the host's authoritative snapshot.
  resync(snapshot) {
    for (const s of snapshot) {
      const slot = this.slotFor(s.ref);
      if (!slot) continue;
      slot.view = s.view;
      this.paintCard(slot, s.view);
      this.setStatusTint(slot, s.view.status);
    }
  }

  // Floating emoji bubble (quick-chat delight).
  emote(ref, txt) {
    const s = this.slotFor(ref); if (!s) return;
    const b = el('div', { class: 'emote-bubble', text: txt });
    s.spriteWrap.append(b);
    setTimeout(() => b.remove(), 1800);
  }
}
