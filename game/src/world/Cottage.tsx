import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { logs, metricBox, seamRoof } from "../render/architecture";
import { glass, groundAsphalt, groundDirt, lumber, mat } from "../render/materials";
import { COTTAGE, COTTAGE_ROAD, COTTAGE_Y, COUNTRY_ROADS, groundAt, roadSurfaceAt, type CountryRoad } from "./terrain";
import { B } from "./props";

/**
 * Cottage Road and Rosa's cottage: a two-lane country road climbing from the
 * end of Market Street into the south-west hills, and a log cottage with a
 * green metal roof, a deep porch, a stone chimney and an open timber shelter
 * where Peanut the elephant sleeps.
 */

const ALONG = 2;
const SHOULDER = 1.4;

type Gaps = [number, number][];
const inGaps = (s: number, gaps: Gaps) => gaps.some(([a, b]) => s >= a && s <= b);

/** Where another country road crosses this one (s ranges), padded by `pad` metres. */
export function crossings(road: CountryRoad, others: CountryRoad[], pad: number): Gaps {
  const out: Gaps = [];
  for (const o of others) {
    if (o === road) continue;
    let open: number | null = null;
    for (let s = 0; s <= road.length; s += 1) {
      const p = road.pointAt(s);
      const near = o.nearest(p.x, p.z).d < o.width / 2 + pad;
      if (near && open === null) open = s;
      if (!near && open !== null) {
        out.push([open, s]);
        open = null;
      }
    }
    if (open !== null) out.push([open, road.length]);
  }
  return out;
}

/**
 * A band along a road between `inner` and `outer` metres from the centre line
 * (both sides; inner 0 gives the full carriageway), draped on the ground or
 * the bridge deck, leaving out the stretches in `gaps`.
 */
