import { type ReactNode, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mat } from "../render/materials";
import type { Outfit } from "./human";
import { Quadruped, SPECIES } from "./quadruped";

/**
 * The rideable and story animals. Horse and goat are on the shared four-legged
 * rig (quadruped.tsx); Peanut the elephant has her own. All face +x with feet
 * at y = 0.
 */

/**
 * Biscuit the horse, on the shared four-legged rig (quadruped.tsx): walk,
 * trot and gallop by speed; `rider` sits in the saddle.
 */
export function HorseModel({ speed, rider, coat = "#8a5634" }: { speed: () => number; rider?: Outfit; coat?: string }) {
  return <Quadruped species={SPECIES.horse} speed={speed} saddle rider={rider} coat={coat} />;
}

/** A goat: wanders and grazes, follows you when led. */
export function GoatModel({ speed, coat = "#f1ede5" }: { speed: () => number; coat?: string }) {
  const v = useRef(0);
  return <Quadruped species={SPECIES.goat} coat={coat} speed={() => (v.current = speed())} grazing={() => v.current < 0.2} />;
}

/** The elephant's barrel: a lathe from rump to chest, higher at the shoulder, skin mottled and darker underneath. */
function elephantBody() {
  const prof: [number, number][] = [[-1.9, 0.001], [-1.78, 0.6], [-1.45, 0.86], [-0.95, 0.96], [-0.3, 1.0], [0.3, 1.02], [0.9, 1.0], [1.4, 0.9], [1.72, 0.66], [1.86, 0.001]];
  const pts = new THREE.SplineCurve(prof.map(([x, r]) => new THREE.Vector2(r, x))).getPoints(40);
  const g = new THREE.LatheGeometry(pts, 32);
  g.rotateZ(-Math.PI / 2);
  g.scale(1, 1, 0.95);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const top = new THREE.Color("#94816d"), under = new THREE.Color("#6f5f4f"), c = new THREE.Color();
  const cols: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // Withers higher than the hips, the spine a ridge down the back.
    const hump = 0.1 * Math.exp(-(((x - 0.75) / 0.8) ** 2)) * Math.max(0, y);
    pos.setY(i, y + hump);
    const mottle = Math.sin(x * 7.1 + z * 3.3) * Math.sin(y * 5.7 - x * 2.1) * 0.06;
    c.copy(top).lerp(under, THREE.MathUtils.smoothstep(-y, -0.2, 0.8)).offsetHSL(0, 0, mottle);
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

/** A tapered segment hanging down −y from its joint. */
const seg = (r0: number, r1: number, len: number, n = 16) => {
  const g = new THREE.CylinderGeometry(r1, r0, len, n, 3);
  g.translate(0, -len / 2, 0);
  return g;
};

const TRUNK = [0.2, 0.18, 0.16, 0.14, 0.12, 0.1, 0.085];
const EG = {
  body: elephantBody(),
  head: new THREE.SphereGeometry(0.62, 24, 18),
  ear: (() => {
    // A rounded fan shape, slightly cupped.
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.55);
    sh.bezierCurveTo(-0.55, 0.62, -0.95, 0.2, -0.85, -0.35);
    sh.bezierCurveTo(-0.75, -0.85, -0.2, -1.05, 0.05, -0.6);
    sh.lineTo(0, 0.55);
    return new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 12 });
  })(),
  /** Thigh/upper arm, knee, and the column of the lower leg down to a broad round foot. */
  upper: seg(0.42, 0.33, 0.85),
  knee: new THREE.SphereGeometry(0.33, 14, 10),
  lower: seg(0.32, 0.35, 0.78),
  foot: new THREE.CylinderGeometry(0.37, 0.41, 0.14, 20),
  trunk: TRUNK.slice(0, -1).map((r, i) => seg(r, TRUNK[i + 1], 0.3, 14)),
  /** Skin folds round the trunk. */
  fold: new THREE.TorusGeometry(1, 0.12, 6, 18),
  tip: new THREE.CylinderGeometry(0.1, 0.085, 0.08, 12),
  tusk: (() => {
    // A gentle upward curve, thick at the lip.
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.35, -0.12, 0), new THREE.Vector3(0.6, 0.12, 0));
    const g = new THREE.TubeGeometry(curve, 12, 0.055, 10, false);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    // Taper toward the tip.
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, pos.getX(i) / 0.6), k = 1 - t * 0.65;
      const cx = curve.getPoint(t);
      pos.setXYZ(i, cx.x + (pos.getX(i) - cx.x) * k, cx.y + (pos.getY(i) - cx.y) * k, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  })(),
  tail: seg(0.05, 0.025, 1.0, 8),
  tuft: new THREE.ConeGeometry(0.06, 0.2, 8),
  eye: new THREE.SphereGeometry(0.045, 8, 6),
  lid: new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  /** A blanket draped over the back: an open arc of cylinder, axis along the body. */
  blanket: (() => {
    const g = new THREE.CylinderGeometry(1.05, 1.05, 1.5, 28, 1, true, -1.05, 2.1);
    g.rotateZ(Math.PI / 2);
    g.rotateX(-Math.PI / 2);
    return g;
  })(),
  blanketEdge: (() => {
    const g = new THREE.CylinderGeometry(1.04, 1.04, 1.58, 28, 1, true, -1.1, 2.2);
    g.rotateZ(Math.PI / 2);
    g.rotateX(-Math.PI / 2);
    return g;
  })(),
};

