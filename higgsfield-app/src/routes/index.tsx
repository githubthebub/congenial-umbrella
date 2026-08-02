import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";

import {
  createRoll,
  getPhotos,
  getRollState,
  joinRoll,
  shootFrame,
  type RollStatePayload,
} from "../lib/api/darkroom.functions";

// Darkroom — a roll of film shared by exactly four people. Everyone shoots
// blind; nothing develops until the roll is full, then it develops for all
// four at once. The blind rule is enforced server-side (see
// ../lib/api/darkroom.functions.ts) — this component just honors the ritual.

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { join?: string } => {
    const j = search["join"];
    return typeof j === "string" && j ? { join: j.toUpperCase() } : {};
  },
  component: DarkroomApp,
});

type View = "landing" | "new" | "join" | "roll" | "develop" | "gallery";
type Membership = { memberId: string; seat: number; me: string };
type Session = { active?: string; me?: string; rolls: Record<string, Membership> };
type Photo = { idx: number; by: string; dataUrl: string };

const CAP = 4;
const EXP = 24;
const LS = "darkroom.session.v2";
const SEAT_COLORS = ["#e8b04b", "#ff8a50", "#8fb96a", "#7fa8c9"];
const POLL_MS = 2500;
const DEV_STEPS = [
  "THE ROLL IS FULL · AGITATING THE TANK…",
  "STOP BATH…",
  "FIXER…",
  "RINSING…",
  "HANGING TO DRY…",
];

/* --------------------------- localStorage session --------------------------- */

function loadSession(): Session {
  if (typeof window === "undefined") return { rolls: {} };
  try {
    const raw = window.localStorage.getItem(LS);
    if (!raw) return { rolls: {} };
    const parsed = JSON.parse(raw) as Session;
    return { rolls: {}, ...parsed };
  } catch {
    return { rolls: {} };
  }
}

function saveSession(s: Session) {
  try {
    window.localStorage.setItem(LS, JSON.stringify(s));
  } catch {
    /* private mode etc. — the app still works for this tab */
  }
}

/* ------------------------------- demo assets ------------------------------- */

const DEMO_NAMES = ["you", "ines", "teo", "priya"];
const DEMO_SCENES: [string, string][] = [
  ["#2b3a4a", "#c9a86b"], ["#3d2b1f", "#e8b04b"], ["#1f3326", "#8fb96a"],
  ["#402430", "#ff8a50"], ["#2e2e38", "#dcd7c9"], ["#33291c", "#c96f4a"],
  ["#24303a", "#9fc4d8"], ["#3a3222", "#e0c37a"], ["#20262b", "#b8c4cc"],
];

function fakePhoto(seed: number): string {
  const c = document.createElement("canvas");
  c.width = c.height = 640;
  const g = c.getContext("2d");
  if (!g) return "";
  const scene = DEMO_SCENES[seed % DEMO_SCENES.length] ?? ["#2b3a4a", "#c9a86b"];
  const [bg, fg] = scene;
  const grad = g.createLinearGradient(0, 0, 640, 640);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, "#0d0b09");
  g.fillStyle = grad;
  g.fillRect(0, 0, 640, 640);
  g.globalAlpha = 0.85;
  g.fillStyle = fg;
  g.beginPath();
  g.arc(((seed * 131) % 520) + 60, ((seed * 71) % 420) + 80, (seed % 5) * 14 + 26, 0, 7);
  g.fill();
  g.globalAlpha = 0.25;
  g.fillRect(0, ((seed * 37) % 500) + 80, 640, (seed % 4) * 20 + 30);
  g.globalAlpha = 0.5;
  g.strokeStyle = fg;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(((seed * 97) % 400) + 60, 640);
  g.lineTo(((seed * 53) % 300) + 80, ((seed * 29) % 300) + 120);
  g.stroke();
  g.globalAlpha = 0.08;
  for (let i = 0; i < 700; i++) {
    g.fillStyle = Math.random() > 0.5 ? "#fff" : "#000";
    g.fillRect(Math.random() * 640, Math.random() * 640, 1.4, 1.4);
  }
  g.globalAlpha = 1;
  const v = g.createRadialGradient(320, 320, 220, 320, 320, 460);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,.55)");
  g.fillStyle = v;
  g.fillRect(0, 0, 640, 640);
  return c.toDataURL("image/jpeg", 0.7);
}

