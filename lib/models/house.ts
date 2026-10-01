/**
 * Core architectural domain model.
 *
 * Units: metres. Plan coordinates are 2D (x, y) where +x runs left→right across
 * the front elevation and +y runs from the REAR of the house toward the FRONT
 * (street side). In 3D, plan (x, y) maps to world (x, z) and elevation maps to y.
 *
 * This model is the contract between drawing interpretation (AI / manual
 * tracing) and the procedural 3D generator — keep it renderer-agnostic.
 */

export interface Point2D {
  x: number;
  y: number;
}

/** Where a piece of geometry came from, so the UI never overstates accuracy. */
export type GeometrySource = "demo-seed" | "interpreted" | "manual-trace";

/** Exterior cladding zone; each zone is driven by a configurable material slot. */
export type CladdingZone = "brick" | "stone" | "siding" | "foundation";

export interface Wall {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number;
  height: number;
  /** Exterior walls get a cladding veneer on their outside face. */
  exterior?: boolean;
  cladding?: CladdingZone;
}

export type RoomFinish = "main" | "tile" | "concrete" | "garage";

export interface Room {
  id: string;
  name: string;
  polygon: Point2D[];
  finish?: RoomFinish;
}

export type DoorKind = "interior" | "exterior" | "front" | "garage" | "patio" | "opening";

export interface Door {
  id: string;
  wallId: string;
  /** Distance (m) from the wall's start point to the CENTRE of the opening. */
  position: number;
  width: number;
  height: number;
  kind?: DoorKind;
}

export interface Window {
  id: string;
  wallId: string;
  /** Distance (m) from the wall's start point to the CENTRE of the opening. */
  position: number;
  width: number;
  height: number;
  sillHeight: number;
}

export type FixtureKind = "base-cabinets" | "upper-cabinets" | "island" | "stair" | "porch" | "column" | "appliance";

/** Simple placeholder volumes that make interiors readable (kitchen, stairs…). */
export interface Fixture {
  id: string;
  kind: FixtureKind;
  /** Axis-aligned plan rectangle: min corner + size. */
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  /** Vertical offset from the floor's elevation (negative = below floor level). */
  baseOffset?: number;
  /** Stair direction of travel in plan, used only for stairs. */
  direction?: "+x" | "-x" | "+y" | "-y";
  /** Stairs: total rise to the next level. */
  rise?: number;
}

export interface Floor {
  id: string;
  name: string;
  /** Short label for compact UI, e.g. "B", "1", "2". */
  shortName?: string;
  /** Elevation of the finished floor surface relative to grade (m). */
  elevation: number;
  ceilingHeight: number;
  /** Thickness of the floor structure beneath `elevation`. */
  floorThickness?: number;
  /** Outline used for slab + ceiling; derived from exterior walls if omitted. */
  footprint?: Point2D[];
  /** Holes in the slab, e.g. stair openings. */
  slabOpenings?: Point2D[][];
  belowGrade?: boolean;
  rooms: Room[];
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  fixtures?: Fixture[];
}

export interface RoofSection {
  id: string;
  name: string;
  type: "hip" | "gable" | "shed";
  /** Floor whose wall tops this roof bears on. */
  baseFloorId: string;
  /** Axis-aligned plan rectangle of the wall line the roof covers. */
  x: number;
  y: number;
  width: number;
  depth: number;
  /** Rise over run, e.g. 7/12 → 0.583. */
  pitch: number;
  overhang: number;
  /** Ridge axis; defaults to the longer side. */
  ridgeAxis?: "x" | "y";
  /** Shed roofs: the side that is high (against a taller wall). */
  highSide?: "-x" | "+x" | "-y" | "+y";
}

export interface ExteriorConfig {
  roofs: RoofSection[];
  /** Plan point (house-local) the driveway leads from, normally garage door centre. */
  drivewayStart?: Point2D;
  drivewayWidth?: number;
}

export interface ModelProvenance {
  source: GeometrySource;
  /** 0–1 overall confidence in geometric accuracy. */
  confidence: number;
  notes: string[];
}

export interface HouseModel {
  id: string;
  projectId: string;
  name: string;
  floors: Floor[];
  exterior: ExteriorConfig;
  provenance: ModelProvenance;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function polygonArea(poly: Point2D[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function polygonCentroid(poly: Point2D[]): Point2D {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function wallLength(w: Wall): number {
  return Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
}

export const SQ_M_TO_SQ_FT = 10.7639;

/** Finished living space (excludes garage and unfinished/concrete areas). */
export function isLivingRoom(r: Room): boolean {
  return r.finish !== "garage" && r.finish !== "concrete";
}

export function floorArea(floor: Floor, includeRoom: (r: Room) => boolean = () => true): number {
  return floor.rooms.filter(includeRoom).reduce((s, r) => s + polygonArea(r.polygon), 0);
}

/** Floors sorted bottom → top. */
export function sortedFloors(model: HouseModel): Floor[] {
  return [...model.floors].sort((a, b) => a.elevation - b.elevation);
}

export interface PlanBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function modelPlanBounds(model: HouseModel): PlanBounds {
  const b: PlanBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const f of model.floors) {
    for (const w of f.walls) {
      for (const p of [w.start, w.end]) {
        b.minX = Math.min(b.minX, p.x);
        b.minY = Math.min(b.minY, p.y);
        b.maxX = Math.max(b.maxX, p.x);
        b.maxY = Math.max(b.maxY, p.y);
      }
    }
  }
  return b;
}

/** Highest point of the building's wall tops (excluding roof). */
export function topOfWalls(model: HouseModel): number {
  return Math.max(...model.floors.map((f) => f.elevation + f.ceilingHeight));
}
