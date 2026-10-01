"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import type { Community, Lot } from "@/lib/models/community";
import { addBox, MeshBuilder, planFrame, type Vec3 } from "@/lib/geometry/meshBuilder";
import { placeholderFor, type PlaceholderSurface } from "@/lib/geometry/placeholderHouse";
import { getSiteMaterial, siteTexture } from "@/lib/materials/materialFactory";
import { houseOffsetOnLot, lotToWorld, type HouseFootprintInfo } from "@/lib/viewer/placement";
import { Trees } from "./Trees";

// ---------------------------------------------------------------------------
// Site materials (shared, cached)
// ---------------------------------------------------------------------------
function texturedMaterial(key: string, pattern: "grass" | "concrete", color: string, accent: string, tile: [number, number], extra: THREE.MeshStandardMaterialParameters = {}) {
  return getSiteMaterial(key, () => {
    const tex = siteTexture(key, pattern, color, accent, tile);
    return new THREE.MeshStandardMaterial({ map: tex?.map ?? null, roughness: 0.95, ...extra });
  });
}

const groundMat = () => texturedMaterial("grass", "grass", "#6f8d4a", "#5c7a3c", [5, 5]);
const asphaltMat = () => texturedMaterial("asphalt", "concrete", "#4a4c50", "#3a3c40", [4, 4], { roughness: 0.9 });
const concreteMat = () => texturedMaterial("sidewalk", "concrete", "#cfccc5", "#b9b6af", [2, 2], { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const curbMat = () => getSiteMaterial("curb", () => new THREE.MeshStandardMaterial({ color: "#bdbab3", roughness: 0.9 }));

function placeholderMaterial(lot: Lot, surface: PlaceholderSurface): THREE.Material {
  const { bodyColor, roofColor } = lot.placeholder;
  switch (surface) {
    case "body":
      return getSiteMaterial(`ph-body-${bodyColor}`, () => new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.92 }));
    case "roof":
      return getSiteMaterial(`ph-roof-${roofColor}`, () => new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.9, side: THREE.DoubleSide }));
    case "trim":
      return getSiteMaterial("ph-trim", () => new THREE.MeshStandardMaterial({ color: "#f1efe9", roughness: 0.6, side: THREE.DoubleSide }));
    case "window":
      return getSiteMaterial("ph-window", () => new THREE.MeshStandardMaterial({ color: "#2c3a46", roughness: 0.15, metalness: 0.4, envMapIntensity: 1.5 }));
    case "garage":
      return getSiteMaterial("ph-garage", () => new THREE.MeshStandardMaterial({ color: "#e9e7e1", roughness: 0.6 }));
    case "door":
      return getSiteMaterial("ph-door", () => new THREE.MeshStandardMaterial({ color: "#3b3027", roughness: 0.6 }));
    case "foundation":
    default:
      return getSiteMaterial("ph-fdn", () => new THREE.MeshStandardMaterial({ color: "#a3a09a", roughness: 0.95 }));
  }
}

// ---------------------------------------------------------------------------
// Static site geometry
// ---------------------------------------------------------------------------
interface DrivewaySpec {
  lot: Lot;
  /** Lot-local garage door centre (x, z) and the height of the garage slab. */
  start: [number, number];
  startY: number;
  width: number;
}

