/**
 * Darkroom — Cloudflare Worker backend.
 *
 * A roll of film shared by exactly four people. Everyone shoots blind; nothing
 * is visible until the roll is full, then it develops for all four at once.
 *
 * The "blind" rule is enforced HERE, on the server: photo bytes cannot be
 * fetched until the roll has developed. It is not merely hidden in the UI.
 *
 * Storage: D1 (SQLite). Photos are downscaled client-side and stored as base64
 * JPEG directly in D1 — no R2/object storage to provision, so deploy is one
 * command. See README.md.
 */

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I/L
const MAX_PHOTO_B64 = 700_000; // ~500KB image ceiling, guards D1 row size
const MAX_NAME = 24;

let schemaReady = false;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) {
        await ensureSchema(env);
        return await handleApi(request, env, url);
      }
    } catch (err) {
      return json({ error: "server_error", detail: String(err && err.message || err) }, 500);
    }
    // Everything non-API is a static asset (the client app).
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};

/* ----------------------------- schema bootstrap ---------------------------- */

async function ensureSchema(env) {
  if (schemaReady) return;
  if (!env.DB) throw new Error("D1 binding 'DB' is missing — set up the database (see README).");
  const stmts = [
    `CREATE TABLE IF NOT EXISTS rolls (id TEXT PRIMARY KEY, name TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 4, exposures INTEGER NOT NULL DEFAULT 24, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, developed_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, roll_id TEXT NOT NULL, name TEXT NOT NULL, seat INTEGER NOT NULL, is_host INTEGER NOT NULL DEFAULT 0, joined_at INTEGER NOT NULL, UNIQUE(roll_id, seat))`,
    `CREATE INDEX IF NOT EXISTS idx_members_roll ON members(roll_id)`,
    `CREATE TABLE IF NOT EXISTS frames (id TEXT PRIMARY KEY, roll_id TEXT NOT NULL, member_id TEXT NOT NULL, idx INTEGER NOT NULL, by_name TEXT NOT NULL, photo TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(roll_id, idx))`,
    `CREATE INDEX IF NOT EXISTS idx_frames_roll ON frames(roll_id)`,
  ];
  await env.DB.batch(stmts.map((s) => env.DB.prepare(s)));
  schemaReady = true;
}

/* --------------------------------- router ---------------------------------- */

async function handleApi(request, env, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", "rolls", ":id", ...]
  const method = request.method;

  if (parts[1] === "health") return json({ ok: true });

  // POST /api/rolls  — create a roll
  if (parts[1] === "rolls" && parts.length === 2 && method === "POST") {
    return createRoll(request, env);
  }

  if (parts[1] === "rolls" && parts[2]) {
    const rollId = parts[2].toUpperCase();

    // GET /api/rolls/:id — poll roll state
    if (parts.length === 3 && method === "GET") {
      return getRollState(env, rollId);
    }
    // POST /api/rolls/:id/join — take a seat
    if (parts.length === 4 && parts[3] === "join" && method === "POST") {
      return joinRoll(request, env, rollId);
    }
    // POST /api/rolls/:id/frames — shoot a frame
    if (parts.length === 4 && parts[3] === "frames" && method === "POST") {
      return shootFrame(request, env, rollId);
    }
    // GET /api/rolls/:id/frames/:idx/photo — the blind gate lives here
    if (parts.length === 6 && parts[3] === "frames" && parts[5] === "photo" && method === "GET") {
      return servePhoto(env, rollId, parseInt(parts[4], 10));
    }
  }

  return json({ error: "not_found" }, 404);
}

/* --------------------------------- handlers -------------------------------- */

