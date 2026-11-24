import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { runtime } from "../core/runtime";
import { Human, type Outfit } from "../models/human";
import { lumber, mat } from "../render/materials";
import { Decal } from "../render/decal";
import { angleDelta } from "../sim/math";
import { useGame } from "../story/store";
import { CREW, MARCO, SAM_LOOK, SAM_WAIT, TRAN } from "../story/quests";
import { CRANES } from "./map";

/**
 * The busy east phase of Maple Run and Birch Lane: two tower cranes slewing
 * over the frames with loads on their hooks, Marco the foreman and his crew.
 * Also the co-op people at the school (Ms. Tran, and Sam until the bus ride).
 */
export function EastPhase() {
  return (
    <group name="EastPhase">
      {CRANES.map((c, i) => (
        <TowerCrane key={i} {...c} index={i} />
      ))}
      <Standing at={MARCO.at} facing={MARCO.facing} outfit={MARCO_LOOK} clipboard />
      {CREW.map((w, i) => (
        <Standing key={i} at={w.at} facing={w.facing} outfit={CREW_LOOKS[i % CREW_LOOKS.length]} plank={w.tool === "plank"} />
      ))}
      <Standing at={TRAN.at} facing={TRAN.facing} outfit={TRAN_LOOK} clipboard />
      <Sam />
    </group>
  );
}

const MARCO_LOOK: Outfit = { skin: "#c68863", shirt: "#4a5160", pants: "#3a3f4a", shoes: "#3b2b1d", vest: "#ff7a00", hat: { kind: "hardhat", color: "#ffffff" }, hair: "#2b1d14" };
const TRAN_LOOK: Outfit = { skin: "#e8c4a0", shirt: "#8a4a5c", pants: "#2c2f36", shoes: "#2a2a2a", hair: "#121010", longHair: true };
const CREW_LOOKS: Outfit[] = [
  { skin: "#8d5a3b", shirt: "#3a4b5c", pants: "#4a5160", shoes: "#3b2b1d", vest: "#d7f000", hat: { kind: "hardhat", color: "#f5c400" }, hair: "#151010" },
  { skin: "#e0b08f", shirt: "#7a2e2e", pants: "#30343c", shoes: "#3a2a20", vest: "#ff7a00", hat: { kind: "hardhat", color: "#f5c400" }, hair: "#7a5432" },
  { skin: "#6e4630", shirt: "#56705a", pants: "#3a3f4a", shoes: "#2a2a2a", vest: "#d7f000", hat: { kind: "hardhat", color: "#1d6fd6" }, hair: "#0f0c0a" },
  { skin: "#d9a77f", shirt: "#2f3a4a", pants: "#6b5a46", shoes: "#3b2b1d", vest: "#ff7a00", hat: { kind: "hardhat", color: "#f5c400" }, hair: "#a87a42", longHair: true },
];

