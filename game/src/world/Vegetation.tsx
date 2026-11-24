import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { host, TREES } from "../core/simHost";
import { bark, noBackfaceFlip } from "../render/materials";
import { leafCardTexture } from "../render/textures";
import { treeShape } from "../sim/breakables";

/**
 * Trees with "fluffy" foliage: each crown is a cloud of leaf cards (alpha-tested
 * quads painted with leaves) whose normals point out from the crown's centre,
 * so light wraps around the canopy like a real tree instead of a faceted ball.
 * Leaves sway in the wind. Every tree is instanced, and any tree the physics
 * has knocked over is drawn at its rigid body's pose until it stands back up.
 */

type Variant = 0 | 1 | 2;

function rand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unit-scale tree (scale 1) for a variant: trunk geometry and leaf-card crown geometry. */
function treeGeometry(variant: Variant) {
  const s = treeShape(variant, 1);
  const r = rand(17 + variant * 7);
  // Trunk: tapered, slightly kinked, with a couple of branches into the crown.
  const trunkParts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(s.trunkRadius * 0.55, s.trunkRadius, variant === 1 ? s.height * 0.92 : s.trunkHeight + s.canopyRadius * 0.6, 9, 4);
  trunk.translate(0, (variant === 1 ? s.height * 0.92 : s.trunkHeight + s.canopyRadius * 0.6) / 2, 0);
  trunkParts.push(trunk);
  if (variant !== 1) {
    for (let i = 0; i < 3; i++) {
      const len = s.canopyRadius * (0.7 + r() * 0.4);
      const b = new THREE.CylinderGeometry(s.trunkRadius * 0.18, s.trunkRadius * 0.35, len, 6);
      b.translate(0, len / 2, 0);
      b.rotateZ(0.6 + r() * 0.4);
      b.rotateY((i / 3) * Math.PI * 2 + r());
      b.translate(0, s.trunkHeight * (0.85 + r() * 0.2), 0);
      trunkParts.push(b);
    }
  }
  const trunkGeo = mergeGeometries(trunkParts, false)!;

  // Crown: leaf cards scattered through an ellipsoid (broadleaf) or cone layers (conifer).
  const cards: THREE.BufferGeometry[] = [];
  const centre = new THREE.Vector3(0, s.canopyY, 0);
  const n = variant === 1 ? 140 : 120;
  for (let i = 0; i < n; i++) {
    const card = new THREE.PlaneGeometry(1, 1);
    let p: THREE.Vector3;
    let size: number;
    if (variant === 1) {
      // Conifer: points on stacked cones, wider at the bottom.
      const h = r();
      const y = s.trunkHeight * 0.4 + h * (s.height - s.trunkHeight * 0.4);
      const rad = (1 - h) * s.canopyRadius * 1.15 * (0.55 + r() * 0.45);
      const a = r() * Math.PI * 2;
      p = new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad);
      size = 1.1 + (1 - h) * 1.2;
    } else {
      const u = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const rr = Math.cbrt(r()) * s.canopyRadius;
      const flat = variant === 2 ? 0.9 : 0.78;
      p = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a) * rr, u * rr * flat, Math.sqrt(1 - u * u) * Math.sin(a) * rr).add(centre);
      size = 1.5 + r() * 0.9;
    }
    card.scale(size, size, size);
    card.lookAt(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5));
    card.translate(p.x, p.y, p.z);
    // Spherical normals: light the card as if it were part of a smooth canopy.
    const pos = card.getAttribute("position");
    const nor = card.getAttribute("normal");
    const c = variant === 1 ? new THREE.Vector3(0, p.y - 0.8, 0) : centre;
    for (let k = 0; k < pos.count; k++) {
      const v = new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(c).normalize();
      nor.setXYZ(k, v.x, v.y * 0.8 + 0.2, v.z);
    }
    cards.push(card);
  }
  const crownGeo = mergeGeometries(cards, false)!;
  return { trunkGeo, crownGeo };
}

