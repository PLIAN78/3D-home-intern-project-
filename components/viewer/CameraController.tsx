"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { CameraControls } from "@react-three/drei";
import type { Lot } from "@/lib/models/community";
import { cameraForView, communityCamera, houseCentreLocal, lotToWorld, type HouseFootprintInfo } from "@/lib/viewer/placement";
import { useViewerStore } from "@/stores/viewerStore";

interface Props {
  lot: Lot;
  house: HouseFootprintInfo;
  /** Extra height currently added by lift/explode, so framing follows the model. */
  verticalShift: number;
}

/**
 * Wraps camera-controls: orbit / pan / dolly with damping, preset views,
 * and animated House ⇄ Community transitions.
 */
export function CameraController({ lot, house, verticalShift }: Props) {
  const ref = useRef<ComponentRef<typeof CameraControls>>(null);
  const mode = useViewerStore((s) => s.mode);
  const request = useViewerStore((s) => s.cameraRequest);
  const first = useRef(true);
  const shiftRef = useRef(verticalShift);
  useEffect(() => {
    shiftRef.current = verticalShift;
  }, [verticalShift]);

  // Preset views + mode transitions
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const animate = !first.current;
    first.current = false;
    if (mode === "community") {
      const v = communityCamera(lot);
      c.minDistance = 8;
      c.maxDistance = 320;
      void c.setLookAt(...v.position, ...v.target, animate);
      return;
    }
    c.minDistance = 5;
    c.maxDistance = 110;
    const v = cameraForView(request.view, lot, house, shiftRef.current);
    void c.setLookAt(...v.position, ...v.target, animate);
  }, [mode, request, lot, house]);

  // Keep the model framed as floors lift / separate (only when the shift changes).
  const prevShift = useRef(verticalShift);
  useEffect(() => {
    const c = ref.current;
    if (!c || prevShift.current === verticalShift) return;
    prevShift.current = verticalShift;
    if (useViewerStore.getState().mode !== "house") return;
    const centre = lotToWorld(lot, houseCentreLocal(lot, house));
    void c.moveTo(centre[0], centre[1] + verticalShift * 0.5, centre[2], true);
  }, [verticalShift, lot, house]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      smoothTime={0.55}
      draggingSmoothTime={0.12}
      maxPolarAngle={Math.PI / 2 - 0.04}
      minDistance={5}
      maxDistance={110}
      dollySpeed={0.6}
    />
  );
}
