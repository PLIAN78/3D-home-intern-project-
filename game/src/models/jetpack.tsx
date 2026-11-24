import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { chrome, mat } from "../render/materials";

const JG = {
  tank: new THREE.CapsuleGeometry(0.1, 0.42, 6, 16),
  plate: new THREE.BoxGeometry(0.06, 0.5, 0.36),
  nozzle: new THREE.CylinderGeometry(0.06, 0.085, 0.12, 14, 1, true),
  strap: new THREE.BoxGeometry(0.03, 0.04, 0.5),
  flame: new THREE.ConeGeometry(0.075, 0.6, 14, 1, true),
};

/**
 * The SkyHopper: twin tanks, nozzles and layered exhaust flames that grow with
 * thrust (additive, so they glow under bloom). Mounted on the pilot's back
 * (facing +x, so the pack sits at −x).
 */
export function JetpackModel({ thrust }: { thrust: () => number }) {
  const flames = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const mats = useMemo(
    () => ({
      outer: new THREE.MeshBasicMaterial({ color: "#ff7a1a", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      core: new THREE.MeshBasicMaterial({ color: "#fff1b8", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    }),
    [],
  );
  useFrame(() => {
    const k = thrust();
    const g = flames.current;
    if (g) {
      g.visible = k > 0.02;
      const flick = 0.85 + Math.random() * 0.3;
      g.scale.set(1, (0.35 + k * 0.9) * flick, 1);
    }
    if (light.current) light.current.intensity = k > 0.02 ? 6 * k * (0.8 + Math.random() * 0.4) : 0;
  });
  const paint = mat("#c4302b", { rough: 0.32, metal: 0.55 });
  return (
    <group position={[-0.25, 1.24, 0]}>
      <mesh geometry={JG.plate} material={mat("#30353c", { rough: 0.5, metal: 0.4 })} position={[0.03, 0, 0]} castShadow />
      {[-0.12, 0.12].map((z) => (
        <group key={z} position={[-0.08, 0, z]}>
          <mesh geometry={JG.tank} material={paint} castShadow />
          <mesh geometry={JG.nozzle} material={chrome()} position={[0, -0.36, 0]} />
        </group>
      ))}
      {[-0.13, 0.13].map((y) => (
        <mesh key={y} geometry={JG.strap} material={mat("#1c1f24", { rough: 0.8 })} position={[0.22, y + 0.12, 0]} rotation={[0, 0, 0.3]} />
      ))}
      <group ref={flames} position={[-0.08, -0.42, 0]}>
        {[-0.12, 0.12].map((z) => (
          <group key={z} position={[0, 0, z]} rotation={[Math.PI, 0, 0]}>
            <mesh geometry={JG.flame} material={mats.outer} position={[0, 0.3, 0]} />
            <mesh geometry={JG.flame} material={mats.core} position={[0, 0.2, 0]} scale={[0.55, 0.65, 0.55]} />
          </group>
        ))}
      </group>
      <pointLight ref={light} position={[-0.1, -0.6, 0]} color="#ff9a40" distance={6} decay={2} intensity={0} />
    </group>
  );
}
