import type { Box, V2 } from "./map";

/**
 * The Caivan office beside the panel factory: a single open-plan floor you can
 * walk into (with a second storey above, seen from outside). Everything here
 * is in world metres, shared by the physics (walls and furniture you bump
 * into) and the renderer, so they always line up.
 */

export const OFFICE = {
  centre: [195, -50] as V2,
  /** Footprint along x and z. */
  w: 34,
  d: 22,
  /** Ground floor clear height, and the total height with the upper storey. */
  floorH: 3.6,
  height: 8.2,
  wall: 0.3,
  /** Entrance gap in the south wall (facing the boulevard). */
  door: 3.2,
};

const [ox, oz] = OFFICE.centre;
export const OFFICE_X0 = ox - OFFICE.w / 2;
export const OFFICE_X1 = ox + OFFICE.w / 2;
export const OFFICE_Z0 = oz - OFFICE.d / 2;
export const OFFICE_Z1 = oz + OFFICE.d / 2;

/** Workstations: a desk (along x) with a chair on its south side; the player's desk is the first. */
export const DESKS: { at: V2; staff?: string }[] = [
  { at: [ox - 9, oz - 2] },
  { at: [ox - 5, oz - 2], staff: "mei" },
  { at: [ox - 1, oz - 2] },
  { at: [ox - 9, oz - 6.5], staff: "lucas" },
  { at: [ox - 5, oz - 6.5] },
  { at: [ox - 1, oz - 6.5], staff: "sofia" },
];
export const DESK_SIZE: [number, number] = [1.8, 0.8];
export const DESK_H = 0.75;

/** Where you sit at your desk, facing north (−z) at the screen. */
export const MY_SEAT = { at: [DESKS[0].at[0], DESKS[0].at[1] + 0.85] as V2, heading: -Math.PI / 2 };

/** Reception desk just inside the door; the manager's glass office in the north-east corner. */
export const RECEPTION = { at: [ox + 3.5, OFFICE_Z1 - 4] as V2, size: [3.6, 0.9] as [number, number] };
export const MANAGER_ROOM = { x0: ox + 7, z0: OFFICE_Z0 + 0.15, x1: OFFICE_X1 - 0.15, z1: oz - 1.5 };
export const MANAGER_DESK = { at: [ox + 12, oz - 7.5] as V2, size: [2.2, 0.9] as [number, number] };
export const KITCHEN = { at: [OFFICE_X0 + 2.2, OFFICE_Z1 - 4] as V2 };

export type StaffId = "jordan" | "daniel" | "mei" | "lucas" | "sofia";

export const STAFF: Record<StaffId, { name: string; role: string; at: V2; facing: number; sitting: boolean }> = {
  jordan: { name: "Jordan", role: "Reception", at: [RECEPTION.at[0], RECEPTION.at[1] - 1.1], facing: Math.PI / 2, sitting: false },
  daniel: { name: "Daniel", role: "Operations manager", at: [MANAGER_DESK.at[0], MANAGER_DESK.at[1] - 1.2], facing: Math.PI / 2, sitting: false },
  mei: { name: "Mei", role: "Estimator", at: [DESKS[1].at[0], DESKS[1].at[1] + 0.85], facing: -Math.PI / 2, sitting: true },
  lucas: { name: "Lucas", role: "Home designer", at: [DESKS[3].at[0], DESKS[3].at[1] + 0.85], facing: -Math.PI / 2, sitting: true },
  sofia: { name: "Sofia", role: "Sales", at: [DESKS[5].at[0], DESKS[5].at[1] + 0.85], facing: -Math.PI / 2, sitting: true },
};

/** Solid parts of the office for the physics: walls with a door gap, the upper storey, furniture. */
export function officeBoxes(): Box[] {
  const t = OFFICE.wall;
  const h = OFFICE.height;
  const half = OFFICE.door / 2;
  const boxes: Box[] = [
    // North, west, east walls
    { x0: OFFICE_X0, z0: OFFICE_Z0, x1: OFFICE_X1, z1: OFFICE_Z0 + t, h },
    { x0: OFFICE_X0, z0: OFFICE_Z0, x1: OFFICE_X0 + t, z1: OFFICE_Z1, h },
    { x0: OFFICE_X1 - t, z0: OFFICE_Z0, x1: OFFICE_X1, z1: OFFICE_Z1, h },
    // South wall either side of the door, and above it
    { x0: OFFICE_X0, z0: OFFICE_Z1 - t, x1: ox - half, z1: OFFICE_Z1, h },
    { x0: ox + half, z0: OFFICE_Z1 - t, x1: OFFICE_X1, z1: OFFICE_Z1, h },
    { x0: ox - half, z0: OFFICE_Z1 - t, x1: ox + half, z1: OFFICE_Z1, h: h - 2.7, y: 2.7 },
    // Ceiling and upper storey (keeps the camera and the jetpack out)
    { x0: OFFICE_X0, z0: OFFICE_Z0, x1: OFFICE_X1, z1: OFFICE_Z1, h: h - OFFICE.floorH, y: OFFICE.floorH },
  ];
  // The manager's office: glass on the south and west, with a doorway on the south.
  const m = MANAGER_ROOM;
  boxes.push({ x0: m.x0, z0: m.z0, x1: m.x0 + 0.1, z1: m.z1, h: OFFICE.floorH });
  boxes.push({ x0: m.x0, z0: m.z1 - 0.1, x1: m.x0 + 2.5, z1: m.z1, h: OFFICE.floorH });
  boxes.push({ x0: m.x0 + 3.9, z0: m.z1 - 0.1, x1: m.x1, z1: m.z1, h: OFFICE.floorH });
  const desk = (at: V2, size: [number, number]) => ({ x0: at[0] - size[0] / 2, z0: at[1] - size[1] / 2, x1: at[0] + size[0] / 2, z1: at[1] + size[1] / 2, h: DESK_H });
  for (const d of DESKS) boxes.push(desk(d.at, DESK_SIZE));
  boxes.push(desk(RECEPTION.at, RECEPTION.size));
  boxes.push(desk(MANAGER_DESK.at, MANAGER_DESK.size));
  boxes.push({ x0: KITCHEN.at[0] - 0.9, z0: KITCHEN.at[1] - 2.2, x1: KITCHEN.at[0] + 0.4, z1: KITCHEN.at[1] + 2.2, h: 0.95 });
  return boxes.map((b) => ({ ...b, kind: "landmark" as const, id: "office" }));
}

/** Is a point inside the office (for interior lighting and the HUD)? */
export function inOffice(x: number, z: number) {
  return x > OFFICE_X0 && x < OFFICE_X1 && z > OFFICE_Z0 && z < OFFICE_Z1;
}
