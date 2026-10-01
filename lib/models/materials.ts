/**
 * Material catalogue: configurable slots (what the customer can change) and the
 * options available for each. Options are renderer-agnostic descriptions; the
 * viewer turns them into Three.js materials (see lib/materials/materialFactory).
 */

export type MaterialSlotId =
  | "exteriorBrick"
  | "exteriorStone"
  | "exteriorSiding"
  | "roof"
  | "trim"
  | "garageDoor"
  | "frontDoor"
  | "flooring"
  | "wallPaint"
  | "kitchenCabinets"
  | "countertops";

export type MaterialGroup = "exterior" | "interior";

/** Procedural texture patterns generated on a canvas (no binary assets needed). */
export type ProceduralPattern =
  | "plain"
  | "brick"
  | "stone"
  | "lap-siding"
  | "board-batten"
  | "stucco"
  | "shingle"
  | "wood-plank"
  | "tile"
  | "garage-panel"
  | "garage-modern"
  | "door-panel"
  | "door-modern"
  | "shaker"
  | "slab"
  | "concrete"
  | "grass";

export interface MaterialOption {
  id: string;
  name: string;
  category: MaterialSlotId;
  /** Optional image textures (future: real product scans). */
  textureUrl?: string;
  normalMapUrl?: string;
  roughness?: number;
  metalness?: number;
  /** Base colour (hex). For patterned options this is the dominant tone. */
  color?: string;
  pattern?: ProceduralPattern;
  /** Secondary pattern colour, e.g. mortar, grout, plank seams. */
  accentColor?: string;
  /** Metres covered by one texture tile [u, v]. Ignored for "fit" UV surfaces. */
  tileSize?: [number, number];
  /** Short supplier-style descriptor shown in the configurator. */
  description?: string;
}

export interface MaterialSlot {
  id: MaterialSlotId;
  label: string;
  group: MaterialGroup;
  description: string;
}

export const MATERIAL_SLOTS: MaterialSlot[] = [
  { id: "exteriorBrick", label: "Brick", group: "exterior", description: "Main-floor and front masonry" },
  { id: "exteriorStone", label: "Stone Accent", group: "exterior", description: "Front elevation feature stone" },
  { id: "exteriorSiding", label: "Siding & Stucco", group: "exterior", description: "Upper-floor sides and rear" },
  { id: "roof", label: "Roof Shingles", group: "exterior", description: "Architectural asphalt shingles" },
  { id: "trim", label: "Trim & Fascia", group: "exterior", description: "Window casings, fascia, soffits" },
  { id: "garageDoor", label: "Garage Door", group: "exterior", description: "Insulated sectional door" },
  { id: "frontDoor", label: "Front Door", group: "exterior", description: "Main entry door" },
  { id: "flooring", label: "Flooring", group: "interior", description: "Main and upper floor living areas" },
  { id: "wallPaint", label: "Wall Paint", group: "interior", description: "Interior wall colour" },
  { id: "kitchenCabinets", label: "Kitchen Cabinets", group: "interior", description: "Base, upper and island" },
  { id: "countertops", label: "Countertops", group: "interior", description: "Kitchen work surfaces" },
];

