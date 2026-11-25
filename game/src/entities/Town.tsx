import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { runtime } from "../core/runtime";
import { useSim } from "../core/simHost";
import { Human, OUTFITS, TOWNSFOLK } from "../models/human";
import { CarBody, TruckBody, Wheel } from "../models/vehicles";
import { ModelCar } from "../models/cars";
import { mat } from "../render/materials";
import { Decal } from "../render/decal";
import { angleDelta } from "../sim/math";
import type { TrafficCar, Walker } from "../sim/town";
import { VEHICLES, type VehicleId } from "../sim/vehicle";
import { ROSA } from "../story/sidequests";
import type { Outfit } from "../models/human";
import { STAFF, type StaffId } from "../world/office";

/**
 * Town life: traffic on the streets and people on the sidewalks. Their motion
 * comes from the simulation (sim/town.ts); here they are only drawn, and hidden
 * beyond a comfortable distance so a full town stays cheap.
 */

const DRAW_CAR = 260;
const DRAW_WALKER = 140;

/** Height of the chassis origin above the road at rest, and each wheel hub's offset from it. */
function rig(model: VehicleId) {
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

/** Traffic is a mix of everyday cars; the physics box is the same, only the look changes. */
const LOOKS: VehicleId[] = ["sedan", "suv", "car", "sedan", "coupe", "suv", "roadster", "sedan"];
const lookOf = (car: TrafficCar): VehicleId => (car.model === "truck" ? "truck" : car.model === "police" ? "sedan" : LOOKS[car.id % LOOKS.length]);
const RIGS = Object.fromEntries((["truck", ...new Set(LOOKS)] as VehicleId[]).map((id) => [id, rig(id)])) as Record<VehicleId, ReturnType<typeof rig>>;

function TrafficCarView({ car, y = 0 }: { car: TrafficCar; y?: number }) {
  const root = useRef<THREE.Group>(null);
  const wheels = useRef<(THREE.Group | null)[]>([]);
  const camera = useThree((s) => s.camera);
  const look = lookOf(car);
  const r = RIGS[look];
  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const far = Math.hypot(camera.position.x - car.x, camera.position.z - car.z) > DRAW_CAR;
    g.visible = !far;
    if (far) return;
    g.position.set(car.x, y + r.ride, car.z);
    g.rotation.set(0, -car.heading, 0);
    for (const w of wheels.current) if (w?.children[0]) w.children[0].rotation.z = -car.spin;
  });
  return (
    <group ref={root}>
      {look === "truck" ? <TruckBody color={car.color} livery={false} /> : look === "car" ? <CarBody color={car.color} /> : <ModelCar id={look} color={car.color} />}
      {car.model === "police" && <PoliceKit car={car} />}
      {r.hubs.map((h, i) => (
        <group key={i} position={h}>
          <Wheel
            ref={(el) => {
              wheels.current[i] = el;
            }}
            radius={r.radius}
            side={i % 2 === 0 ? 1 : -1}
            rimColor={look === "truck" ? "#9aa1aa" : "#c9ccd1"}
          />
        </group>
      ))}
    </group>
  );
}

/**
 * A police cruiser, on the white sedan: black door panels lettered POLICE with
 * a blue pinstripe, a push bar, a roof light bar (red and blue, flashing; fast
 * when it's chasing you), grille lights, a door spotlight and an antenna.
 * Sedan-local coordinates (roof at y 0.6 from x −0.9 to 0.3, sides at ±0.93).
 */
