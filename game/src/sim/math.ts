/**
 * Small helpers shared by the simulation. Headings follow the game's convention:
 * 0 = facing +x (east), π/2 = facing +z (south). Models face +x, so a body's
 * rotation about y is −heading.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function quatFromHeading(heading: number): Quat {
  const a = -heading / 2;
  return { x: 0, y: Math.sin(a), z: 0, w: Math.cos(a) };
}

/** Rotates a vector by a unit quaternion. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

/** The heading a rotated body points at (its local +x projected onto the ground). */
export function headingOf(q: Quat): number {
  const f = rotate(q, { x: 1, y: 0, z: 0 });
  return Math.atan2(f.z, f.x);
}

/** How upright a body is: 1 = wheels down, 0 = on its side, −1 = upside down. */
export function uprightness(q: Quat): number {
  return rotate(q, { x: 0, y: 1, z: 0 }).y;
}

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Moves `value` toward `target` by at most `step`. */
export function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
