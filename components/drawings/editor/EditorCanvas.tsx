"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Floor, Point2D, Wall } from "@/lib/models/house";
import { polygonArea, polygonCentroid, SQ_M_TO_SQ_FT, wallLength } from "@/lib/models/house";
import {
  addOpening,
  addRoom,
  addWall,
  clampOpening,
  dist,
  floorBounds,
  formatLength,
  moveJoinedPoint,
  moveWall,
  nearestWall,
  projectOnSegment,
  snapPoint,
  type SnapResult,
} from "@/lib/editor/editorOps";
import { useEditorFloor, useEditorStore, type SelectionKind } from "@/stores/editorStore";

export interface Underlay {
  url: string;
  width: number;
  height: number;
}

interface Props {
  underlay: Underlay | null;
  ghost: Floor | null;
  fitNonce: number;
  onCalibrate: (a: Point2D, b: Point2D) => void;
  onAlign: (from: Point2D, to: Point2D) => void;
}

type Drag =
  | { type: "pan"; x: number; y: number; tx: number; ty: number }
  | { type: "endpoint"; from: Point2D; original: Floor }
  | { type: "wall"; id: string; start: Point2D; original: Floor }
  | { type: "opening"; kind: "door" | "window"; id: string }
  | { type: "room-vertex"; id: string; index: number; original: Floor };

interface Hit {
  kind: SelectionKind | "endpoint" | "room-vertex";
  id: string;
  point?: Point2D;
  index?: number;
}

const HANDLE_PX = 6;
const SNAP_PX = 12;

function wallPolygon(w: Wall) {
  const L = wallLength(w) || 1;
  const ux = (w.end.x - w.start.x) / L;
  const uy = (w.end.y - w.start.y) / L;
  const nx = -uy * (w.thickness / 2);
  const ny = ux * (w.thickness / 2);
  const e = w.thickness / 2;
  const a = { x: w.start.x - ux * e, y: w.start.y - uy * e };
  const b = { x: w.end.x + ux * e, y: w.end.y + uy * e };
  return `${a.x + nx},${a.y + ny} ${b.x + nx},${b.y + ny} ${b.x - nx},${b.y - ny} ${a.x - nx},${a.y - ny}`;
}

/** Geometry along a wall: point at distance `u`, offset `v` across it. */
function along(w: Wall, u: number, v = 0): Point2D {
  const L = wallLength(w) || 1;
  const ux = (w.end.x - w.start.x) / L;
  const uy = (w.end.y - w.start.y) / L;
  return { x: w.start.x + ux * u - uy * v, y: w.start.y + uy * u + ux * v };
}

