import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildSite } from "@/components/viewer/CommunityScene";
import type { Community } from "@/lib/models/community";
import { brick, metricBox, panel, shopGlass, windowGlass } from "../render/architecture";
import { Decal } from "../render/decal";
import { chrome, concreteSurface, groundAsphalt, groundConcrete, groundGrass, mat } from "../render/materials";
import { waterNormalMap } from "../render/textures";
import { runtime } from "../core/runtime";
import { Human, TOWNSFOLK } from "../models/human";
import { angleDelta } from "../sim/math";
import { B } from "./props";
import { BENCHES, CITY_BUILDINGS, CITY_HALL, CITY_PAVING, CITY_SIGN, CITY_STREETS, FOUNTAIN, OWAWA_ROADS, PORTICO, SHAWARMA, SQUARE, SQUARE_PEOPLE, type CityBuilding } from "./owawa";
import { CITY_Y, groundAt } from "./terrain";

/**
 * Downtown Owawa on its plateau: Home Studio's street builder for the grid
 * (sidewalks clipped at every crossing), paved blocks, glass towers and
 * precast mid-rises, City Hall with its clock tower, the square and its
 * fountain, the shawarma place, crosswalks and traffic signals.
 */
export function OwawaScene() {
  return (
    <group name="Owawa">
      <group position={[0, CITY_Y + 0.03, 0]}>
        <Streets />
        <Markings />
        <Signals />
      </group>
      <group position={[0, CITY_Y, 0]}>
        <Paving />
        {CITY_BUILDINGS.map((b, i) => (
          <Building key={i} b={b} />
        ))}
        <CityHall />
        <Shawarma />
        <Square />
      </group>
      <People />
      <CitySign />
    </group>
  );
}

const XS = [CITY_STREETS.lyon.x, CITY_STREETS.elgin.x, CITY_STREETS.kent.x];
const ZS = [CITY_STREETS.wellington.z, CITY_STREETS.rideau.z, CITY_STREETS.queen.z];
const { x0: X0, x1: X1, z0: Z0, z1: Z1 } = CITY_PAVING;

function Streets() {
  const site = useMemo(() => {
    const city: Community = { id: "owawa", name: "Owawa", lots: [], roads: OWAWA_ROADS, trees: [] } as unknown as Community;
    return buildSite(city, [], { ground: false });
  }, []);
  useEffect(() => () => Object.values(site).forEach((g) => g.dispose()), [site]);
  return (
    <group name="OwawaStreets">
      <mesh geometry={site.asphalt} material={groundAsphalt()} receiveShadow />
      <mesh geometry={site.concrete} material={groundConcrete()} receiveShadow />
      <mesh geometry={site.curb} material={concreteSurface()} receiveShadow />
    </group>
  );
}

/** Dashed centre lines between intersections and zebra crosswalks on every arm. */
function Markings() {
  const geo = useMemo(() => {
    const yellow: THREE.BufferGeometry[] = [];
    const white: THREE.BufferGeometry[] = [];
    const inJunction = (x: number, z: number) => XS.some((sx) => Math.abs(x - sx) < 10) && ZS.some((sz) => Math.abs(z - sz) < 10);
    const strip = (list: THREE.BufferGeometry[], x: number, z: number, len: number, w: number, alongX: boolean) => {
      const g = new THREE.PlaneGeometry(alongX ? len : w, alongX ? w : len);
      g.rotateX(-Math.PI / 2);
      g.translate(x, 0.04, z);
      list.push(g);
    };
    for (const r of OWAWA_ROADS) {
      const alongX = r.from[1] === r.to[1];
      const a = alongX ? r.from[0] : r.from[1];
      const b = alongX ? r.to[0] : r.to[1];
      for (let s = Math.min(a, b) + 4; s < Math.max(a, b) - 4; s += 9) {
        const x = alongX ? s : r.from[0];
        const z = alongX ? r.from[1] : s;
        if (!inJunction(x, z)) strip(yellow, x, z, 3, 0.14, alongX);
      }
    }
    // Zebra crosswalks: stripes parallel to the traffic, across the full carriageway.
    for (const sx of XS)
      for (const sz of ZS)
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const cx = sx + dx * 7.6;
          const cz = sz + dz * 7.6;
          for (let k = -3.75; k <= 3.75; k += 1.25) {
            if (dx !== 0) strip(white, cx, cz + k, 3, 0.55, true);
            else strip(white, cx + k, cz, 3, 0.55, false);
          }
          // Stop bar
          if (dx !== 0) strip(white, sx + dx * 9.6, sz + (dx > 0 ? -2.25 : 2.25), 0.4, 4.5, true);
          else strip(white, sx + (dz > 0 ? 2.25 : -2.25), sz + dz * 9.6, 0.4, 4.5, false);
        }
    return { yellow: mergeGeometries(yellow, false), white: mergeGeometries(white, false) };
  }, []);
  return (
    <>
      {geo.yellow && <mesh geometry={geo.yellow} material={mat("#e9b62a", { rough: 0.6 })} receiveShadow />}
      {geo.white && <mesh geometry={geo.white} material={mat("#f2f2ee", { rough: 0.6 })} receiveShadow />}
    </>
  );
}

