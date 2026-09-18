# DARKROOM

**A roll of film shared by exactly four people. Everyone shoots blind. Nothing develops until the roll is full.**

Instagram shows you everyone. Darkroom is for your three.

## Two ways to run it

**1. The instant demo — `index.html` (repo root).**
Open it in any browser. No build, no server, no account; hostable anywhere static (GitHub Pages, Netlify, an artifact link). State lives in `localStorage` and the other three players are simulated, so you can feel the whole loop — start a roll → give away 3 spots → shoot blind → frame 24 develops — entirely on one device.

**2. The real, synced version — [`server/`](./server).**
A Cloudflare Worker + D1 database that syncs rolls across everyone's phones for real: when a friend taps your invite on *their* device your seat count ticks up, when anyone shoots a frame everyone's counter moves, and frame 24 develops on all four phones at once. Deploy it free in ~3 minutes:

```bash
cd server && npm install && npm run setup
```

See [`server/README.md`](./server/README.md) for details. The "blind" rule is enforced in the backend — the photo endpoint returns `403` until a roll develops, so you can't peek early even via the API.

Both versions share the same behavior:

- **Start a roll** → you get 3 spots to give away → shoot blind → frame 24 develops for all four of you at once.
- **Watch one develop (30s demo)** → seeded roll so you can feel the reveal without recruiting anyone.
- **Invite links work for real**: the share button produces a URL that opens the recipient onto a "someone saved you a spot" claim screen.

## Why this beats Instagram (the psycho-logic)

Instagram cannot copy any of this without destroying its own revenue — every mechanic below is the *opposite* of an engagement-maximizing ad business, which is exactly why the position is defensible (counter-positioning, not feature war).

| Mechanic | Principle | Who it's stolen from |
|---|---|---|
| Exactly 4 people, no more | Scarcity creates value; a velvet rope beats an open door | Rory Sutherland, *Alchemy* |
| Invite framed as "I saved you a spot" | An invite is a gift of status, never a referral ask | Gmail's 2004 invite system |
| Shoot blind, no retakes, 24 frames | Costly signaling — when a frame costs something, it means something | Dispo / film photography |
| Nothing develops early | Anticipation is the product; delayed gratification beats dopamine drip | Sutherland: "the waiting is part of the meal" |
| No likes, followers, feed, or algorithm | Nobody performs for four people they already love | BeReal's insight, kept as law |
| Development night reveal | One shared emotional peak instead of infinite scroll | Berger's *STEPPS*: Emotion + Stories |

## The viral loop (why 1 person shares to 3)

The K≥3 requirement is **structural, not incentivized** — referral programs decay; chemistry doesn't:

1. A roll **cannot develop** with an empty seat. The product is literally inert until you fill your 3 spots. Inviting isn't growth hacking — it's loading the film.
2. Every invite is scarce ("one of my 3 spots", "last spot") and personal — it reads like an inside joke, not a marketing blast, so conversion stays high (Berger: Social Currency; Sutherland: perceived value *is* value).
3. Every joiner who feels the development-night reveal is prompted to **start their own roll** — which hands them 3 fresh spots. 1 → 3 → 9, with the cycle time of one roll.

**K-factor math:** 3 spots per user × high conversion (a named friend saving you a scarce seat converts far better than an app-store link) ≈ K approaching 3 per cycle, sustained because recruitment is required for *every* roll, not just signup.

## What we refuse to build (product law)

No feed. No likes. No followers. No algorithm. No ads. No AI-generated content. No public anything. Ever. These are not missing features — they are the product.
