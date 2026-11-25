import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { B } from "../world/props";
import { mat } from "../render/materials";
import { Human, TOWNSFOLK } from "./human";

/** Livery per harbour, so the three jet skis can be told apart. */
export const JETSKI_COLORS: Record<string, string> = { lake: "#e0a43a", island: "#2f8f9d", river: "#c2463a" };

/**
 * A sit-down jet ski (no brand), about 3.2 m long: a white hull with a deep
 * V, a coloured deck shell, a saddle, handlebars and a pump nozzle. Forward is
 * local +x. Foam spreads behind it with speed. Seat top is about 0.86 m.
 */
export function JetSkiModel({ speed, color = "#e0a43a" }: { speed: () => number; color?: string }) {
  const wake = useRef<THREE.Group>(null);
  const wakeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), []);
  useFrame(() => {
    const w = wake.current;
    if (!w) return;
    const v = Math.abs(speed());
    w.scale.set(1 + v / 5, 1, 1 + v / 12);
    const m = (w.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshBasicMaterial | undefined;
    if (m) m.opacity = Math.min(0.6, v / 16);
  });
  return (
    <group name="Jet ski">
      {/* Hull: a flat-bottomed box with a rounded bow and a deep keel line. */}
      <B size={[2.7, 0.42, 1.12]} position={[-0.15, 0.2, 0]} color="#eef0ec" />
      <mesh position={[1.2, 0.24, 0]} scale={[0.62, 0.24, 0.56]} material={mat("#eef0ec", { rough: 0.35 })} castShadow>
        <sphereGeometry args={[1, 14, 10]} />
      </mesh>
      <B size={[2.6, 0.12, 0.22]} position={[0, -0.02, 0]} color="#c9ccc8" />
      {/* Rub rail */}
      <B size={[2.9, 0.07, 1.18]} position={[-0.05, 0.42, 0]} color="#2a2d31" />
      {/* Deck shell and hood */}
      <B size={[2.0, 0.24, 0.96]} position={[0.05, 0.55, 0]} color={color} />
      <mesh position={[0.95, 0.56, 0]} scale={[0.55, 0.22, 0.47]} material={mat(color, { rough: 0.4 })} castShadow>
        <sphereGeometry args={[1, 12, 8]} />
      </mesh>
      <B size={[0.5, 0.16, 0.7]} position={[0.62, 0.74, 0]} color="#1f2328" />
      {/* Saddle */}
      <B size={[1.15, 0.2, 0.44]} position={[-0.38, 0.76, 0]} color="#22262b" />
      <B size={[1.2, 0.05, 0.5]} position={[-0.38, 0.66, 0]} color={color} />
      {/* Footwells */}
      {[1, -1].map((s) => (
        <B key={s} size={[1.4, 0.05, 0.22]} position={[-0.35, 0.44, s * 0.4]} color="#3a3f45" cast={false} />
      ))}
      {/* Steering column and handlebars */}
      <B size={[0.12, 0.34, 0.14]} position={[0.42, 0.88, 0]} color="#2a2d31" />
      <B size={[0.08, 0.07, 0.78]} position={[0.36, 1.05, 0]} color="#2a2d31" />
      {[1, -1].map((s) => (
        <B key={s} size={[0.09, 0.09, 0.14]} position={[0.36, 1.05, s * 0.42]} color="#55595c" />
      ))}
      {/* Swim platform and pump nozzle */}
      <B size={[0.45, 0.06, 1.0]} position={[-1.45, 0.36, 0]} color="#c9ccc8" />
      <mesh position={[-1.55, 0.14, 0]} rotation={[0, 0, Math.PI / 2]} material={mat("#3a3f45")}>
        <cylinderGeometry args={[0.1, 0.12, 0.22, 10]} />
      </mesh>
      <group ref={wake} position={[-1.5, 0.03, 0]}>
        {[1, -1].map((side) => (
          <mesh key={side} material={wakeMat} position={[-1.3, 0, side * 0.45]} rotation={[-Math.PI / 2, 0, side * 0.25]}>
            <planeGeometry args={[2.6, 0.4]} />
          </mesh>
        ))}
        <mesh material={wakeMat} position={[-1.1, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.2, 0.7]} />
        </mesh>
      </group>
    </group>
  );
}

/** A townsperson riding a jet ski (for the river's NPC traffic). */
export function JetSkiRider({ outfit = 0, color, speed }: { outfit?: number; color: string; speed: () => number }) {
  return (
    <group>
      <JetSkiModel speed={speed} color={color} />
      <group position={[-0.32, -0.12, 0]}>
        <Human outfit={TOWNSFOLK[outfit % TOWNSFOLK.length]} pose="ride" />
      </group>
    </group>
  );
}
