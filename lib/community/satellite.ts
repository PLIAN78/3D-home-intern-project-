import type { Community } from "@/lib/models/community";
import type { LatLng } from "./geo";

/**
 * Satellite ground for real-world communities: real terrain (Terrarium
 * elevation tiles) with aerial imagery draped over it, replacing the painted
 * grass. Everything here is pure so it can be unit tested; the renderer is
 * `components/community/SatelliteGround.tsx`.
 *
 * Defaults need no account or key:
 * - Imagery: Esri World Imagery. For production, set NEXT_PUBLIC_ARCGIS_API_KEY
 *   (free ArcGIS Location Platform account) so requests use Esri's keyed endpoint.
 * - Terrain: AWS Terrain Tiles (Mapzen Terrarium encoding, open data, max zoom 15).
 */

export const ESRI_IMAGERY_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const ESRI_IMAGERY_KEYED_URL = "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const AWS_TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const ESRI_ATTRIBUTION = "Imagery: Esri, Vantor, Earthstar Geographics, and the GIS User Community · Powered by Esri";
export const TERRAIN_ATTRIBUTION = "Terrain: Mapzen, AWS Terrain Tiles (contains information licensed under the Open Government Licence – Canada)";
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

export interface SatelliteConfig {
  /** Show the satellite ground when a real-world community first opens. */
  enabledByDefault: boolean;
  /** XYZ template ({z}, {x}, {y}) for the imagery draped over the terrain. */
  imageryUrl: string;
  /** Deepest imagery zoom level to request. */
  imageryMaxZoom: number;
  /** XYZ template for Terrarium-encoded elevation tiles. */
  terrainUrl: string;
  /** Deepest elevation zoom level the terrain source provides. */
  terrainMaxZoom: number;
  /** Credit line shown under the viewer while the satellite ground is on. */
  attribution: string;
}

/** The NEXT_PUBLIC_* settings, read literally so Next.js inlines them into the client bundle. */
export interface SatelliteEnv {
  NEXT_PUBLIC_SATELLITE_GROUND?: string;
  NEXT_PUBLIC_ARCGIS_API_KEY?: string;
  NEXT_PUBLIC_SATELLITE_IMAGERY_URL?: string;
  NEXT_PUBLIC_SATELLITE_MAX_ZOOM?: string;
  NEXT_PUBLIC_SATELLITE_ATTRIBUTION?: string;
  NEXT_PUBLIC_TERRAIN_TILES_URL?: string;
}

export function readSatelliteEnv(): SatelliteEnv {
  return {
    NEXT_PUBLIC_SATELLITE_GROUND: process.env.NEXT_PUBLIC_SATELLITE_GROUND,
    NEXT_PUBLIC_ARCGIS_API_KEY: process.env.NEXT_PUBLIC_ARCGIS_API_KEY,
    NEXT_PUBLIC_SATELLITE_IMAGERY_URL: process.env.NEXT_PUBLIC_SATELLITE_IMAGERY_URL,
    NEXT_PUBLIC_SATELLITE_MAX_ZOOM: process.env.NEXT_PUBLIC_SATELLITE_MAX_ZOOM,
    NEXT_PUBLIC_SATELLITE_ATTRIBUTION: process.env.NEXT_PUBLIC_SATELLITE_ATTRIBUTION,
    NEXT_PUBLIC_TERRAIN_TILES_URL: process.env.NEXT_PUBLIC_TERRAIN_TILES_URL,
  };
}

export function satelliteConfig(env: SatelliteEnv = readSatelliteEnv()): SatelliteConfig {
  const key = env.NEXT_PUBLIC_ARCGIS_API_KEY?.trim();
  const customImagery = env.NEXT_PUBLIC_SATELLITE_IMAGERY_URL?.trim();
  const imageryUrl = customImagery || (key ? `${ESRI_IMAGERY_KEYED_URL}?token=${encodeURIComponent(key)}` : ESRI_IMAGERY_URL);
  const zoom = Number.parseInt(env.NEXT_PUBLIC_SATELLITE_MAX_ZOOM ?? "", 10);
  const terrainUrl = env.NEXT_PUBLIC_TERRAIN_TILES_URL?.trim() || AWS_TERRARIUM_URL;
  const imageryCredit = env.NEXT_PUBLIC_SATELLITE_ATTRIBUTION?.trim() || (customImagery ? "" : ESRI_ATTRIBUTION);
  return {
    enabledByDefault: !/^(0|false|off|no)$/i.test(env.NEXT_PUBLIC_SATELLITE_GROUND?.trim() ?? ""),
    imageryUrl,
    imageryMaxZoom: Number.isFinite(zoom) ? Math.min(22, Math.max(10, zoom)) : 19,
    terrainUrl,
    terrainMaxZoom: 15,
    attribution: [imageryCredit, TERRAIN_ATTRIBUTION].filter(Boolean).join(" · "),
  };
}

/** Credits for the map data on screen. */
export function mapAttribution(satellite: boolean, config: SatelliteConfig = satelliteConfig()): string {
  return satellite ? `${config.attribution} · ${OSM_ATTRIBUTION}` : OSM_ATTRIBUTION;
}

export interface TileAddress {
  x: number;
  y: number;
  z: number;
}

/** Web Mercator tile holding a point, plus the point's pixel inside that tile. */
export function tileForLatLng(p: LatLng, z: number, tileSize = 256): TileAddress & { px: number; py: number } {
  const n = 2 ** z;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, p.lat));
  const latR = (lat * Math.PI) / 180;
  // Kept inside the world: the mercator limit can round a hair past the edge.
  const fx = Math.min(n - 1e-9, Math.max(0, ((p.lng + 180) / 360) * n));
  const fy = Math.min(n - 1e-9, Math.max(0, ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n));
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  return { x, y, z, px: Math.min(tileSize - 1, Math.floor((fx - x) * tileSize)), py: Math.min(tileSize - 1, Math.floor((fy - y) * tileSize)) };
}

/** Fill an XYZ url template. */
export function tileUrl(template: string, t: TileAddress): string {
  return template.replace(/{\s*z\s*}/gi, String(t.z)).replace(/{\s*x\s*}/gi, String(t.x)).replace(/{\s*y\s*}/gi, String(t.y));
}

/** Metres above sea level from a Terrarium pixel. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Mean elevation of the pixels in an RGBA block (Terrarium encoding). */
export function meanTerrarium(rgba: ArrayLike<number>): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    sum += decodeTerrarium(rgba[i], rgba[i + 1], rgba[i + 2]);
    n++;
  }
  if (!n) throw new Error("No elevation pixels");
  return sum / n;
}

/**
 * Area held level under the community (world metres around the origin). The
 * lots, OpenStreetMap buildings and trees are all drawn at y = 0, so the real
 * terrain is flattened beneath them and blends back to its true shape over
 * `falloff` metres beyond.
 */
export function flattenArea(community: Pick<Community, "lots">, contextRadius: number): { radius: number; falloff: number } {
  let far = 0;
  for (const lot of community.lots) {
    const r = Math.hypot(lot.position[0], lot.position[2]) + Math.hypot(lot.width, lot.depth) / 2;
    if (r > far) far = r;
  }
  const radius = Math.max(contextRadius * 1.1, far + 80);
  return { radius, falloff: Math.min(500, Math.max(200, radius * 0.25)) };
}
