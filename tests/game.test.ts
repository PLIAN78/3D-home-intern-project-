import { describe, expect, it } from "vitest";
import { BLUEPRINTS, GOAT_STARTS, inPen } from "@/game/src/story/collectibles";
import { DIALOGS } from "@/game/src/story/dialogs";
import { BLUEPRINT_VALUE, buy, canBuy, DELIVERY_BONUS, DELIVERY_PAY, ELEPHANT_REWARD, GEAR, GOAT_VALUE, HOTBAR_ORDER, modeForKey, SHOP_ORDER, STARTING_OWNED } from "@/game/src/story/economy";
import { DEPOT, deliveryLimit, DROPS, ELEPHANT_SEARCH, ELEPHANT_SPOT, nextDrop, ROSA } from "@/game/src/story/sidequests";
import { COTTAGE, HILL_ROAD, HILL_ROAD_LENGTH, nearestOnRoad, PLAY_HALF, roadHeightAt, roadPointAt, terrainHeight } from "@/game/src/world/terrain";
import { isOpenGround, LANDMARKS, PAVED, streetLights, TRAFFIC_LOOPS, WALK_LOOPS } from "@/game/src/world/map";
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
    const allGear = SHOP_ORDER.reduce((a, id) => a + (GEAR[id].price ?? 0), 0);
    expect(storyEarnings(0)).toBeGreaterThanOrEqual(GEAR.jetpack.price!);
    expect(storyEarnings(3)).toBeLessThan(allGear);
    const collectibles = BLUEPRINTS.length * BLUEPRINT_VALUE + GOAT_STARTS.length * GOAT_VALUE + ELEPHANT_REWARD;
    // Everything in the garage within a couple of dozen delivery runs, so the helicopter is a goal, not a grind.
    const runs = Math.ceil((allGear - storyEarnings(3) - collectibles) / (DELIVERY_PAY + DELIVERY_BONUS));
    expect(runs).toBeGreaterThan(5);
    expect(runs).toBeLessThan(25);
  });

  it("skips the 'buy the jetpack' step when you already bought it with side-job money", () => {
    const finale = MISSIONS.findIndex((m) => m.ending);
    const buyStep = currentStep({ mission: finale, step: 0 });
    expect(buyStep?.kind).toBe("own");
    expect(alreadySatisfied(buyStep, STARTING_OWNED)).toBe(false);
    expect(alreadySatisfied(buyStep, { ...STARTING_OWNED, jetpack: true })).toBe(true);
    // Other steps are never auto-completed by owning gear.
    expect(alreadySatisfied(currentStep(START), { truck: true, horse: true, car: true, jetpack: true, heli: true, trail: true, hauler: true, elephant: true })).toBe(false);
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

  it("sells the helicopter and both new pickups, but the elephant is earned, not bought", () => {
    for (const id of ["heli", "trail", "hauler"] as const) {
      expect(SHOP_ORDER).toContain(id);
      expect(GEAR[id].price).toBeGreaterThan(0);
    }
    expect(SHOP_ORDER).not.toContain("elephant");
    expect(GEAR.elephant.price).toBeNull();
    expect(canBuy(1e9, STARTING_OWNED, "elephant")).toEqual({ ok: false, reason: "Not for sale" });
    expect(buy(1e9, STARTING_OWNED, "elephant").owned.elephant).toBe(false);
  });

  it("gives every piece of gear its own hotbar key, 1 to 9 in order", () => {
    expect(HOTBAR_ORDER).toHaveLength(9);
    expect(new Set(HOTBAR_ORDER).size).toBe(9);
    HOTBAR_ORDER.forEach((mode, i) => {
      if (mode !== "walk") expect(GEAR[mode].key).toBe(String(i + 1));
    });
    expect(modeForKey("9", { ...STARTING_OWNED, elephant: true })).toBe("elephant");
  });
});

