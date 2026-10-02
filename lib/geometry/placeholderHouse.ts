import type * as THREE from "three";
import type { Lot, PlaceholderStyle } from "@/lib/models/community";
import type { RoofSection } from "@/lib/models/house";
import { addBox, AXIS_FRAME, SurfaceBuckets } from "./meshBuilder";
import { generateRoofSection } from "./generateRoof";
import { buildProductGeometry, productSpec } from "./productMassing";

export type PlaceholderSurface = "body" | "roof" | "trim" | "window" | "garage" | "door" | "foundation";

export interface PlaceholderGeometry {
  parts: { surface: PlaceholderSurface; geometry: THREE.BufferGeometry }[];
  planCentre: { x: number; y: number };
  planSize: { width: number; depth: number };
  frontY: number;
  wallTop: number;
  garageDoor: { x: number; y: number };
}

const STOREY = 2.9;
const BASE = 0.3;

/**
 * Generic massing model for neighbouring / base homes: body, projecting garage,
 * roof, and a few openings. Deliberately simple — it's context, not product.
 */
export function buildPlaceholderGeometry(style: PlaceholderStyle, storeys: 1 | 2, garageSide: "left" | "right"): PlaceholderGeometry {
  const b = new SurfaceBuckets<PlaceholderSurface>();
  const W = style === "bungalow" ? 12.5 : 11;
  const D = 10;
  const x0 = -W / 2;
  const x1 = W / 2;
  const levels = style === "bungalow" ? 1 : storeys;
  const H = BASE + levels * STOREY;
  const gW = 6.2;
  const gx0 = garageSide === "left" ? x0 : x1 - gW;
  const gx1 = gx0 + gW;
  const gFront = D + 1.5;
  const gH = BASE + STOREY;

  const body = b.get("body");
  addBox(b.get("foundation"), AXIS_FRAME, [x0 - 0.02, 0, 0 - 0.02], [x1 + 0.02, BASE, D + 0.02], "metric", { bottom: false });
  addBox(body, AXIS_FRAME, [x0, BASE, 0], [x1, H, D], "metric", { bottom: false });
  addBox(body, AXIS_FRAME, [gx0, 0, D - 4], [gx1, gH, gFront], "metric", { bottom: false });

  // Garage door
  const gc = (gx0 + gx1) / 2;
  addBox(b.get("garage"), AXIS_FRAME, [gc - 2.45, 0, gFront - 0.02], [gc + 2.45, 2.2, gFront + 0.04], "fit");
  addBox(b.get("trim"), AXIS_FRAME, [gc - 2.6, 2.2, gFront - 0.02], [gc + 2.6, 2.35, gFront + 0.05]);

  // Front door + windows on the non-garage side
  const sx0 = garageSide === "left" ? gx1 : x0;
  const sx1 = garageSide === "left" ? x1 : gx0;
  const doorX = garageSide === "left" ? sx0 + 1.2 : sx1 - 1.2;
  addBox(b.get("door"), AXIS_FRAME, [doorX - 0.5, BASE, D - 0.02], [doorX + 0.5, BASE + 2.2, D + 0.06]);
  addBox(b.get("trim"), AXIS_FRAME, [doorX - 0.62, BASE, D - 0.02], [doorX + 0.62, BASE + 2.35, D + 0.04]);
  const win = (cx: number, y: number, face: "front" | "rear" | "left" | "right", w = 1.3, h = 1.45) => {
    const t = 0.05;
    if (face === "front" || face === "rear") {
      const z = face === "front" ? D : 0;
      const zz: [number, number] = face === "front" ? [z - 0.02, z + t] : [z - t, z + 0.02];
      addBox(b.get("trim"), AXIS_FRAME, [cx - w / 2 - 0.08, y - 0.08, zz[0]], [cx + w / 2 + 0.08, y + h + 0.08, zz[1] - 0.01]);
      addBox(b.get("window"), AXIS_FRAME, [cx - w / 2, y, zz[0]], [cx + w / 2, y + h, zz[1]]);
    } else {
      const x = face === "right" ? x1 : x0;
      const xx: [number, number] = face === "right" ? [x - 0.02, x + t] : [x - t, x + 0.02];
      addBox(b.get("trim"), AXIS_FRAME, [xx[0], y - 0.08, cx - w / 2 - 0.08], [xx[1] - 0.01, y + h + 0.08, cx + w / 2 + 0.08]);
      addBox(b.get("window"), AXIS_FRAME, [xx[0], y, cx - w / 2], [xx[1], y + h, cx + w / 2]);
    }
  };
  for (let lv = 0; lv < levels; lv++) {
    const y = BASE + lv * STOREY + 0.85;
    if (lv === 0) {
      const wx = garageSide === "left" ? sx1 - 1.4 : sx0 + 1.4;
      if (sx1 - sx0 > 3.2) win(wx, y, "front", 1.6);
    } else {
      for (const cx of [x0 + 1.6, (x0 + x1) / 2, x1 - 1.6]) win(cx, y, "front");
    }
    for (const cx of [x0 + 2.2, x1 - 2.2]) win(cx, y, "rear", 1.4);
    win(D * 0.3, y, garageSide === "left" ? "right" : "left");
    win(D * 0.3, y, garageSide === "left" ? "left" : "right", 1.0);
  }

  // Roofs
  const pitch = style === "modern" ? 0.22 : style === "craftsman" ? 0.62 : 0.5;
  const type: RoofSection["type"] = style === "craftsman" ? "gable" : "hip";
  const main: RoofSection = { id: "main", name: "Main", type, baseFloorId: "", x: x0, y: 0, width: W, depth: D, pitch, overhang: 0.45, ridgeAxis: "x" };
  const roofParts = generateRoofSection(main, H);
  const garageRoof: RoofSection =
    levels === 1
      ? { id: "g", name: "Garage", type: "hip", baseFloorId: "", x: gx0, y: D - 4, width: gW, depth: gFront - (D - 4), pitch, overhang: 0.35, ridgeAxis: "y" }
      : { id: "g", name: "Garage", type: "shed", baseFloorId: "", x: gx0, y: D, width: gW, depth: gFront - D, pitch: 0.33, overhang: 0.35, highSide: "-y" };
  const gParts = generateRoofSection(garageRoof, gH);

  const parts = b.toSurfaces();
  for (const src of [roofParts, gParts]) {
    for (const s of src.toSurfaces()) {
      const surface: PlaceholderSurface = s.surface === "roof" ? "roof" : s.surface === "trim" ? "trim" : "body";
      parts.push({ surface, geometry: s.geometry });
    }
  }

  return {
    parts,
    planCentre: { x: 0, y: gFront / 2 },
    planSize: { width: W, depth: gFront },
    frontY: gFront,
    wallTop: H,
    garageDoor: { x: gc, y: gFront },
  };
}

const cache = new Map<string, PlaceholderGeometry>();

/**
 * Geometry for the home on a lot, shared between lots with the same massing:
 * the product sold on it when its collection is known (real communities),
 * otherwise a generic style-based house (demo streets).
 */
export function placeholderFor(lot: Lot): PlaceholderGeometry {
  const product = productSpec(lot);
  const { style, storeys, garageSide } = lot.placeholder;
  const key = product ? `product:${product.key}` : `${style}:${storeys}:${garageSide}`;
  let g = cache.get(key);
  if (!g) {
    g = product ? buildProductGeometry(product) : buildPlaceholderGeometry(style, storeys, garageSide);
    cache.set(key, g);
  }
  return g;
}

/** Storeys of the home on a lot (for construction-stage framing). */
export function storeysFor(lot: Lot): number {
  return productSpec(lot)?.storeys ?? lot.placeholder.storeys;
}
