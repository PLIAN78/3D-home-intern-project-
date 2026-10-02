import type { Door, Floor, Wall, Window } from "@/lib/models/house";
import { wallLength } from "@/lib/models/house";
import type { FloorVariant, PlanElevation, PlanSet } from "@/lib/models/planSet";
import { newId } from "@/lib/editor/editorOps";
import { LEVEL_ORDER } from "./classify";
import { registerFloor, translateFloor } from "./align";
import { normalizeExteriorOpenings } from "./extractFloor";

/**
 * One home from two drawing sets of the same model:
 *  - the redline (architectural working drawings) gives the geometry: walls
 *    read from the PDF's vectors, scale from dimensions, and per elevation the
 *    heights, roof pitches and cladding stated on its front elevation;
 *  - the décor set gives the layout options (one per sheet) and the windows
 *    and doors, which it marks more reliably; both are aligned onto the
 *    redline plans.
 * Elevations only one set draws are kept from that set.
 */

/** "A/A2/B1" → ["A", "A2", "B1"]. */
export function elevationTokens(id: string): string[] {
  return id
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/** Point on a wall at a distance along it. */
function along(w: Wall, d: number) {
  const L = wallLength(w) || 1;
  return { x: w.start.x + ((w.end.x - w.start.x) * d) / L, y: w.start.y + ((w.end.y - w.start.y) * d) / L };
}

/** Distance along `w` of point p's projection, and how far p is from the wall line. */
function project(w: Wall, p: { x: number; y: number }) {
  const L = wallLength(w) || 1;
  const ux = (w.end.x - w.start.x) / L;
  const uy = (w.end.y - w.start.y) / L;
  const dx = p.x - w.start.x;
  const dy = p.y - w.start.y;
  return { t: dx * ux + dy * uy, off: Math.abs(-dx * uy + dy * ux), L };
}

/**
 * Move the décor floor's windows and doors onto the redline floor's walls
 * (the décor floor already aligned to it). An opening lands on the nearest
 * parallel wall within 0.4 m whose span holds it, unless that spot already has
 * one. Where the redline has no wall at an exterior opening (pieces drawn only
 * as outlines, which the vector reader can't see), the décor wall is copied in,
 * clipped to the stretch the redline doesn't cover. Décor "windows" on interior
 * walls are detection noise and are skipped.
 */
export function transferOpenings(target: Floor, source: Floor): { floor: Floor; added: number; walls: number } {
  const byId = new Map(source.walls.map((w) => [w.id, w]));
  const walls: Wall[] = [...target.walls];
  const doors: Door[] = [...target.doors];
  const windows: Window[] = [...target.windows];
  let added = 0;
  let addedWalls = 0;
  const horizontal = (w: Wall) => Math.abs(w.end.x - w.start.x) >= Math.abs(w.end.y - w.start.y);
  const occupied = (wallId: string, t: number, width: number) => [...doors, ...windows].some((o) => o.wallId === wallId && Math.abs(o.position - t) < (o.width + width) / 2 + 0.1);

  /** The part of source wall `sw` around distance `t` that no parallel target wall covers. */
  const uncovered = (sw: Wall, t: number): [number, number] | null => {
    const L = wallLength(sw);
    const covered: [number, number][] = [];
    for (const w of walls) {
      if (horizontal(w) !== horizontal(sw)) continue;
      const a = project(sw, w.start);
      const b = project(sw, w.end);
      if (Math.max(a.off, b.off) > 0.4) continue;
      covered.push([Math.min(a.t, b.t), Math.max(a.t, b.t)]);
    }
    let lo = 0;
    let hi = L;
    for (const [c0, c1] of covered) {
      if (t > c0 && t < c1) return null;
      if (c1 <= t) lo = Math.max(lo, c1);
      if (c0 >= t) hi = Math.min(hi, c0);
    }
    return hi - lo > 0.3 ? [lo, hi] : null;
  };

  const place = (o: Door | Window, list: (Door | Window)[], prefix: string) => {
    const sw = byId.get(o.wallId);
    if (!sw) return;
    if (prefix === "win" && !sw.exterior) return;
    const p = along(sw, o.position);
    let best: { wall: Wall; t: number; off: number } | null = null;
    for (const w of walls) {
      if (horizontal(w) !== horizontal(sw) || !!w.exterior !== !!sw.exterior) continue;
      const { t, off, L } = project(w, p);
      if (off > 0.4 || t - o.width / 2 < -0.05 || t + o.width / 2 > L + 0.05) continue;
      if (!best || off < best.off) best = { wall: w, t, off };
    }
    if (!best && sw.exterior) {
      // No redline wall here: bring in the décor wall piece that carries the opening.
      const span = uncovered(sw, o.position);
      if (!span || o.position - o.width / 2 < span[0] - 0.05 || o.position + o.width / 2 > span[1] + 0.05) return;
      const piece: Wall = { ...sw, id: newId("w"), start: along(sw, span[0]), end: along(sw, span[1]), unverified: true };
      walls.push(piece);
      addedWalls++;
      best = { wall: piece, t: o.position - span[0], off: 0 };
    }
    if (!best || occupied(best.wall.id, best.t, o.width)) return;
    list.push({ ...o, id: newId(prefix), wallId: best.wall.id, position: Math.round(best.t * 100) / 100, unverified: true });
    added++;
  };
  for (const w of source.windows) place(w, windows, "win");
  for (const d of source.doors) place(d, doors, "d");
  return { floor: normalizeExteriorOpenings({ ...target, walls, doors: doors as Door[], windows: windows as Window[] }), added, walls: addedWalls };
}

export function combinePlanSets(redline: PlanSet, decor: PlanSet, ids: { projectId: string; redlineDrawingId: string; decorDrawingId: string }): PlanSet {
  const variants: FloorVariant[] = [];
  const elevations: PlanElevation[] = [];
  const tag = (v: FloorVariant, source: "redline" | "decor", elevationId: string, floor = v.floor): FloorVariant => ({
    ...v,
    id: `${source === "redline" ? "r" : "d"}${v.page}-${elevationId}-${v.levelId}${v.optionId ? `-${v.optionId}` : ""}`,
    elevationId,
    source,
    floor,
  });
  const redIds = new Set(redline.elevations.map((e) => e.id));
  const decorFor = (redId: string) => decor.elevations.find((e) => elevationTokens(e.id).includes(redId));

  // Elevations the redline draws: its geometry, décor openings and options aligned onto it.
  for (const e of redline.elevations) {
    elevations.push({ id: e.id, label: e.label });
    const d = decorFor(e.id);
    const own = redline.variants.filter((v) => v.elevationId === e.id && !v.optionId);
    const ground = own.find((v) => v.levelId === "ground") ?? own[0];
    for (const level of LEVEL_ORDER) {
      const r = own.find((v) => v.levelId === level);
      const dStd = d && decor.variants.find((v) => v.elevationId === d.id && v.levelId === level && !v.optionId);
      if (r) {
        let floor = r.floor;
        const warnings = [...r.warnings];
        if (dStd) {
          const { dx, dy, score } = registerFloor(r.floor, dStd.floor);
          const { floor: merged, added, walls: filled } = transferOpenings(r.floor, translateFloor(dStd.floor, dx, dy));
          floor = merged;
          if (filled) warnings.push(`${filled} wall piece(s) the redline only outlined were taken from the décor plan.`);
          // Décor sheets label rooms more fully; use them when they found more.
          if (dStd.floor.rooms.length > floor.rooms.length) floor = { ...floor, rooms: translateFloor(dStd.floor, dx, dy).rooms };
          if (added) warnings.push(`${added} window(s)/door(s) taken from the décor plan.`);
          if (score < 0.5) warnings.push("The décor plan didn't line up well with the redline plan — check openings.");
        }
        variants.push({ ...tag(r, "redline", e.id, floor), warnings, confidence: Math.min(0.85, r.confidence + (dStd ? 0.08 : 0)) });
      } else if (dStd && ground) {
        // A level only the décor set draws: align it to the redline main floor.
        const { dx, dy } = registerFloor(ground.floor, dStd.floor);
        variants.push(tag(dStd, "decor", e.id, translateFloor(dStd.floor, dx, dy)));
      }
      // Layout options from the décor set, aligned to this level's plan.
      const ref = variants.find((v) => v.elevationId === e.id && v.levelId === level && !v.optionId);
      if (!d || !ref) continue;
      for (const o of decor.variants.filter((v) => v.elevationId === d.id && v.levelId === level && v.optionId)) {
        const { dx, dy, score } = registerFloor(ref.floor, o.floor);
        const v = tag(o, "decor", e.id, translateFloor(o.floor, dx, dy));
        if (score < 0.5) v.warnings = [...v.warnings, "This option didn't line up well with the redline plan — check its position."];
        variants.push(v);
      }
    }
  }

  // Elevations only the décor set draws (e.g. "B", "F", or the "A" of "A/A2/B1").
  for (const e of decor.elevations) {
    const rest = elevationTokens(e.id).filter((t) => !redIds.has(t));
    if (!rest.length) continue;
    const id = rest.join("/");
    if (elevations.some((x) => x.id === id)) continue;
    elevations.push({ id, label: `Elevation ${rest.join(" / ")}` });
    for (const v of decor.variants.filter((x) => x.elevationId === e.id)) variants.push(tag(v, "decor", id));
  }

  const usedOptions = new Set(variants.map((v) => v.optionId).filter(Boolean));
  return {
    id: `ps-${ids.redlineDrawingId.slice(0, 8)}-${Date.now().toString(36)}`,
    projectId: ids.projectId,
    sourceDrawingId: ids.redlineDrawingId,
    modelCode: decor.modelCode ?? redline.modelCode,
    createdAt: new Date().toISOString(),
    scale: redline.scale,
    levels: LEVEL_ORDER.filter((l) => variants.some((v) => v.levelId === l)),
    elevations,
    options: decor.options.filter((o) => usedOptions.has(o.id)),
    variants,
    unmodeled: [
      ...redline.unmodeled.map((u) => ({ ...u, title: `Redline: ${u.title}` })),
      ...decor.unmodeled.map((u) => ({ ...u, page: u.page, title: `Décor: ${u.title}` })),
    ],
    defaultElevationId: redline.defaultElevationId,
    pageCount: redline.pageCount + decor.pageCount,
    format: "working",
    sources: { redlineDrawingId: ids.redlineDrawingId, decorDrawingId: ids.decorDrawingId },
    exterior: redline.exterior,
  };
}

