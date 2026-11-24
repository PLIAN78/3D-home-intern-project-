/**
 * The countryside's shape, shared by the physics (a Rapier heightfield) and the
 * renderer, so what you see is what you drive on. Flat inside the community,
 * rolling hills beyond, with a graded road carved up to Rosa's cottage.
 * Pure functions: no three.js, no React.
 */

export type P2 = [number, number];

/** Flat community ground ends here (Chebyshev distance from the centre). */
export const FLAT_HALF = 450;
/** The physical terrain (and where you can go) extends this far. */
export const PLAY_HALF = 1000;
/** Heightfield grid spacing (m). */
export const TERRAIN_STEP = 8;

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, z: number) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    s += valueNoise(x * f, z * f) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Natural hills before any roads are cut in. */
export function naturalHeight(x: number, z: number) {
  const r = Math.max(Math.abs(x), Math.abs(z));
  const t = smoothstep(FLAT_HALF, FLAT_HALF + 500, r);
  const far = smoothstep(900, 2600, r);
  return t * (fbm(x * 0.0022, z * 0.0022) * 90 + 6) + far * 180 * fbm(x * 0.0009 + 3.1, z * 0.0009);
}

/** Rosa's cottage on the south-west hills, and where Peanut the elephant wandered off to. */
export const COTTAGE: { position: P2; heading: number } = { position: [-720, 662], heading: Math.PI * 0.25 };
export const ELEPHANT_SPOT: P2 = [-830, 455];

/** Cottage Road: from the west end of Market Street up into the hills. */
export const HILL_ROAD: P2[] = [
  [-230, 300],
  [-300, 342],
  [-382, 392],
  [-470, 446],
  [-552, 510],
  [-612, 566],
  [-664, 616],
  [COTTAGE.position[0] + 18, COTTAGE.position[1] - 14],
];
export const HILL_ROAD_WIDTH = 7;

// Road profile: sample the hills along the road, smooth it and cap the grade.
const PROFILE_STEP = 6;
const MAX_GRADE = 0.11;
const profile = (() => {
  const pts: { x: number; z: number; s: number }[] = [];
  let s = 0;
  for (let i = 0; i < HILL_ROAD.length - 1; i++) {
    const [ax, az] = HILL_ROAD[i];
    const [bx, bz] = HILL_ROAD[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(L / PROFILE_STEP));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, s: s + L * t });
    }
    s += L;
  }
  const last = HILL_ROAD[HILL_ROAD.length - 1];
  pts.push({ x: last[0], z: last[1], s });
  let h = pts.map((p) => naturalHeight(p.x, p.z));
  for (let pass = 0; pass < 40; pass++) h = h.map((v, i) => (i === 0 ? 0 : i === h.length - 1 ? v : (h[i - 1] + v * 2 + h[i + 1]) / 4));
  // Level where the road leaves town (the community ground is exactly flat).
  pts.forEach((p, i) => {
    if (Math.max(Math.abs(p.x), Math.abs(p.z)) < FLAT_HALF) h[i] = 0;
  });
  // Never steeper than MAX_GRADE, in either direction.
  for (let i = 1; i < h.length; i++) h[i] = Math.min(h[i], h[i - 1] + MAX_GRADE * PROFILE_STEP);
  for (let i = h.length - 2; i >= 0; i--) h[i] = Math.min(h[i], h[i + 1] + MAX_GRADE * PROFILE_STEP);
  h[0] = 0;
  return { pts, h, length: s };
})();

export const HILL_ROAD_LENGTH = profile.length;

/** Nearest point on the road: distance from its centre line, and how far along it is (m). */
export function nearestOnRoad(x: number, z: number) {
  let best = { d: Infinity, s: 0 };
  let s0 = 0;
  for (let i = 0; i < HILL_ROAD.length - 1; i++) {
    const [ax, az] = HILL_ROAD[i];
    const [bx, bz] = HILL_ROAD[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best.d) best = { d, s: s0 + Math.sqrt(L2) * t };
    s0 += Math.sqrt(L2);
  }
  return best;
}

/** Road surface height at distance `s` along it. */
export function roadHeightAt(s: number) {
  const i = Math.min(profile.h.length - 2, Math.max(0, Math.floor(s / PROFILE_STEP)));
  const a = profile.pts[i];
  const b = profile.pts[i + 1];
  const t = Math.min(1, Math.max(0, (s - a.s) / Math.max(1e-6, b.s - a.s)));
  return profile.h[i] + (profile.h[i + 1] - profile.h[i]) * t;
}

