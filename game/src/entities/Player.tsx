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
import type { AnimalId } from "../sim/animal";
import { IDLE_INPUT, type Ride, type Simulation } from "../sim/simulation";
import type { VehicleId } from "../sim/vehicle";
import { GEAR, HOTBAR_ORDER, type GearId, type ModeId, type Owned } from "../story/economy";
import { VEHICLE_SPOTS } from "../story/missions";
import { useGame } from "../story/store";

/** What the hotbar shows as active, from what the player is controlling. */
export function modeOf(sim: Simulation): ModeId {
  const c = sim.control;
  if (c.kind === "vehicle" || c.kind === "animal") return c.id;
  if (c.kind === "heli") return "heli";
  return sim.player.jetpack ? "jetpack" : "walk";
}

/** Which piece of gear a ride is (to check you own it). */
export function gearOfRide(r: Ride): GearId {
  return r.kind === "heli" ? "heli" : r.id;
}

const VEHICLE_IDS: VehicleId[] = ["truck", "car", "trail", "hauler"];
const ANIMAL_IDS: AnimalId[] = ["horse", "elephant"];

/**
 * Runs the simulation each frame and turns key presses into actions:
 *   F    get in / out of the nearest vehicle, onto an animal, into the helicopter
 *   1    on foot (get out, take the jetpack off)
 *   2–9  call that piece of gear to you and get in (5 puts the jetpack on)
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
    const busy = g.phase !== "playing" || g.dialog !== null || g.minigame !== null || g.shopOpen || g.mapOpen;

    // Bought gear is delivered to the Sales Centre lot.
    for (const id of VEHICLE_IDS) {
      if (g.owned[id] && !s.vehicles[id]) {
        const p = VEHICLE_SPOTS[id];
        s.spawnVehicle(id, p.position[0], p.position[1], p.heading);
        bump();
      }
    }
    if (g.owned.horse && !s.animals.horse) {
      const p = VEHICLE_SPOTS.horse;
      s.spawnAnimal("horse", p.position[0], p.position[1], p.heading);
      bump();
    }
    if (g.owned.heli && !s.heli) {
      const p = VEHICLE_SPOTS.heli;
      s.spawnHeli(p.position[0], p.position[1], p.heading);
      bump();
    }

    if (!busy) handleControls(s, g, bump);

    host.alpha = s.step(dt, busy ? { ...IDLE_INPUT, cameraYaw: runtime.cameraYaw } : simInput(runtime.cameraYaw));
    runtime.body = s.focus();

    for (const e of s.events.splice(0)) {
      if (e.kind === "tree-down") sfx("crash");
      else if (e.kind === "frame-down") {
        sfx("crash");
        useSimVersion.getState().setFrame(e.lotId, true);
      } else if (e.kind === "frame-back") useSimVersion.getState().setFrame(e.lotId, false);
      else if (e.kind === "landed-hard") {
        runtime.shake = Math.min(1, e.speed / 25);
        sfx("thud");
      } else if (e.kind === "crash") runtime.shake = Math.min(0.7, e.speed / 30);
    }

    const mode = modeOf(s);
    if (mode !== g.mode) g.setMode(mode);

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

function rideFor(id: GearId): Ride | null {
  if (id === "heli") return { kind: "heli" };
  if ((ANIMAL_IDS as string[]).includes(id)) return { kind: "animal", id: id as AnimalId };
  if ((VEHICLE_IDS as string[]).includes(id)) return { kind: "vehicle", id: id as VehicleId };
  return null;
}

function positionOf(s: Simulation, r: Ride) {
  if (r.kind === "heli") return s.heli;
  if (r.kind === "animal") return s.animals[r.id] ?? null;
  const v = s.vehicles[r.id];
  return v ? v.position : null;
}

function handleControls(s: Simulation, g: ReturnType<typeof useGame.getState>, bump: () => void) {
  const c = s.control;
  const owned = g.owned as Owned;

  if (wasPressed("KeyF")) {
    if (c.kind !== "foot") {
      const f = s.focus();
      const airborne = c.kind === "heli" && !f.grounded;
      if (Math.abs(f.speed) < 6 && !airborne) {
        s.exit();
        sfx("blip");
        bump();
      } else g.toast(airborne ? "Land first" : "Slow down to get out");
    } else {
      const ride = s.nearestRide((r) => owned[gearOfRide(r)]);
      if (ride && s.board(ride)) {
        sfx("switch");
        bump();
      }
    }
  }

  HOTBAR_ORDER.forEach((mode, i) => {
    if (!wasPressed(`Digit${i + 1}`)) return;
    if (mode === "walk") {
      if (c.kind !== "foot") s.exit();
      s.setJetpack(false);
      bump();
      return;
    }
    const gear = GEAR[mode];
    if (!owned[mode]) {
      g.toast(gear.price === null ? `Find ${gear.name} first` : `Buy the ${gear.name} at the Gear Garage first`);
      return;
    }
    if (mode === "jetpack") {
      if (c.kind !== "foot") s.exit();
      s.setJetpack(!s.player.jetpack);
      sfx("switch");
      bump();
      return;
    }
    const ride = rideFor(mode);
    if (!ride) return;
    const already = (c.kind === "vehicle" || c.kind === "animal") && ride.kind !== "heli" && c.id === ride.id;
    if (already || (c.kind === "heli" && ride.kind === "heli")) return;
    if (c.kind !== "foot") s.exit();
    // Close by? Just get in. Otherwise it comes to you.
    const at = positionOf(s, ride);
    const near = at && Math.hypot(at.x - s.player.x, at.z - s.player.z) < (ride.kind === "heli" ? 12 : 7);
    if (!near) {
      s.call(ride.kind === "heli" ? "heli" : ride.id);
      g.toast(ride.kind === "animal" ? `${gear.name.split(" ")[0]} comes over` : `Your ${gear.name} is here`);
    }
    s.board(ride);
    sfx("switch");
    bump();
  });
}
