import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { host, useSim } from "../core/simHost";
import { useSimVersion } from "../core/simVersion";
import { ElephantModel, HorseModel } from "../models/animals";
import { HeliModel } from "../models/heli";
import { ModelCar } from "../models/cars";
import { BusShell } from "../models/bus";
import {JetSkiModel,JETSKI_COLORS} from "../models/jetski";
import {LightPlaneModel} from "../models/planes";
import {PLANE_SPOTS,type PlaneId} from "../sim/plane";
import { BoatModel } from "../models/boat";
import { Human } from "../models/human";
import { useGame } from "../story/store";
import { SAM_LOOK } from "../story/quests";
import { BODY_COLORS, BODY_SCALE, CarBody, DRIVER_SEAT, TruckBody, Wheel } from "../models/vehicles";
import { chrome, lumber, mat } from "../render/materials";
import type { AnimalId } from "../sim/animal";
import { VEHICLES, type VehicleId } from "../sim/vehicle";

/** Every vehicle, animal and the helicopter: each a separate physics body that stays where it's left. */
export function Vehicles() {
  const sim = useSim();
  useSimVersion((s) => s.version);
  if (!sim) return null;
  return (
    <>
      {(Object.keys(sim.vehicles) as VehicleId[]).map((id) => (
        <VehicleEntity key={id} id={id} />
      ))}
      {(Object.keys(sim.animals) as AnimalId[]).map((id) => (
        <AnimalEntity key={id} id={id} />
      ))}
      {sim.heli && <HeliEntity />}
      {Object.keys(sim.helis).map((id) => <ParkedHeliEntity key={id} id={id} />)}
      {Object.keys(sim.boats).map(id=><BoatEntity key={id} id={id}/>)}
      {(Object.keys(sim.planes) as PlaneId[]).map(id=><PlaneEntity key={id} id={id}/>)}
      <Debris />
    </>
  );
}

/** Extra parts that make each pickup its own truck. */
function Extras({ id }: { id: VehicleId }) {
  const black = mat("#141518", { rough: 0.55, metal: 0.3 });
  if (id === "trail")
    return (
      <group>
        {/* Roof rack with a light bar, a front bull bar and a spare wheel in the bed. */}
        <mesh material={black} position={[-0.15, 0.97, 0]}>
          <boxGeometry args={[1.05, 0.05, 1.7]} />
        </mesh>
        {[-0.62, 0.32].map((x) => (
          <mesh key={x} material={black} position={[x, 0.93, 0]}>
            <boxGeometry args={[0.06, 0.08, 1.72]} />
          </mesh>
        ))}
        <mesh material={mat("#f4f1e8", { emissive: "#fff3d0", emissiveIntensity: 0.4 })} position={[0.42, 0.97, 0]}>
          <boxGeometry args={[0.08, 0.1, 1.3]} />
        </mesh>
        <mesh material={black} position={[2.86, -0.18, 0]}>
          <boxGeometry args={[0.1, 0.5, 1.5]} />
        </mesh>
        {[-0.5, 0.5].map((z) => (
          <mesh key={z} material={black} position={[2.82, 0.0, z]}>
            <boxGeometry args={[0.16, 0.08, 0.08]} />
          </mesh>
        ))}
        <mesh material={mat("#151617", { rough: 0.9 })} position={[-1.9, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.36, 0.14, 10, 22]} />
        </mesh>
      </group>
    );
  if (id === "hauler")
    return (
      <group>
        {/* Chrome grille surround, running boards and cab marker lights. */}
        <mesh material={chrome()} position={[2.96, -0.06, 0]}>
          <boxGeometry args={[0.05, 0.42, 1.5]} />
        </mesh>
        {[1, -1].map((side) => (
          <mesh key={side} material={black} position={[0.1, -0.5, side * 1.1]}>
            <boxGeometry args={[1.6, 0.05, 0.2]} />
          </mesh>
        ))}
        {[-0.25, 0, 0.25].map((z) => (
          <mesh key={z} material={mat("#ffb347", { emissive: "#ff9a1f", emissiveIntensity: 0.8 })} position={[0.38, 0.97, z]}>
            <boxGeometry args={[0.06, 0.04, 0.1]} />
          </mesh>
        ))}
      </group>
    );
  return null;
}

const RIMS: Record<VehicleId, string> = { truck: "#9aa1aa", trail: "#1b1c1f", hauler: "#d8dbe0", car: "#2b2d31", roadster: "#c9ccd1", coupe: "#d8dbe0", super: "#1b1c1f", suv: "#8f959c", sedan: "#b4b9bf", bus: "#d8dbe0" };

