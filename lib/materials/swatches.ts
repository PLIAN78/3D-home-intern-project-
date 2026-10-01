import type { MaterialOption } from "@/lib/models/materials";
import { paintPattern } from "./proceduralTextures";

const cache = new Map<string, string>();

/**
 * Small preview image for a material option, painted with the same procedural
 * pattern the 3D viewer uses (so swatches match what customers see).
 * Browser-only; returns null for plain colours (render those with CSS).
 */
export function swatchDataUrl(option: MaterialOption, size = 112): string | null {
  if (!option.pattern || option.pattern === "plain") return null;
  const cached = cache.get(option.id);
  if (cached) return cached;
  const painted = paintPattern(option.pattern, option.color ?? "#cccccc", option.accentColor);
  if (!painted) return null;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  // Fit-UV doors show the whole design; tiled materials show a ~1 m crop.
  ctx.drawImage(painted.color, 0, 0, painted.color.width, painted.color.height, 0, 0, size, size);
  const url = c.toDataURL("image/png");
  cache.set(option.id, url);
  return url;
}
