import { useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Director } from "./game/Director";
import { useGame } from "./game/store";
import { Blueprints, Goats, Npcs, ObjectiveMarker } from "./npc/Characters";
import { bindInput } from "./player/input";
import { FollowCamera } from "./player/FollowCamera";
import { Player } from "./player/Player";
import { DialogBox, Ending, MiniGame, Shop, Title } from "./ui/Overlays";
import { Hud } from "./ui/Hud";
import { GameEnvironment } from "./world/Environment";
import { World } from "./world/World";

export function App() {
  const phase = useGame((s) => s.phase);
  const toggleHelp = useGame((s) => s.toggleHelp);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const unbind = bindInput(el);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyH" && useGame.getState().phase === "playing") toggleHelp();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unbind();
      window.removeEventListener("keydown", onKey);
    };
  }, [toggleHelp]);

  return (
    <div className="app">
      <div ref={wrap} className="stage">
        <Canvas
          shadows="percentage"
          dpr={[1, 1.75]}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95 }}
          camera={{ position: [-190, 8, 18], fov: 55, near: 0.2, far: 1400 }}
        >
          <GameEnvironment />
          <World />
          <Npcs />
          <Goats />
          <Blueprints />
          <ObjectiveMarker />
          <Player />
          <FollowCamera />
          {/* last: game rules run after movement and the camera, then clear one-shot input */}
          <Director />
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
