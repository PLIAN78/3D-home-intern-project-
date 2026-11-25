import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { fabric, mat } from "../render/materials";
import { Human, type Outfit } from "./human";

/**
 * Four-legged animals on one articulated rig, the way 3D animal reconstruction
 * models them (a smooth body, a neck and head chain, a tail, and four legs of
 * two segments each, posed by joint angles), but built and animated by hand.
 *
 * Bodies are lathed from a side profile and squashed to an oval cross-section,
 * with a lighter belly painted on by vertex colour; legs taper from a muscled
 * thigh to a thin shank and end in a hoof or a paw. Gaits by species: walk,
 * trot and gallop for hoofed animals, a heavy amble for the bear, a bound for
 * the fox when it runs, and a hop for the rabbit. Faces +x, feet at y = 0.
 */

type Foot = "hoof" | "paw";
type Tail = "tuft" | "brush" | "stub" | "cotton" | "horse" | "goat";
type Ears = "deer" | "fox" | "rabbit" | "bear" | "goat" | "horse";
export interface Species {
  name: string;
  /** Body length (chest to rump), height of the body's centre line, and body half-thickness. */
  length: number;
  back: number;
  girth: number;
  /** Width relative to height of the body's cross-section. */
  width: number;
  /** Side profile of the body: radius (fraction of girth) from rump (0) to chest (1). */
  profile: number[];
  /** Raise of the shoulders over the hips (m), e.g. the bear's hump. */
  hump?: number;
  neck: { length: number; radius: number; angle: number };
  head: { length: number; radius: number; muzzle: number; drop: number };
  ears: Ears;
  earSize: number;
  tail: Tail;
  tailLength: number;
  legs: { thigh: number; shank: number; upper: number; lower: number; foot: Foot; spread: number };
  coat: string;
  belly: string;
  /** Darker colour for legs, ear tips, nose, mane. */
  points: string;
  accent?: string;
  horns?: "goat" | "antlers";
  beard?: boolean;
  mane?: boolean;
  gait: "hoofed" | "amble" | "bound" | "hop";
}

