import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { bindInput } from "./core/input";
import { Blueprints, Goats, Npcs, ObjectiveMarker } from "./entities/Npcs";
import { Player } from "./entities/Player";
import { Vehicles } from "./entities/Vehicles";
import { EngineAudio } from "./entities/EngineAudio";
import { useAudio } from "./core/audio";
import { Town } from "./entities/Town";
import { FollowCamera } from "./render/FollowCamera";
import { PostFX } from "./render/PostFX";
import { useQuality } from "./render/quality";
import { Director } from "./story/Director";
import { useGame } from "./story/store";
import { cheatMatcher } from "./story/economy";
import { DialogBox, Ending, MiniGame, Shop, Title } from "./ui/Overlays";
import { Hud } from "./ui/Hud";
import { FullMap } from "./ui/MapView";
import { PlacePanel } from "./ui/PlacePanels";
import { JobOverlay } from "./ui/WorkGames";
import { GameEnvironment } from "./world/Environment";
import { V6Panel } from "./ui/V6Panel";
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
    const cheat = cheatMatcher();
    const onKey = (e: KeyboardEvent) => {
      if (useGame.getState().phase !== "playing") return;
      // Typing C-A-S-H during play toggles unlimited money. Not listed anywhere in the game.
      if (/^Key[A-Z]$/.test(e.code) && cheat(e.code.slice(3))) {
        useGame.getState().toggleCheat();
        return; // the last letter (H) shouldn't also hide the controls
      }
      if (e.code === "KeyH") toggleHelp();
      if (e.code === "KeyM") {
        const g = useGame.getState();
        if (!g.dialog && !g.minigame && !g.shopOpen && !g.panel && !g.job) g.toggleMap();
      }
      if (e.code === "KeyV") {
        useAudio.getState().toggleMute();
        useGame.getState().toast(useAudio.getState().muted ? "Sound off (V to turn it back on)" : "Sound on");
      }
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
          gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping, stencil: false, logarithmicDepthBuffer: true }}
          camera={{ position: [-190, 8, 18], fov: 55, near: 0.15, far: 6000 }}
        >
          {/* Drop to fast graphics automatically if the frame rate can't keep up. */}
          <PerformanceMonitor onDecline={() => quality.auto && useQuality.getState().set("low", true)} flipflops={2} />
          <Suspense fallback={null}>
            <GameEnvironment />
            {phase !== "title" && <>
            <World />
            <Npcs />
            <Goats />
            <Blueprints />
            <ObjectiveMarker />
            {/* Frame order is set by priorities: physics (−30), camera (−20), rules (−10), then drawing. */}
            <Player />
            <Vehicles />
            <Town />
            <FollowCamera />
            <Director />
            <EngineAudio />
            </>}
            <PostFX />
          </Suspense>
        </Canvas>
      </div>
      {phase !== "title" && <Hud />}
      <DialogBox />
      <MiniGame />
      <Shop />
      <FullMap />
      <PlacePanel />
      <JobOverlay />
      <V6Panel />
      <Ending />
      {phase === "title" && <Title />}
    </div>
  );
}