describe("the bigger community", () => {
  it("puts the shop, school and mall on Market Street, clear of every home", () => {
    const boxes = collisionBoxes(STARTING_STAGES).filter((b) => b.kind !== "landmark");
    for (const id of ["shop", "school", "mall"] as const) {
      const m = LANDMARKS[id];
      expect(Math.abs(m.position[1] - 300)).toBeLessThan(m.size[1] / 2 + 60);
      const [w, d] = m.size;
      const box = { x0: m.position[0] - w / 2, z0: m.position[1] - d / 2, x1: m.position[0] + w / 2, z1: m.position[1] + d / 2, h: 1 };
      expect(boxes.some((b) => b.x0 < box.x1 && b.x1 > box.x0 && b.z0 < box.z1 && b.z1 > box.z0)).toBe(false);
    }
  });

  it("keeps parking lots and the school field clear of trees", () => {
    for (const t of CAIVAN_RIDGE.trees) for (const p of PAVED) expect(t.position[0] > p.x0 && t.position[0] < p.x1 && t.position[1] > p.z0 && t.position[1] < p.z1).toBe(false);
    expect(isOpenGround(LANDMARKS.mall.position[0], LANDMARKS.mall.position[1], CAIVAN_RIDGE.lots)).toBe(false);
  });

  it("lines the streets with lights, off the road and away from junctions", () => {
    const lights = streetLights();
    expect(lights.length).toBeGreaterThan(60);
    for (const l of lights) {
      for (const r of CAIVAN_RIDGE.roads) {
        const [ax, az] = r.from;
        const [bx, bz] = r.to;
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((l.x - ax) * dx + (l.z - az) * dz) / (dx * dx + dz * dz)));
        expect(Math.hypot(l.x - (ax + dx * t), l.z - (az + dz * t))).toBeGreaterThan(r.width / 2);
      }
    }
  });

  it("drives traffic on real roads and walks pedestrians on sidewalks", () => {
    const onRoad = ([x, z]: V2) =>
      CAIVAN_RIDGE.roads.some((r) => {
        const [ax, az] = r.from;
        const [bx, bz] = r.to;
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        return Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < 0.5;
      });
    for (const loop of TRAFFIC_LOOPS) for (const p of loop) expect(onRoad(p)).toBe(true);
    for (const loop of WALK_LOOPS) for (const [x, z] of loop) expect(blocked(collisionBoxes(STARTING_STAGES), [x, z])).toBe(false);
  });
});

describe("the hills, the cottage and Peanut", () => {
  it("is flat in town and rises into hills beyond", () => {
    expect(terrainHeight(0, 0)).toBe(0);
    expect(terrainHeight(400, -400)).toBe(0);
    let high = 0;
    for (let x = -PLAY_HALF; x <= PLAY_HALF; x += 50) high = Math.max(high, terrainHeight(x, PLAY_HALF - 20));
    expect(high).toBeGreaterThan(30);
  });

  it("carves a drivable road from Market Street up to the cottage", () => {
    expect(HILL_ROAD[0]).toEqual([-230, 300]);
    expect(roadHeightAt(0)).toBe(0);
    let prev = 0;
    for (let s = 3; s < HILL_ROAD_LENGTH; s += 3) {
      const h = roadHeightAt(s);
      expect(Math.abs(h - prev) / 3).toBeLessThan(0.13);
      prev = h;
      const p = roadPointAt(s);
      // The ground on the road is the road.
      expect(Math.abs(terrainHeight(p.x, p.z) - h)).toBeLessThan(0.5);
    }
    const [cx, cz] = COTTAGE.position;
    expect(terrainHeight(cx, cz)).toBeGreaterThan(20);
    expect(nearestOnRoad(cx, cz).d).toBeLessThan(30);
  });

  it("puts Rosa by her cottage and Peanut inside the search circle, but not at its centre", () => {
    expect(Math.hypot(ROSA.position[0] - COTTAGE.position[0], ROSA.position[1] - COTTAGE.position[1])).toBeLessThan(12);
    const d = Math.hypot(ELEPHANT_SPOT[0] - ELEPHANT_SEARCH.centre[0], ELEPHANT_SPOT[1] - ELEPHANT_SEARCH.centre[1]);
    expect(d).toBeLessThan(ELEPHANT_SEARCH.radius * 0.8);
    expect(d).toBeGreaterThan(20);
    expect(Math.abs(ELEPHANT_SPOT[0])).toBeLessThan(PLAY_HALF - 40);
  });
});

describe("delivery runs", () => {
  it("cycles through drops in town with a fair time limit", () => {
    expect(DROPS.length).toBeGreaterThan(4);
    expect(nextDrop(0)).toBe(DROPS[0]);
    expect(nextDrop(DROPS.length)).toBe(DROPS[0]);
    for (const d of DROPS) {
      const dist = Math.hypot(d.at[0] - DEPOT[0], d.at[1] - DEPOT[1]);
      expect(dist).toBeGreaterThan(100);
      // Even at a relaxed pace (about 40 km/h), you make it in time.
      expect(deliveryLimit(d)).toBeGreaterThan(dist / 11);
    }
  });
});
