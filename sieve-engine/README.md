# sieve-engine

One Node file, no dependencies. It turns a Google Drive link into the few
megabytes of index that [`../sieve.html`](../sieve.html) needs, and it writes
nothing to disk — not the video, not a proxy, not a cache.

```bash
cd sieve-engine
npm start                      # needs ffmpeg + ffprobe on PATH
# then open:  sieve.html?engine=http://localhost:8787
```

The URL is remembered in `localStorage`, so you only pass it once.

## Why it exists

A web page cannot read a private Drive file (CORS), and transcribing 8 hours
in a browser tab means downloading a ~300 MB model — which is the exact thing
Sieve refuses to do to your laptop. So the split is:

| | does what | holds what |
|---|---|---|
| **engine** (here) | streams the source past a decoder, transcribes, builds the index | one 10-minute audio chunk (~19 MB), then drops it |
| **sieve.html** | ranking, editing, captions, sound design, render | the index (a few MB) and one video frame |

## The one good idea in here

**ffmpeg speaks HTTP and does its own Range requests.** So instead of
downloading the file and piping it in, we hand ffmpeg the URL:

```
ffmpeg -headers "Authorization: Bearer …" -i <drive url> -vn -ac 1 -ar 16000 -f s16le pipe:1
```

That buys three things at once:

- **`-vn` means the video track is never decoded.** The expensive part of the
  file is skipped, not processed.
- **An MP4 with its `moov` atom at the end still works.** ffmpeg seeks for it
  with a Range request. Every "just pipe it into stdin" design fails on this,
  which is most long recordings straight out of a camera or OBS.
- **16 kHz mono PCM is ~1/190th of the source bitrate**, so what comes out of
  the pipe is small enough to process in one pass.

`npm run check` builds a 5-minute test file with the `moov` atom deliberately
at the end, serves it over HTTP from an origin that counts every byte it
pushes to the socket, and runs the engine against it. Measured:

```
source file          7.73 MB
ffprobe              1.75 MB   (3 ranged reads: header, a seek for the moov at the end, then a capped probe)
ffmpeg               8.29 MB   (its own 0.56 MB probe, then one pass through)
read amplification   1.30× the file size
index handed back    8 KB  =  0.10% of the file
disk written         0 bytes
```

So the honest claim is: **the engine reads the source through exactly once and
throws it away as it goes**, plus about 1.7 MB of probing that does not grow
with the file. It does not read it four times, and it does not store it. Your
laptop reads none of it — it gets the 0.1%. (Exact figures move a little with
the encoder; re-run `npm run check` for yours.)

Note the probe caps (`-probesize`, `-analyzeduration`). Without them ffprobe
analyses the *whole* file to describe the streams, which on a 12 GB source is
12 GB of Drive bandwidth spent learning the duration.

## Configuration

All via environment variables. None are required to get an energy-only index.

| variable | what it does |
|---|---|
| `PORT` | default `8787` |
| `GOOGLE_OAUTH_TOKEN` | read **private** Drive files. Get one from the [OAuth playground](https://developers.google.com/oauthplayground) with scope `drive.readonly`, or your own OAuth client. |
| `GOOGLE_API_KEY` | read files shared as "anyone with the link" |
| *(neither)* | falls back to the public `drive.usercontent.google.com` download endpoint, which works for link-shared files and not much else |
| `ASR_BASE` | OpenAI-compatible transcription endpoint, e.g. `https://api.groq.com/openai/v1` or `https://api.openai.com/v1` |
| `ASR_KEY` | its key |
| `ASR_MODEL` | default `whisper-large-v3` |
| `CHUNK_SECONDS` | default `600`. Audio is transcribed in chunks this long and each one is released straight after, so this sets peak memory (~1.9 MB per minute). |
| `FFMPEG` / `FFPROBE` | binary paths |

**Without `ASR_BASE`/`ASR_KEY` it still works** — you get the loudness
envelope and speech-run segmentation, which is enough to find the loud and
lively parts of your own footage and cut it with real jump cuts. You do not
get words, so four of the six ranking signals stay blank rather than guessed,
and the UI says so.

```bash
GOOGLE_OAUTH_TOKEN=ya29.… \
ASR_BASE=https://api.groq.com/openai/v1 ASR_KEY=gsk_… \
npm start
```

## API

```
GET  /health          → {ok, asr, auth}
POST /index           {driveId} or {url}     → {job}
GET  /index/:job      → {state, progress, log[], streamed, seconds, disk, index?}
```

`state` is `running` | `done` | `error`. `disk` is there so the number can be
checked rather than believed; it is always 0.

## Laughter

Whisper does not transcribe laughter, and laughter is the best single
predictor of a clippable moment in a conversation. It is recoverable from the
envelope for free: a stretch that is **loud for more than half a second with
no words in it** is, in a two-person podcast, almost always a laugh. The
engine inserts those as `[laughter]` tokens, which is what feeds the PEAK and
LAND signals in the ranker.

It is a heuristic. It will call a cough a laugh, and it will miss a quiet one.
It is labelled as a heuristic in the code and it is worth far more than
nothing, which is the alternative.

## What it does not do

- **No speaker diarisation.** Words come back on one speaker track and the UI
  labels them `SPEAKER`. Diarisation needs a second model; it is not worth a
  300 MB dependency for a label.
- **No persistence.** Jobs live in memory. Restart it and the index is gone —
  re-run it, or keep the index in the browser where it already is.
- **No auth on the engine itself.** It is a localhost tool. Do not put it on a
  public address without putting something in front of it.
