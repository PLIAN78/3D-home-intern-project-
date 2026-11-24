import type { DialogId } from "./dialogs";
import type { Outfit } from "../models/human";
import type { GameState } from "./store";
import { CRANES, FOREMAN, lotFront, SCHOOL_BUS, STARTING_STAGES, type V2 } from "../world/map";
import { ELIAS, TACKLE_BOX, TACKLE_SEARCH } from "../world/lake";
import { CITY_HALL_DOOR } from "../world/owawa";
import { DEPOT } from "./sidequests";

/**
 * Where the v5 side quests happen: Elias on the island, the co-op hire at the
 * school, the crane crews in the east phase and your land in Owawa. Positions
 * and the map markers; the rules are in Director.tsx.
 */

/** Ms. Tran waits at the edge of the school parking lot, by the bus. */
export const TRAN = { at: [-96, 326.5] as V2, facing: 0, name: "Ms. Tran · Co-op counsellor" };
/** Sam waits at the bus door (front right of the bus, which parks facing east). */
export const SAM_WAIT = { at: [SCHOOL_BUS.x + 3.2, SCHOOL_BUS.z + 2.6] as V2, facing: -Math.PI / 2 };
/** Sam, the co-op student: waits by the bus, then rides in it. */
export const SAM_LOOK: Outfit = { skin: "#6e4630", shirt: "#2f6f4f", pants: "#30343c", shoes: "#1f1f22", hair: "#0f0c0a", vest: "#f2b707", scale: 0.92 };
/** Marco, the east phase's site foreman. */
export const MARCO = { at: FOREMAN.at, facing: FOREMAN.facing, name: "Marco · Site foreman" };

/** How close you have to be to start a crane job (from the mast's centre). */
export const CRANE_REACH = 4;
/** How close the boat has to come to Elias's floating tackle box. */
export const TACKLE_REACH = 5;

/** Crew members at work on framing lots in the east phase (three of them chat). */
export const CREW: { at: V2; facing: number; dialog: DialogId | null; tool: "hammer" | "plank" | "none" }[] = (() => {
  const framing = Object.entries(STARTING_STAGES)
    .filter(([id, st]) => st === "framing" && Number(id.slice(4)) >= 224 && Number(id.slice(4)) < 300)
    .map(([id]) => id);
  const birch = Object.entries(STARTING_STAGES)
    .filter(([id, st]) => (st === "framing" || st === "roofing") && Number(id.slice(4)) >= 324)
    .map(([id]) => id);
  const lots = [...framing.slice(0, 5), ...birch.slice(0, 5)];
  const dialogs: (DialogId | null)[] = ["crew_1", null, "crew_2", null, null, "crew_3", null, null, null, null];
  const tools = ["hammer", "plank", "none"] as const;
  return lots.map((id, i) => {
    const [x, z] = lotFront(id, 1.6 + (i % 3) * 0.6);
    return { at: [x + ((i % 2) * 2 - 1) * 2.2, z] as V2, facing: (i * 1.7) % (Math.PI * 2), dialog: dialogs[i] ?? null, tool: tools[i % 3] };
  });
})();

export interface ActiveQuest {
  /** Short name for the map. */
  label: string;
  /** What to do next, for the HUD. */
  text: string;
  at: V2;
}

type QuestState = Pick<GameState, "elias" | "coop" | "land">;

/** Every started side quest: what to do next and where. */
export function activeQuests(g: QuestState): ActiveQuest[] {
  const out: ActiveQuest[] = [];
  if (g.elias === "asked") out.push({ label: "Tackle box", text: "Find Elias's tackle box by boat (west shore of Heron Lake)", at: TACKLE_SEARCH.centre });
  if (g.elias === "found") out.push({ label: "Elias", text: "Take the tackle box back to Elias on the island", at: ELIAS.at });
  if (g.coop === "reviewing") out.push({ label: "Ms. Tran", text: "Pick a co-op student with Ms. Tran at the school", at: TRAN.at });
  if (g.coop === "hired") out.push({ label: "School bus", text: "Drive the school bus to take Sam to the factory", at: [SCHOOL_BUS.x, SCHOOL_BUS.z] });
  if (g.coop === "riding") out.push({ label: "Factory dock", text: "Drive Sam to Raj at the factory dock", at: DEPOT });
  if (g.land.step === "bought" && g.land.lot) out.push({ label: "Your parcel", text: "Walk your parcel to survey it", at: lotFront(g.land.lot) });
  if (g.land.step === "surveyed") out.push({ label: "City Hall", text: "Get your building permit at Owawa City Hall", at: CITY_HALL_DOOR });
  if (g.land.step === "building" && g.land.lot) out.push({ label: "Your house", text: `Your house is going up: stage ${g.land.stage + 1} of 6`, at: lotFront(g.land.lot) });
  return out;
}

/** Tackle box: where it floats (it drifts on the waves a little). */
export function tackleAt(time: number): V2 {
  return [TACKLE_BOX[0] + Math.sin(time * 0.3) * 1.2, TACKLE_BOX[1] + Math.cos(time * 0.23) * 1.2];
}

export { CRANES, ELIAS, TACKLE_BOX };