export const SPECIES: Record<"deer" | "stag" | "fox" | "rabbit" | "bear" | "goat" | "horse", Species> = {
  deer: {
    name: "Deer", length: 1.15, back: 0.78, girth: 0.3, width: 0.78, profile: [0.6, 0.86, 0.98, 1, 0.97, 0.92, 0.85],
    neck: { length: 0.5, radius: 0.1, angle: 1.0 }, head: { length: 0.32, radius: 0.085, muzzle: 0.055, drop: 1.15 },
    ears: "deer", earSize: 0.15, tail: "tuft", tailLength: 0.16,
    legs: { thigh: 0.1, shank: 0.032, upper: 0.42, lower: 0.5, foot: "hoof", spread: 0.12 },
    coat: "#9a6a42", belly: "#e8dcc8", points: "#3a2a1e", accent: "#f4efe6", gait: "hoofed",
  },
  stag: {
    name: "Stag", length: 1.25, back: 0.86, girth: 0.33, width: 0.78, profile: [0.6, 0.86, 0.98, 1, 0.99, 0.95, 0.88],
    neck: { length: 0.55, radius: 0.12, angle: 0.95 }, head: { length: 0.34, radius: 0.09, muzzle: 0.06, drop: 1.1 },
    ears: "deer", earSize: 0.15, tail: "tuft", tailLength: 0.16,
    legs: { thigh: 0.11, shank: 0.034, upper: 0.45, lower: 0.53, foot: "hoof", spread: 0.13 },
    coat: "#87593a", belly: "#e2d4bd", points: "#33251a", accent: "#f4efe6", horns: "antlers", gait: "hoofed",
  },
  fox: {
    name: "Fox", length: 0.62, back: 0.3, girth: 0.13, width: 0.8, profile: [0.62, 0.9, 1, 0.98, 0.92, 0.86, 0.8],
    neck: { length: 0.16, radius: 0.065, angle: 0.55 }, head: { length: 0.2, radius: 0.07, muzzle: 0.03, drop: 0.7 },
    ears: "fox", earSize: 0.09, tail: "brush", tailLength: 0.5,
    legs: { thigh: 0.05, shank: 0.018, upper: 0.18, lower: 0.2, foot: "paw", spread: 0.06 },
    coat: "#c8622a", belly: "#f2ece3", points: "#1e1814", accent: "#f7f3ec", gait: "bound",
  },
  rabbit: {
    name: "Rabbit", length: 0.32, back: 0.16, girth: 0.11, width: 0.85, profile: [0.75, 1, 1, 0.94, 0.84, 0.74, 0.66],
    neck: { length: 0.05, radius: 0.06, angle: 0.7 }, head: { length: 0.11, radius: 0.058, muzzle: 0.03, drop: 0.9 },
    ears: "rabbit", earSize: 0.13, tail: "cotton", tailLength: 0.05,
    legs: { thigh: 0.05, shank: 0.016, upper: 0.09, lower: 0.1, foot: "paw", spread: 0.05 },
    coat: "#a08f78", belly: "#ece4d6", points: "#5d4f40", accent: "#ffffff", gait: "hop",
  },
  bear: {
    name: "Bear", length: 1.45, back: 0.74, girth: 0.46, width: 0.82, profile: [0.78, 0.95, 1, 1, 1, 0.97, 0.88], hump: 0.12,
    neck: { length: 0.3, radius: 0.24, angle: 0.25 }, head: { length: 0.36, radius: 0.18, muzzle: 0.085, drop: 0.45 },
    ears: "bear", earSize: 0.07, tail: "stub", tailLength: 0.08,
    legs: { thigh: 0.17, shank: 0.1, upper: 0.36, lower: 0.36, foot: "paw", spread: 0.22 },
    coat: "#4a3222", belly: "#5a3e2a", points: "#24180f", accent: "#9b7a58", gait: "amble",
  },
  goat: {
    name: "Goat", length: 0.75, back: 0.52, girth: 0.24, width: 0.8, profile: [0.66, 0.9, 1, 1, 0.96, 0.9, 0.8],
    neck: { length: 0.26, radius: 0.08, angle: 0.75 }, head: { length: 0.24, radius: 0.075, muzzle: 0.045, drop: 1.25 },
    ears: "goat", earSize: 0.1, tail: "goat", tailLength: 0.12,
    legs: { thigh: 0.075, shank: 0.026, upper: 0.26, lower: 0.3, foot: "hoof", spread: 0.1 },
    coat: "#f1ede5", belly: "#e4ddd0", points: "#bfb39f", accent: "#8a7a62", horns: "goat", beard: true, gait: "hoofed",
  },
  horse: {
    name: "Horse", length: 1.55, back: 1.3, girth: 0.42, width: 0.74, profile: [0.7, 0.92, 1, 1, 0.98, 0.94, 0.88],
    neck: { length: 0.85, radius: 0.16, angle: 0.95 }, head: { length: 0.55, radius: 0.12, muzzle: 0.09, drop: 1.65 },
    ears: "horse", earSize: 0.14, tail: "horse", tailLength: 0.8,
    legs: { thigh: 0.15, shank: 0.05, upper: 0.55, lower: 0.62, foot: "hoof", spread: 0.2 },
    coat: "#8a5634", belly: "#9a6744", points: "#2b1a10", accent: "#efe9df", mane: true, gait: "hoofed",
  },
};

