# DARKROOM

**A roll of film shared by exactly four people. Everyone shoots blind. Nothing develops until the roll is full.**

Instagram shows you everyone. Darkroom is for your three.

*(There are two more apps in here now — [**DAYLIGHT**](#daylight--the-companion-app), `daylight.html`, built on the
same law: raise a floor slowly, never spike anything. And [**SIEVE**](#sieve--shorts-out-of-long-video-without-downloading-the-video),
`sieve.html`, which finds the ninety good seconds inside an eight-hour video without your laptop ever downloading it.)*

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

---

## SIEVE — shorts out of long video, without downloading the video

**`sieve.html`** — open it in any browser. Paste a Google Drive link to an
8-hour recording, get back the ninety seconds worth posting. Same construction
as the others: one file, no build, no account. There's an optional engine
([`sieve-engine/`](./sieve-engine)) for the Drive half, and a bundled 8h12m demo
index so the whole loop works offline with nothing installed.

```
open sieve.html            # the demo runs with the network off
cd sieve-engine && npm start   # then: sieve.html?engine=http://localhost:8787
```

### The problem, stated honestly

A YouTube creator with a 256 GB laptop cannot run Premiere over an 8-hour
podcast. Not "it's slow" — the media cache alone will fill the disk, and the
proxy pass takes longer than the episode. iMovie won't open the file. So the
clip doesn't get made.

Premiere's price is $23 a month. Its **cost** is 40 GB of disk, a six-minute
launch, a proxy workflow and a render queue you have to sit next to. The real
competitor is therefore not another NLE — it's *"I'll do it later."* Which
means the thing to attack is the ritual, not the feature list.

### Three ideas, and they're the whole product

**1. You never needed the pixels.** To *find* a clip inside 8 hours you need
the transcript (54,000 word-timed words ≈ 2.3 MB) and the loudness envelope
(10 Hz, 295,000 samples ≈ 1.1 MB). That's a **3.4 MB search index for 12.4 GB
of video — 0.03% of it**, and scoring every 17–58 second window in all 8 hours
takes ~250 ms in a browser tab. Pixels get decoded for the 45 seconds you
actually chose, at the moment you render, one frame at a time. Peak memory is
one frame. Peak disk is the finished short.

**2. The transcript is the timeline.** A timeline is a skeuomorph of a physical
strip of film — correct for a wedding video, wrong for a podcast, where every
edit you want is a sentence-level decision. So there is no timeline. You strike
a sentence and it leaves the video. Dead air is struck for you: every pause
over the threshold becomes a 120 ms breath, which is the single highest-ROI
edit in shorts and the one no human should do by hand.

**3. The meme sounds are oscillators, not samples.** Every SFX — vine boom,
airhorn, record scratch, suspense riser, payoff bell, sad trombone, bruh,
whoosh — is synthesised at render time from two or three oscillators and a
filter. Zero MB of sound library, zero licensing, and nothing for Content ID to
match against, because a vine boom made of a sine sweep is not a recording of
anything. A downloaded meme pack is a copyright claim waiting to happen.

### The ranking argues its case

Auto-clippers fail in one specific way: they hand you a clip that opens on
*"so that's exactly why he did it"* — a pronoun with no antecedent — and the
viewer is gone in 1.2 seconds. So **self-contained** is a first-class signal
here, not an afterthought.

| Signal | What it measures | Stolen from |
|---|---|---|
| **Hook** | Does the first line stop a thumb? Questions, absolutes, stakes, second person. Penalised for opening on "so…" | Retention graphs die in the first 2s |
| **Alone** | Can a stranger follow it with none of the previous 8 hours? Leading pronouns are fatal | The failure mode of every auto-clipper |
| **Peak** | Loudness and laughter, straight off the envelope | The only signal the room can't fake |
| **Gap** | An open loop, a numbered list, a "turns out" | Berger, *STEPPS*: Curiosity |
| **Land** | Does it land on a punchline, or just stop mid-sentence? | Sutherland: "the waiting is part of the meal" |
| **Pace** | Words per second, and how much of it is silence | — |

Six bars, each legible, each overridable, plus an honest disclaimer in the UI:
this **ranks** candidates, it does not predict views. Nothing predicts views.
What it does is turn 8 hours into 24 decisions.

One signal earns its keep more than the rest. Grammar can fake a hook — *"Do
you want to pick this up after a break?"* is a short second-person question,
structurally perfect and about nothing. Peak can't be faked, so a window where
nobody laughs and nobody raises their voice is damped, and the card says
**"nothing happens here"** out loud. On the bundled 8-hour demo that pushes all
23 hand-written real moments above every one of the ~7,300 filler sentences.

### What's measured rather than asserted

`cd sieve-engine && npm run check` builds a 5-minute test file with its `moov`
atom deliberately at the end — the case that breaks every "pipe it into stdin"
design — serves it over HTTP from an origin that counts every byte it pushes to
the socket, and runs the engine against it:

```
source file          7.73 MB
ffprobe              1.75 MB   (header, a ranged seek for the moov at the end, a capped probe)
ffmpeg               8.29 MB   (one pass through; interleaved audio can't be cherry-picked)
read amplification   1.30× the file size
index handed back    0.10% of the file
disk written         0 bytes
```

The engine hands ffmpeg the URL rather than the bytes, so **ffmpeg does its own
Range requests** — which is why a moov-at-the-end MP4 works, why `-vn` means
the video track is never decoded, and why nothing is ever written to disk.
Audio is transcribed in 10-minute chunks that are released immediately, so peak
memory is ~19 MB regardless of whether the recording is 20 minutes or 20 hours.

Laughter is recovered from the envelope, not the transcript: Whisper doesn't
transcribe a laugh, and a laugh is the best single predictor of a clippable
moment in a conversation. A stretch that is loud for over half a second with no
words in it is, in a two-person podcast, almost always one. It's a heuristic,
it's labelled as a heuristic, and it beats the alternative of nothing.

### Put it online — a link anyone can use

`sieve.html` is one static file, so **GitHub Pages hosts it for free**. This
repo is public and Pages is not switched on yet; it takes one screen:

> **Settings → Pages → Source: “Deploy from a branch” → branch
> `claude/serotonin-boost-zyjrmt` → folder `/ (root)` → Save**

About a minute later the link is live, and it updates itself on every push:

```
https://githubthebub.github.io/congenial-umbrella/sieve.html
```

**It has to be served over https (or plain http), not opened as a `file://`.**
Two things only work on a real origin, both measured rather than assumed:

- `AudioWorklet.addModule()` refuses a blob URL on `file://` with
  `AbortError`, so the scanner falls back to `ScriptProcessorNode` there —
  which works, but lands in fewer envelope buckets (it interpolates ~130 of
  401 and logs that it did). On https the worklet covers every bucket.
- A cross-origin video needs a real page origin for the CORS handshake that
  keeps the canvas readable.

**Not a Claude artifact, deliberately.** Artifacts run under a CSP that blocks
media and `fetch` from every host except a few script CDNs, and blocks any
download the page starts itself. Sieve would be able to read nothing from
Drive and hand you no file at the end — a link that looks right and does
neither of the two things it exists for.

### Four ways in

1. **The demo** — a bundled 8h12m podcast index. Runs with the network off.
2. **A Drive link, read in this tab** — no server at all. Verified:
   `googleapis.com/drive/v3/files/<id>?alt=media` reflects the page origin in
   `access-control-allow-origin` and honours `Range`, so the browser streams
   the file straight from Google. The canvas stays **untainted**, which is what
   lets the renderer use the real pixels. Needs a credential in the URL,
   because a `<video>` element cannot send an `Authorization` header: a free
   **API key** for anything shared “anyone with the link”, or an **OAuth
   access token** for a private file. It is kept in your browser and sent to
   Google — this page has no backend to send it anywhere else.
3. **A file on this laptop** — decoded once at 8 kHz mono (≈60× smaller than
   the real thing), envelope built, samples dropped. Over 300 MB it refuses,
   on purpose: a big file belongs on the engine, not in your RAM.
4. **The engine** — for 8 hours with real words. ffmpeg decodes audio far
   faster than any browser can play it.

### The honest arithmetic of scanning in a browser

A browser will not play faster than **16×** — `playbackRate = 32` throws
`NotSupportedError`. Measured at **15.9× effective**, which means:

| Recording | Scan time |
|---|---|
| 20 minutes | ~75 seconds |
| 1 hour | ~4 minutes |
| 8 hours | ~31 minutes |

So Sieve asks *which part* rather than pretending: scan twenty minutes of an
eight-hour recording in seventy-five seconds, take the clips, come back for
the next twenty. The engine has no such ceiling — that is what it is for.

The scan is silent and reads only the bytes it plays: a 9.5 MB file took
**4 range requests**. Loudness is measured as RMS per 128-sample quantum in an
AudioWorklet and folded into a 10 Hz envelope — about 22 measurements per
second of media — then **normalised to that file's own loudest point**, because
an absolute threshold means nothing across different recordings.

### Captions without downloading a model

There is no transcript on the Drive path, and the fix is not a 40 MB Whisper
model — it is twelve seconds of typing. **You type the line and Sieve aligns
it**: the words are distributed across the speech runs it detected, weighted by
syllable count, so every word lands inside actual speech and the silences are
skipped. Forced alignment's useful 90% for none of its cost. Measured on the
test clip: **14 of 14 words landed inside a detected speech run.**

The four text-driven signals (Hook, Alone, Gap, Land) stay **blank** on an
energy-only index rather than being guessed, and the cards say so.

### The sound library — 31 sounds, 0 MB

| Category | Sounds |
|---|---|
| **Impacts & punchlines** | Vine boom · Bass drop · Thud · Metal pipe · Anvil |
| **Hype** | Airhorn · Airhorn ×3 · Siren · Applause · Sparkle |
| **Comedy & reactions** | Bruh · Sad trombone · Slide whistle · Boing · Exit whistle · Ba-dum-tss · Record scratch · Raspberry |
| **Tension & reveals** | Suspense riser · Dun dun dunnn · Ominous drone · Heartbeat · Ticking clock |
| **Notification & game** | Payoff bell · Message pop · Coin · Level up · Wrong answer · Camera shutter · Typewriter · Whoosh |

Every one is two or three oscillators and a filter, built at render time out of
four shared helpers (`tone`, `hiss`, `bell`, `chord`). Which means:

- **Nothing downloads.** No sound pack, no CDN, no licence file. The library
  adds no bytes to the page beyond its own code.
- **Nothing here is a recording of anything.** Content ID matches audio
  fingerprints *of recordings* — a vine boom made of a sine sweep has no
  recording to fingerprint. (That is a statement about how fingerprint
  matching works, not legal advice.) A downloaded “free meme sounds” pack is
  the opposite bet: most of them contain copyrighted recordings, and the claim
  arrives after you have published.

Placement is one tap on the quick bar under the preview, or keys **1–8**, at
the playhead. The full 31 are searchable, grouped, and preview on hover. Six
content rules place sounds automatically where the transcript earns them — a
record scratch on a self-interruption, an airhorn after a number worth
bragging about, a riser two seconds before the payoff — and on an energy-only
index the loudest moment gets the hit instead, since that is the only thing
the envelope actually knows.

**Density is a law, not a slider.** *Tasteful* allows one sound per ~9 seconds,
*Unhinged* one per ~4.5, and it genuinely generates rather than just raising
the ceiling. Content-driven sounds are placed in a first pass so a whoosh can
never displace the riser that the script earned.

### What Sieve refuses to build

No timeline. No media bins. No project files. No account. No upload of your
footage to anyone. No AI voice, no AI avatar, no generated slop — every word in
the output is a word somebody actually said. No "smart" edit you can't see and
can't undo. And no score you can't argue with.
