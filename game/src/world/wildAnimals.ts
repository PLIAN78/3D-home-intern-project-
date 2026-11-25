import { groundAt, HILL_TREES, FLAT_HALF } from "./terrain";
import { isPaved } from "./paving";
import { WATER_LEVEL } from "./v6";
import { BEAR_DENS, DEER_MEADOWS, inCampground } from "./wilds";

/**
 * Wild animals in the hills: deer herds (with a stag) on the meadows, black
 * bears round their dens (one with a cub), foxes and rabbits along the woods.
 * Each one wanders round its home, stops to graze or look about, and the shy
 * ones run off when you come close. Pure logic; Wildlife.tsx draws them.
 */
type P = [number, number];
export type WildKind = "deer" | "stag" | "fox" | "rabbit" | "bear" | "cub";
export interface WildAnimal {
  id: number;
  kind: WildKind;
  home: P;
  /** Index of the animal this one trails behind (a cub and its mother). */
  follows?: number;
}
export interface WildState {
  x: number;
  z: number;
  /** Game heading: forward is (cos, sin). */
  heading: number;
  speed: number;
  tx: number;
  tz: number;
  /** Seconds left standing still (grazing, sniffing, looking about). */
  wait: number;
  fleeing: boolean;
  seed: number;
}

/** Walking and running speeds (m/s), how close you can get before it bolts (0 = never), wander radius and pause lengths. */
export const WILD_TUNING: Record<WildKind, { walk: number; run: number; fear: number; range: number; idle: [number, number]; grazes: boolean }> = {
  deer: { walk: 1.1, run: 9, fear: 20, range: 34, idle: [4, 11], grazes: true },
  stag: { walk: 1.2, run: 9.5, fear: 24, range: 40, idle: [4, 9], grazes: true },
  fox: { walk: 1.5, run: 7, fear: 14, range: 40, idle: [2, 6], grazes: false },
  rabbit: { walk: 1.1, run: 5.5, fear: 8, range: 12, idle: [2, 7], grazes: true },
  bear: { walk: 1.1, run: 1.1, fear: 0, range: 30, idle: [5, 12], grazes: false },
  cub: { walk: 1.3, run: 2.2, fear: 0, range: 30, idle: [1, 3], grazes: false },
};

const dry = (x: number, z: number) => groundAt(x, z) > WATER_LEVEL + 0.5;

/** Fox and rabbit homes: woodland trees out in the hills (not the paved city or the riverside rows). */
const woods = HILL_TREES.filter((t) => {
  const [x, z] = t.position;
  return Math.max(Math.abs(x), Math.abs(z)) > FLAT_HALF + 30 && !isPaved(x, z, t.y) && dry(x, z) && !inCampground(x, z, 20);
});

export const WILD_ANIMALS: WildAnimal[] = (() => {
  const out: WildAnimal[] = [];
  const add = (kind: WildKind, home: P, follows?: number) => out.push({ id: out.length, kind, home, follows });
  DEER_MEADOWS.forEach((m, i) => {
    for (let k = 0; k < 3; k++) add(k === 0 && i % 2 === 0 ? "stag" : "deer", [m[0] + Math.cos(k * 2.1 + i) * 6, m[1] + Math.sin(k * 2.1 + i) * 6]);
  });
  BEAR_DENS.forEach((d, i) => {
    add("bear", d);
    if (i === 0) add("cub", [d[0] + 3, d[1] + 2], out.length - 1);
  });
  for (let k = 0; k < 8; k++) add("fox", woods[Math.floor(((k + 0.5) / 8) * woods.length)].position);
  for (let k = 0; k < 14; k++) {
    const t = woods[Math.floor(((k + 0.25) / 14) * woods.length)].position;
    add("rabbit", [t[0] + 4, t[1] + 3]);
  }
  return out;
})();

const rand = (s: WildState) => (s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0) / 4294967296;

