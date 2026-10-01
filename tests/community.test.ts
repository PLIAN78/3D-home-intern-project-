import { describe, expect, it } from "vitest";
import { adjustPlacement } from "@/lib/community/adjustPlacement";
import { numberTownhomeUnits } from "@/lib/community/buildCommunity";
import { toLatLng, toLocal } from "@/lib/community/geo";
import { parseOverpass } from "@/lib/community/osm";
import type { ContextRoad } from "@/lib/community/siteContext";
import { normaliseStreetName } from "@/lib/community/siteContext";
import { applySimilarity, georeferenceSitePlan, type Similarity } from "@/lib/community/sitePlan/georeference";
import type { ParsedSitePlan } from "@/lib/community/sitePlan/parseSitePlan";
import { buildSiteHomes } from "@/lib/geometry/siteGeometry";
import type { Community, Lot } from "@/lib/models/community";
import { buildState, CONSTRUCTION_STAGES, demoProgress, progressPercent, type LotProgress, type StageId } from "@/lib/models/construction";

// Synthetic neighbourhood (plan metres, x east / y north) — not real data.
const ROADS: ContextRoad[] = [
  { id: 1, name: "Alder Avenue", kind: "residential", width: 8, points: [[0, 0], [400, 0]] },
  { id: 2, name: "Birch Street", kind: "residential", width: 8, points: [[0, 160], [260, 160], [400, 220]] },
  { id: 3, name: "Cedar Drive", kind: "residential", width: 8, points: [[60, -40], [60, 260]] },
  { id: 4, name: "Dogwood Lane", kind: "residential", width: 8, points: [[220, -40], [240, 260]] },
  { id: 5, name: "Elm Crescent", kind: "residential", width: 8, points: [[330, 20], [360, 80], [340, 140]] },
];

function invert(t: Similarity, X: number, Y: number): [number, number] {
  const dx = (X - t.tx) / t.s;
  const dy = (Y - t.ty) / t.s;
  const c = Math.cos(-t.theta);
  const s = Math.sin(-t.theta);
  const px = c * dx - s * dy;
  const py = s * dx + c * dy;
  return [px, -py];
}

function syntheticPlan(t: Similarity): ParsedSitePlan {
  const labelAt = (name: string, X: number, Y: number, roadDir: number) => {
    const [x, y] = invert(t, X, Y);
    return { name: name.toUpperCase(), x, y, angle: t.theta - roadDir };
  };
  const streets = [
    labelAt("Alder Avenue", 120, 0, 0),
    labelAt("Alder Avenue", 320, 0, 0),
    labelAt("Birch Street", 150, 160, 0),
    labelAt("Cedar Drive", 60, 80, Math.PI / 2),
    labelAt("Dogwood Lane", 230, 110, Math.atan2(300, 20)),
    labelAt("Elm Crescent", 345, 50, Math.atan2(60, 30)),
    // A label from a key-map inset far from where the street really is.
    labelAt("Cedar Drive", 900, -700, 0),
  ];
  return { width: 1000, height: 800, collections: [], lots: [], blocks: [], streets, addresses: [], metresPerPointHint: t.s * 1.05, title: "Synthetic" };
}

describe("site plan georeferencing", () => {
  it("recovers a known similarity transform from street labels, ignoring inset labels", () => {
    const truth: Similarity = { s: 1.25, theta: 0.3, tx: 140, ty: -60 };
    const plan = syntheticPlan(truth);
    const g = georeferenceSitePlan(plan, ROADS, { scaleHint: plan.metresPerPointHint });
    expect(g).not.toBeNull();
    expect(g!.rmsMetres).toBeLessThan(1);
    expect(g!.matchedLabels).toBe(7);
    // A page point lands where the true transform puts it (within a metre or two).
    const [x, y] = invert(truth, 200, 100);
    const [X, Y] = applySimilarity(g!.transform, x, y);
    expect(Math.hypot(X - 200, Y - 100)).toBeLessThan(2);
    const inset = g!.residuals.filter((r) => r.name === "CEDAR DRIVE").sort((a, b) => b.metres - a.metres)[0];
    expect(inset.metres).toBeGreaterThan(100);
    expect(inset.used).toBe(false);
  });

  it("needs at least three different streets to place a plan", () => {
    const plan = syntheticPlan({ s: 1, theta: 0, tx: 0, ty: 0 });
    expect(georeferenceSitePlan(plan, ROADS.slice(0, 2))).toBeNull();
  });

  it("matches abbreviated street names", () => {
    expect(normaliseStreetName("CONSERVANCY DR")).toBe(normaliseStreetName("Conservancy Drive"));
    expect(normaliseStreetName("Deciduous Cres.")).toBe(normaliseStreetName("DECIDUOUS CRESCENT"));
  });
});

