import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { brick, clearGlass, metricBox, panel, shopGlass, windowGlass } from "../render/architecture";
import { Decal } from "../render/decal";
import { chrome, glass, lumber, mat } from "../render/materials";
import { ModelCar } from "../models/cars";
import { Human, TOWNSFOLK } from "../models/human";
import { BODY_COLORS, CarBody, TruckBody, Wheel } from "../models/vehicles";
import { VEHICLES, type VehicleId } from "../sim/vehicle";
import { DISPLAY_CARS, LANDMARKS, PAVED } from "./map";
import { DESK_H, DESK_SIZE, DESKS, KITCHEN, MANAGER_DESK, MANAGER_ROOM, OFFICE, OFFICE_X0, OFFICE_X1, OFFICE_Z0, OFFICE_Z1, RECEPTION } from "./office";
import { B, ParkingLot } from "./props";
import { Armchair, Bookshelf, Plant as PottedPlant, Rug, Sofa, Table, WallArt } from "../models/furniture";

/**
 * The town's newer places: the Caivan office (walk-in, with a lit interior),
 * Ridge Motors, Ridge Savings Bank, Northline Outfitters, Crossroads Subs and
 * Flat Top Burgers. All original names and designs. Except for the office,
 * you use them from the front door.
 */

/** A parked car (no physics body of its own; the map gives it a solid box). */
export function StaticCar({ id, color, at, heading }: { id: VehicleId; color?: string; at: [number, number]; heading: number }) {
  const spec = VEHICLES[id];
  const sag = spec.suspensionRest * 0.72;
  const ride = spec.wheelRadius + sag - spec.wheelY;
  const pickup = id === "truck" || id === "trail" || id === "hauler";
  const hubs: [number, number, number][] = [
    [spec.wheelFront, spec.wheelY - sag, spec.track],
    [spec.wheelFront, spec.wheelY - sag, -spec.track],
    [spec.wheelRear, spec.wheelY - sag, spec.track],
    [spec.wheelRear, spec.wheelY - sag, -spec.track],
  ];
  const c = color ?? BODY_COLORS[id];
  return (
    <group position={[at[0], ride, at[1]]} rotation={[0, -heading, 0]}>
      {pickup ? <TruckBody color={c} livery={false} /> : id === "car" ? <CarBody color={c} /> : <ModelCar id={id} color={c} />}
      {hubs.map((h, i) => (
        <group key={i} position={h}>
          <Wheel radius={spec.wheelRadius} side={i % 2 === 0 ? 1 : -1} rimColor="#c9ccd1" />
        </group>
      ))}
    </group>
  );
}

// ── The Caivan office ───────────────────────────────────────────────────

function Chair({ at, facing }: { at: [number, number]; facing: number }) {
  const dark = mat("#22252a", { rough: 0.6 });
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, -facing, 0]}>
      <mesh material={dark} position={[0, 0.48, 0]} castShadow>
        <boxGeometry args={[0.5, 0.08, 0.5]} />
      </mesh>
      <mesh material={dark} position={[-0.24, 0.85, 0]} castShadow>
        <boxGeometry args={[0.06, 0.62, 0.48]} />
      </mesh>
      <mesh material={chrome()} position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.44, 8]} />
      </mesh>
      <mesh material={dark} position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.04, 10]} />
      </mesh>
    </group>
  );
}

function Desk({ at, size = DESK_SIZE, monitor = true }: { at: [number, number]; size?: [number, number]; monitor?: boolean }) {
  const [w, d] = size;
  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh material={lumber()} position={[0, DESK_H - 0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.04, d]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={mat("#e9e8e3", { rough: 0.5 })} position={[s * (w / 2 - 0.03), (DESK_H - 0.04) / 2, 0]} castShadow>
          <boxGeometry args={[0.04, DESK_H - 0.04, d - 0.06]} />
        </mesh>
      ))}
      {monitor && (
        <>
          <mesh material={mat("#16181b", { rough: 0.35 })} position={[0, DESK_H + 0.3, -d / 2 + 0.15]}>
            <boxGeometry args={[0.62, 0.38, 0.03]} />
          </mesh>
          <mesh material={mat("#2c4a66", { emissive: "#5d8fc4", emissiveIntensity: 0.6, rough: 0.2 })} position={[0, DESK_H + 0.31, -d / 2 + 0.168]}>
            <planeGeometry args={[0.58, 0.33]} />
          </mesh>
          <mesh material={chrome()} position={[0, DESK_H + 0.07, -d / 2 + 0.14]}>
            <boxGeometry args={[0.05, 0.14, 0.05]} />
          </mesh>
          <mesh material={mat("#2a2d31", { rough: 0.5 })} position={[0, DESK_H + 0.01, -d / 2 + 0.42]}>
            <boxGeometry args={[0.42, 0.02, 0.14]} />
          </mesh>
        </>
      )}
    </group>
  );
}

