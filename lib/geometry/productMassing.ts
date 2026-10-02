import type { Lot } from "@/lib/models/community";
import type { RoofSection } from "@/lib/models/house";
import { FRONT_GABLE_PITCH, LOWER_PITCH, MAIN_PITCH } from "@/lib/models/autoExterior";
import { addBox, AXIS_FRAME, SurfaceBuckets } from "./meshBuilder";
import { generateRoofSection } from "./generateRoof";
import type { PlaceholderGeometry, PlaceholderSurface } from "./placeholderHouse";

/**
 * Massing for the home actually sold on a real lot, from its site-plan
 * collection and frontage: detached singles with a single or double garage
 * and a front gable bay, attached two-storey townhomes, or three-storey
 * stacked towns (Caivan's Summit Series). Sized to the lot rather than scaled.
 */

export type ProductKind = "single" | "town" | "stacked";

export interface ProductSpec {
  kind: ProductKind;
  width: number;
  depth: number;
  storeys: 2 | 3;
  garageCars: 0 | 1 | 2;
  garageSide: "left" | "right";
  key: string;
}

const STOREY = 2.9;
const BASE = 0.3;
const q = (v: number) => Math.round(v * 4) / 4;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** What is built on a lot, or null when its product isn't known (demo lots). */
export function productSpec(lot: Lot): ProductSpec | null {
  const c = lot.collection;
  if (!c) return null;
  const garageSide = lot.placeholder.garageSide;
  let spec: Omit<ProductSpec, "key">;
  if (/summit|stacked|back.?to.?back/i.test(c)) {
    spec = { kind: "stacked", width: q(clamp(lot.width - 0.05, 4.5, 9)), depth: q(clamp(lot.depth - lot.frontSetback - 1, 7, 11)), storeys: 3, garageCars: 0, garageSide };
  } else if (/town/i.test(c)) {
    spec = { kind: "town", width: q(clamp(lot.width - 0.05, 5, 9)), depth: q(clamp(lot.depth - lot.frontSetback - 5, 8, 12.5)), storeys: 2, garageCars: 1, garageSide };
  } else {
    const width = q(clamp(lot.width - 1.2, 6.5, 16));
    spec = { kind: "single", width, depth: q(clamp(lot.depth - lot.frontSetback - 7, 9, 15)), storeys: 2, garageCars: width >= 11 ? 2 : 1, garageSide };
  }
  return { ...spec, key: `${spec.kind}:${spec.width}:${spec.depth}:${spec.garageCars}:${garageSide}` };
}

