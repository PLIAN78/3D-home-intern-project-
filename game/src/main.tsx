import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { runtime } from "./core/runtime";
import { host } from "./core/simHost";
import { useGame } from "./story/store";
import "./styles.css";

// Dev-only handle for debugging and automated play-tests (stripped from production builds).
if (import.meta.env.DEV)
  Object.assign(window, {
    __game: {
      runtime,
      store: useGame,
      host,
      /** Moves whatever the player controls (on foot, vehicle or horse). */
      teleport: (x: number, z: number, y = 0, heading?: number) => host.sim?.teleport(x, z, y, heading),
    },
  });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
