import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { bindings } from "../bindings.server";

// Darkroom server API. The "blind" rule is enforced HERE: photo bytes are only
// returned by getPhotos AFTER a roll has developed — the client never gets a
// frame early, even by calling the API directly. Anticipation is law, not UI.

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I/L
const MAX_PHOTO_B64 = 700_000; // ~500KB image ceiling, guards D1 row size
const CAPACITY = 4;
const EXPOSURES = 24;

export type RollMember = { name: string; seat: number; host: boolean };
export type RollFrameMeta = { idx: number; by: string };
export type RollStatePayload = {
  ok: true;
  id: string;
  name: string;
  capacity: number;
  exposures: number;
  status: "open" | "developed";
  members: RollMember[];
  seatsFilled: number;
  frameCount: number;
  frames: RollFrameMeta[]; // metadata only; bytes come from getPhotos after develop
};
export type ApiError = { ok: false; error: string };

type RollRow = {
  id: string;
  name: string;
  capacity: number;
  exposures: number;
  status: string;
  created_at: number;
  developed_at: number | null;
};

function db() {
  const { DB } = bindings();
  if (!DB) throw new Error("D1 binding missing — set \"db\": true in app.manifest.json");
  return DB;
}

function shortCode(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = "";
  for (let i = 0; i < n; i++) s += CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length];
  return s;
}

function isUnique(e: unknown): boolean {
  return /UNIQUE|constraint/i.test(String(e instanceof Error ? e.message : e));
}

async function rollRow(rollId: string): Promise<RollRow | null> {
  return await db()
    .prepare(
      "SELECT id, name, capacity, exposures, status, created_at, developed_at FROM rolls WHERE id=?",
    )
    .bind(rollId)
    .first<RollRow>();
}

async function frameCount(rollId: string): Promise<number> {
  const r = await db()
    .prepare("SELECT COUNT(*) AS c FROM frames WHERE roll_id=?")
    .bind(rollId)
    .first<{ c: number }>();
  return r?.c ?? 0;
}

async function maybeDevelop(rollId: string): Promise<void> {
  const roll = await rollRow(rollId);
  if (!roll || roll.status === "developed") return;
  const m = await db()
    .prepare("SELECT COUNT(*) AS c FROM members WHERE roll_id=?")
    .bind(rollId)
    .first<{ c: number }>();
  const f = await frameCount(rollId);
  if ((m?.c ?? 0) >= roll.capacity && f >= roll.exposures) {
    await db()
      .prepare("UPDATE rolls SET status='developed', developed_at=? WHERE id=? AND status!='developed'")
      .bind(Date.now(), rollId)
      .run();
  }
}

/* ------------------------------- create roll ------------------------------- */

export const createRoll = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().trim().min(1).max(40),
      hostName: z.string().trim().min(1).max(24),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true; rollId: string; memberId: string; seat: number } | ApiError> => {
    const now = Date.now();
    let rollId: string | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = shortCode(6);
      try {
        await db()
          .prepare(
            "INSERT INTO rolls (id, name, capacity, exposures, status, created_at) VALUES (?,?,?,?,?,?)",
          )
          .bind(candidate, data.name, CAPACITY, EXPOSURES, "open", now)
          .run();
        rollId = candidate;
        break;
      } catch (e) {
        if (isUnique(e)) continue; // code collision — try another
        throw e;
      }
    }
    if (!rollId) return { ok: false, error: "could_not_allocate_roll" };

    const memberId = crypto.randomUUID();
    await db()
      .prepare("INSERT INTO members (id, roll_id, name, seat, is_host, joined_at) VALUES (?,?,?,?,?,?)")
      .bind(memberId, rollId, data.hostName, 0, 1, now)
      .run();

    return { ok: true, rollId, memberId, seat: 0 };
  });

/* -------------------------------- join roll -------------------------------- */

export const joinRoll = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      rollId: z.string().trim().min(1).max(12),
      name: z.string().trim().min(1).max(24),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true; rollId: string; memberId: string; seat: number } | ApiError> => {
    const rollId = data.rollId.toUpperCase();
    const roll = await rollRow(rollId);
    if (!roll) return { ok: false, error: "no_such_roll" };
    if (roll.status === "developed") return { ok: false, error: "already_developed" };

    const now = Date.now();
    for (let attempt = 0; attempt < 8; attempt++) {
      const seatRow = await db()
        .prepare("SELECT COALESCE(MAX(seat)+1, 0) AS nextSeat FROM members WHERE roll_id=?")
        .bind(rollId)
        .first<{ nextSeat: number }>();
      const seat = seatRow?.nextSeat ?? 0;
      if (seat >= roll.capacity) return { ok: false, error: "roll_full" };

      const memberId = crypto.randomUUID();
      try {
        await db()
          .prepare(
            "INSERT INTO members (id, roll_id, name, seat, is_host, joined_at) VALUES (?,?,?,?,?,?)",
          )
          .bind(memberId, rollId, data.name, seat, 0, now)
          .run();
        await maybeDevelop(rollId); // seats filling can complete a fully-shot roll
        return { ok: true, rollId, memberId, seat };
      } catch (e) {
        if (isUnique(e)) continue; // two people took the same seat at once — retry
        throw e;
      }
    }
    return { ok: false, error: "seat_contention" };
  });

