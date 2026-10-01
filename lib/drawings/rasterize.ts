"use client";

/**
 * Browser-side rasterisation of uploaded drawings to PNG (≤ MAX_DIM px), so
 * the server, interpreters and tracing editor only ever deal with one format.
 */

export const MAX_DIM = 2400;

export interface RasterResult {
  blob: Blob;
  width: number;
  height: number;
  pageCount: number;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode PNG"))), "image/png"));
}

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  if (!lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return lib;
}

export async function pdfPageCount(data: ArrayBuffer): Promise<number> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await task.promise;
  const n = doc.numPages;
  await task.destroy();
  return n;
}

export async function rasterizePdf(data: ArrayBuffer, pageNumber = 1): Promise<RasterResult> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const scale = MAX_DIM / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return { blob: await canvasToPng(canvas), width: canvas.width, height: canvas.height, pageCount: doc.numPages };
  } finally {
    await task.destroy();
  }
}

export async function rasterizeImage(blob: Blob): Promise<RasterResult> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth || 1600;
    const h0 = img.naturalHeight || 1200;
    const scale = Math.min(1, MAX_DIM / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w0 * scale);
    canvas.height = Math.round(h0 * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { blob: await canvasToPng(canvas), width: canvas.width, height: canvas.height, pageCount: 1 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function isPdf(file: { type: string; name: string }) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function rasterizeFile(file: File, page = 1): Promise<RasterResult> {
  return isPdf(file) ? rasterizePdf(await file.arrayBuffer(), page) : rasterizeImage(file);
}
