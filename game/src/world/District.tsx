import { useMemo } from "react";
import * as THREE from "three";
import { brick, metricBox, panel, shopGlass } from "../render/architecture";
import { Decal } from "../render/decal";
import { carPaint, chrome, glass, mat } from "../render/materials";
import { CarBody, Wheel } from "../models/vehicles";
import { LANDMARKS, PARKED_CARS, PAVED, SCHOOL_BUS } from "./map";
import { B, ParkingLot, Windows } from "./props";

/**
 * Market Street, the new south end of Caivan Ridge: a corner market, the
 * public school with its sports field, and the Ridge Centre mall. Exteriors
 * only for now (you can't go inside). Every building faces north onto the street.
 */

function lot(kind: "parking" | "field", near: [number, number]) {
  return PAVED.filter((p) => p.kind === kind).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - near[0], (a.z0 + a.z1) / 2 - near[1]) - Math.hypot((b.x0 + b.x1) / 2 - near[0], (b.z0 + b.z1) / 2 - near[1]))[0];
}

function RooftopUnits({ at, count, spread }: { at: [number, number, number]; count: number; spread: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x = at[0] + (i - (count - 1) / 2) * spread;
        return (
          <group key={i} position={[x, at[1], at[2] + (i % 2 ? 2.5 : -2)]}>
            <B size={[2.6, 1.3, 1.8]} position={[0, 0.65, 0]} color="#a9adb1" />
            <mesh position={[0.5, 1.32, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat("#3a3e43", { metal: 0.5, rough: 0.5 })}>
              <circleGeometry args={[0.55, 20]} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// ── Ridge Corner Market ─────────────────────────────────────────────────

function Shop() {
  const [x, z] = LANDMARKS.shop.position;
  const [w, d, h] = LANDMARKS.shop.size;
  const front = z - d / 2;
  const body = useMemo(() => metricBox(w, h - 0.8, d, 2), [w, h, d]);
  const p = lot("parking", [x, z]);
  const mullions = useMemo(() => Array.from({ length: 12 }, (_, i) => -11 + i * 2), []);
  const storefront = useMemo(() => metricBox(w - 9, 3.3, 0.06, 4), [w]);
  const alu = mat("#2a2e33", { metal: 0.6, rough: 0.35 });
  return (
    <group name="Shop">
      <mesh geometry={body} position={[x, (h - 0.8) / 2, z]} material={panel("#d6cdbd")} castShadow receiveShadow />
      {/* Brick base and piers either side of the storefront */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[x + s * (w / 2 - 2.2), (h - 0.8) / 2, front - 0.15]} material={brick("#9b5a45")} castShadow>
          <boxGeometry args={[4.4, h - 0.8, 0.3]} />
        </mesh>
      ))}
      {/* Storefront glazing with mullions and doors */}
      <mesh geometry={storefront} position={[x, 1.75, front - 0.05]} material={shopGlass()} />
      {mullions.map((dx) => (
        <mesh key={dx} position={[x + dx, 1.75, front - 0.12]} material={alu}>
          <boxGeometry args={[0.1, 3.3, 0.1]} />
        </mesh>
      ))}
      <B size={[w - 9, 0.12, 0.14]} position={[x, 3.45, front - 0.12]} color="#2a2e33" />
      {/* Fabric awning */}
      <mesh position={[x, 3.85, front - 1.0]} rotation={[-0.32, 0, 0]} material={mat("#2f4a3a", { rough: 0.85 })} castShadow>
        <boxGeometry args={[w - 8, 0.06, 2.1]} />
      </mesh>
      {/* Sign band */}
      <B size={[w + 0.4, 1.2, d + 0.4]} position={[x, h - 0.2, z]} color="#2b2f34" />
      <Decal text="RIDGE CORNER MARKET" color="#f2ede2" position={[x, h - 0.2, front - 0.22]} rotation={[0, Math.PI, 0]} height={0.62} />
      <RooftopUnits at={[x, h + 0.4, z + 2]} count={2} spread={9} />
      {/* Parking, bench, cart corral */}
      {p && <ParkingLot x0={p.x0} z0={p.z0} x1={p.x1} z1={p.z1} rows={[(p.z0 + p.z1) / 2]} />}
      <B size={[2.2, 0.08, 0.5]} position={[x + 12, 0.48, front - 2.6]} color="#6b4f36" />
      {[-0.9, 0.9].map((dx) => (
        <B key={dx} size={[0.08, 0.45, 0.45]} position={[x + 12 + dx, 0.22, front - 2.6]} color="#2b2f34" />
      ))}
      <group position={[x - 12, 0, front - 3]}>
        {[-0.7, 0.7].map((dz) => (
          <B key={dz} size={[3, 0.06, 0.06]} position={[0, 0.9, dz]} color="#9aa1aa" />
        ))}
        {[-1.5, 1.5].map((dx) => (
          <B key={dx} size={[0.06, 0.9, 1.4]} position={[dx, 0.45, 0]} color="#9aa1aa" />
        ))}
      </group>
    </group>
  );
}

// ── Caivan Ridge Public School ──────────────────────────────────────────

function track(straight: number, rOuter: number, rInner: number) {
  const s = new THREE.Shape();
  const half = straight / 2;
  s.moveTo(-half, -rOuter);
  s.lineTo(half, -rOuter);
  s.absarc(half, 0, rOuter, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-half, rOuter);
  s.absarc(-half, 0, rOuter, Math.PI / 2, (3 * Math.PI) / 2, false);
  const hole = new THREE.Path();
  hole.moveTo(-half, -rInner);
  hole.absarc(-half, 0, rInner, (3 * Math.PI) / 2, Math.PI / 2, true);
  hole.lineTo(half, rInner);
  hole.absarc(half, 0, rInner, Math.PI / 2, -Math.PI / 2, true);
  hole.lineTo(-half, -rInner);
  s.holes.push(hole);
  const g = new THREE.ShapeGeometry(s, 32);
  g.rotateX(Math.PI / 2);
  return g;
}

function SchoolBus({ at, heading }: { at: [number, number]; heading: number }) {
  const yellow = carPaint("#f2b01e");
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, -heading, 0]}>
      <mesh position={[0, 1.75, 0]} material={yellow} castShadow receiveShadow>
        <boxGeometry args={[10.5, 2.5, 2.45]} />
      </mesh>
      <mesh position={[5.75, 1.15, 0]} material={yellow} castShadow>
        <boxGeometry args={[1.2, 1.3, 2.35]} />
      </mesh>
      <B size={[10.6, 0.12, 2.5]} position={[0, 1.25, 0]} color="#1b1c1f" cast={false} />
      <B size={[10.6, 0.12, 2.5]} position={[0, 2.05, 0]} color="#1b1c1f" cast={false} />
      {[1, -1].map((side) => (
        <mesh key={side} position={[0.3, 2.45, side * 1.235]} material={glass("#1a2026")}>
          <boxGeometry args={[9, 0.75, 0.02]} />
        </mesh>
      ))}
      <mesh position={[5.27, 2.4, 0]} material={glass("#1a2026")}>
        <boxGeometry args={[0.02, 0.9, 2.2]} />
      </mesh>
      <B size={[0.2, 0.35, 2.5]} position={[6.4, 0.75, 0]} color="#1b1c1f" />
      {[4.1, -3.2].map((wx) =>
        [1, -1].map((side) => (
          <group key={`${wx}${side}`} position={[wx, 0.52, side * 1.08]}>
            <Wheel radius={0.52} side={side as 1 | -1} width={0.34} rimColor="#d8dbe0" />
          </group>
        )),
      )}
    </group>
  );
}

