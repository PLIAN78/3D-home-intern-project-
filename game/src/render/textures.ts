import * as THREE from "three";

/**
 * Procedural, seamless PBR textures painted at startup: no image files to
 * download or license. Each surface gets an albedo (colour) map, a normal map
 * derived from a height field, and a roughness map. Noise is tileable fBm
 * (periodic value noise), so textures repeat without seams.
 */

type RGB = [number, number, number];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable 2D value noise with `period` cells across the texture. */
function makeNoise(period: number, seed: number) {
  const rand = mulberry32(seed);
  const grid = new Float32Array(period * period).map(() => rand());
  const at = (x: number, y: number) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  return (u: number, v: number) => {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** Tileable fractal noise in 0..1. */
function makeFbm(basePeriod: number, octaves: number, seed: number, gain = 0.5) {
  const layers = Array.from({ length: octaves }, (_, i) => makeNoise(basePeriod << i, seed + i * 101));
  let norm = 0;
  for (let i = 0; i < octaves; i++) norm += gain ** i;
  return (u: number, v: number) => {
    let s = 0;
    for (let i = 0; i < octaves; i++) s += layers[i](u, v) * gain ** i;
    return s / norm;
  };
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export interface PbrMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

interface Painter {
  /** Returns colour (0–255), height (0–1) and roughness (0–1) at (u, v). */
  (u: number, v: number): { c: RGB; h: number; r: number };
}

function canvasOf(size: number) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(size, size) as unknown as HTMLCanvasElement;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

/** Paints colour, height and roughness, then derives a normal map from the height. */
function paint(size: number, painter: Painter, normalStrength = 2): PbrMaps {
  const color = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const { c, h, r } = painter(x / size, y / size);
      color[i * 4] = c[0];
      color[i * 4 + 1] = c[1];
      color[i * 4 + 2] = c[2];
      color[i * 4 + 3] = 255;
      const rv = Math.round(r * 255);
      rough[i * 4] = rv;
      rough[i * 4 + 1] = rv;
      rough[i * 4 + 2] = rv;
      rough[i * 4 + 3] = 255;
      height[i] = h;
    }
  }
  const normal = new Uint8ClampedArray(size * size * 4);
  const H = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * normalStrength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * normalStrength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normal[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      normal[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      normal[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }
  const tex = (data: Uint8ClampedArray, srgb: boolean) => {
    const c = canvasOf(size);
    const ctx = c.getContext("2d") as CanvasRenderingContext2D;
    ctx.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return { map: tex(color, true), normalMap: tex(normal, false), roughnessMap: tex(rough, false) };
}

const cache = new Map<string, PbrMaps>();
function cached(key: string, make: () => PbrMaps) {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = make()));
  return m;
}

/** Lawn and field grass seen from above: clumps, dry patches and blade streaks. */
export function grassMaps() {
  return cached("grass", () => {
    const big = makeFbm(4, 4, 11);
    const mid = makeFbm(16, 3, 23);
    const fine = makeFbm(64, 2, 37);
    const streak = makeFbm(128, 2, 41, 0.6);
    const lush = hex("#4f7a2c");
    const deep = hex("#2f5320");
    const dry = hex("#8d8a48");
    const soil = hex("#5a4a33");
    return paint(512, (u, v) => {
      const b = big(u, v);
      const m = mid(u, v);
      const f = fine(u, v);
      const s = streak(u * 1, v * 1);
      let c = mix(deep, lush, smooth(0.25, 0.75, m * 0.7 + f * 0.3));
      c = mix(c, dry, smooth(0.55, 0.85, b) * 0.55);
      c = mix(c, soil, smooth(0.78, 0.92, 1 - f * 0.6 - m * 0.4) * 0.6);
      const k = 0.82 + s * 0.36;
      return { c: [c[0] * k, c[1] * k, c[2] * k], h: f * 0.6 + s * 0.4, r: 0.92 - s * 0.08 };
    }, 3);
  });
}

/** Asphalt: aggregate speckle, tar-sealed cracks, darker tyre tracks. */
export function asphaltMaps() {
  return cached("asphalt", () => {
    const rand = mulberry32(5);
    const big = makeFbm(4, 3, 51);
    const mid = makeFbm(24, 3, 61);
    const grain = makeNoise(256, 71);
    const crack = makeFbm(8, 4, 81);
    return paint(512, (u, v) => {
      const g = grain(u, v);
      const speck = g > 0.86 ? (g - 0.86) * 4 : 0;
      const dark = g < 0.12 ? (0.12 - g) * 3 : 0;
      const base = 58 + big(u, v) * 18 + mid(u, v) * 14;
      const cr = Math.abs(crack(u, v) - 0.5);
      const seal = cr < 0.012 ? 1 - cr / 0.012 : 0;
      const tone = base + speck * 90 - dark * 60 - seal * 22 + (rand() - 0.5) * 6;
      return { c: [tone * 1.03, tone * 1.0, tone * 0.95], h: g * 0.7 + mid(u, v) * 0.3 - seal * 0.5, r: 0.86 - speck * 0.25 + seal * 0.05 };
    }, 4);
  });
}

/** Broom-finished concrete with a control joint at the tile edge (sidewalks, curbs, slabs). */
export function concreteMaps() {
  return cached("concrete", () => {
    const big = makeFbm(4, 3, 91);
    const mid = makeFbm(32, 3, 97);
    const grain = makeNoise(256, 103);
    return paint(512, (u, v) => {
      const joint = Math.min(u, 1 - u, v, 1 - v) < 0.006 ? 1 : 0;
      const tone = 168 + big(u, v) * 26 + mid(u, v) * 16 - grain(u, v) * 14 - joint * 70;
      return { c: [tone * 1.0, tone * 0.99, tone * 0.95], h: grain(u, v) * 0.4 + mid(u, v) * 0.3 - joint, r: 0.9 - joint * 0.1 };
    }, 2);
  });
}

/** Excavated soil and gravel for building sites and the farm. */
export function dirtMaps() {
  return cached("dirt", () => {
    const big = makeFbm(4, 4, 111);
    const pebble = makeNoise(96, 113);
    const fine = makeFbm(64, 2, 117);
    const clay = hex("#7a5a3a");
    const dark = hex("#4b3826");
    const stone = hex("#9c9488");
    return paint(512, (u, v) => {
      const p = pebble(u, v);
      const isStone = p > 0.78 ? smooth(0.78, 0.84, p) : 0;
      let c = mix(dark, clay, big(u, v) * 0.8 + fine(u, v) * 0.2);
      c = mix(c, stone, isStone * 0.85);
      return { c, h: big(u, v) * 0.4 + isStone * 0.6 + fine(u, v) * 0.2, r: 0.95 - isStone * 0.15 };
    }, 4);
  });
}

/** Tree bark: vertical furrows. */
export function barkMaps() {
  return cached("bark", () => {
    const furrow = makeFbm(8, 3, 131);
    const fine = makeFbm(64, 2, 137);
    return paint(256, (u, v) => {
      const f = furrow(u * 1, v * 0.25);
      const ridge = Math.abs(Math.sin((u * 12 + f * 2) * Math.PI));
      const tone = 60 + ridge * 40 + fine(u, v) * 20;
      return { c: [tone * 1.05, tone * 0.85, tone * 0.66], h: ridge * 0.8 + fine(u, v) * 0.2, r: 0.95 };
    }, 5);
  });
}

/** Clean wood (lumber, fences, planks). */
export function lumberMaps() {
  return cached("lumber", () => {
    const grain = makeFbm(4, 4, 151);
    const fine = makeNoise(128, 157);
    return paint(256, (u, v) => {
      const rings = Math.sin((v * 22 + grain(u * 0.3, v) * 6) * Math.PI) * 0.5 + 0.5;
      const tone = 176 + rings * 34 + fine(u, v) * 14;
      return { c: [tone, tone * 0.82, tone * 0.58], h: rings * 0.3, r: 0.75 };
    }, 1.5);
  });
}

/** Leaf-card alpha texture: a cluster of leaves on transparent background, for fluffy foliage. */
export function leafCardTexture(kind: "broadleaf" | "needle") {
  const key = `leaf-${kind}`;
  const hit = cache.get(key);
  if (hit) return hit.map;
  const size = 256;
  const c = canvasOf(size);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  const rand = mulberry32(kind === "needle" ? 7 : 3);
  ctx.clearRect(0, 0, size, size);
  const n = kind === "needle" ? 90 : 26;
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * size * 0.36;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    const shade = 150 + rand() * 105;
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI * 2);
    ctx.beginPath();
    if (kind === "needle") {
      ctx.fillRect(-1.2, -14, 2.4, 28);
    } else {
      const L = 26 + rand() * 14;
      ctx.moveTo(0, -L / 2);
      ctx.quadraticCurveTo(L * 0.45, 0, 0, L / 2);
      ctx.quadraticCurveTo(-L * 0.45, 0, 0, -L / 2);
      ctx.fill();
    }
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, { map: t, normalMap: t, roughnessMap: t });
  return t;
}

