"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Canvas } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import { SceneEnvironment } from "@/components/viewer/SceneEnvironment";
import type { Community, Lot } from "@/lib/models/community";
import { BUILD_STATE_LABEL, buildState, progressPercent, type LotProgress } from "@/lib/models/construction";
import { communityCamera, type V3 } from "@/lib/viewer/placement";
import { LotLayer, LotTag, OSM_ATTRIBUTION, RealWorldContext, useSiteContext, type LotColouring } from "./RealWorldScene";

interface Props {
  community: Community;
  progress: Record<string, LotProgress | undefined>;
  colouring: LotColouring;
  selectedLotId: string | null;
  onSelectLot: (lotId: string) => void;
  showStreetNames: boolean;
}

/** Frame the released lots (future phases can stretch the plan far out). */
function overview(community: Community): { position: V3; target: V3 } {
  const lots = community.lots.filter((l) => l.status !== "future");
  const use = lots.length >= 5 ? lots : community.lots;
  const xs = use.map((l) => l.position[0]).sort((a, b) => a - b);
  const zs = use.map((l) => l.position[2]).sort((a, b) => a - b);
  // 5th–95th percentile so a few stray lots don't widen the shot.
  const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
  const [x0, x1, z0, z1] = [q(xs, 0.05), q(xs, 0.95), q(zs, 0.05), q(zs, 0.95)];
  const c = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  // Fit the lots' bounding circle in the 40° field of view, seen from the south-south-east.
  const radius = Math.max(80, Math.hypot(x1 - x0, z1 - z0) / 2 + 40);
  const dist = radius / Math.sin((20 * Math.PI) / 180);
  const dir = [0.3, 0.62, 0.72];
  const n = Math.hypot(...dir);
  return { position: [c.x + (dir[0] / n) * dist, (dir[1] / n) * dist, c.z + (dir[2] / n) * dist], target: [c.x, 0, c.z] };
}

/** Lives inside the canvas so the controls exist when we first frame the view. */
function DashboardCamera({ selected, initial }: { selected: Lot | null; initial: { position: V3; target: V3 } }) {
  const ref = useRef<ComponentRef<typeof CameraControls>>(null);
  const first = useRef(true);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const animate = !first.current;
    first.current = false;
    const v = selected ? communityCamera(selected) : initial;
    void c.setLookAt(...v.position, ...v.target, animate);
  }, [selected, initial]);
  return <CameraControls ref={ref} makeDefault smoothTime={0.6} draggingSmoothTime={0.12} maxPolarAngle={Math.PI / 2 - 0.06} minDistance={15} maxDistance={2200} dollySpeed={0.7} />;
}

/** Whole-community 3D map: real surroundings, every lot and its build stage. */
export default function CommunityViewer({ community, progress, colouring, selectedLotId, onSelectLot, showStreetNames }: Props) {
  const context = useSiteContext(community.id);
  // Framed once: placement previews change the lots but shouldn't move the camera.
  const [initial] = useState(() => overview(community));
  const selected = community.lots.find((l) => l.id === selectedLotId) ?? null;
  const focus = useMemo<V3>(() => (selected ? selected.position : initial.target), [selected, initial]);

  const p = selected ? progress[selected.id] : undefined;

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95 }}
        camera={{ position: initial.position, fov: 40, near: 0.5, far: 6000 }}
        onCreated={({ camera }) => camera.lookAt(...initial.target)}
        onPointerMissed={() => undefined}
      >
        <Suspense fallback={null}>
          <SceneEnvironment focus={focus} mode="community" geo />
          {context && <RealWorldContext context={context} community={community} showStreetNames={showStreetNames} />}
          <LotLayer community={community} progress={progress} colouring={colouring} selectedLotId={selectedLotId} onSelectLot={onSelectLot} />
          {selected && (
            <LotTag
              lot={selected}
              tone="selected"
              text={`Lot ${selected.number} · ${p ? `${BUILD_STATE_LABEL[buildState(p)]} · ${progressPercent(p)}%` : selected.status === "available" ? "Available" : selected.status === "future" ? "Future release" : "Sold"}`}
            />
          )}
          <DashboardCamera selected={selected} initial={initial} />
        </Suspense>
      </Canvas>
      {!context && <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow">Loading surroundings…</div>}
      <div className="pointer-events-none absolute right-2 bottom-1.5 text-[10px] text-neutral-700/80">{OSM_ATTRIBUTION}</div>
    </div>
  );
}
