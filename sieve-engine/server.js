/* ===========================================================================
   SIEVE ENGINE — turns an 8-hour Drive link into a few MB of index.
   No dependencies. Nothing is ever written to disk, on your laptop or here.

   The trick is that ffmpeg speaks HTTP and does its own Range requests, so:
     - an MP4 with its moov atom at the end still works (it seeks for it)
     - the video track is never decoded at all (-vn)
     - audio comes out as 16 kHz mono PCM, which is 1/190th of the bitrate
     - we hold ten minutes of it at a time, then throw it away

   Peak memory is one ASR chunk (~19 MB). Peak disk is zero.
   =========================================================================== */
import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT      = +(process.env.PORT || 8787);
const FFMPEG    = process.env.FFMPEG  || 'ffmpeg';
const FFPROBE   = process.env.FFPROBE || 'ffprobe';
const ASR_BASE  = process.env.ASR_BASE  || '';          // e.g. https://api.groq.com/openai/v1
const ASR_KEY   = process.env.ASR_KEY   || '';
const ASR_MODEL = process.env.ASR_MODEL || 'whisper-large-v3';
const OAUTH     = process.env.GOOGLE_OAUTH_TOKEN || '';
const API_KEY   = process.env.GOOGLE_API_KEY || '';
const CHUNK_SEC = +(process.env.CHUNK_SECONDS || 600);  // 10 min ≈ 19 MB of PCM
const RATE = 16000, HZ = 10, BUCKET = RATE / HZ;

const jobs = new Map();

/* ------------------------------- helpers -------------------------------- */
const sh = (cmd, args) => new Promise((res, rej) => {
  const p = spawn(cmd, args); let out = '', err = '';
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
  p.on('error', rej);
  p.on('close', c => c === 0 ? res(out) : rej(new Error(cmd + ' exited ' + c + ': ' + err.slice(-400))));
});

