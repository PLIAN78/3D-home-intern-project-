import * as THREE from "three";

/**
 * Levels GPU-displaced terrain (3d-tiles-renderer's TerrainRGBMeshPlugin
 * displaces each tile in the vertex shader with an elevation texture) inside a
 * circle around the world origin, then blends back to the real terrain.
 *
 * The community is modelled flat at y = 0, and the terrain frame puts the
 * ground height at the origin at y = 0. Inside the circle the displacement is
 * replaced by that height plus the earth's curvature drop, so the ground stays
 * level with the lots, roads and buildings drawn on it.
 *
 * Positions are measured in world space, so this assumes the community's
 * origin is the world origin (true for every real-world viewer).
 */

export interface FlattenUniforms {
  /** Radius (m) of the level area around the world origin. */
  uFlatRadius: { value: number };
  /** Distance (m) over which the level area blends back into the terrain. */
  uFlatFalloff: { value: number };
  /** Terrain height (m, same datum as the elevation tiles) to hold the level area at. */
  uFlatHeight: { value: number };
}

export function createFlattenUniforms(): FlattenUniforms {
  return { uFlatRadius: { value: 0 }, uFlatFalloff: { value: 200 }, uFlatHeight: { value: 0 } };
}

/** Shared by every terrain tile (one satellite ground per page, like the basement x-ray). */
export const flattenUniforms = createFlattenUniforms();

export function setFlattenArea(area: { radius: number; falloff: number }, groundHeight: number, uniforms: FlattenUniforms = flattenUniforms) {
  uniforms.uFlatRadius.value = area.radius;
  uniforms.uFlatFalloff.value = area.falloff;
  uniforms.uFlatHeight.value = groundHeight;
}

// 2 × mean earth radius: d² / (2R) is the drop of a sphere below its tangent plane.
const TWO_R = (2 * 6_371_000).toFixed(1);

export const FLATTEN_VERTEX_PARS = /* glsl */ `
uniform float uFlatRadius;
uniform float uFlatFalloff;
uniform float uFlatHeight;
varying float vFlatK;`;

export const FLATTEN_DISPLACEMENT = /* glsl */ `
vFlatK = 0.0;
#ifdef USE_DISPLACEMENTMAP
{
  vec4 flatWorld = modelMatrix * vec4( transformed, 1.0 );
  float flatDist = length( flatWorld.xz );
  vFlatK = 1.0 - smoothstep( uFlatRadius, uFlatRadius + uFlatFalloff, flatDist );
  float terrainH = texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias;
  float levelH = uFlatHeight * displacementScale + flatDist * flatDist / ${TWO_R};
  transformed += normalize( objectNormal ) * mix( terrainH, levelH, vFlatK );
}
#endif`;

/** The bump-mapped relief shading fades out where the ground is levelled. */
export function flattenedNormalChunk(): string {
  return THREE.ShaderChunk.normal_fragment_maps.replace("dHdxy_fwd()", "( dHdxy_fwd() * ( 1.0 - vFlatK ) )");
}

const patched = new WeakSet<THREE.Material>();

/** Apply the shader edits to a compiled shader (exported for tests). */
export function applyFlattenToShader(shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> }, uniforms: FlattenUniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${FLATTEN_VERTEX_PARS}`).replace("#include <displacementmap_vertex>", FLATTEN_DISPLACEMENT);
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vFlatK;").replace("#include <normal_fragment_maps>", flattenedNormalChunk());
}

/** Patch a terrain tile material (idempotent). Chains any existing onBeforeCompile. */
export function withTerrainFlatten<T extends THREE.Material>(material: T, uniforms: FlattenUniforms = flattenUniforms): T {
  if (patched.has(material)) return material;
  patched.add(material);
  const prevKey = material.customProgramCacheKey();
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    applyFlattenToShader(shader, uniforms);
  };
  material.customProgramCacheKey = () => `${prevKey}|terrain-flatten`;
  material.needsUpdate = true;
  return material;
}
