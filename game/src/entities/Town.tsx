import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { runtime } from "../core/runtime";
import { useSim } from "../core/simHost";
import { Human, OUTFITS, TOWNSFOLK } from "../models/human";
import { CarBody, TruckBody, Wheel } from "../models/vehicles";
import { angleDelta } from "../sim/math";
import type { TrafficCar, Walker } from "../sim/town";
import { VEHICLES } from "../sim/vehicle";
import { ROSA } from "../story/sidequests";

/**
 * Town life: traffic on the streets and people on the sidewalks. Their motion
 * comes from the simulation (sim/town.ts); here they are only drawn, and hidden
 * beyond a comfortable distance so a full town stays cheap.
 */

const DRAW_CAR = 260;
const DRAW_WALKER = 140;

/** Height of the chassis origin above the road at rest, and each wheel hub's offset from it. */
function rig(model: "car" | "truck") {
  const spec = VEHICLES[model];
  const sag = spec.suspensionRest * 0.72;
  return {
    ride: spec.wheelRadius + sag - spec.wheelY,
    hubs: [
      [spec.wheelFront, spec.wheelY - sag, spec.track],
      [spec.wheelFront, spec.wheelY - sag, -spec.track],
      [spec.wheelRear, spec.wheelY - sag, spec.track],
      [spec.wheelRear, spec.wheelY - sag, -spec.track],
    ] as [number, number, number][],
    radius: spec.wheelRadius,
  };
}

const RIGS = { car: rig("car"), truck: rig("truck") };

function TrafficCarView({ car }: { car: TrafficCar }) {
  const root = useRef<THREE.Group>(null);
  const wheels = useRef<(THREE.Group | null)[]>([]);
  const camera = useThree((s) => s.camera);
  const r = RIGS[car.model];
  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const far = Math.hypot(camera.position.x - car.x, camera.position.z - car.z) > DRAW_CAR;
    g.visible = !far;
    if (far) return;
    g.position.set(car.x, r.ride, car.z);
    g.rotation.set(0, -car.heading, 0);
    for (const w of wheels.current) if (w?.children[0]) w.children[0].rotation.z = -car.spin;
  });
  return (
    <group ref={root}>
      {car.model === "truck" ? <TruckBody color={car.color} livery={false} /> : <CarBody color={car.color} />}
      {r.hubs.map((h, i) => (
        <group key={i} position={h}>
          <Wheel
            ref={(el) => {
              wheels.current[i] = el;
            }}
            radius={r.radius}
            side={i % 2 === 0 ? 1 : -1}
            rimColor={car.model === "truck" ? "#9aa1aa" : "#c9ccd1"}
          />
        </group>
      ))}
    </group>
  );
}

function WalkerView({ walker }: { walker: Walker }) {
  const root = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const far = Math.hypot(camera.position.x - walker.x, camera.position.z - walker.z) > DRAW_WALKER;
    g.visible = !far;
    if (far) return;
    g.position.set(walker.x, 0, walker.z);
    g.rotation.y = -walker.heading;
  });
  return (
    <group ref={root}>
      <Human outfit={TOWNSFOLK[walker.outfit % TOWNSFOLK.length]} motion={{ speed: () => walker.moving * walker.speed }} />
    </group>
  );
}

export function Town() {
  const sim = useSim();
  const town = sim?.town;
  if (!town) return null;
  return (
    <group name="Town">
      {town.cars.map((c) => (
        <TrafficCarView key={c.id} car={c} />
      ))}
      {town.walkers.map((w) => (
        <WalkerView key={w.id} walker={w} />
      ))}
      <Rosa />
    </group>
  );
}

/** Rosa on her cottage porch: turns to face you when you walk up. */
function Rosa() {
  const ref = useRef<THREE.Group>(null);
  const near = useRef(false);
  useFrame((_, dt) => {
    const b = runtime.body;
    const dx = b.x - ROSA.position[0];
    const dz = b.z - ROSA.position[1];
    near.current = Math.hypot(dx, dz) < 14;
    const g = ref.current;
    if (!g) return;
    const want = near.current ? Math.atan2(dz, dx) : ROSA.facing;
    const cur = -g.rotation.y;
    g.rotation.y = -(cur + angleDelta(cur, want) * Math.min(1, dt * 4));
  });
  return (
    <group position={[ROSA.position[0], ROSA.y, ROSA.position[1]]}>
      <group ref={ref} rotation={[0, -ROSA.facing, 0]}>
        <Human outfit={OUTFITS.rosa} pose={() => (near.current ? "wave" : "auto")} />
      </group>
    </group>
  );
}
