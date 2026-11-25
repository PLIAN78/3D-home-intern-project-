import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mat } from "../render/materials";
import { Human, TOWNSFOLK } from "../models/human";
import { host, FIRST_CAMP_TREE } from "../core/simHost";
import { B, Sign } from "./props";
import { Walkway } from "./Walkways";
import { groundAt } from "./terrain";
import { PLACED_BUSHES, PLACED_ROCKS } from "./wildsBoxes";
import { CAMP_HOST, CAMP_TRAIL, CAMP_TREES, CAMPFIRE, CAMPGROUND, CREEK_WIDTH, CREEKS, LOG_PILE, MOUNTAIN, PICNIC_TABLES, SUMMIT, TENTS } from "./wilds";

/**
 * The south-west woods: Pine Hollow Campground (campfire, tents, tables, the
 * camp host and the ribboned firewood trees), the creeks off Mount Tamarack,
 * boulders, undergrowth and the summit cairn.
 */
const at = (p: [number, number], lift = 0): [number, number, number] => [p[0], groundAt(p[0], p[1]) + lift, p[1]];

function Campfire() {
  const flames = useRef<(THREE.Mesh | null)[]>([]);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    flames.current.forEach((f, i) => {
      if (!f) return;
      const k = 0.85 + Math.sin(t * (7 + i * 2.3) + i) * 0.12 + Math.sin(t * 13.1 + i * 4) * 0.06;
      f.scale.set(1 - i * 0.2, k * (1.1 - i * 0.25), 1 - i * 0.2);
      f.rotation.y = t * (0.8 + i * 0.3);
    });
    if (light.current) light.current.intensity = 14 + Math.sin(t * 9) * 2.5 + Math.sin(t * 23) * 1.2;
  });
  return (
    <group position={at(CAMPFIRE)} name="Campfire">
      {Array.from({ length: 11 }, (_, i) => {
        const a = (i / 11) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.85, 0.12, Math.sin(a) * 0.85]} scale={[0.22, 0.16, 0.2]} rotation={[0, a, 0]} material={mat(i % 2 ? "#8a7d6c" : "#9a8c79", { rough: 0.95 })} castShadow>
            <dodecahedronGeometry args={[1, 0]} />
          </mesh>
        );
      })}
      {[0, 1.05, 2.1].map((a) => (
        <mesh key={a} position={[0, 0.12, 0]} rotation={[0, a, Math.PI / 2 - 0.25]} material={mat("#5b3c22", { rough: 0.9 })} castShadow>
          <cylinderGeometry args={[0.07, 0.08, 1.1, 8]} />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => void (flames.current[i] = el)} position={[0, 0.25 + i * 0.12, 0]} material={mat(["#ff7a1a", "#ffb02e", "#ffe08a"][i], { emissive: ["#ff5a00", "#ff9a1a", "#ffd060"][i], emissiveIntensity: 2.6 })}>
          <coneGeometry args={[0.38, 0.9, 7, 1, true]} />
        </mesh>
      ))}
      <pointLight ref={light} position={[0, 1.2, 0]} color="#ff9a4a" intensity={14} distance={22} decay={2} />
      {/* Log benches round the fire. */}
      {[0.4, 2.5, 4.4].map((a) => (
        <mesh key={a} position={[Math.cos(a) * 3, 0.25, Math.sin(a) * 3]} rotation={[0, -a + Math.PI / 2, Math.PI / 2]} material={mat("#6b4a2c", { rough: 0.9 })} castShadow receiveShadow>
          <cylinderGeometry args={[0.26, 0.28, 2.4, 10]} />
        </mesh>
      ))}
    </group>
  );
}

