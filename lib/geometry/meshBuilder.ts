import * as THREE from "three";

export type Vec3 = [number, number, number];

/**
 * Accumulates raw triangles for a single surface, then emits one BufferGeometry.
 * Building directly into flat arrays (rather than creating a BoxGeometry per
 * piece and merging) keeps generation fast and draw calls low: each floor ends
 * up with one mesh per surface/material.
 */
export class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  get isEmpty() {
    return this.indices.length === 0;
  }

  private vertex(p: Vec3, n: Vec3, uv: [number, number]) {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.uvs.push(uv[0], uv[1]);
    return this.positions.length / 3 - 1;
  }

  /** Quad with CCW winding p0→p1→p2→p3 as seen from the normal side. */
  quad(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, n: Vec3, uv: [[number, number], [number, number], [number, number], [number, number]]) {
    const a = this.vertex(p0, n, uv[0]);
    const b = this.vertex(p1, n, uv[1]);
    const c = this.vertex(p2, n, uv[2]);
    const d = this.vertex(p3, n, uv[3]);
    this.indices.push(a, b, c, a, c, d);
  }

  /**
   * Planar convex polygon. Normal is computed from winding; if `upHint` is given
   * the polygon is flipped so its normal agrees with the hint.
   * UVs are projected onto (uAxis, vAxis) in metres.
   */
  polygon(points: Vec3[], uAxis: Vec3, vAxis: Vec3, upHint?: Vec3) {
    if (points.length < 3) return;
    let pts = points;
    let n = faceNormal(pts);
    if (upHint && dot(n, upHint) < 0) {
      pts = [...pts].reverse();
      n = [-n[0], -n[1], -n[2]];
    }
    const base = this.positions.length / 3;
    for (const p of pts) this.vertex(p, n, [dot(p, uAxis), dot(p, vAxis)]);
    for (let i = 1; i < pts.length - 1; i++) this.indices.push(base, base + i, base + i + 1);
  }

  /** Horizontal polygon (with optional holes) at height y, facing up or down. UVs = plan metres. */
  flatPolygon(contour: THREE.Vector2[], holes: THREE.Vector2[][], y: number, facing: "up" | "down") {
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = [...contour, ...holes.flat()];
    const n: Vec3 = facing === "up" ? [0, 1, 0] : [0, -1, 0];
    const base = this.positions.length / 3;
    for (const v of all) this.vertex([v.x, y, v.y], n, [v.x, v.y]);
    for (const t of tris) {
      // Plan (x, y) maps to world (x, z). An upward-facing triangle must be
      // clockwise in plan coordinates; fix each triangle's winding explicitly.
      const a = all[t[0]];
      const b = all[t[1]];
      const c = all[t[2]];
      const planCross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const clockwise = planCross < 0;
      if (clockwise === (facing === "up")) this.indices.push(base + t[0], base + t[1], base + t[2]);
      else this.indices.push(base + t[0], base + t[2], base + t[1]);
    }
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.indices);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

export function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function faceNormal(pts: Vec3[]): Vec3 {
  // Newell's method — robust for any planar polygon.
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const c = pts[i];
    const d = pts[(i + 1) % pts.length];
    nx += (c[1] - d[1]) * (c[2] + d[2]);
    ny += (c[2] - d[2]) * (c[0] + d[0]);
    nz += (c[0] - d[0]) * (c[1] + d[1]);
  }
  return normalize([nx, ny, nz]);
}

/**
 * A local frame lying in plan: origin (ox, oz), +x along `angle`, +z the left
 * perpendicular, +y world up. Used for walls and anything aligned to them.
 */
export interface PlanFrame {
  ox: number;
  oz: number;
  cos: number;
  sin: number;
}

export function planFrame(ox: number, oz: number, angle: number): PlanFrame {
  return { ox, oz, cos: Math.cos(angle), sin: Math.sin(angle) };
}

export const AXIS_FRAME: PlanFrame = { ox: 0, oz: 0, cos: 1, sin: 0 };

function toWorld(f: PlanFrame, lx: number, y: number, lz: number): Vec3 {
  return [f.ox + lx * f.cos - lz * f.sin, y, f.oz + lx * f.sin + lz * f.cos];
}

function dirToWorld(f: PlanFrame, lx: number, ly: number, lz: number): Vec3 {
  return [lx * f.cos - lz * f.sin, ly, lx * f.sin + lz * f.cos];
}

export type UVMode = "metric" | "fit";

/**
 * Axis-aligned box in a plan frame, given by local min/max corners
 * (x along frame, y world height, z across frame).
 *
 * "metric" UVs use local coordinates in metres so textures stay continuous
 * across adjacent pieces of the same wall. "fit" maps each face to 0..1.
 */
export function addBox(
  b: MeshBuilder,
  f: PlanFrame,
  min: Vec3,
  max: Vec3,
  uvMode: UVMode = "metric",
  /** `top` may be a separate builder, e.g. to give wall tops a section-cut colour. */
  faces: { top?: boolean | MeshBuilder; bottom?: boolean } = {},
) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  if (x1 - x0 <= 1e-4 || y1 - y0 <= 1e-4 || z1 - z0 <= 1e-4) return;
  const P = (x: number, y: number, z: number) => toWorld(f, x, y, z);
  const fit = uvMode === "fit";

  // +Z face (u = +x, v = +y)
  b.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), dirToWorld(f, 0, 0, 1),
    fit ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  // −Z face (u = −x, v = +y)
  b.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), dirToWorld(f, 0, 0, -1),
    fit ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[-x1, y0], [-x0, y0], [-x0, y1], [-x1, y1]]);
  // +X face (u = −z, v = +y)
  b.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), dirToWorld(f, 1, 0, 0),
    fit ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[-z1, y0], [-z0, y0], [-z0, y1], [-z1, y1]]);
  // −X face (u = +z, v = +y)
  b.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), dirToWorld(f, -1, 0, 0),
    fit ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[z0, y0], [z1, y0], [z1, y1], [z0, y1]]);
  // +Y face (u = +x, v = −z)
  const topBuilder = faces.top instanceof MeshBuilder ? faces.top : faces.top === false ? null : b;
  if (topBuilder)
    topBuilder.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), [0, 1, 0],
      fit ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);
  // −Y face (u = +x, v = +z)
  if (faces.bottom !== false)
    b.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), [0, -1, 0],
      fit ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
}

/** Thin vertical quad in a plan frame (e.g. glass), facing ±z of the frame. Rendered double-sided by material. */
export function addPane(b: MeshBuilder, f: PlanFrame, x0: number, x1: number, y0: number, y1: number, z: number) {
  const P = (x: number, y: number) => toWorld(f, x, y, z);
  b.quad(P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1), dirToWorld(f, 0, 0, 1), [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

/** Collects builders by surface key. */
export class SurfaceBuckets<K extends string = string> {
  private map = new Map<K, MeshBuilder>();

  get(key: K): MeshBuilder {
    let b = this.map.get(key);
    if (!b) {
      b = new MeshBuilder();
      this.map.set(key, b);
    }
    return b;
  }

  toSurfaces(): { surface: K; geometry: THREE.BufferGeometry }[] {
    const out: { surface: K; geometry: THREE.BufferGeometry }[] = [];
    for (const [surface, b] of this.map) if (!b.isEmpty) out.push({ surface, geometry: b.toGeometry() });
    return out;
  }
}
