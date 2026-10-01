"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

/**
 * Screen-sized text label drawn into a canvas texture. Used instead of DOM
 * overlays for map labels: cheap, always under the UI, and safe to unmount.
 */
export interface TextSpriteProps {
  text: string;
  position: [number, number, number];
  /** Label height as a fraction of the viewport height. */
  size?: number;
  background?: string;
  color?: string;
  bold?: boolean;
  /** Draw on top of everything in the scene. */
  overlay?: boolean;
}

const PX = 4; // canvas pixels per CSS pixel, for crisp text

export function TextSprite({ text, position, size = 0.018, background = "rgba(23,23,23,0.6)", color = "#ffffff", bold = false, overlay = false }: TextSpriteProps) {
  const { material, aspect } = useMemo(() => {
    const font = `${bold ? 600 : 500} ${12 * PX}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    const measure = document.createElement("canvas").getContext("2d")!;
    measure.font = font;
    const padX = 8 * PX;
    const h = 22 * PX;
    const w = Math.ceil(measure.measureText(text).width + padX * 2);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, h / 2);
    ctx.fill();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, w / 2, h / 2 + PX);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const material = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: !overlay, depthWrite: false, transparent: true, fog: false });
    return { material, aspect: w / h };
  }, [text, background, color, bold, overlay]);

  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );

  return <sprite position={position} material={material} scale={[size * aspect, size, 1]} center={new THREE.Vector2(0.5, 0)} renderOrder={overlay ? 20 : 10} />;
}
