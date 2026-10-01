import type { LatLng } from "./geo";

/**
 * Real-world surroundings of a community, in local plan metres (x east,
 * y north) around `origin`. Produced from OpenStreetMap; other providers
 * (municipal GIS, photogrammetry) can fill the same shape.
 */

export type RoadKind = "major" | "minor" | "residential" | "service" | "path";

export interface ContextRoad {
  id: number;
  name?: string;
  kind: RoadKind;
  /** Carriageway width in metres. */
  width: number;
  points: [number, number][];
}

export interface ContextBuilding {
  id: number;
  height: number;
  points: [number, number][];
}

export interface SiteContext {
  origin: LatLng;
  radius: number;
  source: "openstreetmap";
  attribution: string;
  fetchedAt: string;
  roads: ContextRoad[];
  buildings: ContextBuilding[];
  water: [number, number][][];
  /** Parks, grass, playing fields. */
  green: [number, number][][];
  /** Woods / forest polygons (trees are scattered inside when rendered). */
  woods: [number, number][][];
}

export const ROAD_WIDTH: Record<RoadKind, number> = { major: 14, minor: 10, residential: 8.5, service: 5, path: 2 };

export function roadKind(highway: string): RoadKind | null {
  if (/^(motorway|trunk|primary|secondary)(_link)?$/.test(highway)) return "major";
  if (/^tertiary(_link)?$/.test(highway)) return "minor";
  // New subdivision streets are often still tagged construction / proposed.
  if (/^(residential|unclassified|living_street|road|construction|proposed)$/.test(highway)) return "residential";
  if (/^service$/.test(highway)) return "service";
  if (/^(footway|cycleway|path|pedestrian)$/.test(highway)) return "path";
  return null;
}

/** "LES EMMERSON DR" / "Les Emmerson Drive" → "les emmerson drive" */
export function normaliseStreetName(s: string): string {
  const abbreviations: [RegExp, string][] = [
    [/\bdr\b\.?/g, "drive"],
    [/\bst\b\.?/g, "street"],
    [/\brd\b\.?/g, "road"],
    [/\bave?\b\.?/g, "avenue"],
    [/\bcres\b\.?/g, "crescent"],
    [/\bcrt\b\.?/g, "court"],
    [/\bpl\b\.?/g, "place"],
    [/\bblvd\b\.?/g, "boulevard"],
    [/\bln\b\.?/g, "lane"],
    [/\bgr\b\.?/g, "grove"],
    [/\bpvt\b\.?/g, "private"],
    [/\bhwy\b\.?/g, "highway"],
  ];
  let n = s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, full] of abbreviations) n = n.replace(re, full);
  return n.replace(/\s+/g, " ").trim();
}
