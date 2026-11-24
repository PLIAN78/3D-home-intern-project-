import { useEffect, useMemo, useRef, useState } from "react";
import { releaseAll } from "../core/input";
import { sfx } from "../core/sfx";
import { money } from "../story/economy";
import { useGame, type Job } from "../story/store";
import { CRANE_PAY, ELIAS_REWARD, FISH_PAY, INGREDIENTS, KITCHEN_NAMES, makeOrder, mathRound, PAY, RANKS, rng, SCHEDULE, schedulePay, triviaRound, type Kitchen, type Question } from "../story/work";
import { CheckIcon, CloseIcon } from "./icons";

/**
 * The jobs: estimating math and the trivia lunch-and-learn (one quiz engine),
 * the build-schedule puzzle, and restaurant shifts. Each ends with a summary
 * and a button to collect the pay.
 */
export function JobOverlay() {
  const job = useGame((s) => s.job);
  useEffect(() => {
    if (job) releaseAll();
  }, [job]);
  if (!job) return null;
  return (
    <div className="modal">
      <div className="card job">
        <JobBody job={job} />
      </div>
    </div>
  );
}

function JobBody({ job }: { job: Job }) {
  if (job.kind === "math" || job.kind === "trivia") return <Quiz job={job} />;
  if (job.kind === "schedule") return <Schedule job={job} />;
  if (job.kind === "fishing") return <Fishing job={job} />;
  if (job.kind === "crane") return <Crane job={job} />;
  return <Orders job={job} />;
}

function Quit({ label = "Leave" }: { label?: string }) {
  const finishJob = useGame((s) => s.finishJob);
  return (
    <button className="icon-btn corner" aria-label={label} onClick={() => finishJob(0, "", false)}>
      <CloseIcon />
    </button>
  );
}

