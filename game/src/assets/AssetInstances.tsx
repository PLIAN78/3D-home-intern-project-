import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetEntry, lodFor } from "./catalog";
import { loadLod, onAssetLoaded, peekLod } from "./loader";
import { assetTuning } from "../render/quality";

/**
 * Many copies of one static asset (houses along a street, parked cars, props),
 * drawn with GPU instancing: one draw call per mesh part per LOD, however many
 * copies. Every half second each copy is sorted into the LOD its distance
 * calls for; the light LOD loads first and the detailed one only once a copy
 * is near enough to need it. `placeholder` draws until the first LOD arrives.
 */
export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Game heading (forward = cos, sin), as everywhere else in the game. */
  heading: number;
  /** Uniform scale, or per-axis (length, height, width). */
  scale?: number | [number, number, number];
  /** Paint colour for assets whose catalog lists colour variants (multiplied into the body material). */
  color?: string;
}

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4;
}

function partsOf(g: GLTF): Part[] {
  const out: Part[] = [];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh) out.push({ geometry: m.geometry, material: m.material as THREE.Material, matrix: m.matrixWorld.clone() });
  });
  return out;
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
export function placementMatrix(p: Placement, out = new THREE.Matrix4()) {
  q.setFromAxisAngle(up, -p.heading);
  const s = p.scale ?? 1;
  if (typeof s === "number") s3.set(s, s, s);
  else s3.set(s[0], s[1], s[2]);
  return out.compose(p3.set(p.x, p.y, p.z), q, s3);
}

type Built = { lod: number; mesh: THREE.InstancedMesh; part: Part };
/** Puts each copy into the LOD its distance calls for (loading that LOD if needed) and uploads the matrices. */
function sortIntoLods(id: string, list: Built[], items: Placement[], base: THREE.Matrix4[], cam: THREE.Vector3, maxDistance: number) {
  const entry = assetEntry(id)!;
  const tune = assetTuning();
  const loaded = new Set(list.map((m) => m.lod));
  const counts = new Map<THREE.InstancedMesh, number>();
  for (let k = 0; k < items.length; k++) {
    const p = items[k];
    const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
    if (d > maxDistance * tune.lodScale) continue;
    let want = lodFor(entry, d, tune.lodScale);
    if (!loaded.has(want)) {
      void loadLod(id, want, Math.max(1, 60 - d / 10));
      // Draw the nearest loaded LOD meanwhile.
      want = [...loaded].sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];
    }
    for (const m of list) {
      if (m.lod !== want) continue;
      const c = counts.get(m.mesh) ?? 0;
      m.mesh.setMatrixAt(c, m4.multiplyMatrices(base[k], m.part.matrix));
      counts.set(m.mesh, c + 1);
    }
  }
  for (const m of list) {
    m.mesh.count = counts.get(m.mesh) ?? 0;
    m.mesh.instanceMatrix.needsUpdate = true;
    m.mesh.computeBoundingSphere();
  }
}

export function AssetInstances({ id, items, castShadow = true, maxDistance = Infinity, placeholder }: { id: string; items: Placement[]; castShadow?: boolean; maxDistance?: number; placeholder?: React.ReactNode }) {
  const entry = assetEntry(id);
  const camera = useThree((s) => s.camera);
  const [version, setVersion] = useState(0);
  const lods = entry?.lods.length ?? 0;
  // Light LOD first.
  useEffect(() => {
    if (!entry) return;
    void loadLod(id, lods - 1, 5);
    return onAssetLoaded(() => setVersion((v) => v + 1));
  }, [id, entry, lods]);

  const base = useMemo(() => items.map((p) => placementMatrix(p)), [items]);
  // One InstancedMesh per part per loaded LOD, attached to the group by hand (they're plain three.js objects).
  const grp = useRef<THREE.Group>(null);
  const meshes = useRef<Built[]>([]);
  const [shown, setShown] = useState(false);
  const dirty = useRef(true);
  useEffect(() => {
    const g = grp.current;
    if (!g) return;
    const out: Built[] = [];
    for (let i = 0; i < lods; i++) {
      const gl = peekLod(id, i);
      if (!gl) continue;
      for (const part of partsOf(gl)) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, Math.max(1, items.length));
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        g.add(mesh);
        out.push({ lod: i, mesh, part });
      }
    }
    meshes.current = out;
    dirty.current = true;
    setShown(out.length > 0);
    return () => {
      for (const m of out) {
        g.remove(m.mesh);
        m.mesh.dispose();
      }
    };
  }, [id, lods, items.length, castShadow, version]);

  const lastCam = useRef(new THREE.Vector3(Infinity, 0, 0));
  const timer = useRef(0);
  useFrame((_, dt) => {
    const list = meshes.current;
    if (!entry || !list.length) return;
    timer.current += dt;
    const moved = lastCam.current.distanceToSquared(camera.position) > 64;
    if (!dirty.current && !moved && timer.current < 0.5) return;
    timer.current = 0;
    dirty.current = false;
    lastCam.current.copy(camera.position);
    sortIntoLods(id, list, items, base, camera.position, maxDistance);
  });

  if (!entry) return <>{placeholder}</>;
  return (
    <>
      <group ref={grp} name={`instances-${id}`} />
      {!shown && placeholder}
    </>
  );
}
