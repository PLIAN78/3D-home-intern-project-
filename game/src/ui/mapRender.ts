import { runtime } from "../core/runtime";
import { host, TREES } from "../core/simHost";
import type { Owned } from "../story/economy";
import { currentStep, GEAR_GARAGE, stepTarget, type Progress } from "../story/missions";
import { DEPOT, ELEPHANT_SEARCH, ROSA, type Delivery, type ElephantQuest } from "../story/sidequests";
import { CAIVAN_RIDGE, collisionBoxes, LANDMARKS, PAVED, PEN, STREETS, type V2 } from "../world/map";
import { COTTAGE, FLAT_HALF, HILL_ROAD, HILL_ROAD_WIDTH, PLAY_HALF, terrainHeight } from "../world/terrain";

/**
 * The map, drawn like a printed town map: a base layer painted once (terrain
 * shading, woods, roads, buildings) and live markers on top. Shared by the
 * minimap and the full-screen map.
 */

export const PALETTE = {
  land: "#e3e6d6",
  hillLow: [208, 218, 184],
  hillHigh: [178, 180, 150],
  woods: "rgba(112, 146, 92, 0.42)",
  water: "#a7c4d6",
  road: "#ffffff",
  roadCase: "#c4bdae",
  country: "#fbf6e9",
  building: "#cfc8ba",
  buildingEdge: "#a9a191",
  construction: "#e6cf9f",
  landmark: "#b9b1a1",
  parking: "#dedad1",
  field: "#c8d9b3",
  track: "#d1a088",
  pen: "#a07a52",
  you: "#e0a43a",
  youEdge: "#1b1d21",
  objective: "#e0a43a",
  side: "#2f8f88",
  vehicle: "#2a2e35",
  goat: "#ffffff",
  label: "#3c3a35",
};

/** Base map resolution: pixels per metre. */
const PPM = 1;
const SIZE = PLAY_HALF * 2 * PPM;

let base: HTMLCanvasElement | null = null;
let baseStages: Record<string, string> | null = null;

const wx = (x: number) => (x + PLAY_HALF) * PPM;

function hillshade(ctx: CanvasRenderingContext2D) {
  // Coarse height grid (8 m), shaded from the north-west, scaled up smoothly.
  const n = 250;
  const step = (PLAY_HALF * 2) / n;
  const img = new ImageData(n, n);
  const h = (i: number, j: number) => terrainHeight(-PLAY_HALF + (i + 0.5) * step, -PLAY_HALF + (j + 0.5) * step);
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = h(i, j);
  const H = (i: number, j: number) => heights[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const dx = (H(i + 1, j) - H(i - 1, j)) / (2 * step);
      const dz = (H(i, j + 1) - H(i, j - 1)) / (2 * step);
      // Light from the north-west, a little above the horizon.
      const shade = Math.max(0.55, Math.min(1.15, 0.92 - (dx * -0.7 + dz * -0.7) * 1.6));
      const e = Math.min(1, H(i, j) / 90);
      const k = (j * n + i) * 4;
      for (let c = 0; c < 3; c++) img.data[k + c] = (PALETTE.hillLow[c] + (PALETTE.hillHigh[c] - PALETTE.hillLow[c]) * e) * shade;
      img.data[k + 3] = 255;
    }
  const tmp = document.createElement("canvas");
  tmp.width = tmp.height = n;
  tmp.getContext("2d")!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tmp, 0, 0, SIZE, SIZE);
  // Contour-ish edge where the flat town meets the hills.
  ctx.fillStyle = PALETTE.land;
  ctx.fillRect(wx(-FLAT_HALF), wx(-FLAT_HALF), FLAT_HALF * 2 * PPM, FLAT_HALF * 2 * PPM);
}

function strokePath(ctx: CanvasRenderingContext2D, pts: V2[], width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width * PPM;
  ctx.beginPath();
  pts.forEach(([x, z], i) => (i ? ctx.lineTo(wx(x), wx(z)) : ctx.moveTo(wx(x), wx(z))));
  ctx.stroke();
}

