import { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Decal } from "../render/decal";
import { carPaint, chrome, glass, mat } from "../render/materials";
import type { VehicleId } from "../sim/vehicle";

/**
 * The dealership's cars, built the same way as the Volt GT: an extruded side
 * silhouette with wheel arches, glass panes along the greenhouse, lights,
 * trim and a badge. Each is an original design. Chassis-local, facing +x.
 *
 * When realistic GLB models are supplied for these cars, they replace these
 * bodies; the physics (sim/vehicle.ts) stays the same.
 */

type P = [number, number];

export interface CarProfile {
  /** Body width. */
  W: number;
  bottom: number;
  /** Upper outline from the front bumper to the rear bumper. */
  top: P[];
  front: number;
  rear: number;
  arches: { x: number; r: number }[];
  windscreen: [P, P];
  rearGlass?: [P, P];
  /** Side window outline (closed polygon). */
  side?: P[];
  head: [number, number];
  tail: [number, number];
  badge: string;
  /** Extra details. */
  roadster?: boolean;
  wing?: boolean;
  rails?: boolean;
  chromeBumpers?: boolean;
  intakes?: boolean;
}

export const CAR_PROFILES: Partial<Record<VehicleId, CarProfile>> = {
  roadster: {
    W: 1.72,
    bottom: -0.52,
    top: [
      [2.0, -0.3],
      [1.97, -0.12],
      [1.3, 0.02],
      [0.4, 0.1],
      [0.3, 0.1],
      [-0.75, 0.1],
      [-1.55, 0.16],
      [-1.98, 0.1],
      [-2.02, -0.22],
    ],
    front: 1.9,
    rear: -1.95,
    arches: [
      { x: 1.2, r: 0.41 },
      { x: -1.15, r: 0.41 },
    ],
    windscreen: [
      [0.38, 0.12],
      [0.0, 0.56],
    ],
    head: [1.86, -0.02],
    tail: [-2.0, -0.02],
    badge: "BREEZE",
    roadster: true,
  },
  coupe: {
    W: 1.84,
    bottom: -0.56,
    top: [
      [2.2, -0.34],
      [2.18, -0.06],
      [1.25, 0.05],
      [0.55, 0.12],
      [0.12, 0.5],
      [-0.65, 0.52],
      [-1.45, 0.22],
      [-2.12, 0.15],
      [-2.18, -0.22],
    ],
    front: 2.1,
    rear: -2.1,
    arches: [
      { x: 1.38, r: 0.44 },
      { x: -1.3, r: 0.44 },
    ],
    windscreen: [
      [0.52, 0.14],
      [0.14, 0.5],
    ],
    rearGlass: [
      [-1.42, 0.23],
      [-0.66, 0.51],
    ],
    side: [
      [0.45, 0.16],
      [0.12, 0.47],
      [-0.64, 0.48],
      [-1.32, 0.22],
    ],
    head: [2.16, -0.06],
    tail: [-2.17, 0.0],
    badge: "STERLING",
    chromeBumpers: true,
  },
  super: {
    W: 2.0,
    bottom: -0.5,
    top: [
      [2.35, -0.32],
      [2.32, -0.18],
      [1.3, -0.02],
      [0.55, 0.22],
      [0.15, 0.4],
      [-0.6, 0.41],
      [-1.7, 0.14],
      [-2.3, 0.1],
      [-2.36, -0.18],
    ],
    front: 2.25,
    rear: -2.28,
    arches: [
      { x: 1.5, r: 0.45 },
      { x: -1.38, r: 0.45 },
    ],
    windscreen: [
      [0.62, 0.21],
      [0.16, 0.4],
    ],
    side: [
      [0.5, 0.22],
      [0.15, 0.37],
      [-0.6, 0.38],
      [-1.05, 0.24],
    ],
    head: [2.22, -0.12],
    tail: [-2.33, 0.02],
    badge: "APEX",
    wing: true,
    intakes: true,
  },
  suv: {
    W: 1.96,
    bottom: -0.72,
    top: [
      [2.45, -0.5],
      [2.43, 0.04],
      [1.5, 0.2],
      [0.95, 0.3],
      [0.5, 0.86],
      [-2.2, 0.9],
      [-2.42, 0.72],
      [-2.46, -0.5],
    ],
    front: 2.35,
    rear: -2.38,
    arches: [
      { x: 1.5, r: 0.54 },
      { x: -1.45, r: 0.54 },
    ],
    windscreen: [
      [0.93, 0.32],
      [0.52, 0.84],
    ],
    rearGlass: [
      [-2.36, 0.4],
      [-2.2, 0.86],
    ],
    side: [
      [0.82, 0.36],
      [0.5, 0.8],
      [-2.05, 0.82],
      [-2.1, 0.36],
    ],
    head: [2.4, -0.02],
    tail: [-2.43, 0.25],
    badge: "TRAILHEAD",
    rails: true,
  },
  sedan: {
    W: 1.86,
    bottom: -0.6,
    top: [
      [2.4, -0.42],
      [2.38, -0.1],
      [1.45, 0.05],
      [0.75, 0.12],
      [0.3, 0.58],
      [-0.9, 0.6],
      [-1.5, 0.22],
      [-2.3, 0.18],
      [-2.38, -0.4],
    ],
    front: 2.3,
    rear: -2.3,
    arches: [
      { x: 1.45, r: 0.45 },
      { x: -1.4, r: 0.45 },
    ],
    windscreen: [
      [0.72, 0.14],
      [0.32, 0.57],
    ],
    rearGlass: [
      [-1.46, 0.24],
      [-0.92, 0.58],
    ],
    side: [
      [0.62, 0.17],
      [0.3, 0.54],
      [-0.88, 0.55],
      [-1.32, 0.22],
    ],
    head: [2.34, -0.05],
    tail: [-2.36, 0.05],
    badge: "COMMUTER",
  },
};