export function buildProductGeometry(spec: ProductSpec): PlaceholderGeometry {
  const b = new SurfaceBuckets<PlaceholderSurface>();
  const W = spec.width;
  const D = spec.depth;
  const x0 = -W / 2;
  const x1 = W / 2;
  const H = BASE + spec.storeys * STOREY;
  const roofs: { section: RoofSection; h0: number }[] = [];

  // Garage: singles project it 1.2 m toward the street; towns keep it flush.
  const gW = spec.garageCars === 2 ? 6.1 : spec.garageCars === 1 ? Math.min(3.6, W - 1.4) : 0;
  const gProject = spec.kind === "single" ? 1.2 : 0;
  const gx0 = spec.garageSide === "left" ? x0 : x1 - gW;
  const gx1 = gx0 + gW;
  const front = D + gProject;

  addBox(b.get("foundation"), AXIS_FRAME, [x0 - 0.02, 0, -0.02], [x1 + 0.02, BASE, D + 0.02], "metric", { bottom: false });
  addBox(b.get("body"), AXIS_FRAME, [x0, BASE, 0], [x1, H, D], "metric", { bottom: false });
  if (gW && gProject) {
    addBox(b.get("body"), AXIS_FRAME, [gx0, 0, D - 0.3], [gx1, BASE + STOREY, front], "metric", { bottom: false });
    roofs.push({ section: { id: "garage", name: "Garage", type: "shed", baseFloorId: "", x: gx0, y: D, width: gW, depth: gProject, pitch: LOWER_PITCH, overhang: 0.3, highSide: "-y" }, h0: BASE + STOREY });
  }
  if (gW) {
    const gc = (gx0 + gx1) / 2;
    const dw = spec.garageCars === 2 ? 4.9 : 2.45;
    addBox(b.get("garage"), AXIS_FRAME, [gc - dw / 2, 0, front - 0.02], [gc + dw / 2, 2.15, front + 0.04], "fit");
    addBox(b.get("trim"), AXIS_FRAME, [gc - dw / 2 - 0.12, 2.15, front - 0.02], [gc + dw / 2 + 0.12, 2.3, front + 0.05]);
  }

  // Openings on the living (non-garage) side of the front, plus rear and side windows.
  const win = (cx: number, y: number, face: "front" | "rear" | "side", w = 1.3, h = 1.45, sideX = x1) => {
    const t = 0.05;
    if (face === "side") {
      const xx: [number, number] = sideX > 0 ? [sideX - 0.02, sideX + t] : [sideX - t, sideX + 0.02];
      addBox(b.get("trim"), AXIS_FRAME, [xx[0], y - 0.08, cx - w / 2 - 0.08], [xx[1] - 0.01, y + h + 0.08, cx + w / 2 + 0.08]);
      addBox(b.get("window"), AXIS_FRAME, [xx[0], y, cx - w / 2], [xx[1], y + h, cx + w / 2]);
      return;
    }
    const z = face === "front" ? D : 0;
    const zz: [number, number] = face === "front" ? [z - 0.02, z + t] : [z - t, z + 0.02];
    addBox(b.get("trim"), AXIS_FRAME, [cx - w / 2 - 0.08, y - 0.08, zz[0]], [cx + w / 2 + 0.08, y + h + 0.08, zz[1] - 0.01]);
    addBox(b.get("window"), AXIS_FRAME, [cx - w / 2, y, zz[0]], [cx + w / 2, y + h, zz[1]]);
  };
  const lx0 = gW ? (spec.garageSide === "left" ? gx1 : x0) : x0;
  const lx1 = gW ? (spec.garageSide === "left" ? x1 : gx0) : x1;
  const doors = spec.kind === "stacked" ? [x0 + 0.9, x1 - 0.9] : [spec.garageSide === "left" ? lx0 + 0.9 : lx1 - 0.9];
  for (const dx of doors) {
    addBox(b.get("door"), AXIS_FRAME, [dx - 0.48, BASE, D - 0.02], [dx + 0.48, BASE + 2.2, D + 0.06]);
    addBox(b.get("trim"), AXIS_FRAME, [dx - 0.6, BASE, D - 0.02], [dx + 0.6, BASE + 2.35, D + 0.04]);
  }
  for (let lv = 0; lv < spec.storeys; lv++) {
    const y = BASE + lv * STOREY + 0.85;
    if (lv === 0) {
      if (spec.kind !== "stacked" && lx1 - lx0 > 2.6) win(spec.garageSide === "left" ? lx1 - 1.1 : lx0 + 1.1, y, "front", Math.min(1.8, lx1 - lx0 - 2));
    } else {
      const n = Math.max(1, Math.floor(W / 3.2));
      for (let k = 0; k < n; k++) win(x0 + (W * (k + 0.5)) / n, y, "front", W / n > 2.6 ? 1.5 : 1.1);
    }
    for (const cx of W > 7 ? [x0 + W * 0.25, x1 - W * 0.25] : [0]) win(cx, y, "rear", 1.4);
    // Attached homes have no side windows.
    if (spec.kind === "single") {
      win(D * 0.35, y, "side", 1, 1.2, x1);
      win(D * 0.35, y, "side", 1, 1.2, x0);
    }
  }

  // Roofs
  if (spec.kind === "single") {
    roofs.push({ section: { id: "main", name: "Main", type: "hip", baseFloorId: "", x: x0, y: 0, width: W, depth: D, pitch: MAIN_PITCH, overhang: 0.45 }, h0: H });
    // Front-facing gable over the living-side bay, running back into the hip.
    const bw = lx1 - lx0;
    if (bw > 2.5) roofs.push({ section: { id: "gable", name: "Front gable", type: "gable", baseFloorId: "", x: lx0, y: D * 0.45, width: bw, depth: D * 0.55, pitch: FRONT_GABLE_PITCH, overhang: 0.4, ridgeAxis: "y" }, h0: H });
    // Covered front step at the door.
    const dx = doors[0];
    addBox(b.get("foundation"), AXIS_FRAME, [dx - 0.9, 0, D], [dx + 0.9, BASE, D + 1.4], "metric", { bottom: false });
    for (const cx of [dx - 0.8, dx + 0.8]) addBox(b.get("trim"), AXIS_FRAME, [cx - 0.09, BASE, D + 1.2], [cx + 0.09, BASE + STOREY - 0.1, D + 1.38]);
    roofs.push({ section: { id: "porch", name: "Porch", type: "shed", baseFloorId: "", x: dx - 0.95, y: D, width: 1.9, depth: 1.4, pitch: LOWER_PITCH, overhang: 0.2, highSide: "-y" }, h0: BASE + STOREY });
  } else if (spec.kind === "town") {
    // Ridge parallel to the street; the gable ends sit on the party walls.
    roofs.push({ section: { id: "main", name: "Main", type: "gable", baseFloorId: "", x: x0, y: 0, width: W, depth: D, pitch: MAIN_PITCH, overhang: 0.35, ridgeAxis: "x" }, h0: H });
  } else {
    roofs.push({ section: { id: "main", name: "Main", type: "hip", baseFloorId: "", x: x0, y: 0, width: W, depth: D, pitch: 0.18, overhang: 0.3 }, h0: H });
  }

  const parts = b.toSurfaces();
  for (const r of roofs)
    for (const s of generateRoofSection(r.section, r.h0).toSurfaces()) {
      const surface: PlaceholderSurface = s.surface === "roof" ? "roof" : s.surface === "trim" ? "trim" : "body";
      parts.push({ surface, geometry: s.geometry });
    }
  return {
    parts,
    planCentre: { x: 0, y: front / 2 },
    planSize: { width: W, depth: front },
    frontY: front,
    wallTop: H,
    garageDoor: { x: gW ? (gx0 + gx1) / 2 : 0, y: front },
  };
}
