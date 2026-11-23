import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { runtime } from "../game/runtime";
import { useGame } from "../game/store";
import { angleDelta, MODES } from "./physics";
import { cameraKeys, mouse } from "./input";

const target = new THREE.Vector3();
const desired = new THREE.Vector3();

/** Distance and height behind the player for each gear. */
const RIG: Record<string, { dist: number; lift: number }> = {
  walk: { dist: 7, lift: 1.6 },
  horse: { dist: 9, lift: 2.2 },
  truck: { dist: 11, lift: 2.2 },
  car: { dist: 11, lift: 1.6 },
  jetpack: { dist: 9, lift: 1.6 },
};

/**
 * Third-person camera. Mouse drag (or arrow keys) orbits; wheel zooms. Behind
 * the wheel (and on the horse) it swings back behind you after you let go of
 * the mouse, like most driving games.
 */
export function FollowCamera() {
  const camera = useThree((s) => s.camera);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const mode = useGame.getState().mode;
    const b = runtime.body;
    const keys = cameraKeys();

    runtime.cameraYaw += mouse.dx * 0.005 + keys.yaw * 2.2 * dt;
    runtime.cameraPitch = THREE.MathUtils.clamp(runtime.cameraPitch + mouse.dy * 0.004 + keys.pitch * 1.2 * dt, 0.05, 1.25);
    runtime.cameraDistance = THREE.MathUtils.clamp(runtime.cameraDistance * (1 + mouse.wheel * 0.1), 0.6, 2.4);

    const steered = MODES[mode].steered;
    const idle = performance.now() - mouse.lastMove > 900 && keys.yaw === 0;
    if (steered && idle && Math.abs(b.speed) > 1) {
      runtime.cameraYaw += angleDelta(runtime.cameraYaw, b.heading) * Math.min(1, dt * 2.5);
    }

    const rig = RIG[mode] ?? RIG.walk;
    const dist = rig.dist * runtime.cameraDistance;
    target.set(b.x, b.y + rig.lift, b.z);
    const cp = Math.cos(runtime.cameraPitch);
    desired.set(target.x - Math.cos(runtime.cameraYaw) * dist * cp, target.y + Math.sin(runtime.cameraPitch) * dist, target.z - Math.sin(runtime.cameraYaw) * dist * cp);
    desired.y = Math.max(desired.y, b.y + 0.6, 0.8);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 10));
    camera.lookAt(target);
  });
  return null;
}