/** Large-scale, soft variation used to break up visible repetition on big surfaces. */
export function macroVariationTexture() {
  return cached("macro", () => {
    const n = makeFbm(4, 5, 171, 0.55);
    return paint(256, (u, v) => {
      const t = n(u, v) * 255;
      return { c: [t, t, t], h: 0, r: 0.5 };
    }, 0);
  }).map;
}

/** Gentle ripples for water (a tileable normal map). */
export function waterNormalMap() {
  return cached("water", () => {
    const a = makeFbm(8, 4, 191, 0.55);
    const b = makeFbm(16, 3, 197, 0.5);
    return paint(256, (u, v) => {
      const h = a(u, v) * 0.7 + b(u, v) * 0.3;
      return { c: [0, 0, 0], h, r: 0.05 };
    }, 6);
  }).normalMap;
}

/** Horizontal lap siding, 1 m tile (5 boards): shadow lines under each board, light grain. Tinted by the house colour. */
export function sidingMaps() {
  return cached("siding", () => {
    const grain = makeFbm(8, 3, 211);
    return paint(256, (u, v) => {
      const board = (v * 5) % 1;
      const lip = board > 0.93 ? (board - 0.93) / 0.07 : 0;
      const tone = 232 - lip * 80 + (grain(u * 2, v) - 0.5) * 10;
      return { c: [tone, tone, tone], h: board * 0.8 - lip, r: 0.7 + lip * 0.2 };
    }, 2.5);
  });
}

