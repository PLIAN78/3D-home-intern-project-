import { FRONT_POINTS, FRONT_RESERVE, ISLE } from "../world/paving";
import * as THREE from "three";
import { asphaltMaps, barkMaps, concreteMaps, dirtMaps, grassMaps, lumberMaps, macroVariationTexture, osbMaps, shingleMaps, sidingMaps, type PbrMaps } from "./textures";

/**
 * Shared physically based materials. Every material is cached, so the whole
 * world uses a handful of shader programs.
 */

const plain = new Map<string, THREE.MeshStandardMaterial>();

/** A plain PBR colour (cached). `rough`/`metal` follow glTF conventions. */
export function mat(color: string, opts: { emissive?: string; emissiveIntensity?: number; rough?: number; metal?: number; flat?: boolean } = {}) {
  const key = `${color}|${opts.emissive ?? ""}|${opts.emissiveIntensity ?? 1}|${opts.rough ?? 0.75}|${opts.metal ?? 0}|${opts.flat ? 1 : 0}`;
  let m = plain.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.75,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? "#000000",
      emissiveIntensity: opts.emissive ? (opts.emissiveIntensity ?? 1) : 0,
      flatShading: opts.flat ?? false,
    });
    plain.set(key, m);
  }
  return m;
}

const physical = new Map<string, THREE.MeshPhysicalMaterial>();

/** Glossy automotive paint: base coat plus a clear coat that catches the sky. */
export function carPaint(color: string) {
  let m = physical.get(`paint:${color}`);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 });
    physical.set(`paint:${color}`, m);
  }
  return m;
}

/**
 * Dark tinted glass that mirrors the sky. Opaque, because vehicle cabins aren't
 * modelled inside: see-through glass would show the body paint behind it.
 */
export function glass(tint = "#0d141a") {
  let m = physical.get(`glass:${tint}`);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color: tint, metalness: 0.2, roughness: 0.03, envMapIntensity: 2, clearcoat: 1, clearcoatRoughness: 0 });
    physical.set(`glass:${tint}`, m);
  }
  return m;
}

export const chrome = () => mat("#e8eaee", { metal: 1, rough: 0.12 });
export const rubber = () => mat("#151617", { rough: 0.92 });

/** Cloth with a soft sheen (clothes, seats). */
export function fabric(color: string, sheen = 0.4) {
  let m = physical.get(`fabric:${color}:${sheen}`);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.88, sheen, sheenRoughness: 0.7, sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.4) });
    physical.set(`fabric:${color}:${sheen}`, m);
  }
  return m;
}

/** Skin: soft, slightly warm specular. */
export function skin(color: string) {
  let m = physical.get(`skin:${color}`);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color("#ffb8a0") });
    physical.set(`skin:${color}`, m);
  }
  return m;
}

/** Retro-reflective safety tape: bright under light, like the stripes on a hi-vis vest. */
export function reflective() {
  return mat("#e9edf0", { rough: 0.25, metal: 0.6, emissive: "#3a3d40", emissiveIntensity: 0.3 });
}

// ── World-mapped ground surfaces ───────────────────────────────────────────

/**
 * Patches a standard material so its textures are mapped by world position
 * (metres / `tile`), whatever the mesh's own UVs, and modulated by a large,
 * soft noise so big areas don't show a repeating pattern.
 */
