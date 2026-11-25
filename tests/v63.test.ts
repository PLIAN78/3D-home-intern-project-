import { describe, expect, it } from "vitest";
import { BRIDGE_ROADS, LAKE_Y, roadSurfaceAt, groundAt } from "../game/src/world/terrain";
import { SHIP_ROUTE } from "../game/src/world/v6";

describe("v6.3 bridge approaches", () => {
  it("runs every approach onto its deck with no slot or lip, on a solid abutment", () => {
    for (const road of BRIDGE_ROADS) for (const d of road.decks) for (const [end, dir] of [[d.s0, -1], [d.s1, 1]] as const) {
      // The drawn (and physical) road surface follows the profile up to the deck edge.
      for (let k = 0.5; k <= 40; k += 0.5) {
        const p = road.pointAt(end + dir * k);
        expect(Math.abs(roadSurfaceAt(p.x, p.z) - road.heightAt(end + dir * k)), `${road.name} ${k} m off the deck`).toBeLessThan(0.2);
      }
      const edge = road.pointAt(end + dir * 0.3);
      expect(d.y - groundAt(edge.x, edge.z), `${road.name} lip at the deck edge`).toBeLessThan(0.1);
      // Under the first metres of deck there is fill up to the beam under the deck, not river.
      for (let k = 0; k <= 4; k += 1) { const p = road.pointAt(end - dir * k); expect(groundAt(p.x, p.z), `${road.name} fill ${k} m in`).toBeGreaterThan(d.y - 0.95); }
      // ... and open water further out, so boats still pass under.
      const mid = road.pointAt((d.s0 + d.s1) / 2);
      expect(groundAt(mid.x, mid.z)).toBeLessThan(LAKE_Y - 1);
    }
    for (const [x, z] of SHIP_ROUTE) if (Math.abs(x) < 990) expect(groundAt(x, z)).toBeLessThan(LAKE_Y);
  });
});

import { beforeAll } from "vitest";
import { loadRapier } from "../game/src/sim/rapier";
import { IDLE_INPUT, Simulation, type SimInput } from "../game/src/sim/simulation";
import { STARTING_STAGES } from "../game/src/world/map";
import { VEHICLES, type VehicleId } from "../game/src/sim/vehicle";

beforeAll(async () => { await loadRapier(); });
const runSim = (s: Simulation, seconds: number, input: Partial<SimInput> = {}, each?: () => void) => { for (let i = 0; i < Math.round(seconds * 60); i++) { s.fixedStep({ ...IDLE_INPUT, ...input }); each?.(); } };

describe("v6.3 drifting", () => {
  // Open apron at the airport: build speed, flick the handbrake into a right turn, then hold the power.
  const drift = async (id: VehicleId) => {
    const s = await Simulation.create({ stages: STARTING_STAGES, trees: [], spawn: { position: [-875, -200], heading: 0 } });
    s.spawnVehicle(id, -870, -200, Math.PI / 2); runSim(s, 0.5); s.enterVehicle(id);
    runSim(s, 3.5, { forward: 1 });
    const v = s.vehicles[id]!; let maxSlip = 0, held = 0;
    runSim(s, 0.5, { forward: 1, side: 1, handbrake: true }, () => { maxSlip = Math.max(maxSlip, v.slip); });
    runSim(s, 2, { forward: 1, side: 0.35 }, () => { maxSlip = Math.max(maxSlip, v.slip); if (v.drifting) held += 1 / 60; });
    expect(Math.abs(v.rotation.x) + Math.abs(v.rotation.z), id + " stays upright").toBeLessThan(0.3);
    return { maxSlip, held };
  };
  it("lets light rear-drive cars hold a slide while trucks and the bus keep their grip", async () => {
    for (const id of ["coupe", "roadster", "car"] as const) {
      const d = await drift(id);
      expect(d.maxSlip, id).toBeGreaterThan(0.35);
      expect(d.maxSlip, id + " is catchable, not a spin").toBeLessThan(1.1);
      expect(d.held, id).toBeGreaterThan(0.8);
    }
    for (const id of ["bus", "hauler", "suv", "truck"] as const) expect((await drift(id)).held, id).toBeLessThan(0.2);
    expect(VEHICLES.coupe.drift).toBeGreaterThan(VEHICLES.sedan.drift);
    expect(VEHICLES.sedan.drift).toBeGreaterThan(VEHICLES.truck.drift);
    expect(VEHICLES.truck.drift).toBeGreaterThan(VEHICLES.bus.drift);
  }, 60000);
});