export function EditorCanvas({ underlay, ghost, fitNonce, onCalibrate, onAlign }: Props) {
  const floor = useEditorFloor();
  const tool = useEditorStore((s) => s.tool);
  const selection = useEditorStore((s) => s.selection);
  const draft = useEditorStore((s) => s.draft);
  const calibration = useEditorStore((s) => s.calibration);
  const wallKind = useEditorStore((s) => s.wallKind);
  const underlayOpacity = useEditorStore((s) => s.underlayOpacity);
  const showUnderlay = useEditorStore((s) => s.showUnderlay);
  const showGhost = useEditorStore((s) => s.showGhost);
  const { commit, live, checkpoint, select, setDraft } = useEditorStore.getState();

  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ scale: 40, tx: 40, ty: 40 });
  const [hover, setHover] = useState<Point2D | null>(null);
  const [snap, setSnap] = useState<SnapResult | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const drag = useRef<Drag | null>(null);
  const down = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hit = useRef<Hit | null>(null);

  const underlayRect = useMemo(() => {
    if (!underlay) return null;
    const m = calibration.metresPerPixel;
    return { x: -calibration.originPx.x * m, y: -calibration.originPx.y * m, w: underlay.width * m, h: underlay.height * m };
  }, [underlay, calibration]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit to drawing + geometry whenever asked (and on first layout).
  const fit = useCallback(() => {
    const b = floorBounds([floor]);
    const xs: number[] = [];
    const ys: number[] = [];
    if (b) {
      xs.push(b.minX, b.maxX);
      ys.push(b.minY, b.maxY);
    }
    if (underlayRect && showUnderlay) {
      xs.push(underlayRect.x, underlayRect.x + underlayRect.w);
      ys.push(underlayRect.y, underlayRect.y + underlayRect.h);
    }
    if (!xs.length) {
      xs.push(0, 20);
      ys.push(0, 15);
    }
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scale = Math.min(size.w / Math.max(1, maxX - minX), size.h / Math.max(1, maxY - minY)) * 0.9;
    setView({ scale, tx: size.w / 2 - ((minX + maxX) / 2) * scale, ty: size.h / 2 - ((minY + maxY) / 2) * scale });
  }, [floor, underlayRect, showUnderlay, size]);
  const fitRef = useRef(fit);
  useEffect(() => {
    fitRef.current = fit;
  }, [fit]);
  useEffect(() => {
    if (size.w > 10) fitRef.current();
  }, [fitNonce, size.w > 10]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const ku = (e: KeyboardEvent) => e.code === "Space" && setSpaceDown(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  const toPlan = (e: { clientX: number; clientY: number }): Point2D => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.tx) / view.scale, y: (e.clientY - r.top - view.ty) / view.scale };
  };
  const tol = SNAP_PX / view.scale;
  const lastDraft = draft[draft.length - 1];

  const snapFor = (p: Point2D, e: { shiftKey: boolean }, opts: { exclude?: Point2D; from?: Point2D; original?: Floor } = {}) =>
    snapPoint(p, tol, { floors: [opts.original ?? floor, ...(ghost && showGhost ? [ghost] : [])], from: opts.from, exclude: opts.exclude, disableSnap: e.shiftKey });

  // Wheel zoom around the cursor (non-passive listener so we can preventDefault).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setView((v) => {
        const k = Math.exp(-e.deltaY * 0.0015);
        const scale = Math.max(4, Math.min(800, v.scale * k));
        const f = scale / v.scale;
        return { scale, tx: mx - (mx - v.tx) * f, ty: my - (my - v.ty) * f };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const clickAction = (p: Point2D, e: React.PointerEvent) => {
    const h = hit.current;
    switch (tool) {
      case "select":
        if (h && (h.kind === "wall" || h.kind === "door" || h.kind === "window" || h.kind === "room")) select({ kind: h.kind, id: h.id });
        else if (!h) select(null);
        return;
      case "wall": {
        const s = snapFor(p, e, { from: lastDraft });
        if (!lastDraft) return setDraft([s.point]);
        if (dist(s.point, lastDraft) < 0.05) return;
        commit((f) => addWall(f, lastDraft, s.point, wallKind === "exterior").floor);
        if (draft.length >= 2 && dist(s.point, draft[0]) < 0.02) setDraft([]);
        else setDraft([...draft, s.point]);
        return;
      }
      case "door":
      case "window": {
        const nw = nearestWall(floor, p, tol * 1.5);
        if (!nw) return void toast.message(`Click on a wall to add a ${tool}`);
        let createdId: string | null = null;
        let failed = false;
        commit((f) => {
          const r = addOpening(f, tool, nw.wall, nw.along);
          if (!r) {
            failed = true;
            return f;
          }
          createdId = r.id;
          return r.floor;
        });
        if (failed) return void toast.message("That wall is too short for this opening");
        if (createdId) select({ kind: tool, id: createdId });
        return;
      }
      case "room": {
        const s = snapFor(p, e);
        if (draft.length >= 3 && dist(s.point, draft[0]) < tol) return finishRoom();
        setDraft([...draft, s.point]);
        return;
      }
      case "calibrate":
      case "align": {
        const s = tool === "align" && draft.length === 1 ? snapFor(p, e) : { point: p };
        const pts = [...draft, s.point];
        if (pts.length < 2) return setDraft(pts);
        setDraft([]);
        if (tool === "calibrate") onCalibrate(pts[0], pts[1]);
        else onAlign(pts[0], pts[1]);
        return;
      }
    }
  };

  const finishRoom = () => {
    const pts = useEditorStore.getState().draft;
    if (pts.length < 3) return;
    let id = "";
    commit((f) => {
      const r = addRoom(f, pts);
      id = r.room.id;
      return r.floor;
    });
    setDraft([]);
    useEditorStore.getState().setTool("select");
    select({ kind: "room", id });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    down.current = { x: e.clientX, y: e.clientY, moved: false };
    const p = toPlan(e);
    const h = hit.current;
    const panning = e.button === 1 || spaceDown || tool === "pan";
    if (panning || (!h && e.button === 0) || (h && tool !== "select")) {
      drag.current = { type: "pan", x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
      if (panning) hit.current = null;
      return;
    }
    if (tool !== "select" || !h) return;
    if (h.kind === "endpoint" && h.point) drag.current = { type: "endpoint", from: h.point, original: floor };
    else if (h.kind === "wall") drag.current = { type: "wall", id: h.id, start: p, original: floor };
    else if (h.kind === "door" || h.kind === "window") drag.current = { type: "opening", kind: h.kind, id: h.id };
    else if (h.kind === "room-vertex" && h.index !== undefined) drag.current = { type: "room-vertex", id: h.id, index: h.index, original: floor };
    if (h.kind === "wall" || h.kind === "door" || h.kind === "window" || h.kind === "room") select({ kind: h.kind, id: h.id });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toPlan(e);
    setHover(p);
    const d0 = down.current;
    if (d0 && !d0.moved && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 4) {
      d0.moved = true;
      if (drag.current && drag.current.type !== "pan") checkpoint();
    }
    const d = drag.current;
    if (d && d0?.moved) {
      switch (d.type) {
        case "pan":
          setView((v) => ({ ...v, tx: d.tx + e.clientX - d.x, ty: d.ty + e.clientY - d.y }));
          break;
        case "endpoint": {
          const s = snapFor(p, e, { exclude: d.from, original: d.original });
          setSnap(s);
          live(() => moveJoinedPoint(d.original, d.from, s.point));
          break;
        }
        case "wall":
          live(() => moveWall(d.original, d.id, Math.round((p.x - d.start.x) * 100) / 100, Math.round((p.y - d.start.y) * 100) / 100));
          break;
        case "opening":
          live((f) => {
            const list = d.kind === "door" ? f.doors : f.windows;
            const o = list.find((x) => x.id === d.id);
            const w = o && f.walls.find((x) => x.id === o.wallId);
            if (!o || !w) return f;
            const pos = clampOpening(w, projectOnSegment(p, w.start, w.end).along, o.width);
            if (pos === null) return f;
            const updated = list.map((x) => (x.id === d.id ? { ...x, position: Math.round(pos * 100) / 100 } : x));
            return d.kind === "door" ? { ...f, doors: updated as Floor["doors"] } : { ...f, windows: updated as Floor["windows"] };
          });
          break;
        case "room-vertex": {
          const s = snapFor(p, e, { original: d.original });
          setSnap(s);
          live((f) => ({ ...f, rooms: f.rooms.map((r) => (r.id === d.id ? { ...r, polygon: r.polygon.map((q, i) => (i === d.index ? s.point : q)) } : r)) }));
          break;
        }
      }
      return;
    }
    if (tool === "wall" || tool === "room" || (tool === "align" && draft.length === 1)) setSnap(snapFor(p, e, { from: tool === "wall" ? lastDraft : undefined }));
    else if (snap) setSnap(null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d0 = down.current;
    down.current = null;
    const wasDrag = d0?.moved;
    drag.current = null;
    setSnap(null);
    if (!wasDrag && e.button === 0 && !spaceDown && tool !== "pan") clickAction(toPlan(e), e);
    hit.current = null;
  };

  const onDoubleClick = () => {
    if (tool === "wall") setDraft([]);
    if (tool === "room") finishRoom();
  };

  const mark = (h: Hit) => () => {
    hit.current = h;
  };

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------
  const px = (n: number) => n / view.scale;
  const sel = selection;
  const selectedWall = sel?.kind === "wall" ? floor.walls.find((w) => w.id === sel.id) : undefined;
  const selectedRoom = sel?.kind === "room" ? floor.rooms.find((r) => r.id === sel.id) : undefined;
  const cursor = spaceDown || tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair";

  const grid = useMemo(() => {
    const step = view.scale > 70 ? 0.5 : view.scale > 18 ? 1 : 5;
    const x0 = Math.floor(-view.tx / view.scale / step) * step;
    const y0 = Math.floor(-view.ty / view.scale / step) * step;
    const x1 = (size.w - view.tx) / view.scale;
    const y1 = (size.h - view.ty) / view.scale;
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let x = x0; x <= x1; x += step) lines.push({ x1: x, y1: y0, x2: x, y2: y1, major: Math.abs(x % 5) < 1e-6 });
    for (let y = y0; y <= y1; y += step) lines.push({ x1: x0, y1: y, x2: x1, y2: y, major: Math.abs(y % 5) < 1e-6 });
    return lines.slice(0, 600);
  }, [view, size]);

  const preview = tool === "wall" && lastDraft && (snap?.point ?? hover);
  const previewPoint = snap?.point ?? hover;

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden bg-[#f4f3ef] select-none" style={{ cursor }}>
      <svg
        width={size.w}
        height={size.h}
        className="block touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          {grid.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.major ? "#d6d3cb" : "#e7e5df"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}

          {underlay && underlayRect && showUnderlay && (
            <image href={underlay.url} x={underlayRect.x} y={underlayRect.y} width={underlayRect.w} height={underlayRect.h} opacity={underlayOpacity} preserveAspectRatio="none" style={{ pointerEvents: "none" }} />
          )}

          {ghost && showGhost && (
            <g opacity={0.5} style={{ pointerEvents: "none" }}>
              {ghost.walls.map((w) => (
                <polygon key={w.id} points={wallPolygon(w)} fill="none" stroke="#6d28d9" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          )}

          {/* Rooms */}
          {floor.rooms.map((r) => {
            const active = sel?.kind === "room" && sel.id === r.id;
            const c = polygonCentroid(r.polygon);
            return (
              <g key={r.id}>
                <polygon
                  points={r.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={active ? "rgba(240,164,58,0.28)" : r.unverified ? "rgba(245,158,11,0.10)" : "rgba(59,130,246,0.08)"}
                  stroke={active ? "#d97706" : "rgba(59,130,246,0.35)"}
                  strokeWidth={active ? 2 : 1}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={mark({ kind: "room", id: r.id })}
                />
                <text x={c.x} y={c.y} fontSize={px(12)} textAnchor="middle" fill="#1e293b" fontWeight={600} style={{ pointerEvents: "none" }}>
                  {r.name}
                </text>
                <text x={c.x} y={c.y + px(14)} fontSize={px(10)} textAnchor="middle" fill="#64748b" style={{ pointerEvents: "none" }}>
                  ≈ {Math.round(polygonArea(r.polygon) * SQ_M_TO_SQ_FT)} sq ft
                </text>
              </g>
            );
          })}

          {/* Walls */}
          {floor.walls.map((w) => {
            const active = selectedWall?.id === w.id;
            return (
              <polygon
                key={w.id}
                points={wallPolygon(w)}
                fill={w.unverified ? (w.exterior ? "rgba(217,119,6,0.75)" : "rgba(245,158,11,0.6)") : w.exterior ? "#273449" : "#64748b"}
                stroke={active ? "#f0a43a" : w.unverified ? "#b45309" : "none"}
                strokeWidth={active ? 2.5 : 1}
                strokeDasharray={w.unverified && !active ? "5 3" : undefined}
                vectorEffect="non-scaling-stroke"
                onPointerDown={mark({ kind: "wall", id: w.id })}
                style={{ cursor: tool === "select" ? "move" : undefined }}
              />
            );
          })}

          {/* Openings */}
          {floor.doors.map((d) => {
            const w = floor.walls.find((x) => x.id === d.wallId);
            if (!w) return null;
            const active = sel?.kind === "door" && sel.id === d.id;
            const a = d.position - d.width / 2;
            const b = d.position + d.width / 2;
            const t = w.thickness / 2 + 0.01;
            const corners = [along(w, a, -t), along(w, b, -t), along(w, b, t), along(w, a, t)];
            const hinge = along(w, a, t);
            const leaf = along(w, a, t + d.width);
            const end = along(w, b, t);
            return (
              <g key={d.id} onPointerDown={mark({ kind: "door", id: d.id })} style={{ cursor: tool === "select" ? "ew-resize" : undefined }}>
                <polygon points={corners.map((p) => `${p.x},${p.y}`).join(" ")} fill={d.kind === "garage" ? "#e2e8f0" : "#ffffff"} stroke={active ? "#f0a43a" : d.unverified ? "#b45309" : "#334155"} strokeWidth={active ? 2.5 : 1} strokeDasharray={d.unverified ? "4 2" : undefined} vectorEffect="non-scaling-stroke" />
                {d.kind !== "garage" && d.kind !== "opening" && d.kind !== "patio" && (
                  <>
                    <line x1={hinge.x} y1={hinge.y} x2={leaf.x} y2={leaf.y} stroke="#334155" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <path d={`M ${leaf.x} ${leaf.y} A ${d.width} ${d.width} 0 0 ${1} ${end.x} ${end.y}`} fill="none" stroke="#94a3b8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  </>
                )}
              </g>
            );
          })}
          {floor.windows.map((win) => {
            const w = floor.walls.find((x) => x.id === win.wallId);
            if (!w) return null;
            const active = sel?.kind === "window" && sel.id === win.id;
            const a = win.position - win.width / 2;
            const b = win.position + win.width / 2;
            const t = w.thickness / 2 + 0.01;
            const corners = [along(w, a, -t), along(w, b, -t), along(w, b, t), along(w, a, t)];
            const m0 = along(w, a, 0);
            const m1 = along(w, b, 0);
            return (
              <g key={win.id} onPointerDown={mark({ kind: "window", id: win.id })} style={{ cursor: tool === "select" ? "ew-resize" : undefined }}>
                <polygon points={corners.map((p) => `${p.x},${p.y}`).join(" ")} fill="#bae6fd" stroke={active ? "#f0a43a" : win.unverified ? "#b45309" : "#0369a1"} strokeWidth={active ? 2.5 : 1} strokeDasharray={win.unverified ? "4 2" : undefined} vectorEffect="non-scaling-stroke" />
                <line x1={m0.x} y1={m0.y} x2={m1.x} y2={m1.y} stroke="#0369a1" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}

          {/* Handles for the selected wall / room */}
          {tool === "select" &&
            selectedWall &&
            [selectedWall.start, selectedWall.end].map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={px(HANDLE_PX)} fill="#fff" stroke="#d97706" strokeWidth={2} vectorEffect="non-scaling-stroke" onPointerDown={mark({ kind: "endpoint", id: selectedWall.id, point: p })} style={{ cursor: "grab" }} />
            ))}
          {tool === "select" &&
            selectedRoom?.polygon.map((p, i) => (
              <rect key={i} x={p.x - px(5)} y={p.y - px(5)} width={px(10)} height={px(10)} fill="#fff" stroke="#d97706" strokeWidth={2} vectorEffect="non-scaling-stroke" onPointerDown={mark({ kind: "room-vertex", id: selectedRoom.id, index: i })} style={{ cursor: "grab" }} />
            ))}
          {selectedWall && (
            <text x={(selectedWall.start.x + selectedWall.end.x) / 2} y={(selectedWall.start.y + selectedWall.end.y) / 2 - px(14)} fontSize={px(11)} textAnchor="middle" fill="#92400e" fontWeight={600} style={{ pointerEvents: "none" }} paintOrder="stroke" stroke="#fff" strokeWidth={px(3)}>
              {formatLength(wallLength(selectedWall))}
            </text>
          )}

          {/* Drafts & previews */}
          {tool === "room" && draft.length > 0 && (
            <polyline points={[...draft, ...(previewPoint ? [previewPoint] : [])].map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(240,164,58,0.12)" stroke="#d97706" strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
          )}
          {preview && lastDraft && (
            <g style={{ pointerEvents: "none" }}>
              <polygon points={wallPolygon({ id: "preview", start: lastDraft, end: preview, thickness: wallKind === "exterior" ? 0.3 : 0.14, height: 1 })} fill="rgba(240,164,58,0.45)" stroke="#d97706" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x={(lastDraft.x + preview.x) / 2} y={(lastDraft.y + preview.y) / 2 - px(14)} fontSize={px(11)} textAnchor="middle" fill="#92400e" fontWeight={600} paintOrder="stroke" stroke="#fff" strokeWidth={px(3)}>
                {formatLength(dist(lastDraft, preview))}
              </text>
            </g>
          )}
          {(tool === "calibrate" || tool === "align") && draft.length === 1 && hover && (
            <g style={{ pointerEvents: "none" }}>
              <line x1={draft[0].x} y1={draft[0].y} x2={(snap?.point ?? hover).x} y2={(snap?.point ?? hover).y} stroke={tool === "calibrate" ? "#dc2626" : "#7c3aed"} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              <circle cx={draft[0].x} cy={draft[0].y} r={px(5)} fill={tool === "calibrate" ? "#dc2626" : "#7c3aed"} />
            </g>
          )}
          {draft.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={px(4)} fill="#d97706" style={{ pointerEvents: "none" }} />
          ))}
          {snap && snap.kind !== "free" && (
            <rect x={snap.point.x - px(6)} y={snap.point.y - px(6)} width={px(12)} height={px(12)} fill="none" stroke={snap.kind === "endpoint" ? "#16a34a" : "#2563eb"} strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
          )}
        </g>
      </svg>

      {/* Status bar */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2 rounded-md bg-white/90 px-2 py-1 font-mono text-[10px] text-slate-600 shadow-sm ring-1 ring-black/5">
        {hover ? `x ${hover.x.toFixed(2)} m  y ${hover.y.toFixed(2)} m` : "—"}
        <span className="text-slate-400">·</span>
        {view.scale.toFixed(0)} px/m
        {snap && snap.kind !== "free" && <span className="text-emerald-700">snap: {snap.kind}</span>}
      </div>
    </div>
  );
}
