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