import { PLANE } from "../game/src/sim/plane";
import { terrainHeight } from "../game/src/world/terrain";

describe("v6.3 aircraft", () => {
  const make = () => Simulation.create({ stages: STARTING_STAGES, trees: [], spawn: { position: [-790, -185], heading: 0 } });
  it("takes off by just holding W, and climbs out on its own", async () => {
    const s = await make();
    expect(s.board({ kind: "plane", id: "trainer" })).toBe(true);
    const p = s.planes.trainer;
    let lifted = -1;
    for (let i = 0; i < 60 * 14 && lifted < 0; i++) { s.fixedStep({ ...IDLE_INPUT, forward: 1 }); if (!p.grounded) lifted = i / 60; }
    expect(lifted).toBeGreaterThan(0);
    expect(lifted).toBeLessThan(10);
    runSim(s, 5, { forward: 1 });
    expect(p.grounded).toBe(false);
    expect(p.y - terrainHeight(p.x, p.z)).toBeGreaterThan(10);
    expect(s.exit()).toBe(false);
  });
  it("backs out of a stand in reverse, steering like a car, then stops to let the pilot out", async () => {
    const s = await make();
    s.board({ kind: "plane", id: "scout" });
    const p = s.planes.scout, x0 = p.x, z0 = p.z, h0 = p.heading;
    runSim(s, 4, { forward: -1 });
    expect(p.grounded).toBe(true);
    expect(p.speed).toBeLessThan(-PLANE.reverse * 0.8);
    // Moved backwards, against the nose direction.
    expect((p.x - x0) * Math.cos(h0) + (p.z - z0) * Math.sin(h0)).toBeLessThan(-5);
    runSim(s, 1, { forward: -1, side: 1 });
    expect(p.heading).not.toBeCloseTo(h0, 2);
    runSim(s, 2, { forward: -1, handbrake: true });
    expect(Math.abs(p.speed)).toBeLessThan(0.5);
    expect(s.exit()).toBe(true);
  });
});

describe("v6.3 airport helicopter", () => {
  it("parks on the helipad, flies without being bought, and lands back for the pilot", async () => {
    const s = await Simulation.create({ stages: STARTING_STAGES, trees: [], spawn: { position: [-754.5, -127], heading: 0 } });
    const h = s.helis.airport;
    expect(h).toBeDefined();
    expect(s.heli).toBeNull();
    runSim(s, 0.3);
    const near = s.nearestRide((r) => r.kind === "heli");
    expect(near?.kind === "heli" && near.id).toBe("airport");
    expect(s.board({ kind: "heli", id: "airport" })).toBe(true);
    expect(s.focusName()).toBe("heli:airport");
    runSim(s, 3);
    runSim(s, 3, { jumpHeld: true });
    expect(h.y - terrainHeight(h.x, h.z)).toBeGreaterThan(8);
    runSim(s, 3, { forward: 1, jumpHeld: true });
    expect(h.speed).toBeGreaterThan(10);
    runSim(s, 16, { sprint: true });
    expect(h.grounded, `${h.y} over ${terrainHeight(h.x, h.z)}`).toBe(true);
    expect(s.exit()).toBe(true);
    expect(s.control.kind).toBe("foot");
  });
});

import { ENGINES, engineHz, engineState, gearRpm } from "../game/src/core/engineModel";
import { masterGain, useAudio } from "../game/src/core/audio";
import { VEHICLE_IDS } from "../game/src/sim/vehicle";

