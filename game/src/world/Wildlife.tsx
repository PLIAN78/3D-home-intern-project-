import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { Quadruped, SPECIES } from "../models/quadruped";
import { runtime } from "../core/runtime";
import { groundAt } from "./terrain";
import { initWild, stepWild, WILD_ANIMALS, WILD_TUNING, type WildAnimal } from "./wildAnimals";

/** Everyone's wander state, shared so a cub can follow its mother. */
const STATES = WILD_ANIMALS.map(initWild);
const SHOW = 170;

function Animal({ a }: { a: WildAnimal }) {
  const yaw = useRef<THREE.Group>(null);
  const pitch = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const cub = a.kind === "cub";
  const kind = a.kind === "cub" ? "bear" : a.kind;
  useFrame((_, rawDt) => {
    const s = STATES[a.id], g = yaw.current;
    if (!g) return;
    const far = Math.hypot(camera.position.x - s.x, camera.position.z - s.z) > SHOW;
    g.visible = !far;
    if (far) return;
    stepWild(a, s, Math.min(rawDt, 0.1), runtime.body, a.follows !== undefined ? STATES[a.follows] : undefined);
    g.position.set(s.x, groundAt(s.x, s.z), s.z);
    g.rotation.y = -s.heading;
    // Lean with the slope underfoot.
    if (pitch.current) {
      const c = Math.cos(s.heading), n = Math.sin(s.heading);
      pitch.current.rotation.z = Math.atan((groundAt(s.x + c, s.z + n) - groundAt(s.x - c, s.z - n)) / 2) * 0.8;
    }
  });
  return (
    <group ref={yaw} name={"Wild " + a.kind}>
      <group ref={pitch} scale={cub ? 0.5 : 1}>
        <Quadruped species={SPECIES[kind]} speed={() => STATES[a.id].speed * (cub ? 1.8 : 1)} grazing={() => WILD_TUNING[a.kind].grazes && STATES[a.id].wait > 0} />
      </group>
    </group>
  );
}

/** Deer, bears, foxes and rabbits roaming the hills (see wildAnimals.ts). */
export function Wildlife() {
  return (
    <group name="Wildlife">
      {WILD_ANIMALS.map((a) => (
        <Animal key={a.id} a={a} />
      ))}
    </group>
  );
}
