import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as Repository from "@/lib/data/repository";
import type { Community } from "@/lib/models/community";

// A throwaway database seeded from scratch (no legacy JSON store).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "home-studio-db-"));
let repo: typeof Repository;

beforeAll(async () => {
  process.env.HOME_STUDIO_DATA_DIR = dir;
  process.env.DATABASE_PATH = path.join(dir, "test.db");
  repo = await import("@/lib/data/repository");
});

afterAll(async () => {
  const { getDb } = await import("@/lib/db/client");
  getDb().$client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function community(): Community {
  const lot = (id: string, number: string, collection: string, status: "sold" | "available") => ({
    id,
    number,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    width: 10.7,
    depth: 30,
    frontSetback: 6,
    status,
    collection,
    latLng: { lat: 45.26, lng: -75.75 },
    placeholder: { style: "modern" as const, bodyColor: "#ccc", roofColor: "#333", garageSide: "left" as const, storeys: 2 as const },
  });
  return {
    id: "the-conservancy",
    name: "The Conservancy",
    lots: [lot("lot-1", "1", "35′ Collection", "sold"), lot("lot-2", "2", "50′ Collection", "available"), lot("lot-3", "3", "35′ Collection", "sold")],
    roads: [],
    trees: [],
  };
}

describe("database", () => {
  it("seeds the demo project and the photo catalogue", async () => {
    expect((await repo.getProjectById("bradley-ridge-42"))?.modelName).toBe("Plan 36");
    const catalog = await repo.listCatalog();
    expect(catalog.length).toBe(13);
    const conservancy = catalog.find((c) => c.id === "the-conservancy")!;
    expect(conservancy.heroUrl).toMatch(/^https:\/\/caivan\.com\/wp-content\/uploads\//);
    expect(conservancy.designCount).toBeGreaterThan(10);
  });

  it("stores communities with their lots in order, and lot status changes", async () => {
    await repo.saveCommunity(community(), { seedDemoProgress: true });
    const c = await repo.getCommunity("the-conservancy");
    expect(c?.lots.map((l) => l.number)).toEqual(["1", "2", "3"]);
    await repo.setLotStatus("the-conservancy", "lot-2", "sold");
    expect((await repo.getCommunity("the-conservancy"))?.lots[1].status).toBe("sold");
  });

  it("drops sample progress for removed lots but keeps real progress", async () => {
    await repo.saveLotProgress({ communityId: "the-conservancy", lotId: "lot-3", stage: "framing", completed: {}, updatedAt: "2026-10-01T00:00:00Z" });
    const c = community();
    c.lots = c.lots.filter((l) => l.id !== "lot-1" && l.id !== "lot-3");
    await repo.saveCommunity(c);
    const { getDb, schema } = await import("@/lib/db/client");
    const rows = getDb().select().from(schema.lotProgress).all();
    expect(rows.map((r) => r.lotId).sort()).toEqual(["lot-3"]);
    expect(rows[0].stage).toBe("framing");
  });

  it("creates projects with unique slugs and links them to the real homes on the lot", async () => {
    await repo.saveCommunity(community());
    const a = await repo.createProject({ name: "Lot 1 Hemlock", communityId: "the-conservancy", lotId: "lot-1", modelName: "The Hemlock", floorCount: 2, hasBasement: true, template: "blank" });
    const b = await repo.createProject({ name: "Lot 1 Hemlock", communityId: "the-conservancy", lotId: "lot-1", modelName: "Plan 36", floorCount: 2, hasBasement: false, template: "plan-36" });
    expect([a.slug, b.slug]).toEqual(["lot-1-hemlock", "lot-1-hemlock-2"]);

    const homes = await repo.getLotHomes("the-conservancy", "35′ Collection");
    expect(homes?.collection?.name).toBe("35′ collection");
    const hemlock = homes!.collection!.designs.find((d) => d.name === "The Hemlock")!;
    expect(hemlock.modelHome).toBe(true);
    expect(hemlock.photos[0].kind).toBe("elevation");

    const covers = await repo.listProjectCovers([a]);
    expect(covers[a.id]).toBe(hemlock.photos[0].url);
  });

  it("updates drawings and house models transactionally", async () => {
    const p = await repo.getProjectById("lot-1-hemlock");
    const now = new Date().toISOString();
    await repo.createDrawing({ id: "d1", projectId: p!.id, createdAt: now, updatedAt: now } as never);
    const d = await repo.updateDrawing("d1", { name: "Main floor" } as never);
    expect(d).toMatchObject({ id: "d1", name: "Main floor" });
    await expect(repo.updateDrawing("missing", {})).rejects.toThrow("Unknown drawing");
    expect((await repo.deleteDrawing("d1"))?.id).toBe("d1");
    expect(await repo.getDrawing("d1")).toBeUndefined();
  });
});