describe("v6.3 engine sounds and volume", () => {
  it("gives every vehicle its own engine, from a diesel bus to a shrieking V12", () => {
    const keys = [...VEHICLE_IDS, "bus", "boat", "jetski", "heli", "plane"] as const;
    for (const k of keys) expect(ENGINES[k], k).toBeDefined();
    const signature = (k: (typeof keys)[number]) => JSON.stringify([engineHz(ENGINES[k], 0).toFixed(0), engineHz(ENGINES[k], 1).toFixed(0), ENGINES[k].wave, ENGINES[k].cylinders]);
    expect(new Set(keys.map(signature)).size).toBe(keys.length);
    expect(engineHz(ENGINES.super, 1)).toBeGreaterThan(engineHz(ENGINES.roadster, 1));
    expect(engineHz(ENGINES.bus, 1)).toBeLessThan(engineHz(ENGINES.sedan, 1));
    expect(engineHz(ENGINES.hauler, 1)).toBeLessThan(engineHz(ENGINES.truck, 1));
    expect(ENGINES.car.cylinders).toBe(0); // the Volt GT is electric: a motor whine
    expect(ENGINES.heli.pulse).toBe("rotor");
    expect(ENGINES.plane.pulse).toBe("prop");
  });

  it("revs up through each gear and drops at the shift", () => {
    expect(gearRpm(0, 5)).toBeLessThan(0.1);
    expect(gearRpm(0.19, 5)).toBeGreaterThan(gearRpm(0.05, 5));
    expect(gearRpm(0.205, 5)).toBeLessThan(gearRpm(0.195, 5));
    expect(gearRpm(1, 5)).toBeGreaterThan(0.95);
    expect(gearRpm(0.5, 1)).toBeCloseTo(0.53, 2);
  });

  it("follows whatever the player is driving, riding or flying", async () => {
    const s = await Simulation.create({ stages: STARTING_STAGES, trees: [], spawn: { position: [-754.5, -127], heading: 0 } });
    expect(engineState(s)).toBeNull();
    s.spawnVehicle("bus", -740, -110, 0); runSim(s, 0.3); s.teleport(-740, -113); expect(s.enterVehicle("bus")).toBe(true);
    runSim(s, 2, { forward: 1 });
    const bus = engineState(s)!;
    expect(bus.key).toBe("bus");
    expect(bus.load).toBeGreaterThan(0.5);
    expect(bus.rpm).toBeGreaterThan(0.1);
    s.exit();
    s.teleport(-754.5, -127); runSim(s, 0.2);
    expect(s.board({ kind: "heli", id: "airport" })).toBe(true);
    runSim(s, 3);
    const heli = engineState(s)!;
    expect(heli.key).toBe("heli");
    expect(heli.spin).toBeGreaterThan(0.9);
    s.exit();
    s.board({ kind: "plane", id: "trainer" });
    runSim(s, 1, { forward: 1 });
    expect(engineState(s)?.key).toBe("plane");
  });

  it("remembers a master volume that mutes everything at zero", () => {
    useAudio.getState().setVolume(0.5);
    expect(masterGain()).toBeCloseTo(0.25);
    useAudio.getState().toggleMute();
    expect(masterGain()).toBe(0);
    useAudio.getState().toggleMute();
    useAudio.getState().setVolume(1.5);
    expect(useAudio.getState().volume).toBe(1);
  });
});

// The campus tests moved to v64.test.ts with the rebuilt campus.
import { distanceToSegment as dseg, type Point as P } from "../game/src/world/v6";

import { BUSINESSES, CITY_BLOCKS, CITY_LOOPS, NORTH_ROADS, riverfrontZ } from "../game/src/world/v6";
import { MALL, MALL_DOORS, MALL_STORES, LOST_BEAR, mallBoxes, inMall } from "../game/src/world/mall";
import { SHORES, BEACH } from "../game/src/world/shoreline";
import { signalAt, mayGo, signalPoints, SIGNAL_CYCLE } from "../game/src/world/signals";
import { OWAWA_ROADS } from "../game/src/world/owawa";
import { useV6 as v6, v6Offer as offer } from "../game/src/story/v6Store";
import { runtime as rt } from "../game/src/core/runtime";
import { GIGS } from "../game/src/story/gigs";
import { collisionBoxes } from "../game/src/world/map";