/** The body: a lathe of the side profile, cross-section squashed to `width`, belly painted lighter. */
function torsoGeometry(s: Species) {
  const n = s.profile.length;
  const pts: THREE.Vector2[] = [];
  // Rounded ends: start and finish on the axis.
  pts.push(new THREE.Vector2(0.001, -s.length / 2 - s.girth * 0.55));
  for (let i = 0; i < n; i++) pts.push(new THREE.Vector2(s.girth * s.profile[i], -s.length / 2 + (s.length * i) / (n - 1)));
  pts.push(new THREE.Vector2(0.001, s.length / 2 + s.girth * 0.5));
  const smooth = new THREE.SplineCurve(pts).getPoints(36);
  const g = new THREE.LatheGeometry(smooth, 28);
  // Lathe axis is y: lay it along x (rump at −x), squash the sides.
  g.rotateZ(-Math.PI / 2);
  g.scale(1, 1, s.width);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const cols: number[] = [];
  const coat = new THREE.Color(s.coat), belly = new THREE.Color(s.belly), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    // Shoulders higher than the hips (the bear's hump, a horse's withers).
    const t = (x / s.length + 0.5);
    pos.setY(i, y + (s.hump ?? 0) * Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.5) * 2)))) * (y > 0 ? 1 : 0.3));
    const under = THREE.MathUtils.smoothstep(-y / s.girth, 0.15, 0.75);
    c.copy(coat).lerp(belly, under);
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

/** A tapered limb segment along −y from the joint (radius r0 at the top, r1 at the bottom). */
const limb = (r0: number, r1: number, len: number) => {
  const g = new THREE.CylinderGeometry(r1, r0, len, 12, 1);
  g.translate(0, -len / 2, 0);
  return g;
};

/** Head: skull and muzzle as one lathe along +x (from the poll to the nose). */
function headGeometry(s: Species) {
  const { length: L, radius: R, muzzle: M } = s.head;
  const prof = [
    new THREE.Vector2(0.001, -R * 0.6),
    new THREE.Vector2(R * 0.85, -R * 0.2),
    new THREE.Vector2(R, R * 0.4),
    new THREE.Vector2(R * 0.85, L * 0.45),
    new THREE.Vector2(M * 1.1, L * 0.82),
    new THREE.Vector2(M, L),
    new THREE.Vector2(0.001, L + M * 0.5),
  ];
  const g = new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(20), 18);
  g.rotateZ(-Math.PI / 2);
  g.scale(1, 1, 0.82);
  return g;
}

function earGeometry(kind: Ears, size: number) {
  const sh = new THREE.Shape();
  const w = kind === "rabbit" ? size * 0.28 : kind === "bear" ? size * 0.9 : kind === "fox" ? size * 0.55 : size * 0.45;
  if (kind === "bear") sh.absellipse(0, 0, w, w, 0, Math.PI * 2, false, 0);
  else {
    sh.moveTo(-w, 0);
    sh.quadraticCurveTo(-w * 1.05, size * 0.7, 0, size);
    sh.quadraticCurveTo(w * 1.05, size * 0.7, w, 0);
    sh.lineTo(-w, 0);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: size * 0.05, bevelEnabled: true, bevelThickness: size * 0.02, bevelSize: size * 0.02, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, -size * 0.025);
  return g;
}

function antlerGeometry() {
  // A main beam sweeping up and back with three tines.
  const parts: THREE.BufferGeometry[] = [];
  const seg = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r * 0.7, r, d.length(), 6);
    g.translate(0, d.length() / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
    g.translate(a.x, a.y, a.z);
    parts.push(g);
  };
  const beam = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.06, 0.18, 0.06), new THREE.Vector3(-0.08, 0.36, 0.12), new THREE.Vector3(0.02, 0.52, 0.14)];
  for (let i = 0; i < beam.length - 1; i++) seg(beam[i], beam[i + 1], 0.022 - i * 0.004);
  seg(beam[1], beam[1].clone().add(new THREE.Vector3(0.14, 0.08, 0)), 0.014);
  seg(beam[2], beam[2].clone().add(new THREE.Vector3(0.12, 0.12, -0.02)), 0.012);
  seg(beam[2], beam[2].clone().add(new THREE.Vector3(-0.1, 0.12, 0.04)), 0.011);
  const merged = new THREE.BufferGeometry();
  const pos: number[] = [], idx: number[] = [];
  let off = 0;
  for (const p of parts) {
    const g = p.index ? p : p;
    const a = g.getAttribute("position");
    for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), a.getZ(i));
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    off += a.count;
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  merged.setIndex(idx);
  merged.computeVertexNormals();
  return merged;
}