function VehicleEntity({ id }: { id: VehicleId }) {
  const outfit = useGame((g) => g.outfit);
  const root = useRef<THREE.Group>(null);
  const wheels = useRef<(THREE.Group | null)[]>([]);
  const driver = useRef<THREE.Group>(null);
  const student = useRef<THREE.Group>(null);
  const spec = VEHICLES[id];
  // The Haul HD runs dual rear wheels: two extra hubs just outboard of the rear pair.
  const hubs = useMemo(() => {
    const h: [number, number, number][] = [
      [spec.wheelFront, spec.wheelY, spec.track],
      [spec.wheelFront, spec.wheelY, -spec.track],
      [spec.wheelRear, spec.wheelY, spec.track],
      [spec.wheelRear, spec.wheelY, -spec.track],
    ];
    if (id === "hauler") h.push([spec.wheelRear, spec.wheelY, spec.track + 0.3], [spec.wheelRear, spec.wheelY, -spec.track - 0.3]);
    return h;
  }, [spec, id]);

  useFrame(() => {
    const s = host.sim;
    const v = s?.vehicles[id];
    if (!s || !v || !root.current) return;
    const p = s.pose(id, host.alpha);
    root.current.position.set(p.x, p.y, p.z);
    root.current.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
    for (let i = 0; i < hubs.length; i++) {
      const w = wheels.current[i];
      if (!w) continue;
      const st = v.wheel(i < 4 ? i : i - 2);
      const [x, y, z] = hubs[i];
      w.position.set(x, y - st.suspension, z);
      w.rotation.set(0, i < 4 ? st.steer : 0, 0);
      const spin = w.children[0];
      if (spin) spin.rotation.z = -st.spin;
    }
    if (driver.current) driver.current.visible = s.control.kind === "vehicle" && s.control.id === id;
    if (student.current) student.current.visible = useGame.getState().coop === "riding";
  });

  const pickup = id === "truck" || id === "trail" || id === "hauler";
  return (
    <group ref={root} name={`vehicle-${id}`}>
      {id === "bus" ? (
        <>
          {/* The shell is in ground coordinates: drop it by the ride height. */}
          <group position={[-0.5, -(spec.wheelRadius + spec.suspensionRest * 0.72 - spec.wheelY), 0]}>
            <BusShell />
          </group>
          <group ref={student} position={[1.6, -0.5, 0.6]} visible={false}>
            <Human outfit={SAM_LOOK} pose="sit" />
          </group>
        </>
      ) : (
        <group scale={BODY_SCALE[id]}>
          {pickup ? <TruckBody color={BODY_COLORS[id]} livery={id === "truck"} /> : id === "car" ? <CarBody color={BODY_COLORS.car} /> : <ModelCar id={id} color={BODY_COLORS[id]} />}
          <Extras id={id} />
        </group>
      )}
      {hubs.map((_, i) => (
        <Wheel
          key={i}
          ref={(el) => {
            wheels.current[i] = el;
          }}
          radius={spec.wheelRadius}
          width={pickup ? (id === "trail" ? 0.38 : 0.32) : 0.3}
          side={i % 2 === 0 ? 1 : -1}
          rimColor={RIMS[id]}
        />
      ))}
      <group ref={driver} position={DRIVER_SEAT[id]} visible={false}>
        <Human outfit={outfit} pose="drive" />
      </group>
    </group>
  );
}

/** The Lakerunner or a harbour jet ski: bobs on the water, rolls into turns, pitches up under power. */
function BoatEntity({id}:{id:string}) {
  const jetski = id.endsWith("jetski");
  const outfit = useGame((g) => g.outfit);
  const root = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const skipper = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = host.sim;
    if (!s || !root.current) return;
    const p = s.pose("boat:"+id, host.alpha);
    root.current.position.set(p.x, p.y, p.z);
    root.current.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
    const b = s.boats[id];
    if (tilt.current) tilt.current.rotation.set(b.roll, 0, b.pitch);
    if (tilt.current) tilt.current.position.y = b.bob;
    if (skipper.current) skipper.current.visible = s.control.kind === "boat" && s.boats[s.control.id??"lake-boat"]===b;
  });
  const speed = () => host.sim?.boats[id]?.speed ?? 0;
  return (
    <group ref={root} name="boat">
      <group ref={tilt}>
        {jetski?<JetSkiModel speed={speed} color={JETSKI_COLORS[id.split("-")[0]]} />:<BoatModel speed={speed} />}
        <group ref={skipper} position={jetski?[-0.32, -0.12, 0]:[-0.5, 0.02, 0.48]} visible={false}>
          <Human outfit={outfit} pose={jetski?"ride":"drive"} seat={jetski?"moto":"boat"} />
        </group>
      </group>
    </group>
  );
}

