import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { logs, metricBox, seamRoof } from "../render/architecture";
import { lumber, mat } from "../render/materials";
import { waterNormalMap } from "../render/textures";
import { Decal } from "../render/decal";
import { runtime } from "../core/runtime";
import { Human, type Outfit } from "../models/human";
import { angleDelta } from "../sim/math";
import { useGame } from "../story/store";
import { tackleAt } from "../story/quests";
import { DECK_Y, ELIAS, hutBase, JETTIES, LAKE_HUTS, TACKLE_SEARCH } from "./lake";
import { groundAt, LAKE, LAKE_Y, lakeRadius } from "./terrain";

/**
 * Heron Lake: the water, reeds and lily pads along the shore, the public dock
 * with its rental hut, and the island where Elias fishes off his jetty
 * beside a little log shack. His lost tackle box bobs out by the west reeds.
 */
export function LakeScene() {
  return (
    <group name="HeronLake">
      <LakeWater />
      <Reeds />
      {JETTIES.map((j, i) => (
        <Jetty key={i} {...j} />
      ))}
      {LAKE_HUTS.map((h) => (
        <Hut key={h.id} hut={h} />
      ))}
      <DockSign />
      <Elias />
      <TackleBox />
    </group>
  );
}

/** The lake surface: dark glossy water mirroring the sky, ripples drifting across. */
function LakeWater() {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(() => {
    const normal = waterNormalMap().clone();
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set(LAKE.rx / 5, LAKE.rz / 5);
    normal.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({
      color: "#1f4048",
      roughness: 0.05,
      metalness: 0,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.5,
      transparent: true,
      opacity: 0.9,
    });
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, dt) => {
    const n = (ref.current?.material as THREE.MeshPhysicalMaterial | undefined)?.normalMap;
    if (!n) return;
    n.offset.x += dt * 0.01;
    n.offset.y += dt * 0.006;
  });
  return (
    <mesh ref={ref} position={[LAKE.centre[0], LAKE_Y, LAKE.centre[1]]} rotation={[-Math.PI / 2, 0, 0]} scale={[LAKE.rx * 1.01, LAKE.rz * 1.01, 1]} material={material} receiveShadow>
      <circleGeometry args={[1, 120]} />
    </mesh>
  );
}

