"use client";

import { memo } from "react";
import { Html } from "@react-three/drei";
import type { FloorGeometry } from "@/lib/geometry/buildHouse";
import type { RoomLabel } from "@/lib/geometry/generateFloor";
import { SQ_M_TO_SQ_FT } from "@/lib/models/house";
import { SurfaceList } from "./SurfaceMesh";

interface FloorMeshProps {
  floor: FloorGeometry;
  showShell: boolean;
  showCeiling: boolean;
  showLabels: boolean;
  /** Names only (used in exploded view, where many floors are labelled at once). */
  compactLabels?: boolean;
}

function RoomLabels({ labels, compact }: { labels: RoomLabel[]; compact: boolean }) {
  return (
    <>
      {labels.map((l) => (
        <Html key={l.id} position={l.position} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-md bg-white/90 px-2 py-1 text-center shadow-sm ring-1 ring-black/5 backdrop-blur-sm">
            <div className="text-[11px] font-semibold leading-tight text-neutral-900">{l.name}</div>
            {!compact && <div className="text-[10px] leading-tight text-neutral-500">≈ {Math.round(l.areaSqM * SQ_M_TO_SQ_FT).toLocaleString()} sq ft</div>}
          </div>
        </Html>
      ))}
    </>
  );
}

/**
 * One storey. Layers are separate groups so cutaway toggles (exterior walls,
 * ceilings, labels) don't rebuild geometry.
 */
export const FloorMesh = memo(function FloorMesh({ floor, showShell, showCeiling, showLabels, compactLabels = false }: FloorMeshProps) {
  return (
    <group name={`${floor.name}:layers`}>
      <group name="slab">
        <SurfaceList surfaces={floor.slab} />
      </group>
      <group name="exterior-walls" visible={showShell}>
        <SurfaceList surfaces={floor.shell} />
      </group>
      <group name="interior-walls">
        <SurfaceList surfaces={floor.interior} />
      </group>
      <group name="fixtures">
        <SurfaceList surfaces={floor.fixtures} />
      </group>
      <group name="ceiling" visible={showCeiling}>
        <SurfaceList surfaces={floor.ceiling} castShadow={false} />
      </group>
      {showLabels && <RoomLabels labels={floor.labels} compact={compactLabels} />}
    </group>
  );
});