async function createRoll(request, env) {
  const body = await readJson(request);
  const name = cleanName(body.name, "untitled roll", 40);
  const hostName = cleanName(body.hostName, "", MAX_NAME);
  if (!hostName) return json({ error: "name_required" }, 400);

  const now = Date.now();
  let rollId = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = shortCode(6);
    try {
      await env.DB.prepare(
        "INSERT INTO rolls (id, name, capacity, exposures, status, created_at) VALUES (?,?,?,?,?,?)"
      ).bind(candidate, name, 4, 24, "open", now).run();
      rollId = candidate;
      break;
    } catch (e) {
      if (isUnique(e)) continue; // code collision, try another
      throw e;
    }
  }
  if (!rollId) return json({ error: "could_not_allocate_roll" }, 503);

  const memberId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO members (id, roll_id, name, seat, is_host, joined_at) VALUES (?,?,?,?,?,?)"
  ).bind(memberId, rollId, hostName, 0, 1, now).run();

  return json({ rollId, memberId, seat: 0, name, capacity: 4, exposures: 24 });
}

async function joinRoll(request, env, rollId) {
  const body = await readJson(request);
  const name = cleanName(body.name, "", MAX_NAME);
  if (!name) return json({ error: "name_required" }, 400);

  const roll = await rollRow(env, rollId);
  if (!roll) return json({ error: "no_such_roll" }, 404);
  if (roll.status === "developed") return json({ error: "already_developed" }, 409);

  const now = Date.now();
  for (let attempt = 0; attempt < 8; attempt++) {
    const seatRow = await env.DB.prepare(
      "SELECT COALESCE(MAX(seat)+1, 0) AS nextSeat FROM members WHERE roll_id=?"
    ).bind(rollId).first();
    const seat = seatRow.nextSeat;
    if (seat >= roll.capacity) return json({ error: "roll_full" }, 409);

    const memberId = crypto.randomUUID();
    try {
      await env.DB.prepare(
        "INSERT INTO members (id, roll_id, name, seat, is_host, joined_at) VALUES (?,?,?,?,?,?)"
      ).bind(memberId, rollId, name, seat, 0, now).run();
      await maybeDevelop(env, rollId); // seats filling can complete a fully-shot roll
      return json({ rollId, memberId, seat });
    } catch (e) {
      if (isUnique(e)) continue; // two people took the same seat; retry
      throw e;
    }
  }
  return json({ error: "seat_contention" }, 503);
}

async function shootFrame(request, env, rollId) {
  const memberId = memberToken(request);
  if (!memberId) return json({ error: "not_a_member" }, 401);

  const member = await env.DB.prepare(
    "SELECT id, name FROM members WHERE id=? AND roll_id=?"
  ).bind(memberId, rollId).first();
  if (!member) return json({ error: "not_a_member" }, 403);

  const roll = await rollRow(env, rollId);
  if (!roll) return json({ error: "no_such_roll" }, 404);
  if (roll.status === "developed") return json({ error: "already_developed" }, 409);

  const body = await readJson(request);
  let photo = typeof body.photo === "string" ? body.photo : "";
  // Accept either a bare base64 string or a full data URL; store bare base64.
  const comma = photo.indexOf(",");
  if (photo.startsWith("data:") && comma !== -1) photo = photo.slice(comma + 1);
  if (!photo) return json({ error: "photo_required" }, 400);
  if (photo.length > MAX_PHOTO_B64) return json({ error: "photo_too_large" }, 413);

  const now = Date.now();
  for (let attempt = 0; attempt < 8; attempt++) {
    const idxRow = await env.DB.prepare(
      "SELECT COALESCE(MAX(idx)+1, 0) AS nextIdx FROM frames WHERE roll_id=?"
    ).bind(rollId).first();
    const idx = idxRow.nextIdx;
    if (idx >= roll.exposures) return json({ error: "roll_full" }, 409);

    try {
      await env.DB.prepare(
        "INSERT INTO frames (id, roll_id, member_id, idx, by_name, photo, created_at) VALUES (?,?,?,?,?,?,?)"
      ).bind(crypto.randomUUID(), rollId, memberId, idx, member.name, photo, now).run();
      await maybeDevelop(env, rollId);
      const count = await frameCount(env, rollId);
      return json({ ok: true, idx, count, exposures: roll.exposures });
    } catch (e) {
      if (isUnique(e)) continue; // someone grabbed this exposure first; retry next
      throw e;
    }
  }
  return json({ error: "frame_contention" }, 503);
}