/** A point along the road (for placing things on it). */
export function roadPointAt(s: number): { x: number; z: number; heading: number } {
  let s0 = 0;
  for (let i = 0; i < HILL_ROAD.length - 1; i++) {
    const [ax, az] = HILL_ROAD[i];
    const [bx, bz] = HILL_ROAD[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (s <= s0 + L || i === HILL_ROAD.length - 2) {
      const t = Math.min(1, Math.max(0, (s - s0) / L));
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bz - az, bx - ax) };
    }
    s0 += L;
  }
  return { x: HILL_ROAD[0][0], z: HILL_ROAD[0][1], heading: 0 };
}

const COTTAGE_PAD = 26;
const cottageHeight = (() => {
  const end = profile.h[profile.h.length - 1];
  return end;
})();

/** Ground height anywhere: hills, with the road and the cottage yard levelled in. */
export function terrainHeight(x: number, z: number) {
  const r = Math.max(Math.abs(x), Math.abs(z));
  if (r < FLAT_HALF - 4) return 0;
  let h = naturalHeight(x, z);
  // The cottage yard first, then the road on top, so the drive meets the yard exactly.
  const dc = Math.hypot(x - COTTAGE.position[0], z - COTTAGE.position[1]);
  if (dc < COTTAGE_PAD + 22) h += (cottageHeight - h) * smoothstep(COTTAGE_PAD + 22, COTTAGE_PAD, dc);
  const road = nearestOnRoad(x, z);
  if (road.d < 34) {
    const k = smoothstep(30, HILL_ROAD_WIDTH / 2 + 2.5, road.d);
    h += (roadHeightAt(road.s) - h) * k;
  }
  return h;
}

export const COTTAGE_Y = cottageHeight;

/** Clearing in the woods where Peanut is grazing. */
const CLEARING = 26;

/**
 * Wild woodland on the hills inside the playable area: real trees (the same
 * kinds as in town, breakable like them), in bands rather than everywhere,
 * kept off the road and out of the cottage yard and Peanut's clearing.
 */
export const HILL_TREES: { position: P2; y: number; scale: number; variant: 0 | 1 | 2 }[] = (() => {
  const out: { position: P2; y: number; scale: number; variant: 0 | 1 | 2 }[] = [];
  const rand = (i: number) => hash(i * 1.37 + 0.5, i * 2.71 + 0.25);
  const edge = PLAY_HALF - 14;
  for (let i = 0; out.length < 1100 && i < 30000; i++) {
    const x = (rand(i) * 2 - 1) * edge;
    const z = (rand(i + 50000) * 2 - 1) * edge;
    if (Math.max(Math.abs(x), Math.abs(z)) < FLAT_HALF + 18) continue;
    if (fbm(x * 0.004 + 7, z * 0.004) < 0.47) continue;
    if (nearestOnRoad(x, z).d < HILL_ROAD_WIDTH / 2 + 5) continue;
    if (Math.hypot(x - COTTAGE.position[0], z - COTTAGE.position[1]) < 36) continue;
    if (Math.hypot(x - ELEPHANT_SPOT[0], z - ELEPHANT_SPOT[1]) < CLEARING) continue;
    const y = terrainHeight(x, z);
    const conifer = y > 45 || rand(i + 90000) < 0.35;
    out.push({ position: [x, z], y, scale: 0.9 + rand(i + 70000) * 0.7, variant: conifer ? 1 : rand(i + 80000) < 0.5 ? 0 : 2 });
  }
  return out;
})();

/**
 * Height of the drawn (and physical) ground at any point: the terrain grid's
 * triangles interpolated exactly as they are meshed, so things placed with it
 * sit on the surface rather than floating or sinking between grid points.
 */
export function groundAt(x: number, z: number) {
  const fx = (x + PLAY_HALF) / TERRAIN_STEP;
  const fz = (z + PLAY_HALF) / TERRAIN_STEP;
  const c = Math.floor(fx);
  const r = Math.floor(fz);
  const u = fx - c;
  const v = fz - r;
  const X = (k: number) => -PLAY_HALF + k * TERRAIN_STEP;
  const Z = (k: number) => -PLAY_HALF + k * TERRAIN_STEP;
  const ha = terrainHeight(X(c), Z(r));
  const hb = terrainHeight(X(c + 1), Z(r));
  const hd = terrainHeight(X(c), Z(r + 1));
  const he = terrainHeight(X(c + 1), Z(r + 1));
  return u + v <= 1 ? ha + (hb - ha) * u + (hd - ha) * v : he + (hd - he) * (1 - u) + (hb - he) * (1 - v);
}
