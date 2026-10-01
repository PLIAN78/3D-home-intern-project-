"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Tree } from "@/lib/models/community";

const GREENS = ["#4f6b3a", "#5d7a40", "#3f5c35", "#6b8248", "#557243"];
const CONIFERS = ["#2f4a33", "#36533a", "#2a4230"];

/**
 * All trees in three instanced draw calls (trunks, broadleaf canopies, conifers).
 */
export function Trees({ trees }: { trees: Tree[] }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const roundRef = useRef<THREE.InstancedMesh>(null);
  const coneRef = useRef<THREE.InstancedMesh>(null);

  const { trunkGeo, roundGeo, coneGeo, trunkMat, canopyMat } = useMemo(() => {
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 2.4, 6);
    trunkGeo.translate(0, 1.2, 0);
    const roundGeo = new THREE.IcosahedronGeometry(1.85, 1);
    roundGeo.translate(0, 3.8, 0);
    const coneGeo = new THREE.ConeGeometry(1.7, 5.2, 8);
    coneGeo.translate(0, 4.3, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#5a4636", roughness: 1 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, flatShading: true });
    return { trunkGeo, roundGeo, coneGeo, trunkMat, canopyMat };
  }, []);

  useEffect(
    () => () => {
      trunkGeo.dispose();
      roundGeo.dispose();
      coneGeo.dispose();
      trunkMat.dispose();
      canopyMat.dispose();
    },
    [trunkGeo, roundGeo, coneGeo, trunkMat, canopyMat],
  );

  const round = useMemo(() => trees.filter((t) => t.variant !== 1), [trees]);
  const cones = useMemo(() => trees.filter((t) => t.variant === 1), [trees]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    trees.forEach((t, i) => {
      q.setFromAxisAngle(up, (i * 2.399) % (Math.PI * 2));
      s.setScalar(t.scale);
      p.set(t.position[0], 0, t.position[1]);
      m.compose(p, q, s);
      trunkRef.current?.setMatrixAt(i, m);
    });
    round.forEach((t, i) => {
      q.setFromAxisAngle(up, i * 1.7);
      const sc = t.scale * (t.variant === 2 ? 0.8 : 1);
      s.set(sc, sc * (0.9 + ((i * 7) % 5) * 0.05), sc);
      p.set(t.position[0], 0, t.position[1]);
      m.compose(p, q, s);
      roundRef.current?.setMatrixAt(i, m);
      roundRef.current?.setColorAt(i, c.set(GREENS[i % GREENS.length]));
    });
    cones.forEach((t, i) => {
      q.setFromAxisAngle(up, i);
      s.setScalar(t.scale);
      p.set(t.position[0], 0, t.position[1]);
      m.compose(p, q, s);
      coneRef.current?.setMatrixAt(i, m);
      coneRef.current?.setColorAt(i, c.set(CONIFERS[i % CONIFERS.length]));
    });
    for (const r of [trunkRef, roundRef, coneRef]) {
      if (!r.current) continue;
      r.current.instanceMatrix.needsUpdate = true;
      if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
      r.current.computeBoundingSphere();
    }
  }, [trees, round, cones]);

  return (
    <group name="Trees">
      <instancedMesh ref={trunkRef} args={[trunkGeo, trunkMat, trees.length]} castShadow receiveShadow />
      <instancedMesh ref={roundRef} args={[roundGeo, canopyMat, Math.max(1, round.length)]} castShadow receiveShadow />
      <instancedMesh ref={coneRef} args={[coneGeo, canopyMat, Math.max(1, cones.length)]} castShadow receiveShadow />
    </group>
  );
}