function Tent({ t }: { t: (typeof TENTS)[number] }) {
  const cloth = mat(t.colour, { rough: 0.85 });
  return (
    <group position={at(t.at)} rotation={[0, -t.heading, 0]} name="Tent">
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0.82, s * 0.62]} rotation={[s * 0.92, 0, 0]} material={cloth} castShadow receiveShadow>
          <boxGeometry args={[3, 0.04, 1.65]} />
        </mesh>
      ))}
      {/* Back wall, and the door: a dark flap in the front triangle. */}
      <mesh position={[-1.5, 0.78, 0]} material={cloth} castShadow>
        <cylinderGeometry args={[0.001, 1.18, 1.56, 3, 1, false, Math.PI / 2, Math.PI * 2]} />
      </mesh>
      <mesh position={[1.5, 0.6, 0]} rotation={[0, 0, 0]} material={mat("#2a2622")}>
        <cylinderGeometry args={[0.001, 0.62, 1.15, 3, 1, false, Math.PI / 2, Math.PI * 2]} />
      </mesh>
      <B size={[0.06, 1.75, 0.06]} position={[1.52, 0.86, 0]} color="#8a8f93" />
      <B size={[3.2, 0.03, 2.4]} position={[0, 0.02, 0]} color="#3d4a3a" cast={false} />
    </group>
  );
}

function PicnicTable({ p }: { p: (typeof PICNIC_TABLES)[number] }) {
  const wood = "#8a6a46";
  return (
    <group position={at(p.at)} rotation={[0, -p.heading, 0]} name="Picnic table">
      <B size={[1.9, 0.07, 0.8]} position={[0, 0.76, 0]} color={wood} />
      {[-1, 1].map((s) => <B key={s} size={[1.9, 0.06, 0.28]} position={[0, 0.45, s * 0.62]} color={wood} />)}
      {[-0.7, 0.7].map((x) => [-1, 1].map((s) => <B key={x + "-" + s} size={[0.08, 0.8, 0.08]} position={[x, 0.38, s * 0.45]} rotation={[s * 0.45, 0, 0]} color="#6b5236" />))}
    </group>
  );
}

/** The firewood trees' orange ribbons, hidden once a tree has been chopped (until it grows back). */
function Ribbons() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const trees = host.sim?.breakables.trees;
    refs.current.forEach((r, i) => {
      if (r) r.visible = trees?.[FIRST_CAMP_TREE + i]?.status !== "fallen";
    });
  });
  return (
    <group name="Firewood ribbons">
      {CAMP_TREES.map((p, i) => (
        <mesh key={i} ref={(el) => void (refs.current[i] = el)} position={at(p, 1.35)} rotation={[Math.PI / 2, 0, 0]} material={mat("#ff7a1a", { emissive: "#7a3200", emissiveIntensity: 0.4 })}>
          <torusGeometry args={[0.34, 0.06, 6, 16]} />
        </mesh>
      ))}
    </group>
  );
}

/** Boulders, in warm greys (the sky light turns neutral grey stone lavender). */
function Rocks() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const d = new THREE.Object3D(), c = new THREE.Color();
    PLACED_ROCKS.forEach((r, i) => {
      d.position.set(r.at[0], groundAt(r.at[0], r.at[1]) + r.scale * 0.22, r.at[1]);
      d.rotation.set((i % 5) * 0.3, r.turn, (i % 3) * 0.25);
      d.scale.set(r.scale * 0.8, r.scale * 0.5, r.scale * 0.7);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, c.set(["#a08f78", "#94846e", "#ab9b84", "#86786a"][i % 4]));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, PLACED_ROCKS.length]} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 1]} />
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  );
}

function Bushes() {
  const spots = PLACED_BUSHES;
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const d = new THREE.Object3D(), c = new THREE.Color();
    // Each bush is three overlapping blobs.
    spots.forEach((b, i) => {
      for (let k = 0; k < 3; k++) {
        const a = i * 2.1 + k * 2.2, r = b.scale * 0.45;
        const x = b.at[0] + (k ? Math.cos(a) * r : 0), z = b.at[1] + (k ? Math.sin(a) * r : 0);
        d.position.set(x, groundAt(x, z) + b.scale * (k ? 0.42 : 0.55), z);
        d.rotation.set(0, a, 0);
        d.scale.set(b.scale * (k ? 0.75 : 1), b.scale * (k ? 0.6 : 0.75), b.scale * (k ? 0.75 : 1));
        d.updateMatrix();
        m.setMatrixAt(i * 3 + k, d.matrix);
        m.setColorAt(i * 3 + k, c.set([["#3f6b2c", "#4f7a32", "#36602a"], ["#5a7d36", "#6a8a3c", "#4d7030"], ["#2f5a2f", "#3c6a38", "#2b5129"]][b.tone][k]));
      }
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spots.length * 3]} castShadow receiveShadow>
      <icosahedronGeometry args={[0.9, 1]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  );
}