/* ------------------------------- shoot frame ------------------------------- */

export const shootFrame = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      rollId: z.string().trim().min(1).max(12),
      memberId: z.string().trim().min(1).max(64),
      photo: z.string().min(1), // base64 JPEG, bare or data URL
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true; idx: number; count: number } | ApiError> => {
    const rollId = data.rollId.toUpperCase();
    const member = await db()
      .prepare("SELECT id, name FROM members WHERE id=? AND roll_id=?")
      .bind(data.memberId, rollId)
      .first<{ id: string; name: string }>();
    if (!member) return { ok: false, error: "not_a_member" };

    const roll = await rollRow(rollId);
    if (!roll) return { ok: false, error: "no_such_roll" };
    if (roll.status === "developed") return { ok: false, error: "already_developed" };

    let photo = data.photo;
    const comma = photo.indexOf(",");
    if (photo.startsWith("data:") && comma !== -1) photo = photo.slice(comma + 1);
    if (!photo) return { ok: false, error: "photo_required" };
    if (photo.length > MAX_PHOTO_B64) return { ok: false, error: "photo_too_large" };

    const now = Date.now();
    for (let attempt = 0; attempt < 8; attempt++) {
      const idxRow = await db()
        .prepare("SELECT COALESCE(MAX(idx)+1, 0) AS nextIdx FROM frames WHERE roll_id=?")
        .bind(rollId)
        .first<{ nextIdx: number }>();
      const idx = idxRow?.nextIdx ?? 0;
      if (idx >= roll.exposures) return { ok: false, error: "roll_full" };

      try {
        await db()
          .prepare(
            "INSERT INTO frames (id, roll_id, member_id, idx, by_name, photo, created_at) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(crypto.randomUUID(), rollId, member.id, idx, member.name, photo, now)
          .run();
        await maybeDevelop(rollId);
        const count = await frameCount(rollId);
        return { ok: true, idx, count };
      } catch (e) {
        if (isUnique(e)) continue; // someone grabbed this exposure first — retry next
        throw e;
      }
    }
    return { ok: false, error: "frame_contention" };
  });

/* -------------------------------- roll state ------------------------------- */

export const getRollState = createServerFn({ method: "POST" })
  .inputValidator(z.object({ rollId: z.string().trim().min(1).max(12) }))
  .handler(async ({ data }): Promise<RollStatePayload | ApiError> => {
    const rollId = data.rollId.toUpperCase();
    const roll = await rollRow(rollId);
    if (!roll) return { ok: false, error: "no_such_roll" };
    await maybeDevelop(rollId); // self-healing: polling flips the roll when conditions are met
    const fresh = (await rollRow(rollId)) ?? roll;

    const members = await db()
      .prepare("SELECT name, seat, is_host FROM members WHERE roll_id=? ORDER BY seat")
      .bind(rollId)
      .all<{ name: string; seat: number; is_host: number }>();
    const count = await frameCount(rollId);

    const developed = fresh.status === "developed";
    let frames: RollFrameMeta[] = [];
    if (developed) {
      const rows = await db()
        .prepare("SELECT idx, by_name FROM frames WHERE roll_id=? ORDER BY idx")
        .bind(rollId)
        .all<{ idx: number; by_name: string }>();
      frames = rows.results.map((r) => ({ idx: r.idx, by: r.by_name }));
    }

    return {
      ok: true,
      id: fresh.id,
      name: fresh.name,
      capacity: fresh.capacity,
      exposures: fresh.exposures,
      status: developed ? "developed" : "open",
      members: members.results.map((m) => ({ name: m.name, seat: m.seat, host: !!m.is_host })),
      seatsFilled: members.results.length,
      frameCount: count,
      frames,
    };
  });

/* ------------------------------ photos (gated) ----------------------------- */

export const getPhotos = createServerFn({ method: "POST" })
  .inputValidator(z.object({ rollId: z.string().trim().min(1).max(12) }))
  .handler(
    async ({ data }): Promise<{ ok: true; photos: { idx: number; by: string; dataUrl: string }[] } | ApiError> => {
      const rollId = data.rollId.toUpperCase();
      const roll = await rollRow(rollId);
      if (!roll) return { ok: false, error: "no_such_roll" };
      // THE BLIND RULE. No bytes leave the darkroom until it has developed.
      if (roll.status !== "developed") return { ok: false, error: "not_developed_yet" };

      const rows = await db()
        .prepare("SELECT idx, by_name, photo FROM frames WHERE roll_id=? ORDER BY idx")
        .bind(rollId)
        .all<{ idx: number; by_name: string; photo: string }>();
      return {
        ok: true,
        photos: rows.results.map((r) => ({
          idx: r.idx,
          by: r.by_name,
          dataUrl: "data:image/jpeg;base64," + r.photo,
        })),
      };
    },
  );
