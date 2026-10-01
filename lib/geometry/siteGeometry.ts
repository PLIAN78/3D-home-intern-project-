import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Lot } from "@/lib/models/community";
import type { SiteContext } from "@/lib/community/siteContext";
import { buildState, type BuildState, type LotProgress } from "@/lib/models/construction";
import { placeholderFor, type PlaceholderSurface } from "./placeholderHouse";
import { addBox, AXIS_FRAME, MeshBuilder } from "./meshBuilder";

/**
 * Geometry for real-world communities: OpenStreetMap surroundings and the
 * homes on every lot at their current construction stage, merged into a few
 * draw calls. Plan metres (x east, y north) map to world (x, −y).
 */

type P2 = [number, number];

function signedArea(pts: P2[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function clean(pts: P2[]): P2[] {
  const out = pts.slice();
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out;
}

/** Flat polygon at height y, plan coordinates (y north). */
function addFlatPolygon(b: MeshBuilder, plan: P2[], y: number) {
  const pts = clean(plan);
  if (pts.length < 3) return;
  // flatPolygon takes world (x, z) and fixes the winding itself.
  b.flatPolygon(pts.map((p) => new THREE.Vector2(p[0], -p[1])), [], y, "up");
}

export interface ContextGeometry {
  ground: THREE.BufferGeometry;
  green: THREE.BufferGeometry;
  woods: THREE.BufferGeometry;
  water: THREE.BufferGeometry;
  roads: THREE.BufferGeometry;
  paths: THREE.BufferGeometry;
  buildings: THREE.BufferGeometry;
  roofs: THREE.BufferGeometry;
  /** Tree positions scattered through woods (world x, z). */
  trees: { position: [number, number]; scale: number; variant: 0 | 1 | 2 }[];
  /** One label position per named street. */
  streetLabels: { name: string; position: [number, number, number] }[];
}

function pointInPoly(x: number, y: number, poly: P2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function centroid(pts: P2[]): P2 {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

/** Ribbon along a polyline (plan coordinates), slightly mitred at joints. */
function addRibbon(b: MeshBuilder, pts: P2[], width: number, y: number) {
  const hw = width / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const c = pts[i + 1];
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const L = Math.hypot(dx, dy);
    if (L < 0.01) continue;
    const nx = (-dy / L) * hw;
    const ny = (dx / L) * hw;
    // Extend each segment by half a width so joints overlap without gaps.
    const ex = (dx / L) * Math.min(hw, L / 2);
    const ey = (dy / L) * Math.min(hw, L / 2);
    const p0: P2 = [a[0] - ex + nx, a[1] - ey + ny];
    const p1: P2 = [a[0] - ex - nx, a[1] - ey - ny];
    const p2: P2 = [c[0] + ex - nx, c[1] + ey - ny];
    const p3: P2 = [c[0] + ex + nx, c[1] + ey + ny];
    const W = (p: P2): [number, number, number] => [p[0], y, -p[1]];
    b.polygon([W(p1), W(p0), W(p3), W(p2)], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
  }
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Build the surroundings. Buildings whose centre falls inside a lot (the
 * site plan is the source of truth there) are skipped.
 */
export function buildContextGeometry(ctx: SiteContext, lots: Lot[], blocks: { points: P2[] }[] = []): ContextGeometry {
  const R = ctx.radius * 1.6;
  const ground = new MeshBuilder();
  ground.flatPolygon([new THREE.Vector2(-R, R), new THREE.Vector2(R, R), new THREE.Vector2(R, -R), new THREE.Vector2(-R, -R)], [], -0.02, "up");

  const green = new MeshBuilder();
  for (const g of ctx.green) addFlatPolygon(green, g, 0.005);
  const woods = new MeshBuilder();
  for (const w of ctx.woods) addFlatPolygon(woods, w, 0.008);
  const water = new MeshBuilder();
  for (const w of ctx.water) addFlatPolygon(water, w, 0.012);

  // Street names only for streets that run through or beside the community.
  const lx = lots.map((l) => l.position[0]);
  const lz = lots.map((l) => l.position[2]);
  const [bx0, bx1, bz0, bz1] = [Math.min(...lx) - 60, Math.max(...lx) + 60, Math.min(...lz) - 60, Math.max(...lz) + 60];
  const nearLots = (x: number, z: number) => x > bx0 && x < bx1 && z > bz0 && z < bz1 && lots.some((l) => Math.abs(l.position[0] - x) < 60 && Math.abs(l.position[2] - z) < 60);

  const roads = new MeshBuilder();
  const paths = new MeshBuilder();
  const labelSeen = new Map<string, { len: number; position: [number, number, number] }>();
  for (const r of ctx.roads) {
    if (r.points.length < 2) continue;
    if (r.kind === "path") addRibbon(paths, r.points, Math.max(1.6, r.width), 0.03);
    else addRibbon(roads, r.points, r.width, r.kind === "major" ? 0.045 : 0.04);
    if (r.name && r.kind !== "path" && r.points.some((q) => nearLots(q[0], -q[1]))) {
      let len = 0;
      for (let i = 0; i < r.points.length - 1; i++) len += Math.hypot(r.points[i + 1][0] - r.points[i][0], r.points[i + 1][1] - r.points[i][1]);
      const mid = r.points[Math.floor(r.points.length / 2)];
      const prev = labelSeen.get(r.name);
      if (!prev || len > prev.len) labelSeen.set(r.name, { len, position: [mid[0], 1.5, -mid[1]] });
    }
  }

  // Lot outlines in plan space for the exclusion test (world z = −north).
  const lotPolys: P2[][] = lots.filter((l) => l.polygon).map((l) => l.polygon!.map(([x, z]) => [x, -z] as P2));
  for (const b of blocks) lotPolys.push(b.points.map(([x, z]) => [x, -z] as P2));
  const buildings = new MeshBuilder();
  const roofs = new MeshBuilder();
  for (const bd of ctx.buildings) {
    const pts = clean(bd.points);
    if (pts.length < 3) continue;
    const [cx, cy] = centroid(pts);
    if (lotPolys.some((poly) => pointInPoly(cx, cy, poly))) continue;
    const ccw = signedArea(pts) > 0 ? pts : pts.slice().reverse();
    for (let i = 0; i < ccw.length; i++) {
      const a = ccw[i];
      const c = ccw[(i + 1) % ccw.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 0.05) continue;
      // Outward normal of a CCW plan edge (x, north) → world (nx, 0, −ny).
      const nx = (c[1] - a[1]) / len;
      const ny = -(c[0] - a[0]) / len;
      buildings.polygon(
        [
          [a[0], 0, -a[1]],
          [c[0], 0, -c[1]],
          [c[0], bd.height, -c[1]],
          [a[0], bd.height, -a[1]],
        ],
        [(c[0] - a[0]) / len, 0, -(c[1] - a[1]) / len],
        [0, 1, 0],
        [nx, 0, -ny],
      );
    }
    addFlatPolygon(roofs, pts, bd.height);
  }

  // Trees through woods (density capped so huge forests stay cheap).
  const trees: ContextGeometry["trees"] = [];
  const rnd = lcg(ctx.woods.length * 7919 + 17);
  const MAX_TREES = 5000;
  const totalArea = ctx.woods.reduce((a, w) => a + Math.abs(signedArea(clean(w))), 0);
  const density = Math.min(1 / 45, MAX_TREES / Math.max(1, totalArea));
  for (const w of ctx.woods) {
    const pts = clean(w);
    if (pts.length < 3) continue;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const n = Math.round(Math.abs(signedArea(pts)) * density);
    let placed = 0;
    for (let tries = 0; placed < n && tries < n * 4; tries++) {
      const x = minX + rnd() * (maxX - minX);
      const y = minY + rnd() * (maxY - minY);
      if (!pointInPoly(x, y, pts)) continue;
      if (lotPolys.some((poly) => pointInPoly(x, y, poly))) continue;
      trees.push({ position: [x, -y], scale: 0.9 + rnd() * 0.9, variant: (rnd() < 0.45 ? 2 : rnd() < 0.5 ? 0 : 1) as 0 | 1 | 2 });
      placed++;
    }
  }

  return {
    ground: ground.toGeometry(),
    green: green.toGeometry(),
    woods: woods.toGeometry(),
    water: water.toGeometry(),
    roads: roads.toGeometry(),
    paths: paths.toGeometry(),
    buildings: buildings.toGeometry(),
    roofs: roofs.toGeometry(),
    trees,
    streetLabels: [...labelSeen.entries()].filter(([, v]) => v.len > 40).map(([name, v]) => ({ name, position: v.position })),
  };
}

// ---------------------------------------------------------------------------
// Homes under construction
// ---------------------------------------------------------------------------

/** Surfaces for homes at different build stages. */
export type BuildSurface = PlaceholderSurface | "dirt" | "pit" | "concrete" | "lumber" | "wrap" | "sheathing";

export interface BuildSiteGeometry {
  /** Keyed by surface + colour, e.g. "body:#d8d2c6". */
  meshes: { key: string; surface: BuildSurface; color?: string; geometry: THREE.BufferGeometry }[];
  /** Lots by build state, for stats/legend. */
  counts: Record<BuildState, number>;
}

/** Scale that fits the generic massing model onto narrow / shallow lots. */
export function placeholderScale(lot: Lot): [number, number, number] {
  const g = placeholderFor(lot);
  const sx = Math.min(1, Math.max(0.3, (lot.width - 1.2) / g.planSize.width));
  const sz = Math.min(1, Math.max(0.4, (lot.depth - lot.frontSetback - 3) / g.planSize.depth));
  return [sx, 1, sz];
}

function lotMatrix(lot: Lot) {
  const g = placeholderFor(lot);
  const [sx, , sz] = placeholderScale(lot);
  const frontLocalZ = lot.depth / 2 - lot.frontSetback;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...lot.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...lot.rotation)), new THREE.Vector3(1, 1, 1));
  const off = new THREE.Matrix4().makeTranslation(-g.planCentre.x * sx, 0, frontLocalZ - g.frontY * sz);
  const scale = new THREE.Matrix4().makeScale(sx, 1, sz);
  return { m: m.multiply(off).multiply(scale), g };
}

/** Wood framing: perimeter studs, plates, floor deck and roof trusses. */
function framingGeometry(width: number, depth: number, storeys: number) {
  const lumber = new MeshBuilder();
  const deck = new MeshBuilder();
  const H = 2.9;
  const base = 0.3;
  addBox(deck, AXIS_FRAME, [-width / 2, 0, 0], [width / 2, base, depth], "metric", { bottom: false });
  for (let lv = 0; lv < storeys; lv++) {
    const y0 = base + lv * H;
    const y1 = y0 + H - 0.1;
    if (lv > 0) addBox(deck, AXIS_FRAME, [-width / 2, y0 - 0.1, 0], [width / 2, y0, depth], "metric");
    const stud = (x: number, z: number) => addBox(lumber, AXIS_FRAME, [x - 0.05, y0, z - 0.05], [x + 0.05, y1, z + 0.05]);
    for (let x = -width / 2; x <= width / 2 + 1e-6; x += 0.8) {
      stud(x, 0.05);
      stud(x, depth - 0.05);
    }
    for (let z = 0.8; z < depth; z += 0.8) {
      stud(-width / 2 + 0.05, z);
      stud(width / 2 - 0.05, z);
    }
    addBox(lumber, AXIS_FRAME, [-width / 2, y1, 0], [width / 2, y1 + 0.1, 0.12]);
    addBox(lumber, AXIS_FRAME, [-width / 2, y1, depth - 0.12], [width / 2, y1 + 0.1, depth]);
    addBox(lumber, AXIS_FRAME, [-width / 2, y1, 0], [-width / 2 + 0.12, y1 + 0.1, depth]);
    addBox(lumber, AXIS_FRAME, [width / 2 - 0.12, y1, 0], [width / 2, y1 + 0.1, depth]);
  }
  // Gable trusses across the depth
  const top = base + storeys * H;
  const rise = depth * 0.25;
  for (let x = -width / 2; x <= width / 2 + 1e-6; x += 1.2) {
    const pts: [number, number, number][] = [
      [x - 0.04, top, 0],
      [x + 0.04, top, 0],
      [x + 0.04, top + rise, depth / 2],
      [x - 0.04, top + rise, depth / 2],
    ];
    lumber.polygon(pts, [0, 0, 1], [0, 1, 0], [1, 0, 0]);
    lumber.polygon(pts.map(([px, py, pz]) => [px, py, depth - pz] as [number, number, number]), [0, 0, 1], [0, 1, 0], [1, 0, 0]);
  }
  return { lumber: lumber.toGeometry(), deck: deck.toGeometry() };
}

/**
 * Merged geometry for every lot except `skipLotId` (the customer's home is
 * drawn separately). Lots without progress follow their sales status: sold
 * lots without data show a finished placeholder, unsold lots stay empty.
 */
export function buildSiteHomes(lots: Lot[], progress: Record<string, LotProgress | undefined>, skipLotId?: string): BuildSiteGeometry {
  const buckets = new Map<string, { surface: BuildSurface; color?: string; parts: THREE.BufferGeometry[] }>();
  const push = (surface: BuildSurface, geo: THREE.BufferGeometry, m: THREE.Matrix4, color?: string) => {
    const key = color ? `${surface}:${color}` : surface;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { surface, color, parts: [] }));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(m);
    b.parts.push(g);
  };
  const counts: Record<BuildState, number> = { none: 0, excavation: 0, foundation: 0, framing: 0, "closed-in": 0, complete: 0 };
  const framingCache = new Map<string, ReturnType<typeof framingGeometry>>();

  for (const lot of lots) {
    if (lot.id === skipLotId) continue;
    const p = progress[lot.id];
    const state: BuildState = p ? buildState(p) : lot.status === "sold" || lot.status === "model-home" ? "complete" : "none";
    counts[state]++;
    if (state === "none") continue;
    const { m, g } = lotMatrix(lot);
    const W = g.planSize.width;
    const D = g.planSize.depth;
    // Footprint box in placeholder plan space (x across, z 0..D toward the street).
    const footprint = (y0: number, y1: number, pad = 0) => {
      const b = new MeshBuilder();
      addBox(b, AXIS_FRAME, [-W / 2 - pad, y0, -pad], [W / 2 + pad, y1, D + pad], "metric", { bottom: false });
      return b.toGeometry();
    };
    if (state === "excavation") {
      push("dirt", footprint(-0.01, 0.02, 2.2), m);
      push("pit", footprint(0.021, 0.025, 0), m);
      const pile = new MeshBuilder();
      addBox(pile, AXIS_FRAME, [-W / 2 - 1, 0, -6], [W / 2 + 1, 1.4, -3.5], "metric", { bottom: false });
      push("dirt", pile.toGeometry(), m);
      continue;
    }
    if (state === "foundation") {
      push("dirt", footprint(-0.01, 0.02, 2.2), m);
      const b = new MeshBuilder();
      const t = 0.25;
      addBox(b, AXIS_FRAME, [-W / 2, 0, 0], [W / 2, 0.45, t], "metric", { bottom: false });
      addBox(b, AXIS_FRAME, [-W / 2, 0, D - t], [W / 2, 0.45, D], "metric", { bottom: false });
      addBox(b, AXIS_FRAME, [-W / 2, 0, 0], [-W / 2 + t, 0.45, D], "metric", { bottom: false });
      addBox(b, AXIS_FRAME, [W / 2 - t, 0, 0], [W / 2, 0.45, D], "metric", { bottom: false });
      push("concrete", b.toGeometry(), m);
      continue;
    }
    if (state === "framing") {
      push("dirt", footprint(-0.01, 0.02, 1.6), m);
      const key = `${lot.placeholder.storeys}`;
      let f = framingCache.get(key);
      if (!f) framingCache.set(key, (f = framingGeometry(W, D, lot.placeholder.storeys)));
      push("lumber", f.lumber, m);
      push("sheathing", f.deck, m);
      continue;
    }
    // Closed in: house wrap and roof, no finishes yet. Complete: full colours.
    for (const part of g.parts) {
      if (state === "closed-in") {
        const surface: BuildSurface = part.surface === "roof" ? "roof" : part.surface === "foundation" ? "concrete" : part.surface === "window" ? "window" : "wrap";
        push(surface, part.geometry, m, surface === "roof" ? "#3b3d41" : undefined);
      } else {
        const color = part.surface === "body" ? lot.placeholder.bodyColor : part.surface === "roof" ? lot.placeholder.roofColor : undefined;
        push(part.surface, part.geometry, m, color);
      }
    }
  }

  const meshes: BuildSiteGeometry["meshes"] = [];
  for (const [key, b] of buckets) {
    const merged = mergeGeometries(b.parts, false);
    b.parts.forEach((p) => p.dispose());
    if (merged) meshes.push({ key, surface: b.surface, color: b.color, geometry: merged });
  }
  for (const f of framingCache.values()) {
    f.lumber.dispose();
    f.deck.dispose();
  }
  return { meshes, counts };
}

/** Flat fills of lot polygons grouped by colour key. */
export function buildLotFills(lots: Lot[], colourOf: (lot: Lot) => string, y = 0.05): { color: string; geometry: THREE.BufferGeometry }[] {
  const byColour = new Map<string, MeshBuilder>();
  for (const lot of lots) {
    if (!lot.polygon) continue;
    const c = colourOf(lot);
    let b = byColour.get(c);
    if (!b) byColour.set(c, (b = new MeshBuilder()));
    addFlatPolygon(b, lot.polygon.map(([x, z]) => [x, -z] as P2), y);
  }
  return [...byColour.entries()].map(([color, b]) => ({ color, geometry: b.toGeometry() }));
}

/** Line segments outlining each lot polygon. */
export function lotOutlineSegments(lots: Lot[], y = 0.07): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (const lot of lots) {
    const poly = lot.polygon;
    if (!poly) continue;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      pts.push([a[0], y, a[1]], [b[0], y, b[1]]);
    }
  }
  return pts;
}
