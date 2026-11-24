import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { simInput, wasPressed } from "../core/input";
import { runtime } from "../core/runtime";
import { sfx } from "../core/sfx";
import { host, useSim } from "../core/simHost";
import { useSimVersion } from "../core/simVersion";
import { Human, OUTFITS } from "../models/human";
import { JetpackModel } from "../models/jetpack";
import { IDLE_INPUT, type Simulation } from "../sim/simulation";
import { VEHICLES } from "../sim/vehicle";
import { GEAR, type ModeId } from "../story/economy";
import { VEHICLE_SPOTS } from "../story/missions";
import { useGame } from "../story/store";

/** What the hotbar shows as active, from what the player is controlling. */
function modeOf(sim: Simulation): ModeId {
  const c = sim.control;
  if (c.kind === "vehicle") return c.id;
  if (c.kind === "horse") return "horse";
  return sim.player.jetpack ? "jetpack" : "walk";
}

/**
 * Runs the simulation each frame and turns key presses into actions:
 *   F  get in / out of the nearest vehicle or onto the horse
 *   1  on foot (get out, take the jetpack off)
 *   2/4  call the pickup / sports car to you (or get in if it's right here)
 *   3  whistle for Biscuit
 *   5  jetpack on / off
 * Then draws the character when on foot.
 */
export function Player() {
  const sim = useSim();
  const bump = useSimVersion((s) => s.bump);
  const root = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const jetVisible = useRef<THREE.Group>(null);

  useFrame((_, rawDt) => {
    const s = host.sim;
    if (!s) return;
    const dt = Math.min(rawDt, 0.25);
    runtime.time += dt;
    const g = useGame.getState();
    const busy = g.phase !== "playing" || g.dialog !== null || g.minigame !== null || g.shopOpen;

    // Bought gear shows up at the Sales Centre lot.
    if (g.owned.car && !s.vehicles.car) {
      const p = VEHICLE_SPOTS.car;
      s.spawnVehicle("car", p.position[0], p.position[1], p.heading);
      bump();
    }
    if (g.owned.horse && !s.horse) {
      const p = VEHICLE_SPOTS.horse;
      s.spawnHorse(p.position[0], p.position[1], p.heading);
      bump();
    }

    if (!busy) handleControls(s, g, bump);

    host.alpha = s.step(dt, busy ? { ...IDLE_INPUT, cameraYaw: runtime.cameraYaw } : simInput(runtime.cameraYaw));
    runtime.body = s.focus();

    // Feedback for physical events.
    for (const e of s.events.splice(0)) {
      if (e.kind === "tree-down") sfx("crash");
      else if (e.kind === "frame-down") {
        sfx("crash");
        useSimVersion.getState().setFrame(e.lotId, true);
      } else if (e.kind === "frame-back") useSimVersion.getState().setFrame(e.lotId, false);
      else if (e.kind === "landed-hard") {
        runtime.shake = Math.min(1, e.speed / 25);
        sfx("thud");
      }
      else if (e.kind === "crash") runtime.shake = Math.min(0.7, e.speed / 30);
    }

    const mode = modeOf(s);
    if (mode !== g.mode) g.setMode(mode);

    // Draw the character on foot (in vehicles, the vehicle draws the driver).
    const grp = root.current;
    if (grp) {
      grp.visible = s.control.kind === "foot";
      const pose = s.pose("player", host.alpha);
      grp.position.set(pose.x, pose.y, pose.z);
      grp.quaternion.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);
    }
    if (tilt.current) tilt.current.rotation.set(-s.player.roll, 0, -s.player.pitch);
    if (jetVisible.current) jetVisible.current.visible = s.player.jetpack;
  }, -30);

  if (!sim) return null;
  const p = sim.player;
  return (
    <group ref={root} name="Player">
      <group position={[0, 1, 0]}>
        <group ref={tilt}>
          <group position={[0, -1, 0]}>
            <Human outfit={OUTFITS.player} motion={{ speed: () => (p.grounded ? p.speed : 0), airborne: () => !p.grounded }} />
            <group ref={jetVisible} visible={false}>
              <JetpackModel thrust={() => (p.thrusting ? 1 : 0)} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

function handleControls(s: Simulation, g: ReturnType<typeof useGame.getState>, bump: () => void) {
  const c = s.control;
  const ride = s.nearestRide();

  if (wasPressed("KeyF")) {
    if (c.kind !== "foot") {
      if (Math.abs(s.focus().speed) < 6) {
        s.exit();
        sfx("blip");
        bump();
      } else g.toast("Slow down to get out");
    } else if (ride) {
      if (ride.kind === "vehicle") s.enterVehicle(ride.id);
      else s.mountHorse();
      sfx("switch");
      bump();
    }
  }

  const keys = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"] as const;
  for (const k of keys) {
    if (!wasPressed(k)) continue;
    if (k === "Digit1") {
      if (c.kind !== "foot") s.exit();
      s.setJetpack(false);
      bump();
      continue;
    }
    if (k === "Digit5") {
      if (!g.owned.jetpack) {
        g.toast("Buy the SkyHopper jetpack at the Gear Garage first");
        continue;
      }
      if (c.kind !== "foot") s.exit();
      s.setJetpack(!s.player.jetpack);
      sfx("switch");
      bump();
      continue;
    }
    const id = k === "Digit2" ? "truck" : k === "Digit4" ? "car" : "horse";
    if (!g.owned[id]) {
      g.toast(`Buy ${GEAR[id].name} at the Gear Garage first`);
      continue;
    }
    if ((c.kind === "vehicle" && c.id === id) || (c.kind === "horse" && id === "horse")) continue;
    if (c.kind !== "foot") s.exit();
    // Close by? Just get in. Otherwise it comes to you.
    const near = id === "horse" ? s.horse && Math.hypot(s.horse.x - s.player.x, s.horse.z - s.player.z) < 6 : s.vehicles[id] && Math.hypot(s.vehicles[id]!.position.x - s.player.x, s.vehicles[id]!.position.z - s.player.z) < 7;
    if (!near) {
      s.call(id);
      g.toast(id === "horse" ? "Biscuit trots over" : `Your ${id === "truck" ? VEHICLES.truck.name.toLowerCase() : VEHICLES.car.name} pulls up`);
    }
    if (id === "horse") s.mountHorse();
    else s.enterVehicle(id);
    sfx("switch");
    bump();
  }
}