function Summary({ title, lines, pay, why }: { title: string; lines: string[]; pay: number; why: string }) {
  const finishJob = useGame((s) => s.finishJob);
  useEffect(() => {
    sfx(pay > 0 ? "fanfare" : "bad");
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter" || e.code === "Space" || e.code === "KeyE") {
        e.preventDefault();
        finishJob(pay, why, pay > 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishJob, pay, why]);
  return (
    <div className="summary">
      <div className="eyebrow">Done</div>
      <h2>{title}</h2>
      {lines.map((l) => (
        <p key={l} className="muted">
          {l}
        </p>
      ))}
      <button className="play" onClick={() => finishJob(pay, why, pay > 0)}>
        {pay > 0 ? `Collect ${money(pay)}` : "Back"}
      </button>
    </div>
  );
}

/** Pay multiplier for office work at your current rank. */
function useRankPay() {
  const rank = useGame((s) => s.office.rank);
  return RANKS[rank].pay;
}

// ── Estimating and trivia ───────────────────────────────────────────────

function Quiz({ job }: { job: Job }) {
  const math = job.kind === "math";
  const questions = useMemo<Question[]>(() => (math ? mathRound(job.seed) : triviaRound(job.seed)), [math, job.seed]);
  const mult = useRankPay();
  const limit = math ? 20 : 25;
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState({ right: 0, fast: 0 });
  const [left, setLeft] = useState(limit);
  const started = useRef(0);
  const done = i >= questions.length;
  const q = questions[Math.min(i, questions.length - 1)];

  const advance = () => {
    setPicked(null);
    setLeft(limit);
    setI((x) => x + 1);
  };

  const choose = (k: number) => {
    if (picked !== null || done) return;
    setPicked(k);
    const right = k === q.answer;
    const quick = (performance.now() - started.current) / 1000 < limit / 2;
    sfx(right ? "good" : "bad");
    if (right) setScore((s) => ({ right: s.right + 1, fast: s.fast + (quick ? 1 : 0) }));
  };

  // Countdown per question; running out counts as wrong.
  useEffect(() => {
    if (done || picked !== null) return;
    started.current = performance.now();
    const id = setInterval(() => {
      const t = limit - (performance.now() - started.current) / 1000;
      setLeft(Math.max(0, t));
      if (t <= 0) {
        setPicked(-1);
        sfx("bad");
      }
    }, 200);
    return () => clearInterval(id);
  }, [i, done, picked, limit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (picked === null && n >= 1 && n <= 4) choose(n - 1);
      else if (picked !== null && (e.code === "Space" || e.code === "Enter")) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (done) {
    const base = math ? score.right * PAY.mathCorrect + score.fast * PAY.mathFast : score.right * PAY.triviaCorrect;
    const pay = Math.round(base * mult);
    return (
      <Summary
        title={math ? "Estimates sent" : "Lunch and learn"}
        lines={[`${score.right} of ${questions.length} correct${math && score.fast ? `, ${score.fast} quick` : ""}.`, mult > 1 ? `Your rank pays ×${mult}.` : ""].filter(Boolean)}
        pay={pay}
        why={math ? "Estimating" : "Lunch and learn"}
      />
    );
  }
  return (
    <>
      <Quit />
      <div className="job-head">
        <div className="eyebrow">
          {math ? "Estimating" : "Lunch and learn"} · {i + 1} of {questions.length}
        </div>
        <div className="timer-bar">
          <div style={{ width: `${(left / limit) * 100}%` }} />
        </div>
      </div>
      <h2 className="question">{q.prompt}</h2>
      <div className="answers">
        {q.choices.map((c, k) => (
          <button key={k} className={`answer ${picked !== null && k === q.answer ? "right" : ""} ${picked === k && k !== q.answer ? "wrong" : ""}`} disabled={picked !== null} onClick={() => choose(k)}>
            <kbd>{k + 1}</kbd> {c}
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className="explain">
          <span className={picked === q.answer ? "ok" : "no"}>{picked === q.answer ? "Correct." : picked === -1 ? "Out of time." : "Not quite."}</span> {q.explain}
          <button className="secondary" onClick={advance}>
            Next <kbd>Space</kbd>
          </button>
        </div>
      )}
    </>
  );
}

// ── Build schedule ──────────────────────────────────────────────────────

function Schedule({ job }: { job: Job }) {
  const mult = useRankPay();
  const cards = useMemo(() => {
    const r = rng(job.seed);
    const c = SCHEDULE.map((s, i) => ({ s, i }));
    for (let k = c.length - 1; k > 0; k--) {
      const j = Math.floor(r() * (k + 1));
      [c[k], c[j]] = [c[j], c[k]];
    }
    return c;
  }, [job.seed]);
  const [placed, setPlaced] = useState<number[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [shake, setShake] = useState<number | null>(null);
  if (placed.length === SCHEDULE.length) {
    const pay = schedulePay(mistakes, mult);
    return <Summary title="Schedule approved" lines={[mistakes === 0 ? "Perfect order. The site crews will love you." : `${mistakes} mistake${mistakes > 1 ? "s" : ""} along the way.`]} pay={pay} why="Build schedule" />;
  }
  const pick = (i: number) => {
    if (i === placed.length) {
      sfx("good");
      setPlaced((p) => [...p, i]);
    } else {
      sfx("bad");
      setMistakes((m) => m + 1);
      setShake(i);
      setTimeout(() => setShake(null), 350);
    }
  };
  return (
    <>
      <Quit />
      <div className="eyebrow">Build schedule · Click the stages in order, first to last</div>
      <ol className="schedule-done">
        {placed.map((i) => (
          <li key={i}>
            <CheckIcon size={13} /> {SCHEDULE[i]}
          </li>
        ))}
        {placed.length < SCHEDULE.length && <li className="next">Next: stage {placed.length + 1}</li>}
      </ol>
      <div className="cards">
        {cards
          .filter((c) => !placed.includes(c.i))
          .map((c) => (
            <button key={c.i} className={`stage-card ${shake === c.i ? "shake" : ""}`} onClick={() => pick(c.i)}>
              {c.s}
            </button>
          ))}
      </div>
      <div className="muted small">Mistakes: {mistakes}</div>
    </>
  );
}

// ── Restaurant shift ────────────────────────────────────────────────────

const ORDERS = 5;
const TICKET = 25;

function Orders({ job }: { job: Job }) {
  const kitchen = job.kitchen as Kitchen;
  const ingredients = INGREDIENTS[kitchen];
  const orders = useMemo(() => {
    const r = rng(job.seed);
    return Array.from({ length: ORDERS }, () => makeOrder(kitchen, r));
  }, [job.seed, kitchen]);
  const [n, setN] = useState(0);
  const [stack, setStack] = useState<string[]>([]);
  const [result, setResult] = useState({ served: 0, tips: 0, missed: 0 });
  const [left, setLeft] = useState(TICKET);
  const [flash, setFlash] = useState<string | null>(null);
  const t0 = useRef(0);
  const done = n >= ORDERS;
  const order = orders[Math.min(n, ORDERS - 1)];

  const nextCustomer = () => {
    setStack([]);
    setLeft(TICKET);
    setN((x) => x + 1);
  };

  useEffect(() => {
    if (done) return;
    t0.current = performance.now();
    const id = setInterval(() => {
      const t = TICKET - (performance.now() - t0.current) / 1000;
      setLeft(Math.max(0, t));
      if (t <= 0) {
        sfx("bad");
        setResult((r) => ({ ...r, missed: r.missed + 1 }));
        nextCustomer();
      }
    }, 200);
    return () => clearInterval(id);
  }, [n, done]);

  const add = (id: string) => {
    if (done) return;
    const want = order.items[stack.length];
    if (id !== want) {
      sfx("bad");
      setFlash(id);
      setTimeout(() => setFlash(null), 300);
      return;
    }
    sfx("blip");
    const next = [...stack, id];
    setStack(next);
    if (next.length === order.items.length) {
      const secs = (performance.now() - t0.current) / 1000;
      sfx("good");
      setResult((r) => ({ ...r, served: r.served + 1, tips: r.tips + (secs < 12 ? 1 : 0) }));
      setTimeout(nextCustomer, 450);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.code.startsWith("Digit") ? Number(e.code.slice(5)) : NaN;
      const idx = k === 0 ? 9 : k - 1;
      if (idx >= 0 && idx < ingredients.length) add(ingredients[idx].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (done) {
    const pay = result.served * PAY.orderCorrect + result.tips * PAY.orderTip;
    return <Summary title="Shift over" lines={[`${result.served} of ${ORDERS} orders served, ${result.tips} with a tip.`, result.missed ? `${result.missed} customer${result.missed > 1 ? "s" : ""} gave up waiting.` : "Nobody left hungry."]} pay={pay} why={`Shift at ${KITCHEN_NAMES[kitchen]}`} />;
  }
  const label = (id: string) => ingredients.find((x) => x.id === id)!;
  return (
    <>
      <Quit />
      <div className="job-head">
        <div className="eyebrow">
          {KITCHEN_NAMES[kitchen]} · Customer {n + 1} of {ORDERS}
        </div>
        <div className="timer-bar">
          <div style={{ width: `${(left / TICKET) * 100}%` }} />
        </div>
      </div>
      <div className="order">
        <div className="ticket">
          <div className="eyebrow">Order for {order.customer}</div>
          <ol>
            {order.items.map((id, k) => (
              <li key={k} className={k < stack.length ? "done" : k === stack.length ? "now" : ""}>
                {label(id).label}
              </li>
            ))}
          </ol>
        </div>
        <div className="stack">
          {stack.map((id, k) => (
            <div key={k} className="layer" style={{ background: label(id).color }} />
          ))}
          <div className="plate" />
        </div>
      </div>
      <div className="ingredients">
        {ingredients.map((ing, k) => (
          <button key={ing.id} className={`ingredient ${flash === ing.id ? "shake" : ""}`} onClick={() => add(ing.id)}>
            <span className="dot" style={{ background: ing.color }} />
            {k < 10 && <kbd>{(k + 1) % 10}</kbd>} {ing.label}
          </button>
        ))}
      </div>
    </>
  );
}

// ── Fishing with Elias ──────────────────────────────────────────────────

const FISH = [
  { name: "Smallmouth bass", kg: [0.6, 1.8] },
  { name: "Yellow perch", kg: [0.2, 0.6] },
  { name: "Walleye", kg: [0.8, 2.6] },
  { name: "Rainbow trout", kg: [0.5, 2.0] },
  { name: "Northern pike", kg: [1.5, 4.5] },
];
const CASTS = 3;

type FishPhase = "wait" | "bite" | "reel" | "caught" | "lost" | "spooked";

/**
 * Three casts. Watch the float; when it dips, strike (Space) quickly. Then
 * reel: hold Space to pull, let go to ease off. Keep the line's tension in
 * the green band until the fish is in. Too tight and the line snaps.
 */
function Fishing({ job }: { job: Job }) {
  const elias = useGame((s) => s.elias);
  const finishFishing = useGame((s) => s.finishFishing);
  const fish = useMemo(() => {
    const r = rng(job.seed);
    return Array.from({ length: CASTS }, () => {
      const f = FISH[Math.floor(r() * FISH.length)];
      return { name: f.name, kg: Math.round((f.kg[0] + r() * (f.kg[1] - f.kg[0])) * 10) / 10, pull: 0.6 + r() * 0.8, wait: 1.5 + r() * 2.5 };
    });
  }, [job.seed]);
  const [cast, setCast] = useState(0);
  const [phase, setPhase] = useState<FishPhase>("wait");
  const [caught, setCaught] = useState<string[]>([]);
  const sim = useRef({ t: 0, tension: 0.3, progress: 0, hold: false, dip: 0 });
  const [view, setView] = useState({ t: 0, tension: 0.3, progress: 0, dip: 0 });
  const phaseRef = useRef<FishPhase>("wait");
  const done = cast >= CASTS;

  const go = (p: FishPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    if (done) return;
    const s = sim.current;
    s.t = 0;
    s.tension = 0.3;
    s.progress = 0;
    phaseRef.current = "wait";
    const f = fish[cast];
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      s.t += dt;
      const p = phaseRef.current;
      if (p === "wait") {
        s.dip = Math.sin(s.t * 3) * 0.04;
        if (s.t > f.wait) {
          s.t = 0;
          sfx("blip");
          go("bite");
        }
      } else if (p === "bite") {
        s.dip = 0.35 + Math.sin(s.t * 30) * 0.08;
        if (s.t > 1.1) {
          s.t = 0;
          go("lost");
        }
      } else if (p === "reel") {
        // The fish tugs in bursts; holding reels in and raises tension, easing off lets it run.
        const tug = (Math.sin(s.t * 2.3 * f.pull) > 0.55 ? 0.55 : 0.08) * f.pull;
        s.tension += ((s.hold ? 0.5 : -0.55) + tug) * dt;
        s.tension = Math.max(0, s.tension);
        const inBand = s.tension > 0.25 && s.tension < 0.8;
        s.progress = Math.max(0, s.progress + (s.hold && inBand ? 0.26 : s.hold ? 0.08 : -0.05) * dt);
        if (s.tension >= 1) {
          sfx("bad");
          go("lost");
        } else if (s.progress >= 1) {
          sfx("good");
          setCaught((c) => [...c, `${f.name}, ${f.kg} kg`]);
          go("caught");
        }
        s.dip = 0.2;
      }
      setView({ t: s.t, tension: s.tension, progress: s.progress, dip: s.dip });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cast, done, fish]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      const p = phaseRef.current;
      if (p === "wait") {
        sfx("bad");
        go("spooked");
      } else if (p === "bite") {
        sfx("good");
        sim.current.t = 0;
        go("reel");
      } else if (p === "reel") sim.current.hold = true;
      else if (p === "caught" || p === "lost" || p === "spooked") {
        setCast((c) => c + 1);
        go("wait");
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") sim.current.hold = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  if (done) {
    const first = elias === "found";
    return (
      <div className="summary">
        <div className="eyebrow">Heron Lake</div>
        <h2>{caught.length ? `${caught.length} fish caught` : "Nothing biting today"}</h2>
        {caught.map((c) => (
          <p key={c} className="muted">
            {c}
          </p>
        ))}
        {first && <p className="muted">Elias: “You’ve got the touch. Here, for finding my box. Come fish any time.” (+{money(ELIAS_REWARD)})</p>}
        <button className="play" onClick={() => finishFishing(caught.length)}>
          {caught.length || first ? `Collect ${money(caught.length * FISH_PAY + (first ? ELIAS_REWARD : 0))}` : "Back"}
        </button>
      </div>
    );
  }
  const s = view;
  const msg: Record<FishPhase, string> = {
    wait: "Watch the float… wait for it to dip.",
    bite: "Bite! Press Space to strike!",
    reel: "Hold Space to reel in. Keep the tension in the green.",
    caught: `Got it: ${caught[caught.length - 1] ?? ""}! Press Space for the next cast.`,
    lost: "It got away. Press Space to cast again.",
    spooked: "Too early, you spooked it. Press Space to cast again.",
  };
  return (
    <>
      <button className="icon-btn corner" aria-label="Stop fishing" onClick={() => finishFishing(caught.length)}>
        <CloseIcon />
      </button>
      <div className="eyebrow">
        Fishing with Elias · Cast {cast + 1} of {CASTS} · {money(FISH_PAY)} a fish
      </div>
      <svg className="fishing" viewBox="0 0 400 180" role="img" aria-label="The float on the water">
        <rect x="0" y="0" width="400" height="70" fill="#cfe3ee" />
        <path d="M0 58 Q60 40 120 52 T240 46 T400 54 L400 70 L0 70 Z" fill="#6f8f5a" />
        <rect x="0" y="70" width="400" height="110" fill="#2b5a66" />
        <path d={`M0 70 Q100 ${66 + Math.sin(s.t) * 3} 200 70 T400 70`} fill="none" stroke="#9cc3cc" strokeWidth="2" />
        <line x1="40" y1="0" x2="200" y2={62 + s.dip * 40} stroke="#e8e8e8" strokeWidth="1" />
        <circle cx="200" cy={66 + s.dip * 40} r="7" fill="#e5482f" />
        <rect x="196" y={58 + s.dip * 40} width="8" height="5" fill="#f4f1e6" />
        {phase === "bite" && <circle cx="200" cy="72" r={14 + (s.t * 30) % 10} fill="none" stroke="#ffffff" strokeOpacity="0.6" />}
      </svg>
      {phase === "reel" && (
        <div className="reel">
          <div className="eyebrow">Line tension</div>
          <div className="tension">
            <div className="band" style={{ left: "25%", width: "55%" }} />
            <div className="needle" style={{ left: `${Math.min(100, s.tension * 100)}%` }} />
          </div>
          <div className="eyebrow">Reeled in</div>
          <div className="timer-bar">
            <div style={{ width: `${Math.min(100, s.progress * 100)}%` }} />
          </div>
        </div>
      )}
      <p className={`fish-msg ${phase}`}>{msg[phase]}</p>
    </>
  );
}

// ── The tower crane ─────────────────────────────────────────────────────

const LIFTS = 3;
const JIB = 30;
const G = 9.8;

/**
 * Land three loads on the marks. ←/→ (or A/D) run the trolley along the jib;
 * the load swings on its cable when you speed up or stop. Space lowers it;
 * it lands where it is, so wait for the swing to settle over the mark.
 */
function Crane({ job }: { job: Job }) {
  const targets = useMemo(() => {
    const r = rng(job.seed);
    return Array.from({ length: LIFTS }, () => 8 + r() * (JIB - 12));
  }, [job.seed]);
  const [lift, setLift] = useState(0);
  const [results, setResults] = useState<{ ok: boolean; miss: number }[]>([]);
  const st = useRef({ x: 3, v: 0, theta: 0, omega: 0, cable: 10, lowering: false, keys: { l: false, r: false }, landed: false });
  const [view, setView] = useState({ x: 3, theta: 0, cable: 10 });
  const done = lift >= LIFTS;

  useEffect(() => {
    if (done) return;
    const s = st.current;
    Object.assign(s, { x: 3, v: 0, theta: 0, omega: 0, cable: 10, lowering: false, landed: false });
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!s.landed) {
        const want = (s.keys.r ? 1 : 0) - (s.keys.l ? 1 : 0);
        const before = s.v;
        s.v += (want * 3.2 - s.v) * Math.min(1, dt * 1.8);
        s.x = Math.max(1, Math.min(JIB, s.x + s.v * dt));
        if (s.x === 1 || s.x === JIB) s.v = 0;
        const a = (s.v - before) / Math.max(dt, 1e-3);
        // A pendulum on a moving pivot, with a little damping.
        const alpha = -(G / s.cable) * Math.sin(s.theta) - (a / s.cable) * Math.cos(s.theta) - 0.12 * s.omega;
        s.omega += alpha * dt;
        s.theta += s.omega * dt;
        if (s.lowering) {
          s.cable += 4 * dt;
          if (s.cable >= 18) {
            s.landed = true;
            const at = s.x + s.cable * Math.sin(s.theta);
            const miss = Math.abs(at - targets[lift]);
            const ok = miss < 1.0 && Math.abs(s.omega) < 0.25;
            sfx(ok ? "good" : "bad");
            setResults((r) => [...r, { ok, miss }]);
            setTimeout(() => setLift((n) => n + 1), 900);
          }
        }
      }
      setView({ x: s.x, theta: s.theta, cable: s.cable });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [lift, done, targets]);

  useEffect(() => {
    const set = (e: KeyboardEvent, on: boolean) => {
      const s = st.current;
      if (e.code === "ArrowLeft" || e.code === "KeyA") s.keys.l = on;
      else if (e.code === "ArrowRight" || e.code === "KeyD") s.keys.r = on;
      else if (e.code === "Space" && on) {
        e.preventDefault();
        if (!s.lowering) sfx("blip");
        s.lowering = true;
      }
    };
    const down = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  if (done) {
    const good = results.filter((r) => r.ok).length;
    return <Summary title={good === LIFTS ? "Perfect lifts" : `${good} of ${LIFTS} loads on the mark`} lines={[good ? "Marco gives you a thumbs-up from the frame." : "The crew guided the loads in by hand this time."]} pay={good * CRANE_PAY} why="Crane lifts" />;
  }
  const s = view;
  const k = 380 / (JIB + 2);
  const px = 10 + s.x * k;
  const lx = px + s.cable * Math.sin(s.theta) * k * 0.55;
  const ly = 40 + s.cable * Math.cos(s.theta) * 9;
  const tx = 10 + targets[lift] * k;
  return (
    <>
      <Quit label="Climb down" />
      <div className="eyebrow">
        Tower crane · Load {lift + 1} of {LIFTS} · {money(CRANE_PAY)} a load on the mark
      </div>
      <svg className="crane-game" viewBox="0 0 400 220" role="img" aria-label="The crane jib, trolley and swinging load">
        <rect x="0" y="0" width="400" height="220" fill="#cfe3ee" />
        <rect x="0" y="200" width="400" height="20" fill="#8a7a5c" />
        {/* The house frame being built, and the landing mark */}
        <rect x={tx - 40} y="150" width="80" height="50" fill="none" stroke="#b08a5a" strokeWidth="4" />
        {[-26, -13, 0, 13, 26].map((d) => (
          <line key={d} x1={tx + d} y1="150" x2={tx + d} y2="200" stroke="#c9a676" strokeWidth="3" />
        ))}
        <rect x={tx - 9} y="144" width="18" height="6" fill="#22c55e" />
        {/* Jib and trolley */}
        <rect x="0" y="30" width="400" height="8" fill="#f2b707" />
        <rect x={px - 9} y="36" width="18" height="8" fill="#2a2c30" />
        <line x1={px} y1="44" x2={lx} y2={ly} stroke="#1a1a1a" strokeWidth="1.5" />
        <rect x={lx - 24} y={ly} width="48" height="8" fill="#c9a676" stroke="#8a6a48" />
      </svg>
      <div className="muted small">
        <kbd>←</kbd>
        <kbd>→</kbd> trolley · <kbd>Space</kbd> lower the load · Landed: {results.filter((r) => r.ok).length}
      </div>
    </>
  );
}
