import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FIRST_LIGHT, host, LIGHTS } from "../core/simHost";
import { mat } from "../render/materials";

/**
 * Street lights along every road: a tapered steel pole, a curved arm reaching
 * over the road and a flat LED head. All drawn as two instanced meshes. A pole
 * hit by a vehicle snaps off and its instance follows its physics body until
 * the crew stands it back up.
 */

const POLE_H = 7.4;

function poleGeometry() {
  const base = new THREE.CylinderGeometry(0.2, 0.24, 0.5, 10);
  base.translate(0, 0.25, 0);
  const shaft = new THREE.CylinderGeometry(0.065, 0.11, POLE_H - 0.5, 10);
  shaft.translate(0, 0.5 + (POLE_H - 0.5) / 2, 0);
  // The arm: a gentle curve up and out over the road (+x in the light's frame).
  const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, POLE_H - 0.4, 0), new THREE.Vector3(0, POLE_H + 0.35, 0), new THREE.Vector3(0.9, POLE_H + 0.5, 0), new THREE.Vector3(2.3, POLE_H + 0.42, 0));
  const arm = new THREE.TubeGeometry(curve, 16, 0.045, 8, false);
  const head = new THREE.BoxGeometry(0.75, 0.1, 0.28);
  head.translate(2.45, POLE_H + 0.38, 0);
  return mergeGeometries([base, shaft, arm, head].map((g) => g.toNonIndexed()), false)!;
}

function lensGeometry() {
  const lens = new THREE.PlaneGeometry(0.62, 0.2);
  lens.rotateX(Math.PI / 2);
  lens.translate(2.45, POLE_H + 0.325, 0);
  return lens;
}

const tmp = new THREE.Object3D();

export function StreetLights() {
  const poles = useRef<THREE.InstancedMesh>(null);
  const lenses = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => ({ pole: poleGeometry(), lens: lensGeometry() }), []);
  const materials = useMemo(
    () => ({
      pole: mat("#5b6168", { metal: 0.55, rough: 0.42 }),
      // Lit just enough to read as a lamp in daylight, and to catch the bloom.
      lens: new THREE.MeshStandardMaterial({ color: "#fff7e6", emissive: "#ffe6b8", emissiveIntensity: 0.9, roughness: 0.3 }),
    }),
    [],
  );

  const place = (i: number, body?: { t: { x: number; y: number; z: number }; q: { x: number; y: number; z: number; w: number } }) => {
    const l = LIGHTS[i];
    // `heading` is the game's heading (forward = cos, sin); three.js yaw is its negative.
    if (body) {
      // The physics body's origin is the pole's foot, like the mesh.
      tmp.position.set(body.t.x, body.t.y, body.t.z);
      tmp.quaternion.set(body.q.x, body.q.y, body.q.z, body.q.w);
      tmp.rotateY(-l.heading);
    } else {
      tmp.position.set(l.x, 0, l.z);
      tmp.rotation.set(0, -l.heading, 0);
    }
    tmp.updateMatrix();
    poles.current?.setMatrixAt(i, tmp.matrix);
    lenses.current?.setMatrixAt(i, tmp.matrix);
  };

  useEffect(() => {
    for (let i = 0; i < LIGHTS.length; i++) place(i);
    for (const m of [poles.current, lenses.current]) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, []);

  useFrame(() => {
    const s = host.sim;
    if (!s || s.breakables.dirtyTrees.size === 0) return;
    let changed = false;
    for (const ti of s.breakables.dirtyTrees) {
      if (ti < FIRST_LIGHT) continue;
      s.breakables.dirtyTrees.delete(ti);
      const tb = s.breakables.trees[ti];
      if (!tb) continue;
      if (tb.status === "standing") place(ti - FIRST_LIGHT);
      else place(ti - FIRST_LIGHT, { t: tb.body.translation(), q: tb.body.rotation() });
      changed = true;
    }
    if (changed) {
      if (poles.current) poles.current.instanceMatrix.needsUpdate = true;
      if (lenses.current) lenses.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="StreetLights">
      <instancedMesh ref={poles} args={[geo.pole, materials.pole, LIGHTS.length]} castShadow receiveShadow />
      <instancedMesh ref={lenses} args={[geo.lens, materials.lens, LIGHTS.length]} />
    </group>
  );
}
