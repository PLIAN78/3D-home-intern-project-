/**
 * Community / site model. A community is a set of lots plus site features.
 * Positions are world metres; rotation is Euler XYZ radians. A lot's local +z
 * axis points toward its fronting street.
 *
 * Future importers (GLB site models, GIS parcels, drone photogrammetry) should
 * produce this same structure, optionally adding `siteAssets` to render.
 */

export type PlaceholderStyle = "classic" | "modern" | "craftsman" | "bungalow";

export interface Lot {
  id: string;
  /** Lot number as it appears on the site plan. */
  number: string;
  /** Centre of the lot. */
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  depth: number;
  /** Distance from the front lot line to the front-most wall of the house. */
  frontSetback: number;
  /** Customer house model id to render on this lot (replaces the placeholder). */
  houseModelId?: string;
  placeholder: {
    style: PlaceholderStyle;
    /** Hex colours for the generic massing model. */
    bodyColor: string;
    roofColor: string;
    garageSide: "left" | "right";
    storeys: 1 | 2;
  };
  status?: "available" | "sold" | "model-home" | "selected";
}

export interface Road {
  id: string;
  /** Centreline from → to (x, z). */
  from: [number, number];
  to: [number, number];
  width: number;
  sidewalkWidth: number;
  boulevardWidth: number;
}

export interface Tree {
  position: [number, number];
  scale: number;
  variant: 0 | 1 | 2;
}

export interface SiteAsset {
  id: string;
  kind: "gltf" | "photogrammetry" | "gis-parcels";
  url: string;
}

export interface Community {
  id: string;
  name: string;
  /** Plan / phase label for display. */
  phase?: string;
  lots: Lot[];
  roads: Road[];
  trees: Tree[];
  /** Placeholder for future imported context (GLB, scans, GIS). */
  siteAssets?: SiteAsset[];
}
