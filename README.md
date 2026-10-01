# Home Studio

Internal tool that turns architectural drawings into an interactive, configurable 3D home, placed on its lot inside the community.

**Status**

- **Phase 1:** procedural 3D viewer, floor isolation, exploded "cake" view, cutaways, material configurator, customer view with share links, demo neighbourhood.
- **Phase 2:** project creation, drawing upload (PDF/PNG/JPG with categories, previews and statuses), pluggable drawing interpreters with confidence and warnings, and a 2D tracing editor whose output regenerates the 3D model.

- **Phase 4, real communities and build progress:** the Caivan communities from caivan.com are listed under **Communities**. *Place on real map* reads a community's published site plan and finds every lot, its collection and its sales status. It then locates the community from its street names and lines the plan up with real streets from OpenStreetMap (≈2 m error on The Conservancy). The community opens as a 3D map of the real neighbourhood, with every home drawn at its construction stage. Each lot has a progress bar and a stage timeline; the construction team updates them, and customers see them in their home view.
- **Phase 3, one-step drawing sets:** upload a builder's décor or plan-set PDF and the app reads every sheet. It finds each floor, elevation and layout option, works out the scale from the room sizes, traces and stacks the floors, and asks one question: generate now, or review first. The home opens on the standard plan with default finishes, and the configurator's **Plan** tab switches elevations and layouts.

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
| `/communities` | Caivan community catalogue: import a site plan (published or uploaded) |
| `/communities/[id]?lot=…` | Real-world 3D community map, lot list and filters, lot detail, construction progress |

### Demo script (Phase 4, communities and build progress)

1. **Communities → The Conservancy → Place on real map.** The import downloads the site plan and reads its lots. It then geocodes the street names, fetches OpenStreetMap data, fits the plan to the streets and builds the community. With map data already cached this takes seconds; otherwise 1–5 minutes, because public Overpass servers are often busy.
2. **Open community.** Click any lot, or search for `337`. The panel shows the collection, approximate frontage and depth, a Google Maps link, the progress bar, the stage timeline and *Update progress*. **Build progress** recolours the map by stage: excavation, foundation, framing, closed-in or complete.
3. **Visualize a home on this lot** creates a project on that real lot. In the studio and customer view, **Community** shows the configured home in the real neighbourhood, and a **Build progress** card shows the lot's stage, timeline and expected closing.

Progress generated at import is marked **Sample data** until someone saves real progress for the lot. Lot dimensions come from the marketing site plan and are approximate.

#### How a community is placed (`lib/community/`)

- `sitePlan/readVectors.ts`: reads the site-plan PDF's vector paths (with fill colours) and text from pdf.js operator lists.
- `sitePlan/parseSitePlan.ts`: lots are the small closed polygons that contain a lot number. It also reads the collection from the fill tint (matched to the legend swatches), the status from the red/green dots, the street labels with their angle, and a scale hint from collection frontages.
- `geocode.ts`: finds the community through Nominatim from its street names (median, outliers dropped).
- `osm.ts`: fetches roads (including streets still under construction), buildings, water, parks and woods from Overpass. Results are cached in `.data/cache/osm`, and a cached download that covers the area is reused.
- `sitePlan/georeference.ts`: fits a robust similarity transform (ICP with rotation starts, trimmed matches and a label-direction penalty) by snapping each street label to the OSM street of the same name. It needs at least three different streets, and the import refuses a fit worse than 25 m RMS.
- `sitePlan/shapeMatch.ts`: the fallback for plans whose street names are part of the background illustration rather than PDF text (most published plans label only the arterial roads). It fits the lots to the road network: each lot's narrow end should sit about a boulevard away from a road, no road may run through a lot, and unsold lots can't sit on existing mapped buildings. It uses an exhaustive coarse search around the geocoded sales-centre address, then local refinement. These placements are marked **approximate** in the UI.
- **Adjust placement** (community page): shift, rotate or scale the whole plan over the real map with live preview (arrow keys, `[` and `]`), then save. Every lot's position and lat/lng is updated (`lib/community/adjustPlacement.ts`).
- `buildCommunity.ts`: turns each lot into an oriented box that faces its street (preferring the short side), numbers townhome units (`TH-301-3`), and records lat/lng per lot.
- 3D (`lib/geometry/siteGeometry.ts`, `components/community/`): the surroundings and every home at its build stage are merged into a few draw calls. Map data is © OpenStreetMap contributors (ODbL) and attributed in every view.

