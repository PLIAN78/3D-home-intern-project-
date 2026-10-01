import type { HouseModel } from "./house";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const point = (p: unknown) => !!p && finite((p as { x: unknown }).x) && finite((p as { y: unknown }).y);

/** Structural sanity checks before a model is persisted. Returns human-readable problems. */
export function validateHouseModel(model: unknown): string[] {
  const problems: string[] = [];
  const m = model as HouseModel;
  if (!m || typeof m !== "object") return ["Model is missing"];
  if (!Array.isArray(m.floors) || m.floors.length === 0) problems.push("Model has no floors");
  if (!m.exterior || !Array.isArray(m.exterior.roofs)) problems.push("Exterior config is missing");
  for (const f of m.floors ?? []) {
    const label = f?.name ?? f?.id ?? "floor";
    if (!f?.id || !finite(f.elevation) || !finite(f.ceilingHeight) || f.ceilingHeight <= 0) {
      problems.push(`${label}: invalid elevation or ceiling height`);
      continue;
    }
    const wallIds = new Set<string>();
    for (const w of f.walls ?? []) {
      if (!w?.id || !point(w.start) || !point(w.end) || !finite(w.thickness) || w.thickness <= 0 || !finite(w.height) || w.height <= 0) {
        problems.push(`${label}: invalid wall ${w?.id ?? ""}`);
      } else wallIds.add(w.id);
    }
    for (const o of [...(f.doors ?? []), ...(f.windows ?? [])]) {
      if (!o?.id || !wallIds.has(o.wallId) || !finite(o.position) || !finite(o.width) || o.width <= 0 || !finite(o.height) || o.height <= 0) {
        problems.push(`${label}: invalid opening ${o?.id ?? ""}`);
      }
    }
    for (const r of f.rooms ?? []) {
      if (!r?.id || !Array.isArray(r.polygon) || r.polygon.length < 3 || !r.polygon.every(point)) problems.push(`${label}: invalid room ${r?.name ?? ""}`);
    }
  }
  return problems.slice(0, 20);
}
