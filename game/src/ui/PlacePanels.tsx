import { useEffect, useRef, useState } from "react";
import { releaseAll } from "../core/input";
import { host } from "../core/simHost";
import { runtime } from "../core/runtime";
import { OUTFITS, type Outfit } from "../models/human";
import { VEHICLES, VEHICLE_IDS } from "../sim/vehicle";
import { BANK, creditLeft } from "../story/bank";
import { canBuy, DEALER_ORDER, GEAR, money } from "../story/economy";
import { PLACES, type PlaceId } from "../story/places";
import { useGame, type PanelId } from "../story/store";
import { earnedRank, LAND_STAGES, MEALS, PARCEL_PRICES, RANKS, RENT, RENT_SECONDS, RESUMES, type Kitchen } from "../story/work";
import { lotById, PARCELS, STREETS } from "../world/map";
import { CheckIcon, CloseIcon, GearIcon } from "./icons";

/**
 * The town's places, used from the door: Ridge Motors, the bank, the clothing
 * store and the two restaurants, plus your desk at the Caivan office.
 */
export function PlacePanel() {
  const panel = useGame((s) => s.panel);
  const job = useGame((s) => s.job);
  const setPanel = useGame((s) => s.setPanel);
  useEffect(() => {
    if (!panel) return;
    releaseAll();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && !useGame.getState().job) setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, setPanel]);
  if (!panel || job) return null;
  return (
    <div className={`modal ${panel === "clothing" ? "side" : ""}`}>
      <div className={`card place ${panel}`}>
        <PanelBody panel={panel} />
        <button className="icon-btn corner" aria-label="Close" onClick={() => setPanel(null)}>
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

function PanelBody({ panel }: { panel: PanelId }) {
  switch (panel) {
    case "dealer":
      return <Dealer />;
    case "bank":
      return <Bank />;
    case "clothing":
      return <Wardrobe />;
    case "subs":
    case "burger":
    case "shawarma":
      return <Restaurant kitchen={panel} />;
    case "desk":
      return <Desk />;
    case "cityhall":
      return <CityHall />;
    case "resumes":
      return <Resumes />;
  }
}

function Head({ place, eyebrow }: { place: PlaceId | "desk"; eyebrow: string }) {
  const cash = useGame((s) => s.cash);
  const unlimited = useGame((s) => s.unlimited);
  return (
    <div className="card-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{place === "desk" ? "Your desk" : PLACES[place].name}</h2>
      </div>
      <div className="balance">
        <span className="eyebrow">Wallet</span>
        {unlimited ? "$ ∞" : money(cash)}
      </div>
    </div>
  );
}

// ── Ridge Motors ────────────────────────────────────────────────────────

function Dealer() {
  const cash = useGame((s) => s.cash);
  const owned = useGame((s) => s.owned);
  const car = useGame((s) => s.car);
  const unlimited = useGame((s) => s.unlimited);
  const buyGear = useGame((s) => s.buyGear);
  const selectCar = useGame((s) => s.selectCar);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= DEALER_ORDER.length) buyGear(DEALER_ORDER[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buyGear]);
  return (
    <>
      <Head place="dealer" eyebrow="Caivan Boulevard" />
      <div className="items">
        {DEALER_ORDER.map((id, i) => {
          const g = GEAR[id];
          const spec = VEHICLES[id];
          const check = canBuy(cash, owned, id, unlimited);
          return (
            <div key={id} className={`item ${owned[id] ? "owned" : ""}`}>
              <div className="item-icon">
                <GearIcon mode={id} size={28} />
              </div>
              <div className="item-body">
                <div className="item-name">{g.name}</div>
                <div className="item-blurb">{g.blurb}</div>
                <div className="item-specs">
                  {Math.round(spec.topSpeed * 3.6)} km/h · {spec.allWheelDrive ? "All-wheel drive" : "Rear-wheel drive"} · {spec.mass.toLocaleString("en-CA")} kg
                </div>
              </div>
              <div className="item-buy">
                {owned[id] ? (
                  car === id ? (
                    <span className="owned-tag">
                      <CheckIcon size={14} /> Your car
                    </span>
                  ) : (
                    <button className="secondary" onClick={() => selectCar(id)}>
                      Make it my car
                    </button>
                  )
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
      <div className="card-foot muted">
        New cars wait on the forecourt. <kbd>2</kbd> drives your car; press it again to switch. You own {VEHICLE_IDS.filter((id) => owned[id]).length} of {VEHICLE_IDS.length}.
      </div>
    </>
  );
}

// ── Ridge Savings Bank ──────────────────────────────────────────────────

function Bank() {
  const cash = useGame((s) => s.cash);
  const earned = useGame((s) => s.earned);
  const account = useGame((s) => s.account);
  const { bankDeposit, bankWithdraw, bankBorrow, bankRepay } = useGame.getState();
  const credit = creditLeft(account, earned);
  const [next, setNext] = useState(0);
  useEffect(() => {
    const tick = () => setNext(Math.max(0, BANK.period - ((host.sim?.time ?? 0) - account.lastInterest)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [account.lastInterest]);
  return (
    <>
      <Head place="bank" eyebrow="Market Street" />
      <div className="bank-grid">
        <section>
          <div className="eyebrow">Savings</div>
          <div className="big">{money(account.savings)}</div>
          <p className="muted small">
            Earns {Math.round(BANK.rate * 100)}% every {BANK.period / 60} minutes of play. Next payment in {Math.floor(next / 60)}:{String(Math.floor(next % 60)).padStart(2, "0")}.
          </p>
          <div className="btn-row">
            {[100, 500, 1000].map((n) => (
              <button key={n} disabled={cash < n} onClick={() => bankDeposit(n)}>
                Deposit {money(n)}
              </button>
            ))}
            <button disabled={cash <= 0} onClick={() => bankDeposit(cash)}>
              Deposit all
            </button>
          </div>
          <div className="btn-row">
            {[100, 500].map((n) => (
              <button key={n} className="secondary" disabled={account.savings < n} onClick={() => bankWithdraw(n)}>
                Withdraw {money(n)}
              </button>
            ))}
            <button className="secondary" disabled={account.savings <= 0} onClick={() => bankWithdraw(account.savings)}>
              Withdraw all
            </button>
          </div>
        </section>
        <section>
          <div className="eyebrow">Loan</div>
          <div className="big">{account.owed > 0 ? `${money(account.owed)} owed` : "No loan"}</div>
          <p className="muted small">
            You can borrow {money(credit)} more. A {Math.round(BANK.fee * 100)}% fee is added once; {Math.round(BANK.autoRepay * 100)}% of everything you earn repays it automatically.
          </p>
          <div className="btn-row">
            {[500, 1000, 2500].map((n) => (
              <button key={n} disabled={credit < n} onClick={() => bankBorrow(n)}>
                Borrow {money(n)}
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button className="secondary" disabled={account.owed <= 0 || cash < Math.min(500, account.owed)} onClick={() => bankRepay(500)}>
              Repay {money(Math.min(500, account.owed || 500))}
            </button>
            <button className="secondary" disabled={account.owed <= 0 || cash <= 0} onClick={() => bankRepay(account.owed)}>
              Repay all I can
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

// ── Northline Outfitters ────────────────────────────────────────────────

const SKIN = ["#f3d2b8", "#e8b796", "#d9a77f", "#c68863", "#a8714d", "#8d5a3b", "#6e4630", "#4f3222"];
const HAIR = ["#121010", "#2b1d14", "#5a3a22", "#8a5a2b", "#c9a15a", "#b9b2a6", "#8c2f2a"];
const SHIRTS = ["#2f4f75", "#e9e4da", "#7a2e2e", "#56705a", "#2b2f36", "#b88a3a", "#5d4a7a", "#3c6e6e"];
const PANTS = ["#3a3f4a", "#1f3a5f", "#2c2f36", "#6b5a46", "#8c8578", "#3d4a3a"];
const SHOES = ["#4a3424", "#1f1f22", "#f2f2f2", "#7a4a2a"];
const HATS: { label: string; hat: Outfit["hat"] }[] = [
  { label: "None", hat: undefined },
  { label: "Hard hat", hat: { kind: "hardhat", color: "#f5c400" } },
  { label: "White hard hat", hat: { kind: "hardhat", color: "#ffffff" } },
  { label: "Cap", hat: { kind: "cap", color: "#1f3a5f" } },
  { label: "Straw hat", hat: { kind: "straw", color: "#d8b25a" } },
];
const PRICES = { shirt: 40, pants: 40, shoes: 30, hair: 25, hat: 30 };

function costOf(a: Outfit, b: Outfit) {
  let c = 0;
  if (a.shirt !== b.shirt) c += PRICES.shirt;
  if (a.pants !== b.pants) c += PRICES.pants;
  if (a.shoes !== b.shoes) c += PRICES.shoes;
  if (a.hair !== b.hair || !!a.longHair !== !!b.longHair) c += PRICES.hair;
  if (JSON.stringify(a.hat ?? null) !== JSON.stringify(b.hat ?? null)) c += PRICES.hat;
  return c;
}

function Swatches({ label, colors, value, onPick, price }: { label: string; colors: string[]; value: string | undefined; onPick: (c: string) => void; price?: number }) {
  return (
    <div className="wardrobe-row">
      <div className="eyebrow">
        {label}
        {price ? ` · ${money(price)}` : " · free"}
      </div>
      <div className="swatches">
        {colors.map((c) => (
          <button key={c} className={`swatch ${value === c ? "on" : ""}`} style={{ background: c }} aria-label={c} onClick={() => onPick(c)} />
        ))}
      </div>
    </div>
  );
}

function Wardrobe() {
  const setOutfit = useGame((s) => s.setOutfit);
  const setPanel = useGame((s) => s.setPanel);
  // Preview on the player as you choose; put the old look back if you leave without buying.
  const [original] = useState<Outfit>(() => useGame.getState().outfit);
  const [draft, setDraft] = useState<Outfit>(original);
  const bought = useRef(false);
  useEffect(() => {
    // Turn the camera to see the player from the front.
    runtime.cameraYaw = (host.sim?.player.heading ?? 0) + Math.PI;
    runtime.cameraPitch = 0.12;
    return () => {
      if (!bought.current) useGame.setState({ outfit: original });
    };
  }, [original]);
  const update = (patch: Partial<Outfit>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    useGame.setState({ outfit: next });
  };
  const cost = costOf(original, draft);
  return (
    <>
      <Head place="clothing" eyebrow="Market Street" />
      <div className="wardrobe">
        <Swatches label="Skin tone" colors={SKIN} value={draft.skin} onPick={(c) => update({ skin: c })} />
        <Swatches label="Hair" colors={HAIR} value={draft.hair} onPick={(c) => update({ hair: c })} price={PRICES.hair} />
        <div className="wardrobe-row">
          <div className="eyebrow">Hair length</div>
          <div className="btn-row">
            <button className={`secondary ${!draft.longHair ? "on" : ""}`} onClick={() => update({ longHair: false })}>
              Short
            </button>
            <button className={`secondary ${draft.longHair ? "on" : ""}`} onClick={() => update({ longHair: true })}>
              Long
            </button>
          </div>
        </div>
        <Swatches label="Shirt" colors={SHIRTS} value={draft.shirt} onPick={(c) => update({ shirt: c })} price={PRICES.shirt} />
        <Swatches label="Trousers" colors={PANTS} value={draft.pants} onPick={(c) => update({ pants: c })} price={PRICES.pants} />
        <Swatches label="Shoes" colors={SHOES} value={draft.shoes} onPick={(c) => update({ shoes: c })} price={PRICES.shoes} />
        <div className="wardrobe-row">
          <div className="eyebrow">Hat · {money(PRICES.hat)}</div>
          <div className="btn-row">
            {HATS.map((h) => (
              <button key={h.label} className={`secondary ${JSON.stringify(draft.hat ?? null) === JSON.stringify(h.hat ?? null) ? "on" : ""}`} onClick={() => update({ hat: h.hat })}>
                {h.label}
              </button>
            ))}
          </div>
        </div>
        <div className="wardrobe-row">
          <div className="eyebrow">Safety vest · free</div>
          <div className="btn-row">
            <button className={`secondary ${draft.vest ? "on" : ""}`} onClick={() => update({ vest: OUTFITS.player.vest })}>
              On
            </button>
            <button className={`secondary ${!draft.vest ? "on" : ""}`} onClick={() => update({ vest: undefined })}>
              Off
            </button>
          </div>
        </div>
      </div>
      <div className="card-actions">
        <button
          className="secondary"
          onClick={() => {
            setDraft(original);
            useGame.setState({ outfit: original });
          }}
        >
          Reset
        </button>
        <button
          className="primary"
          onClick={() => {
            // Put the old look back, then buy: setOutfit only applies the new look if you can pay.
            useGame.setState({ outfit: original });
            setOutfit(draft, cost);
            if (useGame.getState().outfit === draft) {
              bought.current = true;
              setPanel(null);
            } else useGame.setState({ outfit: draft });
          }}
        >
          {cost > 0 ? `Buy this look · ${money(cost)}` : "Keep this look"}
        </button>
      </div>
    </>
  );
}

// ── Crossroads Subs and Flat Top Burgers ────────────────────────────────

function Restaurant({ kitchen }: { kitchen: Kitchen }) {
  const buyMeal = useGame((s) => s.buyMeal);
  const startJob = useGame((s) => s.startJob);
  const setPanel = useGame((s) => s.setPanel);
  const boost = useGame((s) => s.boost);
  const meal = MEALS[kitchen];
  return (
    <>
      <Head place={kitchen} eyebrow={kitchen === "shawarma" ? "Queen Street · Owawa" : "Market Street"} />
      <div className="items">
        <div className="item">
          <div className="item-body">
            <div className="item-name">{meal.name}</div>
            <div className="item-blurb">{meal.blurb}</div>
          </div>
          <div className="item-buy">
            <button
              onClick={() => {
                buyMeal(kitchen, host.sim?.time ?? 0);
                setPanel(null);
              }}
            >
              <kbd>1</kbd> Buy {money(meal.price)}
            </button>
            {boost && <div className="item-need">Replaces your current boost</div>}
          </div>
        </div>
        <div className="item">
          <div className="item-body">
            <div className="item-name">Work a shift</div>
            <div className="item-blurb">Five customers. Build each order in the right sequence before the ticket runs out. {money(35)} an order, plus tips for speed.</div>
          </div>
          <div className="item-buy">
            <button
              className="secondary"
              onClick={() => {
                setPanel(null);
                startJob("orders", kitchen);
              }}
            >
              <kbd>2</kbd> Start shift
            </button>
          </div>
        </div>
      </div>
      <RestaurantKeys kitchen={kitchen} />
    </>
  );
}

function RestaurantKeys({ kitchen }: { kitchen: Kitchen }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = useGame.getState();
      if (e.code === "Digit1") {
        g.buyMeal(kitchen, host.sim?.time ?? 0);
        g.setPanel(null);
      } else if (e.code === "Digit2") {
        g.setPanel(null);
        g.startJob("orders", kitchen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kitchen]);
  return null;
}

// ── Your desk at the Caivan office ──────────────────────────────────────

const TASKS: { kind: "math" | "trivia" | "schedule"; title: string; blurb: string; pay: string }[] = [
  { kind: "math", title: "Estimating", blurb: "Five quick takeoff and costing questions: studs, concrete, drywall, totals, tax.", pay: "$45 a correct answer, +$15 if quick" },
  { kind: "trivia", title: "Lunch and learn", blurb: "Six homebuilding questions. Learn something about how houses go together.", pay: "$50 a correct answer" },
  { kind: "schedule", title: "Build schedule", blurb: "Put the nine construction stages in order, from permits to final inspection.", pay: "$200, less $25 a mistake" },
];

function Desk() {
  const office = useGame((s) => s.office);
  const startJob = useGame((s) => s.startJob);
  const rank = RANKS[office.rank];
  const nextRank = RANKS[office.rank + 1];
  const ready = earnedRank(office.tasks) > office.rank;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= TASKS.length && !useGame.getState().job) useGame.getState().startJob(TASKS[n - 1].kind);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <Head place="desk" eyebrow="Caivan office" />
      <div className="career">
        <div>
          <div className="eyebrow">Your role</div>
          <div className="big">{rank.title}</div>
        </div>
        <div>
          <div className="eyebrow">Pay</div>
          <div className="big">×{rank.pay}</div>
        </div>
        <div>
          <div className="eyebrow">Tasks done</div>
          <div className="big">{office.tasks}</div>
        </div>
      </div>
      <p className="muted small">{ready ? "You've earned a promotion. Go and see Daniel in the glass office." : nextRank ? `${nextRank.tasks - office.tasks} more tasks until you can ask Daniel about ${nextRank.title}.` : "Top of the ladder. Daniel is impressed."}</p>
      <div className="items">
        {TASKS.map((t, i) => (
          <div key={t.kind} className="item">
            <div className="item-body">
              <div className="item-name">{t.title}</div>
              <div className="item-blurb">{t.blurb}</div>
              <div className="item-specs">{t.pay}</div>
            </div>
            <div className="item-buy">
              <button onClick={() => startJob(t.kind)}>
                <kbd>{i + 1}</kbd> Start
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="card-foot muted">
        <kbd>Esc</kbd> stand up
      </div>
    </>
  );
}

// ── Owawa City Hall: buy land, get a permit ─────────────────────────────

const LAND_STEP_TEXT = {
  none: "",
  bought: "Bought. Walk your parcel in Caivan Ridge to survey it; it's marked on your map.",
  surveyed: "Surveyed. Apply for your building permit below.",
  building: "Permit approved. Caivan's crew is building your house.",
  done: `Finished and rented out: ${money(RENT)} every ${RENT_SECONDS / 60} minutes.`,
};

function parcelStreet(id: string) {
  const lot = lotById(id);
  return Math.abs(lot.position[2] - STREETS.maple.z) < Math.abs(lot.position[2] - STREETS.birch.z) ? STREETS.maple.name : STREETS.birch.name;
}

function CityHall() {
  const land = useGame((s) => s.land);
  const cash = useGame((s) => s.cash);
  const unlimited = useGame((s) => s.unlimited);
  const g = useGame.getState;
  const now = () => host.sim?.time ?? 0;
  return (
    <>
      <Head place="cityhall" eyebrow="Land and permits office" />
      {land.step === "none" ? (
        <>
          <p className="muted small">Owawa sells serviced lots in Caivan Ridge’s new east phase. Buy one, walk it to survey it, get a permit here, and Caivan builds you a house that pays rent.</p>
          <div className="items">
            {PARCELS.map((id, i) => {
              const price = PARCEL_PRICES[id];
              const lot = lotById(id);
              const short = !unlimited && cash < price;
              return (
                <div key={id} className="item">
                  <div className="item-body">
                    <div className="item-name">
                      Lot {lot.number}, {parcelStreet(id)}
                    </div>
                    <div className="item-blurb">
                      {lot.width} m × {lot.depth} m · {i === 2 ? "Corner of the phase, backs onto the woods" : i === 1 ? "Wide frontage, south-facing yard" : "Quiet end of the street"}
                    </div>
                  </div>
                  <div className="item-buy">
                    <button disabled={short} onClick={() => g().buyParcel(id, price, now())}>
                      Buy {money(price)}
                    </button>
                    {short && <div className="item-need">Need {money(price - cash)} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="items">
          <div className="item">
            <div className="item-body">
              <div className="item-name">Your land: Lot {land.lot ? lotById(land.lot).number : ""}</div>
              <div className="item-blurb">{LAND_STEP_TEXT[land.step]}</div>
              {land.step === "building" && (
                <div className="item-specs">
                  Stage {land.stage + 1} of {LAND_STAGES.length}: {LAND_STAGES[land.stage]}
                </div>
              )}
            </div>
            {land.step === "surveyed" && (
              <div className="item-buy">
                <button
                  onClick={() => {
                    g().setPanel(null);
                    g().openDialog("clerk_permit", false, () => g().filePermit(now()));
                  }}
                >
                  Apply for permit
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="card-foot muted">
        <kbd>Esc</kbd> leave
      </div>
    </>
  );
}

// ── Co-op résumés (Ms. Tran's folder) ───────────────────────────────────

function Resumes() {
  const [note, setNote] = useState<string | null>(null);
  const hire = (i: number) => {
    const r = RESUMES[i];
    const g = useGame.getState();
    if (!r.best) {
      setNote(r.note);
      return;
    }
    g.setCoop("hired");
    g.setPanel(null);
    g.toast(`${r.name} is hired! Sam's waiting by the school bus.`);
  };
  return (
    <>
      <div className="card-head">
        <div>
          <div className="eyebrow">Ms. Tran’s co-op folder</div>
          <h2>Pick a student for the panel factory</h2>
        </div>
      </div>
      <p className="muted small">The factory needs someone who’s safety-trained, shows up, and wants to build. Read each résumé, then hire one.</p>
      <div className="resume-grid">
        {RESUMES.map((r, i) => (
          <div key={r.name} className="resume">
            <div className="item-name">{r.name}</div>
            <div className="eyebrow">{r.program}</div>
            <ul>
              {r.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <button className="secondary" onClick={() => hire(i)}>
              Hire
            </button>
          </div>
        ))}
      </div>
      {note && <div className="resume-note">Ms. Tran: “{note}”</div>}
      <div className="card-foot muted">
        <kbd>Esc</kbd> close the folder
      </div>
    </>
  );
}