function band(road: CountryRoad, inner: number, outer: number, lift: number, gaps: Gaps = []) {
  const pos: number[] = [];
  const idx: number[] = [];
  const across = inner === 0 ? [-outer, -outer / 2, 0, outer / 2, outer] : [-outer, -inner, inner, outer];
  // Quads to leave out between the two inner columns of a split band.
  const skipCol = inner === 0 ? -1 : 1;
  const n = Math.ceil(road.length / ALONG);
  const keep: boolean[] = [];
  for (let i = 0; i <= n; i++) {
    const s = Math.min(road.length, i * ALONG);
    keep.push(!inGaps(s, gaps));
    const a = road.pointAt(Math.max(0, s - 3));
    const b = road.pointAt(Math.min(road.length, s + 3));
    const c = road.pointAt(s);
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / len;
    const nz = (b.x - a.x) / len;
    for (const k of across) {
      const x = c.x + nx * k;
      const z = c.z + nz * k;
      pos.push(x, roadSurfaceAt(x, z) + lift, z);
    }
  }
  const w = across.length;
  for (let i = 0; i < n; i++) {
    if (!keep[i] || !keep[i + 1]) continue;
    for (let k = 0; k < w - 1; k++) {
      if (k === skipCol) continue;
      const a = i * w + k;
      const b = a + w;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Dashed centre line (and solid white edge lines) along a road, broken at junctions. */
function markings(road: CountryRoad, gaps: Gaps) {
  const parts: THREE.BufferGeometry[] = [];
  const edges: THREE.BufferGeometry[] = [];
  for (let s = 8; s < road.length - 6; s += 1.5) {
    if (inGaps(s, gaps) || inGaps(s + 1.5, gaps)) continue;
    const p = road.pointAt(s);
    const q = road.pointAt(s + 1.5);
    const ang = Math.atan2(q.z - p.z, q.x - p.x);
    const nx = -Math.sin(ang);
    const nz = Math.cos(ang);
    const dash = Math.floor(s / 1.5) % 6 < 2;
    if (dash) {
      const g = new THREE.PlaneGeometry(1.6, 0.13);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-ang);
      g.translate(p.x, roadSurfaceAt(p.x, p.z) + 0.085, p.z);
      parts.push(g);
    }
    for (const side of [-1, 1]) {
      const ex = p.x + nx * side * (road.width / 2 - 0.35);
      const ez = p.z + nz * side * (road.width / 2 - 0.35);
      const g = new THREE.PlaneGeometry(1.6, 0.11);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-ang);
      g.translate(ex, roadSurfaceAt(ex, ez) + 0.085, ez);
      edges.push(g);
    }
  }
  return { centre: parts.length ? mergeGeometries(parts, false) : null, edges: edges.length ? mergeGeometries(edges, false) : null };
}

/**
 * One country road: gravel shoulders outside the asphalt (none on bridge
 * decks or inside junctions), asphalt, and paint. Where it crosses a road
 * listed before it, its asphalt draws underneath, so the junction doesn't
 * flicker between the two.
 */
function CountryRoadMesh({ road, index }: { road: CountryRoad; index: number }) {
  const geo = useMemo(() => {
    const junctions = crossings(road, COUNTRY_ROADS, SHOULDER + 0.5);
    const decks: Gaps = road.decks.map((d) => [d.s0 - 0.5, d.s1 + 0.5]);
    return {
      road: band(road, 0, road.width / 2, 0.06),
      shoulder: band(road, road.width / 2 - 0.2, road.width / 2 + SHOULDER, 0.045, [...junctions, ...decks]),
      lines: markings(road, junctions),
    };
  }, [road]);
  const minor = COUNTRY_ROADS.slice(0, index).some((o) => crossings(road, [o], 0).length > 0);
  const asphalt = useMemo(() => {
    if (!minor) return groundAsphalt();
    const m = groundAsphalt().clone();
    m.polygonOffset = true;
    m.polygonOffsetFactor = 2;
    m.polygonOffsetUnits = 2;
    return m;
  }, [minor]);
  return (
    <group name={road.name}>
      <mesh geometry={geo.shoulder} material={groundDirt()} receiveShadow />
      <mesh geometry={geo.road} material={asphalt} receiveShadow />
      {geo.lines.centre && <mesh geometry={geo.lines.centre} material={mat("#e9b62a", { rough: 0.6 })} />}
      {geo.lines.edges && <mesh geometry={geo.lines.edges} material={mat("#eeeeea", { rough: 0.6 })} />}
    </group>
  );
}

/** Cottage Road, Lake Road, Owawa Road and the two bridge roads. */
export function CountryRoads() {
  return (
    <group name="CountryRoads">
      {COUNTRY_ROADS.map((r, i) => (
        <CountryRoadMesh key={r.name} road={r} index={i} />
      ))}
    </group>
  );
}

// ── The cottage ─────────────────────────────────────────────────────────

const W = 12;
const D = 9;
const WALL = 3.2;
const PITCH = 2.6;

function gable(width: number, depth: number, rise: number, over: number) {
  // Two roof planes, ridge along x.
  const half = depth / 2 + over;
  const slope = Math.hypot(half, rise);
  const plane = new THREE.BoxGeometry(width + over * 2, 0.14, slope);
  const north = plane.clone();
  north.rotateX(-Math.atan2(rise, half));
  north.translate(0, rise / 2, -half / 2);
  const south = plane.clone();
  south.rotateX(Math.atan2(rise, half));
  south.translate(0, rise / 2, half / 2);
  // Metric UVs so the seams keep their spacing.
  for (const g of [north, south]) {
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (width + over * 2), uv.getY(i) * slope);
  }
  return mergeGeometries([north, south], false)!;
}

function gableEnd(depth: number, rise: number) {
  const s = new THREE.Shape();
  s.moveTo(-depth / 2, 0);
  s.lineTo(depth / 2, 0);
  s.lineTo(0, rise);
  s.lineTo(-depth / 2, 0);
  const g = new THREE.ShapeGeometry(s);
  g.rotateY(Math.PI / 2);
  return g;
}

