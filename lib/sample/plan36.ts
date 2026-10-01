import type { Door, Floor, HouseModel, Point2D, Room, Wall, Window } from "@/lib/models/house";

/**
 * "Plan 36" — a fictional two-storey Canadian suburban home with a finished
 * basement level and a front double garage (~2,600 sq ft above grade).
 *
 * Plan origin is the rear-left corner of the main body. +x runs left→right
 * across the front elevation; +y runs rear → front (street). The garage
 * projects 2.0 m in front of the main body. Dimensions are approximate and
 * hand-authored for demonstration — they are NOT derived from real drawings.
 */

const EXT_T = 0.3; // exterior wall incl. veneer
const INT_T = 0.14; // interior partition
const FDN_T = 0.25; // poured foundation

const p = (x: number, y: number): Point2D => ({ x, y });
const rect = (x0: number, y0: number, x1: number, y1: number): Point2D[] => [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)];

function wall(id: string, x0: number, y0: number, x1: number, y1: number, height: number, opts: Partial<Wall> = {}): Wall {
  return { id, start: p(x0, y0), end: p(x1, y1), thickness: opts.exterior ? EXT_T : INT_T, height, ...opts };
}

function room(id: string, name: string, polygon: Point2D[], finish: Room["finish"] = "main"): Room {
  return { id, name, polygon, finish };
}

function door(id: string, wallId: string, position: number, width: number, height = 2.03, kind: Door["kind"] = "interior"): Door {
  return { id, wallId, position, width, height, kind };
}

function win(id: string, wallId: string, position: number, width: number, height: number, sillHeight: number): Window {
  return { id, wallId, position, width, height, sillHeight };
}

// ---------------------------------------------------------------------------
// Levels (finished floor elevations relative to grade)
// ---------------------------------------------------------------------------
const BASEMENT_EL = -2.3;
const BASEMENT_CEIL = 2.3;
const GROUND_EL = 0.3;
const GROUND_CEIL = 2.75; // 9'-0"
const SECOND_EL = 3.35;
const SECOND_CEIL = 2.45; // 8'-0"
const FLOOR_T = 0.3;

// ---------------------------------------------------------------------------
// Basement
// ---------------------------------------------------------------------------
const basementWallH = BASEMENT_CEIL + FLOOR_T; // foundation rises to underside of ground floor finish
const basement: Floor = {
  id: "basement",
  name: "Basement",
  shortName: "B",
  elevation: BASEMENT_EL,
  ceilingHeight: BASEMENT_CEIL,
  floorThickness: 0.1,
  belowGrade: true,
  footprint: [p(0, 0), p(12.8, 0), p(12.8, 11), p(6.1, 11), p(6.1, 5.8), p(0, 5.8)],
  rooms: [
    room("b-rec", "Unfinished Basement", [p(0, 0), p(12.8, 0), p(12.8, 7.6), p(10.2, 7.6), p(10.2, 11), p(6.1, 11), p(6.1, 5.8), p(0, 5.8)], "concrete"),
    room("b-mech", "Mechanical", rect(10.2, 7.6, 12.8, 11), "concrete"),
  ],
  walls: [
    wall("B-E1", 0, 0, 12.8, 0, basementWallH, { exterior: true, cladding: "foundation", thickness: FDN_T }),
    wall("B-E2", 12.8, 0, 12.8, 11, basementWallH, { exterior: true, cladding: "foundation", thickness: FDN_T }),
    wall("B-E3", 12.8, 11, 6.1, 11, basementWallH, { exterior: true, cladding: "foundation", thickness: FDN_T }),
    wall("B-E4", 6.1, 11, 6.1, 5.8, basementWallH, { exterior: true, cladding: "foundation", thickness: FDN_T }),
    wall("B-E5", 6.1, 5.8, 0, 5.8, basementWallH, { exterior: true, cladding: "foundation", thickness: FDN_T }),
    wall("B-E6", 0, 5.8, 0, 0, basementWallH, { exterior: true, cladding: "foundation", thickness: FDN_T }),
    wall("B-I1", 10.2, 7.6, 12.8, 7.6, BASEMENT_CEIL),
    wall("B-I2", 10.2, 7.6, 10.2, 11, BASEMENT_CEIL),
  ],
  doors: [door("b-d-mech", "B-I1", 1.0, 0.81)],
  windows: [],
  fixtures: [
    { id: "b-stair", kind: "stair", x: 9.0, y: 6.0, width: 1.0, depth: 3.5, height: 2.6, rise: 2.6, direction: "+y" },
    { id: "b-furnace", kind: "appliance", x: 11.7, y: 9.9, width: 0.7, depth: 0.7, height: 1.5 },
    { id: "b-hwt", kind: "appliance", x: 10.8, y: 10.1, width: 0.55, depth: 0.55, height: 1.5 },
  ],
};

