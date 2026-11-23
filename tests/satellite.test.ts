import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { toLatLng } from "@/lib/community/geo";
import {
  AWS_TERRARIUM_URL,
  ESRI_IMAGERY_KEYED_URL,
  ESRI_IMAGERY_URL,
  decodeTerrarium,
  flattenArea,
  mapAttribution,
  meanTerrarium,
  satelliteConfig,
  tileForLatLng,
  tileUrl,
} from "@/lib/community/satellite";
import { applyFlattenToShader, createFlattenUniforms, FLATTEN_DISPLACEMENT, withTerrainFlatten } from "@/lib/materials/terrainFlatten";
import { withGroundXray } from "@/lib/materials/groundXray";
import type { Lot } from "@/lib/models/community";

describe("satellite config", () => {
  it("defaults to keyless Esri imagery and AWS terrain, switched on", () => {
    const c = satelliteConfig({});
    expect(c.enabledByDefault).toBe(true);
    expect(c.imageryUrl).toBe(ESRI_IMAGERY_URL);
    expect(c.terrainUrl).toBe(AWS_TERRARIUM_URL);
    expect(c.imageryMaxZoom).toBe(19);
    expect(c.terrainMaxZoom).toBe(15);
    expect(c.attribution).toMatch(/Esri/);
    expect(c.attribution).toMatch(/Powered by Esri/);
  });

  it("uses Esri's keyed endpoint when an ArcGIS key is set", () => {
    const c = satelliteConfig({ NEXT_PUBLIC_ARCGIS_API_KEY: "abc+/=" });
    expect(c.imageryUrl).toBe(`${ESRI_IMAGERY_KEYED_URL}?token=abc%2B%2F%3D`);
  });

  it("takes custom sources, zoom and an off switch", () => {
    const c = satelliteConfig({
      NEXT_PUBLIC_SATELLITE_GROUND: "off",
      NEXT_PUBLIC_SATELLITE_IMAGERY_URL: "https://example.org/{z}/{x}/{y}.jpg",
      NEXT_PUBLIC_SATELLITE_MAX_ZOOM: "30",
      NEXT_PUBLIC_TERRAIN_TILES_URL: "https://example.org/dem/{z}/{x}/{y}.png",
      NEXT_PUBLIC_SATELLITE_ATTRIBUTION: "Imagery © Example",
    });
    expect(c.enabledByDefault).toBe(false);
    expect(c.imageryUrl).toBe("https://example.org/{z}/{x}/{y}.jpg");
    expect(c.imageryMaxZoom).toBe(22);
    expect(c.terrainUrl).toBe("https://example.org/dem/{z}/{x}/{y}.png");
    expect(c.attribution.startsWith("Imagery © Example")).toBe(true);
    // A custom imagery source never claims Esri's credit.
    expect(satelliteConfig({ NEXT_PUBLIC_SATELLITE_IMAGERY_URL: "https://example.org/{z}/{x}/{y}.jpg" }).attribution).not.toMatch(/Esri/);
  });

  it("credits OpenStreetMap always and the imagery only when it is shown", () => {
    const c = satelliteConfig({});
    expect(mapAttribution(false, c)).toBe("© OpenStreetMap contributors");
    expect(mapAttribution(true, c)).toMatch(/Esri.*OpenStreetMap/);
  });
});

