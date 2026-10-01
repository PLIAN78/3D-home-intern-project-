import type { HouseModel, Point2D } from "@/lib/models/house";
import { modelPlanBounds, sortedFloors, topOfWalls } from "@/lib/models/house";
import { generateWalls } from "./generateWalls";
import { generateFloorSurfaces, resolveFootprint, roomLabels, type RoomLabel } from "./generateFloor";
import { generateFixtures } from "./generateFixtures";
import { generateRoof, roofBaseHeight } from "./generateRoof";
import { disposeSurfaces, type SurfaceGeometry } from "./surfaces";

/** Geometry for one level, split into independently toggleable layers. */
export interface FloorGeometry {
  floorId: string;
  name: string;
  index: number;
  elevation: number;
  /** Underside of the floor structure (elevation − thickness). */
  baseY: number;
  belowGrade: boolean;
  /** Exterior walls + their windows/doors. Hidden by "exterior walls" cutaway. */
  shell: SurfaceGeometry[];
  /** Interior partitions + interior doors. */
  interior: SurfaceGeometry[];
  /** Structure + finished floors. */
  slab: SurfaceGeometry[];
  ceiling: SurfaceGeometry[];
  fixtures: SurfaceGeometry[];
  labels: RoomLabel[];
}

export interface RoofGeometry {
  sectionId: string;
  name: string;
  baseFloorId: string;
  baseHeight: number;
  parts: SurfaceGeometry[];
}

export interface HouseGeometry {
  floors: FloorGeometry[];
  roofs: RoofGeometry[];
  /** Plan-space centre of the building (used to centre it on its lot). */
  planCentre: Point2D;
  planSize: { width: number; depth: number };
  /** Plan y of the front-most wall (street side). */
  frontY: number;
  wallTop: number;
  belowGradeDepth: number;
}

/**
 * Procedurally generate all house geometry from the structured model.
 * Pure function: no React, no scene graph — just BufferGeometries tagged with
 * surface keys. Callers own disposal (see disposeHouseGeometry).
 */
export function buildHouseGeometry(model: HouseModel): HouseGeometry {
  const floors = sortedFloors(model).map((floor, index): FloorGeometry => {
    const footprint = resolveFootprint(floor);
    const walls = generateWalls(floor, footprint);
    const { slab, ceiling } = generateFloorSurfaces(floor, footprint);
    return {
      floorId: floor.id,
      name: floor.name,
      index,
      elevation: floor.elevation,
      baseY: floor.elevation - (floor.floorThickness ?? 0.3),
      belowGrade: !!floor.belowGrade || floor.elevation < -0.5,
      shell: walls.shell.toSurfaces(),
      interior: walls.interior.toSurfaces(),
      slab: slab.toSurfaces(),
      ceiling: ceiling.toSurfaces(),
      fixtures: generateFixtures(floor).toSurfaces(),
      labels: roomLabels(floor),
    };
  });

  const roofs = model.exterior.roofs.map(
    (r): RoofGeometry => ({
      sectionId: r.id,
      name: r.name,
      baseFloorId: r.baseFloorId,
      baseHeight: roofBaseHeight(model, r),
      parts: generateRoof(model, r).toSurfaces(),
    }),
  );

  const b = modelPlanBounds(model);
  const lowest = Math.min(...model.floors.map((f) => f.elevation - (f.floorThickness ?? 0.3)));
  return {
    floors,
    roofs,
    planCentre: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
    planSize: { width: b.maxX - b.minX, depth: b.maxY - b.minY },
    frontY: b.maxY,
    wallTop: topOfWalls(model),
    belowGradeDepth: Math.max(0, -lowest),
  };
}

export function disposeHouseGeometry(g: HouseGeometry) {
  for (const f of g.floors) {
    disposeSurfaces(f.shell);
    disposeSurfaces(f.interior);
    disposeSurfaces(f.slab);
    disposeSurfaces(f.ceiling);
    disposeSurfaces(f.fixtures);
  }
  for (const r of g.roofs) disposeSurfaces(r.parts);
}