/** Traffic signals on two corners of every intersection. */
function Signals() {
  const geo = useMemo(() => {
    const poles: THREE.BufferGeometry[] = [];
    const heads: THREE.BufferGeometry[] = [];
    const lamps: { red: THREE.BufferGeometry[]; green: THREE.BufferGeometry[] } = { red: [], green: [] };
    const corner = 4.5 + 2 * 0.5;
    for (const sx of XS)
      for (const sz of ZS)
        for (const [cx, cz, ang] of [
          [1, 1, 0],
          [-1, -1, Math.PI],
        ]) {
          const x = sx + cx * corner;
          const z = sz + cz * corner;
          const pole = new THREE.CylinderGeometry(0.09, 0.12, 6, 8);
          pole.translate(0, 3, 0);
          // Mast arm reaching over the street (−z for this corner's frame), with a signal head.
          const arm = new THREE.CylinderGeometry(0.06, 0.06, 5, 6);
          arm.rotateX(Math.PI / 2);
          arm.translate(0, 5.6, -2.5);
          const head = new THREE.BoxGeometry(0.35, 1.0, 0.3);
          head.translate(0, 5.0, -4.2);
          const red = new THREE.CircleGeometry(0.11, 12);
          red.translate(0, 5.3, -4.04);
          const green = new THREE.CircleGeometry(0.11, 12);
          green.translate(0, 4.72, -4.04);
          for (const g of [pole, arm, head, red, green]) {
            g.rotateY(ang);
            g.translate(x, 0, z);
          }
          poles.push(pole, arm);
          heads.push(head);
          // Lit: green for traffic along x, red along z (they're decorative).
          (ang === 0 ? lamps.green : lamps.red).push(ang === 0 ? green : red);
        }
    return { poles: mergeGeometries(poles, false), heads: mergeGeometries(heads, false), red: mergeGeometries(lamps.red, false), green: mergeGeometries(lamps.green, false) };
  }, []);
  return (
    <>
      {geo.poles && <mesh geometry={geo.poles} material={mat("#3b4046", { metal: 0.6, rough: 0.4 })} castShadow />}
      {geo.heads && <mesh geometry={geo.heads} material={mat("#1c1d20", { rough: 0.5 })} castShadow />}
      {geo.red && <mesh geometry={geo.red} material={mat("#ff3b2f", { emissive: "#ff2a1a", emissiveIntensity: 2 })} />}
      {geo.green && <mesh geometry={geo.green} material={mat("#3bff7a", { emissive: "#1aff6a", emissiveIntensity: 2 })} />}
    </>
  );
}

