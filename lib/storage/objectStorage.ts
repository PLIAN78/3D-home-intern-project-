import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Minimal object storage abstraction. The MVP writes to local disk; swap in an
 * S3 / Cloudflare R2 / Vercel Blob implementation by satisfying this interface
 * and returning it from getStorage().
 */
export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** URL the browser can fetch the object from. */
  url(key: string): string;
}

export const DATA_DIR = process.env.HOME_STUDIO_DATA_DIR ?? path.join(process.cwd(), ".data");

function safeKey(key: string): string {
  const normalised = key.replace(/\\/g, "/");
  if (!/^[\w\-./]+$/.test(normalised) || normalised.split("/").some((p) => p === ".." || p === "")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return normalised;
}

class LocalDiskStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private file(key: string) {
    return path.join(this.root, ...safeKey(key).split("/"));
  }

  async put(key: string, body: Buffer, contentType: string) {
    const file = this.file(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    await fs.writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
  }

  async get(key: string): Promise<StoredObject | null> {
    const file = this.file(key);
    try {
      const [body, meta] = await Promise.all([fs.readFile(file), fs.readFile(`${file}.meta.json`, "utf8").catch(() => "{}")]);
      const contentType = (JSON.parse(meta) as { contentType?: string }).contentType ?? "application/octet-stream";
      return { body, contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    const file = this.file(key);
    await Promise.all([fs.rm(file, { force: true }), fs.rm(`${file}.meta.json`, { force: true })]);
  }

  url(key: string) {
    return `/api/files/${safeKey(key)}`;
  }
}

let storage: ObjectStorage | null = null;

export function getStorage(): ObjectStorage {
  storage ??= new LocalDiskStorage(path.join(DATA_DIR, "uploads"));
  return storage;
}