describe("tile math", () => {
  it("finds the web-mercator tile and pixel of a point", () => {
    expect(tileForLatLng({ lat: 0, lng: 0 }, 1)).toEqual({ x: 1, y: 1, z: 1, px: 0, py: 0 });
    expect(tileForLatLng({ lat: 0, lng: 0 }, 0)).toEqual({ x: 0, y: 0, z: 0, px: 128, py: 128 });
    // North-west corner of the world and the clamp at the poles.
    expect(tileForLatLng({ lat: 89.9, lng: -180 }, 3)).toMatchObject({ x: 0, y: 0, px: 0, py: 0 });
    // Ottawa is north of the equator and west of Greenwich: upper-left quadrant.
    const t = tileForLatLng({ lat: 45.27, lng: -75.74 }, 15);
    expect(t.x).toBeLessThan(2 ** 14);
    expect(t.y).toBeLessThan(2 ** 14);
    expect(t.px).toBeGreaterThanOrEqual(0);
    expect(t.px).toBeLessThan(256);
  });

  it("puts points a tile apart into neighbouring tiles", () => {
    const o = { lat: 45.27, lng: -75.74 };
    const z = 15;
    const tileMetres = (40_075_016.7 * Math.cos((o.lat * Math.PI) / 180)) / 2 ** z;
    const a = tileForLatLng(o, z);
    const east = tileForLatLng(toLatLng(o, { x: tileMetres, y: 0 }), z);
    const north = tileForLatLng(toLatLng(o, { x: 0, y: tileMetres }), z);
    expect(east.x).toBe(a.x + 1);
    expect(east.px).toBeCloseTo(a.px, -1);
    expect(north.y).toBe(a.y - 1);
  });

  it("fills url templates in any axis order", () => {
    expect(tileUrl(ESRI_IMAGERY_URL, { x: 3, y: 5, z: 7 })).toBe("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/7/5/3");
    expect(tileUrl(AWS_TERRARIUM_URL, { x: 3, y: 5, z: 7 })).toBe("https://s3.amazonaws.com/elevation-tiles-prod/terrarium/7/3/5.png");
  });

  it("decodes Terrarium elevations", () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(128, 92, 128)).toBe(92.5);
    expect(decodeTerrarium(127, 255, 0)).toBe(-1);
    const px = [128, 90, 0, 255, 128, 94, 0, 255];
    expect(meanTerrarium(px)).toBe(92);
    expect(() => meanTerrarium([])).toThrow();
  });
});

describe("level area under the community", () => {
  const lot = (x: number, z: number): Lot => ({
    id: `${x},${z}`,
    number: "1",
    position: [x, 0, z],
    rotation: [0, 0, 0],
    width: 12,
    depth: 30,
    frontSetback: 6,
    placeholder: { style: "classic", bodyColor: "#fff", roofColor: "#333", garageSide: "left", storeys: 2 },
  });

  it("covers the mapped surroundings", () => {
    const a = flattenArea({ lots: [lot(0, 0), lot(100, 50)] }, 900);
    expect(a.radius).toBeCloseTo(990, 5);
    expect(a.falloff).toBeGreaterThanOrEqual(200);
    expect(a.falloff).toBeLessThanOrEqual(500);
  });

  it("grows to reach lots beyond the mapped radius", () => {
    const a = flattenArea({ lots: [lot(1500, 0)] }, 700);
    expect(a.radius).toBeGreaterThan(1500 + 16);
  });
});

describe("terrain flattening shader", () => {
  const lambert = () => ({ vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> });

  it("still finds the three.js chunks it replaces", () => {
    // Guards against a three.js upgrade silently disabling the levelling.
    expect(THREE.ShaderLib.lambert.vertexShader).toContain("#include <displacementmap_vertex>");
    expect(THREE.ShaderLib.lambert.fragmentShader).toContain("#include <normal_fragment_maps>");
    expect(THREE.ShaderChunk.displacementmap_vertex).toContain("vDisplacementMapUv");
    expect(THREE.ShaderChunk.normal_fragment_maps).toContain("dHdxy_fwd()");
  });

  it("replaces the displacement and fades the relief shading", () => {
    const shader = lambert();
    const u = createFlattenUniforms();
    applyFlattenToShader(shader, u);
    expect(shader.vertexShader).not.toContain("#include <displacementmap_vertex>");
    expect(shader.vertexShader).toContain(FLATTEN_DISPLACEMENT);
    expect(shader.vertexShader).toContain("uniform float uFlatRadius;");
    expect(shader.fragmentShader).toContain("varying float vFlatK;");
    expect(shader.fragmentShader).toContain("( dHdxy_fwd() * ( 1.0 - vFlatK ) )");
    expect(shader.uniforms.uFlatHeight).toBe(u.uFlatHeight);
  });

  it("chains earlier patches and keeps program keys distinct", () => {
    const m = new THREE.MeshLambertMaterial();
    let earlier = 0;
    m.onBeforeCompile = () => {
      earlier++;
    };
    const plainKey = new THREE.MeshLambertMaterial().customProgramCacheKey();
    withGroundXray(withTerrainFlatten(m, createFlattenUniforms()));
    withTerrainFlatten(m); // idempotent
    const shader = lambert();
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(earlier).toBe(1);
    expect(shader.vertexShader).toContain("vFlatK = 0.0;");
    expect(shader.fragmentShader).toContain("uXrayRadius");
    expect(m.customProgramCacheKey()).toMatch(/terrain-flatten\|ground-xray$/);
    expect(m.customProgramCacheKey()).not.toBe(withGroundXray(new THREE.MeshLambertMaterial()).customProgramCacheKey());
    expect(plainKey).not.toMatch(/ground-xray/);
  });
});