function hornGeometry() {
  // Curving back in an arc, ridged.
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.02, 0.16, 0), new THREE.Vector3(-0.15, 0.2, 0.02));
  const g = new THREE.TubeGeometry(curve, 10, 0.022, 7, false);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  // Taper toward the tip.
  for (let i = 0; i < pos.count; i++) {
    const seg = Math.floor(i / 8) / 10, k = 1 - seg * 0.75;
    const p = curve.getPoint(seg);
    pos.setXYZ(i, p.x + (pos.getX(i) - p.x) * k, p.y + (pos.getY(i) - p.y) * k, p.z + (pos.getZ(i) - p.z) * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Tail geometry along −y from its root. */
function tailGeometry(kind: Tail, len: number, girth: number) {
  if (kind === "brush") {
    const prof = [0.001, 0.32, 0.5, 0.55, 0.5, 0.36, 0.001].map((r, i, a) => new THREE.Vector2(r * len * 0.32, -(len * i) / (a.length - 1)));
    return new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(16), 10);
  }
  if (kind === "cotton") return new THREE.SphereGeometry(len * 0.8, 10, 8);
  if (kind === "stub") return new THREE.SphereGeometry(len * 0.6, 8, 6);
  if (kind === "horse") {
    const prof = [0.06, 0.09, 0.12, 0.13, 0.12, 0.08, 0.001].map((r, i, a) => new THREE.Vector2(r, -(len * i) / (a.length - 1)));
    return new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(14), 10);
  }
  const g = new THREE.ConeGeometry(girth * 0.25, len, 8);
  g.translate(0, -len / 2, 0);
  g.rotateX(Math.PI);
  g.translate(0, -len, 0);
  return g;
}

/** Gait phase offsets per leg (front-left, front-right, hind-left, hind-right) and how fast the cycle runs. */
function gaitOf(s: Species, v: number) {
  const scale = s.back;
  if (s.gait === "hop") return { offsets: [0, 0, Math.PI, Math.PI], rate: v < 0.05 ? 0 : 6 + v * 4, amp: 0.7, bob: 0.35 };
  if (s.gait === "bound" && v > 2) return { offsets: [0, 0.3, Math.PI, Math.PI + 0.3], rate: 8 + v * 1.5, amp: 0.75, bob: 0.12 };
  if (s.gait === "amble") return { offsets: [0, Math.PI, 0.4, Math.PI + 0.4], rate: v < 0.1 ? 0 : 2.4 + v * 2.2 / scale, amp: Math.min(0.55, 0.25 + v * 0.12), bob: 0.03 };
  const gallop = v > 10.5 * scale / 1.6, trot = v > 3.2 * scale / 1.6 && !gallop;
  return {
    offsets: gallop ? [0, 0.35, Math.PI, Math.PI + 0.35] : trot ? [0, Math.PI, Math.PI, 0] : [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5],
    rate: v < 0.15 ? 0 : gallop ? 9.5 : trot ? 8 : 2 + (v * 1.6 * 1.6) / scale,
    amp: Math.min(0.75, 0.2 + (v * 0.06 * 1.6) / scale),
    bob: gallop ? 0.12 : trot ? 0.06 : 0.015,
  };
}

/**
 * One animal. `speed` (m/s, for the gait), `grazing` lowers the head when
 * standing. Optional saddle and rider for the horse.
 */
