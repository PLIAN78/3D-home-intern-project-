import { beforeAll, describe, expect, it } from "vitest";
import { loadRapier } from "../game/src/sim/rapier";
import { IDLE_INPUT, Simulation } from "../game/src/sim/simulation";
import { CHASE } from "../game/src/sim/town";
import { STARTING_STAGES } from "../game/src/world/map";
import { ISLANDS, JETSKI_LOOPS, NORTH_BEACH, RIVERSIDE_TREE_SPOTS, SHIP_ROUTE, npcJetSki, onNorthBeach, riverZ, riverWidth } from "../game/src/world/v6";
import { COTTAGE, HILL_TREES, LAKE_Y, nearestCountryRoad, terrainHeight } from "../game/src/world/terrain";
import { isPaved, paveEdgeZ } from "../game/src/world/paving";
import { SHORES } from "../game/src/world/shoreline";
import { BUSH_SPOTS, CAMP_HOST, CAMP_TRAIL, CAMP_TREES, CAMPFIRE, CAMPGROUND, CREEKS, MOUNTAIN, ROCKS, TENTS, inCampground, mountainHeight, nearCreek } from "../game/src/world/wilds";
import { PLACED_BUSHES, PLACED_ROCKS, wildsBoxes } from "../game/src/world/wildsBoxes";
import { FIRST_CAMP_TREE, TREES, host } from "../game/src/core/simHost";
import { runtime as rt } from "../game/src/core/runtime";
import { useV6 as v6, v6Offer as offer } from "../game/src/story/v6Store";
import { gigById } from "../game/src/story/gigs";
import { WILD_ANIMALS, WILD_TUNING, initWild, stepWild } from "../game/src/world/wildAnimals";

beforeAll(async () => {
  await loadRapier();
});

type P = [number, number];
const water = (x: number, z: number) => terrainHeight(x, z) < LAKE_Y;

describe("v6.5 police", () => {
  it("chases you for ten seconds after you hit a cruiser, siren events and all, then drives back to its beat", async () => {
    const s = await Simulation.create({ stages: STARTING_STAGES, trees: [], spawn: { position: [-60, 0], heading: 0 }, town: true });
    const town = s.cityTown!;
    const c = town.cars.find((c) => c.model === "police")!;
    expect(town.carByCollider(c.collider)).toBe(c);
    // Stand 45 m from it.
    const home = { x: c.x, z: c.z };
    s.teleport(c.x - 45 * Math.sin(c.heading), c.z + 45 * Math.cos(c.heading), 0, 0);
    s.fixedStep(IDLE_INPUT);
    const me = () => s.focus();
    town.alarm(c);
    expect(town.chasing).toBe(true);
    s.fixedStep(IDLE_INPUT);
    expect(s.events.some((e) => e.kind === "police" && e.phase === "chase")).toBe(true);
    s.events.length = 0;
    for (let i = 0; i < 60 * 6; i++) s.fixedStep(IDLE_INPUT);
    // It has closed in and holds back a few metres off.
    const gap = Math.hypot(me().x - c.x, me().z - c.z);
    expect(gap).toBeLessThan(CHASE.gap + 4);
    expect(gap).toBeGreaterThan(3);
    expect(c.chase?.phase).toBe("chase");
    // Hitting it again restarts the clock.
    town.alarm(c);
    expect(c.chase!.left).toBe(CHASE.seconds);
    for (let i = 0; i < 60 * (CHASE.seconds + 0.5); i++) s.fixedStep(IDLE_INPUT);
    expect(s.events.some((e) => e.kind === "police" && e.phase === "gave-up")).toBe(true);
    expect(town.chasing).toBe(false);
    for (let i = 0; i < 60 * 30 && c.chase; i++) s.fixedStep(IDLE_INPUT);
    expect(c.chase).toBeUndefined();
    // Back on its beat, where it left off, and driving on.
    expect(Math.hypot(c.x - home.x, c.z - home.z)).toBeLessThan(3);
    for (let i = 0; i < 60 * 5; i++) s.fixedStep(IDLE_INPUT);
    expect(Math.hypot(c.x - home.x, c.z - home.z)).toBeGreaterThan(5);
  }, 60000);

  it("sets the alarm off when you drive into a cruiser", async () => {
    const s = await Simulation.create({ stages: STARTING_STAGES, trees: [], spawn: { position: [-60, 0], heading: 0 }, town: true });
    const town = s.cityTown!;
    const c = town.cars.find((c) => c.model === "police")!;
    // Head-on, 30 m up its lane.
    const [fx, fz] = [Math.cos(c.heading), Math.sin(c.heading)];
    s.spawnVehicle("car", c.x + fx * 30, c.z + fz * 30, c.heading + Math.PI);
    for (let i = 0; i < 30; i++) s.fixedStep(IDLE_INPUT);
    s.enterVehicle("car");
    let hit = false;
    for (let i = 0; i < 60 * 6 && !hit; i++) {
      s.fixedStep({ ...IDLE_INPUT, forward: 1 });
      hit = s.events.some((e) => e.kind === "police" && e.phase === "chase");
    }
    expect(hit).toBe(true);
    expect(town.chasing).toBe(true);
  }, 60000);

  it("only cruisers raise the alarm", async () => {
    const s = await Simulation.create({ stages: STARTING_STAGES, trees: [], spawn: { position: [-60, 0], heading: 0 }, town: true });
    const town = s.cityTown!;
    town.alarm(town.cars.find((c) => c.model !== "police")!);
    expect(town.chasing).toBe(false);
    expect(town.alarms).toHaveLength(0);
  }, 30000);
});

