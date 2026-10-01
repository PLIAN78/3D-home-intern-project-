import type { DoorKind, Wall } from "@/lib/models/house";
import { addBox, addPane, type MeshBuilder, type SurfaceBuckets } from "./meshBuilder";
import type { SurfaceKey } from "./surfaces";
import type { WallContext } from "./generateWalls";

export interface OpeningSpan {
  id: string;
  kind: DoorKind | "window";
  /** Start / end along the wall (m from wall start). */
  a: number;
  b: number;
  /** Bottom / top relative to floor elevation. */
  bottom: number;
  top: number;
}

const FRAME = 0.06;
const FRAME_DEPTH = 0.1;
const CASING = 0.09;
const CASING_PROUD = 0.025;
const INT_CASING = 0.07;
const INT_PROUD = 0.015;

/** Range [lo, hi] on the frame's z axis lying just outside face `faceZ` toward `dir`. */
function proud(faceZ: number, dir: number, depth: number): [number, number] {
  return dir > 0 ? [faceZ, faceZ + depth] : [faceZ - depth, faceZ];
}

/** Picture-frame casing around an opening on one wall face. */
function casingRing(b: MeshBuilder, ctx: WallContext, s: OpeningSpan, faceZ: number, dir: number, width: number, depth: number, withSill: boolean) {
  const [z0, z1] = proud(faceZ, dir, depth);
  const y0 = ctx.baseY + s.bottom;
  const y1 = ctx.baseY + s.top;
  const bottom = s.bottom > 0.01 ? y0 - width : y0;
  addBox(b, ctx.frame, [s.a - width, bottom, z0], [s.a, y1 + width, z1]);
  addBox(b, ctx.frame, [s.b, bottom, z0], [s.b + width, y1 + width, z1]);
  addBox(b, ctx.frame, [s.a, y1, z0], [s.b, y1 + width, z1]);
  if (s.bottom > 0.01) {
    if (withSill) {
      const [sz0, sz1] = proud(faceZ, dir, depth + 0.04);
      addBox(b, ctx.frame, [s.a - width - 0.03, y0 - 0.06, sz0], [s.b + width + 0.03, y0, sz1]);
    } else {
      addBox(b, ctx.frame, [s.a, y0 - width, z0], [s.b, y0, z1]);
    }
  }
}

/** Frame ring inside the opening at depth zc. */
function frameRing(b: MeshBuilder, ctx: WallContext, s: OpeningSpan, zc: number, depth: number, width: number, includeSill: boolean) {
  const y0 = ctx.baseY + s.bottom;
  const y1 = ctx.baseY + s.top;
  const z0 = zc - depth / 2;
  const z1 = zc + depth / 2;
  addBox(b, ctx.frame, [s.a, y0, z0], [s.a + width, y1, z1]);
  addBox(b, ctx.frame, [s.b - width, y0, z0], [s.b, y1, z1]);
  addBox(b, ctx.frame, [s.a + width, y1 - width, z0], [s.b - width, y1, z1]);
  if (includeSill) addBox(b, ctx.frame, [s.a + width, y0, z0], [s.b - width, y0 + width, z1]);
}

/**
 * Frames, glazing, casings and door leaves for one opening. Interior doors are
 * left open (frame + casing only) so interiors stay readable in cutaway views.
 */
