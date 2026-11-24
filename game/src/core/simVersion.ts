import { create } from "zustand";

/**
 * Bumps when the set of physical things changes (a vehicle or the horse appears,
 * the player gets in or out), so the few React components that list them
 * re-render. Everything that moves is read straight from the simulation per frame.
 */
export const useSimVersion = create<{
  version: number;
  bump: () => void;
  /** Lots whose wood frame is currently knocked down (their studs are drawn as loose planks). */
  brokenFrames: string[];
  setFrame: (lotId: string, broken: boolean) => void;
}>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
  brokenFrames: [],
  setFrame: (lotId, broken) =>
    set((s) => ({ brokenFrames: broken ? [...new Set([...s.brokenFrames, lotId])] : s.brokenFrames.filter((id) => id !== lotId) })),
}));
