// The asset pipeline: source models -> optimized, LOD'd GLBs for the game.
//
//   cd game/scripts/assets && npm install      (once)
//   node build.mjs [--raw <dir>] [--only <id,id>] [--toktx <path to toktx>]
//
// Reads game/assets-src/catalog.source.json (what each asset is, where it came
// from, its licence, and how to process it), the downloaded originals in the raw
// folder, and writes:
//   game/public/models/<category>/<id>/lod<n>.glb   meshopt-compressed, KTX2 textures
//   game/src/assets/catalog.json                    the runtime registry
//
// Per asset: pick a node (for packs), normalize (ground at y = 0, centred,
// facing +x, real-world size), clean (dedup, weld, prune), optionally atlas the
// materials into one texture (crowds, instanced props), then for every LOD:
// simplify with meshoptimizer, resize textures, encode KTX2 (ETC1S colour,
// UASTC normal maps) and compress geometry with EXT_meshopt_compression.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureBasisu, KHRMaterialsSpecular, KHRMaterialsIOR, KHRMaterialsClearcoat, KHRMaterialsSheen, KHRMaterialsTransmission, KHRMaterialsVolume, KHRTextureTransform } from "@gltf-transform/extensions";
import { cloneDocument, dedup, flatten, getBounds, join as joinPrims, joinPrimitives, meshopt, prune, resample, simplify, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const game = resolve(here, "../..");
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const RAW = resolve(arg("--raw", process.env.CAIVAN_ASSETS_RAW ?? join(game, "assets-raw")));
const ONLY = arg("--only", "")?.split(",").filter(Boolean);
const TOKTX = arg("--toktx", process.env.TOKTX ?? "toktx");
const SRC = JSON.parse(readFileSync(join(game, "assets-src/catalog.source.json"), "utf8"));
const OUT_DIR = join(game, "public/models");
const CATALOG = join(game, "src/assets/catalog.json");

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

/** Basis Universal needs multiple-of-4 sizes; powers of two also mip cleanly. */
const pot = (n) => 2 ** Math.round(Math.log2(Math.max(4, n)));

// ---------- KTX2 ----------
const tmp = mkdtempSync(join(tmpdir(), "caivan-assets-"));
function toKtx2(png, { normal = false } = {}) {
  const i = join(tmp, "in.png"), o = join(tmp, "out.ktx2");
  writeFileSync(i, png);
  const args = normal
    ? ["--t2", "--encode", "uastc", "--uastc_quality", "1", "--zcmp", "18", "--assign_oetf", "linear", "--genmipmap", o, i]
    : ["--t2", "--encode", "etc1s", "--clevel", "2", "--qlevel", "160", "--assign_oetf", "srgb", "--genmipmap", o, i];
  execFileSync(TOKTX, args, { stdio: "pipe" });
  return readFileSync(o);
}

async function encodeTextures(doc, maxSize) {
  const basisu = doc.createExtension(KHRTextureBasisu).setRequired(true);
  void basisu;
  const normals = new Set(doc.getRoot().listMaterials().map((m) => m.getNormalTexture()).filter(Boolean));
  for (const t of doc.getRoot().listTextures()) {
    const img = t.getImage();
    if (!img) continue;
    const meta = await sharp(Buffer.from(img)).metadata();
    const scale = Math.min(1, maxSize / Math.max(meta.width, meta.height));
    const w = pot(meta.width * scale), h = pot(meta.height * scale);
    const png = await sharp(Buffer.from(img)).resize(w, h, { fit: "fill" }).png().toBuffer();
    t.setImage(toKtx2(png, { normal: normals.has(t) })).setMimeType("image/ktx2");
    t.setURI(t.getURI().replace(/\.(png|jpe?g|webp)$/i, ".ktx2"));
  }
}

// ---------- normalize ----------
function keepNode(doc, name) {
  if (!name) return;
  const root = doc.getRoot();
  const names = [].concat(name);
  const keep = root.listNodes().filter((n) => names.includes(n.getName()));
  if (!keep.length) throw new Error(`node ${names.join(",")} not found (have: ${root.listNodes().map((n) => n.getName()).slice(0, 60).join(", ")})`);
  for (const scene of root.listScenes()) {
    for (const c of scene.listChildren()) scene.removeChild(c);
    for (const k of keep) {
      // Bake the parents' transforms into the kept node.
      const m = k.getWorldMatrix();
      k.getParentNode()?.removeChild(k);
      k.setMatrix(m);
      scene.addChild(k);
    }
  }
}

/** Puts the model's feet at y = 0, centres it in x/z, turns it to face +x and scales it to its real size. */
function normalize(doc, n = {}) {
  const scene = doc.getRoot().listScenes()[0];
  const wrap = doc.createNode("asset");
  for (const c of scene.listChildren()) {
    scene.removeChild(c);
    wrap.addChild(c);
  }
  scene.addChild(wrap);
  const turn = ((n.turn ?? 0) * Math.PI) / 180;
  wrap.setRotation([0, Math.sin(turn / 2), 0, Math.cos(turn / 2)]);
  if (n.scale) wrap.setScale([n.scale, n.scale, n.scale]);
  let b = getBounds(scene);
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  // Fit to a real-world length or height when given (metres).
  const k = n.length ? n.length / size[0] : n.height ? n.height / size[1] : 1;
  if (k !== 1) wrap.setScale(wrap.getScale().map((s) => s * k));
  b = getBounds(scene);
  const t = wrap.getTranslation();
  wrap.setTranslation([t[0] - (b.min[0] + b.max[0]) / 2, t[1] - b.min[1], t[2] - (b.min[2] + b.max[2]) / 2]);
  b = getBounds(scene);
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]].map((v) => +v.toFixed(3));
}