function Plant({ at, h = 1.2 }: { at: [number, number]; h?: number }) {
  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh material={mat("#d9d4c9", { rough: 0.6 })} position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.2, 0.5, 14]} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} material={mat(i % 2 ? "#3f6b3a" : "#4f7d44", { rough: 0.8 })} position={[Math.cos(i * 1.3) * 0.12, 0.5 + h * (0.35 + (i % 3) * 0.18), Math.sin(i * 1.3) * 0.12]} castShadow>
          <sphereGeometry args={[0.22 + (i % 2) * 0.06, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** Interior lights: switched on only when you're nearby (point lights cost a little every frame). */
function OfficeLights() {
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (group.current) group.current.visible = Math.hypot(camera.position.x - OFFICE.centre[0], camera.position.z - OFFICE.centre[1]) < 60;
  });
  const [ox, oz] = OFFICE.centre;
  return (
    <group ref={group}>
      {[
        [ox - 7, oz - 4],
        [ox + 2, oz - 3],
        [ox + 10, oz - 6],
        [ox + 2, oz + 6],
      ].map(([x, z], i) => (
        <pointLight key={i} position={[x, OFFICE.floorH - 0.5, z]} intensity={22} distance={18} decay={1.4} color="#fff3e0" />
      ))}
    </group>
  );
}

