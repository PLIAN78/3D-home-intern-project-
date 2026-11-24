import { useMemo } from "react";
import * as THREE from "three";

/** Painted text (logos, number plates, signs) drawn on a canvas: no font download. */
const textCache = new Map<string, THREE.Texture>();
function decal(text: string, color: string, w = 512, h = 128) {
  const key = `${text}|${color}|${w}x${h}`;
  let t = textCache.get(key);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.font = `800 ${Math.round(h * 0.62)}px system-ui, -apple-system, Segoe UI, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + h * 0.04);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textCache.set(key, t);
  }
  return t;
}

export function Decal({ text, color, position, rotation, size }: { text: string; color: string; position: [number, number, number]; rotation: [number, number, number]; size: [number, number] }) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ map: decal(text, color), transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), [text, color]);
  return (
    <mesh position={position} rotation={rotation} material={m}>
      <planeGeometry args={size} />
    </mesh>
  );
}

