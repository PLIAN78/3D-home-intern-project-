import { useEffect, useState } from "react";
import { Simulation } from "../sim/simulation";
import { CAIVAN_RIDGE, SPAWN, STARTING_STAGES, streetLights } from "../world/map";
import { CITY_Y, ELEPHANT_SPOT, HILL_TREES } from "../world/terrain";
import { CITY_TREES, OWAWA_ROADS } from "../world/owawa";
import { VEHICLE_SPOTS } from "../story/missions";
import type { TreeInput } from "../sim/breakables";

/** Every tree you can knock over: the community's, then the woods on the hills. */
export const TREES: TreeInput[] = [...CAIVAN_RIDGE.trees, ...HILL_TREES, ...CITY_TREES];
/** Street lights (Caivan Ridge, then downtown Owawa), in the same breakable list after the trees (variant 3 is a pole). */
export const LIGHTS = [...streetLights(), ...streetLights(OWAWA_ROADS, CITY_Y)];
export const BREAKABLE_TREES: TreeInput[] = [...TREES, ...LIGHTS.map((l) => ({ position: [l.x, l.z] as [number, number], y: l.y, scale: 1, variant: 3 as const }))];
/** Index of the first street light in the breakables list. */
export const FIRST_LIGHT = TREES.length;

/**
 * The one physics simulation the game runs. Created once (Rapier's WebAssembly
 * loads asynchronously), then shared by the player rig, vehicles, camera and
 * story. `alpha` is how far the renderer is between the last two physics steps.
 */
export const host: { sim: Simulation | null; alpha: number } = { sim: null, alpha: 0 };

let creating: Promise<Simulation> | null = null;

export function createSim(): Promise<Simulation> {
  creating ??= Simulation.create({ stages: STARTING_STAGES, trees: BREAKABLE_TREES, spawn: SPAWN, town: true }).then((sim) => {
    // The company pickup waits in the Sales Centre lot from day one.
    const t = VEHICLE_SPOTS.truck;
    sim.spawnVehicle("truck", t.position[0], t.position[1], t.heading);
    // The school bus parks beside the school (you drive it for the co-op quest).
    const bus = VEHICLE_SPOTS.bus;
    sim.spawnVehicle("bus", bus.position[0], bus.position[1], bus.heading);
    // Peanut is out in the hills from the start, waiting to be found.
    sim.spawnAnimal("elephant", ELEPHANT_SPOT[0], ELEPHANT_SPOT[1], 0.6);
    host.sim = sim;
    return sim;
  });
  return creating;
}

/** The simulation once it's ready (null while Rapier loads). */
export function useSim(): Simulation | null {
  const [sim, setSim] = useState<Simulation | null>(host.sim);
  useEffect(() => {
    if (sim) return;
    let live = true;
    void createSim().then((s) => live && setSim(s));
    return () => {
      live = false;
    };
  }, [sim]);
  return sim;
}
