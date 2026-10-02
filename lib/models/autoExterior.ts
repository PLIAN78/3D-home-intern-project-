import type { ExteriorStyle, Fixture, Floor, Point2D, RoofSection } from "./house";
import { pointInPolygon, wallLength } from "./house";

/**
 * Exterior massing inferred from traced floor outlines, closer to how Caivan
 * homes are actually built than a single box roof:
 *  - the top floor is split into rectangles: a hip over the main body and a
 *    street-facing gable over each bay that projects toward the street;
 *  - every part of a lower floor not covered by the floor above (garage
 *    fronts, bump-outs) gets its own lower roof, sloping off the taller wall;
 *  - a covered porch (slab, columns, roof) fills the recess at the front door.
 * Plan +y runs from the rear of the house toward the street.
 */

export const MAIN_PITCH = 6 / 12;
export const FRONT_GABLE_PITCH = 10 / 12;
export const LOWER_PITCH = 4 / 12;
const CELL = 0.1;
const MIN_PART = 0.6;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Occupancy grid of plan polygons on a shared CELL lattice. */
class Grid {
  readonly cells: Uint8Array;
  constructor(
    readonly ox: number,
    readonly oy: number,
    readonly nx: number,
    readonly ny: number,
  ) {
    this.cells = new Uint8Array(nx * ny);
  }
  static covering(polys: Point2D[][]): Grid {
    const pts = polys.flat();
    const ox = Math.floor(Math.min(...pts.map((p) => p.x)) / CELL) * CELL;
    const oy = Math.floor(Math.min(...pts.map((p) => p.y)) / CELL) * CELL;
    const nx = Math.max(1, Math.ceil((Math.max(...pts.map((p) => p.x)) - ox) / CELL) + 1);
    const ny = Math.max(1, Math.ceil((Math.max(...pts.map((p) => p.y)) - oy) / CELL) + 1);
    return new Grid(ox, oy, nx, ny);
  }
  /** An empty grid on the same lattice. */
  like(): Grid {
    return new Grid(this.ox, this.oy, this.nx, this.ny);
  }
  fill(poly: Point2D[]): this {
    for (let j = 0; j < this.ny; j++)
      for (let i = 0; i < this.nx; i++) if (pointInPolygon({ x: this.ox + (i + 0.5) * CELL, y: this.oy + (j + 0.5) * CELL }, poly)) this.cells[j * this.nx + i] = 1;
    return this;
  }
  get(i: number, j: number) {
    return i >= 0 && j >= 0 && i < this.nx && j < this.ny ? this.cells[j * this.nx + i] : 0;
  }
  minus(other: Grid): Grid {
    const g = this.like();
    for (let k = 0; k < g.cells.length; k++) g.cells[k] = this.cells[k] && !other.cells[k] ? 1 : 0;
    return g;
  }
  count() {
    return this.cells.reduce((s, v) => s + v, 0);
  }
  toPlan(r: { i0: number; j0: number; i1: number; j1: number }): Rect {
    return { x0: this.ox + r.i0 * CELL, y0: this.oy + r.j0 * CELL, x1: this.ox + r.i1 * CELL, y1: this.oy + r.j1 * CELL };
  }
}

/** Largest all-filled rectangle (histogram method). */
function largestRect(g: Grid): { i0: number; j0: number; i1: number; j1: number; area: number } | null {
  const h = new Int32Array(g.nx);
  let best: { i0: number; j0: number; i1: number; j1: number; area: number } | null = null;
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) h[i] = g.get(i, j) ? h[i] + 1 : 0;
    const stack: number[] = [];
    for (let i = 0; i <= g.nx; i++) {
      const cur = i < g.nx ? h[i] : 0;
      while (stack.length && h[stack[stack.length - 1]] >= cur) {
        const top = stack.pop()!;
        const height = h[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const area = height * (i - left);
        if (height > 0 && (!best || area > best.area)) best = { i0: left, j0: j - height + 1, i1: i, j1: j + 1, area };
      }
      stack.push(i);
    }
  }
  return best;
}

/** Cover a grid with rectangles, largest first, ignoring slivers. */
export function decompose(g: Grid): Rect[] {
  const work = g.like();
  work.cells.set(g.cells);
  const total = g.count();
  const out: Rect[] = [];
  for (let n = 0; n < 12; n++) {
    const r = largestRect(work);
    if (!r || r.area < total * 0.03) break;
    const rect = work.toPlan(r);
    for (let j = r.j0; j < r.j1; j++) for (let i = r.i0; i < r.i1; i++) work.cells[j * work.nx + i] = 0;
    if (rect.x1 - rect.x0 >= MIN_PART && rect.y1 - rect.y0 >= MIN_PART) out.push(rect);
  }
  return out;
}

const W = (r: Rect) => r.x1 - r.x0;
const D = (r: Rect) => r.y1 - r.y0;
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

