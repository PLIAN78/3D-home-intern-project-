import { describe, expect, it } from "vitest";
import { BLUEPRINTS, GOAT_STARTS, inPen } from "@/game/src/story/collectibles";
import { DIALOGS } from "@/game/src/story/dialogs";
import { BLUEPRINT_VALUE, buy, canBuy, cheatMatcher, DEALER_ORDER, DELIVERY_BONUS, DELIVERY_PAY, ELEPHANT_REWARD, GEAR, GOAT_VALUE, HOTBAR_ORDER, nextCar, SHOP_ORDER, slotForKey, slotOwned, STARTING_OWNED } from "@/game/src/story/economy";
import { accrue, BANK, borrow, creditLeft, deposit, OPEN_ACCOUNT, repay, splitPay, withdraw } from "@/game/src/story/bank";
import { earnedRank, INGREDIENTS, makeOrder, mathRound, RANKS, rng, SCHEDULE, schedulePay, TRIVIA, triviaRound } from "@/game/src/story/work";
import { PLACE_IDS, PLACES } from "@/game/src/story/places";
import { DESKS, inOffice, MY_SEAT, OFFICE, officeBoxes, STAFF } from "@/game/src/world/office";
import { VEHICLE_IDS } from "@/game/src/sim/vehicle";
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
    // The Gear Garage (horse, jetpack, helicopter) within a handful of delivery runs: a goal, not a grind.
    const runs = Math.ceil((allGear - storyEarnings(3) - collectibles) / (DELIVERY_PAY + DELIVERY_BONUS));
    expect(runs).toBeGreaterThan(0);
    expect(runs).toBeLessThan(25);
  });

  it("skips the 'buy the jetpack' step when you already bought it with side-job money", () => {
    const finale = MISSIONS.findIndex((m) => m.ending);
    const buyStep = currentStep({ mission: finale, step: 0 });
    expect(buyStep?.kind).toBe("own");
    expect(alreadySatisfied(buyStep, STARTING_OWNED)).toBe(false);
    expect(alreadySatisfied(buyStep, { ...STARTING_OWNED, jetpack: true })).toBe(true);
    // Other steps are never auto-completed by owning gear.
    expect(alreadySatisfied(currentStep(START), Object.fromEntries(Object.keys(STARTING_OWNED).map((k) => [k, true])) as typeof STARTING_OWNED)).toBe(false);
  });

  it("asks a fair question: one honest answer per choice", () => {
    for (const lines of Object.values(DIALOGS))
      for (const l of lines) if (l.choices) expect(l.choices.filter((c) => c.good)).toHaveLength(1);
  });
});

describe("gear economy", () => {
  it("starts with the company truck, and the hotbar maps keys 1 to 6", () => {
    expect(slotForKey("1")).toBe("walk");
    expect(slotForKey("2")).toBe("car");
    expect(slotForKey("7")).toBeNull();
    expect(slotOwned("car", STARTING_OWNED)).toBe(true);
    expect(slotOwned("jetpack", STARTING_OWNED)).toBe(false);
    expect(HOTBAR_ORDER).toEqual(["walk", "car", "horse", "jetpack", "heli", "elephant"]);
    HOTBAR_ORDER.forEach((slot, i) => {
      if (slot !== "walk" && slot !== "car") expect(GEAR[slot].key).toBe(String(i + 1));
    });
  });

  it("buys gear you can afford, once", () => {
    expect(canBuy(1000, STARTING_OWNED, "horse").ok).toBe(false);
    const after = buy(3200, STARTING_OWNED, "jetpack");
    expect(after.cash).toBe(200);
    expect(after.owned.jetpack).toBe(true);
    expect(canBuy(10_000, after.owned, "jetpack")).toEqual({ ok: false, reason: "Already yours" });
    expect(buy(200, after.owned, "car")).toEqual(after);
  });

  it("sells cars at Ridge Motors and the rest at the Gear Garage; the elephant is earned", () => {
    expect(DEALER_ORDER.length).toBeGreaterThanOrEqual(8);
    for (const id of DEALER_ORDER) expect(GEAR[id].price).toBeGreaterThan(0);
    for (const id of ["roadster", "coupe", "super", "suv", "sedan", "trail", "hauler", "car"] as const) expect(DEALER_ORDER).toContain(id);
    expect(SHOP_ORDER).toEqual(["horse", "jetpack", "heli"]);
    expect(GEAR.elephant.price).toBeNull();
    expect(canBuy(1e9, STARTING_OWNED, "elephant")).toEqual({ ok: false, reason: "Not for sale" });
  });

  it("cycles through your cars with key 2, company truck first", () => {
    expect(nextCar(STARTING_OWNED, "truck")).toBe("truck");
    const owned = { ...STARTING_OWNED, roadster: true, super: true };
    expect(nextCar(owned, "truck")).toBe("roadster");
    expect(nextCar(owned, "roadster")).toBe("super");
    expect(nextCar(owned, "super")).toBe("truck");
    expect(VEHICLE_IDS[0]).toBe("truck");
  });

  it("the CASH cheat: typing C-A-S-H buys anything without spending", () => {
    const typed = cheatMatcher();
    expect([..."XCAS"].map(typed)).toEqual([false, false, false, false]);
    expect(typed("H")).toBe(true);
    const typed2 = cheatMatcher();
    expect([..."cash"].map(typed2).at(-1)).toBe(true);
    const r = buy(0, STARTING_OWNED, "super", true);
    expect(r.owned.super).toBe(true);
    expect(r.cash).toBe(0);
  });
});