function worldMapped(m: THREE.MeshStandardMaterial, tile: number, macro = 0.22) {
  const macroTex = macroVariationTexture();
  macroTex.colorSpace = THREE.NoColorSpace;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWorldTile = { value: 1 / tile };
    shader.uniforms.uMacro = { value: macroTex };
    shader.uniforms.uMacroAmount = { value: macro };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWorldTile;\nvarying vec2 vWorldXZ;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vec4 wp = modelMatrix * vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #endif
        vWorldXZ = wp.xz;
        vec2 wuv = wp.xz * uWorldTile;
        #ifdef USE_MAP
          vMapUv = wuv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = wuv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = wuv;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uMacro;\nuniform float uMacroAmount;\nvarying vec2 vWorldXZ;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float macroA = texture2D(uMacro, vWorldXZ * 0.0061).r;
        float macroB = texture2D(uMacro, vWorldXZ * 0.0213 + 0.37).r;
        diffuseColor.rgb *= 1.0 + (macroA * 0.65 + macroB * 0.35 - 0.5) * 2.0 * uMacroAmount;`,
      );
  };
  m.customProgramCacheKey = () => `world-mapped-${tile}-${macro}`;
  return m;
}

function surface(key: string, maps: PbrMaps, tile: number, opts: { color?: string; normalScale?: number; macro?: number; rough?: number } = {}) {
  let m = physical.get(key) as unknown as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: opts.rough ?? 1,
      color: opts.color ?? "#ffffff",
      normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
    });
    worldMapped(m, tile, opts.macro);
    physical.set(key, m as unknown as THREE.MeshPhysicalMaterial);
  }
  return m;
}

export const groundGrass = () => surface("grass", grassMaps(), 3.2, { normalScale: 0.8, macro: 0.3 });
export const groundAsphalt = () => surface("asphalt", asphaltMaps(), 4, { normalScale: 0.6, macro: 0.18 });
export const groundConcrete = () => surface("concrete", concreteMaps(), 1.6, { normalScale: 0.5, macro: 0.12 });
export const groundDirt = () => surface("dirt", dirtMaps(), 3, { normalScale: 1, macro: 0.25 });

/**
 * The hills and fields, with everything north of the Owawa River paved: grass
 * south of the river, on the north bank below the riverfront street and on
 * Heron Gardens Island; concrete paving across the rest of the north shore
 * (world/paving.ts). It fades out beyond the edge of the playable area.
 */
export function groundHills() {
  let m = physical.get("hills") as unknown as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    const g = grassMaps(), c = concreteMaps();
    const mm = new THREE.MeshStandardMaterial({ map: g.map, normalMap: g.normalMap, roughnessMap: g.roughnessMap, roughness: 1, color: "#ffffff", normalScale: new THREE.Vector2(0.8, 0.8) });
    worldMapped(mm, 3.2, 0.3);
    const base = mm.onBeforeCompile;
    mm.onBeforeCompile = (shader, renderer) => {
      base.call(mm, shader, renderer);
      shader.uniforms.uPave = { value: c.map };
      shader.uniforms.uFront = { value: FRONT_POINTS.map(([x, z]) => new THREE.Vector2(x, z)) };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vWorldY;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform sampler2D uPave;
          uniform vec2 uFront[${FRONT_POINTS.length}];
          varying float vWorldY;
          // The riverfront street's centre line at x (straight between its points, held past the ends).
          float frontZ(float x) {
            if (x <= uFront[0].x) return uFront[0].y;
            for (int i = 0; i < ${FRONT_POINTS.length - 1}; i++) {
              vec2 a = uFront[i], b = uFront[i + 1];
              if (x <= b.x) return mix(a.y, b.y, (x - a.x) / (b.x - a.x));
            }
            return uFront[${FRONT_POINTS.length - 1}].y;
          }
          float paveAmount(vec2 p, float y) {
            // Paved out to the riverfront street's south sidewalk; the bank below it stays green.
            float edge = frontZ(p.x) + ${FRONT_RESERVE.toFixed(1)};
            float north = smoothstep(edge + 0.6, edge - 0.6, p.y);
            // Dry ground only (the river and lake beds stay natural), and not the island.
            float dry = smoothstep(${(-1.4 - 0.07).toFixed(2)}, ${(-1.4 - 0.01).toFixed(2)}, y);
            float isle = length(vec2((p.x - (${ISLE.x.toFixed(1)})) / ${ISLE.rx.toFixed(1)}, (p.y - (${ISLE.z.toFixed(1)})) / ${ISLE.rz.toFixed(1)}));
            return north * dry * smoothstep(1.22, 1.32, isle) * smoothstep(-1090.0, -1010.0, p.y) * smoothstep(1090.0, 1010.0, abs(p.x));
          }`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          float pave = paveAmount(vWorldXZ, vWorldY);
          if (pave > 0.0) {
            vec3 slab = texture2D(uPave, vWorldXZ * 0.42).rgb * vec3(0.78, 0.78, 0.8);
            // Joints every 3 m, like poured paving.
            vec2 cell = abs(fract(vWorldXZ / 3.0) - 0.5);
            slab *= 1.0 - 0.18 * smoothstep(0.47, 0.495, max(cell.x, cell.y));
            diffuseColor.rgb = mix(diffuseColor.rgb, slab, pave);
          }`,
        );
    };
    mm.customProgramCacheKey = () => "hills-paved-north";
    m = mm;
    physical.set("hills", m as unknown as THREE.MeshPhysicalMaterial);
  }
  return m;
}

/** Concrete on walls, curbs and foundations, using the mesh's own (metric) UVs. */
export function concreteSurface() {
  let m = physical.get("concrete-uv") as unknown as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    const maps = concreteMaps();
    m = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap, color: "#e4e1da", normalScale: new THREE.Vector2(0.5, 0.5) });
    physical.set("concrete-uv", m as unknown as THREE.MeshPhysicalMaterial);
  }
  return m;
}

/** Bark for trunks (mesh UVs). */
export function bark() {
  let m = physical.get("bark") as unknown as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    const maps = barkMaps();
    for (const t of [maps.map, maps.normalMap, maps.roughnessMap]) t.repeat.set(2, 3);
    m = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap, color: "#d9cbbb" });
    physical.set("bark", m as unknown as THREE.MeshPhysicalMaterial);
  }
  return m;
}

/** Sawn lumber for frames and planks. */
export function lumber() {
  let m = physical.get("lumber") as unknown as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    const maps = lumberMaps();
    m = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap, color: "#f1e2c8" });
    physical.set("lumber", m as unknown as THREE.MeshPhysicalMaterial);
  }
  return m;
}

const siteMats = new Map<string, THREE.Material>();

/**
 * Materials for Home Studio's construction-stage houses in the game: lap
 * siding and shingle textures (the houses use metric UVs, so 1 texture tile =
 * 1 m), reflective windows, textured dirt, concrete and lumber.
 */
export function siteHomeMaterial(surface: string, color?: string): THREE.Material {
  const key = `${surface}|${color ?? ""}`;
  let m = siteMats.get(key);
  if (m) return m;
  const textured = (maps: PbrMaps, tint: string, rough = 1, side: THREE.Side = THREE.FrontSide) =>
    new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap, roughness: rough, color: tint, side });
  switch (surface) {
    case "body":
      m = textured(sidingMaps(), color ?? "#d8d2c6", 1);
      break;
    case "roof":
      m = textured(shingleMaps(), color ?? "#3b3d41", 1, THREE.DoubleSide);
      break;
    case "window":
      m = new THREE.MeshPhysicalMaterial({ color: "#1e2a33", roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.8 });
      break;
    case "trim":
      m = new THREE.MeshStandardMaterial({ color: "#f3f1ec", roughness: 0.55, side: THREE.DoubleSide });
      break;
    case "garage":
      m = new THREE.MeshStandardMaterial({ color: "#ecebe6", roughness: 0.5, metalness: 0.1 });
      break;
    case "door":
      m = new THREE.MeshStandardMaterial({ color: "#2f2620", roughness: 0.45 });
      break;
    case "dirt":
      m = groundDirt();
      break;
    case "pit":
      m = new THREE.MeshStandardMaterial({ color: "#3f3124", roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      break;
    case "concrete":
    case "foundation":
      m = concreteSurface();
      break;
    case "lumber":
      m = lumber();
      break;
    case "sheathing":
      m = textured(osbMaps(), "#ffffff", 1);
      break;
    case "wrap":
      m = new THREE.MeshStandardMaterial({ color: "#eef1f2", roughness: 0.55, side: THREE.DoubleSide });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color: color ?? "#a3a09a", roughness: 0.9 });
  }
  siteMats.set(key, m);
  return m;
}

/**
 * For double-sided cards (grass blades, leaves): light both faces with the same
 * normal instead of flipping it on the back face, which would turn half the
 * cards black.
 */
export function noBackfaceFlip(fragmentShader: string) {
  const chunk = THREE.ShaderChunk.normal_fragment_begin.replace(/float faceDirection = gl_FrontFacing \? 1\.0 : - 1\.0;/, "float faceDirection = 1.0;");
  return fragmentShader.replace("#include <normal_fragment_begin>", chunk);
}