function buildSite(community: Community, driveways: DrivewaySpec[]) {
  const ground = new MeshBuilder();
  ground.flatPolygon([new THREE.Vector2(-450, -450), new THREE.Vector2(450, -450), new THREE.Vector2(450, 450), new THREE.Vector2(-450, 450)], [], 0, "up");

  const asphalt = new MeshBuilder();
  const concrete = new MeshBuilder();
  const curb = new MeshBuilder();
  for (const r of community.roads) {
    const dx = r.to[0] - r.from[0];
    const dz = r.to[1] - r.from[1];
    const L = Math.hypot(dx, dz);
    const f = planFrame(r.from[0], r.from[1], Math.atan2(dz, dx));
    addBox(asphalt, f, [0, -0.05, -r.width / 2], [L, 0.02, r.width / 2], "metric", { bottom: false });
    for (const side of [-1, 1]) {
      const z0 = (r.width / 2) * side;
      const z1 = (r.width / 2 + 0.18) * side;
      addBox(curb, f, [0, 0, Math.min(z0, z1)], [L, 0.14, Math.max(z0, z1)], "metric", { bottom: false });
      const s0 = (r.width / 2 + r.boulevardWidth) * side;
      const s1 = (r.width / 2 + r.boulevardWidth + r.sidewalkWidth) * side;
      addBox(concrete, f, [0, 0, Math.min(s0, s1)], [L, 0.08, Math.max(s0, s1)], "metric", { bottom: false });
    }
  }

  const road = community.roads[0];
  const toCurb = road ? road.boulevardWidth + road.sidewalkWidth : 3.6;
  for (const d of driveways) {
    const hw = d.width / 2;
    const [sx, sz] = d.start;
    const endZ = d.lot.depth / 2 + toCurb;
    const lineZ = d.lot.depth / 2;
    const P = (x: number, y: number, z: number): Vec3 => lotToWorld(d.lot, [x, y, z]);
    // Sloped apron from the garage slab down to grade at the lot line, then flat to the curb.
    concrete.polygon([P(sx - hw, d.startY, sz), P(sx + hw, d.startY, sz), P(sx + hw, 0.05, lineZ), P(sx - hw, 0.05, lineZ)], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
    concrete.polygon([P(sx - hw, 0.05, lineZ), P(sx + hw, 0.05, lineZ), P(sx + hw * 1.1, 0.05, endZ), P(sx - hw * 1.1, 0.05, endZ)], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
  }

  return { ground: ground.toGeometry(), asphalt: asphalt.toGeometry(), concrete: concrete.toGeometry(), curb: curb.toGeometry() };
}

function lotCorners(lot: Lot, y = 0.06): Vec3[] {
  const hw = lot.width / 2;
  const hd = lot.depth / 2;
  return [lotToWorld(lot, [-hw, y, -hd]), lotToWorld(lot, [hw, y, -hd]), lotToWorld(lot, [hw, y, hd]), lotToWorld(lot, [-hw, y, hd])];
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** Scales a child up from the ground when it appears (used for the home swap). */
export function GrowIn({ visible, children }: { visible: boolean; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(visible ? 1 : 0);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    t.current = THREE.MathUtils.damp(t.current, visible ? 1 : 0, 7, Math.min(dt, 0.05));
    if (Math.abs(t.current - (visible ? 1 : 0)) < 0.002) t.current = visible ? 1 : 0;
    g.visible = t.current > 0.01;
    g.scale.set(1, Math.max(0.001, t.current), 1);
  });
  return <group ref={ref}>{children}</group>;
}

function PlaceholderHouse({ lot }: { lot: Lot }) {
  const g = placeholderFor(lot);
  const offset = houseOffsetOnLot(lot, g as HouseFootprintInfo);
  return (
    <group position={offset}>
      {g.parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={placeholderMaterial(lot, p.surface)} castShadow receiveShadow />
      ))}
    </group>
  );
}

const STATUS_LABEL: Record<NonNullable<Lot["status"]>, string> = {
  available: "Available",
  sold: "Sold",
  "model-home": "Model Home",
  selected: "Your Home",
};

interface CommunitySceneProps {
  community: Community;
  selectedLotId: string;
  /** Show the base placeholder on the selected lot instead of the customer's home. */
  showBaseModel: boolean;
  showLotLabels: boolean;
  customerHouse: { info: HouseFootprintInfo; drivewayStart?: { x: number; y: number }; drivewayWidth?: number; slabHeight: number };
  /** The customer's house, already positioned in lot-local space by the caller. */
  children: ReactNode;
}

