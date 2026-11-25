import { beforeAll, describe, expect, it } from "vitest";
import { LAKE_Y, groundAt, terrainHeight, HILL_TREES } from "../game/src/world/terrain";
import {
  STATIONS, STATION_ACCESS, STATION_PATH_WIDTH, STATION_LIFT, CAMPUS_PATHS, V6_BUILDINGS, RAIL_PATH, RAIL_Y,
  distanceToSegment, inRect, trainAt, TRAIN_PERIOD, TRAIN_COUNT, type Point,
} from "../game/src/world/v6";
import { CAIVAN_RIDGE, STARTING_STAGES, collisionBoxes } from "../game/src/world/map";
import { carriagewayClearance, railPosts, RAIL_POST_SIZE } from "../game/src/world/railPosts";
import { Simulation, IDLE_INPUT } from "../game/src/sim/simulation";
import { loadRapier } from "../game/src/sim/rapier";
import { host } from "../game/src/core/simHost";
import { runtime } from "../game/src/core/runtime";
import { useV6, v6Offer } from "../game/src/story/v6Store";

beforeAll(async () => { await loadRapier(); });

const samples = (line: Point[], step = 1) => line.slice(1).flatMap((b, i) => {
  const a = line[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  return Array.from({ length: n + 1 }, (_, k) => [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n] as Point);
});
const lotRects = CAIVAN_RIDGE.lots.map((l) => {
  const c = Math.abs(Math.cos(l.rotation[1])) > 0.5, hw = (c ? l.width : l.depth) / 2, hd = (c ? l.depth : l.width) / 2;
  return { id: l.id, x0: l.position[0] - hw, x1: l.position[0] + hw, z0: l.position[2] - hd, z1: l.position[2] + hd };
});
const rectGap = (a: { x0: number; z0: number; x1: number; z1: number }, b: typeof a) => Math.max(b.x0 - a.x1, a.x0 - b.x1, b.z0 - a.z1, a.z0 - b.z1);

describe("v6.2 station access", () => {
  it("puts every lift, pavilion and forecourt on dry, level ground clear of roads, lots and buildings", () => {
    const boxes = collisionBoxes(STARTING_STAGES).filter((b) => !b.id?.startsWith("station-") && b.id !== "rail-post" && b.h > 0.5);
    for (const a of STATION_ACCESS) {
      const f = a.forecourt;
      let lo = Infinity, hi = -Infinity;
      for (let x = f.x0; x <= f.x1; x += 1) for (let z = f.z0; z <= f.z1; z += 1) {
        const h = groundAt(x, z);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
        expect(carriagewayClearance(x, z), a.id).toBeGreaterThan(1.4);
      }
      expect(lo, a.id).toBeGreaterThan(LAKE_Y + 1);
      expect(hi - lo, a.id).toBeLessThan(0.25);
      for (const l of lotRects) expect(rectGap(f, l), `${a.id} vs ${l.id}`).toBeGreaterThan(0.5);
      for (const b of boxes) expect(rectGap(f, b), `${a.id} vs ${b.id}`).toBeGreaterThan(0.3);
      const half = STATION_LIFT.size / 2;
      for (const [dx, dz] of [[-half, -half], [half, -half], [-half, half], [half, half], [0, 0]]) expect(carriagewayClearance(a.lift[0] + dx, a.lift[1] + dz), a.id).toBeGreaterThan(2);
      expect(inRect(...a.exit, f), a.id).toBe(true);
      expect(inRect(...a.door, f), a.id).toBe(true);
    }
    // Owawa Quay used to have its lift and doors in the bridge approach.
    const owawa = STATION_ACCESS.find((a) => a.id === "owawa")!;
    expect(carriagewayClearance(...owawa.door)).toBeGreaterThan(8);
  });

  it("joins each forecourt to a street sidewalk, road shoulder or campus path without entering a carriageway", () => {
    for (const a of STATION_ACCESS) {
      expect(a.path.length, a.id).toBeGreaterThanOrEqual(2);
      const [sx, sz] = a.path[0], f = a.forecourt;
      expect(Math.min(Math.abs(sx - f.x0), Math.abs(sx - f.x1), Math.abs(sz - f.z0), Math.abs(sz - f.z1)), a.id).toBeLessThan(0.01);
      for (const line of [a.path, ...a.extra]) for (const p of samples(line)) {
        expect(carriagewayClearance(...p), a.id).toBeGreaterThan(STATION_PATH_WIDTH / 2);
        expect(groundAt(...p), a.id).toBeGreaterThan(LAKE_Y + 0.5);
        for (const l of lotRects) expect(Math.hypot(Math.max(l.x0 - p[0], 0, p[0] - l.x1), Math.max(l.z0 - p[1], 0, p[1] - l.z1)), `${a.id} vs ${l.id}`).toBeGreaterThanOrEqual(STATION_PATH_WIDTH / 2);
      }
      const end = a.path.at(-1)!;
      const onCampus = CAMPUS_PATHS.some((c) => c.slice(1).some((q, i) => distanceToSegment(end[0], end[1], c[i], q) < 1));
      expect(onCampus || carriagewayClearance(...end) < 5, a.id).toBe(true);
    }
  });

  it("keeps trees off forecourts and footpaths", () => {
    for (const t of HILL_TREES) for (const a of STATION_ACCESS) {
      expect(inRect(t.position[0], t.position[1], a.forecourt, 2)).toBe(false);
      for (const line of [a.path, ...a.extra]) expect(line.slice(1).every((q, i) => distanceToSegment(t.position[0], t.position[1], line[i], q) > 2)).toBe(true);
    }
    for (const t of CAIVAN_RIDGE.trees) for (const a of STATION_ACCESS) expect(inRect(t.position[0], t.position[1], a.forecourt, 1)).toBe(false);
  });

  it("stands rail columns clear of carriageways, forecourts and footpaths, with one near each platform end", () => {
    const posts = railPosts();
    expect(posts.length).toBeGreaterThan(40);
    for (const p of posts) {
      expect(carriagewayClearance(p.x, p.z)).toBeGreaterThan(RAIL_POST_SIZE / 2 + 1);
      expect(p.ground + p.height).toBeCloseTo(RAIL_Y - 1);
      for (const a of STATION_ACCESS) expect(inRect(p.x, p.z, a.forecourt, 0.6)).toBe(false);
      for (const b of V6_BUILDINGS) expect(Math.abs(p.x - b.at[0]) < b.size[0] / 2 && Math.abs(p.z - b.at[1]) < b.size[1] / 2).toBe(false);
    }
    for (const a of STATION_ACCESS) expect(posts.filter((p) => Math.hypot(p.x - a.at[0], p.z - a.at[1]) < 30).length, a.id).toBeGreaterThanOrEqual(1);
    // Every column stands under the track.
    for (const p of posts) expect(Math.min(...RAIL_PATH.slice(1).map((q, i) => (RAIL_PATH[i][0] === q[0] && RAIL_PATH[i][1] === q[1]) ? Infinity : distanceToSegment(p.x, p.z, RAIL_PATH[i], q)))).toBeLessThan(0.5);
  });

  it("lets a rider off in front of the doors and offers the station there", async () => {
    const sim = await Simulation.create({ stages: STARTING_STAGES, trees: [], spawn: { position: [-175, 22], heading: 0 } });
    host.sim = sim;
    try {
      for (let i = 0; i < STATIONS.length; i++) {
        let time = -1;
        for (let t = 0; t < TRAIN_PERIOD && time < 0; t += 0.5) if (trainAt(t, 0).station === i) time = t;
        expect(time, STATIONS[i].id).toBeGreaterThanOrEqual(0);
        useV6.setState({ ride: 0, time });
        useV6.getState().leaveTrain();
        expect(useV6.getState().ride).toBe(null);
        for (let k = 0; k < 60; k++) sim.step(1 / 60, IDLE_INPUT);
        const a = STATION_ACCESS[i], p = sim.player;
        expect(Math.hypot(p.x - a.exit[0], p.z - a.exit[1]), a.id).toBeLessThan(1);
        expect(Math.abs(p.y - terrainHeight(p.x, p.z)), a.id).toBeLessThan(0.6);
        Object.assign(runtime.body, { x: p.x, y: p.y, z: p.z, control: { kind: "foot" } });
        expect(v6Offer()?.text, a.id).toBe("Express rail · " + a.name);
      }
      expect(TRAIN_COUNT).toBeGreaterThan(0);
    } finally {
      host.sim = null;
    }
  });
});

import { MEADOW_LOTS, MEADOW_BUILDINGS, MEADOW_ROADS, MEADOW_PAVING } from "../game/src/world/meadows";
import { SUBURB_ROADS, NORTH_SHORE_Z } from "../game/src/world/v6";
import { LANDMARKS } from "../game/src/world/map";
import { COUNTRY_ROADS } from "../game/src/world/terrain";

describe("v6.2 North Meadows", () => {
  const rect = (l: (typeof MEADOW_LOTS)[number]) => ({ x0: l.position[0] - l.width / 2, x1: l.position[0] + l.width / 2, z0: l.position[2] - l.depth / 2, z1: l.position[2] + l.depth / 2 });
  const brect = (b: (typeof MEADOW_BUILDINGS)[number]) => ({ x0: b.at[0] - b.size[0] / 2, x1: b.at[0] + b.size[0] / 2, z0: b.at[1] - b.size[1] / 2, z1: b.at[1] + b.size[1] / 2 });
  const reserve = (r: (typeof MEADOW_ROADS)[number]) => r.width / 2 + r.boulevardWidth + r.sidewalkWidth;
  const rectRoadGap = (q: { x0: number; z0: number; x1: number; z1: number }, r: (typeof MEADOW_ROADS)[number]) => {
    // Distance from the road centreline (axis-aligned) to the rectangle, less the road reserve.
    const [a, b] = [r.from, r.to], vertical = a[0] === b[0];
    const lo = Math.min(vertical ? a[1] : a[0], vertical ? b[1] : b[0]), hi = Math.max(vertical ? a[1] : a[0], vertical ? b[1] : b[0]);
    const along = vertical ? Math.max(lo - q.z1, q.z0 - hi) : Math.max(lo - q.x1, q.x0 - hi);
    const across = vertical ? Math.max(q.x0 - a[0], a[0] - q.x1) : Math.max(q.z0 - a[1], a[1] - q.z1);
    return along > 0 ? Infinity : across - reserve(r);
  };

  it("lays out detached homes and freehold towns that never overlap each other, the streets or the mixed-use blocks", () => {
    const towns = MEADOW_LOTS.filter((l) => l.collection === "Freehold Towns"), detached = MEADOW_LOTS.filter((l) => l.collection !== "Freehold Towns");
    expect(towns.length).toBeGreaterThan(30);
    expect(detached.length).toBeGreaterThan(30);
    const all = MEADOW_LOTS.map(rect);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(rectGap(all[i], all[j]), MEADOW_LOTS[i].id + "/" + MEADOW_LOTS[j].id).toBeGreaterThanOrEqual(-1e-6);
    for (const q of all) {
      for (const r of SUBURB_ROADS) expect(rectRoadGap(q, r), r.id).toBeGreaterThanOrEqual(-1e-6);
      for (const b of MEADOW_BUILDINGS) expect(rectGap(q, brect(b))).toBeGreaterThan(5);
      for (const p of MEADOW_PAVING) expect(rectGap(q, p)).toBeGreaterThan(5);
      expect(q.z1, "stays north of the factory").toBeLessThan(LANDMARKS.factory.position[1] - LANDMARKS.factory.size[1] / 2);
    }
    // Every lot fronts a street: its front lot line is on a sidewalk edge.
    for (const l of MEADOW_LOTS) {
      const front = l.position[2] + (l.rotation[1] === 0 ? 1 : -1) * l.depth / 2;
      expect(MEADOW_ROADS.some((r) => r.from[1] === r.to[1] && Math.abs(Math.abs(front - r.from[1]) - reserve(r)) < 0.01 && l.position[0] > Math.min(r.from[0], r.to[0]) && l.position[0] < Math.max(r.from[0], r.to[0])), l.id).toBe(true);
    }
  });

  it("sets condos, shops and offices back from every street", () => {
    const kinds = new Set(MEADOW_BUILDINGS.map((b) => b.kind));
    for (const k of ["condo", "shop", "campus", "tower"] as const) expect(kinds.has(k)).toBe(true);
    for (const b of MEADOW_BUILDINGS) {
      for (const r of SUBURB_ROADS) expect(rectRoadGap(brect(b), r), b.id + " / " + r.id).toBeGreaterThan(4);
      for (const o of MEADOW_BUILDINGS) if (o !== b) expect(rectGap(brect(b), brect(o))).toBeGreaterThan(5);
    }
    // Parking courts open onto the Mill Road sidewalk.
    for (const p of MEADOW_PAVING) expect(p.x0).toBeCloseTo(330 + reserve(MEADOW_ROADS[0]) + 0.4, 0);
  });

  it("connects every street to the network and reaches the river at the centre bridge", () => {
    const ends = (r: (typeof MEADOW_ROADS)[number]) => [r.from, r.to];
    const others = [...SUBURB_ROADS, ...CAIVAN_RIDGE.roads];
    for (const r of MEADOW_ROADS) {
      const touches = ends(r).some((e) => others.some((o) => o !== r && distanceToSegment(e[0], e[1], o.from as Point, o.to as Point) < 0.01));
      expect(touches, r.id).toBe(true);
    }
    const bridgeRoad = COUNTRY_ROADS.find((r) => r.name === "Quarry Bridge")!;
    expect(bridgeRoad.points[0][0]).toBe(110);
    expect(Math.abs(bridgeRoad.points.at(-1)![1] - NORTH_SHORE_Z(110))).toBeLessThan(15);
  });
});

import { PORTS, BRIDGES, riverZ, riverWidth, islandRadius, inRiver, npcJetSki, NPC_JETSKIS, JETSKI_LOOPS } from "../game/src/world/v6";
import { JETTIES, DECK_Y, deckAt } from "../game/src/world/lake";
import { BOAT, JETSKI } from "../game/src/sim/boat";

describe("v6.2 harbour jet skis", () => {
  const sim = () => Simulation.create({ stages: STARTING_STAGES, trees: [], spawn: { position: [-790, -185], heading: 0 } });
  const run = (s: Simulation, seconds: number, input: Partial<typeof IDLE_INPUT> = {}) => { for (let i = 0; i < seconds * 60; i++) s.step(1 / 60, { ...IDLE_INPUT, ...input }); };
  const pierGap = (x: number, z: number) => Math.min(...JETTIES.map((j) => Math.hypot(Math.max(j.x0 - x, 0, x - j.x1), Math.max(j.z0 - z, 0, z - j.z1))));

  it("moors one motorboat and one jet ski at each harbour, in open water beside a pier", async () => {
    const s = await sim();
    expect(Object.keys(s.boats).sort()).toEqual(PORTS.flatMap((p) => [p.id + "-boat", p.id + "-jetski"]).sort());
    for (const p of PORTS) {
      const j = s.boats[p.id + "-jetski"];
      expect(j.spec).toBe(JETSKI);
      expect(terrainHeight(j.x, j.z), p.id).toBeLessThan(LAKE_Y - 0.4);
      const gap = pierGap(j.x, j.z);
      expect(gap, p.id).toBeGreaterThan(JETSKI.radius + 0.3);
      expect(gap, p.id).toBeLessThan(2.5);
    }
    // Lighter and quicker than the motorboat, with a smaller hull.
    expect(JETSKI.top).toBeGreaterThan(BOAT.top);
    expect(JETSKI.accel).toBeGreaterThan(BOAT.accel);
    expect(JETSKI.turn).toBeGreaterThan(BOAT.turn);
    expect(JETSKI.halfLength * 2).toBeLessThan(3.5);
  });

  it("boards each jet ski from its pier, drives it on the water and steps back onto the pier", async () => {
    const s = await sim();
    for (const p of PORTS) {
      const id = p.id + "-jetski", j = s.boats[id], start = { x: j.x, z: j.z, heading: j.heading };
      const spot = JETTIES.map((q) => ({ x: Math.max(q.x0 + 0.3, Math.min(q.x1 - 0.3, j.x)), z: Math.max(q.z0 + 0.3, Math.min(q.z1 - 0.3, j.z)) }))
        .sort((a, b) => Math.hypot(a.x - j.x, a.z - j.z) - Math.hypot(b.x - j.x, b.z - j.z))[0];
      s.control = { kind: "foot" }; s.player.setActive(true);
      s.teleport(spot.x, spot.z, DECK_Y - terrainHeight(spot.x, spot.z));
      run(s, 0.2);
      const near = s.nearestRide((r) => r.kind === "boat");
      expect(near?.kind === "boat" && near.id, id).toBe(id);
      expect(s.board({ kind: "boat", id })).toBe(true);
      // Leaving at once puts you back on the pier (or the bank), on your feet.
      expect(s.exit(), id).toBe(true);
      expect(s.control.kind).toBe("foot");
      const footing = deckAt(s.player.x, s.player.z) ?? terrainHeight(s.player.x, s.player.z);
      expect(footing, id).toBeGreaterThan(LAKE_Y + 0.15);
      expect(Math.abs(s.player.y - footing), id).toBeLessThan(0.3);
      // Board again and ride: out from the pier, then a hard turn.
      expect(s.board({ kind: "boat", id })).toBe(true);
      run(s, 2.5, { forward: 1 });
      expect(j.speed, id).toBeGreaterThan(14);
      run(s, 1.5, { forward: 1, side: 1 });
      expect(Math.hypot(j.x - start.x, j.z - start.z), id).toBeGreaterThan(25);
      expect(terrainHeight(j.x, j.z), id).toBeLessThan(LAKE_Y);
      expect(Math.abs(((j.heading - start.heading + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI), id).toBeGreaterThan(0.8);
      // No stepping off into open water.
      const dry = Array.from({ length: 48 }, (_, k) => [j.x + Math.cos(k / 8) * (2 + (k % 6)), j.z + Math.sin(k / 8) * (2 + (k % 6))]).some(([x, z]) => (deckAt(x, z) ?? terrainHeight(x, z)) > LAKE_Y);
      if (!dry) { expect(s.exit(), id).toBe(false); expect(s.control.kind).toBe("boat"); }
      // Back to the mooring for the next harbour.
      s.boat.place(start.x, start.z, start.heading);
      s.exit();
    }
  });

  it("sends NPC jet-ski riders round open reaches of the river, clear of bridges, piers and the island", () => {
    expect(NPC_JETSKIS).toBe(JETSKI_LOOPS.length * 2);
    for (let i = 0; i < NPC_JETSKIS; i++) for (let t = 0; t < 120; t += 0.5) {
      const p = npcJetSki(i, t);
      expect(inRiver(p.x, p.z), `${i}@${t}`).toBe(true);
      expect(Math.abs(p.z - riverZ(p.x)), `${i}@${t}`).toBeLessThan(riverWidth(p.x) / 2 - 15);
      expect(islandRadius(p.x, p.z)).toBeGreaterThan(1.3);
      for (const b of BRIDGES) expect(Math.abs(p.x - b.x)).toBeGreaterThan(45);
      expect(pierGap(p.x, p.z)).toBeGreaterThan(40);
      expect(terrainHeight(p.x, p.z)).toBeLessThan(LAKE_Y - 1);
      const q = npcJetSki(i, t + 0.5);
      expect(Math.hypot(q.x - p.x, q.z - p.z) / 0.5).toBeLessThan(p.speed * 1.6);
    }
    // Riders on the same reach go opposite ways.
    const a = npcJetSki(0, 10), b = npcJetSki(JETSKI_LOOPS.length, 10);
    expect(a.speed).toBeGreaterThan(5);
    expect(b.speed).toBeGreaterThan(5);
  });
});

import { ISLAND_WALKS, ISLANDS, NORTH_ROADS as N_ROADS } from "../game/src/world/v6";
import { LAKE_HUTS } from "../game/src/world/lake";
import { OWAWA_ROADS } from "../game/src/world/owawa";

describe("v6.2 Heron Gardens Island walkways", () => {
  const island = ISLANDS[0];
  const surface = (x: number, z: number) => Math.max(groundAt(x, z), deckAt(x, z) ?? -Infinity);
  const islandBuildings = V6_BUILDINGS.filter((b) => b.level === "island");

  it("has a closed perimeter loop, a promenade, a cross path and spurs to every door, the harbour and the jetty", () => {
    const loop = ISLAND_WALKS.find((w) => w.id === "island-loop")!;
    expect(loop.points[0]).toEqual(loop.points.at(-1));
    for (const id of ["island-promenade", "island-cross", "island-harbour", "island-jetty"]) expect(ISLAND_WALKS.some((w) => w.id === id), id).toBe(true);
    for (const b of islandBuildings) expect(ISLAND_WALKS.some((w) => w.id === "island-door-" + b.id), b.id).toBe(true);
    // Everything joins up: each walk touches the loop or another walk that does.
    const touches = (a: (typeof ISLAND_WALKS)[number], b: (typeof ISLAND_WALKS)[number]) =>
      [a.points[0], a.points.at(-1)!].some((e) => b.points.slice(1).some((q, i) => distanceToSegment(e[0], e[1], b.points[i], q) < 0.6)) ||
      [b.points[0], b.points.at(-1)!].some((e) => a.points.slice(1).some((q, i) => distanceToSegment(e[0], e[1], a.points[i], q) < 0.6));
    const reached = new Set(["island-loop"]);
    for (let pass = 0; pass < 5; pass++) for (const w of ISLAND_WALKS) if (!reached.has(w.id) && ISLAND_WALKS.some((o) => reached.has(o.id) && touches(w, o))) reached.add(w.id);
    expect([...reached].sort()).toEqual(ISLAND_WALKS.map((w) => w.id).sort());
    // The harbour and jetty spurs end on pier decks.
    for (const id of ["island-harbour", "island-jetty"]) { const e = ISLAND_WALKS.find((w) => w.id === id)!.points.at(-1)!; expect(deckAt(e[0], e[1]), id).not.toBeNull(); }
  });

  it("keeps walkways on the island (or its piers), above the water and clear of buildings, the shack and trees", () => {
    const trees = HILL_TREES.filter((t) => Math.hypot((t.position[0] - island.at[0]) / island.rx, (t.position[1] - island.at[1]) / island.rz) < 1.4);
    expect(trees.length).toBeGreaterThan(5);
    for (const w of ISLAND_WALKS) for (const [x, z] of samples(w.points, 0.5)) {
      // On the island, its beach, or a pier deck.
      expect(Math.hypot((x - island.at[0]) / island.rx, (z - island.at[1]) / island.rz) < 1.1 || deckAt(x, z) !== null, `${w.id} ${x},${z}`).toBe(true);
      expect(surface(x, z), `${w.id} ${x},${z}`).toBeGreaterThan(LAKE_Y + 0.4);
      for (const b of islandBuildings) {
        const gap = Math.max(Math.abs(x - b.at[0]) - b.size[0] / 2, Math.abs(z - b.at[1]) - b.size[1] / 2);
        expect(gap, `${w.id} vs ${b.id}`).toBeGreaterThan(w.id === "island-door-" + b.id ? 0.2 : w.width / 2 + 0.5);
      }
      for (const h of LAKE_HUTS) expect(Math.hypot(x - h.at[0], z - h.at[1]), `${w.id} vs ${h.id}`).toBeGreaterThan(w.width / 2 + 3.6);
      for (const t of trees) expect(Math.hypot(x - t.position[0], z - t.position[1]), `${w.id} vs tree`).toBeGreaterThan(w.width / 2 + 1);
    }
  });

  it("leaves the island detached: no road or bridge reaches it", () => {
    const roads = [...CAIVAN_RIDGE.roads, ...N_ROADS, ...OWAWA_ROADS];
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const x = island.at[0] + Math.cos(a) * island.rx * 1.15, z = island.at[1] + Math.sin(a) * island.rz * 1.15;
      for (const r of roads) expect(distanceToSegment(x, z, r.from as Point, r.to as Point) - r.width / 2).toBeGreaterThan(0);
      for (const r of COUNTRY_ROADS) expect(r.nearest(x, z).d - r.width / 2).toBeGreaterThan(0);
    }
    for (const b of BRIDGES) expect(Math.abs(b.x - island.at[0])).toBeGreaterThan(island.rx + b.width);
  });
});