describe("v6.3 Owawa", () => {
  it("fills the north shore with a dense grid of high-rises, clear of every street and the river", () => {
    expect(CITY_BLOCKS.length).toBeGreaterThan(150);
    expect(CITY_BLOCKS.filter((b) => b.size[2] > 100).length).toBeGreaterThan(25);
    expect(Math.max(...CITY_BLOCKS.map((b) => b.size[2]))).toBeGreaterThan(180);
    for (const b of CITY_BLOCKS) {
      const [x, z] = b.at, hw = b.size[0] / 2, hd = b.size[1] / 2;
      for (const r of NORTH_ROADS) for (const [px, pz] of [[x - hw, z - hd], [x + hw, z - hd], [x - hw, z + hd], [x + hw, z + hd], [x, z - hd], [x, z + hd], [x - hw, z], [x + hw, z]])
        expect(dseg(px, pz, r.from, r.to) - r.width / 2 - r.boulevardWidth - r.sidewalkWidth, `${b.id} vs ${r.id}`).toBeGreaterThan(0.5);
      expect(z + hd, b.id).toBeLessThan(riverfrontZ(x) - 8);
      for (const o of CITY_BLOCKS) if (o !== b) expect(Math.abs(o.at[0] - x) >= (o.size[0] + b.size[0]) / 2 + 2 || Math.abs(o.at[1] - z) >= (o.size[1] + b.size[1]) / 2 + 2, `${b.id}/${o.id}`).toBe(true);
    }
  });
  it("joins every north–south street to the riverfront and runs the avenues on into Downtown", () => {
    for (const r of NORTH_ROADS.filter((r) => r.id.startsWith("owawa-st-"))) expect(Math.abs(r.to[1] - riverfrontZ(r.to[0]))).toBeLessThan(0.01);
    for (const z of [-840, -760, -680]) expect(NORTH_ROADS.some((r) => r.to[0] === 540 && r.to[1] === z) && OWAWA_ROADS.some((r) => r.from[0] === 540 && r.from[1] === z)).toBe(true);
    for (const loop of CITY_LOOPS) loop.forEach((p, i) => { const q = loop[(i + 1) % loop.length]; const mid: P = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; expect(NORTH_ROADS.some((r) => dseg(mid[0], mid[1], r.from, r.to) < 0.01)).toBe(true); });
  });
  it("opens eight businesses and agencies on Rideau Avenue West, each with a reachable door", () => {
    expect(BUSINESSES.map((b) => b.id).sort()).toEqual(["bakery", "diner", "insurance", "jobs", "pharmacy", "police", "realty", "travel"]);
    const boxes = collisionBoxes(STARTING_STAGES);
    for (const b of BUSINESSES) {
      expect(boxes.some((x) => b.door[0] > x.x0 && b.door[0] < x.x1 && b.door[1] > x.z0 && b.door[1] < x.z1 && (x.y ?? 0) < 1), b.id).toBe(false);
      Object.assign(rt.body, { x: b.door[0], z: b.door[1] + 1, y: 0, control: { kind: "foot" } });
      v6.setState({ ride: null, interior: null });
      expect(offer()?.text, b.id).toBe("Enter " + b.name);
    }
  });
  it("runs traffic lights that alternate, and Owawa traffic includes police cruisers", async () => {
    const pts = signalPoints([...NORTH_ROADS, ...OWAWA_ROADS.map((r) => ({ ...r, from: r.from as P, to: r.to as P }))]);
    expect(pts.length).toBeGreaterThan(30);
    const [x, z] = pts[0];
    const states = Array.from({ length: SIGNAL_CYCLE }, (_, t) => signalAt(t, x, z));
    expect(states.filter((s) => mayGo(s, true)).length).toBeGreaterThan(5);
    expect(states.filter((s) => mayGo(s, false)).length).toBeGreaterThan(5);
    for (const s of states) expect(mayGo(s, true) && mayGo(s, false)).toBe(false);
    const s = await Simulation.create({ stages: STARTING_STAGES, trees: [], spawn: { position: [-60, 0], heading: 0 }, town: true });
    const city = s.cityTown!;
    expect(city.cars.filter((c) => c.model === "police").length).toBeGreaterThanOrEqual(3);
    expect(city.walkers.length).toBeGreaterThan(100);
    // Cars stop for red: run a while and check nobody drives through a junction against the light.
    let violations = 0;
    for (let i = 0; i < 60 * 40; i++) {
      s.fixedStep(IDLE_INPUT);
      if (i % 6) continue;
      for (const c of city.cars) for (const [sx, sz] of city.signals) {
        const fx = Math.cos(c.heading), fz = Math.sin(c.heading), dx = sx - c.x, dz = sz - c.z, ahead = dx * fx + dz * fz;
        if (Math.abs(-dx * fz + dz * fx) < 5 && ahead > 7 && ahead < 8.5 && c.speed > 4 && !mayGo(signalAt(city.clock, sx, sz), Math.abs(fx) > Math.abs(fz)) && signalAt(city.clock, sx, sz).endsWith("amber") === false) violations++;
      }
    }
    expect(violations).toBeLessThan(3);
  }, 60000);
});

