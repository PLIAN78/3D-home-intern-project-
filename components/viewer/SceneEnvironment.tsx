"use client";

import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Environment, Lightformer, Sky } from "@react-three/drei";
import * as THREE from "three";
import type { V3 } from "@/lib/viewer/placement";
import type { ViewMode } from "@/stores/viewerStore";

/** Late-morning sun from the south-east (relative to the scene). */
const SUN_DIR = new THREE.Vector3(0.55, 0.78, 0.42).normalize();

interface Props {
  focus: V3;
  mode: ViewMode;
}

export function SceneEnvironment({ focus, mode }: Props) {
  const light = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  const target = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  // Keep the shadow frustum tight around what the camera is framing.
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const extent = mode === "house" ? 24 : 85;
    const cam = l.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 1;
    cam.far = 260;
    cam.updateProjectionMatrix();
    target.position.set(focus[0], 0, focus[2]);
    target.updateMatrixWorld();
    l.target = target;
    l.position.set(focus[0] + SUN_DIR.x * 110, SUN_DIR.y * 110, focus[2] + SUN_DIR.z * 110);
    l.shadow.needsUpdate = true;
  }, [mode, focus, target]);

  const sunPosition: V3 = [SUN_DIR.x * 100, SUN_DIR.y * 100, SUN_DIR.z * 100];

  return (
    <>
      <Sky distance={4500} sunPosition={sunPosition} turbidity={5.5} rayleigh={0.9} mieCoefficient={0.004} mieDirectionalG={0.82} />
      <fog attach="fog" args={["#dbe3e8", 140, 460]} />
      <hemisphereLight args={["#e3ecf6", "#76705a", 0.55]} />
      <directionalLight
        ref={light}
        intensity={2.6}
        color="#fff3e2"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.03}
      />
      {/* Local, network-free environment map for reflections on glass/metal. */}
      <Environment resolution={256} frames={1} environmentIntensity={0.55}>
        <Lightformer form="rect" intensity={2.2} color="#dfe9f5" scale={[60, 20, 1]} position={[0, 18, -30]} />
        <Lightformer form="rect" intensity={1.4} color="#ffffff" scale={[40, 15, 1]} position={[30, 10, 30]} rotation={[0, -Math.PI / 4, 0]} />
        <Lightformer form="rect" intensity={0.8} color="#9db07a" scale={[100, 10, 1]} position={[0, -6, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <Lightformer form="circle" intensity={6} color="#fff1d6" scale={8} position={[40, 50, 30]} />
      </Environment>
    </>
  );
}
