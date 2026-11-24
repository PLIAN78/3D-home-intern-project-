import { useEffect, useRef, useState } from "react";
import { BLUEPRINTS } from "../story/collectibles";
import { DIALOGS } from "../story/dialogs";
import { canBuy, GEAR, money, SHOP_ORDER } from "../story/economy";
import { CheckIcon, CloseIcon, GearIcon } from "./icons";
import { useGame } from "../story/store";
import { releaseAll } from "../core/input";

/** Talking: Space/Enter/E/click continues; 1–3 picks an answer. */
export function DialogBox() {
  const dialog = useGame((s) => s.dialog);
  const nextLine = useGame((s) => s.nextLine);
  const choose = useGame((s) => s.choose);
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      const line = DIALOGS[dialog.id][dialog.line];
      if (line.choices && dialog.reply === null) {
        const n = Number(e.key);
        if (n >= 1 && n <= line.choices.length) choose(n - 1);
        return;
      }
      if (["Space", "Enter", "KeyE"].includes(e.code)) {
        e.preventDefault();
        nextLine();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, nextLine, choose]);
  if (!dialog) return null;
  const line = DIALOGS[dialog.id][dialog.line];
  const waiting = line.choices && dialog.reply === null;
  return (
    <div className="dialog" onClick={() => !waiting && nextLine()}>
      <div className="speaker">{line.speaker}</div>
      <div className={`line ${line.speaker === "Phone" ? "call" : ""}`}>{line.text}</div>
      {line.choices && dialog.reply === null && (
        <div className="choices">
          {line.choices.map((c, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                choose(i);
              }}
            >
              <kbd>{i + 1}</kbd> {c.text}
            </button>
          ))}
        </div>
      )}
      {dialog.reply && <div className="reply">“{dialog.reply}”</div>}
      {!waiting && (
        <div className="continue">
          <kbd>Space</kbd> Continue
        </div>
      )}
    </div>
  );
}