// ---------------------------------------------------------------------------
// Ground floor
// ---------------------------------------------------------------------------
const gExtH = GROUND_CEIL + FLOOR_T; // exterior walls run floor-to-floor, covering the rim joist
const ground: Floor = {
  id: "ground",
  name: "Main Floor",
  shortName: "1",
  elevation: GROUND_EL,
  ceilingHeight: GROUND_CEIL,
  floorThickness: FLOOR_T,
  footprint: [p(0, 0), p(12.8, 0), p(12.8, 11), p(6.1, 11), p(6.1, 13), p(0, 13)],
  rooms: [
    room("g-great", "Great Room", rect(0, 0, 6.1, 5.8)),
    room("g-kitchen", "Kitchen", rect(6.1, 0, 10.0, 5.8)),
    room("g-dining", "Dining", rect(10.0, 0, 12.8, 5.8)),
    room("g-hall", "Hall", rect(7.6, 5.8, 10.0, 7.4)),
    room("g-powder", "Powder", rect(6.1, 5.8, 7.6, 7.4), "tile"),
    room("g-pantry", "Pantry", rect(10.0, 5.8, 12.8, 7.4)),
    room("g-foyer", "Foyer", rect(6.1, 7.4, 10.0, 11), "tile"),
    room("g-den", "Den", rect(10.0, 7.4, 12.8, 11)),
    room("g-garage", "Garage", rect(0, 5.8, 6.1, 13), "garage"),
  ],
  walls: [
    wall("G-E1", 0, 0, 12.8, 0, gExtH, { exterior: true, cladding: "brick" }),
    wall("G-E2", 12.8, 0, 12.8, 11, gExtH, { exterior: true, cladding: "brick" }),
    wall("G-E3", 12.8, 11, 6.1, 11, gExtH, { exterior: true, cladding: "stone" }),
    wall("G-E4", 6.1, 11, 6.1, 13, gExtH, { exterior: true, cladding: "stone" }),
    wall("G-E5", 6.1, 13, 0, 13, gExtH, { exterior: true, cladding: "stone" }),
    wall("G-E6", 0, 13, 0, 0, gExtH, { exterior: true, cladding: "brick" }),
    wall("G-I1", 0, 5.8, 6.1, 5.8, GROUND_CEIL),
    wall("G-I2", 6.1, 5.8, 6.1, 11, GROUND_CEIL),
    wall("G-I3", 7.6, 5.8, 7.6, 7.4, GROUND_CEIL),
    wall("G-I4", 6.1, 7.4, 7.6, 7.4, GROUND_CEIL),
    wall("G-I5", 10.0, 5.8, 10.0, 11, GROUND_CEIL),
    wall("G-I6", 10.0, 7.4, 12.8, 7.4, GROUND_CEIL),
    wall("G-I7", 10.0, 5.8, 12.8, 5.8, GROUND_CEIL),
  ],
  doors: [
    door("g-d-front", "G-E3", 5.0, 0.95, 2.3, "front"),
    door("g-d-garage", "G-E5", 3.05, 4.88, 2.13, "garage"),
    door("g-d-patio", "G-E1", 3.0, 1.83, 2.2, "patio"),
    door("g-d-mud", "G-I2", 2.6, 0.86, 2.03, "interior"),
    door("g-d-powder", "G-I4", 0.75, 0.71),
    door("g-d-den", "G-I5", 4.7, 0.81),
    door("g-d-pantry", "G-I7", 1.4, 0.76),
  ],
  windows: [
    win("g-w-great-r", "G-E1", 5.0, 1.2, 1.6, 0.8),
    win("g-w-kitchen", "G-E1", 8.0, 1.6, 1.1, 1.15),
    win("g-w-dining-r", "G-E1", 11.4, 1.8, 1.8, 0.6),
    win("g-w-dining-s", "G-E2", 3.0, 1.2, 1.8, 0.6),
    win("g-w-den-s", "G-E2", 9.2, 1.4, 1.6, 0.8),
    win("g-w-den-f", "G-E3", 1.4, 1.8, 1.9, 0.5),
    win("g-w-garage", "G-E6", 3.5, 0.9, 0.9, 1.3),
    win("g-w-great-s", "G-E6", 10.0, 1.6, 1.6, 0.8),
  ],
  fixtures: [
    { id: "g-base", kind: "base-cabinets", x: 6.3, y: 0.15, width: 2.8, depth: 0.62, height: 0.92 },
    { id: "g-upper", kind: "upper-cabinets", x: 6.3, y: 0.15, width: 0.9, depth: 0.35, height: 0.75, baseOffset: 1.45 },
    { id: "g-fridge", kind: "appliance", x: 9.1, y: 0.15, width: 0.9, depth: 0.75, height: 1.85 },
    { id: "g-island", kind: "island", x: 7.0, y: 2.5, width: 2.4, depth: 1.0, height: 0.92 },
    { id: "g-stair", kind: "stair", x: 9.0, y: 6.0, width: 1.0, depth: 4.0, height: SECOND_EL - GROUND_EL, rise: SECOND_EL - GROUND_EL, direction: "+y" },
    { id: "g-porch", kind: "porch", x: 6.25, y: 11.15, width: 3.15, depth: 1.45, height: GROUND_EL, baseOffset: -GROUND_EL },
    { id: "g-porch-col", kind: "column", x: 9.12, y: 12.25, width: 0.2, depth: 0.2, height: gExtH },
  ],
};