function School() {
  const [x, z] = LANDMARKS.school.position;
  const [w, d, h] = LANDMARKS.school.size;
  const front = z - d / 2;
  const body = useMemo(() => metricBox(w, h - 0.6, d), [w, h, d]);
  const entrance = useMemo(() => metricBox(12, h + 0.6, 3), [h]);
  const field = lot("field", [x, z]);
  const parking = lot("parking", [x, z]);
  const trackGeo = useMemo(() => track(34, 17, 12.4), []);
  const lobby = useMemo(() => metricBox(6, 3, 0.06, 4), []);
  const fx = field ? (field.x0 + field.x1) / 2 : x - 70;
  const fz = field ? (field.z0 + field.z1) / 2 : z;
  return (
    <group name="School">
      <mesh geometry={body} position={[x, (h - 0.6) / 2, z]} material={brick("#a35a42")} castShadow receiveShadow />
      <B size={[w + 0.4, 0.6, d + 0.4]} position={[x, h - 0.3, z]} color="#d8d2c6" />
      <Windows centre={[x, z]} face="-z" offset={d / 2} length={w} floors={[2.1, 5.6]} skip={[[-7, 7]]} />
      <Windows centre={[x, z]} face="+z" offset={d / 2} length={w} floors={[2.1, 5.6]} />
      <Windows centre={[x, z]} face="+x" offset={w / 2} length={d} floors={[2.1, 5.6]} />
      <Windows centre={[x, z]} face="-x" offset={w / 2} length={d} floors={[2.1, 5.6]} />
      {/* Entrance block: lighter brick, glazed doors under a canopy, the school's name */}
      <mesh geometry={entrance} position={[x, (h + 0.6) / 2, front - 1.4]} material={brick("#c9a184")} castShadow receiveShadow />
      <mesh geometry={lobby} position={[x, 1.5, front - 2.92]} material={shopGlass()} />
      {[-3, -1, 1, 3].map((dx) => (
        <B key={dx} size={[0.1, 3, 0.12]} position={[x + dx, 1.5, front - 2.98]} color="#2a2e33" />
      ))}
      <mesh position={[x, 3.4, front - 4.3]} material={mat("#ecebe6", { rough: 0.5 })} castShadow receiveShadow>
        <boxGeometry args={[9, 0.3, 3]} />
      </mesh>
      {[-4.2, 4.2].map((dx) => (
        <mesh key={dx} position={[x + dx, 1.7, front - 5.5]} material={chrome()} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 3.4, 10]} />
        </mesh>
      ))}
      <Decal text="CAIVAN RIDGE PUBLIC SCHOOL" color="#f4f1ea" position={[x, h - 1.2, front - 2.92]} rotation={[0, Math.PI, 0]} height={0.55} />
      {/* Flagpole */}
      <mesh position={[x + 12, 5, front - 8]} material={mat("#d8dbe0", { metal: 0.8, rough: 0.25 })} castShadow>
        <cylinderGeometry args={[0.06, 0.09, 10, 10]} />
      </mesh>
      <mesh position={[x + 12.9, 9.2, front - 8]} material={mat("#1f3a5f", { rough: 0.8 })}>
        <boxGeometry args={[1.8, 1.0, 0.02]} />
      </mesh>
      <RooftopUnits at={[x, h, z + 3]} count={3} spread={12} />
      {/* Sports field: running track, pitch lines and goals */}
      <group position={[fx, 0, fz]}>
        <mesh geometry={trackGeo} position={[0, 0.03, 0]} material={mat("#a4553b", { rough: 0.95 })} receiveShadow />
        <mesh position={[0, 0.032, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat("#f1efe9", { rough: 0.8 })}>
          <ringGeometry args={[5.5, 5.7, 40]} />
        </mesh>
        <B size={[0.15, 0.01, 24]} position={[0, 0.034, 0]} color="#f1efe9" cast={false} />
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 19, 0, 0]}>
            {[-3.6, 3.6].map((dz) => (
              <B key={dz} size={[0.12, 2.4, 0.12]} position={[0, 1.2, dz]} color="#f4f4f2" />
            ))}
            <B size={[0.12, 0.12, 7.3]} position={[0, 2.4, 0]} color="#f4f4f2" />
          </group>
        ))}
      </group>
      {parking && <ParkingLot x0={parking.x0} z0={parking.z0} x1={parking.x1} z1={parking.z1} rows={[parking.z0 + 4, parking.z1 - 4]} />}
      <SchoolBus at={[SCHOOL_BUS.x, SCHOOL_BUS.z]} heading={SCHOOL_BUS.heading} />
    </group>
  );
}

