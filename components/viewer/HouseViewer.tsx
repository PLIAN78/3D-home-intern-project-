"use client";

import { Suspense, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Community } from "@/lib/models/community";
import type { HouseModel } from "@/lib/models/house";
import type { LotProgress } from "@/lib/models/construction";
import { cameraForView, houseCentreLocal, houseOffsetOnLot, lotToWorld, type HouseFootprintInfo } from "@/lib/viewer/placement";
import { useViewerStore } from "@/stores/viewerStore";
import { CameraController } from "./CameraController";
import { CommunityScene } from "./CommunityScene";
import { GeoCommunityScene } from "./GeoCommunityScene";
import { separationMetres } from "./ExplodedViewController";
import { House3D, useHouseGeometry } from "./House3D";
import { SceneEnvironment } from "./SceneEnvironment";
import { ViewerContextProvider } from "./ViewerContext";

interface HouseViewerProps {
  projectId: string;
  projectName: string;
  house: HouseModel;
  community: Community;
  lotId: string;
  lotProgress?: Record<string, LotProgress>;
  interactive?: boolean;
}

/** Renders a frame on request and downloads it as PNG. */
function ScreenshotHandler({ fileName }: { fileName: string }) {
  const nonce = useViewerStore((s) => s.screenshotNonce);
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (!nonce) return;
    gl.render(scene, camera);
    const url = gl.domElement.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.png`;
    a.click();
  }, [nonce, gl, scene, camera, fileName]);
  return null;
}

export default function HouseViewer({ projectId, projectName, house, community, lotId, lotProgress, interactive = true }: HouseViewerProps) {
  const geometry = useHouseGeometry(house);
  const lot = community.lots.find((l) => l.id === lotId) ?? community.lots[0];
  const mode = useViewerStore((s) => s.mode);
  const explode = useViewerStore((s) => s.explode);
  const showBaseModel = useViewerStore((s) => s.showBaseModel);

  const info: HouseFootprintInfo = useMemo(
    () => ({
      planCentre: geometry.planCentre,
      planSize: geometry.planSize,
      frontY: geometry.frontY,
      wallTop: geometry.wallTop,
    }),
    [geometry],
  );
  const offset = useMemo(() => houseOffsetOnLot(lot, info), [lot, info]);
  const focus = useMemo(() => lotToWorld(lot, houseCentreLocal(lot, info)), [lot, info]);
  const groundFloor = house.floors.find((f) => !f.belowGrade && f.elevation >= 0);
  const customerHouse = useMemo(
    () => ({
      info,
      drivewayStart: house.exterior.drivewayStart,
      drivewayWidth: house.exterior.drivewayWidth,
      slabHeight: Math.max(0.05, groundFloor?.elevation ?? 0.05),
    }),
    [info, house, groundFloor],
  );

  // Height the model gains when exploded / lifted, so the camera can follow.
  const lift = explode > 0 ? geometry.belowGradeDepth : 0;
  const verticalShift = lift + separationMetres(explode) * geometry.floors.length;

  const initial = useMemo(() => cameraForView("perspective", lot, info), [lot, info]);

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      gl={{
        antialias: true,
        preserveDrawingBuffer: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.95,
      }}
      camera={{
        position: initial.position,
        fov: 38,
        near: 0.1,
        far: community.geo ? 9000 : 5000,
      }}
      onCreated={({ camera }) => camera.lookAt(...initial.target)}
    >
      <ViewerContextProvider value={{ projectId, interactive }}>
        <Suspense fallback={null}>
          <SceneEnvironment focus={focus} mode={mode} geo={!!community.geo} />
          {community.geo ? (
            <GeoCommunityScene community={community} progress={lotProgress ?? {}} selectedLotId={lot.id} showBaseModel={showBaseModel} showLotLabels={mode === "community"}>
              <group position={offset} name="CustomerHouse">
                <House3D geometry={geometry} />
              </group>
            </GeoCommunityScene>
          ) : (
            <CommunityScene community={community} selectedLotId={lot.id} showBaseModel={showBaseModel} showLotLabels={mode === "community"} customerHouse={customerHouse}>
              <group position={offset} name="CustomerHouse">
                <House3D geometry={geometry} />
              </group>
            </CommunityScene>
          )}
          <CameraController lot={lot} house={info} verticalShift={verticalShift} geo={!!community.geo} />
          <ScreenshotHandler fileName={`${projectName.replace(/\s+/g, "-").toLowerCase()}-view`} />
        </Suspense>
      </ViewerContextProvider>
    </Canvas>
  );
}
