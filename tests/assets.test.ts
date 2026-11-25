import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CATALOG, attributions, lodFor } from "../game/src/assets/catalog";
import { CLIP, characterFor, clipsFor } from "../game/src/assets/people";
import { OUTFITS, TOWNSFOLK, type Outfit } from "../game/src/models/human";
import { SAM_LOOK } from "../game/src/story/quests";

const pub = join(__dirname, "../game/public");
const source = JSON.parse(readFileSync(join(__dirname, "../game/assets-src/catalog.source.json"), "utf8")) as { assets: { id: string; source: { url: string; license: string; creator: string } }[] };

describe("asset registry", () => {
  const entries = Object.values(CATALOG);

  it("lists every built asset with its source, creator, licence, size, collision and LODs", () => {
    expect(entries.length).toBeGreaterThan(30);
    for (const a of entries) {
      expect(a.id, a.id).toMatch(/^[a-z0-9-]+$/);
      expect(a.source, a.id).toMatch(/^https?:\/\//);
      expect(a.creator.length, a.id).toBeGreaterThan(3);
      expect(a.license.length, a.id).toBeGreaterThan(3);
      expect(a.collision.shape, a.id).toBeTruthy();
      expect(a.lods.length, a.id).toBeGreaterThan(0);
      if (a.kind !== "clips") {
        expect(a.dimensions, a.id).toHaveLength(3);
        for (const d of a.dimensions!) expect(d, a.id).toBeGreaterThan(0.05);
      }
      // The source manifest is the authority for where it came from and its licence.
      const src = source.assets.find((s) => s.id === a.id);
      expect(src, a.id).toBeTruthy();
      expect(src!.source.license).toBe(a.license);
    }
  });

  it("ships every LOD file locally (nothing is fetched from a third party at play time), smallest last", () => {
    for (const a of Object.values(CATALOG)) {
      a.lods.forEach((l, i) => {
        const f = join(pub, l.file);
        expect(existsSync(f), f).toBe(true);
        expect(statSync(f).size).toBe(l.bytes);
        expect(l.file.startsWith("models/")).toBe(true);
        if (i > 0) {
          expect(l.distance!).toBeGreaterThan(a.lods[i - 1].distance ?? 0);
          expect(l.triangles).toBeLessThan(a.lods[i - 1].triangles + 1);
        }
      });
    }
  });

  it("keeps models light enough for laptops", () => {
    for (const a of Object.values(CATALOG)) {
      if (a.kind === "clips") continue;
      expect(a.lods[0].bytes, a.id).toBeLessThan(6 * 1024 * 1024);
      expect(a.lods.at(-1)!.triangles, a.id).toBeLessThan(a.category === "people" ? 8000 : 20000);
    }
  });

  it("picks LODs by distance, scaled by the graphics setting", () => {
    const p = CATALOG["person-maya"];
    expect(lodFor(p, 2)).toBe(0);
    expect(lodFor(p, 40)).toBe(1);
    // Fast graphics switch to the light LOD sooner.
    expect(lodFor(p, 15, 0.6)).toBe(1);
  });

  it("credits everything that asks for attribution", () => {
    const credits = attributions();
    for (const a of Object.values(CATALOG)) {
      const needs = !/^CC0|public domain/i.test(a.license);
      expect(credits.some((c) => c.name === a.name), a.id).toBe(needs);
    }
  });
});

describe("realistic people", () => {
  it("has a realistic character for every outfit in the game", () => {
    const named = Object.values(OUTFITS) as Outfit[];
    for (const o of [...named, ...TOWNSFOLK, SAM_LOOK]) {
      const id = characterFor(o);
      expect(CATALOG[id], id).toBeTruthy();
      expect(CATALOG[id].category).toBe("people");
    }
    // Exact matches for the named people.
    expect(characterFor(OUTFITS.maya)).toBe("person-maya");
    expect(characterFor(OUTFITS.rosa)).toBe("person-rosa");
    expect(characterFor(SAM_LOOK)).toBe("person-sam");
    expect(characterFor(TOWNSFOLK[4])).toBe("person-town4");
    // Kids stay kids, women stay women.
    expect(CATALOG[characterFor({ ...OUTFITS.kid, shirt: "#123456" })].tags).toContain("child");
    expect(CATALOG[characterFor({ ...TOWNSFOLK[1], shirt: "#123456" })].tags).toContain("female");
  });

  it("shares one animation library across everyone, scaled to each body", () => {
    const lib = CATALOG["people-clips"];
    expect(lib.kind).toBe("clips");
    const names = lib.animations!.map((a) => a.name);
    for (const prefix of Object.values(CLIP)) expect(names.some((n) => n.startsWith(prefix)), prefix).toBe(true);
    for (const a of Object.values(CATALOG).filter((a) => a.kind === "skinned")) expect(a.rig?.hipsY, a.id).toBeGreaterThan(0.5);
    // The hips' movement scales with the body; rotations don't.
    const track = new THREE.VectorKeyframeTrack("Hips.position", [0, 1], [0, 1, 0, 0, 1.2, 0]);
    const rot = new THREE.QuaternionKeyframeTrack("Spine.quaternion", [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.995]);
    const m = clipsFor([new THREE.AnimationClip("Walk", 1, [track, rot])], 1, 0.8);
    const walk = m.get("walk")!;
    expect(walk.tracks[0].values[1]).toBeCloseTo(0.8, 5);
    expect(walk.tracks[1].values[5]).toBeCloseTo(0.1, 5);
  });

  it("dresses the player in whatever the wardrobe picks (tint regions on every player variant)", () => {
    for (const hat of ["none", "hardhat", "cap", "straw"]) {
      const a = CATALOG[`person-player-${hat}-short`];
      expect(a, hat).toBeTruthy();
      for (const r of ["skin", "shirt", "pants", "shoes", "vest"]) expect(a.regions?.[r], `${hat} ${r}`).toBeTruthy();
    }
  });
});
