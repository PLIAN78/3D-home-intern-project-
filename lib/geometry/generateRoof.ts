import type { HouseModel, RoofSection } from "@/lib/models/house";
import { normalize, SurfaceBuckets, type MeshBuilder, type Vec3 } from "./meshBuilder";
import type { SurfaceKey } from "./surfaces";

const HEEL = 0.12; // height of roof plane above wall top at the outer wall face
const WALL_HALF = 0.15;
const FASCIA = 0.2;

/** Height of the wall top a roof section bears on. */
export function roofBaseHeight(model: HouseModel, section: RoofSection): number {
  const floor = model.floors.find((f) => f.id === section.baseFloorId);
  if (!floor) return 0;
  const ext = floor.walls.filter((w) => w.exterior);
  const h = ext.length ? Math.max(...ext.map((w) => w.height)) : floor.ceilingHeight;
  return floor.elevation + h;
}

/**
 * Local roof frame: u runs along the ridge (or along the eave for sheds), w runs
 * across it. `toWorld` maps (u, height, w) back to world (x, y, z).
 */
function frameFor(section: RoofSection) {
  let alongX: boolean;
  if (section.type === "shed") alongX = section.highSide === "-y" || section.highSide === "+y" || !section.highSide;
  else alongX = (section.ridgeAxis ?? (section.width >= section.depth ? "x" : "y")) === "x";
  const u0 = alongX ? section.x : section.y;
  const len = alongX ? section.width : section.depth;
  const w0 = alongX ? section.y : section.x;
  const span = alongX ? section.depth : section.width;
  const toWorld = (u: number, h: number, w: number): Vec3 => (alongX ? [u, h, w] : [w, h, u]);
  const uDir: Vec3 = alongX ? [1, 0, 0] : [0, 0, 1];
  const wDir: Vec3 = alongX ? [0, 0, 1] : [1, 0, 0];
  return { alongX, u0, len, w0, span, toWorld, uDir, wDir };
}

