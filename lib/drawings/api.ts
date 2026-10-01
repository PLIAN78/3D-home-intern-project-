"use client";

import type { Drawing, DrawingCalibration, DrawingCategory } from "@/lib/models/drawing";
import type { HouseModel } from "@/lib/models/house";

/** Thin client for the drawing / model route handlers. */

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; problems?: string[] };
    throw new Error([body.error ?? `Request failed (${res.status})`, ...(body.problems ?? [])].join(" · "));
  }
  return res.json() as Promise<T>;
}

export interface UploadInput {
  projectId: string;
  file: File;
  raster: { blob: Blob; width: number; height: number; pageCount: number } | null;
  category: DrawingCategory;
  floorId?: string;
}

/** Upload with progress (fetch has no upload progress, so this uses XHR). */
export function uploadDrawing(input: UploadInput, onProgress: (fraction: number) => void): Promise<Drawing> {
  const form = new FormData();
  form.append("file", input.file);
  if (input.raster) {
    form.append("raster", input.raster.blob, "raster.png");
    form.append("rasterWidth", String(input.raster.width));
    form.append("rasterHeight", String(input.raster.height));
    form.append("pageCount", String(input.raster.pageCount));
  }
  form.append("category", input.category);
  if (input.floorId) form.append("floorId", input.floorId);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/projects/${input.projectId}/drawings`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as Drawing);
        else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}

export async function patchDrawing(id: string, patch: { category?: DrawingCategory; floorId?: string | null; calibration?: DrawingCalibration }) {
  return json<Drawing>(await fetch(`/api/drawings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }));
}

export async function removeDrawing(id: string) {
  const res = await fetch(`/api/drawings/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed (${res.status})`);
}

export async function interpretDrawing(id: string, interpreter: string) {
  return json<Drawing>(await fetch(`/api/drawings/${id}/interpret`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interpreter }) }));
}

export async function replaceRaster(id: string, page: number, raster: { blob: Blob; width: number; height: number }) {
  const form = new FormData();
  form.append("raster", raster.blob, "raster.png");
  form.append("page", String(page));
  form.append("rasterWidth", String(raster.width));
  form.append("rasterHeight", String(raster.height));
  return json<Drawing>(await fetch(`/api/drawings/${id}/raster`, { method: "POST", body: form }));
}

export async function saveHouseModelRequest(projectId: string, model: HouseModel, reviewedDrawingId?: string) {
  return json<{ ok: true }>(await fetch(`/api/projects/${projectId}/house-model`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, reviewedDrawingId }) }));
}