describe("v6.5 the river and the island", () => {
  it("sets the island halfway between the north and south shores, well out from every shore", () => {
    const I = ISLANDS[0];
    const gap = (a: number) => {
      const c = Math.cos(a), s = Math.sin(a);
      let r = 0;
      while (!water(I.at[0] + c * r, I.at[1] + s * r)) r += 1;
      const shore = r;
      while (water(I.at[0] + c * r, I.at[1] + s * r) && r < 900) r += 1;
      return r - shore;
    };
    const south = gap(Math.PI / 2), north = gap(-Math.PI / 2);
    expect(south).toBeGreaterThan(110);
    expect(north).toBeGreaterThan(110);
    expect(Math.abs(north - south)).toBeLessThan(25);
    for (let k = 0; k < 16; k++) expect(gap((k / 16) * Math.PI * 2), `direction ${k}`).toBeGreaterThan(60);
  });

  it("keeps the ship and the jet skis in open water, clear of the island", () => {
    const I = ISLANDS[0];
    const inside = (x: number, z: number, k: number) => Math.hypot((x - I.at[0]) / I.rx, (z - I.at[1]) / I.rz) < k;
    for (const [x, z] of SHIP_ROUTE) if (Math.abs(x) < 990) {
      expect(inside(x, z, 1.25), `ship at ${x}`).toBe(false);
      expect(water(x, z), `ship at ${x}`).toBe(true);
    }
    for (let i = 0; i < JETSKI_LOOPS.length * 2; i++) for (let t = 0; t < 60; t += 0.5) {
      const j = npcJetSki(i, t);
      expect(inside(j.x, j.z, 1.2), `jet ski ${i} at ${t}`).toBe(false);
    }
  });

  it("greens the north bank between the riverfront sidewalk and the water, with two rows of trees", () => {
    for (let x = -990; x < 990; x += 10) {
      const z = (paveEdgeZ(x) + riverZ(x) - riverWidth(x) / 2) / 2;
      if (!water(x, z)) expect(isPaved(x, z, terrainHeight(x, z)), `bank at ${x}`).toBe(false);
      expect(isPaved(x, paveEdgeZ(x) - 3, 0), `riverfront at ${x}`).toBe(true);
    }
    expect(RIVERSIDE_TREE_SPOTS.length).toBeGreaterThan(150);
    const trees = new Set(HILL_TREES.map((t) => t.position.join(",")));
    for (const [x, z] of RIVERSIDE_TREE_SPOTS) {
      expect(z, `tree at ${x}`).toBeGreaterThan(paveEdgeZ(x));
      expect(onNorthBeach(x, z), `tree at ${x}`).toBe(false);
      if (terrainHeight(x, z) > LAKE_Y + 0.5) expect(trees.has(x + "," + z), `tree at ${x}`).toBe(true);
    }
  });

  it("lays Riverside Beach on the north bank, sand without trees", () => {
    const shore = SHORES.filter((s) => s.id.startsWith("river-north")).flatMap((s) => s.points.map((p, i) => [p, s.normals[i]] as const)).filter(([p]) => p[0] > NORTH_BEACH.x0 && p[0] < NORTH_BEACH.x1);
    expect(shore.length).toBeGreaterThan(30);
    for (const [[x, z], [nx, nz]] of shore) expect(onNorthBeach(x + nx * 8, z + nz * 8), `beach at ${x}`).toBe(true);
    expect(HILL_TREES.some((t) => onNorthBeach(...t.position))).toBe(false);
  });
});

