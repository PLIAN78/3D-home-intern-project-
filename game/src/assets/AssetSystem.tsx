import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { initAssetLoader, assetStats, setAssetBudget } from "./loader";
import { crowd } from "./crowd";
import { useAssetTuning, useQuality } from "../render/quality";

/**
 * Sets up model loading for the renderer and runs the adaptive side of the
 * graphics setting: if the frame rate sits under 30 even on "fast" graphics, it
 * steps the models down to the "minimum" reach (shorter LOD distances, fewer
 * animated people, closer culling) and lets them back up once there's headroom.
 * Also resets the per-frame crowd budget before anything draws.
 */
export function AssetSystem() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    initAssetLoader(gl);
    // Integrated GPUs share memory with the system: keep model data modest there.
    const info = gl.getContext().getExtension("WEBGL_debug_renderer_info");
    const gpu = info ? String(gl.getContext().getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    setAssetBudget(/intel|uhd|iris|apple m1|adreno|mali|swiftshader/i.test(gpu) ? 220 * 1024 * 1024 : 420 * 1024 * 1024);
  }, [gl]);

  const fps = useRef({ frames: 0, time: 0, low: 0, high: 0 });
  useFrame((_, dt) => {
    crowd.animated = 0;
    const f = fps.current;
    f.frames++;
    f.time += dt;
    if (f.time < 1) return;
    const rate = f.frames / f.time;
    f.frames = 0;
    f.time = 0;
    const q = useQuality.getState(), t = useAssetTuning.getState();
    if (q.level === "low" && q.auto && rate < 29) f.low++;
    else f.low = 0;
    if (rate > 50) f.high++;
    else f.high = 0;
    if (f.low >= 5 && t.step !== "minimum") t.set("minimum");
    if (f.high >= 10 && t.step === "minimum") t.set("high");
  }, -50);

  useEffect(() => {
    // For benchmarks and debugging from the console: window.__assets().
    (window as unknown as { __assets: () => unknown }).__assets = () => ({ ...assetStats(), step: useAssetTuning.getState().step, quality: useQuality.getState().level, info: gl.info.render, memory: gl.info.memory });
  }, [gl]);
  return null;
}