async function getRollState(env, rollId) {
  const roll = await rollRow(env, rollId);
  if (!roll) return json({ error: "no_such_roll" }, 404);
  await maybeDevelop(env, rollId); // self-healing: polling flips the roll when conditions are met
  const fresh = await rollRow(env, rollId);

  const members = await env.DB.prepare(
    "SELECT name, seat, is_host FROM members WHERE roll_id=? ORDER BY seat"
  ).bind(rollId).all();
  const count = await frameCount(env, rollId);

  const developed = fresh.status === "developed";
  let frames = [];
  if (developed) {
    const rows = await env.DB.prepare(
      "SELECT idx, by_name FROM frames WHERE roll_id=? ORDER BY idx"
    ).bind(rollId).all();
    frames = rows.results.map((r) => ({ idx: r.idx, by: r.by_name }));
  }

  return json({
    id: fresh.id,
    name: fresh.name,
    capacity: fresh.capacity,
    exposures: fresh.exposures,
    status: fresh.status,
    developedAt: fresh.developed_at,
    members: members.results.map((m) => ({ name: m.name, seat: m.seat, host: !!m.is_host })),
    seatsFilled: members.results.length,
    frameCount: count,
    frames, // metadata only; bytes come from the photo endpoint after develop
  });
}

async function servePhoto(env, rollId, idx) {
  if (!Number.isInteger(idx)) return json({ error: "bad_index" }, 400);
  const roll = await rollRow(env, rollId);
  if (!roll) return json({ error: "no_such_roll" }, 404);
  // THE BLIND RULE. No bytes leave the darkroom until it has developed.
  if (roll.status !== "developed") return json({ error: "not_developed_yet" }, 403);

  const row = await env.DB.prepare(
    "SELECT photo FROM frames WHERE roll_id=? AND idx=?"
  ).bind(rollId, idx).first();
  if (!row) return json({ error: "no_such_frame" }, 404);

  const bytes = base64ToBytes(row.photo);
  return new Response(bytes, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

/* --------------------------------- helpers --------------------------------- */

async function maybeDevelop(env, rollId) {
  const roll = await env.DB.prepare(
    "SELECT capacity, exposures, status FROM rolls WHERE id=?"
  ).bind(rollId).first();
  if (!roll || roll.status === "developed") return;
  const m = await env.DB.prepare("SELECT COUNT(*) AS c FROM members WHERE roll_id=?").bind(rollId).first();
  const f = await env.DB.prepare("SELECT COUNT(*) AS c FROM frames WHERE roll_id=?").bind(rollId).first();
  if (m.c >= roll.capacity && f.c >= roll.exposures) {
    await env.DB.prepare(
      "UPDATE rolls SET status='developed', developed_at=? WHERE id=? AND status!='developed'"
    ).bind(Date.now(), rollId).run();
  }
}

function rollRow(env, rollId) {
  return env.DB.prepare(
    "SELECT id, name, capacity, exposures, status, created_at, developed_at FROM rolls WHERE id=?"
  ).bind(rollId).first();
}

async function frameCount(env, rollId) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS c FROM frames WHERE roll_id=?").bind(rollId).first();
  return r.c;
}

function memberToken(request) {
  const h = request.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return request.headers.get("x-darkroom-member") || null;
}

async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    return {};
  }
}

function cleanName(v, fallback, max) {
  if (typeof v !== "string") return fallback;
  const t = v.trim().slice(0, max);
  return t || fallback;
}

function shortCode(n) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = "";
  for (let i = 0; i < n; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}

function isUnique(e) {
  return /UNIQUE|constraint/i.test(String(e && e.message || e));
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
