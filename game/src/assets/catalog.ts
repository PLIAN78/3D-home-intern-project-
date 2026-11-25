import data from "./catalog.json";

/**
 * The asset registry: every model the game loads, where it came from, its
 * licence, its real-world size, collision setup, LODs, material variants and
 * animations. catalog.json is written by scripts/assets/build.mjs from
 * assets-src/catalog.source.json; nothing here is fetched from a third party at
 * play time (the files live in public/models and ship with the game).
 */
export type AssetCategory = "people" | "vehicles" | "houses" | "buildings" | "props" | "nature" | "interiors" | "rail" | "aviation" | "water";
export type AssetKind = "static" | "skinned" | "vehicle" | "clips";

export interface AssetLod {
  /** Path under the game's base URL. */
  file: string;
  /** Camera distance (m) from which this LOD is used; the next LOD takes over at its own distance. */
  distance: number | null;
  triangles: number;
  bytes: number;
  /** Largest texture edge (px). */
  texture: number;
}

export interface AssetCollision {
  /** "box" fits the model's bounds; "capsule" is the character controller; "none" has no body; "existing" keeps the game's own collider. */
  shape: "box" | "capsule" | "none" | "existing";
  fit?: "bounds";
  radius?: number;
  height?: number;
  note?: string;
}

export interface AssetEntry {
  id: string;
  category: AssetCategory;
  kind: AssetKind;
  name: string;
  /** Where the original came from. */
  source: string;
  creator: string;
  creatorUrl: string | null;
  license: string;
  /** Size in metres (x = length/forward, y = height, z = width), after normalizing; null for animation libraries. */
  dimensions: [number, number, number] | null;
  collision: AssetCollision;
  lods: AssetLod[];
  /** Named material variants (e.g. paint colours). */
  variants: { name: string; color?: string; material?: string }[];
  animations: { name: string; seconds: number }[] | null;
  /** Skeleton facts used to share animations: the hips' rest height above the feet. */
  rig: { hipsY: number } | null;
  tags: string[];
  /** Tint regions (the player's wardrobe): vertex region id and the region's average base colour (sRGB). */
  regions?: Record<string, { id: number; base: [number, number, number] }>;
}

export const CATALOG = (data as unknown as { assets: Record<string, AssetEntry> }).assets;

export const assetEntry = (id: string): AssetEntry | undefined => CATALOG[id];

/** URL for a LOD file (relative, so the built game works from any folder). */
export const lodUrl = (lod: AssetLod) => import.meta.env.BASE_URL + lod.file;

/** Which LOD to draw at a camera distance (scaled by the graphics setting). */
export function lodFor(entry: AssetEntry, distance: number, scale = 1): number {
  let pick = 0;
  entry.lods.forEach((l, i) => {
    if (l.distance !== null && distance >= l.distance * scale) pick = i;
  });
  return pick;
}

/** Credits for every asset that asks for attribution (shown in the game's credits screen). */
export function attributions() {
  return Object.values(CATALOG)
    .filter((a) => !/^CC0|public domain/i.test(a.license))
    .map((a) => ({ name: a.name, creator: a.creator, license: a.license, source: a.source }));
}
