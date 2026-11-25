import { CITY_AVENUES_Z, CITY_STREETS_X } from "./owawaCity";
import { CITY_STREETS } from "./owawa";
import type { V6Road } from "./v6";

/**
 * Traffic lights at Owawa's intersections (Downtown and the new grid). A
 * 20-second cycle: east–west green, amber, then north–south green, amber,
 * staggered along each avenue so traffic gets a green wave. Shared by the
 * traffic (cars stop for red) and the lamps that are drawn.
 */
export const SIGNAL_CYCLE = 20;
export type SignalState = "ew" | "ew-amber" | "ns" | "ns-amber";

export function signalAt(t: number, x: number, z: number): SignalState {
  const p = (((t + x * 0.02 + z * 0.005) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  return p < 8 ? "ew" : p < 10 ? "ew-amber" : p < 18 ? "ns" : "ns-amber";
}

/** May a car heading east–west (or north–south) enter the junction now? */
export function mayGo(state: SignalState, eastWest: boolean) {
  return eastWest ? state === "ew" : state === "ns";
}

/** Every intersection where an avenue crosses a street (both roads present). */
export function signalPoints(roads: V6Road[]): [number, number][] {
  const out: [number, number][] = [];
  const onRoad = (x: number, z: number) => roads.some((r) => Math.abs((r.from[0] - x) * (r.to[1] - z) - (r.from[1] - z) * (r.to[0] - x)) < 1e-6 && x >= Math.min(r.from[0], r.to[0]) - 0.01 && x <= Math.max(r.from[0], r.to[0]) + 0.01 && z >= Math.min(r.from[1], r.to[1]) - 0.01 && z <= Math.max(r.from[1], r.to[1]) + 0.01);
  for (const x of CITY_STREETS_X) for (const z of CITY_AVENUES_Z) {
    const ew = roads.some((r) => r.from[1] === z && r.to[1] === z && ((r.from[0] === x) || (r.to[0] === x)) );
    const ns = roads.some((r) => r.from[0] === x && r.to[0] === x && Math.min(r.from[1], r.to[1]) < z && Math.max(r.from[1], r.to[1]) > z);
    if (ew && ns && onRoad(x, z)) out.push([x, z]);
  }
  for (const x of [CITY_STREETS.lyon.x, CITY_STREETS.elgin.x, CITY_STREETS.kent.x]) for (const z of [CITY_STREETS.wellington.z, CITY_STREETS.rideau.z, CITY_STREETS.queen.z]) out.push([x, z]);
  return out;
}