/** A person who stands at a spot and turns to face you when you come close. */
function Standing({ at, facing, outfit, clipboard, plank }: { at: [number, number]; facing: number; outfit: Outfit; clipboard?: boolean; plank?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const near = useRef(false);
  useFrame((_, dt) => {
    const b = runtime.body;
    const dx = b.x - at[0];
    const dz = b.z - at[1];
    near.current = Math.hypot(dx, dz) < 8;
    const g = ref.current;
    if (!g) return;
    const want = near.current ? Math.atan2(dz, dx) : facing;
    const cur = -g.rotation.y;
    g.rotation.y = -(cur + angleDelta(cur, want) * Math.min(1, dt * 4));
  });
  return (
    <group position={[at[0], 0, at[1]]}>
      <group ref={ref} rotation={[0, -facing, 0]}>
        <Human outfit={outfit} pose={() => (near.current ? "wave" : "auto")} />
        {clipboard && (
          <mesh position={[0.28, 1.0, -0.22]} rotation={[0.3, 0, 0.2]} material={mat("#6b4a2e")}>
            <boxGeometry args={[0.24, 0.32, 0.02]} />
          </mesh>
        )}
        {plank && (
          <mesh position={[0, 0.06, 0.6]} rotation={[0, 0.3, 0]} material={lumber()} castShadow>
            <boxGeometry args={[3.6, 0.09, 0.14]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

/** Sam waits at the bus door until the ride (then sits in the bus: see Vehicles.tsx). */
function Sam() {
  const coop = useGame((s) => s.coop);
  if (coop !== "hired") return null;
  return <Standing at={SAM_WAIT.at} facing={SAM_WAIT.facing} outfit={SAM_LOOK} />;
}

// ── Tower cranes ────────────────────────────────────────────────────────

const SECTION = 3;
const MAST_W = 1.6;

/** A thin square bar from a to b. */
function strut(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  const d = b.clone().sub(a);
  const g = new THREE.BoxGeometry(t, t, d.length());
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g.toNonIndexed();
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A square lattice mast: four chords with zig-zag bracing and rungs on every face. */
function mastGeometry(height: number) {
  const parts: THREE.BufferGeometry[] = [];
  const h = MAST_W / 2;
  const corners = [V(-h, 0, -h), V(h, 0, -h), V(h, 0, h), V(-h, 0, h)];
  for (const c of corners) parts.push(strut(c, V(c.x, height, c.z), 0.14));
  for (let y = 0, k = 0; y < height - 0.1; y += SECTION, k++)
    for (let f = 0; f < 4; f++) {
      const a = corners[f];
      const b = corners[(f + 1) % 4];
      const up = Math.min(height, y + SECTION);
      parts.push(k % 2 ? strut(V(a.x, y, a.z), V(b.x, up, b.z), 0.07) : strut(V(b.x, y, b.z), V(a.x, up, a.z), 0.07));
      parts.push(strut(V(a.x, y, a.z), V(b.x, y, b.z), 0.08));
    }
  return mergeGeometries(parts, false)!;
}

/** A triangular lattice jib along +x (negative length for the counter-jib). */
function jibGeometry(length: number) {
  const parts: THREE.BufferGeometry[] = [];
  const L = Math.abs(length);
  const s = Math.sign(length);
  const w = 0.7;
  const h = 1.3;
  parts.push(strut(V(0, 0, -w), V(s * L, 0, -w), 0.12), strut(V(0, 0, w), V(s * L, 0, w), 0.12), strut(V(0, h, 0), V(s * L, h * 0.6, 0), 0.12));
  const step = 2;
  for (let x = 0, k = 0; x < L - 0.1; x += step, k++) {
    const x1 = Math.min(L, x + step);
    const topAt = (px: number) => h - (h * 0.4 * px) / L;
    for (const z of [-w, w]) parts.push(k % 2 ? strut(V(s * x, 0, z), V(s * x1, topAt(x1), 0), 0.06) : strut(V(s * x, topAt(x), 0), V(s * x1, 0, z), 0.06));
    parts.push(strut(V(s * x, 0, -w), V(s * x, 0, w), 0.06));
  }
  return mergeGeometries(parts, false)!;
}

function TowerCrane({ x, z, height, jib, phase, index }: { x: number; z: number; height: number; jib: number; phase: number; index: number }) {
  const slew = useRef<THREE.Group>(null);
  const trolley = useRef<THREE.Group>(null);
  const cable = useRef<THREE.Mesh>(null);
  const hook = useRef<THREE.Group>(null);
  const geo = useMemo(() => ({ mast: mastGeometry(height), jib: jibGeometry(jib), counter: jibGeometry(-jib * 0.3) }), [height, jib]);
  const yellow = mat("#f2b707", { rough: 0.5, metal: 0.3 });
  useFrame(() => {
    const t = runtime.time * 0.12 + phase;
    // Slew back and forth over the lots, run the trolley in and out, hoist the load up and down.
    if (slew.current) slew.current.rotation.y = Math.sin(t) * 1.1 + phase;
    const out = 8 + (jib - 12) * (0.5 + 0.5 * Math.sin(t * 1.7 + 1));
    const drop = 6 + (height - 14) * (0.5 + 0.5 * Math.sin(t * 2.3));
    if (trolley.current) trolley.current.position.x = out;
    if (cable.current) {
      cable.current.scale.y = drop;
      cable.current.position.y = -drop / 2;
    }
    if (hook.current) hook.current.position.y = -drop;
  });
  return (
    <group position={[x, 0, z]} name={`crane-${index}`}>
      {/* Concrete base and the mast */}
      <mesh position={[0, 0.4, 0]} material={mat("#a9a59c", { rough: 0.95 })} receiveShadow castShadow>
        <boxGeometry args={[4.5, 0.8, 4.5]} />
      </mesh>
      <mesh geometry={geo.mast} material={yellow} castShadow />
      {/* Access ladder and the climbing frame at the base */}
      <mesh position={[MAST_W / 2 + 0.25, 1.6, 0]} material={mat("#2a2c30", { metal: 0.6 })}>
        <boxGeometry args={[0.05, 2.4, 0.5]} />
      </mesh>
      <group ref={slew} position={[0, height, 0]}>
        {/* Slewing ring, cab, apex and tie bars */}
        <mesh position={[0, 0.4, 0]} material={yellow} castShadow>
          <cylinderGeometry args={[1.2, 1.2, 0.8, 16]} />
        </mesh>
        <mesh position={[1.1, 1.0, 1.3]} material={mat("#e9e6df", { rough: 0.5 })} castShadow>
          <boxGeometry args={[2, 2, 1.6]} />
        </mesh>
        <mesh position={[2.12, 1.15, 1.3]} material={mat("#2b3a44", { rough: 0.1, metal: 0.3 })}>
          <boxGeometry args={[0.04, 1.4, 1.4]} />
        </mesh>
        <mesh position={[0, 4.2, 0]} material={yellow} castShadow>
          <boxGeometry args={[0.5, 6, 0.5]} />
        </mesh>
        <mesh geometry={geo.jib} position={[0, 0.9, 0]} material={yellow} castShadow />
        <mesh geometry={geo.counter} position={[0, 0.9, 0]} material={yellow} castShadow />
        {/* Ties from the apex to the jib and counter-jib */}
        {[jib * 0.6, -jib * 0.28].map((tx, i) => {
          const dy = 7.2 - 2.2;
          const len = Math.hypot(tx, dy);
          return (
            <mesh key={i} position={[tx / 2, 2.2 + dy / 2, 0]} rotation={[0, 0, Math.atan2(tx, dy)]} material={mat("#3a3c40", { metal: 0.7 })}>
              <cylinderGeometry args={[0.04, 0.04, len, 6]} />
            </mesh>
          );
        })}
        {/* Counterweights */}
        <mesh position={[-jib * 0.27, 0.2, 0]} material={mat("#9a968d", { rough: 0.95 })} castShadow>
          <boxGeometry args={[2.4, 2.2, 1.8]} />
        </mesh>
        <Decal text="CAIVAN" color="#1d1f22" height={0.7} position={[jib * 0.35, 1.55, 0.73]} rotation={[0, 0, 0]} />
        {/* Trolley, cable, hook and the load */}
        <group ref={trolley} position={[12, 0.85, 0]}>
          <mesh material={mat("#2a2c30", { metal: 0.5 })}>
            <boxGeometry args={[1.2, 0.4, 1.3]} />
          </mesh>
          <mesh ref={cable} material={mat("#1a1a1a")}>
            <cylinderGeometry args={[0.025, 0.025, 1, 4]} />
          </mesh>
          <group ref={hook}>
            <mesh material={mat("#f2b707", { metal: 0.4 })} castShadow>
              <boxGeometry args={[0.5, 0.6, 0.4]} />
            </mesh>
            {/* Slings and a bundle of roof trusses (or a wall panel on the second crane) */}
            {index % 2 === 0 ? (
              <group position={[0, -2.2, 0]}>
                {[-0.5, -0.25, 0, 0.25, 0.5].map((k) => (
                  <mesh key={k} position={[0, 0, k]} material={lumber()} castShadow>
                    <boxGeometry args={[8, 0.16, 0.06]} />
                  </mesh>
                ))}
              </group>
            ) : (
              <mesh position={[0, -2.6, 0]} material={mat("#c9b48e", { rough: 0.9 })} castShadow>
                <boxGeometry args={[6, 2.4, 0.18]} />
              </mesh>
            )}
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 1.2, -0.9, 0]} rotation={[0, 0, s * 0.95]} material={mat("#2a2c30")}>
                <cylinderGeometry args={[0.02, 0.02, 2.6, 4]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}
