import { forwardRef, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { VehicleId } from "../sim/vehicle";
import { Decal } from "../render/decal";
import { carPaint, chrome, glass, mat, rubber } from "../render/materials";

/**
 * Vehicle bodies, built in the chassis' local frame (x = nose, y = up, z = right,
 * origin at the physics collider's centre). Bodies are beveled extrusions of a
 * side profile with wheel arches cut out; wheels are separate so the physics can
 * spin, steer and compress them.
 */

type P = [number, number];

/** Side silhouette with semicircular wheel-arch notches along the bottom edge. */
function profileShape(
  points: P[],
  bottomY: number,
  arches: { x: number; r: number }[],
  frontX: number,
  rearX: number,
) {
  const s = new THREE.Shape();
  // Bottom edge runs rear → front with arches, then the upper outline comes back front → rear.
  s.moveTo(rearX, bottomY);
  const sorted = [...arches].sort((a, b) => a.x - b.x);
  for (const a of sorted) {
    s.lineTo(a.x - a.r, bottomY);
    s.absarc(a.x, bottomY, a.r, Math.PI, 0, true);
  }
  s.lineTo(frontX, bottomY);
  for (const [x, y] of points) s.lineTo(x, y);
  s.lineTo(rearX, bottomY);
  return s;
}

function extrude(shape: THREE.Shape, width: number, bevel = 0.06) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 18,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}

function flatPanel(points: P[], thickness = 0.015) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thickness,
    bevelEnabled: false,
  });
  g.translate(0, 0, -thickness / 2);
  return g;
}

/** A quad from a to b (x/y), spanning the width; its face points to the left of a→b (outward). */
function slopedPane(a: P, b: P, width: number, lift = 0.01) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const g = new THREE.PlaneGeometry(len, width);
  g.rotateX(-Math.PI / 2);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  g.rotateZ(ang);
  // Push slightly outward along the pane normal.
  g.translate(
    (a[0] + b[0]) / 2 - Math.sin(ang) * lift,
    (a[1] + b[1]) / 2 + Math.cos(ang) * lift,
    0,
  );
  return g;
}

const lightMats = {
  head: () =>
    mat("#fffbe8", { emissive: "#fff6d8", emissiveIntensity: 2.2, rough: 0.1 }),
  tail: () =>
    mat("#7a0a0a", { emissive: "#ff1a1a", emissiveIntensity: 1.6, rough: 0.2 }),
  amber: () =>
    mat("#a35a00", { emissive: "#ffa000", emissiveIntensity: 2.5, rough: 0.2 }),
  trim: () => mat("#1b1d21", { rough: 0.6 }),
  liner: () => mat("#202225", { rough: 0.95 }),
};

// ── Company pickup ─────────────────────────────────────────────────────────

