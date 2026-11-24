import { create } from "zustand";
import type { StageId } from "@/lib/models/construction";
import type { ModeId } from "./economy";
import { STARTING_STAGES } from "../world/map";
import { DIALOGS, type DialogId } from "./dialogs";
import { BLUEPRINT_VALUE, buy, canBuy, GOAT_VALUE, money, STARTING_OWNED, type GearId, type Owned } from "./economy";
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

interface GameState {
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
    set((s) => ({ cash: s.cash + amount, earned: s.earned + amount }));
    get().toast(`+${money(amount)} · ${why}`, "cash");
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

  buyGear: (id) => {
    const s = get();
    const check = canBuy(s.cash, s.owned, id);
    if (!check.ok) {
      sfx("bad");
      get().toast(check.reason ?? "Can't buy that yet");
      return;
    }
    const next = buy(s.cash, s.owned, id);
    sfx("fanfare");
    set({ cash: next.cash, owned: next.owned });
    get().toast("New gear! Press its number key to use it.");
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
}));

/** Title and chapter of the active mission, for the HUD. */
export function objective(progress: Progress) {
  const m = currentMission(progress);
  const step = currentStep(progress);
  return m && step ? { chapter: m.chapter, title: m.title, text: step.text } : null;
}
