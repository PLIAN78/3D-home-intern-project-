"use client";

import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import type { ComponentRef } from "react";
import * as THREE from "three";

/**
 * Keep the near plane proportional to the orbit distance. Depth precision is
 * set mostly by the near plane, and the far plane has to reach kilometres for
 * real-world communities; a fixed 0.1 m near plane makes close surfaces
 * (floor finishes, slabs, trim) flicker when zoomed out.
 */
export function useAdaptiveNear(controls: RefObject<ComponentRef<typeof CameraControls> | null>, factor = 0.01) {
  useFrame(({ camera }) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const dist = controls.current?.distance ?? camera.position.length();
    const near = THREE.MathUtils.clamp(dist * factor, 0.05, 5);
    if (Math.abs(camera.near - near) / near > 0.08) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  });
}