function section(id: string, name: string, type: RoofSection["type"], floor: Floor, r: Rect, pitch: number, extra: Partial<RoofSection> = {}): RoofSection {
  return { id, name, type, baseFloorId: floor.id, x: r.x0, y: r.y0, width: W(r), depth: D(r), pitch, overhang: type === "shed" ? 0.3 : 0.4, ...extra };
}

/** Roofs over the top floor: hip over the main body, gables over front bays. */
interface Pitches {
  main: number;
  gable: number;
  lower: number;
}

function pitchesFor(style: ExteriorStyle | undefined): Pitches {
  const main = style?.mainPitch ?? MAIN_PITCH;
  return { main, gable: style?.gablePitch ?? (style?.mainPitch ? main : FRONT_GABLE_PITCH), lower: style?.lowerPitch ?? LOWER_PITCH };
}

function topRoofs(floor: Floor, grid: Grid, pitch: Pitches): RoofSection[] {
  const parts = decompose(grid);
  if (!parts.length) return [];
  const [main, ...bays] = parts;
  const roofs = [section(`auto-${floor.id}-hip`, `${floor.name} Roof`, "hip", floor, main, pitch.main)];
  bays.forEach((b, k) => {
    // Which side of the main body the bay sticks out from.
    const front = Math.abs(b.y0 - main.y1) < CELL * 1.5 && overlap(b.x0, b.x1, main.x0, main.x1) > MIN_PART;
    const rear = Math.abs(b.y1 - main.y0) < CELL * 1.5 && overlap(b.x0, b.x1, main.x0, main.x1) > MIN_PART;
    const side = !front && !rear && overlap(b.y0, b.y1, main.y0, main.y1) > MIN_PART && (Math.abs(b.x0 - main.x1) < CELL * 1.5 || Math.abs(b.x1 - main.x0) < CELL * 1.5);
    if (front || rear) {
      // Gable end facing out; carry the ridge back into the main roof so it dies into the slope.
      const p = front ? pitch.gable : pitch.main;
      const carry = Math.min(D(main) / 2, ((p / pitch.main) * W(b)) / 2 + 0.3);
      const r = front ? { ...b, y0: b.y0 - carry } : { ...b, y1: b.y1 + carry };
      roofs.push(section(`auto-${floor.id}-gable-${k}`, `${floor.name} ${front ? "Front" : "Rear"} Gable`, "gable", floor, r, p, { ridgeAxis: "y" }));
    } else if (side) {
      const carry = Math.min(W(main) / 2, W(b) / 2 + 0.3);
      const r = b.x0 >= main.x1 - CELL * 2 ? { ...b, x0: b.x0 - carry } : { ...b, x1: b.x1 + carry };
      roofs.push(section(`auto-${floor.id}-bay-${k}`, `${floor.name} Side Roof`, "hip", floor, r, pitch.main, { ridgeAxis: "x" }));
    } else {
      // Detached part (e.g. across a court): its own hip.
      roofs.push(section(`auto-${floor.id}-hip-${k}`, `${floor.name} Roof`, "hip", floor, b, pitch.main));
    }
  });
  return roofs;
}

/** Lower roofs over the parts of a floor that the floor above doesn't cover. */
function lowerRoofs(floor: Floor, own: Grid, upper: Grid, lower: number): RoofSection[] {
  const exposed = own.minus(upper);
  if (exposed.count() < (MIN_PART * MIN_PART) / (CELL * CELL)) return [];
  return decompose(exposed).map((r, k) => {
    // Slope away from the taller wall the strip leans against.
    const touch = (dx: number, dy: number) => {
      let n = 0;
      const i0 = Math.round((r.x0 - own.ox) / CELL);
      const j0 = Math.round((r.y0 - own.oy) / CELL);
      const i1 = Math.round((r.x1 - own.ox) / CELL);
      const j1 = Math.round((r.y1 - own.oy) / CELL);
      if (dy) for (let i = i0; i < i1; i++) n += upper.get(i, dy < 0 ? j0 - 1 : j1);
      else for (let j = j0; j < j1; j++) n += upper.get(dx < 0 ? i0 - 1 : i1, j);
      return n * CELL;
    };
    const sides = [
      { side: "-y" as const, len: touch(0, -1) },
      { side: "+y" as const, len: touch(0, 1) },
      { side: "-x" as const, len: touch(-1, 0) },
      { side: "+x" as const, len: touch(1, 0) },
    ].sort((a, b) => b.len - a.len);
    if (sides[0].len < MIN_PART) return section(`auto-${floor.id}-lower-${k}`, `${floor.name} Lower Roof`, "hip", floor, r, lower);
    return section(`auto-${floor.id}-lower-${k}`, `${floor.name} Lower Roof`, "shed", floor, r, lower, { highSide: sides[0].side });
  });
}

