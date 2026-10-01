import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createDrawing, getProjectById } from "@/lib/data/repository";
import { DRAWING_CATEGORIES, type Drawing, type DrawingCategory } from "@/lib/models/drawing";
import { getStorage } from "@/lib/storage/objectStorage";

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg"];
const MAX_BYTES = 60 * 1024 * 1024;

/**
 * Upload a drawing: the original file plus a browser-rendered PNG raster.
 * multipart fields: file, raster, category, floorId?, pageCount?, rasterWidth, rasterHeight
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/drawings">) {
  const { projectId } = await ctx.params;
  const project = await getProjectById(projectId);
  if (!project) return Response.json({ error: "Unknown project" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const raster = form.get("raster");
  if (!(file instanceof File)) return Response.json({ error: "Missing file" }, { status: 400 });
  const contentType = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  if (!ACCEPTED.includes(contentType)) return Response.json({ error: "Only PDF, PNG and JPG drawings are supported" }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: "File is larger than 60 MB" }, { status: 413 });

  const categoryRaw = String(form.get("category") ?? "other");
  const category: DrawingCategory = DRAWING_CATEGORIES.some((c) => c.id === categoryRaw) ? (categoryRaw as DrawingCategory) : "other";
  const id = crypto.randomUUID();
  const ext = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg";
  const storage = getStorage();
  const storageKey = `projects/${projectId}/drawings/${id}/original.${ext}`;
  await storage.put(storageKey, Buffer.from(await file.arrayBuffer()), contentType);

  let rasterKey: string | undefined;
  if (raster instanceof File && raster.size > 0) {
    rasterKey = `projects/${projectId}/drawings/${id}/raster-1.png`;
    await storage.put(rasterKey, Buffer.from(await raster.arrayBuffer()), "image/png");
  }

  const num = (k: string) => {
    const v = Number(form.get(k));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const floorId = form.get("floorId");
  const now = new Date().toISOString();
  const drawing: Drawing = {
    id,
    projectId,
    fileName: file.name.slice(0, 200),
    contentType,
    sizeBytes: file.size,
    category,
    floorId: typeof floorId === "string" && floorId ? floorId : undefined,
    storageKey,
    rasterKey,
    rasterWidth: num("rasterWidth"),
    rasterHeight: num("rasterHeight"),
    pageCount: num("pageCount"),
    page: 1,
    uploadStatus: "uploaded",
    processingStatus: category === "floor-plan" ? "not-started" : "not-applicable",
    createdAt: now,
    updatedAt: now,
  };
  await createDrawing(drawing);
  revalidatePath(`/projects/${project.slug}`);
  return Response.json(drawing, { status: 201 });
}
