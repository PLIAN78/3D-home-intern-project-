import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { fabric, mat } from "../render/materials";
import { Human, type Outfit } from "./human";

/**
 * Animals built the same way as people: smooth capsules on a jointed rig with
 * procedural gaits. Both face +x with feet at y = 0.
 */

const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 5, 14);

const HG = {
  barrel: cap(0.5, 1.0),
  chest: new THREE.SphereGeometry(0.5, 18, 14),
  neck: cap(0.2, 0.5),
  head: cap(0.14, 0.4),
  muzzle: new THREE.SphereGeometry(0.12, 12, 10),
  ear: new THREE.ConeGeometry(0.045, 0.16, 8),
  upper: cap(0.1, 0.38),
  lower: cap(0.05, 0.42),
  hoof: new THREE.CylinderGeometry(0.065, 0.08, 0.09, 10),
  tail: new THREE.ConeGeometry(0.1, 0.8, 8, 1, true),
  mane: new THREE.BoxGeometry(0.06, 0.7, 0.05),
  saddle: cap(0.28, 0.25),
  blanket: new THREE.BoxGeometry(0.75, 0.04, 0.9),
  eye: new THREE.SphereGeometry(0.022, 8, 6),
};

/**
 * Biscuit. Gaits by speed: walk (four-beat), trot (diagonal pairs), gallop
 * (front pair, then hind pair). `rider` sits in the saddle.
 */
export function HorseModel({ speed, rider, coat = "#8a5634" }: { speed: () => number; rider?: Outfit; coat?: string }) {
  const legs = useRef<(THREE.Group | null)[]>([]);
  const knees = useRef<(THREE.Group | null)[]>([]);
  const neck = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const t = useRef(0);
  const m = useMemo(
    () => ({
      coat: mat(coat, { rough: 0.55 }),
      dark: mat("#2b1a10", { rough: 0.7 }),
      hoof: mat("#1f1a16", { rough: 0.5 }),
      white: mat("#efe9df", { rough: 0.6 }),
      saddle: mat("#5b3418", { rough: 0.45 }),
      blanket: fabric("#1f3a5f"),
      eye: mat("#0d0b0a", { rough: 0.15 }),
    }),
    [coat],
  );
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const v = Math.abs(speed());
    const gallop = v > 10.5;
    const trot = v > 3.2 && !gallop;
    t.current += dt * (v < 0.2 ? 0 : gallop ? 9.5 : trot ? 8 : 2 + v * 1.6);
    const p = t.current;
    const amp = Math.min(0.75, 0.2 + v * 0.06);
    // Phase offsets per leg: front-left, front-right, hind-left, hind-right.
    const offsets = gallop ? [0, 0.35, Math.PI, Math.PI + 0.35] : trot ? [0, Math.PI, Math.PI, 0] : [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];
    for (let i = 0; i < 4; i++) {
      const a = Math.sin(p + offsets[i]) * (v < 0.2 ? 0 : amp);
      const front = i < 2;
      legs.current[i]?.rotation.set(0, 0, a);
      const lift = Math.max(0, Math.cos(p + offsets[i])) * (v < 0.2 ? 0 : 0.5 + amp);
      knees.current[i]?.rotation.set(0, 0, front ? -lift : lift * 0.8);
    }
    if (body.current) {
      body.current.position.y = gallop ? Math.abs(Math.sin(p)) * 0.12 : trot ? Math.abs(Math.sin(p)) * 0.06 : 0;
      body.current.rotation.z = gallop ? Math.sin(p) * 0.05 : 0;
    }
    if (neck.current) neck.current.rotation.z = -0.95 - (v < 0.2 ? Math.sin(performance.now() * 0.0005) * 0.06 : Math.sin(p * 2) * 0.05) - (gallop ? 0.15 : 0);
    if (tail.current) tail.current.rotation.z = -0.55 + Math.sin(performance.now() * 0.003) * 0.08 + (gallop ? 0.35 : 0);
  });
  const legSpots: [number, number][] = [
    [0.68, 0.2],
    [0.68, -0.2],
    [-0.62, 0.2],
    [-0.62, -0.2],
  ];
  return (
    <group>
      <group ref={body}>
        <mesh geometry={HG.barrel} material={m.coat} position={[0, 1.3, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.95, 0.92, 0.74]} castShadow />
        <mesh geometry={HG.chest} material={m.coat} position={[0.66, 1.33, 0]} scale={[0.85, 0.98, 0.74]} castShadow />
        <mesh geometry={HG.chest} material={m.coat} position={[-0.66, 1.36, 0]} scale={[0.92, 0.96, 0.8]} castShadow />
        {legSpots.map(([x, z], i) => (
          <group
            key={i}
            ref={(el) => {
              legs.current[i] = el;
            }}
            position={[x, 1.12, z]}
          >
            <mesh geometry={HG.upper} material={m.coat} position={[0, -0.22, 0]} castShadow />
            <group
              ref={(el) => {
                knees.current[i] = el;
              }}
              position={[0, -0.48, 0]}
            >
              <mesh geometry={HG.lower} material={i === 1 || i === 3 ? m.white : m.coat} position={[0, -0.26, 0]} castShadow />
              <mesh geometry={HG.hoof} material={m.hoof} position={[0, -0.56, 0]} castShadow />
            </group>
          </group>
        ))}
        <group ref={neck} position={[0.9, 1.42, 0]} rotation={[0, 0, -0.95]}>
          <mesh geometry={HG.neck} material={m.coat} position={[0, 0.36, 0]} scale={[1, 1, 0.8]} castShadow />
          <mesh geometry={HG.mane} material={m.dark} position={[-0.17, 0.4, 0]} />
          <group position={[0.02, 0.76, 0]} rotation={[0, 0, -1.25]}>
            <mesh geometry={HG.head} material={m.coat} position={[0, 0.25, 0]} castShadow />
            <mesh geometry={HG.muzzle} material={m.dark} position={[0, 0.5, 0]} scale={[0.95, 0.8, 0.85]} />
            <mesh geometry={HG.ear} material={m.coat} position={[-0.1, 0.0, 0.08]} rotation={[0.2, 0, 1.4]} />
            <mesh geometry={HG.ear} material={m.coat} position={[-0.1, 0.0, -0.08]} rotation={[-0.2, 0, 1.4]} />
            <mesh geometry={HG.eye} material={m.eye} position={[0.05, 0.12, 0.11]} />
            <mesh geometry={HG.eye} material={m.eye} position={[0.05, 0.12, -0.11]} />
          </group>
        </group>
        <group ref={tail} position={[-1.02, 1.45, 0]} rotation={[0, 0, -0.55]}>
          <mesh geometry={HG.tail} material={m.dark} position={[0, -0.38, 0]} rotation={[Math.PI, 0, 0]} />
        </group>
        <mesh geometry={HG.blanket} material={m.blanket} position={[0.05, 1.62, 0]} />
        <mesh geometry={HG.saddle} material={m.saddle} position={[0.05, 1.68, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.55, 1, 0.85]} castShadow />
        {rider && (
          <group position={[0.02, 0.9, 0]}>
            <Human outfit={rider} pose="ride" motion={{ speed }} />
          </group>
        )}
      </group>
    </group>
  );
}