// ---------------------------------------------------------------------------
// Second floor
// ---------------------------------------------------------------------------
const second: Floor = {
  id: "second",
  name: "Second Floor",
  shortName: "2",
  elevation: SECOND_EL,
  ceilingHeight: SECOND_CEIL,
  floorThickness: FLOOR_T,
  footprint: rect(0, 0, 12.8, 11),
  slabOpenings: [rect(9.0, 6.0, 10.0, 10.0)],
  rooms: [
    room("s-bed3", "Bedroom 3", rect(0, 0, 4.2, 4.4)),
    room("s-bath", "Bathroom", rect(0, 4.4, 4.2, 6.6), "tile"),
    room("s-bed2", "Bedroom 2", rect(0, 6.6, 4.2, 11)),
    room("s-laundry", "Laundry", rect(4.2, 0, 6.6, 2.2), "tile"),
    room("s-primary", "Primary Bedroom", rect(6.6, 0, 12.8, 5.2)),
    room("s-ensuite", "Ensuite", rect(10.0, 5.2, 12.8, 8.4), "tile"),
    room("s-wic", "Walk-in Closet", rect(10.0, 8.4, 12.8, 11)),
    room("s-hall", "Hall", [p(4.2, 2.2), p(6.6, 2.2), p(6.6, 5.2), p(10.0, 5.2), p(10.0, 11), p(4.2, 11)]),
  ],
  walls: [
    wall("S-E1", 0, 0, 12.8, 0, SECOND_CEIL, { exterior: true, cladding: "siding" }),
    wall("S-E2", 12.8, 0, 12.8, 11, SECOND_CEIL, { exterior: true, cladding: "siding" }),
    wall("S-E3", 12.8, 11, 0, 11, SECOND_CEIL, { exterior: true, cladding: "brick" }),
    wall("S-E4", 0, 11, 0, 0, SECOND_CEIL, { exterior: true, cladding: "siding" }),
    wall("S-I1", 4.2, 0, 4.2, 11, SECOND_CEIL),
    wall("S-I2", 0, 4.4, 4.2, 4.4, SECOND_CEIL),
    wall("S-I3", 0, 6.6, 4.2, 6.6, SECOND_CEIL),
    wall("S-I4", 4.2, 2.2, 6.6, 2.2, SECOND_CEIL),
    wall("S-I5", 6.6, 0, 6.6, 5.2, SECOND_CEIL),
    wall("S-I6", 6.6, 5.2, 10.0, 5.2, SECOND_CEIL),
    wall("S-I7", 10.0, 5.2, 10.0, 11, SECOND_CEIL),
    wall("S-I8", 10.0, 5.2, 12.8, 5.2, SECOND_CEIL),
    wall("S-I9", 10.0, 8.4, 12.8, 8.4, SECOND_CEIL),
  ],
  doors: [
    door("s-d-bed3", "S-I1", 3.4, 0.81),
    door("s-d-bath", "S-I1", 5.5, 0.76),
    door("s-d-bed2", "S-I1", 7.6, 0.81),
    door("s-d-laundry", "S-I4", 1.2, 0.76),
    door("s-d-primary", "S-I6", 1.3, 0.86),
    door("s-d-ensuite", "S-I8", 1.0, 0.76),
    door("s-d-wic", "S-I9", 1.4, 0.76),
  ],
  windows: [
    win("s-w-bed3-r", "S-E1", 2.1, 1.4, 1.35, 0.75),
    win("s-w-laundry", "S-E1", 5.4, 0.8, 0.9, 1.2),
    win("s-w-prim-r1", "S-E1", 8.5, 1.8, 1.35, 0.75),
    win("s-w-prim-r2", "S-E1", 11.4, 1.2, 1.35, 0.75),
    win("s-w-prim-s", "S-E2", 2.6, 1.4, 1.35, 0.75),
    win("s-w-ensuite", "S-E2", 6.8, 0.9, 0.8, 1.3),
    win("s-w-wic", "S-E3", 1.4, 0.8, 0.9, 1.2),
    win("s-w-hall", "S-E3", 5.2, 1.6, 1.35, 0.75),
    win("s-w-bed2-f", "S-E3", 10.7, 1.6, 1.35, 0.75),
    win("s-w-bed2-s", "S-E4", 2.2, 1.2, 1.35, 0.75),
    win("s-w-bath", "S-E4", 5.5, 0.7, 0.6, 1.4),
    win("s-w-bed3-s", "S-E4", 8.8, 1.2, 1.35, 0.75),
  ],
};

export const PLAN_36: HouseModel = {
  id: "plan-36",
  projectId: "bradley-ridge-42",
  name: "Plan 36",
  floors: [basement, ground, second],
  exterior: {
    roofs: [
      { id: "roof-main", name: "Main Roof", type: "hip", baseFloorId: "second", x: 0, y: 0, width: 12.8, depth: 11, pitch: 7 / 12, overhang: 0.45 },
      { id: "roof-garage", name: "Garage Roof", type: "shed", baseFloorId: "ground", x: 0, y: 11, width: 6.1, depth: 2, pitch: 4 / 12, overhang: 0.35, highSide: "-y" },
      { id: "roof-porch", name: "Porch Roof", type: "shed", baseFloorId: "ground", x: 6.1, y: 11, width: 3.4, depth: 1.6, pitch: 4 / 12, overhang: 0.25, highSide: "-y" },
    ],
    drivewayStart: p(3.05, 13),
    drivewayWidth: 5.6,
  },
  provenance: {
    source: "demo-seed",
    confidence: 1,
    notes: [
      "Fictional demonstration plan — not derived from uploaded drawings.",
      "Dimensions are approximate and for visualization only.",
    ],
  },
};
