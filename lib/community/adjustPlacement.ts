import type { Community } from "@/lib/models/community";
import { toLatLng } from "./geo";

/**
 * A hand correction of where a site plan sits on the real map: shift (world
 * metres, x east / z south), rotation about the lots' centre (radians, same
 * sense as a lot's Y rotation) and uniform scale.
 */
export interface PlacementDelta {
  dx: number;
  dz: number;
  rotation: number;
  scale: number;
}

export const NO_DELTA: PlacementDelta = { dx: 0, dz: 0, rotation: 0, scale: 1 };

export function isIdentity(d: PlacementDelta) {
  return d.dx === 0 && d.dz === 0 && d.rotation === 0 && d.scale === 1;
}

/** Apply a placement correction to every lot, block and the geo bounds. */
export function adjustPlacement(c: Community, d: PlacementDelta): Community {
  if (!c.geo || isIdentity(d)) return c;
  const b = c.geo.bounds;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const cos = Math.cos(d.rotation);
  const sin = Math.sin(d.rotation);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const tf = (x: number, z: number): [number, number] => {
    const lx = (x - cx) * d.scale;
    const lz = (z - cz) * d.scale;
    return [r2(cx + lx * cos + lz * sin + d.dx), r2(cz - lx * sin + lz * cos + d.dz)];
  };
  const origin = c.geo.origin;
  const lots = c.lots.map((l) => {
    const [x, z] = tf(l.position[0], l.position[2]);
    const ll = toLatLng(origin, { x, y: -z });
    return {
      ...l,
      position: [x, l.position[1], z] as [number, number, number],
      rotation: [l.rotation[0], l.rotation[1] + d.rotation, l.rotation[2]] as [number, number, number],
      width: r2(l.width * d.scale),
      depth: r2(l.depth * d.scale),
      polygon: l.polygon?.map(([px, pz]) => tf(px, pz)),
      latLng: { lat: Math.round(ll.lat * 1e7) / 1e7, lng: Math.round(ll.lng * 1e7) / 1e7 },
    };
  });
  const xs = lots.flatMap((l) => (l.polygon ?? [[l.position[0], l.position[2]]]).map((p) => p[0]));
  const zs = lots.flatMap((l) => (l.polygon ?? [[l.position[0], l.position[2]]]).map((p) => p[1]));
  return {
    ...c,
    lots,
    blocks: c.blocks?.map((bl) => ({ ...bl, points: bl.points.map(([px, pz]) => tf(px, pz)) })),
    geo: { ...c.geo, bounds: { minX: Math.min(...xs), minZ: Math.min(...zs), maxX: Math.max(...xs), maxZ: Math.max(...zs) } },
  };
}
