import { beforeAll, describe, expect, it } from "vitest";
import { RESPAWN } from "@/game/src/sim/breakables";
import { JETPACK } from "@/game/src/sim/character";
import { loadRapier } from "@/game/src/sim/rapier";
import { IDLE_INPUT, Simulation, type SimInput } from "@/game/src/sim/simulation";
import { collisionBoxes, LANDMARKS, STARTING_STAGES, TOWER } from "@/game/src/world/map";
import { HELI } from "@/game/src/sim/helicopter";
import { roadHeightAt, roadPointAt, terrainHeight } from "@/game/src/world/terrain";

/**
 * The physics runs for real here (Rapier's WebAssembly in Node), on the actual
 * game map: on foot, the jetpack, both vehicles, the horse, and breaking things.
 */

beforeAll(async () => {
  await loadRapier();
});

const spawnOnBoulevard = { position: [-60, 0] as [number, number], heading: 0 };

async function sim(trees: { position: [number, number]; scale: number; variant: 0 | 1 | 2 | 3 }[] = [], town = false) {
  return Simulation.create({ stages: STARTING_STAGES, trees, spawn: spawnOnBoulevard, town });
}

function run(s: Simulation, seconds: number, input: Partial<SimInput> = {}) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) s.fixedStep({ ...IDLE_INPUT, ...input });
}

describe("on foot", () => {
  it("walks the way the camera faces, and runs faster", async () => {
    const s = await sim();
    run(s, 2, { forward: 1, cameraYaw: 0 });
    const walked = s.player.x + 60;
    expect(walked).toBeGreaterThan(7);
    expect(Math.abs(s.player.z)).toBeLessThan(0.5);
    expect(s.player.grounded).toBe(true);
    const r = await sim();
    run(r, 2, { forward: 1, sprint: true, cameraYaw: 0 });
    expect(r.player.x + 60).toBeGreaterThan(walked * 1.4);
  });

  it("jumps and comes back down", async () => {
    const s = await sim();
    run(s, 0.05, { jump: true });
    run(s, 0.2);
    expect(s.player.y).toBeGreaterThan(0.6);
    run(s, 1.5);
    expect(s.player.y).toBeLessThan(0.05);
    expect(s.player.grounded).toBe(true);
  });

  it("can't walk through a house", async () => {
    const s = await sim();
    const house = collisionBoxes(STARTING_STAGES).find((b) => b.kind === "house")!;
    const cz = (house.z0 + house.z1) / 2;
    s.teleport(house.x0 - 3, cz, 0, 0);
    run(s, 3, { forward: 1, cameraYaw: 0 });
    expect(s.player.x).toBeLessThan(house.x0);
  });
});

describe("jetpack", () => {
  it("climbs on thrust, burns fuel, glides down and refuels on the ground", async () => {
    const s = await sim();
    s.setJetpack(true);
    run(s, 0.05, { jump: true, jumpHeld: true });
    run(s, 2.5, { jumpHeld: true });
    expect(s.player.y).toBeGreaterThan(8);
    expect(s.player.fuel).toBeLessThan(JETPACK.fuel - 2);
    // Fly forward with momentum, then let go: it keeps drifting forward as it falls.
    const x0 = s.player.x;
    run(s, 1.5, { jumpHeld: true, forward: 1, cameraYaw: 0 });
    expect(s.player.vel.x).toBeGreaterThan(8);
    expect(s.player.pitch).toBeGreaterThan(0.05); // leaning into the flight
    run(s, 0.5);
    expect(s.player.x).toBeGreaterThan(x0 + 15);
    for (let i = 0; i < 600 && !s.player.grounded; i++) run(s, 1 / 60);
    expect(s.player.grounded).toBe(true);
    const landed = s.player.fuel;
    expect(landed).toBeLessThan(JETPACK.fuel);
    run(s, 1);
    expect(s.player.fuel).toBeGreaterThan(landed);
  });

  it("lands on top of the water tower but stands under the tank from the ground", async () => {
    const s = await sim();
    const [tx, tz] = LANDMARKS.tower.position;
    s.teleport(tx, tz, 0);
    run(s, 0.5);
    expect(s.player.y).toBeLessThan(0.1);
    s.setJetpack(true);
    s.teleport(tx, tz, TOWER.deckY + 3);
    run(s, 2);
    expect(s.player.y).toBeGreaterThan(TOWER.deckY - 0.2);
    expect(s.player.grounded).toBe(true);
  });
});