/** The pickup body. `livery` adds Caivan's door logos and roof light bar (the company truck). */
export function TruckBody({
  color = "#f3f4f6",
  livery = true,
}: {
  color?: string;
  livery?: boolean;
}) {
  const geo = useMemo(() => {
    const W = 1.98;
    const body = extrude(
      profileShape(
        [
          [2.78, -0.28],
          [2.76, 0.02],
          [2.48, 0.12],
          [1.02, 0.18],
          [0.36, 0.86],
          [-0.7, 0.88],
          [-0.8, 0.2],
          [-2.7, 0.16],
          [-2.78, -0.26],
        ],
        -0.64,
        [
          { x: 1.75, r: 0.56 },
          { x: -1.65, r: 0.56 },
        ],
        2.7,
        -2.72,
      ),
      W,
    );
    const sideWin = flatPanel([
      [0.94, 0.24],
      [0.36, 0.81],
      [-0.64, 0.82],
      [-0.74, 0.24],
    ]);
    return {
      W,
      body,
      sideWin,
      windscreen: slopedPane([0.38, 0.84], [1.0, 0.21], 1.72, 0.012),
      rearWin: new THREE.PlaneGeometry(1.6, 0.52),
      bumper: new RoundedBoxGeometry(0.24, 0.24, 2.06, 3, 0.06),
      headlight: new RoundedBoxGeometry(0.08, 0.16, 0.42, 2, 0.04),
      taillight: new RoundedBoxGeometry(0.06, 0.3, 0.16, 2, 0.03),
      grille: new RoundedBoxGeometry(0.06, 0.24, 1.0, 2, 0.03),
      mirror: new RoundedBoxGeometry(0.16, 0.18, 0.12, 2, 0.04),
      lightbar: new RoundedBoxGeometry(0.22, 0.1, 1.1, 2, 0.04),
      liner: new THREE.PlaneGeometry(1.74, 1.7),
      bedWall: new THREE.BoxGeometry(1.86, 0.3, 0.05),
      step: new RoundedBoxGeometry(1.4, 0.06, 0.14, 2, 0.02),
    };
  }, []);
  const half = geo.W / 2;
  return (
    <group>
      <mesh
        geometry={geo.body}
        material={carPaint(color)}
        castShadow
        receiveShadow
      />
      {/* Open bed: dark liner floor with low inner walls, sitting on the body */}
      <mesh
        geometry={geo.liner}
        material={lightMats.liner()}
        position={[-1.76, 0.225, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      <mesh
        geometry={geo.bedWall}
        material={lightMats.liner()}
        position={[-1.76, 0.2, 0.86]}
      />
      <mesh
        geometry={geo.bedWall}
        material={lightMats.liner()}
        position={[-1.76, 0.2, -0.86]}
      />
      {/* Glass */}
      <mesh geometry={geo.windscreen} material={glass()} />
      <mesh
        geometry={geo.sideWin}
        material={glass()}
        position={[0, 0, half + 0.004]}
      />
      <mesh
        geometry={geo.sideWin}
        material={glass()}
        position={[0, 0, -half - 0.004]}
      />
      <mesh
        geometry={geo.rearWin}
        material={glass()}
        position={[-0.806, 0.52, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      {/* B-pillars */}
      <mesh material={lightMats.trim()} position={[-0.16, 0.52, half + 0.012]}>
        <boxGeometry args={[0.08, 0.6, 0.01]} />
      </mesh>
      <mesh material={lightMats.trim()} position={[-0.16, 0.52, -half - 0.012]}>
        <boxGeometry args={[0.08, 0.6, 0.01]} />
      </mesh>
      {/* Front: grille, headlights, bumpers */}
      <mesh
        geometry={geo.grille}
        material={lightMats.trim()}
        position={[2.79, -0.1, 0]}
      />
      <mesh
        geometry={geo.grille}
        material={chrome()}
        position={[2.8, -0.1, 0]}
        scale={[0.5, 1.12, 1.04]}
      />
      <mesh
        geometry={geo.headlight}
        material={lightMats.head()}
        position={[2.77, -0.04, 0.72]}
      />
      <mesh
        geometry={geo.headlight}
        material={lightMats.head()}
        position={[2.77, -0.04, -0.72]}
      />
      <mesh
        geometry={geo.bumper}
        material={mat("#2a2c30", { rough: 0.5, metal: 0.3 })}
        position={[2.82, -0.45, 0]}
        castShadow
      />
      <mesh
        geometry={geo.bumper}
        material={mat("#2a2c30", { rough: 0.5, metal: 0.3 })}
        position={[-2.8, -0.45, 0]}
        castShadow
      />
      <mesh
        geometry={geo.taillight}
        material={lightMats.tail()}
        position={[-2.79, -0.02, 0.86]}
      />
      <mesh
        geometry={geo.taillight}
        material={lightMats.tail()}
        position={[-2.79, -0.02, -0.86]}
      />
      {/* Mirrors, side steps, amber roof light bar (it's a site truck) */}
      <mesh
        geometry={geo.mirror}
        material={lightMats.trim()}
        position={[0.82, 0.34, half + 0.1]}
        castShadow
      />
      <mesh
        geometry={geo.mirror}
        material={lightMats.trim()}
        position={[0.82, 0.34, -half - 0.1]}
        castShadow
      />
      <mesh
        geometry={geo.step}
        material={lightMats.trim()}
        position={[0.2, -0.6, half + 0.08]}
      />
      <mesh
        geometry={geo.step}
        material={lightMats.trim()}
        position={[0.2, -0.6, -half - 0.08]}
      />
      {livery && (
        <>
          <mesh
            geometry={geo.lightbar}
            material={lightMats.trim()}
            position={[-0.15, 0.93, 0]}
          />
          <mesh material={lightMats.amber()} position={[-0.15, 0.99, 0.38]}>
            <cylinderGeometry args={[0.07, 0.07, 0.08, 12]} />
          </mesh>
          <mesh material={lightMats.amber()} position={[-0.15, 0.99, -0.38]}>
            <cylinderGeometry args={[0.07, 0.07, 0.08, 12]} />
          </mesh>
          {/* Door livery */}
          <Decal
            text="CAIVAN"
            color="#1f3a5f"
            position={[0.05, -0.2, half + 0.065]}
            rotation={[0, 0, 0]}
            size={[1.1, 0.28]}
          />
          <Decal
            text="CAIVAN"
            color="#1f3a5f"
            position={[0.05, -0.2, -half - 0.065]}
            rotation={[0, Math.PI, 0]}
            size={[1.1, 0.28]}
          />
          <mesh
            material={mat("#1f3a5f", { rough: 0.4 })}
            position={[0, -0.42, half + 0.062]}
          >
            <boxGeometry args={[5.2, 0.06, 0.004]} />
          </mesh>
          <mesh
            material={mat("#1f3a5f", { rough: 0.4 })}
            position={[0, -0.42, -half - 0.062]}
          >
            <boxGeometry args={[5.2, 0.06, 0.004]} />
          </mesh>
          <Decal
            text="CAIVAN 07"
            color="#1b1b1b"
            position={[-2.835, -0.3, 0]}
            rotation={[0, -Math.PI / 2, 0]}
            size={[0.5, 0.14]}
          />
        </>
      )}
    </group>
  );
}

// ── Volt GT sports car ─────────────────────────────────────────────────────

export function CarBody({ color = "#c62828" }: { color?: string }) {
  const geo = useMemo(() => {
    const W = 1.92;
    const body = extrude(
      profileShape(
        [
          [2.42, -0.36],
          [2.38, -0.14],
          [1.4, 0.03],
          [0.6, 0.4],
          [-0.5, 0.44],
          [-1.65, 0.14],
          [-2.3, 0.08],
          [-2.4, -0.18],
        ],
        -0.62,
        [
          { x: 1.45, r: 0.46 },
          { x: -1.4, r: 0.46 },
        ],
        2.3,
        -2.33,
      ),
      W,
      0.09,
    );
    return {
      W,
      body,
      sideWin: flatPanel([
        [0.72, 0.1],
        [0.55, 0.37],
        [-0.5, 0.4],
        [-1.45, 0.14],
      ]),
      windscreen: slopedPane([0.62, 0.41], [1.36, 0.06], 1.62, 0.012),
      rearGlass: slopedPane([-1.6, 0.15], [-0.52, 0.43], 1.5, 0.012),
      headlight: new RoundedBoxGeometry(0.3, 0.07, 0.42, 2, 0.03),
      taillight: new RoundedBoxGeometry(0.05, 0.07, 1.6, 2, 0.03),
      intake: new RoundedBoxGeometry(0.06, 0.16, 1.2, 2, 0.04),
      spoiler: new RoundedBoxGeometry(0.28, 0.03, 1.7, 2, 0.012),
      skirt: new RoundedBoxGeometry(2.0, 0.08, 0.06, 2, 0.02),
    };
  }, []);
  const half = geo.W / 2;
  return (
    <group>
      <mesh
        geometry={geo.body}
        material={carPaint(color)}
        castShadow
        receiveShadow
      />
      <mesh geometry={geo.windscreen} material={glass()} />
      <mesh geometry={geo.rearGlass} material={glass()} />
      <mesh
        geometry={geo.sideWin}
        material={glass()}
        position={[0, 0, half + 0.004]}
      />
      <mesh
        geometry={geo.sideWin}
        material={glass()}
        position={[0, 0, -half - 0.004]}
      />
      <mesh
        geometry={geo.headlight}
        material={lightMats.head()}
        position={[2.2, -0.04, 0.62]}
        rotation={[0, 0, -0.18]}
      />
      <mesh
        geometry={geo.headlight}
        material={lightMats.head()}
        position={[2.2, -0.04, -0.62]}
        rotation={[0, 0, -0.18]}
      />
      <mesh
        geometry={geo.intake}
        material={lightMats.trim()}
        position={[2.4, -0.33, 0]}
      />
      <mesh
        geometry={geo.taillight}
        material={lightMats.tail()}
        position={[-2.33, 0.0, 0]}
      />
      <mesh
        geometry={geo.spoiler}
        material={lightMats.trim()}
        position={[-2.2, 0.13, 0]}
      />
      <mesh
        geometry={geo.skirt}
        material={lightMats.trim()}
        position={[0, -0.6, half + 0.03]}
      />
      <mesh
        geometry={geo.skirt}
        material={lightMats.trim()}
        position={[0, -0.6, -half - 0.03]}
      />
      <Decal
        text="VOLT GT"
        color="#ffffff"
        position={[-0.2, -0.3, half + 0.095]}
        rotation={[0, 0, 0]}
        size={[0.9, 0.2]}
      />
      <Decal
        text="VOLT GT"
        color="#ffffff"
        position={[-0.2, -0.3, -half - 0.095]}
        rotation={[0, Math.PI, 0]}
        size={[0.9, 0.2]}
      />
    </group>
  );
}

// ── Wheels ─────────────────────────────────────────────────────────────────

const wheelGeo = new Map<
  string,
  {
    tire: THREE.BufferGeometry;
    rim: THREE.BufferGeometry;
    spoke: THREE.BufferGeometry;
    hub: THREE.BufferGeometry;
  }
>();

function wheelGeometry(radius: number, width: number) {
  const key = `${radius}:${width}`;
  let g = wheelGeo.get(key);
  if (!g) {
    // Tyre cross-section: a rounded rectangle revolved around the axle.
    const inner = radius * 0.62;
    const pts: THREE.Vector2[] = [];
    const rr = width * 0.28;
    const half = width / 2;
    pts.push(new THREE.Vector2(inner, -half));
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
      pts.push(
        new THREE.Vector2(
          radius - rr + Math.cos(a) * rr,
          -half + rr + Math.sin(a) * rr,
        ),
      );
    }
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      pts.push(
        new THREE.Vector2(
          radius - rr + Math.cos(a) * rr,
          half - rr + Math.sin(a) * rr,
        ),
      );
    }
    pts.push(new THREE.Vector2(inner, half));
    const tire = new THREE.LatheGeometry(pts, 32);
    tire.rotateX(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(
      inner * 1.02,
      inner * 1.02,
      width * 0.7,
      28,
      1,
      true,
    );
    rim.rotateX(Math.PI / 2);
    const spoke = new THREE.BoxGeometry(inner * 1.7, inner * 0.18, 0.04);
    const hub = new THREE.CylinderGeometry(
      inner * 0.28,
      inner * 0.32,
      0.08,
      16,
    );
    hub.rotateX(Math.PI / 2);
    g = { tire, rim, spoke, hub };
    wheelGeo.set(key, g);
  }
  return g;
}

/** A wheel (tyre + rim). Its group is positioned/rotated by the vehicle entity every frame. */
export const Wheel = forwardRef<
  THREE.Group,
  { radius: number; width?: number; side: 1 | -1; rimColor?: string }
>(function Wheel({ radius, width = 0.3, side, rimColor = "#c9ccd1" }, ref) {
  const g = wheelGeometry(radius, width);
  const rimMat = mat(rimColor, { metal: 0.85, rough: 0.25 });
  return (
    <group ref={ref}>
      <group name="spin">
        <mesh geometry={g.tire} material={rubber()} castShadow />
        <mesh geometry={g.rim} material={rimMat} />
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            geometry={g.spoke}
            material={rimMat}
            position={[0, 0, side * width * 0.3]}
            rotation={[0, 0, (i * Math.PI) / 5]}
          />
        ))}
        <mesh
          geometry={g.hub}
          material={chrome()}
          position={[0, 0, side * width * 0.34]}
        />
      </group>
    </group>
  );
});

export const BODY_COLORS: Record<VehicleId, string> = {
  truck: "#f3f4f6",
  car: "#c62828",
  trail: "#55623f",
  hauler: "#1d1f23",
};
/** Where the driver sits, in chassis-local coordinates (left-hand drive). */
export const DRIVER_SEAT: Record<VehicleId, [number, number, number]> = {
  truck: [-0.05, -0.45, -0.42],
  car: [-0.25, -0.88, -0.4],
  trail: [-0.05, -0.45, -0.42],
  hauler: [-0.05, -0.45, -0.44],
};
/** Body scale relative to the base pickup shell (the Haul HD is bigger). */
export const BODY_SCALE: Record<VehicleId, [number, number, number]> = {
  truck: [1, 1, 1],
  car: [1, 1, 1],
  trail: [0.98, 1, 1.02],
  hauler: [1.07, 1.08, 1.05],
};
