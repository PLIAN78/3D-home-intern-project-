import type { Community, Lot, PlaceholderStyle } from "@/lib/models/community";
import { toLatLng, type LatLng } from "./geo";
import type { ContextRoad } from "./siteContext";
import { applySimilarity, type GeoreferenceResult } from "./sitePlan/georeference";
import type { ParsedSitePlan } from "./sitePlan/parseSitePlan";

/**
 * Turn a georeferenced site plan into a Community in world metres
 * (x east, z = −north). Each lot gets an oriented box whose local +z faces
 * the nearest real street, so existing house placement / camera code works.
 */

type V = [number, number];

function obb(pts: V[]) {
  let best = { area: Infinity, u: [1, 0] as V, v: [0, 1] as V, cu: 0, cv: 0, eu: 0, ev: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const u: V = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const v: V = [-u[1], u[0]];
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of pts) {
      const pu = p[0] * u[0] + p[1] * u[1];
      const pv = p[0] * v[0] + p[1] * v[1];
      minU = Math.min(minU, pu);
      maxU = Math.max(maxU, pu);
      minV = Math.min(minV, pv);
      maxV = Math.max(maxV, pv);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < best.area) best = { area, u, v, cu: (minU + maxU) / 2, cv: (minV + maxV) / 2, eu: maxU - minU, ev: maxV - minV };
  }
  const centre: V = [best.u[0] * best.cu + best.v[0] * best.cv, best.u[1] * best.cu + best.v[1] * best.cv];
  return { centre, u: best.u, v: best.v, eu: best.eu, ev: best.ev };
}

function nearestRoadPoint(roads: ContextRoad[], x: number, z: number, maxDist: number): V | null {
  let best: { d: number; p: V } | null = null;
  for (const r of roads) {
    if (r.kind === "path") continue;
    const pts = r.points;
    for (let i = 0; i < pts.length - 1; i++) {
      // Roads are in plan metres (y north) → world z = −y.
      const ax = pts[i][0], az = -pts[i][1], bx = pts[i + 1][0], bz = -pts[i + 1][1];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9)));
      const px = ax + dx * t, pz = az + dz * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < maxDist && (!best || d < best.d)) best = { d, p: [px, pz] };
    }
  }
  return best?.p ?? null;
}

const STYLES: PlaceholderStyle[] = ["classic", "modern", "craftsman", "classic"];
const BODY = ["#d8d2c6", "#8f8a82", "#b8a68c", "#e9e6df", "#6f7277", "#a9937a", "#cfc5b2", "#9aa19a"];
const ROOF = ["#2c2d30", "#5a5048", "#4a4f55", "#34383d"];

export interface BuildCommunityInput {
  id: string;
  name: string;
  city?: string;
  region?: string;
  url?: string;
  origin: LatLng;
  contextKey: string;
  plan: ParsedSitePlan;
  georef: GeoreferenceResult;
  roads: ContextRoad[];
  sitePlan: { url?: string; fileName?: string };
}

function inside(p: V, poly: V[]) {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) r = !r;
  }
  return r;
}

/**
 * Site plans label a townhome block ("TH-301") and number its units 1…n.
 * Units become "TH-301-3" (unique, searchable) and the block outline itself
 * is dropped from the lot list once its units are known.
 */
export function numberTownhomeUnits(lots: Lot[]) {
  const blocks = lots.filter((l) => /^TH-/i.test(l.number) && l.polygon);
  const blockIds = new Set<string>();
  const used = new Set(lots.map((l) => l.id));
  for (const unit of lots) {
    if (!/^\d{1,2}$/.test(unit.number)) continue;
    const c: V = [unit.position[0], unit.position[2]];
    const block = blocks.find((b) => inside(c, b.polygon!));
    if (!block) continue;
    blockIds.add(block.id);
    used.delete(unit.id);
    unit.number = `${block.number}-${unit.number}`;
    let id = `lot-${unit.number.toLowerCase()}`;
    while (used.has(id)) id = `${id}-b`;
    used.add(id);
    unit.id = id;
    unit.collection ??= block.collection;
    if (!unit.status || unit.status === "future") unit.status = block.status ?? unit.status;
  }
  for (let i = lots.length - 1; i >= 0; i--) if (blockIds.has(lots[i].id)) lots.splice(i, 1);

  // Units left with bare numbers: group touching units of the same collection into
  // rows ("blocks"), named after a TH label nearby or numbered in order.
  const loose = lots.filter((l) => /^\d{1,2}$/.test(l.number) && (/town/i.test(l.collection ?? "") || l.width < 8.5));
  if (loose.length) {
    const parent = loose.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < loose.length; i++) {
      for (let j = i + 1; j < loose.length; j++) {
        const a = loose[i];
        const b = loose[j];
        if (a.collection !== b.collection) continue;
        const d = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
        const turn = Math.abs(Math.sin(a.rotation[1] - b.rotation[1]));
        if (d < ((a.width + b.width) / 2) * 1.35 && turn < 0.26) parent[find(i)] = find(j);
      }
    }
    const groups = new Map<number, Lot[]>();
    loose.forEach((l, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), l]));
    const labels = lots.filter((l) => /^TH-\d+$/i.test(l.number));
    let n = 0;
    const ordered = [...groups.values()].sort((g, h) => g[0].position[2] - h[0].position[2] || g[0].position[0] - h[0].position[0]);
    for (const g of ordered) {
      if (g.length < 2) continue;
      const cx = g.reduce((a, l) => a + l.position[0], 0) / g.length;
      const cz = g.reduce((a, l) => a + l.position[2], 0) / g.length;
      const label = labels.find((t) => Math.hypot(t.position[0] - cx, t.position[2] - cz) < 12 + g.length * 4);
      const name = label?.number ?? `B${++n}`;
      for (const unit of g) {
        used.delete(unit.id);
        unit.number = `${name}-${unit.number}`;
        let id = `lot-${unit.number.toLowerCase()}`;
        while (used.has(id)) id = `${id}-b`;
        used.add(id);
        unit.id = id;
      }
    }
  }
  // Blocks with the same label (drawn twice on the plan) whose units were found elsewhere.
  const numbered = new Set(lots.filter((l) => /^TH-.+-\d+$/i.test(l.number)).map((l) => l.number.replace(/-\d+$/, "")));
  for (let i = lots.length - 1; i >= 0; i--) if (/^TH-\d+$/i.test(lots[i].number) && numbered.has(lots[i].number)) lots.splice(i, 1);
}