function CampHost() {
  const ref = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (ref.current) ref.current.visible = Math.hypot(camera.position.x - CAMP_HOST[0], camera.position.z - CAMP_HOST[1]) < 160;
  });
  return (
    <group ref={ref} position={at(CAMP_HOST)} rotation={[0, Math.PI * 0.8, 0]} name="Camp host">
      <Human outfit={TOWNSFOLK[3]} pose="wave" />
    </group>
  );
}

export function WildsScene() {
  const [cx, cz] = CAMPGROUND.at;
  return (
    <group name="South-west woods">
      <Walkway points={CAMP_TRAIL} width={3} color="#8a6f4e" lift={0.06} />
      {CREEKS.map((c, i) => (
        <group key={i}>
          <Walkway points={c} width={CREEK_WIDTH + 2.2} color="#6f7f5a" lift={0.05} />
          <Walkway points={c} width={CREEK_WIDTH} color="#4f8fa1" lift={0.09} />
        </group>
      ))}
      {/* The clearing: trodden earth round the fire. */}
      <mesh position={[cx, groundAt(cx, cz) + 0.04, cz]} rotation={[-Math.PI / 2, 0, 0]} material={mat("#7d6a4c", { rough: 1 })} receiveShadow>
        <circleGeometry args={[9, 28]} />
      </mesh>
      <Campfire />
      {TENTS.map((t, i) => <Tent key={i} t={t} />)}
      {PICNIC_TABLES.map((p, i) => <PicnicTable key={i} p={p} />)}
      <group position={at(LOG_PILE)} name="Log pile">
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const row = i < 3 ? 0 : i < 5 ? 1 : 2, k = i < 3 ? i : i < 5 ? i - 3 : 0;
          return (
            <mesh key={i} position={[0, 0.24 + row * 0.4, (k - (row === 0 ? 1 : row === 1 ? 0.5 : 0)) * 0.44]} rotation={[0, 0, Math.PI / 2]} material={mat("#7a5532", { rough: 0.9 })} castShadow>
              <cylinderGeometry args={[0.21, 0.21, 2.4, 10]} />
            </mesh>
          );
        })}
        {/* Chopping stump with the axe in it. */}
        <mesh position={[1.9, 0.3, 0.4]} material={mat("#6b4a2c", { rough: 0.9 })} castShadow><cylinderGeometry args={[0.36, 0.4, 0.6, 12]} /></mesh>
        <B size={[0.05, 0.7, 0.05]} position={[1.9, 0.85, 0.4]} rotation={[0.35, 0, 0.2]} color="#8a6038" />
        <B size={[0.04, 0.16, 0.24]} position={[1.85, 0.62, 0.32]} rotation={[0.35, 0, 0.2]} color="#9aa3ab" />
      </group>
      <Ribbons />
      <CampHost />
      <group position={[0, groundAt(cx + 18, cz - 31), 0]}>
        <Sign text={CAMPGROUND.name} sub="Campfire · tents · firewood job (see the camp host)" at={[cx + 18, cz - 31]} heading={-Math.PI / 2} width={11} />
      </group>
      <Rocks />
      <Bushes />
      {/* Summit cairn and flag. */}
      <group position={at(SUMMIT)} name="Summit">
        {[0.9, 0.7, 0.5, 0.32].map((r, i) => (
          <mesh key={i} position={[0, 0.3 + i * 0.42, 0]} scale={[r, 0.32, r]} rotation={[0, i, 0]} material={mat("#9a8c79", { rough: 0.95 })} castShadow>
            <dodecahedronGeometry args={[1, 0]} />
          </mesh>
        ))}
        <B size={[0.05, 2.4, 0.05]} position={[0, 2.6, 0]} color="#d8d6cf" />
        <B size={[0.02, 0.5, 0.8]} position={[0, 3.5, 0.4]} color="#c43b2f" />
        <group position={[3, 0, 0]}>
          <Sign text={MOUNTAIN.name} sub={`Summit · ${MOUNTAIN.height} m above the woods`} at={[0, 0]} heading={0} width={7} />
        </group>
      </group>
    </group>
  );
}