function pickTarget(a: WildAnimal, s: WildState) {
  const range = WILD_TUNING[a.kind].range;
  for (let i = 0; i < 8; i++) {
    const ang = rand(s) * Math.PI * 2, r = Math.sqrt(rand(s)) * range;
    const x = a.home[0] + Math.cos(ang) * r, z = a.home[1] + Math.sin(ang) * r;
    if (dry(x, z) && !inCampground(x, z, a.kind === "bear" || a.kind === "cub" ? 40 : 2)) {
      s.tx = x;
      s.tz = z;
      return;
    }
  }
  s.tx = a.home[0];
  s.tz = a.home[1];
}

export function initWild(a: WildAnimal): WildState {
  const s: WildState = { x: a.home[0], z: a.home[1], heading: (a.id * 2.399) % (Math.PI * 2), speed: 0, tx: a.home[0], tz: a.home[1], wait: 0, fleeing: false, seed: (a.id * 2654435761) >>> 0 || 1 };
  const [lo, hi] = WILD_TUNING[a.kind].idle;
  s.wait = lo + rand(s) * (hi - lo);
  return s;
}

/** Advances one animal by `dt`: wander, pause, or bolt from the player; `leader` is the mother a cub trails. */
export function stepWild(a: WildAnimal, s: WildState, dt: number, player: { x: number; z: number }, leader?: WildState) {
  const tune = WILD_TUNING[a.kind];
  const px = player.x - s.x, pz = player.z - s.z, near = Math.hypot(px, pz);
  if (leader) {
    // Trail a few metres behind the mother.
    s.tx = leader.x - Math.cos(leader.heading) * 3.2 + Math.cos(leader.heading + Math.PI / 2) * 1.2;
    s.tz = leader.z - Math.sin(leader.heading) * 3.2 + Math.sin(leader.heading + Math.PI / 2) * 1.2;
    s.wait = Math.hypot(s.tx - s.x, s.tz - s.z) < 1.5 ? 0.5 : 0;
  } else if (tune.fear && near < tune.fear) {
    // Bolt directly away, curving back toward home if it strays too far.
    const away = Math.atan2(-pz, -px), toHome = Math.atan2(a.home[1] - s.z, a.home[0] - s.x);
    const stray = Math.hypot(s.x - a.home[0], s.z - a.home[1]) / (tune.range * 2);
    const dir = away + Math.atan2(Math.sin(toHome - away), Math.cos(toHome - away)) * Math.min(0.8, Math.max(0, stray - 0.5));
    s.tx = s.x + Math.cos(dir) * 20;
    s.tz = s.z + Math.sin(dir) * 20;
    s.fleeing = true;
    s.wait = 0;
  } else if (s.fleeing && near > tune.fear * 1.6) {
    s.fleeing = false;
    s.wait = tune.idle[0] + rand(s) * (tune.idle[1] - tune.idle[0]);
  }
  if (s.wait > 0) {
    s.wait -= dt;
    s.speed = Math.max(0, s.speed - 6 * dt);
    if (s.wait <= 0 && !leader) pickTarget(a, s);
    return s;
  }
  const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
  const fast = s.fleeing || (leader && d > 6);
  if (d < (fast ? 0.6 : 1.2)) {
    if (!s.fleeing) s.wait = tune.idle[0] + rand(s) * (tune.idle[1] - tune.idle[0]);
    return s;
  }
  // Turn toward the target (quicker when running), then accelerate up to walking or running pace.
  const want = Math.atan2(dz, dx);
  const turn = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
  const rate = (s.fleeing ? 5 : 2.2) * dt;
  s.heading += Math.max(-rate, Math.min(rate, turn));
  const target = (fast ? tune.run : tune.walk) * (Math.abs(turn) > 1.2 ? 0.4 : 1);
  s.speed += Math.max(-6 * dt, Math.min(4 * dt, target - s.speed));
  const nx = s.x + Math.cos(s.heading) * s.speed * dt, nz = s.z + Math.sin(s.heading) * s.speed * dt;
  if (!dry(nx, nz)) {
    // Water ahead: stop and head back home.
    s.speed = 0;
    s.tx = a.home[0];
    s.tz = a.home[1];
    return s;
  }
  s.x = nx;
  s.z = nz;
  return s;
}
