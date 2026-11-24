import { create } from "zustand";
import type { StageId } from "@/lib/models/construction";
import type { ModeId } from "./economy";
import { STARTING_STAGES } from "../world/map";
import { DIALOGS, type DialogId } from "./dialogs";
import { BLUEPRINT_VALUE, buy, canBuy, DELIVERY_BONUS, DELIVERY_PAY, ELEPHANT_REWARD, GEAR, GOAT_VALUE, isVehicle, money, STARTING_OWNED, type GearId, type Owned } from "./economy";
import { accrue, borrow, deposit, OPEN_ACCOUNT, repay, splitPay, withdraw, type Account } from "./bank";
import { BOOST_SECONDS, earnedRank, MEALS, RANKS, type BoostKind, type Kitchen } from "./work";
import type { PlaceId } from "./places";
import type { StaffId } from "../world/office";
import type { VehicleId } from "../sim/vehicle";
import { OUTFITS, type Outfit } from "../models/human";
import { deliveryLimit, nextDrop, type Delivery, type ElephantQuest } from "./sidequests";
import { advance, currentMission, currentStep, START, type MinigameKind, type Progress } from "./missions";
import { resetRuntime } from "../core/runtime";
import { sfx } from "../core/sfx";

export type Phase = "title" | "playing" | "ending";

export interface Toast {
  id: number;
  text: string;
  tone: "cash" | "info";
}

interface DialogState {
  id: DialogId;
  line: number;
  /** Reply shown after a choice, before moving on. */
  reply: string | null;
  good: number;
  /** Advance the mission when the dialog closes. */
  completesStep: boolean;
}

/** A full-screen panel: one of the town's places, or your desk at the office. */
export type PanelId = PlaceId | "desk";

export type JobKind = "math" | "trivia" | "schedule" | "orders";

export interface Job {
  kind: JobKind;
  kitchen?: Kitchen;
  seed: number;
}

export interface GameState {
  phase: Phase;
  cash: number;
  earned: number;
  owned: Owned;
  mode: ModeId;
  progress: Progress;
  stages: Record<string, StageId>;
  heroRevealed: boolean;
  blueprints: string[];
  goatsHome: string[];
  metGail: boolean;
  dialog: DialogState | null;
  minigame: { kind: MinigameKind; title: string } | null;
  shopOpen: boolean;
  /** Full-screen map (M). */
  mapOpen: boolean;
  /** Rosa's lost elephant. */
  elephant: ElephantQuest;
  /** The delivery run in progress, if any, and how many are done. */
  delivery: Delivery | null;
  deliveries: number;
  /** Your selected car (key 2). */
  car: VehicleId;
  /** The CASH cheat. */
  unlimited: boolean;
  account: Account;
  outfit: Outfit;
  boost: { kind: BoostKind; until: number } | null;
  panel: PanelId | null;
  job: Job | null;
  /** Office career: finished tasks, current rank, staff you've met. */
  office: { tasks: number; rank: number; met: StaffId[] };
  prompt: string | null;
  toasts: Toast[];
  showHelp: boolean;

  start: () => void;
  setMode: (mode: ModeId) => void;
  pay: (amount: number, why: string) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  openDialog: (id: DialogId, completesStep?: boolean) => void;
  nextLine: () => void;
  choose: (index: number) => void;
  completeStep: () => void;
  openMinigame: (kind: MinigameKind, title: string) => void;
  finishMinigame: (success: boolean) => void;
  setShop: (open: boolean) => void;
  setMap: (open: boolean) => void;
  toggleMap: () => void;
  askAboutElephant: () => void;
  findElephant: () => void;
  startDelivery: (now: number) => void;
  finishDelivery: (now: number) => void;
  cancelDelivery: () => void;
  selectCar: (id: VehicleId) => void;
  toggleCheat: () => void;
  setPanel: (panel: PanelId | null) => void;
  startJob: (kind: JobKind, kitchen?: Kitchen) => void;
  /** Ends a job; pays (already scaled) and counts office tasks. */
  finishJob: (pay: number, why: string, done?: boolean) => void;
  bankDeposit: (amount: number) => void;
  bankWithdraw: (amount: number) => void;
  bankBorrow: (amount: number) => void;
  bankRepay: (amount: number) => void;
  tickBank: (now: number) => void;
  buyMeal: (kitchen: Kitchen, now: number) => void;
  tickBoost: (now: number) => void;
  setOutfit: (outfit: Outfit, cost: number) => void;
  meetStaff: (id: StaffId) => void;
  /** Talk to the manager: promotes you if you've earned it. Returns true if promoted. */
  promote: () => boolean;
  /** Spend money (respects the cheat). Returns false if you can't afford it. */
  spend: (amount: number) => boolean;
  buyGear: (id: GearId) => void;
  collectBlueprint: (id: string) => void;
  goatHome: (id: string) => void;
  meetGail: () => void;
  setPrompt: (text: string | null) => void;
  toggleHelp: () => void;
  keepExploring: () => void;
}