function profileShape(p: CarProfile) {
  const s = new THREE.Shape();
  s.moveTo(p.rear, p.bottom);
  for (const a of [...p.arches].sort((x, y) => x.x - y.x)) {
    s.lineTo(a.x - a.r, p.bottom);
    s.absarc(a.x, p.bottom, a.r, Math.PI, 0, true);
  }
  s.lineTo(p.front, p.bottom);
  for (const [x, y] of p.top) s.lineTo(x, y);
  s.lineTo(p.rear, p.bottom);
  return s;
}

function bodyGeometry(p: CarProfile) {
  const bevel = 0.08;
  const g = new THREE.ExtrudeGeometry(profileShape(p), { depth: p.W - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 18 });
  g.translate(0, 0, -(p.W - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}

function pane([a, b]: [P, P], width: number) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const g = new THREE.PlaneGeometry(len, width);
  g.rotateX(-Math.PI / 2);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  g.rotateZ(ang);
  g.translate((a[0] + b[0]) / 2 - Math.sin(ang) * 0.012, (a[1] + b[1]) / 2 + Math.cos(ang) * 0.012, 0);
  return g;
}

function sidePanel(points: P[]) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ShapeGeometry(s);
}

export function ModelCar({ id, color }: { id: VehicleId; color: string }) {
  const p = CAR_PROFILES[id]!;
  const geo = useMemo(
    () => ({
      body: bodyGeometry(p),
      windscreen: pane(p.windscreen, p.W - 0.3),
      rearGlass: p.rearGlass ? pane(p.rearGlass, p.W - 0.36) : null,
      side: p.side ? sidePanel(p.side) : null,
      head: new RoundedBoxGeometry(0.16, 0.09, 0.44, 2, 0.035),
      tail: new RoundedBoxGeometry(0.05, 0.08, p.W - 0.5, 2, 0.03),
    }),
    [p],
  );
  const half = p.W / 2;
  const trim = mat("#16181b", { rough: 0.55 });
  const head = mat("#fffbe8", { emissive: "#fff6d8", emissiveIntensity: 2.2, rough: 0.1 });
  const tail = mat("#7a0a0a", { emissive: "#ff1a1a", emissiveIntensity: 1.6, rough: 0.2 });
  const paint = carPaint(color);
  return (
    <group>
      <mesh geometry={geo.body} material={paint} castShadow receiveShadow />
      <mesh geometry={geo.windscreen} material={glass()} />
      {geo.rearGlass && <mesh geometry={geo.rearGlass} material={glass()} />}
      {geo.side && (
        <>
          <mesh geometry={geo.side} material={glass()} position={[0, 0, half + 0.006]} />
          <mesh geometry={geo.side} material={glass()} position={[0, 0, -half - 0.006]} rotation={[0, Math.PI, 0]} scale={[-1, 1, 1]} />
        </>
      )}
      {[1, -1].map((side) => (
        <mesh key={side} geometry={geo.head} material={head} position={[p.head[0], p.head[1], side * (half - 0.32)]} rotation={[0, 0, -0.15]} />
      ))}
      <mesh geometry={geo.tail} material={tail} position={[p.tail[0], p.tail[1], 0]} />
      {/* Lower grille and side sills */}
      <mesh material={trim} position={[p.front + 0.08, p.bottom + 0.2, 0]}>
        <boxGeometry args={[0.06, 0.16, p.W - 0.6]} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh key={side} material={trim} position={[(p.arches[0].x + p.arches[1].x) / 2, p.bottom + 0.04, side * (half + 0.02)]}>
          <boxGeometry args={[p.arches[0].x - p.arches[1].x - p.arches[0].r * 2 - 0.1, 0.08, 0.05]} />
        </mesh>
      ))}
      {p.chromeBumpers &&
        [p.front + 0.06, p.rear - 0.06].map((x) => (
          <mesh key={x} material={chrome()} position={[x, p.bottom + 0.3, 0]}>
            <boxGeometry args={[0.08, 0.1, p.W + 0.04]} />
          </mesh>
        ))}
      {p.roadster && (
        <>
          {/* Open cockpit: two seats, roll hoops, a windscreen frame */}
          {[0.38, -0.38].map((z) => (
            <group key={z}>
              <mesh material={mat("#2a2420", { rough: 0.7 })} position={[-0.35, 0.18, z]}>
                <boxGeometry args={[0.5, 0.12, 0.48]} />
              </mesh>
              <mesh material={mat("#2a2420", { rough: 0.7 })} position={[-0.62, 0.42, z]} rotation={[0, 0, 0.15]}>
                <boxGeometry args={[0.1, 0.5, 0.46]} />
              </mesh>
              <mesh material={chrome()} position={[-0.78, 0.4, z]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.2, 0.025, 8, 16, Math.PI]} />
              </mesh>
            </group>
          ))}
          <mesh material={trim} position={[0.38, 0.11, 0]}>
            <boxGeometry args={[0.2, 0.04, p.W - 0.2]} />
          </mesh>
          <mesh material={mat("#1c1c1c", { rough: 0.4 })} position={[0.2, 0.22, 0.38]} rotation={[0, 0, 0.6]}>
            <torusGeometry args={[0.17, 0.02, 8, 20]} />
          </mesh>
        </>
      )}
      {p.wing && (
        <>
          <mesh material={trim} position={[-2.12, 0.32, 0]}>
            <boxGeometry args={[0.32, 0.03, p.W - 0.1]} />
          </mesh>
          {[0.6, -0.6].map((z) => (
            <mesh key={z} material={trim} position={[-2.1, 0.22, z]}>
              <boxGeometry args={[0.12, 0.2, 0.04]} />
            </mesh>
          ))}
        </>
      )}
      {p.intakes &&
        [1, -1].map((side) => (
          <mesh key={side} material={trim} position={[-0.85, -0.12, side * (half + 0.01)]} rotation={[0, 0, 0.2]}>
            <boxGeometry args={[0.7, 0.22, 0.04]} />
          </mesh>
        ))}
      {p.rails &&
        [half - 0.18, -(half - 0.18)].map((z) => (
          <mesh key={z} material={mat("#c9ccd1", { metal: 0.7, rough: 0.3 })} position={[-0.85, 0.96, z]}>
            <boxGeometry args={[2.4, 0.05, 0.05]} />
          </mesh>
        ))}
      <Decal text={p.badge} color="#ffffff" position={[p.rear - 0.07, p.bottom + 0.42, 0]} rotation={[0, -Math.PI / 2, 0]} height={0.08} />
    </group>
  );
}
