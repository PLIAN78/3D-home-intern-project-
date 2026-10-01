import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/storage/objectStorage";
import { toLocal, type LatLng } from "./geo";
import { ROAD_WIDTH, roadKind, type ContextBuilding, type ContextRoad, type SiteContext } from "./siteContext";

/**
 * Fetch real-world surroundings from OpenStreetMap (Overpass API), convert
 * them to local metres and cache on disk. Data © OpenStreetMap contributors
 * (ODbL) — the attribution must be shown wherever it is rendered.
 */

const ENDPOINTS = ["https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const USER_AGENT = "HomeStudio/0.1 (+https://github.com/PLIAN78/3D-home-intern-project-)";
const CACHE_DIR = path.join(DATA_DIR, "cache", "osm");

interface OsmElement {
  type: "way" | "node" | "relation";
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
}

/** Two lighter queries (public Overpass servers time out on one big one). */
function queries(o: LatLng, radius: number): string[] {
  const a = `around:${radius},${o.lat},${o.lng}`;
  return [
    `[out:json][timeout:90];
(
  way(${a})["highway"];
  way(${a})["natural"="water"];
  way(${a})["waterway"="riverbank"];
  relation(${a})["natural"="water"];
  way(${a})["leisure"~"park|pitch|playground|golf_course|nature_reserve"];
  way(${a})["landuse"~"grass|meadow|recreation_ground|village_green|forest"];
  way(${a})["natural"~"wood|scrub|grassland"];
);
out geom qt;`,
    `[out:json][timeout:90];
way(${a})["building"];
out geom qt;`,
  ];
}

async function overpass(q: string): Promise<{ elements: OsmElement[] }> {
  let lastError: unknown;
  // Two passes over the mirrors with a short back-off: public servers are often busy.
  for (const url of [...ENDPOINTS, ...ENDPOINTS]) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT }, body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return (await res.json()) as { elements: OsmElement[] };
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(`OpenStreetMap map servers are busy right now (${lastError instanceof Error ? lastError.message : "no response"}). Please try again in a few minutes.`);
}

function heightOf(tags: Record<string, string>) {
  const h = Number.parseFloat(tags.height ?? "");
  if (Number.isFinite(h) && h > 2) return Math.min(h, 120);
  const levels = Number.parseFloat(tags["building:levels"] ?? "");
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels * 3 + 1.5, 120);
  if (/^(garage|shed|carport|roof)$/.test(tags.building ?? "")) return 3;
  if (/^(apartments|commercial|retail|school|office|industrial|warehouse)$/.test(tags.building ?? "")) return 9;
  return 7.5; // typical suburban detached / town
}

export function parseOverpass(origin: LatLng, radius: number, elements: OsmElement[]): SiteContext {
  const ring = (g: { lat: number; lon: number }[]) => g.map((p) => {
    const l = toLocal(origin, { lat: p.lat, lng: p.lon });
    return [Math.round(l.x * 10) / 10, Math.round(l.y * 10) / 10] as [number, number];
  });
  const roads: ContextRoad[] = [];
  const buildings: ContextBuilding[] = [];
  const water: [number, number][][] = [];
  const green: [number, number][][] = [];
  const woods: [number, number][][] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    if (e.type === "relation") {
      if (t.natural === "water") for (const m of e.members ?? []) if (m.role === "outer" && m.geometry?.length) water.push(ring(m.geometry));
      continue;
    }
    if (!e.geometry?.length) continue;
    const pts = ring(e.geometry);
    if (t.highway) {
      const kind = roadKind(t.highway === "construction" || t.highway === "proposed" ? t.construction ?? t.proposed ?? t.highway : t.highway);
      if (!kind || t.area === "yes") continue;
      const lanes = Number.parseInt(t.lanes ?? "", 10);
      roads.push({ id: e.id, name: t.name, kind, width: Number.isFinite(lanes) && kind !== "path" ? Math.max(ROAD_WIDTH[kind], lanes * 3.4) : ROAD_WIDTH[kind], points: pts });
    } else if (t.building) {
      if (pts.length >= 4) buildings.push({ id: e.id, height: heightOf(t), points: pts.slice(0, -1) });
    } else if (t.natural === "water" || t.waterway === "riverbank") {
      water.push(pts);
    } else if (t.natural === "wood" || t.landuse === "forest" || t.natural === "scrub") {
      woods.push(pts);
    } else {
      green.push(pts);
    }
  }
  return { origin, radius, source: "openstreetmap", attribution: "© OpenStreetMap contributors", fetchedAt: new Date().toISOString(), roads, buildings, water, green, woods };
}

/**
 * A cached download centred close by that covers most of the requested area.
 * Public Overpass servers are often overloaded, so re-imports reuse data.
 * The returned context keeps its own origin — callers must use `ctx.origin`.
 */
async function findCoveringCache(origin: LatLng, radius: number): Promise<SiteContext | null> {
  let files: string[];
  try {
    files = await fs.readdir(CACHE_DIR);
  } catch {
    return null;
  }
  let best: { d: number; file: string } | null = null;
  for (const f of files) {
    const m = /^(-?[\d.]+)_(-?[\d.]+)_(\d+)\.json$/.exec(f);
    if (!m) continue;
    const r = Number(m[3]);
    const l = toLocal(origin, { lat: Number(m[1]), lng: Number(m[2]) });
    const d = Math.hypot(l.x, l.y);
    if (r - d >= radius * 0.75 && (!best || d < best.d)) best = { d, file: f };
  }
  if (!best) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(CACHE_DIR, best.file), "utf8")) as SiteContext;
  } catch {
    return null;
  }
}

/** Real-world context around a point, cached on disk by location + radius. */
export async function fetchSiteContext(origin: LatLng, radius = 900): Promise<SiteContext> {
  const key = `${origin.lat.toFixed(4)}_${origin.lng.toFixed(4)}_${radius}.json`;
  const file = path.join(CACHE_DIR, key);
  try {
    const cached = JSON.parse(await fs.readFile(file, "utf8")) as SiteContext;
    // The cache key is rounded, so always re-express in the requested origin's frame.
    if (cached.origin.lat === origin.lat && cached.origin.lng === origin.lng) return cached;
  } catch {
    /* not cached */
  }
  const nearby = await findCoveringCache(origin, radius);
  if (nearby) return nearby;
  const elements: OsmElement[] = [];
  for (const q of queries(origin, radius)) elements.push(...(await overpass(q)).elements);
  const ctx = parseOverpass(origin, radius, elements);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(ctx));
  return ctx;
}
