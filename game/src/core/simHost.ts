import { useEffect, useState } from "react";
import { Simulation } from "../sim/simulation";
import { CAIVAN_RIDGE, SPAWN, STARTING_STAGES } from "../world/map";
import { VEHICLE_SPOTS } from "../story/missions";

/**
 * The one physics simulation the game runs. Created once (Rapier's WebAssembly
 * loads asynchronously), then shared by the player rig, vehicles, camera and
 * story. `alpha` is how far the renderer is between the last two physics steps.
 */
export const host: { sim: Simulation | null; alpha: number } = { sim: null, alpha: 0 };

let creating: Promise<Simulation> | null = null;

export function createSim(): Promise<Simulation> {
  creating ??= Simulation.create({ stages: STARTING_STAGES, trees: CAIVAN_RIDGE.trees, spawn: SPAWN }).then((sim) => {
    // The company pickup waits in the Sales Centre lot from day one.
    const t = VEHICLE_SPOTS.truck;
    sim.spawnVehicle("truck", t.position[0], t.position[1], t.heading);
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