function hash(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Reed beds in the shallows (thickest on the west shore, where the box drifted) and lily pads. */
function Reeds() {
  const { reeds, pads } = useMemo(() => {
    const reeds: { x: number; z: number; h: number; lean: number; yaw: number }[] = [];
    const pads: { x: number; z: number; r: number; yaw: number }[] = [];
    for (let i = 0; i < 2600; i++) {
      const a = hash(i) * Math.PI * 2;
      // Thick on the west shore, patchy elsewhere.
      const west = Math.cos(a - Math.PI);
      if (hash(i + 7000) > 0.25 + Math.max(0, west) * 0.75) continue;
      const e = 0.9 + hash(i + 3000) * 0.08;
      const x = LAKE.centre[0] + Math.cos(a) * LAKE.rx * e;
      const z = LAKE.centre[1] + Math.sin(a) * LAKE.rz * e;
      // Clear water at the dock.
      if (Math.hypot(x + 560, z + 550) < 22) continue;
      const g = groundAt(x, z);
      if (g > LAKE_Y + 0.3 || g < LAKE_Y - 1.6) continue;
      reeds.push({ x, z, h: 1.2 + hash(i + 5000) * 1.1 + (LAKE_Y - g) * 0.3, lean: (hash(i + 6000) - 0.5) * 0.3, yaw: hash(i + 8000) * Math.PI });
    }
    for (let i = 0; i < 260; i++) {
      const a = Math.PI * (0.55 + hash(i + 9000) * 0.9);
      const e = 0.8 + hash(i + 9500) * 0.12;
      const x = LAKE.centre[0] + Math.cos(a) * LAKE.rx * e;
      const z = LAKE.centre[1] + Math.sin(a) * LAKE.rz * e;
      if (lakeRadius(x, z) > 0.95) continue;
      pads.push({ x, z, r: 0.35 + hash(i + 9900) * 0.35, yaw: hash(i + 9700) * Math.PI * 2 });
    }
    return { reeds, pads };
  }, []);
  const reedMesh = useRef<THREE.InstancedMesh>(null);
  const padMesh = useRef<THREE.InstancedMesh>(null);
  const reedGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.035, 1, 4, 1, true);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  const padGeo = useMemo(() => {
    // A lily pad: a disc with a notch.
    const g = new THREE.CircleGeometry(1, 14, 0.25, Math.PI * 2 - 0.5);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  useEffect(() => {
    const m = reedMesh.current;
    const p = padMesh.current;
    const o = new THREE.Object3D();
    if (m) {
      reeds.forEach((r, i) => {
        o.position.set(r.x, groundAt(r.x, r.z) - 0.2, r.z);
        o.rotation.set(r.lean, r.yaw, r.lean * 0.5);
        o.scale.set(1, r.h + (LAKE_Y - groundAt(r.x, r.z)) + 0.2, 1);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
        m.setColorAt(i, new THREE.Color().setHSL(0.2 + hash(i) * 0.06, 0.45, 0.28 + hash(i + 1) * 0.12));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
    if (p) {
      pads.forEach((d, i) => {
        o.position.set(d.x, LAKE_Y + 0.03, d.z);
        o.rotation.set(0, d.yaw, 0);
        o.scale.setScalar(d.r);
        o.updateMatrix();
        p.setMatrixAt(i, o.matrix);
      });
      p.instanceMatrix.needsUpdate = true;
      p.computeBoundingSphere();
    }
  }, [reeds, pads]);
  return (
    <group name="Reeds">
      <instancedMesh ref={reedMesh} args={[reedGeo, mat("#ffffff", { rough: 0.85 }), reeds.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={padMesh} args={[padGeo, mat("#3f6b2e", { rough: 0.5 }), pads.length]} receiveShadow frustumCulled={false} />
    </group>
  );
}

/** A plank deck on posts, with a low rail on one side. */
function Jetty({ x0, z0, x1, z1 }: { x0: number; z0: number; x1: number; z1: number }) {
  const geo = useMemo(() => {
    const w = x1 - x0;
    const d = z1 - z0;
    const deck = metricBox(w, 0.16, d, 1.2);
    deck.translate(x0 + w / 2, DECK_Y - 0.08, z0 + d / 2);
    const posts: THREE.BufferGeometry[] = [];
    for (let z = z0 + 0.3; z < z1; z += 2.4)
      for (const x of [x0 + 0.15, x1 - 0.15]) {
        const bottom = Math.min(groundAt(x, z), LAKE_Y - 1) - 0.5;
        const h = DECK_Y - bottom;
        const p = new THREE.CylinderGeometry(0.12, 0.13, h, 8);
        p.translate(x, bottom + h / 2, z);
        posts.push(p);
      }
    return { deck, posts: posts.length ? mergeGeometries(posts, false) : null };
  }, [x0, z0, x1, z1]);
  return (
    <group>
      <mesh geometry={geo.deck} material={lumber()} castShadow receiveShadow />
      {geo.posts && <mesh geometry={geo.posts} material={mat("#5a4632", { rough: 0.9 })} castShadow />}
      {/* Cleats along the deck edge */}
      {Array.from({ length: Math.floor((z1 - z0) / 6) }, (_, i) => (
        <mesh key={i} position={[x1 - 0.2, DECK_Y + 0.06, z0 + 3 + i * 6]} material={mat("#2a2c30", { metal: 0.6, rough: 0.4 })}>
          <boxGeometry args={[0.1, 0.08, 0.35]} />
        </mesh>
      ))}
    </group>
  );
}

/** A small log hut with a metal roof and a door, like Rosa's cottage in miniature. */
function Hut({ hut }: { hut: (typeof LAKE_HUTS)[number] }) {
  const [w, d, h] = hut.size;
  const y = hutBase(hut);
  const geo = useMemo(() => ({ walls: metricBox(w, h + 0.3, d, 1.2) }), [w, h, d]);
  const isShack = hut.id === "shack";
  return (
    <group position={[hut.at[0], y, hut.at[1]]} rotation={[0, -hut.heading, 0]}>
      <mesh geometry={geo.walls} material={logs(isShack ? "#a57b52" : "#c89a68")} position={[0, (h + 0.3) / 2, 0]} castShadow receiveShadow />
      {/* Gable roof */}
      {[1, -1].map((side) => (
        <mesh key={side} material={seamRoof(isShack ? "#7a3b2e" : "#35506b")} position={[0, h + 0.3 + 0.55, side * (d / 4 + 0.1)]} rotation={[side * 0.5, 0, 0]} castShadow>
          <boxGeometry args={[w + 0.8, 0.1, d / 2 + 0.75]} />
        </mesh>
      ))}
      <mesh material={mat("#5a3d28")} position={[w / 2 + 0.02, 1.15, 0]}>
        <boxGeometry args={[0.06, 2.0, 0.95]} />
      </mesh>
      <mesh material={mat("#2b3a44", { rough: 0.15, metal: 0.3 })} position={[0, 1.6, d / 2 + 0.02]}>
        <boxGeometry args={[1.1, 0.8, 0.05]} />
      </mesh>
      {isShack ? (
        // Stovepipe and a woodpile.
        <>
          <mesh material={mat("#2a2c30", { metal: 0.5 })} position={[-w / 4, h + 1.6, -d / 4]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 1.4, 10]} />
          </mesh>
          {[0, 1, 2].map((k) => (
            <mesh key={k} material={mat("#8a6a48")} position={[-w / 2 - 0.5, 0.25 + k * 0.28, -0.6 + (k % 2) * 0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.13, 0.13, 1.6, 8]} />
            </mesh>
          ))}
        </>
      ) : (
        // Boat-rental counter with paddles and a life ring.
        <>
          <mesh material={mat("#f1efe8")} position={[w / 2 + 0.25, 1.05, 0]}>
            <boxGeometry args={[0.5, 0.08, 2.2]} />
          </mesh>
          <mesh material={mat("#ff6a1a", { rough: 0.6 })} position={[0, 1.6, -d / 2 - 0.06]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.32, 0.08, 8, 18]} />
          </mesh>
          <Decal text="BOAT RENTALS" color="#f6f3ea" height={0.32} position={[w / 2 + 0.03, h - 0.1, 0]} rotation={[0, Math.PI / 2, 0]} />
        </>
      )}
    </group>
  );
}

/** "Heron Lake" sign at the end of Lake Road. */
function DockSign() {
  const x = -548;
  const z = -536;
  const y = groundAt(x, z);
  return (
    <group position={[x, y, z]} rotation={[0, Math.PI / 4, 0]}>
      {[-1.2, 1.2].map((px) => (
        <mesh key={px} material={mat("#5a4632")} position={[px, 0.9, 0]} castShadow>
          <boxGeometry args={[0.14, 1.8, 0.14]} />
        </mesh>
      ))}
      <mesh material={mat("#2f4a3a")} position={[0, 1.45, 0]} castShadow>
        <boxGeometry args={[3, 0.8, 0.08]} />
      </mesh>
      {[1, -1].map((side) => (
        <Decal key={side} text="HERON LAKE" color="#f3efe2" height={0.42} position={[0, 1.5, side * 0.045]} rotation={[0, side > 0 ? 0 : Math.PI, 0]} />
      ))}
    </group>
  );
}

const ELIAS_LOOK: Outfit = { skin: "#d6a986", shirt: "#7d2b2b", pants: "#5d5446", shoes: "#3b2b1d", hair: "#eeece6", hat: { kind: "cap", color: "#2f4a3a" } };

/** Elias on an upturned bucket at the end of his jetty, rod out, float bobbing. Turns to you when you come close. */
function Elias() {
  const turn = useRef<THREE.Group>(null);
  const float = useRef<THREE.Mesh>(null);
  const near = useRef(false);
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: "#e8e8e8", transparent: true, opacity: 0.7 }));
    l.frustumCulled = false;
    return l;
  }, []);
  // Rod tip in Elias's frame (he faces +x locally).
  const tip = useMemo(() => new THREE.Vector3(2.7, 2.35, 0.25), []);
  useFrame((_, dt) => {
    const b = runtime.body;
    const dx = b.x - ELIAS.at[0];
    const dz = b.z - ELIAS.at[1];
    near.current = Math.hypot(dx, dz) < 5;
    const g = turn.current;
    if (g) {
      // A slow half-turn toward you; he never turns his back on the water entirely.
      const want = near.current ? ELIAS.facing + Math.max(-1, Math.min(1, angleDelta(ELIAS.facing, Math.atan2(dz, dx)))) : ELIAS.facing;
      const cur = -g.rotation.y;
      g.rotation.y = -(cur + angleDelta(cur, want) * Math.min(1, dt * 2));
    }
    const t = runtime.time;
    const bite = Math.sin(t * 0.7) > 0.96;
    const fy = -0.9 + 0.02 * Math.sin(t * 2.2) - (bite ? 0.12 : 0);
    if (float.current) float.current.position.set(5.6, fy, 0.25 + Math.sin(t * 0.4) * 0.2);
    const p = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    p.setXYZ(0, tip.x, tip.y, tip.z);
    if (float.current) p.setXYZ(1, float.current.position.x, fy + 0.05, float.current.position.z);
    p.needsUpdate = true;
  });
  return (
    <group position={[ELIAS.at[0], DECK_Y, ELIAS.at[1]]}>
      <group ref={turn} rotation={[0, -ELIAS.facing, 0]}>
        <mesh material={mat("#3d5a80", { rough: 0.5 })} position={[-0.05, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.17, 0.44, 14]} />
        </mesh>
        <group position={[0, -0.04, 0]}>
          <Human outfit={ELIAS_LOOK} pose="sit" />
        </group>
        {/* Rod: from his hands to the tip */}
        <mesh material={mat("#2b2016", { rough: 0.5 })} position={[(0.4 + tip.x) / 2, (0.95 + tip.y) / 2, 0.25]} rotation={[0, 0, -Math.atan2(tip.x - 0.4, tip.y - 0.95)]}>
          <cylinderGeometry args={[0.008, 0.018, Math.hypot(tip.x - 0.4, tip.y - 0.95), 6]} />
        </mesh>
        <primitive object={line} />
        <mesh ref={float} material={mat("#e5482f", { emissive: "#7a1a0a", emissiveIntensity: 0.3 })}>
          <sphereGeometry args={[0.06, 10, 8]} />
        </mesh>
        {/* His bait bucket */}
        <mesh material={mat("#c9c6bd", { metal: 0.5, rough: 0.4 })} position={[0.3, 0.15, -0.6]} castShadow>
          <cylinderGeometry args={[0.16, 0.13, 0.3, 12]} />
        </mesh>
      </group>
    </group>
  );
}

