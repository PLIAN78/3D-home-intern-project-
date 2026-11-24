import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { placeholderFor } from "@/lib/geometry/placeholderHouse";
import { houseOffsetOnLot, lotToWorld } from "@/lib/viewer/placement";
import { runtime } from "../core/runtime";
import { noBackfaceFlip } from "../render/materials";
import { useQuality } from "../render/quality";
import { useGame } from "../story/store";
import { CAIVAN_RIDGE, collisionBoxes, FRONT, LANDMARKS, PAVED, WORLD_HALF } from "./map";
import { HILL_ROAD, HILL_ROAD_WIDTH } from "./terrain";

/**
 * Real grass near the camera: tens of thousands of instanced blades in a square
 * that travels with you (each blade wraps around, so it stays put in the world).
 * Blades bend in gusts of wind, part around the player, and only grow where a
 * top-down mask painted from the map says there's lawn: never on roads,
 * sidewalks, driveways, buildings or dig sites. The ground texture carries the
 * look beyond the field, which fades out at its edge.
 */

const MASK_SIZE = 1024;

/** Paints the grass mask: white = lawn, black = no grass. */
function paintMask(stages: Record<string, string>) {
  const c = document.createElement("canvas");
  c.width = c.height = MASK_SIZE;
  const ctx = c.getContext("2d")!;
  const k = MASK_SIZE / (WORLD_HALF * 2);
  const X = (x: number) => (x + WORLD_HALF) * k;
  const Z = (z: number) => (z + WORLD_HALF) * k;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineCap = "butt";
  // Streets: the whole right-of-way except the grass boulevard strip.
  for (const r of CAIVAN_RIDGE.roads) {
    ctx.lineWidth = (r.width + 0.6) * k;
    ctx.beginPath();
    ctx.moveTo(X(r.from[0]), Z(r.from[1]));
    ctx.lineTo(X(r.to[0]), Z(r.to[1]));
    ctx.stroke();
    // Sidewalks on both sides
    const dx = r.to[0] - r.from[0];
    const dz = r.to[1] - r.from[1];
    const L = Math.hypot(dx, dz);
    const nx = -dz / L;
    const nz = dx / L;
    for (const side of [-1, 1]) {
      const off = (FRONT - r.sidewalkWidth / 2) * side;
      ctx.lineWidth = (r.sidewalkWidth + 0.3) * k;
      ctx.beginPath();
      ctx.moveTo(X(r.from[0] + nx * off), Z(r.from[1] + nz * off));
      ctx.lineTo(X(r.to[0] + nx * off), Z(r.to[1] + nz * off));
      ctx.stroke();
    }
  }
  // Buildings and dig sites
  for (const b of collisionBoxes(stages as never)) ctx.fillRect(X(b.x0 - 0.8), Z(b.z0 - 0.8), (b.x1 - b.x0 + 1.6) * k, (b.z1 - b.z0 + 1.6) * k);
  for (const lot of CAIVAN_RIDGE.lots) {
    const st = stages[lot.id];
    if (st === "excavation" || st === "foundation" || st === "framing") {
      const p = lotToWorld(lot, [0, 0, 0]);
      ctx.fillRect(X(p[0] - lot.width / 2), Z(p[2] - lot.depth / 2), lot.width * k, lot.depth * k);
    }
    // Driveway from the garage to the curb
    const g = placeholderFor(lot);
    const off = houseOffsetOnLot(lot, g);
    const sx = g.garageDoor.x + off[0];
    const sz = g.garageDoor.y + off[2];
    const endZ = lot.depth / 2 + 3.6;
    const pts = [
      [sx - 2.9, sz],
      [sx + 2.9, sz],
      [sx + 2.9, endZ],
      [sx - 2.9, endZ],
    ].map(([x, z]) => lotToWorld(lot, [x, 0, z]));
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[2])) : ctx.moveTo(X(p[0]), Z(p[2]))));
    ctx.closePath();
    ctx.fill();
  }
  // Sales Centre parking, the factory yard, the pond
  const [sx, sz] = LANDMARKS.sales.position;
  ctx.fillRect(X(sx - 22 - 2), Z(sz - 8 - 19), 60 * k, 18 * k);
  const [fx, fz] = LANDMARKS.factory.position;
  ctx.fillRect(X(fx - 40), Z(fz - 28), 80 * k, 60 * k);
  const [px, pz] = LANDMARKS.park.position;
  ctx.beginPath();
  ctx.arc(X(px + 10), Z(pz + 5), 13 * k, 0, Math.PI * 2);
  ctx.fill();
  // Parking lots, the track and pitch, the mall's loading dock
  for (const p of PAVED) {
    if (p.kind === "parking") ctx.fillRect(X(p.x0 - 0.5), Z(p.z0 - 0.5), (p.x1 - p.x0 + 1) * k, (p.z1 - p.z0 + 1) * k);
    else {
      // The running track around the pitch (matches District's track: 34 m straights, 12.4–17 m radius).
      const cx = (p.x0 + p.x1) / 2;
      const cz = (p.z0 + p.z1) / 2;
      ctx.lineWidth = 5.2 * k;
      ctx.beginPath();
      ctx.arc(X(cx + 17), Z(cz), 14.7 * k, -Math.PI / 2, Math.PI / 2);
      ctx.arc(X(cx - 17), Z(cz), 14.7 * k, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.closePath();
      ctx.stroke();
    }
  }
  const [mx, mz] = LANDMARKS.mall.position;
  ctx.fillRect(X(mx + LANDMARKS.mall.size[0] / 2), Z(mz - 23), 19 * k, 26 * k);
  // Cottage Road where it crosses town
  ctx.lineWidth = (HILL_ROAD_WIDTH + 3.4) * k;
  ctx.lineJoin = "round";
  ctx.beginPath();
  HILL_ROAD.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false; // row 0 of the canvas is the north edge (z = −WORLD_HALF)
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function bladeGeometry(count: number, field: number) {
  // One blade: 4 segments, tapering to a point.
  const segs = 4;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = 0.045 * (1 - t * 0.92);
    pos.push(-w, t, 0, w, t, 0);
    const shade = 0.35 + t * 0.65;
    col.push(shade, shade, shade, shade, shade, shade);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  const offsets = new Float32Array(count * 2);
  const params = new Float32Array(count * 4);
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    offsets[i * 2] = rnd() * field;
    offsets[i * 2 + 1] = rnd() * field;
    params[i * 4] = 0.12 + rnd() * rnd() * 0.3; // height
    params[i * 4 + 1] = rnd() * Math.PI * 2; // facing
    params[i * 4 + 2] = rnd(); // tint
    params[i * 4 + 3] = rnd() * 0.5 + 0.2; // natural lean
  }
  g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 2));
  g.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 4));
  g.instanceCount = count;
  return g;
}

