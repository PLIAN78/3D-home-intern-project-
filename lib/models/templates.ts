import type { Floor, HouseModel } from "./house";

const GROUND_EL = 0.3;
const FLOOR_T = 0.3;

/** Default level names/heights for a new project, bottom → top. */
export function defaultFloors(floorCount: number, hasBasement: boolean): Floor[] {
  const floors: Floor[] = [];
  const above = Math.max(1, floorCount - (hasBasement ? 1 : 0));
  if (hasBasement) {
    floors.push({ id: "basement", name: "Basement", shortName: "B", elevation: GROUND_EL - FLOOR_T - 2.3, ceilingHeight: 2.3, floorThickness: 0.1, belowGrade: true, rooms: [], walls: [], doors: [], windows: [] });
  }
  const names = ["Main Floor", "Second Floor", "Third Floor", "Fourth Floor"];
  let el = GROUND_EL;
  for (let i = 0; i < above; i++) {
    const ceiling = i === 0 ? 2.75 : 2.45;
    floors.push({ id: i === 0 ? "ground" : `level-${i + 1}`, name: names[i] ?? `Level ${i + 1}`, shortName: String(i + 1), elevation: el, ceilingHeight: ceiling, floorThickness: FLOOR_T, rooms: [], walls: [], doors: [], windows: [] });
    el += ceiling + FLOOR_T;
  }
  return floors;
}

export function blankHouseModel(id: string, projectId: string, name: string, floorCount: number, hasBasement: boolean): HouseModel {
  return {
    id,
    projectId,
    name,
    floors: defaultFloors(floorCount, hasBasement),
    exterior: { roofs: [], autoRoof: true },
    provenance: { source: "manual-trace", confidence: 0, notes: ["No geometry yet — upload a floor plan and trace it."] },
  };
}
