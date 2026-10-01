"use client";

import { useEffect, useMemo } from "react";
import type { HouseModel } from "@/lib/models/house";
import { buildHouseGeometry, disposeHouseGeometry, type HouseGeometry } from "@/lib/geometry/buildHouse";
import { isFloorVisible, isRoofVisible, ROOF_LEVEL, useViewerStore } from "@/stores/viewerStore";
import { AnimatedLevel, AnimatedLift, levelOffset, separationMetres } from "./ExplodedViewController";
import { FloorMesh } from "./FloorMesh";
import { SurfaceList } from "./SurfaceMesh";

/** Build (and dispose) procedural geometry for a house model. */
export function useHouseGeometry(model: HouseModel): HouseGeometry {
  const geometry = useMemo(() => buildHouseGeometry(model), [model]);
  useEffect(() => () => disposeHouseGeometry(geometry), [geometry]);
  return geometry;
}

interface House3DProps {
  geometry: HouseGeometry;
}

/**
 * Scene graph:
 *   House
 *    ├── Basement
 *    ├── Main Floor
 *    ├── Second Floor
 *    └── Roof (one animated group per roof section)
 * Each level is an independent group so it can be hidden, isolated or exploded.
 */
export function House3D({ geometry }: House3DProps) {
  const isolated = useViewerStore((s) => s.isolated);
  const hiddenFloors = useViewerStore((s) => s.hiddenFloors);
  const explode = useViewerStore((s) => s.explode);
  const showRoof = useViewerStore((s) => s.showRoof);
  const showCeilings = useViewerStore((s) => s.showCeilings);
  const showExteriorWalls = useViewerStore((s) => s.showExteriorWalls);
  const showLabels = useViewerStore((s) => s.showLabels && s.mode === "house");

  // Lift the building out of the ground so below-grade levels are visible when exploded.
  const lift = explode > 0 && geometry.belowGradeDepth > 0 ? geometry.belowGradeDepth + 0.05 : 0;
  const roofVisible = isRoofVisible({ isolated, showRoof });
  const floorIndexById = new Map(geometry.floors.map((f) => [f.floorId, f.index]));
  const gap = separationMetres(explode);

  return (
    <AnimatedLift liftY={lift}>
      <group name="House">
        {geometry.floors.map((f) => {
          const visible = isFloorVisible({ isolated, hiddenFloors }, f.floorId);
          // Only label floors whose rooms can actually be seen from above.
          const isTopVisible = !geometry.floors.some((o) => o.index > f.index && isFloorVisible({ isolated, hiddenFloors }, o.floorId));
          const labelled = showLabels && visible && (isolated === f.floorId || explode > 15 || (!roofVisible && isTopVisible));
          // An isolated level is set down on grade so it reads like a floor-plan model.
          const offsetY = isolated === f.floorId ? -f.baseY : levelOffset(f.index, explode);
          return (
            <AnimatedLevel key={f.floorId} name={f.name} offsetY={offsetY} visible={visible}>
              <FloorMesh floor={f} showShell={showExteriorWalls} showCeiling={showCeilings} showLabels={labelled} compactLabels={explode > 15} />
            </AnimatedLevel>
          );
        })}
        <group name="Roof">
          {geometry.roofs.map((r) => {
            const base = floorIndexById.get(r.baseFloorId) ?? geometry.floors.length - 1;
            const visible = roofVisible && (isolated === ROOF_LEVEL || isFloorVisible({ isolated: null, hiddenFloors }, r.baseFloorId));
            return (
              <AnimatedLevel key={r.sectionId} name={r.name} offsetY={levelOffset(base, explode) + gap} visible={visible} travel={3}>
                <SurfaceList surfaces={r.parts} />
              </AnimatedLevel>
            );
          })}
        </group>
      </group>
    </AnimatedLift>
  );
}