function CottageWindow({ position, rotation }: { position: [number, number, number]; rotation: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      <B size={[1.5, 1.3, 0.08]} position={[0, 0, 0]} color="#f1ede4" />
      <mesh position={[0, 0, 0.05]} material={glass("#1b2428")}>
        <boxGeometry args={[1.25, 1.05, 0.03]} />
      </mesh>
      <B size={[0.06, 1.05, 0.05]} position={[0, 0, 0.08]} color="#f1ede4" cast={false} />
      <B size={[1.25, 0.06, 0.05]} position={[0, 0, 0.08]} color="#f1ede4" cast={false} />
      {[-1, 1].map((s) => (
        <B key={s} size={[0.6, 1.3, 0.05]} position={[s * 1.08, 0, 0.02]} color="#3e5a46" />
      ))}
      <B size={[1.4, 0.22, 0.32]} position={[0, -0.78, 0.15]} color="#6b4f36" />
      {[-0.45, 0, 0.45].map((x) => (
        <mesh key={x} position={[x, -0.6, 0.2]} material={mat(x === 0 ? "#d24d57" : "#e8c547", { rough: 0.8 })}>
          <sphereGeometry args={[0.13, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
}

function Cottage() {
  const [cx, cz] = COTTAGE.position;
  const y = COTTAGE_Y;
  // The roof planes run through the wall tops; the overhang dips below them.
  const drop = (PITCH * 0.7) / (D / 2 + 0.7);
  const geo = useMemo(() => ({ walls: metricBox(W, WALL, D), roof: gable(W, D, PITCH, 0.7), gableEnd: gableEnd(D, PITCH - drop) }), [drop]);
  const posts = [-5.6, -1.9, 1.9, 5.6];
  return (
    <group name="Cottage" position={[cx, y, cz]}>
      {/* Stone foundation, log walls, gable ends in vertical boards */}
      <B size={[W + 0.3, 0.5, D + 0.3]} position={[0, 0.25, 0]} color="#8f8b84" />
      <mesh geometry={geo.walls} position={[0, 0.5 + WALL / 2, 0]} material={logs("#d3a474")} castShadow receiveShadow />
      {[1, -1].map((s) => (
        <mesh key={s} geometry={geo.gableEnd} position={[s * (W / 2), 0.5 + WALL, 0]} rotation={[0, s > 0 ? 0 : Math.PI, 0]} material={lumber()} castShadow />
      ))}
      <mesh geometry={geo.roof} position={[0, 0.5 + WALL - drop + 0.04, 0]} material={seamRoof("#3f5a46")} castShadow receiveShadow />
      {/* Stone chimney on the east gable */}
      <B size={[1.3, 7.6, 1.3]} position={[W / 2 + 0.4, 3.8, 1.2]} color="#8a857c" />
      <B size={[1.5, 0.2, 1.5]} position={[W / 2 + 0.4, 7.7, 1.2]} color="#5e5a54" />
      {/* Front (north) door and windows, back and side windows */}
      <B size={[1.1, 2.15, 0.1]} position={[-1.2, 0.5 + 1.08, -D / 2 - 0.05]} color="#5a3a24" />
      <mesh position={[-0.82, 0.5 + 1.1, -D / 2 - 0.12]} material={mat("#c9a44a", { metal: 0.8, rough: 0.3 })}>
        <sphereGeometry args={[0.05, 8, 6]} />
      </mesh>
      <CottageWindow position={[2.6, 2.2, -D / 2 - 0.06]} rotation={[0, Math.PI, 0]} />
      <CottageWindow position={[-4.2, 2.2, -D / 2 - 0.06]} rotation={[0, Math.PI, 0]} />
      <CottageWindow position={[-2.5, 2.2, D / 2 + 0.06]} rotation={[0, 0, 0]} />
      <CottageWindow position={[2.5, 2.2, D / 2 + 0.06]} rotation={[0, 0, 0]} />
      <CottageWindow position={[-W / 2 - 0.06, 2.2, 0]} rotation={[0, -Math.PI / 2, 0]} />
      {/* Porch: deck, posts, rail, its own shed roof */}
      <B size={[W, 0.45, 2.4]} position={[0, 0.225, -D / 2 - 1.2]} color="#8a6b4a" />
      {posts.map((x) => (
        <B key={x} size={[0.2, 2.8, 0.2]} position={[x, 0.45 + 1.4, -D / 2 - 2.25]} color="#a5855f" />
      ))}
      <B size={[W, 0.1, 0.1]} position={[0, 1.35, -D / 2 - 2.25]} color="#a5855f" />
      <mesh position={[0, 3.35, -D / 2 - 1.3]} rotation={[0.18, 0, 0]} material={seamRoof("#3f5a46")} castShadow>
        <boxGeometry args={[W + 0.4, 0.1, 3]} />
      </mesh>
      {/* Steps down from the porch */}
      <B size={[1.6, 0.22, 0.5]} position={[-1.2, 0.11, -D / 2 - 2.65]} color="#8a6b4a" />
      {/* Rocking chair and a bench */}
      <B size={[1.6, 0.08, 0.45]} position={[3.6, 0.95, -D / 2 - 0.5]} color="#6b4f36" />
      <B size={[1.6, 0.5, 0.08]} position={[3.6, 1.2, -D / 2 - 0.28]} color="#6b4f36" />
      {/* Firewood stacked against the west wall */}
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3, 4, 5].map((k) => (
          <mesh key={`${row}-${k}`} position={[-W / 2 - 0.5, 0.2 + row * 0.24, -2.5 + k * 0.26 + (row % 2) * 0.13]} rotation={[0, 0, Math.PI / 2]} material={lumber()} castShadow>
            <cylinderGeometry args={[0.11, 0.11, 0.7, 7]} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Peanut's open shelter: heavy timber posts, a metal roof, hay. */
function Shelter() {
  const [cx, cz] = COTTAGE.position;
  const x = cx - 18;
  const z = cz + 2;
  const y = COTTAGE_Y;
  const posts: [number, number][] = [
    [-5, -4],
    [5, -4],
    [-5, 4],
    [5, 4],
    [0, 4],
  ];
  return (
    <group name="Shelter" position={[x, y, z]}>
      {posts.map(([px, pz], i) => (
        <B key={i} size={[0.35, 5.2, 0.35]} position={[px, 2.6, pz]} color="#7a5b3e" />
      ))}
      <B size={[10.6, 0.3, 0.3]} position={[0, 5.1, -4]} color="#7a5b3e" />
      <B size={[10.6, 0.3, 0.3]} position={[0, 5.1, 4]} color="#7a5b3e" />
      <mesh position={[0, 5.55, 0]} rotation={[0.08, 0, 0]} material={seamRoof("#6f7a7f")} castShadow receiveShadow>
        <boxGeometry args={[11.4, 0.1, 9.6]} />
      </mesh>
      <B size={[10, 1.4, 0.15]} position={[0, 0.7, 4]} color="#8a6b4a" />
      {[
        [-2.5, 2.6],
        [-1.2, 2.6],
        [-1.85, 2.6],
        [2.8, 2.4],
      ].map(([hx, hz], i) => (
        <B key={i} size={[1.1, 0.5, 0.6]} position={[hx, i === 2 ? 0.75 : 0.25, hz]} color="#d8bd6a" />
      ))}
      <mesh position={[3.2, 0.3, -1]} material={mat("#7d8287", { metal: 0.7, rough: 0.4 })} castShadow>
        <cylinderGeometry args={[0.9, 0.85, 0.6, 18]} />
      </mesh>
      <mesh position={[3.2, 0.58, -1]} rotation={[-Math.PI / 2, 0, 0]} material={mat("#5d7f8c", { rough: 0.1, metal: 0.2 })}>
        <circleGeometry args={[0.82, 18]} />
      </mesh>
    </group>
  );
}

/** Split-rail fence around the yard, a gravel turnaround and a mailbox at the end of the road. */
function Yard() {
  const [cx, cz] = COTTAGE.position;
  const end = COTTAGE_ROAD.points[COTTAGE_ROAD.points.length - 1];
  const rails = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const R = 25;
    for (let a = 0; a < Math.PI * 2; a += 0.12) {
      const x = cx + Math.cos(a) * R;
      const z = cz + Math.sin(a) * R;
      // Leave the gate open toward the road.
      if (Math.hypot(x - end[0], z - end[1]) < 9) continue;
      const yy = groundAt(x, z);
      const post = new THREE.BoxGeometry(0.16, 1.2, 0.16);
      post.translate(x, yy + 0.6, z);
      parts.push(post);
      const rail = new THREE.BoxGeometry(R * 0.12 + 0.2, 0.09, 0.09);
      rail.rotateY(-(a + 0.06 + Math.PI / 2));
      for (const h of [0.55, 1.0]) parts.push(rail.clone().translate(cx + Math.cos(a + 0.06) * R, yy + h, cz + Math.sin(a + 0.06) * R));
    }
    return mergeGeometries(parts, false);
  }, [cx, cz, end]);
  const ey = COTTAGE_Y;
  return (
    <group name="Yard">
      <mesh position={[end[0] - 6, ey + 0.03, end[1] + 5]} rotation={[-Math.PI / 2, 0, 0]} material={groundDirt()} receiveShadow>
        <circleGeometry args={[9, 28]} />
      </mesh>
      {rails && <mesh geometry={rails} material={mat("#8b6b4a", { rough: 0.9 })} castShadow />}
      <group position={[end[0] + 3.5, groundAt(end[0] + 3.5, end[1] - 3), end[1] - 3]}>
        <B size={[0.12, 1.1, 0.12]} position={[0, 0.55, 0]} color="#6b4f36" />
        <B size={[0.5, 0.32, 0.25]} position={[0, 1.2, 0]} color="#2f4a3a" />
      </group>
    </group>
  );
}

export function CottageScene() {
  return (
    <group name="CottageScene">
      <CountryRoads />
      <Cottage />
      <Shelter />
      <Yard />
    </group>
  );
}