/** Paved blocks (plazas between the sidewalks and the buildings). */
function Paving() {
  return (
    <mesh position={[(X0 + X1) / 2, 0.02, (Z0 + Z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={groundConcrete()} receiveShadow>
      <planeGeometry args={[X1 - X0, Z1 - Z0]} />
    </mesh>
  );
}

// ── Building materials ──────────────────────────────────────────────────

const GLASS_TONES = ["#5d7f8f", "#7a6a55", "#9aa3aa", "#34465c"];
const STONE_TONES = ["#d9d3c7", "#c7bba8", "#b9b4ac", "#a69a8c"];

function hash(i: number) {
  const s = Math.sin(i * 91.7 + 13.1) * 43758.5453;
  return s - Math.floor(s);
}

const facadeCache = new Map<string, THREE.Material>();

/**
 * A facade texture covering 8 bays (1.8 m) by 8 floors (3.6 m), so a
 * metricBox with tile = 14.4 and repeat.y = 0.5 lines up at real scale.
 * Towers: curtain wall (glass with mullions and spandrels); mid-rises:
 * precast panels with punched windows. Some offices have their lights on.
 */
export function facade(kind: "tower" | "midrise", tone: number) {
  const key = `${kind}|${tone}`;
  let m = facadeCache.get(key);
  if (m) return m;
  const S = 512;
  const bay = S / 8;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  const e = document.createElement("canvas");
  e.width = e.height = S;
  const ex = e.getContext("2d")!;
  ex.fillStyle = "#000";
  ex.fillRect(0, 0, S, S);
  if (kind === "tower") {
    const base = new THREE.Color(GLASS_TONES[tone]);
    for (let f = 0; f < 8; f++)
      for (let b = 0; b < 8; b++) {
        const k = hash(f * 8 + b + tone * 100);
        const col = base.clone().offsetHSL(0, 0, (k - 0.5) * 0.08);
        const g = ctx.createLinearGradient(0, f * bay, 0, (f + 1) * bay);
        g.addColorStop(0, `#${col.clone().offsetHSL(0, 0, 0.06).getHexString()}`);
        g.addColorStop(1, `#${col.getHexString()}`);
        ctx.fillStyle = g;
        ctx.fillRect(b * bay, f * bay, bay, bay);
        if (k > 0.72) {
          ex.fillStyle = k > 0.9 ? "#fff1cf" : "#a89c86";
          ex.fillRect(b * bay + 3, f * bay + 10, bay - 6, bay - 18);
        }
      }
    // Spandrels (opaque bands at each floor slab) and mullions.
    ctx.fillStyle = `#${base.clone().offsetHSL(0, -0.05, -0.12).getHexString()}`;
    for (let f = 0; f < 8; f++) ctx.fillRect(0, f * bay + bay - 7, S, 7);
    ctx.fillStyle = "#c8ccd0";
    for (let b = 0; b <= 8; b++) ctx.fillRect(b * bay - 1.5, 0, 3, S);
    for (let f = 0; f <= 8; f++) ctx.fillRect(0, f * bay - 1, S, 2);
  } else {
    ctx.fillStyle = STONE_TONES[tone];
    ctx.fillRect(0, 0, S, S);
    // Panel joints
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    for (let f = 0; f <= 8; f++) ctx.fillRect(0, f * bay - 1, S, 2);
    for (let b = 0; b <= 8; b += 2) ctx.fillRect(b * bay - 1, 0, 2, S);
    for (let f = 0; f < 8; f++)
      for (let b = 0; b < 8; b++) {
        const k = hash(f * 8 + b + tone * 50 + 7);
        const x = b * bay + bay * 0.16;
        const y = f * bay + bay * 0.22;
        const w = bay * 0.68;
        const h = bay * 0.56;
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(x - 2, y - 2, w + 4, h + 6);
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, "#5f7686");
        g.addColorStop(1, "#2c3a44");
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#e8e4dc";
        ctx.fillRect(x + w / 2 - 1, y, 2, h);
        if (k > 0.7) {
          ex.fillStyle = k > 0.88 ? "#ffe9c4" : "#9a8f7a";
          ex.fillRect(x + 2, y + 2, w - 4, h - 4);
        }
      }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 0.5);
  map.anisotropy = 8;
  const emissiveMap = new THREE.CanvasTexture(e);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.repeat.set(1, 0.5);
  m =
    kind === "tower"
      ? new THREE.MeshPhysicalMaterial({ map, emissiveMap, emissive: "#ffffff", emissiveIntensity: 0.35, roughness: 0.12, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.7 })
      : new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: "#ffffff", emissiveIntensity: 0.3, roughness: 0.75, envMapIntensity: 1.1 });
  facadeCache.set(key, m);
  return m;
}

