import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { chrome, glass, mat } from "../render/materials";
import { Decal } from "../render/decal";

/**
 * The Lakerunner: a 5.8 m bowrider, white over navy, with a windshield, a
 * helm on the right, bench seats and an outboard motor. Faces +x; the
 * waterline is y = 0. The wake behind it grows with speed.
 */

const STERN = -2.75;
const BOW = 3.05;
const BEAM = 1.08;

/** Half-beam of the hull at deck level along its length (full aft, a fine curved bow). */
function halfBeam(x: number) {
  if (x <= 0.6) return BEAM;
  const t = (x - 0.6) / (BOW - 0.6);
  return BEAM * Math.sqrt(Math.max(0, 1 - t * t));
}

/** Hull heights: the sheer rises toward the bow; the keel rises at the forefoot. */
const sheer = (x: number) => 0.62 + Math.max(0, x - 0.5) * 0.06;
const keel = (x: number) => -0.42 + Math.max(0, x - 1.4) ** 2 * 0.25;

/** One band of the hull's side between two fractions of its depth (0 = keel, 1 = sheer). */
function band(f0: number, f1: number, rows = 28) {
  const pos: number[] = [];
  const idx: number[] = [];
  const ring = (x: number, f: number, side: number) => {
    const y = keel(x) + (sheer(x) - keel(x)) * f;
    // The V-bottom: narrow at the keel, flaring out to the chine and deck.
    const w = halfBeam(x) * (0.18 + 0.82 * Math.min(1, f * 1.6));
    return [x, y, side * w];
  };
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= rows; i++) {
      const x = STERN + ((BOW - STERN) * i) / rows;
      pos.push(...ring(x, f0, side), ...ring(x, f1, side));
    }
    for (let i = 0; i < rows; i++) {
      const a = base + i * 2;
      if (side > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The flat transom at the stern. */
function transom() {
  const s = new THREE.Shape();
  const y0 = keel(STERN);
  const y1 = sheer(STERN);
  s.moveTo(-BEAM * 0.18, y0);
  s.lineTo(BEAM * 0.18, y0);
  s.lineTo(BEAM, y0 + (y1 - y0) * 0.62);
  s.lineTo(BEAM, y1);
  s.lineTo(-BEAM, y1);
  s.lineTo(-BEAM, y0 + (y1 - y0) * 0.62);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  // Face aft (−x).
  g.rotateY(-Math.PI / 2);
  g.translate(STERN, 0, 0);
  return g;
}

/** Deck outline (top view), used for the cockpit sole and the bow deck. */
function deck(x0: number, x1: number, inset: number) {
  const s = new THREE.Shape();
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const w = Math.max(0.02, halfBeam(x) - inset);
    if (i === 0) s.moveTo(x, w);
    else s.lineTo(x, w);
  }
  for (let i = n; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / n;
    s.lineTo(x, -Math.max(0.02, halfBeam(x) - inset));
  }
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  // Face up.
  g.rotateX(-Math.PI / 2);
  return g;
}

export function BoatModel({ speed }: { speed: () => number }) {
  const geo = useMemo(
    () => ({
      bottom: band(0, 0.42),
      stripe: band(0.42, 0.6),
      topside: band(0.6, 1),
      transom: transom(),
      sole: deck(STERN + 0.12, 2.0, 0.12),
      bowDeck: deck(1.95, BOW - 0.02, 0.0),
    }),
    [],
  );
  // The hull is a single skin: draw both sides so its inside shows from the cockpit.
  const hull = useMemo(
    () => ({
      white: new THREE.MeshStandardMaterial({ color: "#f4f4f1", roughness: 0.35, side: THREE.DoubleSide }),
      navy: new THREE.MeshStandardMaterial({ color: "#1d3557", roughness: 0.4, side: THREE.DoubleSide }),
      antifoul: new THREE.MeshStandardMaterial({ color: "#2a2f36", roughness: 0.7, side: THREE.DoubleSide }),
    }),
    [],
  );
  const white = mat("#f4f4f1", { rough: 0.35 });
  const teak = mat("#b98b5a", { rough: 0.75 });
  const vinyl = mat("#e9e3d6", { rough: 0.6 });
  const black = mat("#17181b", { rough: 0.5 });
  const wake = useRef<THREE.Group>(null);
  const wakeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), []);
  useFrame(() => {
    const v = Math.abs(speed());
    const w = wake.current;
    if (!w) return;
    w.scale.set(1 + v / 6, 1, 1 + v / 14);
    // The wake's meshes share one material: fade it in with speed.
    const m = (w.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshBasicMaterial | undefined;
    if (m) m.opacity = Math.min(0.55, v / 20);
  });
  return (
    <group name="BoatModel">
      <mesh geometry={geo.bottom} material={hull.antifoul} castShadow receiveShadow />
      <mesh geometry={geo.stripe} material={hull.navy} castShadow />
      <mesh geometry={geo.topside} material={hull.white} castShadow receiveShadow />
      <mesh geometry={geo.transom} material={hull.white} />
      <mesh geometry={geo.sole} material={teak} position={[0, 0.08, 0]} receiveShadow />
      <mesh geometry={geo.bowDeck} material={white} position={[0, 0.66, 0]} receiveShadow />
      {/* Gunwale rub rail */}
      {[1, -1].map((side) => (
        <mesh key={side} material={chrome()} position={[-0.2, 0.64, side * (BEAM - 0.01)]}>
          <boxGeometry args={[4.6, 0.04, 0.04]} />
        </mesh>
      ))}
      {/* Windshield over the console */}
      <mesh material={glass("#9fc4d6")} position={[0.55, 0.92, 0]} rotation={[0, 0, 0.55]}>
        <boxGeometry args={[0.02, 0.48, 1.9]} />
      </mesh>
      <mesh material={chrome()} position={[0.68, 1.12, 0]}>
        <boxGeometry args={[0.03, 0.03, 1.9]} />
      </mesh>
      {/* Helm console (right) and the passenger console (left) */}
      {[0.48, -0.48].map((z) => (
        <mesh key={z} material={white} position={[0.38, 0.45, z]} castShadow>
          <boxGeometry args={[0.45, 0.72, 0.7]} />
        </mesh>
      ))}
      <mesh material={black} position={[0.2, 0.86, 0.48]} rotation={[0, 0, -0.9]}>
        <torusGeometry args={[0.17, 0.02, 8, 20]} />
      </mesh>
      <mesh material={black} position={[0.4, 0.82, 0.48]} rotation={[0, 0, 0.4]}>
        <boxGeometry args={[0.18, 0.02, 0.4]} />
      </mesh>
      {/* Seats: helm and passenger buckets, a stern bench */}
      {[0.48, -0.48].map((z) => (
        <group key={z} position={[-0.55, 0, z]}>
          <mesh material={vinyl} position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[0.55, 0.14, 0.55]} />
          </mesh>
          <mesh material={vinyl} position={[-0.27, 0.72, 0]} castShadow>
            <boxGeometry args={[0.12, 0.5, 0.55]} />
          </mesh>
          <mesh material={white} position={[0, 0.22, 0]}>
            <boxGeometry args={[0.4, 0.3, 0.4]} />
          </mesh>
        </group>
      ))}
      <mesh material={vinyl} position={[-2.25, 0.38, 0]} castShadow>
        <boxGeometry args={[0.6, 0.3, 1.9]} />
      </mesh>
      <mesh material={vinyl} position={[-2.5, 0.68, 0]} castShadow>
        <boxGeometry args={[0.14, 0.4, 1.9]} />
      </mesh>
      {/* The outboard motor */}
      <group position={[STERN - 0.25, 0, 0]}>
        <mesh material={mat("#e8e8e6", { rough: 0.3 })} position={[0, 0.85, 0]} castShadow>
          <boxGeometry args={[0.55, 0.62, 0.42]} />
        </mesh>
        <mesh material={black} position={[-0.02, 1.1, 0]}>
          <boxGeometry args={[0.58, 0.08, 0.44]} />
        </mesh>
        <mesh material={black} position={[0.05, 0.1, 0]}>
          <boxGeometry args={[0.16, 0.9, 0.12]} />
        </mesh>
        <mesh material={black} position={[0.05, -0.35, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.38, 10]} />
        </mesh>
      </group>
      {/* Bow rail and navigation lights */}
      {[1, -1].map((side) => (
        <mesh key={side} material={chrome()} position={[2.35, 0.86, side * 0.55]} rotation={[0, side * 0.45, 0]}>
          <boxGeometry args={[1.2, 0.025, 0.025]} />
        </mesh>
      ))}
      <mesh material={mat("#22c55e", { emissive: "#22c55e", emissiveIntensity: 1.5 })} position={[2.4, 0.72, 0.52]}>
        <boxGeometry args={[0.06, 0.06, 0.03]} />
      </mesh>
      <mesh material={mat("#ef4444", { emissive: "#ef4444", emissiveIntensity: 1.5 })} position={[2.4, 0.72, -0.52]}>
        <boxGeometry args={[0.06, 0.06, 0.03]} />
      </mesh>
      {[1, -1].map((side) => (
        <Decal key={side} text="LAKERUNNER" color="#1d3557" height={0.16} position={[-1.2, 0.42, side * (BEAM + 0.006)]} rotation={[0, side > 0 ? 0 : Math.PI, 0]} />
      ))}
      {/* Wake: foam that spreads behind the stern at speed */}
      <group ref={wake} position={[STERN, 0.03, 0]}>
        {[1, -1].map((side) => (
          <mesh key={side} material={wakeMat} position={[-1.6, 0, side * 0.6]} rotation={[-Math.PI / 2, 0, side * 0.22]}>
            <planeGeometry args={[3.2, 0.5]} />
          </mesh>
        ))}
        <mesh material={wakeMat} position={[-1.2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.4, 0.9]} />
        </mesh>
      </group>
    </group>
  );
}
