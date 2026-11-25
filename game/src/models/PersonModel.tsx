import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetEntry, lodFor } from "../assets/catalog";
import { bestLoaded, loadLod, onAssetLoaded, release, retain } from "../assets/loader";
import { CLIP_SPEED, characterFor, clipsFor, type ClipKey } from "../assets/people";
import { crowd, isPlayerOutfit } from "../assets/crowd";
import { assetTuning } from "../render/quality";
import type { Motion, Outfit, Pose } from "./human";

/**
 * A realistic person (a MakeHuman character from the asset registry) standing
 * in for the jointed figure: same props, same facing (+x), feet at y = 0. Plays
 * the shared motion-capture clips: idle, walk and run matched to ground speed,
 * sitting, driving, riding, swimming, flying and waving. Picks its LOD by
 * distance, borrows a ready-made copy from a pool, and draws the simple figure
 * (`fallback`) until the model has loaded.
 */
interface Tint {
  uniforms: { uTint: { value: THREE.Color[] }; uBase: { value: number[] }; uOn: { value: number[] }; uHide: { value: number[] } };
  outfit: Outfit | null;
}
interface Inst {
  key: string;
  tint: Tint | null;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  actions: Map<string, THREE.AnimationAction>;
  hips: THREE.Object3D | null;
  hipsRest: THREE.Quaternion;
  current: ClipKey | null;
}

const pool = new Map<string, Inst[]>();
const LIB = "people-clips";

function acquire(id: string, lod: number, g: GLTF, library: GLTF): Inst {
  const key = id + "#" + lod;
  const free = pool.get(key)?.pop();
  retain(id, lod);
  if (free) return free;
  const root = cloneSkinned(g.scene);
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) m.frustumCulled = false; // bones move the mesh outside its bind-pose bounds
  });
  const hips = root.getObjectByName("Hips") ?? null;
  const lib = assetEntry(LIB)!, me = assetEntry(id)!;
  return { key, root, tint: me.regions ? makeTintable(root) : null, mixer: new THREE.AnimationMixer(root), clips: clipsFor(library.animations, lib.rig?.hipsY ?? 1, me.rig?.hipsY ?? 1), actions: new Map(), hips, hipsRest: hips?.quaternion.clone() ?? new THREE.Quaternion(), current: null };
}

/**
 * The player's wardrobe: the base model is dressed in white, and each region
 * (skin, shirt, trousers, shoes, hair, hat, vest) is recoloured in the shader
 * to the picked colour, keeping the texture's shading (luminance), so fabric
 * folds and seams stay. The vest and its tape vanish when it's off.
 */