/** Leaf material with wind sway; colours vary per instance. */
function leafMaterial(kind: "broadleaf" | "needle", windUniform: { value: number }) {
  const map = leafCardTexture(kind);
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82, color: "#ffffff" });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    // Far away, mip-mapping averages leaf alpha below the cut-off and crowns go bare:
    // boost alpha with distance so canopies stay full.
    shader.fragmentShader = noBackfaceFlip(shader.fragmentShader).replace(
      "#include <alphatest_fragment>",
      "diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + smoothstep(15.0, 140.0, length(vViewPosition)) * 2.2));\n#include <alphatest_fragment>",
    );
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 iPos = vec3(0.0);
      #endif
      float sway = sin(uTime * 1.3 + iPos.x * 0.21 + iPos.z * 0.17) * 0.6 + sin(uTime * 3.7 + position.y + iPos.x) * 0.15;
      float k = max(0.0, position.y - 1.5) * 0.025;
      transformed.x += sway * k;
      transformed.z += sway * k * 0.6;`,
    );
  };
  m.customProgramCacheKey = () => `leaf-${kind}`;
  return m;
}

const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();
const LEAF_TINTS = [
  ["#6a9a38", "#5a8c2e", "#7da63c", "#628f31", "#8aa83e"],
  ["#36633a", "#2f5a33", "#3d6b3c", "#2d5530"],
  ["#76a03a", "#86ab40", "#689534", "#97b046", "#a89a3a"],
];

/** Shared wind clock for every leaf material (module-level: one world, one wind). */
const WIND = { value: 0 };

export function Vegetation() {
  const trees = TREES;
  const wind = WIND;
  const variants = useMemo(
    () =>
      ([0, 1, 2] as Variant[]).map((v) => {
        const geo = treeGeometry(v);
        const indices = trees.map((t, i) => (t.variant === v ? i : -1)).filter((i) => i >= 0);
        return { v, geo, indices, leaf: leafMaterial(v === 1 ? "needle" : "broadleaf", wind) };
      }),
    [trees, wind],
  );
  const trunkRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const crownRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  // Where each tree sits in its variant's instanced mesh.
  const slot = useMemo(() => {
    const map = new Map<number, { v: number; k: number }>();
    variants.forEach(({ v, indices }) => indices.forEach((ti, k) => map.set(ti, { v, k })));
    return map;
  }, [variants]);

  const place = (ti: number, body?: { t: { x: number; y: number; z: number }; q: { x: number; y: number; z: number; w: number } }) => {
    const t = trees[ti];
    const sl = slot.get(ti);
    if (!sl) return;
    const yaw = ((ti * 2.399) % (Math.PI * 2)) - Math.PI;
    if (body) {
      tmp.position.set(body.t.x, body.t.y, body.t.z);
      tmp.quaternion.set(body.q.x, body.q.y, body.q.z, body.q.w);
      tmp.rotateY(yaw);
    } else {
      tmp.position.set(t.position[0], t.y ?? 0, t.position[1]);
      tmp.rotation.set(0, yaw, 0);
    }
    tmp.scale.setScalar(t.scale);
    tmp.updateMatrix();
    trunkRefs.current[sl.v]?.setMatrixAt(sl.k, tmp.matrix);
    crownRefs.current[sl.v]?.setMatrixAt(sl.k, tmp.matrix);
  };

  useEffect(() => {
    variants.forEach(({ v, indices, leaf }) => {
      const crown = crownRefs.current[v];
      indices.forEach((ti, k) => {
        place(ti);
        const tints = LEAF_TINTS[v];
        crown?.setColorAt(k, tmpColor.set(tints[ti % tints.length]));
      });
      const trunk = trunkRefs.current[v];
      if (trunk) {
        trunk.instanceMatrix.needsUpdate = true;
        trunk.computeBoundingSphere();
      }
      if (crown) {
        crown.instanceMatrix.needsUpdate = true;
        if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
        crown.computeBoundingSphere();
        leaf.needsUpdate = true; // recompile with per-instance colours
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants]);

  useFrame((_, dt) => {
    WIND.value += Math.min(dt, 0.1);
    const s = host.sim;
    if (!s || s.breakables.dirtyTrees.size === 0) return;
    // Street lights share the breakables list after the trees; StreetLights handles those.
    for (const ti of s.breakables.dirtyTrees) {
      if (ti >= trees.length) continue;
      s.breakables.dirtyTrees.delete(ti);
      const tb = s.breakables.trees[ti];
      if (!tb) continue;
      if (tb.status === "standing") place(ti);
      else place(ti, { t: tb.body.translation(), q: tb.body.rotation() });
      const sl = slot.get(ti);
      if (sl) {
        const tr = trunkRefs.current[sl.v];
        const cr = crownRefs.current[sl.v];
        if (tr) tr.instanceMatrix.needsUpdate = true;
        if (cr) cr.instanceMatrix.needsUpdate = true;
      }
    }
  });

  const depth = useMemo(
    () => ({
      broadleaf: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafCardTexture("broadleaf"), alphaTest: 0.45 }),
      needle: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafCardTexture("needle"), alphaTest: 0.45 }),
    }),
    [],
  );

  return (
    <group name="Vegetation">
      {variants.map(({ v, geo, indices, leaf }) => (
        <group key={v}>
          <instancedMesh
            ref={(el) => {
              trunkRefs.current[v] = el;
            }}
            args={[geo.trunkGeo, bark(), indices.length]}
            castShadow
            receiveShadow
          />
          <instancedMesh
            ref={(el) => {
              crownRefs.current[v] = el;
            }}
            args={[geo.crownGeo, leaf, indices.length]}
            castShadow
            receiveShadow
            customDepthMaterial={v === 1 ? depth.needle : depth.broadleaf}
          />
        </group>
      ))}
    </group>
  );
}