describe("geo helpers", () => {
  it("round-trips lat/lng through the local tangent plane", () => {
    const origin = { lat: 45.25, lng: -75.75 };
    const p = { lat: 45.2531, lng: -75.7443 };
    const l = toLocal(origin, p);
    expect(l.x).toBeGreaterThan(0);
    expect(l.y).toBeGreaterThan(0);
    const back = toLatLng(origin, l);
    expect(back.lat).toBeCloseTo(p.lat, 6);
    expect(back.lng).toBeCloseTo(p.lng, 6);
  });

  it("parses Overpass ways into roads, buildings and green space", () => {
    const origin = { lat: 45, lng: -75 };
    const ring = (dLat: number, dLng: number) => [0, 1, 2, 3, 0].map((i) => ({ lat: 45 + dLat + (i === 1 || i === 2 ? 0.0001 : 0), lon: -75 + dLng + (i >= 2 && i < 4 ? 0.0001 : 0) }));
    const ctx = parseOverpass(origin, 500, [
      { type: "way", id: 1, tags: { highway: "residential", name: "Test Road" }, geometry: [{ lat: 45, lon: -75 }, { lat: 45.001, lon: -75 }] },
      { type: "way", id: 2, tags: { highway: "construction", construction: "residential", name: "New Street" }, geometry: [{ lat: 45, lon: -75.001 }, { lat: 45.001, lon: -75.001 }] },
      { type: "way", id: 3, tags: { building: "house", "building:levels": "2" }, geometry: ring(0.0005, 0.0005) },
      { type: "way", id: 4, tags: { leisure: "park" }, geometry: ring(-0.001, -0.001) },
    ]);
    expect(ctx.roads.map((r) => r.name)).toEqual(["Test Road", "New Street"]);
    expect(ctx.roads[0].points[1][1]).toBeCloseTo(111, -1);
    expect(ctx.buildings).toHaveLength(1);
    expect(ctx.buildings[0].height).toBeCloseTo(7.5, 1);
    expect(ctx.green).toHaveLength(1);
    expect(ctx.attribution).toContain("OpenStreetMap");
  });
});

