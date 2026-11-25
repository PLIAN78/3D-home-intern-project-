import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { fabric, mat, reflective, skin } from "../render/materials";
import { REALISTIC } from "../assets/crowd";
import { PersonModel } from "./PersonModel";

/**
 * People: a jointed figure (hips, knees, ankles, shoulders, elbows, neck) built
 * from smooth capsules, with cloth and skin materials and procedural animation
 * for idle, walk, run, sit (driving), ride (horse), fly (jetpack) and wave.
 * Faces +x, feet at y = 0, about 1.78 m tall.
 */

export interface Outfit {
  skin: string;
  shirt: string;
  pants: string;
  shoes?: string;
  hair?: string;
  /** Long hair falls to the shoulders. */
  longHair?: boolean;
  vest?: string;
  hat?: { kind: "hardhat" | "straw" | "cap"; color: string };
  /** Scale (kids are smaller). */
  scale?: number;
}

export const OUTFITS = {
  player: {
    skin: "#c68863",
    shirt: "#2f4f75",
    pants: "#3a3f4a",
    shoes: "#4a3424",
    vest: "#f2b707",
    hat: { kind: "hardhat", color: "#f5c400" },
    hair: "#2b1d14",
  },
  maya: {
    skin: "#8d5a3b",
    shirt: "#ffffff",
    pants: "#1f3a5f",
    shoes: "#222222",
    hair: "#1c1410",
    longHair: true,
  },
  priya: {
    skin: "#a8714d",
    shirt: "#c2185b",
    pants: "#2e2e3a",
    shoes: "#3a2a20",
    hair: "#1a1310",
    longHair: true,
  },
  arjun: {
    skin: "#9a6646",
    shirt: "#4b6a88",
    pants: "#4a4a4a",
    shoes: "#2a2a2a",
    hair: "#151010",
  },
  raj: {
    skin: "#7d5236",
    shirt: "#3c6e47",
    pants: "#2f3b4c",
    shoes: "#3b2b1d",
    vest: "#ff7a00",
    hat: { kind: "hardhat", color: "#ffffff" },
    hair: "#121010",
  },
  gail: {
    skin: "#e8b796",
    shirt: "#7a4b2a",
    pants: "#4b5d73",
    shoes: "#5a3b22",
    hat: { kind: "straw", color: "#d8b25a" },
    hair: "#b9b2a6",
  },
  nguyenA: {
    skin: "#d9a77f",
    shirt: "#e0a000",
    pants: "#30343c",
    shoes: "#2d2d2d",
    hair: "#1a1612",
  },
  nguyenB: {
    skin: "#dcae88",
    shirt: "#3f7cac",
    pants: "#5a4636",
    shoes: "#2d2d2d",
    hair: "#201812",
    longHair: true,
  },
  kid: {
    skin: "#d6a27c",
    shirt: "#e53935",
    pants: "#1e5aa8",
    shoes: "#f2f2f2",
    hair: "#2a1e14",
    hat: { kind: "cap", color: "#1e5aa8" },
    scale: 0.62,
  },
  rosa: {
    skin: "#c48a64",
    shirt: "#6b7f5a",
    pants: "#3d3a36",
    shoes: "#4a3424",
    hair: "#d9d4cc",
    longHair: true,
    hat: { kind: "straw", color: "#c9a85c" },
  },
} satisfies Record<string, Outfit>;

