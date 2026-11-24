import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { host, useSim } from "../core/simHost";
import { useSimVersion } from "../core/simVersion";
import { HorseModel } from "../models/animals";
import { Human, OUTFITS } from "../models/human";
import { BODY_COLORS, CarBody, DRIVER_SEAT, TruckBody, Wheel } from "../models/vehicles";
import { lumber } from "../render/materials";
import { VEHICLES, type VehicleId } from "../sim/vehicle";

/** Every vehicle in the world, each a separate physics body that stays where it's parked. */
export function Vehicles() {
  const sim = useSim();
  useSimVersion((s) => s.version);
  if (!sim) return null;
  return (
    <>
      {(Object.keys(sim.vehicles) as VehicleId[]).map((id) => (
        <VehicleEntity key={id} id={id} />
      ))}
      {sim.horse && <HorseEntity />}
      <Debris />
    </>
  );
}

function VehicleEntity({ id }: { id: VehicleId }) {
  const root = useRef<THREE.Group>(null);
  const wheels = useRef<(THREE.Group | null)[]>([]);
  const driver = useRef<THREE.Group>(null);
  const spec = VEHICLES[id];
  const hubs = useMemo(
    () => [
      [spec.wheelFront, spec.wheelY, spec.track],
      [spec.wheelFront, spec.wheelY, -spec.track],
      [spec.wheelRear, spec.wheelY, spec.track],
      [spec.wheelRear, spec.wheelY, -spec.track],
    ],
    [spec],
  );

  useFrame(() => {
    const s = host.sim;
    const v = s?.vehicles[id];
    if (!s || !v || !root.current) return;
    const p = s.pose(id, host.alpha);
    root.current.position.set(p.x, p.y, p.z);
    root.current.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
    for (let i = 0; i < 4; i++) {
      const w = wheels.current[i];
      if (!w) continue;
      const st = v.wheel(i);
      const [x, y, z] = hubs[i];
      w.position.set(x, y - st.suspension, z);
      w.rotation.set(0, st.steer, 0);
      const spin = w.children[0];
      if (spin) spin.rotation.z = -st.spin;
    }
    if (driver.current) driver.current.visible = s.control.kind === "vehicle" && s.control.id === id;
  });

  const seat = DRIVER_SEAT[id];
  return (
    <group ref={root} name={`vehicle-${id}`}>
      {id === "truck" ? <TruckBody color={BODY_COLORS.truck} /> : <CarBody color={BODY_COLORS.car} />}
      {hubs.map((_, i) => (
        <Wheel
          key={i}
          ref={(el) => {
            wheels.current[i] = el;
          }}
          radius={spec.wheelRadius}
          width={id === "truck" ? 0.32 : 0.3}
          side={i % 2 === 0 ? 1 : -1}
          rimColor={id === "truck" ? "#9aa1aa" : "#2b2d31"}
        />
      ))}
      <group ref={driver} position={seat} visible={false}>
        <Human outfit={OUTFITS.player} pose="sit" />
      </group>
    </group>
  );
}

function HorseEntity() {
  const root = useRef<THREE.Group>(null);
  const riderOn = useRef(false);
  useFrame(() => {
    const s = host.sim;
    if (!s?.horse || !root.current) return;
    const p = s.pose("horse", host.alpha);
    root.current.position.set(p.x, p.y, p.z);
    root.current.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
    riderOn.current = s.control.kind === "horse";
    const rider = root.current.getObjectByName("rider");
    if (rider) rider.visible = riderOn.current;
  });
  const speed = () => host.sim?.horse?.speed ?? 0;
  return (
    <group ref={root} name="horse">
      <HorseModel speed={speed} />
      <group name="rider" visible={false}>
        <group position={[0.02, 0.9, 0]}>
          <Human outfit={OUTFITS.player} pose="ride" motion={{ speed }} />
        </group>
      </group>
    </group>
  );
}

const MAX_PLANKS = 400;
const plankGeo = new THREE.BoxGeometry(1, 1, 1);
const tmp = new THREE.Object3D();

/** Loose studs and plates from smashed frames, drawn in one instanced mesh. */
function Debris() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useFrame(() => {
    const s = host.sim;
    const m = mesh.current;
    if (!s || !m) return;
    let n = 0;
    for (const plank of s.breakables.planks()) {
      if (n >= MAX_PLANKS) break;
      const t = plank.body.translation();
      const q = plank.body.rotation();
      tmp.position.set(t.x, t.y, t.z);
      tmp.quaternion.set(q.x, q.y, q.z, q.w);
      tmp.scale.set(plank.half[0] * 2, plank.half[1] * 2, plank.half[2] * 2);
      tmp.updateMatrix();
      m.setMatrixAt(n++, tmp.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[plankGeo, lumber(), MAX_PLANKS]} castShadow receiveShadow frustumCulled={false} />;
}
