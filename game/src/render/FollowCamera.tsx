import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cameraKeys, mouse } from "../core/input";
import { runtime } from "../core/runtime";
import { host } from "../core/simHost";
import { angleDelta } from "../sim/math";
import { terrainHeight } from "../world/terrain";

const target = new THREE.Vector3();
const desired = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const smoothLook = new THREE.Vector3();

/** Distance, height and field of view for each way of getting around. */
const RIG = {
  foot: { dist: 6.2, lift: 1.55, fov: 55 },
  jetpack: { dist: 8.5, lift: 1.5, fov: 58 },
  horse: { dist: 8, lift: 2.3, fov: 56 },
  elephant: { dist: 12, lift: 4.2, fov: 56 },
  truck: { dist: 9.5, lift: 2.1, fov: 56 },
  trail: { dist: 9.8, lift: 2.3, fov: 56 },
  hauler: { dist: 10.5, lift: 2.3, fov: 56 },
  car: { dist: 8.5, lift: 1.5, fov: 57 },
  roadster: { dist: 7.8, lift: 1.4, fov: 57 },
  coupe: { dist: 8.4, lift: 1.5, fov: 57 },
  super: { dist: 8.6, lift: 1.4, fov: 58 },
  suv: { dist: 9.6, lift: 2.0, fov: 56 },
  sedan: { dist: 9, lift: 1.7, fov: 56 },
  bus: { dist: 15, lift: 3.2, fov: 56 },
  plane: {dist:20,lift:3.3,fov:60},
  boat: { dist: 11, lift: 2.4, fov: 57 },
  heli: { dist: 17, lift: 2.4, fov: 58 },
};

/**
 * Third-person camera. Mouse drag (or arrow keys) orbits; wheel zooms. While
 * driving or riding it swings back behind you after you let go, widens the
 * field of view with speed, and never ends up inside a wall: it pulls in along
 * a ray against the physics world. Hard landings and crashes shake it.
 */
export function FollowCamera() {
  useFrame((state, rawDt) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const sim = host.sim;
    if (!sim) return;
    const dt = Math.min(rawDt, 1 / 15);
    const keys = cameraKeys();
    const c = sim.control;
    const kind = c.kind === "vehicle" || c.kind === "animal" ? c.id : c.kind === "heli" ? "heli" : c.kind==="plane"?"plane":c.kind==="boat"?"boat":sim.player.jetpack ? "jetpack" : "foot";
    const rig = RIG[kind];

    runtime.cameraYaw += mouse.dx * 0.005 + keys.yaw * 2.2 * dt;
    runtime.cameraPitch = THREE.MathUtils.clamp(runtime.cameraPitch + mouse.dy * 0.004 + keys.pitch * 1.2 * dt, -0.15, 1.3);
    runtime.cameraDistance = THREE.MathUtils.clamp(runtime.cameraDistance * (1 + mouse.wheel * 0.1), 0.5, 2.6);

    // Interpolated pose of whatever we follow.
    const pose = sim.pose(sim.focusName(), host.alpha);
    const f = runtime.body;
    const groundY = c.kind === "vehicle" ? pose.y - 1 : pose.y;

    const steered = c.kind !== "foot";
    const idle = performance.now() - mouse.lastMove > 1100 && keys.yaw === 0;
    const flying = (c.kind === "foot" && sim.player.jetpack && !sim.player.grounded) || ((c.kind === "heli"||c.kind==="plane") && !f.grounded);
    if ((steered || flying) && idle && Math.abs(f.speed) > 2) {
      const behind = f.speed < -1 ? f.heading + Math.PI : f.heading;
      runtime.cameraYaw += angleDelta(runtime.cameraYaw, behind) * Math.min(1, dt * (flying ? 1.2 : 2.2));
    }

    const speedK = THREE.MathUtils.clamp(Math.abs(f.speed) / 30, 0, 1);
    const dist = rig.dist * runtime.cameraDistance * (1 + speedK * 0.18);
    target.set(pose.x, groundY + rig.lift, pose.z);
    const cp = Math.cos(runtime.cameraPitch);
    desired.set(target.x - Math.cos(runtime.cameraYaw) * dist * cp, target.y + Math.sin(runtime.cameraPitch) * dist, target.z - Math.sin(runtime.cameraYaw) * dist * cp);

    // Collision: shorten the boom so the camera stays outside walls and trees.
    const free = sim.cameraRay(target, desired);
    const want = Math.max(0.6, free - 0.35);
    const len = target.distanceTo(desired);
    if (want < len) desired.lerpVectors(target, desired, want / len);
    desired.y = Math.max(desired.y, groundY + 0.4, terrainHeight(desired.x, desired.z) + 0.6);

    const follow = 1 - Math.exp(-dt * (steered ? 7 : 11));
    const transferred=camera.position.distanceTo(target)>120;
    camera.position.lerp(desired, transferred||want < len ? 1 : follow);
    if(transferred)smoothLook.copy(target);

    // Shake from impacts.
    if (runtime.shake > 0.001) {
      const k = runtime.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * k;
      camera.position.y += (Math.random() - 0.5) * k;
      runtime.shake *= Math.exp(-dt * 6);
    }

    lookAt.set(target.x + Math.cos(f.heading) * speedK * 2.5, target.y, target.z + Math.sin(f.heading) * speedK * 2.5);
    smoothLook.lerp(lookAt, smoothLook.lengthSq() === 0 ? 1 : 1 - Math.exp(-dt * 14));
    camera.lookAt(smoothLook);

    const fov = rig.fov + speedK * 12;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
  }, -20);
  return null;
}

