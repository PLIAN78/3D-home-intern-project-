import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The game's one audio context and master volume. Everything audible (sound
 * effects, engines) goes through `audio().out`, so the volume control and mute
 * apply to all of it. The context starts on the first sound after a key press
 * or click, as browsers require.
 */
interface AudioSettings {
  /** 0..1, as shown on the slider. */
  volume: number;
  muted: boolean;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}

export const useAudio = create<AudioSettings>()(
  persist(
    (set, get) => ({
      volume: 0.7,
      muted: false,
      setVolume: (v) => {
        set({ volume: Math.min(1, Math.max(0, v)), muted: false });
        applyVolume();
      },
      toggleMute: () => {
        set({ muted: !get().muted });
        applyVolume();
      },
    }),
    { name: "caivan-audio", partialize: (s) => ({ volume: s.volume, muted: s.muted }) },
  ),
);

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** The slider is linear; loudness isn't, so square it. */
export function masterGain(s: { volume: number; muted: boolean } = useAudio.getState()) {
  return s.muted ? 0 : s.volume * s.volume;
}

function applyVolume() {
  if (ctx && master) master.gain.setTargetAtTime(masterGain(), ctx.currentTime, 0.04);
}

/** The context and the master output, or null where Web Audio isn't available. */
export function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = masterGain();
      master.connect(ctx.destination);
      // Hidden tab: the game stops drawing, so stop the engine drone too.
      const c = ctx;
      document.addEventListener("visibilitychange", () => void (document.hidden ? c.suspend() : c.resume()));
    }
    if (ctx.state === "suspended") void ctx.resume();
    return { ctx, out: master! };
  } catch {
    return null;
  }
}

/** Is sound on at all (so callers can skip building nodes)? */
export function audible() {
  return masterGain() > 0;
}
