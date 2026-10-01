import type { GreyImage } from "../interpreters/lineDetection";
import type { PageText } from "./classify";

/**
 * Server-side PDF access for drawing-set analysis: page text with positions
 * (in raster pixels) and page rasters. Uses pdf.js (legacy Node build) and
 * @napi-rs/canvas, loaded lazily so they never end up in client bundles.
 */

export const ANALYSIS_MAX_DIM = 2800;

export interface RenderedPage {
  text: PageText;
  grey: GreyImage;
  png: Buffer;
  width: number;
  height: number;
}

async function libs() {
  const [pdfjs, canvas] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("@napi-rs/canvas")]);
  return { pdfjs, canvas };
}

export async function openPdf(data: Buffer) {
  const { pdfjs, canvas } = await libs();
  const task = pdfjs.getDocument({ data: new Uint8Array(data), verbosity: 0 });
  const doc = await task.promise;

  async function pageText(n: number, maxDim = ANALYSIS_MAX_DIM): Promise<PageText> {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: maxDim / Math.max(base.width, base.height) });
    const content = await page.getTextContent();
    const items: PageText["items"] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      const [x, y] = vp.convertToViewportPoint(raw.transform[4], raw.transform[5]);
      items.push({ str: raw.str, x, y, w: raw.width * vp.scale, h: Math.hypot(raw.transform[2], raw.transform[3]) * vp.scale });
    }
    return { items, width: vp.width, height: vp.height };
  }

  async function render(n: number, maxDim = ANALYSIS_MAX_DIM): Promise<RenderedPage> {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: maxDim / Math.max(base.width, base.height) });
    const c = canvas.createCanvas(Math.round(vp.width), Math.round(vp.height));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    // pdf.js accepts any canvas-like 2D context; @napi-rs/canvas is the officially supported Node one.
    await page.render({ canvas: c as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp }).promise;
    const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
    const lum = new Uint8Array(c.width * c.height);
    for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
    page.cleanup();
    return { text: await pageText(n, maxDim), grey: { width: c.width, height: c.height, lum }, png: await c.encode("png"), width: c.width, height: c.height };
  }

  return {
    numPages: doc.numPages,
    pageText,
    render,
    close: () => task.destroy(),
  };
}
