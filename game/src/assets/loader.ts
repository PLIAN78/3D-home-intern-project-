import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { assetEntry, lodUrl, type AssetEntry } from "./catalog";

/**
 * Loads registry assets: glTF with KTX2 (Basis) textures and Meshopt-compressed
 * geometry, all from the game's own files. Each LOD file is fetched once and
 * shared: clones reuse its geometry and materials, so a hundred houses cost one
 * set of GPU buffers. High-detail LODs nobody has drawn for a while are freed
 * when the total goes over a budget (distance-based streaming: near things load
 * their detailed LOD, far things only ever load the light one).
 */
const ktx2 = new KTX2Loader().setTranscoderPath(import.meta.env.BASE_URL + "basis/");
const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
let ready = false;

/** Called once with the renderer, so KTX2 picks the GPU's best compressed format. */
export function initAssetLoader(renderer: THREE.WebGLRenderer) {
  if (ready) return;
  ktx2.detectSupport(renderer);
  ready = true;
}

interface Slot {
  promise: Promise<GLTF>;
  gltf?: GLTF;
  bytes: number;
  /** Last time something drew from it (seconds, performance clock). */
  used: number;
  /** Live clones drawing from it right now. */
  users: number;
  /** LOD index (0 = most detailed). */
  lod: number;
}
const slots = new Map<string, Slot>();
/** Rough GPU budget for model data (file bytes x 4 for decoded textures and buffers). */
let budget = 360 * 1024 * 1024;
export const setAssetBudget = (bytes: number) => (budget = bytes);

const now = () => performance.now() / 1000;
const listeners = new Set<() => void>();
/** Something finished loading (components waiting on a LOD re-render). */
export const onAssetLoaded = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/**
 * Downloads go through a small queue (a few at a time, most urgent first), so
 * the player and nearby people load before the crowd across town.
 */
const queue: { url: string; priority: number; start: () => void }[] = [];
let active = 0;
const MAX_ACTIVE = 4;
function pump() {
  while (active < MAX_ACTIVE && queue.length) {
    queue.sort((a, b) => b.priority - a.priority);
    const job = queue.shift()!;
    active++;
    job.start();
  }
}
const queued = (url: string, priority: number) =>
  new Promise<GLTF>((resolve, reject) => {
    queue.push({
      url,
      priority,
      start: () =>
        gltf
          .loadAsync(url)
          .then(resolve, reject)
          .finally(() => {
            active--;
            pump();
          }),
    });
    pump();
  });
/** Raises a waiting download's priority (something near now needs it). */
function bump(url: string, priority: number) {
  for (const j of queue) if (j.url === url && j.priority < priority) j.priority = priority;
}

export function loadLod(id: string, lod: number, priority = 0): Promise<GLTF> | null {
  const entry = assetEntry(id);
  const l = entry?.lods[lod];
  if (!entry || !l) return null;
  const url = lodUrl(l);
  let s = slots.get(url);
  if (s) bump(url, priority);
  if (!s) {
    const slot: Slot = { bytes: l.bytes * 4, used: now(), users: 0, lod, promise: null as unknown as Promise<GLTF> };
    slot.promise = queued(url, priority).then((g) => {
      slot.gltf = g;
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      listeners.forEach((fn) => fn());
      evict();
      return g;
    });
    slot.promise.catch((e) => console.warn(`asset ${id} lod${lod} failed to load`, e));
    slots.set(url, (s = slot));
  }
  s.used = now();
  return s.promise;
}

/** The loaded glTF for a LOD, or null while it's still on the way (starts the download). */
export function peekLod(id: string, lod: number, priority = 0): GLTF | null {
  const entry = assetEntry(id);
  const l = entry?.lods[lod];
  if (!l) return null;
  const s = slots.get(lodUrl(l));
  if (!s) {
    void loadLod(id, lod, priority);
    return null;
  }
  s.used = now();
  return s.gltf ?? null;
}

/** Best loaded LOD at or coarser/finer than the wanted one, so something is always drawn once anything has loaded. */
export function bestLoaded(entry: AssetEntry, want: number, priority = 0): { gltf: GLTF; lod: number } | null {
  const order = [want, ...entry.lods.map((_, i) => i).filter((i) => i !== want).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))];
  for (const i of order) {
    const g = i === want ? peekLod(entry.id, i, priority) : peekLodQuiet(entry.id, i);
    if (g) return { gltf: g, lod: i };
  }
  return null;
}

/** A LOD if it's already loaded (doesn't start a download). */
function peekLodQuiet(id: string, lod: number): GLTF | null {
  const l = assetEntry(id)?.lods[lod];
  const s = l && slots.get(lodUrl(l));
  if (s?.gltf) s.used = now();
  return s?.gltf ?? null;
}

export function retain(id: string, lod: number) {
  const l = assetEntry(id)?.lods[lod];
  const s = l && slots.get(lodUrl(l));
  if (s) {
    s.users++;
    s.used = now();
  }
}
export function release(id: string, lod: number) {
  const l = assetEntry(id)?.lods[lod];
  const s = l && slots.get(lodUrl(l));
  if (s) {
    s.users = Math.max(0, s.users - 1);
    s.used = now();
  }
}

function dispose(g: GLTF) {
  g.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of ([] as THREE.Material[]).concat(m.material)) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

/** Frees the least recently used detailed LODs nobody is drawing until the total fits the budget. */
function evict() {
  let total = 0;
  for (const s of slots.values()) if (s.gltf) total += s.bytes;
  if (total <= budget) return;
  const idle = [...slots.entries()].filter(([, s]) => s.gltf && s.users === 0 && s.lod === 0 && now() - s.used > 20).sort((a, b) => a[1].used - b[1].used);
  for (const [url, s] of idle) {
    if (total <= budget) break;
    dispose(s.gltf!);
    slots.delete(url);
    total -= s.bytes;
  }
}

/** Loaded files, bytes and users (for the benchmark overlay and tests). */
export function assetStats() {
  let files = 0, bytes = 0, users = 0;
  for (const s of slots.values()) if (s.gltf) {
    files++;
    bytes += s.bytes / 4;
    users += s.users;
  }
  const waiting = [...slots.entries()].filter(([, s]) => !s.gltf).map(([url]) => url);
  return { files, bytes, users, pending: waiting.length, waiting: waiting.slice(0, 6) };
}
