import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { groundGrass, mat } from "../render/materials";
import { HAZE } from "./Environment";
import { CAIVAN_RIDGE } from "./map";
import { fbm, FLAT_HALF, naturalHeight, PLAY_HALF, TERRAIN_STEP, terrainHeight } from "./terrain";

/**
 * The land around the community: the drivable hills out to the edge of the
 * playable area (shared with the physics, see terrain.ts), then countryside
 * rising toward the horizon and fading into the haze.
 */

const OUTER = 2600;

/**
 * The hills inside the playable area, as a grid matching the physics
 * heightfield vertex for vertex (same spacing, same heights), so wheels and
 * feet sit exactly on what's drawn. Only cells outside the flat community are
 * emitted; the community's own ground covers the middle.
 */
function hillGridGeometry() {
  const n = Math.round((PLAY_HALF * 2) / TERRAIN_STEP);
  const pos = new Float32Array((n + 1) * (n + 1) * 3);
  for (let r = 0; r <= n; r++)
    for (let c = 0; c <= n; c++) {
      const x = -PLAY_HALF + c * TERRAIN_STEP;
      const z = -PLAY_HALF + r * TERRAIN_STEP;
      const h = terrainHeight(x, z);
      const i = (r * (n + 1) + c) * 3;
      pos[i] = x;
      // Just under the community ground where they overlap.
      pos[i + 1] = h === 0 ? -0.04 : h;
      pos[i + 2] = z;
    }
  const idx: number[] = [];
  const inner = FLAT_HALF - 10;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const x1 = -PLAY_HALF + (c + 1) * TERRAIN_STEP;
      const z1 = -PLAY_HALF + (r + 1) * TERRAIN_STEP;
      const x0 = x1 - TERRAIN_STEP;
      const z0 = z1 - TERRAIN_STEP;
      if (Math.max(Math.abs(x0), Math.abs(x1)) < inner && Math.max(Math.abs(z0), Math.abs(z1)) < inner) continue;
      const a = r * (n + 1) + c;
      const b = a + 1;
      const d = a + n + 1;
      const e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Beyond the playable area: a ring of countryside out to the horizon. Its inner
 * edge has a vertex every TERRAIN_STEP metres along the square boundary, so it
 * meets the hill grid without cracks; further out it rounds into a circle.
 */
function horizonGeometry() {
  const perim = Math.round((PLAY_HALF * 8) / TERRAIN_STEP);
  const rings = 34;
  const edge: [number, number][] = [];
  for (let j = 0; j <= perim; j++) {
    const s = (j / perim) * 8 * PLAY_HALF;
    const side = Math.min(3, Math.floor(s / (2 * PLAY_HALF)));
    const t = s - side * 2 * PLAY_HALF - PLAY_HALF;
    edge.push(side === 0 ? [t, -PLAY_HALF] : side === 1 ? [PLAY_HALF, t] : side === 2 ? [-t, PLAY_HALF] : [-PLAY_HALF, -t]);
  }
  const pos: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const r = PLAY_HALF + (OUTER - PLAY_HALF) * t * t;
    const blend = Math.min(1, t * 2.5);
    for (const [ex, ez] of edge) {
      const len = Math.hypot(ex, ez);
      const sq = r / PLAY_HALF;
      const x = ex * sq * (1 - blend) + (ex / len) * r * 1.02 * blend;
      const z = ez * sq * (1 - blend) + (ez / len) * r * 1.02 * blend;
      pos.push(x, naturalHeight(x, z), z);
    }
  }
  const idx: number[] = [];
  const w = perim + 1;
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < perim; j++) {
      const a = i * w + j;
      const b = a + w;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Far woodland beyond the playable hills: cheap clustered canopies, only ever seen from afar. */
function forestGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const rand = (i: number) => hash(i * 1.7, i * 3.3);
  for (let i = 0; i < 3200; i++) {
    const a = rand(i) * Math.PI * 2;
    const r = PLAY_HALF + 40 + Math.pow(rand(i + 1000), 0.7) * 1300;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.max(Math.abs(x), Math.abs(z)) < PLAY_HALF + 30) continue;
    if (fbm(x * 0.004 + 7, z * 0.004) < 0.47) continue;
    const s = 5 + rand(i + 2000) * 6;
    const g = blob.clone();
    g.scale(s, s * (1.1 + rand(i + 3000) * 0.5), s);
    g.translate(x, naturalHeight(x, z) + s * 0.8, z);
    parts.push(g);
  }
  return mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
}

export function Countryside() {
  const hills = useMemo(() => hillGridGeometry(), []);
  const horizon = useMemo(() => horizonGeometry(), []);
  const forest = useMemo(() => forestGeometry(), []);
  return (
    <group name="Countryside">
      <mesh geometry={hills} material={groundGrass()} receiveShadow />
      <mesh geometry={horizon} material={groundGrass()} receiveShadow />
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