/** Shader inputs, updated every frame (module-level: there is one grass field). */
const UNIFORMS = {
  uTime: { value: 0 },
  uCentre: { value: new THREE.Vector2() },
  uField: { value: 72 },
  uMask: { value: null as THREE.Texture | null },
  uWorldHalf: { value: WORLD_HALF },
  uPlayer: { value: new THREE.Vector3() },
};

export function Grass() {
  const high = useQuality((s) => s.level === "high");
  const stages = useGame((s) => s.stages);
  const field = high ? 72 : 46;
  const count = high ? 52000 : 12000;
  const mask = useMemo(() => paintMask(stages), [stages]);
  const geo = useMemo(() => bladeGeometry(count, field), [count, field]);
  const uniforms = UNIFORMS;
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.6, side: THREE.DoubleSide, color: "#ffffff" });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uTime; uniform vec2 uCentre; uniform float uField; uniform sampler2D uMask; uniform float uWorldHalf; uniform vec3 uPlayer;
          attribute vec2 aOffset; attribute vec4 aParams;
          varying float vTint;`,
        )
        .replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3(0.0, 1.0, 0.0);")
        .replace(
          "#include <begin_vertex>",
          `// Wrap the blade into the square around the camera, so it stays put in the world.
          vec2 origin = uCentre - uField * 0.5;
          vec2 wp = origin + mod(aOffset - origin, uField);
          float edge = max(abs(wp.x - uCentre.x), abs(wp.y - uCentre.y)) / (uField * 0.5);
          float fade = 1.0 - smoothstep(0.7, 1.0, edge);
          vec2 muv = (wp + uWorldHalf) / (uWorldHalf * 2.0);
          float lawn = texture2D(uMask, muv).r;
          float h = aParams.x * fade * smoothstep(0.35, 0.8, lawn);
          float c = cos(aParams.y), s = sin(aParams.y);
          vec3 p = vec3(position.x * c, position.y * h, position.x * s);
          // Wind gusts roll across the field; the tip moves most.
          float gust = sin(uTime * 1.6 + wp.x * 0.15 + wp.y * 0.09) * 0.5 + sin(uTime * 2.7 + wp.x * 0.4) * 0.25;
          float bend = (aParams.w + gust) * position.y * position.y * h;
          p.x += bend * 0.55;
          p.z += bend * 0.25;
          // Part around the player's feet.
          vec2 away = wp - uPlayer.xz;
          float d = length(away);
          float push = (1.0 - smoothstep(0.3, 1.4, d)) * step(uPlayer.y, 1.0);
          p.xz += normalize(away + 1e-4) * push * position.y * h * 0.8;
          p.y *= 1.0 - push * 0.4;
          vec3 transformed = vec3(wp.x, 0.0, wp.y) + p;
          vTint = aParams.z;`,
        );
      shader.fragmentShader = noBackfaceFlip(shader.fragmentShader)
        .replace("#include <common>", "#include <common>\nvarying float vTint;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          // Linear-space colours (≈ sRGB #2b4416 → #86a03e at the tips, some drier blades).
          vec3 base = mix(vec3(0.05, 0.12, 0.016), vec3(0.07, 0.14, 0.02), vTint);
          vec3 tip = mix(vec3(0.19, 0.34, 0.05), vec3(0.34, 0.34, 0.08), vTint * vTint * vTint);
          diffuseColor.rgb = mix(base, tip, vColor.r);`,
        );
    };
    m.customProgramCacheKey = () => "grass-field";
    return m;
  }, [uniforms]);

  useFrame((state, dt) => {
    UNIFORMS.uTime.value += Math.min(dt, 0.1);
    UNIFORMS.uCentre.value.set(state.camera.position.x, state.camera.position.z);
    UNIFORMS.uField.value = field;
    UNIFORMS.uMask.value = mask;
    const b = runtime.body;
    UNIFORMS.uPlayer.value.set(b.x, b.y, b.z);
  });

  return <mesh geometry={geo} material={material} frustumCulled={false} receiveShadow />;
}
