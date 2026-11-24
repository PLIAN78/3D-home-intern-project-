import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { waterNormalMap } from "../render/textures";

/**
 * Pond water: a dark, glossy surface that mirrors the sky through the HDRI
 * environment, with two layers of ripples drifting in different directions.
 */
export function Pond({ position, radius }: { position: [number, number, number]; radius: number }) {
  const surface = useRef<THREE.Mesh>(null);
  const { material } = useMemo(() => {
    const normal = waterNormalMap().clone();
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set(radius / 3, radius / 3);
    normal.needsUpdate = true;
    const material = new THREE.MeshPhysicalMaterial({
      color: "#1d3a40",
      roughness: 0.06,
      metalness: 0.0,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.4,
      transparent: true,
      opacity: 0.92,
    });
    return { material };
  }, [radius]);
  useFrame((_, dt) => {
    const n = (surface.current?.material as THREE.MeshPhysicalMaterial | undefined)?.normalMap;
    if (!n) return;
    n.offset.x += dt * 0.012;
    n.offset.y += dt * 0.007;
  });
  return (
    <group position={position}>
      <mesh ref={surface} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} material={material} receiveShadow>
        <circleGeometry args={[radius, 48]} />
      </mesh>
      {/* Muddy shallows under the water */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[radius + 0.6, 48]} />
        <meshStandardMaterial color="#5b513c" roughness={1} />
      </mesh>
    </group>
  );
}