/**
 * Peanut the elephant: about 2.9 m at the shoulder, with a lathed barrel body
 * (higher at the withers, mottled and darker underneath), pillar legs that
 * bend at the knee, fanned ears that flap, curved tusks and a seven-part
 * trunk ringed with skin folds that sways and curls. Faces +x, feet at y = 0.
 * Walks with a slow lateral gait (both legs on one side move close together,
 * the way elephants do).
 */
export function ElephantModel({ speed }: { speed: () => number }) {
  const legs = useRef<(THREE.Group | null)[]>([]);
  const knees = useRef<(THREE.Group | null)[]>([]);
  const trunk = useRef<(THREE.Group | null)[]>([]);
  const ears = useRef<(THREE.Group | null)[]>([]);
  const tail = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const t = useRef(0);
  const m = useMemo(
    () => ({
      // Elephant skin is a warm grey-brown, never blue: keep it slightly warm so sky light doesn't turn it violet.
      body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }),
      skin: mat("#8b7a67", { rough: 0.94 }),
      leg: mat("#7f6e5d", { rough: 0.95 }),
      dark: mat("#706152", { rough: 0.95 }),
      fold: mat("#66584a", { rough: 1 }),
      ear: new THREE.MeshStandardMaterial({ color: "#826f5e", roughness: 0.95, side: THREE.DoubleSide }),
      pad: mat("#54483d", { rough: 0.95 }),
      nail: mat("#d8d0c2", { rough: 0.6 }),
      tusk: mat("#efe7d6", { rough: 0.35 }),
      eye: mat("#14100c", { rough: 0.2 }),
      tip: mat("#62554a", { rough: 0.9 }),
      blanket: new THREE.MeshStandardMaterial({ color: "#8c2f2a", roughness: 0.88, side: THREE.DoubleSide }),
      trim: new THREE.MeshStandardMaterial({ color: "#c9973c", roughness: 0.7, side: THREE.DoubleSide }),
    }),
    [],
  );
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const v = Math.abs(speed());
    t.current += dt * (v < 0.1 ? 0.5 : 1.2 + v * 0.75);
    const p = t.current, now = state.clock.elapsedTime;
    const moving = v >= 0.1;
    const amp = moving ? Math.min(0.32, 0.1 + v * 0.05) : 0;
    // Lateral sequence: left hind, left fore, right hind, right fore.
    const offsets = [0.6, Math.PI + 0.6, 0, Math.PI];
    for (let i = 0; i < 4; i++) {
      const ph = p + offsets[i], front = i < 2;
      legs.current[i]?.rotation.set(0, 0, Math.sin(ph) * amp);
      // Lift the foot on the forward swing: the knee folds back on the forelegs, forward on the hind.
      const lift = moving ? Math.max(0, Math.cos(ph)) * (0.25 + amp * 1.4) : 0;
      knees.current[i]?.rotation.set(0, 0, front ? -lift : lift * 0.7);
    }
    const idle = moving ? 0 : Math.sin(p * 0.9) * 0.18;
    // The trunk swings with the stride and curls a little at the tip when standing.
    trunk.current.forEach((g, i) => g?.rotation.set(Math.sin(p * 0.6 + i * 0.5) * 0.05, 0, (i ? -0.08 : -0.12) - Math.sin(p * 0.8 + i * 0.7) * 0.06 - idle * (i + 1) * 0.12 - (i > 4 && !moving ? 0.25 : 0)));
    ears.current.forEach((e, i) => {
      if (e) e.rotation.y = (i ? -1 : 1) * (0.35 + Math.sin(now * 1.6 + i) * 0.18);
    });
    if (tail.current) tail.current.rotation.set(Math.sin(now * 1.3) * 0.25, 0, -0.25);
    if (body.current) {
      body.current.rotation.x = Math.sin(p) * amp * 0.06;
      body.current.position.y = Math.abs(Math.sin(p)) * amp * 0.06;
    }
  });
  const legSpots: [number, number][] = [
    [1.0, 0.6],
    [1.0, -0.6],
    [-1.05, 0.6],
    [-1.05, -0.6],
  ];
  // The trunk: each segment hangs from the end of the one before.
  const trunkChain = EG.trunk.reduceRight<ReactNode>(
    (inner, g, i) => (
      <group key={i} ref={(el) => void (trunk.current[i] = el)} position={[0, i ? -0.29 : 0, 0]} rotation={[0, 0, i ? 0 : -0.15]}>
        <mesh geometry={g} material={m.skin} castShadow />
        {[0.1, 0.2].map((y) => (
          <mesh key={y} geometry={EG.fold} material={m.fold} position={[0, -y, 0]} rotation={[Math.PI / 2, 0, 0]} scale={TRUNK[i] - (TRUNK[i] - TRUNK[i + 1]) * (y / 0.3)} />
        ))}
        {inner ?? <mesh geometry={EG.tip} material={m.tip} position={[0, -0.32, 0]} />}
      </group>
    ),
    null,
  );
  return (
    <group>
      <group ref={body}>
        <mesh geometry={EG.body} material={m.body} position={[0, 2.25, 0]} castShadow receiveShadow />
        {legSpots.map(([x, z], i) => (
          <group key={i} ref={(el) => void (legs.current[i] = el)} position={[x, 1.75, z]}>
            <mesh geometry={EG.upper} material={m.leg} castShadow />
            <mesh geometry={EG.knee} material={m.leg} position={[0, -0.85, 0]} scale={[1, 0.8, 1]} />
            <group ref={(el) => void (knees.current[i] = el)} position={[0, -0.85, 0]}>
              <mesh geometry={EG.lower} material={m.leg} castShadow />
              {/* Wrinkle bands round the ankle. */}
              {[0.5, 0.6].map((y) => (
                <mesh key={y} geometry={EG.fold} material={m.fold} position={[0, -y, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.33} />
              ))}
              <mesh geometry={EG.foot} material={m.pad} position={[0, -0.83, 0]} />
              {[-0.2, 0, 0.2].map((dz) => (
                <mesh key={dz} material={m.nail} position={[0.34, -0.79, dz]}>
                  <sphereGeometry args={[0.06, 8, 6]} />
                </mesh>
              ))}
            </group>
          </group>
        ))}
        {/* Head with a domed brow and a cheek bulge, ears, eyes under heavy lids, tusks, trunk */}
        <group position={[1.85, 2.55, 0]}>
          <mesh geometry={EG.head} material={m.skin} scale={[1.05, 1.15, 1.0]} castShadow />
          <mesh geometry={EG.head} material={m.skin} position={[-0.1, 0.3, 0]} scale={[0.8, 0.75, 0.85]} />
          <mesh geometry={EG.head} material={m.skin} position={[0.3, -0.25, 0]} scale={[0.55, 0.6, 0.62]} />
          {[1, -1].map((side, i) => (
            <group key={side} ref={(el) => void (ears.current[i] = el)} position={[-0.32, 0.05, side * 0.5]}>
              <mesh geometry={EG.ear} material={m.ear} rotation={[0, side > 0 ? 0 : Math.PI, 0]} scale={[1, 1.05, 1]} castShadow />
            </group>
          ))}
          {[1, -1].map((side) => (
            <group key={side} position={[0.42, 0.18, side * 0.42]}>
              <mesh geometry={EG.eye} material={m.eye} />
              <mesh geometry={EG.lid} material={m.skin} position={[0, 0.005, 0]} rotation={[0, 0, -0.35]} />
            </group>
          ))}
          {[1, -1].map((side) => (
            <mesh key={side} geometry={EG.tusk} material={m.tusk} position={[0.5, -0.42, side * 0.24]} rotation={[side * 0.12, -side * 0.12, -0.55]} />
          ))}
          <group position={[0.64, -0.2, 0]}>{trunkChain}</group>
        </group>
        <group ref={tail} position={[-1.8, 2.3, 0]}>
          <mesh geometry={EG.tail} material={m.dark} />
          <mesh geometry={EG.tuft} material={m.pad} position={[0, -1.05, 0]} rotation={[Math.PI, 0, 0]} />
        </group>
        {/* Riding blanket with a gold trim */}
        <mesh geometry={EG.blanketEdge} material={m.trim} position={[0.3, 2.36, 0]} castShadow />
        <mesh geometry={EG.blanket} material={m.blanket} position={[0.3, 2.37, 0]} />
      </group>
    </group>
  );
}