// ---------- atlas ----------
const near = (u) => u >= -0.002 && u <= 1.002;
async function textureMean(img) {
  const s = await sharp(Buffer.from(img)).stats();
  return s.channels.slice(0, 3).map((c) => c.mean / 255);
}
const toHex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");

/**
 * Packs every material into one texture atlas and one material, so a model
 * draws in a single call (and instances cleanly). Materials with tiling UVs
 * become their average colour. `drop` removes primitives by material name.
 */
async function atlas(doc, { size, drop = [], alpha = "MASK", regions = null }) {
  const root = doc.getRoot();
  const prims = [];
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    const m = p.getMaterial();
    if (m && drop.some((d) => new RegExp(d, "i").test(m.getName()))) {
      mesh.removePrimitive(p);
      continue;
    }
    // Soft-edged overlays (skin details, eyebrows) keep their own blended material.
    if (m?.getAlphaMode() === "BLEND") continue;
    prims.push(p);
  }
  // One cell per distinct (texture or colour).
  const cells = new Map();
  const keyOf = async (p) => {
    const m = p.getMaterial();
    const tex = m?.getBaseColorTexture();
    const f = m?.getBaseColorFactor() ?? [1, 1, 1, 1];
    const uv = p.getAttribute("TEXCOORD_0");
    let tiles = false;
    if (tex && uv) {
      const a = uv.getArray();
      for (let i = 0; i < a.length; i++) if (!near(a[i])) { tiles = true; break; }
    }
    if (tex && uv && !tiles) return { key: "t:" + root.listTextures().indexOf(tex) + ":" + f.join(","), tex, f, blend: m.getAlphaMode() === "MASK" };
    const c = tex ? (await textureMean(tex.getImage())).map((v, i) => v * f[i]) : f;
    return { key: "c:" + toHex(c), color: c, blend: false };
  };
  const per = [];
  for (const p of prims) {
    const k = await keyOf(p);
    k.name = p.getMaterial()?.getName() ?? "";
    per.push(k);
    if (!cells.has(k.key)) cells.set(k.key, { ...k, index: cells.size });
  }
  // Square power-of-two cells, sized by each texture's own resolution (so the
  // skin keeps its face detail), packed largest first on an aligned grid.
  const list = [...cells.values()];
  for (const c of list) c.want = c.tex ? (await sharp(Buffer.from(c.tex.getImage())).metadata()).width : 8;
  let scale = Math.sqrt((0.92 * size * size) / list.reduce((s, c) => s + (c.tex ? c.want * c.want : 64), 0));
  const unit = 8, grid = size / unit;
  let placed = false;
  for (let attempt = 0; attempt < 8 && !placed; attempt++, scale *= 0.85) {
    for (const c of list) c.cell = c.tex ? Math.max(c.blend ? 64 : 16, Math.min(size, 2 ** Math.floor(Math.log2(c.want * scale)))) : unit;
    list.sort((x, y) => y.cell - x.cell);
    const used = new Uint8Array(grid * grid);
    placed = true;
    for (const c of list) {
      const k = c.cell / unit;
      let spot = null;
      for (let y = 0; y + k <= grid && !spot; y += k) for (let x = 0; x + k <= grid && !spot; x += k) {
        let free = true;
        for (let j = 0; j < k && free; j++) for (let i = 0; i < k; i++) if (used[(y + j) * grid + x + i]) { free = false; break; }
        if (free) spot = [x, y];
      }
      if (!spot) { placed = false; break; }
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) used[(spot[1] + j) * grid + spot[0] + i] = 1;
      c.left = spot[0] * unit;
      c.top = spot[1] * unit;
    }
  }
  if (!placed) throw new Error("atlas: textures do not fit");
  const layers = [];
  for (const c of list) {
    const cell = c.cell;
    let img;
    if (c.tex) {
      // Multiply in the material's colour factor, pixel by pixel.
      const { data, info } = await sharp(Buffer.from(c.tex.getImage())).resize(cell, cell, { fit: "fill" }).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (c.f.some((v) => v !== 1)) for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 4; k++) data[i + k] = Math.round(data[i + k] * c.f[k]);
      img = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    } else {
      const [r, g, b] = c.color.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
      img = await sharp({ create: { width: cell, height: cell, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
    }
    layers.push({ input: img, left: c.left, top: c.top });
  }
  const png = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).composite(layers).png().toBuffer();
  const texture = doc.createTexture("atlas").setImage(png).setMimeType("image/png").setURI("atlas.png");
  const anyBlend = [...cells.values()].some((c) => c.blend);
  const anyDouble = prims.some((p) => p.getMaterial()?.getDoubleSided());
  const material = doc.createMaterial("atlas").setBaseColorTexture(texture).setRoughnessFactor(0.8).setMetallicFactor(0).setDoubleSided(anyDouble);
  if (anyBlend) material.setAlphaMode(alpha).setAlphaCutoff(0.45);
  prims.forEach((p, i) => {
    const c = cells.get(per[i].key);
    const u0 = c.left / size, v0 = c.top / size, w = c.cell / size, pad = 1.5 / c.cell;
    const count = p.getAttribute("POSITION").getCount();
    const uv = p.getAttribute("TEXCOORD_0");
    const out = new Float32Array(count * 2);
    const e = [0, 0];
    for (let j = 0; j < count; j++) {
      if (c.tex) uv.getElement(j, e);
      const u = c.tex ? Math.min(1, Math.max(0, e[0])) : 0.5;
      const v = c.tex ? Math.min(1, Math.max(0, e[1])) : 0.5;
      out[j * 2] = u0 + (pad + u * (1 - 2 * pad)) * w;
      out[j * 2 + 1] = v0 + (pad + v * (1 - 2 * pad)) * w;
    }
    const acc = doc.createAccessor().setType("VEC2").setArray(out).setBuffer(root.listBuffers()[0]);
    p.setAttribute("TEXCOORD_0", acc);
    for (const s of p.listSemantics()) if (/^(TEXCOORD_[1-9]|COLOR_\d|TANGENT)$/.test(s)) p.setAttribute(s, null);
    p.setMaterial(material);
  });
  // Tint regions (the player's wardrobe): a per-vertex region id, and each region's average colour.
  let regionInfo = null;
  if (regions) {
    regionInfo = {};
    const names = Object.keys(regions);
    for (const [i, p] of prims.entries()) {
      const mname = per[i].name ?? "";
      const r = names.findIndex((n) => new RegExp(regions[n], "i").test(mname));
      const id = r + 1;
      const count = p.getAttribute("POSITION").getCount();
      p.setAttribute("_REGION", doc.createAccessor().setType("SCALAR").setArray(new Float32Array(count).fill(id)).setBuffer(root.listBuffers()[0]));
      if (r >= 0 && !regionInfo[names[r]]) {
        const c = cells.get(per[i].key);
        const base = c.tex ? (await textureMean(c.tex.getImage())).map((v, k) => v * c.f[k]) : c.color.slice(0, 3);
        regionInfo[names[r]] = { id, base: base.map((v) => +v.toFixed(3)) };
      }
    }
    for (const [i, n] of names.entries()) regionInfo[n] ??= { id: i + 1, base: [1, 1, 1] };
  }
  for (const m of root.listMaterials()) if (m !== material && !m.listParents().some((x) => x.propertyType === "Primitive")) m.dispose();
  return { cells: cells.size, regions: regionInfo };
}