/** The red tackle box, floating until you fish it out (with a soft beacon while you're looking for it). */
function TackleBox() {
  const elias = useGame((s) => s.elias);
  const ref = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = runtime.time;
    const [x, z] = tackleAt(t);
    g.position.set(x, LAKE_Y + 0.08 + Math.sin(t * 1.9) * 0.05, z);
    g.rotation.set(Math.sin(t * 1.3) * 0.12, t * 0.15, Math.cos(t * 1.1) * 0.1);
    if (beacon.current) beacon.current.position.set(x, LAKE_Y + 4, z);
  });
  if (elias === "found" || elias === "done") return null;
  return (
    <>
      <group ref={ref} position={[TACKLE_SEARCH.centre[0], LAKE_Y, TACKLE_SEARCH.centre[1]]}>
        <mesh material={mat("#c62828", { rough: 0.45 })} castShadow>
          <boxGeometry args={[0.62, 0.34, 0.36]} />
        </mesh>
        <mesh material={mat("#2b2d31", { rough: 0.5 })} position={[0, 0.2, 0]}>
          <boxGeometry args={[0.3, 0.05, 0.06]} />
        </mesh>
        <mesh material={mat("#d4d0c4", { metal: 0.7, rough: 0.3 })} position={[0.32, 0.05, 0]}>
          <boxGeometry args={[0.02, 0.08, 0.1]} />
        </mesh>
      </group>
      {elias === "asked" && (
        <mesh ref={beacon} material={beaconMat}>
          <cylinderGeometry args={[1.4, 1.4, 8, 24, 1, true]} />
        </mesh>
      )}
    </>
  );
}

const beaconMat = new THREE.MeshBasicMaterial({ color: "#facc15", transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
