import { bayDistance, BAY_SHORE } from "../game/src/world/bay";
import { inRiver,riverZ,riverWidth } from "../game/src/world/v6";
import { beforeAll, describe, expect, it } from "vitest";
import { loadRapier } from "@/game/src/sim/rapier";
import { IDLE_INPUT, Simulation, type SimInput } from "@/game/src/sim/simulation";
import { DIALOGS } from "@/game/src/story/dialogs";
import { PLACES } from "@/game/src/story/places";
import { activeQuests, CREW, MARCO, SAM_WAIT, TACKLE_REACH, tackleAt, TRAN } from "@/game/src/story/quests";
import { LAND_STAGE_SECONDS, LAND_STAGES, PARCEL_PRICES, RENT, RENT_SECONDS, RESUMES } from "@/game/src/story/work";
import { useGame } from "@/game/src/story/store";
import { BOAT_SPOT, DECK_Y, deckAt, ELIAS, JETTIES, TACKLE_BOX, TACKLE_SEARCH } from "@/game/src/world/lake";
import { CITY_BUILDINGS, CITY_HALL_DOOR, CITY_TRAFFIC, CITY_TREES, CITY_WALKS, OWAWA_ROADS, owawaBoxes, SHAWARMA_DOOR } from "@/game/src/world/owawa";
import { CAIVAN_RIDGE, collisionBoxes, CRANES, lotById, PARCELS, SCHOOL_BUS, STARTING_STAGES, streetLights, type Box, type V2 } from "@/game/src/world/map";
import { CITY_Y, COUNTRY_ROADS, groundAt, HILL_TREES, LAKE, LAKE_ROAD, LAKE_Y, lakeRadius, OWAWA_ROAD, terrainHeight } from "@/game/src/world/terrain";

const inside = (b: Box, [x, z]: V2, pad = 0) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;
const blocked = (boxes: Box[], p: V2, pad = 0) => boxes.some((b) => inside(b, p, pad));
const distToSegment = ([x, z]: V2, a: V2, b: V2) => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
};

describe("Heron Lake", () => {
  it("is a real basin: shore above the water, deep in the middle, an island above it", () => {
    const [cx, cz] = LAKE.centre;
    expect(terrainHeight(cx - LAKE.rx * 0.6, cz)).toBeLessThan(LAKE_Y - 3);
    expect(terrainHeight(cx, cz + LAKE.rz * 0.7)).toBeLessThan(LAKE_Y - 2);
    // (Heron Bay opens the south-west shore, v6.4.)
    for (let a = 0; a < Math.PI * 2; a += 0.4) if (Math.abs(cz + Math.sin(a) * LAKE.rz * 1.06-riverZ(cx + Math.cos(a)*LAKE.rx*1.06)) > riverWidth(cx + Math.cos(a)*LAKE.rx*1.06)/2+24 && bayDistance(cx + Math.cos(a) * LAKE.rx * 1.06, cz + Math.sin(a) * LAKE.rz * 1.06) < -BAY_SHORE) expect(terrainHeight(cx + Math.cos(a) * LAKE.rx * 1.06, cz + Math.sin(a) * LAKE.rz * 1.06)).toBeGreaterThan(LAKE_Y);
    expect(terrainHeight(cx, cz)).toBeGreaterThan(LAKE_Y + 2);
  });

  it("runs Lake Road down to the dock at a drivable grade", () => {
    expect(LAKE_ROAD.endHeight).toBeGreaterThan(LAKE_Y);
    for (const road of COUNTRY_ROADS) {
      for (let s = 0; s < road.length - 5; s += 5) expect(Math.abs(road.heightAt(s + 5) - road.heightAt(s)) / 5).toBeLessThan(0.12);
    }
  });

  it("builds the jetties from the shore out over the water; Elias sits on his", () => {
    expect(JETTIES.length).toBeGreaterThanOrEqual(6);
    expect(JETTIES.some(j=>groundAt((j.x0+j.x1)/2,(j.z0+j.z1)/2)<LAKE_Y)).toBe(true);
    expect(DECK_Y).toBeGreaterThan(LAKE_Y);
    expect(deckAt(...ELIAS.at)).toBe(DECK_Y);
    expect(terrainHeight(...BOAT_SPOT.at)).toBeLessThan(LAKE_Y - 1);
  });

  it("floats the tackle box in open water inside the search circle, reachable by boat", () => {
    expect(terrainHeight(...TACKLE_BOX)).toBeLessThan(LAKE_Y - 1);
    expect(Math.hypot(TACKLE_BOX[0] - TACKLE_SEARCH.centre[0], TACKLE_BOX[1] - TACKLE_SEARCH.centre[1])).toBeLessThan(TACKLE_SEARCH.radius);
    for (const t of [0, 10, 33, 100]) {
      const [x, z] = tackleAt(t);
      expect(Math.hypot(x - TACKLE_BOX[0], z - TACKLE_BOX[1])).toBeLessThan(TACKLE_REACH);
    }
  });

  it("keeps every tree out of the water (the island's trees stand on dry ground)", () => {
    for (const t of HILL_TREES) if (lakeRadius(...t.position) < 1.05) expect(terrainHeight(...t.position)).toBeGreaterThan(LAKE_Y + 0.3);
    expect(HILL_TREES.filter((t) => lakeRadius(...t.position) < 0.5).length).toBeGreaterThan(4);
  });
});