export function buildCommunityFromSitePlan(input: BuildCommunityInput): Community {
  const { plan, georef, roads } = input;
  const toWorld = (p: V): V => {
    const [X, Y] = applySimilarity(georef.transform, p[0], p[1]);
    return [Math.round(X * 100) / 100, Math.round(-Y * 100) / 100];
  };
  const used = new Set<string>();
  const lots: Lot[] = [];
  let unnumbered = 0;
  plan.lots.forEach((pl, i) => {
    const poly = pl.points.map(toWorld);
    const box = obb(poly);
    const [cx, cz] = box.centre;
    // Face a street. Probe just beyond each side of the box; sides with a road
    // close by are candidates, and the short side wins (lots front on their
    // narrow dimension — corner lots otherwise pick the flanking street).
    const axes = [
      { a: box.u, along: box.eu, across: box.ev },
      { a: [-box.u[0], -box.u[1]] as V, along: box.eu, across: box.ev },
      { a: box.v, along: box.ev, across: box.eu },
      { a: [-box.v[0], -box.v[1]] as V, along: box.ev, across: box.eu },
    ];
    const scored = axes.map((ax) => {
      const probe: V = [cx + ax.a[0] * (ax.along / 2 + 6), cz + ax.a[1] * (ax.along / 2 + 6)];
      const p = nearestRoadPoint(roads, probe[0], probe[1], 60);
      const d = p ? Math.hypot(p[0] - probe[0], p[1] - probe[1]) : 60;
      const longSide = ax.across > ax.along * 1.1;
      return { ax, score: d + (longSide ? 8 : 0) };
    });
    const front = scored.sort((p, q) => p.score - q.score)[0].ax;
    const width = front.across;
    const depth = front.along;
    let number = pl.number?.replace(/^TH-?/i, "TH-") ?? null;
    if (!number) number = `U${++unnumbered}`;
    let id = `lot-${number.toLowerCase()}`;
    while (used.has(id)) id = `${id}-b`;
    used.add(id);
    const townhome = /town/i.test(pl.collection ?? "");
    const ll = toLatLng(input.origin, { x: cx, y: -cz });
    lots.push({
      id,
      number,
      position: [Math.round(cx * 100) / 100, 0, Math.round(cz * 100) / 100],
      rotation: [0, Math.atan2(front.a[0], front.a[1]), 0],
      width: Math.round(width * 100) / 100,
      depth: Math.round(depth * 100) / 100,
      frontSetback: Math.max(3, Math.min(6, depth * 0.2)),
      placeholder: {
        style: townhome ? "modern" : STYLES[i % STYLES.length],
        bodyColor: BODY[i % BODY.length],
        roofColor: ROOF[i % ROOF.length],
        garageSide: i % 2 ? "left" : "right",
        storeys: 2,
      },
      status: pl.status,
      polygon: poly,
      collection: pl.collection,
      latLng: { lat: Math.round(ll.lat * 1e7) / 1e7, lng: Math.round(ll.lng * 1e7) / 1e7 },
    });
  });

  numberTownhomeUnits(lots);

  const xs = lots.flatMap((l) => l.polygon!.map((p) => p[0]));
  const zs = lots.flatMap((l) => l.polygon!.map((p) => p[1]));
  return {
    id: input.id,
    name: input.name,
    city: input.city,
    region: input.region,
    url: input.url,
    phase: plan.title ?? undefined,
    lots,
    roads: [],
    trees: [],
    blocks: plan.blocks.map((b) => ({ points: b.points.map(toWorld), label: b.label })),
    collections: plan.collections,
    geo: {
      origin: input.origin,
      contextKey: input.contextKey,
      bounds: { minX: Math.min(...xs), minZ: Math.min(...zs), maxX: Math.max(...xs), maxZ: Math.max(...zs) },
      sitePlan: { ...input.sitePlan, rmsMetres: georef.rmsMetres, confidence: georef.confidence, matchedStreets: georef.usedLabels, method: georef.method ?? "street-names", importedAt: new Date().toISOString() },
    },
  };
}