describe("v6.5 the south-west woods", () => {
  it("raises Mount Tamarack in the corner forest", () => {
    expect(mountainHeight(...MOUNTAIN.at)).toBeCloseTo(MOUNTAIN.height, 0);
    expect(MOUNTAIN.at[0]).toBeLessThan(-700);
    expect(MOUNTAIN.at[1]).toBeGreaterThan(700);
    expect(terrainHeight(...MOUNTAIN.at)).toBeGreaterThan(terrainHeight(...CAMPGROUND.at) + 35);
    expect(mountainHeight(MOUNTAIN.at[0] + MOUNTAIN.radius + 1, MOUNTAIN.at[1])).toBe(0);
    // The creeks run downhill off it.
    for (const c of CREEKS) expect(terrainHeight(...c[0])).toBeGreaterThan(terrainHeight(...c.at(-1)!));
  });

  it("levels Pine Hollow Campground south of the cottage, and keeps trees, rocks and bushes off it", () => {
    expect(CAMPGROUND.at[1]).toBeGreaterThan(COTTAGE.position[1] + 100);
    const h0 = terrainHeight(...CAMPGROUND.at);
    for (let a = 0; a < 6.28; a += 0.4) for (const r of [5, 12, 20, CAMPGROUND.radius - 2]) expect(Math.abs(terrainHeight(CAMPGROUND.at[0] + Math.cos(a) * r, CAMPGROUND.at[1] + Math.sin(a) * r) - h0)).toBeLessThan(0.3);
    for (const t of HILL_TREES) {
      expect(inCampground(...t.position), `tree at ${t.position}`).toBe(false);
      expect(nearCreek(...t.position), `tree at ${t.position}`).toBe(false);
    }
    for (const r of PLACED_ROCKS) {
      expect(inCampground(...r.at)).toBe(false);
      expect(nearestCountryRoad(...r.at).d).toBeGreaterThan(7);
    }
    for (const b of PLACED_BUSHES) {
      expect(inCampground(...b.at)).toBe(false);
      expect(nearestCountryRoad(...b.at).d).toBeGreaterThan(7);
    }
    expect(PLACED_BUSHES.length).toBeGreaterThan(200);
    expect(PLACED_ROCKS.length).toBeGreaterThan(50);
    expect(ROCKS.length + BUSH_SPOTS.length).toBeGreaterThan(PLACED_ROCKS.length + PLACED_BUSHES.length);
    // The trail starts at the foot of the cottage's yard (where Cottage Road ends) and ends at the clearing.
    expect(Math.hypot(CAMP_TRAIL[0][0] - COTTAGE.position[0], CAMP_TRAIL[0][1] - COTTAGE.position[1])).toBeLessThan(35);
    expect(Math.hypot(CAMP_TRAIL.at(-1)![0] - CAMPFIRE[0], CAMP_TRAIL.at(-1)![1] - CAMPFIRE[1])).toBeLessThan(CAMPGROUND.radius);
    // Tents are solid; the campfire and the host are clear of them.
    const tents = wildsBoxes().filter((b) => b.id === "tent");
    expect(tents).toHaveLength(TENTS.length);
    const inBox = (b: (typeof tents)[number], [x, z]: P) => {
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, r = b.rot ?? 0, dx = x - cx, dz = z - cz;
      return Math.abs(dx * Math.cos(r) + dz * Math.sin(r)) < (b.x1 - b.x0) / 2 && Math.abs(-dx * Math.sin(r) + dz * Math.cos(r)) < (b.z1 - b.z0) / 2;
    };
    for (const t of tents) for (const p of [CAMPFIRE, CAMP_HOST, ...CAMP_TREES]) expect(inBox(t, p)).toBe(false);
  });

  it("puts the ribboned firewood trees last in the breakable trees", () => {
    expect(TREES.length - FIRST_CAMP_TREE).toBe(CAMP_TREES.length);
    CAMP_TREES.forEach(([x, z], k) => expect(TREES[FIRST_CAMP_TREE + k].position).toEqual([x, z]));
  });

  it("plays the firewood job: talk to the camp host, chop four marked trees, report back, get paid", async () => {
    const { useGame } = await import("../game/src/story/store");
    useGame.setState({ phase: "playing", cash: 0 });
    const s = await Simulation.create({ stages: STARTING_STAGES, trees: TREES, spawn: { position: [CAMP_HOST[0], CAMP_HOST[1] + 2], heading: 0 }, town: false });
    host.sim = s;
    v6.setState({ gig: null, chopped: 0, ride: null, interior: null, panel: null });
    const stand = ([x, z]: P) => Object.assign(rt.body, { x, z, y: 0, control: { kind: "foot" } });
    stand([CAMP_HOST[0] + 1, CAMP_HOST[1]]);
    expect(offer()?.text).toMatch(/camp host · firewood job/i);
    offer()!.run();
    expect(v6.getState().gig).toEqual({ id: "camp-firewood", step: 0 });
    // Back at the host before the wood is cut: nothing to hand in yet.
    v6.getState().tick(0.1);
    expect(v6.getState().gig?.step).toBe(0);
    for (let k = 0; k < 4; k++) {
      const [x, z] = CAMP_TREES[k];
      stand([x - 1.8, z]);
      expect(offer()?.text).toMatch(/^Chop the marked tree/);
      offer()!.run();
      expect(s.breakables.trees[FIRST_CAMP_TREE + k].status).toBe("fallen");
      // A fallen tree can't be chopped twice.
      expect(offer()?.text ?? "").not.toMatch(/^Chop/);
      v6.getState().tick(0.1);
    }
    expect(v6.getState().chopped).toBe(4);
    expect(v6.getState().gig?.step).toBe(1);
    stand(CAMP_HOST);
    v6.getState().tick(0.1);
    expect(v6.getState().gig).toBeNull();
    expect(v6.getState().gigsDone).toContain("camp-firewood");
    expect(useGame.getState().cash).toBe(gigById("camp-firewood")!.reward);
    host.sim = null;
  }, 60000);
});

