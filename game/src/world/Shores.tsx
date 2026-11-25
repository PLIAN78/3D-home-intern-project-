import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { waterNormalMap } from "../render/textures";
import { B, Sign } from "./props";
import { mat } from "../render/materials";
import { groundAt, LAKE_Y, PLAY_HALF } from "./terrain";
import { BEACH, bankProfile, SHORES, type Shore } from "./shoreline";
import { MEADOW_WAY_Z } from "./meadows";
import { NORTH_BEACH, riverWidth, riverZ } from "./v6";

/**
 * One water surface for the river and the lake (they used to be two meshes at
 * the same height, which flickered where they overlapped). Land hides it
 * wherever the ground is above the water.
 */
export function WorldWater() {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(() => {
    const normal = waterNormalMap().clone();
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set((PLAY_HALF * 2) / 9, (PLAY_HALF * 2) / 9);
    normal.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({ color: "#265865", roughness: 0.08, metalness: 0.05, normalMap: normal, normalScale: new THREE.Vector2(0.32, 0.32), clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.4, transparent: true, opacity: 0.88 });
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, dt) => {
    const n = (ref.current?.material as THREE.MeshPhysicalMaterial | undefined)?.normalMap;
    if (!n) return;
    n.offset.x += dt * 0.01;
    n.offset.y += dt * 0.006;
  });
  return (
    <mesh ref={ref} name="Water" position={[0, LAKE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material} receiveShadow>
      <planeGeometry args={[PLAY_HALF * 2, PLAY_HALF * 2]} />
    </mesh>
  );
}

/**
 * Across a bank strip: metres toward land from the waterline, and the colour
 * there (wet → dry). A muddy bank, and the beach's wide sand; the two blend
 * over the ends of the beach.
 */
const BANK: [number, string][] = [[-3, "#86836a"], [-1.2, "#9a9172"], [0, "#a39673"], [1.2, "#a8a07c"], [2.2, "#9aa071"], [3.2, "#8f9a6a"], [4.2, "#84965f"], [5, "#7c9358"]];
const SAND: [number, string][] = [[-4, "#9d9372"], [-1.5, "#c2b48a"], [0, "#d3c49a"], [2, "#e0d2a8"], [8, "#e6d9b2"], [16, "#e2d4a9"], [BEACH.depth, "#c9c497"], [BEACH.depth + 3, "#8d9b62"]];
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function bankGeometry(s: Shore) {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new THREE.Color(), c2 = new THREE.Color();
  const rows = BANK.length;
  s.points.forEach(([x, z], i) => {
    const [nx, nz] = s.normals[i];
    // Sand where a beach is: Meadows Beach on the south bank, Riverside Beach on the north.
    const b = s.id.startsWith("river-south") ? BEACH : s.id.startsWith("river-north") ? NORTH_BEACH : null;
    const w = b ? smooth(b.x0 - 12, b.x0 + 4, x) * (1 - smooth(b.x1 - 4, b.x1 + 12, x)) : 0;
    BANK.forEach(([bd, bhex], k) => {
      const [sd, shex] = SAND[k];
      const dd = bd + (sd - bd) * w;
      c.set(bhex).lerp(c2.set(shex), w);
      const px = x + nx * dd, pz = z + nz * dd;
      // Above the waterline, never below the drawn ground (so the grid's zig-zag stays hidden).
      const y = dd <= 0 ? bankProfile(dd) : Math.max(Math.min(bankProfile(dd), groundAt(px, pz) + 0.12), groundAt(px, pz) + 0.05);
      pos.push(px, y, pz);
      col.push(c.r, c.g, c.b);
    });
  });
  // Wind every triangle to face up: strips run either way round (the north bank and Heron Bay
  // run opposite to the south bank), and a downward face lit from below rendered black.
  const up = (i: number, j: number, k: number) => {
    const ax = pos[j * 3] - pos[i * 3], az = pos[j * 3 + 2] - pos[i * 3 + 2], bx = pos[k * 3] - pos[i * 3], bz = pos[k * 3 + 2] - pos[i * 3 + 2];
    return az * bx - ax * bz > 0;
  };
  const tri = (i: number, j: number, k: number) => (up(i, j, k) ? idx.push(i, j, k) : idx.push(i, k, j));
  for (let i = 0; i < s.points.length - 1; i++)
    for (let k = 0; k < rows - 1; k++) {
      const a = i * rows + k, b = a + 1, cc = a + rows, d = cc + 1;
      tri(a, b, cc);
      tri(b, d, cc);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

const bankMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });

/** Banks along every shore, and Meadows Beach with its umbrellas, towels, lifeguard chair and net. */
export function Shores() {
  const geos = useMemo(() => SHORES.map(bankGeometry), []);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  return (
    <group name="Shores">
      {geos.map((g, i) => <mesh key={i} geometry={g} material={bankMaterial} receiveShadow />)}
      <BeachProps beach={BEACH} side={1} sign={[BEACH.x0 + 8, MEADOW_WAY_Z - 12]} />
      <BeachProps beach={NORTH_BEACH} side={-1} sign={[NORTH_BEACH.x0 + 8, riverZ(NORTH_BEACH.x0 + 8) - riverWidth(NORTH_BEACH.x0 + 8) / 2 - NORTH_BEACH.depth - 2]} />
    </group>
  );
}

/** A beach's umbrellas and towels, lifeguard chair, volleyball net and sign. `side`: +1 on the south bank, −1 on the north. */
function BeachProps({ beach, side, sign }: { beach: { x0: number; x1: number; name: string }; side: 1 | -1; sign: [number, number] }) {
  const beachZ = (x: number, inland: number) => riverZ(x) + side * (riverWidth(x) / 2 + inland);
  const span = beach.x1 - beach.x0;
  const umbrellas = [0.09, 0.21, 0.36, 0.53, 0.69, 0.84].map((t) => beach.x0 + span * t);
  const chair = beach.x0 + span * 0.47, net = beach.x0 + span * 0.82;
  return (
    <group name={beach.name}>
      {umbrellas.map((x, i) => {
        const z = beachZ(x, 9 + (i % 2 ? 3 : -1)), y = groundAt(x, z) + 0.05, color = ["#d9512f", "#2f8f9d", "#e0a43a"][(i + (side < 0 ? 1 : 0)) % 3];
        return (
          <group key={x} position={[x, y, z]}>
            <B size={[0.08, 2.4, 0.08]} position={[0, 1.2, 0]} color="#e8e4d8" />
            <mesh position={[0, 2.35, 0]} material={mat(color)} castShadow>
              <coneGeometry args={[1.6, 0.6, 10, 1, true]} />
            </mesh>
            <B size={[1.8, 0.04, 0.9]} position={[1.4, 0.03, 0.6 * side]} color={i % 2 ? "#f1e6c8" : "#c9e1e4"} cast={false} />
          </group>
        );
      })}
      <group position={[chair, groundAt(chair, beachZ(chair, 15)), beachZ(chair, 15)]} rotation={[0, side < 0 ? Math.PI : 0, 0]} name="Lifeguard chair">
        {[-0.6, 0.6].flatMap((a) => [-0.5, 0.5].map((b) => <B key={a + "-" + b} size={[0.12, 2.4, 0.12]} position={[a, 1.2, b]} color="#f2f0ea" />))}
        <B size={[1.4, 0.12, 1.2]} position={[0, 2.4, 0]} color="#d9512f" />
        <B size={[1.4, 0.9, 0.1]} position={[0, 2.9, -0.55]} color="#d9512f" />
      </group>
      <group position={[net, groundAt(net, beachZ(net, 19)), beachZ(net, 19)]} name="Volleyball net">
        {[-4.5, 4.5].map((a) => <B key={a} size={[0.1, 2.5, 0.1]} position={[a, 1.25, 0]} color="#f2f0ea" />)}
        <B size={[9, 0.9, 0.03]} position={[0, 2.0, 0]} color="#e9e5d9" />
      </group>
      <group position={[0, groundAt(sign[0], sign[1]), 0]}>
        <Sign text={beach.name} sub="Swimming · volleyball · lifeguard on duty" at={sign} heading={side > 0 ? 0 : Math.PI} width={8} />
      </group>
    </group>
  );
}
