import RAPIER from "@dimforge/rapier3d-compat";

/**
 * Rapier (MIT, https://rapier.rs) is the physics engine. The "-compat" build
 * embeds its WebAssembly, so the same code runs in the browser and in Node
 * (the unit tests drive the real simulation).
 */
export type Rapier = typeof RAPIER;
export { RAPIER };

let ready: Promise<Rapier> | null = null;

/** Loads Rapier's WebAssembly once; every caller gets the same module. */
export function loadRapier(): Promise<Rapier> {
  ready ??= RAPIER.init().then(() => RAPIER);
  return ready;
}

/** Collision layers. A pair collides when each one's filter includes the other's layer. */
export const LAYER = {
  STATIC: 1 << 0,
  PLAYER: 1 << 1,
  VEHICLE: 1 << 2,
  BREAKABLE: 1 << 3,
  DEBRIS: 1 << 4,
  ANIMAL: 1 << 5,
  /** The lake's "swimming floor": people and animals wade, vehicles sink. */
  WATER: 1 << 6,
} as const;

export const ALL_LAYERS = 0xffff;

/** Packs a Rapier interaction-groups value: what I am, and what I collide with. */
export function groups(member: number, filter: number = ALL_LAYERS): number {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

/** What the camera, wheels and feet treat as solid world. */
export const SOLID = LAYER.STATIC | LAYER.BREAKABLE | LAYER.DEBRIS | LAYER.VEHICLE | LAYER.ANIMAL;
