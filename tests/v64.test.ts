import { beforeAll, describe, expect, it } from "vitest";
import { loadRapier } from "../game/src/sim/rapier";
import { IDLE_INPUT, Simulation, type SimInput } from "../game/src/sim/simulation";
import { SWIM } from "../game/src/sim/character";
import { CAIVAN_RIDGE, collisionBoxes, STARTING_STAGES } from "../game/src/world/map";
import { BLUEPRINTS } from "../game/src/story/collectibles";
import { BRIDGES, BRIDGEHEAD_STUB, NORTH_ROADS, NORTH_SHORE_Z, SUBURB_ROADS, STATION_ACCESS, distanceToSegment, riverfrontZ, riverZ, riverWidth, type Point } from "../game/src/world/v6";
import { HERON_BRIDGE_ROAD, QUARRY_BRIDGE_ROAD, LAKE_Y, terrainHeight, inLake, DOCK_LAND } from "../game/src/world/terrain";
import {
  CAMPUS_BUILDINGS, CAMPUS_ROADS, CAMPUS_WALKWAYS, COLUMBIA_Z, LAUREL_CREEK, CREEK_WIDTH, PONDS, RING_POINTS, RING_RESERVE, SKYBRIDGES, inWing, toWing, wingCorners, type CampusWing,
} from "../game/src/world/campus";
import { CAMPUS_TREES } from "../game/src/world/v6";
import { HERON_FIELDS_X, MEADOW_LOTS, MEADOW_ROADS, MEADOW_Z } from "../game/src/world/meadows";
import { BAY_OUTLINE, bayDistance, inBay } from "../game/src/world/bay";
import { SHORES } from "../game/src/world/shoreline";
import { isPaved, paveEdgeZ } from "../game/src/world/paving";

beforeAll(async () => { await loadRapier(); });
const runSim = (s: Simulation, seconds: number, input: Partial<SimInput> = {}, each?: () => void) => { for (let i = 0; i < Math.round(seconds * 60); i++) { s.fixedStep({ ...IDLE_INPUT, ...input }); each?.(); } };
const reserve = (r: { width: number; sidewalkWidth: number; boulevardWidth: number }) => r.width / 2 + r.boulevardWidth + r.sidewalkWidth;
const onRoadGap = (x: number, z: number, roads = SUBURB_ROADS) => Math.min(...roads.map((r) => distanceToSegment(x, z, r.from, r.to) - reserve(r)));
/** Points around a wing's walls, every metre or so. */
function edge(w: CampusWing, pad = 0): Point[] {
  const out: Point[] = [], c = wingCorners({ ...w, w: w.w + pad * 2, d: w.d + pad * 2 });
  for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])); for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); }
  return out;
}

describe("v6.4 bridgeheads and helipad", () => {
  it("runs each north bridgehead from the bridge road's end all the way to the riverfront street", () => {
    for (const [road, b] of [[HERON_BRIDGE_ROAD, BRIDGES[0]], [QUARRY_BRIDGE_ROAD, BRIDGES[1]]] as const) {
      const stub = NORTH_ROADS.find((r) => r.id === "bridgehead-" + b.x)!;
      const end = road.points.at(-1)!;
      expect(stub.from[0]).toBe(end[0]);
      expect(stub.from[1]).toBeCloseTo(end[1], 6);
      expect(stub.from[1]).toBeCloseTo(NORTH_SHORE_Z(b.x) + BRIDGEHEAD_STUB, 6);
      // It reaches the riverfront's centre line (it used to stop short, leaving grass between them at Heron Bridge).
      expect(stub.to[1]).toBeCloseTo(riverfrontZ(b.x), 6);
      const front = NORTH_ROADS.filter((r) => r.id.startsWith("riverfront-"));
      expect(Math.min(...front.map((r) => distanceToSegment(stub.to[0], stub.to[1], r.from, r.to)))).toBeLessThan(0.01);
    }
  });
});

