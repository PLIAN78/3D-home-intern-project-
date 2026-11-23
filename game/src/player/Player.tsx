import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../game/store";
import { runtime } from "../game/runtime";
import { modeForKey } from "../game/economy";
import { ceilingHeightAt, collisionBoxes, groundHeightAt, WORLD_HALF } from "../world/map";
import { isHeld, moveInput, wasPressed } from "./input";
import { Character, Horse, JetpackRider, OUTFITS, SportsCar, Truck } from "./models";
import { MODES, stepBody, type World } from "./physics";

/** The player: reads input, runs the physics, and draws the model for the current gear. */
export function Player() {
  const mode = useGame((s) => s.mode);
  const stages = useGame((s) => s.stages);
  const ref = useRef<THREE.Group>(null);
  const world = useMemo<World>(() => ({ boxes: collisionBoxes(stages), groundAt: groundHeightAt, ceilingAt: ceilingHeightAt, half: WORLD_HALF - 4 }), [stages]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    runtime.time += dt;
    const g = useGame.getState();
    const busy = g.phase !== "playing" || g.dialog !== null || g.minigame !== null || g.shopOpen;

    // Hotbar: 1 walk, 2 truck, 3 horse, 4 sports car, 5 jetpack.
    if (!busy) {
      for (const k of ["1", "2", "3", "4", "5"]) {
        if (!wasPressed(`Digit${k}`)) continue;
        const next = modeForKey(k, g.owned);
        if (next) {
          g.setMode(next);
          runtime.body = { ...runtime.body, speed: 0 };
        } else g.toast("Buy that at the Gear Garage first (Sales Centre)");
      }
    }

    const input = busy ? { forward: 0, side: 0, up: false, sprint: false, cameraYaw: runtime.cameraYaw } : moveInput(runtime.cameraYaw);
    runtime.body = stepBody(runtime.body, input, g.mode, dt, world);

    const b = runtime.body;
    const grp = ref.current;
    if (grp) {
      grp.position.set(b.x, b.y, b.z);
      // Models face +x; three's rotation.y turns +x toward −z, so negate the heading.
      grp.rotation.y = -b.heading;
    }
  });

  const gait = () => Math.abs(runtime.body.speed) / MODES.walk.maxSpeed;
  const horseGait = () => Math.abs(runtime.body.speed) / MODES.horse.maxSpeed;
  const speed = () => runtime.body.speed;
  const thrust = () => (isHeld("Space") && runtime.body.fuel > 0 ? 1 : runtime.body.grounded ? 0 : 0.25);

  return (
    <group ref={ref} name="Player">
      {mode === "walk" && <Character outfit={OUTFITS.player} gait={gait} />}
      {mode === "truck" && <Truck speed={speed} />}
      {mode === "car" && <SportsCar speed={speed} />}
      {mode === "horse" && <Horse gait={horseGait} rider={OUTFITS.player} />}
      {mode === "jetpack" && <JetpackRider outfit={OUTFITS.player} gait={gait} thrust={thrust} />}
    </group>
  );
}