let toastId = 0;

const initial = () => ({
  phase: "title" as Phase,
  cash: 0,
  earned: 0,
  owned: { ...STARTING_OWNED },
  mode: "walk" as ModeId,
  progress: { ...START },
  stages: { ...STARTING_STAGES },
  heroRevealed: false,
  blueprints: [] as string[],
  goatsHome: [] as string[],
  metGail: false,
  dialog: null,
  minigame: null,
  shopOpen: false,
  mapOpen: false,
  elephant: "none" as ElephantQuest,
  delivery: null as Delivery | null,
  deliveries: 0,
  car: "truck" as VehicleId,
  unlimited: false,
  account: { ...OPEN_ACCOUNT },
  outfit: { ...OUTFITS.player } as Outfit,
  boost: null as { kind: BoostKind; until: number } | null,
  panel: null as PanelId | null,
  job: null as Job | null,
  office: { tasks: 0, rank: 0, met: [] as StaffId[] },
  prompt: null,
  toasts: [] as Toast[],
  showHelp: true,
});

export const useGame = create<GameState>((set, get) => ({
  ...initial(),

  start: () => {
    resetRuntime();
    set({ ...initial(), phase: "playing" });
  },

  setMode: (mode) => {
    if (get().mode === mode) return;
    sfx("switch");
    set({ mode });
  },

  pay: (amount, why) => {
    if (amount <= 0) return;
    sfx("cash");
    // Part of every payment repays the loan, if you have one.
    const { toWallet, toLoan, account } = splitPay(get().account, amount);
    set((s) => ({ cash: s.cash + toWallet, earned: s.earned + amount, account }));
    get().toast(`+${money(amount)} · ${why}${toLoan > 0 ? ` (${money(toLoan)} to your loan)` : ""}`, "cash");
  },

  toast: (text, tone = "info") => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3800);
  },

  openDialog: (id, completesStep = false) => {
    sfx("blip");
    set({ dialog: { id, line: 0, reply: null, good: 0, completesStep }, prompt: null });
  },

  nextLine: () => {
    const d = get().dialog;
    if (!d) return;
    const lines = DIALOGS[d.id];
    if (lines[d.line]?.choices && d.reply === null) return; // must choose first
    if (d.line + 1 < lines.length) {
      sfx("blip");
      set({ dialog: { ...d, line: d.line + 1, reply: null } });
      return;
    }
    set({ dialog: null });
    if (d.good > 0) get().pay(d.good * 100, d.good === 1 ? "1 helpful answer" : `${d.good} helpful answers`);
    if (d.completesStep) get().completeStep();
  },

  choose: (index) => {
    const d = get().dialog;
    if (!d || d.reply !== null) return;
    const choice = DIALOGS[d.id][d.line]?.choices?.[index];
    if (!choice) return;
    sfx(choice.good ? "good" : "bad");
    set({ dialog: { ...d, reply: choice.reply, good: d.good + (choice.good ? 1 : 0) } });
  },

  completeStep: () => {
    const { progress } = get();
    if (!currentStep(progress)) return;
    const { progress: next, finished, started } = advance(progress);
    set({ progress: next });
    if (!finished) {
      sfx("step");
      return;
    }
    if (finished.setsStages) set((s) => ({ stages: { ...s.stages, ...finished.setsStages } }));
    get().pay(finished.reward, finished.title);
    if (finished.ending) {
      sfx("fanfare");
      set({ phase: "ending" });
      return;
    }
    sfx("fanfare");
    get().toast(`${finished.chapter} complete: ${finished.title}`);
    const after = () => {
      if (!started) return;
      if (started.revealsHero) set({ heroRevealed: true });
      if (started.intro) get().openDialog(started.intro);
    };
    if (finished.outro) {
      get().openDialog(finished.outro);
      // Queue the next mission's call for when the outro closes.
      const unsub = useGame.subscribe((s) => {
        if (s.dialog === null) {
          unsub();
          setTimeout(after, 600);
        }
      });
    } else {
      setTimeout(after, 1200);
    }
  },

  openMinigame: (kind, title) => set({ minigame: { kind, title }, prompt: null }),

  finishMinigame: (success) => {
    set({ minigame: null });
    if (success) get().completeStep();
  },

  setShop: (open) => set({ shopOpen: open, prompt: open ? null : get().prompt }),

  setMap: (open) => set({ mapOpen: open }),
  toggleMap: () => set((s) => ({ mapOpen: !s.mapOpen })),

  askAboutElephant: () => {
    if (get().elephant === "none") set({ elephant: "asked" });
    get().openDialog(get().elephant === "found" ? "rosa_thanks" : "rosa_elephant");
  },

  findElephant: () => {
    if (get().elephant === "found") return;
    sfx("fanfare");
    set((s) => ({ elephant: "found", owned: { ...s.owned, elephant: true } }));
    get().pay(ELEPHANT_REWARD, "Found Peanut for Rosa");
    get().toast(`${GEAR.elephant.name} is yours to ride. Press ${GEAR.elephant.key} to call her.`);
  },

  startDelivery: (now) => {
    if (get().delivery) return;
    const drop = nextDrop(get().deliveries);
    sfx("pickup");
    set({ delivery: { drop, started: now, limit: deliveryLimit(drop) } });
    get().toast(`Panels loaded. Deliver to ${drop.label} within ${deliveryLimit(drop)} s for a bonus.`);
  },

  finishDelivery: (now) => {
    const d = get().delivery;
    if (!d) return;
    const onTime = now - d.started <= d.limit;
    set((s) => ({ delivery: null, deliveries: s.deliveries + 1 }));
    get().pay(DELIVERY_PAY + (onTime ? DELIVERY_BONUS : 0), onTime ? "Delivery, on time" : "Delivery");
  },

  cancelDelivery: () => {
    if (!get().delivery) return;
    set({ delivery: null });
    get().toast("Delivery cancelled. The panels went back to the factory.");
  },

  buyGear: (id) => {
    const s = get();
    const check = canBuy(s.cash, s.owned, id, s.unlimited);
    if (!check.ok) {
      sfx("bad");
      get().toast(check.reason ?? "Can't buy that yet");
      return;
    }
    const next = buy(s.cash, s.owned, id, s.unlimited);
    sfx("fanfare");
    set({ cash: next.cash, owned: next.owned, ...(isVehicle(id) ? { car: id } : {}) });
    get().toast(isVehicle(id) ? `${GEAR[id].name} bought. It's waiting on the Ridge Motors forecourt; press 2 to drive it.` : `${GEAR[id].name} bought. Press ${GEAR[id].key} to use it.`);
    // "Buy the jetpack" story step completes itself.
    const step = currentStep(get().progress);
    if (step?.kind === "own" && step.gear === id) get().completeStep();
  },

  collectBlueprint: (id) => {
    if (get().blueprints.includes(id)) return;
    set((s) => ({ blueprints: [...s.blueprints, id] }));
    get().pay(BLUEPRINT_VALUE, "Lost blueprint found");
  },

  goatHome: (id) => {
    if (get().goatsHome.includes(id)) return;
    set((s) => ({ goatsHome: [...s.goatsHome, id] }));
    get().pay(GOAT_VALUE, "Goat returned to Gail");
  },

  meetGail: () => set({ metGail: true }),

  setPrompt: (text) => {
    if (get().prompt !== text) set({ prompt: text });
  },

  toggleHelp: () => set((s) => ({ showHelp: !s.showHelp })),

  keepExploring: () => set({ phase: "playing" }),

  selectCar: (id) => set({ car: id }),

  toggleCheat: () => {
    const on = !get().unlimited;
    set({ unlimited: on });
    sfx(on ? "fanfare" : "switch");
    get().toast(on ? "Cheat on: unlimited money." : "Cheat off.");
  },

  spend: (amount) => {
    const s = get();
    if (s.unlimited) return true;
    if (s.cash < amount) {
      sfx("bad");
      get().toast(`You need ${money(amount - s.cash)} more`);
      return false;
    }
    set({ cash: s.cash - amount });
    return true;
  },

  setPanel: (panel) => set({ panel, prompt: null }),

  startJob: (kind, kitchen) => set({ job: { kind, kitchen, seed: Math.floor(Math.random() * 1e9) } }),

  finishJob: (amount, why, done = true) => {
    const job = get().job;
    set({ job: null });
    if (!job) return;
    if (done && job.kind !== "orders") set((s) => ({ office: { ...s.office, tasks: s.office.tasks + 1 } }));
    if (amount > 0) get().pay(amount, why);
    const o = get().office;
    if (job.kind !== "orders" && earnedRank(o.tasks) > o.rank) get().toast("You've earned a promotion. Go and see Daniel.");
  },

  bankDeposit: (amount) => {
    const s = get();
    const r = deposit(s.unlimited ? Math.max(s.cash, amount) : s.cash, s.account, amount);
    set({ cash: s.unlimited ? s.cash : r.cash, account: r.account });
    sfx("blip");
  },
  bankWithdraw: (amount) => {
    const s = get();
    const r = withdraw(s.cash, s.account, amount);
    set({ cash: r.cash, account: r.account });
    sfx("cash");
  },
  bankBorrow: (amount) => {
    const s = get();
    const r = borrow(s.cash, s.account, s.earned, amount);
    if (r.borrowed <= 0) {
      sfx("bad");
      get().toast("The bank can't lend you more yet. Earn more, or pay down your loan.");
      return;
    }
    set({ cash: r.cash, account: r.account });
    sfx("cash");
    get().toast(`Borrowed ${money(r.borrowed)}. You owe ${money(r.account.owed)}.`);
  },
  bankRepay: (amount) => {
    const s = get();
    const r = repay(s.unlimited ? Math.max(s.cash, amount) : s.cash, s.account, amount);
    set({ cash: s.unlimited ? s.cash : r.cash, account: r.account });
    sfx("blip");
    if (r.account.owed === 0 && s.account.owed > 0) get().toast("Loan paid off.");
  },
  tickBank: (now) => {
    const { account, interest } = accrue(get().account, now);
    if (account === get().account) return;
    set({ account });
    if (interest > 0) get().toast(`Savings interest +${money(interest)}`, "cash");
  },

  buyMeal: (kitchen, now) => {
    const meal = MEALS[kitchen];
    if (!get().spend(meal.price)) return;
    sfx("pickup");
    set({ boost: { kind: meal.boost, until: now + BOOST_SECONDS } });
    get().toast(`${meal.name}: ${meal.blurb}`);
  },
  tickBoost: (now) => {
    const b = get().boost;
    if (b && now >= b.until) {
      set({ boost: null });
      get().toast(b.kind === "run" ? "Your energy boost has worn off." : "Your jetpack boost has worn off.");
    }
  },

  setOutfit: (outfit, cost) => {
    if (cost > 0 && !get().spend(cost)) return;
    set({ outfit });
    sfx("fanfare");
    get().toast(cost > 0 ? `New look: ${money(cost)}. Looking sharp.` : "New look saved.");
  },

  meetStaff: (id) => {
    if (get().office.met.includes(id)) return;
    set((s) => ({ office: { ...s.office, met: [...s.office.met, id] } }));
  },

  promote: () => {
    const o = get().office;
    const next = earnedRank(o.tasks);
    if (next <= o.rank) return false;
    set({ office: { ...o, rank: next } });
    sfx("fanfare");
    get().toast(`Promoted to ${RANKS[next].title}. Desk work now pays ×${RANKS[next].pay}.`);
    return true;
  },
}));

/** Title and chapter of the active mission, for the HUD. */
export function objective(progress: Progress) {
  const m = currentMission(progress);
  const step = currentStep(progress);
  return m && step ? { chapter: m.chapter, title: m.title, text: step.text } : null;
}