const GG = {
  body: cap(0.5, 0.5),
  head: cap(0.1, 0.16),
  leg: cap(0.035, 0.36),
  horn: new THREE.ConeGeometry(0.028, 0.2, 8),
  beard: new THREE.ConeGeometry(0.04, 0.12, 8),
  tail: new THREE.ConeGeometry(0.04, 0.12, 8),
  ear: new THREE.SphereGeometry(0.05, 8, 6),
  eye: new THREE.SphereGeometry(0.016, 8, 6),
};

/** A goat: wanders, follows you when led. */
export function GoatModel({ speed, coat = "#f1ede5" }: { speed: () => number; coat?: string }) {
  const legs = useRef<(THREE.Group | null)[]>([]);
  const t = useRef(-1);
  const head = useRef<THREE.Group>(null);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const v = speed();
    if (t.current < 0) t.current = Math.random() * 6;
    t.current += dt * (2 + v * 5);
    for (let i = 0; i < 4; i++) legs.current[i]?.rotation.set(0, 0, Math.sin(t.current + (i === 0 || i === 3 ? 0 : Math.PI)) * Math.min(0.6, v * 0.35));
    if (head.current) head.current.rotation.z = v < 0.2 ? -0.5 + Math.sin(t.current * 0.7) * 0.25 : 0.1;
  });
  const coatM = mat(coat, { rough: 0.85 });
  const legM = mat("#d6cfc0", { rough: 0.85 });
  return (
    <group>
      <mesh geometry={GG.body} material={coatM} position={[0, 0.66, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.42, 0.9, 0.36]} castShadow />
      {[
        [0.28, 0.11],
        [0.28, -0.11],
        [-0.28, 0.11],
        [-0.28, -0.11],
      ].map(([x, z], i) => (
        <group
          key={i}
          ref={(el) => {
            legs.current[i] = el;
          }}
          position={[x, 0.52, z]}
        >
          <mesh geometry={GG.leg} material={legM} position={[0, -0.24, 0]} castShadow />
        </group>
      ))}
      <group ref={head} position={[0.48, 0.9, 0]}>
        <mesh geometry={GG.head} material={coatM} position={[0.1, 0, 0]} rotation={[0, 0, -1.2]} castShadow />
        <mesh geometry={GG.horn} material={mat("#7f6f58", { rough: 0.6 })} position={[0.02, 0.16, 0.06]} rotation={[0.25, 0, 0.55]} />
        <mesh geometry={GG.horn} material={mat("#7f6f58", { rough: 0.6 })} position={[0.02, 0.16, -0.06]} rotation={[-0.25, 0, 0.55]} />
        <mesh geometry={GG.ear} material={coatM} position={[0.0, 0.06, 0.11]} scale={[0.5, 0.35, 1]} />
        <mesh geometry={GG.ear} material={coatM} position={[0.0, 0.06, -0.11]} scale={[0.5, 0.35, 1]} />
        <mesh geometry={GG.beard} material={mat("#cfc6b4")} position={[0.2, -0.15, 0]} rotation={[0, 0, Math.PI]} />
        <mesh geometry={GG.eye} material={mat("#2a1a0a", { rough: 0.2 })} position={[0.14, 0.05, 0.07]} />
        <mesh geometry={GG.eye} material={mat("#2a1a0a", { rough: 0.2 })} position={[0.14, 0.05, -0.07]} />
      </group>
      <mesh geometry={GG.tail} material={coatM} position={[-0.46, 0.84, 0]} rotation={[0, 0, 0.9]} />
    </group>
  );
}
