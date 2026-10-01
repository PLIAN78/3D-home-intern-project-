import type { LatLng } from "@/lib/community/geo";

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
  status?: LotStatus;
  /** Real lots: outline in world x/z metres (from the site plan). */
  polygon?: [number, number][];
  /** Product collection from the site-plan legend, e.g. "35′ Collection". */
  collection?: string | null;
  /** Real-world location of the lot centre. */
  latLng?: LatLng;
}

export type LotStatus = "available" | "sold" | "model-home" | "selected" | "future";

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

export interface CommunityGeo {
  /** Local plan origin (x east, y north metres; world z = −north). */
  origin: LatLng;
  /** Storage key of the cached SiteContext (OpenStreetMap surroundings). */
  contextKey: string;
  /** Extent of the lots in world metres. */
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  sitePlan: {
    url?: string;
    fileName?: string;
    /** Fit quality of the site plan onto real streets. */
    rmsMetres: number;
    confidence: number;
    matchedStreets: number;
    /** "street-names": labels snapped to named streets; "lot-shapes": lots fitted to the road network (approximate); "manual": adjusted by hand. */
    method?: "street-names" | "lot-shapes" | "manual";
    importedAt: string;
  };
}

export interface Community {
  id: string;
  name: string;
  /** Plan / phase label for display. */
  phase?: string;
  city?: string;
  region?: string;
  /** Public community page (e.g. caivan.com). */
  url?: string;
  /** Present for communities placed in the real world. */
  geo?: CommunityGeo;
  /** Unreleased future-phase parcels (world x/z outlines). */
  blocks?: { points: [number, number][]; label: string | null }[];
  collections?: { name: string; colour: string; frontageFt: number | null }[];
  lots: Lot[];
  roads: Road[];
  trees: Tree[];
  /** Placeholder for future imported context (GLB, scans, GIS). */
  siteAssets?: SiteAsset[];
}
