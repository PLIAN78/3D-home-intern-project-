import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { groundGrass, mat } from "../render/materials";
import { HAZE } from "./Environment";
import { CAIVAN_RIDGE, WORLD_HALF } from "./map";

/**
 * Everything beyond the playable square: rolling farmland and wooded hills that
 * rise toward the horizon and fade into the haze, so the world doesn't end at a
 * flat edge. Purely visual (the physics world has walls at the map edge).
 */

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, z: number) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    s += valueNoise(x * f, z * f) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

const INNER = WORLD_HALF + 10;
const OUTER = 2600;

/** Height of the countryside at (x, z): flat at the map edge, hills further out. */
export function hillHeight(x: number, z: number) {
  const r = Math.max(Math.abs(x), Math.abs(z));
  const t = THREE.MathUtils.smoothstep(r, INNER, INNER + 500);
  const far = THREE.MathUtils.smoothstep(r, 900, OUTER);
  return t * (fbm(x * 0.0022, z * 0.0022) * 90 + 6) + far * 180 * fbm(x * 0.0009 + 3.1, z * 0.0009);
}

function hillGeometry() {
  // A square ring, densest near the playable area.
  const rings = 46;
  const seg = 160;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const r = INNER - 12 + (OUTER - INNER) * t * t;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      // Square-ish ring: scale a circle out to the square's edge.
      const c = Math.cos(a);
      const s = Math.sin(a);
      const k = 1 / Math.max(Math.abs(c), Math.abs(s));
      const blend = Math.min(1, t * 3);
      const rr = r * (k * (1 - blend) + 1.05 * blend);
      const x = c * rr;
      const z = s * rr;
      pos.push(x, i === 0 ? -0.05 : hillHeight(x, z), z);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Wooded patches on the hills: cheap clustered canopies (only seen from afar). */
function forestGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const rand = (i: number) => hash(i * 1.7, i * 3.3);
  for (let i = 0; i < 2600; i++) {
    const a = rand(i) * Math.PI * 2;
    const r = INNER + 60 + Math.pow(rand(i + 1000), 0.7) * 1100;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Trees grow in woodland bands, not everywhere.
    if (fbm(x * 0.004 + 7, z * 0.004) < 0.48) continue;
    const s = 5 + rand(i + 2000) * 6;
    const g = blob.clone();
    g.scale(s, s * (1.1 + rand(i + 3000) * 0.5), s);
    g.translate(x, hillHeight(x, z) + s * 0.8, z);
    parts.push(g);
  }
  return mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
}

export function Countryside() {
  const hills = useMemo(() => hillGeometry(), []);
  const forest = useMemo(() => forestGeometry(), []);
  return (
    <group name="Countryside">
      <mesh geometry={hills} material={groundGrass()} receiveShadow />
      <mesh geometry={forest} material={mat("#3f5a2c", { rough: 0.95 })} />
      {/* Far horizon band, so the sky never meets bare ground */}
      <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat(HAZE, { rough: 1 })}>
        <ringGeometry args={[OUTER - 10, OUTER * 3, 64]} />
      </mesh>
    </group>
  );
}

/** Painted road markings: dashed yellow centre lines on every street. */
export function RoadMarkings() {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const dash = 3;
    const gap = 6;
    for (const r of CAIVAN_RIDGE.roads) {
      const dx = r.to[0] - r.from[0];
      const dz = r.to[1] - r.from[1];
      const L = Math.hypot(dx, dz);
      const ang = Math.atan2(dz, dx);
      for (let s = 6; s < L - 6; s += dash + gap) {
        const g = new THREE.PlaneGeometry(dash, 0.14);
        g.rotateX(-Math.PI / 2);
        g.rotateY(-ang);
        const t = (s + dash / 2) / L;
        g.translate(r.from[0] + dx * t, 0.028, r.from[1] + dz * t);
        parts.push(g);
      }
    }
    return mergeGeometries(parts, false);
  }, []);
  if (!geo) return null;
  return <mesh geometry={geo} material={mat("#e9b62a", { rough: 0.6 })} receiveShadow />;
}
