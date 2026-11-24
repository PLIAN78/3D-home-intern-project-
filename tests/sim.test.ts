import { beforeAll, describe, expect, it } from "vitest";
import { RESPAWN } from "@/game/src/sim/breakables";
import { JETPACK } from "@/game/src/sim/character";
import { loadRapier } from "@/game/src/sim/rapier";
import { IDLE_INPUT, Simulation, type SimInput } from "@/game/src/sim/simulation";
import { collisionBoxes, LANDMARKS, STARTING_STAGES, TOWER } from "@/game/src/world/map";

/**
 * The physics runs for real here (Rapier's WebAssembly in Node), on the actual
 * game map: on foot, the jetpack, both vehicles, the horse, and breaking things.
 */

beforeAll(async () => {
  await loadRapier();
});

const spawnOnBoulevard = { position: [-60, 0] as [number, number], heading: 0 };

async function sim(trees: { position: [number, number]; scale: number; variant: 0 | 1 | 2 }[] = []) {
  return Simulation.create({ stages: STARTING_STAGES, trees, spawn: spawnOnBoulevard });
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

  it("can be called to the player", async () => {
    const s = await sim();
    s.call("car");
    const car = s.vehicles.car!;
    expect(Math.hypot(car.position.x + 60, car.position.z)).toBeLessThan(10);
  });
});

describe("horse", () => {
  it("mounts, gallops and dismounts", async () => {
    const s = await sim();
    s.spawnHorse(-58, 0, 0);
    expect(s.nearestRide()).toMatchObject({ kind: "horse" });
    s.mountHorse();
    run(s, 4, { forward: 1, sprint: true });
    expect(s.horse!.speed).toBeGreaterThan(12);
    expect(s.horse!.x).toBeGreaterThan(-20);
    run(s, 2);
    s.exit();
    expect(s.control.kind).toBe("foot");
  });
});

describe("breaking things", () => {
  const tree = { position: [-20, 0] as [number, number], scale: 1, variant: 0 as const };

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
    // Line up south of the frame (Maple Run lots), drive north into it.
    s.spawnVehicle("truck", cx, frame.z1 + 30, -Math.PI / 2);
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
