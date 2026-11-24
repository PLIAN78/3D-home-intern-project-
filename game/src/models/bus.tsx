import { carPaint, glass, mat } from "../render/materials";
import { Decal } from "../render/decal";

/**
 * The school bus body (no wheels), in ground coordinates: floor of the body
 * about 0.5 m up, roof at 3 m, facing +x. Offset it down by the ride height
 * to use it on a chassis.
 */
export function BusShell() {
  const yellow = carPaint("#f2b01e");
  const black = mat("#1b1c1f", { rough: 0.6 });
  return (
    <group>
      <mesh position={[0, 1.75, 0]} material={yellow} castShadow receiveShadow>
        <boxGeometry args={[10.5, 2.5, 2.45]} />
      </mesh>
      <mesh position={[5.75, 1.15, 0]} material={yellow} castShadow>
        <boxGeometry args={[1.2, 1.3, 2.35]} />
      </mesh>
      {[1.25, 2.05].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={black}>
          <boxGeometry args={[10.6, 0.12, 2.5]} />
        </mesh>
      ))}
      {[1, -1].map((side) => (
        <mesh key={side} position={[0.3, 2.45, side * 1.235]} material={glass("#1a2026")}>
          <boxGeometry args={[9, 0.75, 0.02]} />
        </mesh>
      ))}
      <mesh position={[5.27, 2.4, 0]} material={glass("#1a2026")}>
        <boxGeometry args={[0.02, 0.9, 2.2]} />
      </mesh>
      <mesh position={[6.4, 0.75, 0]} material={black}>
        <boxGeometry args={[0.2, 0.35, 2.5]} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh key={side} position={[6.36, 1.3, side * 0.85]} material={mat("#fffbe8", { emissive: "#fff6d8", emissiveIntensity: 1.6 })}>
          <boxGeometry args={[0.05, 0.16, 0.3]} />
        </mesh>
      ))}
      <Decal text="SCHOOL BUS" color="#1b1c1f" position={[-1, 2.86, 1.232]} rotation={[0, 0, 0]} height={0.3} />
      <Decal text="SCHOOL BUS" color="#1b1c1f" position={[-1, 2.86, -1.232]} rotation={[0, Math.PI, 0]} height={0.3} />
    </group>
  );
}