function Office() {
  const [ox, oz] = OFFICE.centre;
  const { w, d, floorH, height, wall, door } = OFFICE;
  const upper = height - floorH;
  const geo = useMemo(() => ({ upper: metricBox(w + 0.2, upper, d + 0.2, 2), floor: metricBox(w - wall * 2, 0.04, d - wall * 2, 3) }), [w, d, upper, wall]);
  const white = mat("#efeee9", { rough: 0.85 });
  const frame = mat("#2a2e33", { metal: 0.6, rough: 0.35 });
  const m = MANAGER_ROOM;
  // Light panels in the ceiling, a grid over the open-plan area.
  const panels = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = OFFICE_X0 + 3; x < OFFICE_X1 - 2; x += 4) for (let z = OFFICE_Z0 + 3; z < OFFICE_Z1 - 2; z += 4) out.push([x, z]);
    return out;
  }, []);
  const parking = PAVED.find((p) => p.x0 === 176 && p.z0 === -34);
  return (
    <group name="Office">
      {/* Polished concrete floor, carpet under the desks */}
      <mesh geometry={geo.floor} position={[ox, 0.02, oz]} material={panel("#b7b2a8")} receiveShadow />
      <mesh position={[ox - 5, 0.045, oz - 4.25]} material={mat("#4f5a63", { rough: 0.95 })} receiveShadow>
        <boxGeometry args={[13, 0.01, 8]} />
      </mesh>
      {/* Walls: solid sides and back, a glass front onto the boulevard with the door in the middle */}
      <mesh position={[ox, floorH / 2, OFFICE_Z0 + wall / 2]} material={white} castShadow receiveShadow>
        <boxGeometry args={[w, floorH, wall]} />
      </mesh>
      {[OFFICE_X0 + wall / 2, OFFICE_X1 - wall / 2].map((x) => (
        <mesh key={x} position={[x, floorH / 2, oz]} material={white} castShadow receiveShadow>
          <boxGeometry args={[wall, floorH, d]} />
        </mesh>
      ))}
      {[
        [OFFICE_X0, ox - door / 2],
        [ox + door / 2, OFFICE_X1],
      ].map(([a, b2]) => (
        <group key={a}>
          <mesh position={[(a + b2) / 2, floorH / 2, OFFICE_Z1 - wall / 2]} material={clearGlass()}>
            <boxGeometry args={[b2 - a, floorH, 0.04]} />
          </mesh>
          {Array.from({ length: Math.floor((b2 - a) / 2.2) + 1 }, (_, i) => (
            <mesh key={i} position={[a + i * ((b2 - a) / Math.floor((b2 - a) / 2.2)), floorH / 2, OFFICE_Z1 - wall / 2]} material={frame}>
              <boxGeometry args={[0.08, floorH, 0.12]} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[ox, floorH - 0.45, OFFICE_Z1 - wall / 2]} material={frame}>
        <boxGeometry args={[door, 0.9, 0.14]} />
      </mesh>
      {/* Ceiling with light panels */}
      <mesh position={[ox, floorH - 0.01, oz]} rotation={[Math.PI / 2, 0, 0]} material={white}>
        <planeGeometry args={[w, d]} />
      </mesh>
      {panels.map(([x, z], i) => (
        <mesh key={i} position={[x, floorH - 0.02, z]} rotation={[Math.PI / 2, 0, 0]} material={mat("#ffffff", { emissive: "#fff4e0", emissiveIntensity: 1.1 })}>
          <planeGeometry args={[1.2, 0.6]} />
        </mesh>
      ))}
      <OfficeLights />
      {/* Upper storey: panels with ribbon windows, a parapet and the Caivan name */}
      <mesh geometry={geo.upper} position={[ox, floorH + upper / 2, oz]} material={panel("#d9d5cc")} castShadow receiveShadow />
      {[OFFICE_Z1 + 0.11, OFFICE_Z0 - 0.11].map((z) => (
        <mesh key={z} position={[ox, floorH + 2.1, z]} material={windowGlass()}>
          <boxGeometry args={[w - 2, 1.5, 0.04]} />
        </mesh>
      ))}
      <mesh position={[ox, height + 0.3, oz]} material={mat("#1f3a5f", { rough: 0.45 })} castShadow>
        <boxGeometry args={[w + 0.5, 0.6, d + 0.5]} />
      </mesh>
      <Decal text="CAIVAN" color="#1f3a5f" position={[ox, floorH + 3.65, OFFICE_Z1 + 0.13]} rotation={[0, 0, 0]} height={1.1} />
      {/* Entrance canopy */}
      <mesh position={[ox, floorH + 0.05, OFFICE_Z1 + 1.6]} material={mat("#ecebe6", { rough: 0.5 })} castShadow>
        <boxGeometry args={[7, 0.2, 3.2]} />
      </mesh>
      {/* A lounge corner by the door, plants and art */}
      <Rug position={[207, 0.03, -44]} w={4.6} d={3.6} color="#56705a" border="#d8d2c4" />
      <Sofa position={[207, 0, -42.4]} rotation={Math.PI} width={2.4} color="#3d4a52" />
      <Armchair position={[209.8, 0, -44.6]} rotation={-Math.PI / 2} color="#b5553c" />
      <Table position={[207, 0, -44.4]} w={1.2} d={0.6} h={0.42} top="#9a7350" />
      {[[179, -59.8], [210.6, -40.2], [200.6, -40.2], [179, -48]].map(([px, pz], i) => <PottedPlant key={i} position={[px, 0, pz]} h={1.6} />)}
      <WallArt position={[OFFICE_X0 + 0.35, 2.1, -52]} rotation={Math.PI / 2} w={2.4} h={1.2} color="#1f3a5f" />
      <WallArt position={[OFFICE_X0 + 0.35, 2.1, -57]} rotation={Math.PI / 2} w={1.4} h={1} color="#e0a43a" />
      <Bookshelf position={[190, 0, OFFICE_Z0 + 0.5]} w={3} h={2.2} />
      {/* Reception */}
      <group>
        <mesh position={[RECEPTION.at[0], 0.55, RECEPTION.at[1]]} material={white} castShadow receiveShadow>
          <boxGeometry args={[RECEPTION.size[0], 1.1, RECEPTION.size[1]]} />
        </mesh>
        <mesh position={[RECEPTION.at[0], 1.12, RECEPTION.at[1]]} material={lumber()}>
          <boxGeometry args={[RECEPTION.size[0] + 0.1, 0.04, RECEPTION.size[1] + 0.1]} />
        </mesh>
        <Decal text="CAIVAN" color="#1f3a5f" position={[RECEPTION.at[0], 0.62, RECEPTION.at[1] + RECEPTION.size[1] / 2 + 0.01]} rotation={[0, 0, 0]} height={0.26} />
      </group>
      {/* Workstations */}
      {DESKS.map((dk, i) => (
        <group key={i}>
          <Desk at={dk.at} />
          <Chair at={[dk.at[0], dk.at[1] + 0.85]} facing={-Math.PI / 2} />
        </group>
      ))}
      {/* Name plate on your desk */}
      <Decal text="YOU" color="#e0a43a" position={[DESKS[0].at[0] + 0.6, DESK_H + 0.04, DESKS[0].at[1] + 0.3]} rotation={[-Math.PI / 2, 0, 0]} height={0.08} />
      {/* The manager's glass office */}
      <mesh position={[m.x0 + 0.05, floorH / 2, (m.z0 + m.z1) / 2]} material={clearGlass()}>
        <boxGeometry args={[0.04, floorH, m.z1 - m.z0]} />
      </mesh>
      {[
        [m.x0, m.x0 + 2.5],
        [m.x0 + 3.9, m.x1],
      ].map(([a, b2]) => (
        <mesh key={a} position={[(a + b2) / 2, floorH / 2, m.z1 - 0.05]} material={clearGlass()}>
          <boxGeometry args={[b2 - a, floorH, 0.04]} />
        </mesh>
      ))}
      <Desk at={MANAGER_DESK.at} size={MANAGER_DESK.size} />
      <Chair at={[MANAGER_DESK.at[0], MANAGER_DESK.at[1] - 0.9]} facing={Math.PI / 2} />
      <Plant at={[m.x1 - 0.6, m.z0 + 0.6]} h={1.4} />
      {/* Kitchen: counter, fridge, coffee */}
      <group position={[KITCHEN.at[0], 0, KITCHEN.at[1]]}>
        <mesh material={white} position={[-0.25, 0.45, 0]} castShadow>
          <boxGeometry args={[0.65, 0.9, 4.4]} />
        </mesh>
        <mesh material={mat("#3a3d41", { rough: 0.3 })} position={[-0.25, 0.92, 0]}>
          <boxGeometry args={[0.7, 0.04, 4.45]} />
        </mesh>
        <mesh material={mat("#c9ccd1", { metal: 0.6, rough: 0.3 })} position={[-0.3, 0.95, -2.6]} castShadow>
          <boxGeometry args={[0.7, 1.9, 0.8]} />
        </mesh>
        <mesh material={mat("#16181b", { rough: 0.4 })} position={[-0.35, 1.1, 1.2]}>
          <boxGeometry args={[0.35, 0.36, 0.3]} />
        </mesh>
      </group>
      {/* Brand wall and plants */}
      <Decal text="WE BUILD COMMUNITIES" color="#1f3a5f" position={[ox - 5, 2.4, OFFICE_Z0 + wall + 0.01]} rotation={[0, 0, 0]} height={0.38} />
      <Plant at={[OFFICE_X0 + 1, OFFICE_Z0 + 1]} />
      <Plant at={[ox + 5.5, OFFICE_Z1 - 1.2]} />
      <Plant at={[OFFICE_X0 + 1, oz]} />
      {parking && <ParkingLot x0={parking.x0} z0={parking.z0} x1={parking.x1} z1={parking.z1} rows={[parking.z0 + 4, parking.z1 - 4]} />}
    </group>
  );
}

// ── Ridge Motors ────────────────────────────────────────────────────────

function Dealership() {
  const L = LANDMARKS.dealer;
  const [x, z] = L.position;
  const [w, d, h] = L.size;
  const front = z - d / 2;
  const back = useMemo(() => metricBox(w, h, d * 0.35, 2), [w, h, d]);
  const steel = mat("#2a2e33", { metal: 0.7, rough: 0.3 });
  const lot = PAVED.find((p) => p.x0 === 172 && p.z0 === 12);
  return (
    <group name="Dealership">
      {/* Showroom: glass on three sides under a deep white roof, offices behind */}
      <mesh position={[x, 0.03, z]} material={panel("#e6e3dc")} receiveShadow>
        <boxGeometry args={[w, 0.06, d]} />
      </mesh>
      <mesh geometry={back} position={[x, h / 2, z + d / 2 - (d * 0.35) / 2]} material={panel("#ecebe6")} castShadow receiveShadow />
      <mesh position={[x, h - 0.4, z]} material={mat("#f3f2ee", { rough: 0.5 })} castShadow receiveShadow>
        <boxGeometry args={[w + 1.2, 0.8, d + 1.2]} />
      </mesh>
      <mesh position={[x, h / 2 - 0.4, front + 0.02]} material={clearGlass()}>
        <boxGeometry args={[w, h - 0.8, 0.04]} />
      </mesh>
      {[x - w / 2, x + w / 2].map((sx) => (
        <mesh key={sx} position={[sx, h / 2 - 0.4, z - (d * 0.35) / 2]} material={clearGlass()}>
          <boxGeometry args={[0.04, h - 0.8, d * 0.65]} />
        </mesh>
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} position={[x - w / 2 + (i * w) / 9, h / 2 - 0.4, front]} material={steel}>
          <boxGeometry args={[0.14, h - 0.8, 0.14]} />
        </mesh>
      ))}
      <B size={[w + 1.3, 0.9, 0.2]} position={[x, h - 0.4, front - 0.62]} color="#14233a" />
      <Decal text="RIDGE MOTORS" color="#ffffff" position={[x, h - 0.4, front - 0.73]} rotation={[0, Math.PI, 0]} height={0.62} />
      {/* Two cars in the showroom */}
      <StaticCar id="super" color="#d9d6cf" at={[x - 7, z - 2]} heading={-Math.PI / 2 + 0.5} />
      <StaticCar id="coupe" color="#7a1f2b" at={[x + 7, z - 2]} heading={-Math.PI / 2 - 0.5} />
      {/* Forecourt: the display row and flags */}
      {lot && <ParkingLot x0={lot.x0} z0={lot.z0} x1={lot.x1} z1={lot.z1} rows={[lot.z1 - 3.5]} />}
      {DISPLAY_CARS.map((c) => (
        <StaticCar key={c.id} id={c.id} color={c.color} at={[c.x, c.z]} heading={c.heading} />
      ))}
      {[x - w / 2 - 2, x + w / 2 + 2].map((fx) => (
        <group key={fx} position={[fx, 0, 14]}>
          <mesh material={mat("#d8dbe0", { metal: 0.8, rough: 0.25 })} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 9, 10]} />
          </mesh>
          <mesh material={mat("#14233a", { rough: 0.8 })} position={[0, 4, 0.55]}>
            <boxGeometry args={[0.03, 2.6, 1.0]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── Ridge Savings Bank ──────────────────────────────────────────────────

function Bank() {
  const L = LANDMARKS.bank;
  const [x, z] = L.position;
  const [w, d, h] = L.size;
  const front = z + d / 2; // faces Market Street, to the south
  const body = useMemo(() => metricBox(w, h, d, 2), [w, h, d]);
  const stone = panel("#ece2cd");
  const pediment = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 - 0.3, 0);
    s.lineTo(w / 2 + 0.3, 0);
    s.lineTo(0, 2.1);
    s.lineTo(-w / 2 - 0.3, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 3.2, bevelEnabled: false });
    return g;
  }, [w]);
  return (
    <group name="Bank">
      <mesh geometry={body} position={[x, h / 2, z]} material={stone} castShadow receiveShadow />
      {/* Portico: steps, columns, frieze with the name, pediment */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[x, 0.1 + i * 0.2, front + (3.6 - i * 0.5) / 2]} material={stone} receiveShadow>
          <boxGeometry args={[w * 0.75 - i * 0.6, 0.2, 3.6 - i * 0.5]} />
        </mesh>
      ))}
      {[-3, -1, 1, 3].map((i) => (
        <mesh key={i} position={[x + i * 2.2, 0.6 + (h - 2.2) / 2, front + 2.3]} material={stone} castShadow>
          <cylinderGeometry args={[0.38, 0.44, h - 2.2, 18]} />
        </mesh>
      ))}
      <mesh position={[x, h - 1.05, front + 2.2]} material={stone} castShadow>
        <boxGeometry args={[w * 0.82, 1.3, 3.0]} />
      </mesh>
      <Decal text="RIDGE SAVINGS BANK" color="#3b3a36" position={[x, h - 1.05, front + 3.71]} rotation={[0, 0, 0]} height={0.55} />
      <mesh geometry={pediment} position={[x, h - 0.4, front + 0.6]} material={stone} castShadow />
      <mesh position={[x, 1.55, front + 0.02]} material={mat("#5a4030", { rough: 0.45 })}>
        <boxGeometry args={[2.6, 3.2, 0.08]} />
      </mesh>
      {[-0.6, 0.6].map((dx) => (
        <mesh key={dx} position={[x + dx, 1.7, front + 0.07]} material={windowGlass()}>
          <boxGeometry args={[0.9, 2.4, 0.03]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[x + s * 6.2, 3, front + 0.02]} material={windowGlass()}>
          <boxGeometry args={[1.6, 3.2, 0.06]} />
        </mesh>
      ))}
      {/* ATM on the east wall */}
      <group position={[x + w / 2 + 0.05, 0, z + 3]}>
        <mesh material={mat("#3a3e44", { metal: 0.5, rough: 0.4 })} position={[0.15, 1.1, 0]} castShadow>
          <boxGeometry args={[0.3, 2.2, 1.0]} />
        </mesh>
        <mesh material={mat("#1d3550", { emissive: "#4f86c6", emissiveIntensity: 0.6 })} position={[0.31, 1.4, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.5, 0.35]} />
        </mesh>
      </group>
    </group>
  );
}

