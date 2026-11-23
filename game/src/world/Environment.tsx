import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment as DreiEnvironment, Lightformer, Sky } from "@react-three/drei";
import * as THREE from "three";
import { runtime } from "../game/runtime";

const SUN = new THREE.Vector3(0.55, 0.78, 0.42).normalize();

/** Sky, haze and a sun whose shadow follows the player (same look as Home Studio's viewer). */
export function GameEnvironment() {
  const light = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    scene.add(target);
    const l = light.current;
    if (l) {
      const cam = l.shadow.camera;
      cam.left = -45;
      cam.right = 45;
      cam.top = 45;
      cam.bottom = -45;
      cam.near = 1;
      cam.far = 220;
      cam.updateProjectionMatrix();
      l.target = target;
    }
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const b = runtime.body;
    // Snap to a 2 m grid so shadows don't shimmer as you move.
    const x = Math.round(b.x / 2) * 2;
    const z = Math.round(b.z / 2) * 2;
    target.position.set(x, 0, z);
    target.updateMatrixWorld();
    l.position.set(x + SUN.x * 110, SUN.y * 110, z + SUN.z * 110);
  });

  return (
    <>
      <Sky distance={4500} sunPosition={[SUN.x * 100, SUN.y * 100, SUN.z * 100]} turbidity={5} rayleigh={0.9} mieCoefficient={0.004} mieDirectionalG={0.82} />
      <fog attach="fog" args={["#d6e2ea", 180, 620]} />
      <hemisphereLight args={["#e3ecf6", "#76705a", 0.6]} />
      <directionalLight ref={light} intensity={2.6} color="#fff3e2" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} shadow-normalBias={0.04} />
      <DreiEnvironment resolution={128} frames={1} environmentIntensity={0.55}>
        <Lightformer form="rect" intensity={2.2} color="#dfe9f5" scale={[60, 20, 1]} position={[0, 18, -30]} />
        <Lightformer form="rect" intensity={1.4} color="#ffffff" scale={[40, 15, 1]} position={[30, 10, 30]} rotation={[0, -Math.PI / 4, 0]} />
        <Lightformer form="rect" intensity={0.8} color="#9db07a" scale={[100, 10, 1]} position={[0, -6, 0]} rotation={[Math.PI / 2, 0, 0]} />
        <Lightformer form="circle" intensity={6} color="#fff1d6" scale={8} position={[40, 50, 30]} />
      </DreiEnvironment>
    </>
  );
}