function paintBase(stages: Record<string, string>) {
  const c = base ?? document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d")!;
  hillshade(ctx);

  // Woods: every tree as a soft canopy dot.
  ctx.fillStyle = PALETTE.woods;
  for (const t of TREES) {
    ctx.beginPath();
    ctx.arc(wx(t.position[0]), wx(t.position[1]), (2 + t.scale * 1.6) * PPM, 0, Math.PI * 2);
    ctx.fill();
  }

  // Park pond, parking lots, the school field and its track.
  const [px, pz] = LANDMARKS.park.position;
  ctx.fillStyle = PALETTE.water;
  ctx.beginPath();
  ctx.arc(wx(px + 10), wx(pz + 5), 11 * PPM, 0, Math.PI * 2);
  ctx.fill();
  for (const p of PAVED) {
    ctx.fillStyle = p.kind === "parking" ? PALETTE.parking : PALETTE.field;
    ctx.fillRect(wx(p.x0), wx(p.z0), (p.x1 - p.x0) * PPM, (p.z1 - p.z0) * PPM);
    if (p.kind === "field") {
      const cx = (p.x0 + p.x1) / 2;
      const cz = (p.z0 + p.z1) / 2;
      ctx.strokeStyle = PALETTE.track;
      ctx.lineWidth = 4.6 * PPM;
      ctx.beginPath();
      ctx.arc(wx(cx + 17), wx(cz), 14.7 * PPM, -Math.PI / 2, Math.PI / 2);
      ctx.arc(wx(cx - 17), wx(cz), 14.7 * PPM, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.closePath();
      ctx.stroke();
    }
  }
  const [fx, fz] = LANDMARKS.factory.position;
  ctx.fillStyle = PALETTE.parking;
  ctx.fillRect(wx(fx - 32), wx(fz + 20), 64 * PPM, 22 * PPM);

  // Roads: casing, then surface. Cottage Road gets a cream fill like a country road.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const r of CAIVAN_RIDGE.roads) strokePath(ctx, [r.from as V2, r.to as V2], r.width + 2.4, PALETTE.roadCase);
  strokePath(ctx, HILL_ROAD, HILL_ROAD_WIDTH + 2.4, PALETTE.roadCase);
  for (const r of CAIVAN_RIDGE.roads) strokePath(ctx, [r.from as V2, r.to as V2], r.width, PALETTE.road);
  strokePath(ctx, HILL_ROAD, HILL_ROAD_WIDTH, PALETTE.country);

  // Buildings: homes, frames under construction, landmarks.
  for (const b of collisionBoxes(stages as never)) {
    if (b.id === "parked" || b.id === "sign" || b.id === "porch") continue;
    ctx.fillStyle = b.kind === "frame" ? PALETTE.construction : b.kind === "landmark" || b.kind === "post" ? PALETTE.landmark : PALETTE.building;
    ctx.strokeStyle = PALETTE.buildingEdge;
    ctx.lineWidth = 0.8 * PPM;
    ctx.fillRect(wx(b.x0), wx(b.z0), (b.x1 - b.x0) * PPM, (b.z1 - b.z0) * PPM);
    ctx.strokeRect(wx(b.x0), wx(b.z0), (b.x1 - b.x0) * PPM, (b.z1 - b.z0) * PPM);
  }
  // Dig sites (excavation and foundation stages have no building yet).
  ctx.fillStyle = PALETTE.construction;
  for (const lot of CAIVAN_RIDGE.lots) {
    const st = stages[lot.id];
    if (st !== "excavation" && st !== "foundation" && st !== "permits") continue;
    const [x, , z] = lot.position;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(wx(x - lot.width / 2 + 2), wx(z - lot.depth / 2 + 4), (lot.width - 4) * PPM, (lot.depth - 8) * PPM);
    ctx.globalAlpha = 1;
  }
  // The water tower, the goat pen, the cottage's shelter.
  const [tx, tz] = LANDMARKS.tower.position;
  ctx.fillStyle = PALETTE.landmark;
  ctx.beginPath();
  ctx.arc(wx(tx), wx(tz), 7 * PPM, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.pen;
  ctx.lineWidth = 1 * PPM;
  ctx.strokeRect(wx(PEN.centre[0] - PEN.half), wx(PEN.centre[1] - PEN.half), PEN.half * 2 * PPM, PEN.half * 2 * PPM);
  ctx.fillStyle = PALETTE.landmark;
  ctx.fillRect(wx(COTTAGE.position[0] - 23), wx(COTTAGE.position[1] - 2), 10 * PPM, 8 * PPM);
  base = c;
  baseStages = stages;
  return c;
}

/** The painted base layer (repainted when construction stages change). */
export function baseMap(stages: Record<string, string>) {
  if (!base || baseStages !== stages) return paintBase(stages);
  return base;
}

// ── Live layer ──────────────────────────────────────────────────────────

export interface MapView {
  /** World point at the canvas centre. */
  cx: number;
  cz: number;
  /** Metres per CSS pixel. */
  mpp: number;
}

export interface MapState {
  stages: Record<string, string>;
  progress: Progress;
  owned: Owned;
  elephant: ElephantQuest;
  delivery: Delivery | null;
  goatsHome: string[];
}

/** Where a world point lands on the canvas (CSS pixels). */
export function toScreen(v: MapView, w: number, h: number, x: number, z: number): [number, number] {
  return [w / 2 + (x - v.cx) / v.mpp, h / 2 + (z - v.cz) / v.mpp];
}

function marker(ctx: CanvasRenderingContext2D, x: number, y: number, kind: "objective" | "side" | "shop" | "vehicle", r = 6) {
  ctx.save();
  ctx.translate(x, y);
  if (kind === "objective") {
    const pulse = 1 + Math.sin(performance.now() / 260) * 0.12;
    ctx.fillStyle = "rgba(224,164,58,0.22)";
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.1 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.objective;
    ctx.strokeStyle = PALETTE.youEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.youEdge;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "side") {
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.side;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
    ctx.strokeRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
  } else if (kind === "shop") {
    ctx.fillStyle = PALETTE.vehicle;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-r * 0.35, -r * 0.1, r * 0.7, r * 0.2);
    ctx.fillRect(-r * 0.1, -r * 0.35, r * 0.2, r * 0.7);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = PALETTE.vehicle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** The player: an arrow pointing the way they face. */
function you(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.scale(s, s);
  ctx.fillStyle = PALETTE.you;
  ctx.strokeStyle = PALETTE.youEdge;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -6);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const LABELS: { text: string; at: V2; minScale?: number }[] = [
  { text: "Sales Centre", at: [LANDMARKS.sales.position[0], LANDMARKS.sales.position[1] + 14] },
  { text: "Panel Factory", at: [LANDMARKS.factory.position[0], LANDMARKS.factory.position[1] - 26] },
  { text: "Water Tower", at: [LANDMARKS.tower.position[0], LANDMARKS.tower.position[1] - 12] },
  { text: "Goat Farm", at: [LANDMARKS.farm.position[0], LANDMARKS.farm.position[1] - 12] },
  { text: "Ridge Park", at: [LANDMARKS.park.position[0] - 14, LANDMARKS.park.position[1] + 18] },
  { text: "Corner Market", at: [LANDMARKS.shop.position[0], LANDMARKS.shop.position[1] + 15] },
  { text: "Public School", at: [LANDMARKS.school.position[0], LANDMARKS.school.position[1] + 22] },
  { text: "Ridge Centre Mall", at: [LANDMARKS.mall.position[0], LANDMARKS.mall.position[1] + 36] },
  { text: "Rosa's Cottage", at: [COTTAGE.position[0], COTTAGE.position[1] + 16] },
];

const STREET_LABELS: { text: string; at: V2; vertical?: boolean }[] = [
  { text: STREETS.boulevard.name, at: [-300, 0] },
  { text: STREETS.ridgeview.name, at: [0, STREETS.ridgeview.z] },
  { text: STREETS.maple.name, at: [0, STREETS.maple.z] },
  { text: STREETS.birch.name, at: [0, STREETS.birch.z] },
  { text: STREETS.market.name, at: [100, STREETS.market.z] },
  { text: STREETS.west.name, at: [STREETS.west.x, 60], vertical: true },
  { text: STREETS.east.name, at: [STREETS.east.x, 60], vertical: true },
  { text: STREETS.link.name, at: [STREETS.link.x, 150], vertical: true },
  { text: "Cottage Road", at: [-430, 420] },
];

/** Draws the map for a view. `full` adds place and street names. */
export function drawMap(ctx: CanvasRenderingContext2D, w: number, h: number, v: MapView, st: MapState, full: boolean) {
  const img = baseMap(st.stages);
  ctx.save();
  ctx.fillStyle = "#d6d6c6";
  ctx.fillRect(0, 0, w, h);
  // Base layer: world metres → canvas pixels.
  const s = 1 / (v.mpp * PPM);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, w / 2 - (v.cx + PLAY_HALF) * PPM * s, h / 2 - (v.cz + PLAY_HALF) * PPM * s, SIZE * s, SIZE * s);

  const P = (x: number, z: number) => toScreen(v, w, h, x, z);

  // Labels (full map only, once there's room for them).
  if (full) {
    ctx.font = '600 11px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (v.mpp < 1.6) {
      ctx.fillStyle = "rgba(90, 86, 78, 0.9)";
      for (const l of STREET_LABELS) {
        const [x, y] = P(...l.at);
        ctx.save();
        ctx.translate(x, y);
        if (l.vertical) ctx.rotate(-Math.PI / 2);
        ctx.fillText(l.text.toUpperCase(), 0, 0.5);
        ctx.restore();
      }
    }
    ctx.font = '600 12px "Inter", "Segoe UI", system-ui, sans-serif';
    for (const l of LABELS) {
      const [x, y] = P(...l.at);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(240,238,232,0.9)";
      ctx.strokeText(l.text, x, y);
      ctx.fillStyle = PALETTE.label;
      ctx.fillText(l.text, x, y);
    }
  }

  // Elephant search area once Rosa has asked.
  if (st.elephant === "asked") {
    const [x, y] = P(...ELEPHANT_SEARCH.centre);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = PALETTE.side;
    ctx.fillStyle = "rgba(47,143,136,0.1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, ELEPHANT_SEARCH.radius / v.mpp, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Goats still on the loose.
  for (const g of runtime.goats) {
    if (g.home || st.goatsHome.includes(g.id)) continue;
    const [x, y] = P(g.x, g.z);
    ctx.fillStyle = PALETTE.goat;
    ctx.strokeStyle = PALETTE.youEdge;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Your vehicles and animals, where you left them.
  const sim = host.sim;
  if (sim) {
    const spots: [number, number][] = [];
    for (const veh of Object.values(sim.vehicles)) if (veh) spots.push([veh.position.x, veh.position.z]);
    for (const [id, a] of Object.entries(sim.animals)) if (a && (id !== "elephant" || st.owned.elephant)) spots.push([a.x, a.z]);
    if (sim.heli) spots.push([sim.heli.x, sim.heli.z]);
    const b = runtime.body;
    for (const [x, z] of spots) if (Math.hypot(x - b.x, z - b.z) > 3) marker(ctx, ...P(x, z), "vehicle");
  }

  // Side jobs and the Gear Garage.
  marker(ctx, ...P(...GEAR_GARAGE), "shop", 6);
  if (st.delivery) marker(ctx, ...P(...st.delivery.drop.at), "side", 7);
  else marker(ctx, ...P(...DEPOT), "side", 6);
  if (st.elephant === "none") marker(ctx, ...P(...ROSA.position), "side", 6);

  // The story objective: on the map, or pinned to the edge pointing at it.
  const step = currentStep(st.progress);
  if (step) {
    const [tx, ty] = P(...stepTarget(step));
    const m = 12;
    if (tx < m || ty < m || tx > w - m || ty > h - m) {
      const ang = Math.atan2(ty - h / 2, tx - w / 2);
      const k = Math.min((w / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (h / 2 - m) / Math.abs(Math.sin(ang) || 1e-6));
      const ex = w / 2 + Math.cos(ang) * k;
      const ey = h / 2 + Math.sin(ang) * k;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.fillStyle = PALETTE.objective;
      ctx.strokeStyle = PALETTE.youEdge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, -6);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else marker(ctx, tx, ty, "objective", 6);
  }

  const b = runtime.body;
  you(ctx, ...P(b.x, b.z), b.heading, full ? 1.15 : 1);
  ctx.restore();
}

/** Symbols for the legend, drawn with the same code as the map. */
export function drawLegendSymbol(ctx: CanvasRenderingContext2D, kind: string, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  switch (kind) {
    case "you":
      you(ctx, cx, cy, -Math.PI / 4, 0.9);
      break;
    case "objective":
      marker(ctx, cx, cy, "objective", 5);
      break;
    case "side":
      marker(ctx, cx, cy, "side", 6);
      break;
    case "shop":
      marker(ctx, cx, cy, "shop", 6);
      break;
    case "vehicle":
      marker(ctx, cx, cy, "vehicle", 7);
      break;
    case "goat":
      ctx.fillStyle = PALETTE.goat;
      ctx.strokeStyle = PALETTE.youEdge;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "search":
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = PALETTE.side;
      ctx.fillStyle = "rgba(47,143,136,0.12)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case "road":
    case "country":
      ctx.fillStyle = PALETTE.roadCase;
      ctx.fillRect(2, cy - 4, w - 4, 8);
      ctx.fillStyle = kind === "road" ? PALETTE.road : PALETTE.country;
      ctx.fillRect(3, cy - 2.5, w - 6, 5);
      break;
    case "home":
    case "build":
    case "landmark":
      ctx.fillStyle = kind === "home" ? PALETTE.building : kind === "build" ? PALETTE.construction : PALETTE.landmark;
      ctx.strokeStyle = PALETTE.buildingEdge;
      ctx.lineWidth = 1;
      ctx.fillRect(cx - 7, cy - 5, 14, 10);
      ctx.strokeRect(cx - 7, cy - 5, 14, 10);
      break;
    case "woods":
      ctx.fillStyle = PALETTE.woods;
      for (const [dx, dy] of [
        [-4, -1],
        [3, -3],
        [1, 3],
        [-2, 4],
        [5, 2],
      ]) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "water":
      ctx.fillStyle = PALETTE.water;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "hills": {
      const g = ctx.createLinearGradient(2, 0, w - 2, 0);
      g.addColorStop(0, `rgb(${PALETTE.hillLow.join(",")})`);
      g.addColorStop(1, `rgb(${PALETTE.hillHigh.map((c) => c * 0.8).join(",")})`);
      ctx.fillStyle = g;
      ctx.fillRect(2, cy - 5, w - 4, 10);
      break;
    }
  }
}
