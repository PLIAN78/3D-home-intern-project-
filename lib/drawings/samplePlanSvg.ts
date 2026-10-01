import type { Floor, HouseModel } from "@/lib/models/house";
import { polygonArea, polygonCentroid, SQ_M_TO_SQ_FT, wallLength } from "@/lib/models/house";
import { openingsForWall } from "@/lib/geometry/generateWalls";

/**
 * Renders a floor of a HouseModel as a conventional architectural floor plan
 * (solid poché walls, window symbols, door swings, labels, dimensions, title
 * block). Used to produce realistic sample drawings for demos and to exercise
 * the drawing interpreters.
 */

const S = 110; // px per metre (≈ 1:100 at screen resolution)
const MARGIN = 2.6; // metres

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function feetInches(m: number) {
  const inches = Math.round(m * 39.3701);
  return `${Math.floor(inches / 12)}'-${inches % 12}"`;
}

export function renderFloorPlanSvg(model: HouseModel, floor: Floor): string {
  const xs = floor.walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = floor.walls.flatMap((w) => [w.start.y, w.end.y]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const W = Math.round((maxX - minX + MARGIN * 2) * S);
  const H = Math.round((maxY - minY + MARGIN * 2 + 1.6) * S);
  const X = (x: number) => +((x - minX + MARGIN) * S).toFixed(1);
  const Y = (y: number) => +((y - minY + MARGIN) * S).toFixed(1);
  const out: string[] = [];

  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  out.push(`<rect x="12" y="12" width="${W - 24}" height="${H - 24}" fill="none" stroke="#222" stroke-width="1"/>`);

  // Room labels (under walls)
  for (const r of floor.rooms) {
    const c = polygonCentroid(r.polygon);
    const sqft = Math.round(polygonArea(r.polygon) * SQ_M_TO_SQ_FT);
    out.push(`<text x="${X(c.x)}" y="${Y(c.y) - 4}" font-family="Arial, Helvetica, sans-serif" font-size="13" text-anchor="middle" fill="#222" letter-spacing="0.5">${esc(r.name.toUpperCase())}</text>`);
    out.push(`<text x="${X(c.x)}" y="${Y(c.y) + 12}" font-family="Arial, Helvetica, sans-serif" font-size="10" text-anchor="middle" fill="#555">${sqft} SF</text>`);
  }

  // Fixtures (thin outlines)
  for (const f of floor.fixtures ?? []) {
    if (f.kind === "porch" || f.kind === "column") continue;
    out.push(`<rect x="${X(f.x)}" y="${Y(f.y)}" width="${(f.width * S).toFixed(1)}" height="${(f.depth * S).toFixed(1)}" fill="none" stroke="#444" stroke-width="1"/>`);
    if (f.kind === "stair") {
      const steps = Math.max(2, Math.round((f.rise ?? f.height) / 0.19));
      for (let i = 1; i < steps; i++) {
        if (f.direction === "+y" || f.direction === "-y" || !f.direction) {
          const y = f.y + (f.depth * i) / steps;
          out.push(`<line x1="${X(f.x)}" y1="${Y(y)}" x2="${X(f.x + f.width)}" y2="${Y(y)}" stroke="#666" stroke-width="0.8"/>`);
        } else {
          const x = f.x + (f.width * i) / steps;
          out.push(`<line x1="${X(x)}" y1="${Y(f.y)}" x2="${X(x)}" y2="${Y(f.y + f.depth)}" stroke="#666" stroke-width="0.8"/>`);
        }
      }
      out.push(`<text x="${X(f.x + f.width / 2)}" y="${Y(f.y + f.depth / 2)}" font-family="Arial" font-size="10" text-anchor="middle" fill="#333">UP</text>`);
    }
  }

  // Walls with openings
  for (const w of floor.walls) {
    const L = wallLength(w);
    if (L < 0.05) continue;
    const ux = (w.end.x - w.start.x) / L;
    const uy = (w.end.y - w.start.y) / L;
    const nx = -uy;
    const ny = ux;
    const t = w.thickness;
    const at = (u: number, v: number) => `${X(w.start.x + ux * u + nx * v)},${Y(w.start.y + uy * u + ny * v)}`;
    const piece = (u0: number, u1: number) => {
      if (u1 - u0 < 0.005) return;
      out.push(`<polygon points="${at(u0, -t / 2)} ${at(u1, -t / 2)} ${at(u1, t / 2)} ${at(u0, t / 2)}" fill="#161616"/>`);
    };
    const spans = openingsForWall(floor, w);
    let cursor = -t / 2;
    for (const s of spans) {
      piece(cursor, s.a);
      cursor = s.b;
      if (s.kind === "window") {
        for (const v of [-t / 2, -t / 6, t / 6, t / 2]) out.push(`<line x1="${X(w.start.x + ux * s.a + nx * v)}" y1="${Y(w.start.y + uy * s.a + ny * v)}" x2="${X(w.start.x + ux * s.b + nx * v)}" y2="${Y(w.start.y + uy * s.b + ny * v)}" stroke="#222" stroke-width="1.5"/>`);
        for (const u of [s.a, s.b]) out.push(`<line x1="${X(w.start.x + ux * u + nx * (-t / 2))}" y1="${Y(w.start.y + uy * u + ny * (-t / 2))}" x2="${X(w.start.x + ux * u + nx * (t / 2))}" y2="${Y(w.start.y + uy * u + ny * (t / 2))}" stroke="#222" stroke-width="1.2"/>`);
      } else if (s.kind === "garage") {
        out.push(`<line x1="${X(w.start.x + ux * s.a)}" y1="${Y(w.start.y + uy * s.a)}" x2="${X(w.start.x + ux * s.b)}" y2="${Y(w.start.y + uy * s.b)}" stroke="#333" stroke-width="1" stroke-dasharray="8 6"/>`);
      } else if (s.kind === "patio") {
        const m = (s.a + s.b) / 2;
        out.push(`<line x1="${X(w.start.x + ux * s.a + nx * (-t / 8))}" y1="${Y(w.start.y + uy * s.a + ny * (-t / 8))}" x2="${X(w.start.x + ux * (m + 0.05) + nx * (-t / 8))}" y2="${Y(w.start.y + uy * (m + 0.05) + ny * (-t / 8))}" stroke="#222" stroke-width="1.5"/>`);
        out.push(`<line x1="${X(w.start.x + ux * (m - 0.05) + nx * (t / 8))}" y1="${Y(w.start.y + uy * (m - 0.05) + ny * (t / 8))}" x2="${X(w.start.x + ux * s.b + nx * (t / 8))}" y2="${Y(w.start.y + uy * s.b + ny * (t / 8))}" stroke="#222" stroke-width="1.5"/>`);
      } else if (s.kind !== "opening") {
        // Swing door: leaf drawn open at 90° from the hinge jamb, plus the swing arc.
        const width = s.b - s.a;
        const side = s.kind === "interior" ? 1 : -1;
        const hx = w.start.x + ux * s.a + nx * (side * t / 2);
        const hy = w.start.y + uy * s.a + ny * (side * t / 2);
        const lx = hx + nx * side * width;
        const ly = hy + ny * side * width;
        const ex = w.start.x + ux * s.b + nx * (side * t / 2);
        const ey = w.start.y + uy * s.b + ny * (side * t / 2);
        out.push(`<line x1="${X(hx)}" y1="${Y(hy)}" x2="${X(lx)}" y2="${Y(ly)}" stroke="#222" stroke-width="1.5"/>`);
        out.push(`<path d="M ${X(lx)} ${Y(ly)} A ${(width * S).toFixed(1)} ${(width * S).toFixed(1)} 0 0 ${side > 0 ? 1 : 0} ${X(ex)} ${Y(ey)}" fill="none" stroke="#555" stroke-width="0.8"/>`);
      }
    }
    piece(cursor, L + t / 2);
  }

  // Overall dimensions
  const dim = (x1: number, y1: number, x2: number, y2: number, label: string, vertical: boolean) => {
    out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333" stroke-width="0.8"/>`);
    for (const [x, y] of [
      [x1, y1],
      [x2, y2],
    ])
      out.push(`<line x1="${x - 6}" y1="${y + 6}" x2="${x + 6}" y2="${y - 6}" stroke="#333" stroke-width="1"/>`);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    out.push(
      vertical
        ? `<text x="${mx - 8}" y="${my}" font-family="Arial" font-size="12" text-anchor="middle" fill="#222" transform="rotate(-90 ${mx - 8} ${my})">${esc(label)}</text>`
        : `<text x="${mx}" y="${my - 8}" font-family="Arial" font-size="12" text-anchor="middle" fill="#222">${esc(label)}</text>`,
    );
  };
  const width = maxX - minX;
  const depth = maxY - minY;
  dim(X(minX), Y(minY) - 1.3 * S, X(maxX), Y(minY) - 1.3 * S, `${feetInches(width)}  (${width.toFixed(2)} m)`, false);
  dim(X(minX) - 1.3 * S, Y(minY), X(minX) - 1.3 * S, Y(maxY), `${feetInches(depth)}  (${depth.toFixed(2)} m)`, true);

  // Title block
  const tbW = 480;
  const tbH = 96;
  const tx = W - tbW - 28;
  const ty = H - tbH - 28;
  out.push(`<rect x="${tx}" y="${ty}" width="${tbW}" height="${tbH}" fill="none" stroke="#222" stroke-width="1"/>`);
  out.push(`<text x="${tx + 14}" y="${ty + 28}" font-family="Arial" font-size="20" font-weight="bold" fill="#111">${esc(model.name.toUpperCase())} — ${esc(floor.name.toUpperCase())}</text>`);
  out.push(`<text x="${tx + 14}" y="${ty + 52}" font-family="Arial" font-size="12" fill="#333">SCALE 1:100 (APPROX.) · ALL DIMENSIONS APPROXIMATE</text>`);
  out.push(`<text x="${tx + 14}" y="${ty + 72}" font-family="Arial" font-size="12" fill="#333">BRADLEY RIDGE · DEMONSTRATION DRAWING — NOT FOR CONSTRUCTION</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join("")}</svg>`;
}
