import { describe, expect, it } from "vitest";
import { BLUEPRINTS, GOAT_STARTS, inPen } from "@/game/src/story/collectibles";
import { DIALOGS } from "@/game/src/story/dialogs";
import { BLUEPRINT_VALUE, buy, canBuy, GEAR, GOAT_VALUE, modeForKey, SHOP_ORDER, STARTING_OWNED } from "@/game/src/story/economy";
import { advance, alreadySatisfied, currentStep, MISSIONS, NPC_SPOTS, START, stepTarget, storyComplete, storyEarnings, type Progress } from "@/game/src/story/missions";
import {
  CAIVAN_RIDGE,
  collisionBoxes,
  HERO_LOT_ID,
  lotById,
  PEN,
  POUR_LOT_ID,
  SPAWN,
  STARTING_STAGES,
  SURVEY_LOT_ID,
  WORLD_HALF,
  type Box,
  type V2,
} from "@/game/src/world/map";

const inside = (b: Box, [x, z]: V2, pad = 0) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;
const blocked = (boxes: Box[], p: V2, pad = 0) => boxes.some((b) => inside(b, p, pad));

/** Construction stages after every mission has applied its changes. */
function finalStages() {
  const stages = { ...STARTING_STAGES };
  for (const m of MISSIONS) Object.assign(stages, m.setsStages ?? {});
  return stages;
}

describe("game world", () => {
  it("has the story lots, with the hero home on lot 42 as a Plan 36", () => {
    const hero = lotById(HERO_LOT_ID);
    expect(hero.number).toBe("42");
    expect(lotById(POUR_LOT_ID)).toBeTruthy();
    expect(STARTING_STAGES[HERO_LOT_ID]).toBe("roofing");
    expect(STARTING_STAGES[SURVEY_LOT_ID]).toBe("permits");
    expect(STARTING_STAGES[POUR_LOT_ID]).toBe("excavation");
  });

  it("keeps trees off roads, lots and buildings", () => {
    const boxes = collisionBoxes({});
    for (const t of CAIVAN_RIDGE.trees) expect(blocked(boxes, t.position, 0.5)).toBe(false);
  });

  it("spawns the player in the open, near Maya", () => {
    expect(blocked(collisionBoxes(STARTING_STAGES), SPAWN.position, 1)).toBe(false);
    const [mx, mz] = NPC_SPOTS.maya.position;
    expect(Math.hypot(SPAWN.position[0] - mx, SPAWN.position[1] - mz)).toBeLessThan(12);
  });

  it("puts every NPC and every objective somewhere you can stand, before and after the story", () => {
    for (const stages of [STARTING_STAGES, finalStages()]) {
      const boxes = collisionBoxes(stages);
      for (const npc of Object.values(NPC_SPOTS)) expect(blocked(boxes, npc.position)).toBe(false);
      for (const m of MISSIONS)
        for (const s of m.steps) {
          const [x, z] = stepTarget(s);
          expect(Math.abs(x)).toBeLessThan(WORLD_HALF);
          expect(Math.abs(z)).toBeLessThan(WORLD_HALF);
          if (s.kind !== "talk" && s.kind !== "climb") expect(blocked(boxes, [x, z])).toBe(false);
        }
    }
  });

  it("puts ground-level blueprints and the goats in reachable places", () => {
    const boxes = collisionBoxes(STARTING_STAGES);
    for (const bp of BLUEPRINTS) {
      const [x, y, z] = bp.position;
      if (y < 2) expect(blocked(boxes, [x, z], 0.5)).toBe(false);
    }
    for (const g of GOAT_STARTS) {
      expect(blocked(boxes, g.position, 0.5)).toBe(false);
      expect(inPen(...g.position)).toBe(false);
    }
    expect(inPen(...PEN.centre)).toBe(true);
  });
});

describe("story", () => {
  it("references only dialogs that exist", () => {
    for (const m of MISSIONS) {
      for (const id of [m.intro, m.outro]) if (id) expect(DIALOGS[id]).toBeDefined();
      for (const s of m.steps) if (s.kind === "talk" || s.kind === "inspect") expect(DIALOGS[s.dialog]).toBeDefined();
    }
  });

  it("plays from the first step to the ending, one step at a time", () => {
    let p: Progress = START;
    const finished: string[] = [];
    let guard = 0;
    while (!storyComplete(p) && guard++ < 100) {
      expect(currentStep(p)).not.toBeNull();
      const r = advance(p);
      if (r.finished) finished.push(r.finished.id);
      p = r.progress;
    }
    expect(finished).toEqual(MISSIONS.map((m) => m.id));
    expect(MISSIONS.at(-1)?.ending).toBe(true);
    expect(MISSIONS.filter((m) => m.ending)).toHaveLength(1);
  });

  it("pays enough for the jetpack finale, and the side jobs cover the rest of the garage", () => {
    const allGear = SHOP_ORDER.reduce((a, id) => a + GEAR[id].price, 0);
    expect(storyEarnings(0)).toBeGreaterThanOrEqual(GEAR.jetpack.price);
    expect(storyEarnings(3)).toBeLessThan(allGear);
    expect(storyEarnings(3) + BLUEPRINTS.length * BLUEPRINT_VALUE + GOAT_STARTS.length * GOAT_VALUE).toBeGreaterThanOrEqual(allGear);
  });

  it("skips the 'buy the jetpack' step when you already bought it with side-job money", () => {
    const finale = MISSIONS.findIndex((m) => m.ending);
    const buyStep = currentStep({ mission: finale, step: 0 });
    expect(buyStep?.kind).toBe("own");
    expect(alreadySatisfied(buyStep, STARTING_OWNED)).toBe(false);
    expect(alreadySatisfied(buyStep, { ...STARTING_OWNED, jetpack: true })).toBe(true);
    // Other steps are never auto-completed by owning gear.
    expect(alreadySatisfied(currentStep(START), { truck: true, horse: true, car: true, jetpack: true })).toBe(false);
  });

  it("asks a fair question: one honest answer per choice", () => {
    for (const lines of Object.values(DIALOGS))
      for (const l of lines) if (l.choices) expect(l.choices.filter((c) => c.good)).toHaveLength(1);
  });
});

describe("gear economy", () => {
  it("starts with the truck only", () => {
    expect(modeForKey("1", STARTING_OWNED)).toBe("walk");
    expect(modeForKey("2", STARTING_OWNED)).toBe("truck");
    expect(modeForKey("5", STARTING_OWNED)).toBeNull();
  });

  it("buys gear you can afford, once", () => {
    expect(canBuy(1000, STARTING_OWNED, "horse").ok).toBe(false);
    const after = buy(3200, STARTING_OWNED, "jetpack");
    expect(after.cash).toBe(200);
    expect(after.owned.jetpack).toBe(true);
    expect(modeForKey("5", after.owned)).toBe("jetpack");
    expect(canBuy(10_000, after.owned, "jetpack")).toEqual({ ok: false, reason: "Already yours" });
    expect(buy(200, after.owned, "car")).toEqual(after);
  });
});
