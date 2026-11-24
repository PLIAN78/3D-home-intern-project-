import { useMemo } from "react";
import * as THREE from "three";

/**
 * Painted text (logos, number plates, signs) drawn on a canvas: no font download.
 * The canvas is as wide as the text needs, so lettering is never squashed.
 */
const textCache = new Map<string, { texture: THREE.Texture; aspect: number }>();
const FONT = (px: number) => `700 ${px}px "Inter", "Helvetica Neue", system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;

function decal(text: string, color: string, fixedAspect?: number) {
  const key = `${text}|${color}|${fixedAspect ?? "auto"}`;
  let t = textCache.get(key);
  if (!t) {
    const h = 128;
    const px = Math.round(h * 0.62);
    const probe = document.createElement("canvas").getContext("2d")!;
    probe.font = FONT(px);
    // Slight tracking, like real building lettering.
    const tracking = px * 0.06;
    const textW = probe.measureText(text).width + tracking * (text.length - 1);
    const w = fixedAspect ? Math.round(h * fixedAspect) : Math.max(64, Math.ceil(textW + h * 0.4));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.font = FONT(px);
    ctx.textBaseline = "middle";
    // Fit (only shrinks when a fixed aspect is too narrow for the text).
    const k = Math.min(1, (w * 0.94) / textW);
    ctx.save();
    ctx.translate(w / 2 - (textW * k) / 2, h / 2 + h * 0.04);
    ctx.scale(k, 1);
    let x = 0;
    for (const ch of text) {
      ctx.fillText(ch, x, 0);
      x += ctx.measureText(ch).width + tracking;
    }
    ctx.restore();
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    t = { texture, aspect: w / h };
    textCache.set(key, t);
  }
  return t;
}

/**
 * Lettering on a surface. Give `size` for a fixed box (text fits inside it), or
 * `height` to let the width follow the text.
 */
export function Decal({ text, color, position, rotation, size, height }: { text: string; color: string; position: [number, number, number]; rotation: [number, number, number]; size?: [number, number]; height?: number }) {
  const sw = size?.[0];
  const sh = size?.[1];
  const { m, dims } = useMemo(() => {
    const d = decal(text, color, sw && sh ? sw / sh : undefined);
    const m = new THREE.MeshStandardMaterial({ map: d.texture, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const hh = sh ?? height ?? 0.5;
    return { m, dims: (sw && sh ? [sw, sh] : [hh * d.aspect, hh]) as [number, number] };
  }, [text, color, sw, sh, height]);
  return (
    <mesh position={position} rotation={rotation} material={m}>
      <planeGeometry args={dims} />
    </mesh>
  );
}