/** Architectural asphalt shingles, 1 m tile. Tinted by the roof colour. */
export function shingleMaps() {
  return cached("shingles", () => {
    const grain = makeNoise(128, 223);
    const tone = makeFbm(8, 3, 227);
    return paint(256, (u, v) => {
      const row = Math.floor(v * 6);
      const rv = (v * 6) % 1;
      const tab = ((u * 4 + (row % 2) * 0.5) % 1);
      const gapX = tab < 0.025 ? 1 : 0;
      const edge = rv < 0.08 ? 1 : 0;
      const t = 200 + (tone(u, v) - 0.5) * 50 + (grain(u, v) - 0.5) * 40 - edge * 70 - gapX * 60;
      return { c: [t, t, t], h: rv * 0.6 - edge * 0.5 - gapX * 0.4 + grain(u, v) * 0.2, r: 0.92 };
    }, 3);
  });
}

/** Oriented strand board (sheathing on frames and decks). */
export function osbMaps() {
  return cached("osb", () => {
    const flake = makeNoise(48, 233);
    const flake2 = makeNoise(96, 239);
    return paint(256, (u, v) => {
      const f = flake(u, v) * 0.6 + flake2(u, v) * 0.4;
      const t = 165 + f * 60;
      return { c: [t, t * 0.8, t * 0.55], h: f * 0.5, r: 0.9 };
    }, 1.5);
  });
}
