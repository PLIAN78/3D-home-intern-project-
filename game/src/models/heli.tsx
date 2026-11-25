import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { carPaint, chrome, glass, mat } from "../render/materials";
import { Decal } from "../render/decal";

/**
 * The Skylark: a light utility helicopter. Fuselage from a lathed teardrop,
 * bubble canopy, tail boom with fin and tail rotor, skids, and a two-blade main
 * rotor that blurs into a disc as it spools up. Faces +x; skids at y = 0.
 */
export function HeliModel({ rotor, color = "#2a5d8f", label = "SKYLARK" }: { rotor: () => number; color?: string; label?: string }) {
  const main = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const disc = useRef<THREE.Mesh>(null);
  const blades = useRef<THREE.Group>(null);
  const angle = useRef(0);

  const geo = useMemo(() => {
    // Fuselage: a revolved teardrop profile (nose at +x).
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const r = Math.sin(Math.PI * Math.pow(t, 0.8)) * (0.95 - 0.35 * t) + 0.04;
      pts.push(new THREE.Vector2(r, -1.9 + t * 4.2));
    }
    const body = new THREE.LatheGeometry(pts, 28);
    body.rotateZ(-Math.PI / 2);
    body.scale(1, 0.92, 0.82);
    const canopy = new THREE.SphereGeometry(0.9, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
    canopy.rotateZ(-Math.PI / 2.4);
    canopy.scale(1.25, 0.95, 0.85);
    const boom = new THREE.CylinderGeometry(0.12, 0.26, 4.2, 14);
    boom.rotateZ(Math.PI / 2);
    const blade = new THREE.BoxGeometry(5.2, 0.04, 0.26);
    blade.translate(2.6, 0, 0);
    const tailBlade = new THREE.BoxGeometry(0.06, 0.95, 0.12);
    const skid = new THREE.CylinderGeometry(0.05, 0.05, 3.0, 8);
    skid.rotateZ(Math.PI / 2);
    const strut = new THREE.CylinderGeometry(0.04, 0.04, 0.62, 8);
    return { body, canopy, boom, blade, tailBlade, skid, strut };
  }, []);

  const discMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#1a1c20", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), []);

  useFrame((_, dt) => {
    const r = rotor();
    angle.current += dt * r * 38;
    if (main.current) main.current.rotation.y = angle.current;
    if (tail.current) tail.current.rotation.z = angle.current * 1.6;
    // Fast blades read as a translucent disc.
    if (blades.current) blades.current.visible = r < 0.9;
    const d = disc.current;
    if (d) {
      d.visible = r > 0.35;
      (d.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (r - 0.35) * 0.35);
    }
  });

  const paint = carPaint(color);
  const white = carPaint("#eef0f2");
  const dark = mat("#22252a", { rough: 0.5, metal: 0.4 });
  return (
    <group>
      <group position={[0, 1.38, 0]}>
        <mesh geometry={geo.body} material={paint} castShadow receiveShadow />
        <mesh geometry={geo.canopy} material={glass("#16222b")} position={[0.75, 0.18, 0]} />
        <mesh geometry={geo.boom} material={white} position={[-3.6, 0.28, 0]} castShadow />
        {/* Tail fin, stabiliser and rotor */}
        <mesh material={paint} position={[-5.55, 0.82, 0]} rotation={[0, 0, -0.35]} castShadow>
          <boxGeometry args={[0.7, 1.15, 0.08]} />
        </mesh>
        <mesh material={white} position={[-5.25, 0.32, 0]}>
          <boxGeometry args={[0.55, 0.06, 1.4]} />
        </mesh>
        <group ref={tail} position={[-5.6, 0.95, 0.12]}>
          <mesh geometry={geo.tailBlade} material={dark} />
          <mesh geometry={geo.tailBlade} material={dark} rotation={[0, 0, Math.PI / 2]} />
        </group>
        {/* Rotor mast and main rotor */}
        <mesh material={dark} position={[-0.15, 0.92, 0]}>
          <cylinderGeometry args={[0.1, 0.16, 0.42, 12]} />
        </mesh>
        <group ref={main} position={[-0.15, 1.16, 0]}>
          <mesh material={chrome()}>
            <cylinderGeometry args={[0.18, 0.18, 0.1, 12]} />
          </mesh>
          <group ref={blades}>
            <mesh geometry={geo.blade} material={dark} castShadow />
            <mesh geometry={geo.blade} material={dark} rotation={[0, Math.PI, 0]} castShadow />
          </group>
          <mesh ref={disc} material={discMat} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[5.2, 40]} />
          </mesh>
        </group>
        <Decal text={label} color="#ffffff" position={[-1.0, 0.0, 0.79]} rotation={[0, 0, 0]} size={[1.2, 0.3]} />
        <Decal text={label} color="#ffffff" position={[-1.0, 0.0, -0.79]} rotation={[0, Math.PI, 0]} size={[1.2, 0.3]} />
      </group>
      {/* Skids */}
      {[0.82, -0.82].map((z) => (
        <group key={z}>
          <mesh geometry={geo.skid} material={dark} position={[0.1, 0.06, z]} castShadow />
          <mesh geometry={geo.strut} material={dark} position={[0.75, 0.36, z * 0.9]} rotation={[z > 0 ? 0.25 : -0.25, 0, 0]} />
          <mesh geometry={geo.strut} material={dark} position={[-0.6, 0.36, z * 0.9]} rotation={[z > 0 ? 0.25 : -0.25, 0, 0]} />
        </group>
      ))}
    </group>
  );
}
