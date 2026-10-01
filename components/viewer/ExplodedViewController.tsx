"use client";

import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Max vertical gap (m) between levels at 100% separation. */
export const MAX_SEPARATION = 4.2;

export function separationMetres(explode: number) {
  return (explode / 100) * MAX_SEPARATION;
}

/**
 * Exploded "cake slice" offsets: level i rises by i × gap. Roof sections ride
 * one gap above the floor they bear on.
 */
export function levelOffset(index: number, explode: number) {
  return index * separationMetres(explode);
}

interface AnimatedLevelProps {
  name: string;
  offsetY: number;
  visible: boolean;
  children: ReactNode;
  /** Distance a level travels when it is shown/hidden. */
  travel?: number;
}

/**
 * A level group that eases toward its exploded offset and slides in/out when
 * toggled, so floor changes feel continuous rather than popping.
 */
export function AnimatedLevel({ name, offsetY, visible, children, travel = 2.2 }: AnimatedLevelProps) {
  const ref = useRef<THREE.Group>(null);
  const state = useRef({ y: offsetY, presence: visible ? 1 : 0 });

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const s = state.current;
    const d = Math.min(dt, 0.05);
    s.y = THREE.MathUtils.damp(s.y, offsetY, 6, d);
    s.presence = THREE.MathUtils.damp(s.presence, visible ? 1 : 0, 9, d);
    if (Math.abs(s.presence - (visible ? 1 : 0)) < 0.002) s.presence = visible ? 1 : 0;
    g.visible = s.presence > 0.02;
    g.position.y = s.y + (1 - s.presence) * travel;
  });

  return (
    <group ref={ref} name={name}>
      {children}
    </group>
  );
}

/** Eases the whole house upward (e.g. to lift the basement out of the ground). */
export function AnimatedLift({ liftY, children }: { liftY: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.position.y = THREE.MathUtils.damp(g.position.y, liftY, 5, Math.min(dt, 0.05));
  });
  return <group ref={ref}>{children}</group>;
}
