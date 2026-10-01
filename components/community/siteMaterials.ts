import * as THREE from "three";
import type { BuildSurface } from "@/lib/geometry/siteGeometry";
import type { Lot } from "@/lib/models/community";
import type { BuildState } from "@/lib/models/construction";
import { withGroundXray } from "@/lib/materials/groundXray";
import { getSiteMaterial, siteTexture } from "@/lib/materials/materialFactory";

/** Shared, cached materials for real-world community scenes. */

function textured(key: string, pattern: "grass" | "concrete", color: string, accent: string, tile: [number, number], extra: THREE.MeshStandardMaterialParameters = {}) {
  return getSiteMaterial(key, () => {
    const tex = siteTexture(key, pattern, color, accent, tile);
    return new THREE.MeshStandardMaterial({ map: tex?.map ?? null, roughness: 0.95, ...extra });
  });
}

const flat = (key: string, params: THREE.MeshStandardMaterialParameters) => getSiteMaterial(key, () => new THREE.MeshStandardMaterial(params));
const offset = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };

// Ground-type surfaces turn see-through around the house when a basement is on show.
export const contextMaterials = {
  ground: () => withGroundXray(textured("geo-ground", "grass", "#7c9455", "#6b8449", [8, 8])),
  green: () => withGroundXray(textured("geo-green", "grass", "#86a95a", "#76984c", [6, 6], offset)),
  woods: () => withGroundXray(flat("geo-woods", { color: "#4f6b3c", roughness: 1, ...offset })),
  water: () => withGroundXray(flat("geo-water", { color: "#5d8fb0", roughness: 0.15, metalness: 0.1, envMapIntensity: 1.2, ...offset })),
  roads: () => withGroundXray(textured("geo-asphalt", "concrete", "#56585c", "#484a4e", [4, 4], { roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
  paths: () => withGroundXray(flat("geo-path", { color: "#c9c2b1", roughness: 0.95, ...offset })),
  buildings: () => flat("geo-bldg", { color: "#e6e1d8", roughness: 0.9 }),
  roofs: () => flat("geo-roof", { color: "#77777a", roughness: 0.85 }),
};

export function buildMaterial(surface: BuildSurface, color?: string): THREE.Material {
  switch (surface) {
    case "body":
      return flat(`ph-body-${color}`, { color, roughness: 0.92 });
    case "roof":
      return flat(`ph-roof-${color}`, { color, roughness: 0.9, side: THREE.DoubleSide });
    case "trim":
      return flat("ph-trim", { color: "#f1efe9", roughness: 0.6, side: THREE.DoubleSide });
    case "window":
      return flat("ph-window", { color: "#2c3a46", roughness: 0.15, metalness: 0.4, envMapIntensity: 1.5 });
    case "garage":
      return flat("ph-garage", { color: "#e9e7e1", roughness: 0.6 });
    case "door":
      return flat("ph-door", { color: "#3b3027", roughness: 0.6 });
    case "dirt":
      return flat("bs-dirt", { color: "#7d6247", roughness: 1, ...offset });
    case "pit":
      return flat("bs-pit", { color: "#4b3a2b", roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    case "concrete":
      return flat("bs-concrete", { color: "#a9a7a1", roughness: 0.95 });
    case "lumber":
      return flat("bs-lumber", { color: "#d9b47c", roughness: 0.85, side: THREE.DoubleSide });
    case "sheathing":
      return flat("bs-osb", { color: "#c49d68", roughness: 0.95 });
    case "wrap":
      return flat("bs-wrap", { color: "#eef1f2", roughness: 0.7, side: THREE.DoubleSide });
    case "foundation":
    default:
      return flat("ph-fdn", { color: "#a3a09a", roughness: 0.95 });
  }
}

export const STATUS_COLOUR: Record<NonNullable<Lot["status"]>, string> = {
  available: "#3fae6a",
  sold: "#8c96a3",
  "model-home": "#8b5cf6",
  selected: "#f0a43a",
  future: "#d9d4c4",
};

export const BUILD_STATE_COLOUR: Record<BuildState, string> = {
  none: "#d9d4c4",
  excavation: "#b07a45",
  foundation: "#9a9a96",
  framing: "#e0b25c",
  "closed-in": "#5b8fd6",
  complete: "#3fae6a",
};