function PlaneEntity({id}:{id:PlaneId}){
 const root=useRef<THREE.Group>(null),tilt=useRef<THREE.Group>(null);
 useFrame(()=>{const sim=host.sim,p=sim?.planes[id];if(!sim||!p||!root.current)return;
  const pose=sim.pose("plane:"+id,host.alpha);root.current.position.set(pose.x,pose.y,pose.z);root.current.quaternion.set(pose.q.x,pose.q.y,pose.q.z,pose.q.w);
  if(tilt.current)tilt.current.rotation.set(p.roll,0,p.pitch);
 });
 return <group ref={root} name={id}><group ref={tilt}><LightPlaneModel color={PLANE_SPOTS[id].color} speed={()=>host.sim?.planes[id].speed??0}/></group></group>;
}

/** Saddle height for the rider on each animal. */
const SADDLE: Record<AnimalId, [number, number, number]> = { horse: [0.02, 0.9, 0], elephant: [0.3, 2.68, 0] };

function AnimalEntity({ id }: { id: AnimalId }) {
  const outfit = useGame((g) => g.outfit);
  const root = useRef<THREE.Group>(null);
  const rider = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = host.sim;
    if (!s?.animals[id] || !root.current) return;
    const p = s.pose(id, host.alpha);
    root.current.position.set(p.x, p.y, p.z);
    root.current.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
    if (rider.current) rider.current.visible = s.control.kind === "animal" && s.control.id === id;
  });
  const speed = () => host.sim?.animals[id]?.speed ?? 0;
  return (
    <group ref={root} name={id}>
      {id === "horse" ? <HorseModel speed={speed} /> : <ElephantModel speed={speed} />}
      <group ref={rider} visible={false}>
        <group position={SADDLE[id]}>
          <Human outfit={outfit} pose="ride" motion={{ speed }} />
        </group>
      </group>
    </group>
  );
}

/** The Skylark, banking and pitching with the controls; the pilot shows through the canopy. */
function HeliEntity() {
  const outfit = useGame((g) => g.outfit);
  const root = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const pilot = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = host.sim;
    const h = s?.heli;
    if (!s || !h || !root.current) return;
    const p = s.pose("heli", host.alpha);
    root.current.position.set(p.x, p.y, p.z);
    root.current.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
    // Nose dips when flying forward; banks into turns.
    if (tilt.current) tilt.current.rotation.set(h.roll, 0, -h.pitch);
    if (pilot.current) pilot.current.visible = s.control.kind === "heli" && !s.control.id;
  });
  const rotor = () => host.sim?.heli?.rotor ?? 0;
  return (
    <group ref={root} name="heli">
      <group ref={tilt}>
        <HeliModel rotor={rotor} />
        <group ref={pilot} position={[0.55, 0.62, -0.32]} visible={false}>
          <Human outfit={outfit} pose="drive" seat="heli" />
        </group>
      </group>
    </group>
  );
}

/** A helicopter that lives somewhere (the airport's, on its helipad), free for anyone to fly. */
function ParkedHeliEntity({ id }: { id: string }) {
  const outfit = useGame((g) => g.outfit);
  const root = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const pilot = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = host.sim;
    const h = s?.helis[id];
    if (!s || !h || !root.current) return;
    const p = s.pose("heli:" + id, host.alpha);
    root.current.position.set(p.x, p.y, p.z);
    root.current.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
    if (tilt.current) tilt.current.rotation.set(h.roll, 0, -h.pitch);
    if (pilot.current) pilot.current.visible = s.control.kind === "heli" && s.control.id === id;
  });
  const rotor = () => host.sim?.helis[id]?.rotor ?? 0;
  return (
    <group ref={root} name={"heli " + id}>
      <group ref={tilt}>
        <HeliModel rotor={rotor} color="#c2463a" label="OWAWA AIR" />
        <group ref={pilot} position={[0.55, 0.62, -0.32]} visible={false}>
          <Human outfit={outfit} pose="drive" seat="heli" />
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