/** Everyday clothes for the people walking around town (muted, real-world colours). */
export const TOWNSFOLK: Outfit[] = [
  { skin: "#e0b08f", shirt: "#3a4b5c", pants: "#2c2f36", shoes: "#1f1f22", hair: "#3b2a1e" },
  { skin: "#8d5a3b", shirt: "#d8d2c4", pants: "#4a5160", shoes: "#2a2a2a", hair: "#151010", longHair: true },
  { skin: "#c68863", shirt: "#7a2e2e", pants: "#30343c", shoes: "#3a2a20", hair: "#241810" },
  { skin: "#f0c8a8", shirt: "#56705a", pants: "#6b5a46", shoes: "#3b2b1d", hair: "#a87a42", longHair: true },
  { skin: "#6e4630", shirt: "#e9e4da", pants: "#1f3a5f", shoes: "#f2f2f2", hair: "#0f0c0a", hat: { kind: "cap", color: "#2b2f36" } },
  { skin: "#d9a77f", shirt: "#2f3a4a", pants: "#8c8578", shoes: "#3a2a20", hair: "#1a1310" },
  { skin: "#a8714d", shirt: "#b88a3a", pants: "#2e2e3a", shoes: "#2a2a2a", hair: "#1c1410", longHair: true },
  { skin: "#e8b796", shirt: "#495a6e", pants: "#3a3f4a", shoes: "#4a3424", hair: "#cfc8bc" },
  { skin: "#9a6646", shirt: "#3c6e6e", pants: "#4a4a4a", shoes: "#222222", hair: "#151010" },
  { skin: "#dcae88", shirt: "#8a4a5c", pants: "#2c2f36", shoes: "#2d2d2d", hair: "#201812", longHair: true, scale: 0.7 },
];

export type Pose = "auto" | "sit" | "drive" | "ride" | "fly" | "wave" | "swim";

/** Live values the figure reads every frame (so it never re-renders React). */
export interface Motion {
  /** Ground speed in m/s (drives the gait). */
  speed?: () => number;
  /** Lean forward / roll (radians), e.g. from the jetpack flight model. */
  lean?: () => { pitch: number; roll: number };
  /** Airborne (legs relax, arms out). */
  airborne?: () => boolean;
}

// Shared geometry (one set for everyone).
const G = {
  thigh: new THREE.CapsuleGeometry(0.075, 0.3, 4, 10),
  shin: new THREE.CapsuleGeometry(0.06, 0.32, 4, 10),
  upperArm: new THREE.CapsuleGeometry(0.054, 0.22, 4, 10),
  forearm: new THREE.CapsuleGeometry(0.046, 0.2, 4, 10),
  hand: new THREE.SphereGeometry(0.052, 10, 8),
  chest: new THREE.CapsuleGeometry(0.5, 0.35, 6, 16),
  pelvis: new THREE.CapsuleGeometry(0.5, 0.15, 6, 16),
  neck: new THREE.CylinderGeometry(0.05, 0.058, 0.1, 10),
  head: new THREE.SphereGeometry(0.5, 20, 16),
  nose: new THREE.ConeGeometry(0.022, 0.05, 6),
  ear: new THREE.SphereGeometry(0.026, 8, 6),
  eye: new THREE.SphereGeometry(0.014, 8, 6),
  boot: new RoundedBoxGeometry(0.27, 0.1, 0.11, 3, 0.035),
  hairCap: new THREE.SphereGeometry(
    0.5,
    18,
    12,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.58,
  ),
  hardHatDome: new THREE.SphereGeometry(
    0.135,
    18,
    10,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  ),
  hardHatBrim: new THREE.CylinderGeometry(0.165, 0.17, 0.018, 20),
  capBrim: new THREE.CylinderGeometry(
    0.09,
    0.09,
    0.015,
    16,
    1,
    false,
    -Math.PI / 2,
    Math.PI,
  ),
  strawCrown: new THREE.CylinderGeometry(0.1, 0.12, 0.11, 16),
  strawBrim: new THREE.CylinderGeometry(0.27, 0.28, 0.015, 24),
  vestBand: new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20, 1, true),
};

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Joints {
  hips: THREE.Group | null;
  spine: THREE.Group | null;
  head: THREE.Group | null;
  thighL: THREE.Group | null;
  thighR: THREE.Group | null;
  kneeL: THREE.Group | null;
  kneeR: THREE.Group | null;
  footL: THREE.Group | null;
  footR: THREE.Group | null;
  armL: THREE.Group | null;
  armR: THREE.Group | null;
  elbowL: THREE.Group | null;
  elbowR: THREE.Group | null;
  chest: THREE.Mesh | null;
}