/** Merges each mesh's primitives that share a material (keeps nodes, skins and morph-free meshes intact). */
function mergeWithinMeshes(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    const groups = new Map();
    for (const p of mesh.listPrimitives()) {
      const key = (p.getMaterial()?.getName() ?? "") + "|" + p.listSemantics().sort().join(",") + "|" + p.listTargets().length;
      if (p.listTargets().length) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const merged = joinPrimitives(list);
      for (const p of list) { mesh.removePrimitive(p); p.dispose(); }
      mesh.addPrimitive(merged);
    }
  }
}

// ---------- stats ----------
function triangles(doc) {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3;
  // Count instanced uses.
  return Math.round(n);
}

function stripToAnimations(doc) {
  const root = doc.getRoot();
  for (const n of root.listNodes()) n.setMesh(null).setSkin(null);
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const a of root.listAnimations()) for (const c of a.listChannels()) if (c.getTargetPath() === "weights") { c.getSampler()?.dispose(); c.dispose(); }
}

/** Translates material extensions three.js doesn't need away (keeps files small and portable). */
function dropExtras(doc) {
  for (const ext of [KHRMaterialsSpecular, KHRMaterialsIOR, KHRMaterialsClearcoat, KHRMaterialsSheen, KHRMaterialsTransmission, KHRMaterialsVolume, KHRTextureTransform]) {
    doc.getRoot().listExtensionsUsed().filter((e) => e.extensionName === ext.EXTENSION_NAME).forEach((e) => e.dispose());
  }
}

