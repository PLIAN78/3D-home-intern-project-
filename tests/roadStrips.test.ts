import { describe, expect, it } from "vitest";
import type { Road } from "@/lib/models/community";
import { stripPieces } from "@/lib/geometry/roadStrips";

const road = (id: string, from: [number, number], to: [number, number], width = 9): Road => ({ id, from, to, width, sidewalkWidth: 1.6, boulevardWidth: 2 });

describe("sidewalks and curbs at intersections", () => {
  it("a four-way crossing cuts the strip where the other carriageway is", () => {
    const roads = [road("a", [0, 0], [100, 0]), road("b", [50, -50], [50, 50])];
    // Sidewalk band on the left of road a: 6.5 to 8.1 m across.
    const pieces = stripPieces(roads, 0, 6.5, 8.1);
    expect(pieces).toHaveLength(2);
    expect(pieces[0][0]).toBeCloseTo(0);
    expect(pieces[0][1]).toBeCloseTo(45.5);
    expect(pieces[1][0]).toBeCloseTo(54.5);
    expect(pieces[1][1]).toBeCloseTo(100);
  });

  it("a road ending at a T stops its sidewalk at the through street's asphalt", () => {
    const roads = [road("through", [0, 0], [100, 0]), road("side", [50, 0], [50, 60])];
    const right = stripPieces(roads, 1, -8.1, -6.5);
    expect(right).toHaveLength(1);
    expect(right[0][0]).toBeCloseTo(4.5);
    expect(right[0][1]).toBeCloseTo(60);
    // The through street's sidewalk on the side road's side (its left, +z) has a gap; the far side is untouched.
    const far = stripPieces(roads, 0, -8.1, -6.5);
    const near = stripPieces(roads, 0, 6.5, 8.1);
    expect(far).toEqual([[0, 100]]);
    expect(near).toHaveLength(2);
  });

  it("parallel streets never cut each other", () => {
    const roads = [road("a", [0, 0], [100, 0]), road("b", [0, 5], [100, 5])];
    expect(stripPieces(roads, 0, 6.5, 8.1)).toEqual([[0, 100]]);
  });

  it("a diagonal crossing cuts a wider gap", () => {
    const roads = [road("a", [0, 0], [100, 0]), road("b", [20, -50], [80, 50])];
    const pieces = stripPieces(roads, 0, 6.5, 8.1);
    expect(pieces).toHaveLength(2);
    expect(pieces[1][0] - pieces[0][1]).toBeGreaterThan(9);
  });
});
