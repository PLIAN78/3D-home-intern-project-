import { useEffect, useState } from "react";
import { host } from "../core/simHost";
import { runtime } from "../core/runtime";
import { BLUEPRINTS } from "../story/collectibles";
import { GEAR, HOTBAR_ORDER, money, type ModeId } from "../story/economy";
import { currentStep, stepTarget } from "../story/missions";
import { DEPOT } from "../story/sidequests";
import { objective, useGame } from "../story/store";
import { GearIcon, LockIcon, MapIcon } from "./icons";
import { Minimap } from "./MapView";

const NAMES: Record<ModeId, string> = { walk: "On foot", ...Object.fromEntries(Object.values(GEAR).map((g) => [g.id, g.name])) } as Record<ModeId, string>;

/** Live readout for the current way of getting around: speed, jetpack fuel, or altitude. */
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
  if (mode === "walk") return null;
  if (mode === "jetpack")
    return (
      <div className="gauge panel">
        <div className="eyebrow">Fuel</div>
        <div className="fuel">
          <div style={{ width: `${Math.round(v.fuel * 100)}%` }} />
        </div>
        <div className="gauge-sub">{Math.round(v.alt)} m above ground</div>
      </div>
    );
  return (
    <div className="gauge panel">
      <div className="speed">
        {Math.round(v.speed)}
        <span>km/h</span>
      </div>
      {mode === "heli" && <div className="gauge-sub">Altitude {Math.round(v.alt)} m</div>}
    </div>
  );
}

function distanceText(d: number) {
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
}

function Distance({ target }: { target: [number, number] }) {
  const [d, setD] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setD(Math.hypot(runtime.body.x - target[0], runtime.body.z - target[1])), 250);
    return () => clearInterval(id);
  }, [target]);
  return <span className="dist">{distanceText(d)}</span>;
}

/** Side jobs in progress: the delivery clock and the search for Peanut. */
function SideJobs() {
  const delivery = useGame((s) => s.delivery);
  const elephant = useGame((s) => s.elephant);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!delivery) return;
    const tick = () => setLeft(delivery.limit - ((host.sim?.time ?? 0) - delivery.started));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [delivery]);
  if (!delivery && elephant !== "asked") return null;
  const clock = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, "0")}`;
  return (
    <div className="panel sidejobs">
      {delivery && (
        <div className="sidejob">
          <div className="eyebrow">Delivery</div>
          <div className="task">
            Panels to {delivery.drop.label} <Distance target={delivery.drop.at} />
          </div>
          <div className={`timer ${left < 0 ? "late" : ""}`}>{left >= 0 ? `${clock(left)} for the on-time bonus` : `${clock(left)} over, no bonus`}</div>
        </div>
      )}
      {elephant === "asked" && (
        <div className="sidejob">
          <div className="eyebrow">Side job</div>
          <div className="task">Find Peanut in the woods west of Rosa’s cottage</div>
        </div>
      )}
    </div>
  );
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
  const deliveries = useGame((s) => s.deliveries);
  const delivery = useGame((s) => s.delivery);
  const obj = objective(progress);
  const step = currentStep(progress);
  const [key, label] = prompt?.includes("|") ? (prompt.split("|") as [string, string]) : ["E", prompt ?? ""];

  return (
    <div className="hud">
      <div className="top-left">
        <div className="panel objective">
          {obj && step ? (
            <>
              <div className="eyebrow">
                {obj.chapter} · {obj.title}
              </div>
              <div className="task">
                {obj.text} <Distance target={stepTarget(step)} />
              </div>
            </>
          ) : (
            <>
              <div className="eyebrow">Free roam</div>
              <div className="task">Story complete. Deliveries, blueprints and goats are still out there.</div>
            </>
          )}
        </div>
        <SideJobs />
        {!delivery && deliveries === 0 && obj && progress.mission >= 2 && (
          <div className="hint">
            Need cash? Bring a pickup to the factory dock for delivery runs. <Distance target={DEPOT} />
          </div>
        )}
      </div>

      <div className="top-right">
        <div className="cash panel">{money(cash)}</div>
        <Minimap />
        <div className="counters panel">
          <span>
            Blueprints
            <b>
              {blueprints}/{BLUEPRINTS.length}
            </b>
          </span>
          <span>
            Goats<b>{goats}/3</b>
          </span>
          <span>
            Deliveries<b>{deliveries}</b>
          </span>
        </div>
        <div className="map-hint">
          <MapIcon size={14} /> <kbd>M</kbd> Map
        </div>
      </div>

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
            {key !== "i" && <kbd>{key}</kbd>}
            <span>{label}</span>
          </div>
        )}
        <div className="mode-name">{NAMES[mode]}</div>
        <div className="hotbar">
          {HOTBAR_ORDER.map((m, i) => {
            const locked = m !== "walk" && !owned[m];
            return (
              <div key={m} className={`slot ${mode === m ? "active" : ""} ${locked ? "locked" : ""}`} title={`${NAMES[m]} (${i + 1})`}>
                <span className="num">{i + 1}</span>
                <GearIcon mode={m} />
                {locked && (
                  <span className="lock">
                    <LockIcon size={11} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="bottom-left">
        <Gauge />
      </div>

      {showHelp && (
        <div className="help panel">
          <div className="eyebrow">Controls</div>
          <dl>
            <dt>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd>
            </dt>
            <dd>Move, drive, fly</dd>
            <dt>
              <kbd>Drag</kbd>
            </dt>
            <dd>Look around, scroll to zoom</dd>
            <dt>
              <kbd>Space</kbd>
            </dt>
            <dd>Jump, jetpack thrust, handbrake, climb</dd>
            <dt>
              <kbd>Shift</kbd>
            </dt>
            <dd>Sprint, gallop, descend</dd>
            <dt>
              <kbd>E</kbd> <kbd>F</kbd>
            </dt>
            <dd>Talk or use, get in or out</dd>
            <dt>
              <kbd>1</kbd>–<kbd>9</kbd>
            </dt>
            <dd>Call your gear</dd>
            <dt>
              <kbd>M</kbd> <kbd>G</kbd> <kbd>H</kbd>
            </dt>
            <dd>Map, graphics, hide this</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
