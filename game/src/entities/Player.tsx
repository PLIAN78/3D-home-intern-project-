import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { simInput, wasPressed } from "../core/input";
import { runtime } from "../core/runtime";
import { sfx } from "../core/sfx";
import { host, useSim } from "../core/simHost";
import { useSimVersion } from "../core/simVersion";
import { Human } from "../models/human";
import { JetpackModel } from "../models/jetpack";
import type { AnimalId } from "../sim/animal";
import { IDLE_INPUT, type Ride, type Simulation } from "../sim/simulation";
import { VEHICLE_IDS } from "../sim/vehicle";
import { GEAR, HOTBAR_ORDER, isVehicle, nextCar, slotOwned, type GearId, type ModeId, type Owned } from "../story/economy";
import { VEHICLE_SPOTS } from "../story/missions";
import { useGame, type GameState } from "../story/store";
import { BOOST } from "../story/work";
import { MY_SEAT } from "../world/office";
import { useV6 } from "../story/v6Store";
import { LAKE_Y } from "../world/terrain";

/** Anything that takes over the screen (dialogs, panels, mini-games, the map) pauses the controls. */
export function isBusy(g: GameState) {
  return useV6.getState().panel !== null || useV6.getState().ride !== null || g.phase !== "playing" || g.dialog !== null || g.minigame !== null || g.shopOpen || g.mapOpen || g.panel !== null || g.job !== null;
}

/** What the hotbar shows as active, from what the player is controlling. */
export function modeOf(sim: Simulation): ModeId {
  const c = sim.control;
  if (c.kind === "vehicle" || c.kind === "animal") return c.id;
  if (c.kind === "heli") return "heli";
  if (c.kind === "boat") return "boat";
  if(c.kind==="plane")return "plane";
  return sim.player.jetpack ? "jetpack" : "walk";
}

/** Which piece of gear a ride is (to check you own it). */
export function gearOfRide(r: Exclude<Ride, { kind: "boat" }|{kind:"plane"}>): GearId {
  return r.kind === "heli" ? "heli" : r.id;
}

/** Can you get in or on this? The lake boat is free; the school bus is lent for the co-op run. */
export function canRide(r: Ride, g: GameState) {
  if (r.kind === "boat"||r.kind==="plane"||(r.kind==="heli"&&r.id)) return true;
  if (r.kind === "vehicle" && r.id === "bus") return g.coop === "hired" || g.coop === "riding" || g.coop === "done";
  return g.owned[gearOfRide(r)];
}

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
  const swimBlend = useRef(0);
  const wasSwimming = useRef(false);

  useFrame((_, rawDt) => {
    const s = host.sim;
    if (!s) return;
    const dt = Math.min(rawDt, 0.25);
    runtime.time += dt;
    const g = useGame.getState();
    const busy = isBusy(g);

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

    // Meal boosts change how fast you run and how long the jetpack lasts.
    const boost = g.boost && s.time < g.boost.until ? g.boost.kind : null;
    s.player.runBoost = boost === "run" || boost === "both" ? BOOST.run : 1;
    s.player.fuelBurn = boost === "fuel" || boost === "both" ? BOOST.fuelBurn : 1;
    g.tickBoost(s.time);

    // Sitting at your desk in the office: stay in the chair, facing the screen.
    if (g.panel === "desk" && s.control.kind === "foot") s.player.place(MY_SEAT.at[0], MY_SEAT.at[1], 0, MY_SEAT.heading);

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
      else if (e.kind === "police") g.toast(e.phase === "chase" ? "You hit a police cruiser! It's on your tail." : "The police gave up the chase.");
      else if (e.kind === "sunk") {
        // Towed out of the lake, back to where it parks.
        if (s.control.kind === "vehicle" && s.control.id === e.id) {
          const p = s.vehicles[e.id]!.position;
          s.control = { kind: "foot" };
          s.player.setActive(true);
          s.player.place(p.x, p.z, LAKE_Y - 1, 0);
        }
        const spot = VEHICLE_SPOTS[e.id];
        s.spawnVehicle(e.id, spot.position[0], spot.position[1], spot.heading);
        g.toast(`Your ${GEAR[e.id].name} went into the lake. A tow truck took it back to its parking spot.`);
        bump();
      }
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
    if (tilt.current) {
      // Swimming: lie flat in the water (head forward), bobbing a little.
      const swim = s.player.swimming && s.control.kind === "foot";
      swimBlend.current += ((swim ? 1 : 0) - swimBlend.current) * Math.min(1, dt * 5);
      const k = swimBlend.current, bob = Math.sin(performance.now() / 420) * 0.05 * k;
      tilt.current.rotation.set(-s.player.roll * (1 - k), 0, -s.player.pitch * (1 - k) - 1.38 * k);
      tilt.current.position.set(0, bob - 0.35 * k, 0);
      if (swim && !wasSwimming.current) g.toast("Swimming · Shift to swim faster");
      wasSwimming.current = swim;
    }
    if (jetVisible.current) jetVisible.current.visible = s.player.jetpack;
  }, -30);

  const outfit = useGame((g) => g.outfit);
  if (!sim) return null;
  const p = sim.player;
  return (
    <group ref={root} name="Player">
      <group position={[0, 1, 0]}>
        <group ref={tilt}>
          <group position={[0, -1, 0]}>
            <Human
              outfit={outfit}
              pose={() => (useGame.getState().panel === "desk" ? "sit" : p.swimming ? "swim" : "auto")}
              motion={{ speed: () => (p.grounded ? p.speed : 0), airborne: () => !p.grounded }}
            />
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
  if (isVehicle(id)) return { kind: "vehicle", id };
  return null;
}