describe("vehicles are separate from the character", () => {
  it("gets in, drives, steers, brakes and gets out at the door", async () => {
    const s = await sim();
    s.spawnVehicle("truck", -55, 0, 0);
    run(s, 1); // settle on the suspension
    expect(s.nearestRide()).toMatchObject({ kind: "vehicle", id: "truck" });
    expect(s.enterVehicle("truck")).toBe(true);
    run(s, 4, { forward: 1 });
    const truck = s.vehicles.truck!;
    expect(truck.position.x).toBeGreaterThan(-20);
    expect(truck.speed).toBeGreaterThan(10);
    const h0 = truck.heading;
    run(s, 1, { forward: 1, side: 1 });
    expect(truck.heading).toBeGreaterThan(h0 + 0.2); // D turns right (toward +z)
    run(s, 3, { forward: -1 });
    expect(Math.abs(truck.speed)).toBeLessThan(3);
    run(s, 1);
    expect(s.exit()).toBe(true);
    expect(s.control.kind).toBe("foot");
    // The truck stays where it was left; the player stands beside it.
    const t = truck.position;
    const d = Math.hypot(s.player.x - t.x, s.player.z - t.z);
    expect(d).toBeGreaterThan(1.2);
    expect(d).toBeLessThan(4);
    run(s, 2, { forward: 1, cameraYaw: Math.PI / 2 });
    expect(Math.hypot(truck.position.x - t.x, truck.position.z - t.z)).toBeLessThan(0.5);
  });

  it("the sports car is faster than the truck", async () => {
    const top = async (id: "truck" | "car") => {
      const s = await sim();
      s.spawnVehicle(id, -55, 0, 0);
      run(s, 0.5);
      s.enterVehicle(id);
      run(s, 6, { forward: 1 });
      return s.vehicles[id]!.speed;
    };
    expect(await top("car")).toBeGreaterThan((await top("truck")) + 5);
  });

  it("every dealership car drives, and the supercar is the fastest", async () => {
    const top = async (id: "sedan" | "roadster" | "suv" | "coupe" | "super") => {
      const s = await sim();
      s.spawnVehicle(id, -55, 0, 0);
      run(s, 0.5);
      s.enterVehicle(id);
      run(s, 6, { forward: 1 });
      const v = s.vehicles[id]!;
      expect(Math.abs(v.rotation.x) + Math.abs(v.rotation.z)).toBeLessThan(0.3); // still upright
      return v.speed;
    };
    const speeds = { sedan: await top("sedan"), roadster: await top("roadster"), suv: await top("suv"), coupe: await top("coupe"), super: await top("super") };
    for (const v of Object.values(speeds)) expect(v).toBeGreaterThan(15);
    expect(speeds.super).toBeGreaterThan(Math.max(speeds.sedan, speeds.suv, speeds.roadster, speeds.coupe));
  });

  it("a meal boost makes you run faster", async () => {
    const plain = await sim();
    run(plain, 2, { forward: 1, sprint: true, cameraYaw: 0 });
    const boosted = await sim();
    boosted.player.runBoost = 1.35;
    run(boosted, 2, { forward: 1, sprint: true, cameraYaw: 0 });
    expect(boosted.player.x - plain.player.x).toBeGreaterThan(3);
  });

  it("can be called to the player", async () => {
    const s = await sim();
    s.call("car");
    const car = s.vehicles.car!;
    expect(Math.hypot(car.position.x + 60, car.position.z)).toBeLessThan(10);
  });
});

describe("animals", () => {
  it("mounts the horse, gallops and dismounts", async () => {
    const s = await sim();
    s.spawnAnimal("horse", -58, 0, 0);
    expect(s.nearestRide()).toMatchObject({ kind: "animal", id: "horse" });
    s.mountHorse();
    run(s, 4, { forward: 1, sprint: true });
    expect(s.horse!.speed).toBeGreaterThan(12);
    expect(s.horse!.x).toBeGreaterThan(-20);
    run(s, 2);
    s.exit();
    expect(s.control.kind).toBe("foot");
  });

  it("Peanut the elephant is slower than the horse, can't jump, and pushes trees over", async () => {
    const tree = { position: [-40, 0] as [number, number], scale: 1, variant: 0 as const };
    const s = await sim([tree]);
    s.spawnAnimal("elephant", -56, 0, 0);
    expect(s.nearestRide((r) => r.kind === "animal")).toMatchObject({ kind: "animal", id: "elephant" });
    s.board({ kind: "animal", id: "elephant" });
    run(s, 0.05, { jump: true });
    run(s, 0.2);
    expect(s.animals.elephant!.y).toBeLessThan(0.1);
    run(s, 5, { forward: 1, sprint: true });
    const pe = s.animals.elephant!;
    expect(pe.speed).toBeGreaterThan(5);
    expect(pe.speed).toBeLessThan(9);
    expect(s.breakables.trees[0].status).toBe("fallen");
  });
});

