# ⚡ LINKMON — link-cable Pokémon battles, free in your browser

**Battle a friend in 10 seconds. Send them a link.**

LINKMON is a free, no-download, no-account, browser Pokémon battler. The whole
game is static files — it costs **nothing to host** — and multiplayer is
**peer-to-peer**, so there's **no server to run or pay for, ever**. Share a
link and you're dueling, on any phone, anywhere.

It isn't trying to out-Showdown Pokémon Showdown on depth. It competes on the
axis Showdown ignores: **getting two friends into a delightful battle in
seconds**, with a modern, juicy, mobile-first feel — plus warm co-op features
borrowed from Black/White's *Entralink*.

---

## Play it

- **Quick Battle** — instant 3v3 vs a type-aware AI. No setup, no partner needed.
- **Link Up** — create a room, share the link; your friend opens it and you're
  connected peer-to-peer. Real 3v3 with switching.
- **Co-op Raid** — you + a partner vs a colossal boss that strikes twice a turn.
  Gift each other **Pass Powers** (heal / attack / guard / speed / cleanse) to survive.

There's a battle-speed toggle (▶ / ▶▶ / ⏩), sound on/off, a Trainer Card with a
collectible Box, and a **Founding Trainer** crest for Season One players.

## Host it for free (GitHub Pages)

Everything is static — no build step, no backend. Two ways:

**A. Deploy from a branch (simplest)**
1. Push this repo to GitHub.
2. Repo **Settings → Pages**.
3. **Source: Deploy from a branch** → pick your branch (e.g.
   `claude/pokemon-multiplayer-game-eyz5j4`) and folder **`/ (root)`** → **Save**.
4. Wait ~1 min. Your game is live at `https://<you>.github.io/<repo>/`.

**B. GitHub Actions (works from any branch)**
1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Push. The included `.github/workflows/pages.yml` publishes the site.

That's the entire cost: **$0**. Multiplayer runs directly between players'
browsers (WebRTC), with signaling over free public infrastructure — nothing
touches a server you own.

> It also runs on Netlify, Cloudflare Pages, or any static host, and even from a
> plain local web server (`python3 -m http.server`). It won't run from a
> `file://` URL because it uses ES modules — serve it over http(s).

## How the multiplayer works (and why it's free)

- **Rooms & signaling:** [Trystero](https://github.com/dmotz/trystero) over free
  public relays (nostr / torrent / mqtt), loaded lazily from a CDN. No account,
  no infrastructure. If it's blocked, the game says so and offline modes keep working.
- **Host-authoritative:** the room creator runs the *only* battle simulation.
  The other player's client is a thin terminal — it just answers "pick a move /
  pick a switch" prompts and renders the event batches the host sends. There is
  exactly one simulation and one RNG, so **desync is structurally impossible**.
- **Sprites:** the open [PokéAPI](https://pokeapi.co) sprite CDN (animated Gen-V
  front/back where available, official artwork otherwise), with an `onerror`
  fallback cascade so a missing sprite never breaks a battle.

## What's under the hood

A real, from-scratch battle engine — not a toy:

- Canonical **stats** (level 50, IV 31) and the real **damage formula** (STAB,
  the full 18×18 **type chart**, crits, 0.85–1.0 roll, burn).
- **Status** (burn/poison/toxic/paralysis/sleep/freeze with correct immunities),
  **stat stages** (−6…+6), priority, flinch, recoil, drain, healing, high-crit,
  recharge, leech seed, and setup moves.
- **Switching** with forced replacement on a faint.
- 3v3 "Blitz" battles — deliberately snappier than Showdown's 6-mon format, so
  a match fits a phone and a coffee break.

Roster: 42 iconic Pokémon (Kanto → Galar) with legal-ish movesets, six preset
squads, and three simulation-tuned raid bosses.

## Why it's better than Showdown (the psycho-logic)

Showdown is deeper and more complete — and always will be. LINKMON wins on a
different axis, using ideas from Rory Sutherland's *Alchemy* and behavioral
economics. Every one of these is a design decision, not an accident:

| Mechanic | Principle | Borrowed from |
|---|---|---|
| No account, no install — link straight into a duel | Friction kills more products than bad features | Sutherland: perceived cost *is* cost |
| The invite reads "you're inviting a rival", the join screen "someone challenged you" | An invite framed as a **gift of status** converts far better than a referral ask | Gmail's 2004 invites |
| **Founding Trainer** crest for Season One | Scarcity you can't buy later creates real perceived value at zero cost | Sutherland: manufactured meaning |
| **Pass Powers** — gift your partner a buff mid-raid | Positive-sum social warmth, not zero-sum tryhard | B/W *Entralink* |
| Waiting room shows rotating tips, not a spinner | Make the waiting part of the meal | Sutherland: the Eurostar reframing |
| Big tappable moves, floating damage, screen-shake, one-thumb play | Delight is a feature; the medium (phone) is the message | — |
| 3v3 Blitz, battle-speed toggle | Respect the player's time and thumbs | — |
| Co-op raids | A whole mode Showdown simply doesn't have | Max Raid Battles |

The share loop is **structural**, not a growth hack: every battle ends with
"Challenge a friend", and the invite is a scarce, personal gift ("someone
challenged *you*"), which converts far better than an app-store link.

## Developing / testing

```bash
# run the deterministic engine test suite (no dependencies)
node test/engine.test.mjs

# end-to-end browser smoke test + screenshots (needs playwright-core)
npm i -D playwright-core
node test/browser.mjs
node test/shots.mjs
```

- `src/data.js` — types, type chart, moves, 42 species, presets, raid bosses.
- `src/engine.js` — pure, deterministic battle simulation → event log.
- `src/ai.js` — type-aware opponent & boss decision-making.
- `src/net.js` — Trystero P2P wrapper + tiny typed-message protocol.
- `src/ui.js` — DOM/sprite helpers + `BattleScene` (the juicy renderer).
- `src/main.js` — screens, progression, and every game mode.
- `styles.css` — the whole design system (no external fonts/assets).

## A note on the game data

The battle math is faithful to the real games, but this is a small curated
roster — not every Pokémon, ability, item, or weather. That's on purpose:
LINKMON optimizes for *a great first duel in seconds*, not encyclopedic depth.

---

*A fan-made project, for the love of the games. Not affiliated with, endorsed
by, or associated with Nintendo, Game Freak, or The Pokémon Company. Pokémon and
all related names are trademarks of their respective owners. Sprites are served
from the open-source [PokéAPI](https://pokeapi.co) sprite repository.*
