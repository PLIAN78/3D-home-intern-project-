import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { placeholderFor } from "@/lib/geometry/placeholderHouse";
import { houseOffsetOnLot, lotToWorld } from "@/lib/viewer/placement";
import { runtime } from "../core/runtime";
import { noBackfaceFlip } from "../render/materials";
import { PAVE_SETBACK } from "./paving";
import { useQuality } from "../render/quality";
import { useGame } from "../story/store";
import { CAIVAN_RIDGE, collisionBoxes, LANDMARKS, PAVED } from "./map";
import {CITY_PAVING,OWAWA_ROADS} from "./owawa";
import { MEADOW_PAVING } from "./meadows";
import { BAY_OUTLINE } from "./bay";
import { CREEK_WIDTH, LAUREL_CREEK, PLAZA_POLYGON, PONDS } from "./campus";
import { CAMPUS_WALKWAYS, AIRPORT, NORTH_ROADS, riverZ, riverWidth, STATION_ACCESS, STATION_PATH_WIDTH, ISLAND_WALKS } from "./v6";
import { COUNTRY_ROADS, PLAY_HALF,LAKE } from "./terrain";

/**
 * Real grass near the camera: tens of thousands of instanced blades in a square
 * that travels with you (each blade wraps around, so it stays put in the world).
 * Blades bend in gusts of wind, part around the player, and only grow where a
 * top-down mask painted from the map says there's lawn: never on roads,
 * sidewalks, driveways, buildings or dig sites. The ground texture carries the
 * look beyond the field, which fades out at its edge.
 */

const MASK_SIZE = 2048;