describe("downtown Owawa", () => {
  it("stands every building on the flat plateau at the end of Owawa Road", () => {
    expect(OWAWA_ROAD.endHeight).toBeCloseTo(CITY_Y);
    for (const b of CITY_BUILDINGS) expect(terrainHeight(...b.at)).toBeCloseTo(CITY_Y);
    for (const b of owawaBoxes().filter((x) => x.id !== "sign")) expect(b.y).toBeCloseTo(CITY_Y);
    expect(CITY_BUILDINGS.filter((b) => b.kind === "tower").length).toBeGreaterThanOrEqual(6);
  });

  it("keeps buildings, trees and lamp posts off the streets and sidewalks", () => {
    const solid = owawaBoxes().filter((b) => b.id === "city" || b.id === "cityhall" || b.id === "shawarma");
    for (const r of OWAWA_ROADS) {
      const reach = r.width / 2 + r.boulevardWidth + r.sidewalkWidth;
      for (const b of solid) {
        const corners: V2[] = [
          [b.x0, b.z0],
          [b.x1, b.z0],
          [b.x0, b.z1],
          [b.x1, b.z1],
        ];
        // Axis-aligned streets: check the box doesn't reach into the street's band.
        const alongX = r.from[1] === r.to[1];
        const c = alongX ? r.from[1] : r.from[0];
        const lo = alongX ? b.z0 : b.x0;
        const hi = alongX ? b.z1 : b.x1;
        const span = alongX ? [Math.min(r.from[0], r.to[0]), Math.max(r.from[0], r.to[0])] : [Math.min(r.from[1], r.to[1]), Math.max(r.from[1], r.to[1])];
        const along = alongX ? [b.x0, b.x1] : [b.z0, b.z1];
        const overlapsAlong = along[1] > span[0] && along[0] < span[1];
        if (overlapsAlong) expect(hi < c - reach || lo > c + reach, `${b.id} at ${corners[0]} vs ${r.id}`).toBe(true);
      }
    }
    for (const t of CITY_TREES) {
      for (const r of OWAWA_ROADS) expect(distToSegment(t.position, r.from as V2, r.to as V2)).toBeGreaterThan(r.width / 2 + 1);
      expect(blocked(solid, t.position, 1.5)).toBe(false);
    }
    const lights = streetLights(OWAWA_ROADS, CITY_Y);
    expect(lights.length).toBeGreaterThan(30);
    for (const l of lights) {
      expect(l.y).toBe(CITY_Y);
      for (const r of OWAWA_ROADS) expect(distToSegment([l.x, l.z], r.from as V2, r.to as V2)).toBeGreaterThan(r.width / 2);
    }
  });

  it("drives city traffic on the streets and walks people where nothing is in the way", () => {
    for (const loop of CITY_TRAFFIC) for (const p of loop) expect(OWAWA_ROADS.some((r) => distToSegment(p, r.from as V2, r.to as V2) < 0.5)).toBe(true);
    const boxes = owawaBoxes();
    for (const loop of CITY_WALKS) for (const p of loop) expect(blocked(boxes, p, 0.4)).toBe(false);
  });

  it("puts City Hall's and the shawarma place's doors in the open", () => {
    const boxes = collisionBoxes(STARTING_STAGES);
    for (const d of [CITY_HALL_DOOR, SHAWARMA_DOOR]) expect(blocked(boxes, d, 0.6)).toBe(false);
    expect(PLACES.cityhall.door).toEqual(CITY_HALL_DOOR);
    expect(PLACES.shawarma.door).toEqual(SHAWARMA_DOOR);
  });
});