export function CommunityScene({ community, selectedLotId, showBaseModel, showLotLabels, customerHouse, children }: CommunitySceneProps) {
  const selectedLot = community.lots.find((l) => l.id === selectedLotId);

  const driveways = useMemo<DrivewaySpec[]>(() => {
    return community.lots.map((lot) => {
      if (lot.id === selectedLotId && customerHouse.drivewayStart && !showBaseModel) {
        const off = houseOffsetOnLot(lot, customerHouse.info);
        return {
          lot,
          start: [customerHouse.drivewayStart.x + off[0], customerHouse.drivewayStart.y + off[2]],
          startY: customerHouse.slabHeight,
          width: customerHouse.drivewayWidth ?? 5.6,
        };
      }
      const g = placeholderFor(lot);
      const off = houseOffsetOnLot(lot, g);
      return { lot, start: [g.garageDoor.x + off[0], g.garageDoor.y + off[2]], startY: 0.05, width: 5.4 };
    });
  }, [community, selectedLotId, customerHouse, showBaseModel]);

  const site = useMemo(() => buildSite(community, driveways), [community, driveways]);
  useEffect(() => () => Object.values(site).forEach((g) => g.dispose()), [site]);

  const lotLines = useMemo(() => {
    const pts: Vec3[] = [];
    for (const lot of community.lots) {
      const c = lotCorners(lot);
      for (let i = 0; i < 4; i++) pts.push(c[i], c[(i + 1) % 4]);
    }
    return pts;
  }, [community]);

  const selectedOutline = useMemo(() => {
    if (!selectedLot) return null;
    const c = lotCorners(selectedLot, 0.1);
    return [...c, c[0]];
  }, [selectedLot]);

  const selectedFill = useMemo(() => {
    if (!selectedLot) return null;
    const b = new MeshBuilder();
    const c = lotCorners(selectedLot, 0.035);
    b.polygon(c, [1, 0, 0], [0, 0, 1], [0, 1, 0]);
    return b.toGeometry();
  }, [selectedLot]);
  useEffect(() => () => selectedFill?.dispose(), [selectedFill]);

  return (
    <group name="Community">
      <mesh geometry={site.ground} material={groundMat()} receiveShadow />
      <mesh geometry={site.asphalt} material={asphaltMat()} receiveShadow />
      <mesh geometry={site.concrete} material={concreteMat()} receiveShadow />
      <mesh geometry={site.curb} material={curbMat()} receiveShadow castShadow />

      <Line points={lotLines} segments color="#f4f1e8" lineWidth={1} transparent opacity={0.55} />
      {selectedOutline && <Line points={selectedOutline} color="#f0a43a" lineWidth={3} />}
      {selectedFill && (
        <mesh geometry={selectedFill} renderOrder={1}>
          <meshBasicMaterial color="#f0a43a" transparent opacity={0.14} depthWrite={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
        </mesh>
      )}

      {community.lots.map((lot) => {
        const isSelected = lot.id === selectedLotId;
        return (
          <group key={lot.id} position={lot.position} rotation={lot.rotation} name={`Lot ${lot.number}`}>
            {isSelected ? (
              <>
                <GrowIn visible={showBaseModel}>
                  <PlaceholderHouse lot={lot} />
                </GrowIn>
                <GrowIn visible={!showBaseModel}>{children}</GrowIn>
              </>
            ) : (
              <PlaceholderHouse lot={lot} />
            )}
            {showLotLabels && (
              <Html position={[0, 0.6, lot.depth / 2 - 2]} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
                <div
                  className={
                    isSelected
                      ? "whitespace-nowrap rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white shadow-lg ring-2 ring-white"
                      : "whitespace-nowrap rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-medium text-neutral-700 shadow ring-1 ring-black/5"
                  }
                >
                  Lot {lot.number}
                  {lot.status ? ` · ${STATUS_LABEL[lot.status]}` : ""}
                </div>
              </Html>
            )}
          </group>
        );
      })}

      <Trees trees={community.trees} />
    </group>
  );
}