describe("v6.4 University of Vataloo, rebuilt from the campus map", () => {
  const all = CAMPUS_BUILDINGS.flatMap((b) => b.wings.map((w) => ({ b, w })));
  it("has the map's buildings, north to south as on the map", () => {
    const codes = CAMPUS_BUILDINGS.map((b) => b.code);
    for (const c of ["MC", "DC", "C2", "ESC", "EIT", "PHY", "E2", "E3", "E5", "E6", "E7", "CPH", "RCH", "DWE", "B1", "B2", "STC", "QNC", "SLC", "PAC", "UC", "AHS", "BMH", "LHI", "M3", "ERC", "CSB", "GSC", "COM", "EC2", "EC4", "ECH", "NH", "LIB", "GH", "SCH", "ML", "AL", "TC", "EV1", "EV2", "EV3", "HH", "PAS"]) expect(codes, c).toContain(c);
    const at = (code: string) => CAMPUS_BUILDINGS.find((b) => b.code === code)!.at;
    // North to south down the middle of the map.
    for (const [a, b] of [["COM", "DC"], ["M3", "MC"], ["MC", "QNC"], ["QNC", "STC"], ["STC", "NH"], ["DC", "E3"], ["E3", "E2"], ["E2", "DWE"], ["LIB", "AL"], ["AL", "HH"], ["HH", "PAS"], ["PAC", "SLC"]]) expect(at(a)[1], a + " north of " + b).toBeLessThan(at(b)[1]);
    // West to east.
    for (const [a, b] of [["UC", "PAC"], ["PAC", "MC"], ["MC", "DC"], ["DC", "E7"], ["NH", "LIB"], ["ML", "AL"], ["EIT", "E3"], ["PHY", "E2"], ["E2", "CPH"]]) expect(at(a)[0], a + " west of " + b).toBeLessThan(at(b)[0]);
    // The lesson, principal and co-op buildings keep their ids.
    for (const id of ["porter", "davis", "math", "qnc", "engineering", "engineering-5", "principal", "business", "gym", "cafeteria", "science", "arts"]) expect(CAMPUS_BUILDINGS.some((b) => b.id === id), id).toBe(true);
  });

  it("turns the buildings like the map, keeps them apart and off every road", () => {
    expect(CAMPUS_BUILDINGS.filter((b) => Math.abs(b.rot) > 0.3).length).toBeGreaterThan(30);
    for (const { b, w } of all) {
      for (const p of edge(w)) expect(onRoadGap(p[0], p[1]), b.code).toBeGreaterThan(1);
      for (const o of all) if (o.b !== b) for (const p of edge(w)) expect(inWing(p[0], p[1], o.w, 2), b.code + "/" + o.b.code).toBe(false);
    }
  });

  it("closes Ring Road, links it to Columbia Street and University Avenue, and carries Columbia on to South Commons", () => {
    const ring = CAMPUS_ROADS.filter((r) => r.id.startsWith("vataloo-ring"));
    expect(ring.length).toBe(RING_POINTS.length);
    ring.forEach((r, i) => expect(r.to).toEqual(ring[(i + 1) % ring.length].from));
    const ringGap = (p: Point) => Math.min(...ring.map((r) => distanceToSegment(p[0], p[1], r.from, r.to)));
    for (const id of ["hagey-boulevard", "ring-link-north"]) {
      const l = CAMPUS_ROADS.find((r) => r.id === id)!;
      expect(l.from[1]).toBe(COLUMBIA_Z);
      expect(ringGap(l.to), id).toBeLessThan(0.5);
    }
    const link = CAMPUS_ROADS.find((r) => r.id === "university-ring-link")!;
    expect(ringGap(link.to)).toBeLessThan(0.5);
    const columbia = CAMPUS_ROADS.find((r) => r.id === "columbia-street")!;
    const avenue = SUBURB_ROADS.find((r) => r.id === "south-avenue")!;
    // The two roads by University Station are one street now.
    expect(columbia.from).toEqual(avenue.to);
    expect(columbia.from[1]).toBe(COLUMBIA_Z);
    // University Station's path ends on Ring Road's outer sidewalk.
    const uni = STATION_ACCESS.find((a) => a.id === "university")!, end = uni.path.at(-1)!;
    expect(ringGap(end)).toBeGreaterThan(RING_RESERVE - 1.7);
    expect(ringGap(end)).toBeLessThan(RING_RESERVE + 0.5);
  });

  it("gives every building a door with a path, and keeps the paths off buildings and carriageways", () => {
    for (const b of CAMPUS_BUILDINGS) {
      const own = b.wings[0], [lx, lz] = toWing(b.door[0], b.door[1], own);
      // The door is on a wall of the main wing (just outside it).
      expect(Math.max(Math.abs(lx) - own.w / 2, Math.abs(lz) - own.d / 2), b.code).toBeGreaterThan(0);
      expect(Math.max(Math.abs(lx) - own.w / 2, Math.abs(lz) - own.d / 2), b.code).toBeLessThan(0.6);
      expect(CAMPUS_WALKWAYS.some((w) => Math.hypot(w.points[0][0] - b.door[0], w.points[0][1] - b.door[1]) < 0.01), b.code).toBe(true);
    }
    for (const w of CAMPUS_WALKWAYS) for (let k = 0; k < w.points.length - 1; k++) {
      const [a, c] = [w.points[k], w.points[k + 1]], n = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1])));
      for (let i = 0; i <= n; i++) {
        const x = a[0] + ((c[0] - a[0]) * i) / n, z = a[1] + ((c[1] - a[1]) * i) / n;
        const fromDoor = Math.hypot(x - w.points[0][0], z - w.points[0][1]);
        for (const { b, w: g } of all) if (!(w.id === "door-" + b.id && fromDoor < 3.5)) expect(inWing(x, z, g, w.width / 2 - 0.3), w.id + " through " + b.code).toBe(false);
        // Off the carriageway and boulevard (paths end on sidewalks).
        expect(Math.min(...SUBURB_ROADS.map((r) => distanceToSegment(x, z, r.from, r.to) - r.width / 2 - r.boulevardWidth)), w.id).toBeGreaterThan(-0.05);
      }
    }
  });

  it("joins buildings with skybridges, and keeps trees, the creek and the ponds clear", () => {
    expect(SKYBRIDGES.length).toBeGreaterThan(10);
    for (const s of SKYBRIDGES) for (const [end, id] of [[s.from, s.a], [s.to, s.b]] as const) {
      const b = CAMPUS_BUILDINGS.find((x) => x.id === id)!;
      expect(b.wings.some((w) => inWing(end[0], end[1], w, 0.1)), s.a + "-" + s.b).toBe(true);
    }
    for (const t of CAMPUS_TREES) {
      const [x, z] = t.position;
      expect(all.some(({ w }) => inWing(x, z, w, 3)), "tree " + t.position).toBe(false);
      expect(onRoadGap(x, z)).toBeGreaterThan(0.5);
    }
    for (const { b, w } of all) {
      for (let i = 0; i < LAUREL_CREEK.length - 1; i++) expect(distanceToSegment(w.c[0], w.c[1], LAUREL_CREEK[i], LAUREL_CREEK[i + 1]), b.code).toBeGreaterThan(Math.hypot(w.w, w.d) / 2 + CREEK_WIDTH / 2);
      for (const pond of PONDS) for (const p of pond) expect(inWing(p[0], p[1], w, 2), b.code).toBe(false);
    }
  });

  it("builds turned colliders that match the footprints", () => {
    const boxes = collisionBoxes(STARTING_STAGES).filter((b) => b.rot !== undefined && CAMPUS_BUILDINGS.some((c) => c.id === b.id));
    expect(boxes.length).toBe(all.length);
    const box = boxes.find((b) => b.id === "math")!, mc = CAMPUS_BUILDINGS.find((b) => b.id === "math")!.wings[0];
    expect(box.rot).toBeCloseTo(mc.rot, 6);
    expect(box.x1 - box.x0).toBeCloseTo(mc.w, 6);
  });
});

