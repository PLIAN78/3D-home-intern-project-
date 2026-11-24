import { useEffect, useRef, useState } from "react";
import { BLUEPRINTS } from "../story/collectibles";
import { GEAR, money } from "../story/economy";
import { currentStep, stepTarget } from "../story/missions";
import { runtime } from "../core/runtime";
import { objective, useGame } from "../story/store";
import type { ModeId } from "../story/economy";
import { CAIVAN_RIDGE, LANDMARKS, PEN, WORLD_HALF } from "../world/map";

const LABELS: Record<ModeId, string> = { walk: "On foot (1)", truck: "Company pickup (2)", horse: "Biscuit the horse (3)", car: "Volt GT (4)", jetpack: "SkyHopper jetpack (5)" };

const HOTBAR: { key: string; mode: ModeId; icon: string; gear?: keyof typeof GEAR }[] = [
  { key: "1", mode: "walk", icon: "🚶" },
  { key: "2", mode: "truck", icon: "🛻", gear: "truck" },
  { key: "3", mode: "horse", icon: "🐴", gear: "horse" },
  { key: "4", mode: "car", icon: "🏎️", gear: "car" },
  { key: "5", mode: "jetpack", icon: "🚀", gear: "jetpack" },
];

/** North-up map: roads, lots, landmarks, you, the objective and runaway goats. */
function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const progress = useGame((s) => s.progress);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const S = canvas.width;
    const k = S / (WORLD_HALF * 2);
    const P = (x: number, z: number): [number, number] => [(x + WORLD_HALF) * k, (z + WORLD_HALF) * k];
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = "#6f8d4a";
      ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = "#3f4246";
      ctx.lineWidth = 9 * k * 1.6;
      ctx.lineCap = "round";
      for (const r of CAIVAN_RIDGE.roads) {
        ctx.beginPath();
        ctx.moveTo(...P(r.from[0], r.from[1]));
        ctx.lineTo(...P(r.to[0], r.to[1]));
        ctx.stroke();
      }
      ctx.fillStyle = "#cfc5b2";
      for (const l of CAIVAN_RIDGE.lots) {
        const [x, y] = P(l.position[0] - l.width / 2, l.position[2] - l.depth / 2);
        ctx.fillRect(x + 0.5, y + 0.5, l.width * k - 1, l.depth * k - 1);
      }
      for (const m of Object.values(LANDMARKS)) {
        if (m.id === "park") continue;
        const [x, y] = P(m.position[0], m.position[1]);
        ctx.fillStyle = m.id === "factory" ? "#94a3b8" : m.id === "tower" ? "#e2e8f0" : m.id === "farm" ? "#b45309" : "#1f3a5f";
        const w = Math.max(5, m.size[0] * k);
        const h = Math.max(5, m.size[1] * k);
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
      }
      ctx.strokeStyle = "#a07a52";
      ctx.lineWidth = 1.5;
      const [px, py] = P(PEN.centre[0] - PEN.half, PEN.centre[1] - PEN.half);
      ctx.strokeRect(px, py, PEN.half * 2 * k, PEN.half * 2 * k);
      ctx.fillStyle = "#4f8fbf";
      ctx.beginPath();
      ctx.arc(...P(LANDMARKS.park.position[0] + 10, LANDMARKS.park.position[1] + 5), 11 * k, 0, Math.PI * 2);
      ctx.fill();
      // goats still on the loose
      ctx.fillStyle = "#ffffff";
      for (const g of runtime.goats) {
        if (g.home) continue;
        ctx.beginPath();
        ctx.arc(...P(g.x, g.z), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      const step = currentStep(useGame.getState().progress);
      if (step) {
        const [tx, ty] = P(...stepTarget(step));
        const pulse = 4 + Math.sin(performance.now() / 200) * 1.5;
        ctx.fillStyle = "#facc15";
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tx, ty, pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      const b = runtime.body;
      const [bx, by] = P(b.x, b.z);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(b.heading);
      ctx.fillStyle = "#ef4444";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, -4.5);
      ctx.lineTo(-2.5, 0);
      ctx.lineTo(-5, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [progress]);
  return (
    <div className="minimap">
      <canvas ref={ref} width={220} height={220} />
      <span className="north">N</span>
    </div>
  );
}

/** Speed or jetpack fuel, refreshed a few times a second. */
function Gauge() {
  const mode = useGame((s) => s.mode);
  const [v, setV] = useState({ speed: 0, fuel: 1, alt: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const b = runtime.body;
      setV({ speed: Math.abs(b.speed) * 3.6, fuel: b.fuelMax ? b.fuel / b.fuelMax : 0, alt: b.y });
    }, 120);
    return () => clearInterval(id);
  }, []);
  if (mode === "jetpack")
    return (
      <div className="gauge">
        <div className="gauge-label">Fuel · {Math.round(v.alt)} m up</div>
        <div className="fuel">
          <div style={{ width: `${Math.round(v.fuel * 100)}%` }} />
        </div>
      </div>
    );
  if (mode === "walk") return null;
  return (
    <div className="gauge">
      <div className="speed">{Math.round(v.speed)}</div>
      <div className="gauge-label">km/h</div>
    </div>
  );
}

