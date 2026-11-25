import { create } from "zustand";

/**
 * Graphics quality. "high" turns on ambient occlusion, dense grass, 4K
 * shadows and full resolution; "low" keeps older laptops smooth. Starts high and
 * drops automatically if the frame rate can't keep up (G toggles it by hand).
 */
export type QualityLevel = "high" | "low";

export const useQuality = create<{ level: QualityLevel; auto: boolean; set: (level: QualityLevel, auto?: boolean) => void; toggle: () => void }>((set) => ({
  level: "high",
  auto: true,
  set: (level, auto = false) => set({ level, auto }),
  toggle: () => set((s) => ({ level: s.level === "high" ? "low" : "high", auto: false })),
}));

/**
 * How far the realistic models reach (v7): LOD switch distances are multiplied
 * by lodScale, at most crowd animated people update each frame, and people
 * beyond hideDistance aren't drawn. "Fast" graphics shorten all three, and if
 * the frame rate still sits under 30 the asset system trims them further (see
 * assets/AssetSystem.tsx), down to the "minimum" step.
 */
export interface AssetTuning { lodScale: number; crowd: number; hideDistance: number; vehicleDistance: number }
export const ASSET_TUNING: Record<QualityLevel | "minimum", AssetTuning> = {
  high: { lodScale: 1, crowd: 36, hideDistance: 95, vehicleDistance: 420 },
  low: { lodScale: 0.65, crowd: 16, hideDistance: 60, vehicleDistance: 260 },
  minimum: { lodScale: 0.4, crowd: 8, hideDistance: 40, vehicleDistance: 160 },
};
export const useAssetTuning = create<{ step: QualityLevel | "minimum"; set: (s: QualityLevel | "minimum") => void }>((set) => ({ step: "high", set: (step) => set({ step }) }));
/** The tuning in force now (read every frame; no React re-render). */
export const assetTuning = (): AssetTuning => ASSET_TUNING[useAssetTuning.getState().step === "minimum" ? "minimum" : useQuality.getState().level];
