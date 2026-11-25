import { riverZ,riverWidth,ISLANDS,ISLAND_WALKS,NORTH_ROADS,RAIL_PATH,STATION_ACCESS,STATION_PATH_WIDTH,STATION_PLATFORM,PORTS,CAMPUS_PATHS,BRIDGES } from "../world/v6";
import { MEADOW_PAVING, MEADOW_STREET_NAMES, MEADOW_X, MEADOW_Z } from "../world/meadows";
import { CAMPUS_BUILDINGS, CAMPUS_LAWNS, COLUMBIA_Z, CREEK_WIDTH, LAUREL_CREEK, RING } from "../world/campus";
import { CITY_STREET_NAMES } from "../world/owawaCity";
import { BEACH, SHORES } from "../world/shoreline";

/** Short names for the campus buildings, as on the campus map. */
const CAMPUS_SHORT: Record<string, string> = {
  gym: "PAC", cafeteria: "SLC", exp: "EXP", bmh: "BMH", m3: "M3", davis: "DC", qnc: "QNC", math: "MC", m4: "M4", c2: "C2", esc: "ESC",
  principal: "NH", science: "STC", b1: "B1", porter: "Dana Porter", ml: "ML", business: "TC", environment: "EV3", ev1: "EV1", al: "AL",
  arts: "HH", pas: "PAS", engineering: "E7", "engineering-5": "E5", stj: "STJ",
};
const CAMPUS_LABELS = CAMPUS_BUILDINGS.map((b) => ({ text: CAMPUS_SHORT[b.id] ?? b.name, at: [b.at[0], b.at[1]] as V2 }));
import { runtime } from "../core/runtime";
import { host, TREES } from "../core/simHost";
import type { Owned } from "../story/economy";
import { currentStep, GEAR_GARAGE, stepTarget, type Progress } from "../story/missions";
import { DEPOT, ELEPHANT_SEARCH, ROSA, type Delivery, type ElephantQuest } from "../story/sidequests";
import { PLACE_IDS, PLACES } from "../story/places";
import { OFFICE } from "../world/office";
import { CAIVAN_RIDGE, collisionBoxes, LANDMARKS, PAVED, PEN, STREETS, type V2 } from "../world/map";
import { COTTAGE, COUNTRY_ROADS, FLAT_HALF, LAKE_Y, lakeRadius, OWAWA, PLAY_HALF, terrainHeight } from "../world/terrain";
import { CITY_HALL, CITY_PAVING, CITY_STREETS, OWAWA_ROADS, SHAWARMA, SQUARE } from "../world/owawa";
import { ELIAS, TACKLE_SEARCH } from "../world/lake";
import { activeQuests, TRAN } from "../story/quests";
import type { CoopStep, EliasStep, GameState } from "../story/store";

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

