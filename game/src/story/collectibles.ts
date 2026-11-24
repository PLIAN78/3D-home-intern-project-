import { LANDMARKS, PEN, type V2 } from "../world/map";

/** Lost blueprints scattered around the world. Some need a jetpack (y > 0). */
export interface Blueprint {
  id: string;
  position: [number, number, number];
  hint: string;
}

const [fx, fz] = LANDMARKS.factory.position;
const [tx, tz] = LANDMARKS.tower.position;

export const BLUEPRINTS: Blueprint[] = [
  { id: "bp-park", position: [12, 1.2, 60], hint: "by the pond" },
  { id: "bp-sales", position: [-196, 1.2, 50], hint: "behind the Sales Centre" },
  { id: "bp-ridge-w", position: [-118, 1.2, -150], hint: "Founders Way" },
  { id: "bp-maple-e", position: [118, 1.2, 152], hint: "Quarry Lane" },
  { id: "bp-woods-n", position: [40, 1.2, -205], hint: "north woods" },
  { id: "bp-woods-s", position: [-285, 1.2, 205], hint: "south-west woods" },
  { id: "bp-farm", position: [-350, 1.2, -95], hint: "goat farm" },
  { id: "bp-east", position: [400, 1.2, 30], hint: "far east field" },
  { id: "bp-west", position: [-405, 1.2, 40], hint: "far west field" },
  { id: "bp-factory-roof", position: [fx + 18, 14.5, fz], hint: "on the factory roof" },
  { id: "bp-tower", position: [tx, 14, tz], hint: "inside the water-tower legs" },
  { id: "bp-sky", position: [0, 26, 120], hint: "floating over Maple Run" },
];

/** Runaway goats: where they start wandering. */
export const GOAT_STARTS: { id: string; name: string; position: V2 }[] = [
  { id: "goat-pepper", name: "Pepper", position: [-60, 72] },
  { id: "goat-clover", name: "Clover", position: [150, -110] },
  { id: "goat-noodle", name: "Noodle", position: [-250, 160] },
];

export function inPen(x: number, z: number) {
  return Math.abs(x - PEN.centre[0]) < PEN.half && Math.abs(z - PEN.centre[1]) < PEN.half;
}