export function Quadruped({ species, speed, grazing = () => false, saddle, rider, coat }: { species: Species; speed: () => number; grazing?: () => boolean; saddle?: boolean; rider?: Outfit; coat?: string }) {
  const s = useMemo(() => (coat ? { ...species, coat, belly: species.name === "Horse" ? coat : species.belly } : species), [species, coat]);
  // Legs scaled so the feet just reach the ground from the hips and shoulders.
  const rootY = s.back - s.girth * 0.35;
  const footH = s.legs.foot === "hoof" ? s.legs.shank * 1.6 : s.legs.shank * 1.0;
  const k = (rootY - footH * 0.5) / (s.legs.upper + s.legs.lower);
  const upper = s.legs.upper * k, lower = s.legs.lower * k;
  const geo = useMemo(
    () => ({
      torso: torsoGeometry(s),
      head: headGeometry(s),
      neck: limb(s.neck.radius, s.neck.radius * 0.82, s.neck.length),
      thighF: limb(s.legs.thigh, s.legs.thigh * 0.55, upper),
      thighH: limb(s.legs.thigh * 1.25, s.legs.thigh * 0.6, upper),
      shank: limb(s.legs.shank * 1.25, s.legs.shank, lower),
      foot: s.legs.foot === "hoof" ? new THREE.CylinderGeometry(s.legs.shank * 1.25, s.legs.shank * 1.6, s.legs.shank * 1.6, 10) : new THREE.SphereGeometry(s.legs.shank * 1.7, 10, 8),
      joint: new THREE.SphereGeometry(1, 10, 8),
      ear: earGeometry(s.ears, s.earSize),
      tail: tailGeometry(s.tail, s.tailLength, s.girth),
      eye: new THREE.SphereGeometry(Math.max(0.012, s.head.radius * 0.16), 8, 6),
      nose: new THREE.SphereGeometry(s.head.muzzle * 0.55, 8, 6),
      antler: s.horns === "antlers" ? antlerGeometry() : null,
      horn: s.horns === "goat" ? hornGeometry() : null,
      beard: s.beard ? new THREE.ConeGeometry(s.head.muzzle * 0.6, s.head.length * 0.45, 8) : null,
      mane: s.mane ? new THREE.BoxGeometry(0.07, s.neck.length * 0.95, s.neck.radius * 0.9) : null,
    }),
    [s, upper, lower],
  );
  const m = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: s.name === "Bear" || s.name === "Fox" ? 0.95 : 0.7 }),
      coat: mat(s.coat, { rough: 0.75 }),
      belly: mat(s.belly, { rough: 0.8 }),
      points: mat(s.points, { rough: 0.7 }),
      accent: mat(s.accent ?? s.belly, { rough: 0.85 }),
      hoof: mat("#1f1a16", { rough: 0.45 }),
      eye: mat("#0d0b0a", { rough: 0.1 }),
      nose: mat("#141110", { rough: 0.3 }),
      horn: mat(s.horns === "antlers" ? "#cdb995" : "#7f6f58", { rough: 0.6 }),
      saddle: mat("#5b3418", { rough: 0.45 }),
      blanket: fabric("#1f3a5f"),
    }),
    [s],
  );
  const legs = useRef<(THREE.Group | null)[]>([]);
  const knees = useRef<(THREE.Group | null)[]>([]);
  const body = useRef<THREE.Group>(null);
  const neck = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const ears = useRef<(THREE.Group | null)[]>([]);
  const t = useRef(-1);
  const graze = useRef(0);
  const L = s.length, H = s.back;
  // Leg roots: shoulders forward, hips back, under the body's sides.
  const legRoots: [number, number, number][] = [
    [L * 0.42, rootY, s.legs.spread],
    [L * 0.42, rootY, -s.legs.spread],
    [-L * 0.4, rootY, s.legs.spread],
    [-L * 0.4, rootY, -s.legs.spread],
  ];
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    if (t.current < 0) t.current = Math.random() * 10;
    const v = Math.abs(speed());
    const g = gaitOf(s, v);
    t.current += dt * g.rate;
    const p = t.current, now = state.clock.elapsedTime;
    const moving = v > 0.1;
    for (let i = 0; i < 4; i++) {
      const front = i < 2, ph = p + g.offsets[i];
      const swing = moving ? Math.sin(ph) * g.amp : 0;
      // Hind legs fold at the hock the other way; the rabbit's big hind feet push together.
      const lift = moving ? Math.max(0, Math.cos(ph)) * (0.45 + g.amp) : 0;
      legs.current[i]?.rotation.set(0, 0, swing * (front ? 1 : 0.85) + (front ? 0 : s.gait === "hop" ? 0.9 : 0.06));
      knees.current[i]?.rotation.set(0, 0, front ? -lift : lift * 0.8 - (s.gait === "hop" ? 1.6 : 0.12));
    }
    if (body.current) {
      const bob = moving ? Math.abs(Math.sin(p)) * g.bob * s.back : 0;
      body.current.position.y = bob + Math.sin(now * 1.7) * 0.004 * H;
      body.current.rotation.z = moving && (s.gait === "bound" || s.gait === "hop" || g.bob > 0.1) ? Math.sin(p) * 0.08 : 0;
    }
    graze.current += ((!moving && grazing() ? 1 : 0) - graze.current) * Math.min(1, dt * 1.5);
    if (neck.current) neck.current.rotation.z = s.neck.angle - graze.current * (s.neck.angle + 0.7) + (moving ? Math.sin(p * 2) * 0.04 : Math.sin(now * 0.6) * 0.04);
    if (head.current) head.current.rotation.z = -s.head.drop + graze.current * 0.4 + Math.sin(now * 0.9 + 1) * 0.03;
    for (const [k, e] of ears.current.entries()) if (e) e.rotation.x = (k ? -1 : 1) * (0.25 + Math.max(0, Math.sin(now * 0.7 + k * 2)) ** 8 * 0.4);
    if (tail.current) tail.current.rotation.z = (s.tail === "brush" ? -0.7 : s.tail === "goat" ? -2.5 : s.tail === "horse" ? -0.45 : -0.3) + Math.sin(now * (s.tail === "tuft" ? 4 : 2.2)) * 0.12 - (moving && s.gait !== "amble" ? 0.3 : 0);
  });
  const neckBase: [number, number, number] = [L * 0.5, H + s.girth * 0.15, 0];
  return (
    <group>
      <group ref={body}>
        <mesh geometry={geo.torso} material={m.body} position={[0, H, 0]} castShadow receiveShadow />
        {legRoots.map(([x, y, z], i) => {
          const front = i < 2;
          return (
            <group key={i} ref={(el) => void (legs.current[i] = el)} position={[x, y, z]}>
              <mesh geometry={front ? geo.thighF : geo.thighH} material={s.name === "Fox" ? m.points : m.coat} castShadow />
              <mesh geometry={geo.joint} material={m.coat} position={[0, -upper, 0]} scale={s.legs.shank * 1.4} />
              <group ref={(el) => void (knees.current[i] = el)} position={[0, -upper, 0]}>
                <mesh geometry={geo.shank} material={s.name === "Fox" || s.name === "Bear" ? m.points : s.name === "Horse" && (i === 1 || i === 3) ? m.accent : m.coat} castShadow />
                <mesh geometry={geo.foot} material={s.legs.foot === "hoof" ? m.hoof : m.points} position={[s.legs.foot === "paw" ? s.legs.shank : 0, -lower, 0]} scale={s.legs.foot === "paw" ? [1.4, 0.6, 1] : 1} castShadow />
              </group>
            </group>
          );
        })}
        <group ref={neck} position={neckBase} rotation={[0, 0, s.neck.angle]}>
          {/* The neck leans forward from the chest; its chain ends in the head. */}
          <group rotation={[0, 0, -Math.PI / 2]}>
            <mesh geometry={geo.neck} material={m.coat} rotation={[0, 0, Math.PI]} position={[0, 0, 0]} castShadow />
          </group>
          {geo.mane && <mesh geometry={geo.mane} material={m.points} position={[s.neck.length * 0.5, s.neck.radius * 0.85, 0]} rotation={[0, 0, -Math.PI / 2]} />}
          <group ref={head} position={[s.neck.length, 0, 0]} rotation={[0, 0, -s.head.drop]}>
            <mesh geometry={geo.head} material={m.coat} castShadow />
            {/* Pale muzzle and throat on deer and foxes; dark nose. */}
            {(s.name === "Fox" || s.name === "Deer" || s.name === "Stag" || s.name === "Bear") && <mesh geometry={geo.joint} material={s.name === "Bear" ? m.accent : m.belly} position={[s.head.length * 0.82, -s.head.muzzle * 0.35, 0]} scale={[s.head.length * 0.3, s.head.muzzle * 0.8, s.head.muzzle * 0.9]} />}
            <mesh geometry={geo.nose} material={m.nose} position={[s.head.length + s.head.muzzle * 0.35, s.head.muzzle * 0.1, 0]} />
            {[1, -1].map((side) => (
              <group key={side}>
                <mesh geometry={geo.eye} material={m.eye} position={[s.head.length * 0.42, s.head.radius * 0.45, side * s.head.radius * 0.72]} />
                <group ref={(el) => void (ears.current[side > 0 ? 0 : 1] = el)} position={[s.head.radius * 0.1, s.head.radius * 0.8, side * s.head.radius * 0.55]} rotation={[side * 0.25, 0, s.ears === "rabbit" ? 0.35 : s.ears === "goat" ? -1.2 : 0.15]}>
                  <mesh geometry={geo.ear} material={m.coat} rotation={[0, side * (s.ears === "bear" ? 1.3 : 1.05), 0]} castShadow />
                  {(s.ears === "fox" || s.ears === "rabbit") && <mesh geometry={geo.joint} material={m.points} position={[0, s.earSize * 0.9, 0]} scale={[s.earSize * 0.12, s.earSize * 0.14, s.earSize * 0.06]} />}
                </group>
                {geo.antler && <mesh geometry={geo.antler} material={m.horn} position={[0, s.head.radius * 0.9, side * s.head.radius * 0.35]} scale={[1, 1, side]} castShadow />}
                {geo.horn && <mesh geometry={geo.horn} material={m.horn} position={[s.head.radius * 0.2, s.head.radius * 0.85, side * s.head.radius * 0.35]} rotation={[side * 0.15, 0, 0]} />}
              </group>
            ))}
            {geo.beard && <mesh geometry={geo.beard} material={m.points} position={[s.head.length * 0.55, -s.head.radius * 0.85, 0]} rotation={[0, 0, Math.PI]} />}
          </group>
        </group>
        <group ref={tail} position={[-L / 2 - s.girth * 0.35, H + s.girth * (s.tail === "goat" ? 0.4 : 0.25), 0]}>
          <mesh geometry={geo.tail} material={s.tail === "cotton" || s.tail === "tuft" ? m.accent : s.tail === "horse" ? m.points : m.coat} castShadow />
          {s.tail === "brush" && <mesh geometry={geo.joint} material={m.accent} position={[0, -s.tailLength * 0.92, 0]} scale={s.tailLength * 0.12} />}
        </group>
        {saddle && (
          <group position={[0.05, H + s.girth * 0.8, 0]}>
            <mesh material={m.blanket} position={[0, -0.02, 0]}><boxGeometry args={[0.75, 0.04, 0.9]} /></mesh>
            <mesh material={m.saddle} position={[0, 0.05, 0]} scale={[0.55, 0.3, 0.75]} castShadow><sphereGeometry args={[0.45, 14, 10]} /></mesh>
          </group>
        )}
        {rider && (
          <group position={[0.02, 0.9, 0]}>
            <Human outfit={rider} pose="ride" motion={{ speed }} />
          </group>
        )}
      </group>
    </group>
  );
}
