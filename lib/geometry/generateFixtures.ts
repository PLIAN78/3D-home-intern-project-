import type { Fixture, Floor } from "@/lib/models/house";
import { addBox, AXIS_FRAME, SurfaceBuckets } from "./meshBuilder";
import type { SurfaceKey } from "./surfaces";

const COUNTER_T = 0.04;

function stairs(b: SurfaceBuckets<SurfaceKey>, f: Fixture, baseY: number) {
  const rise = f.rise ?? f.height;
  const steps = Math.max(2, Math.round(rise / 0.19));
  const stepRise = rise / steps;
  const dir = f.direction ?? "+y";
  const along = dir === "+y" || dir === "-y" ? f.depth : f.width;
  const run = along / steps;
  const treads = b.get("flooring");
  const stringer = b.get("interiorTrim");
  for (let i = 0; i < steps; i++) {
    const top = baseY + stepRise * (i + 1);
    // Step i occupies [i*run, (i+1)*run] along the direction of travel.
    let x0 = f.x, x1 = f.x + f.width, y0 = f.y, y1 = f.y + f.depth;
    const s0 = i * run;
    const s1 = (i + 1) * run;
    if (dir === "+y") { y0 = f.y + s0; y1 = f.y + s1; }
    if (dir === "-y") { y0 = f.y + f.depth - s1; y1 = f.y + f.depth - s0; }
    if (dir === "+x") { x0 = f.x + s0; x1 = f.x + s1; }
    if (dir === "-x") { x0 = f.x + f.width - s1; x1 = f.x + f.width - s0; }
    // Riser/body block (trim colour) with a wood tread on top.
    addBox(stringer, AXIS_FRAME, [x0, top - stepRise - (i === 0 ? 0 : 0.18), y0], [x1, top - 0.03, y1], "metric", { bottom: i === 0 });
    addBox(treads, AXIS_FRAME, [x0 - 0.01, top - 0.03, y0 - 0.02], [x1 + 0.01, top, y1 + 0.01]);
  }
}

/** Kitchen cabinetry, stairs, porch slab, columns and appliance placeholders. */
export function generateFixtures(floor: Floor): SurfaceBuckets<SurfaceKey> {
  const b = new SurfaceBuckets<SurfaceKey>();
  for (const f of floor.fixtures ?? []) {
    const y0 = floor.elevation + (f.baseOffset ?? 0);
    const min = (dy = 0): [number, number, number] => [f.x, y0 + dy, f.y];
    switch (f.kind) {
      case "base-cabinets": {
        addBox(b.get("kitchenCabinets"), AXIS_FRAME, [f.x, y0 + 0.1, f.y], [f.x + f.width, y0 + f.height - COUNTER_T, f.y + f.depth - 0.03]);
        addBox(b.get("structure"), AXIS_FRAME, [f.x, y0, f.y], [f.x + f.width, y0 + 0.1, f.y + f.depth - 0.08]);
        addBox(b.get("countertops"), AXIS_FRAME, [f.x - 0.01, y0 + f.height - COUNTER_T, f.y], [f.x + f.width + 0.01, y0 + f.height, f.y + f.depth + 0.02]);
        break;
      }
      case "island": {
        addBox(b.get("kitchenCabinets"), AXIS_FRAME, [f.x + 0.05, y0 + 0.1, f.y + 0.05], [f.x + f.width - 0.05, y0 + f.height - COUNTER_T, f.y + f.depth - 0.3]);
        addBox(b.get("structure"), AXIS_FRAME, [f.x + 0.1, y0, f.y + 0.1], [f.x + f.width - 0.1, y0 + 0.1, f.y + f.depth - 0.35]);
        addBox(b.get("countertops"), AXIS_FRAME, [f.x, y0 + f.height - COUNTER_T, f.y], [f.x + f.width, y0 + f.height, f.y + f.depth]);
        break;
      }
      case "upper-cabinets":
        addBox(b.get("kitchenCabinets"), AXIS_FRAME, min(), [f.x + f.width, y0 + f.height, f.y + f.depth]);
        break;
      case "stair":
        stairs(b, f, y0);
        break;
      case "porch":
        addBox(b.get("concrete"), AXIS_FRAME, min(), [f.x + f.width, y0 + f.height, f.y + f.depth], "metric", { bottom: false });
        break;
      case "column":
        addBox(b.get("trim"), AXIS_FRAME, min(), [f.x + f.width, y0 + f.height, f.y + f.depth]);
        break;
      case "appliance":
      default:
        addBox(b.get("appliance"), AXIS_FRAME, min(), [f.x + f.width, y0 + f.height, f.y + f.depth]);
        break;
    }
  }
  return b;
}
