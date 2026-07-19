# Darkroom — the real, synced version

This is the full backend version of Darkroom. Rolls sync across everyone's
phones: when a friend taps your invite on **their** device, your seat count
ticks up; when anyone shoots a frame, everyone's counter moves; and frame 24
develops on all four phones at once.

It runs on **Cloudflare Workers + D1** (a free-tier SQLite database). Photos are
downscaled in the browser and stored in D1, so there's nothing else to set up —
no object storage, no separate server.

> The instant, no-signup demo is the `index.html` at the repo root. This folder
> is the deployable app with a real backend.

---

## Deploy it (about 3 minutes, free)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and
Node.js installed.

```bash
cd server
npm install
npm run setup
```

`npm run setup` logs you into Cloudflare, creates the D1 database, writes its id
into `wrangler.toml`, creates the tables, and deploys. When it finishes it prints
your live URL (`https://darkroom.<your-subdomain>.workers.dev`). Open it, start a
roll, and give away your three spots.

### If you'd rather do it by hand

```bash
cd server
npm install
npx wrangler login
npx wrangler d1 create darkroom          # copy the database_id it prints
#  → paste that id into wrangler.toml (replace PUT_YOUR_D1_DATABASE_ID_HERE)
npx wrangler d1 execute darkroom --remote --file=./schema.sql
npx wrangler deploy
```

(The schema also auto-creates on the first request, so the `d1 execute` step is
optional — but running it means the very first visitor doesn't pay for it.)

### Change something later

Edit files, then `npx wrangler deploy` again. That's the whole loop.

---

## How it works

```
server/
  src/index.js        the Worker: the API + the "blind" rule, enforced server-side
  schema.sql          D1 tables (rolls, members, frames)
  public/index.html   the app the browser loads (talks to /api, polls for sync)
  wrangler.toml       Cloudflare config (Worker + static assets + D1 binding)
  setup.sh            one-command create-db + deploy
```

**The blind rule lives in the backend, not just the UI.** The photo endpoint
returns `403` until a roll has developed — you literally cannot fetch a frame
early, even by hitting the API directly. Anticipation is enforced, not
suggested.

### The API

| Method + path | What it does |
|---|---|
| `POST /api/rolls` | Create a roll. Returns `{rollId, memberId, seat}`. The host is seat 0. |
| `POST /api/rolls/:id/join` | Take the next open seat. `409` once four are filled. |
| `GET /api/rolls/:id` | Roll state — seats, frame count, status. Clients poll this. Returns photo metadata only after develop. |
| `POST /api/rolls/:id/frames` | Shoot a frame (needs `Authorization: Bearer <memberId>`). Claims the next exposure; the 24th develops the roll. |
| `GET /api/rolls/:id/frames/:idx/photo` | The frame's JPEG — **`403` until the roll has developed.** |

Seat and exposure claims use a `UNIQUE` constraint plus retry, so two people
tapping at the same instant can't grab the same seat or frame.

A roll id is a capability: anyone with the id (i.e. the invite link) can see the
roll's status and, after development, its photos. That's the intended sharing
model for a four-person roll — keep the link to the four of you.

---

## Notes & limits

- **Free-tier friendly.** D1's free tier is generous; downscaled 640px JPEGs are
  ~40–100 KB each, so a roll is ~1–2 MB. Fine for personal use and plenty of
  friends' rolls.
- **Scaling up.** If you ever outgrow storing photos in D1, move the `photo`
  column to [R2](https://developers.cloudflare.com/r2/) object storage — swap the
  write in `shootFrame` and the read in `servePhoto`; the rest is unchanged.
- **No accounts.** Identity is a per-roll seat token kept in the browser. That's
  deliberate: Darkroom has no followers, no profiles, and nothing to log into.
