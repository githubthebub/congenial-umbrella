# Darkroom — design brief

**Design read.** For small groups of close friends (19–30) exhausted by performative
social media; the register is intimate, analog, slightly conspiratorial — a ritual,
not a feed.

**Concept spine.** *The site is a darkroom.* Every screen behaves like a room lit by
a safelight: photos exist but cannot be seen; the interface is the instrument that
develops them. Anticipation is the product; the UI enforces it rather than decorating it.

**Delivery tier.** `editorial` — this is a functional product app, not a marketing
page. Typography + bespoke chrome + micro-motion only (safelight lamp pulse, tank
sway, staged develop reveal). No scroll cinematics; the wow is the develop moment.

**Locked palette** (defense: a literal darkroom — near-black warmed by amber film
base and one safelight accent; nothing else is permitted in a darkroom or in this UI):

- `#0d0b09` ground (bone-black, warm)
- `#15110d` / `#1c1712` raised surfaces
- `#2e261d` hairlines
- `#efe6d8` ink (silver-gelatin paper white)
- `#a89a86` / `#6b5f4f` dimmed ink
- `#ff5a1f` safelight (the one loud voice: CTAs, the lamp, law numerals)
- `#e8b04b` amber (film base: counters, exposure marks)

Single-theme by design: a darkroom has no light mode.

**Locked type.** Old-style serif (Iowan Old Style / Palatino stack) for prose — the
voice of a printed contact sheet; monospace (SF Mono stack) for the instrument layer —
roll numbers, counters, laws, buttons. No third face.

**Tier-1 moment.** The develop sequence: full roll → safelight tray sway → staged
chemistry captions (agitate / stop bath / fixer / rinse / dry) → polaroids fade in
from unexposed black via a develop filter animation, each tilted and delayed.
Interactive in the true sense: four people caused it together, and it runs exactly once.

**Section plan (single-screen app states).** landing (laws + how) → load-a-roll form →
join (the handed-a-gift moment) → active roll (canister, seats, filmstrip counter) →
developing → gallery. One layout family per state; no repeats.

**Asset plan.** All imagery is user-generated photographs — that is the product. UI
imagery is limited to CSS/SVG-built film artifacts (grain, sprocket strip, tray).
Generated brand assets: favicon (safelight lamp mark) + OG/marketplace cover per
`references/app-cover.md`.

**CTA inventory.** Primary (safelight fill): Start a roll / Load it / Take the spot —
each full-width at its moment of decision. Secondary (ghost outline): demo, back.
Tertiary (inline spot row): Give a spot away. No shared site-wide button skin beyond
the .dkr-btn family; each CTA's label is the mechanic, not a verb like "Submit".

**What we refuse to build (product law, also stated on the landing page).** No feed,
no likes, no followers, no algorithm, no ads, no AI content, no light mode, no fifth seat.