// ── Northline Outfitters ────────────────────────────────────────────────

function Clothing() {
  const L = LANDMARKS.clothing;
  const [x, z] = L.position;
  const [w, d, h] = L.size;
  const front = z + d / 2;
  const body = useMemo(() => metricBox(w, h, d, 2), [w, h, d]);
  return (
    <group name="Clothing">
      <mesh geometry={body} position={[x, h / 2, z]} material={panel("#34373c")} castShadow receiveShadow />
      {/* Two big display windows with mannequins, a door between */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[x + s * 5.6, 0.25, front - 1.2]} material={mat("#e9e5dc", { rough: 0.6 })} receiveShadow>
            <boxGeometry args={[8, 0.5, 2.2]} />
          </mesh>
          <mesh position={[x + s * 5.6, 2.6, front - 2.3]} material={mat("#f4efe4", { emissive: "#fff3dc", emissiveIntensity: 0.25 })}>
            <boxGeometry args={[8, 4.2, 0.1]} />
          </mesh>
          <mesh position={[x + s * 5.6, 2.5, front + 0.03]} material={clearGlass()}>
            <boxGeometry args={[8.2, 4.0, 0.04]} />
          </mesh>
          {[-2, 1.6].map((dx, i) => (
            <group key={dx} position={[x + s * 5.6 + dx, 0.5, front - 1.1]} rotation={[0, -Math.PI / 2 + (i ? 0.3 : -0.3), 0]}>
              <Human outfit={TOWNSFOLK[(s > 0 ? 2 : 0) + i + 4]} />
            </group>
          ))}
        </group>
      ))}
      <mesh position={[x, 1.4, front + 0.03]} material={mat("#1b1d21", { rough: 0.4 })}>
        <boxGeometry args={[2.2, 2.8, 0.06]} />
      </mesh>
      <B size={[w + 0.3, 1.0, 0.3]} position={[x, h - 0.55, front + 0.1]} color="#1b1d21" />
      <Decal text="NORTHLINE OUTFITTERS" color="#efe9dc" position={[x, h - 0.55, front + 0.26]} rotation={[0, 0, 0]} height={0.5} />
    </group>
  );
}

