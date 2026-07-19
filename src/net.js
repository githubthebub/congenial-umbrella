// ---------------------------------------------------------------------------
// net.js — serverless peer-to-peer link, powered by Trystero over FREE public
// infrastructure (nostr relays / bittorrent trackers / mqtt brokers). No server
// to run, no account, no cost. WebRTC data channel carries a tiny typed-message
// protocol; the game logic (host-authoritative) lives in main.js.
//
// Trystero is imported lazily from a CDN so that if the CDN or the relays are
// unreachable, the rest of the game (vs-AI, solo raid, pass-and-play) still runs.
// ---------------------------------------------------------------------------

const APP_ID = 'pokelink-arena-v1';

// Candidate ESM builds, tried in order until one imports successfully.
const CANDIDATES = [
  'https://esm.sh/trystero@0.21.5/nostr',
  'https://esm.sh/trystero/nostr',
  'https://cdn.jsdelivr.net/npm/trystero@0.21.5/nostr/+esm',
  'https://esm.sh/trystero/torrent',
  'https://esm.sh/trystero/mqtt',
];

let _mod = null;
async function loadTrystero() {
  if (_mod) return _mod;
  let lastErr;
  for (const url of CANDIDATES) {
    try {
      const m = await import(/* @vite-ignore */ url);
      if (m && typeof m.joinRoom === 'function') { _mod = m; return m; }
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Trystero unavailable');
}

// Short, human-shareable room codes (no ambiguous chars).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomCode(len = 5) {
  let s = '';
  const buf = new Uint32Array(len);
  (crypto || {}).getRandomValues?.(buf);
  for (let i = 0; i < len; i++) s += ALPHABET[(buf[i] ?? Math.floor(Math.random() * 1e9)) % ALPHABET.length];
  return s;
}

export class LinkSession {
  constructor(role, code) {
    this.role = role;              // 'host' | 'guest'
    this.code = code;
    this.room = null;
    this.sendRaw = null;
    this.peerId = null;
    this.connected = false;
    this.handlers = new Map();     // type -> fn(payload, peerId)
    this._status = () => {};
    this._onPeer = () => {};
    this._onLeave = () => {};
  }

  onStatus(fn) { this._status = fn; return this; }
  onPeer(fn) { this._onPeer = fn; return this; }
  onLeave(fn) { this._onLeave = fn; return this; }
  on(type, fn) { this.handlers.set(type, fn); return this; }

  // Resolve on the next message of `type` (one-shot). Restores any prior handler.
  once(type, { timeout = 0 } = {}) {
    return new Promise((resolve, reject) => {
      const prev = this.handlers.get(type);
      let timer = null;
      const restore = () => { if (prev) this.handlers.set(type, prev); else this.handlers.delete(type); if (timer) clearTimeout(timer); };
      this.handlers.set(type, (payload, peerId) => { restore(); resolve({ payload, peerId }); });
      if (timeout > 0) timer = setTimeout(() => { restore(); reject(new Error('timeout:' + type)); }, timeout);
    });
  }

  async connect() {
    this._status('connecting');
    const { joinRoom } = await loadTrystero();
    const room = joinRoom({ appId: APP_ID }, this.code);
    this.room = room;
    const [send, get] = room.makeAction('msg');
    this.sendRaw = send;
    get((data, peerId) => {
      let m = data;
      if (typeof data === 'string') { try { m = JSON.parse(data); } catch { return; } }
      if (!m || !m.type) return;
      const h = this.handlers.get(m.type);
      if (h) h(m.payload, peerId);
    });
    room.onPeerJoin((id) => {
      this.peerId = id; this.connected = true;
      this._status('connected');
      this._onPeer(id);
    });
    room.onPeerLeave((id) => {
      if (id === this.peerId) { this.connected = false; this._status('disconnected'); this._onLeave(id); }
    });
    this._status('waiting');
    return this;
  }

  send(type, payload) {
    if (!this.sendRaw) return;
    try { this.sendRaw(JSON.stringify({ type, payload })); } catch {}
  }

  leave() {
    try { this.room?.leave(); } catch {}
    this.room = null; this.connected = false;
  }
}

// Build a shareable deep-link that drops the opponent straight into the room.
export function roomLink(code, mode = 'link') {
  const base = location.origin + location.pathname;
  return `${base}?join=${encodeURIComponent(code)}&mode=${mode}`;
}

export function readJoinParams() {
  const p = new URLSearchParams(location.search);
  const join = p.get('join');
  return join ? { code: join.toUpperCase(), mode: p.get('mode') || 'link' } : null;
}