describe("v6.5 wildlife", () => {
  it("homes deer herds with stags on the meadows, bears at their dens with a cub, and foxes and rabbits in the woods", () => {
    const count = (k: string) => WILD_ANIMALS.filter((a) => a.kind === k).length;
    expect(count("deer") + count("stag")).toBeGreaterThanOrEqual(12);
    expect(count("stag")).toBeGreaterThanOrEqual(2);
    expect(count("bear")).toBe(3);
    expect(count("cub")).toBe(1);
    expect(count("fox")).toBeGreaterThanOrEqual(6);
    expect(count("rabbit")).toBeGreaterThanOrEqual(10);
    for (const a of WILD_ANIMALS) {
      expect(water(...a.home), a.kind + " " + a.id).toBe(false);
      expect(inCampground(...a.home), a.kind + " " + a.id).toBe(false);
    }
  });

  it("wanders on dry land near home, and the cub keeps up with its mother", () => {
    const states = WILD_ANIMALS.map(initWild);
    const far = { x: 5000, z: 5000 };
    let moved = 0;
    for (let i = 0; i < 20 * 180; i++)
      WILD_ANIMALS.forEach((a, k) => {
        const s = states[k], x = s.x;
        stepWild(a, s, 0.05, far, a.follows !== undefined ? states[a.follows] : undefined);
        if (s.x !== x) moved++;
        if (i % 40 === 0) {
          expect(water(s.x, s.z), a.kind + " " + a.id).toBe(false);
          if (a.follows === undefined) expect(Math.hypot(s.x - a.home[0], s.z - a.home[1])).toBeLessThan(WILD_TUNING[a.kind].range * 1.6);
        }
      });
    expect(moved).toBeGreaterThan(1000);
    const cub = WILD_ANIMALS.findIndex((a) => a.kind === "cub");
    const mother = states[WILD_ANIMALS[cub].follows!];
    expect(Math.hypot(states[cub].x - mother.x, states[cub].z - mother.z)).toBeLessThan(8);
  });

  it("deer, foxes and rabbits bolt when you come close; bears don't", () => {
    for (const kind of ["deer", "stag", "fox", "rabbit", "bear"] as const) {
      const a = WILD_ANIMALS.find((a) => a.kind === kind)!;
      const s = initWild(a);
      const me = { x: s.x + WILD_TUNING[kind].fear * 0.5 + 1, z: s.z };
      const d0 = Math.hypot(me.x - s.x, me.z - s.z);
      let fled = false;
      for (let i = 0; i < 60; i++) {
        stepWild(a, s, 0.05, me);
        fled ||= s.fleeing;
      }
      expect(fled, kind).toBe(kind !== "bear");
      if (kind !== "bear") expect(Math.hypot(me.x - s.x, me.z - s.z), kind).toBeGreaterThan(d0 + 3);
    }
  });
});
