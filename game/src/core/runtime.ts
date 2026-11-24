import type { Focus } from "../sim/simulation";
import { GOAT_STARTS } from "../story/collectibles";
import { SPAWN } from "../world/map";

/**
 * Per-frame state that changes every frame (what the camera follows, camera
 * angles, goats). Kept out of React state so moving around never re-renders the
 * UI; the HUD and minimap read it on their own timers.
 */

export interface GoatState {
  id: string;
  name: string;
  x: number;
  z: number;
  heading: number;
  following: boolean;
  home: boolean;
  /** Wander target. */
  tx: number;
  tz: number;
}

function startFocus(): Focus {
  return { x: SPAWN.position[0], y: 0, z: SPAWN.position[1], heading: SPAWN.heading, speed: 0, vy: 0, grounded: true, fuel: 0, fuelMax: 0, thrusting: false, control: { kind: "foot" } };
}

function startGoats(): GoatState[] {
  return GOAT_STARTS.map((g) => ({ id: g.id, name: g.name, x: g.position[0], z: g.position[1], heading: 0, following: false, home: false, tx: g.position[0], tz: g.position[1] }));
}

export const runtime = {
  /** The player, or whatever they are driving or riding (copied from the simulation each frame). */
  body: startFocus(),
  cameraYaw: SPAWN.heading,
  cameraPitch: 0.32,
  cameraDistance: 1,
  /** Camera shake (decays), from hard landings and crashes. */
  shake: 0,
  goats: startGoats(),
  /** Seconds since the game started (for animations). */
  time: 0,
};

export function resetRuntime() {
  runtime.body = startFocus();
  runtime.cameraYaw = SPAWN.heading;
  runtime.cameraPitch = 0.32;
  runtime.cameraDistance = 1;
  runtime.shake = 0;
  runtime.goats = startGoats();
}