/** One downtown building: a lobby or shopfront base, the facade, a crown and rooftop plant. */
export function Building({ b }: { b: CityBuilding }) {
  const [x, z] = b.at;
  const [w, d, h] = b.size;
  const geo = useMemo(
    () => ({
      body: metricBox(w, h, d, 14.4),
      base: metricBox(w + 0.3, b.kind === "tower" ? 7 : 4.2, d + 0.3, 4),
      crown: metricBox(w - 3, 4.5, d - 3, 2),
    }),
    [w, h, d, b.kind],
  );
  const tallest = b.kind === "tower" && h >= 140;
  const units = useMemo(() => [0, 1, 2].map((i) => ({ x: (hash(i + x) - 0.5) * (w - 8), z: (hash(i + z) - 0.5) * (d - 8), s: 2 + hash(i * 3 + x) * 2.5 })), [w, d, x, z]);
  return (
    <group position={[x, 0, z]}>
      {b.kind === "lowrise" ? (
        <mesh geometry={geo.body} position={[0, h / 2, 0]} material={brick(["#8a4f3c", "#6e4a3c", "#9a6a52", "#7a5a48"][b.tone])} castShadow receiveShadow />
      ) : (
        <mesh geometry={geo.body} position={[0, h / 2, 0]} material={facade(b.kind, b.tone)} castShadow receiveShadow />
      )}
      {/* Street level: a glazed lobby (towers) or shopfronts (others) */}
      <mesh geometry={geo.base} position={[0, (b.kind === "tower" ? 7 : 4.2) / 2, 0]} material={shopGlass()} receiveShadow />
      <mesh position={[0, (b.kind === "tower" ? 7 : 4.2) + 0.3, 0]} material={mat(b.kind === "tower" ? "#2b2f35" : STONE_TONES[(b.tone + 1) % 4], { rough: 0.6, metal: b.kind === "tower" ? 0.5 : 0 })} castShadow>
        <boxGeometry args={[w + 0.6, 0.6, d + 0.6]} />
      </mesh>
      {/* Roof: parapet, mechanical penthouse and units */}
      <mesh position={[0, h + 0.4, 0]} material={mat(b.kind === "tower" ? "#9aa1a8" : "#bdb6aa", { metal: b.kind === "tower" ? 0.6 : 0, rough: 0.5 })} castShadow>
        <boxGeometry args={[w + 0.2, 0.8, d + 0.2]} />
      </mesh>
      {b.kind !== "lowrise" && <mesh geometry={geo.crown} position={[0, h + 2.25, 0]} material={mat("#6c727a", { metal: 0.4, rough: 0.6 })} castShadow />}
      {units.map((u, i) => (
        <mesh key={i} position={[u.x, h + 0.8 + u.s / 2, u.z]} material={mat("#a7adb3", { metal: 0.5, rough: 0.5 })} castShadow>
          <boxGeometry args={[u.s, u.s, u.s * 1.3]} />
        </mesh>
      ))}
      {tallest && (
        <mesh position={[0, h + 4.5 + 9, 0]} material={chrome()} castShadow>
          <cylinderGeometry args={[0.12, 0.35, 18, 8]} />
        </mesh>
      )}
      {b.kind === "lowrise" &&
        [1, -1].map((s) => (
          <mesh key={s} position={[0, 3.9, s * (d / 2 + 0.9)]} rotation={[s * 0.3, 0, 0]} material={mat(["#2f5d50", "#7a2e2e", "#2e3f6e", "#6b5a2e"][b.tone], { rough: 0.85 })} castShadow>
            <boxGeometry args={[w - 4, 0.06, 1.8]} />
          </mesh>
        ))}
      {b.name &&
        (
          [
            [0, d / 2 + 0.05, 0],
            [0, -d / 2 - 0.05, Math.PI],
            [w / 2 + 0.05, 0, Math.PI / 2],
            [-w / 2 - 0.05, 0, -Math.PI / 2],
          ] as [number, number, number][]
        ).map(([px, pz, ry], i) => <Decal key={i} text={b.name!} color="#f4f1e8" height={2.2} position={[px, h - 4, pz]} rotation={[0, ry, 0]} />)}
    </group>
  );
}

