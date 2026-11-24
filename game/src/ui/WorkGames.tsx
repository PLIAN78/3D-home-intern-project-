import { useEffect, useMemo, useRef, useState } from "react";
import { releaseAll } from "../core/input";
import { sfx } from "../core/sfx";
import { money } from "../story/economy";
import { useGame, type Job } from "../story/store";
import { INGREDIENTS, makeOrder, mathRound, PAY, RANKS, rng, SCHEDULE, schedulePay, triviaRound, type Kitchen, type Question } from "../story/work";
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
    return <Summary title="Shift over" lines={[`${result.served} of ${ORDERS} orders served, ${result.tips} with a tip.`, result.missed ? `${result.missed} customer${result.missed > 1 ? "s" : ""} gave up waiting.` : "Nobody left hungry."]} pay={pay} why={kitchen === "subs" ? "Shift at Crossroads Subs" : "Shift at Flat Top Burgers"} />;
  }
  const label = (id: string) => ingredients.find((x) => x.id === id)!;
  return (
    <>
      <Quit />
      <div className="job-head">
        <div className="eyebrow">
          {kitchen === "subs" ? "Crossroads Subs" : "Flat Top Burgers"} · Customer {n + 1} of {ORDERS}
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