export function addOpeningDetails(buckets: SurfaceBuckets<SurfaceKey>, ctx: WallContext, wall: Wall, s: OpeningSpan, exterior: boolean) {
  const t = wall.thickness;
  const out = ctx.outward;
  const outerFace = out * (t / 2);
  const innerFace = -out * (t / 2);
  const isFoundation = wall.cladding === "foundation";
  // Window/door units sit just inside the veneer.
  const unitZ = exterior ? out * (t / 2 - ctx.veneer - 0.05) : 0;
  const trim = buckets.get("trim");
  const intTrim = buckets.get("interiorTrim");
  const glass = buckets.get("glass");
  const y0 = ctx.baseY + s.bottom;
  const y1 = ctx.baseY + s.top;

  if (s.kind === "opening") return;

  if (s.kind === "window") {
    frameRing(trim, ctx, s, unitZ, FRAME_DEPTH, FRAME, true);
    const w = s.b - s.a;
    if (w > 1.4) {
      const m = (s.a + s.b) / 2;
      addBox(trim, ctx.frame, [m - 0.025, y0 + FRAME, unitZ - 0.03], [m + 0.025, y1 - FRAME, unitZ + 0.03]);
    }
    if (s.top - s.bottom > 1.5) {
      const ym = y0 + (s.top - s.bottom) * 0.62;
      addBox(trim, ctx.frame, [s.a + FRAME, ym - 0.02, unitZ - 0.03], [s.b - FRAME, ym + 0.02, unitZ + 0.03]);
    }
    addPane(glass, ctx.frame, s.a + FRAME, s.b - FRAME, y0 + FRAME, y1 - FRAME, unitZ);
    if (exterior && !isFoundation) {
      casingRing(trim, ctx, s, outerFace, out, CASING, CASING_PROUD, true);
      casingRing(intTrim, ctx, s, innerFace, -out, INT_CASING, INT_PROUD, false);
    } else if (!exterior) {
      casingRing(intTrim, ctx, s, t / 2, 1, INT_CASING, INT_PROUD, false);
      casingRing(intTrim, ctx, s, -t / 2, -1, INT_CASING, INT_PROUD, false);
    }
    return;
  }

  if (s.kind === "interior") {
    // Jamb liner across the full wall thickness + casings both faces.
    frameRing(intTrim, ctx, s, 0, t + 0.004, 0.02, false);
    casingRing(intTrim, ctx, s, t / 2, 1, INT_CASING, INT_PROUD, false);
    casingRing(intTrim, ctx, s, -t / 2, -1, INT_CASING, INT_PROUD, false);
    return;
  }

  if (s.kind === "garage") {
    casingRing(trim, ctx, s, outerFace, out, 0.12, CASING_PROUD, false);
    const zc = out * (t / 2 - ctx.veneer - 0.04);
    addBox(buckets.get("garageDoor"), ctx.frame, [s.a, y0, zc - 0.025], [s.b, y1, zc + 0.025], "fit");
    return;
  }

  // Front / exterior / patio doors
  frameRing(trim, ctx, s, unitZ, FRAME_DEPTH + 0.02, 0.05, false);
  if (exterior) {
    casingRing(trim, ctx, s, outerFace, out, CASING + 0.02, CASING_PROUD, false);
    casingRing(intTrim, ctx, s, innerFace, -out, INT_CASING, INT_PROUD, false);
    // Threshold
    addBox(trim, ctx.frame, [s.a, y0, Math.min(unitZ, outerFace)], [s.b, y0 + 0.02, Math.max(unitZ, outerFace)]);
  }

  if (s.kind === "patio") {
    const m = (s.a + s.b) / 2;
    addBox(trim, ctx.frame, [m - 0.04, y0, unitZ - 0.05], [m + 0.04, y1 - 0.05, unitZ + 0.05]);
    addPane(glass, ctx.frame, s.a + 0.05, m - 0.04, y0 + 0.05, y1 - 0.05, unitZ);
    addPane(glass, ctx.frame, m + 0.04, s.b - 0.05, y0 + 0.05, y1 - 0.05, unitZ);
    return;
  }

  const leafSurface: SurfaceKey = s.kind === "front" ? "frontDoor" : "interiorTrim";
  addBox(buckets.get(leafSurface), ctx.frame, [s.a + 0.05, y0 + 0.02, unitZ - 0.025], [s.b - 0.05, y1 - 0.05, unitZ + 0.025], "fit");
  // Handle
  const hx = s.b - 0.14;
  const hz = unitZ + out * 0.045;
  addBox(buckets.get("appliance"), ctx.frame, [hx - 0.015, y0 + 0.95, hz - 0.02], [hx + 0.015, y0 + 1.15, hz + 0.02]);
}
