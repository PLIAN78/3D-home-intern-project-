import type { StageId } from "@/lib/models/construction";
import { HERO_LOT_ID, LANDMARKS, lotFront, MODEL_HOME_LOT_ID, onLot, POUR_LOT_ID, SURVEY_LOT_ID, TOWER, type V2 } from "../world/map";
import type { DialogId } from "./dialogs";
import type { GearId, Owned } from "./economy";
import type { VehicleId } from "../sim/vehicle";

/**
 * The story: five jobs that mirror what Caivan's people actually do, then the
 * Grand Opening photo. Missions are data; `advance` moves through them.
 */

export type NpcId = "maya" | "patels" | "raj" | "gail" | "nguyens";

export const NPC_SPOTS: Record<NpcId, { position: V2; facing: number; name: string }> = {
  maya: { position: [-168, 25], facing: -Math.PI / 2, name: "Maya · Project lead" },
  patels: { position: lotFront(MODEL_HOME_LOT_ID, 2.5), facing: Math.PI / 2, name: "The Patels" },
  raj: { position: [236, -42], facing: Math.PI / 2, name: "Raj · Factory foreman" },
  gail: { position: [-318, -100], facing: Math.PI, name: "Gail · Goat farmer" },
  nguyens: { position: lotFront(HERO_LOT_ID, 2.5), facing: Math.PI / 2, name: "The Nguyens" },
};

export const MACHINES: V2[] = [
  [266, -47],
  [281, -47],
  [296, -47],
];

export const SURVEY_STAKES: V2[] = [onLot(SURVEY_LOT_ID, [-5, 10]), onLot(SURVEY_LOT_ID, [5, 10]), onLot(SURVEY_LOT_ID, [0, -6])];

export const POUR_SPOT: V2 = onLot(POUR_LOT_ID, [0, 4]);

export const GEAR_GARAGE: V2 = [-156, 25];

/** Where vehicles wait: the pickup from day one, bought gear is delivered next to it. */
export const VEHICLE_SPOTS: Record<VehicleId | "horse" | "heli", { position: V2; heading: number }> = {
  truck: { position: [-166, 17], heading: -Math.PI / 2 },
  trail: { position: [-182, 17], heading: -Math.PI / 2 },
  hauler: { position: [-190, 17], heading: -Math.PI / 2 },
  // Cars bought at Ridge Motors wait on its forecourt, behind the display row.
  sedan: { position: [176, 30.5], heading: -Math.PI / 2 },
  roadster: { position: [185, 30.5], heading: -Math.PI / 2 },
  suv: { position: [194, 30.5], heading: -Math.PI / 2 },
  car: { position: [203, 30.5], heading: -Math.PI / 2 },
  coupe: { position: [212, 30.5], heading: -Math.PI / 2 },
  super: { position: [221, 30.5], heading: -Math.PI / 2 },
  horse: { position: [-141, 23], heading: Math.PI },
  // The helipad on the lawn west of the Sales Centre.
  heli: { position: [-214, 30], heading: 0 },
};

export type MinigameKind = "timing" | "pour";

export type Step =
  | { kind: "goto"; text: string; at: V2; radius: number }
  | { kind: "talk"; text: string; npc: NpcId; dialog: DialogId }
  | { kind: "inspect"; text: string; at: V2; dialog: DialogId }
  | { kind: "minigame"; text: string; at: V2; game: MinigameKind; title: string }
  | { kind: "own"; text: string; gear: GearId; at: V2 }
  | { kind: "climb"; text: string; at: V2; radius: number; minY: number };

export interface Mission {
  id: string;
  chapter: string;
  title: string;
  /** Paid when the last step is done. */
  reward: number;
  /** Played when the mission starts (phone call), except the first, which you start in person. */
  intro?: DialogId;
  /** Played when the mission is done. */
  outro?: DialogId;
  steps: Step[];
  /** Construction stage changes when the mission completes (lot id → stage). */
  setsStages?: Record<string, StageId>;
  /** Reveal the finished Plan 36 home on the hero lot when the mission starts. */
  revealsHero?: boolean;
  /** Finishing it ends the story (the photo). */
  ending?: boolean;
}

