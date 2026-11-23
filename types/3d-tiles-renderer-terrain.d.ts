// 3d-tiles-renderer ships TerrariumMeshPlugin at runtime (see its terrainrgb example)
// but its .d.ts files don't declare it yet. Only the members this app uses are typed.
import type { ImageOverlay } from "3d-tiles-renderer/plugins";

declare module "3d-tiles-renderer/plugins" {
  interface TerrainRGBMeshPluginOptions {
    /** XYZ url template, e.g. `.../{z}/{x}/{y}.png`. */
    url: string;
    tileDimension?: number;
    maxZoom?: number;
    heightScale?: number;
    overlay?: ImageOverlay | null;
    applyOverlayTexture?: boolean;
    unlit?: boolean;
    projection?: "ellipsoid" | "source" | string;
    endCaps?: boolean;
    useRecommendedSettings?: boolean;
  }

  export class TerrariumMeshPlugin {
    constructor(options: TerrainRGBMeshPluginOptions);
    name: string;
    heightScale: number;
    /** Elevation (m) at a point in radians, from the finest loaded tile, or null. */
    sampleCartographicElevation(lat: number, lon: number): number | null;
  }
}