// ── Crossroads Subs and Flat Top Burgers ────────────────────────────────

function PatioTable({ at, umbrella }: { at: [number, number]; umbrella: string }) {
  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh material={mat("#2b2d31", { rough: 0.5 })} position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.45, 0.04, 16]} />
      </mesh>
      <mesh material={chrome()} position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.72, 8]} />
      </mesh>
      <mesh material={chrome()} position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 2.6, 8]} />
      </mesh>
      <mesh material={mat(umbrella, { rough: 0.85 })} position={[0, 2.45, 0]} castShadow>
        <coneGeometry args={[1.3, 0.5, 12, 1, true]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} material={mat("#2b2d31", { rough: 0.5 })} position={[Math.cos(i * 2.1) * 0.75, 0.45, Math.sin(i * 2.1) * 0.75]}>
          <boxGeometry args={[0.4, 0.05, 0.4]} />
        </mesh>
      ))}
    </group>
  );
}

function Restaurant({ id }: { id: "subs" | "burger" }) {
  const L = LANDMARKS[id];
  const [x, z] = L.position;
  const [w, d, h] = L.size;
  const front = z - d / 2; // faces Market Street, to the north
  const body = useMemo(() => metricBox(w, h, d, 2), [w, h, d]);
  const storefront = useMemo(() => metricBox(w - 4, 2.6, 0.06, 4), [w]);
  const subs = id === "subs";
  const lot = PAVED.find((p) => p.x0 === (subs ? -46 : 84));
  return (
    <group name={L.name}>
      <mesh geometry={body} position={[x, h / 2, z]} material={subs ? panel("#e6dccb") : brick("#6e4a3c")} castShadow receiveShadow />
      <mesh geometry={storefront} position={[x, 1.55, front - 0.04]} material={shopGlass()} />
      {/* Fascia with the name; an awning over the windows */}
      <B size={[w + 0.3, 1.1, 0.3]} position={[x, h - 0.5, front - 0.12]} color={subs ? "#1f5a5a" : "#24262a"} />
      <Decal text={L.name.toUpperCase()} color={subs ? "#f3ead6" : "#f0e2c4"} position={[x, h - 0.5, front - 0.28]} rotation={[0, Math.PI, 0]} height={0.52} />
      <mesh position={[x, 3.05, front - 0.9]} rotation={[0.3, 0, 0]} material={mat(subs ? "#1f5a5a" : "#3a2a22", { rough: 0.85 })} castShadow>
        <boxGeometry args={[w - 3, 0.06, 1.8]} />
      </mesh>
      {[-1, 1].map((s) => (
        <PatioTable key={s} at={[x + s * (w / 2 - 2), front - 3.6]} umbrella={subs ? "#e9dfc9" : "#3a2a22"} />
      ))}
      {!subs && (
        <>
          {/* Drive-through window and menu board on the east side */}
          <mesh position={[x + w / 2 + 0.03, 1.4, z + 2]} material={glass("#22313b")}>
            <boxGeometry args={[0.04, 1.2, 1.6]} />
          </mesh>
          <group position={[x + w / 2 + 3, 0, z - 3]}>
            <B size={[0.12, 1.2, 0.12]} position={[0, 0.6, 0]} color="#24262a" />
            <mesh position={[0, 1.8, 0]} material={mat("#24262a", { emissive: "#5a4630", emissiveIntensity: 0.4 })} castShadow>
              <boxGeometry args={[0.15, 1.3, 2.0]} />
            </mesh>
          </group>
        </>
      )}
      {lot && <ParkingLot x0={lot.x0} z0={lot.z0} x1={lot.x1} z1={lot.z1} rows={[]} />}
    </group>
  );
}

export function Places() {
  return (
    <group name="Places">
      <Office />
      <Dealership />
      <Bank />
      <Clothing />
      <Restaurant id="subs" />
      <Restaurant id="burger" />
    </group>
  );
}
