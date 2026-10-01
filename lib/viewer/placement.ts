import type { Lot } from "@/lib/models/community";
import type { CameraView } from "@/stores/viewerStore";

export type V3 = [number, number, number];

export interface HouseFootprintInfo {
  planCentre: { x: number; y: number };
  planSize: { width: number; depth: number };
  frontY: number;
  wallTop: number;
}

/**
 * Offset that places a house (in plan coordinates) on a lot, in the lot's local
 * frame: centred across the lot, front wall at the front setback line.
 */
export function houseOffsetOnLot(lot: Lot, house: HouseFootprintInfo): V3 {
  const frontLocalZ = lot.depth / 2 - lot.frontSetback;
  return [-house.planCentre.x, 0, frontLocalZ - house.frontY];
}

/** Lot-local point → world. Lots only rotate about Y. */
export function lotToWorld(lot: Lot, p: V3): V3 {
  const a = lot.rotation[1];
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [lot.position[0] + p[0] * c + p[2] * s, lot.position[1] + p[1], lot.position[2] - p[0] * s + p[2] * c];
}

/** Centre of the house volume in lot-local coordinates. */
export function houseCentreLocal(lot: Lot, house: HouseFootprintInfo): V3 {
  const off = houseOffsetOnLot(lot, house);
  return [house.planCentre.x + off[0], house.wallTop * 0.45, house.planCentre.y + off[2]];
}

/**
 * Camera position/target for a named view, in world coordinates.
 * Directions are relative to the house: "front" looks at the street elevation,
 * "left"/"right" are the elevations on your left/right when facing the front.
 */
export function cameraForView(view: CameraView, lot: Lot, house: HouseFootprintInfo, liftY = 0): { position: V3; target: V3 } {
  const c = houseCentreLocal(lot, house);
  const size = Math.max(house.planSize.width, house.planSize.depth);
  const d = size * 1.9 + 6;
  const e = d * 0.85; // elevations sit a little closer
  const tLocal: V3 = [c[0], c[1] + liftY * 0.5, c[2]];
  let pLocal: V3;
  switch (view) {
    case "front":
      pLocal = [c[0], c[1] + 1.5, c[2] + e];
      break;
    case "rear":
      pLocal = [c[0], c[1] + 1.5, c[2] - e];
      break;
    case "left":
      pLocal = [c[0] - e, c[1] + 1.5, c[2]];
      break;
    case "right":
      pLocal = [c[0] + e, c[1] + 1.5, c[2]];
      break;
    case "top":
      pLocal = [c[0], c[1] + d * 1.25, c[2] + 0.01];
      break;
    case "perspective":
    default:
      pLocal = [c[0] + d * 0.5, c[1] + d * 0.36, c[2] + d * 0.86];
      break;
  }
  return { position: lotToWorld(lot, [pLocal[0], pLocal[1] + liftY * 0.5, pLocal[2]]), target: lotToWorld(lot, tLocal) };
}

/** Wide aerial framing the lot within its street. */
export function communityCamera(lot: Lot): { position: V3; target: V3 } {
  const target = lotToWorld(lot, [0, 0, lot.depth * 0.1]);
  return { position: [target[0] + 48, 62, target[2] + 92], target };
}
