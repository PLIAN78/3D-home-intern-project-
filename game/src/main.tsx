import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { runtime } from "./game/runtime";
import { useGame } from "./game/store";
import "./styles.css";

// Dev-only handle for debugging and automated play-tests (stripped from production builds).
if (import.meta.env.DEV) Object.assign(window, { __game: { runtime, store: useGame } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
