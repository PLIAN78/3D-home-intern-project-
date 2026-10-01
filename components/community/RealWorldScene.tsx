"use client";

import { useEffect, useMemo, useState } from "react";
import { Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { Trees } from "@/components/viewer/Trees";
import type { SiteContext } from "@/lib/community/siteContext";
import { withGroundXray } from "@/lib/materials/groundXray";
import { buildContextGeometry, buildLotFills, buildSiteHomes, lotOutlineSegments } from "@/lib/geometry/siteGeometry";
import type { Community, Lot } from "@/lib/models/community";
import { buildState, type LotProgress } from "@/lib/models/construction";
import { BUILD_STATE_COLOUR, buildMaterial, contextMaterials, STATUS_COLOUR } from "./siteMaterials";
import { TextSprite } from "./TextSprite";

/** Fetch a community's cached OpenStreetMap surroundings once per id. */
const contextCache = new Map<string, Promise<SiteContext | null>>();
export function useSiteContext(communityId: string | null | undefined) {
  const [ctx, setCtx] = useState<{ id: string; data: SiteContext | null } | null>(null);
  useEffect(() => {
    if (!communityId) return;
    let alive = true;
    let p = contextCache.get(communityId);
    if (!p) {
      p = fetch(`/api/communities/${communityId}/context`)
        .then((r) => (r.ok ? (r.json() as Promise<SiteContext>) : null))
        .catch(() => null);
      contextCache.set(communityId, p);
    }
    void p.then((data) => alive && setCtx({ id: communityId, data }));
    return () => {
      alive = false;
    };
  }, [communityId]);
  return ctx && ctx.id === communityId ? ctx.data : null;
}

/** Streets, parks, water, woods and existing buildings around the community. */
export function RealWorldContext({ context, community, showStreetNames }: { context: SiteContext; community: Community; showStreetNames: boolean }) {
  const geo = useMemo(() => buildContextGeometry(context, community.lots, community.blocks ?? []), [context, community]);
  useEffect(
    () => () => {
      for (const g of [geo.ground, geo.green, geo.woods, geo.water, geo.roads, geo.paths, geo.buildings, geo.roofs]) g.dispose();
    },
    [geo],
  );
  return (
    <group name="RealWorldContext">
      {/* Fixed draw order: these can all be transparent at once (basement x-ray). */}
      <mesh geometry={geo.ground} material={contextMaterials.ground()} receiveShadow renderOrder={-4} />
      <mesh geometry={geo.green} material={contextMaterials.green()} receiveShadow renderOrder={-3} />
      <mesh geometry={geo.woods} material={contextMaterials.woods()} receiveShadow renderOrder={-3} />
      <mesh geometry={geo.water} material={contextMaterials.water()} renderOrder={-3} />
      <mesh geometry={geo.paths} material={contextMaterials.paths()} receiveShadow renderOrder={-2} />
      <mesh geometry={geo.roads} material={contextMaterials.roads()} receiveShadow renderOrder={-1} />
      <mesh geometry={geo.buildings} material={contextMaterials.buildings()} castShadow receiveShadow />
      <mesh geometry={geo.roofs} material={contextMaterials.roofs()} receiveShadow />
      <Trees trees={geo.trees} />
      {showStreetNames && geo.streetLabels.map((l) => <TextSprite key={l.name} text={l.name} position={l.position} />)}
    </group>
  );
}

export type LotColouring = "status" | "progress";

function pointInLot(lot: Lot, x: number, z: number) {
  const poly = lot.polygon;
  if (!poly) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

interface LotLayerProps {
  community: Community;
  progress: Record<string, LotProgress | undefined>;
  colouring: LotColouring;
  selectedLotId?: string | null;
  /** Lot drawn by the caller (e.g. the customer's configured home). */
  skipHomeOnLotId?: string;
  onSelectLot?: (lotId: string) => void;
}

/** Lot fills (by sales status or build progress), outlines, and every home at its build stage. */
export function LotLayer({ community, progress, colouring, selectedLotId, skipHomeOnLotId, onSelectLot }: LotLayerProps) {
  const [hover, setHover] = useState<string | null>(null);
  const colourOf = useMemo(
    () => (lot: Lot) => {
      if (colouring === "progress") {
        const p = progress[lot.id];
        return BUILD_STATE_COLOUR[p ? buildState(p) : lot.status === "sold" ? "complete" : "none"];
      }
      return STATUS_COLOUR[lot.status ?? "future"];
    },
    [colouring, progress],
  );
  const fills = useMemo(
    () =>
      buildLotFills(community.lots, colourOf).map((f) => ({
        ...f,
        material: withGroundXray(new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.95, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })),
      })),
    [community, colourOf],
  );
  useEffect(
    () => () =>
      fills.forEach((f) => {
        f.geometry.dispose();
        f.material.dispose();
      }),
    [fills],
  );
  const outline = useMemo(() => lotOutlineSegments(community.lots), [community]);
  const homes = useMemo(() => buildSiteHomes(community.lots, progress, skipHomeOnLotId), [community, progress, skipHomeOnLotId]);
  useEffect(() => () => homes.meshes.forEach((m) => m.geometry.dispose()), [homes]);
  const blocks = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (const b of community.blocks ?? []) for (let i = 0; i < b.points.length; i++) pts.push([b.points[i][0], 0.06, b.points[i][1]], [b.points[(i + 1) % b.points.length][0], 0.06, b.points[(i + 1) % b.points.length][1]]);
    return pts;
  }, [community]);

  const selected = community.lots.find((l) => l.id === selectedLotId);
  const hovered = hover && hover !== selectedLotId ? community.lots.find((l) => l.id === hover) : undefined;
  const ring = (lot: Lot | undefined, y: number) => (lot?.polygon ? [...lot.polygon.map(([x, z]) => [x, y, z] as [number, number, number]), [lot.polygon[0][0], y, lot.polygon[0][1]] as [number, number, number]] : null);
  const selectedRing = ring(selected, 0.12);
  const hoverRing = ring(hovered, 0.11);

  const lotAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => community.lots.find((l) => pointInLot(l, e.point.x, e.point.z));

  return (
    <group name="Lots">
      {fills.map((f) => (
        <mesh
          key={f.color}
          geometry={f.geometry}
          material={f.material}
          receiveShadow
          onClick={
            onSelectLot
              ? (e) => {
                  e.stopPropagation();
                  const lot = lotAt(e);
                  if (lot) onSelectLot(lot.id);
                }
              : undefined
          }
          onPointerMove={
            onSelectLot
              ? (e) => {
                  const lot = lotAt(e);
                  setHover(lot?.id ?? null);
                  document.body.style.cursor = lot ? "pointer" : "";
                }
              : undefined
          }
          onPointerOut={
            onSelectLot
              ? () => {
                  setHover(null);
                  document.body.style.cursor = "";
                }
              : undefined
          }
        />
      ))}
      <Line points={outline} segments color="#fbf8ef" lineWidth={1} transparent opacity={0.7} />
      {blocks.length > 0 && <Line points={blocks} segments color="#fbf8ef" lineWidth={1} dashed dashSize={2} gapSize={1.5} transparent opacity={0.6} />}
      {hoverRing && <Line points={hoverRing} color="#ffffff" lineWidth={2.5} />}
      {selectedRing && <Line points={selectedRing} color="#f0a43a" lineWidth={4} />}
      {homes.meshes.map((m) => (
        <mesh key={m.key} geometry={m.geometry} material={buildMaterial(m.surface, m.color)} castShadow receiveShadow />
      ))}
    </group>
  );
}

/** Small floating tag above a lot. */
export function LotTag({ lot, text, tone = "neutral" }: { lot: Lot; text: string; tone?: "neutral" | "selected" }) {
  return (
    <TextSprite
      text={text}
      position={[lot.position[0], 9, lot.position[2]]}
      size={tone === "selected" ? 0.024 : 0.018}
      background={tone === "selected" ? "#f59e0b" : "rgba(255,255,255,0.92)"}
      color={tone === "selected" ? "#ffffff" : "#404040"}
      bold
      overlay
    />
  );
}

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

export function centreOf(community: Community): THREE.Vector3 {
  const b = community.geo?.bounds;
  if (!b) return new THREE.Vector3();
  return new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
}