**Known limits:** a placement is only as good as OpenStreetMap's coverage, and brand-new streets are often missing. Of the published plans, The Conservancy places by street names (≈1–2 m). Fox Run uses the lot-shape fit and lands on the right streets, but should be checked. Magnolia, Arbor West and Summer Valley label only two or three arterials and may need *Adjust placement*. Some plans number townhome units without block labels, so those units are listed by number and collection.

**Next step for photoreal context:** Google Photorealistic 3D Tiles can replace the OSM massing through `3d-tiles-renderer`. It needs a Google Maps Platform API key with billing; the georeferenced `origin` and per-lot lat/lng are already in place for it.

### Demo script (Phase 3, drawing sets)

1. **New project:** choose a blank start, then drop the décor / plan-set PDF on the **Drawings** tab.
2. **Wait for the dialog:** "Reading your drawing set…" shows progress. A 48-sheet set takes about 1–3 minutes.
3. **Read the summary:** model, floors, elevations and layout options. Then answer *Do you want to review or edit the floor plans first?*
   - **No, generate my 3D home:** opens the standard plan, default elevation and default finishes.
   - **Yes, review first:** opens the editor with every floor over its own sheet, already scaled and aligned. Saving writes the floors back into the set.
4. **Switch options:** in **Home Options → Plan**, change the elevation (A1, A/A2/B1, B, F…) and per-floor layouts (Chef Center, Spa Ensuite, 4 Bedroom…). The 3D home rebuilds instantly, and customer share links carry the choice.

#### How a drawing set is read (`lib/drawings/planSet/`)

| Step | Module | What it does |
| --- | --- | --- |
| Read | `pdfServer.ts` | Server-side pdf.js + `@napi-rs/canvas`: renders each page and extracts text with its position |
| Classify | `classify.ts` | Reads the title block (`STANDARD` / `SOGF-…` option codes, titles, sheet numbers) and the "ELEVATION …" captions to label each page with its floor, elevation and option. Pages without a caption inherit their section's elevation |
| Scale | `extractFloor.ts` | Each room label with a dimension (e.g. `18'6"x13'8"`) votes for a scale by measuring the clear span between walls. One consensus scale is used for the whole set |
| Trace | `extractFloor.ts` + `interpreters/lineDetection.ts` | Morphological opening removes tile grids and text. Wall bands are detected, and the main drawing is the wall cluster that contains the room labels (sheet borders and option insets are rejected). Rooms come from labels, exterior walls are classified, and garage and front doors are identified from the labels |
| Stack | `align.ts` | Each floor is registered to the main floor by maximising exterior-wall overlap. Options are registered to their level's standard plan |
| Assemble | `buildPlanSet.ts`, `lib/models/planSet.ts` | Groups variants by elevation, floor and option, flags partial and grade-condition sheets as reference-only, and `composeHouseModel()` builds a `HouseModel` for any selection |

Analysis runs as a background job (`after()` in `app/api/drawings/[id]/analyze`), and the UI polls its progress. Auto-traced floors stay flagged *unreviewed* until someone saves them from the editor, and the studio shows the confidence level.

Dev tools: `npx tsx scripts/build-set.mts <set.pdf> [outDir]` prints what the pipeline extracts, and `scripts/analyze-set.mts` checks individual sheets with an overlay.

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
lib/sample/        Seed data: plan36.ts (3-level home), bradleyRidge.ts (10-lot street), caivanCommunities.ts (catalogue)
lib/community/     Site-plan reading, geocoding, OpenStreetMap context, georeferencing, import job
lib/models/        … construction.ts (stages, % complete, build state), communityImport.ts
lib/data/          repository.ts (async data-access boundary) + documentStore.ts (JSON file store)
lib/storage/       ObjectStorage interface + local-disk implementation (swap for S3 / R2 / Vercel Blob)
lib/drawings/      DrawingInterpreter contract, interpreters/ (heuristic line detection, mock),
                   rasterize.ts (browser pdf.js / image → PNG), api.ts (client), guess.ts, samplePlanSvg.ts
lib/editor/        editorOps.ts — pure tracing operations (snap, join, calibrate, import, exterior detection)
lib/geometry/      Pure 3D geometry generation (walls, openings, floors, roofs, fixtures, placeholders)
lib/materials/     Option → Three.js material factory, canvas-painted textures, swatches
stores/            Zustand: viewerStore, projectStore (selections), editorStore (tracing + undo/redo)
components/drawings/ DrawingUploader, DrawingList, FloorPlanEditor, editor/ (canvas, panels, calibration)
components/viewer/ R3F scene: HouseViewer, House3D, FloorMesh, SurfaceMesh, CommunityScene, GeoCommunityScene, CameraController…
components/community/ Catalogue, dashboard, CommunityViewer, RealWorldScene (OSM context + lots), BuildProgress
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