describe("the east phase, the bank and the co-op", () => {
  it("extends Maple Run and Birch Lane with 48 more lots, almost all under construction", () => {
    const east = CAIVAN_RIDGE.lots.filter((l) => {
      const n = Number(l.number);
      return (n >= 224 && n < 300) || n >= 324;
    });
    expect(east).toHaveLength(48);
    const building = east.filter((l) => STARTING_STAGES[l.id]);
    expect(building.length).toBeGreaterThan(36);
    for (const id of PARCELS) expect(lotById(id).status).toBe("available");
  });

  it("places the cranes, Marco and the crew where you can walk up to them", () => {
    const boxes = collisionBoxes(STARTING_STAGES);
    const houses = boxes.filter((b) => b.kind === "house" || b.kind === "frame");
    for (const c of CRANES) expect(blocked(houses, [c.x, c.z], 3)).toBe(false);
    for (const p of [MARCO.at, ...CREW.map((w) => w.at)]) expect(blocked(boxes, p, 0.4)).toBe(false);
    expect(CREW.length).toBeGreaterThanOrEqual(6);
    for (const w of CREW) if (w.dialog) expect(DIALOGS[w.dialog]).toBeDefined();
  });

  it("parks the drivable school bus beside the school with Ms. Tran and Sam on foot nearby", () => {
    const boxes = collisionBoxes(STARTING_STAGES);
    expect(blocked(boxes, [SCHOOL_BUS.x, SCHOOL_BUS.z], 3)).toBe(false);
    for (const p of [TRAN.at, SAM_WAIT.at]) expect(blocked(boxes, p, 0.5)).toBe(false);
    expect(Math.hypot(TRAN.at[0] - SCHOOL_BUS.x, TRAN.at[1] - SCHOOL_BUS.z)).toBeLessThan(30);
  });

  it("has exactly one résumé that fits the factory, and a note for the others", () => {
    expect(RESUMES.filter((r) => r.best)).toHaveLength(1);
    for (const r of RESUMES) expect(r.note.length).toBeGreaterThan(10);
  });

  it("asks one good question in each new conversation", () => {
    for (const id of ["elias_intro", "raj_coop", "marco_intro", "clerk_permit"] as const) {
      const asks = DIALOGS[id].filter((l) => l.choices);
      expect(asks.length).toBe(1);
      for (const l of asks) expect(l.choices!.filter((c) => c.good)).toHaveLength(1);
    }
  });
});

describe("the land quest", () => {
  it("buys a parcel, surveys it, gets a permit, builds stage by stage, then pays rent", () => {
    const g = useGame.getState();
    g.start();
    useGame.setState({ cash: 20000 });
    const lot = PARCELS[0];
    g.buyParcel(lot, PARCEL_PRICES[lot], 10);
    expect(useGame.getState().cash).toBe(20000 - PARCEL_PRICES[lot]);
    expect(activeQuests(useGame.getState()).map((q) => q.label)).toContain("Your parcel");
    g.filePermit(11); // not yet: you have to survey first
    expect(useGame.getState().land.step).toBe("bought");
    g.surveyParcel(20);
    g.filePermit(30);
    expect(useGame.getState().land.step).toBe("building");
    expect(useGame.getState().stages[lot]).toBe(LAND_STAGES[0]);
    let t = 30;
    for (let i = 1; i < LAND_STAGES.length; i++) {
      t += LAND_STAGE_SECONDS;
      g.tickLand(t);
      expect(useGame.getState().stages[lot]).toBe(LAND_STAGES[i]);
    }
    t += LAND_STAGE_SECONDS;
    g.tickLand(t);
    expect(useGame.getState().land.step).toBe("done");
    expect(useGame.getState().stages[lot]).toBe("ready");
    const cash = useGame.getState().cash;
    g.tickLand(t + RENT_SECONDS + 1);
    expect(useGame.getState().cash).toBe(cash + RENT);
  });

  it("pays for Elias's tackle box once, and the co-op once", () => {
    const g = useGame.getState();
    g.start();
    g.setElias("found");
    g.finishFishing(2);
    const after = useGame.getState().cash;
    expect(useGame.getState().elias).toBe("done");
    g.finishFishing(1);
    expect(useGame.getState().cash).toBeLessThan(after + 100);
    g.setCoop("riding");
    g.finishCoop();
    const paid = useGame.getState().cash;
    g.finishCoop();
    expect(useGame.getState().cash).toBe(paid);
    expect(useGame.getState().coop).toBe("done");
  });
});