describe("v6.3 Ridge Centre Mall and side jobs", () => {
  it("opens the mall: doorways in the shell, counters you can reach, nothing blocking the concourse", () => {
    const boxes = mallBoxes();
    const solidAt = (x: number, z: number, y = 1) => boxes.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y > (b.y ?? 0) && y < (b.y ?? 0) + b.h);
    expect(solidAt((MALL_DOORS.front[0] + MALL_DOORS.front[1]) / 2, MALL.z0 + 0.2)).toBe(false);
    expect(solidAt((MALL_DOORS.back[0] + MALL_DOORS.back[1]) / 2, MALL.z1 - 0.2)).toBe(false);
    expect(solidAt(MALL.x0 + 30, MALL.z0 + 0.2)).toBe(true);
    for (let z = MALL.z0 + 1; z < MALL.z1 - 1; z += 0.5) expect(solidAt(215, z), `front-to-back walk at z ${z}`).toBe(z > 361.5 && z < 362.5);
    for (const s of MALL_STORES) {
      expect(inMall(...s.spot), s.id).toBe(true);
      expect(solidAt(...s.spot), s.id).toBe(false);
      Object.assign(rt.body, { x: s.spot[0], z: s.spot[1], y: 0, control: { kind: "foot" } });
      v6.setState({ ride: null, interior: null });
      expect(offer()?.text.toLowerCase(), s.id).toBe(("Visit " + s.name).toLowerCase());
    }
    expect(solidAt(...LOST_BEAR)).toBe(false);
  });

  it("plays the mall's side jobs and the courier job through to the pay-out", async () => {
    const { useGame } = await import("../game/src/story/store");
    useGame.setState({ phase: "playing", cash: 0 });
    const walk = (p: P) => { Object.assign(rt.body, { x: p[0], z: p[1], y: 0, control: { kind: "foot" } }); v6.getState().tick(0.1); };
    for (const g of GIGS) {
      v6.setState({ gig: null, mallVisits: [] });
      v6.getState().startGig(g.id);
      for (const st of g.steps) {
        if (st.visits) for (const m of MALL_STORES.filter((m) => m.id !== "mall-desk").slice(0, st.visits)) v6.getState().visited(m.id);
        // (The Pine Hollow firewood job counts chopped trees: see v65.test.ts for the chopping itself.)
        if (st.chops) v6.setState({ chopped: st.chops });
        walk(st.at);
      }
      expect(v6.getState().gig, g.id).toBeNull();
      expect(v6.getState().gigsDone, g.id).toContain(g.id);
    }
    expect(useGame.getState().cash).toBe(GIGS.reduce((a, g) => a + g.reward, 0));
  });
});

describe("v6.3 shores", () => {
  it("traces the river, lake and island shorelines, with Meadows Beach on the south bank", () => {
    expect(SHORES.some((s) => s.id.startsWith("river-north"))).toBe(true);
    expect(SHORES.some((s) => s.id.startsWith("river-south"))).toBe(true);
    expect(SHORES.some((s) => s.id.startsWith("lake"))).toBe(true);
    expect(SHORES.some((s) => s.id.startsWith("island"))).toBe(true);
    for (const s of SHORES) for (let i = 0; i < s.points.length; i += 7) {
      const [x, z] = s.points[i], [nx, nz] = s.normals[i];
      expect(terrainHeight(x + nx * 3, z + nz * 3), s.id).toBeGreaterThan(LAKE_Y - 0.05);
      expect(terrainHeight(x - nx * 3, z - nz * 3), s.id).toBeLessThan(LAKE_Y + 0.05);
    }
    const beach = SHORES.filter((s) => s.id.startsWith("river-south")).flatMap((s) => s.points).filter(([x]) => x > BEACH.x0 && x < BEACH.x1);
    expect(beach.length).toBeGreaterThan(40);
  });
});
