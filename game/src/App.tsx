import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { bindInput } from "./core/input";
import { Blueprints, Goats, Npcs, ObjectiveMarker } from "./entities/Npcs";
import { Player } from "./entities/Player";
import { Vehicles } from "./entities/Vehicles";
import { FollowCamera } from "./render/FollowCamera";
import { PostFX } from "./render/PostFX";
import { useQuality } from "./render/quality";
import { Director } from "./story/Director";
import { useGame } from "./story/store";
import { DialogBox, Ending, MiniGame, Shop, Title } from "./ui/Overlays";
import { Hud } from "./ui/Hud";
import { GameEnvironment } from "./world/Environment";
import { World } from "./world/World";

export function App() {
  const phase = useGame((s) => s.phase);
  const toggleHelp = useGame((s) => s.toggleHelp);
  const quality = useQuality();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const unbind = bindInput(el);
    const onKey = (e: KeyboardEvent) => {
      if (useGame.getState().phase !== "playing") return;
      if (e.code === "KeyH") toggleHelp();
      if (e.code === "KeyG") {
        useQuality.getState().toggle();
        useGame.getState().toast(`Graphics: ${useQuality.getState().level === "high" ? "high" : "fast"}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unbind();
      window.removeEventListener("keydown", onKey);
    };
  }, [toggleHelp]);

  const high = quality.level === "high";
  return (
    <div className="app">
      <div ref={wrap} className="stage">
        <Canvas
          shadows="soft"
          dpr={high ? [1, 1.75] : 1}
          gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping, stencil: false }}
          camera={{ position: [-190, 8, 18], fov: 55, near: 0.15, far: 6000 }}
        >
          {/* Drop to fast graphics automatically if the frame rate can't keep up. */}
          <PerformanceMonitor onDecline={() => quality.auto && useQuality.getState().set("low", true)} flipflops={2} />
          <Suspense fallback={null}>
            <GameEnvironment />
            <World />
            <Npcs />
            <Goats />
            <Blueprints />
            <ObjectiveMarker />
            {/* Frame order is set by priorities: physics (−30), camera (−20), rules (−10), then drawing. */}
            <Player />
            <Vehicles />
            <FollowCamera />
            <Director />
            <PostFX />
          </Suspense>
        </Canvas>
      </div>
      {phase !== "title" && <Hud />}
      <DialogBox />
      <MiniGame />
      <Shop />
      <Ending />
      {phase === "title" && <Title />}
    </div>
  );
}