// ── Physics ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  await loadRapier();
});

function run(s: Simulation, seconds: number, input: Partial<SimInput> = {}) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) s.fixedStep({ ...IDLE_INPUT, ...input });
}

async function sim(at: V2 = [-60, 0]) {
  return Simulation.create({ stages: STARTING_STAGES, trees: [], spawn: { position: at, heading: 0 }, town: false });
}

describe("the boat, the bus and the water (physics)", () => {
  it("boards the Lakerunner from the dock, motors out, and only lets you off at the shore or a jetty", async () => {
    const s = await sim([-559, -564]);
    s.teleport(-559, -564, DECK_Y - terrainHeight(-559, -564));
    run(s, 0.5);
    expect(s.player.y).toBeCloseTo(DECK_Y, 0);
    expect(s.nearestRide()).toMatchObject({ kind: "boat" });
    expect(s.board({ kind: "boat" })).toBe(true);
    const x0 = s.boat.x;
    run(s, 4, { forward: 1 });
    expect(Math.hypot(s.boat.x - x0, s.boat.z - BOAT_SPOT.at[1])).toBeGreaterThan(25);
    expect(s.boat.speed).toBeGreaterThan(8);
    // Out in the middle of the lake there's nowhere to step.
    s.teleport(LAKE.centre[0] - 120, LAKE.centre[1]-70, 0, 0);
    expect(s.exit()).toBe(false);
    // Alongside Elias's jetty you can step onto it.
    s.teleport(ELIAS.at[0] + 3.2, ELIAS.at[1] - 4, 0, -Math.PI / 2);
    expect(s.exit()).toBe(true);
    expect(s.control.kind).toBe("foot");
    expect(s.player.y).toBeGreaterThan(LAKE_Y + 0.3);
  });

  it("stops the boat at the island's shore", async () => {
    const s = await sim([-560, -560]);
    s.board({ kind: "boat" });
    s.teleport(LAKE.centre[0] + 70, LAKE.centre[1], 0, Math.PI);
    run(s, 12, { forward: 1 });
    expect(Math.hypot(s.boat.x - LAKE.centre[0], s.boat.z - LAKE.centre[1])).toBeGreaterThan(LAKE.island * 0.6);
  });

  it("lets you wade into the shallows on foot instead of sinking", async () => {
    const s = await sim();
    const x = LAKE.centre[0] + 80;
    const z = LAKE.centre[1];
    s.teleport(x, z, LAKE_Y + 1 - terrainHeight(x, z));
    run(s, 2);
    expect(s.player.y).toBeGreaterThan(LAKE_Y - 1.6);
    expect(s.player.y).toBeLessThan(LAKE_Y);
  });

  it("a car driven into the deep sinks and asks for a tow", async () => {
    const s = await sim();
    const x = LAKE.centre[0] - 90;
    const z = LAKE.centre[1];
    s.spawnVehicle("sedan", x, z, 0);
    run(s, 3);
    expect(s.events.some((e) => e.kind === "sunk" && e.id === "sedan")).toBe(true);
  });

  it("drives the school bus", async () => {
    const s = await sim([SCHOOL_BUS.x - 6, SCHOOL_BUS.z + 4]);
    s.spawnVehicle("bus", SCHOOL_BUS.x, SCHOOL_BUS.z, SCHOOL_BUS.heading);
    run(s, 1);
    expect(s.enterVehicle("bus")).toBe(true);
    run(s, 4, { forward: 1 });
    expect(s.vehicles.bus!.speed).toBeGreaterThan(6);
    expect(s.vehicles.bus!.position.x).toBeGreaterThan(SCHOOL_BUS.x + 15);
  });

  it("walks the streets of Owawa up on the plateau and bumps into its buildings", async () => {
    const s = await sim();
    const b = CITY_BUILDINGS[6];
    s.teleport(b.at[0] - b.size[0] / 2 - 4, b.at[1], 0.5);
    run(s, 1);
    expect(s.player.y).toBeCloseTo(CITY_Y, 0);
    run(s, 3, { forward: 1, cameraYaw: 0 });
    expect(s.player.x).toBeLessThan(b.at[0] - b.size[0] / 2);
  });
});
