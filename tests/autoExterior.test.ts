import { describe, expect, it } from "vitest";
import { FRONT_GABLE_PITCH, findPorch, generateAutoRoofs, MAIN_PITCH, porchFixtures } from "@/lib/models/autoExterior";
import type { Floor, Point2D, Wall } from "@/lib/models/house";

const rect = (x0: number, y0: number, x1: number, y1: number): Point2D[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const floor = (id: string, elevation: number, footprint: Point2D[], extra: Partial<Floor> = {}): Floor => ({
  id,
  name: id,
  elevation,
  ceilingHeight: 2.75,
  footprint,
  rooms: [],
  walls: [{ id: `${id}-w`, start: footprint[0], end: footprint[1], thickness: 0.2, height: 3, exterior: true } as Wall],
  doors: [],
  windows: [],
  ...extra,
});

// A 9 m × 11 m house (+y toward the street): the second floor has a 4 m-wide
// bay projecting 1.5 m toward the street; the ground floor's garage (right)
// projects 2.5 m beyond the second floor.
const secondFp: Point2D[] = [
  { x: 0, y: 0 },
  { x: 9, y: 0 },
  { x: 9, y: 9 },
  { x: 4, y: 9 },
  { x: 4, y: 10.5 },
  { x: 0, y: 10.5 },
];
const groundFp: Point2D[] = [
  { x: 0, y: 0 },
  { x: 9, y: 0 },
  { x: 9, y: 11.5 },
  { x: 5.5, y: 11.5 },
  { x: 5.5, y: 9.5 },
  { x: 4, y: 9.5 },
  { x: 4, y: 10.5 },
  { x: 0, y: 10.5 },
];

describe("auto roofs", () => {
  const ground = floor("ground", 0.3, groundFp);
  const second = floor("second", 3.35, secondFp);
  const roofs = generateAutoRoofs([floor("basement", -2.3, rect(0, 0, 9, 11), { belowGrade: true }), ground, second]);

  it("puts a hip on the main body and a steep street-facing gable on the projecting bay", () => {
    const top = roofs.filter((r) => r.baseFloorId === "second");
    const hip = top.find((r) => r.type === "hip")!;
    expect(hip.pitch).toBe(MAIN_PITCH);
    expect(hip.width * hip.depth).toBeGreaterThan(60);
    const gable = top.find((r) => r.type === "gable")!;
    expect(gable.pitch).toBe(FRONT_GABLE_PITCH);
    expect(gable.ridgeAxis).toBe("y");
    // Covers the bay to its front face, and runs back into the main roof.
    expect(gable.x).toBeCloseTo(0, 1);
    expect(gable.width).toBeCloseTo(4, 1);
    expect(gable.y + gable.depth).toBeCloseTo(10.5, 1);
    expect(gable.y).toBeLessThan(9);
  });

  it("roofs the part of the garage the second floor doesn't cover, sloping off the taller wall", () => {
    const lower = roofs.filter((r) => r.baseFloorId === "ground");
    const garage = lower.find((r) => r.x >= 5.4 && r.y >= 8.9)!;
    expect(garage).toBeDefined();
    expect(garage.type).toBe("shed");
    expect(garage.highSide).toBe("-y");
    expect(garage.y + garage.depth).toBeCloseTo(11.5, 1);
  });

  it("never roofs a basement", () => {
    expect(roofs.some((r) => r.baseFloorId === "basement")).toBe(false);
  });
});

describe("front porch", () => {
  // Front door on the recessed wall at y = 9.5 between the bay (x < 4) and the garage (x > 5.5).
  const doorWall: Wall = { id: "door-wall", start: { x: 4, y: 9.5 }, end: { x: 5.5, y: 9.5 }, thickness: 0.2, height: 3, exterior: true } as Wall;
  // The recess's side walls: the bay (x = 4) and the garage (x = 5.5).
  const bayWall: Wall = { id: "bay", start: { x: 4, y: 9.5 }, end: { x: 4, y: 10.5 }, thickness: 0.2, height: 3, exterior: true } as Wall;
  const garageWall: Wall = { id: "garage", start: { x: 5.5, y: 9.5 }, end: { x: 5.5, y: 11.5 }, thickness: 0.2, height: 3, exterior: true } as Wall;
  const ground = floor("ground", 0.3, groundFp, { walls: [doorWall, bayWall, garageWall], doors: [{ id: "d", wallId: "door-wall", position: 0.75, width: 0.9, height: 2.3, kind: "front" }] });
  const second = floor("second", 3.35, secondFp);

  it("fills the recess at the front door, with columns at the open corners", () => {
    const porch = findPorch(ground, second)!;
    expect(porch.rect.x0).toBeCloseTo(4, 0);
    expect(porch.rect.x1).toBeCloseTo(5.5, 0);
    expect(porch.rect.y1).toBeGreaterThan(11.5);
    const fx = porchFixtures(ground, porch);
    expect(fx.filter((f) => f.kind === "column")).toHaveLength(2);
    const slab = fx.find((f) => f.kind === "porch")!;
    expect(slab.height).toBeCloseTo(0.3);
    expect(slab.baseOffset).toBeCloseTo(-0.3);
  });

  it("adds a stoop when the front door is on the front wall", () => {
    const front: Wall = { id: "front", start: { x: 0, y: 10.5 }, end: { x: 4, y: 10.5 }, thickness: 0.2, height: 3, exterior: true } as Wall;
    const g = floor("ground", 0.3, rect(0, 0, 4, 10.5), { walls: [front], doors: [{ id: "d", wallId: "front", position: 2, width: 0.9, height: 2.3, kind: "front" }] });
    const porch = findPorch(g, undefined)!;
    expect(porch.rect.x1 - porch.rect.x0).toBeCloseTo(1.8);
    expect(porch.rect.y0).toBeGreaterThan(10.5);
    expect(porch.covered).toBe(false);
  });

  it("has no porch without a front door", () => {
    expect(findPorch(floor("ground", 0.3, groundFp), second)).toBeNull();
  });
});
