# Home Studio

Internal tool that turns architectural drawings into an interactive, configurable 3D home, placed on its lot inside the community.

**Phase 1 status:** a procedurally generated sample home ("Plan 36", Bradley Ridge Lot 42) with floor isolation, an exploded "cake" view, cutaways, live material configuration, a customer view with share links, and a demo neighbourhood. Drawing upload, tracing, and database persistence come in later phases.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # type-check
npm run lint
npm run build
```

| Route | Purpose |
| --- | --- |
| `/` | Project list |
| `/projects/bradley-ridge-42` | Internal studio (project, floors, model data, configurator) |
| `/projects/bradley-ridge-42/view?c=…` | Customer view; `c` carries the encoded selections |

## Architecture

```
lib/models/        Domain types: house.ts (HouseModel/Floor/Wall/Door/Window/Room), materials.ts, community.ts, project.ts
lib/sample/        Seed data: plan36.ts (3-level home), bradleyRidge.ts (10-lot street)
lib/data/          repository.ts: data-access boundary (in-memory now, Drizzle/Postgres later)
lib/geometry/      Pure geometry generation, no React:
                     buildHouse.ts      model → per-floor layer geometry + roofs
                     generateWalls.ts   wall solids with openings cut, brick/stone/siding veneer
                     generateOpenings.ts frames, glazing, casings, door leaves
                     generateFloor.ts   slabs (with stair holes), finished floors, ceilings, room labels
                     generateRoof.ts    hip / gable / shed roofs with fascia + soffit
                     generateFixtures.ts kitchen, stairs, porch, appliances
                     placeholderHouse.ts massing models for neighbouring homes
lib/materials/     Option → Three.js material factory, canvas-painted textures, swatches
lib/viewer/        Lot placement and camera presets
stores/            Zustand: viewerStore (view state), projectStore (selections, persisted)
components/viewer/ R3F scene: HouseViewer, House3D, FloorMesh, SurfaceMesh, CommunityScene,
                   CameraController, ExplodedViewController, SceneEnvironment, Trees
components/configurator/ MaterialPanel, FloorSelector, ViewControls, CutawayControls
components/studio/ Studio shell, header, sidebar, viewer stage
components/customer/ Customer shell
```

### Key design decisions

- **The `HouseModel` JSON is the contract.** Seed data, a future AI drawing interpreter, and the manual tracing editor all produce the same structure, and the 3D viewer only reads that structure. `provenance` (source + confidence + notes) travels with the model, so the UI can flag demo or uncertain geometry.
- **Every floor is its own group** (`House → Basement / Main Floor / Second Floor / Roof`). Inside each floor, separate layers (shell, interior, slab, ceiling, fixtures) let the cutaway toggles work without rebuilding geometry.
- **Geometry is merged by surface.** Each floor produces one mesh per surface key (e.g. `exteriorBrick`, `glass`, `trim`), so draw calls stay low. Clicking a mesh maps straight to its configurable slot.
- **Materials are shared per option.** Changing a selection swaps a material reference and rebuilds nothing. Textures are painted procedurally on a canvas, so no binary assets are needed. `MaterialOption.textureUrl` / `normalMapUrl` are supported for real product scans.
- **The community model is renderer-agnostic** (`Community → Lot[]`). The selected lot renders the customer house instead of its placeholder, and a "Base model / Your home" toggle swaps them. `siteAssets` is reserved for future GLB, photogrammetry, or GIS imports.

### Plan coordinates

Units are metres. Plan `(x, y)` maps to world `(x, z)`, with `+y` running from the rear of the house toward the street. Door and window `position` is the distance from the wall's start point to the centre of the opening.

## Next phases

1. Project creation + drawing upload (PDF/PNG/JPG, categories, previews, status) behind a storage abstraction
2. `DrawingInterpreter` interface + `MockDrawingInterpreter` returning `FloorPlanInterpretation` with confidence and warnings
3. 2D tracing editor over the drawing (scale calibration, walls, openings, rooms), outputting `HouseModel`
4. Drizzle + PostgreSQL persistence (Project, Drawing, HouseModel, Floor, CustomerConfiguration, Material, Community, Lot)
5. Customer polish: QR code, measurement, walkthrough, day/night