// ---------- build ----------
const previous = existsSync(CATALOG) ? JSON.parse(readFileSync(CATALOG, "utf8")) : { assets: {} };
const catalog = { generated: new Date().toISOString().slice(0, 10), assets: { ...previous.assets } };
let built = 0;
for (const a of SRC.assets) {
  if (ONLY?.length && !ONLY.includes(a.id)) continue;
  const file = join(RAW, a.source.file);
  if (!existsSync(file)) {
    console.log(`skip ${a.id}: ${a.source.file} not downloaded yet`);
    continue;
  }
  const t0 = Date.now();
  const base = await io.read(file);
  dropExtras(base);
  keepNode(base, a.process?.node);
  if (a.kind === "clips") {
    stripToAnimations(base);
    await base.transform(resample(), prune(), dedup());
  } else {
    const keepAnims = !!a.process?.keepAnimations;
    if (!keepAnims) for (const an of base.getRoot().listAnimations()) an.dispose();
    await base.transform(dedup(), prune({ keepAttributes: false }), weld());
  }
  // Layered garments (a vest over a shirt) can poke through each other: push the outer layer out a few millimetres.
  for (const [pattern, metres] of Object.entries(a.process?.inflate ?? {})) {
    for (const mesh of base.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
      if (!new RegExp(pattern, "i").test(p.getMaterial()?.getName() ?? "")) continue;
      const pos = p.getAttribute("POSITION"), nrm = p.getAttribute("NORMAL");
      if (!pos || !nrm) continue;
      const out = pos.clone(), a3 = [0, 0, 0], n3 = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, a3);
        nrm.getElement(i, n3);
        out.setElement(i, [a3[0] + n3[0] * metres, a3[1] + n3[1] * metres, a3[2] + n3[2] * metres]);
      }
      p.setAttribute("POSITION", out);
    }
  }
  const dims = a.kind === "clips" ? null : normalize(base, a.process?.normalize);
  if (a.process?.flatten && a.kind !== "clips") await base.transform(flatten(), joinPrims({ keepNamed: false }), prune());
  const dir = join(OUT_DIR, a.category, a.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const lods = [];
  let regions = null;
  for (const [i, lod] of (a.lods ?? [{}]).entries()) {
    const doc = cloneDocument(base);
    if (lod.atlas) {
      const r = await atlas(doc, { size: lod.atlas, drop: lod.drop ?? [], alpha: lod.alpha ?? "MASK", regions: a.process?.regions ?? null });
      regions ??= r.regions;
      mergeWithinMeshes(doc);
      await doc.transform(prune());
    } else if (lod.drop?.length) {
      for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) if (lod.drop.some((d) => new RegExp(d, "i").test(p.getMaterial()?.getName() ?? ""))) mesh.removePrimitive(p);
      await doc.transform(prune());
    }
    if (lod.ratio && lod.ratio < 1) await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: lod.ratio, error: lod.error ?? 0.02, lockBorder: !!lod.lockBorder }), prune());
    if (a.kind !== "clips") await encodeTextures(doc, lod.texture ?? 1024);
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
    const out = join(dir, `lod${i}.glb`);
    await io.write(out, doc);
    lods.push({ file: `models/${a.category}/${a.id}/lod${i}.glb`, distance: lod.distance ?? null, triangles: triangles(doc), bytes: statSync(out).size, texture: a.kind === "clips" ? 0 : lod.texture ?? 1024 });
  }
  const animations = a.kind === "clips" || a.process?.keepAnimations ? base.getRoot().listAnimations().map((an) => ({ name: an.getName(), seconds: +Math.max(...an.listSamplers().map((s) => s.getInput().getMax([])[0])).toFixed(3) })) : a.animations ?? null;
  const hips = base.getRoot().listNodes().find((n) => n.getName() === "Hips");
  catalog.assets[a.id] = {
    id: a.id,
    category: a.category,
    kind: a.kind,
    name: a.name,
    source: a.source.url,
    creator: a.source.creator,
    creatorUrl: a.source.creatorUrl ?? null,
    license: a.source.license,
    dimensions: dims,
    collision: a.collision ?? { shape: "box", fit: "bounds" },
    lods,
    variants: a.variants ?? [],
    animations,
    rig: a.rig ?? (hips ? { hipsY: +hips.getWorldTranslation()[1].toFixed(4) } : null),
    tags: a.tags ?? [],
    ...(regions ? { regions } : {}),
  };
  built++;
  console.log(`${a.id}: ${lods.map((l) => `lod${lods.indexOf(l)} ${l.triangles} tris ${(l.bytes / 1024).toFixed(0)} KB`).join(", ")} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
mkdirSync(dirname(CATALOG), { recursive: true });
const sorted = Object.fromEntries(Object.entries(catalog.assets).sort(([x], [y]) => x.localeCompare(y)));
writeFileSync(CATALOG, JSON.stringify({ ...catalog, assets: sorted }, null, 1) + "\n");
rmSync(tmp, { recursive: true, force: true });
console.log(`built ${built}; catalog has ${Object.keys(sorted).length} assets`);
