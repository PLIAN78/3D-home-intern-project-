import { useEffect, useRef, useState } from "react";
import { releaseAll } from "../core/input";
import { runtime } from "../core/runtime";
import { useGame } from "../story/store";
import { PLAY_HALF } from "../world/terrain";
import { CloseIcon, CrosshairIcon, MinusIcon, PlusIcon } from "./icons";
import { drawLegendSymbol, drawMap, type MapState, type MapView } from "./mapRender";

/** Everything the map needs from the game store, read fresh each frame (no re-renders). */
function mapState(): MapState {
  const g = useGame.getState();
  return { stages: g.stages, progress: g.progress, owned: g.owned, elephant: g.elephant, delivery: g.delivery, goatsHome: g.goatsHome };
}

/** Sizes a canvas for the screen's pixel density; returns the CSS size. */
function fit(canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w: r.width, h: r.height, dpr };
}

/** Minimap zoom steps: metres per pixel. */
const MINI_ZOOM = [0.6, 1.2, 2.4, 4.8];

export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return; // ~30 fps is plenty for a minimap
      last = now;
      const { w, h, dpr } = fit(canvas);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const b = runtime.body;
      const view: MapView = { cx: b.x, cz: b.z, mpp: MINI_ZOOM[zoomRef.current] };
      drawMap(ctx, w, h, view, mapState(), false);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="minimap">
      <canvas ref={ref} />
      <span className="north">N</span>
      <div className="map-zoom">
        <button aria-label="Zoom in" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
          <PlusIcon size={14} />
        </button>
        <button aria-label="Zoom out" disabled={zoom === MINI_ZOOM.length - 1} onClick={() => setZoom((z) => Math.min(MINI_ZOOM.length - 1, z + 1))}>
          <MinusIcon size={14} />
        </button>
      </div>
    </div>
  );
}

const LEGEND: { group: string; items: [string, string][] }[] = [
  {
    group: "Markers",
    items: [
      ["you", "You"],
      ["objective", "Story objective"],
      ["side", "Side job"],
      ["search", "Search area"],
      ["shop", "Shops and services"],
      ["vehicle", "Your rides"],
      ["goat", "Runaway goat"],
    ],
  },
  {
    group: "Places",
    items: [
      ["road", "Street"],
      ["country", "Cottage Road"],
      ["home", "Home"],
      ["build", "Under construction"],
      ["landmark", "Landmark"],
      ["woods", "Woods"],
      ["water", "Water"],
      ["hills", "Hills, low to high"],
    ],
  },
];

function LegendSymbol({ kind }: { kind: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 24 * dpr;
    c.height = 18 * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The objective marker pulses; one static frame is enough here.
    drawLegendSymbol(ctx, kind, 24, 18);
  }, [kind]);
  return <canvas ref={ref} className="legend-symbol" />;
}

const FULL_MIN = 0.25;
const FULL_MAX = 6;

function clampView(v: MapView) {
  v.mpp = Math.min(FULL_MAX, Math.max(FULL_MIN, v.mpp));
  v.cx = Math.min(PLAY_HALF, Math.max(-PLAY_HALF, v.cx));
  v.cz = Math.min(PLAY_HALF, Math.max(-PLAY_HALF, v.cz));
}

/** Zooms a view by a factor, keeping the world point under (sx, sy) fixed (the canvas centre by default). */
function zoomAt(canvas: HTMLCanvasElement | null, v: MapView, k: number, sx?: number, sy?: number) {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  const px = (sx ?? r.left + r.width / 2) - r.left - r.width / 2;
  const py = (sy ?? r.top + r.height / 2) - r.top - r.height / 2;
  const wx = v.cx + px * v.mpp;
  const wz = v.cz + py * v.mpp;
  v.mpp = Math.min(FULL_MAX, Math.max(FULL_MIN, v.mpp * k));
  v.cx = wx - px * v.mpp;
  v.cz = wz - py * v.mpp;
  clampView(v);
}

/** The full map (M): drag to pan, scroll or +/− to zoom, with a legend. */
export function FullMap() {
  const open = useGame((s) => s.mapOpen);
  const setMap = useGame((s) => s.setMap);
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useRef<MapView>({ cx: 0, cz: 0, mpp: 2 });
  const drag = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    releaseAll();
    // Open centred on the player, zoomed to show the neighbourhood around them.
    const b = runtime.body;
    view.current = { cx: b.x, cz: b.z, mpp: 1.4 };
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { w, h, dpr } = fit(canvas);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawMap(ctx, w, h, view.current, mapState(), true);
    };
    raf = requestAnimationFrame(draw);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") setMap(false);
      if (e.code === "Equal" || e.code === "NumpadAdd") zoomAt(canvas, view.current, 1 / 1.4);
      if (e.code === "Minus" || e.code === "NumpadSubtract") zoomAt(canvas, view.current, 1.4);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setMap]);

  if (!open) return null;
  return (
    <div className="fullmap">
      <div className="fullmap-frame">
        <canvas
          ref={ref}
          onWheel={(e) => zoomAt(ref.current, view.current, Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY)}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, cx: view.current.cx, cz: view.current.cz };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            view.current.cx = d.cx - (e.clientX - d.x) * view.current.mpp;
            view.current.cz = d.cz - (e.clientY - d.y) * view.current.mpp;
            clampView(view.current);
          }}
          onPointerUp={() => (drag.current = null)}
        />
        <div className="fullmap-tools">
          <button aria-label="Zoom in" onClick={() => zoomAt(ref.current, view.current, 1 / 1.4)}>
            <PlusIcon />
          </button>
          <button aria-label="Zoom out" onClick={() => zoomAt(ref.current, view.current, 1.4)}>
            <MinusIcon />
          </button>
          <button
            aria-label="Centre on me"
            onClick={() => {
              view.current.cx = runtime.body.x;
              view.current.cz = runtime.body.z;
            }}
          >
            <CrosshairIcon />
          </button>
        </div>
        <div className="fullmap-title">
          <span className="eyebrow">Map</span>
          Caivan Ridge
        </div>
      </div>
      <aside className="legend">
        <div className="legend-head">
          <span>Legend</span>
          <button className="icon-btn" aria-label="Close map" onClick={() => setMap(false)}>
            <CloseIcon />
          </button>
        </div>
        {LEGEND.map((g) => (
          <div key={g.group} className="legend-group">
            <div className="eyebrow">{g.group}</div>
            {g.items.map(([kind, label]) => (
              <div key={kind} className="legend-row">
                <LegendSymbol kind={kind} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        ))}
        <div className="legend-foot">
          <kbd>Drag</kbd> pan · <kbd>Scroll</kbd> zoom · <kbd>M</kbd> close
        </div>
      </aside>
    </div>
  );
}
