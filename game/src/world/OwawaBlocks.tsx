import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { brick, metricBox, shopGlass } from "../render/architecture";
import { chrome, mat } from "../render/materials";
import { Decal } from "../render/decal";
import { B } from "./props";
import { facade } from "./OwawaScene";
import { BUSINESSES, CITY_BLOCKS } from "./v6";
import type { CityBlockBuilding } from "./owawaCity";

const STONE = ["#d9d3c7", "#c7bba8", "#b9b4ac", "#a69a8c"];
const BRICK = ["#8a4f3c", "#6e4a3c", "#9a6a52", "#7a5a48"];
const hash = (n: number) => { const s = Math.sin(n * 12.9898 + 4.1414) * 43758.5453; return s - Math.floor(s); };

/**
 * Owawa's high-rise blocks, drawn in a handful of merged meshes (one per
 * material) so a city of two hundred buildings stays cheap: glass and stone
 * facades, glazed lobbies or shopfronts at street level, cornices, rooftop
 * penthouses and plant, and masts on the tallest towers.
 */
export function OwawaBlocks() {
  const parts = useMemo(() => {
    const buckets = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[] }>();
    const add = (key: string, material: () => THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number) => {
      g.translate(x, y, z);
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { material: material(), geos: [] }));
      b.geos.push(g);
    };
    for (const b of CITY_BLOCKS as CityBlockBuilding[]) {
      const [x, z] = b.at, [w, d, h] = b.size, glass = b.style === "tower", low = b.style === "lowrise" || b.kind === "shop";
      const base = glass ? 7 : 4.2;
      if (low) add("brick" + b.tone, () => brick(BRICK[b.tone]), metricBox(w, h, d, 14.4), x, h / 2, z);
      else add(`facade-${glass ? "tower" : "midrise"}-${b.tone}`, () => facade(glass ? "tower" : "midrise", b.tone), metricBox(w, h, d, 14.4), x, h / 2, z);
      add("lobby", shopGlass, metricBox(w + 0.3, base, d + 0.3, 4), x, base / 2, z);
      add(glass ? "band-dark" : "band-stone" + ((b.tone + 1) % 4), () => (glass ? mat("#2b2f35", { rough: 0.6, metal: 0.5 }) : mat(STONE[(b.tone + 1) % 4], { rough: 0.6 })), new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6), x, base + 0.3, z);
      add(glass ? "roof-metal" : "roof-stone", () => mat(glass ? "#9aa1a8" : "#bdb6aa", { metal: glass ? 0.6 : 0, rough: 0.5 }), new THREE.BoxGeometry(w + 0.2, 0.8, d + 0.2), x, h + 0.4, z);
      if (!low) add("crown", () => mat("#6c727a", { metal: 0.4, rough: 0.6 }), new THREE.BoxGeometry(Math.max(4, w - 4), 4.5, Math.max(4, d - 4)), x, h + 2.25, z);
      for (let i = 0; i < 3; i++) {
        const s = 2 + hash(i * 3 + x) * 2.5;
        add("plant", () => mat("#a7adb3", { metal: 0.5, rough: 0.5 }), new THREE.BoxGeometry(s, s, s * 1.3), x + (hash(i + x) - 0.5) * (w - 8), h + 0.8 + s / 2, z + (hash(i + z) - 0.5) * (d - 8));
      }
      if (glass && h > 150) add("mast", chrome, new THREE.CylinderGeometry(0.12, 0.35, 18, 8), x, h + 13.5, z);
    }
    return [...buckets.entries()].map(([key, b]) => {
      const g = mergeGeometries(b.geos, false)!;
      b.geos.forEach((x) => x.dispose());
      return { key, geometry: g, material: b.material };
    });
  }, []);
  useEffect(() => () => parts.forEach((p) => p.geometry.dispose()), [parts]);
  return (
    <group name="Owawa blocks">
      {parts.map((p) => <mesh key={p.key} geometry={p.geometry} material={p.material} castShadow receiveShadow />)}
      {BUSINESSES.map((s) => <Storefront key={s.id} id={s.id} />)}
    </group>
  );
}

/** A business's street front: awning in its colour, glass doors, name over the door, and an "E" plate. */
function Storefront({ id }: { id: string }) {
  const s = BUSINESSES.find((b) => b.id === id)!;
  const [x, z] = s.door;
  const police = id === "police";
  return (
    <group position={[x, 0, z]} rotation={[0, Math.atan2(s.facing[0], s.facing[1]), 0]} name={s.name}>
      {/* The wall is 1.5 m behind the door point (local −z). */}
      <B size={[10, 0.25, 2.4]} position={[0, 4.1, -0.3]} color={s.colour} />
      <B size={[10.2, 1.1, 0.2]} position={[0, 4.9, -1.38]} color={s.colour} />
      <B size={[3.2, 3.2, 0.12]} position={[0, 1.6, -1.42]} color="#26343b" />
      {[-1, 1].map((k) => <B key={k} size={[0.16, 3.4, 0.2]} position={[k * 1.7, 1.7, -1.38]} color="#c9a54f" />)}
      <Decal text={s.name} color="#f4ead2" position={[0, 4.9, -1.26]} rotation={[0, 0, 0]} size={[Math.min(9.4, s.name.length * 0.42), 0.7]} />
      <Decal text="E - ENTER" color="#f6e0a3" position={[0, 2.6, -1.34]} rotation={[0, 0, 0]} size={[2.2, 0.45]} />
      {police && [-4.6, 4.6].map((k) => <mesh key={k} position={[k, 3.6, -1.2]} material={mat("#3b6fd1", { emissive: "#3b6fd1", emissiveIntensity: 1.5 })}><sphereGeometry args={[0.25, 10, 8]} /></mesh>)}
    </group>
  );
}