const REGIONS = ["skin", "shirt", "pants", "shoes", "hair", "hat", "vest", "tape"] as const;
function makeTintable(root: THREE.Object3D): Tint {
  const uniforms = { uTint: { value: Array.from({ length: 9 }, () => new THREE.Color(1, 1, 1)) }, uBase: { value: new Array(9).fill(1) }, uOn: { value: new Array(9).fill(0) }, uHide: { value: new Array(9).fill(0) } };
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh || !m.geometry.getAttribute("_region")) return;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = "attribute float _region;\nvarying float vRegion;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvRegion = _region;");
      sh.fragmentShader =
        "varying float vRegion;\nuniform vec3 uTint[9];\nuniform float uBase[9];\nuniform float uOn[9];\nuniform float uHide[9];\n" +
        sh.fragmentShader.replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          int region = int(vRegion + 0.5);
          if (uHide[region] > 0.5) discard;
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(diffuseColor.rgb, uTint[region] * min(lum / max(uBase[region], 0.02), 2.2), uOn[region]);`,
        );
    };
    mat.customProgramCacheKey = () => "caivan-tint";
    m.material = mat;
  });
  return { uniforms, outfit: null };
}

const lin = new THREE.Color();
function applyTint(t: Tint, entry: NonNullable<ReturnType<typeof assetEntry>>, o: Outfit) {
  if (t.outfit === o) return;
  t.outfit = o;
  const want: Record<string, string | undefined> = { skin: o.skin, shirt: o.shirt, pants: o.pants, shoes: o.shoes, hair: o.hair, hat: o.hat?.color, vest: o.vest };
  for (const r of REGIONS) {
    const info = entry.regions?.[r];
    if (!info) continue;
    const u = t.uniforms;
    // Base colours were measured in sRGB; the shader works in linear light.
    lin.setRGB(info.base[0], info.base[1], info.base[2], THREE.SRGBColorSpace);
    u.uBase.value[info.id] = 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
    const c = r === "tape" ? undefined : want[r];
    u.uOn.value[info.id] = c ? 1 : 0;
    if (c) u.uTint.value[info.id].set(c);
    u.uHide.value[info.id] = (r === "vest" || r === "tape") && !o.vest ? 1 : 0;
  }
}

/** The player's wardrobe base model for an outfit: by hat and hair length (hard hats cover the hair). */
const playerId = (o: Outfit) => {
  const hat = o.hat?.kind ?? "none";
  return `person-player-${hat}-${hat === "hardhat" || !o.longHair ? "short" : "long"}`;
};

function giveBack(id: string, lod: number, inst: Inst) {
  inst.mixer.stopAllAction();
  inst.current = null;
  if (inst.tint) inst.tint.outfit = null;
  inst.root.removeFromParent();
  release(id, lod);
  const list = pool.get(inst.key) ?? [];
  if (list.length < 24) list.push(inst);
  pool.set(inst.key, list);
}

/** Staggers the people's distance checks across frames. */
let stagger = 0;
const nextStagger = () => (stagger = (stagger + 3) % 8);

const SEAT: Partial<Record<ClipKey, number>> = { sit: 0.5, drive: 0.5, horse: 0.95, moto: 0.62, boat: 0.5, heli: 0.5 };
const v = new THREE.Vector3();

export function PersonModel({ outfit, motion, pose = "auto", fallback, seat }: { outfit: Outfit; motion?: Motion; pose?: Pose | (() => Pose); fallback: ReactNode; seat?: ClipKey }) {
  const id = isPlayerOutfit(outfit) && assetEntry(playerId(outfit)) ? playerId(outfit) : characterFor(outfit);
  const outer = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const inst = useRef<{ lod: number; i: Inst } | null>(null);
  // Which character has something loaded (the stand-in shows again while a new look loads).
  const [readyId, setReadyId] = useState<string | null>(null);
  const ready = readyId === id;
  const camera = useThree((s) => s.camera);
  const tick = useRef(-1);
  const want = useRef(1);
  const hidden = useRef(false);
  const acc = useRef(0);

  // Start the light LOD and the clips straight away; the detailed one loads when the camera comes near.
  useEffect(() => {
    const entry = assetEntry(id);
    if (!entry) return;
    const player = isPlayerOutfit(outfit);
    void loadLod(LIB, 0, 100);
    void loadLod(id, entry.lods.length - 1, player ? 90 : 0);
    const check = () => {
      if (bestLoaded(entry, want.current) && bestLoaded(assetEntry(LIB)!, 0)) setReadyId(id);
    };
    check();
    return onAssetLoaded(check);
  }, [id, outfit]);

  useEffect(
    () => () => {
      if (inst.current) giveBack(id, inst.current.lod, inst.current.i);
      inst.current = null;
    },
    [id],
  );

  useFrame((_, rawDt) => {
    const o = outer.current, t = turn.current;
    const entry = assetEntry(id), libEntry = assetEntry(LIB);
    if (!o || !t || !entry || !libEntry || !ready) return;
    const tune = assetTuning();
    if (tick.current < 0) tick.current = nextStagger();
    // Distance and LOD, a few times a second.
    if (tick.current++ % 8 === 0 || !inst.current) {
      o.getWorldPosition(v);
      const d = v.distanceTo(camera.position);
      hidden.current = d > tune.hideDistance;
      // Out of sight range: hand the copy back to the pool (it's reused by whoever comes into view).
      if (hidden.current && inst.current) {
        giveBack(id, inst.current.lod, inst.current.i);
        inst.current = null;
        t.visible = false;
        return;
      }
      if (hidden.current) return;
      want.current = lodFor(entry, d, tune.lodScale);
      // Nearer people load first (the player is always nearest).
      const priority = Math.max(1, 80 - d);
      const lib = bestLoaded(libEntry, 0, 100);
      const got = bestLoaded(entry, want.current, priority);
      if (lib && got && (!inst.current || inst.current.lod !== got.lod)) {
        const prevClip = inst.current?.i.current ?? null;
        if (inst.current) giveBack(id, inst.current.lod, inst.current.i);
        const i = acquire(id, got.lod, got.gltf, lib.gltf);
        t.add(i.root);
        inst.current = { lod: got.lod, i };
        if (prevClip) play(i, prevClip, 0);
      }
    }
    const cur = inst.current;
    if (!cur) return;
    if (cur.i.tint) applyTint(cur.i.tint, entry, outfit);
    t.visible = !hidden.current;
    if (hidden.current) return;

    // What to play.
    const p = typeof pose === "function" ? pose() : pose;
    const speed = Math.abs(motion?.speed?.() ?? 0);
    const air = motion?.airborne?.() ?? false;
    const ratio = (entry.rig?.hipsY ?? 1) / (libEntry.rig?.hipsY ?? 1);
    let key: ClipKey, scale = 1;
    if (p === "sit") key = seat ?? "sit";
    else if (p === "drive") key = seat ?? "drive";
    else if (p === "ride") key = seat ?? "horse";
    else if (p === "fly") key = "air";
    else if (p === "wave") key = "wave";
    else if (p === "swim") {
      // The parent lays the body flat for swimming, so even floating still is a slow, easy crawl.
      key = "swim";
      scale = THREE.MathUtils.clamp(0.35 + speed * 0.4, 0.35, 1.6);
    } else if (air) key = "air";
    else if (speed < 0.15) key = "idle";
    else if (speed < 2.6) {
      key = "walk";
      scale = THREE.MathUtils.clamp(speed / (CLIP_SPEED.walk * ratio), 0.55, 1.9);
    } else {
      key = "run";
      scale = THREE.MathUtils.clamp(speed / (CLIP_SPEED.run * ratio), 0.7, 2);
    }
    play(cur.i, key, 0.22);
    const a = cur.i.actions.get(key);
    if (a) a.timeScale = scale;

    // Far people share a small budget of animation updates per frame, and update every other frame.
    const dt = Math.min(rawDt, 0.1);
    acc.current += dt;
    const far = cur.lod > 0;
    if (far && (crowd.animated >= tune.crowd || tick.current % 2)) return;
    crowd.animated++;
    cur.i.mixer.update(acc.current);
    acc.current = 0;

    // Seated poses: put the hips where the seat is (like the jointed figure); swimming and flying: the
    // body is laid flat / leaned by the parent, so keep the hips upright here.
    const seatY = SEAT[key];
    const hips = cur.i.hips;
    if (hips && (key === "swim" || key === "tread")) hips.quaternion.copy(cur.i.hipsRest);
    t.position.set(0, 0, 0);
    if (hips && (seatY !== undefined || key === "swim" || key === "tread")) {
      t.updateMatrixWorld(true);
      hips.getWorldPosition(v);
      o.worldToLocal(v);
      t.position.set(-v.x, (seatY ?? 0.95) - v.y, -v.z);
    }
  });

  return (
    <group ref={outer}>
      {/* Ara characters face +z; the game's people face +x. */}
      <group ref={turn} rotation={[0, Math.PI / 2, 0]} />
      {!ready && fallback}
    </group>
  );
}

function play(i: Inst, key: ClipKey, fade: number) {
  if (i.current === key) return;
  const clip = i.clips.get(key) ?? i.clips.get("idle");
  if (!clip) return;
  let next = i.actions.get(key);
  if (!next) {
    next = i.mixer.clipAction(clip);
    i.actions.set(key, next);
  }
  const prev = i.current ? i.actions.get(i.current) : null;
  next.reset().setEffectiveWeight(1).play();
  if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
  else prev?.stop();
  i.current = key;
}