describe("helicopter", () => {
  it("spools up, climbs, flies forward, lands and lets you out", async () => {
    const s = await sim();
    s.spawnHeli(-57, 3, 0);
    run(s, 0.2);
    expect(s.nearestRide()).toMatchObject({ kind: "heli" });
    s.board({ kind: "heli" });
    const h = s.heli!;
    // The rotor has to spool before it lifts.
    run(s, 0.5, { jumpHeld: true });
    expect(h.y).toBeLessThan(0.5);
    run(s, 5, { jumpHeld: true });
    expect(h.rotor).toBeGreaterThan(0.9);
    expect(h.y).toBeGreaterThan(15);
    const x0 = h.x;
    run(s, 5, { forward: 1 });
    expect(h.x - x0).toBeGreaterThan(60);
    expect(h.speed).toBeGreaterThan(HELI.cruise * 0.6);
    expect(s.exit()).toBe(true); // bailing out mid-air is allowed by the sim; the game asks you to land first
    s.board({ kind: "heli" });
    // Descend (Shift) to the ground and stop.
    run(s, 6, { sprint: true });
    run(s, 4, { sprint: true });
    expect(h.grounded).toBe(true);
    expect(h.y).toBeLessThan(0.3);
    expect(s.exit()).toBe(true);
    expect(s.control.kind).toBe("foot");
  });

  it("knocks over trees it flies into", async () => {
    const tree = { position: [-30, 8] as [number, number], scale: 1.2, variant: 0 as const };
    const s = await sim([tree]);
    s.spawnHeli(-50, 8, 0);
    s.board({ kind: "heli" });
    run(s, 3, { jumpHeld: true }); // spool up and lift off
    s.teleport(-50, 8, 5, 0);
    run(s, 4, { forward: 1 });
    expect(s.breakables.trees[0].status).toBe("fallen");
  });
});

describe("hills", () => {
  it("stands on the heightfield exactly where the terrain says", async () => {
    const s = await sim();
    for (const [x, z] of [
      [-700, 700],
      [800, -650],
      [-900, 100],
    ]) {
      s.teleport(x, z, 2);
      run(s, 2);
      expect(Math.abs(s.player.y - terrainHeight(x, z))).toBeLessThan(0.6);
      expect(s.player.grounded).toBe(true);
    }
  });

  it("drives the 4x4 up Cottage Road", async () => {
    const s = await sim();
    const START = 330; // where the road leaves the flat town ground
    const a = roadPointAt(START);
    s.spawnVehicle("trail", a.x, a.z, a.heading);
    run(s, 0.5);
    s.enterVehicle("trail");
    let along = START;
    const steerAlong = () => {
      const v = s.vehicles.trail!;
      const p = v.position;
      // Track progress along the road, and aim a little ahead of it.
      const from = along;
      for (let k = from; k < from + 30; k += 1) {
        const q = roadPointAt(k);
        if (Math.hypot(q.x - p.x, q.z - p.z) < 6) along = k;
      }
      const ahead = roadPointAt(along + 14);
      const want = Math.atan2(ahead.z - p.z, ahead.x - p.x);
      let d = want - v.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return Math.max(-1, Math.min(1, d * 2.5));
    };
    for (let i = 0; i < 20 * 6; i++) run(s, 1 / 6, { forward: 0.7, side: steerAlong() });
    const p = s.vehicles.trail!.position;
    // Up at the cottage end of the road, on the road surface.
    expect(along).toBeGreaterThan(START + 150);
    expect(p.y).toBeGreaterThan(roadHeightAt(START));
    expect(Math.abs(p.y - 1 - terrainHeight(p.x, p.z))).toBeLessThan(1.5);
  });
});