/** Paints the grass mask: white = lawn, black = no grass. */
function paintMask(stages: Record<string, string>) {
  const c = document.createElement("canvas");
  c.width = c.height = MASK_SIZE;
  const ctx = c.getContext("2d")!;
  const k = MASK_SIZE / (PLAY_HALF * 2);
  const X = (x: number) => (x + PLAY_HALF) * k;
  const Z = (z: number) => (z + PLAY_HALF) * k;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineCap = "butt";
  // Streets: the whole right-of-way except the grass boulevard strip.
  for (const r of [...CAIVAN_RIDGE.roads,...NORTH_ROADS,...OWAWA_ROADS]) {
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
      const off = (r.width/2+r.boulevardWidth+r.sidewalkWidth/2) * side;
      ctx.lineWidth = (r.sidewalkWidth + 0.3) * k;
      ctx.beginPath();
      ctx.moveTo(X(r.from[0] + nx * off), Z(r.from[1] + nz * off));
      ctx.lineTo(X(r.to[0] + nx * off), Z(r.to[1] + nz * off));
      ctx.stroke();
    }
  }
  // Buildings and dig sites
  for (const b of collisionBoxes(stages as never)) {
    if (!b.rot) { ctx.fillRect(X(b.x0 - 0.8), Z(b.z0 - 0.8), (b.x1 - b.x0 + 1.6) * k, (b.z1 - b.z0 + 1.6) * k); continue; }
    ctx.save();
    ctx.translate(X((b.x0 + b.x1) / 2), Z((b.z0 + b.z1) / 2));
    ctx.rotate(b.rot);
    ctx.fillRect(((b.x0 - b.x1) / 2 - 0.8) * k, ((b.z0 - b.z1) / 2 - 0.8) * k, (b.x1 - b.x0 + 1.6) * k, (b.z1 - b.z0 + 1.6) * k);
    ctx.restore();
  }
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
  // Parking lots (North Meadows too), the track and pitch, the mall's loading dock
  for (const p of MEADOW_PAVING) ctx.fillRect(X(p.x0 - 0.5), Z(p.z0 - 0.5), (p.x1 - p.x0 + 1) * k, (p.z1 - p.z0 + 1) * k);
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
  // Country roads where they cross town (Cottage Road, Lake Road, Owawa Road)
  ctx.lineJoin = "round";
  for (const road of COUNTRY_ROADS) {
    ctx.lineWidth = (road.width + 3.4) * k;
    ctx.beginPath();
    road.points.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
    ctx.stroke();
  }
  // V6: the mask covers the whole playable world, including university paths and airport pavement.
  for(const w of CAMPUS_WALKWAYS){ctx.lineWidth=(w.width+1)*k;ctx.beginPath();w.points.forEach(([x,z],i)=>i?ctx.lineTo(X(x),Z(z)):ctx.moveTo(X(x),Z(z)));ctx.stroke();}
  // The campus plaza and ponds.
  for(const poly of [PLAZA_POLYGON,...PONDS]){ctx.beginPath();poly.forEach(([x,z],i)=>i?ctx.lineTo(X(x),Z(z)):ctx.moveTo(X(x),Z(z)));ctx.closePath();ctx.fill();}
  // Heron Gardens Island walkways.
  for(const w of ISLAND_WALKS){ctx.lineWidth=(w.width+1)*k;ctx.beginPath();w.points.forEach(([x,z],i)=>i?ctx.lineTo(X(x),Z(z)):ctx.moveTo(X(x),Z(z)));ctx.stroke();}
  // Station forecourts and footpaths.
  ctx.lineWidth=(STATION_PATH_WIDTH+2)*k;
  for(const a of STATION_ACCESS){
    const f=a.forecourt;ctx.fillRect(X(f.x0-1),Z(f.z0-1),(f.x1-f.x0+2)*k,(f.z1-f.z0+2)*k);
    for(const path of [a.path,...a.extra]){ctx.beginPath();path.forEach(([x,z],i)=>i?ctx.lineTo(X(x),Z(z)):ctx.moveTo(X(x),Z(z)));ctx.stroke();}
  }
  // Laurel Creek (water) through the campus.
  ctx.lineWidth=(CREEK_WIDTH+3)*k;ctx.beginPath();LAUREL_CREEK.forEach(([x,z],i)=>i?ctx.lineTo(X(x),Z(z)):ctx.moveTo(X(x),Z(z)));ctx.stroke();
  ctx.fillRect(X(CITY_PAVING.x0),Z(CITY_PAVING.z0),(CITY_PAVING.x1-CITY_PAVING.x0)*k,(CITY_PAVING.z1-CITY_PAVING.z0)*k);
  ctx.beginPath();ctx.ellipse(X(LAKE.centre[0]),Z(LAKE.centre[1]),LAKE.rx*1.2*k,LAKE.rz*1.2*k,0,0,Math.PI*2);ctx.fill();
  // Heron Bay and its shallow shore.
  ctx.lineWidth=12*k;ctx.lineJoin="round";ctx.beginPath();BAY_OUTLINE.forEach(([x,z],i)=>i?ctx.lineTo(X(x),Z(z)):ctx.moveTo(X(x),Z(z)));ctx.closePath();ctx.fill();ctx.stroke();
  for(let x=-1050;x<1050;x+=6)ctx.fillRect(X(x),Z(riverZ(x)-riverWidth(x)/2-25),7*k,(riverWidth(x)+50)*k);
  // Everything north of the river is paved (Countryside's groundHills), the island apart.
  for(let x=-1050;x<1050;x+=6){
    const edge=riverZ(x)-riverWidth(x)/2+PAVE_SETBACK,top=-PLAY_HALF-10,u=(x+650)/130;
    if(Math.abs(u)>=1){ctx.fillRect(X(x),Z(top),7*k,(edge-top)*k);continue;}
    // Around Heron Gardens Island (its lawns stay).
    const h=55*1.3*Math.sqrt(1-u*u),z0=-655-h,z1=-655+h;
    ctx.fillRect(X(x),Z(top),7*k,(z0-top)*k);
    if(z1<edge)ctx.fillRect(X(x),Z(z1),7*k,(edge-z1)*k);
  }
  ctx.fillRect(X(AIRPORT.x0),Z(AIRPORT.z0),(AIRPORT.x1-AIRPORT.x0)*k,(AIRPORT.z1-AIRPORT.z0)*k);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false; // row 0 of the canvas is the north edge (z = −PLAY_HALF)
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
  uWorldHalf: { value: PLAY_HALF },
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

