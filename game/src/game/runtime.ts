import { createBody, type Body } from "../player/physics";
import { GOAT_STARTS } from "./collectibles";
import { SPAWN } from "../world/map";

/**
 * Per-frame state that changes every frame (positions, camera). Kept out of
 * React state so moving around never re-renders the UI; the HUD and minimap
 * read it on their own timers.
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

export const runtime = {
  body: createBody(SPAWN.position[0], SPAWN.position[1], SPAWN.heading) as Body,
  cameraYaw: SPAWN.heading,
  cameraPitch: 0.35,
  cameraDistance: 9,
  goats: GOAT_STARTS.map((g) => ({ id: g.id, name: g.name, x: g.position[0], z: g.position[1], heading: 0, following: false, home: false, tx: g.position[0], tz: g.position[1] })) as GoatState[],
  /** Seconds since the game started (for animations). */
  time: 0,
};

export function resetRuntime() {
  runtime.body = createBody(SPAWN.position[0], SPAWN.position[1], SPAWN.heading);
  runtime.cameraYaw = SPAWN.heading;
  runtime.cameraPitch = 0.35;
  runtime.cameraDistance = 9;
  runtime.goats = GOAT_STARTS.map((g) => ({ id: g.id, name: g.name, x: g.position[0], z: g.position[1], heading: 0, following: false, home: false, tx: g.position[0], tz: g.position[1] }));
}
