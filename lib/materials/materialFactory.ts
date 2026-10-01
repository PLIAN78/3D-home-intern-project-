import * as THREE from "three";
import { getMaterialOption, type MaterialOption, type MaterialSlotId, type ProceduralPattern } from "@/lib/models/materials";
import type { FixedSurface } from "@/lib/geometry/surfaces";
import { paintPattern } from "./proceduralTextures";

/**
 * Turns renderer-agnostic MaterialOptions into cached Three.js materials.
 * Materials are shared across every mesh that uses the same option, so a
 * selection change swaps a reference rather than rebuilding anything.
 */

/** Slots whose surfaces use 0..1 "fit" UVs (one texture per object). */
const FIT_SLOTS: MaterialSlotId[] = ["garageDoor", "frontDoor"];
/** Slots rendered double-sided (thin or open geometry). */
const DOUBLE_SIDED: MaterialSlotId[] = ["roof", "trim", "exteriorSiding"];

const optionCache = new Map<string, THREE.MeshStandardMaterial>();
const fixedCache = new Map<FixedSurface, THREE.Material>();
const textureCache = new Map<string, { map: THREE.Texture; bump: THREE.Texture | null }>();

function proceduralTextures(key: string, pattern: ProceduralPattern, color: string, accent: string | undefined, tile?: [number, number]) {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const painted = paintPattern(pattern, color, accent);
  if (!painted) return null;
  const map = new THREE.CanvasTexture(painted.color);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = painted.bump ? new THREE.CanvasTexture(painted.bump) : null;
  for (const t of [map, bump]) {
    if (!t) continue;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (tile) t.repeat.set(1 / tile[0], 1 / tile[1]);
    t.needsUpdate = true;
  }
  const entry = { map, bump };
  textureCache.set(key, entry);
  return entry;
}

function bumpScaleFor(pattern: ProceduralPattern | undefined) {
  switch (pattern) {
    case "brick":
    case "stone":
      return 2.5;
    case "shingle":
      return 2;
    case "lap-siding":
    case "board-batten":
      return 1.5;
    case "garage-panel":
    case "door-panel":
    case "shaker":
      return 1.2;
    default:
      return 0.6;
  }
}

export function createOptionMaterial(option: MaterialOption): THREE.MeshStandardMaterial {
  const fit = FIT_SLOTS.includes(option.category);
  const mat = new THREE.MeshStandardMaterial({
    color: option.pattern && option.pattern !== "plain" ? "#ffffff" : option.color ?? "#cccccc",
    roughness: option.roughness ?? 0.8,
    metalness: option.metalness ?? 0,
    side: DOUBLE_SIDED.includes(option.category) ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (option.textureUrl) {
    const loader = new THREE.TextureLoader();
    const map = loader.load(option.textureUrl);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    if (option.tileSize && !fit) map.repeat.set(1 / option.tileSize[0], 1 / option.tileSize[1]);
    mat.map = map;
    if (option.normalMapUrl) mat.normalMap = loader.load(option.normalMapUrl);
  } else if (option.pattern && option.pattern !== "plain") {
    const tex = proceduralTextures(option.id, option.pattern, option.color ?? "#cccccc", option.accentColor, fit ? undefined : option.tileSize ?? [1, 1]);
    if (tex) {
      mat.map = tex.map;
      if (tex.bump) {
        mat.bumpMap = tex.bump;
        mat.bumpScale = bumpScaleFor(option.pattern);
      }
    }
  }
  mat.userData.optionId = option.id;
  return mat;
}

const HOVER_EMISSIVE = new THREE.Color("#ffffff");

/** Gentle lighten on every surface sharing a material, used for hover feedback. */
export function setHighlight(mat: THREE.MeshStandardMaterial, on: boolean) {
  if (on) mat.emissive.copy(HOVER_EMISSIVE);
  else mat.emissive.setRGB(0, 0, 0);
  mat.emissiveIntensity = on ? 0.14 : 0;
}

export function getOptionMaterial(optionId: string): THREE.MeshStandardMaterial | null {
  const cached = optionCache.get(optionId);
  if (cached) return cached;
  const option = getMaterialOption(optionId);
  if (!option) return null;
  const mat = createOptionMaterial(option);
  optionCache.set(optionId, mat);
  return mat;
}

function patterned(key: string, pattern: ProceduralPattern, color: string, accent: string, tile: [number, number], params: THREE.MeshStandardMaterialParameters) {
  const tex = proceduralTextures(`fixed:${key}`, pattern, color, accent, tile);
  return new THREE.MeshStandardMaterial({ ...params, map: tex?.map ?? null, bumpMap: tex?.bump ?? null, bumpScale: 0.5 });
}

export function getFixedMaterial(surface: FixedSurface): THREE.Material {
  const cached = fixedCache.get(surface);
  if (cached) return cached;
  let mat: THREE.Material;
  switch (surface) {
    case "glass":
      mat = new THREE.MeshPhysicalMaterial({
        color: "#a9c4d6",
        metalness: 0.1,
        roughness: 0.04,
        transparent: true,
        opacity: 0.32,
        envMapIntensity: 2.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      break;
    case "foundation":
      mat = patterned("foundation", "concrete", "#a7a49e", "#8e8b85", [2, 2], { roughness: 0.95 });
      break;
    case "concrete":
      mat = patterned("concrete", "concrete", "#bdbab3", "#9f9c96", [2, 2], { roughness: 0.92 });
      break;
    case "garageFloor":
      mat = patterned("garageFloor", "concrete", "#a8a59e", "#8f8c86", [3, 3], { roughness: 0.85 });
      break;
    case "tile":
      mat = patterned("tile", "tile", "#e4e1dc", "#bdb9b1", [0.9, 0.9], { roughness: 0.35 });
      break;
    case "structure":
      mat = new THREE.MeshStandardMaterial({ color: "#8d8983", roughness: 0.9 });
      break;
    case "ceiling":
      mat = new THREE.MeshStandardMaterial({ color: "#f3f1ec", roughness: 0.95 });
      break;
    case "interiorTrim":
      mat = new THREE.MeshStandardMaterial({ color: "#f6f5f1", roughness: 0.45 });
      break;
    case "appliance":
      mat = new THREE.MeshStandardMaterial({ color: "#c9cbcd", roughness: 0.28, metalness: 0.75 });
      break;
    case "wallCap":
      mat = new THREE.MeshStandardMaterial({ color: "#4b4d52", roughness: 0.85 });
      break;
  }
  fixedCache.set(surface, mat);
  return mat;
}

/** Simple coloured material for context geometry (neighbour houses, site). Cached by key. */
const siteCache = new Map<string, THREE.Material>();
export function getSiteMaterial(key: string, make: () => THREE.Material): THREE.Material {
  let m = siteCache.get(key);
  if (!m) {
    m = make();
    siteCache.set(key, m);
  }
  return m;
}

export function siteTexture(key: string, pattern: ProceduralPattern, color: string, accent: string, tile: [number, number]) {
  return proceduralTextures(`site:${key}`, pattern, color, accent, tile);
}

export function disposeMaterialCaches() {
  for (const m of optionCache.values()) m.dispose();
  for (const m of fixedCache.values()) m.dispose();
  for (const m of siteCache.values()) m.dispose();
  for (const t of textureCache.values()) {
    t.map.dispose();
    t.bump?.dispose();
  }
  optionCache.clear();
  fixedCache.clear();
  siteCache.clear();
  textureCache.clear();
}
