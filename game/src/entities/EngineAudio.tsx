import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { audible, audio } from "../core/audio";
import { engineState } from "../core/engineModel";
import { EngineVoice, SkidVoice } from "../core/engineSound";
import { host } from "../core/simHost";
import { useGame } from "../story/store";

/**
 * The sound of whatever the player is driving, riding or flying: a different
 * engine for every car, the boats, the jet ski, the helicopters and the planes,
 * with revs following speed, gears and throttle, and tyre squeal in a drift.
 */
export function EngineAudio() {
  const voice = useRef<EngineVoice | null>(null);
  const skid = useRef<SkidVoice | null>(null);
  useEffect(
    () => () => {
      voice.current?.stop();
      skid.current?.stop();
    },
    [],
  );
  useFrame(() => {
    const sim = host.sim;
    const state = sim && useGame.getState().phase === "playing" && audible() ? engineState(sim) : null;
    const a = state ? audio() : null;
    if (!state || !a) {
      voice.current?.stop();
      voice.current = null;
      skid.current?.stop();
      skid.current = null;
      return;
    }
    if (!voice.current || voice.current.key !== state.key) {
      voice.current?.stop();
      voice.current = new EngineVoice(a.ctx, a.out, state.key);
    }
    voice.current.update(state);
    if (state.slip > 0) {
      skid.current ??= new SkidVoice(a.ctx, a.out);
      skid.current.update(state.slip, state.speed);
    } else if (skid.current) {
      skid.current.stop();
      skid.current = null;
    }
  });
  return null;
}
