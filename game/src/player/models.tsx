import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Low-poly models built from primitives (no downloaded assets). Every model
 * faces +x; the parent rotates it to the body's heading.
 */

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** Shared flat-shaded material per colour. */
export function mat(color: string, opts: { emissive?: string; rough?: number; metal?: number } = {}) {
  const key = `${color}|${opts.emissive ?? ""}|${opts.rough ?? 0.8}|${opts.metal ?? 0}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.8, metalness: opts.metal ?? 0, flatShading: true });
    if (opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = 1.4;
    }
    mats.set(key, m);
  }
  return m;
}

function Box({ size, position, color, rotation, emissive }: { size: [number, number, number]; position: [number, number, number]; color: string; rotation?: [number, number, number]; emissive?: string }) {
  return (
    <mesh position={position} rotation={rotation} material={mat(color, { emissive })} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

export interface Outfit {
  skin: string;
  shirt: string;
  pants: string;
  hat?: { color: string; kind: "hardhat" | "straw" | "none" };
  vest?: string;
  hair?: string;
}

export const OUTFITS = {
  player: { skin: "#e0b48f", shirt: "#1f3a5f", pants: "#2e3440", hat: { color: "#f5b400", kind: "hardhat" }, vest: "#ff7a1a" },
  maya: { skin: "#c68b62", shirt: "#20365c", pants: "#1d1f24", hat: { color: "#ffffff", kind: "hardhat" }, hair: "#2b1d14" },
  priya: { skin: "#a8724f", shirt: "#c2185b", pants: "#37474f", hair: "#1a1110" },
  arjun: { skin: "#9b6a48", shirt: "#4e7d5a", pants: "#3e3a34", hair: "#151010" },
  raj: { skin: "#8d5a3b", shirt: "#5d6d7e", pants: "#2c3e50", hat: { color: "#f5b400", kind: "hardhat" }, vest: "#c6ff00" },
  gail: { skin: "#f0c9a6", shirt: "#e6d5b8", pants: "#4f7a3a", hat: { color: "#c9a25a", kind: "straw" }, hair: "#b0b0b0" },
  nguyenA: { skin: "#e8c39e", shirt: "#3b82c4", pants: "#2f2f38", hair: "#141010" },
  nguyenB: { skin: "#e8c39e", shirt: "#f2a541", pants: "#5b4b8a", hair: "#141010" },
  kid: { skin: "#ecc7a3", shirt: "#e84a5f", pants: "#2a9d8f", hair: "#1b1412" },
} satisfies Record<string, Outfit>;

/**
 * A person. `gait` (0…1+) drives the limb swing; pass a ref-backed getter for
 * the player, or leave it for an idle NPC that sways a little.
 */
export function Character({ outfit, gait, wave = false, sitting = false }: { outfit: Outfit; gait?: () => number; wave?: boolean; sitting?: boolean }) {
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  // Random start (set on the first frame) so a crowd doesn't move in lockstep.
  const phase = useRef(-1);
  useFrame((_, dt) => {
    const g = gait ? gait() : 0;
    if (phase.current < 0) phase.current = Math.random() * 10;
    phase.current += dt * (4 + g * 7);
    const swing = sitting ? 0 : Math.sin(phase.current) * Math.min(0.9, g * 0.9);
    if (legL.current && legR.current) {
      legL.current.rotation.z = sitting ? 1.3 : swing;
      legR.current.rotation.z = sitting ? 1.3 : -swing;
    }
    if (armL.current && armR.current) {
      armL.current.rotation.z = -swing * 0.8;
      armR.current.rotation.z = wave ? 0 : swing * 0.8;
      armR.current.rotation.x = wave ? -2.6 + Math.sin(phase.current * 1.6) * 0.35 : 0;
    }
    if (body.current) body.current.position.y = g > 0.05 && !sitting ? Math.abs(Math.sin(phase.current)) * 0.05 : Math.sin(phase.current * 0.3) * 0.01;
  });
  const hat = outfit.hat;
  return (
    <group ref={body}>
      {/* legs pivot at the hip */}
      <group ref={legL} position={[0, 0.82, -0.11]}>
        <Box size={[0.2, 0.82, 0.18]} position={[0, -0.41, 0]} color={outfit.pants} />
      </group>
      <group ref={legR} position={[0, 0.82, 0.11]}>
        <Box size={[0.2, 0.82, 0.18]} position={[0, -0.41, 0]} color={outfit.pants} />
      </group>
      <Box size={[0.3, 0.62, 0.48]} position={[0, 1.12, 0]} color={outfit.shirt} />
      {outfit.vest && <Box size={[0.32, 0.4, 0.5]} position={[0, 1.18, 0]} color={outfit.vest} />}
      <group ref={armL} position={[0, 1.4, -0.31]}>
        <Box size={[0.14, 0.6, 0.13]} position={[0, -0.28, 0]} color={outfit.shirt} />
        <Box size={[0.12, 0.1, 0.11]} position={[0, -0.62, 0]} color={outfit.skin} />
      </group>
      <group ref={armR} position={[0, 1.4, 0.31]}>
        <Box size={[0.14, 0.6, 0.13]} position={[0, -0.28, 0]} color={outfit.shirt} />
        <Box size={[0.12, 0.1, 0.11]} position={[0, -0.62, 0]} color={outfit.skin} />
      </group>
      <mesh position={[0, 1.62, 0]} material={mat(outfit.skin)} castShadow>
        <icosahedronGeometry args={[0.19, 1]} />
      </mesh>
      {/* eyes look forward (+x) */}
      <Box size={[0.02, 0.04, 0.04]} position={[0.18, 1.66, -0.07]} color="#1b1b1b" />
      <Box size={[0.02, 0.04, 0.04]} position={[0.18, 1.66, 0.07]} color="#1b1b1b" />
      {outfit.hair && !hat && <Box size={[0.3, 0.12, 0.38]} position={[-0.04, 1.78, 0]} color={outfit.hair} />}
      {hat?.kind === "hardhat" && (
        <group position={[0, 1.74, 0]}>
          <mesh material={mat(hat.color, { rough: 0.4 })} castShadow>
            <sphereGeometry args={[0.21, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0.06, 0.01, 0]} material={mat(hat.color, { rough: 0.4 })}>
            <cylinderGeometry args={[0.26, 0.26, 0.03, 12]} />
          </mesh>
        </group>
      )}
      {hat?.kind === "straw" && (
        <group position={[0, 1.76, 0]}>
          <mesh material={mat(hat.color)} castShadow>
            <cylinderGeometry args={[0.16, 0.19, 0.16, 10]} />
          </mesh>
          <mesh position={[0, -0.06, 0]} material={mat(hat.color)}>
            <cylinderGeometry args={[0.4, 0.4, 0.03, 14]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function Wheel({ position, r = 0.42, spin }: { position: [number, number, number]; r?: number; spin?: () => number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current && spin) ref.current.rotation.y -= (spin() / r) * dt;
  });
  return (
    <group position={position} rotation={[Math.PI / 2, 0, 0]}>
      <mesh ref={ref} material={mat("#1c1c1e")} castShadow>
        <cylinderGeometry args={[r, r, 0.32, 14]} />
      </mesh>
      <mesh material={mat("#c9ccd1", { metal: 0.6, rough: 0.3 })}>
        <cylinderGeometry args={[r * 0.55, r * 0.55, 0.34, 8]} />
      </mesh>
    </group>
  );
}

export function Truck({ speed }: { speed?: () => number }) {
  return (
    <group>
      <Box size={[5, 0.55, 2.05]} position={[0, 0.78, 0]} color="#f4f5f7" />
      <Box size={[2.1, 1.05, 1.95]} position={[0.75, 1.55, 0]} color="#f4f5f7" />
      <Box size={[0.05, 0.6, 1.7]} position={[1.81, 1.68, 0]} color="#2b3a4a" />
      <Box size={[1.4, 0.55, 2.0]} position={[0.75, 1.6, 0]} color="#2b3a4a" />
      <Box size={[5.02, 0.16, 2.07]} position={[0, 0.95, 0]} color="#1f3a5f" />
      {/* bed walls */}
      <Box size={[2.3, 0.5, 0.1]} position={[-1.35, 1.25, 0.97]} color="#f4f5f7" />
      <Box size={[2.3, 0.5, 0.1]} position={[-1.35, 1.25, -0.97]} color="#f4f5f7" />
      <Box size={[0.1, 0.5, 2.0]} position={[-2.46, 1.25, 0]} color="#f4f5f7" />
      {/* lumber in the bed */}
      <Box size={[2.0, 0.2, 1.2]} position={[-1.3, 1.15, 0]} color="#d9b47c" />
      <Box size={[0.08, 0.16, 0.4]} position={[2.5, 0.92, -0.75]} color="#fff6c2" emissive="#fff3a0" />
      <Box size={[0.08, 0.16, 0.4]} position={[2.5, 0.92, 0.75]} color="#fff6c2" emissive="#fff3a0" />
      <Box size={[0.3, 0.12, 1.1]} position={[0.9, 2.12, 0]} color="#ff9800" emissive="#ff8f00" />
      <Wheel position={[1.6, 0.42, 1.02]} spin={speed} />
      <Wheel position={[1.6, 0.42, -1.02]} spin={speed} />
      <Wheel position={[-1.6, 0.42, 1.02]} spin={speed} />
      <Wheel position={[-1.6, 0.42, -1.02]} spin={speed} />
    </group>
  );
}

export function SportsCar({ speed }: { speed?: () => number }) {
  return (
    <group>
      <Box size={[4.5, 0.45, 1.95]} position={[0, 0.55, 0]} color="#d7263d" />
      <Box size={[1.6, 0.25, 1.9]} position={[1.45, 0.82, 0]} color="#d7263d" rotation={[0, 0, -0.12]} />
      <Box size={[1.9, 0.42, 1.6]} position={[-0.3, 0.98, 0]} color="#18202a" />
      <Box size={[0.25, 0.08, 1.9]} position={[-2.2, 1.15, 0]} color="#18202a" />
      <Box size={[0.08, 0.3, 0.08]} position={[-2.2, 0.95, 0.7]} color="#18202a" />
      <Box size={[0.08, 0.3, 0.08]} position={[-2.2, 0.95, -0.7]} color="#18202a" />
      <Box size={[0.06, 0.1, 0.5]} position={[2.26, 0.62, -0.62]} color="#e8fbff" emissive="#bff6ff" />
      <Box size={[0.06, 0.1, 0.5]} position={[2.26, 0.62, 0.62]} color="#e8fbff" emissive="#bff6ff" />
      <Box size={[0.06, 0.08, 1.6]} position={[-2.27, 0.66, 0]} color="#ff3b3b" emissive="#ff1f1f" />
      <Wheel position={[1.45, 0.36, 1.0]} r={0.36} spin={speed} />
      <Wheel position={[1.45, 0.36, -1.0]} r={0.36} spin={speed} />
      <Wheel position={[-1.4, 0.38, 1.0]} r={0.38} spin={speed} />
      <Wheel position={[-1.4, 0.38, -1.0]} r={0.38} spin={speed} />
    </group>
  );
}

export function Horse({ gait, rider }: { gait?: () => number; rider?: Outfit }) {
  const legs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const neck = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    const g = gait ? gait() : 0;
    t.current += dt * (3 + g * 9);
    const a = Math.min(0.7, g * 0.8);
    legs.forEach((l, i) => {
      if (l.current) l.current.rotation.z = Math.sin(t.current + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0)) * a;
    });
    if (neck.current) neck.current.rotation.z = 0.5 + Math.sin(t.current * 2) * 0.05 * (0.3 + a);
  });
  const coat = "#8b5a2b";
  return (
    <group>
      <Box size={[1.7, 0.72, 0.62]} position={[0, 1.38, 0]} color={coat} />
      {[
        [0.65, 0.22],
        [0.65, -0.22],
        [-0.65, 0.22],
        [-0.65, -0.22],
      ].map(([x, z], i) => (
        <group key={i} ref={legs[i]} position={[x, 1.1, z]}>
          <Box size={[0.17, 1.1, 0.17]} position={[0, -0.55, 0]} color={coat} />
          <Box size={[0.2, 0.12, 0.2]} position={[0, -1.08, 0]} color="#2a1d12" />
        </group>
      ))}
      <group ref={neck} position={[0.78, 1.55, 0]}>
        <Box size={[0.32, 0.95, 0.32]} position={[0, 0.42, 0]} color={coat} />
        <Box size={[0.65, 0.3, 0.3]} position={[0.22, 0.92, 0]} color={coat} />
        <Box size={[0.08, 0.5, 0.12]} position={[-0.12, 0.5, 0]} color="#3b2414" />
        <Box size={[0.08, 0.14, 0.06]} position={[0.02, 1.12, 0.1]} color={coat} />
        <Box size={[0.08, 0.14, 0.06]} position={[0.02, 1.12, -0.1]} color={coat} />
      </group>
      <Box size={[0.12, 0.6, 0.12]} position={[-0.92, 1.3, 0]} color="#3b2414" rotation={[0, 0, -0.5]} />
      <Box size={[0.6, 0.1, 0.66]} position={[0, 1.78, 0]} color="#7a1f2b" />
      {rider && (
        <group position={[-0.05, 1.15, 0]}>
          <Character outfit={rider} sitting />
        </group>
      )}
    </group>
  );
}

/** Player with a jetpack; flames scale with thrust. */
export function JetpackRider({ outfit, gait, thrust }: { outfit: Outfit; gait?: () => number; thrust: () => number }) {
  const flames = useRef<THREE.Group>(null);
  useFrame(() => {
    const k = thrust();
    if (flames.current) {
      flames.current.visible = k > 0.02;
      flames.current.scale.set(1, 0.4 + k * (0.8 + Math.random() * 0.5), 1);
    }
  });
  const flameMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffb347", transparent: true, opacity: 0.85 }), []);
  return (
    <group>
      <Character outfit={outfit} gait={gait} />
      <Box size={[0.22, 0.55, 0.5]} position={[-0.28, 1.15, 0]} color="#9aa5b1" />
      {[-0.16, 0.16].map((z) => (
        <group key={z} position={[-0.42, 1.1, z]}>
          <mesh material={mat("#c0392b", { metal: 0.4, rough: 0.4 })} castShadow>
            <cylinderGeometry args={[0.1, 0.12, 0.6, 10]} />
          </mesh>
        </group>
      ))}
      <group ref={flames} position={[-0.42, 0.78, 0]}>
        {[-0.16, 0.16].map((z) => (
          <mesh key={z} position={[0, -0.25, z]} rotation={[Math.PI, 0, 0]} material={flameMat}>
            <coneGeometry args={[0.1, 0.5, 8]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function Goat({ gait }: { gait?: () => number }) {
  const legs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const t = useRef(-1);
  useFrame((_, dt) => {
    const g = gait ? gait() : 0;
    if (t.current < 0) t.current = Math.random() * 6;
    t.current += dt * (3 + g * 8);
    legs.forEach((l, i) => {
      if (l.current) l.current.rotation.z = Math.sin(t.current + (i % 2 ? Math.PI : 0)) * Math.min(0.6, g * 0.6);
    });
  });
  return (
    <group>
      <Box size={[0.85, 0.42, 0.38]} position={[0, 0.62, 0]} color="#f2efe8" />
      {[
        [0.3, 0.12],
        [0.3, -0.12],
        [-0.3, 0.12],
        [-0.3, -0.12],
      ].map(([x, z], i) => (
        <group key={i} ref={legs[i]} position={[x, 0.45, z]}>
          <Box size={[0.08, 0.45, 0.08]} position={[0, -0.22, 0]} color="#d8d2c4" />
        </group>
      ))}
      <Box size={[0.34, 0.26, 0.24]} position={[0.55, 0.92, 0]} color="#f2efe8" />
      <Box size={[0.08, 0.12, 0.05]} position={[0.6, 0.72, 0]} color="#c9c1b0" />
      <mesh position={[0.5, 1.12, 0.07]} rotation={[0.3, 0, -0.5]} material={mat("#8c7b62")}>
        <coneGeometry args={[0.03, 0.2, 6]} />
      </mesh>
      <mesh position={[0.5, 1.12, -0.07]} rotation={[-0.3, 0, -0.5]} material={mat("#8c7b62")}>
        <coneGeometry args={[0.03, 0.2, 6]} />
      </mesh>
      <Box size={[0.04, 0.04, 0.04]} position={[0.72, 0.97, 0.08]} color="#222" />
      <Box size={[0.04, 0.04, 0.04]} position={[0.72, 0.97, -0.08]} color="#222" />
      <Box size={[0.1, 0.12, 0.06]} position={[-0.46, 0.8, 0]} color="#f2efe8" />
    </group>
  );
}