function initials(n: string): string {
  return (n || "?").slice(0, 2).toUpperCase();
}

/* --------------------------------- the app --------------------------------- */

function DarkroomApp() {
  const { join } = Route.useSearch();

  const [view, setView] = useState<View>("landing");
  const [rollId, setRollId] = useState<string | null>(null);
  const [roll, setRoll] = useState<RollStatePayload | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [joinInfo, setJoinInfo] = useState<RollStatePayload | null>(null);
  const [devMsg, setDevMsg] = useState(DEV_STEPS[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const [toast, setToastState] = useState<{ msg: string; key: number } | null>(null);

  const sessionRef = useRef<Session>({ rolls: {} });
  const developRunning = useRef(false);
  const demoTimers = useRef<number[]>([]);

  const showToast = useCallback((msg: string) => {
    setToastState({ msg, key: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToastState(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  /* ------------------------------ develop ritual ----------------------------- */

  const runDevelop = useCallback(
    (id: string, finalPhotos?: Photo[]) => {
      if (developRunning.current) return;
      developRunning.current = true;
      setView("develop");
      let i = 0;
      const tick = window.setInterval(() => {
        i++;
        if (i >= DEV_STEPS.length) {
          window.clearInterval(tick);
          if (finalPhotos) {
            setPhotos(finalPhotos);
            setView("gallery");
          } else {
            void getPhotos({ data: { rollId: id } }).then((res) => {
              if (res.ok) setPhotos(res.photos);
              setView("gallery");
            });
          }
          return;
        }
        setDevMsg(DEV_STEPS[i] ?? "");
      }, 900);
    },
    [],
  );

  /* -------------------------------- polling --------------------------------- */

  const poll = useCallback(
    async (id: string) => {
      let st;
      try {
        st = await getRollState({ data: { rollId: id } });
      } catch {
        return; // transient network failure — next tick retries
      }
      if (!st.ok) return;
      setRoll(st);
      if (st.status === "developed") runDevelop(id);
    },
    [runDevelop],
  );

  useEffect(() => {
    if (view !== "roll" || !rollId || demo) return;
    void poll(rollId);
    const t = window.setInterval(() => void poll(rollId), POLL_MS);
    return () => window.clearInterval(t);
  }, [view, rollId, demo, poll]);

  /* ---------------------------------- boot ----------------------------------- */

  useEffect(() => {
    sessionRef.current = loadSession();
    const s = sessionRef.current;
    if (join) {
      if (s.rolls[join]) {
        setRollId(join);
        setView("roll");
      } else {
        void getRollState({ data: { rollId: join } }).then((st) => {
          if (st.ok) {
            setJoinInfo(st);
            setView("join");
          } else {
            showToast("that roll link isn’t valid");
          }
        });
      }
      return;
    }
    if (s.active && s.rolls[s.active]) {
      setRollId(s.active);
      setView("roll");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot runs once
  }, []);

  /* -------------------------------- handlers --------------------------------- */

  const membership: Membership | null = rollId ? (sessionRef.current.rolls[rollId] ?? null) : null;

  const goHome = useCallback(() => {
    demoTimers.current.forEach((t) => window.clearInterval(t));
    demoTimers.current = [];
    developRunning.current = false;
    setDemo(false);
    setRoll(null);
    setRollId(null);
    setView("landing");
    if (typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const handleCreate = useCallback(async () => {
    const me = (document.getElementById("dkr-in-name") as HTMLInputElement | null)?.value.trim() ?? "";
    const nm = (document.getElementById("dkr-in-roll") as HTMLInputElement | null)?.value.trim() ?? "";
    if (!me) return showToast("your name first");
    if (!nm) return showToast("name the roll — inside jokes welcome");
    setBusy(true);
    try {
      const r = await createRoll({ data: { name: nm, hostName: me } });
      if (!r.ok) return showToast("couldn’t load the roll — try again");
      const s = sessionRef.current;
      s.rolls[r.rollId] = { memberId: r.memberId, seat: r.seat, me };
      s.active = r.rollId;
      s.me = me;
      saveSession(s);
      developRunning.current = false;
      setRollId(r.rollId);
      setView("roll");
      showToast("roll loaded — now give away your 3 spots");
    } catch {
      showToast("couldn’t load the roll — try again");
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  const handleJoin = useCallback(async () => {
    const me = (document.getElementById("dkr-join-name") as HTMLInputElement | null)?.value.trim() ?? "";
    if (!me) return showToast("your name first");
    if (!joinInfo) return;
    setBusy(true);
    try {
      const r = await joinRoll({ data: { rollId: joinInfo.id, name: me } });
      if (!r.ok) {
        if (r.error === "roll_full" || r.error === "already_developed") {
          showToast("that roll just filled up");
          setView("new");
        } else {
          showToast("couldn’t take the spot — try again");
        }
        return;
      }
      const s = sessionRef.current;
      s.rolls[r.rollId] = { memberId: r.memberId, seat: r.seat, me };
      s.active = r.rollId;
      s.me = me;
      saveSession(s);
      window.history.replaceState(null, "", window.location.pathname);
      developRunning.current = false;
      setRollId(r.rollId);
      setView("roll");
      showToast("you’re in. their seat count just ticked up.");
    } catch {
      showToast("couldn’t take the spot — try again");
    } finally {
      setBusy(false);
    }
  }, [joinInfo, showToast]);

  const handleShare = useCallback(() => {
    if (!rollId || !roll) return;
    const url = window.location.origin + "/?join=" + rollId;
    const left = roll.capacity - roll.seatsFilled;
    const msg =
      `i saved you one of my 3 spots in a darkroom roll called “${roll.name}”. ` +
      `four people shoot one roll of film blind — nothing develops until it’s full, ` +
      `and it can’t develop without you. ${left <= 1 ? "last spot." : left + " spots left."}\n\n` + url;
    if (navigator.share) {
      navigator.share({ text: msg }).catch(() => undefined);
    } else if (navigator.clipboard) {
      navigator.clipboard
        .writeText(msg)
        .then(() => showToast("invite copied — paste it in the group chat"))
        .catch(() => window.prompt("copy your invite:", msg));
    } else {
      window.prompt("copy your invite:", msg);
    }
  }, [rollId, roll, showToast]);

  const handleShoot = useCallback(
    (ev: ChangeEvent<HTMLInputElement>) => {
      const file = ev.target.files?.[0];
      ev.target.value = "";
      if (!file || demo || !rollId || !membership) return;
      const img = new Image();
      img.onload = async () => {
        const c = document.createElement("canvas");
        const s = Math.min(img.width, img.height);
        const MAX = 640;
        c.width = c.height = Math.min(MAX, s);
        const g = c.getContext("2d");
        if (!g) return;
        g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, c.width, c.height);
        const dataUrl = c.toDataURL("image/jpeg", 0.72);
        try {
          const r = await shootFrame({ data: { rollId, memberId: membership.memberId, photo: dataUrl } });
          if (r.ok) showToast(`frame ${r.count} exposed. no takebacks.`);
          else if (r.error === "roll_full" || r.error === "already_developed")
            showToast("the roll just filled — that was the last frame");
          else if (r.error === "photo_too_large") showToast("that photo was too large");
          else showToast("couldn’t expose the frame — try again");
        } catch {
          showToast("couldn’t expose the frame — try again");
        }
        void poll(rollId);
      };
      img.onerror = () => showToast("couldn’t read that image");
      img.src = URL.createObjectURL(file);
    },
    [demo, rollId, membership, poll, showToast],
  );

  const startDemo = useCallback(() => {
    setDemo(true);
    developRunning.current = false;
    const demoState: RollStatePayload = {
      ok: true,
      id: "DEMO",
      name: "tuesday, allegedly",
      capacity: CAP,
      exposures: EXP,
      status: "open",
      members: DEMO_NAMES.map((n, i) => ({ name: n, seat: i, host: i === 0 })),
      seatsFilled: CAP,
      frameCount: 0,
      frames: [],
    };
    setRollId("DEMO");
    setRoll(demoState);
    setView("roll");
    let i = 0;
    const t = window.setInterval(() => {
      if (i >= EXP) {
        window.clearInterval(t);
        const demoPhotos: Photo[] = Array.from({ length: EXP }, (_, k) => ({
          idx: k,
          by: DEMO_NAMES[(k % 3) + 1] ?? "ines",
          dataUrl: fakePhoto(k * 7 + 3),
        }));
        setRoll({ ...demoState, status: "developed", frameCount: EXP });
        runDevelop("DEMO", demoPhotos);
        return;
      }
      i++;
      setRoll({ ...demoState, frameCount: i });
    }, 140);
    demoTimers.current.push(t);
  }, [runDevelop]);

  /* --------------------------------- render ---------------------------------- */

  const open = roll ? roll.capacity - roll.seatsFilled : 0;

  return (
    <div className="dkr">
      <div className="dkr-wrap">
        <header className="dkr-header">
          <button className="dkr-wordmark" onClick={goHome}>
            <span className="dkr-lamp" />
            DARKROOM
          </button>
          <span className="dkr-rollno">
            {view === "gallery" && rollId ? `ROLL Nº ${rollId} · DEVELOPED` : rollId ? (demo ? "DEMO ROLL" : `ROLL Nº ${rollId}`) : ""}
          </span>
        </header>

        {view === "landing" && (
          <section className="dkr-view">
            <div className="dkr-hero">
              <h1>
                Instagram shows you everyone.
                <br />
                This is for <em>your three.</em>
              </h1>
              <p className="dkr-sub">
                A roll of film shared by exactly four people. Everyone shoots blind. Nothing is
                visible until the roll is full — then it develops for all of you at once.
              </p>
            </div>
            <div className="dkr-bar">
              <button className="dkr-btn primary" onClick={() => setView("new")}>
                Start a roll — you get 3 spots
              </button>
              <button className="dkr-btn ghost" onClick={startDemo}>
                Watch one develop (30s demo)
              </button>
            </div>
            <hr className="dkr-rule" />
            <ul className="dkr-laws">
              <li>
                <span className="no">I.</span>
                <span>
                  <b>Four people. No more.</b> A roll can’t develop until all four seats are filled.
                  Your invite isn’t a growth hack — it’s a chemical requirement.
                </span>
              </li>
              <li>
                <span className="no">II.</span>
                <span>
                  <b>You shoot blind.</b> No preview, no retakes, no filters. 24 exposures between
                  four people. Every frame costs something, so every frame means something.
                </span>
              </li>
              <li>
                <span className="no">III.</span>
                <span>
                  <b>Nothing develops early.</b> The reveal happens once, together — the server
                  won’t even hand out a photo before then.
                </span>
              </li>
              <li>
                <span className="no">IV.</span>
                <span>
                  <b>No likes. No followers. No feed. No algorithm. Ever.</b> Nobody performs for an
                  audience of four they already love.
                </span>
              </li>
            </ul>
            <div className="dkr-how">
              <div className="step">
                <span className="n">01</span>
                <div>
                  <h3>Start a roll</h3>
                  <p>Name it. Weekend trips, a semester, a group chat that deserves better.</p>
                </div>
              </div>
              <div className="step">
                <span className="n">02</span>
                <div>
                  <h3>Give away your 3 spots</h3>
                  <p>Not “invites.” Spots. There are only three, and a roll is useless without them.</p>
                </div>
              </div>
              <div className="step">
                <span className="n">03</span>
                <div>
                  <h3>Shoot blind together</h3>
                  <p>
                    24 frames, first come first served, across everyone’s phones. You’ll see a
                    counter, never the photos.
                  </p>
                </div>
              </div>
              <div className="step">
                <span className="n">04</span>
                <div>
                  <h3>Development night</h3>
                  <p>Frame 24 hits and the roll develops for all four of you at the same moment.</p>
                </div>
              </div>
            </div>
            <p className="dkr-fineprint">
              A REAL ROLL SYNCS ACROSS EVERYONE’S PHONES. NO FEED. NO ALGORITHM. NO ADS. THE
              OPPOSITE OF A GOOD IDEA CAN ALSO BE A GOOD IDEA.
            </p>
          </section>
        )}

        {view === "new" && (
          <section className="dkr-view">
            <div className="dkr-hero tight">
              <h1>Load a fresh roll.</h1>
            </div>
            <div className="dkr-field">
              <label htmlFor="dkr-in-name">Your name</label>
              <input id="dkr-in-name" maxLength={18} placeholder="maya" autoComplete="off" />
            </div>
            <div className="dkr-field">
              <label htmlFor="dkr-in-roll">Name the roll</label>
              <input id="dkr-in-roll" maxLength={28} placeholder="summer, allegedly" autoComplete="off" />
              <p className="dkr-hint">Name it like an inside joke, because it’s about to become one.</p>
            </div>
            <div className="dkr-bar">
              <button className="dkr-btn primary block" disabled={busy} onClick={() => void handleCreate()}>
                {busy ? "Loading the film…" : "Load it — then give away your 3 spots"}
              </button>
            </div>
          </section>
        )}

        {view === "join" && joinInfo && (
          <section className="dkr-view">
            <div className="dkr-canister">
              <div className="dkr-kicker">You’ve been handed something</div>
              <h2>“{joinInfo.name}”</h2>
              <div className="meta">
                ROLL Nº {joinInfo.id} · HOSTED BY {(joinInfo.members.find((m) => m.host)?.name ?? "A FRIEND").toUpperCase()}
              </div>
              {joinInfo.status === "developed" || joinInfo.seatsFilled >= joinInfo.capacity ? (
                <>
                  <div className="dkr-notice">
                    Every seat in this roll is taken. <b>Start your own</b> instead — you’ll get 3
                    spots of your own to give away.
                  </div>
                  <div className="dkr-bar">
                    <button className="dkr-btn primary block" onClick={() => setView("new")}>
                      Start my own roll
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="dkr-notice">
                    <b>{joinInfo.members.find((m) => m.host)?.name ?? "A friend"}</b> gave you one of
                    their <b>3 spots</b>.{" "}
                    {joinInfo.capacity - joinInfo.seatsFilled <= 1 ? (
                      <>
                        It’s the <b>last one</b>.
                      </>
                    ) : (
                      <>
                        There are <b>{joinInfo.capacity - joinInfo.seatsFilled - 1} spots</b> left
                        after you.
                      </>
                    )}{" "}
                    The roll cannot develop until all four seats are filled — they need you,
                    specifically.
                  </div>
                  <div className="dkr-field">
                    <label htmlFor="dkr-join-name">
                      Your name (so they know their spot went to the right person)
                    </label>
                    <input id="dkr-join-name" maxLength={18} placeholder="your name" autoComplete="off" />
                  </div>
                  <div className="dkr-bar">
                    <button className="dkr-btn primary block" disabled={busy} onClick={() => void handleJoin()}>
                      {busy ? "Taking your spot…" : "Take the spot"}
                    </button>
                  </div>
                  <p className="dkr-hint dkr-center">A spot in a roll isn’t offered twice.</p>
                </>
              )}
            </div>
          </section>
        )}

        {view === "roll" && roll && (
          <section className="dkr-view">
            <div className="dkr-canister">
              <div className="dkr-kicker">
                {demo ? "Demo roll — watch how it feels" : open > 0 ? `Waiting on ${open} more` : "Shooting"}
              </div>
              <h2>“{roll.name}”</h2>
              <div className="meta">
                ROLL Nº {roll.id} · 4 SEATS · {roll.exposures} EXPOSURES · DEVELOPS ONCE
              </div>
              <div className="dkr-members">
                {Array.from({ length: roll.capacity }, (_, i) => {
                  const m = roll.members.find((x) => x.seat === i);
                  const isMe = !demo && m && membership ? m.seat === membership.seat : false;
                  return m ? (
                    <div key={i} className={"dkr-seat" + (isMe ? " me" : "")}>
                      <div className="avatar" style={{ background: SEAT_COLORS[i] ?? "#e8b04b" }}>
                        {initials(m.name)}
                      </div>
                      <div className="nm">
                        {m.name}
                        {isMe ? " (you)" : ""}
                      </div>
                      <div className="role">{m.host ? "host" : `seat ${i + 1}`}</div>
                    </div>
                  ) : (
                    <div key={i} className="dkr-seat empty">
                      <div className="avatar">?</div>
                      <div className="nm">empty</div>
                      <div className="role">
                        spot {i + 1} of {roll.capacity}
                      </div>
                    </div>
                  );
                })}
              </div>
              {open > 0 && !demo && (
                <div className="dkr-spots">
                  <div className="dkr-spot">
                    <div className="t">
                      {open} seat{open > 1 ? "s" : ""} still open
                      <small>a roll can’t develop with an empty seat</small>
                    </div>
                    <button className="dkr-btn small primary" onClick={handleShare}>
                      {open > 1 ? "Give a spot away" : "Give the last spot away"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="dkr-counter">
              <span className="big">{roll.frameCount}</span>
              <span className="of">/ {roll.exposures} exposures · you never see a frame until it develops</span>
            </div>
            <div className="dkr-strip">
              {Array.from({ length: roll.exposures }, (_, i) => (
                <div key={i} className={"dkr-frame" + (i < roll.frameCount ? " shot" : "")} />
              ))}
            </div>

            {!demo && roll.frameCount < roll.exposures && (
              <div className="dkr-bar">
                <label className="dkr-btn primary" htmlFor="dkr-file">
                  ＋ Shoot a frame
                </label>
                <input
                  id="dkr-file"
                  className="dkr-file"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleShoot}
                />
              </div>
            )}

            <div className="dkr-notice">
              {open > 0 && !demo ? (
                <>
                  <b>
                    {open} seat{open > 1 ? "s" : ""} empty.
                  </b>{" "}
                  You can shoot, but the roll will sit undeveloped in the canister until all four
                  seats fill. Chemistry needs four. This screen updates live as they join.
                </>
              ) : (
                <>
                  <b>{roll.exposures - roll.frameCount} exposures left.</b> First come, first served
                  across all four phones — when anyone shoots, everyone’s counter ticks. Nobody sees
                  anything yet.
                </>
              )}
            </div>
          </section>
        )}

        {view === "develop" && (
          <section className="dkr-view">
            <div className="dkr-developing">
              <div className="dkr-tray" />
              <p>{devMsg}</p>
            </div>
          </section>
        )}

        {view === "gallery" && roll && (
          <section className="dkr-view">
            <div className="dkr-hero tight">
              <h1>“{roll.name}” has developed.</h1>
              <p className="dkr-sub">
                {roll.exposures} frames, four people, zero previews. All of you are seeing this for
                the first time, right now.
              </p>
            </div>
            <div className="dkr-gallery">
              {photos.map((p, i) => (
                <div
                  key={p.idx}
                  className="dkr-photo"
                  style={{ "--tilt": `${((i * 137) % 5) - 2}deg`, "--d": `${i * 0.12}s` } as CSSProperties}
                >
                  <img src={p.dataUrl} loading="lazy" alt={`frame ${p.idx + 1} by ${p.by}`} />
                  <div className="cap">
                    Nº{String(p.idx + 1).padStart(2, "0")} · {p.by}
                  </div>
                </div>
              ))}
            </div>
            <div className="dkr-canister">
              <div className="dkr-kicker">The loop, closed</div>
              <h2 style={{ fontSize: 20 }}>Good rolls deserve sequels.</h2>
              <p style={{ color: "var(--dkr-ink-dim)", margin: "8px 0 14px", fontSize: 15 }}>
                Start the next one — you get 3 fresh spots. The other three just watched this
                develop; they’ll each want a roll of their own.
              </p>
              <div className="dkr-bar" style={{ margin: 0 }}>
                <button
                  className="dkr-btn primary"
                  onClick={() => {
                    developRunning.current = false;
                    setDemo(false);
                    setView("new");
                  }}
                >
                  Load the next roll
                </button>
                <button className="dkr-btn ghost" onClick={goHome}>
                  Back to the door
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      {toast && (
        <div key={toast.key} className="dkr-toast on">
          {toast.msg}
        </div>
      )}
    </div>
  );
}