function slopeAxis(across: Vec3, pitch: number): Vec3 {
  return normalize([across[0], pitch, across[2]]);
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/** Vertical fascia band hanging below an eave/rake edge. */
function fasciaBand(b: MeshBuilder, p: Vec3, q: Vec3, outward: Vec3) {
  const pd: Vec3 = [p[0], p[1] - FASCIA, p[2]];
  const qd: Vec3 = [q[0], q[1] - FASCIA, q[2]];
  const along = normalize([q[0] - p[0], 0, q[2] - p[2]]);
  b.polygon([pd, qd, q, p], along, [0, 1, 0], outward);
}

export function generateRoof(model: HouseModel, section: RoofSection): SurfaceBuckets<SurfaceKey> {
  return generateRoofSection(section, roofBaseHeight(model, section));
}

/** Roof geometry for a plan rectangle whose supporting walls top out at height h0. */
export function generateRoofSection(section: RoofSection, h0: number): SurfaceBuckets<SurfaceKey> {
  const buckets = new SurfaceBuckets<SurfaceKey>();
  const roof = buckets.get("roof");
  const trim = buckets.get("trim");
  const gable = buckets.get("exteriorSiding");
  const f = frameFor(section);
  const p = section.pitch;
  const o = section.overhang + WALL_HALF;
  const eaveH = h0 + HEEL - p * section.overhang;
  const U0 = f.u0 - o;
  const U1 = f.u0 + f.len + o;
  const W = f.toWorld;
  const minusW = scale(f.wDir, -1);
  const minusU = scale(f.uDir, -1);

  if (section.type === "shed") {
    // Low side at the eave, rising toward the high side (which abuts a taller wall).
    const highAtStart = section.highSide === "-y" || section.highSide === "-x";
    const wLow = highAtStart ? f.w0 + f.span + o : f.w0 - o;
    const wHigh = highAtStart ? f.w0 : f.w0 + f.span;
    const run = Math.abs(wHigh - wLow);
    const hHigh = eaveH + p * run;
    const inward = highAtStart ? minusW : f.wDir;
    const slope = slopeAxis(inward, p);
    roof.polygon([W(U0, eaveH, wLow), W(U1, eaveH, wLow), W(U1, hHigh, wHigh), W(U0, hHigh, wHigh)], f.uDir, slope, [0, 1, 0]);
    // Fascia: eave + both rakes
    const outLow = highAtStart ? f.wDir : minusW;
    fasciaBand(trim, W(U0, eaveH, wLow), W(U1, eaveH, wLow), outLow);
    fasciaBand(trim, W(U0, hHigh, wHigh), W(U0, eaveH, wLow), minusU);
    fasciaBand(trim, W(U1, eaveH, wLow), W(U1, hHigh, wHigh), f.uDir);
    // Cheek infill between wall top and roof plane at each end of the wall line.
    const wallLow = highAtStart ? f.w0 + f.span + WALL_HALF : f.w0 - WALL_HALF;
    const hAtWallLow = eaveH + p * Math.abs(wallLow - wLow);
    for (const [u, out] of [[f.u0 - WALL_HALF, minusU], [f.u0 + f.len + WALL_HALF, f.uDir]] as const) {
      gable.polygon([W(u, h0, wallLow), W(u, h0, wHigh), W(u, hHigh, wHigh), W(u, hAtWallLow, wallLow)], f.wDir, [0, 1, 0], out);
    }
    // Full-depth soffit: sheds often cover open porches, so close the underside.
    const sY = eaveH - FASCIA * 0.6;
    trim.polygon([W(U0, sY, wLow), W(U1, sY, wLow), W(U1, sY, wHigh), W(U0, sY, wHigh)], f.uDir, f.wDir, [0, -1, 0]);
    return buckets;
  }

  const Wa = f.w0 - o;
  const Wb = f.w0 + f.span + o;
  const half = (Wb - Wa) / 2;
  const wc = (Wa + Wb) / 2;
  const ridgeH = eaveH + p * half;
  const isHip = section.type === "hip";
  const r0 = isHip ? Math.min(U0 + half, (U0 + U1) / 2) : U0;
  const r1 = isHip ? Math.max(U1 - half, (U0 + U1) / 2) : U1;

  // Long slopes
  roof.polygon([W(U0, eaveH, Wa), W(U1, eaveH, Wa), W(r1, ridgeH, wc), W(r0, ridgeH, wc)], f.uDir, slopeAxis(f.wDir, p), [0, 1, 0]);
  roof.polygon([W(U1, eaveH, Wb), W(U0, eaveH, Wb), W(r0, ridgeH, wc), W(r1, ridgeH, wc)], minusU, slopeAxis(minusW, p), [0, 1, 0]);

  if (isHip) {
    roof.polygon([W(U0, eaveH, Wb), W(U0, eaveH, Wa), W(r0, ridgeH, wc)], f.wDir, slopeAxis(f.uDir, p), [0, 1, 0]);
    roof.polygon([W(U1, eaveH, Wa), W(U1, eaveH, Wb), W(r1, ridgeH, wc)], minusW, slopeAxis(minusU, p), [0, 1, 0]);
    fasciaBand(trim, W(U0, eaveH, Wb), W(U0, eaveH, Wa), minusU);
    fasciaBand(trim, W(U1, eaveH, Wa), W(U1, eaveH, Wb), f.uDir);
  } else {
    // Gable end walls at the wall line, clad in siding.
    for (const [u, out] of [[f.u0 - WALL_HALF, minusU], [f.u0 + f.len + WALL_HALF, f.uDir]] as const) {
      const wl = f.w0 - WALL_HALF;
      const wr = f.w0 + f.span + WALL_HALF;
      const hw = eaveH + p * (wl - Wa);
      gable.polygon([W(u, h0, wl), W(u, h0, wr), W(u, hw, wr), W(u, ridgeH, wc), W(u, hw, wl)], f.wDir, [0, 1, 0], out);
    }
    fasciaBand(trim, W(U0, ridgeH, wc), W(U0, eaveH, Wa), minusU);
    fasciaBand(trim, W(U0, eaveH, Wb), W(U0, ridgeH, wc), minusU);
    fasciaBand(trim, W(U1, eaveH, Wa), W(U1, ridgeH, wc), f.uDir);
    fasciaBand(trim, W(U1, ridgeH, wc), W(U1, eaveH, Wb), f.uDir);
  }
  fasciaBand(trim, W(U0, eaveH, Wa), W(U1, eaveH, Wa), minusW);
  fasciaBand(trim, W(U1, eaveH, Wb), W(U0, eaveH, Wb), f.wDir);

  // Soffit ring between eave edge and outer wall face.
  const sY = eaveH - FASCIA * 0.6;
  const iu0 = f.u0 - WALL_HALF;
  const iu1 = f.u0 + f.len + WALL_HALF;
  const iw0 = f.w0 - WALL_HALF;
  const iw1 = f.w0 + f.span + WALL_HALF;
  const down: Vec3 = [0, -1, 0];
  trim.polygon([W(U0, sY, Wa), W(U1, sY, Wa), W(iu1, sY, iw0), W(iu0, sY, iw0)], f.uDir, f.wDir, down);
  trim.polygon([W(U1, sY, Wb), W(U0, sY, Wb), W(iu0, sY, iw1), W(iu1, sY, iw1)], f.uDir, f.wDir, down);
  if (isHip) {
    trim.polygon([W(U0, sY, Wb), W(U0, sY, Wa), W(iu0, sY, iw0), W(iu0, sY, iw1)], f.uDir, f.wDir, down);
    trim.polygon([W(U1, sY, Wa), W(U1, sY, Wb), W(iu1, sY, iw1), W(iu1, sY, iw0)], f.uDir, f.wDir, down);
  }
  return buckets;
}
