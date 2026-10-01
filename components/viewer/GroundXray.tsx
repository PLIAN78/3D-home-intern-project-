"use client";

import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HouseGeometry } from "@/lib/geometry/buildHouse";
import { setGroundXrayTransparent, xrayUniforms } from "@/lib/materials/groundXray";
import type { V3 } from "@/lib/viewer/placement";
import { isFloorVisible, useViewerStore } from "@/stores/viewerStore";

/**
 * Turns the ground around the house see-through while a basement is on show
 * in place: the basement is visible, still below grade (not isolated or
 * exploded, which lift it out), and the levels above it are hidden or the
 * exterior walls are cut away.
 */
export function useBasementXray(geometry: HouseGeometry) {
  return useViewerStore((s) => {
    if (s.mode !== "house" || s.explode > 0 || s.isolated) return false;
    const below = geometry.floors.filter((f) => f.belowGrade);
    if (!below.some((f) => isFloorVisible(s, f.floorId))) return false;
    const aboveHidden = geometry.floors.some((f) => !f.belowGrade && !isFloorVisible(s, f.floorId));
    return aboveHidden || !s.showExteriorWalls;
  });
}

export function GroundXray({ active, centre, radius }: { active: boolean; centre: V3; radius: number }) {
  useEffect(() => {
    xrayUniforms.uXrayCentre.value.set(centre[0], centre[2]);
    xrayUniforms.uXrayRadius.value = radius;
  }, [centre, radius]);

  useFrame((_, dt) => {
    const u = xrayUniforms.uXray;
    const target = active ? 1 : 0;
    u.value = THREE.MathUtils.damp(u.value, target, 6, Math.min(dt, 0.05));
    if (Math.abs(u.value - target) < 0.002) u.value = target;
    setGroundXrayTransparent(u.value > 0);
  });

  // Leave the ground opaque when the viewer unmounts.
  useEffect(
    () => () => {
      xrayUniforms.uXray.value = 0;
      setGroundXrayTransparent(false);
    },
    [],
  );
  return null;
}