describe("the bank", () => {
  it("deposits, withdraws and pays interest every two minutes of play", () => {
    const d = deposit(1000, OPEN_ACCOUNT, 600);
    expect(d.cash).toBe(400);
    expect(d.account.savings).toBe(600);
    expect(deposit(100, OPEN_ACCOUNT, 500).account.savings).toBe(100);
    expect(accrue(d.account, BANK.period - 1).interest).toBe(0);
    const later = accrue(d.account, BANK.period * 2 + 5);
    const first = 600 + Math.floor(600 * BANK.rate);
    expect(later.account.savings).toBe(first + Math.floor(first * BANK.rate));
    expect(later.account.lastInterest).toBe(BANK.period * 2);
    const w = withdraw(0, later.account, 10_000);
    expect(w.account.savings).toBe(0);
    expect(w.cash).toBe(later.account.savings);
  });

  it("lends up to a limit with a fee, and takes a share of your pay until it's repaid", () => {
    expect(creditLeft(OPEN_ACCOUNT, 0)).toBe(BANK.baseLimit);
    expect(creditLeft(OPEN_ACCOUNT, 1e9)).toBe(BANK.maxLimit);
    const b = borrow(0, OPEN_ACCOUNT, 0, 5000);
    expect(b.borrowed).toBe(BANK.baseLimit);
    expect(b.cash).toBe(BANK.baseLimit);
    expect(b.account.owed).toBe(Math.round(BANK.baseLimit * (1 + BANK.fee)));
    const p = splitPay(b.account, 1000);
    expect(p.toLoan).toBe(Math.round(1000 * BANK.autoRepay));
    expect(p.toWallet + p.toLoan).toBe(1000);
    const r = repay(10_000, p.account, 1e9);
    expect(r.account.owed).toBe(0);
    expect(splitPay(r.account, 500).toLoan).toBe(0);
  });
});

describe("work: the office and restaurant shifts", () => {
  it("generates estimating questions whose marked answer is the right one", () => {
    for (let seed = 1; seed < 40; seed++)
      for (const q of mathRound(seed)) {
        expect(q.choices).toHaveLength(4);
        expect(new Set(q.choices).size).toBe(4);
        // The explanation ends with the right answer, and that's the marked choice.
        const right = q.choices[q.answer].replace(/[^0-9.]/g, "");
        expect(q.explain.replace(/,/g, "")).toContain(right);
      }
    expect(mathRound(7)).toEqual(mathRound(7));
  });

  it("asks trivia with four distinct choices and keeps the right answer when shuffling", () => {
    for (const q of TRIVIA) {
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices).size).toBe(4);
    }
    const round = triviaRound(3);
    expect(round).toHaveLength(6);
    for (const q of round) {
      const original = TRIVIA.find((t) => t.prompt === q.prompt)!;
      expect(q.choices[q.answer]).toBe(original.choices[original.answer]);
    }
  });

  it("pays the schedule puzzle less for mistakes, never below the minimum, and promotes with tasks", () => {
    expect(SCHEDULE[0]).toBe("Permits");
    expect(SCHEDULE.indexOf("Foundation")).toBeLessThan(SCHEDULE.indexOf("Framing"));
    expect(SCHEDULE.indexOf("Insulation")).toBeLessThan(SCHEDULE.indexOf("Drywall"));
    expect(schedulePay(0)).toBeGreaterThan(schedulePay(2));
    expect(schedulePay(99)).toBeGreaterThan(0);
    expect(schedulePay(0, 2)).toBe(schedulePay(0) * 2);
    expect(earnedRank(0)).toBe(0);
    expect(earnedRank(RANKS[2].tasks)).toBe(2);
    expect(earnedRank(1000)).toBe(RANKS.length - 1);
  });

  it("makes restaurant orders from real ingredients, base first", () => {
    const r = rng(11);
    for (let i = 0; i < 30; i++) {
      for (const kitchen of ["subs", "burger"] as const) {
        const o = makeOrder(kitchen, r);
        const ids = INGREDIENTS[kitchen].map((x) => x.id);
        for (const id of o.items) expect(ids).toContain(id);
        expect(new Set(o.items).size).toBe(o.items.length);
        expect(kitchen === "subs" ? ["white", "wheat"] : ["bun"]).toContain(o.items[0]);
      }
    }
  });
});

describe("the new places", () => {
  it("has a walkable door at every shop, clear of buildings and parked cars", () => {
    const boxes = collisionBoxes(STARTING_STAGES);
    for (const id of PLACE_IDS) expect(blocked(boxes, PLACES[id].door, 0.6)).toBe(false);
  });

  it("lets you walk into the office: a door gap, your desk reachable, staff not inside furniture", () => {
    const low = officeBoxes().filter((b) => (b.y ?? 0) < 2);
    const doorway: V2 = [OFFICE.centre[0], OFFICE.centre[1] + OFFICE.d / 2 - 0.15];
    expect(blocked(low, doorway, 0.5)).toBe(false);
    expect(inOffice(...MY_SEAT.at)).toBe(true);
    expect(blocked(low, MY_SEAT.at, 0.3)).toBe(false);
    for (const st of Object.values(STAFF)) expect(blocked(low, st.at, 0.25)).toBe(false);
    expect(DESKS.length).toBeGreaterThanOrEqual(6);
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
