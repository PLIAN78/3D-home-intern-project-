# Asset pipeline

This folder turns downloaded or generated 3D models into the optimized files the game ships in `game/public/models`. It also writes the registry the game reads, `game/src/assets/catalog.json`.

The pipeline has its own `package.json` so its tools don't become game dependencies. Run `npm install` here once.

## Tools

- **glTF Transform** (MIT): cleanup, LOD simplification with meshoptimizer, Meshopt geometry compression.
- **sharp** (Apache-2.0): texture resizing and atlases.
- **toktx** from [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases) (Apache-2.0): KTX2/Basis textures. Install it and put it on your `PATH`, or pass `--toktx <path>`.
- **Ara 3D Gen** (`ara3d`, MIT): generates the people from MakeHuman's CC0 data.
- **Blender**: only needed for sources in other formats (FBX, OBJ, .blend). Export them to glTF first.

## Files

| File | What it is |
|---|---|
| `game/assets-src/catalog.source.json` | Every asset: id, category, source URL, creator, licence, raw file name, and how to process it (node to keep, normalization, LODs, atlas, tint regions). Edit this file to add an asset. |
| `game/assets-src/characters/outfits.json` | The game's outfits. |
| `game/assets-src/characters/*.ara.json` | One Ara character file per outfit, written by `characters.mjs`. Keep these in git; they rebuild the people exactly. |
| `characters.mjs` | Builds the people and the shared animation library into the raw folder. |
| `build.mjs` | Processes raw files into `public/models/<category>/<id>/lod<n>.glb` and writes `catalog.json`. |
| `inventory.mjs` | Writes `game/ASSETS.md` (inventory and licences) and the model credits in `game/CREDITS.md`. |

## Run it

```bash
cd game/scripts/assets && npm install            # once
node characters.mjs ../../assets-raw/characters  # people (about 1 minute)
node build.mjs --raw ../../assets-raw            # everything, or --only id1,id2
node inventory.mjs
```

Raw downloads go in `game/assets-raw/`, which git ignores. Each entry's `source.file` is the path inside that folder. Sketchfab models should be downloaded as "Autoconverted format (glb)".

## What build.mjs does to each asset

1. **Keep** the named node, for assets that come in a pack, and bake its parents' transforms into it.
2. **Normalize**: feet at y = 0, centred, facing +x like everything in the game, and scaled to real size (`normalize.length` or `normalize.height` in metres).
3. **Clean**: `dedup`, `prune` and `weld`. Unused material extensions are dropped. `inflate` pushes outer clothing layers out a few millimetres so they don't poke through.
4. **LODs**: one GLB per `lods[]` entry. Each entry has:
   - `ratio`: meshoptimizer simplification.
   - `atlas`: packs all materials into one texture and one draw call. Cells are sized by each texture's resolution.
   - `drop`: removes small parts, such as eyelashes.
   - `texture`: the maximum texture size.
   - `distance`: the camera distance in metres where the LOD takes over.
5. **Textures**: KTX2. ETC1S for colour, UASTC with zstd for normal maps, with mipmaps.
6. **Geometry**: `EXT_meshopt_compression`.
7. **Catalog**: records dimensions, triangles, bytes, animations, the rig's hip height (used to share clips between bodies) and tint regions.

The game decodes KTX2 with three.js's Basis transcoder (copied to `game/public/basis`) and Meshopt with three's bundled decoder. Nothing is fetched from a third party at play time.