function Distance({ target }: { target: [number, number] }) {
  const [d, setD] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setD(Math.hypot(runtime.body.x - target[0], runtime.body.z - target[1])), 250);
    return () => clearInterval(id);
  }, [target]);
  return <span className="dist">{d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`}</span>;
}

export function Hud() {
  const cash = useGame((s) => s.cash);
  const mode = useGame((s) => s.mode);
  const owned = useGame((s) => s.owned);
  const progress = useGame((s) => s.progress);
  const prompt = useGame((s) => s.prompt);
  const toasts = useGame((s) => s.toasts);
  const showHelp = useGame((s) => s.showHelp);
  const blueprints = useGame((s) => s.blueprints.length);
  const goats = useGame((s) => s.goatsHome.length);
  const obj = objective(progress);
  const step = currentStep(progress);

  return (
    <div className="hud">
      <div className="top-left">
        <div className="cash">{money(cash)}</div>
        {obj && step ? (
          <div className="objective">
            <div className="chapter">
              {obj.chapter} · {obj.title}
            </div>
            <div className="task">
              ▸ {obj.text} <Distance target={stepTarget(step)} />
            </div>
          </div>
        ) : (
          <div className="objective">
            <div className="chapter">Free roam</div>
            <div className="task">Story complete. Find every blueprint and goat!</div>
          </div>
        )}
        <div className="extras">
          📘 {blueprints}/{BLUEPRINTS.length} blueprints · 🐐 {goats}/3 goats home
        </div>
      </div>
      <Minimap />
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
      <div className="bottom">
        {prompt && (
          <div className="prompt">
            <kbd>{prompt.includes("|") ? prompt.split("|")[0] : "E"}</kbd> {prompt.includes("|") ? prompt.split("|")[1] : prompt}
          </div>
        )}
        <div className="hotbar-row">
          <Gauge />
          <div className="hotbar">
            {HOTBAR.map((h) => {
              const locked = h.gear ? !owned[h.gear] : false;
              return (
                <div key={h.key} className={`slot ${mode === h.mode ? "active" : ""} ${locked ? "locked" : ""}`} title={LABELS[h.mode]}>
                  <span className="icon">{locked ? "🔒" : h.icon}</span>
                  <span className="num">{h.key}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {showHelp && (
        <div className="help">
          <b>Controls</b>
          <div>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> move / drive
          </div>
          <div>
            <kbd>Drag</kbd> or <kbd>←</kbd>
            <kbd>→</kbd> look · wheel zoom
          </div>
          <div>
            <kbd>Space</kbd> jump · jetpack · handbrake · <kbd>Shift</kbd> sprint
          </div>
          <div>
            <kbd>E</kbd> talk / use · <kbd>F</kbd> get in / out
          </div>
          <div>
            <kbd>1</kbd>–<kbd>5</kbd> call your gear · <kbd>G</kbd> graphics
          </div>
          <div className="muted">
            <kbd>H</kbd> hide this
          </div>
        </div>
      )}
    </div>
  );
}
