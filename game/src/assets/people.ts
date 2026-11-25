import * as THREE from "three";
import outfits from "../../assets-src/characters/outfits.json";
import type { Outfit } from "../models/human";
import { assetEntry } from "./catalog";

/**
 * Which realistic character stands in for a game Outfit. Every outfit in the
 * game was turned into its own character (assets-src/characters), so most
 * match exactly by colours; any other outfit gets the nearest townsperson of
 * the same build (adult/child, man/woman, worker or not).
 */
type Spec = { skin: string; shirt: string; pants: string; hat?: string; vest?: string; longHair?: boolean; kid?: boolean; old?: boolean };
const SPECS = Object.entries(outfits as Record<string, Spec | string>).filter(([k]) => k !== "_doc") as [string, Spec][];

const col = new THREE.Color(), col2 = new THREE.Color();
const dist = (a: string, b: string) => {
  col.set(a);
  col2.set(b);
  return Math.abs(col.r - col2.r) + Math.abs(col.g - col2.g) + Math.abs(col.b - col2.b);
};

const cache = new WeakMap<Outfit, string>();
export function characterFor(o: Outfit): string {
  const hit = cache.get(o);
  if (hit) return hit;
  const kid = (o.scale ?? 1) < 0.8;
  const worker = o.hat?.kind === "hardhat" || !!o.vest;
  let best = "town0", score = Infinity;
  for (const [id, s] of SPECS) {
    if (!assetEntry("person-" + id)) continue;
    const sWorker = s.hat === "hardhat" || !!s.vest;
    const d = dist(o.skin, s.skin) * 2 + dist(o.shirt, s.shirt) + dist(o.pants, s.pants) + (!!o.longHair !== !!s.longHair ? 6 : 0) + (kid !== !!s.kid ? 6 : 0) + (worker !== sWorker ? 3 : 0);
    if (d < score) {
      score = d;
      best = id;
    }
  }
  const id = "person-" + best;
  cache.set(o, id);
  return id;
}

/** The shared clip library's clip for each thing a person does (by name prefix). */
export const CLIP = {
  idle: "Idle",
  walk: "Walk",
  run: "Run",
  tread: "Tread water",
  swim: "Swim forward",
  sit: "Sit idle",
  wave: "Wave",
  drive: "Drive car",
  horse: "Ride horse",
  moto: "Ride motorcycle",
  boat: "Drive boat",
  heli: "Pilot helicopter",
  air: "Jump (in air)",
  look: "Look around",
  talk: "Talk with gestures",
  texting: "Texting",
  phone: "Phone call",
} as const;
export type ClipKey = keyof typeof CLIP;

/** Walking and running speeds (m/s) the clips were captured at, for matching cadence to ground speed. */
export const CLIP_SPEED = { walk: 1.35, run: 3.9 };

const scaled = new Map<string, Map<string, THREE.AnimationClip>>();
/**
 * The shared clips fitted to one character: the library was made on a 1.86 m
 * body, so the hips' movement is scaled to this character's hip height (the
 * joint rotations carry over as they are: every character has the same rig).
 */
export function clipsFor(library: THREE.AnimationClip[], libraryHips: number, hips: number): Map<string, THREE.AnimationClip> {
  const ratio = Math.round((hips / libraryHips) * 50) / 50;
  const key = ratio.toFixed(2);
  let m = scaled.get(key);
  if (m) return m;
  m = new Map();
  for (const c of library) {
    const clip = c.clone();
    for (const t of clip.tracks) if (t.name.endsWith(".position")) for (let i = 0; i < t.values.length; i++) t.values[i] *= ratio;
    for (const [k, prefix] of Object.entries(CLIP)) if (clip.name.startsWith(prefix)) m.set(k, clip);
  }
  scaled.set(key, m);
  return m;
}