function driveSource(id) {
  if (OAUTH) return { url: `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
                      headers: `Authorization: Bearer ${OAUTH}\r\n` };
  if (API_KEY) return { url: `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${API_KEY}`, headers: '' };
  return { url: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, headers: '' };
}

function wav(pcm) {                                    // 44-byte header, no library
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function transcribe(pcm, offset, job) {
  if (!ASR_BASE || !ASR_KEY) return [];
  const fd = new FormData();
  fd.append('file', new Blob([wav(pcm)], { type: 'audio/wav' }), 'chunk.wav');
  fd.append('model', ASR_MODEL);
  fd.append('response_format', 'verbose_json');
  fd.append('timestamp_granularities[]', 'word');
  const r = await fetch(ASR_BASE.replace(/\/$/, '') + '/audio/transcriptions',
    { method: 'POST', headers: { Authorization: 'Bearer ' + ASR_KEY }, body: fd });
  if (!r.ok) throw new Error('ASR ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  const src = j.words || (j.segments || []).flatMap(s => s.words || []);
  if (!src.length && j.text) job.log.push('ASR returned no word timings — check the model supports them');
  return src.map(w => ({
    w: String(w.word ?? w.text ?? '').trim(),
    t: +(offset + (w.start ?? 0)).toFixed(3),
    d: +Math.max(0.08, (w.end ?? 0) - (w.start ?? 0)).toFixed(3),
    spk: 0,
  })).filter(w => w.w);
}

/* Laughter has no word to transcribe, so ASR drops it — but it is the single
   best predictor of a clippable moment in a conversation. It is recoverable
   from the envelope alone: a stretch that is loud for over half a second with
   no words in it is, in a two-person podcast, almost always a laugh. */
function findLaughter(words, energy, speechMean) {
  const out = [], thr = Math.min(0.92, speechMean * 1.18);
  const covered = i => {
    const t = i / HZ;
    return words.some(w => t >= w.t - 0.15 && t <= w.t + w.d + 0.15);
  };
  let run = null;
  for (let i = 0; i < energy.length; i++) {
    const hot = energy[i] > thr && !covered(i);
    if (hot) { if (!run) run = { a: i }; run.b = i; }
    else if (run) {
      if ((run.b - run.a) / HZ > 0.5) out.push({ w: '[laughter]', t: +(run.a / HZ).toFixed(2), d: +((run.b - run.a) / HZ).toFixed(2), spk: 0, lau: 1 });
      run = null;
    }
  }
  return out;
}

/* With no ASR there are no words, and with no words there is nothing to rank.
   The envelope still knows where somebody was talking, so segment it into
   speech runs and hand those back as untranscribed tokens — same shape as a
   word, flagged nc ("no caption"). Enough to find the lively stretches and cut
   real jump cuts; not enough to pretend we know what was said. */
function speechRuns(energy, thr = 0.055) {
  const out = []; let run = null;
  for (let i = 0; i <= energy.length; i++) {
    const hot = i < energy.length && energy[i] > thr;
    if (hot) { if (!run) run = { a: i }; run.b = i; }
    else if (run && (i - run.b) / HZ > 0.30) {
      if ((run.b - run.a) / HZ > 0.35)
        out.push({ w: '\u25AE', t: +(run.a / HZ).toFixed(2), d: +((run.b - run.a) / HZ).toFixed(2), spk: 0, nc: 1 });
      run = null;
    }
  }
  if (run && (run.b - run.a) / HZ > 0.35)
    out.push({ w: '\u25AE', t: +(run.a / HZ).toFixed(2), d: +((run.b - run.a) / HZ).toFixed(2), spk: 0, nc: 1 });
  return out;
}

/* ------------------------------ the pipeline ----------------------------- */
async function run(job, src, name) {
  job.log.push('probing (ranged reads only, no download)…');
  let meta = {};
  try {
    /* Without these two caps ffprobe analyses the WHOLE file to describe the
       streams — on a 12 GB source that is 12 GB of Drive bandwidth just to
       learn the duration. Capped, it reads the header and the moov atom. */
    const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams',
                  '-probesize', '2000000', '-analyzeduration', '1000000'];
    if (src.headers) args.push('-headers', src.headers);
    meta = JSON.parse(await sh(FFPROBE, args.concat(['-i', src.url])));
  } catch (e) { throw new Error('ffprobe could not read that URL. If the file is private, set GOOGLE_OAUTH_TOKEN. (' + e.message + ')'); }
  const dur   = Math.round(+(meta.format?.duration || 0));
  const bytes = +(meta.format?.size || 0);
  const rate  = +(meta.format?.bit_rate || 0) / 8;
  if (!dur) throw new Error('no duration in the container — is that a media file?');
  job.bytes = bytes;
  job.log.push(`container: ${hms(dur)} · ${fmtB(bytes)} · ${meta.streams?.length || 0} streams`);
  job.log.push('ffmpeg: -vn (the video track is never decoded) → 16 kHz mono PCM');

  const args = [];
  if (src.headers) args.push('-headers', src.headers);
  args.push('-i', src.url, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-loglevel', 'error', 'pipe:1');
  const ff = spawn(FFMPEG, args);
  let ffErr = '';
  ff.stderr.on('data', d => ffErr += d);

  const energy = [];
  let tail = Buffer.alloc(0), chunk = [], chunkBytes = 0, chunkStart = 0, samples = 0;
  const words = [];
  const pending = [];

  const flush = async () => {
    if (!chunkBytes) return;
    const pcm = Buffer.concat(chunk), at = chunkStart;
    chunk = []; chunkBytes = 0; chunkStart = samples / RATE;      // release it immediately
    if (!ASR_BASE) return;
    job.log.push(`transcribing ${hms(at)} → ${hms(samples / RATE)} (${(pcm.length / 1048576).toFixed(1)} MB held, then dropped)`);
    pending.push(transcribe(pcm, at, job).then(ws => { words.push(...ws); job.wordCount = words.length; }));
  };

  ff.stdout.on('data', async buf => {
    let b = tail.length ? Buffer.concat([tail, buf]) : buf;
    const usable = b.length - (b.length % (BUCKET * 2));
    tail = b.subarray(usable);
    for (let o = 0; o < usable; o += BUCKET * 2) {
      let sum = 0;
      for (let i = o; i < o + BUCKET * 2; i += 2) { const v = b.readInt16LE(i) / 32768; sum += v * v; }
      energy.push(+Math.min(1, Math.sqrt(sum / BUCKET) * 3.4).toFixed(3));
    }
    samples += usable / 2;
    chunk.push(b.subarray(0, usable)); chunkBytes += usable;
    job.seconds  = samples / RATE;
    job.streamed = Math.round(rate * job.seconds);
    job.progress = Math.min(96, Math.round(job.seconds / dur * 92));
    if (chunkBytes >= CHUNK_SEC * RATE * 2) { ff.stdout.pause(); await flush(); ff.stdout.resume(); }
  });

  await new Promise((res, rej) => {
    ff.on('error', rej);
    ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c + ': ' + ffErr.slice(-400))));
  });
  await flush();
  await Promise.all(pending);

  words.sort((a, b) => a.t - b.t);
  const spoken = words.filter(w => !w.lau);
  let mean = 0.5;
  if (spoken.length) {
    let s = 0; for (const w of spoken) s += energy[Math.floor(w.t * HZ)] || 0;
    mean = s / spoken.length;
  }
  if (spoken.length) {
    const lau = findLaughter(spoken, energy, mean);
    job.log.push(`laughter from the envelope: ${lau.length} (heuristic — loud, sustained, no words)`);
    words.push(...lau); words.sort((a, b) => a.t - b.t);
  } else {
    const runs = speechRuns(energy);
    job.log.push(`speech runs from the envelope: ${runs.length} (no words, so nothing is guessed)`);
    words.push(...runs);
  }
  job.log.push(`read ${fmtB(job.streamed)} of source through the decoder and discarded it as it went`);
  job.log.push(`index ready · ${words.length} words · ${energy.length} envelope samples · disk written: 0 bytes`);
  job.index = {
    source: { kind: 'drive', name, durationSec: dur, bytes, speakers: ['SPEAKER'] },
    words, energy, hz: HZ, noText: spoken.length === 0,
  };
  if (!spoken.length) job.log.push('no ASR configured — returning an energy-only index (set ASR_BASE and ASR_KEY for words)');
  job.progress = 100; job.state = 'done';
}
const hms = s => new Date(s * 1000).toISOString().substring(11, 19);
const fmtB = b => b < 1048576 ? (b / 1024).toFixed(0) + ' KB'
  : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB';

/* -------------------------------- server -------------------------------- */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', ...CORS }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/health') return send(res, 200, { ok: true, asr: !!ASR_BASE, auth: OAUTH ? 'oauth' : API_KEY ? 'api-key' : 'public-link' });

  if (req.method === 'POST' && url.pathname === '/index') {
    let body = ''; for await (const c of req) { body += c; if (body.length > 1e5) return send(res, 413, { error: 'too big' }); }
    let p = {}; try { p = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
    const id = p.driveId, direct = p.url;
    if (!id && !direct) return send(res, 400, { error: 'need driveId or url' });
    const job = { state: 'running', progress: 0, log: [], streamed: 0, seconds: 0, disk: 0, wordCount: 0 };
    const key = Math.random().toString(36).slice(2, 10);
    jobs.set(key, job);
    const src = direct ? { url: direct, headers: '' } : driveSource(id);
    job.log.push('source: ' + (direct ? direct.slice(0, 60) : 'drive/' + id) + (OAUTH ? ' (oauth)' : API_KEY ? ' (api key)' : ' (public link)'));
    run(job, src, direct ? direct.split('/').pop() : 'Drive ' + id)
      .catch(e => { job.state = 'error'; job.error = e.message; job.log.push('failed: ' + e.message); });
    return send(res, 200, { job: key });
  }

  const m = url.pathname.match(/^\/index\/([\w]+)$/);
  if (m) {
    const j = jobs.get(m[1]);
    if (!j) return send(res, 404, { error: 'no such job' });
    const { index, ...rest } = j;
    return send(res, 200, j.state === 'done' ? { ...rest, index } : rest);
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => {
  console.log(`sieve-engine on :${PORT}`);
  console.log(`  auth: ${OAUTH ? 'oauth token' : API_KEY ? 'api key' : 'public link only'}`);
  console.log(`  asr : ${ASR_BASE ? ASR_MODEL + ' @ ' + ASR_BASE : 'none — energy-only index'}`);
  console.log(`  open sieve.html?engine=http://localhost:${PORT}`);
});
