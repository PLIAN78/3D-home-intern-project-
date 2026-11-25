import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { host } from "../core/simHost";
import { runtime } from "../core/runtime";
import { useGame } from "../story/store";
import { assetStats } from "./loader";
import { REALISTIC } from "./crowd";
import { useAssetTuning, useQuality } from "../render/quality";

/**
 * A built-in benchmark: open the game with "?bench" (and "?bench&classic" for
 * the old primitive models). It starts the day, visits four busy spots (the
 * Ridge job site, downtown Owawa, the suburbs and the campus), lets each one
 * stream in, then measures 6 seconds: frame rate (average and 1% low), draw
 * calls, triangles, GPU geometries/textures, JS heap and model data loaded.
 * Results show on screen and in the console (window.__bench) as a table to copy.
 * Add "&fast" to measure the fast graphics setting.
 */
export const BENCH = typeof location !== "undefined" && /[?&]bench\b/.test(location.search);

const STOPS: { name: string; x: number; z: number; heading: number }[] = [
  { name: "Ridge job site", x: -40, z: 30, heading: 0.6 },
  { name: "Downtown Owawa", x: 660, z: -640, heading: 0.3 },
  { name: "Suburbs (V6 lots)", x: -480, z: 120, heading: 1.2 },
  { name: "Vataloo campus", x: 700, z: 560, heading: -0.8 },
];
export interface BenchRow { stop: string; fps: number; low1: number; calls: number; triangles: number; geometries: number; textures: number; heapMB: number | null; modelMB: number; loadS: number }

/** Count every pass of a frame (post-processing included), not just the last. */
function countAllPasses(gl: { info: { autoReset: boolean } }) {
  gl.info.autoReset = false;
}

export function Benchmark({ onDone }: { onDone: (rows: BenchRow[]) => void }) {
  const gl = useThree((s) => s.gl);
  const st = useRef({ stop: -1, phase: "wait" as "wait" | "settle" | "measure", t: 0, frames: [] as number[], calls: 0, tris: 0, samples: 0, arrived: 0, rows: [] as BenchRow[] });
  useEffect(() => {
    // Keep the graphics setting where it is: the benchmark measures it.
    useQuality.setState({ auto: false, level: /[?&]fast\b/.test(location.search) ? "low" : useQuality.getState().level });
    countAllPasses(gl);
    useAssetTuning.getState().set("high");
    if (useGame.getState().phase === "title") useGame.getState().start();
  }, [gl]);
  useFrame((_, dt) => {
    const s = st.current;
    // Last frame's totals, then start counting this one.
    const calls = gl.info.render.calls, tris = gl.info.render.triangles;
    gl.info.reset();
    const sim = host.sim;
    if (!sim) return;
    s.t += dt;
    if (s.phase === "wait" && s.t > 3) {
      s.stop++;
      if (s.stop >= STOPS.length) {
        s.phase = "wait";
        s.t = -1e9;
        onDone(s.rows);
        return;
      }
      const p = STOPS[s.stop];
      sim.teleport(p.x, p.z, 0.3, p.heading);
      runtime.cameraYaw = p.heading;
      runtime.cameraPitch = 0.18;
      runtime.cameraDistance = 1.4;
      s.phase = "settle";
      s.t = 0;
      s.arrived = performance.now();
    } else if (s.phase === "settle") {
      // Let the area stream in (or 20 s at most).
      const a = assetStats();
      if ((s.t > 6 && a.pending === 0) || s.t > 20) {
        s.phase = "measure";
        s.t = 0;
        s.frames = [];
        s.calls = s.tris = s.samples = 0;
        s.rows.push({ stop: STOPS[s.stop].name, fps: 0, low1: 0, calls: 0, triangles: 0, geometries: 0, textures: 0, heapMB: null, modelMB: 0, loadS: (performance.now() - s.arrived) / 1000 });
      }
    } else if (s.phase === "measure") {
      s.frames.push(dt);
      s.calls += calls;
      s.tris += tris;
      s.samples++;
      if (s.t > 6) {
        const row = s.rows[s.rows.length - 1];
        const sorted = [...s.frames].sort((a, b) => b - a);
        const worst = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 100)));
        row.fps = +(s.frames.length / s.frames.reduce((a, b) => a + b, 0)).toFixed(1);
        row.low1 = +(1 / (worst.reduce((a, b) => a + b, 0) / worst.length)).toFixed(1);
        row.calls = Math.round(s.calls / s.samples);
        row.triangles = Math.round(s.tris / s.samples);
        row.geometries = gl.info.memory.geometries;
        row.textures = gl.info.memory.textures;
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        row.heapMB = mem ? +(mem.usedJSHeapSize / 1048576).toFixed(0) : null;
        row.modelMB = +(assetStats().bytes / 1048576).toFixed(1);
        s.phase = "wait";
        s.t = 0;
      }
    }
  });
  return null;
}

/** The results panel (drawn over the game when the benchmark finishes). */
export function BenchResults() {
  const [rows, setRows] = useState<BenchRow[] | null>(null);
  useEffect(() => {
    const on = (e: Event) => setRows((e as CustomEvent<BenchRow[]>).detail);
    window.addEventListener("caivan-bench", on);
    return () => window.removeEventListener("caivan-bench", on);
  }, []);
  if (!BENCH) return null;
  return (
    <div className="bench-panel">
      <div className="eyebrow">Benchmark · {REALISTIC ? "realistic models" : "classic models"} · {navigator.userAgent.includes("Headless") ? "headless" : "browser"}</div>
      {!rows ? (
        <p>Running… (about a minute)</p>
      ) : (
        <table>
          <thead>
            <tr><th>Stop</th><th>FPS</th><th>1% low</th><th>Draw calls</th><th>Triangles</th><th>Geometries</th><th>Textures</th><th>JS heap MB</th><th>Models MB</th><th>Stream-in s</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stop}><td>{r.stop}</td><td>{r.fps}</td><td>{r.low1}</td><td>{r.calls}</td><td>{r.triangles.toLocaleString("en")}</td><td>{r.geometries}</td><td>{r.textures}</td><td>{r.heapMB ?? "-"}</td><td>{r.modelMB}</td><td>{r.loadS.toFixed(1)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function finishBench(rows: BenchRow[]) {
  (window as unknown as { __bench: BenchRow[] }).__bench = rows;
  console.table(rows);
  window.dispatchEvent(new CustomEvent("caivan-bench", { detail: rows }));
}