describe("construction progress", () => {
  const p = (stage: StageId): Pick<LotProgress, "stage"> => ({ stage });

  it("weights stages into an overall percentage", () => {
    expect(progressPercent(null)).toBe(0);
    expect(progressPercent(p("reserved"))).toBeLessThan(3);
    expect(progressPercent(p("closed"))).toBe(100);
    const values = CONSTRUCTION_STAGES.map((s) => progressPercent(p(s.id)));
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it("maps stages to what the 3D site shows", () => {
    expect(buildState(p("permits"))).toBe("none");
    expect(buildState(p("excavation"))).toBe("excavation");
    expect(buildState(p("framing"))).toBe("framing");
    expect(buildState(p("drywall"))).toBe("closed-in");
    expect(buildState(p("ready"))).toBe("complete");
  });

  it("generates deterministic, clearly flagged demo progress", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const a = demoProgress("c", "lot-1", "c1", now);
    expect(a).toEqual(demoProgress("c", "lot-1", "c1", now));
    expect(a.demo).toBe(true);
    for (const d of Object.values(a.completed)) expect(d! < "2026-10-02").toBe(true);
  });
});

function lot(id: string, number: string, x: number, z: number, w: number, d: number, extra: Partial<Lot> = {}): Lot {
  return {
    id,
    number,
    position: [x, 0, z],
    rotation: [0, 0, 0],
    width: w,
    depth: d,
    frontSetback: 4,
    placeholder: { style: "classic", bodyColor: "#cccccc", roofColor: "#333333", garageSide: "left", storeys: 2 },
    polygon: [
      [x - w / 2, z - d / 2],
      [x + w / 2, z - d / 2],
      [x + w / 2, z + d / 2],
      [x - w / 2, z + d / 2],
    ],
    ...extra,
  };
}

describe("community lots", () => {
  it("numbers townhome units inside their block and drops the block outline", () => {
    const lots = [lot("lot-th-9", "TH-9", 0, 0, 30, 20, { collection: "Townhomes", status: "sold" }), lot("lot-1", "1", -10, 0, 6, 20), lot("lot-2", "2", 0, 0, 6, 20, { status: "available" }), lot("lot-1-b", "1", 100, 0, 12, 30)];
    numberTownhomeUnits(lots);
    expect(lots.map((l) => l.number).sort()).toEqual(["1", "TH-9-1", "TH-9-2"]);
    const unit = lots.find((l) => l.number === "TH-9-1")!;
    expect(unit.id).toBe("lot-th-9-1");
    expect(unit.collection).toBe("Townhomes");
    expect(unit.status).toBe("sold");
    expect(lots.find((l) => l.number === "TH-9-2")!.status).toBe("available");
  });

  it("groups unlabelled townhome rows into blocks but leaves single lots alone", () => {
    const th = { collection: "The Perfect Townhome" };
    const lots = [lot("u1", "1", 0, 0, 6, 25, th), lot("u2", "2", 6, 0, 6, 25, th), lot("u3", "3", 12, 0, 6, 25, th), lot("s18", "18", 60, 0, 12, 30, { collection: "41′ Collection" }), lot("s19", "19", 72.5, 0, 12, 30, { collection: "41′ Collection" })];
    numberTownhomeUnits(lots);
    expect(lots.map((l) => l.number)).toEqual(["B1-1", "B1-2", "B1-3", "18", "19"]);
  });

  it("builds every lot at its construction stage in a few merged meshes", () => {
    const lots = [lot("a", "1", 0, 0, 12, 30, { status: "sold" }), lot("b", "2", 15, 0, 12, 30, { status: "sold" }), lot("c", "3", 30, 0, 12, 30, { status: "sold" }), lot("d", "4", 45, 0, 12, 30, { status: "available" }), lot("e", "5", 60, 0, 12, 30, { status: "sold" })];
    const progress: Record<string, LotProgress> = {
      a: { communityId: "x", lotId: "a", stage: "excavation", completed: {}, updatedAt: "" },
      b: { communityId: "x", lotId: "b", stage: "framing", completed: {}, updatedAt: "" },
      c: { communityId: "x", lotId: "c", stage: "closed", completed: {}, updatedAt: "" },
    };
    const site = buildSiteHomes(lots, progress, "e");
    expect(site.counts).toEqual({ none: 1, excavation: 1, foundation: 0, framing: 1, "closed-in": 0, complete: 1 });
    const surfaces = new Set(site.meshes.map((m) => m.surface));
    for (const s of ["dirt", "lumber", "body", "roof"] as const) expect(surfaces.has(s)).toBe(true);
    // Merged per surface/colour: far fewer meshes than lots × parts.
    expect(site.meshes.length).toBeLessThan(15);
    site.meshes.forEach((m) => m.geometry.dispose());
  });
});

describe("placement correction", () => {
  const community = (): Community => ({
    id: "c",
    name: "Synthetic",
    lots: [lot("a", "1", 0, 0, 12, 30), lot("b", "2", 20, 0, 12, 30)],
    roads: [],
    trees: [],
    geo: {
      origin: { lat: 45, lng: -75 },
      contextKey: "k",
      bounds: { minX: -6, minZ: -15, maxX: 26, maxZ: 15 },
      sitePlan: { rmsMetres: 30, confidence: 0.2, matchedStreets: 0, method: "lot-shapes", importedAt: "" },
    },
  });

  it("moves, rotates and scales every lot about the community centre", () => {
    const c = community();
    const moved = adjustPlacement(c, { dx: 10, dz: -5, rotation: Math.PI / 2, scale: 1 });
    // Centre (10, 0): lot a is 10 m west of it. A quarter turn anticlockwise (seen from above,
    // north up) swings west to south (+z), then the shift applies.
    expect(moved.lots[0].position[0]).toBeCloseTo(20, 5);
    expect(moved.lots[0].position[2]).toBeCloseTo(5, 5);
    expect(moved.lots[0].rotation[1]).toBeCloseTo(Math.PI / 2, 5);
    expect(moved.lots[0].latLng!.lat).toBeLessThan(45);
    expect(c.lots[0].position[0]).toBe(0);
  });

  it("is undone by the opposite correction", () => {
    const c = community();
    const there = adjustPlacement(c, { dx: 25, dz: 12, rotation: 0, scale: 1.05 });
    const back = adjustPlacement(there, { dx: -25, dz: -12, rotation: 0, scale: 1 / 1.05 });
    for (let i = 0; i < c.lots.length; i++) {
      expect(back.lots[i].position[0]).toBeCloseTo(c.lots[i].position[0], 1);
      expect(back.lots[i].width).toBeCloseTo(c.lots[i].width, 1);
    }
  });
});
