# OU Battle Simulator — Gen 9 (play against Claude)

A browser Pokémon battle game in the style of **Pokémon Showdown's Gen 9 OU**
singles ladder. You build a lead, read your opponent, and try to out-think an
AI that is genuinely *thinking back* — it damage-calcs every option, models what
**you** are about to do, values long-term position, and Terastallizes on the
right turn.

The headline opponent is **Claude**: the same kind of predict-and-position play
you asked to test yourself against. Around it is a ladder of AI "trainer"
personas from a casual 1100 up to a 1950 tournament grandmaster, each with a
different playstyle and team.

> **Just open [`index.html`](./index.html) in any browser.** No build step, no
> server, no account, no external assets — it runs entirely offline from a
> single folder (great for GitHub Pages or an artifact link too).

---

## How to play

1. **Pick your opponent.** Seven AI personas, sorted by Elo and playstyle
   (casual ladderer → balance specialist → hazard/hyper-offense → weather abuser
   → grandmaster → **Claude**).
2. **Pick your team.** Five cohesive, competitively-plausible OU squads:
   *Standard Balance, Hyper Offense, Rain, Sun, Sand.*
3. **Team preview.** You see the opponent's whole team (just like Showdown) and
   choose which of your six to lead with.
4. **Battle.** Click a move, or switch, or arm **Terastallize** before a move.
   The opponent chooses simultaneously from the pre-turn state — no peeking at
   your click.

You win when the other team faints. Rematch keeps the same matchup with a fresh
RNG seed; New Battle sends you back to the menu.

---

## What the engine actually simulates

This is a faithful-*enough* Gen 9 singles engine — the mechanics that decide OU
games, not every corner case of the cartridge:

- **Real damage formula** — the exact `(2·L/5+2)·BP·A/D / 50 + 2` chain with
  STAB, the 18-type chart, critical hits, the 85–100% roll, and per-step
  rounding.
- **Stat stages** (−6…+6) with the correct multipliers; **natures**, EVs/IVs and
  the level-100 stat formula.
- **Turn order** by priority then Speed, including Choice Scarf, paralysis,
  Swift Swim / Sand Rush, and Protosynthesis/Quark Drive Speed boosts.
- **Status** — burn, paralysis, poison, badly-poisoned (toxic ramp), sleep,
  freeze, confusion, flinch — with their damage/behaviour and type immunities.
- **Weather** — Sun, Rain, Sand, Snow: damage multipliers, chip, Speed and
  defensive boosts, and Paradox/Booster interactions.
- **Entry hazards** — Stealth Rock (type-scaled), Spikes (1–3 layers), Toxic
  Spikes, Sticky Web — plus Rapid Spin removal and Heavy-Duty Boots immunity.
- **Items & abilities** used by the rosters — Choice items, Life Orb, Leftovers,
  Rocky Helmet, Focus Sash, Air Balloon, Booster Energy, Assault Vest;
  Protosynthesis, Quark Drive, Supreme Overlord, Good as Gold, Regenerator,
  Multiscale, Intimidate, Rough Skin, weather-setters, and more.
- **Terastallization** — once per battle, with the correct STAB math (1.5× /
  2.0× same-type Tera) and defensive type change.
- **Mid-turn replacements** — when a Pokémon faints to the first attacker, or a
  U-turn / Volt Switch / Flip Turn fires, the game correctly pauses for the
  incoming Pokémon *before* the next move — the momentum reads that make singles
  singles.

---

## The opponent's brain (`js/ai.js`)

Not a neural net — a competitive-heuristic engine written to play like a strong
ladder human:

- **Damage-calcs every option** (side-effect-free, averaged rolls) to know exactly
  what KOs, what gets KO'd, and who moves first.
- **Opponent modeling / prediction** — it estimates whether *you* are likely to
  attack or bail to a resist, and uses that to (dis)value conditional moves like
  Sucker Punch, momentum grabs, and setup windows.
- **Position, not just damage** — it switches to preserve win conditions,
  weighs entry-hazard chip against the value of a better matchup, keeps hazards
  up, and only sets up when it is actually safe.
- **Tera timing** — it holds Terastallization until it flips the KO math, on
  offense or defense.
- **Personas** tune the weights — greed, switchiness, prediction, risk appetite,
  and Tera philosophy — so a 1100 casual really does play more greedily than the
  1950 grandmaster, and **Claude** predicts hardest.

The AI plays with strong game knowledge (it reasons about the threats on the
field the way an experienced player who knows the metagame would). That's what
makes it a real test of *your* prediction rather than a punching bag.

---

## Project layout

```
index.html      UI shell + styling (Showdown-style battle scene)
js/data.js      Type chart, natures, Pokédex (real Gen 9 base stats),
                moves, five OU teams, and the opponent personas
js/engine.js    The battle engine (damage, status, weather, hazards,
                items, abilities, Tera, resumable turn resolution)
js/ai.js        The decision engine / opponent brain
js/ui.js        Front-end: rendering, animation, and the game loop
js/test.js      Headless smoke test (run: node js/test.js)
```

### Verifying it

```bash
node js/test.js      # 300 random-agent + 40 AI-vs-AI battles; expects ALL GREEN
```

The files are plain `<script>`-tag JavaScript (no bundler, no modules) so they
load from `file://` and double as Node modules for the test harness.

---

## Honest scope notes

This covers the OU mechanics that matter for a fun, strategic game, not 100% of
Showdown. Terrains, a handful of niche abilities/items, and some rare
interactions are simplified or omitted; the roster is a curated ~18 top-tier
Pokémon across five teams rather than the full dex. The opponent personas are
**AI personalities, not real people.** Everything is deterministic from a seed,
so battles are reproducible.

Have fun finding out who reads whom better.