/**
 * A person. Draws the realistic character from the asset registry (models/
 * PersonModel.tsx) when realistic models are on, with this jointed figure as
 * the stand-in while it loads; "?classic" draws only the jointed figure.
 */
export function Human({ seat, ...props }: { outfit: Outfit; motion?: Motion; pose?: Pose | (() => Pose); seat?: "moto" | "boat" | "heli" }) {
  if (!REALISTIC) return <JointedHuman {...props} />;
  return <PersonModel {...props} seat={seat} fallback={<JointedHuman {...props} />} />;
}

function JointedHuman({
  outfit,
  motion,
  pose: poseProp = "auto",
}: {
  outfit: Outfit;
  motion?: Motion;
  pose?: Pose | (() => Pose);
}) {
  const s = outfit.scale ?? 1;
  const root = useRef<THREE.Group>(null);
  // Joints are looked up by name once, on the first frame.
  const r = useRef<Joints | null>(null);
  const phase = useRef(-1);
  const gaitBlend = useRef(0);
  const t = useRef(0);

  const m = useMemo(
    () => ({
      skin: skin(outfit.skin),
      shirt: fabric(outfit.shirt),
      pants: fabric(outfit.pants, 0.25),
      shoes: mat(outfit.shoes ?? "#3b2a1c", { rough: 0.55 }),
      hair: outfit.hair ? mat(outfit.hair, { rough: 0.7 }) : null,
      vest: outfit.vest ? fabric(outfit.vest, 0.5) : null,
      eye: mat("#1a1512", { rough: 0.2 }),
    }),
    [outfit],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    if (!r.current && root.current) {
      const find = (n: string) =>
        (root.current?.getObjectByName(n) as THREE.Group | undefined) ?? null;
      r.current = {
        hips: find("hips"),
        spine: find("spine"),
        head: find("head"),
        thighL: find("thighL"),
        thighR: find("thighR"),
        kneeL: find("kneeL"),
        kneeR: find("kneeR"),
        footL: find("footL"),
        footR: find("footR"),
        armL: find("armL"),
        armR: find("armR"),
        elbowL: find("elbowL"),
        elbowR: find("elbowR"),
        chest:
          (root.current.getObjectByName("chest") as THREE.Mesh | undefined) ??
          null,
      };
    }
    const j = r.current;
    if (!j) return;
    if (phase.current < 0) phase.current = Math.random() * 10;
    t.current += dt;
    const speed = motion?.speed?.() ?? 0;
    const air = motion?.airborne?.() ?? false;
    const lean = motion?.lean?.() ?? { pitch: 0, roll: 0 };
    const set = (g: THREE.Group | null, x: number, y: number, z: number) =>
      g?.rotation.set(x, y, z);
    const rawPose = typeof poseProp === "function" ? poseProp() : poseProp;
    const pose = rawPose === "drive" ? "sit" : rawPose;

    if (pose === "sit" || pose === "ride") {
      const ride = pose === "ride";
      const bounce = ride
        ? Math.sin(t.current * (4 + speed * 0.9)) *
          Math.min(0.04, speed * 0.004)
        : 0;
      if (j.hips) j.hips.position.set(0, (ride ? 0.95 : 0.5) + bounce, 0);
      set(j.spine, 0, 0, ride ? -0.06 - Math.min(0.25, speed * 0.015) : -0.12);
      set(j.thighL, ride ? 0.42 : 0.12, 0, ride ? 1.0 : 1.5);
      set(j.thighR, ride ? -0.42 : -0.12, 0, ride ? 1.0 : 1.5);
      set(j.kneeL, 0, 0, ride ? -1.5 : -1.45);
      set(j.kneeR, 0, 0, ride ? -1.5 : -1.45);
      set(j.footL, 0, 0, ride ? 0.4 : 0);
      set(j.footR, 0, 0, ride ? 0.4 : 0);
      set(j.armL, -0.12, 0, ride ? 0.75 : 1.05);
      set(j.armR, 0.12, 0, ride ? 0.75 : 1.05);
      set(j.elbowL, 0, 0, ride ? 0.7 : 0.45);
      set(j.elbowR, 0, 0, ride ? 0.7 : 0.45);
      set(j.head, 0, 0, 0.08);
      return;
    }

    if (pose === "swim") {
      // Front crawl (the body is laid flat by the parent): arms wheel over in turn,
      // legs flutter, the head turns up to look ahead. Treading water when still.
      const moving = Math.min(1, speed / 1.5);
      phase.current += dt * (1.6 + speed * 1.1);
      const p = phase.current;
      if (j.hips) j.hips.position.set(0, 0.95, 0);
      set(j.spine, 0, 0, 0);
      set(j.head, 0, 0, -0.75 * moving - 0.2);
      set(j.armL, 0.2, 0, -p * moving + (1 - moving) * Math.sin(p * 2) * 0.6);
      set(j.armR, -0.2, 0, (-p - Math.PI) * moving - (1 - moving) * Math.sin(p * 2) * 0.6);
      set(j.elbowL, 0, 0, 0.25 + 0.3 * Math.max(0, Math.sin(p)));
      set(j.elbowR, 0, 0, 0.25 + 0.3 * Math.max(0, Math.sin(p + Math.PI)));
      const kick = Math.sin(p * 3) * (0.22 + 0.15 * moving);
      set(j.thighL, 0.05, 0, kick);
      set(j.thighR, -0.05, 0, -kick);
      set(j.kneeL, 0, 0, -0.15 - Math.max(0, kick) * 0.6);
      set(j.kneeR, 0, 0, -0.15 - Math.max(0, -kick) * 0.6);
      set(j.footL, 0, 0, 0.5);
      set(j.footR, 0, 0, 0.5);
      return;
    }

    // Gait: blend idle → walk → run by speed; cadence rises with speed.
    const target = Math.min(1, speed / 4.5);
    gaitBlend.current += (target - gaitBlend.current) * (1 - Math.exp(-dt * 8));
    const g = air ? 0 : gaitBlend.current;
    const run = Math.max(0, Math.min(1, (speed - 4.8) / 2.5));
    phase.current += dt * (speed > 0.2 && !air ? 4.2 + speed * 1.05 : 0);
    const p = phase.current;
    const A = (0.42 + run * 0.38) * g;
    const thighL = Math.sin(p) * A;
    const thighR = Math.sin(p + Math.PI) * A;
    const kneeAmt = (0.55 + run * 0.65) * g;
    const kneeL = -Math.max(0, Math.cos(p)) * kneeAmt - 0.05;
    const kneeR = -Math.max(0, Math.cos(p + Math.PI)) * kneeAmt - 0.05;

    if (air) {
      // Flying or falling: legs trail, arms out for balance.
      const thrustLean = lean.pitch;
      set(j.thighL, 0.08, 0, -0.18 - thrustLean * 0.3);
      set(j.thighR, -0.08, 0, -0.08 - thrustLean * 0.3);
      set(j.kneeL, 0, 0, -0.5);
      set(j.kneeR, 0, 0, -0.35);
      set(j.footL, 0, 0, -0.3);
      set(j.footR, 0, 0, -0.3);
      set(j.armL, 0.45, 0, 0.15);
      set(j.armR, -0.45, 0, 0.15);
      set(j.elbowL, 0, 0, 0.35);
      set(j.elbowR, 0, 0, 0.35);
    } else {
      set(j.thighL, 0.03, 0, thighL);
      set(j.thighR, -0.03, 0, thighR);
      set(j.kneeL, 0, 0, kneeL);
      set(j.kneeR, 0, 0, kneeR);
      set(j.footL, 0, 0, -(thighL + kneeL) * 0.55);
      set(j.footR, 0, 0, -(thighR + kneeR) * 0.55);
      const armA = (0.38 + run * 0.4) * g;
      const elbow = 0.18 + run * 1.15 + g * 0.15;
      set(j.armL, 0.08, 0, -Math.sin(p) * armA);
      set(j.elbowL, 0, 0, elbow);
      if (pose === "wave") {
        set(j.armR, -2.7 - Math.sin(t.current * 7) * 0.25, 0, 0.1);
        set(j.elbowR, 0, 0, 0.4);
      } else {
        set(j.armR, -0.08, 0, -Math.sin(p + Math.PI) * armA);
        set(j.elbowR, 0, 0, elbow);
      }
    }
    const breath = Math.sin(t.current * 1.9) * 0.008;
    if (j.hips)
      j.hips.position.set(
        0,
        0.93 - Math.abs(Math.cos(p)) * 0.035 * g - run * 0.04 + breath * 0.3,
        0,
      );
    set(j.hips, lean.roll * 0.6, Math.sin(p) * 0.06 * g, -lean.pitch * 0.9);
    set(
      j.spine,
      0,
      -Math.sin(p) * 0.12 * g,
      -(0.03 + run * 0.16) * g - lean.pitch * 0.3,
    );
    set(
      j.head,
      0,
      Math.sin(t.current * 0.4) * 0.15 * (1 - g),
      0.05 * g + lean.pitch * 0.5,
    );
    if (j.chest) j.chest.scale.set(0.255 + breath, 0.36, 0.39 + breath);
  });

  const hat = outfit.hat;

  const leg = (side: 1 | -1) => (
    <group
      name={side < 0 ? "thighL" : "thighR"}
      position={[0, -0.02, side * 0.1]}
    >
      <mesh
        geometry={G.thigh}
        material={m.pants}
        position={[0, -0.21, 0]}
        castShadow
      />
      <group name={side < 0 ? "kneeL" : "kneeR"} position={[0, -0.43, 0]}>
        <mesh
          geometry={G.shin}
          material={m.pants}
          position={[0, -0.21, 0]}
          castShadow
        />
        <group name={side < 0 ? "footL" : "footR"} position={[0, -0.43, 0]}>
          <mesh
            geometry={G.boot}
            material={m.shoes}
            position={[0.06, -0.02, 0]}
            castShadow
          />
        </group>
      </group>
    </group>
  );

  const arm = (side: 1 | -1) => (
    <group
      name={side < 0 ? "armL" : "armR"}
      position={[0, 0.445, side * 0.215]}
    >
      <mesh
        geometry={G.upperArm}
        material={m.shirt}
        position={[0, -0.15, 0]}
        castShadow
      />
      <group name={side < 0 ? "elbowL" : "elbowR"} position={[0, -0.3, 0]}>
        <mesh
          geometry={G.forearm}
          material={outfit.vest ? m.skin : m.shirt}
          position={[0, -0.13, 0]}
          castShadow
        />
        <mesh
          geometry={G.hand}
          material={m.skin}
          position={[0, -0.29, 0]}
          scale={[0.85, 1.1, 0.7]}
          castShadow
        />
      </group>
    </group>
  );

  return (
    <group ref={root} scale={s}>
      <group name="hips" position={[0, 0.93, 0]}>
        <mesh
          geometry={G.pelvis}
          material={m.pants}
          position={[0, 0.02, 0]}
          scale={[0.23, 0.26, 0.34]}
          castShadow
        />
        {leg(-1)}
        {leg(1)}
        <group name="spine" position={[0, 0.06, 0]}>
          <mesh
            name="chest"
            geometry={G.chest}
            material={m.shirt}
            position={[0, 0.24, 0]}
            scale={[0.255, 0.36, 0.39]}
            castShadow
          />
          {m.vest && (
            <>
              <mesh
                geometry={G.chest}
                material={m.vest}
                position={[0, 0.26, 0]}
                scale={[0.27, 0.3, 0.405]}
                castShadow
              />
              <mesh
                geometry={G.vestBand}
                material={reflective()}
                position={[0, 0.16, 0]}
                scale={[0.275, 1, 0.41]}
              />
              <mesh
                geometry={G.vestBand}
                material={reflective()}
                position={[0, 0.3, 0]}
                scale={[0.275, 1, 0.41]}
              />
            </>
          )}
          {arm(-1)}
          {arm(1)}
          <mesh geometry={G.neck} material={m.skin} position={[0, 0.5, 0]} />
          <group name="head" position={[0, 0.55, 0]}>
            <mesh
              geometry={G.head}
              material={m.skin}
              position={[0.005, 0.1, 0]}
              scale={[0.205, 0.245, 0.19]}
              castShadow
            />
            <mesh
              geometry={G.nose}
              material={m.skin}
              position={[0.1, 0.09, 0]}
              rotation={[0, 0, -Math.PI / 2]}
            />
            <mesh
              geometry={G.ear}
              material={m.skin}
              position={[0, 0.1, 0.095]}
              scale={[0.6, 1, 0.5]}
            />
            <mesh
              geometry={G.ear}
              material={m.skin}
              position={[0, 0.1, -0.095]}
              scale={[0.6, 1, 0.5]}
            />
            <mesh
              geometry={G.eye}
              material={m.eye}
              position={[0.088, 0.125, 0.038]}
            />
            <mesh
              geometry={G.eye}
              material={m.eye}
              position={[0.088, 0.125, -0.038]}
            />
            {m.hair && !hat && (
              <mesh
                geometry={G.hairCap}
                material={m.hair}
                position={[-0.01, 0.12, 0]}
                scale={[0.215, 0.26, 0.2]}
                castShadow
              />
            )}
            {m.hair && hat && (
              <mesh
                geometry={G.hairCap}
                material={m.hair}
                position={[-0.015, 0.1, 0]}
                scale={[0.21, 0.2, 0.198]}
              />
            )}
            {m.hair && outfit.longHair && (
              <mesh
                geometry={G.chest}
                material={m.hair}
                position={[-0.07, 0.0, 0]}
                scale={[0.09, 0.16, 0.19]}
                castShadow
              />
            )}
            {hat?.kind === "hardhat" && (
              <group position={[0, 0.17, 0]}>
                <mesh
                  geometry={G.hardHatDome}
                  material={mat(hat.color, { rough: 0.28 })}
                  scale={[1.05, 0.95, 1]}
                  castShadow
                />
                <mesh
                  geometry={G.hardHatBrim}
                  material={mat(hat.color, { rough: 0.3 })}
                  position={[0.02, 0.005, 0]}
                  scale={[1.08, 1, 1]}
                />
              </group>
            )}
            {hat?.kind === "cap" && (
              <group position={[0, 0.2, 0]}>
                <mesh
                  geometry={G.hairCap}
                  material={fabric(hat.color)}
                  scale={[0.22, 0.17, 0.205]}
                  castShadow
                />
                <mesh
                  geometry={G.capBrim}
                  material={fabric(hat.color)}
                  position={[0.1, 0.0, 0]}
                  scale={[1.2, 1, 1]}
                />
              </group>
            )}
            {hat?.kind === "straw" && (
              <group position={[0, 0.2, 0]}>
                <mesh
                  geometry={G.strawCrown}
                  material={mat(hat.color, { rough: 0.9 })}
                  castShadow
                />
                <mesh
                  geometry={G.strawBrim}
                  material={mat(hat.color, { rough: 0.9 })}
                  position={[0, -0.05, 0]}
                  castShadow
                />
              </group>
            )}
          </group>
        </group>
      </group>
    </group>
  );
}

/** Where a seated driver's hips go relative to their seat (for placing them in vehicles). */
export const SEATED_HIP = v(0, 0.5, 0);
