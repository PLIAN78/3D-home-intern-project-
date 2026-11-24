import * as THREE from "three";
import { brickMaps, concreteMaps, logMaps, standingSeamMaps, type PbrMaps } from "./textures";

/**
 * Building blocks for the town's larger buildings: boxes whose UVs are in
 * metres (so a 1 m texture tile stays 1 m on any wall), and the masonry, log
 * and metal materials that use them.
 */

/** A box with metric UVs: each face's UVs span its size in metres divided by `tile`. */
export function metricBox(w: number, h: number, d: number, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  // Face order: +x, −x, +y, −y, +z, −z (4 vertices each).
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, (uv.getX(f * 4 + k) * dims[f][0]) / tile, (uv.getY(f * 4 + k) * dims[f][1]) / tile);
  uv.needsUpdate = true;
  return g;
}

const cache = new Map<string, THREE.Material>();
function textured(key: string, maps: () => PbrMaps, color: string, opts: { rough?: number; metal?: number; normal?: number } = {}) {
  const k = `${key}|${color}`;
  let m = cache.get(k);
  if (!m) {
    const p = maps();
    m = new THREE.MeshStandardMaterial({ map: p.map, normalMap: p.normalMap, roughnessMap: p.roughnessMap, color, roughness: opts.rough ?? 1, metalness: opts.metal ?? 0, normalScale: new THREE.Vector2(opts.normal ?? 1, opts.normal ?? 1) });
    cache.set(k, m);
  }
  return m;
}

export const brick = (color = "#b4644a") => textured("brick", brickMaps, color, { normal: 0.9 });
export const logs = (color = "#d7a774") => textured("logs", logMaps, color, { normal: 1.2 });
export const seamRoof = (color = "#4b5d4a") => textured("seam", standingSeamMaps, color, { metal: 0.55, rough: 0.9, normal: 0.8 });
/** Precast concrete or stucco panels (tinted). */
export const panel = (color = "#d9d4c9") => textured("panel", concreteMaps, color, { normal: 0.4 });

let interior: THREE.CanvasTexture | null = null;
/** A lit shop interior seen through glass: ceiling lights, shelving, warm light. One 4 m tile. */
function interiorTexture() {
  if (interior) return interior;
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, "#5a5244");
  g.addColorStop(0.35, "#3a342b");
  g.addColorStop(1, "#1b1915");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // Ceiling light strips.
  ctx.fillStyle = "#fff1d2";
  for (let x = 10; x < s; x += 64) ctx.fillRect(x, 22, 40, 5);
  // Shelving with goods in muted colours.
  const goods = ["#8a6a4a", "#5d7360", "#7d4a44", "#c9b890", "#4d5d72", "#9a8a6a"];
  for (let row = 0; row < 3; row++) {
    const y = 120 + row * 34;
    ctx.fillStyle = "#2a2621";
    ctx.fillRect(0, y + 22, s, 4);
    for (let x = 4; x < s - 8; x += 9) {
      ctx.fillStyle = goods[(x * 7 + row * 3) % goods.length];
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x, y + 6 + ((x * 13) % 7), 7, 16 - ((x * 13) % 7));
    }
    ctx.globalAlpha = 1;
  }
  interior = new THREE.CanvasTexture(c);
  interior.colorSpace = THREE.SRGBColorSpace;
  interior.wrapS = interior.wrapT = THREE.RepeatWrapping;
  interior.anisotropy = 8;
  return interior;
}

/**
 * Shopfront glazing: reflective glass over a softly lit interior, so a store
 * window reads as a store, not a black slab. Use on a metricBox with tile = 4.
 */
export function shopGlass() {
  const k = "shopGlass";
  let m = cache.get(k);
  if (!m) {
    const t = interiorTexture();
    m = new THREE.MeshPhysicalMaterial({ color: "#20282d", emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.55, metalness: 0.1, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4 });
    cache.set(k, m);
  }
  return m;
}

/** Office or classroom windows: a lighter, bluer glass than vehicle windows so walls don't look punched-through. */
export function windowGlass() {
  const k = "windowGlass";
  let m = cache.get(k);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color: "#3d5361", metalness: 0.25, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8 });
    cache.set(k, m);
  }
  return m;
}