describe("v6.4 Heron Fields", () => {
  const west = MEADOW_LOTS.filter((l) => l.position[0] < 110);
  it("carries North Meadows' streets west to three new cross streets, lined with homes", () => {
    for (const id of ["fieldstone-west", "clover-west", "meadow-west", "heron-fields", "wren", "bluebell"]) expect(MEADOW_ROADS.some((r) => r.id === id), id).toBe(true);
    for (const id of ["fieldstone-west", "clover-west", "meadow-west"]) {
      const r = MEADOW_ROADS.find((x) => x.id === id)!;
      expect(r.from[0]).toBe(HERON_FIELDS_X.heron);
      expect(r.to[0]).toBe(110);
    }
    expect(west.length).toBeGreaterThan(120);
    // The North Meadows lots keep their ids (and so their saved stages).
    expect(MEADOW_LOTS.slice(0, 88).every((l) => l.position[0] > 110)).toBe(true);
  });

  it("keeps the homes off the streets, apart, and clear of the community's back gardens and Lake Road", () => {
    for (const l of west) {
      const [x, , z] = l.position;
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) expect(onRoadGap(x + (dx * l.width) / 2, z + (dz * l.depth) / 2), l.id).toBeGreaterThan(-0.01);
      expect(z).toBeLessThan(-173);
      expect(x).toBeGreaterThan(HERON_FIELDS_X.heron);
      expect(z).toBeGreaterThan(MEADOW_Z.meadow - 50);
    }
    const others = CAIVAN_RIDGE.lots.filter((l) => !west.includes(l));
    for (const l of west) for (const o of others) expect(Math.abs(l.position[0] - o.position[0]) >= (l.width + o.width) / 2 - 0.01 || Math.abs(l.position[2] - o.position[2]) >= (l.depth + o.depth) / 2 - 0.01, l.id + "/" + o.id).toBe(true);
    // The blueprint that used to be in the north woods is on open ground.
    const bp = BLUEPRINTS.find((b) => b.id === "bp-woods-n")!;
    expect(west.some((l) => Math.abs(bp.position[0] - l.position[0]) < l.width / 2 + 1 && Math.abs(bp.position[2] - l.position[2]) < l.depth / 2 + 1)).toBe(false);
    expect(onRoadGap(bp.position[0], bp.position[2])).toBeGreaterThan(1);
  });
});

