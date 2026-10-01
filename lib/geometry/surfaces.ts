import type * as THREE from "three";
import type { CladdingZone, RoomFinish } from "@/lib/models/house";
import type { MaterialSlotId } from "@/lib/models/materials";

/** Non-configurable surfaces with fixed materials. */
export type FixedSurface =
  | "glass"
  | "foundation"
  | "structure"
  | "ceiling"
  | "tile"
  | "concrete"
  | "garageFloor"
  | "interiorTrim"
  | "appliance"
  | "wallCap";

/** Every generated mesh is tagged with exactly one surface key → one material. */
export type SurfaceKey = MaterialSlotId | FixedSurface;

export interface SurfaceGeometry {
  surface: SurfaceKey;
  geometry: THREE.BufferGeometry;
}

export function claddingSurface(zone: CladdingZone | undefined): SurfaceKey {
  switch (zone) {
    case "stone":
      return "exteriorStone";
    case "siding":
      return "exteriorSiding";
    case "foundation":
      return "foundation";
    case "brick":
    default:
      return "exteriorBrick";
  }
}

export function roomFinishSurface(finish: RoomFinish | undefined): SurfaceKey {
  switch (finish) {
    case "tile":
      return "tile";
    case "concrete":
      return "concrete";
    case "garage":
      return "garageFloor";
    default:
      return "flooring";
  }
}

export function disposeSurfaces(list: SurfaceGeometry[]) {
  for (const s of list) s.geometry.dispose();
}
