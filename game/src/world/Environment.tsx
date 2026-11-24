import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment as DreiEnvironment, Sky } from "@react-three/drei";
import park from "@pmndrs/assets/hdri/park.exr";
import * as THREE from "three";
import { runtime } from "../core/runtime";
import { useQuality } from "../render/quality";

/** Afternoon sun from the north-west: lights the Sales Centre front and the streets you drive down. */
export const SUN = new THREE.Vector3(-0.5, 0.7, -0.52).normalize();
/** Horizon haze colour, shared by fog and the distant hills. */
export const HAZE = "#c9d6e2";

/**
 * Daylight, the physically based way:
 * - a Preetham sky for the background, with the sun where the shadows say it is;
 * - image-based lighting from a CC0 Poly Haven HDRI ("park", bundled by
 *   @pmndrs/assets), so paint, glass and water reflect a real outdoor scene;
 * - one sun casting soft shadows from a 4K shadow map that follows the player;
 * - distance fog matched to the horizon (aerial perspective).
 */
export function GameEnvironment() {
  const light = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  const target = useMemo(() => new THREE.Object3D(), []);
  const high = useQuality((s) => s.level === "high");
  const span = high ? 70 : 50;

  useEffect(() => {
    scene.add(target);
    const l = light.current;
    if (l) {
      const cam = l.shadow.camera;
      cam.left = -span;
      cam.right = span;
      cam.top = span;
      cam.bottom = -span;
      cam.near = 1;
      cam.far = 400;
      cam.updateProjectionMatrix();
      l.target = target;
    }
    return () => {
      scene.remove(target);
    };
  }, [scene, target, span]);

  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const b = runtime.body;
    // Centre the shadow map a little ahead of the camera and snap it to shadow texels so edges don't shimmer.
    const texel = (span * 2) / l.shadow.mapSize.x;
    const ax = b.x + Math.cos(runtime.cameraYaw) * span * 0.35;
    const az = b.z + Math.sin(runtime.cameraYaw) * span * 0.35;
    const x = Math.round(ax / texel) * texel;
    const z = Math.round(az / texel) * texel;
    target.position.set(x, 0, z);
    target.updateMatrixWorld();
    l.position.set(x + SUN.x * 200, SUN.y * 200, z + SUN.z * 200);
  });

  return (
    <>
      <Sky distance={4500} sunPosition={[SUN.x, SUN.y, SUN.z]} turbidity={6} rayleigh={1.1} mieCoefficient={0.0045} mieDirectionalG={0.86} />
      <fog attach="fog" args={[HAZE, 140, 980]} />
      <DreiEnvironment files={park} environmentIntensity={0.5} />
      <hemisphereLight args={["#f2efe6", "#7a7350", 0.5]} />
      <directionalLight
        ref={light}
        intensity={3.6}
        color="#ffeed6"
        castShadow
        shadow-mapSize={high ? [4096, 4096] : [2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.035}
        shadow-radius={3}
      />
    </>
  );
}