// ── Ridge Centre mall ───────────────────────────────────────────────────

function ParkedCar({ at, heading, color }: { at: [number, number]; heading: number; color: string }) {
  return (
    <group position={[at[0], 0.77, at[1]]} rotation={[0, -heading, 0]}>
      <CarBody color={color} />
      {[
        [1.45, 1],
        [1.45, -1],
        [-1.4, 1],
        [-1.4, -1],
      ].map(([wx, s]) => (
        <group key={`${wx}${s}`} position={[wx, -0.41, s * 0.86]}>
          <Wheel radius={0.36} side={s as 1 | -1} rimColor="#c9ccd1" />
        </group>
      ))}
    </group>
  );
}

function Mall() {
  const [x, z] = LANDMARKS.mall.position;
  const [w, d, h] = LANDMARKS.mall.size;
  const front = z - d / 2;
  const body = useMemo(() => metricBox(w, h, d, 2), [w, h, d]);
  const anchorL = useMemo(() => metricBox(30, h + 1.5, 1), [h]);
  const atrium = useMemo(() => metricBox(22, 11, 4, 5.5), []);
  const p = lot("parking", [x, z - 40]);
  const mullions = useMemo(() => Array.from({ length: 11 }, (_, i) => -10 + i * 2), []);
  const alu = mat("#2a2e33", { metal: 0.6, rough: 0.35 });
  const rows = p ? [p.z0 + 5, p.z0 + 13.5, p.z1 - 5] : [];
  return (
    <group name="Mall">
      <mesh geometry={body} position={[x, h / 2, z]} material={panel("#d3cec3")} castShadow receiveShadow />
      {/* Two anchor stores: brick on the west, dark panels on the east */}
      <mesh geometry={anchorL} position={[x - w / 2 + 15, (h + 1.5) / 2, front - 0.5]} material={brick("#7d5a4a")} castShadow receiveShadow />
      <mesh position={[x + w / 2 - 15, (h + 1.5) / 2, front - 0.5]} material={panel("#5c6066")} castShadow receiveShadow>
        <boxGeometry args={[30, h + 1.5, 1]} />
      </mesh>
      <Decal text="MARKET HALL" color="#f2ede2" position={[x - w / 2 + 15, h - 1, front - 1.02]} rotation={[0, Math.PI, 0]} height={1.1} />
      <Decal text="HOME + GARDEN" color="#f2ede2" position={[x + w / 2 - 15, h - 1, front - 1.02]} rotation={[0, Math.PI, 0]} height={1.1} />
      {/* Central glass atrium with the mall's name above */}
      <mesh geometry={atrium} position={[x, 5.5, front - 2]} material={shopGlass()} />
      {mullions.map((dx) => (
        <mesh key={dx} position={[x + dx, 5.5, front - 4.05]} material={alu}>
          <boxGeometry args={[0.14, 11, 0.14]} />
        </mesh>
      ))}
      {[3.6, 7.3].map((y) => (
        <mesh key={y} position={[x, y, front - 4.05]} material={alu}>
          <boxGeometry args={[22, 0.14, 0.14]} />
        </mesh>
      ))}
      <B size={[23, 0.6, 4.6]} position={[x, 11.3, front - 2]} color="#2b2f34" />
      <Decal text="RIDGE CENTRE" color="#f2ede2" position={[x, h + 1.4, front - 0.02]} rotation={[0, Math.PI, 0]} height={1.6} />
      <B size={[24, 2.4, 0.4]} position={[x, h + 1.4, front + 0.2]} color="#2b2f34" />
      {/* Covered walkway along the front */}
      <mesh position={[x, 4.2, front - 2.4]} material={mat("#ecebe6", { rough: 0.5 })} castShadow receiveShadow>
        <boxGeometry args={[w - 2, 0.3, 3.6]} />
      </mesh>
      {[-44, -32, -20, 20, 32, 44].map((dx) => (
        <mesh key={dx} position={[x + dx, 2.05, front - 3.9]} material={alu} castShadow>
          <boxGeometry args={[0.24, 4.1, 0.24]} />
        </mesh>
      ))}
      {/* Loading dock on the east side */}
      <mesh position={[x + w / 2 + 9, 0.03, z - 10]} material={panel("#bdb8ae")} receiveShadow>
        <boxGeometry args={[18, 0.06, 24]} />
      </mesh>
      {[-18, -10, -2].map((dz) => (
        <B key={dz} size={[0.2, 3.6, 3.2]} position={[x + w / 2 + 0.1, 1.8, z + dz]} color="#7a7f86" />
      ))}
      <RooftopUnits at={[x - 20, h, z]} count={4} spread={12} />
      <RooftopUnits at={[x + 28, h, z + 8]} count={2} spread={12} />
      {p && <ParkingLot x0={p.x0} z0={p.z0} x1={p.x1} z1={p.z1} rows={rows} />}
      {PARKED_CARS.map((c, i) => (
        <ParkedCar key={i} at={[c.x, c.z]} heading={c.heading} color={c.color} />
      ))}
    </group>
  );
}

export function District() {
  return (
    <group name="District">
      <Shop />
      <School />
      <Mall />
    </group>
  );
}