const WATER_RGB = [167, 196, 214];

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
      // Heron Lake: below the waterline inside the basin.
      const x = -PLAY_HALF + (i + 0.5) * step;
      const z = -PLAY_HALF + (j + 0.5) * step;
      if (H(i, j) < LAKE_Y && lakeRadius(x, z) < 1.1) {
        img.data[k] = WATER_RGB[0];
        img.data[k + 1] = WATER_RGB[1];
        img.data[k + 2] = WATER_RGB[2];
      } else for (let c = 0; c < 3; c++) img.data[k + c] = (PALETTE.hillLow[c] + (PALETTE.hillHigh[c] - PALETTE.hillLow[c]) * e) * shade;
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

  // River, new island communities and express rail share the world contract.
  for(let x=-1000;x<1000;x+=4){ctx.fillStyle=PALETTE.water;ctx.fillRect(wx(x),wx(riverZ(x)-riverWidth(x)/2),4*PPM,riverWidth(x)*PPM);}
  for(const island of ISLANDS){ctx.fillStyle=PALETTE.field;ctx.beginPath();ctx.ellipse(wx(island.at[0]),wx(island.at[1]),island.rx*PPM,island.rz*PPM,0,0,Math.PI*2);ctx.fill();}
  for(const w of ISLAND_WALKS)strokePath(ctx,w.points,w.width+.6,"#d5cdb9");
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

  // Downtown Owawa: paved blocks and the square's lawn.
  ctx.fillStyle = PALETTE.parking;
  ctx.fillRect(wx(CITY_PAVING.x0), wx(CITY_PAVING.z0), (CITY_PAVING.x1 - CITY_PAVING.x0) * PPM, (CITY_PAVING.z1 - CITY_PAVING.z0) * PPM);
  ctx.fillStyle = PALETTE.field;
  ctx.fillRect(wx(SQUARE.x0), wx(SQUARE.z0), (SQUARE.x1 - SQUARE.x0) * PPM, (SQUARE.z1 - SQUARE.z0) * PPM);

  // North Meadows parking and forecourts.
  ctx.fillStyle = PALETTE.parking;
  for (const p of MEADOW_PAVING) ctx.fillRect(wx(p.x0), wx(p.z0), (p.x1 - p.x0) * PPM, (p.z1 - p.z0) * PPM);

  // Bridges: the deck and parapets as a dark band over the water; the road is painted on top.
  ctx.fillStyle = PALETTE.buildingEdge;
  for (const b of BRIDGES) ctx.fillRect(wx(b.x - b.width / 2 - 0.6), wx(b.z - b.length / 2), (b.width + 1.2) * PPM, b.length * PPM);

  // Roads: casing, then surface. Country roads (and the bridge roads) get a cream fill.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Meadows Beach: sand along the river's south bank.
  for (const s of SHORES.filter((s) => s.id.startsWith("river-south"))) {
    const pts = s.points.map((p, i) => [p, s.normals[i]] as const).filter(([p]) => p[0] > BEACH.x0 && p[0] < BEACH.x1);
    if (pts.length < 2) continue;
    ctx.fillStyle = "#e4d6ad";
    ctx.beginPath();
    pts.forEach(([p], i) => (i ? ctx.lineTo(wx(p[0]), wx(p[1])) : ctx.moveTo(wx(p[0]), wx(p[1]))));
    [...pts].reverse().forEach(([p, n]) => ctx.lineTo(wx(p[0] + n[0] * BEACH.depth), wx(p[1] + n[1] * BEACH.depth)));
    ctx.closePath();
    ctx.fill();
  }
  // Campus lawns and Laurel Creek.
  for (const l of CAMPUS_LAWNS) { ctx.fillStyle = "#b9cf9f"; ctx.fillRect(wx(l.x0), wx(l.z0), (l.x1 - l.x0) * PPM, (l.z1 - l.z0) * PPM); }
  strokePath(ctx, LAUREL_CREEK, CREEK_WIDTH, PALETTE.water);
  // Station forecourts and their footpaths (under the road edges they meet).
  for (const a of STATION_ACCESS) {
    ctx.fillStyle = "#d9d2bf";
    ctx.fillRect(wx(a.forecourt.x0), wx(a.forecourt.z0), (a.forecourt.x1 - a.forecourt.x0) * PPM, (a.forecourt.z1 - a.forecourt.z0) * PPM);
    for (const p of [a.path, ...a.extra]) strokePath(ctx, p, STATION_PATH_WIDTH + 0.6, "#d5cdb9");
  }
  const streets = [...CAIVAN_RIDGE.roads, ...OWAWA_ROADS, ...NORTH_ROADS];
  for (const r of streets) strokePath(ctx, [r.from as V2, r.to as V2], r.width + 2.4, PALETTE.roadCase);
  for (const r of COUNTRY_ROADS) strokePath(ctx, r.points, r.width + 2.4, PALETTE.roadCase);
  for (const r of streets) strokePath(ctx, [r.from as V2, r.to as V2], r.width, PALETTE.road);
  for (const r of COUNTRY_ROADS) strokePath(ctx, r.points, r.width, PALETTE.country);

  // Buildings: homes, frames under construction, landmarks.
  for (const b of collisionBoxes(stages as never)) {
    if (b.id === "parked" || b.id === "sign" || b.id === "porch" || b.id === "office" || b.id === "river-bridge" || b.id === "bridge-rail" || b.id?.startsWith("station-") || b.id === "rail-post" || b.id === "mall-counter" || b.id === "mall-shelf") continue;
    ctx.fillStyle = b.kind === "frame" ? PALETTE.construction : b.kind === "landmark" || b.kind === "post" ? PALETTE.landmark : PALETTE.building;
    ctx.strokeStyle = PALETTE.buildingEdge;
    ctx.lineWidth = 0.8 * PPM;
    ctx.fillRect(wx(b.x0), wx(b.z0), (b.x1 - b.x0) * PPM, (b.z1 - b.z0) * PPM);
    ctx.strokeRect(wx(b.x0), wx(b.z0), (b.x1 - b.x0) * PPM, (b.z1 - b.z0) * PPM);
  }
  // The office is drawn by its footprint (its physics is walls and furniture).
  ctx.fillStyle = PALETTE.landmark;
  ctx.fillRect(wx(OFFICE.centre[0] - OFFICE.w / 2), wx(OFFICE.centre[1] - OFFICE.d / 2), OFFICE.w * PPM, OFFICE.d * PPM);
  ctx.strokeRect(wx(OFFICE.centre[0] - OFFICE.w / 2), wx(OFFICE.centre[1] - OFFICE.d / 2), OFFICE.w * PPM, OFFICE.d * PPM);
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
  strokePath(ctx,RAIL_PATH,3,"#37a6bd");
  // Stations: the platform along the track, the lift and entrance, and the stop marker.
  for(const a of STATION_ACCESS){
    const [tx,tz]=a.tangent,hl=STATION_PLATFORM.length/2,hw=STATION_PLATFORM.width/2;
    ctx.fillStyle="#b9b5a8";ctx.strokeStyle=PALETTE.buildingEdge;ctx.lineWidth=.8*PPM;ctx.beginPath();
    for(const [u,v] of [[-hl,-hw],[hl,-hw],[hl,hw],[-hl,hw]])ctx.lineTo(wx(a.at[0]+tx*u-tz*v),wx(a.at[1]+tz*u+tx*v));
    ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle="#317986";ctx.fillRect(wx(a.lift[0]-2.3),wx(a.lift[1]-2.3),4.6*PPM,4.6*PPM);
    const [fx,fz]=a.face,dw=Math.abs(fx)*7+Math.abs(fz)*6.3,dd=Math.abs(fz)*7+Math.abs(fx)*6.3;
    ctx.fillStyle="#2b6d7c";ctx.fillRect(wx(a.door[0]-dw/2),wx(a.door[1]-dd/2),dw*PPM,dd*PPM);
    ctx.fillStyle="#e9f6f5";ctx.strokeStyle="#237e97";ctx.lineWidth=2;ctx.beginPath();ctx.arc(wx(a.at[0]),wx(a.at[1]),7,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  for(const path of CAMPUS_PATHS)strokePath(ctx,path,5,"#d5cdb9");
  ctx.fillStyle=PALETTE.parking;ctx.fillRect(wx(-896),wx(-275),42*PPM,550*PPM);
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
  elias: EliasStep;
  coop: CoopStep;
  land: GameState["land"];
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
  { text: "Caivan Office", at: [OFFICE.centre[0], OFFICE.centre[1] - 16] },
  { text: "Ridge Motors", at: [LANDMARKS.dealer.position[0], LANDMARKS.dealer.position[1] + 15] },
  { text: "Bank", at: [LANDMARKS.bank.position[0], LANDMARKS.bank.position[1] - 12] },
  { text: "Outfitters", at: [LANDMARKS.clothing.position[0], LANDMARKS.clothing.position[1] - 11] },
  { text: "Subs", at: [LANDMARKS.subs.position[0], LANDMARKS.subs.position[1] + 10] },
  { text: "Burgers", at: [LANDMARKS.burger.position[0], LANDMARKS.burger.position[1] + 11] },
  {text:"Heron Gardens Island",at:[-650,-700]},
  {text:"North Meadows",at:[165,-270]},
  { text: "Boat Dock", at: [-575, -520] },
  { text: "City Hall", at: [CITY_HALL.at[0], CITY_HALL.at[1] - 20] },
  { text: "Owawa Square", at: [650, -612] },
  { text: "Shawarma", at: [SHAWARMA.at[0], SHAWARMA.at[1] - 11] },
  // The lake's marina and the island harbour share the busy top-left corner with the dock, the island and the station: only those three are named there.
  ...PORTS.filter(p=>p.id==="river").map(p=>({text:p.name,at:[p.at[0],p.at[1]-16] as V2})),
  ...STATION_ACCESS.map(a=>({text:a.name+" Station",at:[a.at[0]-a.normal[0]*16,a.at[1]-a.normal[1]*16] as V2})),
  ...CAMPUS_LABELS,
  ...[{text:"UNIVERSITY OF VATALOO",at:[715,545] as V2},{text:"Owawa River",at:[70,riverZ(70)] as V2},{text:"Regional Airport",at:[-800,0] as V2},{text:"Riverbank Financial",at:[-410,-830] as V2},{text:"Northshore Condos",at:[-170,-830] as V2}],
  { text: "DOWNTOWN", at: [OWAWA.centre[0], OWAWA.centre[1] - OWAWA.half + 4] },
  { text: "OWAWA", at: [-170, -885] },
  { text: "Meadows Beach", at: [245, -440] },
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
  { text: "Lake Road", at: [-385, -372] },
  { text: "Owawa Road", at: [600, -250] },
  { text: CITY_STREETS.wellington.name, at: [730, CITY_STREETS.wellington.z] },
  { text: CITY_STREETS.rideau.name, at: [730, CITY_STREETS.rideau.z] },
  { text: CITY_STREETS.queen.name, at: [740, CITY_STREETS.queen.z] },
  { text: CITY_STREETS.lyon.name, at: [CITY_STREETS.lyon.x, -620], vertical: true },
  { text: CITY_STREETS.elgin.name, at: [CITY_STREETS.elgin.x, -540], vertical: true },
  { text: CITY_STREETS.kent.name, at: [CITY_STREETS.kent.x, -700], vertical: true },
  // Owawa's avenues (west of Downtown)
  ...Object.entries(CITY_STREET_NAMES).map(([z, text]) => ({ text, at: [Number(z) === -920 ? -300 : -330, Number(z)] as V2 })),
  // University of Vataloo
  { text: "Columbia Street", at: [705, COLUMBIA_Z] },
  { text: "Ring Road", at: [RING.x1, 760], vertical: true },
  { text: "Ring Road", at: [700, RING.z1] },
  { text: "Laurel Creek", at: [LAUREL_CREEK[3][0] - 9, 700], vertical: true },
  // North Meadows
  { text: MEADOW_STREET_NAMES.fieldstone, at: [165, MEADOW_Z.fieldstone] },
  { text: MEADOW_STREET_NAMES.clover, at: [165, MEADOW_Z.clover] },
  { text: MEADOW_STREET_NAMES.meadow, at: [275, MEADOW_Z.meadow] },
  { text: MEADOW_STREET_NAMES.sorrel, at: [MEADOW_X.sorrel, -270], vertical: true },
  { text: MEADOW_STREET_NAMES.court, at: [MEADOW_X.court, -300], vertical: true },
  { text: "Quarry Lane", at: [MEADOW_X.quarry, -270], vertical: true },
  { text: "Heron Bridge Road", at: [BRIDGES[0].x, -420], vertical: true },
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

  // Where Elias's tackle box drifted.
  if (st.elias === "asked") {
    const [x, y] = P(...TACKLE_SEARCH.centre);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = PALETTE.side;
    ctx.fillStyle = "rgba(47,143,136,0.1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, TACKLE_SEARCH.radius / v.mpp, 0, Math.PI * 2);
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
    for (const h of Object.values(sim.helis)) spots.push([h.x, h.z]);
    for(const b of Object.values(sim.boats))spots.push([b.x,b.z]);
    for(const p of Object.values(sim.planes))spots.push([p.x,p.z]);
    const b = runtime.body;
    for (const [x, z] of spots) if (Math.hypot(x - b.x, z - b.z) > 3) marker(ctx, ...P(x, z), "vehicle");
  }

  // Side jobs and the Gear Garage.
  marker(ctx, ...P(...GEAR_GARAGE), "shop", 6);
  for (const id of PLACE_IDS) marker(ctx, ...P(...PLACES[id].door), "shop", 6);
  marker(ctx, ...P(OFFICE.centre[0], OFFICE.centre[1] + OFFICE.d / 2 + 1), "shop", 6);
  if (st.delivery) marker(ctx, ...P(...st.delivery.drop.at), "side", 7);
  else marker(ctx, ...P(...DEPOT), "side", 6);
  if (st.elephant === "none") marker(ctx, ...P(...ROSA.position), "side", 6);
  if (st.elias === "none") marker(ctx, ...P(...ELIAS.at), "side", 6);
  if (st.coop === "none") marker(ctx, ...P(...TRAN.at), "side", 6);
  for (const q of activeQuests(st)) if (q.label !== "Tackle box") marker(ctx, ...P(...q.at), "side", 7);

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