function PoliceKit({ car }: { car: TrafficCar }) {
  const red = useRef<THREE.Group>(null), blue = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const rate = car.chase?.phase === "chase" ? 9 : 2.6;
    const on = Math.floor(clock.elapsedTime * rate) % 2 === 0;
    if (red.current) red.current.visible = on;
    if (blue.current) blue.current.visible = !on;
  });
  const black = mat("#121417", { rough: 0.45 });
  const redLens = mat("#ff2a2a", { emissive: "#ff2a2a", emissiveIntensity: 3.2 });
  const blueLens = mat("#2a6bff", { emissive: "#2a6bff", emissiveIntensity: 3.2 });
  const offLens = mat("#3b2a2e", { rough: 0.3 });
  return (
    <group>
      {[1, -1].map((s) => (
        <group key={s}>
          {/* Black door panels and the blue pinstripe above them. */}
          <mesh position={[-0.15, -0.28, s * 0.94]} material={black}><boxGeometry args={[2.5, 0.4, 0.02]} /></mesh>
          <mesh position={[0, -0.04, s * 0.941]} material={mat("#1f4fbf", { rough: 0.35 })}><boxGeometry args={[4.5, 0.05, 0.02]} /></mesh>
          <Decal text="POLICE" color="#f4f4f2" position={[-0.15, -0.28, s * 0.952]} rotation={[0, s > 0 ? 0 : Math.PI, 0]} height={0.24} />
          {/* Unit number on the rear quarter. */}
          <Decal text="12" color="#1f4fbf" position={[-1.85, -0.05, s * 0.945]} rotation={[0, s > 0 ? 0 : Math.PI, 0]} height={0.16} />
        </group>
      ))}
      {/* Push bar on the front bumper. */}
      {[-0.42, 0.42].map((z) => <mesh key={z} position={[2.47, -0.28, z]} material={black}><boxGeometry args={[0.08, 0.5, 0.08]} /></mesh>)}
      <mesh position={[2.5, -0.1, 0]} material={black}><boxGeometry args={[0.08, 0.08, 1.05]} /></mesh>
      <mesh position={[2.5, -0.42, 0]} material={black}><boxGeometry args={[0.08, 0.08, 1.05]} /></mesh>
      {/* Light bar: a dark base with a red half and a blue half; the lit half alternates. */}
      <group position={[-0.32, 0.64, 0]}>
        <mesh material={black}><boxGeometry args={[0.36, 0.07, 1.42]} /></mesh>
        <mesh position={[0, 0.07, 0.34]} material={offLens}><boxGeometry args={[0.3, 0.1, 0.62]} /></mesh>
        <mesh position={[0, 0.07, -0.34]} material={offLens}><boxGeometry args={[0.3, 0.1, 0.62]} /></mesh>
        <group ref={red}><mesh position={[0, 0.072, 0.34]} material={redLens}><boxGeometry args={[0.31, 0.105, 0.6]} /></mesh></group>
        <group ref={blue}><mesh position={[0, 0.072, -0.34]} material={blueLens}><boxGeometry args={[0.31, 0.105, 0.6]} /></mesh></group>
        <mesh position={[0.16, 0.07, 0]} material={mat("#f6f3e6", { emissive: "#f6f3e6", emissiveIntensity: 0.8 })}><boxGeometry args={[0.04, 0.06, 0.12]} /></mesh>
      </group>
      {/* Grille lights. */}
      <mesh position={[2.41, -0.2, 0.2]} material={redLens}><boxGeometry args={[0.03, 0.05, 0.14]} /></mesh>
      <mesh position={[2.41, -0.2, -0.2]} material={blueLens}><boxGeometry args={[0.03, 0.05, 0.14]} /></mesh>
      {/* Door spotlight and antenna. */}
      <mesh position={[0.6, 0.2, 0.98]} rotation={[0, 0, Math.PI / 2]} material={mat("#c9ccd1", { metal: 0.6, rough: 0.3 })}><cylinderGeometry args={[0.06, 0.07, 0.16, 10]} /></mesh>
      <mesh position={[-1.95, 0.5, 0.3]} material={black}><cylinderGeometry args={[0.008, 0.008, 0.65, 4]} /></mesh>
    </group>
  );
}

function WalkerView({ walker, y = 0 }: { walker: Walker; y?: number }) {
  const root = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const far = Math.hypot(camera.position.x - walker.x, camera.position.z - walker.z) > DRAW_WALKER;
    g.visible = !far;
    if (far) return;
    g.position.set(walker.x, y, walker.z);
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
  const city = sim?.cityTown;
  if (!town) return null;
  return (
    <group name="Town">
      {town.cars.map((c) => (
        <TrafficCarView key={c.id} car={c} />
      ))}
      {town.walkers.map((w) => (
        <WalkerView key={w.id} walker={w} />
      ))}
      {/* Downtown Owawa, up on its plateau */}
      {city?.cars.map((c) => (
        <TrafficCarView key={`city-${c.id}`} car={c} y={city.y} />
      ))}
      {city?.walkers.map((w) => (
        <WalkerView key={`city-${w.id}`} walker={w} y={city.y} />
      ))}
      <Rosa />
      {(Object.keys(STAFF) as StaffId[]).map((id) => (
        <Staff key={id} id={id} />
      ))}
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

const STAFF_LOOKS: Record<StaffId, Outfit> = {
  jordan: { skin: "#8d5a3b", shirt: "#e9e4da", pants: "#2c2f36", shoes: "#1f1f22", hair: "#151010", longHair: true },
  daniel: { skin: "#5c3b28", shirt: "#2c3440", pants: "#2a2d33", shoes: "#1a1a1a", hair: "#0f0c0a" },
  mei: { skin: "#e8c4a0", shirt: "#56705a", pants: "#3a3f4a", shoes: "#2a2a2a", hair: "#121010", longHair: true },
  lucas: { skin: "#e0b08f", shirt: "#8a4a5c", pants: "#4a5160", shoes: "#3a2a20", hair: "#7a5432" },
  sofia: { skin: "#c68863", shirt: "#d8d2c4", pants: "#1f3a5f", shoes: "#2a2a2a", hair: "#2b1d14", longHair: true },
};

/** People at work in the Caivan office. Standing staff turn to face you as you come over. */
function Staff({ id }: { id: StaffId }) {
  const st = STAFF[id];
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || st.sitting) return;
    const b = runtime.body;
    const dx = b.x - st.at[0];
    const dz = b.z - st.at[1];
    const want = Math.hypot(dx, dz) < 7 ? Math.atan2(dz, dx) : st.facing;
    const cur = -g.rotation.y;
    g.rotation.y = -(cur + angleDelta(cur, want) * Math.min(1, dt * 4));
  });
  return (
    <group position={[st.at[0], 0, st.at[1]]}>
      <group ref={ref} rotation={[0, -st.facing, 0]}>
        <Human outfit={STAFF_LOOKS[id]} pose={st.sitting ? "sit" : "auto"} />
      </group>
    </group>
  );
}
