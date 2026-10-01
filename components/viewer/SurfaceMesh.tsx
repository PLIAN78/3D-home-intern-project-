"use client";

import { memo, useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { SurfaceGeometry, SurfaceKey, FixedSurface } from "@/lib/geometry/surfaces";
import { isMaterialSlotId, type MaterialSlotId } from "@/lib/models/materials";
import { getFixedMaterial, getOptionMaterial, setHighlight } from "@/lib/materials/materialFactory";
import { useViewerStore } from "@/stores/viewerStore";
import { useSelection } from "@/stores/projectStore";
import { useViewerContext } from "./ViewerContext";

const noRaycast = () => null;
const stop = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation();

function useConfigurableMaterial(projectId: string, slot: MaterialSlotId) {
  const optionId = useSelection(projectId, slot);
  const hovered = useViewerStore((s) => s.hoveredSlot === slot);
  const material = useMemo(() => getOptionMaterial(optionId), [optionId]);
  useEffect(() => {
    if (!material) return;
    setHighlight(material, hovered);
    return () => setHighlight(material, false);
  }, [material, hovered]);
  return material;
}

interface Props {
  surface: SurfaceGeometry;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

function ConfigurableMesh({ geometry, slot, castShadow, receiveShadow }: { geometry: THREE.BufferGeometry; slot: MaterialSlotId; castShadow: boolean; receiveShadow: boolean }) {
  const { projectId, interactive } = useViewerContext();
  const material = useConfigurableMaterial(projectId, slot);
  const hoverSlot = useViewerStore((s) => s.hoverSlot);
  const selectSlot = useViewerStore((s) => s.selectSlot);

  const handlers = interactive
    ? {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          hoverSlot(slot);
          document.body.style.cursor = "pointer";
        },
        onPointerOut: () => {
          hoverSlot(null);
          document.body.style.cursor = "";
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          // Ignore clicks that were really orbit drags.
          if (e.delta > 4) return;
          e.stopPropagation();
          selectSlot(slot);
        },
      }
    : {};

  if (!material) return null;
  return <mesh geometry={geometry} material={material} castShadow={castShadow} receiveShadow={receiveShadow} userData={{ slot }} {...handlers} />;
}

function FixedMesh({ geometry, surface, castShadow, receiveShadow }: { geometry: THREE.BufferGeometry; surface: FixedSurface; castShadow: boolean; receiveShadow: boolean }) {
  const material = getFixedMaterial(surface);
  if (surface === "glass") {
    // Glass is see-through for picking too, so it never swallows clicks meant for surfaces behind it.
    return <mesh geometry={geometry} material={material} renderOrder={2} raycast={noRaycast} />;
  }
  return (
    <mesh
      geometry={geometry}
      material={material}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      // Opaque fixed surfaces occlude configurable ones behind them.
      onPointerOver={stop}
      onClick={stop}
    />
  );
}

/** A merged mesh for a single surface; configurable surfaces track the customer's selection. */
export const SurfaceMesh = memo(function SurfaceMesh({ surface, castShadow = true, receiveShadow = true }: Props) {
  const key: SurfaceKey = surface.surface;
  if (isMaterialSlotId(key)) return <ConfigurableMesh geometry={surface.geometry} slot={key} castShadow={castShadow} receiveShadow={receiveShadow} />;
  return <FixedMesh geometry={surface.geometry} surface={key} castShadow={castShadow} receiveShadow={receiveShadow} />;
});

export function SurfaceList({ surfaces, castShadow = true, receiveShadow = true }: { surfaces: SurfaceGeometry[]; castShadow?: boolean; receiveShadow?: boolean }) {
  return (
    <>
      {surfaces.map((s) => (
        <SurfaceMesh key={s.surface} surface={s} castShadow={castShadow} receiveShadow={receiveShadow} />
      ))}
    </>
  );
}
