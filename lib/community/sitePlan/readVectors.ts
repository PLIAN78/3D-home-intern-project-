/**
 * Read the vector content of a site-plan PDF page: every filled shape (one
 * polygon per subpath, with its fill colour) and every text item (with
 * position, rotation and size). Coordinates are page points, y down.
 */

export interface PlanPolygon {
  fill: string;
  points: [number, number][];
  area: number;
  cx: number;
  cy: number;
}

export interface PlanText {
  str: string;
  x: number;
  y: number;
  /** Baseline direction in radians, page space (y down). */
  angle: number;
  size: number;
  width: number;
}

export interface SitePlanVectors {
  page: number;
  width: number;
  height: number;
  polygons: PlanPolygon[];
  texts: PlanText[];
}

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function polygonArea(pts: [number, number][]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

function centroid(pts: [number, number][]) {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

/** Split pdf.js flat path data (0 moveTo, 1 lineTo, 2 curveTo, 3 quadratic, 4 close) into subpaths. */
function subpaths(data: ArrayLike<number>): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (let i = 0; i < data.length; ) {
    const op = data[i];
    if (op === 0) {
      if (cur.length > 2) out.push(cur);
      cur = [[data[i + 1], data[i + 2]]];
      i += 3;
    } else if (op === 1) {
      cur.push([data[i + 1], data[i + 2]]);
      i += 3;
    } else if (op === 2) {
      // Sample the curve so small circles (status dots) keep their shape.
      const [x0, y0] = cur[cur.length - 1] ?? [data[i + 5], data[i + 6]];
      const [c1x, c1y, c2x, c2y, x, y] = [data[i + 1], data[i + 2], data[i + 3], data[i + 4], data[i + 5], data[i + 6]];
      for (const t of [0.5, 1]) {
        const u = 1 - t;
        cur.push([u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y]);
      }
      i += 7;
    } else if (op === 3) {
      cur.push([data[i + 3], data[i + 4]]);
      i += 5;
    } else if (op === 4) {
      if (cur.length > 2) out.push(cur);
      cur = [];
      i += 1;
    } else {
      i += 1;
    }
  }
  if (cur.length > 2) out.push(cur);
  return out;
}

export async function readSitePlanVectors(pdf: Buffer, pageNumber = 1): Promise<SitePlanVectors> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
    const vp = page.getViewport({ scale: 1 });
    const viewport = vp.transform as M;
    const O = pdfjs.OPS;
    const FILLS = new Set<number>([O.fill, O.eoFill, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke]);
    const ops = await page.getOperatorList();
    let ctm: M = [1, 0, 0, 1, 0, 0];
    let fill = "#000000";
    const stack: { ctm: M; fill: string }[] = [];
    const polygons: PlanPolygon[] = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const a = ops.argsArray[i] as unknown[];
      if (fn === O.save) stack.push({ ctm, fill });
      else if (fn === O.restore) ({ ctm, fill } = stack.pop() ?? { ctm, fill });
      else if (fn === O.transform) ctm = mul(ctm, a as M);
      else if (fn === O.paintFormXObjectBegin) {
        stack.push({ ctm, fill });
        if (Array.isArray(a[0]) || (a[0] && typeof a[0] === "object")) ctm = mul(ctm, Object.values(a[0] as Record<string, number>) as M);
      } else if (fn === O.paintFormXObjectEnd) ({ ctm, fill } = stack.pop() ?? { ctm, fill });
      else if (fn === O.setFillRGBColor) fill = String(a[0]).toLowerCase();
      else if (fn === O.constructPath && FILLS.has(a[0] as number)) {
        const raw = (a[1] as ArrayLike<number>[])[0];
        if (!raw) continue;
        const full = mul(viewport, ctm);
        for (const sp of subpaths(raw)) {
          const pts = sp.map(([x, y]) => apply(full, x, y));
          const area = polygonArea(pts);
          if (area < 0.5) continue;
          const [cx, cy] = centroid(pts);
          polygons.push({ fill, points: pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]), area, cx, cy });
        }
      }
    }
    const content = await page.getTextContent();
    const texts: PlanText[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const t = item.transform as M;
      const [x, y] = vp.convertToViewportPoint(t[4], t[5]) as [number, number];
      texts.push({ str: item.str.trim(), x, y, angle: -Math.atan2(t[1], t[0]), size: Math.hypot(t[2], t[3]), width: item.width });
    }
    return { page: pageNumber, width: vp.width, height: vp.height, polygons, texts };
  } finally {
    await task.destroy();
  }
}