export const MATERIAL_OPTIONS: MaterialOption[] = [
  // Brick
  { id: "red-brick-01", name: "Heritage Red", category: "exteriorBrick", pattern: "brick", color: "#8e3b2c", accentColor: "#cfc6b8", roughness: 0.92, tileSize: [0.81, 0.45], description: "Clay brick, natural mortar" },
  { id: "grey-brick-01", name: "Ashford Grey", category: "exteriorBrick", pattern: "brick", color: "#7d7b78", accentColor: "#d8d4cc", roughness: 0.9, tileSize: [0.81, 0.45], description: "Smooth grey, light mortar" },
  { id: "white-brick-01", name: "Limewash White", category: "exteriorBrick", pattern: "brick", color: "#e7e2d9", accentColor: "#bdb7ab", roughness: 0.88, tileSize: [0.81, 0.45], description: "Painted brick, soft texture" },
  { id: "dark-brick-01", name: "Ironspot Charcoal", category: "exteriorBrick", pattern: "brick", color: "#3a3532", accentColor: "#6b665f", roughness: 0.9, tileSize: [0.81, 0.45], description: "Dark clay, charcoal mortar" },

  // Stone
  { id: "ledgestone-grey", name: "Ledgestone Grey", category: "exteriorStone", pattern: "stone", color: "#8b8984", accentColor: "#5b5955", roughness: 0.95, tileSize: [1.2, 0.9], description: "Stacked ledgestone" },
  { id: "fieldstone-buff", name: "Fieldstone Buff", category: "exteriorStone", pattern: "stone", color: "#b9a487", accentColor: "#7b6a55", roughness: 0.95, tileSize: [1.2, 0.9], description: "Warm natural fieldstone" },
  { id: "limestone-white", name: "Indiana Limestone", category: "exteriorStone", pattern: "stone", color: "#d9d1c0", accentColor: "#a59c8a", roughness: 0.85, tileSize: [1.6, 1.0], description: "Sawn limestone blocks" },
  { id: "basalt-dark", name: "Basalt Black", category: "exteriorStone", pattern: "stone", color: "#3f4143", accentColor: "#1f2022", roughness: 0.9, tileSize: [1.2, 0.9], description: "Dark modern stone" },

  // Siding / stucco
  { id: "lap-white", name: "Lap Siding – Arctic White", category: "exteriorSiding", pattern: "lap-siding", color: "#eeeeea", accentColor: "#b9b9b3", roughness: 0.7, tileSize: [2, 0.6] },
  { id: "lap-slate", name: "Lap Siding – Slate Blue", category: "exteriorSiding", pattern: "lap-siding", color: "#5e6f7d", accentColor: "#3f4c57", roughness: 0.7, tileSize: [2, 0.6] },
  { id: "lap-sage", name: "Lap Siding – Sage", category: "exteriorSiding", pattern: "lap-siding", color: "#8c9a83", accentColor: "#66735e", roughness: 0.7, tileSize: [2, 0.6] },
  { id: "bnb-black", name: "Board & Batten – Black", category: "exteriorSiding", pattern: "board-batten", color: "#2a2b2d", accentColor: "#161718", roughness: 0.6, tileSize: [1.2, 2] },
  { id: "stucco-white", name: "Stucco – Bright White", category: "exteriorSiding", pattern: "stucco", color: "#efece5", accentColor: "#d7d2c8", roughness: 0.95, tileSize: [2, 2] },
  { id: "stucco-sand", name: "Stucco – Desert Sand", category: "exteriorSiding", pattern: "stucco", color: "#cdb796", accentColor: "#b39d7c", roughness: 0.95, tileSize: [2, 2] },

  // Roof
  { id: "black-shingle", name: "Onyx Black", category: "roof", pattern: "shingle", color: "#2b2c2e", accentColor: "#151617", roughness: 0.85, tileSize: [1.0, 0.75] },
  { id: "weathered-wood", name: "Weathered Wood", category: "roof", pattern: "shingle", color: "#6a5d50", accentColor: "#433a31", roughness: 0.88, tileSize: [1.0, 0.75] },
  { id: "dual-grey", name: "Dual Grey", category: "roof", pattern: "shingle", color: "#6f7275", accentColor: "#4a4d50", roughness: 0.86, tileSize: [1.0, 0.75] },
  { id: "harbour-blue", name: "Harbour Blue", category: "roof", pattern: "shingle", color: "#3f4b59", accentColor: "#28303a", roughness: 0.86, tileSize: [1.0, 0.75] },

  // Trim
  { id: "trim-white", name: "Classic White", category: "trim", pattern: "plain", color: "#f4f3ef", roughness: 0.5 },
  { id: "trim-black", name: "Matte Black", category: "trim", pattern: "plain", color: "#202122", roughness: 0.55 },
  { id: "trim-bronze", name: "Commercial Bronze", category: "trim", pattern: "plain", color: "#4a3b2f", roughness: 0.5, metalness: 0.1 },
  { id: "trim-pebble", name: "Pebble Grey", category: "trim", pattern: "plain", color: "#a8a59d", roughness: 0.5 },

  // Garage door
  { id: "classic-white", name: "Raised Panel – White", category: "garageDoor", pattern: "garage-panel", color: "#f2f1ec", accentColor: "#c9c8c2", roughness: 0.5 },
  { id: "modern-black", name: "Modern Flush – Black", category: "garageDoor", pattern: "garage-modern", color: "#232425", accentColor: "#4b5560", roughness: 0.45, metalness: 0.2 },
  { id: "carriage-wood", name: "Carriage – Cedar", category: "garageDoor", pattern: "garage-panel", color: "#8a5a35", accentColor: "#5b3a22", roughness: 0.65 },
  { id: "modern-grey", name: "Modern Flush – Graphite", category: "garageDoor", pattern: "garage-modern", color: "#55595d", accentColor: "#7c8a96", roughness: 0.45, metalness: 0.2 },

  // Front door
  { id: "front-black", name: "Six-Panel – Black", category: "frontDoor", pattern: "door-panel", color: "#1f2021", accentColor: "#0f1010", roughness: 0.4 },
  { id: "front-oak", name: "Craftsman – Oak", category: "frontDoor", pattern: "door-panel", color: "#8b6239", accentColor: "#5f4126", roughness: 0.55 },
  { id: "front-navy", name: "Six-Panel – Navy", category: "frontDoor", pattern: "door-panel", color: "#243548", accentColor: "#152130", roughness: 0.4 },
  { id: "front-red", name: "Six-Panel – Cranberry", category: "frontDoor", pattern: "door-panel", color: "#7a1f24", accentColor: "#4c1215", roughness: 0.4 },
  { id: "front-modern", name: "Modern Pivot – Walnut", category: "frontDoor", pattern: "door-modern", color: "#5b3d27", accentColor: "#2b1c12", roughness: 0.5 },

  // Flooring
  { id: "oak-light", name: "White Oak – Natural", category: "flooring", pattern: "wood-plank", color: "#c9a77d", accentColor: "#a58460", roughness: 0.6, tileSize: [2.4, 1.2] },
  { id: "oak-smoked", name: "Smoked Oak", category: "flooring", pattern: "wood-plank", color: "#7c6249", accentColor: "#5a4533", roughness: 0.6, tileSize: [2.4, 1.2] },
  { id: "walnut", name: "American Walnut", category: "flooring", pattern: "wood-plank", color: "#5c4130", accentColor: "#3f2b1f", roughness: 0.55, tileSize: [2.4, 1.2] },
  { id: "lvp-grey", name: "Luxury Vinyl – Driftwood", category: "flooring", pattern: "wood-plank", color: "#a59d92", accentColor: "#857d72", roughness: 0.5, tileSize: [2.4, 1.2] },
  { id: "porcelain-24", name: "Porcelain 24×24 – Cloud", category: "flooring", pattern: "tile", color: "#dedbd5", accentColor: "#b9b5ad", roughness: 0.35, tileSize: [1.22, 1.22] },

  // Paint
  { id: "paint-chantilly", name: "Chantilly Lace", category: "wallPaint", pattern: "plain", color: "#f2f0ea", roughness: 0.9 },
  { id: "paint-greige", name: "Revere Pewter", category: "wallPaint", pattern: "plain", color: "#cfc7b8", roughness: 0.9 },
  { id: "paint-sage", name: "Saybrook Sage", category: "wallPaint", pattern: "plain", color: "#b4b99d", roughness: 0.9 },
  { id: "paint-hale", name: "Hale Navy", category: "wallPaint", pattern: "plain", color: "#3f4a5a", roughness: 0.9 },

  // Cabinets
  { id: "white-shaker", name: "Shaker – White", category: "kitchenCabinets", pattern: "shaker", color: "#f1f0eb", accentColor: "#cfcdc6", roughness: 0.5, tileSize: [0.6, 0.75] },
  { id: "navy-shaker", name: "Shaker – Navy", category: "kitchenCabinets", pattern: "shaker", color: "#2f3d52", accentColor: "#1d2737", roughness: 0.5, tileSize: [0.6, 0.75] },
  { id: "oak-slab", name: "Flat Slab – Rift Oak", category: "kitchenCabinets", pattern: "wood-plank", color: "#b48d63", accentColor: "#987450", roughness: 0.55, tileSize: [0.6, 0.75] },
  { id: "sage-shaker", name: "Shaker – Sage", category: "kitchenCabinets", pattern: "shaker", color: "#8f9b86", accentColor: "#6f7a67", roughness: 0.5, tileSize: [0.6, 0.75] },

  // Countertops
  { id: "quartz-white", name: "Quartz – Calacatta", category: "countertops", pattern: "slab", color: "#f2f0ec", accentColor: "#b8b4ad", roughness: 0.2, tileSize: [3, 1.5] },
  { id: "quartz-grey", name: "Quartz – Concrete Grey", category: "countertops", pattern: "slab", color: "#9b9a97", accentColor: "#7a7976", roughness: 0.3, tileSize: [3, 1.5] },
  { id: "granite-black", name: "Granite – Absolute Black", category: "countertops", pattern: "slab", color: "#1c1c1d", accentColor: "#3a3a3c", roughness: 0.15, tileSize: [3, 1.5] },
  { id: "butcher-block", name: "Butcher Block – Maple", category: "countertops", pattern: "wood-plank", color: "#c79a62", accentColor: "#a57c4a", roughness: 0.5, tileSize: [1.2, 0.6] },
];

export type MaterialSelections = Record<MaterialSlotId, string>;

export const DEFAULT_SELECTIONS: MaterialSelections = {
  exteriorBrick: "grey-brick-01",
  exteriorStone: "ledgestone-grey",
  exteriorSiding: "lap-white",
  roof: "black-shingle",
  trim: "trim-white",
  garageDoor: "modern-black",
  frontDoor: "front-black",
  flooring: "oak-light",
  wallPaint: "paint-chantilly",
  kitchenCabinets: "white-shaker",
  countertops: "quartz-white",
};

const OPTIONS_BY_ID = new Map(MATERIAL_OPTIONS.map((o) => [o.id, o]));

export function getMaterialOption(id: string): MaterialOption | undefined {
  return OPTIONS_BY_ID.get(id);
}

export function optionsForSlot(slot: MaterialSlotId): MaterialOption[] {
  return MATERIAL_OPTIONS.filter((o) => o.category === slot);
}

export function getSlot(id: MaterialSlotId): MaterialSlot {
  return MATERIAL_SLOTS.find((s) => s.id === id)!;
}

export function isMaterialSlotId(v: string): v is MaterialSlotId {
  return MATERIAL_SLOTS.some((s) => s.id === v);
}