describe("v6.4 Heron Bay and swimming", () => {
  it("floods the land south-west of the lake, west of the dock and the station", () => {
    expect(inBay(-800, -470)).toBe(true);
    expect(terrainHeight(-800, -470)).toBeLessThan(LAKE_Y - 3);
    expect(terrainHeight(-650, -420)).toBeLessThan(LAKE_Y);
    expect(inLake(-800, -470)).toBe(true);
    // The dock, Lake Road's end, Heron Lake Station and the airport stay dry.
    expect(terrainHeight(DOCK_LAND[0], DOCK_LAND[1])).toBeGreaterThan(LAKE_Y);
    const lake = STATION_ACCESS.find((a) => a.id === "lake")!;
    expect(terrainHeight(lake.lift[0], lake.lift[1])).toBeGreaterThan(LAKE_Y + 1);
    expect(bayDistance(-680, -240)).toBeLessThan(-60);
    expect(terrainHeight(-760, -330)).toBeGreaterThan(LAKE_Y);
    // It has its own shore strip.
    const bay = SHORES.filter((s) => s.id.startsWith("bay"));
    expect(bay.reduce((n, s) => n + s.points.length, 0)).toBeGreaterThan(60);
    for (const s of bay) for (const p of s.points) expect(Math.abs(terrainHeight(p[0], p[1]) - LAKE_Y)).toBeLessThan(0.05);
    expect(BAY_OUTLINE.length).toBeGreaterThan(40);
  });

  it("lets the player swim: slower than walking, no jumping, back to walking on the shore", async () => {
    const s = await Simulation.create({ stages: STARTING_STAGES, trees: [], spawn: { position: [-800, -470], heading: 0 } });
    s.teleport(-800, -470, 0);
    runSim(s, 1.5);
    expect(s.player.swimming).toBe(true);
    expect(s.player.y).toBeLessThan(LAKE_Y - 0.9);
    let top = 0, maxY = -Infinity;
    runSim(s, 3, { forward: 1, cameraYaw: Math.PI / 2, jump: true, jumpHeld: true }, () => { top = Math.max(top, s.player.speed); maxY = Math.max(maxY, s.player.y); });
    expect(top).toBeGreaterThan(SWIM.speed - 0.3);
    expect(top).toBeLessThan(SWIM.speed * 1.15);
    expect(maxY).toBeLessThan(LAKE_Y - 0.9);
    runSim(s, 2, { forward: 1, sprint: true, cameraYaw: Math.PI / 2 }, () => { top = Math.max(top, s.player.speed); });
    expect(top).toBeLessThan(SWIM.fast * 1.15);
    expect(top).toBeLessThan(4.6);
    // Swim south to the shore by the airport and climb out.
    for (let i = 0; i < 40 && s.player.swimming; i++) runSim(s, 1, { forward: 1, sprint: true, cameraYaw: Math.PI / 2 });
    runSim(s, 2, { forward: 1, cameraYaw: Math.PI / 2 });
    expect(s.player.swimming).toBe(false);
    expect(s.player.y).toBeGreaterThan(LAKE_Y);
  }, 60000);
});

describe("v6.4 paved north shore", () => {
  it("paves the dry ground north of the river, not the water, the island or the south bank", () => {
    expect(isPaved(-300, -800, 0)).toBe(true);
    expect(isPaved(700, -700, 0)).toBe(true);
    expect(isPaved(0, -400, 0)).toBe(false);
    expect(isPaved(-650, -655, 1)).toBe(false);
    expect(isPaved(0, riverZ(0), LAKE_Y - 3)).toBe(false);
    for (let x = -1000; x <= 1000; x += 50) {
      // The line runs in the river, short of the south bank.
      expect(paveEdgeZ(x)).toBeGreaterThan(riverZ(x) - riverWidth(x) / 2);
      expect(paveEdgeZ(x)).toBeLessThan(riverZ(x) + riverWidth(x) / 2 - 30);
    }
  });
});