function positionOf(s: Simulation, r: Ride) {
  if (r.kind === "heli") return r.id ? s.helis[r.id] ?? null : s.heli;
  if (r.kind === "boat") return s.boats[r.id??"lake-boat"];
  if(r.kind==="plane")return s.planes[r.id];
  if (r.kind === "animal") return s.animals[r.id] ?? null;
  const v = s.vehicles[r.id];
  return v ? v.position : null;
}

function handleControls(s: Simulation, g: ReturnType<typeof useGame.getState>, bump: () => void) {
  let c = s.control;
  const owned = g.owned as Owned;

  if (wasPressed("KeyF")) {
    if (c.kind !== "foot") {
      const f = s.focus();
      const airborne = (c.kind === "heli"||c.kind==="plane") && !f.grounded;
      if (Math.abs(f.speed) < 6 && !airborne) {
        if (s.exit()) {
          sfx("blip");
          bump();
        } else g.toast("Steer up to the shore or a jetty to get off");
      } else g.toast(airborne ? "Land first" : "Slow down to get out");
    } else {
      const ride = s.nearestRide((r) => canRide(r, g));
      if (ride && s.board(ride)) {
        sfx("switch");
        bump();
      }
    }
  }

  HOTBAR_ORDER.forEach((slot, i) => {
    if (!wasPressed(`Digit${i + 1}`)) return;
    // Out on the lake you have to get to shore before switching to anything else.
    if (s.control.kind === "boat" && !s.exit()) {
      g.toast("Steer up to the shore or a jetty first");
      return;
    }
    c = s.control;
    if (slot === "walk") {
      if (c.kind !== "foot") s.exit();
      s.setJetpack(false);
      bump();
      return;
    }
    if (!slotOwned(slot, owned)) {
      const gear = GEAR[slot];
      g.toast(gear.price === null ? `Find ${gear.name} first` : `Buy the ${gear.name} at the Gear Garage first`);
      return;
    }
    if (slot === "jetpack") {
      if (c.kind !== "foot") s.exit();
      s.setJetpack(!s.player.jetpack);
      sfx("switch");
      bump();
      return;
    }
    // Cars: 2 gets you into your selected car; pressing it again in a car switches to your next one.
    let gearId: GearId = slot === "car" ? g.car : slot;
    if (slot === "car" && c.kind === "vehicle") {
      const next = nextCar(owned, c.id);
      if (next === c.id) {
        g.toast("That's your only car. Ridge Motors on Caivan Boulevard sells more.");
        return;
      }
      g.selectCar(next);
      gearId = next;
    }
    if (slot === "car" && !owned[gearId]) gearId = "truck";
    const ride = rideFor(gearId);
    if (!ride) return;
    const already = (c.kind === "vehicle" || c.kind === "animal") && (ride.kind === "vehicle" || ride.kind === "animal") && c.id === ride.id;
    if (already || (c.kind === "heli" && ride.kind === "heli")) return;
    if (c.kind !== "foot") s.exit();
    // Close by? Just get in. Otherwise it comes to you.
    const at = positionOf(s, ride);
    const near = at && Math.hypot(at.x - s.player.x, at.z - s.player.z) < (ride.kind === "heli" ? 12 : 7);
    const name = GEAR[gearId].name;
    if (!near) {
      s.call(ride.kind === "vehicle" || ride.kind === "animal" ? ride.id : "heli");
      g.toast(ride.kind === "animal" ? `${name.split(" ")[0]} comes over` : `Your ${name} is here`);
    } else if (slot === "car") g.toast(name);
    s.board(ride);
    sfx("switch");
    bump();
  });
}
