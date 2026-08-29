# DARKROOM

**A roll of film shared by exactly four people. Everyone shoots blind. Nothing develops until the roll is full.**

Instagram shows you everyone. Darkroom is for your three.

*(There is a second app in here now — [**DAYLIGHT**](#daylight--the-companion-app), `daylight.html`, built on the same law: raise a floor slowly, never spike anything.)*

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

---

## DAYLIGHT — the companion app

**`daylight.html`** — open it in any browser. Same construction as the demo above: one file, no build, no account, `localStorage` only.

Darkroom is about anticipation. Daylight is about the baseline underneath it. Both are built against the same enemy — the spike.

### The distinction it's built on

Dopamine is the seeking chemical: it spikes, it crashes, and it asks for the next one. Every habit app on the market is built out of dopamine mechanics — streaks, scores, badges, a red dot. They work for a fortnight and then break in the specific way variable-reward systems break: you miss a day, the counter resets to zero, and the app becomes a thing you're failing at.

Serotonin doesn't spike. It's a floor. You don't raise it in an afternoon and you don't lose it in one bad day — which means the honest interface for it is not a chain, it's a rolling average.

### The six levers

Each is one tap. Each is a behavior with real evidence behind it for mood, not a wellness gesture.

| Lever | What counts | Why it's on the list |
|---|---|---|
| **Sleep** | Woke within 30 min of your anchor | Wake-time regularity predicts mood better than total hours |
| **Light** | 10 minutes outside, early | Brain serotonin turnover tracks same-day sunlight (Lambert, *Lancet* 2002) |
| **Move** | 20 min rhythmic — walking counts | Raises tryptophan availability; strongest trial evidence on the list (*BMJ* 2024) |
| **People** | One real exchange, not a broadcast | Contact where you're a person, not an audience |
| **Savor** | One good thing, written down in detail | Smallest intervention with a repeatedly measured effect; the detail is the active ingredient |
| **Finish** | One small thing, start to end | Behavioral activation — doing before feeling like it |

### The one design decision

**The metric is a 14-day floor, not a streak.** Every day contributes 6 possible points to a rolling 84-point window, rendered as a sky: pre-dawn indigo at zero, full morning light at the top. Miss a day and you lose one dot out of fourteen — the sky barely moves. That's not leniency, it's the actual claim: *the floor is built out of most days, not every day.*

Which produces the product law:

- **No streaks.** Nothing here can be broken, so nothing here can be quit.
- **No score, no badges, no confetti.** A reward spike is the mechanism we're arguing against; you don't build one into the cure.
- **No notifications.** An app that nags you is running on the other chemical.
- **No account, no sync, no server.** Everything typed stays in the browser. There's nobody to perform for.
- **The record is the only feed** — your own savored moments, re-readable, audience of one.

### Honest note

"Serotonin" is shorthand. Nothing in the app measures neurochemistry and no app can; the claim is only that these six behaviors have the most consistent evidence for mood and that they work by raising a floor slowly. The app says this on its own front page, and says plainly that a floor that stays down for weeks is a doctor's job.
