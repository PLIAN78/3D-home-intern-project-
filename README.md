# Home Studio

Internal tool that turns architectural drawings into an interactive, configurable 3D home, placed on its lot inside the community.

**Status**

- **Phase 1:** procedural 3D viewer, floor isolation, exploded "cake" view, cutaways, material configurator, customer view with share links, demo neighbourhood.
- **Phase 2:** project creation, drawing upload (PDF/PNG/JPG with categories, previews and statuses), pluggable drawing interpreters with confidence and warnings, and a 2D tracing editor whose output regenerates the 3D model.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest: interpreters, editor ops, model finalisation
npm run typecheck
npm run lint
npm run build
```

| Route | Purpose |
| --- | --- |
| `/` | Project list |
| `/projects/new` | Create a project (community, lot, model, floors, blank or Plan 36 start) |
| `/projects/[slug]` | Studio: drawings, floors, model data, 3D viewer, configurator |
| `/projects/[slug]/trace?floor=…&drawing=…` | 2D floor-plan tracing / review editor |
| `/projects/[slug]/view?c=…` | Customer view; `c` carries the encoded selections |

### Demo script (Phase 2)

1. **New project:** choose "Blank — trace from drawings".
2. **Drawings tab:** click *Add sample Plan 36 drawings*. Three PDFs are rasterised in the browser, uploaded with progress, and auto-categorised and assigned to floors.
3. **Main floor:** click *Trace*, then *Run* the line-detection interpreter. Check the confidence and warnings, then click *Import (replace)*. Imported elements show dashed in amber.
4. **Calibrate scale:** with the **Scale** tool (`C`), click the two ends of the rear wall and enter `42'`. Fix or delete anything wrong, then *confirm all*.
5. **Save & view 3D:** walls, openings and auto-generated roofs appear on the lot.

Sample drawings live in `public/samples/`. They are rendered from the Plan 36 model by `lib/drawings/samplePlanSvg.ts` (served as SVG at `/api/samples/[floorId]`).

## Architecture

```
lib/models/        Domain types: house.ts, drawing.ts, materials.ts, community.ts, project.ts
                   finalize.ts (elevations, wall heights, footprints, auto roofs), validate.ts, templates.ts
lib/sample/        Seed data: plan36.ts (3-level home), bradleyRidge.ts (10-lot street)
lib/data/          repository.ts (async data-access boundary) + documentStore.ts (JSON file store)
lib/storage/       ObjectStorage interface + local-disk implementation (swap for S3 / R2 / Vercel Blob)
lib/drawings/      DrawingInterpreter contract, interpreters/ (heuristic line detection, mock),
                   rasterize.ts (browser pdf.js / image → PNG), api.ts (client), guess.ts, samplePlanSvg.ts
lib/editor/        editorOps.ts — pure tracing operations (snap, join, calibrate, import, exterior detection)
lib/geometry/      Pure 3D geometry generation (walls, openings, floors, roofs, fixtures, placeholders)
lib/materials/     Option → Three.js material factory, canvas-painted textures, swatches
stores/            Zustand: viewerStore, projectStore (selections), editorStore (tracing + undo/redo)
components/drawings/ DrawingUploader, DrawingList, FloorPlanEditor, editor/ (canvas, panels, calibration)
components/viewer/ R3F scene: HouseViewer, House3D, FloorMesh, SurfaceMesh, CommunityScene, CameraController…
app/api/           Route handlers: uploads, drawing updates, interpretation, file serving, model saves
```

### Drawing pipeline

```
upload (PDF/PNG/JPG)
  → browser rasterises page → PNG ≤ 2400 px          lib/drawings/rasterize.ts
  → POST original + raster → ObjectStorage + Drawing  app/api/projects/[id]/drawings
  → DrawingInterpreter.interpretFloorPlan()           app/api/drawings/[id]/interpret
      returns FloorPlanInterpretation in PIXELS + confidence + warnings
  → tracing editor: calibrate scale (px → m), import as unverified, review / correct / trace
  → finalizeHouseModel() → PUT HouseModel              app/api/projects/[id]/house-model
  → 3D viewer regenerates from the HouseModel
```

- **Interpreters are pluggable.** Register a new one in `lib/drawings/interpreters/index.ts`, for example a vision model behind an API key. Nothing else changes.
- **The heuristic interpreter is deliberately modest.** It finds solid, axis-aligned walls (filtering by cross-section thickness) and classifies gaps as doors or windows. It also estimates scale from exterior-wall thickness. On the bundled samples it recovers about all walls and openings. On real drawings, expect a starting point that still needs review.
- **Uncertainty is never hidden.** Imported elements stay flagged `unverified` until a person confirms them. Saving with unreviewed elements or an uncalibrated scale lowers `provenance.confidence` and adds notes, which the studio displays.

### Key design decisions

- **The `HouseModel` JSON is the contract.** Seed data, interpreters, and the tracing editor all produce it, and the 3D viewer only reads it.
- **Every floor is its own group** (`House → Basement / Main Floor / Second Floor / Roof`). Inside each floor, layers (shell, interior, slab, ceiling, fixtures) let cutaways toggle without rebuilding geometry.
- **Geometry is merged by surface.** Each floor has one mesh per surface key, which keeps draw calls low, and clicking a mesh maps straight to its configurable slot.
- **Persistence is behind `lib/data/repository.ts`.** The JSON document store (`.data/db.json`, git-ignored) is single-process and meant for the MVP. Uploaded files go to `.data/uploads/` through `ObjectStorage`.

### Plan coordinates

Units are metres. Plan `(x, y)` maps to world `(x, z)`, with `+y` running from the rear of the house toward the street. Drawing pixels map to plan with `plan = (px − originPx) × metresPerPixel`. Door and window `position` is the distance from the wall's start to the opening's centre.

## Next phases

1. Drizzle + PostgreSQL behind the repository (Project, Drawing, HouseModel, Floor, CustomerConfiguration, Material, Community, Lot), plus S3/R2 storage
2. AI-backed `DrawingInterpreter` (rooms, labels, dimension strings → scale)
3. Editor: diagonal walls, multi-select, stairs/fixtures, per-floor roof editing
4. Customer polish: QR code, measurement, walkthrough, day/night