export function generateAutoRoofs(floors: Floor[], style?: ExteriorStyle): RoofSection[] {
  const pitch = pitchesFor(style);
  const above = floors.filter((f) => !f.belowGrade && (f.footprint?.length ?? 0) >= 3);
  if (!above.length) return [];
  const base = Grid.covering(above.map((f) => f.footprint!));
  const grids = above.map((f) => base.like().fill(f.footprint!));
  const roofs: RoofSection[] = [];
  above.forEach((floor, i) => {
    if (i === above.length - 1) roofs.push(...topRoofs(floor, grids[i], pitch));
    else roofs.push(...lowerRoofs(floor, grids[i], grids[i + 1], pitch.lower));
  });
  return roofs;
}

// ---------------------------------------------------------------------------
// Covered front porch
// ---------------------------------------------------------------------------

export interface AutoPorch {
  rect: Rect;
  /** True when the floor above already shelters it. */
  covered: boolean;
}

/**
 * The porch in front of the front door: the recess between the door wall and
 * the front of the house (bounded by the walls either side), or a standard
 * 1.8 m × 1.5 m stoop when the door is on the front line.
 */
export function findPorch(ground: Floor, upper: Floor | undefined): AutoPorch | null {
  const door = ground.doors.find((d) => d.kind === "front");
  const wall = door && ground.walls.find((w) => w.id === door.wallId);
  const fp = ground.footprint;
  if (!door || !wall || !fp || fp.length < 3) return null;
  if (Math.abs(wall.start.y - wall.end.y) > 0.05) return null; // front doors face the street (±y)
  const L = wallLength(wall) || 1;
  const p = { x: wall.start.x + ((wall.end.x - wall.start.x) * door.position) / L, y: wall.start.y };
  const frontY = Math.max(...fp.map((q) => q.y), ...ground.walls.flatMap((w) => [w.start.y, w.end.y]));
  // Walls decide what is in front of the door (the outline bridges narrow recesses).
  const blocked = (x: number, y0: number, y1: number) =>
    ground.walls.some((w) => {
      if (w.id === wall.id) return false;
      const horizontal = Math.abs(w.start.y - w.end.y) < 0.05;
      const t = w.thickness / 2;
      if (horizontal) return w.start.y > y0 && w.start.y < y1 && x >= Math.min(w.start.x, w.end.x) - t && x <= Math.max(w.start.x, w.end.x) + t;
      return Math.abs(w.start.x - x) <= t + 0.02 && Math.max(w.start.y, w.end.y) > y0 && Math.min(w.start.y, w.end.y) < y1;
    });
  // The door must open onto the outside, not into another room.
  if (blocked(p.x, p.y + 0.05, frontY + 0.05) && frontY - p.y > MIN_PART) return null;
  let rect: Rect;
  if (frontY - p.y > MIN_PART) {
    // Recessed: widen from the door while nothing stands between the door wall and the front.
    const clear = (x: number) => !blocked(x, p.y + 0.15, frontY - 0.05);
    let x0 = p.x;
    let x1 = p.x;
    const lo = Math.min(...fp.map((q) => q.x));
    const hi = Math.max(...fp.map((q) => q.x));
    while (x0 - CELL > lo && clear(x0 - CELL)) x0 -= CELL;
    while (x1 + CELL < hi && clear(x1 + CELL)) x1 += CELL;
    if (x1 - x0 < door.width) return null;
    rect = { x0, y0: p.y + 0.1, x1, y1: frontY + 0.15 };
  } else {
    rect = { x0: p.x - 0.9, y0: p.y + 0.1, x1: p.x + 0.9, y1: p.y + 1.6 };
  }
  let covered = false;
  if (upper?.footprint?.length) {
    const c = { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2 };
    covered = pointInPolygon(c, upper.footprint);
  }
  return { rect, covered };
}

/** Porch slab and corner columns as fixtures on the ground floor. */
export function porchFixtures(ground: Floor, porch: AutoPorch): Fixture[] {
  const { rect } = porch;
  const col = 0.2;
  const fixtures: Fixture[] = [{ id: "auto-porch", kind: "porch", x: rect.x0, y: rect.y0, width: W(rect), depth: D(rect), height: ground.elevation, baseOffset: -ground.elevation }];
  {
    // Columns at the open front corners carry the porch roof (or the floor above).
    const h = ground.ceilingHeight + 0.25;
    fixtures.push(
      { id: "auto-porch-col-l", kind: "column", x: rect.x0 + 0.05, y: rect.y1 - col - 0.05, width: col, depth: col, height: h },
      { id: "auto-porch-col-r", kind: "column", x: rect.x1 - col - 0.05, y: rect.y1 - col - 0.05, width: col, depth: col, height: h },
    );
  }
  return fixtures;
}