export const MISSIONS: Mission[] = [
  {
    id: "first-day",
    chapter: "Chapter 1",
    title: "First Day on Site",
    reward: 600,
    steps: [
      { kind: "talk", text: "Meet Maya at the Sales Centre", npc: "maya", dialog: "maya_welcome" },
      { kind: "goto", text: "Drive to Lot 113, Ridgeview Crescent", at: lotFront(SURVEY_LOT_ID, 6), radius: 10 },
      { kind: "inspect", text: "Check survey stake 1 of 3", at: SURVEY_STAKES[0], dialog: "stake_1" },
      { kind: "inspect", text: "Check survey stake 2 of 3", at: SURVEY_STAKES[1], dialog: "stake_2" },
      { kind: "inspect", text: "Check survey stake 3 of 3", at: SURVEY_STAKES[2], dialog: "stake_3" },
    ],
  },
  {
    id: "patels",
    chapter: "Chapter 2",
    title: "The Patel Family",
    reward: 900,
    intro: "maya_call_patels",
    steps: [
      { kind: "goto", text: "Visit the model home, Lot 204 on Maple Run", at: lotFront(MODEL_HOME_LOT_ID, 1), radius: 9 },
      { kind: "talk", text: "Answer the Patels' questions", npc: "patels", dialog: "patels_chat" },
    ],
  },
  {
    id: "factory",
    chapter: "Chapter 3",
    title: "Factory Floor",
    reward: 1200,
    intro: "raj_call",
    steps: [
      { kind: "goto", text: "Drive to the Panel Factory (east on Caivan Blvd)", at: [240, -30], radius: 14 },
      { kind: "talk", text: "Talk to Raj, the foreman", npc: "raj", dialog: "raj_brief" },
      { kind: "minigame", text: "Reset panel machine 1 of 3", at: MACHINES[0], game: "timing", title: "Reset machine 1" },
      { kind: "minigame", text: "Reset panel machine 2 of 3", at: MACHINES[1], game: "timing", title: "Reset machine 2" },
      { kind: "minigame", text: "Reset panel machine 3 of 3", at: MACHINES[2], game: "timing", title: "Reset machine 3" },
    ],
  },
  {
    id: "pour",
    chapter: "Chapter 4",
    title: "Pour Day",
    reward: 1500,
    intro: "maya_call_pour",
    outro: "pour_done",
    steps: [
      { kind: "goto", text: "Go to the dig at Lot 207, Maple Run", at: lotFront(POUR_LOT_ID, 2), radius: 10 },
      { kind: "minigame", text: "Pour the foundation", at: POUR_SPOT, game: "pour", title: "Pour the foundation" },
    ],
    setsStages: { [POUR_LOT_ID]: "foundation" },
  },
  {
    id: "opening",
    chapter: "Chapter 5",
    title: "Grand Opening",
    reward: 1000,
    intro: "maya_call_opening",
    revealsHero: true,
    steps: [
      { kind: "goto", text: "Go to Lot 42 on Ridgeview Crescent", at: lotFront(HERO_LOT_ID, 1), radius: 9 },
      { kind: "talk", text: "Hand the Nguyens their keys", npc: "nguyens", dialog: "nguyen_keys" },
    ],
    setsStages: { [HERO_LOT_ID]: "closed" },
  },
  {
    id: "photo",
    chapter: "Finale",
    title: "The Big Picture",
    reward: 0,
    intro: "maya_call_photo",
    ending: true,
    steps: [
      { kind: "own", text: "Buy the SkyHopper jetpack at the Gear Garage", gear: "jetpack", at: GEAR_GARAGE },
      { kind: "climb", text: "Fly to the top of the water tower", at: LANDMARKS.tower.position, radius: TOWER.tankRadius, minY: TOWER.deckY - 0.5 },
    ],
  },
];

export interface Progress {
  mission: number;
  step: number;
}

export const START: Progress = { mission: 0, step: 0 };

export function currentMission(p: Progress): Mission | null {
  return MISSIONS[p.mission] ?? null;
}

export function currentStep(p: Progress): Step | null {
  return currentMission(p)?.steps[p.step] ?? null;
}

/**
 * A step that is already true the moment it comes up, e.g. "buy the jetpack" when you
 * bought it earlier with side-job money. The Director completes these right away.
 */
export function alreadySatisfied(step: Step | null, owned: Owned): boolean {
  return step?.kind === "own" && owned[step.gear];
}

export function storyComplete(p: Progress) {
  return p.mission >= MISSIONS.length;
}

/**
 * Finish the current step. Returns the new progress, and the mission that just
 * finished (if this was its last step) so the caller can pay and play outros.
 */
export function advance(p: Progress): { progress: Progress; finished: Mission | null; started: Mission | null } {
  const mission = currentMission(p);
  if (!mission) return { progress: p, finished: null, started: null };
  if (p.step + 1 < mission.steps.length) return { progress: { mission: p.mission, step: p.step + 1 }, finished: null, started: null };
  const next = { mission: p.mission + 1, step: 0 };
  return { progress: next, finished: mission, started: currentMission(next) };
}

/** Where the objective marker points: the step's spot, or the NPC to talk to. */
export function stepTarget(step: Step): V2 {
  return step.kind === "talk" ? NPC_SPOTS[step.npc].position : step.at;
}

/** Cash available from the story alone (for balancing tests). */
export function storyEarnings(goodAnswers = 0) {
  return MISSIONS.reduce((a, m) => a + m.reward, 0) + goodAnswers * 100;
}
