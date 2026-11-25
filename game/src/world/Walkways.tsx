import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mat } from "../render/materials";
import { groundAt } from "./terrain";
import type { Point } from "./v6";

/** Ground height under a walkway; the default follows the terrain. */
export type Surface = (x: number, z: number) => number;
const terrain: Surface = groundAt;

/**
 * A footpath ribbon draped on the ground (or any surface): resampled every
 * `step` metres so it follows slopes, ramps and pier decks instead of
 * floating or cutting into them. Mitred at corners so the width stays even.
 */
export function pathGeometry(points: Point[], width: number, surface: Surface = terrain, lift = 0.07, step = 2) {
  const pts: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  pts.push(points.at(-1)!);
  const pos: number[] = [], idx: number[] = [];
  pts.forEach(([x, z], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    // Mitre: scale the offset at corners by 1/cos(half the turn), capped.
    let m = 1;
    if (i > 0 && i < pts.length - 1) {
      const p = pts[i - 1], q = pts[i + 1];
      const ux = x - p[0], uz = z - p[1], vx = q[0] - x, vz = q[1] - z, lu = Math.hypot(ux, uz) || 1, lv = Math.hypot(vx, vz) || 1;
      m = Math.min(2, 1 / Math.max(0.5, Math.sqrt((1 + (ux * vx + uz * vz) / (lu * lv)) / 2)));
    }
    for (const s of [-1, 1]) {
      const px = x - dz * width / 2 * s * m, pz = z + dx * width / 2 * s * m;
      pos.push(px, surface(px, pz) + lift, pz);
    }
    if (i) { const v = i * 2; idx.push(v - 2, v - 1, v, v - 1, v + 1, v); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Ribbons wind either way depending on direction; make the normals face up.
  const nrm = g.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  return g;
}

/** A paved rectangle draped on the ground on a grid of about `step` metres. */
export function plazaGeometry(r: { x0: number; z0: number; x1: number; z1: number }, surface: Surface = terrain, lift = 0.08, step = 2) {
  const nx = Math.max(1, Math.ceil((r.x1 - r.x0) / step)), nz = Math.max(1, Math.ceil((r.z1 - r.z0) / step));
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = r.x0 + (r.x1 - r.x0) * i / nx, z = r.z0 + (r.z1 - r.z0) * j / nz;
    pos.push(x, surface(x, z) + lift, z);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function Walkway({ points, width, color = "#c3bda9", surface, lift }: { points: Point[]; width: number; color?: string; surface?: Surface; lift?: number }) {
  const g = useMemo(() => pathGeometry(points, width, surface, lift), [points, width, surface, lift]);
  useEffect(() => () => g.dispose(), [g]);
  return <mesh geometry={g} material={mat(color, { rough: 0.9 })} receiveShadow />;
}

export function Plaza({ rect, color = "#cbc5b4", surface }: { rect: { x0: number; z0: number; x1: number; z1: number }; color?: string; surface?: Surface }) {
  const g = useMemo(() => plazaGeometry(rect, surface), [rect, surface]);
  useEffect(() => () => g.dispose(), [g]);
  return <mesh geometry={g} material={mat(color, { rough: 0.85 })} receiveShadow />;
}