describe("town life", () => {
  it("moves traffic along the roads and pedestrians along the sidewalks", async () => {
    const s = await sim([], true);
    const town = s.town!;
    expect(town.cars.length).toBeGreaterThan(10);
    expect(town.walkers.length).toBeGreaterThan(10);
    const start = town.cars.map((c) => [c.x, c.z]);
    const walkStart = town.walkers.map((w) => [w.x, w.z]);
    run(s, 6);
    const moved = town.cars.filter((c, i) => Math.hypot(c.x - start[i][0], c.z - start[i][1]) > 20).length;
    expect(moved).toBeGreaterThan(town.cars.length * 0.6);
    const walked = town.walkers.filter((w, i) => Math.hypot(w.x - walkStart[i][0], w.z - walkStart[i][1]) > 2).length;
    expect(walked).toBeGreaterThan(town.walkers.length * 0.4);
  });

  it("stops for the player standing in the lane", async () => {
    const s = await sim([], true);
    const car = s.town!.cars[0];
    run(s, 1);
    // Stand 25 m ahead of the first car, in its lane.
    const ahead = car.path.at(car.s + 25);
    s.teleport(ahead.x, ahead.z, 0);
    run(s, 6);
    expect(Math.hypot(car.x - ahead.x, car.z - ahead.z)).toBeGreaterThan(2.5);
    expect(car.speed).toBeLessThan(0.5);
  });
});

describe("breaking things", () => {
  const tree = { position: [-20, 0] as [number, number], scale: 1, variant: 0 as const };

  it("street lights snap off at a lower speed than trees", async () => {
    const pole = { position: [-30, 0] as [number, number], scale: 1, variant: 3 as const };
    const s = await sim([pole]);
    s.spawnVehicle("hauler", -44, 0, 0);
    run(s, 0.5);
    s.enterVehicle("hauler");
    run(s, 4, { forward: 0.5 });
    expect(s.breakables.trees[0].status).toBe("fallen");
  });

  it("a fast truck knocks a tree over and keeps going; a slow bump doesn't", async () => {
    const s = await sim([tree]);
    s.spawnVehicle("truck", -60, 0, 0);
    run(s, 0.5);
    s.enterVehicle("truck");
    run(s, 5, { forward: 1 });
    expect(s.breakables.trees[0].status).toBe("fallen");
    expect(s.vehicles.truck!.position.x).toBeGreaterThan(-15);
    expect(s.events.some((e) => e.kind === "tree-down")).toBe(true);

    const slow = await sim([tree]);
    slow.spawnVehicle("truck", -27, 0, 0);
    run(slow, 0.5);
    slow.enterVehicle("truck");
    run(slow, 3, { forward: 0.25 });
    expect(slow.breakables.trees[0].status).toBe("standing");
  });

  it("knocked-down trees stand back up once you've driven away", async () => {
    const s = await sim([tree]);
    s.breakables.breakTree(0, { x: 1, y: 0, z: 0 }, 15);
    run(s, 2);
    s.teleport(200, 0);
    run(s, RESPAWN.tree + 1);
    expect(s.breakables.trees[0].status).toBe("standing");
  });

  it("smashes a wood frame into planks at speed, and the crew rebuilds it later", async () => {
    const s = await sim();
    const frame = collisionBoxes(STARTING_STAGES).find((b) => b.kind === "frame")!;
    expect(frame).toBeTruthy();
    const cx = (frame.x0 + frame.x1) / 2;
    // Line up across Maple Run from the frame, in a front yard, and drive south into it.
    s.spawnVehicle("truck", cx, frame.z0 - 20, Math.PI / 2);
    run(s, 0.5);
    s.enterVehicle("truck");
    run(s, 5, { forward: 1 });
    const f = s.breakables.frames.get(frame.id!)!;
    expect(f.broken).toBe(true);
    expect(f.planks.length).toBeGreaterThan(25);
    run(s, 3);
    s.exit();
    s.teleport(cx + 200, 0);
    run(s, RESPAWN.frame + 1);
    expect(f.broken).toBe(false);
    expect(f.planks.length).toBe(0);
  });
});

describe("camera", () => {
  it("stops at walls so it never ends up inside a house", async () => {
    const s = await sim();
    const house = collisionBoxes(STARTING_STAGES).find((b) => b.kind === "house")!;
    const cz = (house.z0 + house.z1) / 2;
    run(s, 0.1); // queries see the world once it has stepped
    const free = s.cameraRay({ x: house.x0 - 2, y: 2, z: cz }, { x: house.x0 + 6, y: 2, z: cz });
    expect(free).toBeLessThan(2.1);
  });
});