/** Factory reset: stop the needle in the green. */
function TimingGame({ onDone }: { onDone: (ok: boolean) => void }) {
  const [zone] = useState(() => {
    const start = 0.25 + Math.random() * 0.45;
    return [start, start + 0.16] as const;
  });
  const [msg, setMsg] = useState("Press Space when the needle is in the green");
  const live = useRef(true);
  // The needle is drawn straight to the DOM in the animation frame and the key handler
  // reads the same ref, so a press is judged on exactly what the player sees, at any FPS.
  const needle = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  useEffect(() => {
    let raf = 0;
    let t = 0;
    let last = performance.now();
    const tick = (now: number) => {
      t += Math.min(0.1, (now - last) / 1000);
      last = now;
      if (live.current) {
        posRef.current = (Math.sin(t * 2.6) + 1) / 2;
        if (needle.current) needle.current.style.left = `${posRef.current * 100}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || !live.current) return;
      e.preventDefault();
      const p = posRef.current;
      if (p >= zone[0] && p <= zone[1]) {
        live.current = false;
        setMsg("Machine reset.");
        setTimeout(() => onDone(true), 700);
      } else setMsg("Missed. Try again!");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zone, onDone]);
  return (
    <>
      <div className="meter">
        <div className="zone" style={{ left: `${zone[0] * 100}%`, width: `${(zone[1] - zone[0]) * 100}%` }} />
        <div className="needle" ref={needle} style={{ left: "50%" }} />
      </div>
      <div className="mg-msg">{msg}</div>
    </>
  );
}

const POUR_BAND = [0.72, 0.86] as const;

/** Foundation pour: hold Space to fill, let go in the green band, don't overflow. */
function PourGame({ onDone }: { onDone: (ok: boolean) => void }) {
  const [msg, setMsg] = useState("Hold Space to pour. Let go in the green band.");
  const holding = useRef(false);
  const live = useRef(true);
  // Same idea as the timing game: the fill is drawn from the ref the key-up handler judges.
  const fill = useRef<HTMLDivElement>(null);
  const lv = useRef(0);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const draw = () => {
      if (fill.current) fill.current.style.height = `${Math.min(1, lv.current) * 100}%`;
    };
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (live.current && holding.current) {
        lv.current = Math.min(1.05, lv.current + dt * 0.32);
        if (lv.current >= 1) {
          lv.current = 0;
          holding.current = false;
          setMsg("Oops, it spilled over! Forms reset. Try again.");
        }
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (live.current) holding.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !live.current || !holding.current) return;
      holding.current = false;
      if (lv.current >= POUR_BAND[0] && lv.current <= POUR_BAND[1]) {
        live.current = false;
        setMsg("Perfect pour.");
        setTimeout(() => onDone(true), 900);
      } else if (lv.current < POUR_BAND[0]) setMsg("A bit more concrete…");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onDone]);
  return (
    <>
      <div className="tank">
        <div
          className="band"
          style={{ bottom: `${POUR_BAND[0] * 100}%`, height: `${(POUR_BAND[1] - POUR_BAND[0]) * 100}%` }}
        />
        <div className="fill" ref={fill} style={{ height: "0%" }} />
      </div>
      <div className="mg-msg">{msg}</div>
    </>
  );
}

export function MiniGame() {
  const minigame = useGame((s) => s.minigame);
  const finish = useGame((s) => s.finishMinigame);
  useEffect(() => {
    if (!minigame) return;
    releaseAll();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [minigame, finish]);
  if (!minigame) return null;
  return (
    <div className="modal">
      <div className="card minigame">
        <h2>{minigame.title}</h2>
        {minigame.kind === "timing" ? <TimingGame onDone={finish} /> : <PourGame onDone={finish} />}
        <button className="ghost" onClick={() => finish(false)}>
          Leave for now (Esc)
        </button>
      </div>
    </div>
  );
}

export function Shop() {
  const open = useGame((s) => s.shopOpen);
  const cash = useGame((s) => s.cash);
  const owned = useGame((s) => s.owned);
  const setShop = useGame((s) => s.setShop);
  const buyGear = useGame((s) => s.buyGear);
  useEffect(() => {
    if (!open) return;
    releaseAll();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "KeyE") setShop(false);
      const n = Number(e.key);
      if (n >= 1 && n <= SHOP_ORDER.length) buyGear(SHOP_ORDER[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setShop, buyGear]);
  if (!open) return null;
  return (
    <div className="modal">
      <div className="card shop">
        <div className="card-head">
          <div>
            <div className="eyebrow">Sales Centre</div>
            <h2>Gear Garage</h2>
          </div>
          <div className="balance">
            <span className="eyebrow">Balance</span>
            {money(cash)}
          </div>
        </div>
        <div className="items">
          {SHOP_ORDER.map((id, i) => {
            const g = GEAR[id];
            const check = canBuy(cash, owned, id);
            return (
              <div key={id} className={`item ${owned[id] ? "owned" : ""}`}>
                <div className="item-icon">
                  <GearIcon mode={id} size={28} />
                </div>
                <div className="item-body">
                  <div className="item-name">{g.name}</div>
                  <div className="item-blurb">{g.blurb}</div>
                </div>
                <div className="item-buy">
                  {owned[id] ? (
                    <span className="owned-tag">
                      <CheckIcon size={14} /> Owned · key {g.key}
                    </span>
                  ) : (
                    <>
                      <button disabled={!check.ok} onClick={() => buyGear(id)}>
                        <kbd>{i + 1}</kbd> Buy {money(g.price ?? 0)}
                      </button>
                      {!check.ok && <div className="item-need">{check.reason}</div>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="card-foot muted">Peanut the elephant isn’t for sale. Ask around up in the hills.</div>
        <button className="icon-btn corner" aria-label="Close" onClick={() => setShop(false)}>
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

export function Title() {
  const start = useGame((s) => s.start);
  return (
    <div className="title-screen">
      <div className="title-card">
        <div className="logo">CAIVAN</div>
        <h1>Build It</h1>
        <p className="tagline">An open-world day on the job in Caivan Ridge. Check survey stakes, help a family choose their home, fix the panel line, pour a foundation and hand over the keys. Then drive up into the hills, run deliveries, and earn your way to a helicopter.</p>
        <button className="play" onClick={start} autoFocus>
          Start your first day
        </button>
        <p className="muted small">
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> move · <kbd>E</kbd> talk · <kbd>F</kbd> get in · <kbd>1</kbd>–<kbd>6</kbd> your gear · <kbd>M</kbd> map
        </p>
      </div>
    </div>
  );
}

export function Ending() {
  const phase = useGame((s) => s.phase);
  const earned = useGame((s) => s.earned);
  const blueprints = useGame((s) => s.blueprints.length);
  const goats = useGame((s) => s.goatsHome.length);
  const keep = useGame((s) => s.keepExploring);
  const [flash, setFlash] = useState(true);
  useEffect(() => {
    if (phase !== "ending") return;
    releaseAll();
    const id = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(id);
  }, [phase]);
  if (phase !== "ending") return null;
  return (
    <div className="modal ending">
      {flash && <div className="flash" />}
      <div className="card">
        <div className="eyebrow">Grand Opening photo</div>
        <h2>Grand Opening: The End</h2>
        <p>From survey stakes to front-door keys, you helped build a neighbourhood. The Nguyens are home, the Patels picked their lot, and Raj’s panel line is humming.</p>
        <div className="stats">
          <div>
            <b>{money(earned)}</b> earned
          </div>
          <div>
            <b>
              {blueprints}/{BLUEPRINTS.length}
            </b>{" "}
            blueprints
          </div>
          <div>
            <b>{goats}/3</b> goats home
          </div>
        </div>
        <button className="play" onClick={keep}>
          Keep exploring
        </button>
      </div>
    </div>
  );
}