// ── City Hall ───────────────────────────────────────────────────────────

/** A limestone civic building: columned portico on the square, a clock tower with a copper roof, flags. */
function CityHall() {
  const [x, z] = CITY_HALL.at;
  const [w, d, h] = CITY_HALL.size;
  const [tx, tz] = CITY_HALL.tower.at;
  const [tw, td, th] = CITY_HALL.tower.size;
  const front = z + d / 2;
  const stone = panel("#ddd5c4");
  const geo = useMemo(() => {
    // The pediment: a low triangle over the columns, 3.6 m deep.
    const tri = new THREE.Shape();
    tri.moveTo(-8.5, 0);
    tri.lineTo(8.5, 0);
    tri.lineTo(0, 2.4);
    tri.closePath();
    const pediment = new THREE.ExtrudeGeometry(tri, { depth: 3.6, bevelEnabled: false });
    return { body: metricBox(w, h, d, 2), tower: metricBox(tw, th, td, 2), pediment };
  }, [w, h, d, tw, th, td]);
  const hands = useRef<THREE.Group[]>([]);
  useFrame(() => {
    // The clock keeps (game) time.
    const t = runtime.time;
    for (const g of hands.current) {
      if (!g) continue;
      (g.children[0] as THREE.Object3D).rotation.z = -(t / 3600) * Math.PI * 2;
      (g.children[1] as THREE.Object3D).rotation.z = -(t / 60) * Math.PI * 2;
    }
  });
  return (
    <group name="CityHall">
      <mesh geometry={geo.body} position={[x, h / 2, z]} material={stone} castShadow receiveShadow />
      <mesh position={[x, h + 0.5, z]} material={stone} castShadow>
        <boxGeometry args={[w + 0.8, 1, d + 0.8]} />
      </mesh>
      {/* Windows on the facade and the sides */}
      {[3.2, 7.6, 12].map((y) => (
        <group key={y}>
          {Array.from({ length: 9 }, (_, i) => {
            const px = x - w / 2 + 3 + i * ((w - 6) / 8);
            if (Math.abs(px - x) < 8) return null;
            return (
              <mesh key={i} position={[px, y, front + 0.03]} material={windowGlass()}>
                <boxGeometry args={[1.6, 2.4, 0.06]} />
              </mesh>
            );
          })}
        </group>
      ))}
      {/* Portico: platform and steps, six columns, entablature and pediment */}
      {PORTICO.steps.map((st, k) => (
        <mesh key={k} position={[(st.x0 + st.x1) / 2, st.top / 2, (st.z0 + st.z1) / 2]} material={stone} receiveShadow castShadow>
          <boxGeometry args={[st.x1 - st.x0, st.top, st.z1 - st.z0]} />
        </mesh>
      ))}
      {PORTICO.columns.map(([cx, cz], i) => (
        <mesh key={i} position={[cx, 0.9 + PORTICO.columnHeight / 2, cz]} material={stone} castShadow>
          <cylinderGeometry args={[0.42, 0.5, PORTICO.columnHeight, 16]} />
        </mesh>
      ))}
      <mesh position={[x, 10.9, front + 1.6]} material={stone} castShadow>
        <boxGeometry args={[17, 1.4, 3.6]} />
      </mesh>
      <mesh geometry={geo.pediment} position={[x, 11.6, front - 0.2]} material={stone} castShadow />
      <Decal text="OWAWA CITY HALL" color="#4a4136" height={0.8} position={[x, 10.9, front + 3.42]} rotation={[0, 0, 0]} />
      {/* Doors */}
      <mesh position={[x, 2.7, front + 0.03]} material={mat("#3b2a1e", { rough: 0.5 })}>
        <boxGeometry args={[3.2, 3.6, 0.08]} />
      </mesh>
      {/* Clock tower */}
      <mesh geometry={geo.tower} position={[tx, th / 2, tz]} material={stone} castShadow receiveShadow />
      <mesh position={[tx, th + 0.5, tz]} material={stone} castShadow>
        <boxGeometry args={[tw + 1, 1, td + 1]} />
      </mesh>
      <mesh position={[tx, th + 5.5, tz]} rotation={[0, Math.PI / 4, 0]} material={mat("#5f9c87", { rough: 0.6, metal: 0.3 })} castShadow>
        <coneGeometry args={[tw * 0.74, 9, 4]} />
      </mesh>
      {(
        [
          [0, td / 2 + 0.06, 0],
          [0, -td / 2 - 0.06, Math.PI],
          [tw / 2 + 0.06, 0, Math.PI / 2],
          [-tw / 2 - 0.06, 0, -Math.PI / 2],
        ] as [number, number, number][]
      ).map(([px, pz, ry], i) => (
        <group key={i} position={[tx + px, th - 5, tz + pz]} rotation={[0, ry, 0]}>
          <mesh material={mat("#f4f1e6", { rough: 0.4 })}>
            <circleGeometry args={[2.6, 40]} />
          </mesh>
          <mesh position={[0, 0, -0.01]} material={mat("#3a3631")}>
            <circleGeometry args={[2.85, 40]} />
          </mesh>
          <group
            ref={(el) => {
              if (el) hands.current[i] = el;
            }}
            position={[0, 0, 0.03]}
          >
            <group>
              <mesh position={[0, 0.7, 0]} material={mat("#1c1c1c")}>
                <boxGeometry args={[0.18, 1.4, 0.03]} />
              </mesh>
            </group>
            <group>
              <mesh position={[0, 1.05, 0.01]} material={mat("#1c1c1c")}>
                <boxGeometry args={[0.1, 2.1, 0.03]} />
              </mesh>
            </group>
          </group>
        </group>
      ))}
      {/* Flags in the front plaza */}
      {[-9, 0, 9].map((dx, i) => (
        <group key={dx} position={[x + dx, 0, front + 9]}>
          <mesh position={[0, 5, 0]} material={chrome()} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 10, 8]} />
          </mesh>
          <mesh position={[0.9, 9, 0]} material={mat(["#c8102e", "#1d4f91", "#2e7d32"][i], { rough: 0.8 })} castShadow>
            <boxGeometry args={[1.8, 1.1, 0.02]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── Owawa Shawarma ──────────────────────────────────────────────────────

function Shawarma() {
  const [x, z] = SHAWARMA.at;
  const [w, d, h] = SHAWARMA.size;
  const front = z + d / 2; // faces Queen Street, to the south
  const body = useMemo(() => metricBox(w, h, d, 2), [w, h, d]);
  const storefront = useMemo(() => metricBox(w - 4, 2.6, 0.06, 4), [w]);
  return (
    <group name="OwawaShawarma">
      <mesh geometry={body} position={[x, h / 2, z]} material={brick("#c9a27a")} castShadow receiveShadow />
      <mesh geometry={storefront} position={[x, 1.55, front + 0.04]} material={shopGlass()} />
      <B size={[w + 0.3, 1.1, 0.3]} position={[x, h - 0.5, front + 0.12]} color="#7a1f1f" />
      <Decal text="OWAWA SHAWARMA" color="#f6e7c8" position={[x, h - 0.5, front + 0.28]} rotation={[0, 0, 0]} height={0.5} />
      <mesh position={[x, 3.05, front + 0.9]} rotation={[-0.3, 0, 0]} material={mat("#d8a13a", { rough: 0.85 })} castShadow>
        <boxGeometry args={[w - 3, 0.06, 1.8]} />
      </mesh>
      {/* The vertical rotisserie in the window */}
      <group position={[x + 3, 0.9, front - 0.6]}>
        <mesh material={chrome()} position={[0, 0, 0]}>
          <boxGeometry args={[0.6, 0.1, 0.6]} />
        </mesh>
        <mesh material={mat("#9a5a2a", { rough: 0.7 })} position={[0, 0.65, 0]}>
          <cylinderGeometry args={[0.18, 0.24, 1.1, 14]} />
        </mesh>
        <mesh material={mat("#ff8a3a", { emissive: "#ff5a1a", emissiveIntensity: 1.2 })} position={[0, 0.65, -0.32]}>
          <boxGeometry args={[0.5, 1.1, 0.05]} />
        </mesh>
      </group>
      {[-1, 1].map((s) => (
        <group key={s} position={[x + s * 4.5, 0, front + 3.4]}>
          <mesh position={[0, 0.74, 0]} material={mat("#e9e4da", { rough: 0.5 })} castShadow>
            <cylinderGeometry args={[0.45, 0.45, 0.05, 16]} />
          </mesh>
          <mesh position={[0, 0.37, 0]} material={mat("#2a2c30", { metal: 0.6 })}>
            <cylinderGeometry args={[0.04, 0.04, 0.74, 6]} />
          </mesh>
          <mesh position={[0, 1.6, 0]} material={mat("#7a1f1f", { rough: 0.8 })} castShadow>
            <coneGeometry args={[1.3, 0.5, 8]} />
          </mesh>
          <mesh position={[0, 1.0, 0]} material={chrome()}>
            <cylinderGeometry args={[0.025, 0.025, 1.2, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── Owawa Square ────────────────────────────────────────────────────────

function Square() {
  const [fx, fz] = FOUNTAIN.at;
  const w = SQUARE.x1 - SQUARE.x0;
  const d = SQUARE.z1 - SQUARE.z0;
  const cx = (SQUARE.x0 + SQUARE.x1) / 2;
  const cz = (SQUARE.z0 + SQUARE.z1) / 2;
  const water = useRef<THREE.Mesh>(null);
  const jet = useRef<THREE.Mesh>(null);
  const waterMat = useMemo(() => {
    const n = waterNormalMap().clone();
    n.wrapS = n.wrapT = THREE.RepeatWrapping;
    n.repeat.set(2, 2);
    n.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({ color: "#2b5560", roughness: 0.05, normalMap: n, normalScale: new THREE.Vector2(0.5, 0.5), clearcoat: 1, transparent: true, opacity: 0.88 });
  }, []);
  const jetMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#e8f4f8", transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false }), []);
  useFrame((_, dt) => {
    const n = (water.current?.material as THREE.MeshPhysicalMaterial | undefined)?.normalMap;
    if (n) n.offset.x += dt * 0.05;
    if (jet.current) jet.current.scale.y = 1 + Math.sin(runtime.time * 3) * 0.06;
  });
  return (
    <group name="OwawaSquare">
      <mesh position={[cx, 0.03, cz]} rotation={[-Math.PI / 2, 0, 0]} material={groundGrass()} receiveShadow>
        <planeGeometry args={[w - 2, d - 2]} />
      </mesh>
      {/* Paths: a cross and a ring around the fountain */}
      <mesh position={[cx, 0.05, cz]} rotation={[-Math.PI / 2, 0, 0]} material={groundConcrete()} receiveShadow>
        <planeGeometry args={[w - 2, 3]} />
      </mesh>
      <mesh position={[cx, 0.05, cz]} rotation={[-Math.PI / 2, 0, 0]} material={groundConcrete()} receiveShadow>
        <planeGeometry args={[3, d - 2]} />
      </mesh>
      <mesh position={[fx, 0.055, fz]} rotation={[-Math.PI / 2, 0, 0]} material={groundConcrete()} receiveShadow>
        <ringGeometry args={[FOUNTAIN.radius, FOUNTAIN.radius + 9, 48]} />
      </mesh>
      {/* Fountain: a stone basin, water, a centre column and a jet */}
      <mesh position={[fx, 0.4, fz]} material={concreteSurface()} castShadow receiveShadow>
        <cylinderGeometry args={[FOUNTAIN.radius, FOUNTAIN.radius + 0.2, 0.8, 40, 1, true]} />
      </mesh>
      <mesh position={[fx, 0.82, fz]} rotation={[-Math.PI / 2, 0, 0]} material={concreteSurface()}>
        <ringGeometry args={[FOUNTAIN.radius - 0.35, FOUNTAIN.radius + 0.05, 40]} />
      </mesh>
      <mesh ref={water} position={[fx, 0.62, fz]} rotation={[-Math.PI / 2, 0, 0]} material={waterMat}>
        <circleGeometry args={[FOUNTAIN.radius - 0.3, 40]} />
      </mesh>
      <mesh position={[fx, 1.2, fz]} material={concreteSurface()} castShadow>
        <cylinderGeometry args={[0.35, 0.6, 1.4, 16]} />
      </mesh>
      <mesh position={[fx, 2.4, fz]} material={concreteSurface()} castShadow>
        <cylinderGeometry args={[1.2, 0.3, 0.3, 24]} />
      </mesh>
      <mesh ref={jet} position={[fx, 3.4, fz]} material={jetMat}>
        <cylinderGeometry args={[0.05, 0.22, 2, 10, 1, true]} />
      </mesh>
      {BENCHES.map((b, i) => (
        <group key={i} position={[b.at[0], 0, b.at[1]]} rotation={[0, -b.heading, 0]}>
          {/* Seat runs across the heading; the back is behind the sitter (−x). */}
          <mesh position={[0, 0.45, 0]} material={mat("#8a6a48", { rough: 0.8 })} castShadow>
            <boxGeometry args={[0.5, 0.06, 1.8]} />
          </mesh>
          <mesh position={[-0.27, 0.75, 0]} rotation={[0, 0, 0.12]} material={mat("#8a6a48", { rough: 0.8 })} castShadow>
            <boxGeometry args={[0.05, 0.5, 1.8]} />
          </mesh>
          {[-0.75, 0.75].map((s) => (
            <mesh key={s} position={[0, 0.22, s]} material={mat("#2a2c30", { metal: 0.6 })}>
              <boxGeometry args={[0.5, 0.44, 0.06]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ── People and the city sign ────────────────────────────────────────────

function Person({ p }: { p: (typeof SQUARE_PEOPLE)[number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || p.pose === "sit") return;
    const b = runtime.body;
    const dx = b.x - p.at[0];
    const dz = b.z - p.at[1];
    const want = Math.hypot(dx, dz) < 6 ? Math.atan2(dz, dx) : p.facing;
    const cur = -g.rotation.y;
    g.rotation.y = -(cur + angleDelta(cur, want) * Math.min(1, dt * 3));
  });
  return (
    <group position={[p.at[0], CITY_Y, p.at[1]]}>
      <group ref={ref} rotation={[0, -p.facing, 0]}>
        <Human outfit={TOWNSFOLK[p.outfit % TOWNSFOLK.length]} pose={p.pose} />
      </group>
    </group>
  );
}

function People() {
  return (
    <group name="OwawaPeople">
      {SQUARE_PEOPLE.map((p, i) => (
        <Person key={i} p={p} />
      ))}
    </group>
  );
}

/** "Welcome to Owawa" where Owawa Road reaches the plateau, facing traffic coming up from the south. */
function CitySign() {
  const [x, z] = CITY_SIGN.at;
  const y = groundAt(x, z);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.3, 0]} material={concreteSurface()} castShadow>
        <boxGeometry args={[6.4, 0.6, 0.8]} />
      </mesh>
      <mesh position={[0, 1.4, 0]} material={mat("#1d3557", { rough: 0.5 })} castShadow>
        <boxGeometry args={[6, 1.6, 0.35]} />
      </mesh>
      {[1, -1].map((side) => (
        <group key={side} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
          <Decal text="OWAWA" color="#f4f1e8" position={[0, 1.65, 0.18]} rotation={[0, 0, 0]} height={0.7} />
          <Decal text="Downtown" color="#d9a441" position={[0, 1.0, 0.18]} rotation={[0, 0, 0]} height={0.34} />
        </group>
      ))}
    </group>
  );
}
